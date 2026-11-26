import { fetch } from 'wix-fetch';
import { local } from 'wix-storage-frontend';
import wixLocationFrontend from 'wix-location-frontend';
import { createCheckoutSession } from 'backend/stripeCheckout.web';

const BASE_URL = "https://api.1planit.com/api/v1";
const PLACEHOLDER_IMAGE = "https://i.postimg.cc/VkrVgk8b/plan-it-(1).png";
const MY_BOOKINGS_PATH = "/my-bookings"; // <-- your My Bookings page URL
const REDIRECT_TO_MY_BOOKINGS_AFTER_PAYMENT = true; // false = stay on this page

/*
 * Uses ONLY the element IDs from your original code:
 *   Page:     #statusBadge #genStatusBadge #tripTitle #destTxt #datesTxt
 *             #travelersBudgetTxt #totalEstimateTxt #stopsRepeater
 *   Repeater: #indexTxt #stopNameTxt #descTxt #dateTimeCityTxt #priceTierBadge
 *             #bookingTypeBadge #stopCostTxt #bookStopBtn #stopImage #deleteStopBtn
 * Status / error feedback is shown on the #bookStopBtn label itself.
 */

const state = {
    itineraryId: null,
    token: null,
    travelers: 1,
    bookingMap: {},
    returnStatus: "",
    returnBookingId: ""
};

$w.onReady(async function () {
    console.log("Itinerary page code running");

    const token = local.getItem("access_token");

    if (!token) {
        console.error("User not logged in");
        wixLocationFrontend.to("/");
        return;
    }

    const itineraryId = wixLocationFrontend.query.id;

    if (!itineraryId) {
        console.error("No itinerary ID");
        wixLocationFrontend.to("/dashboard");
        return;
    }

    state.itineraryId = itineraryId;
    state.token = token;

    // Hide editor placeholder content until real data arrives.
    onPage("#stopsRepeater", el => el.collapse());
    setPageValue("#tripTitle", "text", "Loading...");
    setPageValue("#destTxt", "text", "");
    setPageValue("#datesTxt", "text", "");
    setPageValue("#travelersBudgetTxt", "text", "");
    setPageValue("#totalEstimateTxt", "text", "");

    // Register before assigning repeater data.
    $w("#stopsRepeater").onItemReady(($item, itemData, index) => {
        renderStop($item, itemData, index, itineraryId, token);
    });

    await handlePaymentReturn();
    await loadItineraryDetails(itineraryId, token, 0);

    if (state.returnStatus === "success") {
        pollBookingAfterPayment(); // not awaited on purpose
    }
});


/* =========================================================
   LOAD ITINERARY
========================================================= */

async function loadItineraryDetails(itineraryId, token, attempt) {
    try {
        const response = await fetch(
            `${BASE_URL}/itineraries/${encodeURIComponent(itineraryId)}`,
            {
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                }
            }
        );

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const responseData = await response.json();

        if (!responseData || !responseData.success || !responseData.data) {
            throw new Error("Invalid itinerary response");
        }

        const data = responseData.data.itinerary || responseData.data;

        const travelers = Number(data.number_of_travelers);
        state.travelers = Number.isFinite(travelers)
            ? Math.min(50, Math.max(1, travelers))
            : 1;

        setPageValue("#statusBadge", "label", capitalize(data.status || "draft"));
        setPageValue("#genStatusBadge", "label", capitalize(data.generation_status || "partial"));
        onPage("#genStatusBadge", el => el.show());

        setPageValue("#tripTitle", "text", data.name || "Untitled Trip");
        setPageValue("#destTxt", "text", data.destination || data.city_name || "Destination not specified");
        setPageValue("#datesTxt", "text", formatShortDate(data.arrival_date));
        setPageValue(
            "#travelersBudgetTxt",
            "text",
            `${data.number_of_travelers ?? 0} Guests (${data.budget || "N/A"})`
        );
        setPageValue("#totalEstimateTxt", "text", formatCurrency(data.total_cost, data.currency));

        let attractions = extractStopsArray(data);

        // Fallback only when there are zero real stops.
        if (
            attractions.length === 0 &&
            data.generation_info &&
            Array.isArray(data.generation_info.soft_breaks)
        ) {
            attractions = data.generation_info.soft_breaks.filter(
                item => item && typeof item === "object"
            );
        }

        // Generation may still be running: poll a few times before giving up.
        if (
            attractions.length === 0 &&
            String(data.generation_status).toLowerCase() === "pending" &&
            attempt < 5
        ) {
            await new Promise(resolve => setTimeout(resolve, 3000));
            return loadItineraryDetails(itineraryId, token, attempt + 1);
        }

        state.bookingMap = await loadBookingMap();

        const stopsData = attractions.map((item, index) =>
            normalizeApiAttraction(item, data, itineraryId, index)
        );

        // Date first, then actual start time.
        stopsData.sort((a, b) => {
            const dateA = extractDate(a.displayDate) || "9999-12-31";
            const dateB = extractDate(b.displayDate) || "9999-12-31";
            const dateDifference = dateA.localeCompare(dateB);

            if (dateDifference !== 0) {
                return dateDifference;
            }

            const timeDifference =
                normalizeTimeForSort(a.displayTime) -
                normalizeTimeForSort(b.displayTime);

            if (timeDifference !== 0) {
                return timeDifference;
            }

            return a.order_index - b.order_index;
        });

        if (stopsData.length === 0) {
            console.warn(
                "No stops. attraction_count =", data.attraction_count,
                "| generation_error =", data.generation_error,
                "| response keys =", Object.keys(data)
            );
            return;
        }

        $w("#stopsRepeater").data = stopsData;

        await $w("#stopsRepeater").expand();

        console.log("Itinerary stops loaded:", stopsData.length);

    } catch (error) {
        console.error("LOAD ITINERARY ERROR:", error);
        setPageValue("#tripTitle", "text", "Could not load itinerary");
    }
}

function extractStopsArray(data) {
    const candidates = [
        data.attractions,
        data.stops,
        data.itinerary_attractions,
        data.items,
        data.schedule
    ];

    for (const list of candidates) {
        if (Array.isArray(list) && list.length > 0) {
            return list.filter(item => item && typeof item === "object");
        }
    }

    return [];
}


