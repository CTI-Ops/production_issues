# Plan: Differentiate Aggregated & Trend Modes

## Problem
Aggregated Mode (6-15 jobs) and Trend Mode (16+ jobs) are nearly identical — same metrics card, same table, same anomaly logic, and most charts shared. They need distinct analytical purposes.

## Design Philosophy
- **Aggregated Mode** = "How is this group performing?" → **Distributions, summaries, subgroup comparisons**
- **Trend Mode** = "Where is this process heading?" → **Temporal patterns, process control, shift detection**

---

## 1. Mode Override Dropdown

**Add manual mode override** next to the tier badge when 6+ jobs are selected.

- Default: Auto (switches at threshold 16)
- Options: `Auto | Aggregated | Trend`
- Store effective tier and pass to all render functions

**Files**: `Sensor-QC-Analysis.html` (add `<select id="modeOverride">`), `sensor-qc-ui.js` (renderJobChips wires it up), `sensor-qc-app.js` (reads effective tier before calling renderers)

---

## 2. Metrics Section (`sensor-qc-ui.js:442-471`)

Currently both modes show 4 identical aggregate cards. Differentiate:

**Aggregated Mode** metrics:
| Card | Content |
|------|---------|
| Total Jobs | count |
| Total Sensors | count |
| Avg Pass Rate | mean %, median as delta |
| Pass Rate Spread | min–max%, std dev as delta |
| Distribution Shape | Skew direction + IQR range |

- NEW: **Distribution Shape** card — "Left-skewed" / "Right-skewed" / "Symmetric" + IQR value. Helps operators quickly see if most jobs cluster high or if there are low-performing outliers dragging the average.

**Trend Mode** metrics:
| Card | Content |
|------|---------|
| Total Jobs | count |
| Total Sensors | count |
| Mean Pass Rate | mean %, median as delta |
| Pass Rate Range | min–max%, std dev as delta |
| Trend Direction | Improving/Declining/Stable + slope |
| Process Stability | Cv-based: Stable (<5%) / Moderate (5-10%) / Unstable (>10%) |

- KEEP: Trend Direction (already exists)
- NEW: **Process Stability** card — Coefficient of Variation (σ/μ). Gives a quick read on whether the process is in statistical control.

---

## 3. Table Section (`sensor-qc-ui.js:546-586`)

Currently identical for both modes (job-level summary). Differentiate:

