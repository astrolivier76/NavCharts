// --- 1. État de l'application et Mémoire Cache ---
let currentCharts = [];
let pinnedCharts = [];
const pdfCache = {}; // Conserve les cartes déjà chargées pour un accès instantané

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
    // URL officielle et exacte sur les serveurs du SIA
    const siaVacUrl = `https://www.sia.aviation-civile.gouv.fr/media/dvd/eAIP_${airacDate}/Atlas-VAC/PDF_AIPparSSection/VAC/AD/AD-2.${icao}.pdf`;

    // On injecte le code OACI directement dans le titre pour différencier les cartes
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
    
    // Attribution de la couleur du badge
    let badgeClass = 'bg-info';
    if (chart.type === 'SID') badgeClass = 'bg-sid';
    if (chart.type === 'STAR') badgeClass = 'bg-star';
    if (chart.type === 'APPR') badgeClass = 'bg-appr';
    if (chart.type === 'TAXI') badgeClass = 'bg-taxi';

    span.innerHTML = `<span class="badge ${badgeClass}">${chart.type}</span> ${chart.name}`;
    
    // Clic sur le texte -> Afficher le PDF au centre
    span.addEventListener('click', () => loadChart(chart.url));

    // Bouton d'épinglage (Punaise)
    const pinBtn = document.createElement('button');
    pinBtn.className = 'pin-btn';
    pinBtn.innerHTML = '📌';
    
    if (pinnedCharts.find(c => c.id === chart.id)) {
        pinBtn.classList.add('active');
    }

    pinBtn.addEventListener('click', (event) => {
        event.stopPropagation(); // Empêche l'ouverture de la carte lors du clic sur l'épingle
        togglePin(chart);
    });

    li.appendChild(span);
    li.appendChild(pinBtn);

    return li;
}

// --- 8. Charger et afficher le PDF (Méthode Blob + Cache + Secours) ---
async function loadChart(url) {
    pdfViewer.style.display = 'none';
    
    // Étape A : Vérification de la mémoire cache locale
    if (pdfCache[url]) {
        pdfViewer.src = pdfCache[url] + "#view=FitH";
        pdfViewer.style.display = 'block';
        viewerPlaceholder.style.display = 'none';
        return;
    }

    // Étape B : Si pas en cache, on affiche l'écran de chargement
    viewerPlaceholder.innerHTML = "Chargement de la carte en cours...<br><span style='font-size: 11px; color: #888;'>(Cela peut prendre un moment via le serveur relais public)</span>";
    viewerPlaceholder.style.display = 'block';

    try {
        // Proxy public AllOrigins pour casser les sécurités de blocage d'intégration
        const proxyUrl = "https://api.allorigins.win/raw?url=";
        const response = await fetch(proxyUrl + encodeURIComponent(url));
        
        if (!response.ok) throw new Error("Réponse réseau incorrecte ou rate-limit");
        
        // Téléchargement du fichier en tâche de fond et conversion en binaire local
        const blob = await response.blob();
        const localUrl = URL.createObjectURL(blob);
        
        // Sauvegarde de l'URL locale dans la mémoire cache
        pdfCache[url] = localUrl;
        
        // Affichage dans l'application
        viewerPlaceholder.style.display = 'none';
        pdfViewer.src = localUrl + "#view=FitH";
        pdfViewer.style.display = 'block';
        
    } catch (error) {
        console.error("Erreur de transit via le proxy:", error);
        
        // Étape C : Plan de secours élégant si le proxy gratuit rejette la demande (Rate limiting)
        viewerPlaceholder.innerHTML = `
            <div style="text-align: center; background: #222; padding: 25px; border-radius: 6px; border: 1px solid #444; max-width: 85%; margin: auto;">
                <p style="color: #ffc107; margin-bottom: 15px; font-size: 14px; font-weight: bold;">⚠️ Le serveur relais public est temporairement saturé.</p>
                <p style="color: #aaa; margin-bottom: 20px; font-size: 12px;">Pour ne pas vous bloquer, vous pouvez ouvrir la carte officielle directement dans un onglet séparé.</p>
                <button id="fallback-btn" style="padding: 10px 20px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 13px;">
                    Ouvrir la carte (Nouvel onglet)
                </button>
            </div>
        `;
        
        document.getElementById('fallback-btn').addEventListener('click', () => {
            window.open(url, '_blank');
        });
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

// --- Initialisation au démarrage ---
renderPinned();