/* =========================================================
   NORMALIZE ATTRACTIONS / SOFT BREAKS
========================================================= */

function normalizeApiAttraction(item, data, itineraryId, index) {
    const attraction =
        item.attraction && typeof item.attraction === "object"
            ? item.attraction
            : {};

    const schedule =
        item.schedule_debug && typeof item.schedule_debug === "object"
            ? item.schedule_debug
            : {};

    const sourceId = String(
        getFirstValue(
            item.id,
            item.experience_id,
            attraction.id,
            schedule.experience_id,
            `stop-${itineraryId}-${index}`
        )
    );

    const isSoftBreak =
        isTrue(item.is_soft_break) ||
        isTrue(attraction.is_soft_break) ||
        isTrue(schedule.is_soft_break) ||
        sourceId.toLowerCase().includes("__soft_break_");

    let softBreakKind = String(
        getFirstValue(
            item.soft_break_kind,
            attraction.soft_break_kind,
            schedule.soft_break_kind
        )
    ).toLowerCase();

    if (!softBreakKind && isSoftBreak) {
        const lowerId = sourceId.toLowerCase();

        if (lowerId.includes("lunch")) {
            softBreakKind = "lunch";
        } else if (lowerId.includes("dinner")) {
            softBreakKind = "dinner";
        }
    }

    let name = getFirstValue(attraction.name, item.name, schedule.name, item.title);

    if (isSoftBreak) {
        if (softBreakKind === "lunch") {
            name = "Lunch Break";
        } else if (softBreakKind === "dinner") {
            name = "Dinner Break";
        } else {
            name = name || "Break";
        }
    }

    const description = getFirstValue(
        attraction.description,
        item.description,
        schedule.description,
        attraction.short_description,
        item.short_description,
        isSoftBreak ? "Flexible time for a meal." : ""
    );

    const displayDate = getFirstValue(
        item.suggested_date,
        attraction.suggested_date,
        schedule.suggested_date,
        item.date,
        item.start_date,
        extractDate(item.start_time),
        extractDate(item.time),
        extractDate(schedule.start_time)
    );

    const displayTime = getFirstValue(
        item.suggested_time,
        attraction.suggested_time,
        item.time,
        item.start_time,
        schedule.start_time
    );

    // Wix Repeater _id accepts only letters, numbers and hyphens.
    const repeaterId =
        `stop-${index}-${sourceId.replace(/[^A-Za-z0-9-]/g, "-")}`;

    const orderValue = Number(
        item.order_index ?? schedule.order_index ?? index + 1
    );

    const experienceId = isSoftBreak
        ? ""
        : String(
            getFirstValue(
                item.experience_id,
                attraction.id,
                item.id,
                schedule.experience_id
            )
        );

    const partnerType = String(
        getFirstValue(attraction.partner_type, item.partner_type)
    );

    const bookability = String(
        getFirstValue(
            attraction.bookability,
            item.bookability,
            isSoftBreak ? "notBookable" : ""
        )
    );

    const websiteUrl = String(getFirstValue(attraction.url, item.url));

    const affiliateUrl = String(
        getFirstValue(
            attraction.affiliate_url,
            item.affiliate_url,
            attraction.booking_url,
            item.booking_url
        )
    );

    const rawPrice = attraction.price ?? item.price ?? item.cost ?? null;

    const normalized = {
        ...item,

        _id: repeaterId,
        experience_id: experienceId,

        order_index: Number.isFinite(orderValue) ? orderValue : index + 1,

        displayName: String(name || "Untitled Stop"),
        displayDescription: String(description || ""),
        displayDate: String(displayDate || ""),
        displayTime: String(displayTime || ""),

        displayCity: String(
            getFirstValue(
                attraction.city_name,
                attraction.city,
                item.city_name,
                item.city,
                data.city_name,
                data.destination
            )
        ),

        displayUrl: websiteUrl || affiliateUrl,
        displayWebsiteUrl: websiteUrl,
        displayAffiliateUrl: affiliateUrl,

        displayPrice: rawPrice,
        displayPricePerPerson: isTrue(
            attraction.price_per_person ?? item.price_per_person
        ),

        displayCurrency: String(
            getFirstValue(attraction.currency, item.currency, data.currency, "EUR")
        ).toUpperCase(),

        displayPriceTier: String(
            getFirstValue(
                attraction.price_tier,
                item.price_tier,
                isSoftBreak ? "-" : ""
            )
        ),

        displayPartnerType: partnerType,
        displayBookability: bookability,

        // Real image first; placeholder is the LAST fallback and never for meal breaks.
        imageUrl: String(
            getFirstValue(
                attraction.image_url,
                item.image_url,
                item.places_photo_url,
                item.image,
                isSoftBreak ? "" : PLACEHOLDER_IMAGE
            )
        ),

        durationHours:
            item.duration_hours ??
            schedule.duration_hours ??
            attraction.duration_hours ??
            null,

        isSoftBreak,
        softBreakKind
    };

    normalized.bookingMode = getBookingMode(normalized);

    return normalized;
}


/* =========================================================
   BOOKING MODE (direct / affiliate / organic)
========================================================= */

function getBookingMode(stop) {
    if (stop.isSoftBreak) {
        return "break";
    }

    if (stop.displayPartnerType === "direct_partner") {
        if (stop.displayBookability === "bookable" && stop.experience_id) {
            return "direct";
        }

        if (stop.displayBookability === "comingSoon") {
            return "coming_soon";
        }

        return stop.displayWebsiteUrl ? "organic" : "none";
    }

    if (stop.displayPartnerType === "affiliate_link") {
        return stop.displayAffiliateUrl || stop.displayWebsiteUrl
            ? "affiliate"
            : "none";
    }

    return stop.displayWebsiteUrl ? "organic" : "none";
}

