// Wix → Venue page → Page Code
// URL: /venue?id=VENUE_ID   (from itinerary: &itinerary_id=42&book=1)

import { getAttractionById } from 'backend/attractions.web';
import { getItinerary, previewPrice, createBooking } from 'backend/booking.web';
import wixLocationFrontend from 'wix-location-frontend';
import { local } from 'wix-storage-frontend';

const FALLBACK_IMAGE =
    "https://static.wixstatic.com/media/884307_e2271750386249eb8f1c0fee9582d1ff~mv2.png";

const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

let venue = null;
let images = [];
let action = null;
let itineraryId = "";
let itineraryTravelers = 1;
let done = false;
let busy = false;


/* ================= PAGE READY ================= */

$w.onReady(async function () {

    const venueId = txt(wixLocationFrontend.query.id).trim();
    itineraryId = txt(wixLocationFrontend.query.itinerary_id).trim();

    if (!venueId) {
        wixLocationFrontend.to("/attractions");
        return;
    }

    $w("#bookingBox").collapse();
    $w("#venueThumb1").collapse();
    $w("#venueThumb2").collapse();
    $w("#statusMsg").collapse();
    $w("#bookingMsg").collapse();
    $w("#bookingNote").collapse();

    $w("#backBtn").onClick(() => wixLocationFrontend.to("/attractions"));
    $w("#venueThumb1").onClick(() => swapImage(1));
    $w("#venueThumb2").onClick(() => swapImage(2));
    $w("#travelersInput").onChange(refreshPrice);
    $w("#continueBtn").onClick(startBooking);
    $w("#cancelBtn").onClick(() => $w("#bookingBox").collapse());

    $w("#actionBtn").onClick(() => {
        if (!action) return;

        if (action.mode === "link") {
            wixLocationFrontend.to(action.url);
        } else if (action.mode === "direct") {
            openBooking();
        }
    });

    try {
        const result = await getAttractionById(venueId);

        if (!result || !result.success || !result.attraction) {
            showError("This venue could not be found.");
            return;
        }

        venue = result.attraction;
        console.log("VENUE:", venue);

        renderVenue(venue);

        if (wixLocationFrontend.query.book === "1" && action.mode === "direct") {
            openBooking();
        }

    } catch (error) {
        console.error("LOAD VENUE ERROR:", error);
        showError("Unable to load this venue. Please try again.");
    }
});


/* ================= SHOW VENUE ================= */

function renderVenue(v) {

    // Images: 1 main + up to 2 extra (only if the API sends them)
    images = [v.image_url, v.image_2_url, v.image_3_url, ...(Array.isArray(v.images) ? v.images : [])]
        .map(urlOf)
        .filter((url, i, list) => url && list.indexOf(url) === i)
        .slice(0, 3);

    $w("#venueMainImage").src = images[0] || FALLBACK_IMAGE;
    $w("#venueMainImage").alt = txt(v.name);

    if (images[1]) {
        $w("#venueThumb1").src = images[1];
        $w("#venueThumb1").expand();
    }

    if (images[2]) {
        $w("#venueThumb2").src = images[2];
        $w("#venueThumb2").expand();
    }

    // Category chip, title, location, description
    $w("#venueCategory").label = title(list(v.type)[0] || list(v.tags)[0]);
    $w("#venueTitle").text = txt(v.name) || "Venue";
    $w("#venueDescription").text = txt(v.description || v.short_description).slice(0, 400);

    $w("#venueLocation").text =
        [v.area, v.city_name, v.country]
            .map(txt)
            .map(s => s.trim())
            .filter((s, i, all) => s && all.indexOf(s) === i)
            .join(", ") || "Location not available";

    // 2-3 highlights
    const hours = Number(v.duration_hours);
    const tags = list(v.tags).map(title);

    const highlights = [
        tags[0],
        v.kids_friendly === true ? "Kid friendly" : "",
        hours > 0 ? `Recommended visit: ${hours} ${hours === 1 ? "hour" : "hours"}` : "",
        tags[1],
        tags[2]
    ].filter(Boolean).slice(0, 3);

    ["#highlight1", "#highlight2", "#highlight3"].forEach((id, i) => {
        if (highlights[i]) {
            $w(id).text = highlights[i];
            $w(id).expand();
        } else {
            $w(id).collapse();
        }
    });

    // Price box
    $w("#venuePrice").text = priceText(v);

    // Opening hours box (hidden when there is no data)
    const hoursText = hoursToText(v.opening_hours);

    $w("#venueHours").text = hoursText;

    // One action button:
    // organic → Visit Site | affiliate_link → Book (affiliate_url) | direct_partner → Book (PlanIT)
    action = getAction(v);

    $w("#actionBtn").label = action.label;

    if (action.mode === "off") {
        $w("#actionBtn").disable();
    } else {
        $w("#actionBtn").enable();
    }
}

