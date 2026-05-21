// --- 1. État et Mémoire (LocalStorage) ---
let currentCharts = [];
let pinnedCharts = JSON.parse(localStorage.getItem('savedDock')) || []; 
const pdfCache = {}; 
let currentFilter = 'ALL'; 
let currentActiveUrl = ''; // Pour garder la carte cliquée en surbrillance

// Définition des catégories "Chartfox style"
const CATEGORIES = [
    { id: 'ALL', label: 'ALL' },
    { id: 'GEN', label: 'GEN' },
    { id: 'GND', label: 'GND' },
    { id: 'SID', label: 'SID' },
    { id: 'STAR', label: 'STAR' },
    { id: 'APP', label: 'APP' }
];

// --- DOM Elements ---
const searchBtn = document.getElementById('search-btn');
const searchInput = document.getElementById('airport-search');
const airportTitle = document.getElementById('airport-title');
const categoriesContainer = document.getElementById('categories-container');
const tabsContainer = document.getElementById('tabs-container');
const dockContainer = document.getElementById('dock-container');
const pdfViewer = document.getElementById('pdf-viewer');
const viewerPlaceholder = document.getElementById('viewer-placeholder');

// --- Events ---
searchBtn.addEventListener('click', performSearch);
searchInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') performSearch(); });

// --- Moteur de Scraping (Anti-CORS) ---
function getAiracDates() {
    const baseAirac = new Date('2024-01-25T00:00:00Z');
    const now = new Date();
    const diffDays = Math.floor((now - baseAirac) / (1000 * 60 * 60 * 24));
    const currentAirac = new Date(baseAirac.getTime() + Math.floor(diffDays / 28) * 28 * 86400000);
    const day = String(currentAirac.getUTCDate()).padStart(2, '0');
    const month = String(currentAirac.getUTCMonth() + 1).padStart(2, '0');
    const year = currentAirac.getUTCFullYear();
    const monthNames = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
    return { folderDate: `${day}_${monthNames[currentAirac.getUTCMonth()]}_${year}`, isoDate: `${year}-${month}-${day}` };
}

async function performSearch() {
    const icao = searchInput.value.trim().toUpperCase();
    if (icao === '') return;

    airportTitle.textContent = icao;
    categoriesContainer.innerHTML = "<p class='empty-msg'>📡 Scraping SIA en cours...</p>";
    
    const dates = getAiracDates();
    let foundCharts = [];
    
    // 1. VAC (Classée en GEN)
    const siaVacUrl = `https://www.sia.aviation-civile.gouv.fr/media/dvd/eAIP_${dates.folderDate}/Atlas-VAC/PDF_AIPparSSection/VAC/AD/AD-2.${icao}.pdf`;
    foundCharts.push({ id: `${icao}_VAC`, icao: icao, type: 'GEN', name: `VAC VFR`, url: siaVacUrl });

    // 2. IFR
    const eAipUrl = `https://www.sia.aviation-civile.gouv.fr/media/dvd/eAIP_${dates.folderDate}/FRANCE/AIRAC-${dates.isoDate}/html/eAIP/FR-AD-2.${icao}-fr-FR.html`;
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(eAipUrl)}&disableCache=true`;

    try {
        const response = await fetch(proxyUrl);
        if (response.ok) {
            const data = await response.json(); 
            if (data.contents && !data.contents.includes("404 Not Found")) {
                const regex = /href=['"]([^'"]+\.pdf)['"][^>]*>(.*?)<\/a>/gi;
                let match; let idCounter = 1;
                while ((match = regex.exec(data.contents)) !== null) {
                    let relativeLink = match[1];
                    let chartName = match[2].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
                    if (chartName.length < 3) chartName = (relativeLink.match(/([^\/]+)\.pdf$/i) || [])[1]?.replace(/_/g, ' ') || `Carte ${idCounter}`;

                    let absoluteUrl = relativeLink.startsWith('http') ? relativeLink : 
                        `https://www.sia.aviation-civile.gouv.fr/media/dvd/eAIP_${dates.folderDate}/FRANCE/AIRAC-${dates.isoDate}/html/eAIP/${relativeLink.replace(/(\.\.\/)+/g, '')}`;
                    
                    if (absoluteUrl.toUpperCase().includes(icao)) {
                        let type = 'GEN';
                        const n = chartName.toUpperCase(); const l = absoluteUrl.toUpperCase();
                        // Mapping "Chartfox"
                        if (n.includes('SID') || l.includes('SID') || n.includes('DÉP') || l.includes('DEP')) type = 'SID';
                        else if (n.includes('STAR') || l.includes('STAR') || n.includes('ARR')) type = 'STAR';
                        else if (n.includes('APP') || n.includes('ILS') || n.includes('LOC') || n.includes('RNAV') || n.includes('VOR') || l.includes('IAC')) type = 'APP';
                        else if (n.includes('SOL') || n.includes('PRKG') || n.includes('PARKING') || n.includes('TAXI') || l.includes('GMC')) type = 'GND';
                        
                        if (!foundCharts.find(c => c.url === absoluteUrl)) {
                            foundCharts.push({ id: `${icao}_IFR_${idCounter++}`, icao: icao, type: type, name: chartName, url: absoluteUrl });
                        }
                    }
                }
            }
        }
    } catch (e) { console.log("Erreur réseau"); }

    currentCharts = foundCharts;
    currentFilter = 'ALL'; 
    renderTabs();
    renderCategories();
}

