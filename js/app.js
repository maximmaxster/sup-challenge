// ===========================
// SUP Challenge — app.js
// ===========================

let athlete1Data = null;
let athlete2Data = null;
let charts = {};
let currentRange = { speed: 'week', distance: 'week', hr: 'week', dps: 'week' };

// ===== GITHUB API SAVE =====
const GH_REPO  = 'maximmaxster/sup-challenge';
const GH_FILES = { 1: 'data/athlete1.json', 2: 'data/athlete2.json' };

function ghToken() { return localStorage.getItem('gh_token') || ''; }

async function saveAthleteToGitHub(athleteNum) {
  const token = ghToken();
  if (!token) { promptGhToken(); return false; }

  const path = GH_FILES[athleteNum];
  const data = athleteNum === 1 ? athlete1Data : athlete2Data;
  const content = JSON.stringify(data, null, 2);
  const encoded = btoa(unescape(encodeURIComponent(content)));

  try {
    // 1. Get current SHA
    const metaRes = await fetch(`https://api.github.com/repos/${GH_REPO}/contents/${path}`, {
      headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' }
    });
    if (!metaRes.ok) throw new Error(`GitHub auth failed (${metaRes.status})`);
    const meta = await metaRes.json();

    // 2. PUT updated file
    const putRes = await fetch(`https://api.github.com/repos/${GH_REPO}/contents/${path}`, {
      method: 'PUT',
      headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: `update races via UI`, content: encoded, sha: meta.sha })
    });
    if (!putRes.ok) throw new Error(`Save failed (${putRes.status})`);
    return true;
  } catch (err) {
    console.error('GitHub save error:', err);
    showSaveStatus('error', err.message);
    return false;
  }
}

function promptGhToken() {
  const t = prompt('הזן GitHub Personal Access Token (נשמר רק בדפדפן שלך):');
  if (t && t.trim()) {
    localStorage.setItem('gh_token', t.trim());
    showSaveStatus('info', 'Token נשמר. נסה שוב.');
  }
}

function showSaveStatus(type, msg) {
  let el = document.getElementById('gh-save-status');
  if (!el) {
    el = document.createElement('div');
    el.id = 'gh-save-status';
    el.style.cssText = 'position:fixed;bottom:1.5rem;left:50%;transform:translateX(-50%);padding:.6rem 1.4rem;border-radius:999px;font-size:.9rem;font-weight:600;z-index:9999;transition:opacity .4s';
    document.body.appendChild(el);
  }
  const colors = { success: '#00D4FF', error: '#FF1744', info: '#FF8C00', saving: '#aaa' };
  el.style.background = colors[type] || '#aaa';
  el.style.color = type === 'success' || type === 'info' ? '#000' : '#fff';
  el.style.opacity = '1';
  el.textContent = msg;
  if (type !== 'saving') setTimeout(() => { el.style.opacity = '0'; }, 3500);
}

const COLORS = {
  cyan: '#00D4FF',
  orange: '#FF6B35',
  green: '#00E676',
  red: '#FF1744',
  bg: '#1A2744',
  grid: 'rgba(136,153,187,0.1)',
};

// ===== AGE HELPER =====
function calcAge(dobStr) {
  // dobStr: "DD.MM.YYYY"
  if (!dobStr) return '—';
  const [d, m, y] = dobStr.split('.').map(Number);
  const dob = new Date(y, m - 1, d);
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  if (now.getMonth() < dob.getMonth() || (now.getMonth() === dob.getMonth() && now.getDate() < dob.getDate())) age--;
  return age;
}

function renderAthleteBio(prefix, data) {
  const el = id => document.getElementById(`${prefix}-${id}`);
  const bday = data.birthdate || data.dob;
  if (el('dob')) el('dob').textContent = bday || '—';
  if (el('age')) el('age').textContent = bday ? calcAge(bday) : '—';
  if (el('sup-start')) el('sup-start').textContent = data.sup_start || '—';
}

// ===== DATE HELPERS (DD.MM.YYYY format) =====
function parseDMY(str) {
  // Accepts DD.MM.YYYY or YYYY-MM-DD
  if (!str) return new Date(0);
  if (str.includes('-')) {
    return new Date(str);
  }
  const [d, m, y] = str.split('.');
  return new Date(+y, +m - 1, +d);
}

function formatShort(str) {
  // Return DD/MM for chart axis
  if (!str) return '';
  if (str.includes('.')) {
    const [d, m] = str.split('.');
    return `${d}/${m}`;
  }
  const d = new Date(str);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

// ===== LOAD DATA =====
async function loadData() {
  try {
    const v = Date.now();
    const [r1, r2] = await Promise.all([
      fetch(`data/athlete1.json?v=${v}`),
      fetch(`data/athlete2.json?v=${v}`),
    ]);
    athlete1Data = await r1.json();
    athlete2Data = await r2.json();
  } catch (e) {
    console.error('Error loading data:', e);
    athlete1Data = { name: 'מקסים רפופורט', profile_image: '', workouts: [] };
    athlete2Data = { name: 'ויקטור מורטוב', profile_image: '', workouts: [] };
  }

  document.getElementById('athlete1-name').textContent = athlete1Data.name;
  document.getElementById('athlete2-name').textContent = athlete2Data.name;
  document.getElementById('athlete1-name-table').textContent = athlete1Data.name;
  document.getElementById('athlete2-name-table').textContent = athlete2Data.name;

  // Update legend names in charts
  ['speed','dist','hr','dps'].forEach(k => {
    const el1 = document.getElementById(`legend-${k}-1`);
    const el2 = document.getElementById(`legend-${k}-2`);
    if (el1) el1.textContent = athlete1Data.name;
    if (el2) el2.textContent = athlete2Data.name;
  });

  document.querySelectorAll('.filter-athlete').forEach(sel => {
    sel.innerHTML = `<option value="all">כל החותרים</option>
      <option value="1">${athlete1Data.name}</option>
      <option value="2">${athlete2Data.name}</option>`;
  });

  renderAll();
  hideLoading();
}

function hideLoading() {
  setTimeout(() => {
    document.getElementById('loading').classList.add('hidden');
  }, 1600);
}

// ===== STATS HELPERS =====
function getWorkoutsInRange(workouts, days) {
  if (!days) return workouts;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return workouts.filter(w => parseDMY(w.date) >= cutoff);
}

// Filter by CURRENT calendar month (auto-updates every month)
function getWorkoutsCurrentMonth(workouts) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-based
  return workouts.filter(w => {
    if (!w.distance || w.distance === 0) return false;
    const d = parseDMY(w.date);
    return d.getFullYear() === year && d.getMonth() === month;
  });
}

function getMonthName() {
  const months = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
  return months[new Date().getMonth()];
}

function avg(arr, key) {
  const valid = arr.filter(w => w[key] && w[key] > 0);
  if (!valid.length) return 0;
  return valid.reduce((s, w) => s + (w[key] || 0), 0) / valid.length;
}

function sum(arr, key) {
  return arr.reduce((s, w) => s + (w[key] || 0), 0);
}

function maxVal(arr, key) {
  if (!arr.length) return 0;
  return Math.max(...arr.map(w => w[key] || 0));
}

