// ===========================
// SUP Challenge — app.js
// ===========================

let athlete1Data = null;
let athlete2Data = null;
let charts = {};
let currentRange = { speed: 'week', distance: 'week', hr: 'week', dps: 'week' };

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
  if (el('dob')) el('dob').textContent = data.dob || '—';
  if (el('age')) el('age').textContent = data.dob ? calcAge(data.dob) : '—';
  if (el('sup-start')) el('sup-start').textContent = data.sup_start || '—';

  const compEl = document.getElementById(`${prefix}-competitions`);
  if (!compEl) return;
  const comps = data.competitions || [];
  if (!comps.length) { compEl.innerHTML = ''; return; }
  compEl.innerHTML = `<div class="comp-list-title">🏆 תחרויות</div>` +
    comps.map(c => `
      <div class="comp-entry">
        <span class="comp-name">${c.name}</span>
        ${c.date ? `<span class="comp-date">${c.date}</span>` : ''}
        ${c.details ? `<span class="comp-details">${c.details}</span>` : ''}
      </div>`).join('');
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
    const [r1, r2] = await Promise.all([
      fetch('data/athlete1.json'),
      fetch('data/athlete2.json'),
    ]);
    athlete1Data = await r1.json();
    athlete2Data = await r2.json();
  } catch (e) {
    console.error('Error loading data:', e);
    athlete1Data = { name: 'מקסים רפופורט', profile_image: '', workouts: [] };
    athlete2Data = { name: 'ויקטור מוראטוב', profile_image: '', workouts: [] };
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
  renderProgress();
  renderGallery();
  renderRaces(1);
}

