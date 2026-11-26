import { fetch } from 'wix-fetch';
import { webMethod, Permissions } from 'wix-web-module';

const BASE_URL = "https://api.1planit.com/api/v1";

// 1. Health Check
export const checkApiHealth = webMethod(Permissions.Anyone, async () => {
    const response = await fetch(`${BASE_URL}/health`, { method: 'GET' });
    return response.ok;
});

// 2. Login
export const loginUser = webMethod(Permissions.Anyone, async (email, password) => {
    const response = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
    });
    if (!response.ok) throw new Error("Login failed");
    return response.json();
});

// 3. Signup
export const signupUser = webMethod(Permissions.Anyone, async (userData) => {
    const response = await fetch(`${BASE_URL}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userData)
    });
    if (!response.ok) throw new Error("Signup failed");
    return response.json();
});

// 4. Verify Email
export const verifyEmail = webMethod(Permissions.Anyone, async (email, code) => {
    const response = await fetch(`${BASE_URL}/auth/verify-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, verification_code: code })
    });
    if (!response.ok) throw new Error("Verification failed");
    return response.json(); 
});

// 5. Resend Verification Code
export const resendVerification = webMethod(Permissions.Anyone, async (email) => {
    const response = await fetch(`${BASE_URL}/auth/resend-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
    });
    if (!response.ok) throw new Error("Failed to resend code");
    return response.json();
});

// 6. Refresh Token
export const refreshUserToken = webMethod(Permissions.Anyone, async (refresh_token) => {
    const response = await fetch(`${BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token })
    });
    if (!response.ok) throw new Error("Token refresh failed");
    return response.json();
});

// 7. Get Current User (Protected)
export const getCurrentUser = webMethod(Permissions.Anyone, async (access_token) => {
    const response = await fetch(`${BASE_URL}/auth/me`, {
        method: 'GET',
        headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${access_token}`
        }
    });
    if (!response.ok) throw new Error("Unauthorized");
    return response.json();
});