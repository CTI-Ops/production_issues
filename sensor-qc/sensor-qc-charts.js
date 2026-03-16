// ============================================================
// Sensor QC Analysis - Chart Rendering
// ============================================================

// ============================================================
// SINGLE-JOB CHARTS
// ============================================================

function renderCharts(results, jobData, thresholdSet) {
    const thresholds = THRESHOLDS[thresholdSet];
    
    // Destroy existing charts
    Object.values(charts).forEach(chart => chart?.destroy());
    charts = {};
    
    // Determine max test count
    const maxTests = Math.max(...results.map(r => r.testCount || 1));
    
    // ========================================
    // 1. Trend Chart BY TEST (separate lines for T1, T2, T3)
    // ========================================
    const trendCtx = document.getElementById('trendChart').getContext('2d');
    
    // Group job data by test number
    const testGroups = {};
    const grouped = {};
    jobData.forEach(row => {
        const serial = row['Serial Number'];
        if (!grouped[serial]) grouped[serial] = [];
        grouped[serial].push(row);
    });
    
    // Assign test numbers and group readings
    for (const [serial, tests] of Object.entries(grouped)) {
        tests.forEach((test, idx) => {
            const testNum = idx + 1;
            if (!testGroups[testNum]) testGroups[testNum] = [];
            testGroups[testNum].push(test);
        });
    }
    
    // Create datasets for each test
    const trendDatasets = [];
    for (let t = 1; t <= maxTests; t++) {
        const testData = testGroups[t] || [];
        if (testData.length === 0) continue;
        
        const timeSeriesData = TIME_POINTS.map(tp => {
            const readings = testData.map(r => r[tp]).filter(v => v !== null && !isNaN(v));
            const mean = readings.length > 0 ? calculateMean(readings) : null;
            return mean !== null ? { x: Number(tp), y: mean } : null;
        }).filter(p => p !== null);

        trendDatasets.push({
            label: `Test ${t} (n=${testData.length})`,
            data: timeSeriesData,
            borderColor: TEST_COLORS[(t - 1) % TEST_COLORS.length],
            backgroundColor: TEST_COLORS[(t - 1) % TEST_COLORS.length],
            borderWidth: 2,
            pointRadius: 4,
            tension: 0.1
        });
    }

    charts.trend = new Chart(trendCtx, {
        type: 'line',
        data: {
            datasets: trendDatasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: true, position: 'top' },
                title: { display: false }
            },
            scales: {
                y: { min: 0, max: 5, title: { display: true, text: 'Voltage (V)' } },
                x: {
                    type: 'linear',
                    min: 0,
                    max: 120,
                    ticks: {
                        stepSize: 5,
                        callback: function(value) {
                            if ([0, 5, 15, 30, 60, 90, 120].includes(value)) return value + 's';
                            return null;
                        }
                    },
                    title: { display: true, text: 'Time' }
                }
            }
        }
    });
    
    // ========================================
    // 2. Distribution Chart (Histogram by Test)
    // ========================================
    const distCtx = document.getElementById('distributionChart').getContext('2d');

    const bins = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];
    const binLabels = bins.slice(0, -1).map((b, i) => `${b}-${bins[i+1]}V`);

    // Create histograms for each test
    const histogramsByTest = {};
    for (let t = 1; t <= maxTests; t++) {
        histogramsByTest[t] = new Array(bins.length - 1).fill(0);
    }

    results.forEach(row => {
        for (let t = 1; t <= row.testCount; t++) {
            const v120 = row[`120s(T${t})`];
            if (v120 !== null && v120 !== undefined && !isNaN(v120)) {
                for (let i = 0; i < bins.length - 1; i++) {
                    if (v120 >= bins[i] && v120 < bins[i + 1]) {
                        histogramsByTest[t][i]++;
                        break;
                    }
                }
            }
        }
    });

    // Color function based on thresholds
    const getBarColor = (binIndex, alpha) => {
        const midpoint = (bins[binIndex] + bins[binIndex + 1]) / 2;
        if (midpoint < thresholds.min_120s) return `rgba(239, 68, 68, ${alpha})`;
        if (midpoint > thresholds.max_120s) return `rgba(239, 68, 68, ${alpha})`;
        return `rgba(16, 185, 129, ${alpha})`;
    };

    // Create datasets for each test with different shades
    const testColors = ['0.9', '0.6', '0.35'];
    const testDatasets = [];
    for (let t = 1; t <= maxTests; t++) {
        testDatasets.push({
            label: `Test ${t}`,
            data: histogramsByTest[t],
            backgroundColor: bins.slice(0, -1).map((_, i) => getBarColor(i, testColors[t-1] || '0.5')),
            borderWidth: 0
        });
    }

    charts.distribution = new Chart(distCtx, {
        type: 'bar',
        data: {
            labels: binLabels,
            datasets: testDatasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        boxWidth: 12,
                        padding: 8,
                        generateLabels: (chart) => chart.data.datasets.map((ds, i) => ({
                            text: ds.label,
                            fillStyle: `rgba(16, 185, 129, ${testColors[i] || '0.5'})`,
                            strokeStyle: 'transparent',
                            lineWidth: 0,
                            datasetIndex: i
                        }))
                    }
                }
            },
            scales: {
                y: { title: { display: true, text: 'Count' } },
                x: { title: { display: true, text: '120s Voltage' } }
            }
        }
    });
    
    // ========================================
    // 3. Status by Test Number (grouped bar chart)
    // ========================================
    const statusByTestCtx = document.getElementById('statusByTestChart').getContext('2d');
    
    // Count status per test
    const statusByTest = {};
    const allStatuses = ['PASS', 'FL', 'FH', 'OT-', 'TT', 'OT+', 'BL', 'FAIL'];
    
    for (let t = 1; t <= maxTests; t++) {
        statusByTest[t] = {};
        allStatuses.forEach(s => statusByTest[t][s] = 0);
    }
    
    results.forEach(row => {
        for (let t = 1; t <= row.testCount; t++) {
            const statusCol = `Status(T${t})`;
            const status = row[statusCol];
            if (status) {
                const primaryStatus = status.split(',')[0];
                if (statusByTest[t][primaryStatus] !== undefined) {
                    statusByTest[t][primaryStatus]++;
                }
            }
        }
    });
    
    // Create datasets for each status
    const statusDatasets = allStatuses.map(status => ({
        label: status,
        data: Array.from({length: maxTests}, (_, i) => statusByTest[i + 1][status] || 0),
        backgroundColor: STATUS_COLORS[status],
        borderWidth: 0
    })).filter(ds => ds.data.some(v => v > 0));
    
    charts.statusByTest = new Chart(statusByTestCtx, {
        type: 'bar',
        data: {
            labels: Array.from({length: maxTests}, (_, i) => `Test ${i + 1}`),
            datasets: statusDatasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: true, position: 'top' }
            },
            scales: {
                x: { stacked: true },
                y: { stacked: true, title: { display: true, text: 'Count' } }
            }
        }
    });
    
    // ========================================
    // 4. Pie Chart (Overall Status)
    // ========================================
    const pieCtx = document.getElementById('pieChart').getContext('2d');
    const statusCounts = {};
    results.forEach(r => {
        statusCounts[r['Pass/Fail']] = (statusCounts[r['Pass/Fail']] || 0) + 1;
    });
    
    const pieLabels = Object.keys(statusCounts).sort(
        (a, b) => (STATUS_PRIORITY[a] || 99) - (STATUS_PRIORITY[b] || 99)
    );
    
    charts.pie = new Chart(pieCtx, {
        type: 'doughnut',
        data: {
            labels: pieLabels,
            datasets: [{
                data: pieLabels.map(s => statusCounts[s]),
                backgroundColor: pieLabels.map(s => STATUS_COLORS[s] || '#999'),
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            }
        }
    });
    
    // ========================================
    // 5. Status Summary (combined with pie)
    // ========================================
    const total = results.length;
    document.getElementById('statusSummary').innerHTML = pieLabels.map(status => {
        const count = statusCounts[status];
        const pct = (count / total * 100).toFixed(1);
        return `
            <div class="status-summary-item">
                <div class="left">
                    <span class="status-pill status-${status}">${status}</span>
                </div>
                <div>
                    <span class="count">${count}</span>
                    <span class="pct">(${pct}%)</span>
                </div>
            </div>
        `;
    }).join('');

    // ========================================
    // 6. 0s Baseline Distribution (Histogram)
    // ========================================
    const baselineDistCtx = document.getElementById('baselineDistChart');
    if (baselineDistCtx) {
        const ctx = baselineDistCtx.getContext('2d');
        const baselineBins = [0, 0.10, 0.20, 0.30, 0.35, 0.40, 0.45, 0.50, 0.55, 0.60, 0.65, 0.70, 0.80, 0.90, 1.0];
        const baselineBinLabels = baselineBins.slice(0, -1).map((b, i) => `${b.toFixed(2)}-${baselineBins[i+1].toFixed(2)}V`);

        const baselineHistByTest = {};
        for (let t = 1; t <= maxTests; t++) {
            baselineHistByTest[t] = new Array(baselineBins.length - 1).fill(0);
        }

        results.forEach(row => {
            for (let t = 1; t <= (row.testCount || 1); t++) {
                const v0 = row[`0s(T${t})`];
                if (v0 !== null && v0 !== undefined && !isNaN(v0)) {
                    for (let i = 0; i < baselineBins.length - 1; i++) {
                        if (v0 >= baselineBins[i] && v0 < baselineBins[i + 1]) {
                            baselineHistByTest[t][i]++;
                            break;
                        }
                    }
                }
            }
        });

        const getBaselineBarColor = (binIndex, alpha) => {
            const midpoint = (baselineBins[binIndex] + baselineBins[binIndex + 1]) / 2;
            if (midpoint < thresholds.min_0s || midpoint > thresholds.max_0s) return `rgba(6, 182, 212, ${alpha})`;
            return `rgba(16, 185, 129, ${alpha})`;
        };

        const baselineTestColors = ['0.9', '0.6', '0.35'];
        const baselineDatasets = [];
        for (let t = 1; t <= maxTests; t++) {
            baselineDatasets.push({
                label: `Test ${t}`,
                data: baselineHistByTest[t],
                backgroundColor: baselineBins.slice(0, -1).map((_, i) => getBaselineBarColor(i, baselineTestColors[t-1] || '0.5')),
                borderWidth: 0
            });
        }

        charts.baselineDist = new Chart(ctx, {
            type: 'bar',
            data: { labels: baselineBinLabels, datasets: baselineDatasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true, position: 'top',
                        labels: {
                            boxWidth: 12, padding: 8,
                            generateLabels: (chart) => chart.data.datasets.map((ds, i) => ({
                                text: ds.label,
                                fillStyle: `rgba(16, 185, 129, ${baselineTestColors[i] || '0.5'})`,
                                strokeStyle: 'transparent', lineWidth: 0, datasetIndex: i
                            }))
                        }
                    }
                },
                scales: {
                    y: { title: { display: true, text: 'Count' } },
                    x: { title: { display: true, text: '0s Baseline Voltage' } }
                }
            }
        });
    }

    // ========================================
    // 7. 0s Baseline Trend (Scatter)
    // ========================================
    const baselineTrendCtx = document.getElementById('baselineTrendChart');
    if (baselineTrendCtx) {
        const ctx = baselineTrendCtx.getContext('2d');
        const trendDatasets = [];

        for (let t = 1; t <= maxTests; t++) {
            const points = [];
            results.forEach((row, idx) => {
                if (t <= (row.testCount || 1)) {
                    const v0 = row[`0s(T${t})`];
                    if (v0 !== null && v0 !== undefined && !isNaN(v0)) {
                        points.push({ x: idx, y: v0 });
                    }
                }
            });
            trendDatasets.push({
                label: `Test ${t}`,
                data: points,
                backgroundColor: (TEST_COLORS[t - 1] || TEST_COLORS[0]) + '80',
                borderColor: (TEST_COLORS[t - 1] || TEST_COLORS[0]) + '80',
                pointRadius: 4,
                showLine: false
            });
        }

        // Add reference lines for baseline range
        trendDatasets.push({
            label: `BL Min (${thresholds.min_0s}V)`,
            data: [{ x: 0, y: thresholds.min_0s }, { x: results.length - 1, y: thresholds.min_0s }],
            borderColor: 'rgba(6, 182, 212, 0.6)',
            borderDash: [6, 4],
            borderWidth: 2,
            pointRadius: 0,
            showLine: true,
            fill: false
        });
        trendDatasets.push({
            label: `BL Max (${thresholds.max_0s}V)`,
            data: [{ x: 0, y: thresholds.max_0s }, { x: results.length - 1, y: thresholds.max_0s }],
            borderColor: 'rgba(6, 182, 212, 0.6)',
            borderDash: [6, 4],
            borderWidth: 2,
            pointRadius: 0,
            showLine: true,
            fill: false
        });

        charts.baselineTrend = new Chart(ctx, {
            type: 'scatter',
            data: { datasets: trendDatasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: true, position: 'top', labels: { boxWidth: 12, padding: 8 } }
                },
                scales: {
                    x: { type: 'linear', title: { display: true, text: 'Sensor Index' } },
                    y: { title: { display: true, text: '0s Voltage (V)' } }
                }
            }
        });
    }

    // ========================================
    // 8. 0s vs % Change Correlation (Scatter)
    // ========================================
    const baselineCorrCtx = document.getElementById('baselineCorrelationChart');
    if (baselineCorrCtx) {
        const ctx = baselineCorrCtx.getContext('2d');
        const correlationData = {};

        results.forEach(row => {
            for (let t = 1; t <= (row.testCount || 1); t++) {
                const v0 = row[`0s(T${t})`];
                const pctChgStr = row[`%Chg(T${t})`];
                const pctChg = pctChgStr ? parseFloat(pctChgStr) : null;
                const status = (row[`Status(T${t})`] || row['Pass/Fail']).split(',')[0];
                if (v0 != null && !isNaN(v0) && pctChg != null && !isNaN(pctChg)) {
                    if (!correlationData[status]) correlationData[status] = [];
                    correlationData[status].push({ x: v0, y: pctChg });
                }
            }
        });

        const corrDatasets = Object.entries(correlationData).map(([status, points]) => ({
            label: status,
            data: points,
            backgroundColor: (STATUS_COLORS[status] || '#999') + '80',
            borderColor: (STATUS_COLORS[status] || '#999') + '80',
            pointRadius: 4,
            showLine: false
        }));

        // Add reference lines for baseline range (vertical via scatter points)
        corrDatasets.push({
            label: `BL Min (${thresholds.min_0s}V)`,
            data: [{ x: thresholds.min_0s, y: thresholds.min_pct_change - 5 }, { x: thresholds.min_0s, y: thresholds.max_pct_change + 5 }],
            borderColor: 'rgba(6, 182, 212, 0.6)',
            borderDash: [6, 4],
            borderWidth: 2,
            pointRadius: 0,
            showLine: true,
            fill: false
        });
        corrDatasets.push({
            label: `BL Max (${thresholds.max_0s}V)`,
            data: [{ x: thresholds.max_0s, y: thresholds.min_pct_change - 5 }, { x: thresholds.max_0s, y: thresholds.max_pct_change + 5 }],
            borderColor: 'rgba(6, 182, 212, 0.6)',
            borderDash: [6, 4],
            borderWidth: 2,
            pointRadius: 0,
            showLine: true,
            fill: false
        });

        // Add reference lines for % change thresholds (horizontal)
        corrDatasets.push({
            label: `Min %Chg (${thresholds.min_pct_change}%)`,
            data: [{ x: 0, y: thresholds.min_pct_change }, { x: 1.0, y: thresholds.min_pct_change }],
            borderColor: 'rgba(239, 68, 68, 0.5)',
            borderDash: [6, 4],
            borderWidth: 2,
            pointRadius: 0,
            showLine: true,
            fill: false
        });
        corrDatasets.push({
            label: `Max %Chg (${thresholds.max_pct_change}%)`,
            data: [{ x: 0, y: thresholds.max_pct_change }, { x: 1.0, y: thresholds.max_pct_change }],
            borderColor: 'rgba(239, 68, 68, 0.5)',
            borderDash: [6, 4],
            borderWidth: 2,
            pointRadius: 0,
            showLine: true,
            fill: false
        });

        charts.baselineCorrelation = new Chart(ctx, {
            type: 'scatter',
            data: { datasets: corrDatasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: true, position: 'top', labels: { boxWidth: 12, padding: 8 } }
                },
                scales: {
                    x: { type: 'linear', title: { display: true, text: '0s Baseline (V)' } },
                    y: { title: { display: true, text: '% Change (90s→120s)' } }
                }
            }
        });
    }
}

