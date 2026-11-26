// Wix → Attractions page → Page Code  (REPLACE the whole file)

import { getAttractions } from 'backend/attractions.web';
import wixLocationFrontend from 'wix-location-frontend';

const ITEMS_PER_PAGE = 24;          // divisible by 2, 3 and 4 columns
const PARALLEL_REQUESTS = 3;
const SEARCH_DELAY = 250;
const DESCRIPTION_LIMIT = 50;

const FALLBACK_IMAGE =
    "https://static.wixstatic.com/media/884307_e2271750386249eb8f1c0fee9582d1ff~mv2.png";

let currentPage = 1;
let allAttractions = [];
let filteredAttractions = [];

let selectedCity = "";
let selectedCategory = "";
let searchText = "";

let isLoading = true;
let loadFailed = false;
let searchTimer;

const seenIds = new Set();


/* ==================================================
   PAGE READY
================================================== */

$w.onReady(async function () {

    $w("#attractionsRepeater").onItemReady(renderAttraction);
    $w("#attractionsRepeater").data = [];

    $w("#cityDropdown").options = [{ label: "All Cities", value: "" }];
    $w("#cityDropdown").value = "";

    $w("#categoryDropdown").options = [{ label: "All Categories", value: "" }];
    $w("#categoryDropdown").value = "";

    $w("#prevBtn").disable();
    $w("#nextBtn").disable();

    // ?city=Paris  /  ?category=Museum  (from the Cities page)
    selectedCity = normalizeText(wixLocationFrontend.query.city || "");
    selectedCategory = normalizeText(wixLocationFrontend.query.category || "");

    bindEvents();

    await loadAttractions();
});


/* ==================================================
   EVENTS
================================================== */

function bindEvents() {

    $w("#searchInput").onInput(() => {
        searchText = normalizeText($w("#searchInput").value);

        clearTimeout(searchTimer);

        searchTimer = setTimeout(() => {
            applyFilters(true);
        }, SEARCH_DELAY);
    });

    $w("#cityDropdown").onChange(() => {
        selectedCity = $w("#cityDropdown").value || "";
        applyFilters(true);
    });

    $w("#categoryDropdown").onChange(() => {
        selectedCategory = $w("#categoryDropdown").value || "";
        applyFilters(true);
    });

    $w("#prevBtn").onClick(() => {
        if (currentPage > 1) {
            currentPage--;
            displayCurrentPage();
            scrollToTopOfList();
        }
    });

    $w("#nextBtn").onClick(() => {
        const totalPages = Math.ceil(filteredAttractions.length / ITEMS_PER_PAGE);

        if (currentPage < totalPages) {
            currentPage++;
            displayCurrentPage();
            scrollToTopOfList();
        }
    });
}

function scrollToTopOfList() {
    $w("#searchInput").scrollTo();
}


/* ==================================================
   LOAD ATTRACTIONS
================================================== */

async function loadAttractions() {

    isLoading = true;
    loadFailed = false;

    allAttractions = [];
    filteredAttractions = [];
    seenIds.clear();

    displayCurrentPage();

    try {

        const firstPage = await fetchPage(1);

        appendAttractions(firstPage.attractions, 1);
        refreshResults();

        for (
            let startPage = 2;
            startPage <= firstPage.totalPages;
            startPage += PARALLEL_REQUESTS
        ) {

            const pages = [];

            for (
                let page = startPage;
                page < startPage + PARALLEL_REQUESTS &&
                page <= firstPage.totalPages;
                page++
            ) {
                pages.push(page);
            }

            const results = await Promise.allSettled(
                pages.map(page => fetchPage(page))
            );

            results.forEach((result, index) => {
                if (result.status === "fulfilled") {
                    appendAttractions(result.value.attractions, pages[index]);
                } else {
                    loadFailed = true;
                    console.error("Attraction page failed:", pages[index], result.reason);
                }
            });

            refreshResults();
        }

    } catch (error) {

        loadFailed = true;
        console.error("Attractions loading failed:", error);

    } finally {

        isLoading = false;

        // Final refresh: now it is safe to validate ?city= / ?category=
        refreshResults();
    }
}

