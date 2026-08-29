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

  ['speed','dist','hr','dps'].forEach(k => {
    const el1 = document.getElementById(`legend-${k}-1`);
    const el2 = document.getElementById(`legend-${k}-2`);
    if (el1) el1.textContent = athlete1Data.name;
    if (el2) el2.textContent = athlete2Data.name;
  });

  const wb1 = document.getElementById('workouts-btn-1');
  const wb2 = document.getElementById('workouts-btn-2');
  if (wb1) wb1.textContent = athlete1Data.name.split(' ')[0];
  if (wb2) wb2.textContent = athlete2Data.name.split(' ')[0];

  try { renderAll(); } catch(e) { console.error('renderAll failed:', e); }
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
  renderAnnualLibrary(athlete1Data?.workouts || []);
  renderProgress();
  renderRaces(1);
  buildAnnualCmpYearBtns();
  renderAnnualCmpTable();
  renderFitness(1);
  buildPlansByQuarter();
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

  setAthleteWeekStats('a1', w1, sum(w1, 'distance'), athlete1Data.workouts);
  setAthleteWeekStats('a2', w2, sum(w2, 'distance'), athlete2Data.workouts);

  renderAthleteBio('a1', athlete1Data);
  renderAthleteBio('a2', athlete2Data);

  tryLoadAvatar('athlete1-avatar', athlete1Data.profile_image, '🏄');
  tryLoadAvatar('athlete2-avatar', athlete2Data.profile_image, '🏄');
}

function setAthleteWeekStats(prefix, workouts, dist, allWorkouts) {
  const realWorkouts = workouts.filter(w => w.distance > 0);
  document.getElementById(`${prefix}-distance`).innerHTML = `${dist.toFixed(1)}<span class="stat-unit"> ק"מ</span>`;
  document.getElementById(`${prefix}-sessions`).textContent = realWorkouts.length;
  const topSpeed = maxVal(workouts, 'avg_speed');
  document.getElementById(`${prefix}-maxspeed`).innerHTML = topSpeed ? `${topSpeed.toFixed(1)}<span class="stat-unit"> קמ"ש</span>` : '—';

  // קוביית YTD
  const curYear = new Date().getFullYear();
  const ytdDist = (allWorkouts || []).filter(w => {
    if (!w.distance || w.distance === 0) return false;
    const d = parseDMY(w.date);
    return d && d.getFullYear() === curYear;
  }).reduce((s, w) => s + w.distance, 0);
  const ytdEl = document.getElementById(`${prefix}-ytd-dist`);
  if (ytdEl) ytdEl.innerHTML = `${ytdDist.toFixed(0)}<span class="stat-unit"> ק"מ</span>`;

  // קוביות סוגי אימון לחודש הנוכחי
  const TYPE_IDS = { 'אירובי': 'aerobic', 'אירובי ארוך': 'long', 'טמפו': 'tempo', 'ספרינטים': 'sprint' };
  const counts = { aerobic: 0, long: 0, tempo: 0, sprint: 0 };
  realWorkouts.forEach(w => { const k = TYPE_IDS[w.type]; if (k) counts[k]++; });
  Object.entries(counts).forEach(([k, v]) => {
    const el = document.getElementById(`${prefix}-t-${k}`);
    if (el) el.textContent = v;
  });

  // קוביות מרחק שנתי
  renderYearlyDist(prefix, allWorkouts || []);
}

function renderYearlyDist(prefix, allWorkouts) {
  const el = document.getElementById(`${prefix}-yearly-dist`);
  if (!el) return;
  const byYear = {};
  allWorkouts.forEach(w => {
    if (!w.distance || w.distance === 0) return;
    const d = parseDMY(w.date);
    if (!d) return;
    const y = d.getFullYear();
    byYear[y] = (byYear[y] || 0) + w.distance;
  });
  const years = Object.keys(byYear).map(Number).sort((a, b) => a - b);
  el.innerHTML = years.map(y =>
    `<div class="yearly-dist-box">
      <div class="yd-val">${byYear[y].toFixed(0)}<span class="yd-unit">ק"מ</span></div>
      <div class="yd-lbl">${y}</div>
    </div>`
  ).join('');
}

const MONTHS_HEB = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
const ANNUAL_TYPES = ['אירובי','אירובי ארוך','טמפו','ספרינטים'];

