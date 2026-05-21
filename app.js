// --- 1. État de l'application et Mémoire Cache ---
let currentCharts = [];
let pinnedCharts = [];
const pdfCache = {}; 
let currentFilter = 'ALL';

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

// --- 4. Générateur automatique de cycle AIRAC (Format Double) ---
function getAiracDates() {
    const baseAirac = new Date('2024-01-25T00:00:00Z');
    const now = new Date();
    
    const msPerDay = 1000 * 60 * 60 * 24;
    const diffDays = Math.floor((now - baseAirac) / msPerDay);
    const cyclesPassed = Math.floor(diffDays / 28);
    
    const currentAirac = new Date(baseAirac.getTime() + cyclesPassed * 28 * msPerDay);
    
    const day = String(currentAirac.getUTCDate()).padStart(2, '0');
    const month = String(currentAirac.getUTCMonth() + 1).padStart(2, '0');
    const year = currentAirac.getUTCFullYear();
    
    const monthNames = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
    const monthName = monthNames[currentAirac.getUTCMonth()];
    
    return {
        folderDate: `${day}_${monthName}_${year}`, // Format du dossier racine (ex: 14_MAY_2026)
        isoDate: `${year}-${month}-${day}`          // Format du sous-dossier (ex: 2026-05-14)
    };
}

// --- 5. La fonction de recherche (Scraping SIA avec Proxy Anti-CORS) ---
async function performSearch() {
    const icao = searchInput.value.trim().toUpperCase();
    if (icao === '') return;

    airportTitle.textContent = "Aéroport : " + icao;
    
    // Le panneau de diagnostic en direct
    categoriesContainer.innerHTML = `
        <div style='padding: 15px; color: #ccc; font-size: 13px; font-family: monospace; background: #222; border: 1px solid #444; margin: 10px; border-radius: 5px;'>
            <strong style='color: #007bff;'>[DIAGNOSTIC EN COURS]</strong><br>
            <span id="diag-1">⏳ 1. Génération de la carte VAC...</span><br>
            <span id="diag-2"></span><br>
            <span id="diag-3"></span><br>
            <span id="diag-4"></span>
        </div>
    `;
    
    const dates = getAiracDates();
    let foundCharts = [];
    
    // 1. La VAC
    const siaVacUrl = `https://www.sia.aviation-civile.gouv.fr/media/dvd/eAIP_${dates.folderDate}/Atlas-VAC/PDF_AIPparSSection/VAC/AD/AD-2.${icao}.pdf`;
    foundCharts.push({ id: icao + '_VAC', type: 'INFO', name: `Carte VAC VFR`, url: siaVacUrl });
    document.getElementById('diag-1').innerHTML = "✅ 1. Carte VAC prête.";

    // 2. Le Scraping IFR
    document.getElementById('diag-2').innerHTML = `⏳ 2. Connexion au SIA pour ${icao}...`;
    const eAipUrl = `https://www.sia.aviation-civile.gouv.fr/media/dvd/eAIP_${dates.folderDate}/FRANCE/AIRAC-${dates.isoDate}/html/eAIP/FR-AD-2.${icao}-fr-FR.html`;
    
    // L'ASTUCE ANTI-CORS : On utilise /get au lieu de /raw et on désactive le cache
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(eAipUrl)}&disableCache=true`;

    try {
        const response = await fetch(proxyUrl);
        
        if (response.ok) {
            const data = await response.json(); // On déballe le paquet sécurisé
            
            // Si la page contient une erreur 404 du SIA
            if (data.contents && data.contents.includes("404 Not Found")) {
                document.getElementById('diag-2').innerHTML = `❌ 2. La page IFR n'existe pas (Erreur 404 SIA).`;
            } else if (data.contents) {
                const htmlText = data.contents;
                document.getElementById('diag-2').innerHTML = `✅ 2. Page lue (${htmlText.length} caractères).`;
                document.getElementById('diag-3').innerHTML = "⏳ 3. Analyse des liens...";
                
                const regex = /href=['"]([^'"]+\.pdf)['"][^>]*>(.*?)<\/a>/gi;
                let match;
                let idCounter = 1;
                let rawLinksFound = 0;
                
                while ((match = regex.exec(htmlText)) !== null) {
                    rawLinksFound++;
                    let relativeLink = match[1];
                    let rawName = match[2].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
                    
                    let chartName = rawName;
                    if (chartName === '' || chartName.length < 3) {
                        const filenameMatch = relativeLink.match(/([^\/]+)\.pdf$/i);
                        chartName = filenameMatch ? filenameMatch[1].replace(/_/g, ' ') : `Carte IFR ${idCounter}`;
                    }

                    let absoluteUrl = relativeLink;
                    if (!relativeLink.startsWith('http')) {
                         const cleanLink = relativeLink.replace(/(\.\.\/)+/g, '');
                         absoluteUrl = `https://www.sia.aviation-civile.gouv.fr/media/dvd/eAIP_${dates.folderDate}/FRANCE/AIRAC-${dates.isoDate}/html/eAIP/${cleanLink}`;
                    }
                    
                    if (absoluteUrl.toUpperCase().includes(icao)) {
                        let type = 'INFO';
                        const nameUpper = chartName.toUpperCase();
                        const linkUpper = absoluteUrl.toUpperCase();
                        
                        if (nameUpper.includes('SID') || linkUpper.includes('SID') || nameUpper.includes('DÉPART') || linkUpper.includes('DEP')) type = 'SID';
                        else if (nameUpper.includes('STAR') || linkUpper.includes('STAR') || nameUpper.includes('ARRIVÉE') || linkUpper.includes('ARR')) type = 'STAR';
                        else if (nameUpper.includes('APP') || linkUpper.includes('APP') || nameUpper.includes('ILS') || nameUpper.includes('LOC') || nameUpper.includes('RNAV') || nameUpper.includes('VOR') || linkUpper.includes('IAC')) type = 'APPR';
                        else if (nameUpper.includes('SOL') || nameUpper.includes('PARKING') || nameUpper.includes('TAXI') || nameUpper.includes('MOUVEMENT') || linkUpper.includes('GMC')) type = 'TAXI';
                        
                        if (!foundCharts.find(c => c.url === absoluteUrl)) {
                            foundCharts.push({ id: icao + '_IFR_' + idCounter, type: type, name: chartName, url: absoluteUrl });
                            idCounter++;
                        }
                    }
                }
                
                document.getElementById('diag-3').innerHTML = `✅ 3. Liens bruts trouvés : ${rawLinksFound}.`;
                document.getElementById('diag-4').innerHTML = `🏁 4. Cartes IFR validées : ${foundCharts.length - 1}`;
            } else {
                 document.getElementById('diag-2').innerHTML = `❌ 2. Contenu vide renvoyé par le proxy.`;
            }
        } else {
            document.getElementById('diag-2').innerHTML = `❌ 2. Échec HTTP du proxy (${response.status})`;
        }
    } catch (e) {
        document.getElementById('diag-2').innerHTML = `❌ 2. Crash réseau (Le proxy bloque).`;
        console.error(e);
    }

    // On fige l'écran 3 secondes pour vous laisser lire, puis on affiche la liste finale !
    setTimeout(() => {
        currentCharts = foundCharts;
        currentFilter = 'ALL'; 
        renderCategories();
    }, 3000);
}

