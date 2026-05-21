// --- 1. État et Mémoire (LocalStorage) ---
let currentCharts = [];
let pinnedCharts = JSON.parse(localStorage.getItem('savedDock')) || []; 
const pdfCache = {}; 
let currentFilter = 'ALL'; 
let currentActiveUrl = '';

// L'URL de votre proxy privé Cloudflare ultra-rapide
const MY_PROXY = "https://proxy-efb.alonso-o76.workers.dev/?url=";

// Définition des catégories "Chartfox style"
const CATEGORIES = [
    { id: 'ALL', label: 'ALL' },
    { id: 'GEN', label: 'GEN' },
    { id: 'GND', label: 'GND' },
    { id: 'SID', label: 'SID' },
    { id: 'STAR', label: 'STAR' },
    { id: 'APP', label: 'APP' }
];

// --- 2. DOM Elements ---
const searchBtn = document.getElementById('search-btn');
const searchInput = document.getElementById('airport-search');
const airportTitle = document.getElementById('airport-title');
const categoriesContainer = document.getElementById('categories-container');
const tabsContainer = document.getElementById('tabs-container');
const dockContainer = document.getElementById('dock-container');
const pdfViewer = document.getElementById('pdf-viewer');
const viewerPlaceholder = document.getElementById('viewer-placeholder');

// --- 3. Events ---
searchBtn.addEventListener('click', performSearch);
searchInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') performSearch(); });

// --- 4. Outil AIRAC ---
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

// --- 5. Moteur de Scraping (Propulsé par votre Proxy Privé Cloudflare) ---
async function performSearch() {
    const icao = searchInput.value.trim().toUpperCase();
    if (icao === '') return;

    airportTitle.textContent = icao;
    
    // Terminal de diagnostic en direct
    categoriesContainer.innerHTML = `
        <div style='padding: 15px; color: #00ff00; font-size: 12px; font-family: monospace; background: #111; border: 1px solid #333; margin: 10px; border-radius: 4px; box-shadow: inset 0 0 10px #000;'>
            <strong style='color: #007bff;'>[LAUNCH - PRIVATE PROXY ON ${icao}]</strong><br><br>
            <span id="diag-1">⏳ 1. Génération lien VAC VFR...</span><br>
            <span id="diag-2"></span><br>
            <span id="diag-3"></span><br>
            <span id="diag-4"></span>
        </div>
    `;
    
    const dates = getAiracDates();
    let foundCharts = [];
    
    // 1. VAC (Classée en GEN)
    const siaVacUrl = `https://www.sia.aviation-civile.gouv.fr/media/dvd/eAIP_${dates.folderDate}/Atlas-VAC/PDF_AIPparSSection/VAC/AD/AD-2.${icao}.pdf`;
    foundCharts.push({ id: `${icao}_VAC`, icao: icao, type: 'GEN', name: `VAC VFR`, url: siaVacUrl });
    document.getElementById('diag-1').innerHTML = "✅ 1. Lien VAC VFR généré mathématiquement.";

    // 2. IFR Scraping via Cloudflare Worker
    document.getElementById('diag-2').innerHTML = `⏳ 2. Connexion sécurisée au SIA via Cloudflare...`;
    const eAipUrl = `https://www.sia.aviation-civile.gouv.fr/media/dvd/eAIP_${dates.folderDate}/FRANCE/AIRAC-${dates.isoDate}/html/eAIP/FR-AD-2.${icao}-fr-FR.html`;
    const proxyUrl = MY_PROXY + encodeURIComponent(eAipUrl);

    try {
        const response = await fetch(proxyUrl);
        if (response.ok) {
            // CORRECTION ICI : On lit directement le HTML brut renvoyé par Cloudflare !
            const htmlText = await response.text(); 
            
            // On vérifie que la page n'est pas une erreur 404 du SIA
            if (!htmlText.includes("404 Not Found") && htmlText.length > 500) {
                document.getElementById('diag-2').innerHTML = `✅ 2. Code source SIA injecté (${htmlText.length} octets).`;
                document.getElementById('diag-3').innerHTML = "⏳ 3. Analyse et tri des trajectoires IFR...";

                const regex = /href=['"]([^'"]+\.pdf)['"][^>]*>(.*?)<\/a>/gi;
                let match; let idCounter = 1; let rawLinksFound = 0;
                while ((match = regex.exec(htmlText)) !== null) {
                    rawLinksFound++;
                    let relativeLink = match[1];
                    let chartName = match[2].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
                    if (chartName.length < 3) chartName = (relativeLink.match(/([^\/]+)\.pdf$/i) || [])[1]?.replace(/_/g, ' ') || `Carte ${idCounter}`;

                    let absoluteUrl = relativeLink.startsWith('http') ? relativeLink : 
                        `https://www.sia.aviation-civile.gouv.fr/media/dvd/eAIP_${dates.folderDate}/FRANCE/AIRAC-${dates.isoDate}/html/eAIP/${relativeLink.replace(/(\.\.\/)+/g, '')}`;
                    
                    if (absoluteUrl.toUpperCase().includes(icao)) {
                        let type = 'GEN';
                        const n = chartName.toUpperCase(); const l = absoluteUrl.toUpperCase();
                        if (n.includes('SID') || l.includes('SID') || n.includes('DÉP') || l.includes('DEP')) type = 'SID';
                        else if (n.includes('STAR') || l.includes('STAR') || n.includes('ARR')) type = 'STAR';
                        else if (n.includes('APP') || n.includes('ILS') || n.includes('LOC') || n.includes('RNAV') || n.includes('VOR') || l.includes('IAC')) type = 'APP';
                        else if (n.includes('SOL') || n.includes('PRKG') || n.includes('PARKING') || n.includes('TAXI') || l.includes('GMC')) type = 'GND';
                        
                        if (!foundCharts.find(c => c.url === absoluteUrl)) {
                            foundCharts.push({ id: `${icao}_IFR_${idCounter++}`, icao: icao, type: type, name: chartName, url: absoluteUrl });
                        }
                    }
                }
                document.getElementById('diag-3').innerHTML = `✅ 3. Extraction terminée (${rawLinksFound} PDF détectés).`;
                document.getElementById('diag-4').innerHTML = `🏁 4. Base opérationnelle : ${foundCharts.length - 1} cartes IFR valides.`;
            } else {
                document.getElementById('diag-2').innerHTML = `⚠️ 2. Terrain VFR pur ou page IFR absente.`;
            }
        } else {
            document.getElementById('diag-2').innerHTML = `❌ 2. Cloudflare a bloqué (${response.status}).`;
        }
    } catch (e) { 
        document.getElementById('diag-2').innerHTML = `❌ 2. Liaison impossible avec le Worker.`;
        console.error(e);
    }

    const hasError = document.getElementById('diag-2').innerHTML.includes('❌') || document.getElementById('diag-2').innerHTML.includes('⚠️');
    
    setTimeout(() => {
        currentCharts = foundCharts;
        currentFilter = 'ALL'; 
        renderTabs();
        renderCategories();
    }, hasError ? 2500 : 500); 
}