function hmsToSec(t) {
  if (!t || t === '0:00') return 0;
  const parts = String(t).split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

// ===== RENDER ALL =====
function renderAll() {
  renderAthleteCards();
  renderComparisonTable();
  renderCharts();
  populateYearFilter();
  renderWorkoutsTable();
  renderAnnualLibrary([...(athlete1Data?.workouts||[]), ...(athlete2Data?.workouts||[])]);
  renderProgress();
  renderRaces(1);
}

// ===== ATHLETE CARDS =====
function renderAthleteCards() {
  const w1 = getWorkoutsCurrentMonth(athlete1Data.workouts);
  const w2 = getWorkoutsCurrentMonth(athlete2Data.workouts);

  // Update period label (month + year) above stats
  const now = new Date();
  const periodLabel = `סיכום חודש ${getMonthName()} ${now.getFullYear()}`;
  const p1 = document.getElementById('a1-period');
  const p2 = document.getElementById('a2-period');
  if (p1) p1.textContent = periodLabel;
  if (p2) p2.textContent = periodLabel;

  setAthleteWeekStats('a1', w1, sum(w1, 'distance'));
  setAthleteWeekStats('a2', w2, sum(w2, 'distance'));

  renderAthleteBio('a1', athlete1Data);
  renderAthleteBio('a2', athlete2Data);

  tryLoadAvatar('athlete1-avatar', athlete1Data.profile_image, '🏄');
  tryLoadAvatar('athlete2-avatar', athlete2Data.profile_image, '🏄');
}

function setAthleteWeekStats(prefix, workouts, dist) {
  const realWorkouts = workouts.filter(w => w.distance > 0);
  document.getElementById(`${prefix}-distance`).textContent = dist.toFixed(1) + ' ק"מ';
  document.getElementById(`${prefix}-sessions`).textContent = realWorkouts.length;
  const topSpeed = maxVal(workouts, 'avg_speed');
  document.getElementById(`${prefix}-maxspeed`).textContent = topSpeed ? topSpeed.toFixed(1) + ' קמ"ש' : '—';

  // קוביות סוגי אימון לחודש הנוכחי
  const TYPE_IDS = { 'אירובי': 'aerobic', 'אירובי ארוך': 'long', 'טמפו': 'tempo', 'ספרינטים': 'sprint' };
  const counts = { aerobic: 0, long: 0, tempo: 0, sprint: 0 };
  realWorkouts.forEach(w => { const k = TYPE_IDS[w.type]; if (k) counts[k]++; });
  Object.entries(counts).forEach(([k, v]) => {
    const el = document.getElementById(`${prefix}-t-${k}`);
    if (el) el.textContent = v;
  });
}

const MONTHS_HEB = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
const ANNUAL_TYPES = ['אירובי','אירובי ארוך','טמפו','ספרינטים'];

function renderAnnualLibrary(allWorkouts) {
  const el = document.getElementById('annual-library-table');
  if (!el) return;
  const year = new Date().getFullYear();
  // count per type per month
  const grid = {};
  ANNUAL_TYPES.forEach(t => {
    grid[t] = Array(12).fill(0);
  });
  allWorkouts.forEach(w => {
    if (!w.distance || w.distance === 0) return;
    const d = parseDMY(w.date);
    if (!d || d.getFullYear() !== year) return;
    if (grid[w.type]) grid[w.type][d.getMonth()]++;
  });

  const headerCols = MONTHS_HEB.map(m => `<th class="al-month-hdr">${m}<br><span style="font-size:0.6rem;opacity:.7">${String(year).slice(2)}</span></th>`).join('');
  const rows = ANNUAL_TYPES.map(t => {
    const total = grid[t].reduce((a, b) => a + b, 0);
    const cells = grid[t].map(c => `<td class="${c === 0 ? 'al-zero' : 'al-val'}">${c}</td>`).join('');
    return `<tr><td class="al-type">${t}</td>${cells}<td class="al-total">${total}</td></tr>`;
  }).join('');

  // total row (sum across all types per month)
  const monthTotals = Array(12).fill(0);
  ANNUAL_TYPES.forEach(t => grid[t].forEach((c, i) => { monthTotals[i] += c; }));
  const grandTotal = monthTotals.reduce((a, b) => a + b, 0);
  const totalCells = monthTotals.map(c => `<td class="${c === 0 ? 'al-zero' : 'al-val'} al-sum-cell">${c}</td>`).join('');
  const totalRow = `<tr class="al-total-row"><td class="al-type al-sum-lbl">סיכום</td>${totalCells}<td class="al-total al-sum-cell">${grandTotal}</td></tr>`;

  el.innerHTML = `
    <table class="annual-library">
      <thead><tr>
        <th class="al-type-hdr">סוג אימון</th>
        ${headerCols}
        <th class="al-total-hdr">סה"כ</th>
      </tr></thead>
      <tbody>${rows}${totalRow}</tbody>
    </table>`;
}

function tryLoadAvatar(id, src, fallback) {
  const el = document.getElementById(id);
  if (!src) { el.innerHTML = `<div class="avatar-placeholder">${fallback}</div>`; return; }
  const img = new Image();
  img.onload = () => { el.innerHTML = `<img src="${src}" alt="avatar" class="avatar-img">`; };
  img.onerror = () => { el.innerHTML = `<div class="avatar-placeholder">${fallback}</div>`; };
  img.src = src;
}

// ===== LAST WORKOUT COMPARISON =====
function renderComparisonTable() {
  const lastDate = athlete1Data.workouts
    .filter(w => w.distance > 0)
    .sort((a, b) => parseDMY(b.date) - parseDMY(a.date))[0]?.date || '';

  const lw1 = athlete1Data.workouts.find(w => w.date === lastDate) || {};
  const lw2 = athlete2Data.workouts.find(w => w.date === lastDate && w.distance > 0) || {};

  const typeEl = document.getElementById('last-workout-type');
  const dateEl = document.getElementById('last-workout-date');
  if (typeEl) typeEl.textContent = lw1.type || '';
  if (dateEl) dateEl.textContent = lastDate || '';

  const metrics = [
    { label: 'מרחק', fmt: v => v ? v.toFixed(1) + ' ק"מ' : '—', num: w => w.distance || 0 },
    { label: 'זמן',  fmt: v => v || '—', num: w => 0, raw: w => w.duration || '' },
    { label: 'מהירות', fmt: v => v ? v.toFixed(1) : '—', num: w => w.avg_speed || 0 },
    { label: 'דופק', fmt: v => v ? v + '' : '—', num: w => w.avg_hr || 0, lower: true },
    { label: 'SPM',  fmt: v => v ? v + '' : '—', num: w => w.spm || 0 },
    { label: 'DPS',  fmt: v => v ? v.toFixed(2) : '—', num: w => w.dps || 0 },
    { label: 'Z3',   fmt: v => v && v !== '0:00' ? v : '—', num: w => 0, raw: w => w.z3 || '' },
    { label: 'Z4',   fmt: v => v && v !== '0:00' ? v : '—', num: w => 0, raw: w => w.z4 || '' },
    { label: 'Z5',   fmt: v => v && v !== '0:00' ? v : '—', num: w => 0, raw: w => w.z5 || '' },
  ];

  const grid = document.getElementById('comparison-tbody');
  grid.innerHTML = metrics.map(m => {
    const n1 = m.num(lw1), n2 = m.num(lw2);
    const t1 = m.raw ? m.raw(lw1) : null;
    const t2 = m.raw ? m.raw(lw2) : null;
    const hasNum = n1 > 0 || n2 > 0;
    let cls1 = 'cmp-tie', cls2 = 'cmp-tie';
    if (hasNum && n1 !== n2) {
      const w1 = m.lower ? n1 < n2 : n1 > n2;
      cls1 = w1 ? 'cmp-win' : 'cmp-lose';
      cls2 = w1 ? 'cmp-lose' : 'cmp-win';
    }
    const disp1 = m.raw ? m.fmt(t1) : m.fmt(n1);
    const disp2 = m.raw ? m.fmt(t2) : m.fmt(n2);
    return `<div class="cmp-row">
      <span class="cmp-v1 ${cls1}">${disp1}</span>
      <span class="cmp-lbl">${m.label}</span>
      <span class="cmp-v2 ${cls2}">${disp2}</span>
    </div>`;
  }).join('');
}

// ===== CHARTS =====
function renderCharts() {
  renderSpeedChart('week');
  renderDistanceChart('week');
  renderHrChart('week');
  renderDpsChart('week');
}

function getCalendarStart(range) {
  const now = new Date();
  if (range === 'week') {
    // Rolling 7 days back from today
    const start = new Date(now);
    start.setDate(now.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    return start;
  }
  if (range === 'month') {
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }
  if (range === 'year') {
    return new Date(now.getFullYear(), 0, 1);
  }
  return null;
}

function getFilteredSorted(athleteData, range) {
  const cutoff = getCalendarStart(range);
  return athleteData.workouts
    .filter(w => {
      if (!w.distance || w.distance === 0) return false;
      if (!cutoff) return true;
      return parseDMY(w.date) >= cutoff;
    })
    .sort((a, b) => parseDMY(a.date) - parseDMY(b.date));
}

const chartDefaults = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index', intersect: false },
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: '#1A2744',
      borderColor: 'rgba(0,212,255,0.3)',
      borderWidth: 1,
      titleColor: '#FFFFFF',
      bodyColor: '#8899BB',
      padding: 10,
      cornerRadius: 8,
    },
  },
  scales: {
    x: { grid: { color: COLORS.grid }, ticks: { color: '#8899BB', font: { family: 'Heebo', size: 11 } } },
    y: { grid: { color: COLORS.grid }, ticks: { color: '#8899BB', font: { family: 'Heebo', size: 11 } } },
  },
};

function createOrUpdate(id, config) {
  if (charts[id]) charts[id].destroy();
  const ctx = document.getElementById(id).getContext('2d');
  charts[id] = new Chart(ctx, config);
}

// Only Maxim's dates — Maxim determines which dates appear in charts
function allDatesUnion(w1, w2) {
  return [...new Set(w1.map(w => w.date))]
    .sort((a, b) => parseDMY(a) - parseDMY(b));
}

function mapByDate(workouts, dates, key) {
  return dates.map(d => {
    const w = workouts.find(x => x.date === d);
    return (w && w[key] > 0) ? w[key] : null;
  });
}

