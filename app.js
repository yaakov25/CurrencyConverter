/* Kurs — Währungsrechner + Verlauf (PWA)
   Kurse: EZB-Referenzkurse via Frankfurter, https://api.frankfurter.dev
   Alles wird in localStorage zwischengespeichert; die App rechnet auch offline. */

// ── Live-Kurse (optional) ────────────────────────────────────────────────
// Leer lassen = die App läuft wie bisher rein mit EZB-Tageskursen.
// Sonst die URL des Cloudflare Workers eintragen, z. B.
//   const LIVE_URL = 'https://kurs-proxy.dein-name.workers.dev';
const LIVE_URL = 'https://steep-tooth-e287.yaakov-56b.workers.dev';
const LIVE_BUDGET = 700;                         // Aufrufe/Tag, Sicherheitsnetz
// ─────────────────────────────────────────────────────────────────────────

const API = 'https://api.frankfurter.dev/v1';
const FIRST_DAY = '1999-01-04';                 // frühestes EZB-Datum bei Frankfurter
const KEY = { rates:'kurs.rates', names:'kurs.names', ui:'kurs.ui3', sIdx:'kurs.sIdx', budget:'kurs.budget' };
const MAX_AGE = 60 * 60 * 1000;                  // nur noch für Verlaufsdaten
const OPEN_GAP = 90 * 1000;                      // "App neu geöffnet" ab dieser Pause
const SERIES_CACHE = 6;                          // wie viele Paare wir vorhalten

const FLAG = {
  AUD:'AU',BGN:'BG',BRL:'BR',CAD:'CA',CHF:'CH',CNY:'CN',CZK:'CZ',DKK:'DK',
  EUR:'EU',GBP:'GB',HKD:'HK',HUF:'HU',IDR:'ID',ILS:'IL',INR:'IN',ISK:'IS',
  JPY:'JP',KRW:'KR',MXN:'MX',MYR:'MY',NOK:'NO',NZD:'NZ',PHP:'PH',PLN:'PL',
  RON:'RO',SEK:'SE',SGD:'SG',THB:'TH',TRY:'TR',USD:'US',ZAR:'ZA',
};
const SYM = {
  AUD:'A$',BGN:'лв',BRL:'R$',CAD:'C$',CHF:'Fr.',CNY:'¥',CZK:'Kč',DKK:'kr',
  EUR:'€',GBP:'£',HKD:'HK$',HUF:'Ft',IDR:'Rp',ILS:'₪',INR:'₹',ISK:'kr',
  JPY:'¥',KRW:'₩',MXN:'Mex$',MYR:'RM',NOK:'kr',NZD:'NZ$',PHP:'₱',PLN:'zł',
  RON:'lei',SEK:'kr',SGD:'S$',THB:'฿',TRY:'₺',USD:'$',ZAR:'R',
};
const DEC0 = new Set(['JPY', 'KRW', 'ISK']);     // Währungen ohne Untereinheit
const flagChar = (c) => (FLAG[c] || '')
  .replace(/./g, (ch) => String.fromCodePoint(0x1F1E6 + ch.charCodeAt(0) - 65)) || '🏳';

const RANGES = [
  { id:'1W',  label:'1W',   days:7 },
  { id:'1M',  label:'1M',   days:30 },
  { id:'3M',  label:'3M',   days:91 },
  { id:'1J',  label:'1J',   days:365 },
  { id:'5J',  label:'5J',   days:1826 },
  { id:'10J', label:'10J',  days:3652 },
  { id:'ALL', label:'Alle', days:null },
];

const $ = (id) => document.getElementById(id);
const el = {
  dot:$('dot'), stamp:$('stamp'),
  tabCalc:$('tabCalc'), tabChart:$('tabChart'), paneCalc:$('paneCalc'), paneChart:$('paneChart'),
  puller:$('puller'), pullTxt:$('pullTxt'),
  base:$('base'), baseIdent:$('baseIdent'), baseFlag:$('baseFlag'),
  baseCode:$('baseCode'), baseSym:$('baseSym'), amount:$('amount'), reset:$('reset'),
  list:$('list'),
  chartHead:$('chartHead'), plot:$('plot'), hilo:$('hilo'), ranges:$('ranges'),
  sheet:$('sheet'), picklist:$('picklist'), search:$('search'),
  closeSheet:$('closeSheet'), removeCur:$('removeCur'),
};