function configureActionButton($item, itemData) {
    onItem($item, "#bookStopBtn", button => {
        const mode = itemData.bookingMode;

        if (mode === "break" || mode === "none") {
            button.hide();
            return;
        }

        button.show();

        if (mode === "direct") {
            const existing = state.bookingMap[String(itemData.experience_id)];

            if (existing && isAlreadyBooked(existing)) {
                button.label = bookedLabel(existing);
                button.disable();
                return;
            }

            if (
                existing &&
                state.returnStatus === "success" &&
                String(existing.id) === String(state.returnBookingId)
            ) {
                button.label = "Confirming payment...";
                button.disable();
                return;
            }

            button.label = existing ? "Complete Payment" : "Book & Pay";
            button.enable();
            button.onClick(() => {
                startDirectBooking(itemData);
            });
            return;
        }

        if (mode === "coming_soon") {
            button.label = "Coming Soon";
            button.disable();
            return;
        }

        if (mode === "affiliate") {
            const url = itemData.displayAffiliateUrl || itemData.displayWebsiteUrl;
            button.label = "Book via Partner";
            button.enable();
            openLinkOnButton(button, url);
            return;
        }

        // organic
        button.label = "Visit Website";
        button.enable();
        openLinkOnButton(button, itemData.displayWebsiteUrl);
    });
}

function openLinkOnButton(button, url) {
    try {
        button.link = url;
        button.target = "_blank";
    } catch (error) {
        button.onClick(() => {
            wixLocationFrontend.to(url);
        });
    }
}

function getStopCostText(itemData) {
    const price = Number(itemData.displayPrice);
    const hasPrice =
        itemData.displayPrice !== null &&
        itemData.displayPrice !== "" &&
        Number.isFinite(price) &&
        price > 0;

    if (hasPrice) {
        const text = formatCurrency(price, itemData.displayCurrency);
        return itemData.displayPricePerPerson ? `${text} / person` : text;
    }

    if (itemData.bookingMode === "affiliate") {
        return "See partner price";
    }

    if (itemData.bookingMode === "organic") {
        return "Price varies";
    }

    return "Price on request";
}


/* =========================================================
   DIRECT PARTNER BOOKING + STRIPE CHECKOUT
   preview -> booking -> payment-intent -> Stripe hosted page
========================================================= */

async function startDirectBooking(itemData) {
    const repeaterId = itemData._id;

    try {
        setStopButton(repeaterId, "Checking availability...", true);
        setStopMessage(repeaterId, "");

        // 1) Price preview
        const preview = await getPricePreview(itemData.experience_id);

        if (!preview || preview.can_book === false) {
            setStopButton(repeaterId, "Not Available", true);
            setStopMessage(repeaterId, "This venue can't be booked in-app right now.");
            return;
        }

        // 2) Create booking (saved as pending in My Bookings) or reuse existing
        setStopButton(repeaterId, "Creating booking...", true);
        const booking = await createBookingFromItinerary(
            itemData.experience_id,
            state.itineraryId
        );

        if (isAlreadyBooked(booking)) {
            setStopButton(repeaterId, bookedLabel(booking), true);
            setStopMessage(repeaterId, "You already have a booking for this stop.");
            return;
        }

        // 3) Payment intent from the existing backend
        setStopButton(repeaterId, "Preparing payment...", true);
        const intent = await createPaymentIntent(booking.id);

        const paymentIntentId =
            intent.payment_intent_id ||
            String(intent.client_secret || "").split("_secret_")[0];

        // 4) Stripe hosted Checkout (STRIPE_KEY from Secrets Manager, in backend)
        setStopButton(repeaterId, "Redirecting to payment...", true);

        const session = await createCheckoutSession({
            paymentIntentId,
            bookingId: booking.id,
            venueName: itemData.displayName,
            token: state.token,
            successUrl: buildReturnUrl("success", booking.id),
            cancelUrl: buildReturnUrl("cancelled", booking.id)
        });

        if (session.alreadyAuthorized) {
            setStopButton(repeaterId, "Awaiting Vendor", true);
            setStopMessage(repeaterId, "Payment already authorised.");
            return;
        }

        wixLocationFrontend.to(session.url);

    } catch (error) {
        console.error("DIRECT BOOKING ERROR:", error, friendlyError(error));
        const failure = errorButtonState(error);
        setStopButton(repeaterId, failure.label, failure.disabled);
    }
}

function buildReturnUrl(status, bookingId) {
    const base = wixLocationFrontend.url
        .split("#")[0]
        .replace(/([?&])(payment|booking_id)=[^&]*/g, "$1")
        .replace(/[?&]+$/, "")
        .replace(/\?&/, "?")
        .replace(/&&+/g, "&");

    const joiner = base.includes("?") ? "&" : "?";

    return `${base}${joiner}payment=${status}&booking_id=${encodeURIComponent(bookingId)}`;
}

async function handlePaymentReturn() {
    const status = String(wixLocationFrontend.query.payment || "");
    const bookingId = String(wixLocationFrontend.query.booking_id || "");

    if (!status || !bookingId) {
        return;
    }

    state.returnStatus = status;
    state.returnBookingId = bookingId;

    if (status === "cancelled") {
        try {
            await apiRequest(
                "POST",
                `/bookings/${encodeURIComponent(bookingId)}/abandon-payment`,
                state.token
            );
        } catch (error) {
            console.error("ABANDON PAYMENT ERROR:", error);
        }

        showPaymentMessage("Payment cancelled. You can try again anytime.");
        return;
    }

    if (status === "success") {
        showPaymentMessage("Payment received. Saving your booking...");
    }
}

// After Stripe: wait for the webhook to mark the booking authorised, then show it as saved.
async function pollBookingAfterPayment() {
    const bookingId = state.returnBookingId;

    for (let attempt = 0; attempt < 10; attempt++) {
        try {
            const result = await apiRequest(
                "GET",
                `/bookings/${encodeURIComponent(bookingId)}`,
                state.token
            );

            const body = result.data || {};
            const booking = body.booking || body;

            if (isAlreadyBooked(booking)) {
                state.bookingMap[String(booking.experience_id)] = booking;
                updateButtonsForExperience(booking);
                showPaymentMessage(
                    "Booking saved! You'll find it in My Bookings. " +
                    "You're charged only after the venue accepts."
                );
                showMyBookingsButton();
                return;
            }

        } catch (error) {
            console.error("POLL BOOKING ERROR:", error);
        }

        await new Promise(resolve => setTimeout(resolve, 3000));
    }

    // The booking record already exists (created before payment), webhook may just be slow.
    showPaymentMessage(
        "Your booking is saved in My Bookings. Payment confirmation may take a moment."
    );
    showMyBookingsButton();
}