function renderThresholdInfo(thresholdSet) {
    const thresholds = THRESHOLDS[thresholdSet];
    document.getElementById('thresholdInfo').innerHTML = `
        <table class="threshold-table">
            <thead><tr><th>Parameter</th><th>Value</th></tr></thead>
            <tbody>
                <tr><td>Threshold Set</td><td><strong>${thresholdSet}</strong></td></tr>
                <tr><td>120s Voltage Range</td><td>${thresholds.min_120s}V - ${thresholds.max_120s}V</td></tr>
                <tr><td>% Change Range</td><td>${thresholds.min_pct_change}% to ${thresholds.max_pct_change}%</td></tr>
                <tr><td>Max Pairwise Dev</td><td>${thresholds.max_pairwise_dev}V</td></tr>
                <tr><td>0s Baseline Range</td><td>${thresholds.min_0s}V - ${thresholds.max_0s}V</td></tr>
            </tbody>
        </table>
    `;
}

// ============================================================
// MULTI-JOB FUNCTIONS
// ============================================================


// ============================================================
// MULTI-JOB CHARTS
// ============================================================

function renderMultiJobCharts(tier) {
    const thresholdSet = document.getElementById('thresholdSet').value;
    const thresholds = THRESHOLDS[thresholdSet];

    // Destroy existing
    Object.values(charts).forEach(chart => chart?.destroy());
    charts = {};

    const jobs = [...multiJobResults.entries()];
    const JOB_COLORS = ['#667eea', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16', '#06b6d4', '#e11d48', '#a855f7', '#22c55e', '#eab308'];

    if (tier === 'few') {
        // Overlaid trend charts per job
        const trendCtx = document.getElementById('trendChart').getContext('2d');
        const trendDatasets = [];
        jobs.forEach(([jobNum, data], idx) => {
            const color = JOB_COLORS[idx % JOB_COLORS.length];
            // Group by serial to get tests
            const grouped = {};
            data.jobData.forEach(row => {
                const serial = row['Serial Number'];
                if (!grouped[serial]) grouped[serial] = [];
                grouped[serial].push(row);
            });
            // Average across all sensors for test 1 (main test)
            const allRows = data.jobData;
            const timeSeriesData = TIME_POINTS.map(tp => {
                const readings = allRows.map(r => r[tp]).filter(v => v !== null && !isNaN(v));
                const mean = readings.length > 0 ? calculateMean(readings) : null;
                return mean !== null ? { x: Number(tp), y: mean } : null;
            }).filter(p => p !== null);
            trendDatasets.push({
                label: `Job ${jobNum} (n=${data.results.length})`,
                data: timeSeriesData,
                borderColor: color,
                backgroundColor: color,
                borderWidth: 2,
                pointRadius: 3,
                tension: 0.1
            });
        });

        charts.trend = new Chart(trendCtx, {
            type: 'line',
            data: { datasets: trendDatasets },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: true, position: 'top' } },
                scales: {
                    y: { min: 0, max: 5, title: { display: true, text: 'Voltage (V)' } },
                    x: {
                        type: 'linear',
                        min: 0,
                        max: 120,
                        ticks: {
                            stepSize: 5,
                            callback: function(value) {
                                if ([0, 5, 15, 30, 60, 90, 120].includes(value)) return value + 's';
                                return null;
                            }
                        },
                        title: { display: true, text: 'Time' }
                    }
                }
            }
        });

        // Distribution: grouped bars per job
        const distCtx = document.getElementById('distributionChart').getContext('2d');
        const bins = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];
        const binLabels = bins.slice(0, -1).map((b, i) => `${b}-${bins[i+1]}V`);
        const distDatasets = [];
        jobs.forEach(([jobNum, data], idx) => {
            const color = JOB_COLORS[idx % JOB_COLORS.length];
            const histogram = new Array(bins.length - 1).fill(0);
            data.results.forEach(row => {
                for (let t = 1; t <= (row.testCount || 1); t++) {
                    const v = row[`120s(T${t})`];
                    if (v !== null && v !== undefined && !isNaN(v)) {
                        for (let i = 0; i < bins.length - 1; i++) {
                            if (v >= bins[i] && v < bins[i + 1]) { histogram[i]++; break; }
                        }
                    }
                }
            });
            distDatasets.push({
                label: `Job ${jobNum}`,
                data: histogram,
                backgroundColor: color + '99',
                borderColor: color,
                borderWidth: 1
            });
        });

        charts.distribution = new Chart(distCtx, {
            type: 'bar',
            data: { labels: binLabels, datasets: distDatasets },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: true, position: 'top' } },
                scales: {
                    y: { title: { display: true, text: 'Count' } },
                    x: { title: { display: true, text: '120s Voltage' } }
                }
            }
        });

        // Status by test: grouped bars showing pass rate % per test across jobs
        const statusCtx = document.getElementById('statusByTestChart').getContext('2d');
        const jobLabels = jobs.map(([jobNum]) => `Job ${jobNum}`);
        const testColors = { 1: '#667eea', 2: '#10b981', 3: '#f59e0b' };
        const maxTAll = Math.max(...jobs.map(([, d]) => d.stats.maxTests));
        const testDatasets = [];

        for (let t = 1; t <= maxTAll; t++) {
            testDatasets.push({
                label: `T${t}`,
                data: jobs.map(([, data]) => {
                    let total = 0, passed = 0;
                    data.results.forEach(row => {
                        const st = row[`Status(T${t})`];
                        if (st) {
                            total++;
                            const codes = st.split(',');
                            if (!codes.some(c => ['FL', 'FH', 'OT-', 'FAIL'].includes(c))) passed++;
                        }
                    });
                    return total > 0 ? parseFloat((passed / total * 100).toFixed(1)) : null;
                }),
                backgroundColor: testColors[t] || '#8b5cf6',
                borderWidth: 0
            });
        }

        charts.statusByTest = new Chart(statusCtx, {
            type: 'bar',
            data: { labels: jobLabels, datasets: testDatasets },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { display: true, position: 'top' },
                    title: { display: true, text: 'Pass Rate by Test Across Jobs' },
                    tooltip: {
                        callbacks: {
                            label: ctx => ctx.raw !== null ? `${ctx.dataset.label}: ${ctx.raw}%` : ''
                        }
                    }
                },
                scales: {
                    x: { stacked: false },
                    y: {
                        stacked: false,
                        min: 0, max: 100,
                        title: { display: true, text: 'Pass Rate (%)' },
                        ticks: { callback: v => v + '%' }
                    }
                }
            }
        });

        // Stacked horizontal bar per job (percentage)
        const pieCtx = document.getElementById('pieChart').getContext('2d');
        const allStatuses = ['PASS', 'FL', 'FH', 'OT-', 'TT', 'OT+', 'BL', 'FAIL'];
        const hDatasets = allStatuses.map(s => ({
            label: s,
            data: jobs.map(([, d]) => {
                const total = d.results.length;
                if (total === 0) return 0;
                const count = d.results.filter(r => r['Pass/Fail'] === s).length;
                return parseFloat((count / total * 100).toFixed(1));
            }),
            backgroundColor: STATUS_COLORS[s]
        })).filter(ds => ds.data.some(v => v > 0));

        charts.pie = new Chart(pieCtx, {
            type: 'bar',
            data: { labels: jobLabels, datasets: hDatasets },
            options: {
                indexAxis: 'y',
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { display: true, position: 'top' },
                    tooltip: {
                        callbacks: {
                            label: ctx => `${ctx.dataset.label}: ${ctx.raw}%`
                        }
                    }
                },
                scales: {
                    x: { stacked: true, min: 0, max: 100, title: { display: true, text: 'Status (%)' }, ticks: { callback: v => v + '%' } },
                    y: { stacked: true }
                }
            }
        });

        // Status summary
        const allResults = jobs.flatMap(([, d]) => d.results);
        const total = allResults.length;
        const statusCounts = {};
        allResults.forEach(r => { statusCounts[r['Pass/Fail']] = (statusCounts[r['Pass/Fail']] || 0) + 1; });
        const pieLabels = Object.keys(statusCounts).sort((a, b) => (STATUS_PRIORITY[a] || 99) - (STATUS_PRIORITY[b] || 99));
        document.getElementById('statusSummary').innerHTML = pieLabels.map(status => {
            const count = statusCounts[status];
            const pct = (count / total * 100).toFixed(1);
            return `<div class="status-summary-item"><div class="left"><span class="status-pill status-${status}">${status}</span></div><div><span class="count">${count}</span> <span class="pct">(${pct}%)</span></div></div>`;
        }).join('');

    } else {
        // Many/Bulk: trend line + heatmap + histogram/outlier

        // 1. Pass Rate Trend line chart
        const trendCtx = document.getElementById('trendChart').getContext('2d');
        const sortedJobs = [...jobs].sort((a, b) => parseFloat(a[0]) - parseFloat(b[0]));
        const jobLabels = sortedJobs.map(([j]) => j);
        const passRates = sortedJobs.map(([, d]) => d.stats.passRate);

        const trendDatasets = [{
            label: 'Overall Pass Rate',
            data: passRates,
            borderColor: '#667eea',
            backgroundColor: '#667eea',
            borderWidth: 2,
            pointRadius: 4,
            fill: false,
            tension: 0.2
        }];

        // Add per-test lines if available
        const maxTestAcross = Math.max(...sortedJobs.map(([, d]) => d.stats.maxTests));
        for (let t = 1; t <= Math.min(maxTestAcross, 3); t++) {
            trendDatasets.push({
                label: `T${t} Pass Rate`,
                data: sortedJobs.map(([, d]) => {
                    const ts = d.stats.testStats[t];
                    return ts && ts.total > 0 ? (ts.passed / ts.total * 100) : null;
                }),
                borderColor: TEST_COLORS[(t - 1) % TEST_COLORS.length],
                borderWidth: 1.5,
                pointRadius: 3,
                borderDash: [5, 3],
                tension: 0.2
            });
        }

        // Moving average for bulk
        if (tier === 'bulk' && passRates.length >= 5) {
            const windowSize = Math.min(5, Math.floor(passRates.length / 3));
            const ma = passRates.map((_, i) => {
                if (i < windowSize - 1) return null;
                const slice = passRates.slice(i - windowSize + 1, i + 1);
                return calculateMean(slice);
            });
            trendDatasets.push({
                label: `${windowSize}-Job Moving Avg`,
                data: ma,
                borderColor: '#ef4444',
                borderWidth: 3,
                pointRadius: 0,
                borderDash: [],
                tension: 0.3
            });
        }

        // Dynamic Y-axis: zoom into the data range for better readability
        const allTrendValues = trendDatasets.flatMap(ds => ds.data).filter(v => v !== null && !isNaN(v));
        const minRate = allTrendValues.length > 0 ? Math.min(...allTrendValues) : 0;
        const trendYMin = Math.max(0, Math.floor(minRate / 5) * 5 - 5);

        charts.trend = new Chart(trendCtx, {
            type: 'line',
            data: { labels: jobLabels, datasets: trendDatasets },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: true, position: 'top' }, title: { display: true, text: 'Pass Rate Across Jobs' } },
                scales: {
                    y: { min: trendYMin, max: 100, title: { display: true, text: 'Pass Rate (%)' } },
                    x: { title: { display: true, text: 'Job #' } }
                }
            }
        });

        // 2. Heatmap (rendered as HTML table) in distribution chart area
        const distCanvas = document.getElementById('distributionChart');
        const distCard = distCanvas.closest('.card');
        distCanvas.style.display = 'none';

        let heatmapDiv = document.getElementById('multiJobHeatmap');
        if (!heatmapDiv) {
            heatmapDiv = document.createElement('div');
            heatmapDiv.id = 'multiJobHeatmap';
            heatmapDiv.className = 'heatmap-container';
            distCanvas.parentElement.appendChild(heatmapDiv);
        }
        distCanvas.parentElement.style.height = 'auto';
        distCanvas.parentElement.style.overflow = 'auto';

        const heatJobs = sortedJobs;
        const maxT = Math.max(...heatJobs.map(([, d]) => d.stats.maxTests));
        let heatHTML = '<table class="heatmap-table"><thead><tr><th>Job #</th>';
        for (let t = 1; t <= maxT; t++) heatHTML += `<th>T${t}</th>`;
        heatHTML += '<th>Overall</th></tr></thead><tbody>';

        heatJobs.forEach(([jobNum, data]) => {
            heatHTML += `<tr><td><strong>${jobNum}</strong></td>`;
            for (let t = 1; t <= maxT; t++) {
                const ts = data.stats.testStats[t];
                if (ts && ts.total > 0) {
                    const rate = (ts.passed / ts.total * 100);
                    const color = rate >= 90 ? '#10b981' : rate >= 70 ? '#f59e0b' : '#ef4444';
                    heatHTML += `<td class="heatmap-cell" style="background:${color};">${rate.toFixed(0)}%</td>`;
                } else {
                    heatHTML += '<td>—</td>';
                }
            }
            const overallColor = data.stats.passRate >= 90 ? '#10b981' : data.stats.passRate >= 70 ? '#f59e0b' : '#ef4444';
            heatHTML += `<td class="heatmap-cell" style="background:${overallColor};">${data.stats.passRate.toFixed(0)}%</td></tr>`;
        });
        heatHTML += '</tbody></table>';
        heatmapDiv.innerHTML = heatHTML;
        distCard.querySelector('.card-title').textContent = 'Pass Rate Heatmap';

        // 3. Status by test → Fail rate distribution (stacked bar across jobs, as %)
        const statusCtx = document.getElementById('statusByTestChart').getContext('2d');
        const failStatuses = ['FL', 'FH', 'OT-', 'TT', 'OT+', 'FAIL'];
        const failDatasets = failStatuses.map(s => ({
            label: s,
            data: sortedJobs.map(([, d]) => {
                const count = d.results.filter(r => r['Pass/Fail'] === s).length;
                const total = d.stats.counted || d.results.length;
                return total > 0 ? parseFloat((count / total * 100).toFixed(2)) : 0;
            }),
            backgroundColor: STATUS_COLORS[s]
        })).filter(ds => ds.data.some(v => v > 0));

        charts.statusByTest = new Chart(statusCtx, {
            type: 'bar',
            data: { labels: jobLabels, datasets: failDatasets },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { display: true, position: 'top' },
                    title: { display: true, text: 'Fail Rate by Status Across Jobs' },
                    tooltip: {
                        callbacks: {
                            label: ctx => `${ctx.dataset.label}: ${ctx.raw.toFixed(1)}%`
                        }
                    }
                },
                scales: {
                    x: { stacked: true },
                    y: { stacked: true, title: { display: true, text: 'Fail Rate (%)' },
                        ticks: { callback: v => v + '%' }
                    }
                }
            }
        });

        // 4. Pie chart area → histogram of pass rates (many) or outlier scatter (bulk)
        const pieCtx = document.getElementById('pieChart').getContext('2d');
        document.getElementById('statusSummary').innerHTML = '';

        if (tier === 'bulk') {
            // Scatter plot with outlier highlighting
            const mean = calculateMean(passRates);
            const stdDev = calculateStdDev(passRates);
            const threshold2sd = stdDev * 2;

            const normalPoints = [];
            const outlierPoints = [];
            sortedJobs.forEach(([jobNum, data], idx) => {
                const point = { x: idx, y: data.stats.passRate };
                if (Math.abs(data.stats.passRate - mean) > threshold2sd) {
                    outlierPoints.push(point);
                } else {
                    normalPoints.push(point);
                }
            });

            charts.pie = new Chart(pieCtx, {
                type: 'scatter',
                data: {
                    datasets: [
                        { label: 'Normal', data: normalPoints, backgroundColor: '#667eea', pointRadius: 5 },
                        { label: 'Outlier (>2σ)', data: outlierPoints, backgroundColor: '#ef4444', pointRadius: 7, pointStyle: 'triangle' }
                    ]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: {
                        legend: { display: true },
                        title: { display: true, text: 'Pass Rate Outliers' },
                        tooltip: {
                            callbacks: {
                                label: ctx => {
                                    const idx = ctx.raw.x;
                                    return `Job ${sortedJobs[idx][0]}: ${ctx.raw.y.toFixed(1)}%`;
                                }
                            }
                        }
                    },
                    scales: {
                        y: { min: 0, max: 100, title: { display: true, text: 'Pass Rate (%)' } },
                        x: { display: false }
                    }
                }
            });
            document.getElementById('statusSummary').innerHTML = `
                <div class="status-summary-item"><div class="left">Mean</div><div class="count">${mean.toFixed(1)}%</div></div>
                <div class="status-summary-item"><div class="left">Std Dev</div><div class="count">${stdDev.toFixed(1)}%</div></div>
                <div class="status-summary-item"><div class="left">Outliers</div><div class="count">${outlierPoints.length}</div></div>
            `;
        } else {
            // Histogram of pass rates
            const histBins = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100.1];
            const histLabels = histBins.slice(0, -1).map((b, i) => `${b}-${Math.min(histBins[i+1], 100)}%`);
            const histogram = new Array(histBins.length - 1).fill(0);
            passRates.forEach(r => {
                for (let i = 0; i < histBins.length - 1; i++) {
                    if (r >= histBins[i] && r < histBins[i + 1]) { histogram[i]++; break; }
                }
            });

            charts.pie = new Chart(pieCtx, {
                type: 'bar',
                data: {
                    labels: histLabels,
                    datasets: [{
                        label: 'Jobs',
                        data: histogram,
                        backgroundColor: histBins.slice(0, -1).map((b) => b >= 80 ? '#10b981' : b >= 50 ? '#f59e0b' : '#ef4444'),
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { display: false }, title: { display: true, text: 'Pass Rate Distribution' } },
                    scales: {
                        y: { beginAtZero: true, title: { display: true, text: 'Number of Jobs' }, ticks: { stepSize: 1 } },
                        x: { title: { display: true, text: 'Pass Rate Range' } }
                    }
                }
            });

            // Add overall status summary for many tier
            const allResults = jobs.flatMap(([, d]) => d.results);
            const totalResults = allResults.length;
            const statusCounts = {};
            allResults.forEach(r => { statusCounts[r['Pass/Fail']] = (statusCounts[r['Pass/Fail']] || 0) + 1; });
            const summaryLabels = Object.keys(statusCounts).sort((a, b) => (STATUS_PRIORITY[a] || 99) - (STATUS_PRIORITY[b] || 99));
            document.getElementById('statusSummary').innerHTML = summaryLabels.map(status => {
                const count = statusCounts[status];
                const pct = (count / totalResults * 100).toFixed(1);
                return `<div class="status-summary-item"><div class="left"><span class="status-pill status-${status}">${status}</span></div><div><span class="count">${count}</span> <span class="pct">(${pct}%)</span></div></div>`;
            }).join('');
        }
    }

    // ========================================
    // Baseline charts (shared across all tiers)
    // ========================================
    const allResults = jobs.flatMap(([, d]) => d.results);
    const allJobData = jobs.flatMap(([, d]) => d.jobData);
    const maxTests = Math.max(...allResults.map(r => r.testCount || 1), 1);

    // 0s Baseline Distribution (Histogram)
    const baselineDistCtx = document.getElementById('baselineDistChart');
    if (baselineDistCtx) {
        const ctx = baselineDistCtx.getContext('2d');
        const baselineBins = [0, 0.10, 0.20, 0.30, 0.35, 0.40, 0.45, 0.50, 0.55, 0.60, 0.65, 0.70, 0.80, 0.90, 1.0];
        const baselineBinLabels = baselineBins.slice(0, -1).map((b, i) => `${b.toFixed(2)}-${baselineBins[i+1].toFixed(2)}V`);

        const baselineHistByTest = {};
        for (let t = 1; t <= maxTests; t++) {
            baselineHistByTest[t] = new Array(baselineBins.length - 1).fill(0);
        }

        allResults.forEach(row => {
            for (let t = 1; t <= (row.testCount || 1); t++) {
                const v0 = row[`0s(T${t})`];
                if (v0 !== null && v0 !== undefined && !isNaN(v0)) {
                    for (let i = 0; i < baselineBins.length - 1; i++) {
                        if (v0 >= baselineBins[i] && v0 < baselineBins[i + 1]) {
                            baselineHistByTest[t][i]++;
                            break;
                        }
                    }
                }
            }
        });

        const getBaselineBarColor = (binIndex, alpha) => {
            const midpoint = (baselineBins[binIndex] + baselineBins[binIndex + 1]) / 2;
            if (midpoint < thresholds.min_0s || midpoint > thresholds.max_0s) return `rgba(6, 182, 212, ${alpha})`;
            return `rgba(16, 185, 129, ${alpha})`;
        };

        const baselineTestColors = ['0.9', '0.6', '0.35'];
        const baselineDatasets = [];
        for (let t = 1; t <= maxTests; t++) {
            baselineDatasets.push({
                label: `Test ${t}`,
                data: baselineHistByTest[t],
                backgroundColor: baselineBins.slice(0, -1).map((_, i) => getBaselineBarColor(i, baselineTestColors[t-1] || '0.5')),
                borderWidth: 0
            });
        }

        charts.baselineDist = new Chart(ctx, {
            type: 'bar',
            data: { labels: baselineBinLabels, datasets: baselineDatasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true, position: 'top',
                        labels: {
                            boxWidth: 12, padding: 8,
                            generateLabels: (chart) => chart.data.datasets.map((ds, i) => ({
                                text: ds.label,
                                fillStyle: `rgba(16, 185, 129, ${baselineTestColors[i] || '0.5'})`,
                                strokeStyle: 'transparent', lineWidth: 0, datasetIndex: i
                            }))
                        }
                    }
                },
                scales: {
                    y: { title: { display: true, text: 'Count' } },
                    x: { title: { display: true, text: '0s Baseline Voltage' } }
                }
            }
        });
    }

    // 0s Baseline Trend (Scatter)
    const baselineTrendCtx = document.getElementById('baselineTrendChart');
    if (baselineTrendCtx) {
        const ctx = baselineTrendCtx.getContext('2d');
        const blTrendDatasets = [];

        for (let t = 1; t <= maxTests; t++) {
            const points = [];
            allResults.forEach((row, idx) => {
                if (t <= (row.testCount || 1)) {
                    const v0 = row[`0s(T${t})`];
                    if (v0 !== null && v0 !== undefined && !isNaN(v0)) {
                        points.push({ x: idx, y: v0 });
                    }
                }
            });
            blTrendDatasets.push({
                label: `Test ${t}`,
                data: points,
                backgroundColor: (TEST_COLORS[t - 1] || TEST_COLORS[0]) + '80',
                borderColor: (TEST_COLORS[t - 1] || TEST_COLORS[0]) + '80',
                pointRadius: 4,
                showLine: false
            });
        }

        blTrendDatasets.push({
            label: `BL Min (${thresholds.min_0s}V)`,
            data: [{ x: 0, y: thresholds.min_0s }, { x: allResults.length - 1, y: thresholds.min_0s }],
            borderColor: 'rgba(6, 182, 212, 0.6)',
            borderDash: [6, 4],
            borderWidth: 2,
            pointRadius: 0,
            showLine: true,
            fill: false
        });
        blTrendDatasets.push({
            label: `BL Max (${thresholds.max_0s}V)`,
            data: [{ x: 0, y: thresholds.max_0s }, { x: allResults.length - 1, y: thresholds.max_0s }],
            borderColor: 'rgba(6, 182, 212, 0.6)',
            borderDash: [6, 4],
            borderWidth: 2,
            pointRadius: 0,
            showLine: true,
            fill: false
        });

        charts.baselineTrend = new Chart(ctx, {
            type: 'scatter',
            data: { datasets: blTrendDatasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: true, position: 'top', labels: { boxWidth: 12, padding: 8 } }
                },
                scales: {
                    x: { type: 'linear', title: { display: true, text: 'Sensor Index' } },
                    y: { title: { display: true, text: '0s Voltage (V)' } }
                }
            }
        });
    }

    // 0s vs % Change Correlation (Scatter)
    const baselineCorrCtx = document.getElementById('baselineCorrelationChart');
    if (baselineCorrCtx) {
        const ctx = baselineCorrCtx.getContext('2d');
        const correlationData = {};

        allResults.forEach(row => {
            for (let t = 1; t <= (row.testCount || 1); t++) {
                const v0 = row[`0s(T${t})`];
                const pctChgStr = row[`%Chg(T${t})`];
                const pctChg = pctChgStr ? parseFloat(pctChgStr) : null;
                const status = (row[`Status(T${t})`] || row['Pass/Fail']).split(',')[0];
                if (v0 != null && !isNaN(v0) && pctChg != null && !isNaN(pctChg)) {
                    if (!correlationData[status]) correlationData[status] = [];
                    correlationData[status].push({ x: v0, y: pctChg });
                }
            }
        });

        const corrDatasets = Object.entries(correlationData).map(([status, points]) => ({
            label: status,
            data: points,
            backgroundColor: (STATUS_COLORS[status] || '#999') + '80',
            borderColor: (STATUS_COLORS[status] || '#999') + '80',
            pointRadius: 4,
            showLine: false
        }));

        corrDatasets.push({
            label: `BL Min (${thresholds.min_0s}V)`,
            data: [{ x: thresholds.min_0s, y: thresholds.min_pct_change - 5 }, { x: thresholds.min_0s, y: thresholds.max_pct_change + 5 }],
            borderColor: 'rgba(6, 182, 212, 0.6)',
            borderDash: [6, 4],
            borderWidth: 2,
            pointRadius: 0,
            showLine: true,
            fill: false
        });
        corrDatasets.push({
            label: `BL Max (${thresholds.max_0s}V)`,
            data: [{ x: thresholds.max_0s, y: thresholds.min_pct_change - 5 }, { x: thresholds.max_0s, y: thresholds.max_pct_change + 5 }],
            borderColor: 'rgba(6, 182, 212, 0.6)',
            borderDash: [6, 4],
            borderWidth: 2,
            pointRadius: 0,
            showLine: true,
            fill: false
        });
        corrDatasets.push({
            label: `Min %Chg (${thresholds.min_pct_change}%)`,
            data: [{ x: 0, y: thresholds.min_pct_change }, { x: 1.0, y: thresholds.min_pct_change }],
            borderColor: 'rgba(239, 68, 68, 0.5)',
            borderDash: [6, 4],
            borderWidth: 2,
            pointRadius: 0,
            showLine: true,
            fill: false
        });
        corrDatasets.push({
            label: `Max %Chg (${thresholds.max_pct_change}%)`,
            data: [{ x: 0, y: thresholds.max_pct_change }, { x: 1.0, y: thresholds.max_pct_change }],
            borderColor: 'rgba(239, 68, 68, 0.5)',
            borderDash: [6, 4],
            borderWidth: 2,
            pointRadius: 0,
            showLine: true,
            fill: false
        });

        charts.baselineCorrelation = new Chart(ctx, {
            type: 'scatter',
            data: { datasets: corrDatasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: true, position: 'top', labels: { boxWidth: 12, padding: 8 } }
                },
                scales: {
                    x: { type: 'linear', title: { display: true, text: '0s Baseline (V)' } },
                    y: { title: { display: true, text: '% Change (90s→120s)' } }
                }
            }
        });
    }
}