// ---------- Zustand ----------
const saved = load(KEY.ui) || {};
const state = {
  base: saved.base || 'CHF',
  targets: saved.targets || ['EUR','USD','GBP','SEK'],
  raw: saved.raw || '1',
  range: saved.range || '1M',
  tab: 'calc',
  table:null, date:null, fetchedAt:0, src:'ecb', liveTs:0,
  hiddenAt:0, busy:false,
  names: load(KEY.names) || {},
  pick:null,
  series:null, seriesPair:null, seriesLoading:false, seriesError:false,
  cursor:null,
};

function load(k){ try{ return JSON.parse(localStorage.getItem(k)); }catch{ return null; } }
function save(k,v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch{} }
const persist = () => save(KEY.ui, {
  base:state.base, targets:state.targets, raw:state.raw, range:state.range,
});

// ---------- Zahlenformat ----------
// Tausender ', Dezimalkomma, 4 Stellen — ausser JPY/KRW/ISK (0). Nachlaufende Nullen fallen weg.
function fmtAmount(n, code){
  const max = DEC0.has(code) ? 0 : 4;
  return new Intl.NumberFormat('de-CH',{ minimumFractionDigits:0, maximumFractionDigits:max })
    .format(n).replace('.', ',');
}
// Kurse: je kleiner, desto mehr Nachkommastellen, damit 0,0001 nicht alles verschluckt
function fmtRate(r){
  const max = r >= 1 ? 4 : r >= 0.01 ? 4 : r >= 0.0001 ? 6 : 8;
  return new Intl.NumberFormat('de-CH',{ minimumFractionDigits:0, maximumFractionDigits:max })
    .format(r).replace('.', ',');
}
// Prozent immer mit 2 Stellen — mehr täuscht Genauigkeit vor, die nicht da ist
const fmtPct = (n) => new Intl.NumberFormat('de-CH',{ minimumFractionDigits:2, maximumFractionDigits:2 })
  .format(n).replace('.', ',');
const nfInt = new Intl.NumberFormat('de-CH');
function fmtTyped(s){
  const [i,f] = s.split('.');
  const gi = nfInt.format(BigInt(i || '0'));
  return f === undefined ? gi : `${gi},${f}`;
}
function parseTyped(s){
  const cleaned = s.replace(/[^0-9.,]/g,'').replace(/,/g,'.');
  const parts = cleaned.split('.');
  let out = parts.shift().replace(/^0+(?=\d)/,'');
  if (parts.length) out += '.' + parts.join('').slice(0,4);
  return out === '' ? '0' : out;
}
const fmtDate = (iso) => new Date(iso + 'T00:00:00')
  .toLocaleDateString('de-CH',{ day:'2-digit', month:'2-digit', year:'numeric' });

// ---------- Tageskurse ----------
function useCache(){
  const c = load(KEY.rates);
  if (!c || !c.table) return false;
  state.table = c.table; state.date = c.date; state.fetchedAt = c.fetchedAt || 0;
  state.src = c.src || 'ecb'; state.liveTs = c.liveTs || 0;
  return true;
}
function storeRates(){
  save(KEY.rates, { table:state.table, date:state.date, fetchedAt:state.fetchedAt,
                    src:state.src, liveTs:state.liveTs });
}

// Tagesbudget, damit eine Schleife nicht das Monatskontingent frisst
function budgetLeft(){
  const today = new Date().toISOString().slice(0,10);
  const b = load(KEY.budget);
  if (!b || b.day !== today){ save(KEY.budget, { day:today, n:0 }); return LIVE_BUDGET; }
  return LIVE_BUDGET - b.n;
}
function budgetSpend(n){
  const today = new Date().toISOString().slice(0,10);
  const b = load(KEY.budget) || { day:today, n:0 };
  if (b.day !== today){ b.day = today; b.n = 0; }
  b.n += n; save(KEY.budget, b);
}