function renderSpeedChart(range) {
  const w1 = getFilteredSorted(athlete1Data, range);
  const w2 = getFilteredSorted(athlete2Data, range);
  const dates = allDatesUnion(w1, w2);

  createOrUpdate('speedChart', {
    type: 'line',
    data: {
      labels: dates.map(formatShort),
      datasets: [
        { label: athlete1Data.name, data: mapByDate(w1, dates, 'avg_speed'), borderColor: COLORS.cyan, backgroundColor: 'rgba(0,212,255,0.08)', pointBackgroundColor: COLORS.cyan, pointRadius: 5, tension: 0.4, spanGaps: true },
        { label: athlete2Data.name, data: mapByDate(w2, dates, 'avg_speed'), borderColor: COLORS.orange, backgroundColor: 'rgba(255,107,53,0.08)', pointBackgroundColor: COLORS.orange, pointRadius: 5, tension: 0.4, spanGaps: true },
      ],
    },
    options: { ...chartDefaults, plugins: { ...chartDefaults.plugins, tooltip: { ...chartDefaults.plugins.tooltip, callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y?.toFixed(2)} קמ"ש` } } } },
  });
}

function renderDistanceChart(range) {
  const w1 = getFilteredSorted(athlete1Data, range);
  const w2 = getFilteredSorted(athlete2Data, range);
  const dates = allDatesUnion(w1, w2);

  const cumulative = (workouts, dates) => {
    let cum = 0;
    return dates.map(d => {
      const w = workouts.find(x => x.date === d);
      if (w) cum += w.distance;
      return cum;
    });
  };

  createOrUpdate('distanceChart', {
    type: 'line',
    data: {
      labels: dates.map(formatShort),
      datasets: [
        { label: athlete1Data.name, data: cumulative(w1, dates), borderColor: COLORS.cyan, backgroundColor: 'rgba(0,212,255,0.12)', fill: true, pointBackgroundColor: COLORS.cyan, pointRadius: 4, tension: 0.3 },
        { label: athlete2Data.name, data: cumulative(w2, dates), borderColor: COLORS.orange, backgroundColor: 'rgba(255,107,53,0.12)', fill: true, pointBackgroundColor: COLORS.orange, pointRadius: 4, tension: 0.3 },
      ],
    },
    options: { ...chartDefaults, plugins: { ...chartDefaults.plugins, tooltip: { ...chartDefaults.plugins.tooltip, callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y?.toFixed(1)} ק"מ` } } } },
  });
}

function renderHrChart(range) {
  const w1 = getFilteredSorted(athlete1Data, range);
  const w2 = getFilteredSorted(athlete2Data, range);
  const dates = allDatesUnion(w1, w2);

  createOrUpdate('hrChart', {
    type: 'bar',
    data: {
      labels: dates.map(formatShort),
      datasets: [
        { label: athlete1Data.name, data: mapByDate(w1, dates, 'avg_hr'), backgroundColor: 'rgba(0,212,255,0.6)', borderColor: COLORS.cyan, borderWidth: 1, borderRadius: 4 },
        { label: athlete2Data.name, data: mapByDate(w2, dates, 'avg_hr'), backgroundColor: 'rgba(255,107,53,0.6)', borderColor: COLORS.orange, borderWidth: 1, borderRadius: 4 },
      ],
    },
    options: { ...chartDefaults, plugins: { ...chartDefaults.plugins, tooltip: { ...chartDefaults.plugins.tooltip, callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y} BPM` } } } },
  });
}

function renderDpsChart(range) {
  const w1 = getFilteredSorted(athlete1Data, range);
  const w2 = getFilteredSorted(athlete2Data, range);
  const dates = allDatesUnion(w1, w2);

  createOrUpdate('dpsChart', {
    type: 'line',
    data: {
      labels: dates.map(formatShort),
      datasets: [
        { label: athlete1Data.name, data: mapByDate(w1, dates, 'dps'), borderColor: COLORS.cyan, backgroundColor: 'transparent', pointBackgroundColor: COLORS.cyan, pointRadius: 6, tension: 0.3, spanGaps: true },
        { label: athlete2Data.name, data: mapByDate(w2, dates, 'dps'), borderColor: COLORS.orange, backgroundColor: 'transparent', pointBackgroundColor: COLORS.orange, pointRadius: 6, tension: 0.3, spanGaps: true },
      ],
    },
    options: { ...chartDefaults, plugins: { ...chartDefaults.plugins, tooltip: { ...chartDefaults.plugins.tooltip, callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y?.toFixed(2)} מ'` } } } },
  });
}

// ===== WORKOUTS TABLE =====
function renderWorkoutsTable(filterAthlete = 'all', filterType = 'all', filterLoc = 'all', filterYear = 'all') {
  // Union of all dates from both athletes
  const allDates = [...new Set([
    ...athlete1Data.workouts.filter(w => w.distance > 0).map(w => w.date),
    ...athlete2Data.workouts.filter(w => w.distance > 0).map(w => w.date)
  ])].sort((a, b) => parseDMY(b) - parseDMY(a));

  const rows = [];
  allDates.forEach(date => {
    const w1 = athlete1Data.workouts.find(w => w.date === date && w.distance > 0);
    const w2 = athlete2Data.workouts.find(w => w.date === date && w.distance > 0);
    if (w1) rows.push({ ...w1, athlete: 1, athleteName: athlete1Data.name });
    if (w2) rows.push({ ...w2, athlete: 2, athleteName: athlete2Data.name });
  });

  const filtered = rows.filter(w => {
    if (filterAthlete !== 'all' && String(w.athlete) !== filterAthlete) return false;
    if (filterType !== 'all' && w.type !== filterType) return false;
    if (filterLoc !== 'all' && w.location !== filterLoc) return false;
    if (filterYear !== 'all' && !w.date.endsWith('.' + filterYear)) return false;
    if (w.distance === 0) return false;
    return true;
  });

  const tbody = document.getElementById('workouts-tbody');
  tbody.innerHTML = '';

  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="14" class="empty-state"><div class="empty-icon">🌊</div><p>אין אימונים תואמים לפילטר</p></td></tr>';
    return;
  }

  const typeClass = { 'אירובי': 'row-aerobic', 'אירובי ארוך': 'row-long-aerobic', 'טמפו': 'row-tempo', 'ספרינטים': 'row-sprints' };
  const typeBadge = { 'אירובי': 'type-aerobic', 'אירובי ארוך': 'type-long', 'טמפו': 'type-tempo', 'ספרינטים': 'type-sprints' };

  // session number = unique date rank (descending), same number for both athletes on same date
  const uniqueDates = [...new Set(filtered.map(w => w.date))];
  const dateToNum = {};
  uniqueDates.forEach((d, i) => { dateToNum[d] = i + 1; });
  const seenDates = new Set();

  filtered.forEach(w => {
    const tr = document.createElement('tr');
    tr.className = typeClass[w.type] || '';

    const locIcon = w.location === 'ים' ? '🌊' : w.location === 'נחל' ? '🏞️' : '';
    const badgeClass = w.athlete === 1 ? 'badge-athlete1' : 'badge-athlete2';
    const isZero = w.distance === 0;

    tr.style.opacity = isZero ? '0.45' : '1';

    const num = dateToNum[w.date];
    const showNum = !seenDates.has(w.date);
    if (showNum) seenDates.add(w.date);

    tr.innerHTML = `
      <td class="workout-num">${showNum ? num : ''}</td>
      <td>${w.date}</td>
      <td><span class="${badgeClass}">${w.athleteName}</span></td>
      <td><span class="type-badge ${typeBadge[w.type] || ''}">${w.type}</span></td>
      <td>${locIcon} ${w.location || '—'}</td>
      <td>${isZero ? '—' : w.distance.toFixed(2)}</td>
      <td>${isZero ? '—' : w.duration}</td>
      <td>${isZero ? '—' : w.avg_speed.toFixed(1)}</td>
      <td>${isZero ? '—' : (w.avg_hr || '—')}</td>
      <td>${isZero ? '—' : (w.spm || '—')}</td>
      <td>${isZero ? '—' : w.dps.toFixed(2)}</td>
      <td>${isZero ? '—' : (w.z3 || '—')}</td>
      <td>${isZero ? '—' : (w.z4 || '—')}</td>
      <td>${isZero ? '—' : (w.z5 || '—')}</td>`;
    tbody.appendChild(tr);
  });
}

// ===== RACES =====
let currentRacesAthlete = 1;

let racesSort = { col: 'date', dir: 'desc' };
let racesFilter = 'all';

function renderRaces(athleteNum) {
  currentRacesAthlete = athleteNum;
  const data = athleteNum === 1 ? athlete1Data : athlete2Data;

  document.querySelectorAll('.races-athlete-btn').forEach(btn => {
    btn.classList.toggle('active', +btn.dataset.athlete === athleteNum);
  });
  document.getElementById('races-btn-1').textContent = athlete1Data.name;
  document.getElementById('races-btn-2').textContent = athlete2Data.name;

  renderRacesTable(data.races || []);
}

function renderRacesTable(allRaces) {
  const tbody = document.getElementById('races-tbody');
  const emptyMsg = document.getElementById('races-empty');

  let races = allRaces.slice();
  if (racesFilter !== 'all') races = races.filter(r => r.category === racesFilter);

  races.sort((a, b) => {
    const col = racesSort.col;
    let va = a[col], vb = b[col];
    if (col === 'date') { va = parseDMY(a.date); vb = parseDMY(b.date); }
    if (col === 'distance_km' || col === 'place') { va = va || 0; vb = vb || 0; }
    if (va == null) va = '';
    if (vb == null) vb = '';
    if (va < vb) return racesSort.dir === 'asc' ? -1 : 1;
    if (va > vb) return racesSort.dir === 'asc' ? 1 : -1;
    return 0;
  });

  // Update sort icons
  document.querySelectorAll('.races-table th.sortable').forEach(th => {
    th.classList.remove('sort-asc', 'sort-desc');
    if (th.dataset.col === racesSort.col) th.classList.add(`sort-${racesSort.dir}`);
  });

  if (!races.length) {
    tbody.innerHTML = '';
    emptyMsg.style.display = '';
    return;
  }
  emptyMsg.style.display = 'none';

  const placeHtml = p => {
    if (!p) return '—';
    const cls = p <= 3 ? ` class="race-place-${p}"` : '';
    const em = p === 1 ? '🥇' : p === 2 ? '🥈' : p === 3 ? '🥉' : '🏅';
    return `<span${cls}>${em} ${p}</span>`;
  };

  tbody.innerHTML = races.map((r, idx) => {
    const catClass = r.category === 'world' ? 'race-type-world' : 'race-type-local';
    const catLabel = r.category === 'world' ? 'חו"ל' : 'ארץ';
    return `<tr data-race-idx="${idx}">
      <td class="${catClass}">${catLabel}</td>
      <td>${r.date || '—'}</td>
      <td>${r.name || '—'}</td>
      <td>${r.location || '—'}</td>
      <td>${r.discipline || '—'}</td>
      <td>${r.distance_km != null ? r.distance_km : '—'}</td>
      <td>${r.duration || '—'}</td>
      <td>${placeHtml(r.place)}</td>
      <td><button class="btn-edit-race" data-race-idx="${idx}">✏️ עריכה</button></td>
    </tr>`;
  }).join('');

  // Store current sorted races for edit reference
  tbody._races = races;
}

function setupRacesTableControls() {
  // Athlete filter buttons (category)
  document.querySelectorAll('.races-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      racesFilter = btn.dataset.filter;
      document.querySelectorAll('.races-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const data = currentRacesAthlete === 2 ? athlete2Data : athlete1Data;
      renderRacesTable(data.races || []);
    });
  });

  // Column sort
  document.querySelectorAll('.races-table th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.col;
      if (racesSort.col === col) {
        racesSort.dir = racesSort.dir === 'asc' ? 'desc' : 'asc';
      } else {
        racesSort.col = col;
        racesSort.dir = col === 'date' ? 'desc' : 'asc';
      }
      const data = currentRacesAthlete === 2 ? athlete2Data : athlete1Data;
      renderRacesTable(data.races || []);
    });
  });

  // Row edit (delegated)
  document.getElementById('races-tbody').addEventListener('click', e => {
    const btn = e.target.closest('.btn-edit-race');
    if (!btn) return;
    const idx = +btn.dataset.raceIdx;
    const tbody = document.getElementById('races-tbody');
    const race = tbody._races[idx];
    if (!race) return;
    const tr = btn.closest('tr');
    const catOpts = `<option value="local"${race.category==='local'?' selected':''}>ארץ</option><option value="world"${race.category==='world'?' selected':''}>חו"ל</option>`;
    const discOpts = ['','ספרינט','טכני','לונג דיסטנס'].map(d => `<option value="${d}"${race.discipline===d?' selected':''}>${d||'—'}</option>`).join('');
    tr.innerHTML = `
      <td><select class="edit-cell" name="category">${catOpts}</select></td>
      <td><input class="edit-cell" name="date" value="${race.date||''}" placeholder="DD.MM.YYYY"></td>
      <td><input class="edit-cell" name="name" value="${race.name||''}"></td>
      <td><input class="edit-cell" name="location" value="${race.location||''}"></td>
      <td><select class="edit-cell" name="discipline">${discOpts}</select></td>
      <td><input class="edit-cell" name="distance_km" type="number" step="0.01" value="${race.distance_km??''}"></td>
      <td><input class="edit-cell" name="duration" value="${race.duration||''}"></td>
      <td><input class="edit-cell" name="place" type="number" min="1" value="${race.place||''}"></td>
      <td><button class="btn-save-edit">שמור</button></td>`;

    tr.querySelector('.btn-save-edit').addEventListener('click', () => {
      race.category    = tr.querySelector('[name=category]').value;
      race.date        = tr.querySelector('[name=date]').value;
      race.name        = tr.querySelector('[name=name]').value.trim();
      race.location    = tr.querySelector('[name=location]').value.trim();
      race.discipline  = tr.querySelector('[name=discipline]').value;
      race.distance_km = parseFloat(tr.querySelector('[name=distance_km]').value) || null;
      race.duration    = tr.querySelector('[name=duration]').value.trim() || null;
      race.place       = parseInt(tr.querySelector('[name=place]').value) || null;
      const data = currentRacesAthlete === 2 ? athlete2Data : athlete1Data;
      renderRacesTable(data.races || []);
      showSaveStatus('saving', 'שומר...');
      saveAthleteToGitHub(currentRacesAthlete || 1).then(ok => {
        if (ok) showSaveStatus('success', '✓ נשמר בהצלחה');
      });
    });
  });
}

