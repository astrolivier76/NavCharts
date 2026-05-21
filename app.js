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

// --- 5. MOTEUR HYBRIDE INTELILGENT ---
async function performSearch() {
    const icao = searchInput.value.trim().toUpperCase();
    if (icao === '') return;

    airportTitle.textContent = icao;
    
    categoriesContainer.innerHTML = `
        <div style='padding: 15px; color: #00ff00; font-size: 12px; font-family: monospace; background: #111; border: 1px solid #333; margin: 10px; border-radius: 4px; box-shadow: inset 0 0 10px #000;'>
            <strong style='color: #007bff;'>[SYSTEM UPLINK - ${icao}]</strong><br><br>
            <span id="diag-1">⏳ 1. Analyse de la zone géographique...</span><br>
            <span id="diag-2"></span><br>
            <span id="diag-3"></span>
        </div>
    `;
    
    let foundCharts = [];
    let hasError = false;

    try {
        // ========================================================
        // SCÉNARIO A : MOTEUR FRANCE (100% NATIF ET RAPIDE)
        // ========================================================
        if (icao.startsWith('LF')) {
            document.getElementById('diag-1').innerHTML = `✅ 1. Zone France détectée. Moteur SIA engagé.`;
            document.getElementById('diag-2').innerHTML = `⏳ 2. Scraping du Gouvernement Français...`;
            
            const dates = getAiracDates();
            
            // VAC VFR
            const siaVacUrl = `https://www.sia.aviation-civile.gouv.fr/media/dvd/eAIP_${dates.folderDate}/Atlas-VAC/PDF_AIPparSSection/VAC/AD/AD-2.${icao}.pdf`;
            foundCharts.push({ id: `${icao}_VAC`, icao: icao, type: 'GEN', name: `VAC VFR`, url: siaVacUrl });

            // Scraping IFR (Comme au bon vieux temps !)
            const eAipUrl = `https://www.sia.aviation-civile.gouv.fr/media/dvd/eAIP_${dates.folderDate}/FRANCE/AIRAC-${dates.isoDate}/html/eAIP/FR-AD-2.${icao}-fr-FR.html`;
            const proxyUrl = `${MY_PROXY}?url=${encodeURIComponent(eAipUrl)}`;

            const response = await fetch(proxyUrl);
            if (response.ok) {
                const htmlText = await response.text();
                if (!htmlText.includes("404 Not Found") && htmlText.length > 500) {
                    const regex = /href=['"]([^'"]+\.pdf)['"][^>]*>(.*?)<\/a>/gi;
                    let match; let idCounter = 1;
                    while ((match = regex.exec(htmlText)) !== null) {
                        let relativeLink = match[1];
                        let chartName = match[2].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
                        if (chartName.length < 3) chartName = (relativeLink.match(/([^\/]+)\.pdf$/i) || [])[1]?.replace(/_/g, ' ') || `Carte ${idCounter}`;

                        let absoluteUrl = relativeLink.startsWith('http') ? relativeLink : 
                            `https://www.sia.aviation-civile.gouv.fr/media/dvd/eAIP_${dates.folderDate}/FRANCE/AIRAC-${dates.isoDate}/html/eAIP/${relativeLink.replace(/(\.\.\/)+/g, '')}`;
                        
                        if (absoluteUrl.toUpperCase().includes(icao)) {
                            let type = 'GEN';
                            const n = chartName.toUpperCase();
                            if (n.includes('SID') || n.includes('DÉP') || n.includes('DEP')) type = 'SID';
                            else if (n.includes('STAR') || n.includes('ARR')) type = 'STAR';
                            else if (n.includes('APP') || n.includes('ILS') || n.includes('LOC') || n.includes('RNAV') || n.includes('VOR') || n.includes('NDB') || n.includes('IAC')) type = 'APP';
                            else if (n.includes('SOL') || n.includes('PRKG') || n.includes('PARKING') || n.includes('TAXI') || n.includes('GMC')) type = 'GND';
                            
                            if (!foundCharts.find(c => c.url === absoluteUrl)) {
                                foundCharts.push({ id: `${icao}_IFR_${idCounter++}`, icao: icao, type: type, name: chartName, url: absoluteUrl });
                            }
                        }
                    }
                    document.getElementById('diag-2').innerHTML = `✅ 2. Scraping réussi.`;
                    document.getElementById('diag-3').innerHTML = `🏁 3. ${foundCharts.length} cartes natives prêtes.`;
                } else {
                    document.getElementById('diag-2').innerHTML = `⚠️ 2. Aérodrome VFR uniquement.`;
                }
            } else {
                document.getElementById('diag-2').innerHTML = `❌ 2. Le serveur SIA ne répond pas.`;
                hasError = true;
            }
        } 
        // ========================================================
        // SCÉNARIO B : MOTEUR MONDIAL (CHARTFOX)
        // ========================================================
        else {
            document.getElementById('diag-1').innerHTML = `✅ 1. Zone Inter. Moteur Mondial engagé.`;
            const proxyUrl = `${MY_PROXY}?icao=${icao}`;

            const response = await fetch(proxyUrl);
            if (!response.ok) throw new Error("HTTP Failed");

            const textData = await response.text(); 
            if (textData.includes("<html") || textData.includes("login") || textData.includes("Auth")) {
                 document.getElementById('diag-2').innerHTML = `❌ 2. BLOCAGE : Session VATSIM expirée.`;
                 throw new Error("Session Expired");
            }

            const data = JSON.parse(textData);
            document.getElementById('diag-2').innerHTML = "✅ 2. Base mondiale lue avec succès.";
            
            let chartsData = [];
            if (data.props && data.props.groupedCharts) {
                Object.values(data.props.groupedCharts).forEach(group => {
                    if (Array.isArray(group)) chartsData.push(...group);
                });
            }

            if (chartsData.length > 0) {
                chartsData.forEach(chart => {
                    let type = 'GEN';
                    const cType = chart.type ? String(chart.type).toUpperCase() : '';
                    const cName = chart.name ? String(chart.name).toUpperCase() : '';

                    if (cType.includes('SID') || cType.includes('DEP') || cName.includes('SID') || cName.includes('DEP')) type = 'SID';
                    else if (cType.includes('STAR') || cType.includes('ARR') || cName.includes('STAR') || cName.includes('ARR')) type = 'STAR';
                    else if (cType.includes('APP') || cType.includes('IAC') || cName.includes('APP') || cName.includes('ILS') || cName.includes('LOC') || cName.includes('VOR') || cName.includes('NDB') || cName.includes('IAC') || cName.includes('RNP')) type = 'APP';
                    else if (cType.includes('TAXI') || cType.includes('GND') || cName.includes('TAXI') || cName.includes('GND') || cName.includes('PRKG') || cName.includes('PARKING') || cName.includes('SOL') || cName.includes('GMC')) type = 'GND';

                    const chartUrl = chart.view_url || chart.url || chart.file_url || "INCONNU";
                    
                    if (chartUrl !== "INCONNU") {
                        foundCharts.push({
                            id: chart.chartId || chart.id || `${icao}_${Math.random()}`,
                            icao: icao,
                            type: type,
                            name: chart.name || 'CARTE IFR',
                            url: chartUrl
                        });
                    }
                });
                document.getElementById('diag-3').innerHTML = `🏁 3. ${foundCharts.length} cartes extraites.`;
            } else {
                document.getElementById('diag-2').innerHTML = `⚠️ 2. Aucune carte trouvée.`;
                hasError = true;
            }
        }
    } catch (e) { 
        document.getElementById('diag-3').innerHTML = `❌ 3. Erreur : ${e.message}`;
        hasError = true;
    }

    setTimeout(() => {
        currentCharts = foundCharts;
        currentFilter = 'ALL'; 
        renderTabs();
        renderCategories();
    }, hasError ? 5000 : 500); 
}