// EZB-Tageskurse: Rückfallebene und Quelle für den Verlauf
async function fetchECB(){
  const r = await fetch(`${API}/latest`, { cache:'no-store' });
  if (!r.ok) throw new Error(r.status);
  const d = await r.json();
  state.table = { ...d.rates, EUR:1 };
  state.date = d.date;
  state.src = 'ecb'; state.liveTs = 0;
  state.fetchedAt = Date.now();
  storeRates();
}

// Live-Kurse über den Worker; die Tabelle ist dann basis-relativ (Basis = 1)
async function fetchLive(){
  const want = [state.base, ...state.targets];
  const syms = want.filter((c) => c !== state.base);
  if (!syms.length) throw new Error('no symbols');
  if (budgetLeft() < syms.length) throw new Error('budget');
  const r = await fetch(`${LIVE_URL}/?base=${state.base}&symbols=${syms.join(',')}`,
                        { cache:'no-store' });
  budgetSpend(syms.length);
  if (!r.ok) throw new Error(r.status);
  const d = await r.json();
  if (!d.rates || !Object.keys(d.rates).length) throw new Error('empty');
  state.table = { [d.base]: 1, ...d.rates };
  state.src = 'live'; state.liveTs = d.ts || Date.now();
  state.fetchedAt = Date.now();
  storeRates();
}

// Nur beim Öffnen der App und beim Ziehen — sonst nie.
async function refresh(){
  if (state.busy) return;
  state.busy = true;
  setDot('loading');
  try{
    if (LIVE_URL){
      try{ await fetchLive(); }
      catch{ await fetchECB(); }                 // Live weg? Dann EZB.
    }else{
      await fetchECB();
    }
    if (!Object.keys(state.names).length) loadNames();
  }catch{ /* Cache behalten */ }
  state.busy = false;
  render();
}
async function loadNames(){
  try{
    const r = await fetch(`${API}/currencies`);
    if (!r.ok) return;
    state.names = await r.json();
    save(KEY.names, state.names);
    render();
  }catch{}
}
const rateOf = (a,b) => state.table[b] / state.table[a];
const has = (c) => state.table && state.table[c];

// ---------- Rechner rendern ----------
function setDot(cls){ el.dot.className = 'dot ' + cls; }

function identHTML(code){
  return `<span class="flag"><span>${flagChar(code)}</span></span>
    <span class="cw"><span class="code">${code}</span>
    <span class="sym">${SYM[code]||''}</span><span class="chev">▾</span></span>`;
}

function render(){
  el.baseFlag.innerHTML = `<span>${flagChar(state.base)}</span>`;
  el.baseCode.textContent = state.base;
  el.baseSym.textContent = SYM[state.base] || '';
  if (document.activeElement !== el.amount) el.amount.value = fmtTyped(state.raw);

  const amt = parseFloat(state.raw || '0') || 0;
  el.list.innerHTML = state.targets.map((c) => {
    const ok = has(c) && has(state.base);
    return `<div class="item" data-c="${c}">
      <button class="ident" data-act="pick" data-c="${c}">${identHTML(c)}</button>
      <div class="nums">
        <div class="val">${ok ? fmtAmount(amt * rateOf(state.base,c), c) : '–'}</div>
        <div class="sub">1 ${c} → ${ok ? fmtRate(rateOf(c,state.base)) : '–'} ${state.base}</div>
      </div>
    </div>`;
  }).join('')
  + `<button class="add" id="addCur">＋ Währung hinzufügen</button>
     <p class="hint">Zeile lange drücken und ziehen zum Sortieren.<br>Nach oben auf die Karte ziehen macht sie zur Basis.</p>`;

  drawStamp();
  persist();
  if (state.tab === 'chart') syncChart();
}