async function showMyBookingsButton() {
    await refreshItineraryStatus();

    if (REDIRECT_TO_MY_BOOKINGS_AFTER_PAYMENT) {
        wixLocationFrontend.to(MY_BOOKINGS_PATH);
    }
}

async function refreshItineraryStatus() {
    try {
        const result = await apiRequest(
            "GET",
            `/itineraries/${encodeURIComponent(state.itineraryId)}`,
            state.token
        );

        const data = (result.data && (result.data.itinerary || result.data)) || {};

        if (data.status) {
            setPageValue("#statusBadge", "label", capitalize(data.status));
        }
    } catch (error) {
        console.error("REFRESH STATUS ERROR:", error);
    }
}

function updateButtonsForExperience(booking) {
    onPage("#stopsRepeater", repeater => {
        repeater.forEachItem(($item, data) => {
            if (String(data.experience_id) !== String(booking.experience_id)) {
                return;
            }

            onItem($item, "#bookStopBtn", button => {
                button.label = bookedLabel(booking);
                button.disable();
            });
        });
    });
}

function showPaymentMessage(text) {
    console.log("[payment]", text);
}

async function loadBookingMap() {
    try {
        const result = await apiRequest(
            "GET",
            "/bookings?category=all&page=1&limit=100",
            state.token
        );

        const list = (result.data && result.data.bookings) || [];
        const map = {};

        list.forEach(booking => {
            const dead = ["cancelled", "failed", "declined", "expired"].includes(
                String(booking.customer_status || booking.status)
            );

            if (!dead && String(booking.itinerary_id) === String(state.itineraryId)) {
                map[String(booking.experience_id)] = booking;
            }
        });

        return map;

    } catch (error) {
        console.error("LOAD BOOKINGS ERROR:", error);
        return {};
    }
}

async function getPricePreview(experienceId) {
    const query =
        `experience_id=${encodeURIComponent(experienceId)}` +
        `&travelers_count=${encodeURIComponent(state.travelers)}`;

    const result = await apiRequest(
        "GET",
        `/bookings/price-preview?${query}`,
        state.token
    );

    return result.data || result;
}

async function createBookingFromItinerary(experienceId, itineraryId) {
    const numericId = Number(itineraryId);

    try {
        const result = await apiRequest("POST", "/bookings", state.token, {
            experience_id: experienceId,
            itinerary_id: Number.isFinite(numericId) ? numericId : itineraryId
        });

        const body = result.data || {};
        return body.booking || body;

    } catch (error) {
        // Duplicate active booking: reuse it instead of failing.
        if (error.status === 409) {
            const existing = await findExistingBooking(experienceId, itineraryId);
            if (existing) {
                return existing;
            }
        }
        throw error;
    }
}

async function findExistingBooking(experienceId, itineraryId) {
    const result = await apiRequest(
        "GET",
        "/bookings?category=all&page=1&limit=100",
        state.token
    );

    const list = (result.data && result.data.bookings) || [];

    return list.find(booking =>
        String(booking.experience_id) === String(experienceId) &&
        String(booking.itinerary_id) === String(itineraryId) &&
        !["cancelled", "failed", "declined", "expired"].includes(
            String(booking.customer_status || booking.status)
        )
    ) || null;
}

async function createPaymentIntent(bookingId) {
    const path = `/bookings/${encodeURIComponent(bookingId)}`;

    try {
        const result = await apiRequest("POST", `${path}/payment-intent`, state.token);
        return result.data || result;

    } catch (error) {
        // Payment previously failed/abandoned: retry it, then fetch the intent.
        if (error.status === 409) {
            const retry = await apiRequest("POST", `${path}/retry-payment`, state.token);
            const retryData = retry.data || retry;

            if (retryData.client_secret) {
                return retryData;
            }

            const again = await apiRequest("POST", `${path}/payment-intent`, state.token);
            return again.data || again;
        }
        throw error;
    }
}

function isAlreadyBooked(booking) {
    const status = String(booking.status || "");
    const customer = String(booking.customer_status || "");

    return (
        status === "paid" ||
        ["awaiting_vendor", "confirmed", "completed"].includes(customer)
    );
}

function bookedLabel(booking) {
    const customer = String(booking.customer_status || "");

    if (customer === "confirmed" || customer === "completed") {
        return "Booked";
    }

    return "Awaiting Vendor";
}

function setStopButton(repeaterId, label, disabled) {
    onPage("#stopsRepeater", repeater => {
        repeater.forEachItem(($item, data) => {
            if (data._id !== repeaterId) {
                return;
            }

            onItem($item, "#bookStopBtn", button => {
                button.label = label;

                if (disabled) {
                    button.disable();
                } else {
                    button.enable();
                }
            });
        });
    });
}

function setStopMessage(repeaterId, text) {
    if (text) {
        console.log("[stop]", repeaterId, text);
    }
}

function errorButtonState(error) {
    switch (error && error.status) {
        case 401:
            return { label: "Login Required", disabled: true };
        case 403:
            return { label: "Verify Email First", disabled: true };
        case 404:
        case 422:
            return { label: "Not Available", disabled: true };
        default:
            return { label: "Try Again", disabled: false };
    }
}

function friendlyError(error) {
    switch (error && error.status) {
        case 401:
            return "Please log in again.";
        case 403:
            return "Please verify your email before booking.";
        case 404:
            return "This venue or itinerary was not found.";
        case 409:
            return "A booking for this stop already exists.";
        case 422:
            return "This venue isn't available for in-app booking yet.";
        case 502:
        case 503:
            return "Payment service is temporarily unavailable. Try again shortly.";
        default:
            return (error && error.message) || "Something went wrong. Please try again.";
    }
}

async function apiRequest(method, path, token, body) {
    const options = {
        method,
        headers: { "Authorization": `Bearer ${token}` }
    };

    if (body !== undefined) {
        options.headers["Content-Type"] = "application/json";
        options.body = JSON.stringify(body);
    }

    const response = await fetch(`${BASE_URL}${path}`, options);
    const text = await response.text();

    let json = null;
    try {
        json = text ? JSON.parse(text) : null;
    } catch (error) {
        json = null;
    }

    if (!response.ok || (json && json.success === false)) {
        const err = new Error((json && json.message) || `HTTP ${response.status}`);
        // err.status = response.status;
        // err.code = json && json.code;
        throw err;
    }

    return json || {};
}


