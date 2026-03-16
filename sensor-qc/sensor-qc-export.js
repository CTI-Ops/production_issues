// ============================================================
// Sensor QC Analysis - Export Functions
// ============================================================

function exportCSV() {
    if (!analysisResults) return;

    if (multiJobMode && (currentTier === 'many' || currentTier === 'bulk')) {
        // Export job-level summary for many/bulk tiers
        const headers = ['Job #', 'Sensors', 'T1 Pass %', 'T2 Pass %', 'T3 Pass %', 'Overall Pass %', 'Avg 120s V', 'Avg %Chg'];
        const rows = [...multiJobResults.entries()].map(([jobNum, data]) => {
            const s = data.stats;
            const t1 = s.testStats[1], t2 = s.testStats[2], t3 = s.testStats[3];
            return [
                jobNum, s.total,
                t1 && t1.total > 0 ? (t1.passed / t1.total * 100).toFixed(1) : '',
                t2 && t2.total > 0 ? (t2.passed / t2.total * 100).toFixed(1) : '',
                t3 && t3.total > 0 ? (t3.passed / t3.total * 100).toFixed(1) : '',
                s.passRate.toFixed(1),
                s.avg120s !== null ? s.avg120s.toFixed(3) : '',
                s.avgPctChg !== null ? s.avgPctChg.toFixed(1) : ''
            ].map(v => `"${v}"`).join(',');
        });
        const csv = [headers.join(','), ...rows].join('\n');
        downloadFile(csv, `multi_job_comparison_${currentJobList.length}jobs.csv`, 'text/csv');
        return;
    }

    // Single or few-job: sensor-level export
    const hasJobCol = multiJobMode;
    const headers = hasJobCol ? ['Job #', 'Serial Number', 'Channel', 'Pass/Fail', '120s(MaxΔ)'] : ['Serial Number', 'Channel', 'Pass/Fail', '120s(MaxΔ)'];
    const maxTests = Math.max(...analysisResults.map(r => r.testCount || 1));
    for (let i = 1; i <= maxTests; i++) {
        headers.push(`0s(T${i})`, `120s(T${i})`, `%Chg(T${i})`, `Status(T${i})`);
    }

    let allRows;
    if (multiJobMode) {
        allRows = [];
        for (const [jobNum, data] of multiJobResults.entries()) {
            data.results.forEach(row => {
                const values = [jobNum, row['Serial Number'], row['Channel'], row['Pass/Fail'], row['120s(MaxΔ)'].toFixed(4)];
                for (let i = 1; i <= maxTests; i++) {
                    values.push(row[`0s(T${i})`] ?? '', row[`120s(T${i})`] ?? '', row[`%Chg(T${i})`] ?? '', row[`Status(T${i})`] ?? '');
                }
                allRows.push(values.map(v => `"${v}"`).join(','));
            });
        }
    } else {
        allRows = analysisResults.map(row => {
            const values = [row['Serial Number'], row['Channel'], row['Pass/Fail'], row['120s(MaxΔ)'].toFixed(4)];
            for (let i = 1; i <= maxTests; i++) {
                values.push(row[`0s(T${i})`] ?? '', row[`120s(T${i})`] ?? '', row[`%Chg(T${i})`] ?? '', row[`Status(T${i})`] ?? '');
            }
            return values.map(v => `"${v}"`).join(',');
        });
    }

    const csv = [headers.join(','), ...allRows].join('\n');
    const filename = multiJobMode ? `multi_job_${currentJobList.length}jobs_analysis.csv` : `job_${currentJob}_analysis.csv`;
    downloadFile(csv, filename, 'text/csv');
}

