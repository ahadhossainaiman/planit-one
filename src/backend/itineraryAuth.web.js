import { fetch } from 'wix-fetch';
import { webMethod, Permissions } from 'wix-web-module';

const BASE_URL = 'https://api.1planit.com/api/v1';


// ========================================
// Get Experience Types
// ========================================

export const getExperienceTypes = webMethod(
    Permissions.Anyone,
    async () => {

        try {

            const url =
                `${BASE_URL}/preferences/experience-types`;

            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }
            });

            const responseText =
                await response.text();

            if (!response.ok) {

                throw new Error(
                    `Experience API error: ${response.status} ${responseText}`
                );
            }

            let data;

            try {

                data =
                    JSON.parse(responseText);

            } catch (error) {

                throw new Error(
                    'Experience API returned invalid JSON.'
                );
            }

            return data;

        } catch (error) {

            console.error(
                'getExperienceTypes error:',
                error
            );

            throw new Error(
                error.message ||
                'Failed to fetch experience types.'
            );
        }
    }
);