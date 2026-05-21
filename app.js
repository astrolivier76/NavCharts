// --- 1. Générateur automatique de cycle AIRAC ---
function getCurrentAiracDate() {
    // On prend une date AIRAC connue dans le passé comme point de départ
    const baseAirac = new Date('2024-01-25T00:00:00Z');
    const now = new Date();
    
    // On calcule combien de cycles de 28 jours se sont écoulés depuis
    const msPerDay = 1000 * 60 * 60 * 24;
    const diffDays = Math.floor((now - baseAirac) / msPerDay);
    const cyclesPassed = Math.floor(diffDays / 28);
    
    // On détermine la date du cycle actuel
    const currentAirac = new Date(baseAirac.getTime() + cyclesPassed * 28 * msPerDay);
    
    const day = String(currentAirac.getUTCDate()).padStart(2, '0');
    const monthNames = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
    const month = monthNames[currentAirac.getUTCMonth()];
    const year = currentAirac.getUTCFullYear();
    
    // Retourne le texte exact attendu dans l'URL du SIA (ex: "14_MAY_2026")
    return `${day}_${month}_${year}`;
}

// --- 2. La vraie fonction de recherche ---
function performSearch() {
    const icao = searchInput.value.trim().toUpperCase();
    if (icao === '') return;

    airportTitle.textContent = "Aéroport : " + icao;
    
    // Génération de l'URL officielle du SIA
    const airacDate = getCurrentAiracDate();
    const siaVacUrl = `https://www.sia.aviation-civile.gouv.fr/media/dvd/eAIP_${airacDate}/Atlas-VAC/PDF_AIPparSSection/VAC/AD/AD-2.${icao}.pdf`;

    // On crée dynamiquement la liste avec la vraie carte de l'aéroport demandé
    currentCharts = [
        { 
            id: icao + '_VAC', 
            type: 'INFO', 
            name: `Carte VAC VFR (${icao})`, 
            url: siaVacUrl 
        }
    ]; 
    
    renderCategories();
}

// --- 2. État de l'application ---
let currentCharts = [];
let pinnedCharts = [];

// --- 3. Récupération des éléments du DOM ---
const searchBtn = document.getElementById('search-btn');
const searchInput = document.getElementById('airport-search');
const airportTitle = document.getElementById('airport-title');
const categoriesContainer = document.getElementById('categories-container');
const pinnedList = document.getElementById('pinned-list');
const pdfViewer = document.getElementById('pdf-viewer');
const viewerPlaceholder = document.getElementById('viewer-placeholder');

// --- 4. Écouteurs d'événements pour la recherche ---

// Clic sur le bouton "Chercher"
searchBtn.addEventListener('click', performSearch);

// Appui sur la touche "Entrée" dans la barre de recherche
searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        performSearch();
    }
});

function performSearch() {
    const icao = searchInput.value.trim().toUpperCase();
    if (icao === '') return;

    // Simulation d'un chargement de données
    airportTitle.textContent = "Aéroport : " + icao;
    currentCharts = mockCharts; 
    renderCategories();
}

// --- 5. Afficher la liste principale des cartes ---
function renderCategories() {
    categoriesContainer.innerHTML = ''; // Nettoyer l'affichage précédent
    
    const ul = document.createElement('ul');
    ul.className = 'chart-list';

    currentCharts.forEach(chart => {
        const li = createChartElement(chart);
        ul.appendChild(li);
    });

    categoriesContainer.appendChild(ul);
}

// --- 6. Créer une ligne de carte (utilisée pour la liste principale et épinglée) ---
function createChartElement(chart) {
    const li = document.createElement('li');
    li.className = 'chart-item';

    const span = document.createElement('span');
    span.className = 'chart-name';
    
    // Détermination de la couleur du badge selon le type
    let badgeClass = 'bg-info';
    if (chart.type === 'SID') badgeClass = 'bg-sid';
    if (chart.type === 'STAR') badgeClass = 'bg-star';
    if (chart.type === 'APPR') badgeClass = 'bg-appr';
    if (chart.type === 'TAXI') badgeClass = 'bg-taxi';

    // Injection du HTML avec le badge coloré
    span.innerHTML = `<span class="badge ${badgeClass}">${chart.type}</span> ${chart.name}`;
    
    // Action : Clic pour afficher la carte
    span.addEventListener('click', () => loadChart(chart.url));

    // Bouton d'épinglage
    const pinBtn = document.createElement('button');
    pinBtn.className = 'pin-btn';
    pinBtn.innerHTML = '📌';
    
    // Colorer l'épingle si la carte est déjà dans les favoris
    if (pinnedCharts.find(c => c.id === chart.id)) {
        pinBtn.classList.add('active');
    }

    // Action : Clic pour épingler/désépingler
    pinBtn.addEventListener('click', (event) => {
        event.stopPropagation(); // Évite de charger le PDF en même temps
        togglePin(chart);
    });

    li.appendChild(span);
    li.appendChild(pinBtn);

    return li;
}

// --- 7. Charger et afficher le PDF ---
function loadChart(url) {
    viewerPlaceholder.style.display = 'none';
    pdfViewer.style.display = 'block';
    // Le #view=FitH force le lecteur PDF à adapter la carte à la largeur de l'écran
    pdfViewer.src = url + "#view=FitH"; 
}

// --- 8. Gérer l'ajout ou le retrait d'une épingle ---
function togglePin(chart) {
    const index = pinnedCharts.findIndex(c => c.id === chart.id);
    
    if (index > -1) {
        // La carte est déjà épinglée -> On la retire
        pinnedCharts.splice(index, 1);
    } else {
        // La carte n'est pas épinglée -> On l'ajoute
        pinnedCharts.push(chart);
    }
    
    // Mise à jour visuelle des deux listes
    renderPinned();
    if (currentCharts.length > 0) {
        renderCategories(); // Rafraîchit les couleurs des épingles dans la liste principale
    }
}

// --- 9. Afficher la liste des cartes épinglées ---
function renderPinned() {
    pinnedList.innerHTML = '';
    
    if (pinnedCharts.length === 0) {
        pinnedList.innerHTML = '<li style="padding: 10px; color: #888; font-size: 12px; text-align: center;">Aucune carte épinglée</li>';
        return;
    }

    pinnedCharts.forEach(chart => {
        const li = createChartElement(chart);
        pinnedList.appendChild(li);
    });
}

// --- 10. Initialisation au démarrage de l'application ---
renderPinned();