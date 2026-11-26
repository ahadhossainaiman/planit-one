// Wix → Backend → CREATE NEW FILE: booking.web.js

import { fetch } from 'wix-fetch';
import { webMethod, Permissions } from 'wix-web-module';

const BASE_URL = "https://api.1planit.com/api/v1";

/*
 * Every method returns: { ok, status, body }
 * so the page can read 401 / 409 / 422 / 502 / 503 and show
 * the API's own "message" to the user.
 * The user's JWT is passed from the page (local storage "access_token").
 */

async function planitRequest(method, path, token, body) {
    const headers = { "Accept": "application/json" };

    if (token) {
        headers["Authorization"] = `Bearer ${token}`;
    }

    const options = { method, headers };

    if (body !== undefined) {
        headers["Content-Type"] = "application/json";
        options.body = JSON.stringify(body);
    }

    try {
        const response = await fetch(`${BASE_URL}${path}`, options);
        const text = await response.text();

        let json = null;

        try {
            json = text ? JSON.parse(text) : null;
        } catch (error) {
            json = null;
        }

        return { ok: response.ok, status: response.status, body: json };

    } catch (error) {
        console.error("PlanIT request failed:", method, path, error);

        return {
            ok: false,
            status: 0,
            body: { message: "Network error. Please try again." }
        };
    }
}

function requireToken(token) {
    if (typeof token !== "string" || token.length < 20) {
        throw new Error("Not logged in.");
    }
}

function requireId(value, label) {
    const text = String(value ?? "").trim();

    if (!text || text.length > 200) {
        throw new Error(`Invalid ${label}.`);
    }

    return text;
}


/* ---------- Itinerary (to read travelers count) ---------- */

export const getItinerary = webMethod(
    Permissions.Anyone,
    async (token, itineraryId) => {
        requireToken(token);
        const id = requireId(itineraryId, "itinerary id");

        return planitRequest(
            "GET",
            `/itineraries/${encodeURIComponent(id)}`,
            token
        );
    }
);


/* ---------- 1. Price preview ---------- */

export const previewPrice = webMethod(
    Permissions.Anyone,
    async (token, experienceId, travelersCount) => {
        requireToken(token);
        const id = requireId(experienceId, "experience id");
        const travelers = Number(travelersCount);

        if (!Number.isInteger(travelers) || travelers < 1 || travelers > 50) {
            throw new Error("Travelers must be between 1 and 50.");
        }

        return planitRequest(
            "GET",
            `/bookings/price-preview` +
            `?experience_id=${encodeURIComponent(id)}` +
            `&travelers_count=${travelers}`,
            token
        );
    }
);


/* ---------- Create booking (status: pending) ---------- */

export const createBooking = webMethod(
    Permissions.Anyone,
    async (token, payload) => {
        requireToken(token);

        if (!payload || typeof payload !== "object") {
            throw new Error("Invalid booking payload.");
        }

        const experienceId = requireId(payload.experience_id, "experience id");

        let body;

        if (payload.itinerary_id) {
            // OPTION B – from itinerary (API ignores date/time/travelers here)
            body = {
                experience_id: experienceId,
                itinerary_id: Number(payload.itinerary_id)
            };

            if (!Number.isSafeInteger(body.itinerary_id)) {
                throw new Error("Invalid itinerary id.");
            }

        } else {
            // OPTION A – direct booking
            const travelers = Number(payload.travelers_count);

            if (!Number.isInteger(travelers) || travelers < 1 || travelers > 50) {
                throw new Error("Travelers must be between 1 and 50.");
            }

            if (!/^\d{4}-\d{2}-\d{2}$/.test(String(payload.scheduled_date))) {
                throw new Error("Date must be YYYY-MM-DD.");
            }

            if (!/^\d{2}:\d{2}$/.test(String(payload.scheduled_time))) {
                throw new Error("Time must be HH:MM.");
            }

            body = {
                experience_id: experienceId,
                travelers_count: travelers,
                scheduled_date: payload.scheduled_date,
                scheduled_time: payload.scheduled_time
            };
        }

        return planitRequest("POST", "/bookings", token, body);
    }
);