"use strict";

/* The Hacker's Diet — trend tracker
 * Weights are stored canonically in KILOGRAMS. Display/input converts per unit setting.
 * Trend = 10% exponentially-smoothed moving average (John Walker):
 *   A_d = A_{d-1} + 0.1 * (M_d - A_{d-1}),  seeded with the first weigh-in.
 */

const KG_PER_LB = 0.45359237;
const KCAL_PER_LB = 3500;
const SMOOTH = 0.1;
const STORE_KEY = "hackdiet.v1";

const state = {
  entries: [],          // [{date:'YYYY-MM-DD', kg:Number}]
  unit: "kg",           // 'kg' | 'lb'
  goalKg: null,
  heightCm: null,       // for BMI
  range: 30,
};

// BMI category thresholds (kg/m^2)
const BMI_HEALTHY_MIN = 18.5;
const BMI_HEALTHY_MAX = 24.9;

/* ---------- persistence ---------- */
function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
    if (Array.isArray(raw.entries)) state.entries = raw.entries;
    if (raw.unit === "kg" || raw.unit === "lb") state.unit = raw.unit;
    state.goalKg = typeof raw.goalKg === "number" ? raw.goalKg : null;
    state.heightCm = typeof raw.heightCm === "number" ? raw.heightCm : null;
  } catch (e) { /* ignore corrupt data */ }
  sortEntries();
}
function save() {
  localStorage.setItem(STORE_KEY, JSON.stringify({
    entries: state.entries, unit: state.unit, goalKg: state.goalKg, heightCm: state.heightCm,
  }));
}
function sortEntries() { state.entries.sort((a, b) => a.date.localeCompare(b.date)); }

/* ---------- units ---------- */
const toDisplay = (kg) => state.unit === "lb" ? kg / KG_PER_LB : kg;
const fromDisplay = (v) => state.unit === "lb" ? v * KG_PER_LB : v;
const fmt = (kg, dp = 2) => toDisplay(kg).toFixed(dp);
const u = () => state.unit;

/* ---------- BMI ---------- */
const bmiFor = (kg) => {
  if (!state.heightCm) return null;
  const m = state.heightCm / 100;
  return kg / (m * m);
};
function bmiCategory(bmi) {
  if (bmi < BMI_HEALTHY_MIN) return { label: "Underweight", cls: "" };
  if (bmi < 25) return { label: "Healthy", cls: "down" };
  if (bmi < 30) return { label: "Overweight", cls: "up" };
  return { label: "Obese", cls: "up" };
}
// Healthy weight range (kg) for the current height.
function healthyRangeKg() {
  if (!state.heightCm) return null;
  const m = state.heightCm / 100;
  return { min: BMI_HEALTHY_MIN * m * m, max: BMI_HEALTHY_MAX * m * m };
}

/* ---------- trend computation ---------- */
// Returns parallel array of trend values (kg) aligned to sorted entries.
function computeTrend() {
  const t = [];
  let prev = null;
  for (const e of state.entries) {
    prev = prev === null ? e.kg : prev + SMOOTH * (e.kg - prev);
    t.push(prev);
  }
  return t;
}

// Average daily rate of change of the trend (kg/day) over the last N days of data.
// Uses first vs last trend value across the available window, per the book's method.
function trendRate(days) {
  const n = state.entries.length;
  if (n < 2) return null;
  const trend = computeTrend();
  let startIdx = 0;
  if (days > 0) {
    const cutoff = dateMinusDays(state.entries[n - 1].date, days);
    while (startIdx < n - 1 && state.entries[startIdx].date < cutoff) startIdx++;
  }
  if (startIdx >= n - 1) startIdx = 0;
  const d0 = state.entries[startIdx].date, d1 = state.entries[n - 1].date;
  const spanDays = dayDiff(d0, d1);
  if (spanDays <= 0) return null;
  return (trend[n - 1] - trend[startIdx]) / spanDays; // kg/day
}