async function fetchPage(page) {

    const response = await getAttractions(page, ITEMS_PER_PAGE);

    if (
        !response ||
        response.success !== true ||
        !response.data ||
        !Array.isArray(response.data.attractions)
    ) {
        throw new Error(`Invalid response for page ${page}`);
    }

    const totalPages = Number(response.data.pagination?.totalPages ?? 1);

    if (!Number.isSafeInteger(totalPages) || totalPages < 1) {
        throw new Error("Invalid totalPages.");
    }

    return { attractions: response.data.attractions, totalPages };
}


/* ==================================================
   NORMALIZE DATA
================================================== */

function appendAttractions(items, page) {

    items.forEach((item, index) => {

        if (!item || typeof item !== "object") {
            return;
        }

        const sourceId = toText(item.id).trim();

        const identity = sourceId
            ? `api-${sourceId}`
            : `page-${page}-item-${index}`;

        if (seenIds.has(identity)) {
            return;
        }

        seenIds.add(identity);

        const tags = normalizeTags(item.tags);
        const categories = normalizeTags(item.type);

        allAttractions.push({
            ...item,
            _id: createRepeaterId(identity),
            _cityKey: normalizeText(item.city_name),
            _tags: tags,
            _categories: categories,
            _searchText: [
                item.name,
                item.city_name,
                item.description,
                tags.join(" "),
                categories.join(" ")
            ]
                .map(toText)
                .join(" ")
                .toLowerCase()
        });
    });
}

function refreshResults() {
    updateCityDropdown();
    updateCategoryDropdown();
    applyFilters(false);
}


/* ==================================================
   DROPDOWNS
================================================== */

function updateCityDropdown() {

    const cities = new Map();

    allAttractions.forEach(item => {
        const city = toText(item.city_name).trim();

        if (city && !cities.has(item._cityKey)) {
            cities.set(item._cityKey, city);
        }
    });

    $w("#cityDropdown").options = [
        { label: "All Cities", value: "" },
        ...Array.from(cities.entries())
            .sort((a, b) => a[1].localeCompare(b[1]))
            .map(([key, city]) => ({ label: city, value: key }))
    ];

    // Only drop an unknown city AFTER everything has loaded.
    if (!isLoading && selectedCity && !cities.has(selectedCity)) {
        selectedCity = "";
    }

    $w("#cityDropdown").value = selectedCity;
}

function updateCategoryDropdown() {

    const categories = new Map();

    allAttractions.forEach(item => {
        const source = item._categories.length ? item._categories : item._tags;

        source.forEach(category => {
            const key = normalizeText(category);

            if (key && !categories.has(key)) {
                categories.set(key, category);
            }
        });
    });

    $w("#categoryDropdown").options = [
        { label: "All Categories", value: "" },
        ...Array.from(categories.entries())
            .sort((a, b) => a[1].localeCompare(b[1]))
            .map(([key, category]) => ({ label: category, value: key }))
    ];

    if (!isLoading && selectedCategory && !categories.has(selectedCategory)) {
        selectedCategory = "";
    }

    $w("#categoryDropdown").value = selectedCategory;
}


/* ==================================================
   FILTERS
================================================== */

function applyFilters(resetPage) {

    filteredAttractions = allAttractions.filter(item => {

        const cityMatch = !selectedCity || item._cityKey === selectedCity;

        const searchMatch = !searchText || item._searchText.includes(searchText);

        const categorySource = item._categories.length
            ? item._categories
            : item._tags;

        const categoryMatch =
            !selectedCategory ||
            categorySource.some(
                category => normalizeText(category) === selectedCategory
            );

        return cityMatch && searchMatch && categoryMatch;
    });

    if (resetPage) {
        currentPage = 1;
    }

    displayCurrentPage();
}


/* ==================================================
   PAGINATION
================================================== */