function getAction(v) {

    const type = txt(v.partner_type).trim().toLowerCase();
    const site = link(v.url);
    const affiliate = link(v.affiliate_url);

    if (type === "direct_partner") {
        if (v.bookability === "bookable") {
            return { mode: "direct", label: "Book" };
        }

        return { mode: "off", label: v.bookability === "comingSoon" ? "Coming Soon" : "Not Available" };
    }

    if (type === "affiliate_link" && affiliate) {
        return { mode: "link", label: "Book", url: affiliate };
    }

    if (site) {
        return { mode: "link", label: "Visit Site", url: site };
    }

    return { mode: "off", label: "Not Available" };
}

function swapImage(index) {

    if (!images[index]) return;

    [images[0], images[index]] = [images[index], images[0]];

    $w("#venueMainImage").src = images[0];
    $w("#venueThumb1").src = images[1] || FALLBACK_IMAGE;

    if (images[2]) {
        $w("#venueThumb2").src = images[2];
    }
}


/* ================= BOOKING: OPEN + PRICE ================= */

async function openBooking() {

    const token = local.getItem("access_token");

    if (!token) {
        local.setItem("post_login_redirect", wixLocationFrontend.url);
        wixLocationFrontend.to("/");
        return;
    }

    if (done) return;

    msg("");
    $w("#priceTxt").text = "Checking price...";
    $w("#continueBtn").disable();

    await $w("#bookingBox").expand();

    if (itineraryId) {

        // Travelers + date/time come from the itinerary
        const result = await getItinerary(token, itineraryId);

        if (result.status === 401) return sessionExpired();

        if (!result.ok || !result.body?.data) {
            msg(apiMessage(result, "Could not load your itinerary."));
            return;
        }

        itineraryTravelers = Number(result.body.data.number_of_travelers) || 1;

        $w("#travelersInput").collapse();
        $w("#dateInput").collapse();
        $w("#timeInput").collapse();

        $w("#bookingNote").text =
            `Booking for ${itineraryTravelers} traveler(s). Date and time come from your itinerary.`;
        $w("#bookingNote").expand();

    } else {

        $w("#bookingNote").collapse();

        $w("#dateInput").minDate = new Date();

        if (!$w("#travelersInput").value) $w("#travelersInput").value = "1";
        if (!$w("#timeInput").value) $w("#timeInput").value = "10:00";
    }

    await refreshPrice();
}

async function refreshPrice() {

    const token = local.getItem("access_token");
    const count = travelerCount();

    if (!token || !count || !venue) return;

    $w("#continueBtn").disable();
    $w("#priceTxt").text = "Checking price...";

    try {
        const result = await previewPrice(token, txt(venue.id), count);

        console.log("PRICE PREVIEW:", result.body);

        if (result.status === 401) return sessionExpired();

        const data = result.body?.data ?? result.body ?? {};

        if (!result.ok || data.can_book !== true) {
            $w("#priceTxt").text = "";
            msg(apiMessage(result, "This venue cannot be booked online right now."));
            return;
        }

        // If the API sends cents, divide by 100 (check the console log above).
        const amount = data.amount_cents != null
            ? Number(data.amount_cents) / 100
            : Number(data.amount);

        $w("#priceTxt").text = Number.isFinite(amount)
            ? `Total: ${money(amount, data.currency || venue.currency)}`
            : "";

        msg("");
        $w("#continueBtn").enable();

    } catch (error) {
        console.error("PRICE PREVIEW ERROR:", error);
        $w("#priceTxt").text = "";
        msg("Could not check the price. Please try again.");
    }
}


