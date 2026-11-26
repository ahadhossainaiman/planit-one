import { local } from 'wix-storage-frontend';
import wixLocationFrontend from 'wix-location-frontend';
import { getCurrentUser } from 'backend/planitAuth.web';

$w.onReady(async function () {

    // ==============================
    // Initial Loading State
    // ==============================
    $w("#loadingSection").show();
    $w("#loadingSection").expand();

    $w("#dataSection").hide();
    $w("#dataSection").collapse();

    const accessToken = local.getItem("access_token");

    // ইউজার লগইন না থাকলে সরাসরি হোমপেজে পাঠিয়ে দেবে
    if (!accessToken) {
        wixLocationFrontend.to("/");
        return;
    }

    try {
        // /me API কল করে প্রোফাইল ডেটা আনা
        const response = await getCurrentUser(accessToken);

        if (response.success && response.data && response.data.user) {
            const user = response.data.user;

            // UI-তে ডেটা শো করা
            $w("#welcomeText").text = `Welcome, ${user.first_name} ${user.last_name}!`;
            $w("#emailText").text = user.email;

            // ভেরিফাইড কি না তা চেক করে শো করানো
            if (user.email_verified === 1) {
                $w("#statusText").text = "Verified Account";
                $w("#statusText").style.color = "#008000";
            }

            // ==============================
            // Data Loaded Successfully
            // ==============================
            $w("#loadingSection").hide();
            $w("#loadingSection").collapse();

            $w("#dataSection").show();
            $w("#dataSection").expand();
        }

    } catch (error) {
        console.error("Failed to fetch user profile:", error);
    }

    // ==============================
    // Logout Button Action
    // ==============================
    $w("#logoutButton").onClick(() => {
        // স্টোরেজ থেকে টোকেন মুছে ফেলা
        local.removeItem("access_token");
        local.removeItem("refresh_token");

        // সাথে সাথে হোমপেজে রিডাইরেক্ট করা
        wixLocationFrontend.to("/");
    });

    // ==============================
    // Tab Element Action 
    // ==============================
    $w("#tabs1").onChange(async (event) => {
        const selectedTab = $w("#tabs1").currentTab.label;
        
        if (selectedTab === "My Bookings") {
            await loadBookings(accessToken);
        } else {
            await loadItineraries(accessToken);
        }
    });

    // ==============================
    // REPEATER SETUP (Handles both)
    // ==============================
    $w("#itineraryRepeater").onItemReady(($item, itemData, index) => {

        if (itemData.isBooking) {
            // --- BOOKING DATA MAPPING ---
            $item("#titleTxt").text = itemData.metadata?.venue_name || "Unknown Venue";
            $item("#destTxt").text = `City: ${itemData.metadata?.city || "Unknown City"}`;
            $item("#statusTxt").text = `${itemData.customer_status ? itemData.customer_status.toUpperCase() : "PENDING"}`;
            $item("#travelersTxt").text = `Travelers: ${itemData.travelers_count || 1}`;
            
            // Reusing stops & budget texts for booking time and reference
            $item("#stopsTxt").text = `Time: ${itemData.scheduled_time || "N/A"}`;
            $item("#budgetTxt").text = `Ref: ${itemData.booking_reference || "N/A"}`;

            // Handle date (Show only one date instead of a range)
            const dateStr = formatTripDates(itemData.scheduled_date, itemData.scheduled_date).split(' – ')[0];
            $item("#datesTxt").text = `Date: ${dateStr}`;

            // Cost calculation (API sends amount in cents)
            const cost = itemData.amount_cents ? (itemData.amount_cents / 100) : 0;
            $item("#costTxt").text = `Total: ${formatCurrency(cost, itemData.currency)}`;

            $item("#viewStopsBtn").label = "View Booking";
            $item("#viewStopsBtn").onClick(() => {
                // Booking details page e pathate chaile path update korun
                console.log("View Booking clicked for:", itemData.id);
            });

        } else {
            // --- ORIGINAL ITINERARY DATA MAPPING ---
            $item("#titleTxt").text = itemData.name || "Untitled Trip";
            $item("#destTxt").text = `Destination: ${itemData.destination || "Unknown Destination"}`;
            $item("#statusTxt").text = `${itemData.status ? itemData.status.toUpperCase() : "DRAFT"}`;
            $item("#travelersTxt").text = `Travelers: ${itemData.number_of_travelers || 1}`;
            $item("#stopsTxt").text = `Stops: ${itemData.attraction_count || 0}`;
            $item("#budgetTxt").text = `Budget: ${itemData.budget || "$0"}`;
            $item("#datesTxt").text = `Date: ${formatTripDates(itemData.arrival_date, itemData.departure_date)}`;
            $item("#costTxt").text = `Est. Cost: ${formatCurrency(itemData.total_cost, itemData.currency)}`;

            $item("#viewStopsBtn").label = "View Stops";
            $item("#viewStopsBtn").onClick(() => {
                wixLocationFrontend.to(`/itinerary-details?id=${itemData.id}`);
            });
        }
    });

    // Initial Load - API থেকে itinerary data load করা
    await loadItineraries(accessToken);
});