function renderAnnualLibrary(allWorkouts) {
  const el = document.getElementById('annual-library-table');
  if (!el) return;
  const year = new Date().getFullYear();

  const grid = {};
  ANNUAL_TYPES.forEach(t => { grid[t] = Array(12).fill(0); });
  allWorkouts.forEach(w => {
    if (!w.distance || w.distance === 0) return;
    const d = parseDMY(w.date);
    if (!d || d.getFullYear() !== year) return;
    if (grid[w.type]) grid[w.type][d.getMonth()]++;
  });

  // show only months that have any activity
  const activeMons = Array.from({length: 12}, (_, i) => i)
    .filter(i => ANNUAL_TYPES.some(t => grid[t][i] > 0));

  const monthTotals = Array(12).fill(0);
  ANNUAL_TYPES.forEach(t => grid[t].forEach((c, i) => { monthTotals[i] += c; }));
  const grandTotal = monthTotals.reduce((a, b) => a + b, 0);

  let html = `<table class="annual-cmp-tbl"><thead><tr>
    <th class="acmp-row-label">סוג אימון</th>`;
  activeMons.forEach(m => { html += `<th class="acmp-month">${MONTHS_HE[m]}</th>`; });
  html += `<th class="acmp-month">סה"כ</th></tr></thead><tbody>`;

  ANNUAL_TYPES.forEach((t, ri) => {
    const total = grid[t].reduce((a, b) => a + b, 0);
    html += `<tr class="${ri % 2 === 0 ? 'acmp-row-even' : ''}">
      <td class="acmp-row-label">${t}</td>`;
    activeMons.forEach(m => {
      const c = grid[t][m];
      html += `<td class="acmp-cell${c === 0 ? ' acmp-zero' : ''}">${c > 0 ? c : '—'}</td>`;
    });
    html += `<td class="acmp-cell acmp-grand-total">${total > 0 ? total : '—'}</td></tr>`;
  });

  // totals row
  html += `<tr class="acmp-sum-row"><td class="acmp-row-label">סיכום</td>`;
  activeMons.forEach(m => { html += `<td class="acmp-cell acmp-sum-cell">${monthTotals[m] > 0 ? monthTotals[m] : '—'}</td>`; });
  html += `<td class="acmp-cell acmp-sum-cell acmp-grand-total">${grandTotal}</td></tr>`;

  html += '</tbody></table>';
  el.innerHTML = html;
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
  if (!athlete1Data || !athlete2Data) return;
  const lastDate = athlete1Data.workouts
    .filter(w => w.distance > 0)
    .sort((a, b) => parseDMY(b.date) - parseDMY(a.date))[0]?.date || '';

  const lw1 = athlete1Data.workouts.find(w => w.date === lastDate) || {};
  const lw2 = athlete2Data.workouts.find(w => w.date === lastDate && w.distance > 0) || {};

  const typeEl = document.getElementById('last-workout-type');
  const dateEl = document.getElementById('last-workout-date');
  const planTypes = ['טמפו','ספרינטים'];
  const wNumLabel = planTypes.includes(lw1.type) && lw1.workout_name ? ` — ${lw1.workout_name}` : '';
  if (typeEl) typeEl.textContent = (lw1.type || '') + wNumLabel;
  if (dateEl) dateEl.textContent = lastDate || '';
  const startEl = document.getElementById('last-workout-start');
  if (startEl) {
    const h = lw1.start_hour;
    startEl.textContent = (h != null) ? `${String(h).padStart(2,'0')}:00` : '';
  }

  const metrics = [
    { label: 'מרחק', fmt: v => v ? v.toFixed(1) + ' ק"מ' : '—', num: w => w.distance || 0 },
    { label: 'זמן',  fmt: v => v || '—', num: w => 0, raw: w => w.duration || '' },
    { label: 'מהירות', fmt: v => v ? v.toFixed(1) : '—', num: w => w.avg_speed || 0 },
    { label: 'מהירות מקס', fmt: v => v ? v.toFixed(1) : '—', num: w => w.max_speed || 0 },
    { label: 'דופק', fmt: v => v ? v + '' : '—', num: w => w.avg_hr || 0, lower: true },
    { label: 'SPM',  fmt: v => v ? v + '' : '—', num: w => w.spm || 0 },
    { label: 'SPM מקס', fmt: v => v ? v + '' : '—', num: w => w.spm_max || 0 },
    { label: 'DPS',  fmt: v => v ? v.toFixed(2) : '—', num: w => w.dps || 0 },
    { label: 'Z3',   fmt: v => v && v !== '0:00' ? v : '—', num: w => 0, raw: w => w.z3 || '' },
    { label: 'Z4',   fmt: v => v && v !== '0:00' ? v : '—', num: w => 0, raw: w => w.z4 || '' },
    { label: 'Z5',   fmt: v => v && v !== '0:00' ? v : '—', num: w => 0, raw: w => w.z5 || '' },
  ];

  // weather chips
  const wxRow = document.getElementById('weather-chips-row');
  if (wxRow) {
    const chips = [];
    if (lw1.wind_kmh != null)      chips.push(`💨 ${lw1.wind_kmh} קמ"ש ${lw1.wind_dir_he || ''}`);
    if (lw1.wind_gusts_kmh != null) chips.push(`נחשולים ${lw1.wind_gusts_kmh} קמ"ש`);
    if (lw1.temp_c != null)         chips.push(`🌡️ ${lw1.temp_c}°C`);
    if (lw1.wave_height_m != null)  chips.push(`🌊 גל ${lw1.wave_height_m}מ' ${lw1.wave_dir_he || ''}`);
    if (chips.length) {
      wxRow.innerHTML = chips.map(c => `<span class="weather-chip">${c}</span>`).join('');
      wxRow.style.display = 'flex';
    } else {
      wxRow.style.display = 'none';
    }
  }

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

// ===== TRAINING PLANS =====
const TRAINING_PLANS = {
  tempo: {
    q1: [
      { name: 'אימון טמפו 1', dur: 80, steps: [
        { t:'warmup', d:"10 דק'", hr:'110-120' },
        { t:'warmup', d:"5 דק'",  hr:'130-135' },
        { t:'repeat', n:3, steps:[
          { t:'interval', d:"10 דק'", hr:'135-140' },
          { t:'interval', d:"10 דק'", hr:'150-155' },
        ]},
        { t:'cooldown', d:"5 דק'", hr:'110-120' },
      ]},
      { name: 'אימון טמפו 2', dur: 80, steps: [
        { t:'warmup', d:"10 דק'", hr:'110-125' },
        { t:'warmup', d:"5 דק'",  hr:'130-135' },
        { t:'repeat', n:4, steps:[
          { t:'interval', d:"6 דק'",  hr:'135-140' },
          { t:'interval', d:"4 דק'",  hr:'146-155' },
          { t:'recover',  d:"2 דק'",  hr:'115-125' },
        ]},
        { t:'interval', d:"12 דק'", hr:'130-140' },
        { t:'cooldown',  d:"5 דק'",  hr:'115-125' },
      ]},
      { name: 'אימון טמפו 3', dur: 75, steps: [
        { t:'warmup', d:"10 דק'", hr:null },
        { t:'warmup', d:"5 דק'",  hr:'130-135' },
        { t:'repeat', n:3, steps:[
          { t:'interval', d:"8 דק'",  hr:'145-155' },
          { t:'interval', d:"12 דק'", hr:'135-145' },
        ]},
      ]},
      { name: 'אימון טמפו 4', dur: 79, steps: [
        { t:'warmup', d:"10 דק'", hr:'110-125' },
        { t:'warmup', d:"5 דק'",  hr:'127-135' },
        { t:'interval', d:"6 דק'",  hr:'132-138' },
        { t:'interval', d:"4 דק'",  hr:'146-152' },
        { t:'interval', d:"8 דק'",  hr:'134-140' },
        { t:'interval', d:"4 דק'",  hr:'148-156' },
        { t:'interval', d:"10 דק'", hr:'136-142' },
        { t:'interval', d:"4 דק'",  hr:'150-158' },
        { t:'interval', d:"8 דק'",  hr:'134-140' },
        { t:'interval', d:"4 דק'",  hr:'148-156' },
        { t:'interval', d:"6 דק'",  hr:'132-138' },
        { t:'cooldown', d:"5 דק'",  hr:'110-125' },
      ]},
      { name: 'אימון טמפו 5', dur: 80, steps: [
        { t:'warmup', d:"10 דק'", hr:'110-120' },
        { t:'warmup', d:"5 דק'",  hr:'130-135' },
        { t:'repeat', n:4, steps:[
          { t:'interval', d:"5 דק'",  hr:'145-155' },
          { t:'interval', d:"10 דק'", hr:'135-145' },
        ]},
        { t:'cooldown', d:"5 דק'", hr:'110-120' },
      ]},
    ],
    q2: [],
    q3: [
      { name: 'אימון טמפו 6', dur: 81, steps: [
        { t:'warmup', d:"10 דק'", hr:null },
        { t:'warmup', d:"5 דק'",  hr:'127-135' },
        { t:'repeat', n:3, steps:[
          { t:'interval', d:"7 דק'", hr:'135-140' },
          { t:'interval', d:"7 דק'", hr:'145-150' },
          { t:'interval', d:"6 דק'", hr:'155-160' },
          { t:'cooldown', d:"2 דק'", hr:'120-126' },
        ]},
      ]},
      { name: 'אימון טמפו 7', dur: 80, steps: [
        { t:'warmup', d:"10 דק'", hr:null },
        { t:'warmup', d:"5 דק'",  hr:'127-135' },
        { t:'repeat', n:4, steps:[
          { t:'interval', d:"5 דק'", hr:'135-140' },
          { t:'interval', d:"3 דק'", hr:'150-155' },
          { t:'interval', d:"2 דק'", hr:'155-160' },
          { t:'cooldown', d:"2 דק'", hr:'120-126' },
        ]},
        { t:'interval', d:"7 דק'", hr:'130-140' },
      ]},
      { name: 'אימון טמפו 8', dur: 75, steps: [
        { t:'warmup', d:"10 דק'", hr:null },
        { t:'warmup', d:"5 דק'",  hr:'127-135' },
        { t:'repeat', n:8, steps:[
          { t:'interval', d:"3 דק'", hr:'150-155' },
          { t:'recover',  d:"2 דק'", hr:'140-145' },
        ]},
        { t:'interval', d:"15 דק'", hr:'147-155' },
        { t:'interval', d:"5 דק'",  hr:'156-162' },
      ]},
      { name: 'אימון טמפו 9', dur: 75, steps: [
        { t:'warmup', d:"10 דק'", hr:null },
        { t:'warmup', d:"5 דק'",  hr:'127-135' },
        { t:'interval', d:"15 דק'", hr:'135-140' },
        { t:'interval', d:"10 דק'", hr:'145-150' },
        { t:'interval', d:"5 דק'",  hr:'140-145' },
        { t:'interval', d:"5 דק'",  hr:'145-150' },
        { t:'interval', d:"5 דק'",  hr:'150-160' },
        { t:'interval', d:"10 דק'", hr:'150-160' },
      ]},
    ],
  },
  sprints: {
    q1: [
      { name: 'ספרינט 1', dur: 77, steps: [
        { t:'warmup',  d:"10 דק'", hr:null },
        { t:'interval', d:"5 דק'",  hr:null },
        { t:'repeat', n:8, steps:[
          { t:'interval', d:"0:20",  hr:'155-170' },
          { t:'recover',  d:"1:40",  hr:'125-135' },
        ]},
        { t:'interval', d:"10 דק'", hr:'130-140' },
        { t:'repeat', n:8, steps:[
          { t:'interval', d:"0:20",  hr:'155-170' },
          { t:'recover',  d:"1:40",  hr:'125-135' },
        ]},
        { t:'interval', d:"20 דק'", hr:'130-140' },
      ]},
      { name: 'ספרינט 2', dur: 77, steps: [
        { t:'warmup',  d:"10 דק'", hr:null },
        { t:'interval', d:"5 דק'",  hr:null },
        { t:'repeat', n:8, steps:[
          { t:'interval', d:"0:25",  hr:'155-170' },
          { t:'recover',  d:"1:35",  hr:'125-135' },
        ]},
        { t:'interval', d:"10 דק'", hr:'130-140' },
        { t:'repeat', n:8, steps:[
          { t:'interval', d:"0:25",  hr:'155-170' },
          { t:'recover',  d:"1:35",  hr:'125-135' },
        ]},
        { t:'interval', d:"20 דק'", hr:'130-140' },
      ]},
      { name: 'ספרינטים 3', dur: 82, steps: [
        { t:'warmup',  d:"10 דק'", hr:null },
        { t:'interval', d:"5 דק'",  hr:null },
        { t:'repeat', n:8, steps:[
          { t:'interval', d:"0:30",  hr:'155-170' },
          { t:'recover',  d:"1:30",  hr:'125-135' },
        ]},
        { t:'interval', d:"15 דק'", hr:'130-140' },
        { t:'repeat', n:8, steps:[
          { t:'interval', d:"0:30",  hr:'155-170' },
          { t:'recover',  d:"1:30",  hr:'125-135' },
        ]},
        { t:'interval', d:"15 דק'", hr:'130-140' },
        { t:'cooldown', d:"5 דק'",  hr:null },
      ]},
      { name: 'ספרינטים 4', dur: 74, steps: [
        { t:'warmup',  d:"10 דק'", hr:null },
        { t:'warmup',  d:"20 דק'", hr:null },
        { t:'repeat', n:8, steps:[
          { t:'interval', d:"0:40",  hr:null },
          { t:'recover',  d:"0:30",  hr:null },
        ]},
        { t:'interval', d:"5 דק'",  hr:null },
        { t:'repeat', n:8, steps:[
          { t:'interval', d:'0.1 ק"מ', hr:null },
          { t:'recover',  d:"2:30",  hr:null },
        ]},
        { t:'cooldown', d:"10 דק'", hr:null },
      ]},
    ],
    q2: [],
    q3: [
      { name: 'ספרינט 5', dur: 65, steps: [
        { t:'warmup', d:"10 דק'", hr:null },
        { t:'warmup', d:"5 דק'",  hr:'127-135' },
        { t:'repeat', n:10, steps:[
          { t:'interval', d:"0:20",  hr:null },
          { t:'interval', d:"1:10",  hr:null },
        ]},
        { t:'interval', d:"10 דק'", hr:null },
        { t:'repeat', n:10, steps:[
          { t:'interval', d:"0:20",  hr:null },
          { t:'interval', d:"1:10",  hr:null },
        ]},
        { t:'interval', d:"10 דק'", hr:null },
      ]},
      { name: 'ספרינט 6', dur: 65, steps: [
        { t:'warmup', d:"10 דק'", hr:null },
        { t:'warmup', d:"5 דק'",  hr:'127-135' },
        { t:'repeat', n:10, steps:[
          { t:'interval', d:"0:25",  hr:null },
          { t:'interval', d:"1:05",  hr:null },
        ]},
        { t:'interval', d:"10 דק'", hr:null },
        { t:'repeat', n:10, steps:[
          { t:'interval', d:"0:25",  hr:null },
          { t:'interval', d:"1:05",  hr:null },
        ]},
        { t:'interval', d:"10 דק'", hr:null },
      ]},
    ],
  },
};

const HRMAX = 183;
function hrToZone(mid) {
  const p = mid / HRMAX * 100;
  if (p < 60) return { z:'Z1', bg:'rgba(79,195,247,0.15)',  fg:'#4fc3f7' };
  if (p < 70) return { z:'Z2', bg:'rgba(102,187,106,0.18)', fg:'#66bb6a' };
  if (p < 80) return { z:'Z3', bg:'rgba(255,183,0,0.18)',   fg:'#ffb700' };
  if (p < 90) return { z:'Z4', bg:'rgba(255,167,38,0.22)',  fg:'#ffa726' };
  return             { z:'Z5', bg:'rgba(239,83,80,0.22)',   fg:'#ef5350' };
}
function hrBadgeHtml(hr) {
  if (!hr) return '';
  const parts = hr.split('-').map(Number);
  const mid = (parts[0] + (parts[1] || parts[0])) / 2;
  const { z, bg, fg } = hrToZone(mid);
  return `<span class="tp-step-hr" style="background:${bg};color:${fg}">${hr}&nbsp;&nbsp;<b>${z}</b></span>`;
}

const STEP_COLORS = {
  warmup:'#4fc3f7', cooldown:'#66bb6a', interval:'#ffa726',
  recover:'#90caf9', recovery:'#90caf9', rest:'#90caf9',
};
const STEP_HE = { warmup:'חימום', cooldown:'שחרור', interval:'אינטרוול', recover:'התאוששות', recovery:'התאוששות', rest:'מנוחה' };

function renderStep(s) {
  const color = STEP_COLORS[s.t] || '#fff';
  const label = STEP_HE[s.t] || s.t;
  return `<div class="tp-step">
    <span class="tp-step-label" style="color:${color};font-weight:600">${label}</span>
    <span class="tp-step-dur">${s.d}</span>
    ${hrBadgeHtml(s.hr)}
  </div>`;
}

function renderSteps(steps) {
  return steps.map(s => {
    if (s.t === 'repeat') {
      const inner = s.steps.map(renderStep).join('');
      return `<div class="tp-repeat-block">
        <div class="tp-repeat-header">🔁 ×${s.n}</div>
        ${inner}
      </div>`;
    }
    return renderStep(s);
  }).join('');
}

function renderWorkoutCard(w) {
  return `<div class="tp-card">
    <div class="tp-card-header">
      <span class="tp-card-name">${w.name}</span>
      <span class="tp-card-dur">⏱ ${w.dur} דק'</span>
    </div>
    <div class="tp-card-body">${renderSteps(w.steps)}</div>
  </div>`;
}

function dateToQ(dateStr) {
  const parts = dateStr.split('.');
  const m = parseInt(parts[1], 10);
  if (m <= 3) return 'q1';
  if (m <= 6) return 'q2';
  if (m <= 9) return 'q3';
  return 'q4';
}

function findPlanWorkout(type, workoutName) {
  const planType = type === 'טמפו' ? 'tempo' : type === 'ספרינטים' ? 'sprints' : null;
  if (!planType || !workoutName) return null;
  for (const qs of ['q1','q2','q3','q4']) {
    const cards = TRAINING_PLANS[planType][qs] || [];
    const found = cards.find(c => c.name === workoutName);
    if (found) return found;
  }
  return null;
}

function showPlanModal(plan) {
  let modal = document.getElementById('plan-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'plan-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:9000;display:flex;align-items:center;justify-content:center;padding:16px';
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
  }
  modal.innerHTML = `
    <div style="background:var(--card-bg,#1e2633);border-radius:12px;max-width:420px;width:100%;max-height:90vh;overflow-y:auto;padding:20px;position:relative">
      <button onclick="document.getElementById('plan-modal').remove()"
        style="position:absolute;top:10px;left:10px;background:none;border:none;color:#90a4ae;font-size:20px;cursor:pointer;line-height:1">✕</button>
      <div style="font-size:15px;font-weight:700;color:var(--text-primary,#fff);margin-bottom:4px;text-align:right">${plan.name}</div>
      <div style="font-size:12px;color:#90a4ae;margin-bottom:14px;text-align:right">⏱ ${plan.dur} דק'</div>
      ${renderSteps(plan.steps)}
    </div>`;
}

function buildPlansByQuarter() {
  const allWorkouts = [
    ...(athlete1Data?.workouts || []),
    ...(athlete2Data?.workouts || []),
  ].filter(w => ['טמפו','ספרינטים'].includes(w.type) && w.workout_name && w.distance > 0 && w.date);

  const tempoByQ   = { q1: new Set(), q2: new Set(), q3: new Set(), q4: new Set() };
  const sprintsByQ = { q1: new Set(), q2: new Set(), q3: new Set(), q4: new Set() };

  allWorkouts.forEach(w => {
    const q = dateToQ(w.date);
    if (w.type === 'טמפו')     tempoByQ[q].add(w.workout_name);
    if (w.type === 'ספרינטים') sprintsByQ[q].add(w.workout_name);
  });

  const sortByNum = arr => arr.sort((a, b) => {
    const na = parseInt((a.name.match(/\d+/) || [0])[0]);
    const nb = parseInt((b.name.match(/\d+/) || [0])[0]);
    return na - nb;
  });

  ['q1','q2','q3','q4'].forEach(q => {
    const tempoEl = document.getElementById(`tp-cards-tempo-${q}`);
    if (tempoEl) {
      const cards = sortByNum([...tempoByQ[q]].map(n => findPlanWorkout('טמפו', n)).filter(Boolean));
      tempoEl.innerHTML = cards.length
        ? cards.map(renderWorkoutCard).join('')
        : '<div class="tp-empty-quarter">אין אימוני טמפו ברבעון זה</div>';
    }
    const sprintsEl = document.getElementById(`tp-cards-sprints-${q}`);
    if (sprintsEl) {
      const cards = sortByNum([...sprintsByQ[q]].map(n => findPlanWorkout('ספרינטים', n)).filter(Boolean));
      sprintsEl.innerHTML = cards.length
        ? cards.map(renderWorkoutCard).join('')
        : '<div class="tp-empty-quarter">אין אימוני ספרינטים ברבעון זה</div>';
    }
  });
}

function activateTPQuarter(q) {
  // Activate the correct quarter in both tempo and sprints panes
  ['#tp-pane-tempo', '#tp-pane-sprints'].forEach(pane => {
    const btns = document.querySelectorAll(`${pane} .tp-q-btn`);
    const panes = document.querySelectorAll(`${pane} .tp-q-pane`);
    btns.forEach(b => b.classList.remove('active'));
    panes.forEach(p => p.classList.add('hidden'));
    const target = [...btns].find(b => b.dataset.q === q || b.dataset.q === 's' + q);
    if (target) {
      target.classList.add('active');
      const paneId = `tp-q-${target.dataset.q}`;
      const paneEl = document.getElementById(paneId);
      if (paneEl) paneEl.classList.remove('hidden');
    }
  });
}

function initTrainingPlans() {
  // Cards are built dynamically in buildPlansByQuarter() after data loads

  // Auto-select current quarter on load
  activateTPQuarter(currentQuarter());

  // Type tab switching
  document.querySelectorAll('.tp-type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tp-type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const type = btn.dataset.type;
      document.querySelectorAll('.tp-pane').forEach(p => p.classList.add('hidden'));
      document.getElementById(`tp-pane-${type}`).classList.remove('hidden');
    });
  });

  // Quarter tab switching (tempo)
  document.querySelectorAll('#tp-pane-tempo .tp-q-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#tp-pane-tempo .tp-q-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('#tp-pane-tempo .tp-q-pane').forEach(p => p.classList.add('hidden'));
      document.getElementById(`tp-q-${btn.dataset.q}`).classList.remove('hidden');
    });
  });

  // Quarter tab switching (sprints)
  document.querySelectorAll('#tp-pane-sprints .tp-q-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#tp-pane-sprints .tp-q-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('#tp-pane-sprints .tp-q-pane').forEach(p => p.classList.add('hidden'));
      document.getElementById(`tp-q-${btn.dataset.q}`).classList.remove('hidden');
    });
  });
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
    tbody.innerHTML = '<tr><td colspan="15" class="empty-state"><div class="empty-icon">🌊</div><p>אין אימונים תואמים לפילטר</p></td></tr>';
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

    const locIcon = '';
    const badgeClass = w.athlete === 1 ? 'badge-athlete1' : 'badge-athlete2';
    const isZero = w.distance === 0;

    tr.style.opacity = isZero ? '0.45' : '1';

    const num = dateToNum[w.date];
    const showNum = !seenDates.has(w.date);
    if (showNum) seenDates.add(w.date);

    const planTypes = ['טמפו','ספרינטים'];
    const workoutNum = planTypes.includes(w.type) && w.workout_name ? w.workout_name : '';
    const planCard = findPlanWorkout(w.type, w.workout_name);
    const planBtn = planCard
      ? `<button class="plan-peek-btn" onclick='showPlanModal(${JSON.stringify(planCard)})' title="מבנה אימון">פרטים</button>`
      : '';

    tr.innerHTML = `
      <td class="workout-num">${showNum ? num : ''}</td>
      <td>${w.date}</td>
      <td><span class="${badgeClass}">${w.athleteName}</span></td>
      <td><span class="type-badge ${typeBadge[w.type] || ''}">${w.type}</span></td>
      <td style="font-size:0.8rem;color:var(--accent-cyan);white-space:nowrap">${workoutNum}${planBtn}</td>
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
function setupWorkoutsAthleteSelector() {
  document.querySelectorAll('.workouts-athlete-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.workouts-athlete-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const athleteNum = parseInt(btn.dataset.athlete);
      const workouts = athleteNum === 2 ? athlete2Data.workouts : athlete1Data.workouts;
      renderAnnualLibrary(workouts);
    });
  });
}

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
  q1:       { start: new Date(2026,0,1),  end: new Date(2026,2,31),  label: 'Q1 — ינואר-מרץ 2026',        baseRef: 'base',     showVsDec: false, yoyStart: new Date(2025,0,1),  yoyEnd: new Date(2025,2,31),  yoyLabel: "vs Q1'25" },
  q2:       { start: new Date(2026,3,1),  end: new Date(2026,5,30),  label: 'Q2 — אפריל-יוני 2026',        baseRef: 'q1',       showVsDec: false, yoyStart: new Date(2025,3,1),  yoyEnd: new Date(2025,5,30),  yoyLabel: "vs Q2'25" },
  q3:       { start: new Date(2026,6,1),  end: new Date(2026,8,30),  label: 'Q3 — יולי-ספטמבר 2026',      baseRef: 'q2',       showVsDec: false, yoyStart: new Date(2025,6,1),  yoyEnd: new Date(2025,8,30),  yoyLabel: "vs Q3'25" },
  q4:       { start: new Date(2026,9,1),  end: new Date(2026,11,31), label: 'Q4 — אוקטובר-דצמבר 2026',    baseRef: 'q3',       showVsDec: false, yoyStart: new Date(2025,9,1),  yoyEnd: new Date(2025,11,31), yoyLabel: "vs Q4'25" },
  h1:       { isH1: true,                                             label: 'חצי שנתי — ממוצע Q1+Q2',     baseRef: 'base',     showVsDec: false },
  year:     { isMultiYear: true,                                      label: 'שנה — 2024 / 2025 / 2026',   baseRef: null,       showVsDec: false },
};
// Base reference = Q4 2025 (אוקטובר–דצמבר 2025)
const PROG_BASE = { start: new Date(2025,9,1), end: new Date(2025,11,31) };

const PROG_TYPES = [
  {
    key: 'aerobic', types: ['אירובי'], label: 'אירובי', icon: '🏄',
    metrics: [
      { key: 'distance_total', label: "סה\"כ מרחק",   unit: "ק\"מ",  lb: false },
      { key: 'spm',            label: 'SPM',            unit: '',      lb: false },
      { key: 'hr',             label: 'דופק',           unit: 'BPM',   lb: true  },
      { key: 'dps',            label: 'DPS',             unit: "מ'",    lb: false },
      { key: 'speed',          label: 'מהירות',          unit: 'קמ"ש', lb: false },
      { key: 'eff',            label: 'Stroke Index',    unit: '',      lb: false },
      { key: 'ase',            label: 'ASE',             unit: '',      lb: false },
      { key: 'pa_hr',          label: 'Pa:HR',           unit: '%',     lb: true  },
    ]
  },
  {
    key: 'tempo', types: ['טמפו'], label: 'טמפו / אינטרוואלים', icon: '🌊',
    metrics: [
      { key: 'distance_total', label: "סה\"כ מרחק",   unit: "ק\"מ",  lb: false },
      { key: 'spm',            label: 'SPM',            unit: '',      lb: false },
      { key: 'hr',             label: 'דופק',           unit: 'BPM',   lb: true  },
      { key: 'dps',            label: 'DPS',             unit: "מ'",    lb: false },
      { key: 'speed',          label: 'מהירות',          unit: 'קמ"ש', lb: false },
      { key: 'eff',            label: 'Stroke Index',    unit: '',      lb: false },
      { key: 'ase',            label: 'ASE',             unit: '',      lb: false },
    ]
  },
  {
    key: 'aerobic_long', types: ['אירובי ארוך'], label: 'אירובי ארוך', icon: '🌅',
    metrics: [
      { key: 'distance_total', label: "סה\"כ מרחק",   unit: "ק\"מ",  lb: false },
      { key: 'spm',            label: 'SPM',            unit: '',      lb: false },
      { key: 'hr',             label: 'דופק',           unit: 'BPM',   lb: true  },
      { key: 'dps',            label: 'DPS',             unit: "מ'",    lb: false },
      { key: 'speed',          label: 'מהירות',          unit: 'קמ"ש', lb: false },
      { key: 'eff',            label: 'Stroke Index',    unit: '',      lb: false },
      { key: 'ase',            label: 'ASE',             unit: '',      lb: false },
      { key: 'pa_hr',          label: 'Pa:HR',           unit: '%',     lb: true  },
    ]
  },
  {
    key: 'sprints', types: ['ספרינטים'], label: 'ספרינטים', icon: '⚡',
    metrics: [
      { key: 'sprint_avg_speed', label: 'מהירות ממוצע', unit: 'קמ"ש', lb: false },
      { key: 'spm_max',          label: 'SPM מקס',       unit: '',      lb: false },
      { key: 'sprint_avg_hr',    label: 'דופק ממוצע',    unit: 'BPM',   lb: true  },
    ]
  },
];

let progAthlete = 1;

function currentQuarter() {
  const m = new Date().getMonth(); // 0-based
  if (m <= 2) return 'q1';
  if (m <= 5) return 'q2';
  if (m <= 8) return 'q3';
  return 'q4';
}
let progPeriod = currentQuarter();

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
  const vmNullable = key => { const v = ws.map(w=>w[key]).filter(x=>x!=null && x!==0); return v.length ? v.reduce((a,b)=>a+b,0)/v.length : null; };
  const spd = vm('avg_speed'), hr = vm('avg_hr'), dps = vm('dps');
  const spd_ms = spd / 3.6;
  const si  = (spd_ms > 0 && dps > 0) ? +(spd_ms * dps).toFixed(3) : 0;   // Stroke Index
  const ase = (si > 0 && hr > 0)       ? +(si / hr * 100).toFixed(3) : 0;  // Aerobic Stroke Economy
  const distTotal = ws.reduce((s,w)=>s+(w.distance||0),0);
  return { count: ws.length, speed: spd, hr, dps, spm: vm('spm'),
           spm_max: vm('spm_max'),
           sprint_avg_speed: vm('sprint_avg_speed'),
           sprint_avg_hr: vm('sprint_avg_hr'),
           distance_total: distTotal,
           distance: distTotal / ws.length,
           eff: si,   // SI replaces old speed/HR formula
           ase,
           pa_hr: vmNullable('pa_hr') };
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
  if (val == null || val === 0) return '—';
  if (key === 'eff')      return (+val).toFixed(2);   // Stroke Index
  if (key === 'ase')      return (+val).toFixed(2);   // ASE
  if (key === 'pa_hr')    return (+val).toFixed(1);   // Pa:HR %
  if (key === 'speed')    return (+val).toFixed(1);
  if (key === 'hr' || key === 'spm' || key === 'spm_max' || key === 'sprint_avg_hr') return Math.round(val);
  if (key === 'sprint_avg_speed') return (+val).toFixed(1);
  if (key === 'dps')      return (+val).toFixed(2);
  if (key === 'distance')       return (+val).toFixed(1);
  if (key === 'distance_total') return (+val).toFixed(1);
  return val;
}

function progDelta(bv, cv, lb) {
  if (bv == null || cv == null || bv === 0 || cv === 0) return null;
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

function renderProgCard(typeConf, base, curr, decBase, showVsDec, periodKey, yoy, yoyLabel) {
  const b  = base[typeConf.key];
  const c  = curr[typeConf.key];
  const db = decBase[typeConf.key];   // Dec 2025 always
  const y  = yoy?.[typeConf.key];

  if (!b && !c) return `
    <div class="prog-card glass-card">
      <div class="prog-card-hdr"><span class="prog-icon">${typeConf.icon}</span><span class="prog-type-lbl">${typeConf.label}</span></div>
      <div class="prog-empty">אין נתונים לסוג אימון זה בתקופות אלה</div>
    </div>`;

  const future = !c ? `<div class="prog-future">⏳ נתונים יגיעו בתקופה זו</div>` : '';

  const hasYoY = !!(yoy && yoyLabel);
  const rows = typeConf.metrics.map(m => {
    const bv = b?.[m.key], cv = c?.[m.key], dv = db?.[m.key], yv = y?.[m.key];
    const dRolling = (b && c) ? progDelta(bv, cv, m.lb) : null;
    const dVsDec   = (showVsDec && db && c) ? progDelta(dv, cv, m.lb) : null;
    const dYoY     = (hasYoY && y && c) ? progDelta(yv, cv, m.lb) : null;
    const vsDecCol = showVsDec ? progDeltaHtml(dVsDec) : '';
    const yoyCol   = hasYoY
      ? `<span class="pm-yoy-val">${progFmtVal(yv, m.key)}<small>${m.unit}</small></span>${progDeltaHtml(dYoY)}`
      : '';
    const rowClass = hasYoY ? 'pm-row-7' : showVsDec ? 'pm-row-6' : '';
    return `
      <div class="pm-row ${rowClass}">
        <span class="pm-lbl">${m.label}</span>
        <span class="pm-bv">${progFmtVal(bv, m.key)}<small>${m.unit}</small></span>
        <span class="pm-sep">→</span>
        <span class="pm-cv">${progFmtVal(cv, m.key)}<small>${m.unit}</small></span>
        ${progDeltaHtml(dRolling)}
        ${vsDecCol}
        ${yoyCol}
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
  const yoyCountN   = y?.count ?? 0;
  const yoyHeader   = hasYoY
    ? `<span class="pm-yoy-hdr">${yoyLabel}</span><span class="pm-yoy-hdr">שינוי YoY</span>`
    : '';
  const yoyCountStr = hasYoY && yoyCountN > 0 ? ` · ${yoyCountN} אימון ${yoyLabel}` : '';

  // H1 note
  const h1Note = PROG_PERIODS[periodKey]?.isH1
    ? `<div class="prog-h1-info">📊 ממוצע Q1+Q2 — יתעדכן עם סיום יוני 2026</div>` : '';

  const headClass = hasYoY ? 'pm-head-7' : showVsDec ? 'pm-head-6' : '';

  return `
    <div class="prog-card glass-card">
      <div class="prog-card-hdr">
        <div><span class="prog-icon">${typeConf.icon}</span><span class="prog-type-lbl">${typeConf.label}</span></div>
        <div class="prog-counts">${baseN} אימון ${baseLabel} · ${currN} אימון ${currLabel}${yoyCountStr}</div>
      </div>
      ${fewWarning}
      <div class="pm-head-row ${headClass}">
        <span></span><span>${baseLabel}</span><span></span><span>${currLabel}</span><span>שינוי</span>${vsDecHeader}${yoyHeader}
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
  const yoyNote = p.yoyLabel
    ? `<span class="ppi-sep">|</span><span class="ppi-yoy">📅 YoY = ${p.yoyLabel} — אותה תקופה אשתקד</span>`
    : '';
  if (infoEl) infoEl.innerHTML = baseLabel
    ? `<span class="ppi-period">${p.label}</span><span class="ppi-sep">·</span><span class="ppi-base">השוואה מול ${baseLabel}</span>${yoyNote}`
    : `<span class="ppi-period">${p.label}</span>${yoyNote}`;

  // YoY stats — same quarter last year
  const yoy = p.yoyStart ? PROG_TYPES.reduce((acc, t) => {
    acc[t.key] = progCalcStats(ath.workouts, p.yoyStart, p.yoyEnd, t.types);
    return acc;
  }, {}) : null;

  // Cards
  const cardsEl = document.getElementById('prog-cards');
  if (cardsEl) cardsEl.innerHTML = PROG_TYPES.map(t =>
    renderProgCard(t, base, curr, decBase, p.showVsDec, progPeriod, yoy, p.yoyLabel)
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

  PROG_TYPES.forEach(t => {
    const id = `trend-chart-${t.key}`;
    if (trendCharts[id]) { trendCharts[id].destroy(); delete trendCharts[id]; }
  });

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
  // Auto-activate current quarter button
  const pq = currentQuarter();
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

// ===== ANNUAL COMPARISON TABLE =====
const MONTHS_HE = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];

let annualCmpAthlete = 1;
let annualCmpYear = new Date().getFullYear();

function renderAnnualCmpTable() {
  const workouts = annualCmpAthlete === 2 ? (athlete2Data?.workouts || []) : (athlete1Data?.workouts || []);
  const year = annualCmpYear;

  // bucket workouts by month for selected year
  const byMonth = Array.from({length: 12}, () => []);
  workouts.forEach(w => {
    const d = parseDMY(w.date);
    if (!d || d.getFullYear() !== year) return;
    byMonth[d.getMonth()].push(w);
  });

  // find which months have any data (to show only relevant columns)
  const activeMons = byMonth.map((ws, i) => ws.length > 0 ? i : -1).filter(i => i >= 0);

  // title update
  const titleEl = document.getElementById('annual-cmp-title');
  if (titleEl) titleEl.textContent = `השוואת אימונים שנתי ${year}`;

  const el = document.getElementById('annual-cmp-table');
  if (!el) return;

  if (activeMons.length === 0) {
    el.innerHTML = '<div class="annual-cmp-empty">אין נתונים לשנה זו</div>';
    return;
  }

  const rows = [
    { key: 'sessions', label: 'כמות אימונים', fmt: v => v > 0 ? v : '—' },
    { key: 'distance', label: 'סה"כ מרחק', fmt: v => v > 0 ? v.toFixed(1) + ' ק"מ' : '—' },
    { key: 'maxspeed', label: 'שיא מהירות', fmt: v => v > 0 ? v.toFixed(1) + ' קמ"ש' : '—' },
    { key: 'avgspeed', label: 'מהירות ממוצע', fmt: v => v > 0 ? v.toFixed(1) + ' קמ"ש' : '—' },
    { key: 'avgdps',   label: 'DPS ממוצע', fmt: v => v > 0 ? v.toFixed(2) + ' מ\'': '—' },
  ];

  // compute per-month stats
  const stats = byMonth.map(ws => {
    const real = ws.filter(w => w.distance > 0);
    return {
      sessions: real.length,
      distance: real.reduce((s, w) => s + (w.distance || 0), 0),
      maxspeed: real.reduce((mx, w) => Math.max(mx, w.avg_speed || 0), 0),
      avgspeed: real.length ? real.reduce((s, w) => s + (w.avg_speed || 0), 0) / real.length : 0,
      avgdps:   real.length ? real.reduce((s, w) => s + (w.dps || 0), 0) / real.length : 0,
    };
  });

  // header row
  let html = '<table class="annual-cmp-tbl"><thead><tr><th class="acmp-row-label">מדד</th>';
  activeMons.forEach(m => { html += `<th class="acmp-month">${MONTHS_HE[m]}</th>`; });
  html += '</tr></thead><tbody>';

  rows.forEach((row, ri) => {
    html += `<tr class="${ri % 2 === 0 ? 'acmp-row-even' : ''}"><td class="acmp-row-label">${row.label}</td>`;
    activeMons.forEach(m => {
      const val = stats[m][row.key];
      html += `<td class="acmp-cell">${row.fmt(val)}</td>`;
    });
    html += '</tr>';
  });

  html += '</tbody></table>';
  el.innerHTML = html;
}

function setupAnnualCmp() {
  // athlete buttons
  document.querySelectorAll('.annual-cmp-athlete-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.annual-cmp-athlete-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      annualCmpAthlete = parseInt(btn.dataset.athlete);
      renderAnnualCmpTable();
    });
  });
}

function buildAnnualCmpYearBtns() {
  const years1 = [...new Set((athlete1Data?.workouts || []).map(w => { const d = parseDMY(w.date); return d ? d.getFullYear() : null; }).filter(Boolean))];
  const years2 = [...new Set((athlete2Data?.workouts || []).map(w => { const d = parseDMY(w.date); return d ? d.getFullYear() : null; }).filter(Boolean))];
  const years = [...new Set([...years1, ...years2])].sort((a, b) => b - a);

  const container = document.getElementById('annual-cmp-year-btns');
  if (!container) return;

  container.innerHTML = years.map(y =>
    `<button class="annual-cmp-year-btn${y === annualCmpYear ? ' active' : ''}" data-year="${y}">${y}</button>`
  ).join('');

  container.querySelectorAll('.annual-cmp-year-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.annual-cmp-year-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      annualCmpYear = parseInt(btn.dataset.year);
      renderAnnualCmpTable();
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
    if (id === 'comparison') { renderComparisonTable(); renderAnnualCmpTable(); }
    if (id === 'progress')  { renderTrendCharts(); renderProgress(); }
    if (id === 'charts')    { renderSpeedChart(currentRange.speed); renderDistanceChart(currentRange.distance); renderHrChart(currentRange.hr); renderDpsChart(currentRange.dps); }
    if (id === 'races')     { renderRaces(currentRacesAthlete || 1); }
    if (id === 'workouts')  { const activeBtn = document.querySelector('.workouts-athlete-btn.active'); const aN = activeBtn ? parseInt(activeBtn.dataset.athlete) : 1; renderAnnualLibrary(aN === 2 ? athlete2Data?.workouts||[] : athlete1Data?.workouts||[]); }
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
// ===== UPCOMING RACES — localStorage storage =====
function loadUpcomingRaces() {
  try { return JSON.parse(localStorage.getItem('sup_upcoming_races') || '[]'); }
  catch { return []; }
}
function saveUpcomingRaces(arr) {
  localStorage.setItem('sup_upcoming_races', JSON.stringify(arr));
}
function deleteUpcomingRace(id) {
  saveUpcomingRaces(loadUpcomingRaces().filter(r => r.id !== id));
  renderCountdownBanner();
}

// ===== COUNTDOWN BANNER (new 3-col design) =====
let _bannerTimers = [];

function renderCountdownBanner() {
  _bannerTimers.forEach(clearInterval);
  _bannerTimers = [];

  const races = loadUpcomingRaces();
  const now = Date.now();
  const pad = n => String(n).padStart(2, '0');

  ['world', 'local'].forEach(cat => {
    const container = document.getElementById(`cdb-${cat}-races`);
    if (!container) return;

    const catRaces = races
      .filter(r => r.category === cat)
      .map(r => ({ ...r, targetMs: new Date(r.category === 'local' ? `${r.startDate}T${r.startTime || '06:00'}:00` : r.startDate).getTime() }))
      .filter(r => r.targetMs > now)
      .sort((a, b) => a.targetMs - b.targetMs);

    if (!catRaces.length) {
      container.innerHTML = '<div class="cdb-empty">אין תחרויות מתוכננות</div>';
      return;
    }

    container.innerHTML = catRaces.map(r => {
      const d = new Date(r.targetMs);
      const dateStr = r.category === 'world'
        ? `${pad(new Date(r.startDate).getDate())}.${pad(new Date(r.startDate).getMonth()+1)} – ${pad(new Date(r.endDate).getDate())}.${pad(new Date(r.endDate).getMonth()+1)}.${new Date(r.endDate).getFullYear()}`
        : `${pad(d.getDate())}.${pad(d.getMonth()+1)}.${d.getFullYear()} | ${pad(d.getHours())}:${pad(d.getMinutes())}`;
      const discs = (r.disciplines || []).join(' · ');
      const athletes = r.athletes === '1' ? 'מקסים' : r.athletes === '2' ? 'ויקטור' : 'שניהם';
      return `
        <div class="cdb-race-card" id="cdbc-${r.id}">
          <div class="cdb-race-name">${r.name}</div>
          <div class="cdb-race-meta">${dateStr}${r.location ? ' · ' + r.location : ''}${discs ? ' · ' + discs : ''} · ${athletes}</div>
          <div class="cdb-boxes">
            <div class="cdb-box"><div class="cdb-num" id="cdn-d-${r.id}">--</div><div class="cdb-lbl">ימים</div></div>
            <div class="cdb-sep">:</div>
            <div class="cdb-box"><div class="cdb-num" id="cdn-h-${r.id}">--</div><div class="cdb-lbl">שעות</div></div>
            <div class="cdb-sep">:</div>
            <div class="cdb-box"><div class="cdb-num" id="cdn-m-${r.id}">--</div><div class="cdb-lbl">דקות</div></div>
            <div class="cdb-sep">:</div>
            <div class="cdb-box"><div class="cdb-num" id="cdn-s-${r.id}">--</div><div class="cdb-lbl">שניות</div></div>
          </div>
          <button class="cdb-delete-btn" onclick="deleteUpcomingRace('${r.id}')" title="הסר תחרות">✕</button>
        </div>`;
    }).join('');

    catRaces.forEach(r => {
      function tick() {
        const diff = r.targetMs - Date.now();
        if (diff <= 0) { clearInterval(timer); renderCountdownBanner(); return; }
        const days  = Math.floor(diff / 86400000);
        const hours = Math.floor((diff % 86400000) / 3600000);
        const mins  = Math.floor((diff % 3600000) / 60000);
        const secs  = Math.floor((diff % 60000) / 1000);
        const el = id => document.getElementById(id);
        if (el(`cdn-d-${r.id}`)) el(`cdn-d-${r.id}`).textContent = pad(days);
        if (el(`cdn-h-${r.id}`)) el(`cdn-h-${r.id}`).textContent = pad(hours);
        if (el(`cdn-m-${r.id}`)) el(`cdn-m-${r.id}`).textContent = pad(mins);
        if (el(`cdn-s-${r.id}`)) el(`cdn-s-${r.id}`).textContent = pad(secs);
      }
      tick();
      const timer = setInterval(tick, 1000);
      _bannerTimers.push(timer);
    });
  });
}

function setupUpcomingRaceModal() {
  const modal = document.getElementById('modal-upcoming-race');
  const form  = document.getElementById('form-upcoming-race');
  if (!modal || !form) return;

  let selectedCat = 'local';
  let selectedAthletes = 'both';
  const selectedDiscs = new Set();

  function toggleDateRows() {
    document.getElementById('up-row-local-date').style.display  = selectedCat === 'local'  ? '' : 'none';
    document.getElementById('up-row-world-dates').style.display = selectedCat === 'world' ? '' : 'none';
  }

  // category buttons
  document.querySelectorAll('[data-cat]').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedCat = btn.dataset.cat;
      document.querySelectorAll('[data-cat]').forEach(b => b.classList.remove('active'));
      document.querySelectorAll(`[data-cat="${selectedCat}"]`).forEach(b => b.classList.add('active'));
      toggleDateRows();
    });
  });

  // athlete buttons
  document.querySelectorAll('[data-athletes]').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedAthletes = btn.dataset.athletes;
      document.querySelectorAll('[data-athletes]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // discipline buttons
  document.querySelectorAll('.upcoming-disc-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const disc = btn.dataset.disc;
      if (disc === '__other__') {
        const inp = document.getElementById('up-disc-other');
        inp.style.display = inp.style.display === 'none' ? '' : 'none';
        return;
      }
      if (selectedDiscs.has(disc)) { selectedDiscs.delete(disc); btn.classList.remove('active'); }
      else { selectedDiscs.add(disc); btn.classList.add('active'); }
    });
  });

  // open
  document.getElementById('btn-add-upcoming').addEventListener('click', () => {
    form.reset();
    selectedCat = 'local';
    selectedAthletes = 'both';
    selectedDiscs.clear();
    document.querySelectorAll('[data-cat]').forEach(b => b.classList.toggle('active', b.dataset.cat === 'local'));
    document.querySelectorAll('[data-athletes]').forEach(b => b.classList.toggle('active', b.dataset.athletes === 'both'));
    document.querySelectorAll('.upcoming-disc-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('up-disc-other').style.display = 'none';
    toggleDateRows();
    modal.style.display = 'flex';
  });

  // close
  ['upcoming-modal-close','upcoming-modal-cancel'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', () => { modal.style.display = 'none'; });
  });
  modal.addEventListener('click', e => { if (e.target === modal) modal.style.display = 'none'; });

  // submit
  form.addEventListener('submit', e => {
    e.preventDefault();
    const otherInp = document.getElementById('up-disc-other');
    const discs = [...selectedDiscs];
    if (otherInp.style.display !== 'none' && otherInp.value.trim()) discs.push(otherInp.value.trim());

    const race = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2),
      category: selectedCat,
      name: document.getElementById('up-name').value.trim(),
      location: document.getElementById('up-location').value.trim(),
      disciplines: discs,
      athletes: selectedAthletes,
      startDate: selectedCat === 'local' ? document.getElementById('up-date-local').value : document.getElementById('up-date-start').value,
      startTime: selectedCat === 'local' ? document.getElementById('up-time-local').value : null,
      endDate:   selectedCat === 'world' ? document.getElementById('up-date-end').value : null,
    };
    if (!race.name || !race.startDate) return;

    const arr = loadUpcomingRaces();
    arr.push(race);
    saveUpcomingRaces(arr);
    modal.style.display = 'none';
    renderCountdownBanner();
  });
}

let _upcomingTimers = [];

function renderUpcomingRaces() {
  const grid = document.getElementById('upcoming-races-grid');
  const section = document.getElementById('upcoming-races-section');
  if (!grid || !section) return;

  // clear old timers
  _upcomingTimers.forEach(clearInterval);
  _upcomingTimers = [];

  const now = Date.now();
  const upcoming = RACE_SCHEDULE
    .map(r => ({ ...r, ms: new Date(r.date).getTime() }))
    .filter(r => r.ms > now)
    .sort((a, b) => a.ms - b.ms);

  if (upcoming.length === 0) {
    section.style.display = 'none';
    return;
  }
  section.style.display = '';

  const pad = n => String(n).padStart(2, '0');

  grid.innerHTML = upcoming.map((r, i) => {
    const d = new Date(r.ms);
    const dateStr = `${pad(d.getDate())}.${pad(d.getMonth()+1)}.${d.getFullYear()} | ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    return `
      <div class="upcoming-race-card glass-card" id="urc-${i}">
        <div class="urc-name">${r.name}</div>
        <div class="urc-meta">${dateStr}${r.discipline ? ' · ' + r.discipline : ''}${r.location ? ' · ' + r.location : ''}</div>
        <div class="urc-countdown">
          <div class="urc-box"><div class="urc-num" id="urc-d-${i}">--</div><div class="urc-lbl">ימים</div></div>
          <div class="urc-sep">:</div>
          <div class="urc-box"><div class="urc-num" id="urc-h-${i}">--</div><div class="urc-lbl">שעות</div></div>
          <div class="urc-sep">:</div>
          <div class="urc-box"><div class="urc-num" id="urc-m-${i}">--</div><div class="urc-lbl">דקות</div></div>
          <div class="urc-sep">:</div>
          <div class="urc-box"><div class="urc-num" id="urc-s-${i}">--</div><div class="urc-lbl">שניות</div></div>
        </div>
      </div>`;
  }).join('');

  upcoming.forEach((r, i) => {
    function tick() {
      const diff = r.ms - Date.now();
      if (diff <= 0) {
        clearInterval(timer);
        renderUpcomingRaces();   // הסר כרטיסייה + הוסף שורה לטבלה
        renderRaces(currentRacesAthlete || 1);
        return;
      }
      const days  = Math.floor(diff / 86400000);
      const hours = Math.floor((diff % 86400000) / 3600000);
      const mins  = Math.floor((diff % 3600000) / 60000);
      const secs  = Math.floor((diff % 60000) / 1000);
      const el = id => document.getElementById(id);
      if (el(`urc-d-${i}`)) el(`urc-d-${i}`).textContent = pad(days);
      if (el(`urc-h-${i}`)) el(`urc-h-${i}`).textContent = pad(hours);
      if (el(`urc-m-${i}`)) el(`urc-m-${i}`).textContent = pad(mins);
      if (el(`urc-s-${i}`)) el(`urc-s-${i}`).textContent = pad(secs);
    }
    tick();
    const timer = setInterval(tick, 1000);
    _upcomingTimers.push(timer);
  });
}