// --- 6. Rendu Graphique (Onglets, Listes, Dock) ---
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
    if (pinnedCharts.length === 0) return dockContainer.innerHTML = '<p class="empty-msg">Dock vide.<br>Cliquez sur 📌 pour organiser votre vol.</p>';

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
    div.className = `chart-item ${currentActiveUrl === chart.url ? 'active' : ''}`;
    div.setAttribute('data-type', chart.type);

    const span = document.createElement('span');
    span.className = 'chart-name';
    span.textContent = chart.name;
    span.onclick = () => { 
        currentActiveUrl = chart.url; 
        renderCategories(); renderDock(); 
        loadChart(chart.url); 
    };

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'actions-container';

    // Bouton d'ouverture en onglet direct (Vitesse lumière sans proxy)
    const externalBtn = document.createElement('button');
    externalBtn.className = 'external-btn';
    externalBtn.innerHTML = '↗️';
    externalBtn.title = "Lien direct SIA (Plein écran externe)";
    externalBtn.onclick = (e) => { 
        e.stopPropagation(); 
        window.open(chart.url, '_blank'); 
    };

    // Bouton Punaise / Croix
    const pinBtn = document.createElement('button');
    pinBtn.className = 'pin-btn';
    pinBtn.innerHTML = isDock ? '✖' : '📌';
    pinBtn.title = isDock ? "Retirer du dock" : "Épingler dans le dock";
    pinBtn.onclick = (e) => { 
        e.stopPropagation(); 
        togglePin(chart); 
    };

    actionsDiv.appendChild(externalBtn);
    actionsDiv.appendChild(pinBtn);

    div.appendChild(span);
    div.appendChild(actionsDiv);
    return div;
}

// --- 7. Logique Épingles (LocalStorage avec Pré-chargement Cloudflare) ---
function togglePin(chart) {
    const index = pinnedCharts.findIndex(c => c.url === chart.url);
    if (index > -1) {
        pinnedCharts.splice(index, 1);
    } else {
        pinnedCharts.push(chart);
        // Pré-téléchargement immédiat et ultra-fluide via VOTRE proxy Cloudflare
        if (!pdfCache[chart.url]) {
            fetch(MY_PROXY + encodeURIComponent(chart.url))
                .then(res => res.ok ? res.blob() : Promise.reject())
                .then(blob => pdfCache[chart.url] = URL.createObjectURL(blob))
                .catch(() => {});
        }
    }
    localStorage.setItem('savedDock', JSON.stringify(pinnedCharts));
    renderDock();
}

// --- 8. Lecteur PDF Propulsé par Cloudflare (0% Échec) ---
async function loadChart(url) {
    pdfViewer.style.display = 'none';
    
    // Si la carte est dans le cache de l'iPad, affichage instantané
    if (pdfCache[url]) {
        pdfViewer.src = pdfCache[url] + "#view=FitH";
        pdfViewer.style.display = 'block';
        viewerPlaceholder.style.display = 'none';
        return;
    }

    viewerPlaceholder.innerHTML = "Téléchargement de la carte via Cloudflare...<br><span style='font-size: 11px; color:#00ff00;'>⚡ Canal Privé Actif</span>";
    viewerPlaceholder.style.display = 'block';

    try {
        // Interrogation de votre Worker Cloudflare
        const response = await fetch(MY_PROXY + encodeURIComponent(url));
        if (!response.ok) throw new Error("Erreur Tunnel");
        
        const blob = await response.blob();
        pdfCache[url] = URL.createObjectURL(blob);
        
        viewerPlaceholder.style.display = 'none';
        pdfViewer.src = pdfCache[url] + "#view=FitH";
        pdfViewer.style.display = 'block';
    } catch (e) {
        // En cas de problème exceptionnel sur le réseau
        viewerPlaceholder.innerHTML = `
            <div class="popup-box">
                <button id="close-popup" class="close-btn">&times;</button>
                <p style="color: #f1c40f; margin-bottom: 15px; font-weight: bold;">⚠️ Perturbation du réseau ou de la liaison Cloudflare.</p>
                <button onclick="window.open('${url}', '_blank')" style="padding: 10px 15px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">
                    Ouvrir en direct (Externe)
                </button>
            </div>
        `;
        document.getElementById('close-popup').onclick = () => viewerPlaceholder.style.display = 'none';
    }
}

// --- Initialisation au démarrage ---
renderTabs();
renderDock();