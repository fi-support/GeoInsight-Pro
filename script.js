// --- UI Element references ---
const directorSection = document.getElementById('director-section');
const appSection = document.getElementById('app-section');
const launchAppBtn = document.getElementById('launch-app-btn');
const clientIdInput = document.getElementById('clientIdInput');
const cognitoDomainInput = document.getElementById('cognitoDomainInput');
const redirectUriInput = document.getElementById('redirectUriInput');
const cognitoRegionInput = document.getElementById('cognitoRegionInput');
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const authSection = document.getElementById('auth-section');
const loggedInSection = document.getElementById('logged-in-section');
const accessTokenDisplay = document.getElementById('access-token');
const idTokenDisplay = document.getElementById('id-token');
const messageContainer = document.getElementById('message-container');
const callPublicApiBtn = document.getElementById('call-public-api-btn');
const callPrivateApiBtn = document.getElementById('call-private-api-btn');
const apiResponseSection = document.getElementById('api-response-section');
const apiRequestBox = document.getElementById('api-request-box');
const apiResponseBox = document.getElementById('api-response-box');
const loggedInStatus = document.getElementById('status-panel').querySelector('p.text-green-600');
const loggedOutStatus = document.getElementById('status-panel').querySelector('p.text-gray-600');
const jwtDisplaySection = document.getElementById('jwt-display-section');

// --- Configuration ---
let CLIENT_ID;
let COGNITO_USER_POOL_DOMAIN;
let REDIRECT_URI;
let COGNITO_REGION;
const GRAPHQL_ENDPOINT = "https://hub.clearly.app/graphql";
let OAUTH_TOKEN_ENDPOINT;

// Defaults
const DEFAULT_CLIENT_ID = "4u2og3j1vr8p8a4at1cl3jklbn";
const DEFAULT_COGNITO_DOMAIN = "auth.clearly.app";
const DEFAULT_REDIRECT_URI = "https://simaybtm.github.io/hub_externalapps/";
const DEFAULT_COGNITO_REGION = "eu-central-1";

// --- PKCE Helpers ---
function generateRandomString(length) {
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from({ length }, () => possible.charAt(Math.floor(Math.random() * possible.length))).join('');
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

// --- UI Helpers ---
function showMessage(message, type = 'info') {
    messageContainer.textContent = message;
    let bgColor, borderColor, textColor;
    if (type === 'error') {
        bgColor = 'bg-red-100'; borderColor = 'border-red-300'; textColor = 'text-red-800';
    } else if (type === 'success') {
        bgColor = 'bg-green-100'; borderColor = 'border-green-300'; textColor = 'text-green-800';
    } else {
        bgColor = 'bg-blue-100'; borderColor = 'border-blue-300'; textColor = 'text-blue-800';
    }
    messageContainer.className = `message-box mt-4 ${bgColor} ${borderColor} ${textColor}`;
    messageContainer.classList.remove('hidden');
}
function hideMessage() {
    messageContainer.classList.add('hidden');
}
function setAppView(isVisible) {
    directorSection.classList.toggle('hidden', isVisible);
    appSection.classList.toggle('hidden', !isVisible);
}
function setLoggedInView(isLoggedIn) {
    authSection.classList.toggle('hidden', isLoggedIn);
    loggedInSection.classList.toggle('hidden', !isLoggedIn);
    loggedInStatus.classList.toggle('hidden', !isLoggedIn);
    loggedOutStatus.classList.toggle('hidden', isLoggedIn);
    jwtDisplaySection.classList.toggle('hidden', !isLoggedIn);
}

// --- Auth Flow ---
async function initiateLogin() {
    // Always update config from inputs
    CLIENT_ID = clientIdInput.value.trim();
    COGNITO_USER_POOL_DOMAIN = cognitoDomainInput.value.trim();
    REDIRECT_URI = redirectUriInput.value.trim();
    COGNITO_REGION = cognitoRegionInput.value.trim();
    OAUTH_TOKEN_ENDPOINT = `https://${COGNITO_USER_POOL_DOMAIN}/oauth2/token`;

    hideMessage();
    if (!CLIENT_ID || !COGNITO_USER_POOL_DOMAIN || !REDIRECT_URI) {
        showMessage('Please fill in all OUP IAM Configuration fields.', 'error');
        return;
    }

    const cleanDomain = COGNITO_USER_POOL_DOMAIN.replace(/^https?:\/\//, '');
    const codeVerifier = generateRandomString(128);
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    sessionStorage.setItem('pkce_code_verifier', codeVerifier);

    const authUrl = `https://${cleanDomain}/oauth2/authorize?` +
        `response_type=code&` +
        `client_id=${CLIENT_ID}&` +
        `redirect_uri=${encodeURIComponent(REDIRECT_URI)}&` +
        `scope=openid+profile+email&` +
        `code_challenge=${codeChallenge}&` +
        `code_challenge_method=S256`;

    showMessage('Redirecting to OUP login page...', 'info');
    window.location.href = authUrl;
}

async function exchangeCodeForTokens(code, codeVerifier) {
    hideMessage();
    showMessage('Exchanging authorization code for tokens...', 'info');

    const body = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: CLIENT_ID,
        code: code,
        redirect_uri: REDIRECT_URI,
        code_verifier: codeVerifier
    });

    try {
        const response = await fetch(OAUTH_TOKEN_ENDPOINT, {
            method: 'POST',
            mode: 'cors',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString()
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error_description || 'Failed to exchange code for tokens');
        }

        const data = await response.json();
        localStorage.setItem('accessToken', data.access_token);
        localStorage.setItem('idToken', data.id_token);

        accessTokenDisplay.textContent = data.access_token;
        idTokenDisplay.textContent = data.id_token;

        setLoggedInView(true);
        showMessage('Successfully obtained live tokens from OUP!', 'success');
    } catch (error) {
        console.error('Token exchange error:', error);
        showMessage(`Authentication failed: ${error.message}`, 'error');
        setLoggedInView(false);
    }
}