// --- 6. Afficher la liste principale des cartes (AVEC ONGLETS) ---
function renderCategories() {
    categoriesContainer.innerHTML = ''; 

    if (currentCharts.length === 0) return;

    // 1. Création de la barre d'onglets
    const tabsDiv = document.createElement('div');
    tabsDiv.className = 'tabs-container';
    
    // Définition de nos catégories
    const tabs = [
        { id: 'ALL', label: 'TOUT' },
        { id: 'INFO', label: 'INFO' },
        { id: 'TAXI', label: 'TAXI' },
        { id: 'SID', label: 'SID' },
        { id: 'STAR', label: 'STAR' },
        { id: 'APPR', label: 'APPR' }
    ];

    // Génération des boutons
    tabs.forEach(tab => {
        const btn = document.createElement('button');
        btn.className = `tab-btn ${currentFilter === tab.id ? 'active' : ''}`;
        btn.textContent = tab.label;
        btn.addEventListener('click', () => {
            currentFilter = tab.id;
            renderCategories(); // On rafraîchit la liste avec le nouveau filtre
        });
        tabsDiv.appendChild(btn);
    });

    categoriesContainer.appendChild(tabsDiv);

    // 2. Création de la liste des cartes
    const ul = document.createElement('ul');
    ul.className = 'chart-list';

    // Application du filtre !
    const filteredCharts = currentFilter === 'ALL' 
        ? currentCharts 
        : currentCharts.filter(c => c.type === currentFilter);

    // Affichage des cartes correspondantes
    filteredCharts.forEach(chart => {
        const li = createChartElement(chart);
        ul.appendChild(li);
    });

    // Message si un onglet est vide (ex: pas de SID sur un petit aérodrome)
    if (filteredCharts.length === 0) {
        const emptyMsg = document.createElement('p');
        emptyMsg.style.padding = '20px';
        emptyMsg.style.color = '#666';
        emptyMsg.style.fontSize = '12px';
        emptyMsg.style.textAlign = 'center';
        emptyMsg.textContent = `Aucune carte de type ${currentFilter} disponible.`;
        categoriesContainer.appendChild(emptyMsg);
    } else {
        categoriesContainer.appendChild(ul);
    }
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

// --- 8. Charger et afficher le PDF (Avec pop-up fermable) ---
async function loadChart(url) {
    pdfViewer.style.display = 'none';
    
    if (pdfCache[url]) {
        pdfViewer.src = pdfCache[url] + "#view=FitH";
        pdfViewer.style.display = 'block';
        viewerPlaceholder.style.display = 'none';
        return;
    }

    viewerPlaceholder.innerHTML = "Chargement de la carte en cours...<br><span style='font-size: 11px; color: #888;'>(Cela peut prendre un moment via le serveur relais public)</span>";
    viewerPlaceholder.style.display = 'block';

    try {
        const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}&cb=${Date.now()}`;
        const response = await fetch(proxyUrl);
        
        if (!response.ok) throw new Error("Proxy saturé");
        
        const blob = await response.blob();
        const localUrl = URL.createObjectURL(blob);
        
        pdfCache[url] = localUrl;
        
        viewerPlaceholder.style.display = 'none';
        pdfViewer.src = localUrl + "#view=FitH";
        pdfViewer.style.display = 'block';
        
    } catch (error) {
        console.error("Erreur de transit :", error);
        
        // Le pop-up amélioré avec une croix de fermeture (X)
        viewerPlaceholder.innerHTML = `
            <div style="position: relative; text-align: center; background: #222; padding: 35px 25px 25px; border-radius: 6px; border: 1px solid #444; max-width: 85%; margin: auto;">
                <button id="close-popup-btn" style="position: absolute; top: 10px; right: 15px; background: none; border: none; color: #888; font-size: 24px; cursor: pointer; font-weight: bold;">&times;</button>
                <p style="color: #ffc107; margin-bottom: 15px; font-size: 14px; font-weight: bold;">⚠️ Le serveur relais public est temporairement saturé.</p>
                <button id="fallback-btn" style="padding: 10px 20px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 13px;">
                    Ouvrir la carte (Nouvel onglet)
                </button>
            </div>
        `;
        
        // Action : Ouvrir le lien
        document.getElementById('fallback-btn').addEventListener('click', () => {
            window.open(url, '_blank');
        });

        // Action : Fermer le pop-up
        document.getElementById('close-popup-btn').addEventListener('click', () => {
            viewerPlaceholder.style.display = 'none';
        });
    }
}

// --- 9. Gérer l'ajout ou le retrait d'une épingle (AVEC PRÉ-CHARGEMENT) ---
async function togglePin(chart) {
    const index = pinnedCharts.findIndex(c => c.id === chart.id);
    
    if (index > -1) {
        // Retrait de l'épingle
        pinnedCharts.splice(index, 1);
    } else {
        // Ajout de l'épingle
        pinnedCharts.push(chart);
        
        // --- LA MAGIE : Pré-téléchargement silencieux en arrière-plan ---
        if (!pdfCache[chart.url]) {
            console.log(`Pré-téléchargement silencieux de ${chart.name}...`);
            try {
                const proxyUrl = "https://api.allorigins.win/raw?url=";
                // On lance le téléchargement sans bloquer l'interface
                fetch(proxyUrl + encodeURIComponent(chart.url))
                    .then(response => {
                        if (response.ok) return response.blob();
                        throw new Error("Erreur Proxy");
                    })
                    .then(blob => {
                        // On le stocke dans la mémoire de l'iPad
                        pdfCache[chart.url] = URL.createObjectURL(blob);
                        console.log(`✅ ${chart.name} est en cache et s'ouvrira instantanément !`);
                    })
                    .catch(err => console.log("Le pré-chargement a échoué, il se fera au clic normal."));
            } catch (error) {
                // Erreur ignorée silencieusement pour ne pas perturber l'utilisateur
            }
        }
    }
    
    renderPinned();
    if (currentCharts.length > 0) {
        renderCategories(); 
    }
}