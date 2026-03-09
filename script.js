// --- UI Element references ---
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const appContainer = document.getElementById('app-container');
const loginOverlay = document.getElementById('login-overlay');
const manageBillingBtn = document.getElementById('manage-billing-btn');
const mapContainer = document.getElementById('map');
const hubDatasetsSelect = document.getElementById('hub-datasets-select');
const allDatasetsSelect = document.getElementById('all-datasets-select');
const loader = document.getElementById('loader');
const subscriptionNameSpan = document.getElementById('subscription-name');
const featuresList = document.getElementById('features-list');
const instructionText = document.getElementById('instruction-text');
const markerControls = document.getElementById('marker-controls');
const markerUnlocked = document.getElementById('marker-unlocked');
const markerLocked = document.getElementById('marker-locked');
const addMarkerBtn = document.getElementById('add-marker-btn');
const iconSelect = document.getElementById('icon-select');
const bezierControls = document.getElementById('bezier-controls');
const bezierUnlocked = document.getElementById('bezier-unlocked');
const bezierLocked = document.getElementById('bezier-locked');
const drawLineBtn = document.getElementById('draw-line-btn');
const finishLineBtn = document.getElementById('finish-line-btn');
const functionList = document.getElementById('function-list');

// Backend Simulation References
const simulationControls = document.getElementById('simulation-controls');
const runSimulationBtn = document.getElementById('run-simulation-btn');
const backendPayloadCode = document.getElementById('backend-payload');

// --- State & Config Variables ---
let map = null;
let wmsLayer = null;
let isAddMarkerMode = false;
let isDrawingLine = false;
let linePoints = [];
let tempPolyline = null;
let markerColorIndex = 0;
const ACTIVE_HUB_ID = "65f03b46fe2ac522c6ac7b95";
const ICONS = ['star', 'home', 'flag', 'car', 'glass', 'music', 'road'];
const MARKER_COLORS = ['red', 'darkred', 'orange', 'green', 'darkgreen', 'blue', 'purple', 'darkpurple', 'cadetblue'];
const SUBSCRIPTION_FEATURES = { 
    BREAD: ["Basic Map Access"], 
    STEAK: ["Basic Map Access", "Awesome Markers"], 
    WAGYU: ["Basic Map Access", "Awesome Markers", "Animated Line Drawing"] 
};
const CLIENT_ID = "4u2og3j1vr8p8a4at1cl3jklbn";
const REDIRECT_URI = "http://127.0.0.1:5500/";
const COGNITO_USER_POOL_DOMAIN = "auth.clearly.app";
const OAUTH_TOKEN_ENDPOINT = `https://${COGNITO_USER_POOL_DOMAIN}/oauth2/token`;
const BASE_COMPONENT_URL = "https://hub.clearly.app/components/";
const GRAPHQL_ENDPOINT = "https://hub.clearly.app/graphql";
const PLANE_ICON_SVG = `data:image/svg+xml;base64,${btoa('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M21.4,12.6l-5.7-1.3L13.4,6c-0.2-0.5-0.9-0.5-1.1,0L10,11.3l-5.7,1.3c-0.5,0.1-0.5,0.8,0,0.9l5.7,1.3L12.3,20c0.2,0.5,0.9,0.5,1.1,0l2.3-5.3l5.7-1.3C21.9,13.4,21.9,12.7,21.4,12.6z"/></svg>')}`;

