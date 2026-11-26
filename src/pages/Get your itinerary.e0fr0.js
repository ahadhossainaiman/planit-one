
import {
    getExperienceTypes
} from 'backend/itineraryAuth.web';

import {
    getAllCities
} from 'backend/cities.web';

import { local } from 'wix-storage-frontend';
import wixLocationFrontend from 'wix-location-frontend';

let selectedExperienceIds = [];


// ==============================
// Page Ready
// ==============================

$w.onReady(async function () {

    $w("#msgText").hide();

    // Load all cities and select URL city
    await loadCities();

    // Load experience types
    await loadExperiences();

    // Submit button
    $w("#submitBtn").onClick(() => {
        handleGenerateItinerary();
    });

});


// ==============================
// Load All Cities
// ==============================

async function loadCities() {

    try {

        let allCities = [];
        let currentPage = 1;
        const limit = 100;
        let totalPages = 1;

        do {

            const response = await getAllCities(
                currentPage,
                limit
            );

            if (
                !response ||
                response.success !== true ||
                !response.data
            ) {

                throw new Error(
                    "Unable to load cities."
                );

            }

            // Support common API response structures
            const cities =
                response.data.cities ||
                response.data ||
                [];

            if (!Array.isArray(cities)) {
                throw new Error("Invalid cities response.");
            }

            allCities.push(...cities);

            totalPages = Number(
                response.data.pagination?.totalPages ||
                response.data.totalPages ||
                1
            );

            currentPage++;

        } while (currentPage <= totalPages);


        // Format dropdown options

        const cityOptions = allCities
            .filter(city => city && city.name)
            .map(city => ({
                label: city.name,
                value: city.name
            }));


        // Remove duplicate cities

        const uniqueCities = Array.from(
            new Map(
                cityOptions.map(city => [
                    city.value.toLowerCase(),
                    city
                ])
            ).values()
        );


        // Set dropdown options

        $w("#destInputDropdown").options = uniqueCities;


        // Select city from URL

        const queryCity = decodeURIComponent(
            wixLocationFrontend.query.city || ""
        ).trim();

        if (queryCity) {

            const matchedCity = uniqueCities.find(
                city =>
                    city.value.toLowerCase() ===
                    queryCity.toLowerCase()
            );

            if (matchedCity) {

                $w("#destInputDropdown").value =
                    matchedCity.value;

            }

        }

        console.log(
            "Cities loaded:",
            uniqueCities.length
        );

    } catch (error) {

        console.error(
            "Failed to load cities:",
            error
        );

    }

}


// ==============================
// Load Experience Types
// ==============================

async function loadExperiences() {

    try {

        const response = await getExperienceTypes();

        if (
            response &&
            response.success &&
            response.data &&
            Array.isArray(response.data.experience_types)
        ) {

            const tags =
                response.data.experience_types.filter(
                    tag => tag.is_active === 1
                );

            const tagOptions = tags.map(tag => ({
                label: tag.name,
                value: tag.id.toString()
            }));

            $w("#experienceTags").options = tagOptions;

            $w("#experienceTags").onChange((event) => {

                const selectedValues =
                    event.target.value || [];

                selectedExperienceIds =
                    selectedValues.map(
                        id => Number(id)
                    );

                console.log(
                    "Selected experience IDs:",
                    selectedExperienceIds
                );

            });

        }

    } catch (error) {

        console.error(
            "Failed to load experiences:",
            error
        );

    }

}


// ==============================
// Generate Itinerary
// ==============================

