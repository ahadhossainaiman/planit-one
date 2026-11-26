// Wix → Backend → attractions.web.js  (REPLACE the whole file)

import { fetch } from 'wix-fetch';
import { webMethod, Permissions } from 'wix-web-module';

const BASE_URL = "https://api.1planit.com/api/v1";


const FALLBACK_IMAGE_URL =
    "https://static.wixstatic.com/media/884307_e2271750386249eb8f1c0fee9582d1ff~mv2.png";

async function verifyImageUrl(url) {
    if (!url || typeof url !== "string") {
        return FALLBACK_IMAGE_URL;
    }

    const trimmed = url.trim();
    if (
        (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) ||
        trimmed.includes("null") ||
        trimmed.includes("undefined")
    ) {
        return FALLBACK_IMAGE_URL;
    }

    // Google Place / usercontent photos often return 403 Forbidden due to referrer/token restrictions
    // Perform a quick HEAD check to ensure the client browser won't get a broken image icon
    try {
        const headRes = await fetch(trimmed, {
            method: "HEAD",
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            }
        });
        if (headRes.ok) {
            return trimmed;
        }
        return FALLBACK_IMAGE_URL;
    } catch (e) {
        return FALLBACK_IMAGE_URL;
    }
}

/* ==================================================
   LIST (used by Attractions page)
================================================== */

export const getAttractions = webMethod(
    Permissions.Anyone,

    async (page = 1, limit = 24) => {
        const pageNumber = Number(page);
        const pageSize = Number(limit);

        if (
            !Number.isSafeInteger(pageNumber) ||
            pageNumber < 1 ||
            !Number.isSafeInteger(pageSize) ||
            pageSize < 1 ||
            pageSize > 100
        ) {
            throw new Error("Invalid pagination parameters.");
        }

        try {
            const url =
                `${BASE_URL}/attractions` +
                `?page=${pageNumber}&limit=${pageSize}`;

            const response = await fetch(url, {
                method: "GET",
                headers: { "Accept": "application/json" }
            });

            if (!response.ok) {
                console.error("Attractions API HTTP error:", response.status);
                throw new Error("Attractions service unavailable.");
            }

            const result = await response.json();

            if (
                !result ||
                result.success !== true ||
                !result.data ||
                !Array.isArray(result.data.attractions)
            ) {
                throw new Error("Invalid attractions response.");
            }

            const rawTotalPages = Number(
                result.data.pagination?.totalPages ?? 1
            );

            if (!Number.isSafeInteger(rawTotalPages) || rawTotalPages < 0) {
                throw new Error("Invalid pagination response.");
            }

            // Verify images in parallel to eliminate broken 403 / 404 images
            const verifiedAttractions = await Promise.all(
                result.data.attractions
                    .filter(item => item && typeof item === "object")
                    .map(async item => {
                        const verifiedImg = await verifyImageUrl(item.image_url);
                        return {
                            id: item.id ?? null,
                            name: toText(item.name),
                            city_name: toText(item.city_name),
                            description: toText(item.description).slice(0, 300),
                            short_description: toText(item.short_description),
                            tags: toText(item.tags),
                            type: toText(item.type),
                            image_url: verifiedImg,
                            url: toText(item.url),
                            affiliate_url: toText(item.affiliate_url),
                            partner_type: toText(item.partner_type),
                            bookability: toText(item.bookability),
                            price_tier: toText(item.price_tier)
                        };
                    })
            );

            return {
                success: true,
                data: {
                    attractions: verifiedAttractions,
                    pagination: {
                        page: pageNumber,
                        totalPages: Math.max(1, rawTotalPages)
                    }
                }
            };

        } catch (error) {
            console.error("getAttractions failed:", error);
            throw new Error("Unable to load attractions. Please try again.");
        }
    },

    {
        // v4 cache to flush out cached 403 Google photo URLs
        cache: {
            tags: ["public-attractions-v4"],
            ttl: 300
        }
    }
);


/* ==================================================
   SINGLE VENUE (used by Venue page)
================================================== */

