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

// --- Configuration (Dynamically updated from inputs) ---
let CLIENT_ID = clientIdInput.value;
let COGNITO_USER_POOL_DOMAIN = cognitoDomainInput.value;
let REDIRECT_URI = redirectUriInput.value;
let COGNITO_REGION = cognitoRegionInput.value;
const GRAPHQL_ENDPOINT = "https://hub.clearly.app/graphql";
let OAUTH_TOKEN_ENDPOINT = `https://${COGNITO_USER_POOL_DOMAIN}/oauth2/token`;

// Update config variables when input fields change
clientIdInput.addEventListener('input', (e) => CLIENT_ID = e.target.value);
cognitoDomainInput.addEventListener('input', (e) => {
    COGNITO_USER_POOL_DOMAIN = e.target.value;
    // Also update the token endpoint dynamically
    OAUTH_TOKEN_ENDPOINT = `https://${COGNITO_USER_POOL_DOMAIN}/oauth2/token`;
});
redirectUriInput.addEventListener('input', (e) => REDIRECT_URI = e.target.value);
cognitoRegionInput.addEventListener('input', (e) => COGNITO_REGION = e.target.value);

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

function updateLoggedInUI(accessToken, idToken) {
    accessTokenDisplay.textContent = accessToken;
    idTokenDisplay.textContent = idToken;
    authSection.classList.add('hidden');
    loggedInSection.classList.remove('hidden');
}

function updateLoggedOutUI() {
    accessTokenDisplay.textContent = '';
    idTokenDisplay.textContent = '';
    authSection.classList.remove('hidden');
    loggedInSection.classList.add('hidden');
}

// --- Core Authentication Flow ---
async function initiateLogin() {
    hideMessage();
    if (!COGNITO_USER_POOL_DOMAIN || !CLIENT_ID || !REDIRECT_URI || REDIRECT_URI.includes('<YOUR')) {
        showMessage('Please fill in all OUP IAM Configuration fields with your specific values.', 'error');
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
        updateLoggedInUI(data.access_token, data.id_token);
        showMessage('Successfully obtained live tokens from OUP!', 'success');

    } catch (error) {
        console.error('Token exchange error:', error);
        showMessage(`Authentication failed: ${error.message}. Check your configuration and try again.`, 'error');
        updateLoggedOutUI();
    }
}

function handleLogout() {
    hideMessage();
    localStorage.removeItem('accessToken');
    localStorage.removeItem('idToken');
    sessionStorage.removeItem('pkce_code_verifier');
    
    // To properly log out of Cognito, you would redirect to the logout endpoint.
    // This is a more complete logout process than just clearing local storage.
    const logoutUrl = `https://${COGNITO_USER_POOL_DOMAIN}/logout?client_id=${CLIENT_ID}&logout_uri=${encodeURIComponent(REDIRECT_URI)}`;
    window.location.href = logoutUrl;
}

async function getHubs(authenticated) {
    const accessToken = localStorage.getItem('accessToken');
    const headers = { 'Content-Type': 'application/json' };
    const query = `
        query GetHubs($rootHubsOnly: Boolean) {
            hubs(rootHubsOnly: $rootHubsOnly) {
                results {
                    ... on Hub {
                        _id
                        name
                        findability
                        type
                    }
                }
            }
        }
    `;
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
            ${authenticated ? `Authorization: Bearer <your-access-token>` : ''}
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
            showMessage('GraphQL query failed. Check the console for details.', 'error');
        }

    } catch (error) {
        console.error('API call error:', error);
        showMessage(`API call failed: ${error.message}. Check the console for details. (Likely a CORS issue or network problem)`, 'error');
    }
}

// --- Event Listeners and Initial Load Logic ---
launchAppBtn.addEventListener('click', () => {
    directorSection.classList.add('hidden');
    appSection.classList.remove('hidden');
});

loginBtn.addEventListener('click', initiateLogin);
logoutBtn.addEventListener('click', handleLogout);
callPublicApiBtn.addEventListener('click', () => getHubs(false));
callPrivateApiBtn.addEventListener('click', () => getHubs(true));

document.addEventListener('DOMContentLoaded', () => {
    const savedCognitoDomain = localStorage.getItem('cognitoUserPoolDomain');
    if (savedCognitoDomain) {
        cognitoDomainInput.value = savedCognitoDomain;
        COGNITO_USER_POOL_DOMAIN = savedCognitoDomain;
    }
    
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('code')) {
        directorSection.classList.add('hidden');
        appSection.classList.remove('hidden');
    }

    const code = urlParams.get('code');
    const codeVerifier = sessionStorage.getItem('pkce_code_verifier');

    if (code && codeVerifier) {
        window.history.replaceState({}, document.title, window.location.pathname);
        exchangeCodeForTokens(code, codeVerifier);
        sessionStorage.removeItem('pkce_code_verifier');
    } else if (localStorage.getItem('accessToken')) {
        updateLoggedInUI(localStorage.getItem('accessToken'), localStorage.getItem('idToken'));
        showMessage('You are already logged in.', 'info');
        directorSection.classList.add('hidden');
        appSection.classList.remove('hidden');
    } else {
        updateLoggedOutUI();
    }
});

cognitoDomainInput.addEventListener('change', (e) => {
    localStorage.setItem('cognitoUserPoolDomain', e.target.value);
});