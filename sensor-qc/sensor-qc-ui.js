// ============================================================
// Sensor QC Analysis - UI Functions
// ============================================================

// ============================================================
// ALERTS, LOADING & UI UTILITIES
// ============================================================

function getJobData(data, jobNumber) {
    const jobStr = String(jobNumber).trim().toLowerCase();
    return data.filter(row => {
        const rowJob = String(row['Job #'] || '').trim().toLowerCase();
        return rowJob === jobStr || rowJob.startsWith(jobStr);
    });
}

// ============================================================
// UI FUNCTIONS
// ============================================================

function showAlert(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = message;
    container.appendChild(toast);

    // Auto-remove after 4 seconds
    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

function enableExportButtons(enabled) {
    document.getElementById('exportCsvBtn').disabled = !enabled;
    document.getElementById('exportPdfBtn').disabled = !enabled;
    document.getElementById('summaryReportBtn').disabled = !enabled;
}

function switchUploadType(type) {
    document.querySelectorAll('.upload-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.type === type);
    });
    document.querySelectorAll('.upload-content').forEach(content => {
        content.classList.toggle('active', content.id === type + 'Upload');
    });
}

function updateJobHistory(jobNumber) {
    if (!jobHistory.includes(jobNumber)) {
        jobHistory.unshift(jobNumber);
        jobHistory = jobHistory.slice(0, 5);
        localStorage.setItem('sensorJobHistory', JSON.stringify(jobHistory));
    }

    // Calculate and store job statistics
    if (analysisResults && analysisResults.length > 0) {
        const total = analysisResults.length;
        const passed = analysisResults.filter(r => ['PASS', 'TT', 'OT+', 'BL'].includes(r['Pass/Fail'])).length;
        const failed = analysisResults.filter(r => ['FL', 'FH', 'OT-', 'FAIL'].includes(r['Pass/Fail'])).length;
        const counted = passed + failed;
        const passedPct = counted > 0 ? (passed / counted * 100) : 0;
        const failedPct = counted > 0 ? (failed / counted * 100) : 0;

        // Remove existing entry for this job if present
        jobStatsHistory = jobStatsHistory.filter(j => j.jobNumber !== jobNumber);

        // Add new entry at the beginning
        jobStatsHistory.unshift({
            jobNumber: jobNumber,
            totalSensors: total,
            passedQty: passed,
            passedPct: passedPct,
            failedQty: failed,
            failedPct: failedPct,
            timestamp: Date.now()
        });

        // Keep only last 5 jobs
        jobStatsHistory = jobStatsHistory.slice(0, 5);
        localStorage.setItem('sensorJobStatsHistory', JSON.stringify(jobStatsHistory));
    }

    renderJobHistory();
}

function renderJobHistory() {
    const container = document.getElementById('jobHistory');
    if (jobHistory.length === 0) {
        container.innerHTML = '<div style="color: #888; font-size: 0.85rem;">No recent jobs</div>';
        return;
    }

    // Show only the 5 most recent jobs
    const recentJobs = jobHistory.slice(0, 5);
    container.innerHTML = recentJobs.map(job => `
        <div class="job-history-item" onclick="loadHistoryJob('${job}')">🔄 Job ${job}</div>
    `).join('');
}

function loadHistoryJob(jobNumber) {
    document.getElementById('jobNumber').value = jobNumber;
    runAnalysis();
}

function toggleSidebarCollapsible(element) {
    element.classList.toggle('open');
}

function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        const isActive = btn.dataset.tab === tabId;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.toggle('active', content.id === tabId);
    });
}

function renderMetrics(results, thresholdSet) {
    const total = results.length;
    const passed = results.filter(r => ['PASS', 'TT', 'OT+', 'BL'].includes(r['Pass/Fail'])).length;
    const failed = results.filter(r => ['FL', 'FH', 'OT-', 'FAIL'].includes(r['Pass/Fail'])).length;
    const counted = passed + failed;
    
    const passRate = counted > 0 ? (passed / counted * 100).toFixed(1) : '0.0';
    const failRate = counted > 0 ? (failed / counted * 100).toFixed(1) : '0.0';
    
    document.getElementById('metricsGrid').innerHTML = `
        <div class="metric">
            <div class="metric-label">Job Number</div>
            <div class="metric-value">${currentJob || '—'}</div>
        </div>
        <div class="metric">
            <div class="metric-label">Total Sensors</div>
            <div class="metric-value">${total}</div>
        </div>
        <div class="metric success">
            <div class="metric-label">Pass Rate</div>
            <div class="metric-value">${passRate}%</div>
            <div class="metric-delta">${passed} passed</div>
        </div>
        <div class="metric danger">
            <div class="metric-label">Fail Rate</div>
            <div class="metric-value">${failRate}%</div>
            <div class="metric-delta">${failed} failed</div>
        </div>
        <div class="metric">
            <div class="metric-label">Threshold</div>
            <div class="metric-value" style="font-size: 1rem;">${thresholdSet}</div>
        </div>
    `;
}