// מחזיר שורות placeholder לתחרויות שעבר תאריכן אך אין להן תוצאות ב-JSON
function getPastScheduledWithoutResults(races) {
  const now = Date.now();
  const past = RACE_SCHEDULE
    .map(r => ({ ...r, ms: new Date(r.date).getTime() }))
    .filter(r => r.ms <= now);

  return past.filter(r => {
    const rDate = new Date(r.ms);
    const pad = n => String(n).padStart(2, '0');
    const dateStr = `${pad(rDate.getDate())}.${pad(rDate.getMonth()+1)}.${rDate.getFullYear()}`;
    return !races.some(j => j.name === r.name || j.date === dateStr);
  }).map(r => {
    const d = new Date(r.ms);
    const pad = n => String(n).padStart(2, '0');
    return {
      date: `${pad(d.getDate())}.${pad(d.getMonth()+1)}.${d.getFullYear()}`,
      name: r.name,
      location: r.location || '',
      discipline: r.discipline || '',
      distance_km: null,
      duration: null,
      place: null,
      category: 'local',
      _pending: true,
    };
  });
}

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
// ===== THEME TOGGLE =====
(function() {
  const saved = localStorage.getItem('sup_theme');
  if (saved === 'light') document.documentElement.setAttribute('data-theme', 'light');
})();