/* ---------- date helpers ---------- */
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function dayDiff(a, b) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}
function dateMinusDays(dateStr, days) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function prettyDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "2-digit" });
}

/* ---------- rendering ---------- */
function renderAll() {
  renderUnitLabels();
  renderLog();
  renderHeader();
  renderStats();
  renderHealthyBox();
  drawChart();
}

function renderHealthyBox() {
  const box = document.getElementById("healthyBox");
  const text = document.getElementById("healthyText");
  const hr = healthyRangeKg();
  if (!hr) { box.hidden = true; return; }
  box.hidden = false;
  text.innerHTML = `Healthy weight for your height: <strong>${fmt(hr.min)}–${fmt(hr.max)} ${u()}</strong> ` +
    `(BMI ${BMI_HEALTHY_MIN}–${BMI_HEALTHY_MAX}).`;
}

function renderUnitLabels() {
  document.getElementById("unitLabel").textContent = u();
  document.querySelectorAll(".unitLabel").forEach((el) => (el.textContent = u()));
}

function renderHeader() {
  const el = document.getElementById("headerTrend");
  if (!state.entries.length) { el.innerHTML = "Log your first weigh-in &rarr;"; return; }
  const trend = computeTrend();
  const cur = trend[trend.length - 1];
  el.innerHTML = `Trend <strong>${fmt(cur)} ${u()}</strong>`;
}

function renderLog() {
  const list = document.getElementById("entryList");
  const empty = document.getElementById("emptyLog");
  list.innerHTML = "";
  if (!state.entries.length) { empty.hidden = false; return; }
  empty.hidden = true;
  const trend = computeTrend();
  // newest first
  for (let i = state.entries.length - 1; i >= 0; i--) {
    const e = state.entries[i];
    const li = document.createElement("li");
    li.innerHTML =
      `<span class="e-date">${prettyDate(e.date)}</span>` +
      `<span class="e-weight">${fmt(e.kg)} ${u()}</span>` +
      `<span class="e-trend">trend ${fmt(trend[i])}</span>` +
      `<button class="e-del" aria-label="Delete">&times;</button>`;
    li.querySelector(".e-del").addEventListener("click", () => deleteEntry(e.date));
    list.appendChild(li);
  }
}