function exportPDF() {
    if (!analysisResults) return;

    const total = analysisResults.length;
    const passed = analysisResults.filter(r => ['PASS', 'TT', 'OT+', 'BL'].includes(r['Pass/Fail'])).length;
    const failed = analysisResults.filter(r => ['FL', 'FH', 'OT-', 'FAIL'].includes(r['Pass/Fail'])).length;
    const counted = passed + failed;
    const passRate = counted > 0 ? (passed / counted * 100).toFixed(1) : '0.0';
    const failRate = counted > 0 ? (failed / counted * 100).toFixed(1) : '0.0';
    const thresholdSet = document.getElementById('thresholdSet').value;

    const statusCounts = {};
    analysisResults.forEach(r => {
        statusCounts[r['Pass/Fail']] = (statusCounts[r['Pass/Fail']] || 0) + 1;
    });

    const statusRows = Object.entries(statusCounts)
        .sort((a, b) => (STATUS_PRIORITY[a[0]] || 99) - (STATUS_PRIORITY[b[0]] || 99))
        .map(([status, count]) => `<tr><td>${status}</td><td>${count}</td><td>${(count / total * 100).toFixed(1)}%</td></tr>`)
        .join('');

    const failedSensors = analysisResults.filter(r => ['FL', 'FH'].includes(r['Pass/Fail']));
    const failedRows = failedSensors.map(r => `<tr><td>${r['Serial Number']}</td><td>${r['Channel']}</td><td>${r['Pass/Fail']}</td><td>${r['120s(MaxΔ)'].toFixed(4)}</td></tr>`).join('');

    const reportHTML = `
        <html><head><title>Job ${currentJob} Summary</title>
        <style>
            body{font-family:Arial,sans-serif;padding:20px}
            h1{color:#667eea;border-bottom:3px solid #667eea;padding-bottom:10px}
            h2{color:#333;margin-top:20px}
            table{width:100%;border-collapse:collapse;margin:15px 0}
            th,td{padding:10px;border:1px solid #ddd;text-align:left}
            th{background:#f5f5f5}
            .pass{color:#10b981}
            .fail{color:#ef4444}
            .failed-section th{background:#ef4444;color:white}
            @media print { body{padding:0} }
        </style>
        </head><body>
        <h1>Sensor Analysis Report</h1>
        <p><strong>Job:</strong> ${currentJob}</p>
        <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>

        <h2>Summary</h2>
        <table>
            <tr><th>Metric</th><th>Value</th></tr>
            <tr><td>Total Sensors</td><td>${total}</td></tr>
            <tr><td>Passed</td><td class="pass">${passed} (${passRate}%)</td></tr>
            <tr><td>Failed</td><td class="fail">${failed} (${failRate}%)</td></tr>
            <tr><td>Threshold Set</td><td>${thresholdSet}</td></tr>
        </table>

        <h2>Status Breakdown</h2>
        <table>
            <tr><th>Status</th><th>Count</th><th>Percentage</th></tr>
            ${statusRows}
        </table>

        ${failedSensors.length > 0 ? `
        <h2>Failed Sensors</h2>
        <table class="failed-section">
            <tr><th>Serial Number</th><th>Channel</th><th>Status</th><th>Max Δ</th></tr>
            ${failedRows}
        </table>
        ` : ''}
        </body></html>
    `;

    const printWindow = window.open('', '', 'width=900,height=700');
    printWindow.document.write(reportHTML);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
}

function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function printReport() {
    window.print();
}