function setupThemeToggle() {
  const btn = document.getElementById('btn-theme-toggle');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    if (isLight) {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('sup_theme', 'dark');
    } else {
      document.documentElement.setAttribute('data-theme', 'light');
      localStorage.setItem('sup_theme', 'light');
    }
  });
}

// ===== FITNESS TAB (CTL / ATL / TSB) =====

let fitnessChart = null;

function switchFitnessAthlete(n) {
  document.querySelectorAll('.fitness-tab-btn').forEach((b, i) => {
    b.classList.toggle('active', i === n - 1);
  });
  renderFitness(n);
}

function renderFitness(athleteNum) {
  const data = athleteNum === 1 ? athlete1Data : athlete2Data;
  const fitness = data?.fitness;
  if (!fitness || !fitness.current) return;

  const cur = fitness.current;
  const ctl = cur.ctl || 0, atl = cur.atl || 0, tsb = cur.tsb || 0;

  // Date label
  const today = new Date();
  const pad = n => String(n).padStart(2,'0');
  const el = document.getElementById('fitness-date-label');
  if (el) el.textContent = `מצב נוכחי — ${pad(today.getDate())}/${pad(today.getMonth()+1)}/${today.getFullYear()}`;

  // CTL
  const ctlLevel = ctl >= 85 ? ['מצוין','#66bb6a','rgba(102,187,106,.15)'] :
                   ctl >= 65 ? ['טוב','#4fc3f7','rgba(79,195,247,.15)'] :
                   ctl >= 40 ? ['ממוצע','#ffd54f','rgba(255,213,79,.12)'] :
                               ['נמוך','#ef5350','rgba(239,83,80,.12)'];
  document.getElementById('fit-ctl-val').textContent = Math.round(ctl);
  const ctlLevelEl = document.getElementById('fit-ctl-level');
  ctlLevelEl.textContent = ctlLevel[0];
  ctlLevelEl.style.cssText = `color:${ctlLevel[1]};background:${ctlLevel[2]}`;
  document.getElementById('fit-ctl-hint').innerHTML =
    `ממוצע 42 יום<br>${ctl >= 85 ? '85+ = מצויין ✓' : ctl >= 65 ? '65-85 = טוב ✓' : ctl >= 40 ? '40-65 = ממוצע' : 'מתחת 40 = נמוך'}<br><span style="font-size:10px;opacity:0.6">טוב=65-85 | מצויין=85+</span>`;

  // ATL
  const diff = atl - ctl;
  const atlLevel = diff > 15 ? ['עמוס מאוד','#ef5350','rgba(239,83,80,.12)'] :
                   diff > 5  ? ['עמוס','#ffd54f','rgba(255,213,79,.12)'] :
                   diff > -5 ? ['מאוזן','#66bb6a','rgba(102,187,106,.15)'] :
                               ['נמוך','#4fc3f7','rgba(79,195,247,.15)'];
  document.getElementById('fit-atl-val').textContent = Math.round(atl);
  const atlLevelEl = document.getElementById('fit-atl-level');
  atlLevelEl.textContent = atlLevel[0];
  atlLevelEl.style.cssText = `color:${atlLevel[1]};background:${atlLevel[2]}`;
  document.getElementById('fit-atl-hint').innerHTML =
    `ממוצע 7 ימים<br>${diff > 5 ? 'גבוה מ-CTL — שבוע כבד' : 'קרוב ל-CTL = תקין ✓'}`;

  // TSB — bar always green, value color changes by state
  const tsbCard = document.getElementById('fit-tsb-card');
  tsbCard.className = 'fitness-kpi-card fitness-tsb';
  const tsbColor = tsb > 0 ? '#66bb6a' : tsb >= -15 ? '#ffd54f' : '#ef5350';
  tsbCard.style.setProperty('--fit-tsb-color', tsbColor);
  const tsbLevel = tsb > 20 ? ['נוח מאוד', tsbColor, `rgba(102,187,106,.15)`] :
                   tsb > 10 ? ['טרי',        tsbColor, `rgba(102,187,106,.15)`] :
                   tsb >= -5 ? ['מאוזן',      tsbColor, `rgba(102,187,106,.15)`] :
                   tsb >= -15 ? ['עמוס קל',   tsbColor, `rgba(255,213,79,.12)`]  :
                               ['עמוס מאוד',  tsbColor, `rgba(239,83,80,.12)`];
  document.getElementById('fit-tsb-val').textContent = (tsb >= 0 ? '+' : '') + Math.round(tsb);
  const tsbLevelEl = document.getElementById('fit-tsb-level');
  tsbLevelEl.textContent = tsbLevel[0];
  tsbLevelEl.style.cssText = `color:${tsbLevel[1]};background:${tsbLevel[2]}`;
  document.getElementById('fit-tsb-hint').innerHTML =
    `CTL פחות ATL<br>${tsb > 0 ? 'חיובי = מוכן ✓' : 'שלילי = מתאושש'}`;

  // Banner
  const banner = document.getElementById('fit-banner');
  const btitle = document.getElementById('fit-banner-title');
  const bdesc  = document.getElementById('fit-banner-desc');
  const bicon  = document.getElementById('fit-banner-icon');
  if (tsb > 10) {
    banner.className = 'fitness-banner fit-fresh';
    bicon.textContent = '🟢'; btitle.textContent = 'טרי ומוכן';
    bdesc.textContent = 'TSB חיובי — הגוף התאושש. מתאים לאימון טמפו קשה או ספרינטים.';
  } else if (tsb >= 0) {
    banner.className = 'fitness-banner fit-fresh';
    bicon.textContent = '🟢'; btitle.textContent = 'מוכן';
    bdesc.textContent = 'TSB מאוזן — אפשר לאמן בעצימות רגילה.';
  } else if (tsb >= -15) {
    banner.className = 'fitness-banner fit-neutral';
    bicon.textContent = '🟡'; btitle.textContent = 'עמוס קל';
    bdesc.textContent = 'TSB שלילי קל — עדיף אירובי. לא לדחוף חזק.';
  } else {
    banner.className = 'fitness-banner fit-loaded';
    bicon.textContent = '🔴'; btitle.textContent = 'עמוס — שמור כוח';
    bdesc.textContent = `עייפות גבוהה (ATL גבוה ב-${Math.round(Math.abs(diff))} מ-CTL). מנוחה פעילה או אירובי קל.`;
  }

  const fullSeries = fitness.series || [];
  const yearSeries = fullSeries.filter(d => {
    const parts = d.date.split('.');
    return parseInt(parts[2], 10) >= 2026;
  });
  drawFitnessChart(yearSeries);
  drawFitnessTrend(fitness.series || [], data.workouts || []);
}