function renderStats() {
  const grid = document.getElementById("statsGrid");
  const n = state.entries.length;
  if (n === 0) {
    grid.innerHTML = `<div class="stat" style="grid-column:1/-1"><div class="label">No data yet</div><div class="value sub">Log weigh-ins to see your stats.</div></div>`;
    return;
  }
  const trend = computeTrend();
  const curTrend = trend[n - 1];
  const latest = state.entries[n - 1];
  const ratePerDay = trendRate(state.range || 30); // kg/day over current chart window
  const cards = [];

  cards.push(stat("Current trend", `${fmt(curTrend)} <small>${u()}</small>`));
  cards.push(stat("Latest weigh-in", `${fmt(latest.kg)} <small>${u()}</small>`, prettyDate(latest.date)));

  const bmi = bmiFor(curTrend);
  if (bmi !== null) {
    const cat = bmiCategory(bmi);
    cards.push(stat("Trend BMI", `<span class="${cat.cls}">${bmi.toFixed(2)}</span>`, cat.label));
    const hr = healthyRangeKg();
    if (curTrend > hr.max) {
      cards.push(stat("To healthy", `${fmt(curTrend - hr.max)} <small>${u()}</small>`, `at BMI 24.9 = ${fmt(hr.max)} ${u()}`));
    } else if (curTrend < hr.min) {
      cards.push(stat("To healthy", `+${fmt(hr.min - curTrend)} <small>${u()}</small>`, `at BMI 18.5 = ${fmt(hr.min)} ${u()}`));
    } else {
      cards.push(stat("Healthy range", "✓ in range", `${fmt(hr.min)}–${fmt(hr.max)} ${u()}`));
    }
  } else {
    cards.push(stat("BMI", "—", "set height in settings"));
  }

  if (ratePerDay !== null) {
    const perWeek = ratePerDay * 7;
    const dir = perWeek > 0.0005 ? "up" : perWeek < -0.0005 ? "down" : "";
    const arrow = perWeek > 0.0005 ? "▲" : perWeek < -0.0005 ? "▼" : "→";
    cards.push(stat("Weekly rate",
      `<span class="${dir}">${arrow} ${Math.abs(toDisplay(perWeek)).toFixed(2)} <small>${u()}/wk</small></span>`));

    // calorie balance: kg/day -> lb/day * 3500
    const kcalPerDay = ratePerDay / KG_PER_LB * KCAL_PER_LB;
    const cdir = kcalPerDay > 5 ? "up" : kcalPerDay < -5 ? "down" : "";
    const clabel = kcalPerDay >= 0 ? "surplus" : "deficit";
    cards.push(stat("Daily calories",
      `<span class="${cdir}">${Math.abs(Math.round(kcalPerDay))} <small>kcal</small></span>`, clabel));
  } else {
    cards.push(stat("Weekly rate", "—", "need 2+ days"));
    cards.push(stat("Daily calories", "—", "need 2+ days"));
  }

  if (state.goalKg !== null) {
    const remaining = curTrend - state.goalKg;
    cards.push(stat("To goal", `${(remaining >= 0 ? "" : "+") + fmt(curTrend - state.goalKg)} <small>${u()}</small>`,
      `goal ${fmt(state.goalKg)} ${u()}`));
    // forecast
    if (ratePerDay !== null && Math.abs(ratePerDay) > 1e-6 &&
        Math.sign(ratePerDay) === Math.sign(state.goalKg - curTrend)) {
      const daysOut = Math.abs(remaining / ratePerDay);
      const eta = dateMinusDays(latest.date, -Math.round(daysOut));
      cards.push(stat("Forecast", prettyDate(eta), `~${Math.round(daysOut)} days`));
    } else {
      cards.push(stat("Forecast", "—", "trend not heading to goal"));
    }
  }

  grid.innerHTML = cards.join("");
}

function stat(label, value, sub) {
  return `<div class="stat"><div class="label">${label}</div>` +
    `<div class="value">${value}</div>` +
    (sub ? `<div class="value sub">${sub}</div>` : "") + `</div>`;
}