async function handleGenerateItinerary() {

    $w("#msgText").hide();

    const destination =
        $w("#destInputDropdown").value;

    const tripName =
        $w("#tripNameInput").value;

    const arrivalDate =
        $w("#arrivalDatePicker").value;

    const arrivalTime =
        $w("#arrivalTimeDropdown").value;

    const departureDate =
        $w("#departureDatePicker").value;

    const departureTime =
        $w("#departureTimeDropdown").value;

    const travelers =
        $w("#travelersInput").value;

    const withKids =
        $w("#kidsDropdown").value;

    const budget =
        $w("#budgetDropdown").value;

    const email =
        $w("#emailInput").value;

    const dietary =
        $w("#dietaryDropdown").value;

    const notes =
        $w("#notesInput").value;


    // Validate Required Fields

    if (
        !destination ||
        !arrivalDate ||
        !arrivalTime ||
        !departureDate ||
        !departureTime ||
        !travelers ||
        !email
    ) {

        showMsg(
            "Please fill in all required fields marked with *",
            false
        );

        return;
    }


    // Validate Email

    const emailRegex =
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(email)) {

        showMsg(
            "Please enter a valid confirmation email.",
            false
        );

        return;
    }


    // Get Authentication Token

    const token =
        local.getItem("access_token");

    if (!token) {

        showMsg(
            "You must be signed in to generate an itinerary.",
            false
        );

        return;
    }


    // Format Time

    const formatTime = (timeValue) => {

        if (!timeValue) {
            return timeValue;
        }

        return String(timeValue)
            .split(".")[0]
            .split(":")
            .slice(0, 2)
            .join(":");

    };


    // Build Payload

    const payload = {

        name:
            tripName ||
            `${destination} Trip`,

        destination:
            destination,

        arrival_date:
            formatDate(arrivalDate),

        departure_date:
            formatDate(departureDate),

        arrival_time:
            formatTime(arrivalTime),

        departure_time:
            formatTime(departureTime),

        number_of_travelers:
            Number(travelers),

        traveling_with_kids:
            String(withKids || "No").toLowerCase() === "yes"
                ? "Yes"
                : "No",

        budget:
            budget || "$$",

        special_requests:
            notes || "",

        dietary_restrictions:
            dietary || "None",

        email:
            email,

        experience_types:
            selectedExperienceIds

    };


    console.log(
        "Itinerary payload:",
        payload
    );


    // Disable Submit Button

    const originalBtnText =
        $w("#submitBtn").label;

    $w("#submitBtn").label =
        "Generating itinerary...";

    $w("#submitBtn").disable();


    // DIRECT API CALL

    try {

        const response = await fetch(
            "https://api.1planit.com/api/v1/itineraries",
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                    "Authorization": `Bearer ${token}`
                },

                body: JSON.stringify(payload)
            }
        );


        console.log(
            "Itinerary API status:",
            response.status
        );


        const responseText =
            await response.text();

        console.log(
            "Itinerary API response:",
            responseText
        );


        if (!response.ok) {

            let errorMessage =
                "Failed to generate itinerary.";

            try {

                const errorData =
                    JSON.parse(responseText);

                errorMessage =
                    errorData.message ||
                    errorData.error ||
                    errorMessage;

            } catch (parseError) {

                if (responseText) {
                    errorMessage = responseText;
                }

            }

            showMsg(errorMessage, false);

            resetBtn(originalBtnText);

            return;
        }


        // SUCCESS RESPONSE

        let data;

        try {

            data = JSON.parse(responseText);

        } catch (parseError) {

            throw new Error(
                "Itinerary API returned invalid JSON."
            );

        }


        console.log(
            "Itinerary created:",
            data
        );


        if (data && data.success) {

            showMsg(
                "Itinerary created successfully! Check your dashboard.",
                true
            );

            $w("#submitBtn").label = "Success!";

            setTimeout(() => {

                wixLocationFrontend.to("/dashboard");

            }, 1500);

        } else {

            showMsg(
                data.message ||
                "Something went wrong.",
                false
            );

            resetBtn(originalBtnText);

        }

    } catch (error) {

        console.error(
            "Generate itinerary error:",
            error
        );

        showMsg(
            error.message ||
            "Failed to generate itinerary.",
            false
        );

        resetBtn(originalBtnText);

    }

}


// ==============================
// Format Date
// ==============================

function formatDate(dateObj) {

    if (!dateObj) {
        return null;
    }

    const d = new Date(dateObj);

    let month = String(d.getMonth() + 1);
    let day = String(d.getDate());

    const year = d.getFullYear();

    if (month.length < 2) {
        month = "0" + month;
    }

    if (day.length < 2) {
        day = "0" + day;
    }

    return `${year}-${month}-${day}`;

}


// ==============================
// Show Message
// ==============================

function showMsg(text, isSuccess) {

    $w("#msgText").text = text;

    $w("#msgText").style.color =
        isSuccess
            ? "#008000"
            : "#FF0000";

    $w("#msgText").show();

}


// ==============================
// Reset Submit Button
// ==============================

function resetBtn(originalText) {

    $w("#submitBtn").label = originalText;

    $w("#submitBtn").enable();

}




// import {
//     getExperienceTypes
// } from 'backend/itineraryAuth.web';

// import { local } from 'wix-storage-frontend';
// import wixLocationFrontend from 'wix-location-frontend';

