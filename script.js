// --- UI Element references ---
const directorSection = document.getElementById('director-section');
const appSection = document.getElementById('app-section');
const launchAppBtn = document.getElementById('launch-app-btn');
const clientIdInput = document.getElementById('clientIdInput');
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
const apiResponseBox = document.getElementById('api-response-content');
const statusMessage = document.getElementById('status-message');
const jwtDisplaySection = document.getElementById('jwt-display-section');
const hubCountDisplay = document.getElementById('hub-count');
const hubsList = document.getElementById('hubs-list');

// btoa -> binary to ASCII: built-in JavaScript function that encodes a string in Base64

// --- Configuration ---
let CLIENT_ID;
let REDIRECT_URI;
let APP_NAME;
const GRAPHQL_ENDPOINT = "https://hub.clearly.app/graphql";
const BASE_COMPONENT_URL = "https://hub.clearly.app/components/";

// Constants
const COGNITO_USER_POOL_DOMAIN = "auth.clearly.app";
const COGNITO_REGION = "eu-central-1";
const OAUTH_TOKEN_ENDPOINT = `https://${COGNITO_USER_POOL_DOMAIN}/oauth2/token`;

// Defaults
const DEFAULT_APP_NAME = "IAM Test";
const DEFAULT_CLIENT_ID = "4u2og3j1vr8p8a4at1cl3jklbn";
const DEFAULT_REDIRECT_URI = "https://simaybtm.github.io/hub_externalapps/";

// Update config variables whenever the user changes the Client ID or Redirect URI
clientIdInput.addEventListener('input', (e) => {
    CLIENT_ID = e.target.value;
    localStorage.setItem('clientId', CLIENT_ID);
});
redirectUriInput.addEventListener('input', (e) => {
    REDIRECT_URI = e.target.value;
    localStorage.setItem('redirectUri', REDIRECT_URI);
});