/* ---------- chart ---------- */
function drawChart() {
  const canvas = document.getElementById("chart");
  const empty = document.getElementById("chartEmpty");
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || 320;
  const cssH = 320;
  canvas.width = cssW * dpr;
  canvas.height = cssH * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  // window of entries
  let data = state.entries;
  if (state.range > 0 && data.length) {
    const cutoff = dateMinusDays(data[data.length - 1].date, state.range);
    data = data.filter((e) => e.date >= cutoff);
  }
  if (data.length < 1) { empty.hidden = false; canvas.style.display = "none"; return; }
  empty.hidden = true; canvas.style.display = "block";

  // trend aligned to full series; slice the tail matching window
  const fullTrend = computeTrend();
  const trend = fullTrend.slice(fullTrend.length - data.length);

  const style = getComputedStyle(document.documentElement);
  const cAccent = style.getPropertyValue("--accent").trim() || "#4fd1c5";
  const cWeight = style.getPropertyValue("--weight").trim() || "#6b7280";
  const cGoal = style.getPropertyValue("--goal").trim() || "#f6ad55";
  const cMuted = style.getPropertyValue("--muted").trim() || "#9a9aa8";

  const padL = 42, padR = 12, padT = 14, padB = 24;
  const plotW = cssW - padL - padR;
  const plotH = cssH - padT - padB;

  // value range (in display units)
  let vals = [];
  data.forEach((e) => vals.push(toDisplay(e.kg)));
  trend.forEach((t) => vals.push(toDisplay(t)));
  if (state.goalKg !== null) vals.push(toDisplay(state.goalKg));
  const healthy = healthyRangeKg();
  if (healthy) vals.push(toDisplay(healthy.max));
  let min = Math.min(...vals), max = Math.max(...vals);
  if (min === max) { min -= 1; max += 1; }
  const pad = (max - min) * 0.12;
  min -= pad; max += pad;

  const t0 = Date.parse(data[0].date);
  const t1 = Date.parse(data[data.length - 1].date);
  const tSpan = Math.max(1, t1 - t0);
  const x = (dateStr) => padL + ((Date.parse(dateStr) - t0) / tSpan) * plotW;
  const y = (val) => padT + (1 - (val - min) / (max - min)) * plotH;

  // healthy BMI band
  const legendHealthy = document.getElementById("legendHealthy");
  if (healthy) {
    const yTop = y(toDisplay(healthy.max));
    const yBot = y(toDisplay(healthy.min));
    const top = Math.max(padT, Math.min(yTop, yBot));
    const bot = Math.min(padT + plotH, Math.max(yTop, yBot));
    if (bot > top) {
      ctx.fillStyle = "rgba(72,187,120,0.13)";
      ctx.fillRect(padL, top, plotW, bot - top);
    }
    if (legendHealthy) legendHealthy.hidden = false;
  } else if (legendHealthy) {
    legendHealthy.hidden = true;
  }

  // gridlines + y labels
  ctx.font = "11px -apple-system, system-ui, sans-serif";
  ctx.textBaseline = "middle";
  ctx.strokeStyle = cMuted + "33";
  ctx.fillStyle = cMuted;
  ctx.lineWidth = 1;
  const ticks = 4;
  for (let i = 0; i <= ticks; i++) {
    const val = min + (max - min) * (i / ticks);
    const yy = y(val);
    ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(cssW - padR, yy); ctx.stroke();
    ctx.textAlign = "right";
    ctx.fillText(val.toFixed(1), padL - 6, yy);
  }

  // x labels (start + end)
  ctx.textAlign = "left";
  ctx.fillText(prettyDate(data[0].date), padL, cssH - 10);
  ctx.textAlign = "right";
  ctx.fillText(prettyDate(data[data.length - 1].date), cssW - padR, cssH - 10);

  // goal line
  if (state.goalKg !== null) {
    const gy = y(toDisplay(state.goalKg));
    ctx.strokeStyle = cGoal;
    ctx.setLineDash([5, 5]);
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(padL, gy); ctx.lineTo(cssW - padR, gy); ctx.stroke();
    ctx.setLineDash([]);
  }

  // daily weight dots
  ctx.fillStyle = cWeight;
  for (const e of data) {
    ctx.beginPath();
    ctx.arc(x(e.date), y(toDisplay(e.kg)), 2.6, 0, Math.PI * 2);
    ctx.fill();
  }

  // trend line
  ctx.strokeStyle = cAccent;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = "round";
  ctx.beginPath();
  data.forEach((e, i) => {
    const px = x(e.date), py = y(toDisplay(trend[i]));
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  });
  ctx.stroke();
}

/* ---------- mutations ---------- */
function addEntry(dateStr, displayWeight) {
  const kg = fromDisplay(displayWeight);
  const existing = state.entries.find((e) => e.date === dateStr);
  if (existing) existing.kg = kg;
  else state.entries.push({ date: dateStr, kg });
  sortEntries();
  save();
  renderAll();
}
function deleteEntry(dateStr) {
  state.entries = state.entries.filter((e) => e.date !== dateStr);
  save();
  renderAll();
}