/* =========================================================
   RENDER REPEATER ITEM
========================================================= */

function renderStop($item, itemData, index, itineraryId, token) {
    try {
        setItemValue($item, "#indexTxt", "label", String(index + 1).padStart(2, "0"));
        setItemValue($item, "#stopNameTxt", "text", itemData.displayName);
        setItemValue($item, "#descTxt", "text", itemData.displayDescription);

        const meta = [
            formatShortDate(itemData.displayDate),
            formatTime(itemData.displayTime),
            itemData.displayCity
        ].filter(Boolean).join(" | ");

        setItemValue($item, "#dateTimeCityTxt", "text", meta);

        onItem($item, "#priceTierBadge", badge => {
            if (itemData.displayPriceTier) {
                badge.label = itemData.displayPriceTier;
                badge.show();
            } else {
                badge.hide();
            }
        });

        const badgeLabels = {
            direct: "Direct Booking",
            affiliate: "Partner Link",
            organic: "Info Only",
            coming_soon: "Coming Soon"
        };

        if (itemData.isSoftBreak) {
            const breakLabel =
                itemData.softBreakKind === "lunch"
                    ? "Lunch Break"
                    : itemData.softBreakKind === "dinner"
                        ? "Dinner Break"
                        : "Break";

            onItem($item, "#bookingTypeBadge", badge => {
                badge.label = breakLabel;
                badge.show();
            });

            setItemValue($item, "#stopCostTxt", "text", "Flexible");

        } else {
            onItem($item, "#bookingTypeBadge", badge => {
                const label = badgeLabels[itemData.bookingMode];

                if (label) {
                    badge.label = label;
                    badge.show();
                } else {
                    badge.hide();
                }
            });

            setItemValue($item, "#stopCostTxt", "text", getStopCostText(itemData));
        }

        configureActionButton($item, itemData);

        onItem($item, "#stopImage", image => {
            if (itemData.imageUrl) {
                image.src = itemData.imageUrl;
                image.show();
            } else {
                image.hide();
            }
        });

        onItem($item, "#deleteStopBtn", deleteButton => {
            deleteButton.enable();

            deleteButton.onClick(async () => {
                try {
                    deleteButton.disable();

                    if (!itemData.isSoftBreak) {
                        if (!itemData.experience_id) {
                            throw new Error("Missing experience_id");
                        }

                        await deleteItineraryStop(
                            itineraryId,
                            itemData.experience_id,
                            token
                        );
                    }

                    $w("#stopsRepeater").data =
                        $w("#stopsRepeater").data.filter(
                            stop => stop._id !== itemData._id
                        );

                    $w("#stopsRepeater").forEachItem(
                        ($remainingItem, remainingData, remainingIndex) => {
                            setItemValue(
                                $remainingItem,
                                "#indexTxt",
                                "label",
                                String(remainingIndex + 1).padStart(2, "0")
                            );
                        }
                    );

                } catch (error) {
                    console.error("DELETE STOP ERROR:", error);
                    deleteButton.enable();
                }
            });
        });

    } catch (error) {
        console.error("REPEATER ITEM ERROR:", index, error);
    }
}


/* =========================================================
   DELETE API
========================================================= */

async function deleteItineraryStop(itineraryId, experienceId, token) {
    const response = await fetch(
        `${BASE_URL}/itineraries/${encodeURIComponent(itineraryId)}/attractions/${encodeURIComponent(experienceId)}`,
        {
            method: "DELETE",
            headers: { "Authorization": `Bearer ${token}` }
        }
    );

    if (!response.ok) {
        throw new Error(`Delete failed: ${response.status}`);
    }

    if (response.status === 204) {
        return;
    }

    const text = await response.text();

    if (!text.trim()) {
        return;
    }

    let result;

    try {
        result = JSON.parse(text);
    } catch (error) {
        return;
    }

    if (result && result.success === false) {
        throw new Error(result.message || "Delete failed");
    }

    return result;
}


/* =========================================================
   GENERAL HELPERS
========================================================= */

function getFirstValue(...values) {
    for (const value of values) {
        if (
            value !== undefined &&
            value !== null &&
            String(value).trim() !== ""
        ) {
            return value;
        }
    }

    return "";
}

function isTrue(value) {
    return value === true || String(value).toLowerCase() === "true";
}

function extractDate(value) {
    if (!value) {
        return "";
    }

    const match = String(value).match(/^\d{4}-\d{2}-\d{2}/);

    return match ? match[0] : "";
}

function capitalize(value) {
    const text = String(value || "");

    return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

function formatShortDate(value) {
    if (!value) {
        return "";
    }

    const dateOnly = extractDate(value);

    const date = dateOnly
        ? new Date(`${dateOnly}T12:00:00`)
        : new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "";
    }

    return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric"
    });
}

function getTimeParts(value) {
    if (!value) {
        return null;
    }

    const match = String(value).trim().match(/(?:^|T)(\d{1,2}):(\d{2})/);

    if (!match) {
        return null;
    }

    const hour = Number(match[1]);
    const minute = Number(match[2]);

    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
        return null;
    }

    return { hour, minute };
}

function formatTime(value) {
    const parts = getTimeParts(value);

    if (!parts) {
        return value ? String(value) : "";
    }

    const period = parts.hour >= 12 ? "PM" : "AM";
    const hour = parts.hour % 12 || 12;
    const minute = String(parts.minute).padStart(2, "0");

    return `${hour}:${minute} ${period}`;
}

function normalizeTimeForSort(value) {
    const parts = getTimeParts(value);

    return parts ? parts.hour * 60 + parts.minute : 999999;
}

function formatCurrency(amount, currencyCode) {
    const value = Number(amount ?? 0);
    const safeValue = Number.isFinite(value) ? value : 0;
    const code = String(currencyCode || "EUR").toUpperCase();

    try {
        return new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: code
        }).format(safeValue);

    } catch (error) {
        return `${code} ${safeValue.toFixed(2)}`;
    }
}


/* =========================================================
   SAFE ELEMENT HELPERS
   A missing or differently-typed element is logged, never fatal.
========================================================= */

function onPage(selector, action) {
    try {
        const element = $w(selector);

        if (element) {
            action(element);
        }
    } catch (error) {
        console.warn(`[page ${selector}]`, error && error.message);
    }
}