// Medal emoji by place (1/2/3 get medals, others get a generic ribbon)
function placeEmoji(place) {
  if (!place) return '';
  if (place === 1) return '🥇';
  if (place === 2) return '🥈';
  if (place === 3) return '🥉';
  return '🏅';
}

function raceCard(r) {
  const hasDat = r.distance_km !== null;
  const statsHtml = hasDat ? `
    <div class="race-stats">
      <div class="race-stat"><div class="race-stat-val">${r.distance_km}</div><div class="race-stat-lbl">ק"מ</div></div>
      <div class="race-stat"><div class="race-stat-val">${r.duration || '—'}</div><div class="race-stat-lbl">זמן</div></div>
      <div class="race-stat"><div class="race-stat-val">${r.avg_speed || '—'}</div><div class="race-stat-lbl">קמ"ש</div></div>
      <div class="race-stat"><div class="race-stat-val">${r.avg_hr || '—'}</div><div class="race-stat-lbl">BPM</div></div>
      <div class="race-stat"><div class="race-stat-val">${r.spm || '—'}</div><div class="race-stat-lbl">SPM</div></div>
      <div class="race-stat"><div class="race-stat-val">${r.dps || '—'}</div><div class="race-stat-lbl">DPS מ'</div></div>
      ${r.z3 ? `<div class="race-stat"><div class="race-stat-val" style="color:#00E676">${r.z3}</div><div class="race-stat-lbl">Z3</div></div>` : ''}
      ${r.z4 ? `<div class="race-stat"><div class="race-stat-val" style="color:#FF8C00">${r.z4}</div><div class="race-stat-lbl">Z4</div></div>` : ''}
      ${r.z5 ? `<div class="race-stat"><div class="race-stat-val" style="color:#FF1744">${r.z5}</div><div class="race-stat-lbl">Z5</div></div>` : ''}
    </div>` : `<div class="race-card-pending">⏳ ${r.notes || 'נתונים בהמתנה'}</div>`;

  const placeBadge = r.place
    ? `<div class="race-place-badge place-${r.place}"><span class="rpb-emoji">${placeEmoji(r.place)}</span><span class="rpb-text">מקום ${r.place}</span></div>`
    : '';

  return `
    <div class="race-card">
      ${placeBadge}
      <div class="race-card-header">
        <div class="race-card-name">${r.name}</div>
        <div class="race-card-date">${r.date}</div>
      </div>
      <div class="race-card-location">📍 ${r.location}</div>
      ${statsHtml}
    </div>`;
}

function setupRacesButtons() {
  document.querySelectorAll('.races-athlete-btn').forEach(btn => {
    btn.addEventListener('click', () => renderRaces(+btn.dataset.athlete));
  });

  // Modal open/close
  const modal = document.getElementById('modal-add-race');
  document.getElementById('btn-add-race').addEventListener('click', () => {
    modal.style.display = 'flex';
  });
  const closeModal = () => { modal.style.display = 'none'; };
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

  // Form submit — add race to in-memory data and re-render
  document.getElementById('form-add-race').addEventListener('submit', e => {
    e.preventDefault();

    const dateRaw = document.getElementById('race-date').value; // YYYY-MM-DD
    const [y, m, d] = dateRaw.split('-');
    const dateStr = `${d}.${m}.${y}`;

    const newRace = {
      category:    document.getElementById('race-category').value,
      name:        document.getElementById('race-name').value.trim(),
      location:    document.getElementById('race-location').value.trim(),
      discipline:  document.getElementById('race-discipline').value,
      date:        dateStr,
      distance_km: parseFloat(document.getElementById('race-distance').value) || null,
      duration:    document.getElementById('race-duration').value.trim() || null,
      place:       parseInt(document.getElementById('race-place').value) || null,
      avg_speed: null, avg_hr: null, spm: null, dps: null,
      z3: null, z4: null, z5: null, notes: '',
    };

    const athleteVal = document.getElementById('race-athlete').value;
    const toSave = [];
    if (athleteVal === '1' || athleteVal === 'both') {
      athlete1Data.races = athlete1Data.races || [];
      athlete1Data.races.push(newRace);
      toSave.push(1);
    }
    if (athleteVal === '2' || athleteVal === 'both') {
      athlete2Data.races = athlete2Data.races || [];
      athlete2Data.races.push({...newRace});
      toSave.push(2);
    }

    closeModal();
    document.getElementById('form-add-race').reset();
    renderRaces(currentRacesAthlete || 1);

    showSaveStatus('saving', 'שומר...');
    Promise.all(toSave.map(n => saveAthleteToGitHub(n))).then(results => {
      if (results.every(Boolean)) showSaveStatus('success', '✓ נשמר בהצלחה');
    });
  });
}