// --- Rendu Graphique ---
function renderTabs() {
    tabsContainer.innerHTML = '';
    CATEGORIES.forEach(tab => {
        const btn = document.createElement('button');
        btn.className = `tab-btn ${currentFilter === tab.id ? 'active' : ''}`;
        btn.setAttribute('data-type', tab.id);
        btn.textContent = tab.label;
        btn.onclick = () => { currentFilter = tab.id; renderTabs(); renderCategories(); };
        tabsContainer.appendChild(btn);
    });
}

function renderCategories() {
    categoriesContainer.innerHTML = ''; 
    if (currentCharts.length === 0) return categoriesContainer.innerHTML = "<p class='empty-msg'>Aucune carte trouvée.</p>";

    const filtered = currentFilter === 'ALL' ? currentCharts : currentCharts.filter(c => c.type === currentFilter);
    if (filtered.length === 0) return categoriesContainer.innerHTML = `<p class='empty-msg'>Aucune carte ${currentFilter}.</p>`;

    filtered.forEach(chart => categoriesContainer.appendChild(createChartElement(chart)));
}

function renderDock() {
    dockContainer.innerHTML = '';
    if (pinnedCharts.length === 0) return dockContainer.innerHTML = '<p class="empty-msg">Dock vide.<br>Cliquez sur 📌 pour épingler.</p>';

    // Grouper les épingles par Aéroport (ICAO)
    const grouped = {};
    pinnedCharts.forEach(chart => {
        if (!grouped[chart.icao]) grouped[chart.icao] = [];
        grouped[chart.icao].push(chart);
    });

    for (const [icao, charts] of Object.entries(grouped)) {
        const title = document.createElement('div');
        title.className = 'dock-group-title';
        title.textContent = icao;
        dockContainer.appendChild(title);
        
        charts.forEach(chart => dockContainer.appendChild(createChartElement(chart, true)));
    }
}

function createChartElement(chart, isDock = false) {
    const div = document.createElement('div');
    // Ajoute la classe 'active' si c'est la carte actuellement visionnée
    div.className = `chart-item ${currentActiveUrl === chart.url ? 'active' : ''}`;
    div.setAttribute('data-type', chart.type);

    const span = document.createElement('span');
    span.className = 'chart-name';
    span.textContent = chart.name;
    span.onclick = () => { 
        currentActiveUrl = chart.url; 
        renderCategories(); renderDock(); // Force le rafraîchissement des couleurs
        loadChart(chart.url); 
    };

    const pinBtn = document.createElement('button');
    pinBtn.className = 'pin-btn';
    pinBtn.innerHTML = isDock ? '✖' : '📌';
    pinBtn.onclick = (e) => { e.stopPropagation(); togglePin(chart); };

    div.appendChild(span);
    div.appendChild(pinBtn);
    return div;
}

// --- Logique Épingles (LocalStorage) ---
function togglePin(chart) {
    const index = pinnedCharts.findIndex(c => c.url === chart.url);
    if (index > -1) {
        pinnedCharts.splice(index, 1);
    } else {
        pinnedCharts.push(chart);
        // Pré-chargement discret en arrière-plan
        if (!pdfCache[chart.url]) {
            fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(chart.url)}&cb=${Date.now()}`)
                .then(res => res.ok ? res.blob() : Promise.reject())
                .then(blob => pdfCache[chart.url] = URL.createObjectURL(blob))
                .catch(() => {});
        }
    }
    localStorage.setItem('savedDock', JSON.stringify(pinnedCharts));
    renderDock();
}

// --- Lecteur PDF avec Secours Fermable ---
async function loadChart(url) {
    pdfViewer.style.display = 'none';
    if (pdfCache[url]) {
        pdfViewer.src = pdfCache[url] + "#view=FitH";
        pdfViewer.style.display = 'block';
        viewerPlaceholder.style.display = 'none';
        return;
    }

    viewerPlaceholder.innerHTML = "Chargement...<br><span style='font-size: 11px;'>(Serveur relais public)</span>";
    viewerPlaceholder.style.display = 'block';

    try {
        const response = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}&cb=${Date.now()}`);
        if (!response.ok) throw new Error("Saturé");
        
        pdfCache[url] = URL.createObjectURL(await response.blob());
        viewerPlaceholder.style.display = 'none';
        pdfViewer.src = pdfCache[url] + "#view=FitH";
        pdfViewer.style.display = 'block';
    } catch (e) {
        viewerPlaceholder.innerHTML = `
            <div class="popup-box" style="position: relative;">
                <button id="close-popup" class="close-btn">&times;</button>
                <p style="color: #f1c40f; margin-bottom: 15px; font-weight: bold;">⚠️ Le proxy public limite la bande passante.</p>
                <button onclick="window.open('${url}', '_blank')" style="padding: 10px 15px; background: #00a651; color: white; border: none; border-radius: 4px; cursor: pointer;">
                    Ouvrir le PDF externe
                </button>
            </div>
        `;
        document.getElementById('close-popup').onclick = () => viewerPlaceholder.style.display = 'none';
    }
}

// --- Initialisation ---
renderTabs();
renderDock();