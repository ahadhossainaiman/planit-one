import { fetch } from 'wix-fetch';
import { webMethod, Permissions } from 'wix-web-module';

const BASE_URL = 'https://api.1planit.com/api/v1';


// ==============================
// Get All Cities
// ==============================

export const getAllCities = webMethod(
    Permissions.Anyone,
    async (page = 1, limit = 20) => {

        try {

            const url =
                `${BASE_URL}/cities?page=${page}&limit=${limit}`;

            console.log("Fetching cities:", url);

            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            console.log(
                "Cities API response status:",
                response.status
            );

            if (!response.ok) {
                throw new Error(
                    `Failed to fetch cities. Status: ${response.status}`
                );
            }

            return await response.json();

        } catch (error) {

            console.error(
                "getAllCities error:",
                error
            );

            throw error;
        }
    }
);


// ==============================
// Get Single City
// ==============================

export const getCityByName = webMethod(
    Permissions.Anyone,
    async (cityName) => {

        try {

            const encodedCityName =
                encodeURIComponent(cityName);

            const url =
                `${BASE_URL}/cities/${encodedCityName}`;

            console.log(
                "Fetching city:",
                url
            );

            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(
                    `Failed to fetch city details. Status: ${response.status}`
                );
            }

            return await response.json();

        } catch (error) {

            console.error(
                "getCityByName error:",
                error
            );

            throw error;
        }
    }
);