// ========================================
// Load Itineraries
// ========================================
async function loadItineraries(token) {
    try {
        const response = await fetch(
            "https://api.1planit.com/api/v1/itineraries",
            {
                method: "GET",
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "application/json"
                }
            }
        );

        if (!response.ok) {
            throw new Error(`Itineraries API failed: ${response.status}`);
        }

        const result = await response.json();

        if (result.success && result.data && Array.isArray(result.data.itineraries)) {
            const formattedData = result.data.itineraries.map((item) => ({
                ...item,
                _id: String(item.id),
                isBooking: false 
            }));
            $w("#itineraryRepeater").data = formattedData;
        } else {
            $w("#itineraryRepeater").data = [];
        }
    } catch (error) {
        console.error("Error loading itineraries:", error);
        $w("#itineraryRepeater").data = [];
    }
}

// ========================================
// Load Bookings 
// ========================================
async function loadBookings(token) {
    try {
        const response = await fetch(
            "https://api.1planit.com/api/v1/bookings?category=upcoming&limit=20",
            {
                method: "GET",
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "application/json"
                }
            }
        );

        if (!response.ok) {
            throw new Error(`Bookings API failed: ${response.status}`);
        }

        const result = await response.json();

        if (result.success && result.data && Array.isArray(result.data.bookings)) {
            const formattedData = result.data.bookings.map((item) => ({
                ...item,
                _id: String(item.id),
                isBooking: true 
            }));
            $w("#myBookingRepeater").data = formattedData;
        } else {
            $w("#myBookingRepeater").data = [];
        }
    } catch (error) {
        console.error("Error loading bookings:", error);
        $w("#myBookingRepeater").data = [];
    }
}

// ========================================
// Helpers
// ========================================

function formatTripDates(arrival, departure) {
    if (!arrival || !departure) {
        return "Dates TBD";
    }

    const arrivalDate = new Date(arrival);
    const departureDate = new Date(departure);

    const months = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
    ];

    const arrDate =
        `${months[arrivalDate.getMonth()]} ` +
        `${arrivalDate.getDate()}, ` +
        `${arrivalDate.getFullYear()}`;

    const depDate =
        `${months[departureDate.getMonth()]} ` +
        `${departureDate.getDate()}, ` +
        `${departureDate.getFullYear()}`;

    return `${arrDate} – ${depDate}`;
}

function formatCurrency(amount, currencyCode) {
    const value = amount ? Number(amount) : 0;
    const code = currencyCode || "USD";

    try {
        return new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: code
        }).format(value);
    } catch (error) {
        return `${code} ${value.toFixed(2)}`;
    }
}





// import { local } from 'wix-storage-frontend';
// import wixLocationFrontend from 'wix-location-frontend';
// import { getCurrentUser } from 'backend/planitAuth.web';


// $w.onReady(async function () {

//     // ==============================
//     // Initial Loading State
//     // ==============================
//     $w("#loadingSection").show();
//     $w("#loadingSection").expand();

//     $w("#dataSection").hide();
//     $w("#dataSection").collapse();


//     const accessToken = local.getItem("access_token");

//     // ইউজার লগইন না থাকলে সরাসরি হোমপেজে পাঠিয়ে দেবে
//     if (!accessToken) {
//         wixLocationFrontend.to("/");
//         return;
//     }

//     try {
//         // /me API কল করে প্রোফাইল ডেটা আনা
//         const response = await getCurrentUser(accessToken);

//         if (response.success && response.data && response.data.user) {
//             const user = response.data.user;

//             // UI-তে ডেটা শো করা
//             $w("#welcomeText").text = `Welcome, ${user.first_name} ${user.last_name}!`;
//             $w("#emailText").text = user.email;

//             // ভেরিফাইড কি না তা চেক করে শো করানো
//             if (user.email_verified === 1) {
//                 $w("#statusText").text = "Verified Account";
//                 $w("#statusText").style.color = "#008000";
//             }

//             // ==============================
//             // Data Loaded Successfully
//             // ==============================
//             $w("#loadingSection").hide();
//             $w("#loadingSection").collapse();

//             $w("#dataSection").show();
//             $w("#dataSection").expand();
//         }

//     } catch (error) {
//         console.error("Failed to fetch user profile:", error);
//     }