function onItem($item, selector, action) {
    try {
        const element = $item(selector);

        if (element) {
            action(element);
        }
    } catch (error) {
        console.warn(`[item ${selector}]`, error && error.message);
    }
}

function setPageValue(selector, property, value) {
    onPage(selector, element => {
        element[property] = String(value ?? "");
    });
}

function setItemValue($item, selector, property, value) {
    onItem($item, selector, element => {
        element[property] = String(value ?? "");
    });
}


// import { fetch } from 'wix-fetch';
// import { local } from 'wix-storage-frontend';
// import wixLocationFrontend from 'wix-location-frontend';

// const BASE_URL = "https://api.1planit.com/api/v1";

// $w.onReady(async function () {
//     const token = local.getItem("access_token");

//     if (!token) {
//         console.error("User not logged in");
//         wixLocationFrontend.to("/");
//         return;
//     }

//     const itineraryId = wixLocationFrontend.query.id;

//     if (!itineraryId) {
//         console.error("No itinerary ID");
//         wixLocationFrontend.to("/dashboard");
//         return;
//     }

//     // Register before assigning repeater data.
//     $w("#stopsRepeater").onItemReady(($item, itemData, index) => {
//         renderStop($item, itemData, index, itineraryId, token);
//     });

//     await loadItineraryDetails(itineraryId, token);
// });


// /* =========================================================
//    LOAD ITINERARY
// ========================================================= */

// async function loadItineraryDetails(itineraryId, token) {
//     try {
//         const response = await fetch(
//             `${BASE_URL}/itineraries/${encodeURIComponent(itineraryId)}`,
//             {
//                 method: "GET",
//                 headers: {
//                     "Content-Type": "application/json",
//                     "Authorization": `Bearer ${token}`
//                 }
//             }
//         );

//         if (!response.ok) {
//             throw new Error(`HTTP ${response.status}`);
//         }

//         const responseData = await response.json();

//         if (
//             !responseData ||
//             !responseData.success ||
//             !responseData.data
//         ) {
//             throw new Error("Invalid itinerary response");
//         }

//         const data = responseData.data;

//         setPageValue(
//             "#statusBadge",
//             "label",
//             capitalize(data.status || "draft")
//         );

//         setPageValue(
//             "#genStatusBadge",
//             "label",
//             capitalize(data.generation_status || "partial")
//         );

//         if (hasPageElement("#genStatusBadge")) {
//             $w("#genStatusBadge").show();
//         }

//         setPageValue(
//             "#tripTitle",
//             "text",
//             data.name || "Untitled Trip"
//         );

//         setPageValue(
//             "#destTxt",
//             "text",
//             data.destination || data.city_name || "Destination not specified"
//         );

//         setPageValue(
//             "#datesTxt",
//             "text",
//             formatShortDate(data.arrival_date)
//         );

//         setPageValue(
//             "#travelersBudgetTxt",
//             "text",
//             `${data.number_of_travelers ?? 0} Guests (${data.budget || "N/A"})`
//         );

//         setPageValue(
//             "#totalEstimateTxt",
//             "text",
//             formatCurrency(data.total_cost, data.currency)
//         );

//         // Both supplied JSON responses already contain all stops here.
//         // Do not append generation_info.soft_breaks: that duplicates breaks.
//         const attractions = Array.isArray(data.attractions)
//             ? data.attractions.filter(
//                 item => item && typeof item === "object"
//             )
//             : [];

//         const stopsData = attractions.map((item, index) =>
//             normalizeApiAttraction(item, data, itineraryId, index)
//         );

//         // Date first, then actual start time.
//         stopsData.sort((a, b) => {
//             const dateA = extractDate(a.displayDate) || "9999-12-31";
//             const dateB = extractDate(b.displayDate) || "9999-12-31";

//             const dateDifference = dateA.localeCompare(dateB);

//             if (dateDifference !== 0) {
//                 return dateDifference;
//             }

//             const timeDifference =
//                 normalizeTimeForSort(a.displayTime) -
//                 normalizeTimeForSort(b.displayTime);

//             if (timeDifference !== 0) {
//                 return timeDifference;
//             }

//             return a.order_index - b.order_index;
//         });

//         $w("#stopsRepeater").data = stopsData;

//         await $w("#stopsRepeater").expand();
//         await $w("#stopsRepeater").show();

//         console.log("Itinerary stops loaded:", stopsData.length);

//     } catch (error) {
//         console.error("LOAD ITINERARY ERROR:", error);
//     }
// }


// /* =========================================================
//    NORMALIZE ATTRACTIONS / SOFT BREAKS
// ========================================================= */

// function normalizeApiAttraction(item, data, itineraryId, index) {
//     const attraction =
//         item.attraction && typeof item.attraction === "object"
//             ? item.attraction
//             : {};

//     const schedule =
//         item.schedule_debug && typeof item.schedule_debug === "object"
//             ? item.schedule_debug
//             : {};

//     const sourceId = String(
//         getFirstValue(
//             item.id,
//             item.experience_id,
//             attraction.id,
//             schedule.experience_id,
//             `stop-${itineraryId}-${index}`
//         )
//     );

//     const isSoftBreak =
//         isTrue(item.is_soft_break) ||
//         isTrue(attraction.is_soft_break) ||
//         isTrue(schedule.is_soft_break) ||
//         sourceId.toLowerCase().includes("__soft_break_");

//     let softBreakKind = String(
//         getFirstValue(
//             item.soft_break_kind,
//             attraction.soft_break_kind,
//             schedule.soft_break_kind
//         )
//     ).toLowerCase();

//     if (!softBreakKind && isSoftBreak) {
//         const lowerId = sourceId.toLowerCase();

//         if (lowerId.includes("lunch")) {
//             softBreakKind = "lunch";
//         } else if (lowerId.includes("dinner")) {
//             softBreakKind = "dinner";
//         }
//     }

//     let name = getFirstValue(
//         attraction.name,
//         item.name,
//         schedule.name,
//         item.title
//     );

//     if (isSoftBreak) {
//         if (softBreakKind === "lunch") {
//             name = "Lunch Break";
//         } else if (softBreakKind === "dinner") {
//             name = "Dinner Break";
//         } else {
//             name = name || "Break";
//         }
//     }