function renderStatusFilters(results) {
    const statuses = [...new Set(results.map(r => r['Pass/Fail']))].sort(
        (a, b) => (STATUS_PRIORITY[a] || 99) - (STATUS_PRIORITY[b] || 99)
    );
    
    const container = document.getElementById('statusFilters');
    container.innerHTML = statuses.map(status => {
        const count = results.filter(r => r['Pass/Fail'] === status).length;
        const isActive = activeFilters.has(status);
        return `
            <div class="filter-pill filter-${status} ${isActive ? 'active' : ''}" 
                 onclick="toggleFilter('${status}')" data-status="${status}">
                ${status} (${count})
            </div>
        `;
    }).join('');
}

function toggleFilter(status) {
    if (activeFilters.has(status)) {
        activeFilters.delete(status);
    } else {
        activeFilters.add(status);
    }
    
    document.querySelectorAll('.filter-pill').forEach(pill => {
        pill.classList.toggle('active', activeFilters.has(pill.dataset.status));
    });
    
    renderTable();
}

function renderTable() {
    if (!analysisResults) return;

    // Delegate to multi-job table rendering if in multi-job mode
    if (multiJobMode && multiJobResults.size > 0) {
        renderMultiJobTable(currentTier);
        return;
    }

    const searchText = document.getElementById('serialSearch').value.toLowerCase();
    const searchTerms = searchText.split(',').map(t => t.trim()).filter(t => t);
    
    let filtered = analysisResults.filter(r => activeFilters.has(r['Pass/Fail']));
    
    if (searchTerms.length > 0) {
        filtered = filtered.filter(r => {
            const serial = r['Serial Number'].toLowerCase();
            return searchTerms.some(term => serial.includes(term));
        });
    }
    
    document.getElementById('filterInfo').textContent = 
        `Showing ${filtered.length} of ${analysisResults.length} sensors`;
    
    const headerRow = document.getElementById('tableHeader');
    const columns = ['Serial Number', 'Channel', 'Pass/Fail', '120s(MaxΔ)'];

    const maxTests = Math.max(...analysisResults.map(r => r.testCount || 1));
    for (let i = 1; i <= maxTests; i++) {
        columns.push(`0s(T${i})`, `120s(T${i})`, `%Chg(T${i})`, `Status(T${i})`);
    }
    
    headerRow.innerHTML = columns.map(col => `<th>${col}</th>`).join('');
    
    const tbody = document.getElementById('tableBody');
    tbody.innerHTML = filtered.map(row => {
        const status = row['Pass/Fail'];
        let rowClass = '';
        if (['FL', 'FH', 'OT-', 'FAIL'].includes(status)) rowClass = 'row-fail';
        else if (status === 'PASS') rowClass = 'row-pass';
        else if (['TT', 'OT+', 'BL'].includes(status)) rowClass = 'row-warning';

        // Find the index of this row in the original analysisResults
        const originalIndex = analysisResults.findIndex(r => r['Serial Number'] === row['Serial Number']);

        // Create editable status dropdown with only existing status codes
        const statusOptions = Object.keys(STATUS_PRIORITY).map(s =>
            `<option value="${s}" ${s === status ? 'selected' : ''}>${s}</option>`
        ).join('');
        const statusDropdown = `<select class="status-select status-${status}" onchange="updateSensorStatus(${originalIndex}, this.value)" title="Click to change status">${statusOptions}</select>`;

        const cells = [
            row['Serial Number'],
            row['Channel'],
            statusDropdown,
            row['120s(MaxΔ)'].toFixed(4)
        ];
        
        for (let i = 1; i <= maxTests; i++) {
            const v0 = row[`0s(T${i})`];
            const v120 = row[`120s(T${i})`];
            const pctChg = row[`%Chg(T${i})`];
            const tStatus = row[`Status(T${i})`];

            cells.push(
                v0 !== undefined && v0 !== null ? v0.toFixed(2) : '—',
                v120 !== undefined && v120 !== null ? v120.toFixed(2) : '—',
                pctChg || '—',
                tStatus ? `<span class="status-pill status-${tStatus.split(',')[0]}">${tStatus}</span>` : '—'
            );
        }
        
        return `<tr class="${rowClass}">${cells.map(c => `<td>${c}</td>`).join('')}</tr>`;
    }).join('');
}

function updateSensorStatus(index, newStatus) {
    if (index < 0 || index >= analysisResults.length) return;

    const serialNumber = analysisResults[index]['Serial Number'];

    // Update the status in analysisResults
    analysisResults[index]['Pass/Fail'] = newStatus;

    // Save override to localStorage
    saveStatusOverride(currentJob, serialNumber, newStatus);

    // Re-render the table to update row styling and dropdown appearance
    renderTable();

    // Update metrics to reflect changes
    const thresholdSet = document.getElementById('thresholdSet').value;
    renderMetrics(analysisResults, thresholdSet);

    // Update status filters to reflect any count changes
    renderStatusFilters(analysisResults);

    // Update charts to reflect the status change
    if (currentJobData) {
        renderCharts(analysisResults, currentJobData, thresholdSet);
    }

    // Update sidebar job history stats
    updateJobHistory(currentJob);
}

