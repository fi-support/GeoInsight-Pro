// --- UI Element references ---
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const appContainer = document.getElementById('app-container');
const loginOverlay = document.getElementById('login-overlay');
const manageBillingBtn = document.getElementById('manage-billing-btn');
const mapContainer = document.getElementById('map');
const hubFilterSelect = document.getElementById('hub-filter-select');
const datasetSelect   = document.getElementById('dataset-select');
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
const heatmapBtn = document.getElementById('heatmap-btn');

// --- API Call Log ---
const apiCallLog = [];

function logApiCall(method, label, statusCode) {
    const entry = { method, label, statusCode, time: new Date() };
    apiCallLog.unshift(entry);

    const countEl = document.getElementById('api-log-count');
    const listEl = document.getElementById('api-log-list');
    if (!listEl) return;

    // Update badge count
    if (countEl) {
        countEl.textContent = apiCallLog.length;
        countEl.classList.remove('hidden');
    }

    // Remove empty state message if present
    const empty = listEl.querySelector('.log-empty-msg');
    if (empty) empty.remove();

    const ok = statusCode >= 200 && statusCode < 300;
    const methodClass = method === 'GET' ? 'log-method-get' : 'log-method-post';
    const statusClass = ok ? 'log-status-ok' : 'log-status-err';
    const timeStr = entry.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    const el = document.createElement('div');
    el.className = 'log-entry';
    el.innerHTML = `
        <span class="log-method ${methodClass}">${method}</span>
        <div class="log-entry-details">
            <div class="log-endpoint">${label}</div>
            <div class="log-meta"><span class="${statusClass}">${statusCode}</span> &middot; ${timeStr}</div>
        </div>`;
    listEl.prepend(el);
}

