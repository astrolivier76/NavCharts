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
    const baseAirac = new Date('2024-01-25T00:00:00Z');
    const now = new Date();
    
    const msPerDay = 1000 * 60 * 60 * 24;
    const diffDays = Math.floor((now - baseAirac) / msPerDay);
    const cyclesPassed = Math.floor(diffDays / 28);
    
    const currentAirac = new Date(baseAirac.getTime() + cyclesPassed * 28 * msPerDay);
    
    const day = String(currentAirac.getUTCDate()).padStart(2, '0');
    const monthNames = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
    const month = monthNames[currentAirac.getUTCMonth()];
    const year = currentAirac.getUTCFullYear();
    
    return `${day}_${month}_${year}`;
}

// --- 5. La fonction de recherche (Connectée au SIA) ---
function performSearch() {
    const icao = searchInput.value.trim().toUpperCase();
    if (icao === '') return;

    airportTitle.textContent = "Aéroport : " + icao;
    
    const airacDate = getCurrentAiracDate();
    const siaVacUrl = `https://www.sia.aviation-civile.gouv.fr/media/dvd/eAIP_${airacDate}/Atlas-VAC/PDF_AIPparSSection/VAC/AD/AD-2.${icao}.pdf`;

    // On peuple la liste avec le nom de l'OACI inclus pour bien les différencier
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

// --- 8. Charger et afficher le PDF (Méthode de téléchargement invisible) ---
async function loadChart(url) {
    pdfViewer.style.display = 'none';
    viewerPlaceholder.textContent = "Chargement de la carte en cours...";
    viewerPlaceholder.style.display = 'block';

    try {
        const proxyUrl = "https://corsproxy.io/?";
        // On télécharge le PDF en arrière-plan via le proxy
        const response = await fetch(proxyUrl + encodeURIComponent(url));
        
        if (!response.ok) throw new Error("Erreur réseau");
        
        // On crée un fichier local temporaire
        const blob = await response.blob();
        const localUrl = URL.createObjectURL(blob);
        
        // On l'affiche (les sécurités du navigateur sautent car c'est devenu un fichier local)
        viewerPlaceholder.style.display = 'none';
        pdfViewer.src = localUrl + "#view=FitH";
        pdfViewer.style.display = 'block';
        
    } catch (error) {
        console.error("Erreur de chargement:", error);
        viewerPlaceholder.textContent = "Impossible de charger la carte (Vérifiez le code OACI).";
    }
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