function drawFitnessChart(series) {
  if (!series.length) return;
  const canvas = document.getElementById('fitnessChart');
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.parentElement.clientWidth - 32;
  const H = 280;
  canvas.width = W * dpr; canvas.height = H * dpr;
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const pad = { t: 10, r: 8, b: 26, l: 32 };
  const cw = W - pad.l - pad.r, ch = H - pad.t - pad.b;
  const allV = series.flatMap(d => [d.ctl, d.atl, d.tsb]);
  const mn = Math.min(...allV) - 3, mx = Math.max(...allV) + 3;
  const scX = i => pad.l + (i / (series.length - 1)) * cw;
  const scY = v => pad.t + (1 - (v - mn) / (mx - mn)) * ch;
  const y0 = scY(0);

  // zero line
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1; ctx.setLineDash([4,4]);
  ctx.beginPath(); ctx.moveTo(pad.l, y0); ctx.lineTo(pad.l+cw, y0); ctx.stroke();
  ctx.setLineDash([]);

  // month labels
  const months = ['ינו','פבר','מרץ','אפר','מאי','יונ','יול','אוג','ספט','אוק','נוב','דצמ'];
  let prevMonth = -1;
  ctx.textAlign = 'center'; ctx.font = '10px Heebo, sans-serif';
  series.forEach((d, i) => {
    const parts = d.date.split('.');
    const m = parseInt(parts[1], 10) - 1;
    if (m !== prevMonth) {
      prevMonth = m;
      const x = scX(i);
      ctx.strokeStyle = 'rgba(255,255,255,0.04)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, pad.t+ch); ctx.stroke();
      ctx.fillStyle = '#546e7a'; ctx.fillText(months[m], x, H - 6);
    }
  });

  // TSB fill
  ctx.save(); ctx.beginPath();
  ctx.moveTo(scX(0), y0);
  series.forEach((d,i) => ctx.lineTo(scX(i), scY(d.tsb)));
  ctx.lineTo(scX(series.length-1), y0); ctx.closePath();
  const gr = ctx.createLinearGradient(0, pad.t, 0, pad.t+ch);
  gr.addColorStop(0,'rgba(102,187,106,0.18)'); gr.addColorStop(1,'rgba(239,83,80,0.1)');
  ctx.fillStyle = gr; ctx.fill(); ctx.restore();

  function drawLine(key, color, dash=[]) {
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.setLineDash(dash);
    ctx.beginPath();
    series.forEach((d,i) => i===0 ? ctx.moveTo(scX(i),scY(d[key])) : ctx.lineTo(scX(i),scY(d[key])));
    ctx.stroke(); ctx.setLineDash([]);
  }
  drawLine('ctl','#4fc3f7');
  drawLine('atl','#ff8c42',[5,3]);
  drawLine('tsb','#66bb6a');

  ctx.textAlign = 'right'; ctx.font = '10px Heebo, sans-serif';
  [Math.round(mn), 0, Math.round(mx)].forEach(v => {
    ctx.fillStyle = v === 0 ? '#78909c' : '#3a5568';
    ctx.fillText(v, pad.l-3, scY(v)+4);
  });
}