function handleLogout() {
    hideMessage();
    localStorage.removeItem('accessToken');
    localStorage.removeItem('idToken');
    sessionStorage.removeItem('pkce_code_verifier');
    const logoutUrl = `https://${COGNITO_USER_POOL_DOMAIN}/logout?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;
    window.location.href = logoutUrl;
}

// --- API Calls ---
async function getHubs(authenticated) {
    const accessToken = localStorage.getItem('accessToken');
    const headers = { 'Content-Type': 'application/json' };

    const query = `query GetHubs($rootHubsOnly: Boolean) {
        hubs(rootHubsOnly: $rootHubsOnly) {
            results { ... on Hub { _id name findability type } }
        }
    }`;

    const variables = { rootHubsOnly: false };
    const requestBody = { query, variables };

    let responseMessage = authenticated
        ? "Authenticated query — returns all hubs you have access to."
        : "Public query — returns only public hubs.";

    if (authenticated) {
        if (!accessToken) {
            showMessage('No Access Token found. Please log in first.', 'error');
            return;
        }
        headers['Authorization'] = `Bearer ${accessToken}`;
    }

    const requestDetails = `
        URL: ${GRAPHQL_ENDPOINT}
        Method: POST
        Headers:
            Content-Type: application/json
            ${authenticated ? `Authorization: Bearer ${accessToken.substring(0, 10)}...` : ''}
        Body:
        ${JSON.stringify(requestBody, null, 2)}
    `;

    try {
        showMessage(`Making ${authenticated ? 'authenticated' : 'public'} GraphQL query...`, 'info');
        apiResponseSection.classList.remove('hidden');
        apiRequestBox.textContent = `--- Request ---\n${requestDetails}`;

        const response = await fetch(GRAPHQL_ENDPOINT, {
            method: 'POST',
            mode: 'cors',
            headers: headers,
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();

        if (response.ok) {
            apiResponseBox.textContent = `--- Response ---\n${responseMessage}\n\n${JSON.stringify(data, null, 2)}`;
            showMessage('GraphQL query successful!', 'success');
        } else {
            apiResponseBox.textContent = `--- Error Response ---\n${JSON.stringify(data, null, 2)}`;
            showMessage('GraphQL query failed.', 'error');
        }
    } catch (error) {
        console.error('API call error:', error);
        showMessage(`API call failed: ${error.message}`, 'error');
    }
}

// --- Init ---
launchAppBtn.addEventListener('click', () => setAppView(true));
loginBtn.addEventListener('click', initiateLogin);
logoutBtn.addEventListener('click', handleLogout);
callPublicApiBtn.addEventListener('click', () => getHubs(false));
callPrivateApiBtn.addEventListener('click', () => getHubs(true));

document.addEventListener('DOMContentLoaded', () => {
    clientIdInput.value = localStorage.getItem('clientId') || DEFAULT_CLIENT_ID;
    cognitoDomainInput.value = localStorage.getItem('cognitoUserPoolDomain') || DEFAULT_COGNITO_DOMAIN;
    redirectUriInput.value = localStorage.getItem('redirectUri') || DEFAULT_REDIRECT_URI;
    cognitoRegionInput.value = localStorage.getItem('cognitoRegion') || DEFAULT_COGNITO_REGION;

    CLIENT_ID = clientIdInput.value;
    COGNITO_USER_POOL_DOMAIN = cognitoDomainInput.value;
    REDIRECT_URI = redirectUriInput.value;
    COGNITO_REGION = cognitoRegionInput.value;
    OAUTH_TOKEN_ENDPOINT = `https://${COGNITO_USER_POOL_DOMAIN}/oauth2/token`;

    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const codeVerifier = sessionStorage.getItem('pkce_code_verifier');

    if (localStorage.getItem('accessToken') || code) {
        setAppView(true);
    }

    if (code && codeVerifier) {
        window.history.replaceState({}, document.title, window.location.pathname);
        exchangeCodeForTokens(code, codeVerifier);
        sessionStorage.removeItem('pkce_code_verifier');
    } else if (localStorage.getItem('accessToken')) {
        accessTokenDisplay.textContent = localStorage.getItem('accessToken');
        idTokenDisplay.textContent = localStorage.getItem('idToken');
        setLoggedInView(true);
        showMessage('You are already logged in.', 'info');
    } else {
        setLoggedInView(false);
    }
});

// Save input changes
[clientIdInput, cognitoDomainInput, redirectUriInput, cognitoRegionInput].forEach(input =>
    input.addEventListener('change', e => localStorage.setItem(e.target.id.replace('Input', ''), e.target.value))
);
