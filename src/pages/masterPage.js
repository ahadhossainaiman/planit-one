import { local } from 'wix-storage-frontend';
import wixWindowFrontend from 'wix-window-frontend';
import wixLocationFrontend from 'wix-location-frontend';
import { checkApiHealth, getCurrentUser, refreshUserToken } from 'backend/planitAuth.web';

$w.onReady(async function () {
    const isHealthy = await checkApiHealth().catch(() => false);
    if (!isHealthy) console.error("1PlanIT API is currently down.");

    await validateSession();

    // Main Header Auth Button
    $w("#authButton").onClick(() => {
        if (local.getItem("access_token")) {
            wixLocationFrontend.to("/dashboard");
        } else {
            wixWindowFrontend.openLightbox("loginPopup").then((res) => {
                if (res?.loggedIn) validateSession();
            });
        }
    });
});

async function validateSession() {
    let accessToken = local.getItem("access_token");
    const refreshToken = local.getItem("refresh_token");

    if (accessToken) {
        try {
            await getCurrentUser(accessToken);
            setLoggedInUI();
        } catch (err) {
            // Access token invalid/expired, try refreshing
            if (refreshToken) {
                try {
                    const newTokens = await refreshUserToken(refreshToken);
                    // API রেসপন্স স্ট্রাকচার অনুযায়ী টোকেন সেট করা
                    const newAccess = newTokens.data ? newTokens.data.access_token : newTokens.access_token;
                    const newRefresh = newTokens.data ? newTokens.data.refresh_token : newTokens.refresh_token;
                    
                    local.setItem("access_token", newAccess);
                    local.setItem("refresh_token", newRefresh);
                    setLoggedInUI();
                } catch (refreshErr) {
                    forceLogout();
                }
            } else {
                forceLogout();
            }
        }
    } else {
        setLoggedOutUI();
    }
}

function setLoggedInUI() {
    $w("#authButton").label = "Dashboard";
}

function setLoggedOutUI() {
    $w("#authButton").label = "Sign In";
}

function forceLogout() {
    local.removeItem("access_token");
    local.removeItem("refresh_token");
    setLoggedOutUI();
}