// ===== GALLERY =====
function renderGallery() {
  const grid = document.getElementById('gallery-grid');
  const files = [
    { name: 'מקסים רפופורט.JPEG', label: 'מקסים רפופורט', date: '' },
    { name: 'ויקטור מורטוב.JPEG', label: 'ויקטור מורטוב', date: '' },
  ];

  grid.innerHTML = '';

  // Check actual gallery images
  const placeholders = [
    { emoji: '🌊', label: 'אימון ים', date: '01/05/2026' },
    { emoji: '🏄', label: 'פאדלינג', date: '29/04/2026' },
    { emoji: '🌅', label: 'זריחה', date: '27/04/2026' },
    { emoji: '💪', label: 'ספרינטים', date: '25/04/2026' },
    { emoji: '🏞️', label: 'נחל', date: '24/04/2026' },
    { emoji: '🌊', label: 'גלים', date: '23/02/2026' },
  ];

  placeholders.forEach(item => {
    const div = document.createElement('div');
    div.className = 'gallery-placeholder';
    div.innerHTML = `<span>${item.emoji}</span><span>${item.label}</span><span style="font-size:0.7rem;color:var(--text-muted)">${item.date}</span>`;
    grid.appendChild(div);
  });
}

// ===== LIGHTBOX =====
function openLightbox(src, caption) {
  document.getElementById('lightbox-img').src = src;
  document.getElementById('lightbox-caption').textContent = caption;
  document.getElementById('lightbox').classList.add('active');
}

function closeLightbox() {
  document.getElementById('lightbox').classList.remove('active');
}

// ===== TOGGLE BUTTONS =====
function setAllChartsRange(range) {
  // Update active button in all toggle groups
  document.querySelectorAll('.toggle-group').forEach(group => {
    group.querySelectorAll('.toggle-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.range === range);
    });
  });
  // Re-render all 4 charts
  renderSpeedChart(range);
  renderDistanceChart(range);
  renderHrChart(range);
  renderDpsChart(range);
}

function setupToggleButtons() {
  document.querySelectorAll('.toggle-group').forEach(group => {
    group.querySelectorAll('.toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        setAllChartsRange(btn.dataset.range);
      });
    });
  });
}

// ===== FILTERS =====
function setupFilters() {
  const selAthlete = document.getElementById('filter-athlete');
  const selType    = document.getElementById('filter-type');
  const selLoc     = document.getElementById('filter-location');
  const selYear    = document.getElementById('filter-year');
  const update = () => renderWorkoutsTable(selAthlete.value, selType.value, selLoc.value, selYear.value);
  selAthlete.addEventListener('change', update);
  selType.addEventListener('change', update);
  selLoc.addEventListener('change', update);
  if (selYear) selYear.addEventListener('change', update);
}

function populateYearFilter() {
  const years = new Set(
    athlete1Data.workouts.filter(w => w.distance > 0).map(w => w.date.split('.')[2])
  );
  const sel = document.getElementById('filter-year');
  if (!sel) return;
  [...years].sort((a, b) => b - a).forEach(y => {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y;
    sel.appendChild(opt);
  });
}

// ===========================
// PROGRESS SECTION
// ===========================

const PROG_PERIODS = {
  q1:       { start: new Date(2026,0,1),  end: new Date(2026,2,31),  label: 'Q1 — ינואר-מרץ 2026',        baseRef: 'base',     showVsDec: false },
  q2:       { start: new Date(2026,3,1),  end: new Date(2026,5,30),  label: 'Q2 — אפריל-יוני 2026',        baseRef: 'q1',       showVsDec: false },
  q3:       { start: new Date(2026,6,1),  end: new Date(2026,8,30),  label: 'Q3 — יולי-ספטמבר 2026',      baseRef: 'q2',       showVsDec: false },
  q4:       { start: new Date(2026,9,1),  end: new Date(2026,11,31), label: 'Q4 — אוקטובר-דצמבר 2026',    baseRef: 'q3',       showVsDec: false },
  h1:       { isH1: true,                                             label: 'חצי שנתי — ממוצע Q1+Q2',     baseRef: 'base',     showVsDec: false },
  year:     { isMultiYear: true,                                      label: 'שנה — 2024 / 2025 / 2026',   baseRef: null,       showVsDec: false },
};
// Base reference = Q4 2025 (אוקטובר–דצמבר 2025)
const PROG_BASE = { start: new Date(2025,9,1), end: new Date(2025,11,31) };

const PROG_TYPES = [
  {
    key: 'aerobic', types: ['אירובי'], label: 'אירובי', icon: '🏄',
    metrics: [
      { key: 'distance_total', label: "סה\"כ מרחק", unit: "ק\"מ", lb: false },
      { key: 'distance',       label: 'ממוצע מרחק', unit: "ק\"מ", lb: false },
      { key: 'hr',             label: 'דופק',        unit: 'BPM',  lb: true  },
      { key: 'dps',            label: 'DPS',          unit: "מ'",   lb: false },
      { key: 'speed',          label: 'מהירות',       unit: 'קמ"ש', lb: false },
      { key: 'eff',            label: 'יעילות',       unit: '',     lb: false },
    ]
  },
  {
    key: 'tempo', types: ['טמפו'], label: 'טמפו / אינטרוואלים', icon: '🌊',
    metrics: [
      { key: 'distance_total', label: "סה\"כ מרחק", unit: "ק\"מ", lb: false },
      { key: 'distance',       label: 'ממוצע מרחק', unit: "ק\"מ", lb: false },
      { key: 'hr',             label: 'דופק',        unit: 'BPM',  lb: true  },
      { key: 'dps',            label: 'DPS',          unit: "מ'",   lb: false },
      { key: 'speed',          label: 'מהירות',       unit: 'קמ"ש', lb: false },
      { key: 'eff',            label: 'יעילות',       unit: '',     lb: false },
    ]
  },
  {
    key: 'aerobic_long', types: ['אירובי ארוך'], label: 'אירובי ארוך', icon: '🌅',
    metrics: [
      { key: 'distance_total', label: "סה\"כ מרחק", unit: "ק\"מ", lb: false },
      { key: 'distance',       label: 'ממוצע מרחק', unit: "ק\"מ", lb: false },
      { key: 'hr',             label: 'דופק',        unit: 'BPM',  lb: true  },
      { key: 'dps',            label: 'DPS',          unit: "מ'",   lb: false },
      { key: 'speed',          label: 'מהירות',       unit: 'קמ"ש', lb: false },
      { key: 'eff',            label: 'יעילות',       unit: '',     lb: false },
    ]
  },
  {
    key: 'sprints', types: ['ספרינטים'], label: 'ספרינטים', icon: '⚡',
    metrics: [
      { key: 'speed', label: 'מהירות', unit: 'קמ"ש', lb: false },
      { key: 'spm',   label: 'SPM',    unit: '',      lb: false },
      { key: 'hr',    label: 'דופק',   unit: 'BPM',   lb: true  },
      { key: 'eff',   label: 'יעילות', unit: '',      lb: false },
    ]
  },
];

let progAthlete = 1;

function previousQuarter() {
  const m = new Date().getMonth(); // 0-based — מציג רבעון שהסתיים
  if (m <= 2) return 'q1'; // ינואר-מרץ — אין קודם, מציג Q1
  if (m <= 5) return 'q1';
  if (m <= 8) return 'q2';
  return 'q3';
}
let progPeriod = previousQuarter();

function progCalcStats(workouts, start, end, types) {
  const ws = workouts.filter(w => {
    if (!w.distance || w.distance === 0) return false;
    if (!types.includes(w.type)) return false;
    const d = parseDMY(w.date);
    if (start && d < start) return false;
    if (end   && d > end)   return false;
    return true;
  });
  if (!ws.length) return null;
  const vm = key => { const v = ws.map(w=>w[key]||0).filter(x=>x>0); return v.length ? v.reduce((a,b)=>a+b,0)/v.length : 0; };
  const spd = vm('avg_speed'), hr = vm('avg_hr');
  const distTotal = ws.reduce((s,w)=>s+(w.distance||0),0);
  return { count: ws.length, speed: spd, hr, dps: vm('dps'), spm: vm('spm'),
           distance_total: distTotal,
           distance: distTotal / ws.length,
           eff: hr>0 ? +(spd/hr*100).toFixed(3) : 0 };
}

function progGetStats(workouts, periodKey) {
  const p = PROG_PERIODS[periodKey];
  return PROG_TYPES.reduce((acc, t) => {
    if (p.isH1) {
      acc[t.key] = progCalcStats(workouts, PROG_PERIODS.q1.start, PROG_PERIODS.q2.end, t.types);
    } else if (p.yearNum) {
      acc[t.key] = progCalcStats(workouts, new Date(p.yearNum,0,1), new Date(p.yearNum,11,31), t.types);
    } else {
      acc[t.key] = progCalcStats(workouts, p.start, p.end, t.types);
    }
    return acc;
  }, {});
}