/* ================= BOOKING: CREATE (pending, no payment yet) ================= */

async function startBooking() {

    if (busy || done) return;

    const token = local.getItem("access_token");

    if (!token) return sessionExpired();

    let payload;

    if (itineraryId) {

        payload = { experience_id: txt(venue.id), itinerary_id: Number(itineraryId) };

    } else {

        const count = travelerCount();
        const date = $w("#dateInput").value;
        const time = txt($w("#timeInput").value).trim().slice(0, 5);

        if (!count) return msg("Please enter 1 to 50 travelers.");
        if (!date) return msg("Please choose a date.");
        if (isoDate(date) < isoDate(new Date())) return msg("Please choose a future date.");
        if (!/^\d{2}:\d{2}$/.test(time)) return msg("Please choose a time.");

        const problem = closedProblem(date);

        if (problem) return msg(problem);

        payload = {
            experience_id: txt(venue.id),
            travelers_count: count,
            scheduled_date: isoDate(date),
            scheduled_time: time
        };
    }

    busy = true;
    $w("#continueBtn").disable();
    msg("Creating your booking...");

    try {
        const result = await createBooking(token, payload);

        console.log("CREATE BOOKING:", result.status, result.body);

        if (result.status === 401) return sessionExpired();

        if (!result.ok) {
            msg(apiMessage(result, "Could not create the booking."));
            $w("#continueBtn").enable();
            return;
        }

        const booking = result.body?.data?.booking ?? result.body?.data ?? {};
        const reference = txt(booking.booking_reference);

        done = true;
        $w("#continueBtn").collapse();
        $w("#cancelBtn").collapse();

        msg(
            "Your booking has been created" +
            (reference ? ` (Ref: ${reference})` : "") +
            ". Online payment will be available soon."
        );

    } catch (error) {
        console.error("START BOOKING ERROR:", error);
        msg("Something went wrong. Please try again.");
        $w("#continueBtn").enable();

    } finally {
        busy = false;
    }
}

function closedProblem(date) {

    const day = DAYS[date.getDay()];
    const open = list(venue.operating_days).map(d => d.toLowerCase());
    const closed = list(venue.closed_dates).map(d => d.slice(0, 10));

    if (open.length && !open.includes(day)) {
        return `This venue is closed on ${title(day)}. Please choose another day.`;
    }

    if (closed.includes(isoDate(date))) {
        return "This venue is closed on the selected date.";
    }

    return "";
}


/* ================= HELPERS ================= */

function travelerCount() {

    if (itineraryId) return itineraryTravelers;

    const n = Number($w("#travelersInput").value);

    return Number.isInteger(n) && n >= 1 && n <= 50 ? n : null;
}

function priceText(v) {

    const price = Number(v.price);

    if (price > 0) {
        const exact = txt(v.partner_type) === "direct_partner";
        const each = v.price_per_person === true ? " per person" : "";

        return `${exact ? "" : "Approx. "}${money(price, v.currency)}${each}`;
    }

    return txt(v.price_tier).trim() ? `Price level: ${txt(v.price_tier).trim()}` : "Price on request";
}

function hoursToText(value) {

    let hours = value;

    if (typeof hours === "string") {
        try { hours = JSON.parse(hours); } catch (e) { return ""; }
    }

    if (!hours || typeof hours !== "object") return "";

    return DAYS.slice(1).concat(DAYS[0])
        .filter(day => typeof hours[day] === "string" && hours[day].trim())
        .map(day => `${title(day.slice(0, 3))}: ${hours[day].trim()}`)
        .join("\n");
}