function saveStatusOverride(jobNumber, serialNumber, status) {
    if (!jobNumber) return;
    const key = `statusOverrides_${jobNumber}`;
    const overrides = JSON.parse(localStorage.getItem(key) || '{}');
    overrides[serialNumber] = status;
    localStorage.setItem(key, JSON.stringify(overrides));
}

function loadStatusOverrides(jobNumber) {
    if (!jobNumber) return {};
    const key = `statusOverrides_${jobNumber}`;
    return JSON.parse(localStorage.getItem(key) || '{}');
}

function applyStatusOverrides(results, jobNumber) {
    const overrides = loadStatusOverrides(jobNumber);
    results.forEach(row => {
        const serial = row['Serial Number'];
        if (overrides[serial]) {
            row['Pass/Fail'] = overrides[serial];
        }
    });
    return results;
}

function toggleCollapsible(contentId, toggleId) {
    const content = document.getElementById(contentId);
    const toggle = document.getElementById(toggleId);
    const isCollapsed = content.classList.toggle('collapsed');
    toggle.textContent = isCollapsed ? '▶' : '▼';
}

function renderAnomalies(anomalies) {
    const section = document.getElementById('anomalySection');
    const list = document.getElementById('anomalyList');
    const preview = document.getElementById('anomalyPreview');

    if (anomalies.length === 0) {
        section.classList.add('hidden');
        return;
    }

    section.classList.remove('hidden');
    preview.textContent = `(${anomalies.length} detected)`;
    const uniqueSerials = [...new Set(anomalies.map(a => a.serial))];
    list.innerHTML = anomalies.map(a => `
        <div class="anomaly-item anomaly-${a.severity.toLowerCase()}">
            <strong>${a.serial}</strong> (Channel: ${a.channel}) — ${a.type}: ${a.message}
        </div>
    `).join('') + `<a class="anomaly-view-link" onclick="viewAnomaliesInTable('${uniqueSerials.join(',')}')">View anomalies in data table</a>`;
}

function viewAnomaliesInTable(serialsCsv) {
    const searchInput = document.getElementById('serialSearch');
    searchInput.value = serialsCsv;
    switchTab('dataTable');
    renderTable();
    searchInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
}


// ============================================================
// MULTI-JOB UI: CHIPS, METRICS, TABLE, ANOMALIES
// ============================================================

function renderJobChips(jobNumbers) {
    const container = document.getElementById('jobChips');
    const badge = document.getElementById('tierBadge');

    if (jobNumbers.length <= 1) {
        container.innerHTML = '';
        badge.innerHTML = '';
        return;
    }

    // Show chips (truncate display if too many)
    const maxShow = 12;
    const shown = jobNumbers.slice(0, maxShow);
    const remaining = jobNumbers.length - maxShow;

    container.innerHTML = shown.map(j =>
        `<span class="job-chip">${j}<span class="chip-remove" onclick="removeJobChip('${j}')">&times;</span></span>`
    ).join('') + (remaining > 0 ? `<span class="job-chip">+${remaining} more</span>` : '');

    const baseTier = getDisplayTier(jobNumbers.length);
    const effectiveTier = getEffectiveTier(baseTier, jobNumbers.length);
    const tierLabels = {
        few: 'Comparison Mode',
        many: 'Aggregated Mode',
        bulk: 'Trend Mode'
    };
    const tierClass = `tier-${effectiveTier}`;
    const modeRows = [
        { key: 'few', label: 'Comparison Mode', range: '2–5 jobs' },
        { key: 'many', label: 'Aggregated Mode', range: '6–15 jobs' },
        { key: 'bulk', label: 'Trend Mode', range: '16+ jobs' }
    ].map(m => `<div class="mode-tip-row${m.key === effectiveTier ? ' mode-tip-active' : ''}"><span class="mode-tip-label">${m.label}</span><span class="mode-tip-range">${m.range}</span></div>`).join('');
    badge.innerHTML = `<span class="tier-badge ${tierClass}" style="cursor: help;">${jobNumbers.length} jobs — ${tierLabels[effectiveTier] || ''}<div class="mode-tooltip">${modeRows}</div></span>`;

    // Show/hide mode override dropdown for 6+ jobs
    const overrideContainer = document.getElementById('modeOverrideContainer');
    if (overrideContainer) {
        if (jobNumbers.length >= 6) {
            overrideContainer.classList.remove('hidden');
        } else {
            overrideContainer.classList.add('hidden');
        }
    }
}

function removeJobChip(jobNumber) {
    const input = document.getElementById('jobNumber');
    const jobs = parseJobInput(input.value).filter(j => j !== jobNumber);
    input.value = jobs.join(', ');
    renderJobChips(jobs);
}