// --- PKCE Helper Functions ---
// Function that makes a code verifier
function generateRandomString(length) {
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let text = '';
    for (let i = 0; i < length; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

// 
async function sha256(plain) {
    const encoder = new TextEncoder();
    const data = encoder.encode(plain);
    return window.crypto.subtle.digest('SHA-256', data);
}

// Encodes the string to Base64 URL format
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

// Function that hashes the code verifier into a code challenge
async function generateCodeChallenge(codeVerifier) {
    const hashed = await sha256(codeVerifier);
    return base64urlencode(hashed);
}

// --- UI Helper Functions ---
// Displays feedback to the user
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

// Switches between director view and app view
function setAppView(isAppVisible) {
    if (isAppVisible) {
        directorSection.classList.add('hidden');
        appSection.classList.remove('hidden');
    } else {
        directorSection.classList.remove('hidden');
        appSection.classList.add('hidden');
    }
}

// Toggles login vs logged-in UI and shows tokens if logged in
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
    if (!CLIENT_ID || !REDIRECT_URI) {
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

/*
-Takes the authorization code returned from login.
-Sends it to the OAuth token endpoint to get access token & ID token.
-Stores tokens in localStorage.
-Updates UI with token info and sets logged-in view.
*/
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
        showMessage(`Authentication failed: ${error.message}. Check your configuration and try again.`, 'error');
        setLoggedInView(false);
    }
}

/*
-Removes tokens from storage.
-Redirects to Clearly.Hub logout page.
*/
function handleLogout() {
    hideMessage();
    localStorage.removeItem('accessToken');
    localStorage.removeItem('idToken');
    sessionStorage.removeItem('pkce_code_verifier');
    
    const logoutUrl = `https://${COGNITO_USER_POOL_DOMAIN}/logout?client_id=${CLIENT_ID}&logout_uri=${encodeURIComponent(REDIRECT_URI)}`;
    window.location.href = logoutUrl;
}

// --- GraphQL Functions ---
async function graphqlRequest(query, variables = {}) {
    const token = localStorage.getItem("accessToken");
    const headers = { "Content-Type": "application/json" };
    if (token) {
        headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(GRAPHQL_ENDPOINT, {
        method: "POST",
        headers: headers,
        body: JSON.stringify({ query, variables }),
    });

    const result = await response.json();
    if (result.errors) {
        console.error("GraphQL Error:", result.errors);
        throw new Error(result.errors[0].message);
    }
    return result.data;
}

async function getHubs(authenticated) {
    const accessToken = localStorage.getItem('accessToken');
    const headers = { 'Content-Type': 'application/json' };
    
    const query = `query GetHubs($rootHubsOnly: Boolean) { hubs(rootHubsOnly: $rootHubsOnly) { results { ... on Hub { _id name findability type } } } }`;
    const variables = {
        rootHubsOnly: false
    };
    const requestBody = { query, variables };
    
    let responseMessage = "";
    
    if (authenticated) {
        if (!accessToken) {
            showMessage('No Access Token found. Please log in first.', 'error');
            return;
        }
        headers['Authorization'] = `Bearer ${accessToken}`;
        responseMessage = "This is a live API response from an authenticated hubs query. It returns all hubs you have access to.";
    } else {
        responseMessage = "This is a live API response from an unauthenticated hubs query. It only returns public hubs.";
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
            
            const hubs = data?.data?.hubs?.results;
            if (hubs) {
                hubsList.innerHTML = '';
                if (hubs.length > 0) {
                    hubCountDisplay.textContent = `Total Hubs: ${hubs.length}`;
                    hubs.forEach(hub => {
                        const listItem = document.createElement('li');
                        listItem.textContent = `${hub.name} (${hub.findability})`;
                        hubsList.appendChild(listItem);
                    });
                } else {
                    hubCountDisplay.textContent = 'No hubs found.';
                }
            }

        } else {
            apiResponseBox.textContent = `--- Error Response ---\n${JSON.stringify(data, null, 2)}`;
            showMessage('GraphQL query failed. Check the console for details.', 'error');
            hubsList.innerHTML = '';
            hubCountDisplay.textContent = 'Failed to load hubs.';
        }

    } catch (error) {
        console.error('API call error:', error);
        showMessage(`API call failed: ${error.message}. Check the console for details.`, 'error');
        hubsList.innerHTML = '';
        hubCountDisplay.textContent = 'Failed to load hubs.';
    }
}

// --- Billing  ---
/*
-Encodes client info in Base64 and redirects to Clearly.Hub Billing Component.
-Requires login, so it checks for the access token first.
*/
function handleManageBilling() {
    const accessToken = localStorage.getItem('accessToken');
    if (!accessToken) {
        showMessage('You must be logged in to manage your subscription. Please log in first.', 'error');
        return;
    }
    
    const payload = btoa(JSON.stringify({
        actions: ["SELECT_SUBSCRIPTION"],
        origin: REDIRECT_URI,
        client_id: CLIENT_ID,
    }));

    const billingUrl = `${BASE_COMPONENT_URL}${payload}`;
    showMessage('Redirecting to the Clearly.Hub Billing Component...', 'info');
    window.location.href = billingUrl;
}

// --- Event Listeners and Actions ---
launchAppBtn.addEventListener('click', () => {
    setAppView(true);
});

loginBtn.addEventListener('click', initiateLogin);
logoutBtn.addEventListener('click', handleLogout);
callPublicApiBtn.addEventListener('click', () => getHubs(false));
callPrivateApiBtn.addEventListener('click', () => getHubs(true));
manageBillingBtn.addEventListener('click', handleManageBilling);

// --- Page Load Logic ---
document.addEventListener('DOMContentLoaded', () => {
    // Set default values for input fields from localStorage or predefined defaults
    clientIdInput.value = localStorage.getItem('clientId') || DEFAULT_CLIENT_ID;
    redirectUriInput.value = localStorage.getItem('redirectUri') || DEFAULT_REDIRECT_URI;
    
    // Update global variables with the loaded values
    CLIENT_ID = clientIdInput.value;
    REDIRECT_URI = redirectUriInput.value;

    const urlParams = new URLSearchParams(window.location.search);
    if (localStorage.getItem('accessToken') || urlParams.get('code')) {
        setAppView(true);
    } else {
        setAppView(false);
    }
    
    const code = urlParams.get('code');
    const codeVerifier = sessionStorage.getItem('pkce_code_verifier');

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
        showMessage('You are logged out. Please log in to get started.', 'info');
    }
});