function progGetBase(workouts, baseRef) {
  // baseRef = null | 'base' (Q4 2025) | 'q1'/'q2'/'q3' | 'year2024'/'year2025'
  if (!baseRef) return PROG_TYPES.reduce((acc, t) => { acc[t.key] = null; return acc; }, {});
  let range;
  if (baseRef === 'base') {
    range = { start: PROG_BASE.start, end: PROG_BASE.end };
  } else if (PROG_PERIODS[baseRef]?.yearNum) {
    const y = PROG_PERIODS[baseRef].yearNum;
    range = { start: new Date(y,0,1), end: new Date(y,11,31) };
  } else {
    range = { start: PROG_PERIODS[baseRef].start, end: PROG_PERIODS[baseRef].end };
  }
  return PROG_TYPES.reduce((acc, t) => {
    acc[t.key] = progCalcStats(workouts, range.start, range.end, t.types);
    return acc;
  }, {});
}

function progGetDecBase(workouts) {
  return PROG_TYPES.reduce((acc, t) => {
    acc[t.key] = progCalcStats(workouts, PROG_BASE.start, PROG_BASE.end, t.types);
    return acc;
  }, {});
}

function progFmtVal(val, key) {
  if (!val || val === 0) return '—';
  if (key === 'eff')      return (+val).toFixed(2);
  if (key === 'speed')    return (+val).toFixed(1);
  if (key === 'hr' || key === 'spm') return Math.round(val);
  if (key === 'dps')      return (+val).toFixed(2);
  if (key === 'distance')       return (+val).toFixed(1);
  if (key === 'distance_total') return (+val).toFixed(1);
  return val;
}

function progDelta(bv, cv, lb) {
  if (!bv || !cv || bv === 0 || cv === 0) return null;
  const pct = ((cv - bv) / bv) * 100;
  const good = lb ? pct < -3 : pct > 3;
  const bad  = lb ? pct > 3  : pct < -3;
  return { pct, good, bad, stable: !good && !bad };
}

function progDeltaHtml(delta) {
  if (!delta) return '<span class="pm-delta">—</span>';
  const cls   = delta.pct > 0 ? 'good' : delta.pct < 0 ? 'bad' : 'neutral';
  const arrow = delta.pct > 0 ? '↑' : '↓';
  const sign  = delta.pct > 0 ? '+' : '';
  return `<span class="pm-delta ${cls}">${arrow} ${sign}${delta.pct.toFixed(1)}%</span>`;
}

function renderProgCard(typeConf, base, curr, decBase, showVsDec, periodKey) {
  const b  = base[typeConf.key];
  const c  = curr[typeConf.key];
  const db = decBase[typeConf.key];   // Dec 2025 always

  if (!b && !c) return `
    <div class="prog-card glass-card">
      <div class="prog-card-hdr"><span class="prog-icon">${typeConf.icon}</span><span class="prog-type-lbl">${typeConf.label}</span></div>
      <div class="prog-empty">אין נתונים לסוג אימון זה בתקופות אלה</div>
    </div>`;

  const future = !c ? `<div class="prog-future">⏳ נתונים יגיעו בתקופה זו</div>` : '';

  const rows = typeConf.metrics.map(m => {
    const bv = b?.[m.key], cv = c?.[m.key], dv = db?.[m.key];
    const dRolling = (b && c) ? progDelta(bv, cv, m.lb) : null;
    const dVsDec   = (showVsDec && db && c) ? progDelta(dv, cv, m.lb) : null;
    const vsDecCol = showVsDec
      ? progDeltaHtml(dVsDec)
      : '';
    return `
      <div class="pm-row ${showVsDec ? 'pm-row-6' : ''}">
        <span class="pm-lbl">${m.label}</span>
        <span class="pm-bv">${progFmtVal(bv, m.key)}<small>${m.unit}</small></span>
        <span class="pm-sep">→</span>
        <span class="pm-cv">${progFmtVal(cv, m.key)}<small>${m.unit}</small></span>
        ${progDeltaHtml(dRolling)}
        ${vsDecCol}
      </div>`;
  }).join('');

  const baseN = b?.count ?? 0;
  const currN = c?.count ?? 0;
  // Period label for header column (e.g. Q1, Q2, etc.)
  const baseRef = PROG_PERIODS[periodKey]?.baseRef;
  const baseLabel = !baseRef          ? '—'
    : baseRef === 'base'              ? "Q4 '25"
    : PROG_PERIODS[baseRef]?.yearNum  ? String(PROG_PERIODS[baseRef].yearNum)
    : baseRef.toUpperCase();
  const currLabel = PROG_PERIODS[periodKey]?.isH1    ? 'H1'
                  : PROG_PERIODS[periodKey]?.yearNum  ? String(PROG_PERIODS[periodKey].yearNum)
                  : periodKey.toUpperCase();

  // Warning if very few workouts
  const fewWarning = '';

  const vsDecHeader = showVsDec ? `<span>vs דצמ'25</span>` : '';

  // H1 note
  const h1Note = PROG_PERIODS[periodKey]?.isH1
    ? `<div class="prog-h1-info">📊 ממוצע Q1+Q2 — יתעדכן עם סיום יוני 2026</div>` : '';

  return `
    <div class="prog-card glass-card">
      <div class="prog-card-hdr">
        <div><span class="prog-icon">${typeConf.icon}</span><span class="prog-type-lbl">${typeConf.label}</span></div>
        <div class="prog-counts">${baseN} אימון ${baseLabel} · ${currN} אימון ${currLabel}</div>
      </div>
      ${fewWarning}
      <div class="pm-head-row ${showVsDec ? 'pm-head-6' : ''}">
        <span></span><span>${baseLabel}</span><span></span><span>${currLabel}</span><span>שינוי</span>${vsDecHeader}
      </div>
      ${rows}
      ${future}
      ${h1Note}
    </div>`;
}

const yearCharts = {};

function destroyYearCharts() {
  Object.values(yearCharts).forEach(c => { try { c.destroy(); } catch(e){} });
  Object.keys(yearCharts).forEach(k => delete yearCharts[k]);
}

function buildYearChart(canvasId, typeKey, statsArr) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const labels = ['2024','2025','2026'];
  const effVals = statsArr.map(s => s ? +(s.eff||0).toFixed(3) : 0);
  const counts  = statsArr.map(s => s ? s.count : 0);
  const BAR_COLOR = 'rgba(74, 222, 128, 0.75)';   // ירוק

  // y-axis max = 2x data max → bars fill ~50% height → room for label above
  const maxEff = Math.max(...effVals.filter(v => v > 0), 1);
  const yMax   = +(maxEff * 2.1).toFixed(2);

  // custom plugin: eff value in yellow ABOVE bar + count inside bar
  const barLabelPlugin = {
    id: 'barLabel',
    afterDatasetsDraw(chart) {
      const { ctx } = chart;
      chart.getDatasetMeta(0).data.forEach((bar, i) => {
        const cx  = bar.x;
        const top = bar.y;
        const mid = (bar.y + bar.base) / 2;
        ctx.save();
        ctx.textAlign = 'center';

        // efficiency value ABOVE bar — yellow
        if (effVals[i]) {
          ctx.fillStyle = '#FFD60A';
          ctx.font = 'bold 14px "Barlow Condensed", sans-serif';
          ctx.fillText(effVals[i].toFixed(2), cx, top - 8);
        }

        // count INSIDE bar — dark
        if (counts[i] && (bar.base - bar.y) > 30) {
          ctx.fillStyle = '#080D18';
          ctx.font = 'bold 18px "Barlow Condensed", sans-serif';
          ctx.fillText(counts[i], cx, mid - 6);
          ctx.font = '10px "Heebo", sans-serif';
          ctx.fillText('אימונים', cx, mid + 9);
        }
        ctx.restore();
      });
    }
  };

  yearCharts[canvasId] = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'יעילות',
        data: effVals,
        backgroundColor: BAR_COLOR,
        borderColor: '#4ADE80',
        borderWidth: 1.5,
        borderRadius: 6,
        barPercentage: 0.42,
        categoryPercentage: 0.6,
      }]
    },
    plugins: [barLabelPlugin],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 600 },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ` יעילות: ${ctx.parsed.y}  |  ${counts[ctx.dataIndex]} אימונים`
          }
        },
      },
      scales: {
        x: { ticks:{ color:'#8899BB', font:{size:12} }, grid:{ color:'rgba(136,153,187,0.06)' } },
        y: { max: yMax, ticks:{ color:'#8899BB', font:{size:10} }, grid:{ color:'rgba(136,153,187,0.06)' } },
      },
    },
  });
}