function ago(ms){
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return 'gerade eben';
  if (m < 60) return `vor ${m} Min`;
  const h = Math.round(m/60);
  return h < 24 ? `vor ${h} Std` : `vor ${Math.round(h/24)} Tg`;
}
function drawStamp(){
  if (!state.table || !has(state.base)){
    el.stamp.textContent = 'keine Kurse'; setDot('stale'); return;
  }
  if (state.src === 'live'){
    const mins = (Date.now() - state.liveTs) / 60000;
    el.stamp.textContent = 'Live · ' + ago(state.liveTs);
    setDot(mins > 180 ? 'stale' : 'live');
  }else{
    el.stamp.textContent = (LIVE_URL ? 'EZB · ' : '') + fmtDate(state.date);
    setDot((Date.now() - new Date(state.date+'T00:00:00').getTime())/864e5 > 4 ? 'stale' : 'live');
  }
}

function renderValuesOnly(){
  const amt = parseFloat(state.raw || '0') || 0;
  el.list.querySelectorAll('.item').forEach((row) => {
    const c = row.dataset.c;
    row.querySelector('.val').textContent =
      has(c) && has(state.base) ? fmtAmount(amt * rateOf(state.base,c), c) : '–';
  });
  persist();
}

// ---------- Betrag ----------
el.amount.addEventListener('input', () => {
  state.raw = parseTyped(el.amount.value);
  const trailing = el.amount.value.trim().match(/[.,]$/) && !state.raw.includes('.') ? ',' : '';
  const out = fmtTyped(state.raw) + trailing;
  el.amount.value = out;
  el.amount.setSelectionRange(out.length, out.length);
  renderValuesOnly();
});
el.amount.addEventListener('focus', () => el.amount.setSelectionRange(el.amount.value.length, el.amount.value.length));
el.amount.addEventListener('blur', () => { el.amount.value = fmtTyped(state.raw); persist(); });
el.amount.addEventListener('keydown', (e) => { if (e.key === 'Enter') el.amount.blur(); });
el.reset.addEventListener('click', () => { state.raw = '1'; el.amount.value = '1'; renderValuesOnly(); });

// ---------- Basis wechseln: Betrag wird mitgenommen ----------
function promote(code){
  const amt = parseFloat(state.raw || '0') || 0;
  const carried = has(code) && has(state.base) ? amt * rateOf(state.base, code) : amt;
  const i = state.targets.indexOf(code);
  if (i > -1) state.targets.splice(i,1);
  if (!state.targets.includes(state.base)) state.targets.unshift(state.base);
  state.base = code;
  state.raw = String(Math.round(carried * 1e4) / 1e4);
  el.amount.value = fmtTyped(state.raw);
  render();
  if (LIVE_URL) refresh();          // neue Basis -> neue Live-Tabelle
}

// ---------- Drag & Drop ----------
let drag = null;
const ROW_GAP = 9;

el.list.addEventListener('pointerdown', (e) => {
  if (pull || e.target.closest('[data-act="pick"]') || e.target.closest('#addCur')) return;
  const row = e.target.closest('.item');
  if (!row) return;
  const startY = e.clientY, startX = e.clientX;
  const id = setTimeout(() => startDrag(row, e), 320);
  const cancel = (ev) => {
    if (ev.type === 'pointermove' &&
        Math.abs(ev.clientY-startY) < 9 && Math.abs(ev.clientX-startX) < 9) return;
    clearTimeout(id);
    el.list.removeEventListener('pointermove', cancel);
    el.list.removeEventListener('pointerup', cancel);
  };
  el.list.addEventListener('pointermove', cancel);
  el.list.addEventListener('pointerup', cancel);
});

function startDrag(row, e){
  const rows = [...el.list.querySelectorAll('.item')];
  drag = { row, rows, h: row.offsetHeight + ROW_GAP, from: rows.indexOf(row),
           to: rows.indexOf(row), y0: e.clientY, overBase:false };
  el.list.classList.add('dragging');
  row.classList.add('lift');
  rows.forEach((r) => { if (r !== row) r.classList.add('shift'); });
  if (navigator.vibrate) navigator.vibrate(8);
  document.addEventListener('pointermove', onDragMove, { passive:false });
  document.addEventListener('pointerup', endDrag);
  document.addEventListener('pointercancel', endDrag);
  document.addEventListener('touchmove', blockScroll, { passive:false });
}
const blockScroll = (e) => e.preventDefault();