function drawFitnessTrend(series, workouts) {
  const tbody = document.getElementById('fit-trend-body');
  if (!tbody || !series.length) return;

  // Last 6 weeks
  const rows = [];
  for (let w = 5; w >= 0; w--) {
    const endIdx = series.length - 1 - w * 7;
    if (endIdx < 0) continue;
    const startIdx = Math.max(0, endIdx - 6);
    const slice = series.slice(startIdx, endIdx + 1);
    const last = slice[slice.length - 1];
    const parts = last.date.split('.');
    const label = `${parts[0]}/${parts[1]}`;
    // count workouts in range
    const startDate = slice[0].date, endDate = last.date;
    const count = workouts.filter(wo => {
      return wo.date >= startDate && wo.date <= endDate && (wo.distance || 0) > 0;
    }).length;
    rows.push({ label, count, ctl: last.ctl, atl: last.atl, tsb: last.tsb });
  }

  tbody.innerHTML = rows.map(r => {
    const bcls = r.tsb > 5 ? 'pos' : r.tsb < -10 ? 'neg' : 'neu';
    const tsbStr = (r.tsb >= 0 ? '+' : '') + Math.round(r.tsb);
    return `<tr>
      <td style="color:var(--text-muted)">${r.label}</td>
      <td>${r.count} ימים</td>
      <td style="color:#4fc3f7">${Math.round(r.ctl)}</td>
      <td style="color:#ff8c42">${Math.round(r.atl)}</td>
      <td><span class="fit-badge ${bcls}">${tsbStr}</span></td>
    </tr>`;
  }).join('');
}

document.addEventListener('DOMContentLoaded', () => {
  setupThemeToggle();
  setupToggleButtons();
  setupWorkoutsAthleteSelector();
  setupFilters();
  setupProgress();
  setupRacesButtons();
  setupRacesTableControls();
  setupAnnualCmp();
  setupUpcomingRaceModal();
  setupNav();
  renderCountdownBanner();
  loadData();

  document.getElementById('lightbox').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeLightbox();
  });

  initTrainingPlans();

  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  document.getElementById('last-updated').textContent =
    `עדכון: ${pad(now.getDate())}/${pad(now.getMonth()+1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
});
