// --- 5. Moteur de Recherche Mondial (Chartfox via Cloudflare) ---
async function performSearch() {
    const icao = searchInput.value.trim().toUpperCase();
    if (icao === '') return;

    airportTitle.textContent = icao;
    
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

        const textData = await response.text(); 
        
        if (textData.includes("<html") || textData.includes("login") || textData.includes("Auth")) {
             document.getElementById('diag-1').innerHTML = `❌ 1. BLOCAGE : Session VATSIM expirée.`;
             throw new Error("Session Expired");
        }

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
                
                // LE BOUCLIER ANTI-CRASH : On force la conversion en texte (String)
                const cType = chart.type ? String(chart.type).toUpperCase() : '';
                const cName = chart.name ? String(chart.name).toUpperCase() : '';

                if (cType === 'SID' || cName.includes('SID') || cName.includes('DEPARTURE')) type = 'SID';
                else if (cType === 'STAR' || cName.includes('STAR') || cName.includes('ARRIVAL')) type = 'STAR';
                else if (cType === 'APP' || cName.includes('ILS') || cName.includes('RNAV') || cName.includes('APPROACH')) type = 'APP';
                else if (cType === 'TAXI' || cType === 'GND' || cName.includes('TAXI') || cName.includes('PARKING')) type = 'GND';

                const isDuplicateVAC = type === 'GEN' && cName.includes('VAC') && icao.startsWith('LF');
                
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

    const hasError = document.getElementById('diag-1').innerHTML.includes('❌') || document.getElementById('diag-2').innerHTML.includes('⚠️');
    
    setTimeout(() => {
        currentCharts = foundCharts;
        currentFilter = 'ALL'; 
        renderTabs();
        renderCategories();
    }, hasError ? 5000 : 300); 
}