//     const description = getFirstValue(
//         attraction.description,
//         item.description,
//         schedule.description,
//         attraction.short_description,
//         item.short_description,
//         isSoftBreak ? "Flexible time for a meal." : ""
//     );

//     const displayDate = getFirstValue(
//         item.suggested_date,
//         attraction.suggested_date,
//         schedule.suggested_date,
//         item.date,
//         item.start_date,
//         extractDate(item.start_time),
//         extractDate(item.time),
//         extractDate(schedule.start_time)
//     );

//     const displayTime = getFirstValue(
//         item.suggested_time,
//         attraction.suggested_time,
//         item.time,
//         item.start_time,
//         schedule.start_time
//     );

//     /*
//      * IMPORTANT FIX:
//      * Wix Repeater _id accepts only letters, numbers and hyphens.
//      * API soft-break IDs contain underscores.
//      * Index prefix also prevents duplicate repeater IDs.
//      *
//      * Keep the original experience_id separately for API requests.
//      */
//     const repeaterId =
//         `stop-${index}-${sourceId.replace(/[^A-Za-z0-9-]/g, "-")}`;

//     const orderValue = Number(
//         item.order_index ?? schedule.order_index ?? index + 1
//     );

//     return {
//         ...item,

//         _id: repeaterId,

//         experience_id: isSoftBreak
//             ? ""
//             : String(
//                 getFirstValue(
//                     item.experience_id,
//                     attraction.id,
//                     item.id,
//                     schedule.experience_id
//                 )
//             ),

//         order_index: Number.isFinite(orderValue)
//             ? orderValue
//             : index + 1,

//         displayName: String(name || "Untitled Stop"),

//         displayDescription: String(description || ""),

//         displayDate: String(displayDate || ""),

//         displayTime: String(displayTime || ""),

//         displayCity: String(
//             getFirstValue(
//                 attraction.city_name,
//                 attraction.city,
//                 item.city_name,
//                 item.city,
//                 data.city_name,
//                 data.destination
//             )
//         ),

//         displayUrl: String(
//             getFirstValue(
//                 attraction.url,
//                 item.url,
//                 attraction.affiliate_url,
//                 item.affiliate_url,
//                 attraction.booking_url,
//                 item.booking_url
//             )
//         ),

//         displayPrice:
//             attraction.price ??
//             item.price ??
//             item.cost ??
//             null,

//         displayCurrency: String(
//             getFirstValue(
//                 attraction.currency,
//                 item.currency,
//                 data.currency,
//                 "EUR"
//             )
//         ),

//         displayPriceTier: String(
//             getFirstValue(
//                 attraction.price_tier,
//                 item.price_tier,
//                 isSoftBreak ? "-" : "$"
//             )
//         ),

//         displayPartnerType: String(
//             getFirstValue(
//                 attraction.partner_type,
//                 item.partner_type
//             )
//         ),

//         displayBookability: String(
//             getFirstValue(
//                 attraction.bookability,
//                 item.bookability,
//                 isSoftBreak ? "notBookable" : ""
//             )
//         ),

//         imageUrl: String(
//             getFirstValue(
//                 attraction.image_url || "https://i.postimg.cc/VkrVgk8b/plan-it-(1).png",
//                 item.image_url || "https://i.postimg.cc/VkrVgk8b/plan-it-(1).png",
//                 item.places_photo_url,
//                 item.image
//             )
//         ),

//         durationHours:
//             item.duration_hours ??
//             schedule.duration_hours ??
//             attraction.duration_hours ??
//             null,

//         isSoftBreak,
//         softBreakKind
//     };
// }


// /* =========================================================
//    RENDER REPEATER ITEM
// ========================================================= */

// function renderStop($item, itemData, index, itineraryId, token) {
//     try {
//         setItemValue(
//             $item,
//             "#indexTxt",
//             "label",
//             String(index + 1).padStart(2, "0")
//         );

//         setItemValue(
//             $item,
//             "#stopNameTxt",
//             "text",
//             itemData.displayName
//         );

//         setItemValue(
//             $item,
//             "#descTxt",
//             "text",
//             itemData.displayDescription
//         );

//         const meta = [
//             formatShortDate(itemData.displayDate),
//             formatTime(itemData.displayTime),
//             itemData.displayCity
//         ].filter(Boolean).join(" | ");

//         setItemValue(
//             $item,
//             "#dateTimeCityTxt",
//             "text",
//             meta
//         );

//         setItemValue(
//             $item,
//             "#priceTierBadge",
//             "label",
//             itemData.displayPriceTier
//         );

//         if (itemData.isSoftBreak) {
//             const breakLabel =
//                 itemData.softBreakKind === "lunch"
//                     ? "Lunch Break"
//                     : itemData.softBreakKind === "dinner"
//                         ? "Dinner Break"
//                         : "Break";

//             setItemValue(
//                 $item,
//                 "#bookingTypeBadge",
//                 "label",
//                 breakLabel
//             );

//             if (hasItemElement($item, "#bookingTypeBadge")) {
//                 $item("#bookingTypeBadge").show();
//             }

//             setItemValue(
//                 $item,
//                 "#stopCostTxt",
//                 "text",
//                 "Flexible"
//             );

//             if (hasItemElement($item, "#bookStopBtn")) {
//                 $item("#bookStopBtn").disable();
//             }

//         } else {
//             if (hasItemElement($item, "#bookingTypeBadge")) {
//                 if (itemData.displayPartnerType === "direct_partner") {
//                     $item("#bookingTypeBadge").label = "Direct Booking";
//                     $item("#bookingTypeBadge").show();
//                 } else {
//                     $item("#bookingTypeBadge").hide();
//                 }
//             }

//             setItemValue(
//                 $item,
//                 "#stopCostTxt",
//                 "text",
//                 formatCurrency(
//                     itemData.displayPrice,
//                     itemData.displayCurrency
//                 )
//             );

//             if (hasItemElement($item, "#bookStopBtn")) {
//                 $item("#bookStopBtn").label = "Book Stop";

//                 if (itemData.displayUrl) {
//                     $item("#bookStopBtn").enable();

//                     $item("#bookStopBtn").onClick(() => {
//                         wixLocationFrontend.to(itemData.displayUrl);
//                     });
//                 } else {
//                     $item("#bookStopBtn").disable();
//                 }
//             }
//         }