function renderMultiJobMetrics(tier) {
    const grid = document.getElementById('metricsGrid');
    const jobs = [...multiJobResults.entries()];
    const thresholdSet = document.getElementById('thresholdSet').value;

    if (tier === 'few') {
        // Per-job metrics table + overall
        const allPassed = jobs.reduce((s, [, d]) => s + d.stats.passed, 0);
        const allFailed = jobs.reduce((s, [, d]) => s + d.stats.failed, 0);
        const allCounted = allPassed + allFailed;
        const allTotal = jobs.reduce((s, [, d]) => s + d.stats.total, 0);
        const overallPassRate = allCounted > 0 ? (allPassed / allCounted * 100) : 0;

        // Find best/worst
        const passRates = jobs.map(([j, d]) => ({ job: j, rate: d.stats.passRate }));
        const bestJob = passRates.reduce((a, b) => a.rate >= b.rate ? a : b).job;
        const worstJob = passRates.reduce((a, b) => a.rate <= b.rate ? a : b).job;

        let html = `<table class="multi-metrics-table">
            <thead><tr><th>Job #</th><th>Sensors</th><th>Pass Rate</th><th>Fail Rate</th><th>Passed</th><th>Failed</th></tr></thead><tbody>`;
        for (const [jobNum, data] of jobs) {
            const isBest = jobNum === bestJob && jobs.length > 1;
            const isWorst = jobNum === worstJob && jobs.length > 1 && bestJob !== worstJob;
            html += `<tr class="${isBest ? 'highlight-best' : isWorst ? 'highlight-worst' : ''}">
                <td><strong>${jobNum}</strong></td>
                <td>${data.stats.total}</td>
                <td style="color: var(--success); font-weight:700;">${data.stats.passRate.toFixed(1)}%</td>
                <td style="color: var(--danger); font-weight:700;">${data.stats.failRate.toFixed(1)}%</td>
                <td>${data.stats.passed}</td>
                <td>${data.stats.failed}</td>
            </tr>`;
        }
        html += `<tr class="overall-row" style="border-top:3px solid var(--primary); font-weight:700; background: rgba(102,126,234,0.05);">
            <td>Overall</td><td>${allTotal}</td>
            <td style="color: var(--success);">${overallPassRate.toFixed(1)}%</td>
            <td style="color: var(--danger);">${allCounted > 0 ? ((allFailed / allCounted) * 100).toFixed(1) : '0.0'}%</td>
            <td>${allPassed}</td><td>${allFailed}</td>
        </tr></tbody></table>`;
        grid.innerHTML = html;

    } else if (tier === 'many' || tier === 'bulk') {
        // Shared computations
        const passRates = jobs.map(([, d]) => d.stats.passRate);
        const totalSensors = jobs.reduce((s, [, d]) => s + d.stats.total, 0);
        const mean = calculateMean(passRates);
        const stdDev = calculateStdDev(passRates);
        const median = calculatePercentile(passRates, 50);
        const min = Math.min(...passRates);
        const max = Math.max(...passRates);

        if (tier === 'many') {
            // AGGREGATED MODE: distribution-focused metrics
            const skew = calculateSkewness(passRates);
            const { q1, q3, iqr } = calculateIQR(passRates);
            const skewLabel = skew < -0.5 ? 'Left-skewed' : skew > 0.5 ? 'Right-skewed' : 'Symmetric';
            const skewIcon = skew < -0.5 ? '◀' : skew > 0.5 ? '▶' : '◆';

            grid.innerHTML = `
                <div class="metric info"><div class="metric-label">Total Jobs</div><div class="metric-value">${jobs.length}</div></div>
                <div class="metric"><div class="metric-label">Total Sensors</div><div class="metric-value">${totalSensors}</div></div>
                <div class="metric success"><div class="metric-label">Avg Pass Rate</div><div class="metric-value">${mean.toFixed(1)}%</div><div class="metric-delta">Median: ${median.toFixed(1)}%</div></div>
                <div class="metric danger"><div class="metric-label">Pass Rate Spread</div><div class="metric-value">${min.toFixed(1)}–${max.toFixed(1)}%</div><div class="metric-delta">Std Dev: ${stdDev.toFixed(1)}%</div></div>
                <div class="metric"><div class="metric-label">Distribution</div><div class="metric-value" style="font-size: 0.95rem;">${skewIcon} ${skewLabel}</div><div class="metric-delta">IQR: ${iqr.toFixed(1)}% (${q1.toFixed(0)}–${q3.toFixed(0)}%)</div></div>
            `;
        } else {
            // TREND MODE: process monitoring metrics
            const slope = calculateLinearSlope(passRates);
            const trendDir = slope > 1 ? 'Improving' : slope < -1 ? 'Declining' : 'Stable';
            const trendColor = slope > 1 ? 'var(--success)' : slope < -1 ? 'var(--danger)' : 'var(--info)';
            const trendArrow = slope > 1 ? '↑' : slope < -1 ? '↓' : '→';
            const cv = calculateCv(passRates);
            const stabilityLabel = cv < 5 ? 'Stable' : cv < 10 ? 'Moderate' : 'Unstable';
            const stabilityColor = cv < 5 ? 'var(--success)' : cv < 10 ? 'var(--warning)' : 'var(--danger)';

            grid.innerHTML = `
                <div class="metric info"><div class="metric-label">Total Jobs</div><div class="metric-value">${jobs.length}</div></div>
                <div class="metric"><div class="metric-label">Total Sensors</div><div class="metric-value">${totalSensors}</div></div>
                <div class="metric success"><div class="metric-label">Mean Pass Rate</div><div class="metric-value">${mean.toFixed(1)}%</div><div class="metric-delta">Median: ${median.toFixed(1)}%</div></div>
                <div class="metric danger"><div class="metric-label">Pass Rate Range</div><div class="metric-value">${min.toFixed(1)}–${max.toFixed(1)}%</div><div class="metric-delta">Std Dev: ${stdDev.toFixed(1)}%</div></div>
                <div class="metric"><div class="metric-label">Trend</div><div class="metric-value" style="font-size: 1rem; color: ${trendColor};">${trendArrow} ${trendDir}</div><div class="metric-delta">Slope: ${slope.toFixed(2)}/job</div></div>
                <div class="metric"><div class="metric-label">Process Stability</div><div class="metric-value" style="font-size: 0.95rem; color: ${stabilityColor};">${stabilityLabel}</div><div class="metric-delta">Cv: ${cv.toFixed(1)}%</div></div>
            `;
        }
    }
}