function money(amount, currency) {

    const code = txt(currency).toUpperCase() || "EUR";

    try {
        return new Intl.NumberFormat("en-US", { style: "currency", currency: code }).format(Number(amount));
    } catch (e) {
        return `${code} ${Number(amount).toFixed(2)}`;
    }
}

function sessionExpired() {
    local.setItem("post_login_redirect", wixLocationFrontend.url);
    msg("Your session has expired. Please log in again.");
    setTimeout(() => wixLocationFrontend.to("/"), 1500);
}

function apiMessage(result, fallback) {
    const m = result && result.body && result.body.message;
    return typeof m === "string" && m.trim() ? m : fallback;
}

function msg(text) {

    const value = txt(text);

    $w("#bookingMsg").text = value;

    if (value) {
        $w("#bookingMsg").expand();
    } else {
        $w("#bookingMsg").collapse();
    }
}

function showError(text) {
    $w("#statusMsg").text = text;
    $w("#statusMsg").expand();
    $w("#actionBtn").collapse();
}

function isoDate(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function link(value) {
    const url = txt(value).trim();
    return /^https?:\/\//i.test(url) ? url : "";
}

function urlOf(value) {
    const url = typeof value === "string" ? value : value && (value.url || value.src);
    return typeof url === "string" ? url.trim() : "";
}

function list(value) {
    return (Array.isArray(value) ? value : txt(value).split(/[,;|]/))
        .map(item => txt(item).trim())
        .filter(Boolean);
}

function title(value) {
    const s = txt(value).trim();
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
}

function txt(value) {
    return value === undefined || value === null ? "" : String(value);
}


// // Wix → Venue page → Page Code
// // URL: /venue?id=VENUE_ID   (from itinerary: &itinerary_id=42&book=1)

// import { getAttractionById } from 'backend/attractions.web';
// import { getItinerary, previewPrice, createBooking } from 'backend/booking.web';
// import wixLocationFrontend from 'wix-location-frontend';
// import { local } from 'wix-storage-frontend';

// const FALLBACK_IMAGE =
//     "https://static.wixstatic.com/media/884307_e2271750386249eb8f1c0fee9582d1ff~mv2.png";

// const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

// let venue = null;
// let images = [];
// let action = null;
// let itineraryId = "";
// let itineraryTravelers = 1;
// let done = false;
// let busy = false;


// /* ================= PAGE READY ================= */

// $w.onReady(async function () {

//     const venueId = txt(wixLocationFrontend.query.id).trim();
//     itineraryId = txt(wixLocationFrontend.query.itinerary_id).trim();

//     if (!venueId) {
//         wixLocationFrontend.to("/attractions");
//         return;
//     }

//     $w("#bookingBox").collapse();
//     $w("#venueThumb1").collapse();
//     $w("#venueThumb2").collapse();
//     $w("#statusMsg").collapse();

//     $w("#backBtn").onClick(() => wixLocationFrontend.to("/attractions"));
//     $w("#venueThumb1").onClick(() => swapImage(1));
//     $w("#venueThumb2").onClick(() => swapImage(2));
//     $w("#travelersInput").onChange(refreshPrice);
//     $w("#continueBtn").onClick(startBooking);
//     $w("#cancelBtn").onClick(() => $w("#bookingBox").collapse());

//     $w("#actionBtn").onClick(() => {
//         if (!action) return;

//         if (action.mode === "link") {
//             wixLocationFrontend.to(action.url);
//         } else if (action.mode === "direct") {
//             openBooking();
//         }
//     });

//     try {
//         const result = await getAttractionById(venueId);

//         if (!result || !result.success || !result.attraction) {
//             showError("This venue could not be found.");
//             return;
//         }

//         venue = result.attraction;
//         console.log("VENUE:", venue);

//         renderVenue(venue);

//         if (wixLocationFrontend.query.book === "1" && action.mode === "direct") {
//             openBooking();
//         }

//     } catch (error) {
//         console.error("LOAD VENUE ERROR:", error);
//         showError("Unable to load this venue. Please try again.");
//     }
// });


// /* ================= SHOW VENUE ================= */

// function renderVenue(v) {

//     // Images: 1 main + up to 2 extra (only if the API sends them)
//     images = [v.image_url, v.image_2_url, v.image_3_url, ...(Array.isArray(v.images) ? v.images : [])]
//         .map(urlOf)
//         .filter((url, i, list) => url && list.indexOf(url) === i)
//         .slice(0, 3);

//     $w("#venueMainImage").src = images[0] || FALLBACK_IMAGE;
//     $w("#venueMainImage").alt = txt(v.name);

//     if (images[1]) {
//         $w("#venueThumb1").src = images[1];
//         $w("#venueThumb1").expand();
//     }

//     if (images[2]) {
//         $w("#venueThumb2").src = images[2];
//         $w("#venueThumb2").expand();
//     }

//     // Category chip, title, location, description
//     $w("#venueCategory").label = title(list(v.type)[0] || list(v.tags)[0]);
//     $w("#venueTitle").text = txt(v.name) || "Venue";
//     $w("#venueDescription").text = txt(v.description || v.short_description).slice(0, 400);

//     $w("#venueLocation").text =
//         [v.area, v.city_name, v.country]
//             .map(txt)
//             .map(s => s.trim())
//             .filter((s, i, all) => s && all.indexOf(s) === i)
//             .join(", ") || "Location not available";

//     // 2-3 highlights
//     const hours = Number(v.duration_hours);
//     const tags = list(v.tags).map(title);

//     const highlights = [
//         tags[0],
//         v.kids_friendly === true ? "Kid friendly" : "",
//         hours > 0 ? `Recommended visit: ${hours} ${hours === 1 ? "hour" : "hours"}` : "",
//         tags[1],
//         tags[2]
//     ].filter(Boolean).slice(0, 3);

//     ["#highlight1", "#highlight2", "#highlight3"].forEach((id, i) => {
//         if (highlights[i]) {
//             $w(id).text = highlights[i];
//             $w(id).expand();
//         } else {
//             $w(id).collapse();
//         }
//     });

//     // Price box
//     $w("#venuePrice").text = priceText(v);

//     // Opening hours box (hidden when there is no data)
//     const hoursText = hoursToText(v.opening_hours);

//     if (hoursText) {
//         $w("#venueHours").text = hoursText;
//         $w("#hoursBox").expand();
//     } else {
//         $w("#hoursBox").collapse();
//     }

//     // One action button:
//     // organic → Visit Site | affiliate_link → Book (affiliate_url) | direct_partner → Book (PlanIT)
//     action = getAction(v);

//     $w("#actionBtn").label = action.label;

//     if (action.mode === "off") {
//         $w("#actionBtn").disable();
//     } else {
//         $w("#actionBtn").enable();
//     }
// }

// function getAction(v) {

//     const type = txt(v.partner_type).trim().toLowerCase();
//     const site = link(v.url);
//     const affiliate = link(v.affiliate_url);

//     if (type === "direct_partner") {
//         if (v.bookability === "bookable") {
//             return { mode: "direct", label: "Book" };
//         }

//         return { mode: "off", label: v.bookability === "comingSoon" ? "Coming Soon" : "Not Available" };
//     }

//     if (type === "affiliate_link" && affiliate) {
//         return { mode: "link", label: "Book", url: affiliate };
//     }

//     if (site) {
//         return { mode: "link", label: "Visit Site", url: site };
//     }

//     return { mode: "off", label: "Not Available" };
// }

// function swapImage(index) {

//     if (!images[index]) return;

//     [images[0], images[index]] = [images[index], images[0]];

//     $w("#venueMainImage").src = images[0];
//     $w("#venueThumb1").src = images[1] || FALLBACK_IMAGE;

//     if (images[2]) {
//         $w("#venueThumb2").src = images[2];
//     }
// }


// /* ================= BOOKING: OPEN + PRICE ================= */

// async function openBooking() {

//     const token = local.getItem("access_token");

//     if (!token) {
//         local.setItem("post_login_redirect", wixLocationFrontend.url);
//         wixLocationFrontend.to("/");
//         return;
//     }

//     if (done) return;

//     msg("");
//     $w("#priceTxt").text = "Checking price...";
//     $w("#continueBtn").disable();

//     await $w("#bookingBox").expand();

//     if (itineraryId) {

//         // Travelers + date/time come from the itinerary
//         const result = await getItinerary(token, itineraryId);

//         if (result.status === 401) return sessionExpired();

//         if (!result.ok || !result.body?.data) {
//             msg(apiMessage(result, "Could not load your itinerary."));
//             return;
//         }

//         itineraryTravelers = Number(result.body.data.number_of_travelers) || 1;

//         $w("#travelersInput").collapse();
//         $w("#dateInput").collapse();
//         $w("#timeInput").collapse();

//         $w("#bookingNote").text =
//             `Booking for ${itineraryTravelers} traveler(s). Date and time come from your itinerary.`;
//         $w("#bookingNote").expand();

//     } else {

//         $w("#bookingNote").collapse();

//         $w("#dateInput").minDate = new Date();

//         if (!$w("#travelersInput").value) $w("#travelersInput").value = "1";
//         if (!$w("#timeInput").value) $w("#timeInput").value = "10:00";
//     }

//     await refreshPrice();
// }

// async function refreshPrice() {

//     const token = local.getItem("access_token");
//     const count = travelerCount();

//     if (!token || !count || !venue) return;

//     $w("#continueBtn").disable();
//     $w("#priceTxt").text = "Checking price...";

//     try {
//         const result = await previewPrice(token, txt(venue.id), count);

//         console.log("PRICE PREVIEW:", result.body);

//         if (result.status === 401) return sessionExpired();

//         const data = result.body?.data ?? result.body ?? {};

//         if (!result.ok || data.can_book !== true) {
//             $w("#priceTxt").text = "";
//             msg(apiMessage(result, "This venue cannot be booked online right now."));
//             return;
//         }

//         // If the API sends cents, divide by 100 (check the console log above).
//         const amount = data.amount_cents != null
//             ? Number(data.amount_cents) / 100
//             : Number(data.amount);

//         $w("#priceTxt").text = Number.isFinite(amount)
//             ? `Total: ${money(amount, data.currency || venue.currency)}`
//             : "";

//         msg("");
//         $w("#continueBtn").enable();

//     } catch (error) {
//         console.error("PRICE PREVIEW ERROR:", error);
//         $w("#priceTxt").text = "";
//         msg("Could not check the price. Please try again.");
//     }
// }


// /* ================= BOOKING: CREATE (pending, no payment yet) ================= */

// async function startBooking() {

//     if (busy || done) return;

//     const token = local.getItem("access_token");

//     if (!token) return sessionExpired();

//     let payload;

//     if (itineraryId) {

//         payload = { experience_id: txt(venue.id), itinerary_id: Number(itineraryId) };

//     } else {

//         const count = travelerCount();
//         const date = $w("#dateInput").value;
//         const time = txt($w("#timeInput").value).trim().slice(0, 5);

//         if (!count) return msg("Please enter 1 to 50 travelers.");
//         if (!date) return msg("Please choose a date.");
//         if (isoDate(date) < isoDate(new Date())) return msg("Please choose a future date.");
//         if (!/^\d{2}:\d{2}$/.test(time)) return msg("Please choose a time.");

//         const problem = closedProblem(date);

//         if (problem) return msg(problem);

//         payload = {
//             experience_id: txt(venue.id),
//             travelers_count: count,
//             scheduled_date: isoDate(date),
//             scheduled_time: time
//         };
//     }

//     busy = true;
//     $w("#continueBtn").disable();
//     msg("Creating your booking...");

//     try {
//         const result = await createBooking(token, payload);

//         console.log("CREATE BOOKING:", result.status, result.body);

//         if (result.status === 401) return sessionExpired();

//         if (!result.ok) {
//             msg(apiMessage(result, "Could not create the booking."));
//             $w("#continueBtn").enable();
//             return;
//         }

//         const booking = result.body?.data?.booking ?? result.body?.data ?? {};
//         const reference = txt(booking.booking_reference);

//         done = true;
//         $w("#continueBtn").collapse();
//         $w("#cancelBtn").collapse();

//         msg(
//             "Your booking has been created" +
//             (reference ? ` (Ref: ${reference})` : "") +
//             ". Online payment will be available soon."
//         );

//     } catch (error) {
//         console.error("START BOOKING ERROR:", error);
//         msg("Something went wrong. Please try again.");
//         $w("#continueBtn").enable();

//     } finally {
//         busy = false;
//     }
// }

// function closedProblem(date) {

//     const day = DAYS[date.getDay()];
//     const open = list(venue.operating_days).map(d => d.toLowerCase());
//     const closed = list(venue.closed_dates).map(d => d.slice(0, 10));

//     if (open.length && !open.includes(day)) {
//         return `This venue is closed on ${title(day)}. Please choose another day.`;
//     }

//     if (closed.includes(isoDate(date))) {
//         return "This venue is closed on the selected date.";
//     }

//     return "";
// }


// /* ================= HELPERS ================= */

// function travelerCount() {

//     if (itineraryId) return itineraryTravelers;

//     const n = Number($w("#travelersInput").value);

//     return Number.isInteger(n) && n >= 1 && n <= 50 ? n : null;
// }

// function priceText(v) {

//     const price = Number(v.price);

//     if (price > 0) {
//         const exact = txt(v.partner_type) === "direct_partner";
//         const each = v.price_per_person === true ? " per person" : "";

//         return `${exact ? "" : "Approx. "}${money(price, v.currency)}${each}`;
//     }

//     return txt(v.price_tier).trim() ? `Price level: ${txt(v.price_tier).trim()}` : "Price on request";
// }

// function hoursToText(value) {

//     let hours = value;

//     if (typeof hours === "string") {
//         try { hours = JSON.parse(hours); } catch (e) { return ""; }
//     }

//     if (!hours || typeof hours !== "object") return "";

//     return DAYS.slice(1).concat(DAYS[0])
//         .filter(day => typeof hours[day] === "string" && hours[day].trim())
//         .map(day => `${title(day.slice(0, 3))}: ${hours[day].trim()}`)
//         .join("\n");
// }

// function money(amount, currency) {

//     const code = txt(currency).toUpperCase() || "EUR";

//     try {
//         return new Intl.NumberFormat("en-US", { style: "currency", currency: code }).format(Number(amount));
//     } catch (e) {
//         return `${code} ${Number(amount).toFixed(2)}`;
//     }
// }

// function sessionExpired() {
//     local.setItem("post_login_redirect", wixLocationFrontend.url);
//     msg("Your session has expired. Please log in again.");
//     setTimeout(() => wixLocationFrontend.to("/"), 1500);
// }

// function apiMessage(result, fallback) {
//     const m = result && result.body && result.body.message;
//     return typeof m === "string" && m.trim() ? m : fallback;
// }

// function msg(text) {
//     $w("#bookingMsg").text = txt(text);
// }

// function showError(text) {
//     $w("#statusMsg").text = text;
//     $w("#statusMsg").expand();
//     $w("#actionBtn").collapse();
// }

// function isoDate(d) {
//     return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
// }

// function link(value) {
//     const url = txt(value).trim();
//     return /^https?:\/\//i.test(url) ? url : "";
// }

// function urlOf(value) {
//     const url = typeof value === "string" ? value : value && (value.url || value.src);
//     return typeof url === "string" ? url.trim() : "";
// }

// function list(value) {
//     return (Array.isArray(value) ? value : txt(value).split(/[,;|]/))
//         .map(item => txt(item).trim())
//         .filter(Boolean);
// }

// function title(value) {
//     const s = txt(value).trim();
//     return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
// }

// function txt(value) {
//     return value === undefined || value === null ? "" : String(value);
// }