// --- 6. Rendu Graphique ---
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

    const externalBtn = document.createElement('button');
    externalBtn.className = 'external-btn';
    externalBtn.innerHTML = '↗️';
    externalBtn.title = "Lien direct (Plein écran externe)";
    externalBtn.onclick = (e) => { 
        e.stopPropagation(); 
        const targetUrl = chart.url.startsWith('http') ? chart.url : `https://chartfox.org${chart.url}`;
        window.open(targetUrl, '_blank'); 
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

// --- 7. Logique Épingles ---
function togglePin(chart) {
    const index = pinnedCharts.findIndex(c => c.url === chart.url);
    if (index > -1) {
        pinnedCharts.splice(index, 1);
    } else {
        pinnedCharts.push(chart);
        if (!pdfCache[chart.url]) {
            const targetUrl = chart.url.startsWith('http') ? chart.url : `https://chartfox.org${chart.url}`;
            fetch(`${MY_PROXY}?url=${encodeURIComponent(targetUrl)}`)
                .then(res => res.ok ? res.blob() : Promise.reject())
                .then(blob => {
                    if(!blob.type.includes("text/html")) {
                        pdfCache[chart.url] = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
                    }
                }).catch(() => {});
        }
    }
    localStorage.setItem('savedDock', JSON.stringify(pinnedCharts));
    renderDock();
}

// --- 8. Lecteur PDF Sécurisé ---
async function loadChart(url) {
    pdfViewer.style.display = 'none';
    
    if (pdfCache[url]) {
        pdfViewer.src = pdfCache[url] + "#view=FitH";
        pdfViewer.style.display = 'block';
        viewerPlaceholder.style.display = 'none';
        return;
    }

    viewerPlaceholder.innerHTML = "Téléchargement de la carte...<br><span style='font-size: 11px; color:#00ff00;'>⚡ Réseau Sécurisé</span>";
    viewerPlaceholder.style.display = 'block';

    try {
        const targetUrl = url.startsWith('http') ? url : `https://chartfox.org${url}`;
        const response = await fetch(`${MY_PROXY}?url=${encodeURIComponent(targetUrl)}`);
        
        if (!response.ok) throw new Error("Erreur Serveur");
        
        const blob = await response.blob();
        
        if (blob.type.includes("text/html") || blob.type.includes("application/json")) {
            throw new Error("Ceci n'est pas un fichier PDF");
        }
        
        const pdfBlob = new Blob([blob], { type: 'application/pdf' });
        pdfCache[url] = URL.createObjectURL(pdfBlob);
        
        viewerPlaceholder.style.display = 'none';
        pdfViewer.src = pdfCache[url] + "#view=FitH";
        pdfViewer.style.display = 'block';
    } catch (e) {
        const targetUrl = url.startsWith('http') ? url : `https://chartfox.org${url}`;
        viewerPlaceholder.innerHTML = `
            <div class="popup-box">
                <button id="close-popup" class="close-btn">&times;</button>
                <p style="color: #f1c40f; margin-bottom: 15px; font-weight: bold;">⚠️ Format non-standard ou PDF protégé.</p>
                <p style="font-size: 13px; color: #aaa; margin-bottom: 15px;">Le site source exige que vous ouvriez la carte en externe.</p>
                <button onclick="window.open('${targetUrl}', '_blank')" style="padding: 10px 15px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">
                    Ouvrir la carte en direct ↗️
                </button>
            </div>
        `;
        document.getElementById('close-popup').onclick = () => viewerPlaceholder.style.display = 'none';
    }
}

// --- Initialisation au démarrage ---
renderTabs();
renderDock();