
import wixData from "wix-data";
import { getAllCities } from "backend/cities.web";


// ==============================
// PAGE READY
// ==============================

$w.onReady(async () => {

    $w("#createPartnerBtn").onClick(savePartner);

    await loadCities();

});


// ==============================
// LOAD CITIES IN DROPDOWN
// ==============================

async function loadCities() {

    try {

        $w("#city").disable();

        $w("#city").options = [
            { label: "Loading cities...", value: "" }
        ];

        const response = await getAllCities(1, 20);

        console.log("Cities API Response:", response);


        // Extract cities from API response

        let cities = [];

        if (Array.isArray(response)) {

            cities = response;

        } else if (Array.isArray(response.data)) {

            cities = response.data;

        } else if (Array.isArray(response.cities)) {

            cities = response.cities;

        } else if (Array.isArray(response.results)) {

            cities = response.results;

        } else if (Array.isArray(response.data?.cities)) {

            cities = response.data.cities;

        }


        // Create dropdown options

        const cityOptions = cities
            .map(city => {

                const cityName =
                    city.name ||
                    city.city_name ||
                    city.city ||
                    city.title;

                if (!cityName) return null;

                return {
                    label: String(cityName),
                    value: String(cityName)
                };

            })
            .filter(Boolean);


        // Remove duplicate cities

        const uniqueCities = [
            ...new Map(
                cityOptions.map(city => [
                    city.value.toLowerCase(),
                    city
                ])
            ).values()
        ];


        // Sort cities alphabetically

        uniqueCities.sort((a, b) =>
            a.label.localeCompare(b.label)
        );


        // Populate dropdown

        $w("#city").options = [
            {
                label: "Select City",
                value: ""
            },
            ...uniqueCities
        ];


        console.log("Loaded cities:", uniqueCities);


        if (uniqueCities.length === 0) {

            console.error("No cities found in API response.");

            $w("#city").options = [
                {
                    label: "No cities available",
                    value: ""
                }
            ];

        }

    } catch (error) {

        console.error("Load Cities Error:", error);

        $w("#city").options = [
            {
                label: "Unable to load cities",
                value: ""
            }
        ];

    } finally {

        $w("#city").enable();

    }

}


// ==============================
// SAVE PARTNER
// ==============================

async function savePartner() {

    const item = {

        title: ($w("#businessName").value || "").trim(),

        partnerId: makePartnerId(),

        businessName: ($w("#businessName").value || "").trim(),

        contactName: ($w("#contactName").value || "").trim(),

        email: ($w("#email").value || "").trim(),

        phone: ($w("#phone").value || "").trim(),

        bookingUrl: ($w("#bookingUrl").value || "").trim(),

        city: $w("#city").value,

        description: ($w("#description").value || "").trim(),

        status: "pending",

        createdAt: new Date()

    };


    // Required validation

    if (!item.businessName || !item.contactName || !item.email) {

        showMsg(
            "Please fill Business Name, Contact Person, and Email."
        );

        return;

    }


    $w("#createPartnerBtn").disable();


    try {

        await wixData.insert("Partners", item);


        // Clear form

        $w("#businessName").value = "";

        $w("#contactName").value = "";

        $w("#email").value = "";

        $w("#phone").value = "";

        $w("#bookingUrl").value = "";

        $w("#city").value = "";

        $w("#description").value = "";


        showMsg(
            "Thanks — we received your details. We’ll get back to you shortly."
        );


    } catch (err) {

        console.error("Partner Save Error:", err);

        showMsg(
            "Something went wrong. Please try again."
        );

    } finally {

        $w("#createPartnerBtn").enable();

    }

}


// ==============================
// SHOW MESSAGE
// ==============================

function showMsg(text) {

    $w("#messageText").text = text;

    $w("#messageText").show();

}


// ==============================
// GENERATE PARTNER ID
// ==============================

function makePartnerId() {

    return "P-" +
        Date.now().toString(36).toUpperCase() +
        "-" +
        Math.random().toString(36).slice(2, 6).toUpperCase();

}



// import wixData from "wix-data";

// $w.onReady(() => {
//     $w("#createPartnerBtn").onClick(savePartner);
// });

// async function savePartner() {
//     const item = {
//         title: ($w("#businessName").value || "").trim(),
//         partnerId: makePartnerId(),
//         businessName: ($w("#businessName").value || "").trim(),
//         contactName: ($w("#contactName").value || "").trim(),
//         email: ($w("#email").value || "").trim(),
//         phone: ($w("#phone").value || "").trim(),
//         bookingUrl: ($w("#bookingUrl").value || "").trim(),
//         city: $w("#city").value,
//         description: ($w("#description").value || "").trim(),
//         status: "pending",
//         createdAt: new Date()
//     };

//     if (!item.businessName || !item.contactName || !item.email) {
//         showMsg("Please fill Business Name, Contact Person, and Email.");
//         return;
//     }

//     $w("#createPartnerBtn").disable();

//     try {
//         await wixData.insert("Partners", item);

//         // Clear all form inputs after successful submission
//         $w("#businessName").value = "";
//         $w("#contactName").value = "";
//         $w("#email").value = "";
//         $w("#phone").value = "";
//         $w("#bookingUrl").value = "";
//         $w("#city").value = "";
//         $w("#description").value = "";

//         showMsg("Thanks — we received your details. We’ll get back to you shortly.");
//         $w("#createPartnerBtn").enable();

//     } catch (err) {
//         console.error(err);
//         showMsg("Something went wrong. Please try again.");
//         $w("#createPartnerBtn").enable();
//     }
// }

// function showMsg(text) {
//     $w("#messageText").text = text;
//     $w("#messageText").show();
// }

// function makePartnerId() {
//     return "P-" + Date.now().toString(36).toUpperCase() + "-" +
//         Math.random().toString(36).slice(2, 6).toUpperCase();
// }

