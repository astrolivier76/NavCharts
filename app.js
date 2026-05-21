// --- 1. État et Mémoire (LocalStorage) ---
let currentCharts = [];
let pinnedCharts = JSON.parse(localStorage.getItem('savedDock')) || []; 
const pdfCache = {}; 
let currentFilter = 'ALL'; 
let currentActiveUrl = '';

// L'URL de votre proxy mondial Cloudflare
const MY_PROXY = "https://chartfox-api.alonso-o76.workers.dev/";

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

// --- 4. Outil AIRAC (Filet de sécurité VFR pour la France) ---
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

// --- 5. Moteur de Recherche Mondial (Avec Terminal de Diagnostic Actif) ---
async function performSearch() {
    const icao = searchInput.value.trim().toUpperCase();
    if (icao === '') return;

    airportTitle.textContent = icao;
    
    // Le retour du Terminal !
    categoriesContainer.innerHTML = `
        <div style='padding: 15px; color: #00ff00; font-size: 12px; font-family: monospace; background: #111; border: 1px solid #333; margin: 10px; border-radius: 4px; box-shadow: inset 0 0 10px #000;'>
            <strong style='color: #007bff;'>[GLOBAL UPLINK - ${icao}]</strong><br><br>
            <span id="diag-1">⏳ 1. Connexion au serveur Cloudflare...</span><br>
            <span id="diag-2"></span><br>
            <span id="diag-3"></span>
        </div>
    `;
    
    let foundCharts = [];
    
    // Filet de sécurité VFR France
    if (icao.startsWith('LF')) {
        const dates = getAiracDates();
        const siaVacUrl = `https://www.sia.aviation-civile.gouv.fr/media/dvd/eAIP_${dates.folderDate}/Atlas-VAC/PDF_AIPparSSection/VAC/AD/AD-2.${icao}.pdf`;
        foundCharts.push({ id: `${icao}_VAC_SIA`, icao: icao, type: 'GEN', name: `VAC VFR (SIA)`, url: siaVacUrl });
    }

    const proxyUrl = `${MY_PROXY}?icao=${icao}`;

    try {
        const response = await fetch(proxyUrl);
        
        if (!response.ok) {
            document.getElementById('diag-1').innerHTML = `❌ 1. Erreur Serveur (HTTP ${response.status}).`;
            throw new Error("HTTP Failed");
        }

        // On lit d'abord en texte brut pour éviter que l'application ne plante si Chartfox envoie du HTML
        const textData = await response.text(); 
        
        // Si Chartfox nous renvoie la page de connexion, c'est que le Cookie a expiré !
        if (textData.includes("<html") || textData.includes("login") || textData.includes("Auth")) {
             document.getElementById('diag-1').innerHTML = `❌ 1. BLOCAGE : Session VATSIM expirée. Chartfox exige une reconnexion.`;
             throw new Error("Session Expired");
        }

        // Si tout va bien, on convertit en JSON
        const data = JSON.parse(textData);
        document.getElementById('diag-1').innerHTML = "✅ 1. Base mondiale lue avec succès.";
        
        let chartsData = [];
        
        if (data.props && data.props.groupedCharts) {
            Object.values(data.props.groupedCharts).forEach(group => {
                if (Array.isArray(group)) chartsData.push(...group);
            });
        }

        if (chartsData.length > 0) {
            document.getElementById('diag-2').innerHTML = `✅ 2. ${chartsData.length} cartes extraites pour ${icao}.`;
            
            chartsData.forEach(chart => {
                let type = 'GEN';
                const cType = chart.type ? chart.type.toUpperCase() : '';
                const cName = chart.name ? chart.name.toUpperCase() : '';

                if (cType === 'SID' || cName.includes('SID') || cName.includes('DEPARTURE')) type = 'SID';
                else if (cType === 'STAR' || cName.includes('STAR') || cName.includes('ARRIVAL')) type = 'STAR';
                else if (cType === 'APP' || cName.includes('ILS') || cName.includes('RNAV') || cName.includes('APPROACH')) type = 'APP';
                else if (cType === 'TAXI' || cType === 'GND' || cName.includes('TAXI') || cName.includes('PARKING')) type = 'GND';

                const isDuplicateVAC = type === 'GEN' && cName.includes('VAC') && icao.startsWith('LF');
                
                // Chartfox peut utiliser plusieurs noms pour l'URL, on les teste tous :
                const chartUrl = chart.url || chart.link || chart.file_url || chart.pdf_path;
                
                if (!isDuplicateVAC && chartUrl) {
                    foundCharts.push({
                        id: chart.chartId || chart.id || `${icao}_${Math.random()}`,
                        icao: icao,
                        type: type,
                        name: chart.name || 'Carte IFR',
                        url: chartUrl
                    });
                }
            });
            
            document.getElementById('diag-3').innerHTML = `🏁 3. Création de l'interface...`;
        } else {
            document.getElementById('diag-2').innerHTML = `⚠️ 2. Aucune carte trouvée dans la base de données pour cet aéroport.`;
        }

    } catch (e) { 
        if (e.message !== "HTTP Failed" && e.message !== "Session Expired") {
            document.getElementById('diag-1').innerHTML = `❌ 1. Erreur d'analyse des données : ${e.message}`;
        }
    }

    // S'il y a une erreur rouge (❌) ou orange (⚠️), on fige le terminal pour lire. Sinon, on fonce !
    const hasError = document.getElementById('diag-1').innerHTML.includes('❌') || document.getElementById('diag-2').innerHTML.includes('⚠️');
    
    setTimeout(() => {
        currentCharts = foundCharts;
        currentFilter = 'ALL'; 
        renderTabs();
        renderCategories();
    }, hasError ? 5000 : 300); // 5 secondes si erreur, 0.3s si succès
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
    if (currentCharts.length === 0) return categoriesContainer.innerHTML = "<p class='empty-msg'>Aucune carte trouvée pour cet aéroport.</p>";

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

    const externalBtn = document.createElement('button');
    externalBtn.className = 'external-btn';
    externalBtn.innerHTML = '↗️';
    externalBtn.title = "Lien direct (Plein écran externe)";
    externalBtn.onclick = (e) => { 
        e.stopPropagation(); 
        window.open(chart.url, '_blank'); 
    };

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

// --- 7. Logique Épingles (LocalStorage) ---
function togglePin(chart) {
    const index = pinnedCharts.findIndex(c => c.url === chart.url);
    if (index > -1) {
        pinnedCharts.splice(index, 1);
    } else {
        pinnedCharts.push(chart);
        if (!pdfCache[chart.url]) {
            // Si l'URL de la carte pointe vers Chartfox, on utilise le proxy. 
            // Si c'est déjà un lien absolu PDF officiel, on le charge.
            const targetUrl = chart.url.startsWith('http') ? chart.url : `https://chartfox.org${chart.url}`;
            fetch(`${MY_PROXY}?url=${encodeURIComponent(targetUrl)}`)
                .then(res => res.ok ? res.blob() : Promise.reject())
                .then(blob => pdfCache[chart.url] = URL.createObjectURL(blob))
                .catch(() => {});
        }
    }
    localStorage.setItem('savedDock', JSON.stringify(pinnedCharts));
    renderDock();
}

// --- 8. Lecteur PDF Propulsé par Cloudflare ---
async function loadChart(url) {
    pdfViewer.style.display = 'none';
    
    if (pdfCache[url]) {
        pdfViewer.src = pdfCache[url] + "#view=FitH";
        pdfViewer.style.display = 'block';
        viewerPlaceholder.style.display = 'none';
        return;
    }

    viewerPlaceholder.innerHTML = "Téléchargement de la carte...<br><span style='font-size: 11px; color:#00ff00;'>⚡ Réseau Mondial Connecté</span>";
    viewerPlaceholder.style.display = 'block';

    try {
        const targetUrl = url.startsWith('http') ? url : `https://chartfox.org${url}`;
        const response = await fetch(`${MY_PROXY}?url=${encodeURIComponent(targetUrl)}`);
        
        if (!response.ok) throw new Error("Erreur Serveur");
        
        const blob = await response.blob();
        pdfCache[url] = URL.createObjectURL(blob);
        
        viewerPlaceholder.style.display = 'none';
        pdfViewer.src = pdfCache[url] + "#view=FitH";
        pdfViewer.style.display = 'block';
    } catch (e) {
        viewerPlaceholder.innerHTML = `
            <div class="popup-box">
                <button id="close-popup" class="close-btn">&times;</button>
                <p style="color: #f1c40f; margin-bottom: 15px; font-weight: bold;">⚠️ Le fichier PDF source est protégé ou indisponible.</p>
                <button onclick="window.open('${url.startsWith('http') ? url : 'https://chartfox.org' + url}', '_blank')" style="padding: 10px 15px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">
                    Tenter l'ouverture externe ↗️
                </button>
            </div>
        `;
        document.getElementById('close-popup').onclick = () => viewerPlaceholder.style.display = 'none';
    }
}

// --- Initialisation au démarrage ---
renderTabs();
renderDock();