// --- State & Config Variables ---
let map = null;
let activeLayers = []; // [{ id, name, datasetId, wmsLayer, visible }]
let isAddMarkerMode = false;
let heatLayer = null;
let heatInterval = null;
let markerColorIndex = 0;
const ACTIVE_HUB_ID = "65f03b46fe2ac522c6ac7b95";
const ICONS = ['star', 'home', 'flag', 'car', 'glass', 'music', 'road'];
const MARKER_COLORS = ['red', 'darkred', 'orange', 'green', 'darkgreen', 'blue', 'purple', 'darkpurple', 'cadetblue'];
const SUBSCRIPTION_FEATURES = { 
    STARTER:      ["Map Viewer & Layer Loading", "Dataset Access"], 
    PROFESSIONAL: ["Map Viewer & Layer Loading", "Dataset Access", "Custom Map Markers"], 
    ENTERPRISE:   ["Map Viewer & Layer Loading", "Dataset Access", "Custom Map Markers", "Urban Activity Heatmap"]
};
const ALL_PLAN_FEATURES = [
    { label: 'Map Viewer & Layer Loading',  tiers: ['STARTER', 'PROFESSIONAL', 'ENTERPRISE'] },
    { label: 'Dataset Access',           tiers: ['STARTER', 'PROFESSIONAL', 'ENTERPRISE'] },
    { label: 'Custom Map Markers',       tiers: ['PROFESSIONAL', 'ENTERPRISE'] },
    { label: 'Urban Activity Heatmap',   tiers: ['ENTERPRISE'] },
];
const CLIENT_ID = "4u2og3j1vr8p8a4at1cl3jklbn";
const REDIRECT_URI = (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost')
    ? window.location.href.split('?')[0].split('#')[0]
    : "https://fi-support.github.io/GeoInsight-Pro/";
const COGNITO_USER_POOL_DOMAIN = "auth.clearly.app";
const OAUTH_TOKEN_ENDPOINT = `https://${COGNITO_USER_POOL_DOMAIN}/oauth2/token`;
const BASE_COMPONENT_URL = "https://hub.clearly.app/components/";
const GRAPHQL_ENDPOINT = "https://hub.clearly.app/graphql";


// --- Helper Functions ---
function getUserEmail() {
    try {
        const idToken = localStorage.getItem('idToken');
        if (!idToken) return null;
        const payload = JSON.parse(atob(idToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        return payload.email || payload['cognito:username'] || null;
    } catch (e) { return null; }
}

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

    const subscriptionName = (localStorage.getItem('subscriptionName') || 'STARTER').toUpperCase();
    let markerOptions = {};
    if (subscriptionName === 'PROFESSIONAL') {
        markerOptions.icon = L.AwesomeMarkers.icon({ icon: 'briefcase', prefix: 'fa', markerColor: 'orange' });
    } else if (subscriptionName === 'ENTERPRISE') {
        markerOptions.icon = L.AwesomeMarkers.icon({ icon: 'rocket', prefix: 'fa', markerColor: 'purple' });
    }
    L.marker([52.1601, 4.4970], markerOptions).addTo(map).bindPopup(`Leiden — ${subscriptionName} Plan`);

    map.on('click', onMapClick);
}

function addLayerToMap(datasetId, title, wmsUrl, layerName) {
    if (activeLayers.some(l => l.datasetId === datasetId)) {
        instructionText.textContent = `"${title}" is already on the map.`;
        return;
    }
    const id = `layer_${Date.now()}`;
    const baseUrl = wmsUrl.split('?')[0];
    const layer = L.tileLayer.wms(baseUrl, {
        layers: layerName, format: 'image/png', transparent: true
    }).addTo(map);
    layer.on('tileerror', () => console.error(`WMS tile error for layer: ${layerName}`));
    activeLayers.push({ id, name: title, datasetId, wmsLayer: layer, visible: true });
    renderLayersPanel();
    updateDatasetListActiveState();
}

function removeLayer(layerId) {
    const idx = activeLayers.findIndex(l => l.id === layerId);
    if (idx === -1) return;
    if (map) map.removeLayer(activeLayers[idx].wmsLayer);
    activeLayers.splice(idx, 1);
    renderLayersPanel();
    updateDatasetListActiveState();
}

function toggleLayerVisibility(layerId) {
    const layer = activeLayers.find(l => l.id === layerId);
    if (!layer || !map) return;
    layer.visible = !layer.visible;
    if (layer.visible) layer.wmsLayer.addTo(map);
    else map.removeLayer(layer.wmsLayer);
    renderLayersPanel();
}

function renderLayersPanel() {
    const overlay = document.getElementById('layers-overlay');
    const list    = document.getElementById('layers-list');
    const badge   = document.getElementById('layers-count');
    if (!list) return;

    if (badge) badge.textContent = activeLayers.length;
    if (overlay) overlay.classList.toggle('hidden', activeLayers.length === 0);

    if (activeLayers.length === 0) {
        list.innerHTML = '<p class="list-empty-msg" style="padding:0.5rem 0.75rem;">No active layers.</p>';
        return;
    }
    list.innerHTML = activeLayers.map(l => `
        <div class="layer-item ${l.visible ? '' : 'layer-hidden'}">
            <button class="layer-vis-btn" onclick="toggleLayerVisibility('${l.id}')" title="${l.visible ? 'Hide layer' : 'Show layer'}">
                ${l.visible
                    ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'
                    : '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'
                }
            </button>
            <span class="layer-name" title="${l.name}">${l.name}</span>
            <button class="layer-del-btn" onclick="removeLayer('${l.id}')" title="Remove layer">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
            </button>
        </div>`
    ).join('');
}

function updateDatasetListActiveState() {
    if (!datasetSelect) return;
    const activeIds = new Set(activeLayers.map(l => l.datasetId));
    Array.from(datasetSelect.options).forEach(opt => {
        if (!opt.value) return;
        const added = activeIds.has(opt.value);
        opt.disabled = added;
        if (added && !opt.text.startsWith('\u2713 ')) opt.text = '\u2713 ' + opt.text;
        else if (!added && opt.text.startsWith('\u2713 ')) opt.text = opt.text.slice(2);
    });
}

function zoomToDatasetExtent(coordinates) {
    if (!coordinates || !coordinates[0] || coordinates[0].length < 3) return;
    const bounds = coordinates[0].map(c => [c[1], c[0]]);
    map.flyToBounds(bounds);
}

function onMapClick(e) {
    const subscriptionName = (localStorage.getItem('subscriptionName') || 'STARTER').toUpperCase();
    if (isAddMarkerMode) {
        if (subscriptionName !== 'PROFESSIONAL' && subscriptionName !== 'ENTERPRISE') return;
        const selectedIcon = iconSelect.value;
        const markerColor = MARKER_COLORS[markerColorIndex];
        markerColorIndex = (markerColorIndex + 1) % MARKER_COLORS.length;
        L.marker(e.latlng, {
            icon: L.AwesomeMarkers.icon({ icon: selectedIcon, prefix: 'fa', markerColor: markerColor })
        }).addTo(map).bindPopup(`A new '${selectedIcon}' marker!`);
        toggleAddMarkerMode();
    } else if (isAddMarkerMode) {
        toggleAddMarkerMode();
    }
}

function toggleAddMarkerMode() {
    isAddMarkerMode = !isAddMarkerMode;
    mapContainer.classList.toggle('map-add-marker', isAddMarkerMode);
    addMarkerBtn.textContent = isAddMarkerMode ? 'Cancel' : 'Add Marker';
    addMarkerBtn.classList.toggle('btn-secondary', isAddMarkerMode);
    instructionText.textContent = isAddMarkerMode ? 'Click the map to place a marker.' : 'Select a WMS dataset to display it on the map.';
}

// --- Heatmap Analysis (ENTERPRISE) ---
function generateHeatData() {
    const c = map.getCenter();
    const hotspots = [
        { lat: c.lat,        lng: c.lng,        w: 1.0, s: 0.014 },
        { lat: c.lat + 0.02, lng: c.lng + 0.03, w: 0.75, s: 0.009 },
        { lat: c.lat - 0.01, lng: c.lng - 0.02, w: 0.6,  s: 0.011 },
        { lat: c.lat + 0.01, lng: c.lng - 0.03, w: 0.5,  s: 0.008 },
    ];
    const pts = [];
    hotspots.forEach(h => {
        const n = Math.round(90 * h.w);
        for (let i = 0; i < n; i++) {
            pts.push([
                h.lat + (Math.random() - 0.5) * h.s * 2,
                h.lng + (Math.random() - 0.5) * h.s * 2,
                h.w * (0.35 + Math.random() * 0.65)
            ]);
        }
    });
    return pts;
}

function toggleHeatmap() {
    if (heatLayer) {
        clearInterval(heatInterval); heatInterval = null;
        map.removeLayer(heatLayer);  heatLayer = null;
        heatmapBtn.textContent = 'Generate Activity Heatmap';
        heatmapBtn.classList.remove('btn-secondary');
        instructionText.textContent = 'Select a WMS dataset to display it on the map.';
    } else {
        heatLayer = L.heatLayer(generateHeatData(), {
            radius: 30, blur: 20, maxZoom: 16,
            gradient: { 0.2: '#3b82f6', 0.45: '#06b6d4', 0.65: '#f59e0b', 0.85: '#ef4444' }
        }).addTo(map);
        heatmapBtn.textContent = 'Clear Heatmap';
        heatmapBtn.classList.add('btn-secondary');
        instructionText.textContent = 'Showing live urban activity simulation — refreshing every 3s.';
        heatInterval = setInterval(() => { if (heatLayer) heatLayer.setLatLngs(generateHeatData()); }, 3000);
    }
}

// --- API / Data Fetching Functions ---
async function graphqlRequest(query, variables) {
    const token = localStorage.getItem("accessToken");
    const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
    const response = await fetch(GRAPHQL_ENDPOINT, { method: "POST", headers, body: JSON.stringify({ query, variables }) });
    const statusCode = response.status;
    // Extract a readable operation name for the log
    const opMatch = query.match(/(?:query|mutation)\s+(\w+)/i);
    const opName = opMatch ? opMatch[1] : 'graphql';
    logApiCall('POST', `GraphQL · ${opName}`, statusCode);
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

async function getWfsTypeNameFromCapabilities(wfsUrl) {
    const base = wfsUrl.split('?')[0];
    try {
        const res = await fetch(`${base}?service=WFS&version=2.0.0&request=GetCapabilities`);
        if (!res.ok) throw new Error(`GetCapabilities returned ${res.status}`);
        const xml = await res.text();
        const doc = new DOMParser().parseFromString(xml, 'text/xml');
        const nameEl = doc.querySelector('FeatureType > Name') || doc.querySelector('Name');
        if (nameEl) return nameEl.textContent.trim();
        throw new Error('No FeatureType found in WFS Capabilities');
    } catch (e) {
        console.error('WFS GetCapabilities failed:', e);
        return null;
    }
}

function showMapError(msg) {
    instructionText.textContent = msg;
    instructionText.classList.add('note-error');
    setTimeout(() => instructionText.classList.remove('note-error'), 6000);
}

async function addWfsLayerToMap(datasetId, title, wfsUrl) {
    const base = wfsUrl.split('?')[0];

    // Discover feature type name via WFS GetCapabilities
    const typeName = await getWfsTypeNameFromCapabilities(wfsUrl);
    if (!typeName) {
        showMapError(`\u201c${title}\u201d \u2014 could not determine WFS feature type. The service may not be publicly accessible.`);
        return;
    }

    const url = `${base}?service=WFS&version=2.0.0&request=GetFeature&typeNames=${encodeURIComponent(typeName)}&outputFormat=application/json&count=500`;
    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`server returned ${res.status}`);
        const geojson = await res.json();
        if (!geojson.features?.length) throw new Error('no features in response');
        const layer = L.geoJSON(geojson, {
            style: { color: '#2563eb', weight: 2, fillOpacity: 0.08 },
            onEachFeature(feature, lyr) {
                const props = Object.entries(feature.properties || {}).slice(0, 6)
                    .map(([k, v]) => `<b>${k}</b>: ${v}`).join('<br>');
                if (props) lyr.bindPopup(props);
            }
        }).addTo(map);
        activeLayers.push({ id: `layer_${Date.now()}`, name: `${title} [WFS]`, datasetId, wmsLayer: layer, visible: true });
        renderLayersPanel();
        updateDatasetListActiveState();
        try { map.fitBounds(layer.getBounds(), { maxZoom: 14 }); } catch {}
        instructionText.textContent = `\u201c${title}\u201d (WFS) added to the map.`;
        instructionText.classList.remove('note-error');
    } catch (e) {
        showMapError(`\u201c${title}\u201d could not be loaded (WFS): ${e.message}`);
        console.error('WFS load failed:', e);
    }
}

async function populateHubFilter() {
    loader.classList.remove('hidden');
    try {
        const query = `query DatasetsForHubFilter($activeHubId: String) {
            datasets(activeHubId: $activeHubId, limit: 500) {
                results { _id ownerHub { _id name } resources { format } }
            }
        }`;
        const data = await graphqlRequest(query, { activeHubId: ACTIVE_HUB_ID });
        const datasets = data?.datasets?.results || [];

        // Build hub map: id -> { name, hasWMS }
        const hubMap = {};
        datasets.forEach(d => {
            if (!d.ownerHub) return;
            const { _id, name } = d.ownerHub;
            if (!hubMap[_id]) hubMap[_id] = { name, hasWMS: false };
            if (d.resources?.some(r => r.format === 'WMS' || r.format === 'WFS')) hubMap[_id].hasWMS = true;
        });

        hubFilterSelect.innerHTML = '<option value="">Select an owner hub…</option>';
        Object.entries(hubMap)
            .sort(([, a], [, b]) => a.name.localeCompare(b.name))
            .forEach(([id, { name, hasWMS }]) => {
                const opt = new Option(hasWMS ? name : `${name} — no WMS datasets`, id);
                if (!hasWMS) opt.disabled = true;
                hubFilterSelect.add(opt);
            });
        hubFilterSelect.disabled = false;
    } catch (e) {
        console.error('Failed to populate hub filter:', e);
    } finally {
        loader.classList.add('hidden');
    }
}

async function populateDatasetList(ownerHubId) {
    if (!datasetSelect) return;
    if (!ownerHubId) {
        datasetSelect.innerHTML = '<option value="">Select a dataset to add\u2026</option>';
        datasetSelect.disabled = true;
        return;
    }
    datasetSelect.innerHTML = '<option value="">Loading\u2026</option>';
    datasetSelect.disabled = true;
    loader.classList.remove('hidden');
    try {
        const query = `query DatasetsByOwner($ownerHubId: String, $activeHubId: String) {
            datasets(activeHubId: $activeHubId, query: { ownerHubId: $ownerHubId }, limit: 500) {
                results { _id title resources { format } }
            }
        }`;
        const data = await graphqlRequest(query, { ownerHubId, activeHubId: ACTIVE_HUB_ID });
        const datasets = (data?.datasets?.results || []).filter(d =>
            d.resources?.some(r => r.format === 'WMS' || r.format === 'WFS')
        );

        if (!datasets.length) {
            datasetSelect.innerHTML = '<option value="">No WMS/WFS datasets for this hub</option>';
            return;
        }
        const activeIds = new Set(activeLayers.map(l => l.datasetId));
        datasetSelect.innerHTML = '<option value="">Select a dataset to add\u2026</option>';
        datasets.forEach(d => {
            const added = activeIds.has(d._id);
            const fmt = d.resources.find(r => r.format === 'WMS' || r.format === 'WFS')?.format || '';
            const opt = new Option(`${added ? '\u2713 ' : ''}${d.title}  [${fmt}]`, d._id);
            if (added) opt.disabled = true;
            datasetSelect.add(opt);
        });
        datasetSelect.disabled = false;
    } catch (e) {
        datasetSelect.innerHTML = '<option value="">Failed to load datasets</option>';
        console.error('Failed to load dataset list:', e);
    } finally {
        loader.classList.add('hidden');
    }
}

async function handleDatasetSelection(datasetId) {
    if (!datasetId) return;
    if (activeLayers.some(l => l.datasetId === datasetId)) {
        instructionText.textContent = 'This dataset is already on the map.';
        return;
    }
    loader.classList.remove('hidden');
    mapContainer.style.opacity = '0.5';
    try {
        const query = `query Dataset($_id:String!,$activeHubId:String){dataset(_id:$_id,activeHubId:$activeHubId){_id title spatial{coordinates}resources{url format}}}`;
        const variables = { _id: datasetId, activeHubId: ACTIVE_HUB_ID };
        const data = await graphqlRequest(query, variables);
        const dataset = data.dataset;
        const wmsResource = dataset.resources.find(r => r.format === 'WMS');
        if (wmsResource?.url) {
            const layerName = await getWmsLayerNameFromCapabilities(wmsResource.url);
            if (layerName) {
                addLayerToMap(datasetId, dataset.title, wmsResource.url, layerName);
                if (dataset.spatial?.coordinates) zoomToDatasetExtent(dataset.spatial.coordinates);
                instructionText.textContent = `“${dataset.title}” added to the map.`;
                instructionText.classList.remove('note-error');
            } else {
                showMapError(`“${dataset.title}” — could not determine the WMS layer name. The service may be unavailable.`);
            }
        } else {
            const wfsResource = dataset.resources.find(r => r.format === 'WFS');
            if (wfsResource?.url) await addWfsLayerToMap(datasetId, dataset.title, wfsResource.url);
        }
    } catch (e) {
        console.error('Failed to fetch dataset details:', e);
    } finally {
        loader.classList.add('hidden');
        mapContainer.style.opacity = '1';
    }
}

// --- Subscription & UI ---
function updateFeaturesDisplay(subscriptionName) {
    const KNOWN_TIERS = ['STARTER', 'PROFESSIONAL', 'ENTERPRISE'];
    const isKnownTier = KNOWN_TIERS.includes(subscriptionName);

    // Update tier badge
    const tierLabel = isKnownTier
        ? subscriptionName.charAt(0) + subscriptionName.slice(1).toLowerCase()
        : 'No Plan';
    subscriptionNameSpan.textContent = tierLabel;
    subscriptionNameSpan.className = `sub-tier-badge tier-${subscriptionName.toLowerCase()}`;

    // Update feature list
    featuresList.innerHTML = '';
    if (!isKnownTier) {
        const li = document.createElement('li');
        li.className = 'sub-feature-empty';
        li.textContent = 'Sign in and select a plan to see your features.';
        featuresList.appendChild(li);
    } else {
        ALL_PLAN_FEATURES.forEach(f => {
            const included = f.tiers.includes(subscriptionName);
            const li = document.createElement('li');
            li.className = `sub-feature-item ${included ? 'feat-included' : 'feat-excluded'}`;
            li.innerHTML = `<span class="feat-icon">${included ? '✓' : '○'}</span>${f.label}`;
            featuresList.appendChild(li);
        });
    }

    // Show/hide interactive feature controls
    markerControls.classList.remove('hidden');
    bezierControls.classList.remove('hidden');

    if (subscriptionName === 'PROFESSIONAL' || subscriptionName === 'ENTERPRISE') {
        markerUnlocked.classList.remove('hidden'); markerLocked.classList.add('hidden');
    } else {
        markerUnlocked.classList.add('hidden'); markerLocked.classList.remove('hidden');
    }

    if (subscriptionName === 'ENTERPRISE') {
        bezierUnlocked.classList.remove('hidden'); bezierLocked.classList.add('hidden');
    } else {
        bezierUnlocked.classList.add('hidden'); bezierLocked.classList.remove('hidden');
    }
}

function updateSubscriptionDisplay() {
    const subName = (localStorage.getItem('subscriptionName') || 'NONE').toUpperCase();
    updateFeaturesDisplay(subName);
}

// Maps any name returned by Clearly.Hub (including old tier names) to current tier keys
function normalizeSubscriptionName(rawName) {
    const n = (rawName || '').toUpperCase().trim();
    const aliases = { BREAD: 'STARTER', STEAK: 'PROFESSIONAL', WAGYU: 'ENTERPRISE' };
    return aliases[n] || n;
}

// Fetches the user's active subscription from the platform on login
async function fetchAndApplySubscription() {
    const token = localStorage.getItem('accessToken');
    if (!token) return;
    // Skip if a subscription was already set (e.g. just returned from billing redirect)
    if (localStorage.getItem('subscriptionName')) return;
    try {
        // Step 1: Resolve the Clearly.Hub App ID from the SSO client ID
        const appsRes = await fetch(
            `https://hub.clearly.app/api/apps?ssoClientId=${encodeURIComponent(CLIENT_ID)}`,
            { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }
        );
        if (!appsRes.ok) return;
        logApiCall('GET', 'REST · apps (resolve app id)', appsRes.status);
        const appsData = await appsRes.json();
        const appId = appsData?.results?.[0]?._id;
        if (!appId) return;

        // Step 2: Fetch the user's subscriptions for this app
        const subRes = await fetch(
            `https://hub.clearly.app/api/me/app-subscriptions/${appId}`,
            { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }
        );
        if (!subRes.ok) return;
        logApiCall('GET', 'REST · me/app-subscriptions', subRes.status);
        const subData = await subRes.json();

        const subs = subData?.userAppSubscriptions || [];
        // Prefer a subscription for the active hub; fall back to the first one
        const activeSub = subs.find(s => s.subscribedByHub?._id === ACTIVE_HUB_ID) || subs[0];
        if (activeSub?.subscriptionModel) {
            // Prefer externalReference (set by the app dev on Clearly.Hub) over the display name
            const tierKey = activeSub.subscriptionModel.externalReference || activeSub.subscriptionModel.name;
            const normalized = normalizeSubscriptionName(tierKey);
            console.log('[Subscription] Fetched from API — raw:', tierKey, '→ normalized:', normalized);
            localStorage.setItem('subscriptionName', normalized);
            updateSubscriptionDisplay();
        }
    } catch (e) {
        console.warn('Could not fetch subscription status:', e);
    }
}

function setLoggedInView(isLoggedIn) {
    if (isLoggedIn) {
        appContainer.classList.remove('app-locked');
        loginOverlay.classList.add('hidden');
        logoutBtn.classList.remove('hidden');
        manageBillingBtn.disabled = false;

        // Show user email in header
        const email = getUserEmail();
        const emailEl = document.getElementById('user-email-display');
        if (emailEl && email) { emailEl.querySelector('span').textContent = email; emailEl.classList.remove('hidden'); }

        initializeMap();
        updateSubscriptionDisplay();
        fetchAndApplySubscription();
        populateHubFilter();
    } else {
        appContainer.classList.add('app-locked');
        loginOverlay.classList.remove('hidden');
        logoutBtn.classList.add('hidden');
        hubFilterSelect.disabled = true;
        hubFilterSelect.innerHTML = '<option value="">Login to see hubs...</option>';
        if (datasetSelect) {
            datasetSelect.innerHTML = '<option value="">Select a dataset to add\u2026</option>';
            datasetSelect.disabled = true;
        }
        manageBillingBtn.disabled = true;

        const emailEl = document.getElementById('user-email-display');
        if (emailEl) emailEl.classList.add('hidden');

        activeLayers.forEach(l => { try { if (map) map.removeLayer(l.wmsLayer); } catch {} });
        activeLayers = [];
        renderLayersPanel();

        if (map) { map.remove(); map = null; }
        updateSubscriptionDisplay();
    }
}

// --- OAuth & Billing ---
function parseBillingData(dataParam) {
    if (!dataParam) return null;
    try {
        // Handle JWT format (header.payload.signature) — what the billing component returns
        const parts = dataParam.split('.');
        if (parts.length === 3) {
            const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
            const pad = (4 - b64.length % 4) % 4;
            const decoded = JSON.parse(atob(b64 + '='.repeat(pad)));
            console.log('[Billing] Decoded JWT payload:', decoded);
            return decoded;
        }
        // Fallback: plain base64-encoded JSON
        const decoded = JSON.parse(atob(dataParam));
        console.log('[Billing] Decoded base64 payload:', decoded);
        return decoded;
    } catch (e) {
        console.error('[Billing] parseBillingData failed:', e);
        return null;
    }
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
        logApiCall('POST', 'OAuth2 Token Exchange · Cognito', response.status);
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
    const payload = btoa(JSON.stringify({ actions: ["SELECT_SUBSCRIPTION"], redirect_url: REDIRECT_URI, client_id: CLIENT_ID }));
    window.location.href = `${BASE_COMPONENT_URL}${payload}`;
}

// --- Event Listeners ---
loginBtn.addEventListener('click', initiateLogin);
logoutBtn.addEventListener('click', handleLogout);
manageBillingBtn.addEventListener('click', handleManageBilling);
addMarkerBtn.addEventListener('click', toggleAddMarkerMode);
heatmapBtn.addEventListener('click', toggleHeatmap);
hubFilterSelect.addEventListener('change', e => populateDatasetList(e.target.value));
datasetSelect?.addEventListener('change', e => {
    if (e.target.value) {
        handleDatasetSelection(e.target.value);
        setTimeout(() => { if (datasetSelect) datasetSelect.value = ''; }, 80);
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
        if (d?.response?.subscription) {
            const sub = d.response.subscription;
            const tierKey = sub.externalReference || sub.name;
            console.log('[Billing] Redirect subscription:', sub, '→ tierKey:', tierKey);
            if (tierKey) localStorage.setItem('subscriptionName', normalizeSubscriptionName(tierKey));
        }
    }
    if (code && codeVerifier) exchangeCodeForTokens(code, codeVerifier);
    else if (localStorage.getItem('accessToken')) setLoggedInView(true);
    else setLoggedInView(false);
});