export const getAttractionById = webMethod(
    Permissions.Anyone,

    async (attractionId) => {
        const id = toText(attractionId).trim();

        if (!id || id.length > 200) {
            throw new Error("Invalid attraction id.");
        }

        const response = await fetch(
            `${BASE_URL}/attractions/${encodeURIComponent(id)}`,
            {
                method: "GET",
                headers: { "Accept": "application/json" }
            }
        );

        if (response.status === 404) {
            return { success: false, notFound: true, attraction: null };
        }

        if (!response.ok) {
            console.error("Attraction API HTTP error:", response.status);
            throw new Error("Attraction service unavailable.");
        }

        const result = await response.json();

        if (!result || result.success !== true || !result.data) {
            throw new Error("Invalid attraction response.");
        }

        // The PDF does not show the wrapper for this endpoint,
        // so support both shapes: data.attraction OR data itself.
        const attraction = result.data.attraction || result.data;

        return { success: true, notFound: false, attraction };
    }
);


function toText(value) {
    if (Array.isArray(value)) {
        return value.join(", ");
    }

    return value === null || value === undefined
        ? ""
        : String(value);
}


// import { fetch } from 'wix-fetch';
// import { webMethod, Permissions } from 'wix-web-module';

// const BASE_URL = "https://api.1planit.com/api/v1";

// export const getAttractions = webMethod(
//     Permissions.Anyone,

//     async (page = 1, limit = 21) => {
//         const pageNumber = Number(page);
//         const pageSize = Number(limit);

//         if (
//             !Number.isSafeInteger(pageNumber) ||
//             pageNumber < 1 ||
//             !Number.isSafeInteger(pageSize) ||
//             pageSize < 1 ||
//             pageSize > 100
//         ) {
//             throw new Error("Invalid pagination parameters.");
//         }

//         try {
//             const url =
//                 `${BASE_URL}/attractions` +
//                 `?page=${pageNumber}&limit=${pageSize}`;

//             const response = await fetch(url, {
//                 method: "GET",
//                 headers: {
//                     "Accept": "application/json"
//                 }
//             });

//             if (!response.ok) {
//                 console.error(
//                     "Attractions API HTTP error:",
//                     response.status
//                 );

//                 throw new Error("Attractions service unavailable.");
//             }

//             const result = await response.json();

//             if (
//                 !result ||
//                 result.success !== true ||
//                 !result.data ||
//                 !Array.isArray(result.data.attractions)
//             ) {
//                 throw new Error("Invalid attractions response.");
//             }

//             const rawTotalPages = Number(
//                 result.data.pagination?.totalPages ?? 1
//             );

//             if (
//                 !Number.isSafeInteger(rawTotalPages) ||
//                 rawTotalPages < 0
//             ) {
//                 throw new Error("Invalid pagination response.");
//             }

//             // Return only the fields used by this page.
//             // This reduces the frontend payload.
//             const attractions = result.data.attractions
//                 .filter(item =>
//                     item && typeof item === "object"
//                 )
//                 .map(item => ({
//                     id: item.id ?? null,
//                     name: toText(item.name),
//                     city_name: toText(item.city_name),
//                     description: toText(item.description),
//                     tags: toText(item.tags),
//                     url: toText(item.url)
//                 }));

//             return {
//                 success: true,
//                 data: {
//                     attractions,
//                     pagination: {
//                         page: pageNumber,
//                         totalPages: Math.max(1, rawTotalPages)
//                     }
//                 }
//             };

//         } catch (error) {
//             console.error(
//                 "getAttractions failed:",
//                 error
//             );

//             throw new Error(
//                 "Unable to load attractions. Please try again."
//             );
//         }
//     },

//     {
//         cache: {
//             tags: ["public-attractions-v1"],
//             ttl: 300
//         }
//     }
// );

// function toText(value) {
//     if (Array.isArray(value)) {
//         return value.join(", ");
//     }

//     return value === null || value === undefined
//         ? ""
//         : String(value);
// }

