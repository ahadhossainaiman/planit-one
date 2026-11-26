import { Permissions, webMethod } from 'wix-web-module';
import { getSecret } from 'wix-secrets-backend';
import { fetch } from 'wix-fetch';

const API_URL = "https://api.1planit.com/api/v1";
const STRIPE_URL = "https://api.stripe.com/v1";

function appendForm(params, key, value) {
    if (value === undefined || value === null) {
        return;
    }

    if (typeof value === "object") {
        Object.keys(value).forEach(childKey => {
            appendForm(params, `${key}[${childKey}]`, value[childKey]);
        });
    } else {
        params.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    }
}

async function stripeRequest(method, path, secretKey, form) {
    const options = {
        method,
        headers: { "Authorization": `Bearer ${secretKey}` }
    };

    if (form) {
        const params = [];
        Object.keys(form).forEach(key => appendForm(params, key, form[key]));
        options.headers["Content-Type"] = "application/x-www-form-urlencoded";
        options.body = params.join("&");
    }

    const response = await fetch(`${STRIPE_URL}${path}`, options);
    const json = await response.json();

    if (!response.ok) {
        const message = json && json.error && json.error.message;
        throw new Error(message || `Stripe error ${response.status}`);
    }

    return json;
}

/*
 * Creates a Stripe-hosted Checkout page for a PaymentIntent that the 1Planit
 * backend already created, keeping manual capture + destination charge.
 * STRIPE_KEY (Secrets Manager) must be the Stripe SECRET key (sk_test_... / sk_live_...).
 */
export const createCheckoutSession = webMethod(
    Permissions.Anyone,
    async (input) => {
        const {
            paymentIntentId,
            bookingId,
            venueName,
            successUrl,
            cancelUrl,
            token
        } = input || {};

        if (!paymentIntentId || !bookingId || !successUrl || !cancelUrl || !token) {
            throw new Error("Missing checkout parameters");
        }

        // 1) Make sure this booking belongs to the logged-in user (API returns 403/404 otherwise).
        const bookingResponse = await fetch(
            `${API_URL}/bookings/${encodeURIComponent(bookingId)}`,
            { method: "GET", headers: { "Authorization": `Bearer ${token}` } }
        );

        if (!bookingResponse.ok) {
            throw new Error(`Booking check failed (${bookingResponse.status})`);
        }

        const bookingJson = await bookingResponse.json();
        const booking =
            bookingJson.data && (bookingJson.data.booking || bookingJson.data);

        // 2) Read the backend's PaymentIntent with the secret key.
        const secretKey = await getSecret("STRIPE_KEY");
        const pi = await stripeRequest(
            "GET",
            `/payment_intents/${encodeURIComponent(paymentIntentId)}`,
            secretKey
        );

        if (["requires_capture", "succeeded", "processing"].includes(pi.status)) {
            return { alreadyAuthorized: true };
        }

        if (booking && booking.amount_cents && Number(booking.amount_cents) !== pi.amount) {
            throw new Error("Amount mismatch between booking and payment");
        }

        // 3) Rebuild the same payment (manual capture, destination charge, fee, metadata).
        const metadata = Object.assign({}, pi.metadata || {}, {
            booking_id: String(bookingId),
            source_payment_intent: pi.id
        });

        const paymentIntentData = {
            capture_method: "manual",
            metadata
        };

        if (pi.transfer_data && pi.transfer_data.destination) {
            paymentIntentData.transfer_data = {
                destination: pi.transfer_data.destination
            };
        }

        if (pi.application_fee_amount) {
            paymentIntentData.application_fee_amount = pi.application_fee_amount;
        }

        if (pi.on_behalf_of) {
            paymentIntentData.on_behalf_of = pi.on_behalf_of;
        }

        const session = await stripeRequest("POST", "/checkout/sessions", secretKey, {
            mode: "payment",
            client_reference_id: String(bookingId),
            success_url: successUrl,
            cancel_url: cancelUrl,
            metadata,
            line_items: {
                "0": {
                    quantity: 1,
                    price_data: {
                        currency: pi.currency,
                        unit_amount: pi.amount,
                        product_data: { name: venueName || "1Planit booking" }
                    }
                }
            },
            payment_intent_data: paymentIntentData
        });

        return { url: session.url, sessionId: session.id };
    }
);