function renderYearCards() {
  destroyYearCharts();
  const ath   = progAthlete === 1 ? athlete1Data : athlete2Data;
  const years = [2024, 2025, 2026];

  const stats = years.map(y =>
    PROG_TYPES.reduce((acc, t) => {
      acc[t.key] = progCalcStats(ath.workouts, new Date(y,0,1), new Date(y,11,31), t.types);
      return acc;
    }, {})
  );

  const infoEl = document.getElementById('prog-period-info');
  if (infoEl) infoEl.innerHTML =
    `<span class="ppi-period">השוואה שנתית</span><span class="ppi-sep">·</span><span class="ppi-base">2024 vs 2025 vs 2026</span>`;

  const cardsEl = document.getElementById('prog-cards');
  if (!cardsEl) return;

  cardsEl.innerHTML = PROG_TYPES.map(t => {
    const sArr = stats.map(s => s[t.key]);
    if (!sArr.some(Boolean)) return `
      <div class="prog-year-card glass-card">
        <div class="prog-card-hdr"><span class="prog-icon">${t.icon}</span><span class="prog-type-lbl">${t.label}</span></div>
        <div class="prog-empty">אין נתונים לסוג אימון זה</div>
      </div>`;

    const counts = sArr.map(s => s ? s.count : 0);
    const chartId = `year-chart-${t.key}`;

    const rows = t.metrics.map(m => {
      const vals = sArr.map(s =>
        (s && s[m.key]) ? `${progFmtVal(s[m.key], m.key)}<small>${m.unit}</small>` : '—'
      );
      return `
        <div class="pm-row pm-row-year">
          <span class="pm-lbl">${m.label}</span>
          <span class="pm-yv">${vals[0]}</span>
          <span class="pm-yv">${vals[1]}</span>
          <span class="pm-yv">${vals[2]}</span>
        </div>`;
    }).join('');

    return `
      <div class="prog-year-card glass-card">
        <div class="prog-year-data">
          <div class="prog-card-hdr">
            <div><span class="prog-icon">${t.icon}</span><span class="prog-type-lbl">${t.label}</span></div>
            <div class="prog-counts">${counts[0]} · ${counts[1]} · ${counts[2]} אימונים</div>
          </div>
          <div class="pm-head-row pm-head-year">
            <span></span><span>2024</span><span>2025</span><span>2026</span>
          </div>
          ${rows}
        </div>
        <div class="prog-year-chart-wrap">
          <canvas id="${chartId}"></canvas>
        </div>
      </div>`;
  }).join('');

  // draw charts after DOM is ready
  setTimeout(() => {
    PROG_TYPES.forEach(t => {
      const sArr = stats.map(s => s[t.key]);
      if (sArr.some(Boolean)) buildYearChart(`year-chart-${t.key}`, t.key, sArr);
    });
  }, 50);

  renderEfficiencyChart();
  renderTrendCharts();
}

function renderProgress() {
  const ath = progAthlete === 1 ? athlete1Data : athlete2Data;
  const p   = PROG_PERIODS[progPeriod];

  if (p.isMultiYear) { renderYearCards(); return; }
  const base    = progGetBase(ath.workouts, p.baseRef);
  const curr    = progGetStats(ath.workouts, progPeriod);
  const decBase = progGetDecBase(ath.workouts);   // always Dec 2025, for extra column

  // Info bar
  const baseLabelMap = { 'base': "Q4 2025", 'q1': 'ממוצע Q1', 'q2': 'ממוצע Q2', 'q3': 'ממוצע Q3' };
  const baseLabel = !p.baseRef ? null
    : baseLabelMap[p.baseRef]
    || (PROG_PERIODS[p.baseRef]?.yearNum ? String(PROG_PERIODS[p.baseRef].yearNum) : p.baseRef);
  const infoEl = document.getElementById('prog-period-info');
  if (infoEl) infoEl.innerHTML = baseLabel
    ? `<span class="ppi-period">${p.label}</span><span class="ppi-sep">·</span><span class="ppi-base">השוואה מול ${baseLabel}</span>`
    : `<span class="ppi-period">${p.label}</span>`;

  // Cards
  const cardsEl = document.getElementById('prog-cards');
  if (cardsEl) cardsEl.innerHTML = PROG_TYPES.map(t =>
    renderProgCard(t, base, curr, decBase, p.showVsDec, progPeriod)
  ).join('');

  // Efficiency chart
  renderEfficiencyChart();
  renderTrendCharts();
}

// ===== PER-TYPE EFFICIENCY TREND CHARTS (year/month toggle) =====
const trendResolution = {};   // { [typeKey]: 'year' | 'month' }
const trendCharts = {};

const HEB_MONTHS_SHORT = ['ינו', 'פבר', 'מרץ', 'אפר', 'מאי', 'יונ', 'יול', 'אוג', 'ספט', 'אוק', 'נוב', 'דצמ'];

function computeTrendBuckets(workouts, types, resolution) {
  const ws = workouts.filter(w => w.distance > 0 && types.includes(w.type));
  if (!ws.length) return { labels: [], effVals: [], counts: [] };

  const buckets = {};   // key -> { speedSum, hrSum, n }
  ws.forEach(w => {
    const d = parseDMY(w.date);
    if (!d) return;
    const key = resolution === 'year'
      ? `${d.getFullYear()}`
      : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!buckets[key]) buckets[key] = { speedSum: 0, hrSum: 0, n: 0, count: 0 };
    buckets[key].count++;
    if (w.avg_speed > 0 && w.avg_hr > 0) {
      buckets[key].speedSum += w.avg_speed;
      buckets[key].hrSum    += w.avg_hr;
      buckets[key].n++;
    }
  });

  const keys = Object.keys(buckets).sort();
  const labels = keys.map(k => {
    if (resolution === 'year') return k;
    const [y, m] = k.split('-');
    return `${HEB_MONTHS_SHORT[+m - 1]} ${y.slice(2)}`;
  });
  const effVals = keys.map(k => {
    const b = buckets[k];
    return b.n > 0 ? +((b.speedSum / b.n) / (b.hrSum / b.n) * 100).toFixed(3) : null;
  });
  const counts = keys.map(k => buckets[k].count);

  return { labels, effVals, counts };
}

function buildTrendChart(canvasId, labels, effVals, counts) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  if (trendCharts[canvasId]) { trendCharts[canvasId].destroy(); delete trendCharts[canvasId]; }

  trendCharts[canvasId] = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'יעילות',
        data: effVals,
        borderColor: '#00D4FF',
        backgroundColor: 'rgba(0,212,255,0.12)',
        tension: 0.3,
        fill: true,
        spanGaps: true,
        pointRadius: 3,
        pointBackgroundColor: '#00D4FF',
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => {
              const i = ctx.dataIndex;
              const v = ctx.parsed.y;
              return v == null ? 'אין נתונים' : `יעילות: ${v.toFixed(2)} (${counts[i]} אימונים)`;
            }
          }
        }
      },
      scales: {
        x: { ticks: { color: 'rgba(230,238,250,0.6)' }, grid: { color: 'rgba(255,255,255,0.05)' } },
        y: { ticks: { color: 'rgba(230,238,250,0.6)' }, grid: { color: 'rgba(255,255,255,0.05)' } }
      }
    }
  });
}

function renderTrendCharts() {
  const ath = progAthlete === 1 ? athlete1Data : athlete2Data;
  const gridEl = document.getElementById('prog-trend-grid');
  if (!gridEl) return;

  gridEl.innerHTML = PROG_TYPES.map(t => {
    const res = trendResolution[t.key] || 'month';
    const chartId = `trend-chart-${t.key}`;
    return `
      <div class="glass-card prog-trend-card">
        <div class="prog-trend-header">
          <div class="prog-trend-title">${t.icon} ${t.label} — מגמת יעילות</div>
          <div class="prog-trend-toggle" data-type="${t.key}">
            <button class="prog-trend-btn ${res === 'month' ? 'active' : ''}" data-res="month">חודש</button>
            <button class="prog-trend-btn ${res === 'year' ? 'active' : ''}" data-res="year">שנה</button>
          </div>
        </div>
        <div class="chart-canvas-wrapper prog-trend-canvas-wrap">
          <canvas id="${chartId}"></canvas>
        </div>
      </div>`;
  }).join('');

  PROG_TYPES.forEach(t => {
    const res = trendResolution[t.key] || 'month';
    const { labels, effVals, counts } = computeTrendBuckets(ath.workouts, t.types, res);
    if (!labels.length) {
      const wrap = document.querySelector(`#prog-trend-grid [data-type="${t.key}"]`)?.closest('.prog-trend-card')?.querySelector('.prog-trend-canvas-wrap');
      if (wrap) wrap.innerHTML = `<div class="prog-trend-empty">אין נתונים לסוג אימון זה</div>`;
      return;
    }
    buildTrendChart(`trend-chart-${t.key}`, labels, effVals, counts);
  });

  // Toggle buttons
  gridEl.querySelectorAll('.prog-trend-toggle').forEach(group => {
    const typeKey = group.dataset.type;
    group.querySelectorAll('.prog-trend-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        group.querySelectorAll('.prog-trend-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        trendResolution[typeKey] = btn.dataset.res;
        const t = PROG_TYPES.find(t => t.key === typeKey);
        const a = progAthlete === 1 ? athlete1Data : athlete2Data;
        const { labels, effVals, counts } = computeTrendBuckets(a.workouts, t.types, btn.dataset.res);
        buildTrendChart(`trend-chart-${typeKey}`, labels, effVals, counts);
      });
    });
  });
}