function displayCurrentPage() {

    const totalItems = filteredAttractions.length;
    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);

    if (!totalItems) {

        $w("#attractionsRepeater").data = [];
        $w("#prevBtn").disable();
        $w("#nextBtn").disable();

        if (isLoading) {
            $w("#pageInfoTxt").text = "Discovering attractions...";
        } else if (loadFailed) {
            $w("#pageInfoTxt").text = "Some attractions could not be loaded.";
        } else {
            $w("#pageInfoTxt").text = "No attractions found.";
        }

        return;
    }

    currentPage = Math.max(1, Math.min(currentPage, totalPages));

    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const pageData = filteredAttractions.slice(startIndex, startIndex + ITEMS_PER_PAGE);

    const existingData = $w("#attractionsRepeater").data;

    const sameVisibleItems =
        existingData.length === pageData.length &&
        existingData.every((item, index) => item._id === pageData[index]._id);

    if (!sameVisibleItems) {
        $w("#attractionsRepeater").data = pageData;
    }

    let info =
        `Showing ${startIndex + 1}-${Math.min(startIndex + ITEMS_PER_PAGE, totalItems)}` +
        ` of ${totalItems}`;

    if (isLoading) {
        info += " • Loading more...";
    } else if (loadFailed) {
        info += " • Some data could not be loaded";
    }

    $w("#pageInfoTxt").text = info;

    if (currentPage > 1) {
        $w("#prevBtn").enable();
    } else {
        $w("#prevBtn").disable();
    }

    if (currentPage < totalPages) {
        $w("#nextBtn").enable();
    } else {
        $w("#nextBtn").disable();
    }
}


/* ==================================================
   RENDER ONE CARD
================================================== */

function renderAttraction($item, itemData) {

    const name = toText(itemData.name) || "Untitled Venue";
    const venueId = toText(itemData.id).trim();

    // IMAGE (one main image)
    $item("#venueImage").src = getImageUrl(itemData) || FALLBACK_IMAGE;
    $item("#venueImage").alt = name;

    // NAME + CATEGORY + CITY
    $item("#titleTxt").text = name;
    $item("#categoryTxt").text = getCategoryLabel(itemData);
    $item("#cityTxt").text = toText(itemData.city_name);

    // SHORT DESCRIPTION
    $item("#descTxt").text = truncateText(
        itemData.description ||
        itemData.short_description ||
        "Discover this destination with PlanIT.",
        DESCRIPTION_LIMIT
    );

    // NAME
    $item("#titleTxt").text = truncateText(
        itemData.name || "Untitled Venue",
        18
    );


    // NAVIGATE TO DETAIL PAGE
    // (In the editor: remove any Link from #visitBtn. Code handles the click.)
    $item("#visitBtn").label = "View Details";

    if (!venueId) {
        $item("#visitBtn").disable();
        return;
    }

    $item("#visitBtn").enable();

    const goToDetails = () => {
        wixLocationFrontend.to(`/venue?id=${encodeURIComponent(venueId)}`);
    };

    $item("#visitBtn").onClick(goToDetails);
    $item("#venueImage").onClick(goToDetails);
    $item("#titleTxt").onClick(goToDetails);
}


/* ==================================================
   HELPERS
================================================== */

function getImageUrl(item) {

    const candidate = item.image_url || item.image || item.thumbnail;

    if (typeof candidate === "string" && candidate.trim()) {
        return candidate.trim();
    }

    return "";
}

function getCategoryLabel(item) {

    const label =
        (item._categories && item._categories[0]) ||
        (item._tags && item._tags[0]) ||
        "";

    return label ? label.charAt(0).toUpperCase() + label.slice(1) : "";
}

function truncateText(value, limit) {

    const text = toText(value).trim();

    if (text.length <= limit) {
        return text;
    }

    return text.substring(0, limit).trimEnd() + "...";
}

function normalizeTags(value) {

    if (Array.isArray(value)) {
        return value.map(toText).map(tag => tag.trim()).filter(Boolean);
    }

    return toText(value)
        .split(/[,;|]/)
        .map(tag => tag.trim())
        .filter(Boolean);
}

