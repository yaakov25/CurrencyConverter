/* Kurs — currency converter PWA
   Rates: Frankfurter (ECB reference rates), https://api.frankfurter.dev
   Everything is cached in localStorage so the app still works offline. */

const API = 'https://api.frankfurter.dev/v1';
const KEY = { rates: 'kurs.rates', names: 'kurs.names', ui: 'kurs.ui' };
const MAX_AGE = 60 * 60 * 1000; // refetch at most once an hour

const $ = (id) => document.getElementById(id);
const el = {
  dot: $('dot'), stamp: $('stamp'), rate: $('rate'),
  rowFrom: $('rowFrom'), rowTo: $('rowTo'),
  codeFrom: $('codeFrom'), codeTo: $('codeTo'),
  nameFrom: $('nameFrom'), nameTo: $('nameTo'),
  valFrom: $('valFrom'), valTo: $('valTo'),
  swap: $('swap'), pad: $('pad'),
  sheet: $('sheet'), list: $('list'), search: $('search'), closeSheet: $('closeSheet'),
};

// ---------- state ----------
const saved = load(KEY.ui) || {};
const state = {
  from: saved.from || 'CHF',
  to: saved.to || 'EUR',
  active: 'from',        // which row the keypad edits
  raw: saved.raw || '1', // the typed string, always belongs to the active row
  table: null,           // EUR-based rates, e.g. { EUR:1, CHF:0.94, ... }
  date: null,            // ECB publication date
  fetchedAt: 0,
  names: load(KEY.names) || {},
  picking: null,         // 'from' | 'to' while the sheet is open
};

function load(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }
function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }

// ---------- rates ----------
function useCache() {
  const c = load(KEY.rates);
  if (!c || !c.table) return false;
  state.table = c.table; state.date = c.date; state.fetchedAt = c.fetchedAt || 0;
  return true;
}

async function refresh(force = false) {
  const fresh = Date.now() - state.fetchedAt < MAX_AGE;
  if (state.table && fresh && !force) return;
  setDot('loading');
  try {
    const r = await fetch(`${API}/latest`, { cache: 'no-store' });
    if (!r.ok) throw new Error(r.status);
    const d = await r.json();
    state.table = { ...d.rates, EUR: 1 };
    state.date = d.date;
    state.fetchedAt = Date.now();
    save(KEY.rates, { table: state.table, date: state.date, fetchedAt: state.fetchedAt });
    if (!Object.keys(state.names).length) loadNames();
  } catch {
    // stay on whatever we had; render() shows the age of the cached rates
  }
  render();
}

async function loadNames() {
  try {
    const r = await fetch(`${API}/currencies`);
    if (!r.ok) return;
    state.names = await r.json();
    save(KEY.names, state.names);
    render();
  } catch {}
}

const rateOf = (a, b) => state.table[b] / state.table[a];