function renderEfficiencyChart() {
  // Build quarters from Q1 2024 up to current quarter
  const now = new Date();
  const QUARTERS = [];
  for (let y = 2024; y <= now.getFullYear(); y++) {
    for (let q = 0; q < 4; q++) {
      if (y === 2024 && q < 2) continue;   // מתחיל מ-Q3 2024
      const qStart = new Date(y, q * 3, 1);
      if (qStart > now) break;
      const qEnd = new Date(y, q * 3 + 3, 0); // last day of quarter
      const shortY = String(y).slice(2);
      QUARTERS.push({ lbl: `Q${q+1}'${shortY}`, s: qStart, e: qEnd });
    }
  }

  const eff = (data) => QUARTERS.map(q => {
    const ws = data.workouts.filter(w => {
      if (!w.distance||!w.avg_speed||!w.avg_hr||w.avg_hr===0) return false;
      const d = parseDMY(w.date); return d>=q.s && d<=q.e;
    });
    if (!ws.length) return null;
    const spd = ws.reduce((s,w)=>s+w.avg_speed,0)/ws.length;
    const hr  = ws.reduce((s,w)=>s+w.avg_hr,0)/ws.length;
    return hr>0 ? +(spd/hr*100).toFixed(2) : null;
  });

  if (charts['efficiencyChart']) charts['efficiencyChart'].destroy();
  const ctx = document.getElementById('efficiencyChart')?.getContext('2d');
  if (!ctx) return;
  charts['efficiencyChart'] = new Chart(ctx, {
    type: 'line',
    data: {
      labels: QUARTERS.map(q=>q.lbl),
      datasets: [
        { label: athlete1Data.name, data: eff(athlete1Data), borderColor: COLORS.cyan,   backgroundColor:'rgba(0,212,255,0.08)', pointBackgroundColor:COLORS.cyan,   pointRadius:6, tension:0.4, spanGaps:true },
        { label: athlete2Data.name, data: eff(athlete2Data), borderColor: COLORS.orange, backgroundColor:'rgba(255,107,53,0.08)',  pointBackgroundColor:COLORS.orange, pointRadius:6, tension:0.4, spanGaps:true },
      ]
    },
    options: { ...chartDefaults,
      plugins: { ...chartDefaults.plugins,
        legend: { display:false },
        tooltip: { ...chartDefaults.plugins.tooltip,
          callbacks: { label: ctx=>`${ctx.dataset.label}: ${ctx.parsed.y?.toFixed(2)}` }
        }
      }
    }
  });
  const l1 = document.getElementById('eff-legend-1'), l2 = document.getElementById('eff-legend-2');
  if (l1) l1.textContent = athlete1Data.name;
  if (l2) l2.textContent = athlete2Data.name;
}

function setupProgress() {
  // Auto-activate previous quarter button
  const pq = previousQuarter();
  document.querySelectorAll('.prog-period-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.period === pq);
  });

  document.querySelectorAll('.prog-athlete-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.prog-athlete-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      progAthlete = parseInt(btn.dataset.athlete);
      renderProgress();
    });
  });
  document.querySelectorAll('.prog-period-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.prog-period-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      progPeriod = btn.dataset.period;
      renderProgress();
    });
  });
}

// ===== NAV =====
function showSection(id) {
  document.querySelectorAll('.section-tab').forEach(s => s.classList.remove('section-active'));
  const target = document.getElementById(id);
  if (target) {
    target.classList.add('section-active');
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  document.querySelectorAll('nav a').forEach(a => {
    a.classList.toggle('active', a.getAttribute('href') === `#${id}`);
  });
  history.replaceState(null, '', `#${id}`);
  // After section is visible: resize existing charts + re-render section-specific ones
  requestAnimationFrame(() => {
    window.dispatchEvent(new Event('resize'));
    if (id === 'athletes')  { renderComparisonTable(); }
    if (id === 'progress')  { renderTrendCharts(); renderProgress(); }
    if (id === 'charts')    { renderSpeedChart(currentRange.speed); renderDistanceChart(currentRange.distance); renderHrChart(currentRange.hr); renderDpsChart(currentRange.dps); }
    if (id === 'races')     { renderRaces(currentRacesAthlete || 1); }
    if (id === 'workouts')  { renderAnnualLibrary([...(athlete1Data?.workouts||[]), ...(athlete2Data?.workouts||[])]); }
  });
}

function setupNav() {
  document.querySelectorAll('nav a[href^="#"]').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      showSection(link.getAttribute('href').slice(1));
    });
  });

  // show initial section from hash or default to athletes
  const initial = (location.hash.slice(1)) || 'athletes';
  showSection(initial);
}

// ===== RACE SCHEDULE =====
// ⚠️ הוסיפו כאן כל תחרות עתידית לפני שהיא מתקיימת — הספירה לאחור תמצא אותה אוטומטית,
// ולאחר שהאירוע יסתיים תוצג הודעת סיום + קישור לתוצאות בלשונית "תחרויות"
// (יש להוסיף את התחרות גם למערך races בקובצי ה-JSON עם הנתונים בסיום)
const RACE_SCHEDULE = [
  { name: 'חיפה–עכו 2026', date: '2026-06-06T08:00:00+03:00', location: 'ים' },
  // { name: 'שם התחרות הבאה', date: '2026-09-01T09:00:00+03:00', location: '...' },
];

function startCountdown() {
  const banner = document.querySelector('.countdown-banner');
  if (!banner) return;

  const nameEl  = banner.querySelector('.countdown-event-name');
  const dateEl  = banner.querySelector('.countdown-date-label');
  const boxesEl = banner.querySelector('.countdown-boxes');
  const pad = n => String(n).padStart(2, '0');
  const fmtDateLabel = d => `${pad(d.getDate())}.${pad(d.getMonth()+1)}.${d.getFullYear()} &nbsp;|&nbsp; ${pad(d.getHours())}:${pad(d.getMinutes())}`;

  const now = Date.now();
  const RECENT_WINDOW = 72 * 3600 * 1000; // 72h — כמה זמן להציג הודעת "הסתיים" אחרי האירוע

  const scheduled = RACE_SCHEDULE
    .map(r => ({ ...r, targetMs: new Date(r.date).getTime() }))
    .sort((a, b) => a.targetMs - b.targetMs);

  const nextRace  = scheduled.find(r => r.targetMs > now);
  const justEnded = scheduled
    .filter(r => r.targetMs <= now && (now - r.targetMs) < RECENT_WINDOW)
    .sort((a, b) => b.targetMs - a.targetMs)[0];

  // אין אירוע קרוב ולא הסתיים אירוע לאחרונה — הסתר את הבאנר
  if (!nextRace && !justEnded) {
    banner.style.display = 'none';
    return;
  }
  banner.style.display = '';

  // אירוע הסתיים לאחרונה ואין אירוע עתידי קרוב — מצב "תוצאות"
  if (!nextRace) {
    if (nameEl) nameEl.textContent = `🏁 ${justEnded.name}`;
    if (dateEl) dateEl.innerHTML   = `${fmtDateLabel(new Date(justEnded.targetMs))} &nbsp;—&nbsp; האירוע הסתיים`;
    if (boxesEl) boxesEl.innerHTML = `
      <div class="countdown-done">
        🎉 כל הכבוד על הסיום! התוצאות עלו ללשונית התחרויות
        <button type="button" class="btn-view-results" onclick="showSection('races')">
          צפה בתוצאות 🏆
        </button>
      </div>`;
    return;
  }

  // יש אירוע עתידי — הצג ספירה לאחור
  const TARGET = new Date(nextRace.targetMs);
  if (nameEl) nameEl.textContent = `🏄 ${nextRace.name}`;
  if (dateEl) dateEl.innerHTML   = fmtDateLabel(TARGET);

  // החזר את מבנה התיבות אם הוחלף קודם להודעת סיום
  if (boxesEl && !document.getElementById('cd-days')) {
    boxesEl.innerHTML = `
      <div class="countdown-box"><div class="countdown-num" id="cd-days">--</div><div class="countdown-lbl">ימים</div></div>
      <div class="countdown-sep">:</div>
      <div class="countdown-box"><div class="countdown-num" id="cd-hours">--</div><div class="countdown-lbl">שעות</div></div>
      <div class="countdown-sep">:</div>
      <div class="countdown-box"><div class="countdown-num" id="cd-mins">--</div><div class="countdown-lbl">דקות</div></div>
      <div class="countdown-sep">:</div>
      <div class="countdown-box"><div class="countdown-num" id="cd-secs">--</div><div class="countdown-lbl">שניות</div></div>`;
  }

  let timer = null;
  function tick() {
    const diff = TARGET - Date.now();
    if (diff <= 0) {
      if (timer) clearInterval(timer);
      startCountdown(); // עבור אוטומטית למצב "הסתיים" / לאירוע הבא
      return;
    }
    const elDays  = document.getElementById('cd-days');
    const elHours = document.getElementById('cd-hours');
    const elMins  = document.getElementById('cd-mins');
    const elSecs  = document.getElementById('cd-secs');
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    if (elDays)  elDays.textContent  = d;
    if (elHours) elHours.textContent = pad(h);
    if (elMins)  elMins.textContent  = pad(m);
    if (elSecs)  elSecs.textContent  = pad(s);
  }

  tick();
  timer = setInterval(tick, 1000);
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  setupToggleButtons();
  setupFilters();
  setupProgress();
  setupRacesButtons();
  setupRacesTableControls();
  setupNav();
  startCountdown();
  loadData();

  document.getElementById('lightbox').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeLightbox();
  });

  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  document.getElementById('last-updated').textContent =
    `עדכון: ${pad(now.getDate())}/${pad(now.getMonth()+1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
});
