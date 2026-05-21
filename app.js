// --- Fausses données pour simuler la base de données ---
const mockCharts = [
    { id: '1', type: 'INFO', name: 'LFPG Airport Info', url: 'carte.pdf' },
    { id: '2', type: 'SID', name: 'LORNI 5A', url: 'carte.pdf' },
    { id: '3', type: 'STAR', name: 'BANOX 1B', url: 'carte.pdf' },
    { id: '4', type: 'APPR', name: 'ILS RWY 27L', url: 'carte.pdf' }
];

// --- État de l'application ---
let currentCharts = [];
let pinnedCharts = [];

// --- Éléments du DOM (Interface) ---
const searchBtn = document.getElementById('search-btn');
const searchInput = document.getElementById('airport-search');
const airportTitle = document.getElementById('airport-title');
const categoriesContainer = document.getElementById('categories-container');
const pinnedList = document.getElementById('pinned-list');
const pdfViewer = document.getElementById('pdf-viewer');
const viewerPlaceholder = document.getElementById('viewer-placeholder');

// --- Fonction de recherche (Simulation) ---
searchBtn.addEventListener('click', () => {
    const icao = searchInput.value.toUpperCase();
    if (icao === '') return;

    // Simulation d'un chargement depuis un serveur
    airportTitle.textContent = "Aéroport : " + icao;
    currentCharts = mockCharts; // On charge nos fausses données
    renderCategories();
});

// --- Afficher les catégories et les cartes ---
function renderCategories() {
    categoriesContainer.innerHTML = ''; // On vide le conteneur
    const ul = document.createElement('ul');
    ul.className = 'chart-list';

    currentCharts.forEach(chart => {
        const li = createChartElement(chart);
        ul.appendChild(li);
    });

    categoriesContainer.appendChild(ul);
}

// --- Créer un élément visuel pour une carte (utilisé pour liste normale et épinglée) ---
function createChartElement(chart) {
    const li = document.createElement('li');
    li.className = 'chart-item';

    const span = document.createElement('span');
    span.className = 'chart-name';
    span.textContent = `[${chart.type}] ${chart.name}`;
    
    // Clic pour afficher la carte
    span.addEventListener('click', () => loadChart(chart.url));

    const pinBtn = document.createElement('button');
    pinBtn.className = 'pin-btn';
    pinBtn.innerHTML = '📌';
    
    // Vérifier si la carte est déjà épinglée pour la colorer en jaune
    if (pinnedCharts.find(c => c.id === chart.id)) {
        pinBtn.classList.add('active');
    }

    // Clic pour épingler/désépingler
    pinBtn.addEventListener('click', () => togglePin(chart));

    li.appendChild(span);
    li.appendChild(pinBtn);

    return li;
}

// --- Afficher le PDF ---
function loadChart(url) {
    viewerPlaceholder.style.display = 'none';
    pdfViewer.style.display = 'block';
    // Pour forcer l'affichage sur iOS de certains PDF récalcitrants, on peut ajouter #view=FitH à l'URL
    pdfViewer.src = url + "#view=FitH"; 
}

// --- Gérer l'épinglage ---
function togglePin(chart) {
    const index = pinnedCharts.findIndex(c => c.id === chart.id);
    
    if (index > -1) {
        // La carte est déjà épinglée, on la retire
        pinnedCharts.splice(index, 1);
    } else {
        // La carte n'est pas épinglée, on l'ajoute
        pinnedCharts.push(chart);
    }
    
    // On met à jour l'affichage
    renderPinned();
    renderCategories(); // Pour rafraîchir la couleur des boutons "Pin"
}

// --- Afficher la liste des cartes épinglées ---
function renderPinned() {
    pinnedList.innerHTML = '';
    
    if (pinnedCharts.length === 0) {
        pinnedList.innerHTML = '<li style="padding: 10px; color: #888; font-size: 12px;">Aucune carte épinglée</li>';
        return;
    }

    pinnedCharts.forEach(chart => {
        const li = createChartElement(chart);
        pinnedList.appendChild(li);
    });
}

// Initialisation au démarrage
renderPinned();