// let selectedExperienceIds = [];


// // ==============================
// // Page Ready
// // ==============================

// $w.onReady(async function () {

//     $w("#msgText").hide();

//     // Auto-fill destination from URL
//     // Example: /get-your-itinerary?city=Barcelona

//     const query = wixLocationFrontend.query;

//     if (query.city) {
//         $w("#destInputDropdown").value = decodeURIComponent(query.city);
//     }

//     // Load experience types
//     await loadExperiences();

//     // Submit button
//     $w("#submitBtn").onClick(() => {
//         handleGenerateItinerary();
//     });

// });


// // ==============================
// // Load Experience Types
// // ==============================

// async function loadExperiences() {

//     try {

//         const response = await getExperienceTypes();

//         if (
//             response &&
//             response.success &&
//             response.data &&
//             Array.isArray(response.data.experience_types)
//         ) {

//             const tags =
//                 response.data.experience_types.filter(
//                     tag => tag.is_active === 1
//                 );

//             // Format Tags
//             const tagOptions = tags.map(tag => ({
//                 label: tag.name,
//                 value: tag.id.toString()
//             }));

//             // Set Tags
//             $w("#experienceTags").options = tagOptions;

//             // Handle Tag Selection
//             $w("#experienceTags").onChange((event) => {

//                 const selectedValues =
//                     event.target.value || [];

//                 selectedExperienceIds =
//                     selectedValues.map(
//                         id => Number(id)
//                     );

//                 console.log(
//                     "Selected experience IDs:",
//                     selectedExperienceIds
//                 );

//             });
//         }

//     } catch (error) {

//         console.error(
//             "Failed to load experiences:",
//             error
//         );

//     }
// }


// // ==============================
// // Generate Itinerary
// // ==============================

// async function handleGenerateItinerary() {

//     $w("#msgText").hide();

//     // ==============================
//     // Get Form Values
//     // ==============================

//     const destination =
//         $w("#destInput").value;

//     const tripName =
//         $w("#tripNameInput").value;

//     const arrivalDate =
//         $w("#arrivalDatePicker").value;

//     const arrivalTime =
//         $w("#arrivalTimeDropdown").value;

//     const departureDate =
//         $w("#departureDatePicker").value;

//     const departureTime =
//         $w("#departureTimeDropdown").value;

//     const travelers =
//         $w("#travelersInput").value;

//     const withKids =
//         $w("#kidsDropdown").value;

//     const budget =
//         $w("#budgetDropdown").value;

//     const email =
//         $w("#emailInput").value;

//     const dietary =
//         $w("#dietaryDropdown").value;

//     const notes =
//         $w("#notesInput").value;


//     // ==============================
//     // Validate Required Fields
//     // ==============================

//     if (
//         !destination ||
//         !arrivalDate ||
//         !arrivalTime ||
//         !departureDate ||
//         !departureTime ||
//         !travelers ||
//         !email
//     ) {

//         showMsg(
//             "Please fill in all required fields marked with *",
//             false
//         );

//         return;
//     }


//     // ==============================
//     // Validate Email
//     // ==============================

//     const emailRegex =
//         /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

//     if (!emailRegex.test(email)) {

//         showMsg(
//             "Please enter a valid confirmation email.",
//             false
//         );

//         return;
//     }


//     // ==============================
//     // Get Authentication Token
//     // ==============================

//     const token =
//         local.getItem("access_token");

//     if (!token) {

//         showMsg(
//             "You must be signed in to generate an itinerary.",
//             false
//         );

//         return;
//     }


//     // ==============================
//     // Format Time for API
//     // HH:MM or HH:MM:SS
//     // Remove milliseconds
//     // ==============================

//     const formatTime = (timeValue) => {

//         if (!timeValue) {
//             return timeValue;
//         }

//         // Remove milliseconds and keep HH:MM
//         // Examples:
//         // 02:02:00.000 -> 02:02
//         // 02:32:00.000 -> 02:32
//         // 02:02 -> 02:02

//         return String(timeValue)
//             .split(".")[0]
//             .split(":")
//             .slice(0, 2)
//             .join(":");
//     };


//     // ==============================
//     // Build Payload
//     // ==============================

//     const payload = {

//         name:
//             tripName ||
//             `${destination} Trip`,

//         destination:
//             destination,

//         arrival_date:
//             formatDate(arrivalDate),

//         departure_date:
//             formatDate(departureDate),