function onDragMove(e){
  if (!drag) return;
  e.preventDefault();
  const dy = e.clientY - drag.y0;
  drag.overBase = e.clientY < el.base.getBoundingClientRect().bottom;
  el.base.classList.toggle('drop', drag.overBase);
  drag.row.style.transform = `translateY(${dy}px) scale(${drag.overBase ? 0.94 : 1.03})`;
  drag.row.style.opacity = drag.overBase ? '0.85' : '1';
  const to = drag.overBase ? drag.from
    : Math.max(0, Math.min(drag.rows.length-1, drag.from + Math.round(dy/drag.h)));
  if (to !== drag.to){ drag.to = to; layoutGaps(); }
}
function layoutGaps(){
  drag.rows.forEach((r,i) => {
    if (r === drag.row) return;
    let shift = 0;
    if (drag.from < drag.to && i > drag.from && i <= drag.to) shift = -drag.h;
    if (drag.from > drag.to && i >= drag.to && i < drag.from) shift = drag.h;
    r.style.transform = `translateY(${shift}px)`;
  });
}
function endDrag(){
  if (!drag) return;
  const { row, from, to, overBase } = drag;
  document.removeEventListener('pointermove', onDragMove);
  document.removeEventListener('pointerup', endDrag);
  document.removeEventListener('pointercancel', endDrag);
  document.removeEventListener('touchmove', blockScroll);
  el.list.classList.remove('dragging');
  el.base.classList.remove('drop');
  drag = null;
  if (overBase) return promote(row.dataset.c);
  if (to !== from){
    const [moved] = state.targets.splice(from,1);
    state.targets.splice(to,0,moved);
  }
  render();
}

// ---------- Ziehen zum Aktualisieren ----------
let pull = null;
const PULL_MAX = 78, PULL_TRIGGER = 56;

el.list.addEventListener('touchstart', (e) => {
  if (drag || el.list.scrollTop > 0 || e.touches.length !== 1) return;
  pull = { y0: e.touches[0].clientY, d: 0, armed:false };
}, { passive:true });

el.list.addEventListener('touchmove', (e) => {
  if (!pull || drag) return;
  const dy = e.touches[0].clientY - pull.y0;
  if (dy <= 0){ if (!pull.armed) pull = null; return; }
  if (el.list.scrollTop > 0){ pull = null; el.puller.style.height = '0px'; return; }
  pull.armed = true;
  pull.d = Math.min(PULL_MAX, dy * 0.55);          // Widerstand
  el.puller.classList.remove('snap');
  el.puller.style.height = pull.d + 'px';
  el.pullTxt.textContent = pull.d >= PULL_TRIGGER ? 'Loslassen' : 'Ziehen zum Aktualisieren';
  if (e.cancelable) e.preventDefault();
}, { passive:false });

function endPull(){
  if (!pull) return;
  const fire = pull.d >= PULL_TRIGGER;
  pull = null;
  el.puller.classList.add('snap');
  el.puller.style.height = '0px';
  if (!fire) return;
  if (navigator.vibrate) navigator.vibrate(10);
  refresh();
  if (state.tab === 'chart') loadSeries(true);
}
el.list.addEventListener('touchend', endPull, { passive:true });
el.list.addEventListener('touchcancel', endPull, { passive:true });

// ---------- Tabs ----------
function setTab(t){
  state.tab = t;
  el.tabCalc.setAttribute('aria-selected', t === 'calc');
  el.tabChart.setAttribute('aria-selected', t === 'chart');
  el.paneCalc.classList.toggle('on', t === 'calc');
  el.paneChart.classList.toggle('on', t === 'chart');
  if (t === 'chart') syncChart();
}
el.tabCalc.addEventListener('click', () => setTab('calc'));
el.tabChart.addEventListener('click', () => setTab('chart'));

// ---------- Verlauf: Daten ----------
const pairKey = (a,b) => `kurs.s.${a}${b}`;
function cacheSeries(a,b,obj){
  save(pairKey(a,b), obj);
  const idx = (load(KEY.sIdx) || []).filter((k) => k !== pairKey(a,b));
  idx.push(pairKey(a,b));
  while (idx.length > SERIES_CACHE){ try{ localStorage.removeItem(idx.shift()); }catch{} }
  save(KEY.sIdx, idx);
}

