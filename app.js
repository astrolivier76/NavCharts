// --- 1. État de l'application ---
let currentCharts = [];
let pinnedCharts = [];

// --- 2. Récupération des éléments du DOM ---
const searchBtn = document.getElementById('search-btn');
const searchInput = document.getElementById('airport-search');
const airportTitle = document.getElementById('airport-title');
const categoriesContainer = document.getElementById('categories-container');
const pinnedList = document.getElementById('pinned-list');
const pdfViewer = document.getElementById('pdf-viewer');
const viewerPlaceholder = document.getElementById('viewer-placeholder');

// --- 3. Écouteurs d'événements pour la recherche ---
searchBtn.addEventListener('click', performSearch);
searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') performSearch();
});

// --- 4. Générateur automatique de cycle AIRAC ---
function getCurrentAiracDate() {
    // Le cycle de base utilisé comme repère mathématique
    const baseAirac = new Date('2024-01-25T00:00:00Z');
    const now = new Date();
    
    // Calcul du nombre de cycles de 28 jours écoulés
    const msPerDay = 1000 * 60 * 60 * 24;
    const diffDays = Math.floor((now - baseAirac) / msPerDay);
    const cyclesPassed = Math.floor(diffDays / 28);
    
    // Détermination de la date du cycle actuel
    const currentAirac = new Date(baseAirac.getTime() + cyclesPassed * 28 * msPerDay);
    
    const day = String(currentAirac.getUTCDate()).padStart(2, '0');
    const monthNames = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
    const month = monthNames[currentAirac.getUTCMonth()];
    const year = currentAirac.getUTCFullYear();
    
    // Retourne le format exact attendu par le SIA (ex: 14_MAY_2026)
    return `${day}_${month}_${year}`;
}

// --- 5. La vraie fonction de recherche (Connectée au SIA) ---
function performSearch() {
    const icao = searchInput.value.trim().toUpperCase();
    if (icao === '') return;

    airportTitle.textContent = "Aéroport : " + icao;
    
    // On génère la date AIRAC
    const airacDate = getCurrentAiracDate();
    
// Création du lien dynamique vers le PDF du SIA
    const siaVacUrl = `https://www.sia.aviation-civile.gouv.fr/media/dvd/eAIP_${airacDate}/Atlas-VAC/PDF_AIPparSSection/VAC/AD/AD-2.${icao}.pdf`;
    
    // Ajout d'un Proxy gratuit pour contourner la sécurité X-Frame-Options du SIA
    const proxyUrl = "https://api.allorigins.win/raw?url=";
    const finalUrl = proxyUrl + encodeURIComponent(siaVacUrl);

    // On peuple la liste avec la vraie carte débloquée
    currentCharts = [
        { 
            id: icao + '_VAC', 
            type: 'INFO',
            name: `Carte VAC VFR`, 
            url: finalUrl 
        }
    ]; 
    
    renderCategories();
}

// --- 6. Afficher la liste principale des cartes ---
function renderCategories() {
    categoriesContainer.innerHTML = ''; 
    const ul = document.createElement('ul');
    ul.className = 'chart-list';

    currentCharts.forEach(chart => {
        const li = createChartElement(chart);
        ul.appendChild(li);
    });

    categoriesContainer.appendChild(ul);
}

// --- 7. Créer une ligne de carte ---
function createChartElement(chart) {
    const li = document.createElement('li');
    li.className = 'chart-item';

    const span = document.createElement('span');
    span.className = 'chart-name';
    
    // Assignation de la couleur du badge
    let badgeClass = 'bg-info';
    if (chart.type === 'SID') badgeClass = 'bg-sid';
    if (chart.type === 'STAR') badgeClass = 'bg-star';
    if (chart.type === 'APPR') badgeClass = 'bg-appr';
    if (chart.type === 'TAXI') badgeClass = 'bg-taxi';

    span.innerHTML = `<span class="badge ${badgeClass}">${chart.type}</span> ${chart.name}`;
    
    // Afficher le PDF au clic
    span.addEventListener('click', () => loadChart(chart.url));

    const pinBtn = document.createElement('button');
    pinBtn.className = 'pin-btn';
    pinBtn.innerHTML = '📌';
    
    if (pinnedCharts.find(c => c.id === chart.id)) {
        pinBtn.classList.add('active');
    }

    pinBtn.addEventListener('click', (event) => {
        event.stopPropagation(); 
        togglePin(chart);
    });

    li.appendChild(span);
    li.appendChild(pinBtn);

    return li;
}

// --- 8. Charger et afficher le PDF ---
function loadChart(url) {
    viewerPlaceholder.style.display = 'none';
    pdfViewer.style.display = 'block';
    pdfViewer.src = url + "#view=FitH"; 
}

// --- 9. Gérer l'ajout ou le retrait d'une épingle ---
function togglePin(chart) {
    const index = pinnedCharts.findIndex(c => c.id === chart.id);
    if (index > -1) {
        pinnedCharts.splice(index, 1);
    } else {
        pinnedCharts.push(chart);
    }
    renderPinned();
    if (currentCharts.length > 0) {
        renderCategories(); 
    }
}

// --- 10. Afficher les épingles ---
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

// --- Initialisation ---
renderPinned();