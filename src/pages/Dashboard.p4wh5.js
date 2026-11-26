import { local } from 'wix-storage-frontend';
import wixLocationFrontend from 'wix-location-frontend';
import { getCurrentUser } from 'backend/planitAuth.web';

$w.onReady(async function () {

    // ==============================
    // Initial Loading State (clean accordion transition without double-animation glitch)
    // ==============================
    $w("#loadingSection").expand();
    $w("#dataSection").collapse();

    const accessToken = local.getItem("access_token");

    // Redirect to home if not logged in
    if (!accessToken) {
        wixLocationFrontend.to("/");
        return;
    }

    try {
        // Fetch user profile from /me endpoint
        const response = await getCurrentUser(accessToken);

        if (response.success && response.data && response.data.user) {
            const user = response.data.user;

            $w("#welcomeText").text = `Welcome, ${user.first_name} ${user.last_name}!`;
            $w("#emailText").text = user.email;

            if (user.email_verified === 1) {
                $w("#statusText").text = "Verified Account";
                $w("#statusText").style.color = "#008000";
            }

            // Data Loaded Successfully (clean transition without glitch)
            $w("#loadingSection").collapse();
            $w("#dataSection").expand();
        }

    } catch (error) {
        console.error("Failed to fetch user profile:", error);
    }

    // ==============================
    // Logout Button Action & Styling
    // ==============================
    applyLogoutButtonStyles();

    $w("#logoutButton").onClick(() => {
        local.removeItem("access_token");
        local.removeItem("refresh_token");
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

            // Handle date
            const dateStr = formatTripDates(itemData.scheduled_date, itemData.scheduled_date).split(' – ')[0];
            $item("#datesTxt").text = `Date: ${dateStr}`;

            // Cost calculation (API sends amount in cents)
            const cost = itemData.amount_cents ? (itemData.amount_cents / 100) : 0;
            $item("#costTxt").text = `Total: ${formatCurrency(cost, itemData.currency)}`;

            $item("#viewStopsBtn").label = "View Booking";
            $item("#viewStopsBtn").onClick(() => {
                console.log("View Booking clicked for:", itemData.id);
            });

        } else {
            // --- ITINERARY DATA MAPPING ---
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

    // Also support myBookingRepeater if rendered separately in the editor
    try {
        if ($w("#myBookingRepeater")) {
            $w("#myBookingRepeater").onItemReady(($item, itemData, index) => {
                $item("#titleTxt").text = itemData.metadata?.venue_name || "Unknown Venue";
                $item("#destTxt").text = `City: ${itemData.metadata?.city || "Unknown City"}`;
                $item("#statusTxt").text = `${itemData.customer_status ? itemData.customer_status.toUpperCase() : "PENDING"}`;
                $item("#travelersTxt").text = `Travelers: ${itemData.travelers_count || 1}`;
                $item("#stopsTxt").text = `Time: ${itemData.scheduled_time || "N/A"}`;
                $item("#budgetTxt").text = `Ref: ${itemData.booking_reference || "N/A"}`;
                const dateStr = formatTripDates(itemData.scheduled_date, itemData.scheduled_date).split(' – ')[0];
                $item("#datesTxt").text = `Date: ${dateStr}`;
                const cost = itemData.amount_cents ? (itemData.amount_cents / 100) : 0;
                $item("#costTxt").text = `Total: ${formatCurrency(cost, itemData.currency)}`;
            });
        }
    } catch (e) {
        // Element not separate in editor
    }

    // Initial Load - Itinerary data
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
            // Update itineraryRepeater (which renders both tabs) and myBookingRepeater if separate
            $w("#itineraryRepeater").data = formattedData;
            try {
                if ($w("#myBookingRepeater")) {
                    $w("#myBookingRepeater").data = formattedData;
                }
            } catch (e) {}
        } else {
            $w("#itineraryRepeater").data = [];
            try {
                if ($w("#myBookingRepeater")) {
                    $w("#myBookingRepeater").data = [];
                }
            } catch (e) {}
        }
    } catch (error) {
        console.error("Error loading bookings:", error);
        $w("#itineraryRepeater").data = [];
    }
}

// ========================================
// Styling & Helpers
// ========================================

function applyLogoutButtonStyles() {
    try {
        // Tame prominent harsh red appearance to a clean, elegant secondary action button
        if ($w("#logoutButton").style) {
            $w("#logoutButton").style.backgroundColor = "#F3F4F6";
            $w("#logoutButton").style.color = "#374151";
            $w("#logoutButton").style.borderColor = "#D1D5DB";
            $w("#logoutButton").style.borderWidth = "1px";
            $w("#logoutButton").style.borderRadius = "8px";
        }
    } catch (err) {
        // Fallback gracefully if style API is restricted
    }
}

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
