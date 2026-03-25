// ============================================================
// Sensor QC Analysis - Application State & Configuration
// ============================================================

// Global error handler for unhandled errors
window.onerror = function(message, source, lineno, colno, error) {
    console.error('Unhandled error:', message, 'at', source, lineno);
    if (typeof showAlert === 'function') {
        showAlert('An unexpected error occurred: ' + message, 'danger');
    } else {
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = 'position:fixed;top:10px;left:50%;transform:translateX(-50%);background:#fee2e2;border:1px solid #ef4444;color:#991b1b;padding:1rem;border-radius:8px;z-index:10000;max-width:90%;';
        const msgSpan = document.createElement('strong');
        msgSpan.textContent = 'An error occurred: ';
        errorDiv.appendChild(msgSpan);
        errorDiv.appendChild(document.createTextNode(message));
        const br = document.createElement('br');
        errorDiv.appendChild(br);
        const dismissBtn = document.createElement('button');
        dismissBtn.textContent = 'Dismiss';
        dismissBtn.style.cssText = 'margin-top:0.5rem;padding:4px 8px;cursor:pointer;';
        dismissBtn.onclick = function() { errorDiv.remove(); };
        errorDiv.appendChild(dismissBtn);
        document.body.appendChild(errorDiv);
    }
    return false;
};

// ============================================================
// CONFIGURATION
// ============================================================