function toText(value) {

    if (Array.isArray(value)) {
        return value.join(", ");
    }

    return value === undefined || value === null ? "" : String(value);
}

function normalizeText(value) {
    return toText(value).trim().toLowerCase();
}

function createRepeaterId(value) {

    const text = String(value);
    let encoded = "";

    for (let index = 0; index < text.length; index++) {
        encoded += text.charCodeAt(index).toString(16).padStart(4, "0");
    }

    return `attr-${encoded}`;
}


// import { getAttractions } from 'backend/attractions.web';
// import wixLocationFrontend from 'wix-location-frontend';

// const ITEMS_PER_PAGE = 21;
// const PARALLEL_REQUESTS = 3;
// const SEARCH_DELAY = 250;

// const DESCRIPTION_LIMIT = 60;
// const TAG_LIMIT = 3;

// let currentPage = 1;

// let allAttractions = [];
// let filteredAttractions = [];

// let selectedCity = "";
// let selectedCategory = "";
// let searchText = "";

// let isLoading = true;
// let loadFailed = false;
// let searchTimer;

// const seenIds = new Set();


// /* ==================================================
//    PAGE READY
// ================================================== */

// $w.onReady(async function () {

//     $w("#attractionsRepeater").onItemReady(
//         renderAttraction
//     );

//     $w("#attractionsRepeater").data = [];

//     $w("#cityDropdown").options = [
//         { label: "All Cities", value: "" }
//     ];

//     $w("#cityDropdown").value = "";

//     $w("#categoryDropdown").options = [
//         { label: "All Categories", value: "" }
//     ];

//     $w("#categoryDropdown").value = "";

//     $w("#prevBtn").disable();
//     $w("#nextBtn").disable();

//     selectedCity = normalizeText(
//         wixLocationFrontend.query.city || ""
//     );

//     selectedCategory = normalizeText(
//         wixLocationFrontend.query.category || ""
//     );

//     bindEvents();

//     await loadAttractions();

// });


// /* ==================================================
//    EVENT HANDLERS
// ================================================== */

// function bindEvents() {

//     $w("#searchInput").onInput(() => {

//         searchText = normalizeText(
//             $w("#searchInput").value
//         );

//         currentPage = 1;

//         clearTimeout(searchTimer);

//         searchTimer = setTimeout(() => {
//             applyFilters();
//         }, SEARCH_DELAY);

//     });


//     $w("#cityDropdown").onChange(() => {

//         selectedCity =
//             $w("#cityDropdown").value || "";

//         currentPage = 1;

//         applyFilters();

//     });


//     $w("#categoryDropdown").onChange(() => {

//         selectedCategory =
//             $w("#categoryDropdown").value || "";

//         currentPage = 1;

//         applyFilters();

//     });


//     $w("#prevBtn").onClick(() => {

//         if (currentPage > 1) {

//             currentPage--;

//             displayCurrentPage();

//         }

//     });


//     $w("#nextBtn").onClick(() => {

//         const totalPages = Math.ceil(
//             filteredAttractions.length / ITEMS_PER_PAGE
//         );

//         if (currentPage < totalPages) {

//             currentPage++;

//             displayCurrentPage();

//         }

//     });

// }


// /* ==================================================
//    LOAD ATTRACTIONS
// ================================================== */

// async function loadAttractions() {

//     isLoading = true;
//     loadFailed = false;

//     allAttractions = [];
//     filteredAttractions = [];

//     seenIds.clear();

//     displayCurrentPage();

//     try {

//         const firstPage = await fetchPage(1);

//         appendAttractions(
//             firstPage.attractions,
//             1
//         );

//         refreshResults();

//         for (
//             let startPage = 2;
//             startPage <= firstPage.totalPages;
//             startPage += PARALLEL_REQUESTS
//         ) {

//             const pages = [];

//             for (
//                 let page = startPage;
//                 page < startPage + PARALLEL_REQUESTS &&
//                 page <= firstPage.totalPages;
//                 page++
//             ) {