function showSummaryReport() {
    if (!currentJob || !rawData || rawData.length === 0) {
        alert('Please load a database and analyze a job first.');
        return;
    }

    // Get threshold settings
    const thresholdSet = document.getElementById('thresholdSet').value;
    const thresholds = THRESHOLDS[thresholdSet] || THRESHOLDS['default'];

    // Group all raw data by whole number job prefix (e.g., 258.1, 258.2 -> 258)
    const jobGroups = {};
    rawData.forEach(row => {
        const jobNum = row['Job #'];
        const wholeNum = parseInt(jobNum, 10);
        if (!isNaN(wholeNum)) {
            if (!jobGroups[wholeNum]) {
                jobGroups[wholeNum] = [];
            }
            jobGroups[wholeNum].push(row);
        }
    });

    // Get unique whole number job prefixes, sorted descending
    const allWholeJobs = Object.keys(jobGroups)
        .map(j => parseInt(j, 10))
        .sort((a, b) => b - a);

    const currentJobWholeNum = parseInt(currentJob, 10);

    // Find current job and 14 jobs numerically before it
    const currentJobIndex = allWholeJobs.findIndex(j => j === currentJobWholeNum);

    let jobsToInclude;
    if (currentJobIndex === -1) {
        // Current job not in list - just take top 15
        jobsToInclude = allWholeJobs.slice(0, 15);
    } else {
        // Include current job + up to 14 jobs before it (numerically lower)
        jobsToInclude = allWholeJobs.slice(currentJobIndex, currentJobIndex + 15);
    }

    // Calculate stats for each job group by analyzing unique sensors
    const jobsToShow = jobsToInclude.map(wholeJobNum => {
        const jobData = jobGroups[wholeJobNum];

        // Load status overrides for this job group.
        // Overrides may be stored under the whole job number or any sub-job variant
        // (e.g., "258", "258.1", "258.2"), so collect all unique Job # values in this group.
        const jobVariants = new Set();
        jobVariants.add(String(wholeJobNum));
        jobData.forEach(row => {
            const jobNum = String(row['Job #']).trim();
            if (jobNum) jobVariants.add(jobNum);
        });
        const combinedOverrides = {};
        for (const variant of jobVariants) {
            const overrides = loadStatusOverrides(variant);
            Object.assign(combinedOverrides, overrides);
        }

        // Group by Serial Number to count unique sensors
        const sensorGroups = {};
        jobData.forEach(row => {
            const serial = row['Serial Number'];
            if (!sensorGroups[serial]) {
                sensorGroups[serial] = [];
            }
            sensorGroups[serial].push(row);
        });

        let totalSensors = 0;
        let totalPassed = 0;
        let t1Passed = 0, t2Passed = 0, t3Passed = 0;
        let t1Total = 0, t2Total = 0, t3Total = 0;

        // Evaluate each unique sensor using the same logic as determinePassFail
        for (const [serial, sensorRows] of Object.entries(sensorGroups)) {
            const readings120 = sensorRows
                .map(row => row['120'])
                .filter(v => v !== null && v !== undefined && !isNaN(v));

            if (readings120.length === 0) continue; // Skip sensors with no valid data

            totalSensors++;
            const maxPairDev120 = calculateMaxPairwiseDev(readings120);
            let hasCriticalFailure = false;

            // Check each test for this sensor and track per-test passes
            sensorRows.forEach((row, testIdx) => {
                const v120 = row['120'];
                const pctChange = row.pct_change_90_120;
                let testPassed = true;

                if (v120 === null || v120 === undefined || isNaN(v120)) {
                    // Missing data - skip this test
                    testPassed = false;
                } else {
                    if (v120 < thresholds.min_120s || v120 > thresholds.max_120s) {
                        testPassed = false;
                        hasCriticalFailure = true;
                    }
                }

                if (pctChange !== null && !isNaN(pctChange)) {
                    if (pctChange < thresholds.min_pct_change) {
                        testPassed = false;
                        hasCriticalFailure = true;
                    }
                }

                // Track per-test passes (testIdx 0 = T1, 1 = T2, 2 = T3)
                if (testIdx === 0) {
                    t1Total++;
                    if (testPassed) t1Passed++;
                } else if (testIdx === 1) {
                    t2Total++;
                    if (testPassed) t2Passed++;
                } else if (testIdx === 2) {
                    t3Total++;
                    if (testPassed) t3Passed++;
                }
            });

            // Apply user status overrides — if the user manually changed
            // this sensor's Pass/Fail in the dashboard, honor that override
            const overriddenStatus = combinedOverrides[serial];
            if (overriddenStatus) {
                if (['PASS', 'TT', 'OT+', 'BL'].includes(overriddenStatus)) {
                    totalPassed++;
                }
                // else: user overrode to a fail status — don't count as passed
            } else if (!hasCriticalFailure) {
                totalPassed++;
            }
        }

        const t1PassPct = t1Total > 0 ? (t1Passed / t1Total * 100) : 0;
        const t2PassPct = t2Total > 0 ? (t2Passed / t2Total * 100) : 0;
        const t3PassPct = t3Total > 0 ? (t3Passed / t3Total * 100) : 0;
        const totalPassPct = totalSensors > 0 ? (totalPassed / totalSensors * 100) : 0;

        return {
            jobNumber: wholeJobNum,
            totalSensors: totalSensors,
            t1PassPct: t1PassPct,
            t1Passed: t1Passed,
            t1Total: t1Total,
            t2PassPct: t2PassPct,
            t2Passed: t2Passed,
            t2Total: t2Total,
            t3PassPct: t3PassPct,
            t3Passed: t3Passed,
            t3Total: t3Total,
            totalPassPct: totalPassPct,
            totalPassed: totalPassed
        };
    });

    // Sort jobs by job number ascending (most recent/largest at bottom)
    jobsToShow.sort((a, b) => a.jobNumber - b.jobNumber);

    // Calculate cumulative totals for pass percentages
    const totalSensorsSum = jobsToShow.reduce((sum, j) => sum + j.totalSensors, 0);
    const totalT1Passed = jobsToShow.reduce((sum, j) => sum + j.t1Passed, 0);
    const totalT1Tested = jobsToShow.reduce((sum, j) => sum + j.t1Total, 0);
    const totalT2Passed = jobsToShow.reduce((sum, j) => sum + j.t2Passed, 0);
    const totalT2Tested = jobsToShow.reduce((sum, j) => sum + j.t2Total, 0);
    const totalT3Passed = jobsToShow.reduce((sum, j) => sum + j.t3Passed, 0);
    const totalT3Tested = jobsToShow.reduce((sum, j) => sum + j.t3Total, 0);
    const totalOverallPassed = jobsToShow.reduce((sum, j) => sum + j.totalPassed, 0);
    const weightedT1PassPct = totalT1Tested > 0 ? (totalT1Passed / totalT1Tested * 100) : 0;
    const weightedT2PassPct = totalT2Tested > 0 ? (totalT2Passed / totalT2Tested * 100) : 0;
    const weightedT3PassPct = totalT3Tested > 0 ? (totalT3Passed / totalT3Tested * 100) : 0;
    const weightedTotalPassPct = totalSensorsSum > 0 ? (totalOverallPassed / totalSensorsSum * 100) : 0;

    // Generate table rows for each job
    const jobRows = jobsToShow.map(job => `
        <tr>
            <td>${job.jobNumber}</td>
            <td>${job.totalSensors}</td>
            <td>${job.t1PassPct.toFixed(1)}% <span class="count">(${job.t1Passed}/${job.t1Total})</span></td>
            <td>${job.t2PassPct.toFixed(1)}% <span class="count">(${job.t2Passed}/${job.t2Total})</span></td>
            <td>${job.t3PassPct.toFixed(1)}% <span class="count">(${job.t3Passed}/${job.t3Total})</span></td>
            <td>${job.totalPassPct.toFixed(1)}% <span class="count">(${job.totalPassed}/${job.totalSensors})</span></td>
        </tr>
    `).join('');

    const reportHTML = `
        <html><head><title>Job Analysis Comparison</title>
        <style>
            body{font-family:Arial,sans-serif;padding:20px}
            h1{color:#667eea;border-bottom:3px solid #667eea;padding-bottom:10px}
            table{width:100%;border-collapse:collapse;margin:20px 0}
            th,td{padding:10px;border:1px solid #ddd;text-align:left}
            th{background:#f5f5f5}
            .cumulative-row{border-top:3px solid #333;font-weight:bold;background:#f9f9f9}
            .pass{color:#10b981}
            .fail{color:#ef4444}
            .count{font-size:0.75em;color:#888}
        </style>
        </head><body>
        <h1>Job Analysis Comparison</h1>
        <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
        <table>
            <tr>
                <th>Job #</th>
                <th>Total #</th>
                <th>T1 Pass %</th>
                <th>T2 Pass %</th>
                <th>T3 Pass %</th>
                <th>Total Pass %</th>
            </tr>
            ${jobRows}
            <tr class="cumulative-row">
                <td>Overall:</td>
                <td>${totalSensorsSum}</td>
                <td>${weightedT1PassPct.toFixed(1)}% <span class="count">(${totalT1Passed}/${totalT1Tested})</span></td>
                <td>${weightedT2PassPct.toFixed(1)}% <span class="count">(${totalT2Passed}/${totalT2Tested})</span></td>
                <td>${weightedT3PassPct.toFixed(1)}% <span class="count">(${totalT3Passed}/${totalT3Tested})</span></td>
                <td>${weightedTotalPassPct.toFixed(1)}% <span class="count">(${totalOverallPassed}/${totalSensorsSum})</span></td>
            </tr>
        </table>
        </body></html>
    `;

    const win = window.open('', '', 'width=900,height=700');
    win.document.write(reportHTML);
    win.document.close();
    win.print();
}

