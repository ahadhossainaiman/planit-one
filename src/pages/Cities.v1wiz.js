import { getAllCities } from 'backend/cities.web';
import wixLocationFrontend from 'wix-location-frontend';


// ==============================
// Pagination Settings
// ==============================

let currentPage = 1;
const itemsPerPage = 20;


// ==============================
// Store Current Page Cities
// ==============================

let allCities = [];


// ==============================
// Page Ready
// ==============================

$w.onReady(async function () {


    // ==============================
    // Repeater Item Setup
    // ==============================

    $w("#citiesRepeater").onItemReady(
        ($item, itemData, index) => {


            // ==============================
            // City Title
            // ==============================

            $item("#cityTitle").text =
                itemData.title ||
                itemData.name ||
                "";


            // ==============================
            // City Image
            // ==============================

            if (itemData.image_url) {

                $item("#cityImage").src =
                    itemData.image_url;

                $item("#cityImage").alt =
                    itemData.title ||
                    itemData.name ||
                    "";
            }


            // ==============================
            // Explore Button
            // ==============================

            $item("#exploreBtn").onClick(() => {

                const cityName =
                    itemData.name ||
                    itemData.title ||
                    "";


                if (!cityName) {
                    return;
                }


                const cityPath =
                    cityName
                        .trim()
                        .replace(/\s+/g, "-");


                wixLocationFrontend.to(
                    `/attractions?city=${cityPath}`
                );

            });


            // ==============================
            // Plan Trip Button
            // ==============================

            $item("#planTripBtn").onClick(() => {

                const cityName =
                    itemData.name ||
                    itemData.title ||
                    "";


                if (!cityName) {
                    return;
                }


                const encodedCityName =
                    encodeURIComponent(cityName);


                wixLocationFrontend.to(
                    `/get-your-itinerary?city=${encodedCityName}`
                );

            });

        }
    );


    // ==============================
    // LIVE SEARCH
    // ==============================

    $w("#searchInput").onInput(() => {

        const searchValue =
            $w("#searchInput").value
                .trim()
                .toLowerCase();


        // ==============================
        // If Search Is Empty
        // ==============================

        if (!searchValue) {

            $w("#citiesRepeater").data =
                allCities;

            return;
        }


        // ==============================
        // Filter Cities
        // ==============================

        const filteredCities =
            allCities.filter((city) => {

                const cityName =
                    (
                        city.name ||
                        city.title ||
                        ""
                    )
                    .toString()
                    .toLowerCase();


                return cityName.includes(
                    searchValue
                );

            });


        // ==============================
        // Show Search Results
        // ==============================

        // $w("#citiesRepeater").data =
        //     filteredCities;

        // // ==============================
        // // Search Result Message
        // // ==============================

        // if (filteredCities.length === 0) {

        //     $w("#pageInfoTxt").text =
        //         "No cities found";

        // } else {

        //     $w("#pageInfoTxt").text =
        //         `${filteredCities.length} cities found`;

        // }

    });


    // ==============================
    // Previous Button
    // ==============================

    $w("#prevBtn").onClick(() => {

        if (currentPage > 1) {

            currentPage--;

            loadCities();

        }

    });


    // ==============================
    // Next Button
    // ==============================

    $w("#nextBtn").onClick(() => {

        currentPage++;

        loadCities();

    });


    // ==============================
    // Initial Load
    // ==============================

    await loadCities();

});


// ==============================
// Load Cities
// ==============================

async function loadCities() {

    try {


        // ==============================
        // Disable Pagination While Loading
        // ==============================

        $w("#prevBtn").disable();

        $w("#nextBtn").disable();

        $w("#pageInfoTxt").text =
            "Loading...";


        // ==============================
        // Get Cities From Backend
        // ==============================

        const response =
            await getAllCities(
                currentPage,
                itemsPerPage
            );


        console.log(
            "Cities response:",
            response
        );


        // ==============================
        // Validate API Response
        // ==============================

        if (
            response &&
            response.success &&
            response.data &&
            Array.isArray(
                response.data.cities
            )
        ) {


            const citiesData =
                response.data.cities;


            const pagination =
                response.data.pagination;


            // ==============================
            // Create Repeater Data
            // ==============================

            const formattedCities =
                citiesData.map(
                    (city, index) => ({

                        ...city,

                        _id:
                            city._id ||
                            city.id ||
                            `city-${currentPage}-${index}`

                    })
                );


            // ==============================
            // Store Current Page Cities
            // ==============================

            allCities =
                formattedCities;


            // ==============================
            // Set Repeater Data
            // ==============================

            $w("#citiesRepeater").data =
                formattedCities;


            // ==============================
            // Pagination
            // ==============================

            if (pagination) {


                currentPage =
                    pagination.page;


                // Page Info

                $w("#pageInfoTxt").text =
                    `Page ${pagination.page} of ${pagination.totalPages}`;


                // ==============================
                // Previous Button
                // ==============================

                if (
                    pagination.hasPreviousPage
                ) {

                    $w("#prevBtn").enable();

                } else {

                    $w("#prevBtn").disable();

                }


                // ==============================
                // Next Button
                // ==============================

                if (
                    pagination.hasNextPage
                ) {

                    $w("#nextBtn").enable();

                } else {

                    $w("#nextBtn").disable();

                }

            } else {


                $w("#pageInfoTxt").text =
                    `Page ${currentPage}`;


            }


        } else {


            console.error(
                "No cities found in response:",
                response
            );


            allCities = [];

            $w("#citiesRepeater").data = [];

            $w("#pageInfoTxt").text =
                "No cities found";

        }


    } catch (error) {


        console.error(
            "Error fetching cities data:",
            error
        );


        allCities = [];

        $w("#citiesRepeater").data = [];

        $w("#pageInfoTxt").text =
            "Error loading cities";


    }

}