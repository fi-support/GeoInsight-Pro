// A guide to connecting an external app to the Clearly.Hub IAM.

// --- 1. CONFIGURATION: Your App's Credentials and Redirect URI ---
//
// These are the parameters your app needs to communicate with the Clearly.Hub.
// IMPORTANT: These values should be loaded from a secure source in a production app.
// For this example, we'll store them in localStorage for persistence during development.

const config = {
    // [1] CLIENT_ID: The unique ID for your app, obtained from the Clearly.Hub.
    // This identifies your app to the authentication server.
    clientId: localStorage.getItem('clientId') || 'YOUR_CLIENT_ID_GOES_HERE',

    // [2] COGNITO_DOMAIN: The base URL for the Clearly.Hub's hosted UI.
    // This is the domain where the login page is located.
    cognitoDomain: localStorage.getItem('cognitoDomain') || 'auth.clearly.app',

    // [3] REDIRECT_URI: The exact URL where the Clearly.Hub will redirect the user after login.
    // This must be an exact match of a URL registered in your Clearly.Hub app settings.
    redirectUri: localStorage.getItem('redirectUri') || 'YOUR_REDIRECT_URI_GOES_HERE',

    // [4] OAUTH_TOKEN_ENDPOINT: The URL for exchanging the authorization code for a token.
    // This is derived from your Cognito domain.
    get tokenEndpoint() {
        return `https://${this.cognitoDomain}/oauth2/token`;
    },

    // [5] OAUTH_AUTH_ENDPOINT: The URL for initiating the login flow.
    // This is derived from your Cognito domain.
    get authEndpoint() {
        return `https://${this.cognitoDomain}/oauth2/authorize`;
    },

    // A flag to easily switch between demo and live mode
    isLiveMode: false, // Set to 'true' to make real API calls
};


// --- 2. THE AUTHENTICATION FLOW ---
//
// This section contains the core functions for the authentication process,
// which is built on the OAuth 2.0 Authorization Code Grant Flow with PKCE.

// --- Helper functions for PKCE (Proof Key for Code Exchange) ---
// PKCE is a security standard that protects public clients (like your browser app)
// from authorization code interception attacks. You can use these functions as-is.

function generateRandomString(length) {
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let text = '';
    for (let i = 0; i < length; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
async function sha256(plain) {
    const encoder = new TextEncoder();
    const data = encoder.encode(plain);
    return window.crypto.subtle.digest('SHA-256', data);
}
function base64urlencode(buffer) {
    const bytes = new Uint8Array(buffer);
    let str = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        str += String.fromCharCode(bytes[i]);
    }
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
async function generateCodeChallenge(codeVerifier) {
    const hashed = await sha256(codeVerifier);
    return base64urlencode(hashed);
}

// --- Main functions for the authentication flow ---

/**
 * [Step 1] Initiates the login process by redirecting to the Clearly.Hub's hosted UI.
 */
async function initiateLogin() {
    // 1. Generate the PKCE code_verifier and code_challenge for this request.
    const codeVerifier = generateRandomString(128);
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    sessionStorage.setItem('pkce_code_verifier', codeVerifier);

    // 2. Construct the login URL with all the required parameters.
    const authUrl = `${config.authEndpoint}?` +
        `response_type=code&` +
        `client_id=${config.clientId}&` +
        `redirect_uri=${encodeURIComponent(config.redirectUri)}&` +
        `scope=openid+profile+email&` + // Requesting basic user info
        `code_challenge=${codeChallenge}&` +
        `code_challenge_method=S256`; // Method used to create the challenge

    // 3. Redirect the user's browser to the login page.
    window.location.href = authUrl;
}

/**
 * [Step 2] Exchanges the authorization code for an Access Token and ID Token.
 * This is the crucial step after the user redirects back from the login page.
 */
async function exchangeCodeForTokens(code, codeVerifier) {
    const body = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: config.clientId,
        code: code,
        redirect_uri: config.redirectUri,
        code_verifier: codeVerifier,
    });

    if (config.isLiveMode) {
        // In a live application, this would make a real POST request to the token endpoint.
        try {
            const response = await fetch(config.tokenEndpoint, {
                method: 'POST',
                body: body,
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            });
            const data = await response.json();
            if (response.ok) {
                // Store the tokens and update the UI
                localStorage.setItem('accessToken', data.access_token);
                localStorage.setItem('idToken', data.id_token);
            } else {
                console.error("Token exchange failed:", data.error_description);
            }
        } catch (error) {
            console.error("Network error during token exchange:", error);
        }
    } else {
        // In this mock-up, we simulate the token exchange by generating dummy tokens.
        localStorage.setItem('accessToken', 'your-simulated-access-token');
        localStorage.setItem('idToken', 'your-simulated-id-token');
    }
}

/**
 * [Step 3] Handles the logout process by clearing tokens and redirecting the user.
 */
function handleLogout() {
    // 1. Clear the tokens from local storage to end the session.
    localStorage.removeItem('accessToken');
    localStorage.removeItem('idToken');
    sessionStorage.removeItem('pkce_code_verifier');

    // 2. Redirect the user to the Clearly.Hub's logout endpoint.
    // The server will clear its session for this user and redirect them back to the app.
    const logoutUrl = `${config.authEndpoint.replace('/authorize', '')}/logout?` +
        `client_id=${config.clientId}&` +
        `logout_uri=${encodeURIComponent(config.redirectUri)}`;

    window.location.href = logoutUrl;
}

// --- 3. INITIALIZATION: Tying it all together ---

// This function runs when the page loads to check the current state
// (logged in, logged out, or returning from a redirect).
function initializeApp() {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const storedCodeVerifier = sessionStorage.getItem('pkce_code_verifier');
    const accessToken = localStorage.getItem('accessToken');

    if (code && storedCodeVerifier) {
        // The user is returning from the login page with an authorization code.
        // We need to exchange this code for tokens.
        exchangeCodeForTokens(code, storedCodeVerifier);

    } else if (accessToken) {
        // The user is already logged in and has a valid token.
        // We can immediately show the authenticated view.
        // Note: A real app would also validate the token's expiry.
        // updateUiToLoggedInState(accessToken);

    } else {
        // The user is not authenticated. Show the login button.
        // updateUiToLoggedOutState();
    }
}

// Attach the main functions to your app's UI buttons here.
// For example:
// document.getElementById('login-btn').addEventListener('click', initiateLogin);
// document.getElementById('logout-btn').addEventListener('click', handleLogout);

// Run the initialization function when the page is fully loaded.
document.addEventListener('DOMContentLoaded', initializeApp);