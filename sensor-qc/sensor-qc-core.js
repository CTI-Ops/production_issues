// ============================================================
// Sensor QC Analysis - Core Data, Parsing & Analysis Functions
// ============================================================

function openIndexedDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };
    });
}

async function saveLastDatabase(arrayBuffer, fileName) {
    try {
        const db = await openIndexedDB();
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        await new Promise((resolve, reject) => {
            const request = store.put({
                id: 'lastDatabase',
                data: arrayBuffer,
                fileName: fileName,
                savedAt: new Date().toISOString()
            });
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
        db.close();
    } catch (err) {
        console.error('Failed to save database to IndexedDB:', err);
    }
}

async function getLastDatabase() {
    try {
        const db = await openIndexedDB();
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const result = await new Promise((resolve, reject) => {
            const request = store.get('lastDatabase');
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        db.close();
        return result;
    } catch (err) {
        console.error('Failed to retrieve database from IndexedDB:', err);
        return null;
    }
}

async function clearLastDatabase() {
    try {
        const db = await openIndexedDB();
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        await new Promise((resolve, reject) => {
            const request = store.delete('lastDatabase');
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
        db.close();
    } catch (err) {
        console.error('Failed to clear database from IndexedDB:', err);
    }
}

// ============================================================
// SQL.js INITIALIZATION (Fixed naming conflict)
// ============================================================

async function loadSqlEngine() {
    if (sqlEngine) return sqlEngine;
    
    showLoading('Initializing database engine...');
    try {
        sqlEngine = await initSqlJs({
            locateFile: file => `https://sql.js.org/dist/${file}`
        });
        hideLoading();
        return sqlEngine;
    } catch (err) {
        hideLoading();
        console.error('Failed to initialize SQL.js:', err);
        throw err;
    }
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

function showLoading(text = 'Loading...') {
    document.getElementById('loadingText').textContent = text;
    document.getElementById('loadingOverlay').classList.remove('hidden');
}

function hideLoading() {
    document.getElementById('loadingOverlay').classList.add('hidden');
}

function parseCSV(text) {
    const lines = text.trim().split('\n');
    if (lines.length < 2) throw new Error('CSV must have header and data');
    
    const headers = parseCSVLine(lines[0]);
    const data = [];
    
    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const values = parseCSVLine(lines[i]);
        const row = {};
        
        headers.forEach((header, idx) => {
            let value = values[idx] || '';
            if (TIME_POINTS.includes(header) || header === 'Test #') {
                const num = parseFloat(value);
                row[header] = isNaN(num) ? null : num;
            } else if (header === 'Timestamp' || header === 'Date' || header === 'Test Date') {
                // Normalize date column names to 'Timestamp'
                const trimmed = value.trim();
                row['Timestamp'] = trimmed !== '' ? trimmed : null;
            } else {
                row[header] = value.trim();
            }
        });
        
        data.push(row);
    }
    
    return data;
}

function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current.trim());
    return result;
}

function calculateMean(values) {
    if (values.length === 0) return null;
    return values.reduce((a, b) => a + b, 0) / values.length;
}

function calculateStdDev(values) {
    if (values.length < 2) return 0;
    const mean = calculateMean(values);
    const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / (values.length - 1);
    return Math.sqrt(variance);
}

function calculateMaxPairwiseDev(values) {
    if (values.length < 2) return 0;
    let maxDev = 0;
    for (let i = 1; i < values.length; i++) {
        maxDev = Math.max(maxDev, Math.abs(values[i] - values[i - 1]));
    }
    return maxDev;
}

function calculatePercentile(values, percentile) {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const index = (percentile / 100) * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    if (lower === upper) return sorted[lower];
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function filterOutliersIQR(values) {
    if (values.length < 4) return values;
    const q1 = calculatePercentile(values, 25);
    const q3 = calculatePercentile(values, 75);
    const iqr = q3 - q1;
    const lowerBound = q1 - 1.5 * iqr;
    const upperBound = q3 + 1.5 * iqr;
    return values.filter(v => v >= lowerBound && v <= upperBound);
}

// ============================================================
// DATABASE FUNCTIONS (Fixed)
// ============================================================

async function loadDatabaseFromArrayBuffer(arrayBuffer, fileName, isAutoLoad = false) {
    const loadingMsg = isAutoLoad ? `Restoring previous database (${fileName})...` : 'Loading database...';
    showLoading(loadingMsg);

    try {
        const SQL = await loadSqlEngine();

        const uint8Array = new Uint8Array(arrayBuffer);

        sqlDb = new SQL.Database(uint8Array);

        // Query the sensor_readings table
        const results = sqlDb.exec("SELECT * FROM sensor_readings");

        if (results.length === 0) {
            throw new Error('No data found in sensor_readings table');
        }

        const columns = results[0].columns;
        const rows = results[0].values;

        rawData = rows.map(row => {
            const obj = {};
            columns.forEach((col, idx) => {
                if (TIME_POINTS.includes(col) || col === 'Test #') {
                    const num = parseFloat(row[idx]);
                    obj[col] = isNaN(num) ? null : num;
                } else if (col === 'Timestamp') {
                    obj[col] = row[idx] !== null ? String(row[idx]).trim() : null;
                } else {
                    obj[col] = row[idx] !== null ? String(row[idx]).trim() : '';
                }
            });
            return obj;
        });

        hideLoading();

        const uniqueJobs = [...new Set(rawData.map(r => r['Job #']))];
        const sourceLabel = isAutoLoad ? `Restored: ${fileName}` : 'Database';
        showAlert(`✅ Loaded ${rawData.length} records from ${uniqueJobs.length} jobs (${sourceLabel})`, 'success');
        document.getElementById('analyzeBtn').disabled = false;
        enableExportButtons(false);

        // Switch to Database tab when auto-loading
        if (isAutoLoad) {
            switchUploadType('db');
        }

        // Collapse the Data Source section after successful load
        document.getElementById('dataSourceCollapsible').classList.remove('open');

        return true;

    } catch (err) {
        hideLoading();
        const errorPrefix = isAutoLoad ? 'Failed to restore database' : 'Database error';
        showAlert(`❌ ${errorPrefix}: ${err.message}`, 'danger');
        console.error(err);
        return false;
    }
}

async function loadDatabaseFile(file) {
    try {
        const arrayBuffer = await file.arrayBuffer();
        const success = await loadDatabaseFromArrayBuffer(arrayBuffer, file.name, false);

        // Save to IndexedDB for auto-load on next visit (only on success)
        if (success) {
            await saveLastDatabase(arrayBuffer, file.name);
        }
    } catch (err) {
        hideLoading();
        showAlert(`❌ Database error: ${err.message}`, 'danger');
        console.error(err);
    }
}

// ============================================================
// CORE ANALYSIS LOGIC
// ============================================================

function calculateMetrics(data) {
    const MIN_DENOMINATOR = 0.001; // Minimum |V90 - V0| to avoid division by near-zero
    const MAX_PCT_CHANGE = 1000;   // Cap at ±1000% to reject nonsensical outliers

    return data.map(row => {
        const v0 = row['0'];
        const v90 = row['90'];
        const v120 = row['120'];

        let pctChange = null;

        if (v0 !== null && v90 !== null && v120 !== null) {
            const denominator = v90 - v0;
            if (Math.abs(denominator) >= MIN_DENOMINATOR) {
                const rawPctChange = ((v120 - v90) / denominator) * 100;
                if (Math.abs(rawPctChange) <= MAX_PCT_CHANGE) {
                    pctChange = Math.round(rawPctChange * 1000) / 1000;
                }
            }
        }

        return { ...row, pct_change_90_120: pctChange };
    });
}

function determinePassFail(data, thresholdSet = 'Standard') {
    const thresholds = THRESHOLDS[thresholdSet];
    
    const grouped = {};
    data.forEach(row => {
        const serial = row['Serial Number'];
        if (!grouped[serial]) grouped[serial] = [];
        grouped[serial].push(row);
    });
    
    const results = [];
    
    for (const [serial, group] of Object.entries(grouped)) {
        const readings120 = group
            .map(row => row['120'])
            .filter(v => v !== null && v !== undefined && !isNaN(v));
        
        if (readings120.length === 0) continue;
        
        const maxPairDev120 = calculateMaxPairwiseDev(readings120);

        const serialRow = {
            'Serial Number': serial,
            'Channel': (group[2] || group[group.length - 1])['Channel'] || '',
            'testCount': group.length,
            'readings120': readings120,
            'testData': []
        };
        
        const allFailureCodes = [];
        
        group.forEach((row, testIdx) => {
            const testNum = testIdx + 1;
            const testPrefix = `T${testNum}`;
            
            serialRow[`0s(${testPrefix})`] = row['0'];
            serialRow[`90s(${testPrefix})`] = row['90'];
            serialRow[`120s(${testPrefix})`] = row['120'];
            
            const pctChange = row.pct_change_90_120;
            serialRow[`%Chg(${testPrefix})`] = pctChange !== null ? `${pctChange.toFixed(1)}%` : null;
            
            const failureCodes = [];
            const reading120 = row['120'];
            
            if (reading120 !== null && !isNaN(reading120)) {
                if (reading120 < thresholds.min_120s) failureCodes.push('FL');
                if (reading120 > thresholds.max_120s) failureCodes.push('FH');
            }
            
            if (pctChange !== null && !isNaN(pctChange)) {
                if (pctChange < thresholds.min_pct_change) failureCodes.push('OT-');
                if (pctChange > thresholds.max_pct_change) failureCodes.push('OT+');
            }

            const reading0s = row['0'];
            if (reading0s !== null && reading0s !== undefined && !isNaN(reading0s)) {
                if (reading0s < thresholds.min_0s || reading0s > thresholds.max_0s) {
                    failureCodes.push('BL');
                }
            }

            const testStatus = failureCodes.length === 0 ? 'PASS' : [...new Set(failureCodes)].sort().join(',');
            serialRow[`Status(${testPrefix})`] = testStatus;
            
            // Store test data for charts
            serialRow.testData.push({
                testNum,
                status: testStatus.split(',')[0], // Primary status
                readings: TIME_POINTS.map(tp => row[tp])
            });
            
            allFailureCodes.push(...failureCodes);
        });
        
        if (maxPairDev120 > thresholds.max_pairwise_dev) {
            allFailureCodes.push('TT');
        }
        
        // Determine final status with PASS prioritization
        let finalStatus;
        if (allFailureCodes.length === 0) {
            // All tests passed
            finalStatus = 'PASS';
        } else {
            const uniqueFailures = [...new Set(allFailureCodes)];
            
            // Check if there's a critical failure (FL, FH, or OT-)
            const hasCriticalFailure = uniqueFailures.some(code => code === 'FL' || code === 'FH' || code === 'OT-');
            
            // Check if any test passed (by checking Status columns)
            const hasAnyPass = group.some((row, idx) => {
                const testNum = idx + 1;
                const testStatus = serialRow[`Status(T${testNum})`];
                return testStatus === 'PASS';
            });
            
            if (hasCriticalFailure) {
                // Critical failures always show
                uniqueFailures.sort((a, b) => (STATUS_PRIORITY[a] || 99) - (STATUS_PRIORITY[b] || 99));
                finalStatus = uniqueFailures[0];
            } else if (hasAnyPass) {
                // If any test passed and no critical failures, show PASS
                finalStatus = 'PASS';
            } else {
                // Show the highest priority non-critical failure
                uniqueFailures.sort((a, b) => (STATUS_PRIORITY[a] || 99) - (STATUS_PRIORITY[b] || 99));
                finalStatus = uniqueFailures[0];
            }
        }
        
        serialRow['Pass/Fail'] = finalStatus;
        serialRow['120s(MaxΔ)'] = maxPairDev120;
        results.push(serialRow);
    }
    
    return results;
}

function detectAnomalies(results, thresholds) {
    const anomalies = [];
    
    results.forEach(row => {
        const maxPairDev = row['120s(MaxΔ)'];
        if (maxPairDev > thresholds.max_pairwise_dev * 2) {
            anomalies.push({
                serial: row['Serial Number'],
                channel: row['Channel'],
                type: 'High Variability',
                severity: 'High',
                message: `Max pairwise deviation ${maxPairDev.toFixed(3)}V exceeds 2× threshold`
            });
        }
        
        const readings = row.readings120 || [];
        if (readings.length > 1) {
            const range = Math.max(...readings) - Math.min(...readings);
            if (range > 3.0) {
                anomalies.push({
                    serial: row['Serial Number'],
                    channel: row['Channel'],
                    type: 'Large Delta',
                    severity: 'Medium',
                    message: `Voltage range ${range.toFixed(1)}V exceeds 3V threshold`
                });
            }
        }

        // Check for 0s baseline out of range
        const testCount = row.testCount || 1;
        for (let t = 1; t <= testCount; t++) {
            const v0 = row[`0s(T${t})`];
            if (v0 !== null && v0 !== undefined && !isNaN(v0)) {
                if (v0 < thresholds.min_0s || v0 > thresholds.max_0s) {
                    const extreme = v0 < thresholds.min_0s - 0.10 || v0 > thresholds.max_0s + 0.10;
                    anomalies.push({
                        serial: row['Serial Number'],
                        channel: row['Channel'],
                        type: 'Baseline Out of Range',
                        severity: extreme ? 'High' : 'Medium',
                        message: `0s baseline ${v0.toFixed(3)}V (T${t}) outside ${thresholds.min_0s}-${thresholds.max_0s}V range`
                    });
                    break;
                }
            }
        }
    });
    
    return anomalies;
}


// ============================================================
// JOB INPUT PARSING & MULTI-JOB ANALYSIS
// ============================================================

function parseJobInput(inputStr) {
    const str = inputStr.trim().toLowerCase();
    if (!str) return [];

    // Handle "all" or "*"
    if (str === 'all' || str === '*') {
        const allJobs = [...new Set(rawData.map(r => {
            const wholeNum = parseInt(r['Job #'], 10);
            return isNaN(wholeNum) ? null : wholeNum;
        }).filter(j => j !== null))];
        return allJobs.sort((a, b) => a - b).map(String);
    }

    const jobs = new Set();
    const parts = str.split(',').map(p => p.trim()).filter(p => p);

    for (const part of parts) {
        // Check for range: "258-265"
        const rangeMatch = part.match(/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$/);
        if (rangeMatch) {
            const start = parseInt(rangeMatch[1], 10);
            const end = parseInt(rangeMatch[2], 10);
            if (!isNaN(start) && !isNaN(end)) {
                const lo = Math.min(start, end);
                const hi = Math.max(start, end);
                // Safety limit: max 200 jobs in a range
                if (hi - lo > 200) continue;
                for (let j = lo; j <= hi; j++) {
                    jobs.add(String(j));
                }
            }
        } else if (/^[0-9]+(\.[0-9]+)?$/.test(part)) {
            jobs.add(part);
        }
    }

    return [...jobs].sort((a, b) => parseFloat(a) - parseFloat(b));
}

function getDisplayTier(count) {
    if (count <= 1) return 'single';
    if (count <= 5) return 'few';
    if (count <= 15) return 'many';
    return 'bulk';
}

function getEffectiveTier(baseTier, jobCount) {
    if (jobCount < 2) return baseTier;
    if (baseTier === 'few') return baseTier; // Comparison mode is not overridable
    const override = document.getElementById('modeOverride')?.value;
    if (override && override !== 'auto') return override;
    return baseTier;
}

// --- Statistical helpers for mode differentiation ---

function calculateSkewness(values) {
    if (values.length < 3) return 0;
    const mean = calculateMean(values);
    const std = calculateStdDev(values);
    if (std === 0) return 0;
    const n = values.length;
    const sum = values.reduce((s, v) => s + Math.pow((v - mean) / std, 3), 0);
    return (n / ((n - 1) * (n - 2))) * sum;
}

function calculateIQR(values) {
    const q1 = calculatePercentile(values, 25);
    const q3 = calculatePercentile(values, 75);
    return { q1, q3, iqr: q3 - q1 };
}

function calculateCv(values) {
    const mean = calculateMean(values);
    if (mean === 0) return 0;
    return (calculateStdDev(values) / mean) * 100;
}

function calculateLinearSlope(values) {
    const n = values.length;
    if (n < 2) return 0;
    const xMean = (n - 1) / 2;
    const yMean = calculateMean(values);
    let num = 0, den = 0;
    values.forEach((y, i) => { num += (i - xMean) * (y - yMean); den += (i - xMean) ** 2; });
    return den !== 0 ? num / den : 0;
}

function detectChangePoints(values, minSegment) {
    // Simple change-point: split at each point, compare means of left/right
    if (values.length < minSegment * 2) return [];
    const overallStd = calculateStdDev(values);
    if (overallStd === 0) return [];
    const points = [];
    for (let i = minSegment; i <= values.length - minSegment; i++) {
        const leftMean = calculateMean(values.slice(0, i));
        const rightMean = calculateMean(values.slice(i));
        if (Math.abs(rightMean - leftMean) > overallStd) {
            points.push({ index: i, leftMean, rightMean, diff: rightMean - leftMean });
        }
    }
    // Return the most significant one
    if (points.length === 0) return [];
    points.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
    return [points[0]];
}

function getQuartile(value, q1, median, q3) {
    if (value >= q3) return 1; // top quartile
    if (value >= median) return 2;
    if (value >= q1) return 3;
    return 4; // bottom quartile
}

function calculateRunLengths(values) {
    // Returns array of {direction, length} for consecutive increases/decreases
    const runs = [];
    if (values.length < 2) return values.map(() => ({ dir: '=', len: 0 }));
    const result = [{ dir: '=', len: 0 }]; // first job has no delta
    let currentDir = null;
    let currentLen = 0;
    for (let i = 1; i < values.length; i++) {
        const delta = values[i] - values[i - 1];
        const dir = delta > 0.1 ? 'up' : delta < -0.1 ? 'down' : 'flat';
        if (dir === currentDir && dir !== 'flat') {
            currentLen++;
        } else {
            currentDir = dir;
            currentLen = 1;
        }
        result.push({ dir: dir === 'flat' ? '=' : dir, len: dir === 'flat' ? 0 : currentLen });
    }
    return result;
}

function runMultiJobAnalysis(jobNumbers, thresholdSet) {
    multiJobResults.clear();

    for (const jobNum of jobNumbers) {
        const jobData = getJobData(rawData, jobNum);
        if (jobData.length === 0) continue;

        const dataWithMetrics = calculateMetrics(jobData);
        const results = determinePassFail(dataWithMetrics, thresholdSet);
        applyStatusOverrides(results, jobNum);

        // Calculate stats
        const total = results.length;
        const passed = results.filter(r => ['PASS', 'TT', 'OT+', 'BL'].includes(r['Pass/Fail'])).length;
        const failed = results.filter(r => ['FL', 'FH', 'OT-', 'FAIL'].includes(r['Pass/Fail'])).length;
        const counted = passed + failed;

        // Per-test stats
        const maxTests = Math.max(...results.map(r => r.testCount || 1), 1);
        const testStats = {};
        for (let t = 1; t <= maxTests; t++) {
            let tPass = 0, tFail = 0, tTotal = 0;
            results.forEach(r => {
                const st = r[`Status(T${t})`];
                if (st) {
                    tTotal++;
                    const codes = st.split(',');
                    if (codes.some(c => ['FL', 'FH', 'OT-', 'FAIL'].includes(c))) tFail++;
                    else tPass++;
                }
            });
            testStats[t] = { passed: tPass, failed: tFail, total: tTotal };
        }

        // Voltage stats
        const all120s = [];
        const allPctChg = [];
        results.forEach(r => {
            for (let t = 1; t <= (r.testCount || 1); t++) {
                const v = r[`120s(T${t})`];
                if (v !== null && v !== undefined && !isNaN(v)) all120s.push(v);
                const pct = r[`%Chg(T${t})`];
                if (pct) {
                    const num = parseFloat(pct);
                    if (!isNaN(num)) allPctChg.push(num);
                }
            }
        });

        // Filter outliers from %Chg using IQR method before averaging
        const filteredPctChg = filterOutliersIQR(allPctChg);

        multiJobResults.set(jobNum, {
            results,
            jobData,
            stats: {
                total,
                passed,
                failed,
                counted,
                passRate: counted > 0 ? (passed / counted * 100) : 0,
                failRate: counted > 0 ? (failed / counted * 100) : 0,
                testStats,
                maxTests,
                avg120s: all120s.length > 0 ? calculateMean(all120s) : null,
                avgPctChg: filteredPctChg.length > 0 ? calculateMean(filteredPctChg) : null
            }
        });
    }
}

// ============================================================
// CSV FILE HANDLING
// ============================================================

function handleCSVFile(file) {
    showLoading('Loading CSV...');
    const reader = new FileReader();
    reader.onload = e => {
        try {
            rawData = parseCSV(e.target.result);
            hideLoading();
            const uniqueJobs = [...new Set(rawData.map(r => r['Job #']))];
            showAlert(`✅ Loaded ${rawData.length} records from ${uniqueJobs.length} jobs`, 'success');
            document.getElementById('analyzeBtn').disabled = false;
            enableExportButtons(false);
        } catch (err) {
            hideLoading();
            showAlert(`❌ Error parsing CSV: ${err.message}`, 'danger');
        }
    };
    reader.readAsText(file);
}
