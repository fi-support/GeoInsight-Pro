// --- UI Element references ---
const directorSection = document.getElementById('director-section');
const appSection = document.getElementById('app-section');
const launchAppBtn = document.getElementById('launch-app-btn');
const clientIdInput = document.getElementById('clientIdInput');
const appNameInput = document.getElementById('appNameInput');
const redirectUriInput = document.getElementById('redirectUriInput');
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const authSection = document.getElementById('auth-section');
const loggedInSection = document.getElementById('logged-in-section');
const accessTokenDisplay = document.getElementById('access-token');
const idTokenDisplay = document.getElementById('id-token');
const messageContainer = document.getElementById('message-container');
const callPublicApiBtn = document.getElementById('call-public-api-btn');
const callPrivateApiBtn = document.getElementById('call-private-api-btn');
const manageBillingBtn = document.getElementById('manage-billing-btn');
const apiResponseSection = document.getElementById('api-response-section');
const apiRequestBox = document.getElementById('api-request-box');
const apiResponseBox = document.getElementById('api-response-box');
const statusMessage = document.getElementById('status-message');
const jwtDisplaySection = document.getElementById('jwt-display-section');
const hubCountDisplay = document.getElementById('hub-count');
const hubsList = document.getElementById('hubs-list');

// --- Configuration ---
let CLIENT_ID = localStorage.getItem('clientId') || "4u2og3j1vr8p8a4at1cl3jklbn";
let REDIRECT_URI = localStorage.getItem('redirectUri') || "https://simaybtm.github.io/hub_externalapps/";
let APP_NAME = localStorage.getItem('appName') || "IAM Test";

const GRAPHQL_ENDPOINT = "https://hub.clearly.app/graphql";
const BASE_COMPONENT_URL = "https://hub.clearly.app/components/";
const APP_NAME_FOR_BILLING = "Testing IAM";

const COGNITO_USER_POOL_DOMAIN = "auth.clearly.app";
const COGNITO_REGION = "eu-central-1";
const OAUTH_TOKEN_ENDPOINT = `https://${COGNITO_USER_POOL_DOMAIN}/oauth2/token`;

// Initialize input fields with saved/default values
clientIdInput.value = CLIENT_ID;
redirectUriInput.value = REDIRECT_URI;
appNameInput.value = APP_NAME;

// --- Update config variables on input changes ---
clientIdInput.addEventListener('input', (e) => {
    CLIENT_ID = e.target.value;
    localStorage.setItem('clientId', CLIENT_ID);
});
redirectUriInput.addEventListener('input', (e) => {
    REDIRECT_URI = e.target.value;
    localStorage.setItem('redirectUri', REDIRECT_URI);
});
appNameInput.addEventListener('input', (e) => {
    APP_NAME = e.target.value;
    localStorage.setItem('appName', APP_NAME);
});

// --- PKCE Helper Functions ---
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
    return btoa(str)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
}

async function generateCodeChallenge(codeVerifier) {
    const hashed = await sha256(codeVerifier);
    return base64urlencode(hashed);
}

// --- UI Helper Functions ---
function showMessage(message, type = 'info') {
    messageContainer.textContent = message;
    let bgColor, borderColor, textColor;
    if (type === 'error') {
        bgColor = 'bg-red-100';
        borderColor = 'border-red-300';
        textColor = 'text-red-800';
    } else if (type === 'success') {
        bgColor = 'bg-green-100';
        borderColor = 'border-green-300';
        textColor = 'text-green-800';
    } else { // info
        bgColor = 'bg-blue-100';
        borderColor = 'border-blue-300';
        textColor = 'text-blue-800';
    }
    messageContainer.className = `message-box mt-4 ${bgColor} ${borderColor} ${textColor}`;
    messageContainer.classList.remove('hidden');
}

function hideMessage() {
    messageContainer.classList.add('hidden');
}

function setAppView(isAppVisible) {
    if (isAppVisible) {
        directorSection.classList.add('hidden');
        appSection.classList.remove('hidden');
    } else {
        directorSection.classList.remove('hidden');
        appSection.classList.add('hidden');
    }
}

function setLoggedInView(isLoggedIn) {
    if (isLoggedIn) {
        authSection.classList.add('hidden');
        loggedInSection.classList.remove('hidden');
        statusMessage.textContent = "Successfully Logged In!";
        statusMessage.classList.remove('text-gray-600');
        statusMessage.classList.add('text-green-600');
        jwtDisplaySection.classList.remove('hidden');
    } else {
        authSection.classList.remove('hidden');
        loggedInSection.classList.add('hidden');
        statusMessage.textContent = "Click a button on the left to get started.";
        statusMessage.classList.add('text-gray-600');
        statusMessage.classList.remove('text-green-600');
        jwtDisplaySection.classList.add('hidden');
        hubsList.innerHTML = '';
        hubCountDisplay.textContent = '';
    }
}

// --- Core Authentication Flow ---
async function initiateLogin() {
    hideMessage();
    if (!CLIENT_ID || !APP_NAME || !REDIRECT_URI) {
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
        await getUserSubscriptions();

    } catch (error) {
        console.error('Token exchange error:', error);
        showMessage(`Authentication failed: ${error.message}. Check your configuration and try again.`, 'error');
        setLoggedInView(false);
    }
}

function handleLogout() {
    hideMessage();
    localStorage.removeItem('accessToken');
    localStorage.removeItem('idToken');
    sessionStorage.removeItem('pkce_code_verifier');

    const logoutUrl = `https://${COGNITO_USER_POOL_DOMAIN}/logout?client_id=${CLIENT_ID}&logout_uri=${encodeURIComponent(REDIRECT_URI)}`;
    window.location.href = logoutUrl;
}

