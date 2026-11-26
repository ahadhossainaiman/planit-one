// Wix → Attractions page → Page Code

import { getAttractions } from 'backend/attractions.web';
import wixLocationFrontend from 'wix-location-frontend';
import { session } from 'wix-storage-frontend';

const ITEMS_PER_PAGE = 24;          // divisible by 2, 3 and 4 columns
const PARALLEL_REQUESTS = 3;
const SEARCH_DELAY = 250;
const TITLE_LIMIT = 35;
const DESCRIPTION_LIMIT = 65;

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
let pendingScrollVenueId = null;

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

    // Check for saved browsing state (from returning via venue Back button or browser Back)
    let savedBrowseState = null;
    try {
        const raw = session.getItem("attractions_browse_state");
        if (raw) {
            savedBrowseState = JSON.parse(raw);
        }
    } catch (e) {
        console.warn("Could not read saved browse state:", e);
    }

    if (savedBrowseState) {
        if (savedBrowseState.city && !wixLocationFrontend.query.city) {
            selectedCity = savedBrowseState.city;
        } else {
            selectedCity = normalizeText(wixLocationFrontend.query.city || "");
        }

        if (savedBrowseState.category && !wixLocationFrontend.query.category) {
            selectedCategory = savedBrowseState.category;
        } else {
            selectedCategory = normalizeText(wixLocationFrontend.query.category || "");
        }

        if (savedBrowseState.search) {
            searchText = savedBrowseState.search;
            $w("#searchInput").value = searchText;
        }

        if (savedBrowseState.page && Number.isInteger(savedBrowseState.page)) {
            currentPage = savedBrowseState.page;
        }

        if (savedBrowseState.venueId) {
            pendingScrollVenueId = savedBrowseState.venueId;
        }
    } else {
        // Query params (?city=Paris / ?category=Museum from Cities page)
        selectedCity = normalizeText(wixLocationFrontend.query.city || "");
        selectedCategory = normalizeText(wixLocationFrontend.query.category || "");
    }

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

        // Page 1 is ready: display it immediately for fast initial paint
        const firstPage = await fetchPage(1);
        appendAttractions(firstPage.attractions, 1);
        refreshResults();

        // Fetch remaining pages in background silently WITHOUT re-rendering on each batch
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

            // Do not call refreshResults() inside the loop to avoid continuous repeater & dropdown flickering
        }

    } catch (error) {

        loadFailed = true;
        console.error("Attractions loading failed:", error);

    } finally {

        isLoading = false;

        // Final refresh: safe to validate dropdown values
        refreshResults();

        // Restore scroll position to the venue user previously viewed
        restoreScrollPosition();
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

function restoreScrollPosition() {
    if (!pendingScrollVenueId) return;

    const targetId = pendingScrollVenueId;
    setTimeout(() => {
        let found = false;
        $w("#attractionsRepeater").forEachItem(($item, itemData) => {
            if (!found && toText(itemData.id).trim() === targetId) {
                found = true;
                $item("#titleTxt").scrollTo();
            }
        });
        pendingScrollVenueId = null;
        session.removeItem("attractions_browse_state");
    }, 350);
}


/* ==================================================
   RENDER ONE CARD
================================================== */

function renderAttraction($item, itemData) {

    const name = toText(itemData.name) || "Untitled Venue";
    const venueId = toText(itemData.id).trim();

    // IMAGE WITH FALLBACK
    const validImage = getImageUrl(itemData);
    $item("#venueImage").src = validImage || FALLBACK_IMAGE;
    $item("#venueImage").alt = name;

    // TITLE + CATEGORY + CITY (Fixed vertical heights to eliminate card misalignment)
    const displayTitle = truncateText(name, TITLE_LIMIT);
    const displayCategory = getCategoryLabel(itemData) || "Attraction";
    const displayCity = toText(itemData.city_name) || "Destination";
    const displayDesc = truncateText(
        itemData.description ||
        itemData.short_description ||
        "Discover this destination with PlanIT.",
        DESCRIPTION_LIMIT
    );

    // Apply fixed-height HTML containers so 1-line vs 2-line text never shifts the buttons
    try {
        $item("#titleTxt").html =
            `<h3 style="font-size:16px;font-weight:700;line-height:22px;height:44px;overflow:hidden;margin:0;padding:0;color:#111827;">${escapeHtml(displayTitle)}</h3>`;
    } catch (e) {
        $item("#titleTxt").text = displayTitle;
    }

    $item("#categoryTxt").text = displayCategory;

    try {
        $item("#cityTxt").html =
            `<p style="font-size:12px;font-weight:500;line-height:18px;height:18px;overflow:hidden;margin:0;padding:0;color:#6B7280;">${escapeHtml(displayCity)}</p>`;
    } catch (e) {
        $item("#cityTxt").text = displayCity;
    }

    try {
        $item("#descTxt").html =
            `<p style="font-size:13px;line-height:18px;height:36px;overflow:hidden;margin:0;padding:0;color:#4B5563;">${escapeHtml(displayDesc)}</p>`;
    } catch (e) {
        $item("#descTxt").text = displayDesc;
    }

    // NAVIGATE TO DETAIL PAGE WITH BROWSING STATE RECORDED
    $item("#visitBtn").label = "View Details";

    if (!venueId) {
        $item("#visitBtn").disable();
        return;
    }

    $item("#visitBtn").enable();

    const goToDetails = () => {
        // Save current browsing state to session storage
        try {
            const browseState = {
                page: currentPage,
                city: selectedCity,
                category: selectedCategory,
                search: searchText,
                venueId: venueId
            };
            session.setItem("attractions_browse_state", JSON.stringify(browseState));
        } catch (err) {
            console.warn("Could not save browse state:", err);
        }

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
        const url = candidate.trim();
        // Check for valid protocol and ensure it's not a string "null" or "undefined"
        if (
            (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("wix:image://")) &&
            !url.includes("null") &&
            !url.includes("undefined")
        ) {
            return url;
        }
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
    // Normalizes text and converts hyphens to spaces (e.g., "new-york" -> "new york")
    return toText(value).trim().toLowerCase().replace(/-/g, " ");
}

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function createRepeaterId(value) {

    const text = String(value);
    let encoded = "";

    for (let index = 0; index < text.length; index++) {
        encoded += text.charCodeAt(index).toString(16).padStart(4, "0");
    }

    return `attr-${encoded}`;
}
