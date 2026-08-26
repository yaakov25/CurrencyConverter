/* Kurs — Währungsrechner (PWA)
   Kurse: EZB-Referenzkurse via Frankfurter, https://api.frankfurter.dev
   Alles wird in localStorage zwischengespeichert, damit die App offline weiterrechnet. */

const API = 'https://api.frankfurter.dev/v1';
const KEY = { rates: 'kurs.rates', names: 'kurs.names', ui: 'kurs.ui2' };
const MAX_AGE = 60 * 60 * 1000;

const FLAG = {
  AUD:'AU', BGN:'BG', BRL:'BR', CAD:'CA', CHF:'CH', CNY:'CN', CZK:'CZ', DKK:'DK',
  EUR:'EU', GBP:'GB', HKD:'HK', HUF:'HU', IDR:'ID', ILS:'IL', INR:'IN', ISK:'IS',
  JPY:'JP', KRW:'KR', MXN:'MX', MYR:'MY', NOK:'NO', NZD:'NZ', PHP:'PH', PLN:'PL',
  RON:'RO', SEK:'SE', SGD:'SG', THB:'TH', TRY:'TR', USD:'US', ZAR:'ZA',
};
const SYM = {
  AUD:'A$', BGN:'лв', BRL:'R$', CAD:'C$', CHF:'Fr.', CNY:'¥', CZK:'Kč', DKK:'kr',
  EUR:'€', GBP:'£', HKD:'HK$', HUF:'Ft', IDR:'Rp', ILS:'₪', INR:'₹', ISK:'kr',
  JPY:'¥', KRW:'₩', MXN:'Mex$', MYR:'RM', NOK:'kr', NZD:'NZ$', PHP:'₱', PLN:'zł',
  RON:'lei', SEK:'kr', SGD:'S$', THB:'฿', TRY:'₺', USD:'$', ZAR:'R',
};
const flagChar = (c) => (FLAG[c] || '')
  .replace(/./g, (ch) => String.fromCodePoint(0x1F1E6 + ch.charCodeAt(0) - 65)) || '🏳';

const $ = (id) => document.getElementById(id);
const el = {
  dot: $('dot'), stamp: $('stamp'), base: $('base'), baseIdent: $('baseIdent'),
  baseFlag: $('baseFlag'), baseCode: $('baseCode'), baseSym: $('baseSym'),
  amount: $('amount'), list: $('list'),
  sheet: $('sheet'), picklist: $('picklist'), search: $('search'),
  closeSheet: $('closeSheet'), removeCur: $('removeCur'),
};

// ---------- state ----------
const saved = load(KEY.ui) || {};
const state = {
  base: saved.base || 'CHF',
  targets: saved.targets || ['EUR', 'USD', 'GBP', 'SEK'],
  raw: saved.raw || '1',
  table: null, date: null, fetchedAt: 0,
  names: load(KEY.names) || {},
  pick: null,   // {mode:'replace'|'add'|'base', code}
};

function load(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }
function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
const persist = () => save(KEY.ui, { base: state.base, targets: state.targets, raw: state.raw });