// --- GraphQL Helper Functions ---
async function graphqlRequest(query, variables = {}) {
    const token = localStorage.getItem("accessToken");
    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const body = JSON.stringify({ query, variables });

    const response = await fetch(GRAPHQL_ENDPOINT, {
        method: "POST",
        headers,
        body,
    });
    if (!response.ok) {
        throw new Error(`GraphQL request failed: ${response.statusText}`);
    }
    return response.json();
}

// --- Subscription Check and App Launch ---
async function getUserSubscriptions() {
    try {
        const query = `
            query {
                subscriptions {
                    nodes {
                        id
                        displayName
                        isActive
                        product {
                            id
                            name
                        }
                    }
                }
            }
        `;
        const result = await graphqlRequest(query);
        if (result.errors) {
            console.error(result.errors);
            showMessage('Failed to get subscriptions.', 'error');
            return;
        }
        const subscriptions = result.data.subscriptions.nodes;
        if (subscriptions.length === 0) {
            showMessage('No subscriptions found.', 'error');
            return;
        }
        // Display subscriptions (optional UI update)
        hubsList.innerHTML = '';
        subscriptions.forEach(sub => {
            const li = document.createElement('li');
            li.textContent = `${sub.displayName} (${sub.isActive ? 'Active' : 'Inactive'})`;
            hubsList.appendChild(li);
        });
        hubCountDisplay.textContent = `Found ${subscriptions.length} subscriptions`;

        // Check for active subscription matching the app
        const activeSubscription = subscriptions.find(s => s.isActive && s.displayName === APP_NAME_FOR_BILLING);
        if (activeSubscription) {
            showMessage('Active subscription found. You can launch the app.', 'success');
            launchAppBtn.disabled = false;
        } else {
            showMessage('No active subscription found for this app.', 'error');
            launchAppBtn.disabled = true;
        }
    } catch (error) {
        console.error('Subscription check error:', error);
        showMessage(`Error checking subscriptions: ${error.message}`, 'error');
    }
}

function launchApp() {
    if (!APP_NAME) {
        showMessage('App name is not configured.', 'error');
        return;
    }
    const appUrl = BASE_COMPONENT_URL + APP_NAME;
    setAppView(true);
    launchAppBtn.disabled = true;
    showMessage(`Launching app: ${APP_NAME}`, 'info');
    window.open(appUrl, '_blank');
}

// --- Billing Management ---
async function openBillingPortal() {
    showMessage('Opening billing portal...', 'info');
    const accessToken = localStorage.getItem('accessToken');
    if (!accessToken) {
        showMessage('You must be logged in to manage billing.', 'error');
        return;
    }
    const query = `
        mutation OpenBillingPortal($input: OpenBillingPortalInput!) {
            openBillingPortal(input: $input) {
                url
            }
        }
    `;
    const variables = { input: { appName: APP_NAME_FOR_BILLING } };

    try {
        const result = await graphqlRequest(query, variables);
        if (result.errors) {
            throw new Error(result.errors[0].message);
        }
        const billingUrl = result.data.openBillingPortal.url;
        window.open(billingUrl, '_blank');
        showMessage('Billing portal opened in a new tab.', 'success');
    } catch (error) {
        console.error('Billing portal error:', error);
        showMessage(`Failed to open billing portal: ${error.message}`, 'error');
    }
}

// --- Event Listeners ---
loginBtn.addEventListener('click', initiateLogin);
logoutBtn.addEventListener('click', handleLogout);
launchAppBtn.addEventListener('click', launchApp);
manageBillingBtn.addEventListener('click', openBillingPortal);

callPublicApiBtn.addEventListener('click', async () => {
    try {
        const response = await fetch('https://hub.clearly.app/api/v1/health');
        const text = await response.text();
        apiResponseBox.textContent = text;
        showMessage('Public API called successfully.', 'success');
    } catch (error) {
        showMessage(`Failed to call public API: ${error.message}`, 'error');
    }
});

callPrivateApiBtn.addEventListener('click', async () => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
        showMessage('You must be logged in to call the private API.', 'error');
        return;
    }
    try {
        const response = await fetch('https://hub.clearly.app/api/v1/userinfo', {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error('Failed to call private API');
        const data = await response.json();
        apiResponseBox.textContent = JSON.stringify(data, null, 2);
        showMessage('Private API called successfully.', 'success');
    } catch (error) {
        showMessage(`Failed to call private API: ${error.message}`, 'error');
    }
});

// --- On page load: check if redirected back with code to exchange for tokens ---
window.addEventListener('load', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    if (code) {
        // Remove code param from URL to keep it clean
        window.history.replaceState({}, document.title, window.location.pathname);

        const codeVerifier = sessionStorage.getItem('pkce_code_verifier');
        if (!codeVerifier) {
            showMessage('PKCE code verifier not found. Please login again.', 'error');
            return;
        }
        await exchangeCodeForTokens(code, codeVerifier);
    } else {
        // If tokens already exist, show logged-in view
        const accessToken = localStorage.getItem('accessToken');
        const idToken = localStorage.getItem('idToken');
        if (accessToken && idToken) {
            accessTokenDisplay.textContent = accessToken;
            idTokenDisplay.textContent = idToken;
            setLoggedInView(true);
            await getUserSubscriptions();
        } else {
            setLoggedInView(false);
            launchAppBtn.disabled = true;
        }
    }
});