//     // ==============================
//     // Logout Button Action
//     // ==============================
//     $w("#logoutButton").onClick(() => {

//         // স্টোরেজ থেকে টোকেন মুছে ফেলা
//         local.removeItem("access_token");
//         local.removeItem("refresh_token");

//         // সাথে সাথে হোমপেজে রিডাইরেক্ট করা
//         wixLocationFrontend.to("/");
//     });


//     // ==============================
//     // ITINERARIES
//     // ==============================

//     // Repeater item setup
//     $w("#itineraryRepeater").onItemReady(($item, itemData, index) => {

//         // ==============================
//         // 1. Basic text data
//         // ==============================

//         $item("#titleTxt").text =
//             itemData.name || "Untitled Trip";


//         $item("#destTxt").text =
//             `Destination: ${
//                 itemData.destination || "Unknown Destination"
//             }`;


//         $item("#statusTxt").text =
//             `${
//                 itemData.status
//                     ? itemData.status.toUpperCase()
//                     : "DRAFT"
//             }`;


//         $item("#travelersTxt").text =
//             `Travelers: ${
//                 itemData.number_of_travelers || 1
//             }`;


//         $item("#stopsTxt").text =
//             `Stops: ${
//                 itemData.attraction_count || 0
//             }`;


//         $item("#budgetTxt").text =
//             `Budget: ${
//                 itemData.budget || "$0"
//             }`;


//         // ==============================
//         // 2. Date formatting
//         // ==============================

//         $item("#datesTxt").text =
//             `Date: ${formatTripDates(
//                 itemData.arrival_date,
//                 itemData.departure_date
//             )}`;


//         // ==============================
//         // 3. Currency and cost formatting
//         // ==============================

//         $item("#costTxt").text =
//             `Est. Cost: ${formatCurrency(
//                 itemData.total_cost,
//                 itemData.currency
//             )}`;


//         // ==============================
//         // 4. View Stops Button
//         // ==============================

//         $item("#viewStopsBtn").onClick(() => {

//             wixLocationFrontend.to(
//                 `/itinerary-details?id=${itemData.id}`
//             );

//         });

//     });




//     // API থেকে itinerary data load করা
//     await loadItineraries(accessToken);

// });


// // ========================================
// // Load Itineraries
// // ========================================

// async function loadItineraries(token) {
//     try {
//         const response = await fetch(
//             "https://api.1planit.com/api/v1/itineraries",
//             {
//                 method: "GET",
//                 headers: {
//                     "Authorization": `Bearer ${token}`,
//                     "Content-Type": "application/json"
//                 }
//             }
//         );

//         if (!response.ok) {
//             throw new Error(
//                 `Itineraries API failed: ${response.status}`
//             );
//         }

//         const result = await response.json();

//         if (
//             result.success &&
//             result.data &&
//             Array.isArray(result.data.itineraries)
//         ) {
//             const formattedData = result.data.itineraries.map((item) => ({
//                 ...item,
//                 _id: String(item.id)
//             }));

//             $w("#itineraryRepeater").data = formattedData;

//         } else {
//             $w("#itineraryRepeater").data = [];
//         }

//     } catch (error) {
//         console.error("Error loading itineraries:", error);
//         $w("#itineraryRepeater").data = [];
//     }
// }



// // ========================================
// // Helpers
// // ========================================


// // Date formatting
// // Example:
// // Oct 4, 2026 – Oct 6, 2026

// function formatTripDates(arrival, departure) {
//     if (!arrival || !departure) {
//         return "Dates TBD";
//     }

//     const arrivalDate = new Date(arrival);
//     const departureDate = new Date(departure);

//     const months = [
//         "Jan", "Feb", "Mar", "Apr", "May", "Jun",
//         "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
//     ];

//     const arrDate =
//         `${months[arrivalDate.getMonth()]} ` +
//         `${arrivalDate.getDate()}, ` +
//         `${arrivalDate.getFullYear()}`;

//     const depDate =
//         `${months[departureDate.getMonth()]} ` +
//         `${departureDate.getDate()}, ` +
//         `${departureDate.getFullYear()}`;

//     return `${arrDate} – ${depDate}`;
// }


// // ========================================
// // Currency Formatting
// // ========================================

// // Example:
// // $7,000.00
// // HUF 7,000.00

// function formatCurrency(amount, currencyCode) {

//     const value = amount ? Number(amount) : 0;
//     const code = currencyCode || "USD";

//     try {

//         return new Intl.NumberFormat("en-US", {
//             style: "currency",
//             currency: code
//         }).format(value);

//     } catch (error) {

//         // Unsupported currency হলে fallback
//         return `${code} ${value.toFixed(2)}`;

//     }

// }

