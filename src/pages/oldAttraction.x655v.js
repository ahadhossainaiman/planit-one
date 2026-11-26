import wixData from 'wix-data';

const CITIES_COLLECTION_ID = 'Cities';
const PREFERRED_DEFAULT_CITY = 'Budapest';
const SEARCH_DELAY_MS = 250;

let currentCityId = '';
let currentSearch = '';
let searchTimer;
let initialized = false;
let filterQueue = Promise.resolve();

$w.onReady(() => {
    const ds = $w('#venuesDataset');
    const cityTags = $w('#cityTags');

    cityTags.onChange(async () => {
        const selectedValues = cityTags.value;

        // Selection Tags normally allow several selections. Keep only the most
        // recent choice and prevent the active city from being deselected.
        if (selectedValues.length === 0) {
            cityTags.value = [currentCityId];
            return;
        }

        const selectedCityId = selectedValues[selectedValues.length - 1];
        currentCityId = selectedCityId;
        cityTags.value = [selectedCityId];
        clearTimeout(searchTimer);
        await applyFilters();
    });

    $w('#btnBack').onClick(async () => {
        if (!ds.hasPreviousPage()) {
            return;
        }

        await ds.previousPage();
        updatePagingUI();
        scrollToTop();
    });

    $w('#btnNext').onClick(async () => {
        if (!ds.hasNextPage()) {
            return;
        }

        await ds.nextPage();
        updatePagingUI();
        scrollToTop();
    });

    $w('#searchInput').onInput(() => {
        currentSearch = $w('#searchInput').value.trim();
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => applyFilters(), SEARCH_DELAY_MS);
    });

    ds.onReady(async () => {
        if (initialized) {
            return;
        }

        initialized = true;

        try {
            const cities = await loadActiveCities();

            if (cities.length === 0) {
                throw new Error('No active cities were found in the Cities collection.');
            }

            const defaultCity =
                cities.find((city) => city.name === PREFERRED_DEFAULT_CITY) || cities[0];

            currentCityId = defaultCity._id;
            cityTags.options = cities.map((city) => ({
                label: city.name,
                value: city._id
            }));
            cityTags.value = [currentCityId];

            updateCitiesSummary(cities.length);
            await applyFilters();
        } catch (error) {
            console.error('Could not initialize the Attractions page:', error);
            $w('#pageLabel').text = 'Attractions are temporarily unavailable';
            $w('#btnBack').disable();
            $w('#btnNext').disable();
        }
    });
});

async function loadActiveCities() {
    const result = await wixData
        .query(CITIES_COLLECTION_ID)
        .eq('isActive', true)
        .ascending('name')
        .limit(100)
        .find();

    return result.items.filter((city) => city._id && city.name);
}

function applyFilters() {
    const ds = $w('#venuesDataset');
    const cityId = currentCityId;
    const search = currentSearch;

    filterQueue = filterQueue
        .catch(() => undefined)
        .then(async () => {
            let filter = wixData
                .filter()
                .eq('cityRef', cityId)
                .eq('isActive', true);

            if (search) {
                filter = filter.contains('name', search);
            }

            await ds.setFilter(filter);
            await ds.loadPage(1);
            updatePagingUI();
            scrollToTop();
        })
        .catch((error) => {
            console.error('Error applying attraction filters:', error);
        });

    return filterQueue;
}

function updateCitiesSummary(cityCount) {
    const cityWord = cityCount === 1 ? 'city' : 'cities';

    $w('#citiesSummaryText').text =
        `Browse curated attractions across ${cityCount} ${cityWord}, ` +
        'all organized for smarter itineraries.';
}

function updatePagingUI() {
    const ds = $w('#venuesDataset');
    const totalPages = ds.getTotalPageCount();

    if (totalPages === 0) {
        $w('#pageLabel').text = 'No attractions found';
        $w('#btnBack').disable();
        $w('#btnNext').disable();
        return;
    }

    const currentPage = ds.getCurrentPageIndex();
    $w('#pageLabel').text = `Page ${currentPage} of ${totalPages}`;

    if (ds.hasPreviousPage()) {
        $w('#btnBack').enable();
    } else {
        $w('#btnBack').disable();
    }

    if (ds.hasNextPage()) {
        $w('#btnNext').enable();
    } else {
        $w('#btnNext').disable();
    }
}

function scrollToTop() {
    $w('#repeaterTop').scrollTo();
}