//                 pages.push(page);

//             }

//             const results = await Promise.allSettled(
//                 pages.map(page => fetchPage(page))
//             );

//             results.forEach((result, index) => {

//                 if (result.status === "fulfilled") {

//                     appendAttractions(
//                         result.value.attractions,
//                         pages[index]
//                     );

//                 } else {

//                     loadFailed = true;

//                     console.error(
//                         "Attraction page failed:",
//                         pages[index],
//                         result.reason
//                     );

//                 }

//             });

//             refreshResults();

//         }

//     } catch (error) {

//         loadFailed = true;

//         console.error(
//             "Attractions loading failed:",
//             error
//         );

//     } finally {

//         isLoading = false;

//         displayCurrentPage();

//     }

// }


// async function fetchPage(page) {

//     const response = await getAttractions(
//         page,
//         ITEMS_PER_PAGE
//     );

//     if (
//         !response ||
//         response.success !== true ||
//         !response.data ||
//         !Array.isArray(response.data.attractions)
//     ) {

//         throw new Error(
//             `Invalid response for page ${page}`
//         );

//     }

//     const totalPages = Number(
//         response.data.pagination?.totalPages ?? 1
//     );

//     if (
//         !Number.isSafeInteger(totalPages) ||
//         totalPages < 1
//     ) {

//         throw new Error("Invalid totalPages.");

//     }

//     return {
//         attractions: response.data.attractions,
//         totalPages
//     };

// }


// /* ==================================================
//    NORMALIZE ATTRACTION DATA
// ================================================== */

// function appendAttractions(items, page) {

//     items.forEach((item, index) => {

//         if (!item || typeof item !== "object") {
//             return;
//         }

//         const sourceId = toText(item.id).trim();

//         const identity = sourceId
//             ? `api-${sourceId}`
//             : `page-${page}-item-${index}`;

//         if (seenIds.has(identity)) {
//             return;
//         }

//         seenIds.add(identity);

//         const tags = normalizeTags(item.tags);

//         const categories = normalizeTags(
//             item.category ||
//             item.categories ||
//             item.type
//         );

//         allAttractions.push({

//             ...item,

//             _id: createRepeaterId(identity),

//             _cityKey: normalizeText(item.city_name),

//             _tags: tags,

//             _categories: categories,

//             _searchText: [
//                 item.name,
//                 item.city_name,
//                 item.description,
//                 tags.join(" "),
//                 categories.join(" ")
//             ]
//                 .map(toText)
//                 .join(" ")
//                 .toLowerCase()

//         });

//     });

// }


// function refreshResults() {

//     updateCityDropdown();

//     updateCategoryDropdown();

//     applyFilters();

// }


// /* ==================================================
//    DYNAMIC CITY FILTER
// ================================================== */

// function updateCityDropdown() {

//     const cities = new Map();

//     allAttractions.forEach(item => {

//         const city = toText(item.city_name).trim();

//         if (city && !cities.has(item._cityKey)) {

//             cities.set(item._cityKey, city);

//         }

//     });

//     const options = [
//         {
//             label: "All Cities",
//             value: ""
//         },

//         ...Array.from(cities.entries())
//             .sort((a, b) => a[1].localeCompare(b[1]))
//             .map(([key, city]) => ({
//                 label: city,
//                 value: key
//             }))
//     ];

//     $w("#cityDropdown").options = options;

//     if (
//         selectedCity &&
//         !cities.has(selectedCity)
//     ) {

//         selectedCity = "";

//     }

//     $w("#cityDropdown").value = selectedCity;

// }


// /* ==================================================
//    DYNAMIC CATEGORY FILTER
// ================================================== */

// function updateCategoryDropdown() {

//     const categories = new Map();

//     allAttractions.forEach(item => {

//         const source = item._categories.length
//             ? item._categories
//             : item._tags;

//         source.forEach(category => {

//             const key = normalizeText(category);

//             if (key && !categories.has(key)) {

//                 categories.set(key, category);

//             }

