const SERVER_URL = "http://100.68.176.80:3000";
// DEFAUULT MA HAMRO PYARO BIRATNAGAR LOL
const START_POS = [26.4525, 87.2718]


const ROLE_PREFIX = { ambulance: 'AMB', delivery: 'DEL', vendor: 'VEN', normal: 'GST' };
const ROLE_COLORS = {
    ambulance: '#ef4444', 
    delivery: '#10b981',  
    vendor: '#f59e0b',    
    normal: '#6366f1'     
};

let map, socket;
let myMarker, myPath, routeLayer;
let remoteMarkers = {};
let remoteUsers = {};

let currentUser = {
    role: 'normal',
    id: 'Guest',
    lat: START_POS[0],
    lng: START_POS[1]
};

// --- UI ELEMENTS ---
const roleSelect = document.getElementById('role-select');
const userIdInput = document.getElementById('user-id');
const sidebarToggle = document.getElementById('sidebar-toggle');
const sidebar = document.getElementById('sidebar');

// --- INITIALIZATION ---
function initMap() {
    map = L.map('map', { zoomControl: false }).setView(START_POS, 15);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; CARTO'
    }).addTo(map);

    myMarker = L.circleMarker(START_POS, {
        radius: 8, color: 'white', weight: 2, fillColor: ROLE_COLORS.normal, fillOpacity: 1
    }).addTo(map).bindPopup("<b>You</b>");

    myPath = L.polyline([], { color: ROLE_COLORS.normal, dashArray: '5, 10' }).addTo(map);
    map.on('click', handleRouteRequest);
}

if (sidebarToggle) {
    sidebarToggle.addEventListener('click', () => {
        sidebar.classList.toggle('open');
        setTimeout(() => map.invalidateSize(), 300);
    });
}

function generateUserId(role) {
    return `${ROLE_PREFIX[role] || 'USR'}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
}

function autoFillUserId(force = false) {
    if (!roleSelect || !userIdInput) return;
    userIdInput.value = generateUserId(roleSelect.value);
}

if (roleSelect) {
    roleSelect.addEventListener('change', () => autoFillUserId(true));
}

// --- CORE FUNCTIONS ---
function login() {
    const selectedRole = document.getElementById('role-select').value;
    const enteredId = document.getElementById('user-id').value.trim();
    
    currentUser.role = selectedRole;
    currentUser.id = enteredId || generateUserId(selectedRole);
    
    document.getElementById('reg-overlay').style.display = 'none';
    updateMyUI();
    connectSocket();

    setInterval(simulateMovement, 2000); 
}

function useGuestMode() {
    document.getElementById('reg-overlay').style.display = 'none';
    connectSocket();
    setInterval(simulateMovement, 2000);
}

function connectSocket() {
    socket = io(SERVER_URL);
    
    socket.on('connect', () => {
        console.log("Connected to Batoo Network");
        socket.emit('register', currentUser);
    });

    socket.on('currentUsers', handleUserSnapshot);
    socket.on('updateUserList', handleUserSnapshot);
    socket.on('userJoined', (user) => addOrUpdateRemoteUser(user));
    socket.on('userMoved', (data) => updateRemoteMarker(data));
    socket.on('userLeft', (id) => removeRemoteUser(id));
}

function updateMyUI() {
    const color = ROLE_COLORS[currentUser.role];
    myMarker.setStyle({ fillColor: color });
    myPath.setStyle({ color: color });
    document.getElementById('my-role-text').innerText = `${currentUser.role.toUpperCase()} (${currentUser.id})`;
    document.getElementById('my-role-icon').innerText = 
        currentUser.role === 'ambulance' ? '🚑' : 
        currentUser.role === 'delivery' ? '📦' : 
        currentUser.role === 'vendor' ? '🏪' : '👤';
}

function renderUserList(users = []) {
    const list = document.getElementById('user-list');
    if (!list) return;
    list.innerHTML = "";

    users.forEach(u => {
        if (u.publicId === currentUser.id) return;
        const div = document.createElement('div');
        div.className = `user-card ${u.role}`;
        div.style.borderLeft = `4px solid ${ROLE_COLORS[u.role]}`;
        div.style.padding = "10px";
        div.style.marginBottom = "5px";
        div.style.background = "rgba(255,255,255,0.05)";
        div.innerHTML = `<strong>${u.publicId}</strong><br><small>${u.role.toUpperCase()}</small>`;
        list.appendChild(div);
    });
}

// --- DATA HANDLING ---
function handleUserSnapshot(users = []) {
    remoteUsers = {};
    users.forEach(u => {
        if (u.publicId !== currentUser.id) {
            remoteUsers[u.socketId] = u;
            updateRemoteMarker(u);
        }
    });
    renderUserList(Object.values(remoteUsers));
}

function addOrUpdateRemoteUser(user) {
    if (!user || user.publicId === currentUser.id) return;
    remoteUsers[user.socketId] = user;
    updateRemoteMarker(user);
    renderUserList(Object.values(remoteUsers));
}

function updateRemoteMarker(data) {
    if (!data.lat || !data.lng || !map) return;
    const color = ROLE_COLORS[data.role] || '#94a3b8';
    
    if (remoteMarkers[data.socketId]) {
        remoteMarkers[data.socketId].setLatLng([data.lat, data.lng]);
    } else {
        remoteMarkers[data.socketId] = L.circleMarker([data.lat, data.lng], {
            radius: 6, color: color, fillColor: color, fillOpacity: 0.8, weight: 1
        }).addTo(map);
    }
    remoteMarkers[data.socketId].bindPopup(`${data.role.toUpperCase()}: ${data.publicId}`);
}

function removeRemoteUser(socketId) {
    if (remoteMarkers[socketId]) map.removeLayer(remoteMarkers[socketId]);
    delete remoteMarkers[socketId];
    delete remoteUsers[socketId];
    renderUserList(Object.values(remoteUsers));
}

function simulateMovement() {
    currentUser.lat += (Math.random() - 0.5) * 0.0004;
    currentUser.lng += (Math.random() - 0.5) * 0.0004;
    
    const newPos = [currentUser.lat, currentUser.lng];
    myMarker.setLatLng(newPos);
    myPath.addLatLng(newPos);
    
    if (socket && socket.connected) {
        socket.emit('updateLocation', { lat: currentUser.lat, lng: currentUser.lng });
    }
}

async function handleRouteRequest(e) {
    if(routeLayer) map.removeLayer(routeLayer);
    const dest = e.latlng;
    const url = `https://router.project-osrm.org/route/v1/driving/${currentUser.lng},${currentUser.lat};${dest.lng},${dest.lat}?overview=full&geometries=geojson`;
    
    try {
        const res = await fetch(url);
        const data = await res.json();
        if (data.routes && data.routes[0]) {
            routeLayer = L.geoJSON(data.routes[0].geometry, { 
                style: { color: ROLE_COLORS[currentUser.role], weight: 5 } 
            }).addTo(map);
        }
    } catch(err) { console.error("Routing error", err); }
}
initMap();
autoFillUserId();
setupSocket();