async function loadSeries(force = false){
  const a = state.base, b = state.targets[0];
  if (!b) return;
  const pair = a + b;
  const cached = load(pairKey(a,b));
  if (!force && cached && Date.now() - cached.fetchedAt < MAX_AGE){
    state.series = cached; state.seriesPair = pair; state.seriesError = false;
    return drawChart();
  }
  if (!force && cached){ state.series = cached; state.seriesPair = pair; drawChart(); }

  state.seriesLoading = true; state.seriesError = false;
  if (!cached) drawChart();
  try{
    const r = await fetch(`${API}/${FIRST_DAY}..?base=${a}&symbols=${b}`, { cache:'no-store' });
    if (!r.ok) throw new Error(r.status);
    const j = await r.json();
    const d = [], v = [];
    for (const day of Object.keys(j.rates).sort()){
      const val = j.rates[day][b];
      if (typeof val === 'number'){ d.push(day); v.push(val); }
    }
    const obj = { d, v, fetchedAt: Date.now() };
    state.series = obj; state.seriesPair = pair;
    cacheSeries(a, b, obj);
  }catch{
    state.seriesError = !state.series || state.seriesPair !== pair;
  }
  state.seriesLoading = false;
  drawChart();
}

function syncChart(){
  const want = state.base + (state.targets[0] || '');
  if (state.seriesPair !== want){ state.series = null; state.cursor = null; loadSeries(); }
  else drawChart();
}

// ---------- Verlauf: zeichnen ----------
function slice(){
  const s = state.series;
  if (!s || !s.d.length) return null;
  const r = RANGES.find((x) => x.id === state.range) || RANGES[1];
  if (!r.days) return s;
  const cut = new Date(s.d[s.d.length-1] + 'T00:00:00');
  cut.setDate(cut.getDate() - r.days);
  const iso = cut.toISOString().slice(0,10);
  let i = s.d.findIndex((x) => x >= iso);
  if (i < 0) i = Math.max(0, s.d.length - 2);
  return { d: s.d.slice(i), v: s.v.slice(i) };
}
function downsample(d, v, maxPts){
  if (d.length <= maxPts) return { d, v };
  const step = d.length / maxPts, od = [], ov = [];
  for (let k = 0; k < maxPts; k++){
    const i = Math.floor(k * step);
    od.push(d[i]); ov.push(v[i]);
  }
  od.push(d[d.length-1]); ov.push(v[v.length-1]);
  return { d: od, v: ov };
}

function chartHeadHTML(cur, first, last){
  const a = state.base, b = state.targets[0];
  const pct = first ? (last - first) / first * 100 : 0;
  const dir = pct >= 0 ? 'up' : 'down';
  const rlabel = (RANGES.find((x) => x.id === state.range) || {}).label || '';
  return `<div class="pairhead">
      <span class="flag sm"><span>${flagChar(a)}</span></span>
      <span class="lbl">${a}</span><span class="arrow">→</span>
      <span class="flag sm"><span>${flagChar(b)}</span></span>
      <span class="lbl">${b}</span>
    </div>
    <div class="bigrate">${cur == null ? '–' : fmtRate(cur)} <span class="sym">${b}</span></div>
    <div class="delta ${dir}">${pct >= 0 ? '▲' : '▼'} ${fmtPct(Math.abs(pct))}%
      <span class="per">${rlabel}</span></div>`;
}