//         // UPDATED: Send HH:MM without seconds/milliseconds
//         arrival_time:
//             formatTime(arrivalTime),

//         // UPDATED: Send HH:MM without seconds/milliseconds
//         departure_time:
//             formatTime(departureTime),

//         number_of_travelers:
//             Number(travelers),

//         // UPDATED: API expects the strings "Yes" or "No"
//         traveling_with_kids:
//             String(withKids || "No").toLowerCase() === "yes"
//                 ? "Yes"
//                 : "No",

//         budget:
//             budget || "$$",

//         special_requests:
//             notes || "",

//         dietary_restrictions:
//             dietary || "None",

//         email:
//             email,

//         experience_types:
//             selectedExperienceIds
//     };


//     console.log(
//         "Itinerary payload:",
//         payload
//     );


//     // ==============================
//     // Disable Submit Button
//     // ==============================

//     const originalBtnText =
//         $w("#submitBtn").label;

//     $w("#submitBtn").label =
//         "Generating itinerary...";

//     $w("#submitBtn").disable();


//     // ==============================
//     // DIRECT API CALL FROM FRONTEND
//     // ==============================

//     try {

//         const response = await fetch(
//             "https://api.1planit.com/api/v1/itineraries",
//             {
//                 method: "POST",

//                 headers: {
//                     "Content-Type": "application/json",
//                     "Accept": "application/json",
//                     "Authorization": `Bearer ${token}`
//                 },

//                 body: JSON.stringify(payload)
//             }
//         );


//         console.log(
//             "Itinerary API status:",
//             response.status
//         );


//         const responseText =
//             await response.text();

//         console.log(
//             "Itinerary API response:",
//             responseText
//         );


//         // ==============================
//         // API ERROR
//         // ==============================

//         if (!response.ok) {

//             let errorMessage =
//                 "Failed to generate itinerary.";

//             try {

//                 const errorData =
//                     JSON.parse(responseText);

//                 errorMessage =
//                     errorData.message ||
//                     errorData.error ||
//                     errorMessage;

//             } catch (parseError) {

//                 if (responseText) {
//                     errorMessage = responseText;
//                 }
//             }


//             showMsg(
//                 errorMessage,
//                 false
//             );

//             resetBtn(originalBtnText);

//             return;
//         }


//         // ==============================
//         // SUCCESS RESPONSE
//         // ==============================

//         let data;

//         try {

//             data =
//                 JSON.parse(responseText);

//         } catch (parseError) {

//             throw new Error(
//                 "Itinerary API returned invalid JSON."
//             );
//         }


//         console.log(
//             "Itinerary created:",
//             data
//         );


//         if (data && data.success) {

//             showMsg(
//                 "Itinerary created successfully! Check your dashboard.",
//                 true
//             );

//             $w("#submitBtn").label =
//                 "Success!";


//             // Redirect to dashboard
//             setTimeout(() => {

//                 wixLocationFrontend.to(
//                     "/dashboard"
//                 );

//             }, 1500);

//         } else {

//             showMsg(
//                 data.message ||
//                 "Something went wrong.",
//                 false
//             );

//             resetBtn(originalBtnText);
//         }

//     } catch (error) {

//         console.error(
//             "Generate itinerary error:",
//             error
//         );

//         showMsg(
//             error.message ||
//             "Failed to generate itinerary.",
//             false
//         );

//         resetBtn(originalBtnText);
//     }
// }


// // ==============================
// // Format Date
// // YYYY-MM-DD
// // ==============================

// function formatDate(dateObj) {

//     if (!dateObj) {
//         return null;
//     }

//     const d =
//         new Date(dateObj);

//     let month =
//         String(d.getMonth() + 1);

//     let day =
//         String(d.getDate());

//     const year =
//         d.getFullYear();


//     if (month.length < 2) {
//         month = "0" + month;
//     }

//     if (day.length < 2) {
//         day = "0" + day;
//     }


//     return `${year}-${month}-${day}`;
// }


// // ==============================
// // Show Message
// // ==============================

// function showMsg(text, isSuccess) {

//     $w("#msgText").text =
//         text;

//     $w("#msgText").style.color =
//         isSuccess
//             ? "#008000"
//             : "#FF0000";

//     $w("#msgText").show();
// }


// // ==============================
// // Reset Submit Button
// // ==============================

// function resetBtn(originalText) {

//     $w("#submitBtn").label =
//         originalText;

//     $w("#submitBtn").enable();
// }