// ---------- formatting ----------
const nf = new Intl.NumberFormat('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nfRate = new Intl.NumberFormat('de-CH', { minimumFractionDigits: 4, maximumFractionDigits: 4 });

function groupTyped(s) {
  // format the integer part while keeping exactly what was typed after the dot
  const [i, f] = s.split('.');
  const gi = new Intl.NumberFormat('de-CH').format(BigInt(i || '0'));
  return f === undefined ? gi : `${gi}.${f}`;
}

// ---------- render ----------
function setDot(cls) { el.dot.className = 'dot ' + cls; }

function render() {
  const known = state.table && state.table[state.from] && state.table[state.to];
  const typed = parseFloat(state.raw || '0') || 0;
  const other = known ? typed * rateOf(state.from, state.to) : null;
  const back = known ? typed * rateOf(state.to, state.from) : null;

  const fromTxt = state.active === 'from' ? groupTyped(state.raw) : (back === null ? '–' : nf.format(back));
  const toTxt   = state.active === 'to'   ? groupTyped(state.raw) : (other === null ? '–' : nf.format(other));

  el.valFrom.innerHTML = fromTxt + '<span class="caret"></span>';
  el.valTo.innerHTML = toTxt + '<span class="caret"></span>';
  el.codeFrom.textContent = state.from;
  el.codeTo.textContent = state.to;
  el.nameFrom.textContent = state.names[state.from] || '';
  el.nameTo.textContent = state.names[state.to] || '';
  el.rowFrom.className = 'row ' + (state.active === 'from' ? 'on' : 'off');
  el.rowTo.className = 'row ' + (state.active === 'to' ? 'on' : 'off');

  if (known) {
    el.rate.innerHTML = `1 ${state.from} = <b>${nfRate.format(rateOf(state.from, state.to))}</b> ${state.to}`;
    const d = new Date(state.date + 'T00:00:00');
    el.stamp.textContent = d.toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const ageDays = (Date.now() - d.getTime()) / 864e5;
    setDot(ageDays > 4 ? 'stale' : 'live');
  } else {
    el.rate.innerHTML = '&nbsp;';
    el.stamp.textContent = 'keine Kurse';
    setDot('stale');
  }
  save(KEY.ui, { from: state.from, to: state.to, raw: state.raw });
}

// ---------- input ----------
function key(k) {
  if (k === 'back') {
    state.raw = state.raw.length > 1 ? state.raw.slice(0, -1) : '0';
  } else if (k === '.') {
    if (!state.raw.includes('.')) state.raw += '.';
  } else {
    const [, f] = state.raw.split('.');
    if (f !== undefined && f.length >= 2) return;      // two decimals is enough
    if (state.raw.replace(/\D/g, '').length >= 12) return;
    state.raw = state.raw === '0' ? k : state.raw + k;
  }
  render();
}

function focusRow(which) {
  if (state.active === which) return;
  // carry the displayed value over so switching rows never loses the amount
  const typed = parseFloat(state.raw || '0') || 0;
  const known = state.table && state.table[state.from] && state.table[state.to];
  const carried = known
    ? (which === 'to' ? typed * rateOf(state.from, state.to) : typed * rateOf(state.to, state.from))
    : typed;
  state.active = which;
  state.raw = (Math.round(carried * 100) / 100).toString();
  render();
}

let holdTimer = null, held = false;
el.pad.addEventListener('pointerdown', (e) => {
  const b = e.target.closest('button');
  if (!b || b.dataset.k !== 'back') return;
  held = false;
  holdTimer = setTimeout(() => { held = true; state.raw = '0'; render(); }, 450); // hold to clear
});
['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) =>
  el.pad.addEventListener(ev, () => clearTimeout(holdTimer)));

el.pad.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (held) { held = false; return; } // the hold already cleared it
  key(b.dataset.k);
});

document.addEventListener('keydown', (e) => {
  if (el.sheet.classList.contains('open')) { if (e.key === 'Escape') closeSheet(); return; }
  if (/^[0-9]$/.test(e.key)) key(e.key);
  else if (e.key === '.' || e.key === ',') key('.');
  else if (e.key === 'Backspace') key('back');
  else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); focusRow(state.active === 'from' ? 'to' : 'from'); }
});

el.valFrom.addEventListener('click', () => focusRow('from'));
el.valTo.addEventListener('click', () => focusRow('to'));

el.swap.addEventListener('click', () => {
  [state.from, state.to] = [state.to, state.from];
  state.active = state.active === 'from' ? 'to' : 'from';
  render();
});

// ---------- currency picker ----------
function openSheet(which) {
  state.picking = which;
  el.sheet.classList.add('open');
  el.sheet.setAttribute('aria-hidden', 'false');
  el.search.value = '';
  drawList('');
  setTimeout(() => el.search.focus(), 250);
}
function closeSheet() {
  el.sheet.classList.remove('open');
  el.sheet.setAttribute('aria-hidden', 'true');
  el.search.blur();
}
function drawList(q) {
  const codes = Object.keys(state.table || state.names || {}).sort();
  const term = q.trim().toLowerCase();
  const current = state[state.picking];
  el.list.innerHTML = codes
    .filter((c) => !term || c.toLowerCase().includes(term) || (state.names[c] || '').toLowerCase().includes(term))
    .map((c) => `<button data-c="${c}" aria-current="${c === current}">
        <span class="c">${c}</span><span class="n">${state.names[c] || ''}</span></button>`)
    .join('') || '<p style="padding:20px var(--pad-x);color:var(--muted)">Keine Treffer.</p>';
}
el.search.addEventListener('input', () => drawList(el.search.value));
el.closeSheet.addEventListener('click', closeSheet);
el.list.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-c]');
  if (!b) return;
  const c = b.dataset.c;
  const otherSlot = state.picking === 'from' ? 'to' : 'from';
  if (state[otherSlot] === c) state[otherSlot] = state[state.picking]; // picked the other one: swap instead
  state[state.picking] = c;
  closeSheet();
  render();
});
el.codeFrom.addEventListener('click', () => openSheet('from'));
el.codeTo.addEventListener('click', () => openSheet('to'));

// ---------- boot ----------
useCache();
render();
refresh();
if (!Object.keys(state.names).length) loadNames();

document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
window.addEventListener('online', () => refresh(true));

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