window.SensorQC = {
    // Configuration
    THRESHOLDS: {
        'Standard': {
            min_120s: 1.50,
            max_120s: 4.9,
            min_pct_change: -6.00,
            max_pct_change: 30.00,
            max_pairwise_dev: 0.3,
            min_0s: 0.45,
            max_0s: 0.55
        },
        'High Range': {
            min_120s: 0.55,
            max_120s: 1.0,
            min_pct_change: 0.00,
            max_pct_change: 75.00,
            max_pairwise_dev: 0.5,
            min_0s: 0.45,
            max_0s: 0.55
        }
    },
    TIME_POINTS: ['0', '5', '15', '30', '60', '90', '120'],
    STATUS_PRIORITY: {
        'FL': 1, 'FH': 2, 'OT-': 3, 'PASS': 4, 'TT': 5, 'OT+': 6, 'BL': 7, 'FAIL': 8
    },
    STATUS_COLORS: {
        'PASS': '#10b981',
        'FL': '#ef4444',
        'FH': '#dc2626',
        'OT-': '#ea580c',
        'TT': '#eab308',
        'OT+': '#fb923c',
        'BL': '#06b6d4',
        'FAIL': '#7c3aed'
    },
    TEST_COLORS: ['#667eea', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'],

    // State
    rawData: [],
    analysisResults: null,
    currentJob: null,
    currentJobData: null,
    jobHistory: JSON.parse(localStorage.getItem('sensorJobHistory') || '[]'),
    jobStatsHistory: JSON.parse(localStorage.getItem('sensorJobStatsHistory') || '[]'),
    activeFilters: new Set(['PASS', 'FL', 'FH', 'OT-', 'TT', 'OT+', 'BL', 'FAIL']),
    charts: {},
    sqlDb: null,
    sqlEngine: null,

    // Multi-job state
    multiJobMode: false,
    multiJobResults: new Map(),
    currentJobList: [],
    currentTier: 'single',

    // IndexedDB constants
    DB_NAME: 'SensorAnalysisDB',
    DB_VERSION: 1,
    STORE_NAME: 'databases'
};

// ============================================================
// MAIN ANALYSIS ORCHESTRATOR
// ============================================================

function runAnalysis() {
    const jobInput = document.getElementById('jobNumber');
    const inputStr = jobInput.value.trim();
    const thresholdSet = document.getElementById('thresholdSet').value;

    if (!inputStr) {
        showAlert('⚠️ Please enter a job number', 'warning');
        jobInput.focus();
        return;
    }

    if (SensorQC.rawData.length === 0) {
        showAlert('⚠️ Please load data first', 'warning');
        return;
    }

    // Parse job input (supports multi-job syntax)
    const jobNumbers = parseJobInput(inputStr);

    if (jobNumbers.length === 0) {
        showAlert('⚠️ No valid job numbers found in input', 'warning');
        jobInput.focus();
        return;
    }

    // Update chips and tier badge
    renderJobChips(jobNumbers);
    resetMultiJobView();

    const baseTier = getDisplayTier(jobNumbers.length);
    const tier = getEffectiveTier(baseTier, jobNumbers.length);
    SensorQC.currentTier = tier;
    SensorQC.currentJobList = jobNumbers;

    showLoading(`Analyzing ${jobNumbers.length} job(s)...`);

    setTimeout(() => {
        try {
            if (jobNumbers.length === 1) {
                // ========== SINGLE JOB MODE (original behavior) ==========
                SensorQC.multiJobMode = false;
                const jobNumber = jobNumbers[0];

                const jobData = getJobData(SensorQC.rawData, jobNumber);
                if (jobData.length === 0) {
                    hideLoading();
                    showAlert(`❌ No data found for Job # ${jobNumber}`, 'danger');
                    return;
                }

                const dataWithMetrics = calculateMetrics(jobData);
                SensorQC.analysisResults = determinePassFail(dataWithMetrics, thresholdSet);
                SensorQC.currentJob = jobNumber;
                SensorQC.currentJobData = jobData;

                applyStatusOverrides(SensorQC.analysisResults, jobNumber);

                if (SensorQC.analysisResults.length === 0) {
                    hideLoading();
                    showAlert('❌ No valid sensor readings found', 'danger');
                    return;
                }

                const welcomeScreen = document.getElementById('welcomeScreen');
                if (welcomeScreen) welcomeScreen.classList.add('hidden');
                document.getElementById('resultsSection').classList.remove('hidden');

                renderMetrics(SensorQC.analysisResults, thresholdSet);
                renderStatusFilters(SensorQC.analysisResults);
                SensorQC.activeFilters = new Set(['PASS', 'FL', 'FH', 'OT-', 'TT', 'OT+', 'BL', 'FAIL']);
                renderTable();
                renderCharts(SensorQC.analysisResults, jobData, thresholdSet);
                renderThresholdInfo(thresholdSet);

                const anomalies = detectAnomalies(SensorQC.analysisResults, SensorQC.THRESHOLDS[thresholdSet]);
                renderAnomalies(anomalies);

                updateJobHistory(jobNumber);
                enableExportButtons(true);

                hideLoading();
                showAlert(`✅ Analyzed ${SensorQC.analysisResults.length} sensors from ${jobData.length} records`, 'success');

            } else {
                // ========== MULTI-JOB MODE ==========
                SensorQC.multiJobMode = true;

                runMultiJobAnalysis(jobNumbers, thresholdSet);

                if (SensorQC.multiJobResults.size === 0) {
                    hideLoading();
                    showAlert('❌ No data found for any of the specified jobs', 'danger');
                    return;
                }

                // Set currentJob to first job for compatibility
                const firstEntry = [...SensorQC.multiJobResults.entries()][0];
                SensorQC.currentJob = firstEntry[0];
                SensorQC.currentJobData = firstEntry[1].jobData;
                // Combine all results for filter/export compatibility
                SensorQC.analysisResults = [...SensorQC.multiJobResults.values()].flatMap(d => d.results);

                const welcomeScreen = document.getElementById('welcomeScreen');
                if (welcomeScreen) welcomeScreen.classList.add('hidden');
                document.getElementById('resultsSection').classList.remove('hidden');

                // Adaptive rendering based on tier
                renderMultiJobMetrics(tier);
                renderStatusFilters(SensorQC.analysisResults);
                SensorQC.activeFilters = new Set(['PASS', 'FL', 'FH', 'OT-', 'TT', 'OT+', 'BL', 'FAIL']);
                renderMultiJobTable(tier);
                renderMultiJobCharts(tier);
                renderThresholdInfo(thresholdSet);
                renderMultiJobAnomalies(tier);

                // Update history for primary job
                updateJobHistory(SensorQC.currentJob);
                enableExportButtons(true);

                const totalSensors = [...SensorQC.multiJobResults.values()].reduce((s, d) => s + d.stats.total, 0);
                const totalRecords = [...SensorQC.multiJobResults.values()].reduce((s, d) => s + d.jobData.length, 0);

                hideLoading();
                showAlert(`✅ Analyzed ${SensorQC.multiJobResults.size} jobs: ${totalSensors} sensors from ${totalRecords} records (${tier} mode)`, 'success');
            }
        } catch (err) {
            hideLoading();
            showAlert(`❌ Analysis error: ${err.message}`, 'danger');
            console.error(err);
        }
    }, 50);
}

// ============================================================
// INITIALIZATION
// ============================================================

document.addEventListener('DOMContentLoaded', function() {
    // CSV upload
    const csvUploadArea = document.getElementById('csvUploadArea');
    const csvFileInput = document.getElementById('csvFileInput');
    
    csvUploadArea.addEventListener('click', () => csvFileInput.click());
    csvUploadArea.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); csvFileInput.click(); }
    });
    csvUploadArea.addEventListener('dragover', e => { e.preventDefault(); csvUploadArea.classList.add('dragover'); });
    csvUploadArea.addEventListener('dragleave', () => csvUploadArea.classList.remove('dragover'));
    csvUploadArea.addEventListener('drop', e => {
        e.preventDefault();
        csvUploadArea.classList.remove('dragover');
        if (e.dataTransfer.files[0]) handleCSVFile(e.dataTransfer.files[0]);
    });
    csvFileInput.addEventListener('change', e => {
        if (e.target.files[0]) handleCSVFile(e.target.files[0]);
    });

    // DB upload
    const dbUploadArea = document.getElementById('dbUploadArea');
    const dbFileInput = document.getElementById('dbFileInput');

    dbUploadArea.addEventListener('click', () => dbFileInput.click());
    dbUploadArea.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); dbFileInput.click(); }
    });
    dbUploadArea.addEventListener('dragover', e => { e.preventDefault(); dbUploadArea.classList.add('dragover'); });
    dbUploadArea.addEventListener('dragleave', () => dbUploadArea.classList.remove('dragover'));
    dbUploadArea.addEventListener('drop', e => {
        e.preventDefault();
        dbUploadArea.classList.remove('dragover');
        if (e.dataTransfer.files[0]) loadDatabaseFile(e.dataTransfer.files[0]);
    });
    dbFileInput.addEventListener('change', e => {
        if (e.target.files[0]) loadDatabaseFile(e.target.files[0]);
    });

    // Buttons
    document.getElementById('analyzeBtn').addEventListener('click', runAnalysis);
    document.getElementById('jobNumber').addEventListener('keypress', e => { if (e.key === 'Enter') runAnalysis(); });
    document.getElementById('exportCsvBtn').addEventListener('click', exportCSV);
    document.getElementById('exportPdfBtn').addEventListener('click', exportPDF);
    document.getElementById('summaryReportBtn').addEventListener('click', showSummaryReport);
    
    // Tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });
    
    // Serial search
    document.getElementById('serialSearch').addEventListener('input', renderTable);

    // Mode override re-renders when changed
    document.getElementById('modeOverride').addEventListener('change', () => {
        if (SensorQC.multiJobMode && SensorQC.multiJobResults.size > 0) {
            const baseTier = getDisplayTier(SensorQC.currentJobList.length);
            const tier = getEffectiveTier(baseTier, SensorQC.currentJobList.length);
            SensorQC.currentTier = tier;
            renderJobChips(SensorQC.currentJobList);
            resetMultiJobView();
            renderMultiJobMetrics(tier);
            renderMultiJobTable(tier);
            renderMultiJobCharts(tier);
            renderMultiJobAnomalies(tier);
        }
    });
    
    // Initialize
    renderJobHistory();

    // Auto-load previous database (if one was loaded before)
    (async function() {
        try {
            const lastDb = await getLastDatabase();
            if (lastDb && lastDb.data && lastDb.fileName) {
                await loadDatabaseFromArrayBuffer(lastDb.data, lastDb.fileName, true);
            }
        } catch (err) {
            console.error('Failed to auto-load previous database:', err);
        }
    })();
});
