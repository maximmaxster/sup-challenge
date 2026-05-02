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
  renderGallery();
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
    // Start of current calendar week (Sunday)
    const day = now.getDay();
    const start = new Date(now);
    start.setDate(now.getDate() - day);
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
function setupToggleButtons() {
  document.querySelectorAll('.toggle-group').forEach(group => {
    group.querySelectorAll('.toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        group.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const chartId = group.dataset.chart;
        const range = btn.dataset.range;
        if (chartId === 'speed') renderSpeedChart(range);
        else if (chartId === 'distance') renderDistanceChart(range);
        else if (chartId === 'hr') renderHrChart(range);
        else if (chartId === 'dps') renderDpsChart(range);
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

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  setupToggleButtons();
  setupFilters();
  setupNav();
  loadData();

  document.getElementById('lightbox').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeLightbox();
  });

  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  document.getElementById('last-updated').textContent =
    `עדכון: ${pad(now.getDate())}/${pad(now.getMonth()+1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
});