**Aggregated Mode** — Ranked summary:
- Add **Rank** column (#1, #2...) sorted by pass rate descending
- Add **Quartile** column with color-coded badge (Q1 green, Q2-Q3 neutral, Q4 red)
- Subtle row background tinting: top quartile greenish, bottom quartile reddish
- Footer: Overall + Median + Std Dev

**Trend Mode** — Sequential with deltas:
- Add **Δ Pass Rate** column: change vs previous job ("+2.3%" green, "-1.5%" red)
- Add **Run** column: consecutive direction indicator ("↑3" = 3 consecutive improvements, "↓2" = 2 declines)
- Add **Flag** column: warning icon for outliers (>2σ) or 3+ consecutive declines
- Sort by job number (sequential) — NOT by pass rate
- Footer: Overall + Trend slope + # flagged

---

## 4. Charts Section (`sensor-qc-charts.js:747-1103`)

4 chart slots. This is the biggest differentiation area.

### Chart 1 — Top Left (`trendChart`)

**Aggregated Mode** → Dot Plot with Statistical Markers:
- Each job = dot on Y axis (pass rate), X = job index (unordered)
- Horizontal reference lines: mean (solid), median (dashed), Q1/Q3 (light bands)
- Dots colored by quartile: green (Q1), blue (Q2-Q3), red (Q4)
- Title: "Pass Rate Distribution by Job"
- Purpose: Emphasize spread and clustering, not temporal order

**Trend Mode** → Enhanced Trend Line (keep + improve):
- Keep: 2σ band, outlier markers (red triangles), moving average, per-test lines
- NEW: Linear regression overlay (thin dashed line) showing overall direction
- NEW: If ≥20 jobs, detect and mark "change points" where trend shifts (compare rolling window means)
- Title: "Pass Rate Trend (2σ Outlier Detection)"

### Chart 2 — Top Right (`distributionChart`)

**Aggregated Mode** → Enhanced Histogram:
- Keep 10%-bin pass rate histogram
- NEW: Overlay a normal distribution curve (computed from mean/stdDev) as a line
- NEW: Vertical dashed lines for mean (blue) and median (green)
- Bin colors: green (≥80%), yellow (50-80%), red (<50%)
- Title: "Pass Rate Distribution"

**Trend Mode** → Heatmap (keep + improve):
- Keep per-job × per-test heatmap table
- NEW: Column header arrows showing per-test trend direction (comparing first-third vs last-third of jobs)
- Title: "Pass Rate Heatmap"

### Chart 3 — Bottom Left (`statusByTestChart`)

**Aggregated Mode** → Failure Type Breakdown:
- Grouped bar chart: X = failure types (FL, FH, OT-, TT, OT+, FAIL), grouped by test (T1/T2/T3)
- Y = count or % of sensors
- Purpose: See which failure types dominate and whether they differ by test
- Title: "Failure Breakdown by Type & Test"

**Trend Mode** → Failure Rate Trend (stacked area):
- Convert current stacked bar → stacked area chart for temporal flow
- X = job numbers in order, Y = fail rate % stacked by type
- Shows how the failure mix evolves over time
- Title: "Failure Rate Trend by Type"

### Chart 4 — Bottom Right (`pieChart`)

**Aggregated Mode** → Doughnut: Overall Status Distribution:
- Doughnut chart of overall status mix (PASS, FL, FH, OT-, TT, OT+, BL, FAIL)
- Center text: total sensor count
- Below: keep status summary list
- Title: "Overall Status Mix"

**Trend Mode** → Failure Composition Trend (keep as-is):
- Stacked area: failure mix as % of total failures over time
- Already well-differentiated from aggregated — keep current implementation
- Title: "Failure Composition Trend"

---

## 5. Anomalies Section (`sensor-qc-ui.js:590-636`)

Currently identical. Differentiate:

**Aggregated Mode** — Group anomalies:
- KEEP: High fail rate jobs (>20%), statistical outliers (>2σ)
- NEW: **Bimodal warning** — if IQR > 15% AND gap in middle of distribution, flag "Bimodal distribution detected — possible batch issue"
- NEW: **Weak test detection** — if any test's average is 15%+ below others across the group, flag it

**Trend Mode** — Process anomalies:
- KEEP: High fail rate jobs, statistical outliers
- NEW: **Consecutive decline** warning — 3+ consecutive declining pass rates
- NEW: **Recent degradation** — if last 3 jobs' mean is >5% below overall mean
- NEW: **Shift detection** — if moving average crosses overall mean downward, flag "Process shift detected at Job X"

---

## Implementation Order

1. **Mode override dropdown** — UI plumbing (everything else depends on effective tier)
2. **Metrics differentiation** — small, self-contained
3. **Table differentiation** — moderate (new columns)
4. **Anomalies differentiation** — moderate (new detection logic in core)
5. **Charts differentiation** — largest change (rewire rendering per mode)

## Files Modified
| File | Changes |
|------|---------|
| `Sensor-QC-Analysis.html` | Add mode override dropdown element |
| `sensor-qc-app.js` | Read effective tier, pass to renderers |
| `sensor-qc-core.js` | Add helpers: quartile calc, Cv, skewness, change-point detection, run-length |
| `sensor-qc-ui.js` | Metrics, table, anomalies — all tier-branching logic |
| `sensor-qc-charts.js` | All chart rendering — separate `many` and `bulk` code paths |
| `sensor-qc.css` | New styles: quartile badges, delta colors, rank column, dot plot, dropdown |