function showFailedReport() {
    if (!analysisResults) return;
    
    const failed = analysisResults.filter(r => ['FL', 'FH', 'OT-', 'FAIL'].includes(r['Pass/Fail']));
    
    if (failed.length === 0) {
        alert('✅ No failed sensors found!');
        return;
    }
    
    const rows = failed.map(r => `<tr><td>${r['Serial Number']}</td><td>${r['Channel']}</td><td>${r['Pass/Fail']}</td><td>${r['120s(MaxΔ)'].toFixed(4)}</td></tr>`).join('');
    
    const reportHTML = `
        <html><head><title>Failed Sensors - Job ${currentJob}</title>
        <style>body{font-family:Arial,sans-serif;padding:20px}h1{color:#ef4444;border-bottom:3px solid #ef4444;padding-bottom:10px}table{width:100%;border-collapse:collapse}th,td{padding:10px;border:1px solid #ddd;text-align:left}th{background:#fee2e2;color:#991b1b}</style>
        </head><body>
        <h1>Failed Sensors Report - Job ${currentJob}</h1>
        <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
        <p><strong>Total Failed:</strong> ${failed.length} sensors</p>
        <table><tr><th>Serial Number</th><th>Channel</th><th>Status</th><th>Max Δ</th></tr>${rows}</table>
        </body></html>
    `;
    
    const win = window.open('', '', 'width=800,height=600');
    win.document.write(reportHTML);
    win.document.close();
    win.print();
}

// ============================================================
// EVENT HANDLERS
// ============================================================