/* ---------- events / wiring ---------- */
function initUI() {
  document.getElementById("entryDate").value = todayStr();

  document.getElementById("entryForm").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const date = document.getElementById("entryDate").value || todayStr();
    const w = parseFloat(document.getElementById("entryWeight").value);
    if (!isFinite(w) || w <= 0) return;
    addEntry(date, w);
    document.getElementById("entryWeight").value = "";
    document.getElementById("entryWeight").blur();
    switchView("chart");
  });

  // tabs
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => switchView(tab.dataset.view));
  });

  // chart range toggle
  document.getElementById("rangeToggle").addEventListener("click", (ev) => {
    const b = ev.target.closest("button"); if (!b) return;
    state.range = parseInt(b.dataset.range, 10);
    document.querySelectorAll("#rangeToggle button").forEach((x) => x.classList.toggle("active", x === b));
    drawChart();
    renderStats();
  });

  // settings
  const unitSel = document.getElementById("unitSelect");
  unitSel.value = state.unit;
  unitSel.addEventListener("change", () => {
    state.unit = unitSel.value;
    save();
    syncGoalInput();
    renderAll();
  });

  const goalInput = document.getElementById("goalInput");
  syncGoalInput();
  goalInput.addEventListener("change", () => {
    const v = parseFloat(goalInput.value);
    state.goalKg = isFinite(v) && v > 0 ? fromDisplay(v) : null;
    save();
    renderAll();
  });

  const heightInput = document.getElementById("heightInput");
  heightInput.value = state.heightCm !== null ? state.heightCm : "";
  heightInput.addEventListener("change", () => {
    const v = parseFloat(heightInput.value);
    state.heightCm = isFinite(v) && v > 0 ? v : null;
    save();
    renderAll();
  });
  document.getElementById("healthyGoalBtn").addEventListener("click", () => {
    const hr = healthyRangeKg();
    if (!hr) return;
    state.goalKg = hr.max;
    save();
    syncGoalInput();
    renderAll();
  });

  // data tools
  document.getElementById("exportBtn").addEventListener("click", exportData);
  document.getElementById("importBtn").addEventListener("click", () => document.getElementById("importFile").click());
  document.getElementById("importFile").addEventListener("change", importData);
  document.getElementById("clearBtn").addEventListener("click", () => {
    if (confirm("Erase ALL weigh-ins and settings on this device? This cannot be undone.")) {
      localStorage.removeItem(STORE_KEY);
      state.entries = []; state.goalKg = null; state.heightCm = null;
      document.getElementById("heightInput").value = "";
      save(); syncGoalInput(); renderAll();
    }
  });

  window.addEventListener("resize", drawChart);

  // install hint
  window.addEventListener("beforeinstallprompt", () => {
    document.getElementById("installHint").hidden = false;
  });
}

function syncGoalInput() {
  const goalInput = document.getElementById("goalInput");
  goalInput.value = state.goalKg !== null ? fmt(state.goalKg) : "";
}

function switchView(view) {
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  document.getElementById("view-" + view).classList.add("active");
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.view === view));
  if (view === "chart") drawChart();
  if (view === "stats") renderStats();
  window.scrollTo(0, 0);
}

function exportData() {
  const blob = new Blob([JSON.stringify({
    entries: state.entries, unit: state.unit, goalKg: state.goalKg, heightCm: state.heightCm,
    exportedAt: new Date().toISOString(), app: "hackers-diet",
  }, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `hackers-diet-${todayStr()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function importData(ev) {
  const file = ev.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!Array.isArray(data.entries)) throw new Error("bad file");
      const clean = data.entries
        .filter((e) => e && typeof e.date === "string" && isFinite(e.kg))
        .map((e) => ({ date: e.date, kg: +e.kg }));
      if (!confirm(`Import ${clean.length} weigh-ins? This replaces your current data.`)) return;
      state.entries = clean;
      if (data.unit === "kg" || data.unit === "lb") state.unit = data.unit;
      state.goalKg = typeof data.goalKg === "number" ? data.goalKg : state.goalKg;
      state.heightCm = typeof data.heightCm === "number" ? data.heightCm : state.heightCm;
      sortEntries(); save();
      document.getElementById("unitSelect").value = state.unit;
      document.getElementById("heightInput").value = state.heightCm !== null ? state.heightCm : "";
      syncGoalInput(); renderAll();
      alert("Import complete.");
    } catch (e) {
      alert("Could not read that file — is it a Hacker's Diet export?");
    }
    ev.target.value = "";
  };
  reader.readAsText(file);
}

/* ---------- boot ---------- */
load();
initUI();
renderAll();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