// ===== ATHLETE CARDS =====
function renderAthleteCards() {
  const w1 = getWorkoutsCurrentMonth(athlete1Data.workouts);
  const w2 = getWorkoutsCurrentMonth(athlete2Data.workouts);

  // Update period label (month + year) above stats
  const now = new Date();
  const periodLabel = `${getMonthName()} ${now.getFullYear()}`;
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
  // Rule: take Maxim's most recent workout, show Victor's workout from the SAME day
  const lastDate = athlete1Data.workouts
    .filter(w => w.distance > 0)
    .sort((a, b) => parseDMY(b.date) - parseDMY(a.date))[0]?.date || '';

  const lw1 = athlete1Data.workouts.find(w => w.date === lastDate) || {};
  const lw2 = athlete2Data.workouts.find(w => w.date === lastDate && w.distance > 0) || {};

  // Show type badge + date
  const typeEl = document.getElementById('last-workout-type');
  const dateEl = document.getElementById('last-workout-date');
  const workoutType = lw1.type || '';
  if (typeEl) typeEl.textContent = workoutType;
  if (dateEl) dateEl.textContent = lastDate || '';

  const metrics = [
    { label: 'מרחק', format: v => v ? v.toFixed(2) + ' ק"מ' : '—', fn: w => w.distance || 0 },
    { label: 'זמן', format: v => v || '—', fn: w => w.duration || '' },
    { label: 'מהירות', format: v => v ? v.toFixed(1) + ' קמ"ש' : '—', fn: w => w.avg_speed || 0 },
    { label: 'דופק', format: v => v ? v + ' BPM' : '—', fn: w => w.avg_hr || 0, lowerBetter: true },
    { label: 'SPM', format: v => v ? v : '—', fn: w => w.spm || 0 },
    { label: 'DPS', format: v => v ? v.toFixed(2) + ' מ\'' : '—', fn: w => w.dps || 0 },
    { label: 'זמן Z3', format: v => v && v !== '0:00' ? v : '—', fn: w => w.z3 || '' },
    { label: 'זמן Z4', format: v => v && v !== '0:00' ? v : '—', fn: w => w.z4 || '' },
    { label: 'זמן Z5', format: v => v && v !== '0:00' ? v : '—', fn: w => w.z5 || '' },
  ];

  const tbody = document.getElementById('comparison-tbody');
  tbody.innerHTML = '';

  metrics.forEach(m => {
    const v1 = m.fn(lw1);
    const v2 = m.fn(lw2);
    const numV1 = typeof v1 === 'number' ? v1 : 0;
    const numV2 = typeof v2 === 'number' ? v2 : 0;
    const hasNums = numV1 > 0 || numV2 > 0;
    const win1 = hasNums ? (m.lowerBetter ? (numV1 > 0 && numV2 > 0 ? numV1 <= numV2 : numV1 > 0) : numV1 >= numV2) : true;
    const win2 = !win1 && numV2 > 0;
    const maxV = Math.max(numV1, numV2) || 1;
    const bar1 = numV1 ? (numV1 / maxV * 100).toFixed(0) : 0;
    const bar2 = numV2 ? (numV2 / maxV * 100).toFixed(0) : 0;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <div class="comp-value ${win1 && numV1 > 0 ? 'winner' : 'loser'}">${m.format(v1)}</div>
        ${hasNums ? `<div class="comp-bar-container"><div class="comp-bar" style="direction:ltr">
          <div class="comp-bar-fill ${win1 ? 'winner' : 'loser'}" style="width:${bar1}%"></div>
        </div></div>` : ''}
      </td>
      <td class="comp-category">
        <span class="comp-cat-badge">${m.label}</span>
        ${win1 && numV1 > 0 ? '<br><small style="color:var(--accent-green)">◀</small>' : win2 ? '<br><small style="color:var(--accent-green)">▶</small>' : ''}
      </td>
      <td>
        <div class="comp-value ${win2 ? 'winner' : 'loser'}">${m.format(v2)}</div>
        ${hasNums ? `<div class="comp-bar-container"><div class="comp-bar">
          <div class="comp-bar-fill ${win2 ? 'winner' : 'loser'}" style="width:${bar2}%"></div>
        </div></div>` : ''}
      </td>`;
    tbody.appendChild(tr);
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
  // Only use dates where Maxim (athlete1) trained — Maxim determines comparison dates
  const maximDates = [...new Set(
    athlete1Data.workouts.filter(w => w.distance > 0).map(w => w.date)
  )].sort((a, b) => parseDMY(b) - parseDMY(a));

  const rows = [];
  maximDates.forEach(date => {
    const w1 = athlete1Data.workouts.find(w => w.date === date);
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
    tbody.innerHTML = '<tr><td colspan="13" class="empty-state"><div class="empty-icon">🌊</div><p>אין אימונים תואמים לפילטר</p></td></tr>';
    return;
  }

  const typeClass = { 'אירובי': 'row-aerobic', 'אירובי ארוך': 'row-long-aerobic', 'טמפו': 'row-tempo', 'ספרינטים': 'row-sprints' };
  const typeBadge = { 'אירובי': 'type-aerobic', 'אירובי ארוך': 'type-long', 'טמפו': 'type-tempo', 'ספרינטים': 'type-sprints' };

  filtered.forEach(w => {
    const tr = document.createElement('tr');
    tr.className = typeClass[w.type] || '';

    const locIcon = w.location === 'ים' ? '🌊' : w.location === 'נחל' ? '🏞️' : '';
    const badgeClass = w.athlete === 1 ? 'badge-athlete1' : 'badge-athlete2';
    const isZero = w.distance === 0;

    tr.style.opacity = isZero ? '0.45' : '1';

    tr.innerHTML = `
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

function renderRaces(athleteNum) {
  currentRacesAthlete = athleteNum;
  const data = athleteNum === 1 ? athlete1Data : athlete2Data;
  const races = data.races || [];

  // Update buttons
  document.querySelectorAll('.races-athlete-btn').forEach(btn => {
    btn.classList.toggle('active', +btn.dataset.athlete === athleteNum);
  });

  // Update name in buttons
  document.getElementById('races-btn-1').textContent = athlete1Data.name;
  document.getElementById('races-btn-2').textContent = athlete2Data.name;

  const worldEl = document.getElementById('races-world');
  const localEl = document.getElementById('races-local');

  const worldRaces = races.filter(r => r.category === 'world');
  const localRaces = races.filter(r => r.category === 'local');

  worldEl.innerHTML = worldRaces.length ? worldRaces.map(raceCard).join('') : '<div class="race-card-pending">אין נתונים</div>';
  localEl.innerHTML = localRaces.length ? localRaces.map(raceCard).join('') : '<div class="race-card-pending">אין נתונים</div>';
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

  return `
    <div class="race-card">
      <div class="race-card-header">
        <div class="race-card-name">${r.name}</div>
        <div class="race-card-date">${r.date}</div>
      </div>
      <div class="race-card-location">📍 ${r.location}${r.place ? ' &nbsp;|&nbsp; 🏅 מקום ' + r.place : ''}</div>
      ${statsHtml}
    </div>`;
}

function setupRacesButtons() {
  document.querySelectorAll('.races-athlete-btn').forEach(btn => {
    btn.addEventListener('click', () => renderRaces(+btn.dataset.athlete));
  });
}

// ===== GALLERY =====
function renderGallery() {
  const grid = document.getElementById('gallery-grid');
  const files = [
    { name: 'מקסים רפופורט.JPEG', label: 'מקסים רפופורט', date: '' },
    { name: 'ויקטור מוראטוב.JPEG', label: 'ויקטור מוראטוב', date: '' },
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
  q3:       { start: new Date(2026,6,1),  end: new Date(2026,8,30),  label: 'Q3 — יולי-ספטמבר 2026',      baseRef: 'q2',       showVsDec: true  },
  q4:       { start: new Date(2026,9,1),  end: new Date(2026,11,31), label: 'Q4 — אוקטובר-דצמבר 2026',    baseRef: 'q3',       showVsDec: true  },
  h1:       { isH1: true,                                             label: 'חצי שנתי — ממוצע Q1+Q2',     baseRef: 'base',     showVsDec: false },
  year:     { isMultiYear: true,                                      label: 'שנה — 2024 / 2025 / 2026',   baseRef: null,       showVsDec: false },
};
// Base reference = Q4 2025 (אוקטובר–דצמבר 2025)
const PROG_BASE = { start: new Date(2025,9,1), end: new Date(2025,11,31) };

const PROG_TYPES = [
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
      { key: 'dps',      label: 'DPS',     unit: "מ'",   lb: false },
      { key: 'speed',    label: 'מהירות',  unit: 'קמ"ש', lb: false },
      { key: 'hr',       label: 'דופק',    unit: 'BPM',  lb: true  },
      { key: 'distance', label: 'מרחק',    unit: "ק\"מ", lb: false },
      { key: 'eff',      label: 'יעילות',  unit: '',     lb: false },
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
let progPeriod  = 'q1';

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
  const cls   = delta.good ? 'good' : delta.bad ? 'bad' : 'neutral';
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
  const fewWarning = (baseN <= 1 || currN <= 1)
    ? `<div class="prog-few-warn">⚠️ ממוצע מ-${Math.min(baseN,currN)} אימון — פחות אמין</div>` : '';

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
}

function renderEfficiencyChart() {
  // Build quarters from Q1 2024 up to current quarter
  const now = new Date();
  const QUARTERS = [];
  for (let y = 2024; y <= now.getFullYear(); y++) {
    for (let q = 0; q < 4; q++) {
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
function setupNav() {
  document.querySelectorAll('nav a[href^="#"]').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      document.querySelector(link.getAttribute('href'))?.scrollIntoView({ behavior: 'smooth' });
      document.querySelectorAll('nav a').forEach(a => a.classList.remove('active'));
      link.classList.add('active');
    });
  });

  const sections = document.querySelectorAll('section[id]');
  const observer = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        document.querySelectorAll('nav a').forEach(a => {
          a.classList.toggle('active', a.getAttribute('href') === `#${e.target.id}`);
        });
      }
    });
  }, { threshold: 0.3, rootMargin: '-80px 0px 0px 0px' });
  sections.forEach(s => observer.observe(s));
}

// ===== COUNTDOWN =====
function startCountdown() {
  // תאריך האירוע — חיפה-עכו 06.06.2026 08:00 שעון ישראל
  const TARGET = new Date('2026-06-06T08:00:00+03:00');

  const elDays  = document.getElementById('cd-days');
  const elHours = document.getElementById('cd-hours');
  const elMins  = document.getElementById('cd-mins');
  const elSecs  = document.getElementById('cd-secs');
  const banner  = document.querySelector('.countdown-boxes');

  function tick() {
    const diff = TARGET - Date.now();
    if (diff <= 0) {
      if (banner) banner.innerHTML = '<div class="countdown-done">🏁 האירוע מתחיל עכשיו!</div>';
      return;
    }
    const pad = n => String(n).padStart(2, '0');
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
  setInterval(tick, 1000);
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  setupToggleButtons();
  setupFilters();
  setupProgress();
  setupRacesButtons();
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
