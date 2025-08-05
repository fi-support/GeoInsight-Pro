let tokens = { access_token: "", id_token: "" };

function showIAMPage() {
    document.getElementById('welcome-page').style.display = 'none';
    document.getElementById('iam-page').style.display = 'block';
}

function showWelcomePage() {
    document.getElementById('iam-page').style.display = 'none';
    document.getElementById('welcome-page').style.display = 'block';
}

function login() {
    const clientId = document.getElementById('clientId').value;
    const domain = document.getElementById('cognitoDomain').value;
    const redirectUri = encodeURIComponent(document.getElementById('redirectUri').value);

    const url = `https://${domain}/login?client_id=${clientId}&response_type=token&scope=openid+profile&redirect_uri=${redirectUri}`;
    window.location.href = url;
}

function logout() {
    const clientId = document.getElementById('clientId').value;
    const domain = document.getElementById('cognitoDomain').value;
    const redirectUri = encodeURIComponent(document.getElementById('redirectUri').value);

    const url = `https://${domain}/logout?client_id=${clientId}&logout_uri=${redirectUri}`;
    window.location.href = url;
}

function getPublicHubs() {
    fetch("https://hub.clearly.app/graphql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "{ hubs { name type } }" })
    })
    .then(res => res.json())
    .then(data => {
        renderHubs(data.data.hubs);
    });
}

function getAuthenticatedHubs() {
    fetch("https://hub.clearly.app/graphql", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + tokens.access_token
        },
        body: JSON.stringify({ query: "{ hubs { name type } }" })
    })
    .then(res => res.json())
    .then(data => {
        renderHubs(data.data.hubs);
    });
}

function renderHubs(hubs) {
    const list = document.getElementById('hubsList');
    list.innerHTML = "";
    hubs
        .filter(hub => hub.name && hub.type && hub.name !== "undefined" && hub.type !== "undefined")
        .forEach(hub => {
            const li = document.createElement('li');
            li.textContent = `${hub.name} (${hub.type})`;
            list.appendChild(li);
        });
}

// Parse token from URL hash
window.onload = function() {
    const hash = window.location.hash.substr(1);
    const params = new URLSearchParams(hash);
    if (params.get("access_token")) {
        tokens.access_token = params.get("access_token");
        tokens.id_token = params.get("id_token");

        document.getElementById("accessToken").innerText = tokens.access_token;
        document.getElementById("idToken").innerText = tokens.id_token;
        showIAMPage();
    }
};