function drawChart(){
  const b = state.targets[0];
  if (!b){
    el.chartHead.innerHTML = '';
    el.plot.innerHTML = '<p class="cstate">Keine Zielwährung in der Liste.</p>';
    el.hilo.innerHTML = ''; drawRanges(); return;
  }
  drawRanges();

  const cut = slice();
  if (!cut || cut.d.length < 2){
    el.chartHead.innerHTML = chartHeadHTML(has(b) && has(state.base) ? rateOf(state.base,b) : null, 0, 0);
    el.plot.innerHTML = `<p class="cstate">${
      state.seriesError ? 'Verlauf nicht geladen.<br>Ohne Verbindung nur mit gespeicherten Daten.'
      : state.seriesLoading ? 'Lädt Verlauf…' : 'Zu wenige Datenpunkte für diesen Zeitraum.'}</p>`;
    el.hilo.innerHTML = ''; return;
  }

  const box = el.plot.getBoundingClientRect();
  const W = Math.max(240, box.width), H = Math.max(140, box.height);
  const PADT = 26, PADB = 20;
  const { d, v } = downsample(cut.d, cut.v, 320);
  const min = Math.min(...v), max = Math.max(...v);
  const span = (max - min) || max * 0.01 || 1;
  const x = (i) => (i / (d.length - 1)) * W;
  const y = (val) => PADT + (1 - (val - min) / span) * (H - PADT - PADB);

  const up = v[v.length-1] >= v[0];
  const col = up ? 'var(--up)' : 'var(--down)';
  const line = d.map((_, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v[i]).toFixed(1)}`).join('');
  const area = `${line}L${W},${H-PADB+6}L0,${H-PADB+6}Z`;
  const iMin = v.indexOf(min), iMax = v.indexOf(max);

  el.plot.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
      <defs><linearGradient id="g" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stop-color="${up ? '#7FC7A8' : '#E0705C'}" stop-opacity=".22"/>
        <stop offset="1" stop-color="${up ? '#7FC7A8' : '#E0705C'}" stop-opacity="0"/>
      </linearGradient></defs>
      <path d="${area}" fill="url(#g)"/>
      <path d="${line}" fill="none" stroke="${col}" stroke-width="2"
            stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
      <circle cx="${x(iMax).toFixed(1)}" cy="${y(max).toFixed(1)}" r="2.5" fill="var(--muted)"/>
      <circle cx="${x(iMin).toFixed(1)}" cy="${y(min).toFixed(1)}" r="2.5" fill="var(--muted)"/>
      <g id="cursor" style="display:none">
        <line y1="${PADT-14}" y2="${H-PADB+6}" stroke="var(--edge)" stroke-width="1"/>
        <circle r="4.5" fill="${col}" stroke="var(--bg)" stroke-width="2"/>
      </g>
    </svg>
    <div class="readout" id="readout"></div>`;

  const live = has(b) && has(state.base) ? rateOf(state.base, b) : cut.v[cut.v.length-1];
  el.chartHead.innerHTML = chartHeadHTML(live, cut.v[0], cut.v[cut.v.length-1]);
  el.hilo.innerHTML = `<span>Tief ${fmtRate(min)}</span>
    <span>${fmtDate(cut.d[0])} – ${fmtDate(cut.d[cut.d.length-1])}</span>
    <span>Hoch ${fmtRate(max)}</span>`;

  wireCursor({ d, v, x, y, W });
}

function wireCursor(ctx){
  const svg = el.plot.querySelector('svg');
  const g = el.plot.querySelector('#cursor');
  const line = g.querySelector('line'), dotC = g.querySelector('circle');
  const readout = el.plot.querySelector('#readout');
  const b = state.targets[0];

  const move = (e) => {
    const rect = svg.getBoundingClientRect();
    const px = Math.max(0, Math.min(rect.width, (e.touches ? e.touches[0].clientX : e.clientX) - rect.left));
    const i = Math.round((px / rect.width) * (ctx.d.length - 1));
    const cx = ctx.x(i), cy = ctx.y(ctx.v[i]);
    g.style.display = '';
    line.setAttribute('x1', cx); line.setAttribute('x2', cx);
    dotC.setAttribute('cx', cx); dotC.setAttribute('cy', cy);
    readout.innerHTML = `<span>${fmtDate(ctx.d[i])}</span><span><b>${fmtRate(ctx.v[i])}</b> ${b}</span>`;
    if (e.cancelable) e.preventDefault();
  };
  const off = () => { g.style.display = 'none'; readout.innerHTML = ''; };

  el.plot.addEventListener('pointerdown', move);
  el.plot.addEventListener('pointermove', (e) => { if (e.pressure > 0 || e.buttons) move(e); });
  el.plot.addEventListener('pointerup', off);
  el.plot.addEventListener('pointerleave', off);
  el.plot.addEventListener('pointercancel', off);
}