function renderMultiJobTable(tier) {
    const headerRow = document.getElementById('tableHeader');
    const tbody = document.getElementById('tableBody');
    const filterInfo = document.getElementById('filterInfo');
    const jobs = [...multiJobResults.entries()];

    if (tier === 'few') {
        // Full sensor table with Job # column prepended, grouped by job
        const searchText = document.getElementById('serialSearch').value.toLowerCase();
        const searchTerms = searchText.split(',').map(t => t.trim()).filter(t => t);

        // Determine max test count across all jobs
        let globalMaxTests = 1;
        for (const [, data] of jobs) {
            const mt = Math.max(...data.results.map(r => r.testCount || 1));
            globalMaxTests = Math.max(globalMaxTests, mt);
        }

        const columns = ['Job #', 'Serial Number', 'Channel', 'Pass/Fail', '120s(MaxΔ)'];
        for (let i = 1; i <= globalMaxTests; i++) {
            columns.push(`0s(T${i})`, `120s(T${i})`, `%Chg(T${i})`, `Status(T${i})`);
        }
        headerRow.innerHTML = columns.map(col => `<th>${col}</th>`).join('');

        let totalShown = 0;
        let totalAll = 0;
        let rowsHTML = '';

        for (const [jobNum, data] of jobs) {
            let filtered = data.results.filter(r => activeFilters.has(r['Pass/Fail']));
            totalAll += data.results.length;

            if (searchTerms.length > 0) {
                filtered = filtered.filter(r => {
                    const serial = r['Serial Number'].toLowerCase();
                    return searchTerms.some(term => serial.includes(term));
                });
            }
            totalShown += filtered.length;

            // Job group header
            rowsHTML += `<tr class="job-group-header"><td colspan="${columns.length}">Job ${jobNum} — ${data.results.length} sensors (${data.stats.passRate.toFixed(1)}% pass)</td></tr>`;

            rowsHTML += filtered.map(row => {
                const status = row['Pass/Fail'];
                let rowClass = '';
                if (['FL', 'FH', 'OT-', 'FAIL'].includes(status)) rowClass = 'row-fail';
                else if (status === 'PASS') rowClass = 'row-pass';
                else if (['TT', 'OT+', 'BL'].includes(status)) rowClass = 'row-warning';

                const statusPill = `<span class="status-pill status-${status}">${status}</span>`;
                const cells = [jobNum, row['Serial Number'], row['Channel'], statusPill, row['120s(MaxΔ)'].toFixed(4)];
                for (let i = 1; i <= globalMaxTests; i++) {
                    const v0 = row[`0s(T${i})`];
                    const v120 = row[`120s(T${i})`];
                    const pctChg = row[`%Chg(T${i})`];
                    const tStatus = row[`Status(T${i})`];
                    cells.push(
                        v0 !== undefined && v0 !== null ? v0.toFixed(2) : '—',
                        v120 !== undefined && v120 !== null ? v120.toFixed(2) : '—',
                        pctChg || '—',
                        tStatus ? `<span class="status-pill status-${tStatus.split(',')[0]}">${tStatus}</span>` : '—'
                    );
                }
                return `<tr class="${rowClass}">${cells.map(c => `<td>${c}</td>`).join('')}</tr>`;
            }).join('');
        }

        tbody.innerHTML = rowsHTML;
        filterInfo.textContent = `Showing ${totalShown} of ${totalAll} sensors across ${jobs.length} jobs`;

    } else if (tier === 'many') {
        // AGGREGATED MODE: Ranked summary with quartile indicators
        headerRow.innerHTML = '<th>Rank</th><th>Job #</th><th>Sensors</th><th>T1 Pass %</th><th>T2 Pass %</th><th>T3 Pass %</th><th>Overall Pass %</th><th>Quartile</th><th>Avg 120s V</th>';

        const allStats = jobs.map(([jobNum, data]) => ({
            jobNum,
            stats: data.stats
        }));

        // Sort by pass rate descending for ranking
        const sorted = [...allStats].sort((a, b) => b.stats.passRate - a.stats.passRate);
        const rates = sorted.map(s => s.stats.passRate);
        const q1 = calculatePercentile(rates, 75); // top 25%
        const median = calculatePercentile(rates, 50);
        const q3 = calculatePercentile(rates, 25); // bottom 25%

        tbody.innerHTML = sorted.map(({ jobNum, stats }, idx) => {
            const quartile = getQuartile(stats.passRate, q3, median, q1);
            const qBadge = quartile === 1 ? '<span class="quartile-badge q1">Q1</span>'
                : quartile === 4 ? '<span class="quartile-badge q4">Q4</span>'
                : `<span class="quartile-badge q${quartile}">Q${quartile}</span>`;
            const rowClass = quartile === 1 ? 'row-q1' : quartile === 4 ? 'row-q4' : '';
            const t1 = stats.testStats[1];
            const t2 = stats.testStats[2];
            const t3 = stats.testStats[3];
            return `<tr class="${rowClass}">
                <td style="font-weight:700; color: var(--primary);">#${idx + 1}</td>
                <td><strong>${jobNum}</strong></td>
                <td>${stats.total}</td>
                <td>${t1 ? (t1.total > 0 ? (t1.passed / t1.total * 100).toFixed(1) + '%' : '—') : '—'}</td>
                <td>${t2 ? (t2.total > 0 ? (t2.passed / t2.total * 100).toFixed(1) + '%' : '—') : '—'}</td>
                <td>${t3 ? (t3.total > 0 ? (t3.passed / t3.total * 100).toFixed(1) + '%' : '—') : '—'}</td>
                <td style="font-weight:700;">${stats.passRate.toFixed(1)}%</td>
                <td>${qBadge}</td>
                <td>${stats.avg120s !== null ? stats.avg120s.toFixed(3) + 'V' : '—'}</td>
            </tr>`;
        }).join('');

        // Footer
        const totalSensors = allStats.reduce((s, a) => s + a.stats.total, 0);
        const totalPassed = allStats.reduce((s, a) => s + a.stats.passed, 0);
        const totalCounted = allStats.reduce((s, a) => s + a.stats.counted, 0);
        const overallRate = totalCounted > 0 ? (totalPassed / totalCounted * 100) : 0;
        const stdDev = calculateStdDev(rates);
        tbody.innerHTML += `<tr class="overall-row"><td></td><td><strong>Overall</strong></td><td>${totalSensors}</td><td colspan="3"></td><td style="font-weight:700;">${overallRate.toFixed(1)}%</td><td>σ: ${stdDev.toFixed(1)}%</td><td></td></tr>`;

        filterInfo.textContent = `${jobs.length} jobs ranked by pass rate, ${totalSensors} total sensors`;

    } else {
        // TREND MODE: Sequential table with delta tracking
        headerRow.innerHTML = '<th>Job #</th><th>Sensors</th><th>T1 Pass %</th><th>T2 Pass %</th><th>T3 Pass %</th><th>Overall Pass %</th><th>Δ</th><th>Run</th><th>Flag</th>';

        const allStats = jobs.map(([jobNum, data]) => ({
            jobNum,
            stats: data.stats
        }));

        // Keep sequential order (by job number)
        allStats.sort((a, b) => parseFloat(a.jobNum) - parseFloat(b.jobNum));
        const rates = allStats.map(s => s.stats.passRate);
        const runs = calculateRunLengths(rates);
        const mean = calculateMean(rates);
        const stdDev = calculateStdDev(rates);
        const slope = calculateLinearSlope(rates);
        let flaggedCount = 0;

        tbody.innerHTML = allStats.map(({ jobNum, stats }, idx) => {
            const t1 = stats.testStats[1];
            const t2 = stats.testStats[2];
            const t3 = stats.testStats[3];

            // Delta vs previous job
            let deltaHTML = '—';
            if (idx > 0) {
                const delta = stats.passRate - allStats[idx - 1].stats.passRate;
                const deltaColor = delta > 0 ? 'var(--success)' : delta < 0 ? 'var(--danger)' : '#888';
                deltaHTML = `<span style="color: ${deltaColor}; font-weight:600;">${delta > 0 ? '+' : ''}${delta.toFixed(1)}%</span>`;
            }

            // Run indicator
            const run = runs[idx];
            let runHTML = '—';
            if (run.len >= 2) {
                const arrow = run.dir === 'up' ? '↑' : '↓';
                const color = run.dir === 'up' ? 'var(--success)' : 'var(--danger)';
                runHTML = `<span style="color: ${color}; font-weight:700;">${arrow}${run.len}</span>`;
            }

            // Flags
            const flags = [];
            if (Math.abs(stats.passRate - mean) > 2 * stdDev) flags.push('outlier');
            if (run.dir === 'down' && run.len >= 3) flags.push('decline');
            let flagHTML = '';
            if (flags.length > 0) {
                flaggedCount++;
                const title = flags.join(', ');
                flagHTML = `<span class="trend-flag" title="${title}">⚠</span>`;
            }

            return `<tr>
                <td><strong>${jobNum}</strong></td>
                <td>${stats.total}</td>
                <td>${t1 ? (t1.total > 0 ? (t1.passed / t1.total * 100).toFixed(1) + '%' : '—') : '—'}</td>
                <td>${t2 ? (t2.total > 0 ? (t2.passed / t2.total * 100).toFixed(1) + '%' : '—') : '—'}</td>
                <td>${t3 ? (t3.total > 0 ? (t3.passed / t3.total * 100).toFixed(1) + '%' : '—') : '—'}</td>
                <td style="font-weight:700;">${stats.passRate.toFixed(1)}%</td>
                <td>${deltaHTML}</td>
                <td>${runHTML}</td>
                <td>${flagHTML}</td>
            </tr>`;
        }).join('');

        // Footer
        const totalSensors = allStats.reduce((s, a) => s + a.stats.total, 0);
        const totalPassed = allStats.reduce((s, a) => s + a.stats.passed, 0);
        const totalCounted = allStats.reduce((s, a) => s + a.stats.counted, 0);
        const overallRate = totalCounted > 0 ? (totalPassed / totalCounted * 100) : 0;
        tbody.innerHTML += `<tr class="overall-row"><td><strong>Overall</strong></td><td>${totalSensors}</td><td colspan="3"></td><td style="font-weight:700;">${overallRate.toFixed(1)}%</td><td colspan="2" style="font-size:0.8rem;">Slope: ${slope.toFixed(2)}/job</td><td style="font-size:0.8rem;">${flaggedCount} flagged</td></tr>`;

        filterInfo.textContent = `${jobs.length} jobs in sequential order, ${totalSensors} total sensors`;
    }
}