//         });

//     });

//     const options = [
//         {
//             label: "All Categories",
//             value: ""
//         },

//         ...Array.from(categories.entries())
//             .sort((a, b) => a[1].localeCompare(b[1]))
//             .map(([key, category]) => ({
//                 label: category,
//                 value: key
//             }))
//     ];

//     $w("#categoryDropdown").options = options;

//     if (
//         selectedCategory &&
//         !categories.has(selectedCategory)
//     ) {

//         selectedCategory = "";

//     }

//     $w("#categoryDropdown").value =
//         selectedCategory;

// }


// /* ==================================================
//    FILTERS
// ================================================== */

// function applyFilters() {

//     filteredAttractions = allAttractions.filter(item => {

//         const cityMatch =
//             !selectedCity ||
//             item._cityKey === selectedCity;

//         const searchMatch =
//             !searchText ||
//             item._searchText.includes(searchText);

//         const categorySource =
//             item._categories.length
//                 ? item._categories
//                 : item._tags;

//         const categoryMatch =
//             !selectedCategory ||
//             categorySource.some(
//                 category =>
//                     normalizeText(category) === selectedCategory
//             );

//         return (
//             cityMatch &&
//             searchMatch &&
//             categoryMatch
//         );

//     });

//     currentPage = 1;

//     displayCurrentPage();

// }


// /* ==================================================
//    PAGINATION
// ================================================== */

// function displayCurrentPage() {

//     const totalItems = filteredAttractions.length;

//     const totalPages = Math.ceil(
//         totalItems / ITEMS_PER_PAGE
//     );

//     if (!totalItems) {

//         $w("#attractionsRepeater").data = [];

//         $w("#prevBtn").disable();
//         $w("#nextBtn").disable();

//         if (isLoading) {

//             $w("#pageInfoTxt").text =
//                 "Discovering attractions...";

//         } else if (loadFailed) {

//             $w("#pageInfoTxt").text =
//                 "Some attractions could not be loaded.";

//         } else {

//             $w("#pageInfoTxt").text =
//                 "No attractions found.";

//         }

//         return;

//     }

//     currentPage = Math.max(
//         1,
//         Math.min(currentPage, totalPages)
//     );

//     const startIndex =
//         (currentPage - 1) * ITEMS_PER_PAGE;

//     const pageData = filteredAttractions.slice(
//         startIndex,
//         startIndex + ITEMS_PER_PAGE
//     );

//     const existingData =
//         $w("#attractionsRepeater").data;

//     const sameVisibleItems =
//         existingData.length === pageData.length &&
//         existingData.every(
//             (item, index) =>
//                 item._id === pageData[index]._id
//         );

//     if (!sameVisibleItems) {

//         $w("#attractionsRepeater").data = pageData;

//     }

//     let info =
//         `Showing ${startIndex + 1}-${Math.min(
//             startIndex + ITEMS_PER_PAGE,
//             totalItems
//         )}`;

//     if (isLoading) {

//         info += " • Loading more...";

//     } else if (loadFailed) {

//         info += " • Some data could not be loaded";

//     }

//     $w("#pageInfoTxt").text = info;

//     currentPage > 1
//         ? $w("#prevBtn").enable()
//         : $w("#prevBtn").disable();

//     currentPage < totalPages
//         ? $w("#nextBtn").enable()
//         : $w("#nextBtn").disable();

// }


// /* ==================================================
//    RENDER ATTRACTION CARD
// ================================================== */

// function renderAttraction($item, itemData) {

//     // TITLE

//     $item("#titleTxt").text =
//         toText(itemData.name) || "Untitled Attraction";


//     // CITY

//     $item("#cityTxt").text =
//         toText(itemData.city_name);


//     // DESCRIPTION

//     $item("#descTxt").text =
//         truncateText(
//             itemData.description ||
//             "Discover this amazing destination.",
//             DESCRIPTION_LIMIT
//         );


//     // TAGS

//     const tags = itemData._tags || [];