function drawRanges(){
  el.ranges.innerHTML = RANGES.map((r) =>
    `<button role="tab" data-r="${r.id}" aria-selected="${r.id === state.range}">${r.label}</button>`).join('');
}
el.ranges.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-r]');
  if (!b) return;
  state.range = b.dataset.r;
  state.cursor = null;
  persist();
  drawChart();
});
let resizeT;
window.addEventListener('resize', () => {
  clearTimeout(resizeT);
  resizeT = setTimeout(() => { if (state.tab === 'chart') drawChart(); }, 150);
});

// ---------- Währungsauswahl ----------
function openSheet(mode, code){
  state.pick = { mode, code };
  el.removeCur.hidden = mode !== 'replace' || state.targets.length <= 1;
  el.sheet.classList.add('open');
  el.sheet.setAttribute('aria-hidden','false');
  el.search.value = '';
  drawPick('');
  setTimeout(() => el.search.focus(), 260);
}
function closeSheet(){
  el.sheet.classList.remove('open');
  el.sheet.setAttribute('aria-hidden','true');
  el.search.blur();
  state.pick = null;
}
function drawPick(q){
  const codes = Object.keys(state.table || state.names || {}).sort();
  const term = q.trim().toLowerCase();
  const cur = state.pick.mode === 'base' ? state.base : state.pick.code;
  el.picklist.innerHTML = codes
    .filter((c) => !term || c.toLowerCase().includes(term) || (state.names[c]||'').toLowerCase().includes(term))
    .map((c) => {
      const used = c === state.base || state.targets.includes(c);
      return `<button data-c="${c}" data-used="${used && c !== cur ? 1 : 0}" aria-current="${c === cur}">
        <span class="flag"><span>${flagChar(c)}</span></span>
        <span class="code">${c}</span><span class="sym">${SYM[c]||''}</span>
        <span class="n">${state.names[c]||''}</span></button>`;
    }).join('') || '<p style="padding:20px 6px;color:var(--muted)">Keine Treffer.</p>';
}
el.search.addEventListener('input', () => drawPick(el.search.value));
el.closeSheet.addEventListener('click', closeSheet);

el.picklist.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-c]');
  if (!b || !state.pick) return;
  const c = b.dataset.c, { mode, code } = state.pick;
  if (mode === 'base'){
    if (c === state.base) return closeSheet();
    promote(c); closeSheet(); return;
  }
  if (mode === 'add'){
    if (c !== state.base && !state.targets.includes(c)) state.targets.push(c);
  }else{
    const i = state.targets.indexOf(code);
    if (c === state.base){ closeSheet(); return promote(code); }
    if (state.targets.includes(c)) state.targets.splice(state.targets.indexOf(c),1);
    state.targets[i] = c;
  }
  closeSheet();
  render();
  if (LIVE_URL) refresh();          // Live-Tabelle deckt nur Basis + Liste ab
});
el.removeCur.addEventListener('click', () => {
  const i = state.targets.indexOf(state.pick.code);
  if (i > -1) state.targets.splice(i,1);
  closeSheet(); render();
});
el.baseIdent.addEventListener('click', () => openSheet('base'));
el.list.addEventListener('click', (e) => {
  if (e.target.closest('#addCur')) return openSheet('add');
  const p = e.target.closest('[data-act="pick"]');
  if (p) openSheet('replace', p.dataset.c);
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && state.pick) closeSheet(); });

// ---------- Start ----------
useCache();
drawRanges();
render();
refresh();
if (!Object.keys(state.names).length) loadNames();
// Aktualisiert wird nur beim Öffnen der App und beim Ziehen — nicht periodisch.
document.addEventListener('visibilitychange', () => {
  if (document.hidden){ state.hiddenAt = Date.now(); return; }
  if (state.hiddenAt && Date.now() - state.hiddenAt > OPEN_GAP) refresh();  // echtes Wiederöffnen
  else drawStamp();                                        // kurz weggetippt: nur Alter neu
});
if ('serviceWorker' in navigator){
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