//         if (hasItemElement($item, "#stopImage")) {
//             if (itemData.imageUrl) {
//                 $item("#stopImage").src = itemData.imageUrl;
//                 $item("#stopImage").show();
//             } else {
//                 // Avoid showing the template image for a meal break.
//                 $item("#stopImage").hide();
//             }
//         }

//         if (hasItemElement($item, "#deleteStopBtn")) {
//             $item("#deleteStopBtn").enable();

//             $item("#deleteStopBtn").onClick(async () => {
//                 try {
//                     $item("#deleteStopBtn").disable();

//                     if (!itemData.isSoftBreak) {
//                         if (!itemData.experience_id) {
//                             throw new Error("Missing experience_id");
//                         }

//                         await deleteItineraryStop(
//                             itineraryId,
//                             itemData.experience_id,
//                             token
//                         );
//                     }

//                     // Soft breaks are removed locally, as in your original code.
//                     $w("#stopsRepeater").data =
//                         $w("#stopsRepeater").data.filter(
//                             stop => stop._id !== itemData._id
//                         );

//                     // Refresh visible numbering after deletion.
//                     $w("#stopsRepeater").forEachItem(
//                         ($remainingItem, remainingData, remainingIndex) => {
//                             setItemValue(
//                                 $remainingItem,
//                                 "#indexTxt",
//                                 "label",
//                                 String(remainingIndex + 1).padStart(2, "0")
//                             );
//                         }
//                     );

//                 } catch (error) {
//                     console.error("DELETE STOP ERROR:", error);
//                     $item("#deleteStopBtn").enable();
//                 }
//             });
//         }

//     } catch (error) {
//         console.error("REPEATER ITEM ERROR:", index, error);
//     }
// }


// /* =========================================================
//    DELETE API
// ========================================================= */

// async function deleteItineraryStop(itineraryId, experienceId, token) {
//     const response = await fetch(
//         `${BASE_URL}/itineraries/${encodeURIComponent(itineraryId)}/attractions/${encodeURIComponent(experienceId)}`,
//         {
//             method: "DELETE",
//             headers: {
//                 "Authorization": `Bearer ${token}`
//             }
//         }
//     );

//     if (!response.ok) {
//         throw new Error(`Delete failed: ${response.status}`);
//     }

//     // A successful DELETE may return an empty response.
//     if (response.status === 204) {
//         return;
//     }

//     const text = await response.text();

//     if (!text.trim()) {
//         return;
//     }

//     let result;

//     try {
//         result = JSON.parse(text);
//     } catch (error) {
//         return;
//     }

//     if (result && result.success === false) {
//         throw new Error(result.message || "Delete failed");
//     }

//     return result;
// }


// /* =========================================================
//    GENERAL HELPERS
// ========================================================= */

// function getFirstValue(...values) {
//     for (const value of values) {
//         if (
//             value !== undefined &&
//             value !== null &&
//             String(value).trim() !== ""
//         ) {
//             return value;
//         }
//     }

//     return "";
// }

// function isTrue(value) {
//     return value === true ||
//         String(value).toLowerCase() === "true";
// }

// function extractDate(value) {
//     if (!value) {
//         return "";
//     }

//     const match = String(value).match(/^\d{4}-\d{2}-\d{2}/);

//     return match ? match[0] : "";
// }

// function capitalize(value) {
//     const text = String(value || "");

//     return text.charAt(0).toUpperCase() +
//         text.slice(1).toLowerCase();
// }

// function formatShortDate(value) {
//     if (!value) {
//         return "";
//     }

//     // Use the calendar date directly to avoid timezone date shifts.
//     const dateOnly = extractDate(value);

//     const date = dateOnly
//         ? new Date(`${dateOnly}T12:00:00`)
//         : new Date(value);

//     if (Number.isNaN(date.getTime())) {
//         return "";
//     }

//     return date.toLocaleDateString("en-US", {
//         month: "short",
//         day: "numeric",
//         year: "numeric"
//     });
// }

// function getTimeParts(value) {
//     if (!value) {
//         return null;
//     }

//     const text = String(value).trim();

//     // Preserve the API's supplied clock time.
//     const match = text.match(/(?:^|T)(\d{1,2}):(\d{2})/);

//     if (!match) {
//         return null;
//     }

//     const hour = Number(match[1]);
//     const minute = Number(match[2]);

//     if (
//         hour < 0 ||
//         hour > 23 ||
//         minute < 0 ||
//         minute > 59
//     ) {
//         return null;
//     }

//     return { hour, minute };
// }

// function formatTime(value) {
//     const parts = getTimeParts(value);

//     if (!parts) {
//         return value ? String(value) : "";
//     }

//     const period = parts.hour >= 12 ? "PM" : "AM";
//     const hour = parts.hour % 12 || 12;
//     const minute = String(parts.minute).padStart(2, "0");

//     return `${hour}:${minute} ${period}`;
// }

// function normalizeTimeForSort(value) {
//     const parts = getTimeParts(value);

//     return parts
//         ? parts.hour * 60 + parts.minute
//         : 999999;
// }

// function formatCurrency(amount, currencyCode) {
//     const value = Number(amount ?? 0);
//     const safeValue = Number.isFinite(value) ? value : 0;
//     const code = currencyCode || "EUR";

//     try {
//         return new Intl.NumberFormat("en-US", {
//             style: "currency",
//             currency: code
//         }).format(safeValue);

//     } catch (error) {
//         return `${code} ${safeValue.toFixed(2)}`;
//     }
// }


// /* =========================================================
//    ELEMENT HELPERS
// ========================================================= */

// function hasPageElement(selector) {
//     try {
//         return Boolean($w(selector));
//     } catch (error) {
//         return false;
//     }
// }

// function hasItemElement($item, selector) {
//     try {
//         return Boolean($item(selector));
//     } catch (error) {
//         return false;
//     }
// }

// function setPageValue(selector, property, value) {
//     if (hasPageElement(selector)) {
//         $w(selector)[property] = String(value ?? "");
//     }
// }

// function setItemValue($item, selector, property, value) {
//     if (hasItemElement($item, selector)) {
//         $item(selector)[property] = String(value ?? "");
//     }
// }