//     $item("#tagsTxt").text =
//         tags.slice(0, TAG_LIMIT).join("  •  ");


//     // IMAGE

//     const imageUrl = getImageUrl(itemData);
//     console.log(itemData)

//     const fallbackImage = getCategoryFallback(itemData);

//     $item("#venueImage").src =
//         imageUrl || fallbackImage;


//     // CTA

//     const websiteUrl = toText(itemData.url).trim();

//     const bookingUrl = toText(
//         itemData.booking_url
//     ).trim();

//     const venueType = normalizeText(
//         itemData.type ||
//         itemData.category ||
//         ""
//     );

//     const isBookable =
//         Boolean(bookingUrl) ||
//         /tour|activity|ticket|event|experience|hotel|restaurant/.test(
//             venueType
//         );

//     const buttonUrl = isBookable
//         ? bookingUrl || websiteUrl
//         : websiteUrl;

//     $item("#visitBtn").label = isBookable
//         ? "Book"
//         : "Visit Site";

//     if (buttonUrl) {

//         $item("#visitBtn").link = buttonUrl;

//         $item("#visitBtn").target = "_blank";

//         $item("#visitBtn").enable();

//     } else {

//         $item("#visitBtn").link = "";

//         $item("#visitBtn").disable();

//     }

// }


// /* ==================================================
//    IMAGE HANDLING
// ================================================== */

// function getImageUrl(item) {

//     const images = [
//         item.image,
//         item.image_url,
//         item.thumbnail,
//         item.photo,
//         item.cover_image
//     ];

//     for (const image of images) {

//         if (
//             typeof image === "string" &&
//             image.trim()
//         ) {

//             return image.trim();

//         }

//         if (image && typeof image === "object") {

//             const url = image.url || image.src;

//             if (typeof url === "string" && url.trim()) {

//                 return url.trim();

//             }

//         }

//     }

//     return "";

// }


// function getCategoryFallback(item) {

//     const category = normalizeText(
//         item.category ||
//         item.type ||
//         (item._categories || [])[0]
//     );

//     const fallbackImages = {

//         museum: "https://static.wixstatic.com/media/884307_e2271750386249eb8f1c0fee9582d1ff~mv2.png",

//         restaurant: "https://static.wixstatic.com/media/884307_e2271750386249eb8f1c0fee9582d1ff~mv2.png",

//         hotel: "https://static.wixstatic.com/media/884307_e2271750386249eb8f1c0fee9582d1ff~mv2.png",

//         park: "https://static.wixstatic.com/media/884307_e2271750386249eb8f1c0fee9582d1ff~mv2.png",

//         activity: "https://static.wixstatic.com/media/884307_e2271750386249eb8f1c0fee9582d1ff~mv2.png"

//     };

//     return fallbackImages[category] ||
//         "https://static.wixstatic.com/media/884307_e2271750386249eb8f1c0fee9582d1ff~mv2.png";

// }


// /* ==================================================
//    HELPERS
// ================================================== */

// function truncateText(value, limit) {

//     const text = toText(value).trim();

//     if (text.length <= limit) {
//         return text;
//     }

//     return text.substring(0, limit).trimEnd() + "...";

// }


// function normalizeTags(value) {

//     if (Array.isArray(value)) {

//         return value
//             .map(toText)
//             .map(tag => tag.trim())
//             .filter(Boolean);

//     }

//     return toText(value)
//         .split(/[,;|]/)
//         .map(tag => tag.trim())
//         .filter(Boolean);

// }


// function toText(value) {

//     if (Array.isArray(value)) {
//         return value.join(", ");
//     }

//     return value === undefined || value === null
//         ? ""
//         : String(value);

// }


// function normalizeText(value) {

//     return toText(value).trim().toLowerCase();

// }


// function createRepeaterId(value) {

//     const text = String(value);

//     let encoded = "";

//     for (let index = 0; index < text.length; index++) {

//         encoded += text.charCodeAt(index)
//             .toString(16)
//             .padStart(4, "0");

//     }

//     return `attr-${encoded}`;

// }