// ---------- Zahlenformat: 1'000,0000 ----------
const nf4 = new Intl.NumberFormat('de-CH', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const nfInt = new Intl.NumberFormat('de-CH');
const fmt = (n) => nf4.format(n).replace('.', ',');           // de-CH gruppiert mit ', Dezimalpunkt -> Komma

function fmtTyped(s) {                                        // formatiert während des Tippens
  const [i, f] = s.split('.');
  const gi = nfInt.format(BigInt(i || '0'));
  return f === undefined ? gi : `${gi},${f}`;
}
function parseTyped(s) {                                      // Eingabe -> internes '1234.56'
  const cleaned = s.replace(/[^0-9.,]/g, '').replace(/,/g, '.');
  const parts = cleaned.split('.');
  let out = parts.shift().replace(/^0+(?=\d)/, '');
  if (parts.length) out += '.' + parts.join('').slice(0, 4);
  return out === '' ? '0' : out;
}

// ---------- Kurse ----------
function useCache() {
  const c = load(KEY.rates);
  if (!c || !c.table) return false;
  state.table = c.table; state.date = c.date; state.fetchedAt = c.fetchedAt || 0;
  return true;
}
async function refresh(force = false) {
  if (state.table && Date.now() - state.fetchedAt < MAX_AGE && !force) return;
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
  } catch { /* Cache behalten */ }
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
const has = (c) => state.table && state.table[c];

// ---------- rendern ----------
function setDot(cls) { el.dot.className = 'dot ' + cls; }

function identHTML(code) {
  return `<span class="flag"><span>${flagChar(code)}</span></span>
    <span class="cw"><span class="code">${code}</span>
    <span class="sym">${SYM[code] || ''}</span><span class="chev">▾</span></span>`;
}

function render() {
  el.baseFlag.innerHTML = `<span>${flagChar(state.base)}</span>`;
  el.baseCode.textContent = state.base;
  el.baseSym.textContent = SYM[state.base] || '';
  if (document.activeElement !== el.amount) el.amount.value = fmtTyped(state.raw);

  const amt = parseFloat(state.raw || '0') || 0;
  el.list.innerHTML = state.targets.map((c) => {
    const ok = has(c) && has(state.base);
    const val = ok ? fmt(amt * rateOf(state.base, c)) : '–';
    const back = ok ? fmt(rateOf(c, state.base)) : '–';
    return `<div class="item" data-c="${c}">
      <button class="ident" data-act="pick" data-c="${c}">${identHTML(c)}</button>
      <div class="nums">
        <div class="val">${val}</div>
        <div class="sub">1 ${c} → ${back} ${state.base}</div>
      </div>
    </div>`;
  }).join('')
  + `<button class="add" id="addCur">＋ Währung hinzufügen</button>
     <p class="hint">Zeile lange drücken und ziehen zum Sortieren.<br>Nach oben auf die Karte ziehen macht sie zur Basis.</p>`;

  if (state.table && has(state.base)) {
    const d = new Date(state.date + 'T00:00:00');
    el.stamp.textContent = d.toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' });
    setDot((Date.now() - d.getTime()) / 864e5 > 4 ? 'stale' : 'live');
  } else {
    el.stamp.textContent = 'keine Kurse';
    setDot('stale');
  }
  persist();
}

// ---------- Betrag ----------
el.amount.addEventListener('input', () => {
  state.raw = parseTyped(el.amount.value);
  const formatted = fmtTyped(state.raw) + (el.amount.value.trim().match(/[.,]$/) && !state.raw.includes('.') ? ',' : '');
  el.amount.value = formatted;
  el.amount.setSelectionRange(formatted.length, formatted.length);
  renderValuesOnly();
});
el.amount.addEventListener('focus', () => { el.amount.setSelectionRange(el.amount.value.length, el.amount.value.length); });
el.amount.addEventListener('blur', () => { el.amount.value = fmtTyped(state.raw); persist(); });
el.amount.addEventListener('keydown', (e) => { if (e.key === 'Enter') el.amount.blur(); });

function renderValuesOnly() {   // schnelles Update ohne die Liste neu zu bauen (Drag bleibt heil)
  const amt = parseFloat(state.raw || '0') || 0;
  el.list.querySelectorAll('.item').forEach((row) => {
    const c = row.dataset.c;
    row.querySelector('.val').textContent =
      has(c) && has(state.base) ? fmt(amt * rateOf(state.base, c)) : '–';
  });
  persist();
}

// ---------- Basis wechseln ----------
function promote(code) {
  const i = state.targets.indexOf(code);
  if (i > -1) state.targets.splice(i, 1);
  if (!state.targets.includes(state.base)) state.targets.unshift(state.base);
  state.base = code;
  state.raw = '1';                     // Betrag zurück auf 1
  el.amount.value = '1';
  render();
}

// ---------- Drag & Drop ----------
let drag = null;
const ROW_GAP = 9;

el.list.addEventListener('pointerdown', (e) => {
  if (e.target.closest('[data-act="pick"]') || e.target.closest('#addCur')) return;
  const row = e.target.closest('.item');
  if (!row || state.targets.length < 1) return;
  const startY = e.clientY, startX = e.clientX;
  const id = setTimeout(() => startDrag(row, e), 320);
  const cancel = (ev) => {
    if (ev.type === 'pointermove' &&
        Math.abs(ev.clientY - startY) < 9 && Math.abs(ev.clientX - startX) < 9) return;
    clearTimeout(id);
    el.list.removeEventListener('pointermove', cancel);
    el.list.removeEventListener('pointerup', cancel);
  };
  el.list.addEventListener('pointermove', cancel);
  el.list.addEventListener('pointerup', cancel);
});

function startDrag(row, e) {
  const rows = [...el.list.querySelectorAll('.item')];
  const h = row.offsetHeight + ROW_GAP;
  drag = {
    row, rows, h,
    from: rows.indexOf(row),
    to: rows.indexOf(row),
    y0: e.clientY,
    overBase: false,
  };
  el.list.classList.add('dragging');
  row.classList.add('lift');
  rows.forEach((r) => { if (r !== row) r.classList.add('shift'); });
  if (navigator.vibrate) navigator.vibrate(8);
  document.addEventListener('pointermove', onDragMove, { passive: false });
  document.addEventListener('pointerup', endDrag);
  document.addEventListener('pointercancel', endDrag);
  document.addEventListener('touchmove', blockScroll, { passive: false });
}

const blockScroll = (e) => e.preventDefault();

function onDragMove(e) {
  if (!drag) return;
  e.preventDefault();
  const dy = e.clientY - drag.y0;
  const baseBox = el.base.getBoundingClientRect();
  drag.overBase = e.clientY < baseBox.bottom;
  el.base.classList.toggle('drop', drag.overBase);

  drag.row.style.transform = `translateY(${dy}px) scale(${drag.overBase ? 0.94 : 1.03})`;
  drag.row.style.opacity = drag.overBase ? '0.85' : '1';

  const to = drag.overBase ? drag.from
    : Math.max(0, Math.min(drag.rows.length - 1, drag.from + Math.round(dy / drag.h)));
  if (to !== drag.to) { drag.to = to; layoutGaps(); }
}

function layoutGaps() {
  drag.rows.forEach((r, i) => {
    if (r === drag.row) return;
    let shift = 0;
    if (drag.from < drag.to && i > drag.from && i <= drag.to) shift = -drag.h;
    if (drag.from > drag.to && i >= drag.to && i < drag.from) shift = drag.h;
    r.style.transform = `translateY(${shift}px)`;
  });
}

function endDrag() {
  if (!drag) return;
  const { row, from, to, overBase } = drag;
  document.removeEventListener('pointermove', onDragMove);
  document.removeEventListener('pointerup', endDrag);
  document.removeEventListener('pointercancel', endDrag);
  document.removeEventListener('touchmove', blockScroll);
  el.list.classList.remove('dragging');
  el.base.classList.remove('drop');
  drag = null;

  if (overBase) { promote(row.dataset.c); return; }
  if (to !== from) {
    const [moved] = state.targets.splice(from, 1);
    state.targets.splice(to, 0, moved);
  }
  render();
}

// ---------- Währungsauswahl ----------
function openSheet(mode, code) {
  state.pick = { mode, code };
  el.removeCur.hidden = mode !== 'replace' || state.targets.length <= 1;
  el.sheet.classList.add('open');
  el.sheet.setAttribute('aria-hidden', 'false');
  el.search.value = '';
  drawPick('');
  setTimeout(() => el.search.focus(), 260);
}
function closeSheet() {
  el.sheet.classList.remove('open');
  el.sheet.setAttribute('aria-hidden', 'true');
  el.search.blur();
  state.pick = null;
}
function drawPick(q) {
  const codes = Object.keys(state.table || state.names || {}).sort();
  const term = q.trim().toLowerCase();
  const cur = state.pick.mode === 'base' ? state.base : state.pick.code;
  el.picklist.innerHTML = codes
    .filter((c) => !term || c.toLowerCase().includes(term) || (state.names[c] || '').toLowerCase().includes(term))
    .map((c) => {
      const used = c === state.base || state.targets.includes(c);
      return `<button data-c="${c}" data-used="${used && c !== cur ? 1 : 0}" aria-current="${c === cur}">
        <span class="flag"><span>${flagChar(c)}</span></span>
        <span class="code">${c}</span><span class="sym">${SYM[c] || ''}</span>
        <span class="n">${state.names[c] || ''}</span></button>`;
    }).join('') || '<p style="padding:20px 6px;color:var(--muted)">Keine Treffer.</p>';
}
el.search.addEventListener('input', () => drawPick(el.search.value));
el.closeSheet.addEventListener('click', closeSheet);

el.picklist.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-c]');
  if (!b || !state.pick) return;
  const c = b.dataset.c, { mode, code } = state.pick;

  if (mode === 'base') {
    if (c === state.base) return closeSheet();
    promote(c);
  } else if (mode === 'add') {
    if (c !== state.base && !state.targets.includes(c)) state.targets.push(c);
  } else {                                            // replace
    const i = state.targets.indexOf(code);
    if (c === state.base) { closeSheet(); return promote(code); }   // Tausch mit der Basis
    if (state.targets.includes(c)) state.targets.splice(state.targets.indexOf(c), 1);
    state.targets[i] = c;
  }
  closeSheet();
  render();
});

el.removeCur.addEventListener('click', () => {
  const i = state.targets.indexOf(state.pick.code);
  if (i > -1) state.targets.splice(i, 1);
  closeSheet();
  render();
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
render();
refresh();
if (!Object.keys(state.names).length) loadNames();
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
window.addEventListener('online', () => refresh(true));
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