// --- Helper Functions ---
function generateRandomString(length) {
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let text = '';
    for (let i = 0; i < length; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

async function sha256(plain) {
    const data = new TextEncoder().encode(plain);
    return window.crypto.subtle.digest('SHA-256', data);
}

function base64urlencode(buffer) {
    let s = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
        s += String.fromCharCode(bytes[i]);
    }
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function generateCodeChallenge(verifier) {
    const hashed = await sha256(verifier);
    return base64urlencode(hashed);
}

// --- Map Functions ---
function initializeMap() {
    if (map) return;
    map = L.map(mapContainer).setView([52.1601, 4.4970], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    const subscriptionName = (sessionStorage.getItem('subscriptionName') || 'BREAD').toUpperCase();
    let markerOptions = {};
    if (subscriptionName === 'STEAK') {
        markerOptions.icon = L.AwesomeMarkers.icon({ icon: 'cutlery', prefix: 'fa', markerColor: 'orange' });
    } else if (subscriptionName === 'WAGYU') {
        markerOptions.icon = L.AwesomeMarkers.icon({ icon: 'rocket', prefix: 'fa', markerColor: 'darkpurple' });
    }
    L.marker([52.1601, 4.4970], markerOptions).addTo(map).bindPopup(`Leiden (${subscriptionName} Tier)`);

    map.on('click', onMapClick);
}

function addWmsLayerToMap(url, layerName) {
    if (wmsLayer) map.removeLayer(wmsLayer);
    const baseUrl = url.split('?')[0];
    wmsLayer = L.tileLayer.wms(baseUrl, {
        layers: layerName,
        format: 'image/png',
        transparent: true
    }).addTo(map);
    wmsLayer.on('tileerror', e => {
        console.error("WMS Tile Error:", e);
        alert(`Could not load map layer: "${layerName}".`);
    });
}

function zoomToDatasetExtent(coordinates) {
    if (!coordinates || !coordinates[0] || coordinates[0].length < 3) return;
    const bounds = coordinates[0].map(c => [c[1], c[0]]);
    map.flyToBounds(bounds);
}

function onMapClick(e) {
    const subscriptionName = (sessionStorage.getItem('subscriptionName') || 'BREAD').toUpperCase();
    if (isAddMarkerMode) {
        if (subscriptionName !== 'STEAK' && subscriptionName !== 'WAGYU') return;
        const selectedIcon = iconSelect.value;
        const markerColor = MARKER_COLORS[markerColorIndex];
        markerColorIndex = (markerColorIndex + 1) % MARKER_COLORS.length;
        L.marker(e.latlng, {
            icon: L.AwesomeMarkers.icon({ icon: selectedIcon, prefix: 'fa', markerColor: markerColor })
        }).addTo(map).bindPopup(`A new '${selectedIcon}' marker!`);
        toggleAddMarkerMode();
    } else if (isDrawingLine) {
        if (subscriptionName !== 'WAGYU') return;
        linePoints.push(e.latlng);
        if (tempPolyline) {
            tempPolyline.addLatLng(e.latlng);
        } else {
            tempPolyline = L.polyline([e.latlng], { color: '#8b5cf6', dashArray: '5, 5' }).addTo(map);
        }
        instructionText.textContent = 'Click to add more points, or click "Finish Drawing".';
    }
}

function toggleAddMarkerMode() {
    if (isDrawingLine) toggleDrawLineMode();
    isAddMarkerMode = !isAddMarkerMode;
    mapContainer.classList.toggle('map-add-marker', isAddMarkerMode);
    addMarkerBtn.textContent = isAddMarkerMode ? 'Cancel' : 'Enter Add Marker Mode';
    addMarkerBtn.classList.toggle('btn-secondary', isAddMarkerMode);
    instructionText.textContent = isAddMarkerMode ? 'Click the map to place a marker.' : 'Select a WMS dataset to display it on the map.';
}

function toggleDrawLineMode() {
    if (isAddMarkerMode) toggleAddMarkerMode();
    isDrawingLine = !isDrawingLine;
    mapContainer.classList.toggle('map-draw-line', isDrawingLine);
    drawLineBtn.textContent = isDrawingLine ? 'Cancel Drawing' : 'Draw Animated Line';
    drawLineBtn.classList.toggle('btn-secondary', isDrawingLine);
    finishLineBtn.classList.toggle('hidden', !isDrawingLine);
    instructionText.textContent = isDrawingLine ? 'Click on the map to start drawing your line.' : 'Select a WMS dataset to display it on the map.';
    if (!isDrawingLine) {
        if (tempPolyline) map.removeLayer(tempPolyline);
        tempPolyline = null;
        linePoints = [];
    }
}

function finishDrawingLine() {
    if (linePoints.length < 2) {
        alert("Please add at least two points to draw a line.");
        return;
    }
    if (!L.bezier) {
        console.error("Leaflet.Bezier plugin not loaded");
        alert("Bezier plugin failed to load. Check the script tag URL.");
        return;
    }
    const start = linePoints[0];
    const end = linePoints[linePoints.length - 1];
    const bezier = L.bezier({ path: [[start, end]], icon: { path: PLANE_ICON_SVG } }, {
        color: '#8b5cf6',
        dashArray: 8,
        weight: 2,
        opacity: 0.9,
        iconTravelLength: 1,
        iconMaxWidth: 30,
        iconMaxHeight: 30,
        fullAnimatedTime: 7000,
        easeOutPiece: 4,
        easeOutTime: 2500
    }).addTo(map);
    toggleDrawLineMode();
}

// --- API / Data Fetching Functions ---
async function graphqlRequest(query, variables) {
    const token = localStorage.getItem("accessToken");
    const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
    const response = await fetch(GRAPHQL_ENDPOINT, { method: "POST", headers, body: JSON.stringify({ query, variables }) });
    if (!response.ok) throw new Error(`GraphQL request failed: ${response.status}`);
    const result = await response.json();
    if (result.errors) throw new Error(result.errors[0].message);
    return result.data;
}

async function fetchAllDatasets(variablesBase) {
    const query = `query datasets($limit:Int,$offset:Int,$query:DatasetsFilterQueryInput,$activeHubId:String,$sort:String){datasets(limit:$limit, offset:$offset, query:$query, activeHubId:$activeHubId, sort:$sort){ results{ _id title resources{ format } } } }`;
    const allResults = [];
    let offset = 0;
    const pageSize = 50;
    while (true) {
        const vars = { ...variablesBase, limit: pageSize, offset };
        const data = await graphqlRequest(query, vars);
        const results = data.datasets.results;
        if (!results.length) break;
        allResults.push(...results);
        if (results.length < pageSize) break;
        offset += pageSize;
    }
    return allResults;
}

async function getWmsLayerNameFromCapabilities(wmsUrl) {
    const baseUrl = wmsUrl.split('?')[0];
    const capabilitiesUrl = `${baseUrl}?service=WMS&request=GetCapabilities`;
    try {
        const response = await fetch(capabilitiesUrl);
        if (!response.ok) throw new Error(`GetCapabilities failed: ${response.status}`);
        const xmlText = await response.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, "text/xml");
        const layerNameElement = xmlDoc.querySelector("Layer[queryable='1'] > Name") || xmlDoc.querySelector("Layer > Name");
        if (layerNameElement) return layerNameElement.textContent;
        throw new Error("Could not find layer name in Capabilities.");
    } catch (e) {
        console.error("Failed to get WMS Capabilities:", e);
        return null;
    }
}

async function populateDatasetDropdowns() {
    loader.classList.remove('hidden');
    try {
        const createOption = dataset => {
            const isWms = dataset.resources.some(r => r.format === 'WMS');
            const optionText = isWms ? `${dataset.title} (WMS)` : dataset.title;
            const option = new Option(optionText, dataset._id);
            if (!isWms) option.disabled = true;
            return option;
        };
        hubDatasetsSelect.innerHTML = '<option value="">Select a dataset...</option>';
        allDatasetsSelect.innerHTML = '<option value="">Select a dataset...</option>';

        const hubVars = {
            activeHubId: ACTIVE_HUB_ID,
            query: { hubId: ACTIVE_HUB_ID, datasetHubStatus: ["OWNED_BY_HUB","FINDABLE_BY_HUB","FAVORITE"] }
        };
        const hubResults = await fetchAllDatasets(hubVars);
        hubResults.forEach(d => hubDatasetsSelect.add(createOption(d)));

        const allVars = {
            activeHubId: ACTIVE_HUB_ID,
            query: { tags: [], ownerHubId: "", formats: [], withDefinedGeoExtent: false },
            sort: "-score"
        };
        const allResults = await fetchAllDatasets(allVars);
        allResults.forEach(d => allDatasetsSelect.add(createOption(d)));
    } catch (e) {
        console.error("Failed to fetch datasets:", e);
    } finally {
        loader.classList.add('hidden');
    }
}

async function handleDatasetSelection(datasetId) {
    if (!datasetId) { if (wmsLayer) map.removeLayer(wmsLayer); return; }
    loader.classList.remove('hidden');
    mapContainer.style.opacity = '0.5';
    try {
        const query = `query Dataset($_id:String!,$activeHubId:String){dataset(_id:$_id,activeHubId:$activeHubId){spatial{coordinates}resources{url format}}}`;
        const variables = { _id: datasetId, activeHubId: ACTIVE_HUB_ID };
        const data = await graphqlRequest(query, variables);
        const dataset = data.dataset;
        const wmsResource = dataset.resources.find(r => r.format === 'WMS');
        if (wmsResource && wmsResource.url) {
            const layerName = await getWmsLayerNameFromCapabilities(wmsResource.url);
            if (layerName) addWmsLayerToMap(wmsResource.url, layerName);
            else alert("Could not automatically determine the layer name for this WMS service. Please select another dataset.");
        } else if (wmsLayer) map.removeLayer(wmsLayer);
        if (dataset.spatial && dataset.spatial.coordinates) zoomToDatasetExtent(dataset.spatial.coordinates);
    } catch (e) {
        console.error("Failed to fetch dataset details:", e);
    } finally {
        loader.classList.add('hidden');
        mapContainer.style.opacity = '1';
    }
}

// --- Subscription & UI ---
function updateFeaturesDisplay(subscriptionName) {
    featuresList.innerHTML = '';
    const features = SUBSCRIPTION_FEATURES[subscriptionName] || ["Select a subscription to see your features."];
    features.forEach(f => { const li = document.createElement('li'); li.textContent = f; featuresList.appendChild(li); });

    markerControls.classList.remove('hidden');
    bezierControls.classList.remove('hidden');

    if (subscriptionName === 'STEAK' || subscriptionName === 'WAGYU') { markerUnlocked.classList.remove('hidden'); markerLocked.classList.add('hidden'); }
    else { markerUnlocked.classList.add('hidden'); markerLocked.classList.remove('hidden'); }

    if (subscriptionName === 'WAGYU') { bezierUnlocked.classList.remove('hidden'); bezierLocked.classList.add('hidden'); }
    else { bezierUnlocked.classList.add('hidden'); bezierLocked.classList.remove('hidden'); }
}

function updateSubscriptionDisplay() {
    const subName = (sessionStorage.getItem('subscriptionName') || 'None').toUpperCase();
    subscriptionNameSpan.textContent = subName === 'NONE' ? 'None' : subName;
    updateFeaturesDisplay(subName);
}

function setLoggedInView(isLoggedIn) {
    if (isLoggedIn) {
        appContainer.classList.remove('app-locked');
        loginOverlay.classList.add('hidden');
        logoutBtn.classList.remove('hidden');
        hubDatasetsSelect.disabled = false;
        allDatasetsSelect.disabled = false;
        manageBillingBtn.disabled = false;
        
        if (simulationControls) simulationControls.classList.remove('hidden');

        initializeMap();
        updateSubscriptionDisplay();
        populateDatasetDropdowns();
    } else {
        appContainer.classList.add('app-locked');
        loginOverlay.classList.remove('hidden');
        logoutBtn.classList.add('hidden');
        hubDatasetsSelect.disabled = true;
        allDatasetsSelect.disabled = true;
        manageBillingBtn.disabled = true;
        
        if (simulationControls) simulationControls.classList.add('hidden');

        if (map) { map.remove(); map = null; }
        updateSubscriptionDisplay();
    }
}

// --- OAuth & Billing ---
function parseBillingData(dataParam) { 
    try { return JSON.parse(atob(dataParam)); } catch (e) { return null; } 
}

async function initiateLogin() {
    const verifier = generateRandomString(128);
    sessionStorage.setItem('pkce_code_verifier', verifier);
    const challenge = await generateCodeChallenge(verifier);
    const url = `https://${COGNITO_USER_POOL_DOMAIN}/oauth2/authorize?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=openid+profile+email&code_challenge=${challenge}&code_challenge_method=S256`;
    window.location.href = url;
}

async function exchangeCodeForTokens(code, verifier) {
    const body = new URLSearchParams({ grant_type: 'authorization_code', client_id: CLIENT_ID, code, redirect_uri: REDIRECT_URI, code_verifier: verifier });
    try {
        const response = await fetch(OAUTH_TOKEN_ENDPOINT, { method: 'POST', mode: 'cors', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() });
        if (!response.ok) { const errorData = await response.json(); throw new Error(errorData.error_description || 'Token exchange failed'); }
        const data = await response.json();
        localStorage.setItem('accessToken', data.access_token);
        localStorage.setItem('idToken', data.id_token);
        setLoggedInView(true);
    } catch (e) { console.error('Token exchange error:', e); setLoggedInView(false); }
}

function handleLogout() {
    localStorage.clear();
    sessionStorage.clear();
    const url = `https://${COGNITO_USER_POOL_DOMAIN}/logout?client_id=${CLIENT_ID}&logout_uri=${encodeURIComponent(REDIRECT_URI)}`;
    window.location.href = url;
}

function handleManageBilling() {
    const token = localStorage.getItem('accessToken');
    if (!token) return;
    const payload = btoa(JSON.stringify({ actions: ["SELECT_SUBSCRIPTION"], origin: REDIRECT_URI, client_id: CLIENT_ID }));
    window.location.href = `${BASE_COMPONENT_URL}${payload}`;
}

// --- Event Listeners ---
loginBtn.addEventListener('click', initiateLogin);
logoutBtn.addEventListener('click', handleLogout);
manageBillingBtn.addEventListener('click', handleManageBilling);
addMarkerBtn.addEventListener('click', toggleAddMarkerMode);
drawLineBtn.addEventListener('click', toggleDrawLineMode);
finishLineBtn.addEventListener('click', finishDrawingLine);
hubDatasetsSelect.addEventListener('change', e => handleDatasetSelection(e.target.value));
allDatasetsSelect.addEventListener('change', e => handleDatasetSelection(e.target.value));

// --- NEW: Dat.Mobility Backend Simulation ---
runSimulationBtn.addEventListener('click', async () => {
    // 1. Get the current bounding box of the map (the "Extent")
    const bounds = map.getBounds();
    const boundingBox = [
        [bounds.getSouthWest().lat, bounds.getSouthWest().lng],
        [bounds.getNorthEast().lat, bounds.getNorthEast().lng]
    ];

    // 2. The exact URL you generated from webhook.site!
    const webhookUrl = "https://webhook.site/d44c2970-a0a6-4494-8de3-7db8b39a015a";

    // 3. Construct the exact JSON payload
    const simulatedPayload = {
        scenario: "standard_traffic_flow",
        bounding_box: boundingBox,
        platform_context: {
            hub_id: ACTIVE_HUB_ID,
            subscription_tier: sessionStorage.getItem('subscriptionName') || 'BREAD',
            trigger_source: "clearly_hub_map_viewer"
        }
    };

    // 4. Update the UI Script Panel so you can see it locally
    backendPayloadCode.textContent = JSON.stringify(simulatedPayload, null, 2);
    hljs.highlightElement(backendPayloadCode);
    const backendTabBtn = document.querySelector('.tab-btn[data-tab="backend"]');
    if (backendTabBtn) backendTabBtn.click();
    
    // 5. ACTUAL NETWORK CALL: Send the data to webhook.site using fetch()
    try {
        const response = await fetch(webhookUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                // Notice we are passing the custom OUP headers here:
                "X-OUP-Hub-ID": ACTIVE_HUB_ID, 
                "X-OUP-User-ID": "cognito_user_99823",
                "Authorization": "Bearer <OUP_INTERNAL_SYSTEM_TOKEN>"
            },
            body: JSON.stringify(simulatedPayload)
        });

        console.log("Webhook fired! Server responded with status:", response.status);

        // Visual feedback on the map to confirm it sent successfully
        const boundsRect = L.rectangle(bounds, {color: "#10b981", weight: 2, fillOpacity: 0.1}).addTo(map);
        boundsRect.bindPopup("Traffic Simulation Payload Sent! Check your webhook.site dashboard.").openPopup();

    } catch (error) {
        console.error("Failed to send webhook:", error);
        alert("Failed to send the request to webhook.site. Check the browser console.");
    }
});

// --- Script Panel Injection & Page Load Logic ---
document.addEventListener('DOMContentLoaded', () => {
    // Populate icons
    ICONS.forEach(icon => iconSelect.add(new Option(icon.charAt(0).toUpperCase() + icon.slice(1), icon)));

    // OAuth / billing redirect handling
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const codeVerifier = sessionStorage.getItem('pkce_code_verifier');
    const dataFromBilling = urlParams.get('data');
    if (code || dataFromBilling) window.history.replaceState({}, document.title, window.location.pathname);
    if (dataFromBilling) {
        const d = parseBillingData(dataFromBilling);
        if (d && d.subscription && d.subscription.name) sessionStorage.setItem('subscriptionName', d.subscription.name.toUpperCase());
    }
    if (code && codeVerifier) exchangeCodeForTokens(code, codeVerifier);
    else if (localStorage.getItem('accessToken')) setLoggedInView(true);
    else setLoggedInView(false);
});