function renderMultiJobAnomalies(tier) {
    const section = document.getElementById('anomalySection');
    const list = document.getElementById('anomalyList');
    const preview = document.getElementById('anomalyPreview');
    const jobs = [...multiJobResults.entries()];

    if (tier === 'few') {
        const allAnomalies = [];
        const thresholdSet = document.getElementById('thresholdSet').value;
        const thresholds = THRESHOLDS[thresholdSet];
        jobs.forEach(([jobNum, data]) => {
            const anomalies = detectAnomalies(data.results, thresholds);
            anomalies.forEach(a => { a.jobNum = jobNum; });
            allAnomalies.push(...anomalies);
        });

        if (allAnomalies.length === 0) { section.classList.add('hidden'); return; }
        section.classList.remove('hidden');
        preview.textContent = `(${allAnomalies.length} across ${jobs.length} jobs)`;
        const uniqueSerials = [...new Set(allAnomalies.map(a => a.serial))];
        list.innerHTML = allAnomalies.map(a => `
            <div class="anomaly-item anomaly-${a.severity.toLowerCase()}">
                <strong>Job ${a.jobNum} — ${a.serial}</strong> (Channel: ${a.channel}) — ${a.type}: ${a.message}
            </div>
        `).join('') + `<a class="anomaly-view-link" onclick="viewAnomaliesInTable('${uniqueSerials.join(',')}')">View anomalies in data table</a>`;
    } else if (tier === 'many') {
        // AGGREGATED MODE: Group-level anomalies
        const issues = [];
        const highFailJobs = jobs.filter(([, d]) => d.stats.failRate > 20);
        if (highFailJobs.length > 0) {
            issues.push(`<div class="anomaly-item anomaly-high"><strong>${highFailJobs.length} job(s)</strong> have >20% fail rate: ${highFailJobs.map(([j]) => j).join(', ')}</div>`);
        }

        const passRates = jobs.map(([, d]) => d.stats.passRate);
        const mean = calculateMean(passRates);
        const stdDev = calculateStdDev(passRates);
        const outliers = jobs.filter(([, d]) => Math.abs(d.stats.passRate - mean) > stdDev * 2);
        if (outliers.length > 0) {
            issues.push(`<div class="anomaly-item anomaly-medium"><strong>${outliers.length} job(s)</strong> are statistical outliers (>2σ): ${outliers.map(([j, d]) => `${j} (${d.stats.passRate.toFixed(1)}%)`).join(', ')}</div>`);
        }

        // Bimodal distribution detection
        const { q1, q3, iqr } = calculateIQR(passRates);
        if (iqr > 15) {
            const sorted = [...passRates].sort((a, b) => a - b);
            const mid = calculateMean(passRates);
            const lower = sorted.filter(r => r < mid - 5);
            const upper = sorted.filter(r => r > mid + 5);
            if (lower.length >= 2 && upper.length >= 2) {
                issues.push(`<div class="anomaly-item anomaly-medium"><strong>Bimodal distribution detected</strong> — jobs cluster into two groups (IQR: ${iqr.toFixed(1)}%). Possible batch or process split issue.</div>`);
            }
        }

        // Weak test detection
        const testAvgs = {};
        for (let t = 1; t <= 3; t++) {
            const testRates = jobs.map(([, d]) => {
                const ts = d.stats.testStats[t];
                return ts && ts.total > 0 ? (ts.passed / ts.total * 100) : null;
            }).filter(v => v !== null);
            if (testRates.length > 0) testAvgs[t] = calculateMean(testRates);
        }
        const testKeys = Object.keys(testAvgs);
        if (testKeys.length >= 2) {
            const maxTestAvg = Math.max(...Object.values(testAvgs));
            for (const [t, avg] of Object.entries(testAvgs)) {
                if (maxTestAvg - avg > 15) {
                    issues.push(`<div class="anomaly-item anomaly-medium"><strong>T${t} underperforming</strong> — avg ${avg.toFixed(1)}% vs best test at ${maxTestAvg.toFixed(1)}% (${(maxTestAvg - avg).toFixed(1)}% gap)</div>`);
                }
            }
        }

        if (issues.length === 0) { section.classList.add('hidden'); return; }
        section.classList.remove('hidden');
        preview.textContent = `(${issues.length} group issues)`;
        list.innerHTML = issues.join('');

    } else {
        // TREND MODE: Process-level anomalies
        const issues = [];
        const sortedJobs = [...jobs].sort((a, b) => parseFloat(a[0]) - parseFloat(b[0]));
        const passRates = sortedJobs.map(([, d]) => d.stats.passRate);
        const jobNums = sortedJobs.map(([j]) => j);
        const mean = calculateMean(passRates);
        const stdDev = calculateStdDev(passRates);

        // High fail rate jobs
        const highFailJobs = sortedJobs.filter(([, d]) => d.stats.failRate > 20);
        if (highFailJobs.length > 0) {
            issues.push(`<div class="anomaly-item anomaly-high"><strong>${highFailJobs.length} job(s)</strong> have >20% fail rate: ${highFailJobs.map(([j]) => j).join(', ')}</div>`);
        }

        // Statistical outliers
        const outliers = sortedJobs.filter(([, d]) => Math.abs(d.stats.passRate - mean) > stdDev * 2);
        if (outliers.length > 0) {
            issues.push(`<div class="anomaly-item anomaly-medium"><strong>${outliers.length} outlier(s)</strong> (>2σ): ${outliers.map(([j, d]) => `${j} (${d.stats.passRate.toFixed(1)}%)`).join(', ')}</div>`);
        }

        // Consecutive decline detection
        const runs = calculateRunLengths(passRates);
        const maxDecline = runs.reduce((max, r) => r.dir === 'down' && r.len > max.len ? r : max, { len: 0 });
        if (maxDecline.len >= 3) {
            const endIdx = runs.lastIndexOf(maxDecline);
            const startIdx = endIdx - maxDecline.len + 1;
            issues.push(`<div class="anomaly-item anomaly-high"><strong>${maxDecline.len} consecutive declines</strong> from Job ${jobNums[startIdx]} to ${jobNums[endIdx]} (${passRates[startIdx].toFixed(1)}% → ${passRates[endIdx].toFixed(1)}%)</div>`);
        }

        // Recent degradation (last 3 jobs vs overall)
        if (passRates.length >= 6) {
            const recentMean = calculateMean(passRates.slice(-3));
            if (mean - recentMean > 5) {
                issues.push(`<div class="anomaly-item anomaly-medium"><strong>Recent degradation</strong> — last 3 jobs avg ${recentMean.toFixed(1)}% vs overall ${mean.toFixed(1)}% (${(mean - recentMean).toFixed(1)}% below)</div>`);
            }
        }

        // Shift detection (moving average crosses mean downward)
        if (passRates.length >= 8) {
            const windowSize = Math.min(5, Math.floor(passRates.length / 3));
            for (let i = windowSize; i < passRates.length; i++) {
                const prevMA = calculateMean(passRates.slice(i - windowSize, i));
                const currMA = calculateMean(passRates.slice(i - windowSize + 1, i + 1));
                if (prevMA >= mean && currMA < mean) {
                    issues.push(`<div class="anomaly-item anomaly-medium"><strong>Process shift detected</strong> at Job ${jobNums[i]} — moving average crossed below overall mean (${mean.toFixed(1)}%)</div>`);
                    break; // Only report first shift
                }
            }
        }

        if (issues.length === 0) { section.classList.add('hidden'); return; }
        section.classList.remove('hidden');
        preview.textContent = `(${issues.length} process issues)`;
        list.innerHTML = issues.join('');
    }
}

// ============================================================
// MAIN ANALYSIS FUNCTION
// ============================================================

function resetMultiJobView() {
    // Reset heatmap if present
    const heatmapDiv = document.getElementById('multiJobHeatmap');
    if (heatmapDiv) heatmapDiv.remove();
    const distCanvas = document.getElementById('distributionChart');
    if (distCanvas) {
        distCanvas.style.display = '';
        distCanvas.parentElement.style.height = '350px';
        distCanvas.parentElement.style.overflow = 'hidden';
    }
    // Reset chart titles
    const distCard = distCanvas?.closest('.card');
    if (distCard) {
        const title = distCard.querySelector('.card-title');
        if (title) title.textContent = '📊 120s Distribution';
    }
    // Reset trend chart title
    const trendCard = document.getElementById('trendChart')?.closest('.card');
    if (trendCard) {
        const title = trendCard.querySelector('.card-title');
        if (title) title.textContent = '📈 Sensor Readings by Test';
    }
    // Reset pie chart title
    const pieCard = document.getElementById('pieChart')?.closest('.card');
    if (pieCard) {
        const title = pieCard.querySelector('.card-title');
        if (title) title.textContent = '🥧 Status Distribution';
    }
}

