// A minimal, commented JavaScript template for connecting an external app to the Clearly.Hub IAM.

// --- 1. CONFIGURATION: Your App's Credentials ---
// These are the core parameters you will get from the Clearly.Hub.
// IMPORTANT: In a production app, these values should be loaded from
// a secure source (e.g., environment variables), NOT hardcoded.

const CLIENT_ID = 'YOUR_CLIENT_ID_GOES_HERE';
const COGNITO_DOMAIN = 'auth.clearly.app';
const REDIRECT_URI = 'YOUR_REDIRECT_URI_GOES_HERE';

// --- 2. THE AUTHENTICATION FLOW (The Developer's Core Functions) ---
// These are the main functions that implement the OAuth 2.0 flow with PKCE.

// --- Helper functions for PKCE (Proof Key for Code Exchange) ---
// These are standard, cryptographic helper functions for securing the flow.
function generateRandomString(length) { /* ... */ }
async function sha256(plain) { /* ... */ }
function base64urlencode(buffer) { /* ... */ }
async function generateCodeChallenge(codeVerifier) { /* ... */ }

/**
 * [Step 1] Initiates the login process by redirecting to the Clearly.Hub's hosted UI.
 */
async function initiateLogin() {
    const codeVerifier = generateRandomString(128);
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    sessionStorage.setItem('pkce_code_verifier', codeVerifier);

    // Below, is the Cognito authorization URL structure
    const authUrl = `https://${COGNITO_DOMAIN}/oauth2/authorize?` +
        `response_type=code&` +
        `client_id=${CLIENT_ID}&` +
        `redirect_uri=${encodeURIComponent(REDIRECT_URI)}&` +
        `scope=openid+profile+email&` +
        `code_challenge=${codeChallenge}&` +
        `code_challenge_method=S256`;

    window.location.href = authUrl;
}

/**
 * [Step 2] Exchanges the authorization code for a JWT (Access and ID Token).
 * This is the crucial step after the user is redirected back from the login page.
 */
async function exchangeCodeForTokens(code, codeVerifier) {
    const body = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: CLIENT_ID,
        code: code,
        redirect_uri: REDIRECT_URI,
        code_verifier: codeVerifier,
    });

    try {
        const response = await fetch(`https://${COGNITO_DOMAIN}/oauth2/token`, {
            method: 'POST',
            body: body,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });
        const data = await response.json();

        if (response.ok) {
            // Success: Store the tokens.
            localStorage.setItem('accessToken', data.access_token);
            // In a real app, you would now update the UI to reflect the logged-in state.
        } else {
            console.error("Token exchange failed:", data.error_description);
            // Handle the error (e.g., redirect to an error page).
        }
    } catch (error) {
        console.error("Network error during token exchange:", error);
    }
}

/**
 * [Step 3] Handles the logout process by clearing the session.
 */
function handleLogout() {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('idToken');
    sessionStorage.removeItem('pkce_code_verifier');

    // Redirect the user to the Clearly.Hub's logout endpoint to clear the session.
    const logoutUrl = `https://${COGNITO_DOMAIN}/logout?` +
        `client_id=${CLIENT_ID}&` +
        `logout_uri=${encodeURIComponent(REDIRECT_URI)}`;

    window.location.href = logoutUrl;
}

// --- 3. INITIALIZATION AND EVENT LISTENERS (How to use the functions) ---

// This function runs when the page loads to check if the user is returning from a login.
document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const storedCodeVerifier = sessionStorage.getItem('pkce_code_verifier');

    if (code && storedCodeVerifier) {
        // The user is returning with an authorization code; exchange it for tokens.
        exchangeCodeForTokens(code, storedCodeVerifier);

        // Optional: clear the URL of the code for a cleaner look.
        window.history.replaceState({}, '', '/');
        sessionStorage.removeItem('pkce_code_verifier');
    }
});

// Example of how to attach the functions to your UI buttons.
// document.getElementById('login-btn').addEventListener('click', initiateLogin);
// document.getElementById('logout-btn').addEventListener('click', handleLogout);