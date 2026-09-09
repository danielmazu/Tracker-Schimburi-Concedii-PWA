/* ============================================================
   Ture & Concediu — 4 ture (T1..T4) in sistem 12/24 + concediu
   Stack: vanilla JS + localStorage + service worker (PWA)
   ============================================================ */
'use strict';

/* ═══════════════════  1. ALGORITMUL TURELOR  ═══════════════════
   Ciclu de 4 zile calendaristice pentru FIECARE tura, plecand de la
   o "data de referinta" in care tura respectiva a avut TURA DE ZI:

     offset 0 -> ZI      (06:00 - 18:00)
     offset 1 -> NOAPTE  (18:00 - 06:00 ziua urmatoare)
     offset 2 -> LIBER   (iese din tura de noapte la 06:00)
     offset 3 -> LIBER
     offset 4 -> ZI  (se reia)

   Cele 4 ture sunt decalate cu 1 zi una fata de alta => in fiecare zi
   exact o tura e pe ZI si exact una pe NOAPTE, celelalte 2 sunt libere.
   Doar ZI si NOAPTE consuma concediu.
   ════════════════════════════════════════════════════════════════ */

const MS_DAY = 86400000;
const CYCLE  = ['zi', 'noapte', 'liber', 'liber'];
const TEAMS  = ['T1', 'T2', 'T3', 'T4'];

const SHIFT_INFO = {
  zi:     { nume: 'Tura de zi',     scurt: 'Zi',     ore: '06:00 – 18:00',             start: 6,    dur: 12, lucrata: true  },
  noapte: { nume: 'Tura de noapte', scurt: 'Noapte', ore: '18:00 – 06:00 (a doua zi)', start: 18,   dur: 12, lucrata: true  },
  liber:  { nume: 'Liber',          scurt: 'Liber',  ore: '—',                          start: null, dur: 0,  lucrata: false }
};

/** Normalizare la miezul noptii UTC -> imun la ora de vara / fus orar. */
function dayNum(d) {
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / MS_DAY);
}
/** Index in ciclul de 4 zile (0..3). Modulo pozitiv => merge si in TRECUT. */
function cycleIndex(d, ref) {
  return (((dayNum(d) - dayNum(ref)) % 4) + 4) % 4;
}
/** 'zi' | 'noapte' | 'liber' pentru data `d` raportat la referinta `ref`. */
function shiftOf(d, ref) {
  return CYCLE[cycleIndex(d, ref)];
}
/** Tura echipei `team` (0..3) in ziua `d`. */
function shiftOfTeam(d, team) {
  const ref = refOf(team);
  return ref ? shiftOf(d, ref) : 'liber';
}
/** Tura UTILIZATORULUI in ziua `d` — foloseste mereu state.myTeam. */
function myShift(d) { return shiftOfTeam(d, myTeam()); }
/** true daca utilizatorul ar fi avut tura (zi sau noapte) in ziua `d`. */
function isWorkDay(d) { return SHIFT_INFO[myShift(d)].lucrata; }

/** Cine e pe zi si cine e pe noapte in ziua `d`. */
function teamsOn(d) {
  const out = { zi: [], noapte: [] };
  for (let t = 0; t < 4; t++) {
    const s = shiftOfTeam(d, t);
    if (s !== 'liber') out[s].push(t);
  }
  return out;
}

/**
 * Zile de concediu CONSUMATE in intervalul [start, end] inclusiv.
 * Se scad DOAR zilele in care utilizatorul ar fi avut tura; zilele
 * libere din schema care pica in interval sunt ignorate.
 */
function countVacation(start, end, onlyYear = null) {
  const out = { total: 0, consumate: 0, libere: 0, zi: 0, noapte: 0 };
  if (!start || !end || end < start) return out;
  const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const lim = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  while (cur <= lim) {
    if (onlyYear === null || cur.getFullYear() === onlyYear) {
      out.total++;
      const s = myShift(cur);
      if (s === 'liber') out.libere++;
      else { out.consumate++; out[s]++; }
    }
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

/**
 * Urmatoarea tura la care utilizatorul trebuie sa mearga.
 * Sare peste zilele de concediu. Detecteaza si tura in desfasurare.
 */
function nextShift(from = new Date()) {
  const vset = vacationSet();
  let current = null, next = null;
  for (let i = 0; i <= 60 && !next; i++) {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i);
    const s = myShift(d);
    if (s === 'liber' || vset.has(iso(d))) continue;
    const info  = SHIFT_INFO[s];
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), info.start, 0, 0);
    const end   = new Date(start.getTime() + info.dur * 3600000);
    if (from >= start && from < end) current = { date: new Date(d), shift: s, start, end };
    else if (start > from)           next    = { date: new Date(d), shift: s, start, end };
  }
  return { next, current };
}

/* ═══════════════════  1b. SARBATORI LEGALE (Romania)  ═══════════════════
   Codul Muncii, art. 139. Zilele fixe + cele mobile legate de Pastele
   ORTODOX (calculat cu algoritmul Meeus/Julian + 13 zile pentru 1900-2099).

   IMPORTANT: sarbatorile NU modifica in niciun fel schema turelor sau
   calculul concediului — sunt strict informative.
   ═══════════════════════════════════════════════════════════════════════ */

const FIXED_HOLIDAYS = {
  '01-01': 'Anul Nou',
  '01-02': 'Anul Nou',
  '01-06': 'Boboteaza',
  '01-07': 'Sfantul Ioan Botezatorul',
  '01-24': 'Ziua Unirii Principatelor Romane',
  '05-01': 'Ziua Muncii',
  '06-01': 'Ziua Copilului',
  '08-15': 'Adormirea Maicii Domnului',
  '11-30': 'Sfantul Andrei',
  '12-01': 'Ziua Nationala a Romaniei',
  '12-25': 'Prima zi de Craciun',
  '12-26': 'A doua zi de Craciun'
};

/** Pastele ortodox (duminica) pentru un an — algoritm Meeus (calendar julian + 13 zile). */
function orthodoxEaster(year) {
  const a = year % 4, b = year % 7, c = year % 19;
  const d = (19 * c + 15) % 30;
  const e = (2 * a + 4 * b - d + 34) % 7;
  const month = Math.floor((d + e + 114) / 31);       // 3 = martie, 4 = aprilie
  const day   = ((d + e + 114) % 31) + 1;
  const julian = new Date(year, month - 1, day);
  julian.setDate(julian.getDate() + 13);              // julian -> gregorian
  return julian;
}

const _holCache = new Map();

/** Map 'YYYY-MM-DD' -> nume sarbatoare, pentru un an intreg. */
function holidaysOf(year) {
  if (_holCache.has(year)) return _holCache.get(year);
  const map = new Map();
  for (const md in FIXED_HOLIDAYS) map.set(`${year}-${md}`, FIXED_HOLIDAYS[md]);

  const easter = orthodoxEaster(year);
  // daca o sarbatoare mobila cade peste una fixa (ex. Rusalii pe 1 Iunie, 2026)
  // pastram ambele denumiri, nu suprascriem.
  const add = (offset, nume) => {
    const d = new Date(easter.getFullYear(), easter.getMonth(), easter.getDate() + offset);
    const k = iso(d), prev = map.get(k);
    map.set(k, prev && prev !== nume ? prev + ' + ' + nume : nume);
  };
  add(-2, 'Vinerea Mare');
  add(0,  'Prima zi de Paste');
  add(1,  'A doua zi de Paste');
  add(49, 'Prima zi de Rusalii');
  add(50, 'A doua zi de Rusalii');

  _holCache.set(year, map);
  return map;
}

/**
 * Numele sarbatorii legale pentru data `d`, sau null.
 * Straturi, in ordine de prioritate:
 *   1. state.holHidden — sarbatori dezactivate manual din setari
 *   2. state.holExtra  — sarbatori adaugate/redenumite manual din setari
 *   3. lista calculata automat (fixe + mobile din Pastele ortodox)
 */
function holidayName(d) {
  const k = iso(d);
  if (state.holHidden.indexOf(k) !== -1) return null;
  if (state.holExtra[k]) return state.holExtra[k];
  return holidaysOf(d.getFullYear()).get(k) || null;
}

/** Lista completa pentru un an: [{ key, nume, custom, hidden }] sortata. */
function holidayList(year) {
  const all = new Map(holidaysOf(year));
  for (const k in state.holExtra) {
    if (parseInt(k.slice(0, 4), 10) === year) all.set(k, state.holExtra[k]);
  }
  return [...all.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([k, nume]) => ({
    key: k, nume,
    custom: Object.prototype.hasOwnProperty.call(state.holExtra, k),
    hidden: state.holHidden.indexOf(k) !== -1
  }));
}

/* ═══════════════════  2. STORAGE  ═══════════════════ */

const KEY     = 'ture-concediu.v2';
const KEY_OLD = 'ture-concediu.v1';

function defaults() {
  const t = todayISO();
  return {
    myTeam: 0,
    refDates: [t, shiftISO(t, -1), shiftISO(t, -2), shiftISO(t, -3)],
    annualDays: 22,
    carryOver: 0,
    vacations: [],
    holExtra: {},      // { 'YYYY-MM-DD': 'Denumire' } adaugate/redenumite manual
    holHidden: [],     // ['YYYY-MM-DD'] dezactivate manual
    lastExport: null   // ISO datetime al ultimului backup
  };
}

/** Sanitizare: garanteaza myTeam 0..3 si refDates array de 4 date valide. */
function normalize(s) {
  const d = defaults();
  s = s || {};
  const out = {
    myTeam: 0,
    refDates: d.refDates.slice(),
    annualDays: Number.isFinite(+s.annualDays) ? Math.max(0, +s.annualDays) : 22,
    carryOver:  Number.isFinite(+s.carryOver)  ? Math.max(0, +s.carryOver)  : 0,
    vacations:  Array.isArray(s.vacations) ? s.vacations : [],
    holExtra:   {},
    holHidden:  Array.isArray(s.holHidden) ? s.holHidden.filter(k => parseISO(k)) : [],
    lastExport: typeof s.lastExport === 'string' ? s.lastExport : null
  };
  if (s.holExtra && typeof s.holExtra === 'object') {
    for (const k in s.holExtra) {
      if (parseISO(k) && typeof s.holExtra[k] === 'string' && s.holExtra[k].trim()) {
        out.holExtra[k] = s.holExtra[k].trim().slice(0, 60);
      }
    }
  }
  const mt = parseInt(s.myTeam, 10);
  out.myTeam = (mt >= 0 && mt <= 3) ? mt : 0;
  if (Array.isArray(s.refDates)) {
    for (let i = 0; i < 4; i++) if (parseISO(s.refDates[i])) out.refDates[i] = s.refDates[i];
  } else if (s.refDate && parseISO(s.refDate)) {          // migrare din v1 (o singura tura)
    for (let k = 0; k < 4; k++) out.refDates[k] = shiftISO(s.refDate, -k);
  }
  return out;
}

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return normalize(JSON.parse(raw));
    const old = localStorage.getItem(KEY_OLD);
    if (old) return normalize(JSON.parse(old));
  } catch (e) { /* fallback */ }
  return defaults();
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch (e) { toast('Nu am putut salva datele local'); }
}
function myTeam()      { return state.myTeam; }
function refOf(team)   { return parseISO(state.refDates[team]); }

/* ═══════════════════  3. HELPERI DATA  ═══════════════════ */

const LUNI = ['Ianuarie','Februarie','Martie','Aprilie','Mai','Iunie','Iulie','August','Septembrie','Octombrie','Noiembrie','Decembrie'];
const ZILE = ['Duminica','Luni','Marti','Miercuri','Joi','Vineri','Sambata'];
const ZS   = ['Dum','Lun','Mar','Mie','Joi','Vin','Sam'];

function todayISO() { return iso(new Date()); }
function iso(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function parseISO(s) {
  if (!s) return null;
  const p = String(s).split('-').map(Number);
  if (p.length !== 3 || !p[0] || isNaN(p[1]) || isNaN(p[2])) return null;
  return new Date(p[0], p[1] - 1, p[2]);
}
function shiftISO(isoStr, days) {
  const d = parseISO(isoStr); if (!d) return isoStr;
  d.setDate(d.getDate() + days); return iso(d);
}
function sameDay(a, b) { return dayNum(a) === dayNum(b); }
function fmtLong(d)  { return `${ZILE[d.getDay()]}, ${d.getDate()} ${LUNI[d.getMonth()]} ${d.getFullYear()}`; }
function fmtShort(d) { return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`; }
function hhmm(d)     { return String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0'); }

/** "in 2 zile si 5 h" / "in 14 h 20 min" / "in 35 min". */
function humanDelta(ms) {
  if (ms < 0) ms = 0;
  const min = Math.floor(ms / 60000), h = Math.floor(min / 60), zi = Math.floor(h / 24);
  if (zi >= 1) { const rh = h % 24; return `in ${zi} ${zi === 1 ? 'zi' : 'zile'}${rh ? ' si ' + rh + ' h' : ''}`; }
  if (h >= 1)  { const rm = min % 60; return `in ${h} h${rm ? ' ' + rm + ' min' : ''}`; }
  return min <= 1 ? 'chiar acum' : `in ${min} min`;
}

/* ═══════════════════  4. LOGICA CONCEDII  ═══════════════════ */

let _vset = null;
function vacationSet() {
  if (_vset) return _vset;
  const set = new Set();
  for (const v of state.vacations) {
    const s = parseISO(v.start), e = parseISO(v.end);
    if (!s || !e || e < s) continue;
    const cur = new Date(s);
    while (cur <= e) { set.add(iso(cur)); cur.setDate(cur.getDate() + 1); }
  }
  return (_vset = set);
}
function usedInYear(year) {
  let n = 0;
  for (const v of state.vacations) n += countVacation(parseISO(v.start), parseISO(v.end), year).consumate;
  return n;
}
/**
 * Calculeaza orele pentru luna `month` (0-based) din anul `year`:
 *  - normHours:  zile lucratoare (L-V minus sarbatori legale active) × 8
 *  - plannedHours: ture planificate ale utilizatorului × 12
 *    (tura de noapte din ultima zi a lunii se pune integral in luna curenta)
 *  - extraHours: plannedHours - normHours (poate fi negativ)
 */
function calcMonthHours(year, month) {
  const dim = new Date(year, month + 1, 0).getDate();
  let workDays = 0, plannedShifts = 0;
  for (let d = 1; d <= dim; d++) {
    const date = new Date(year, month, d);
    const dow  = date.getDay();                          // 0=Dum..6=Sam
    // zile lucratoare = L-V fara sarbatori legale active
    if (dow >= 1 && dow <= 5 && !holidayName(date)) workDays++;
    // ture planificate: zi si noapte; noapte din ultima zi a lunii = in aceasta luna
    const s = myShift(date);
    if (s === 'zi' || s === 'noapte') plannedShifts++;
  }
  const normHours    = workDays * 8;
  const plannedHours = plannedShifts * 12;
  return { normHours, plannedHours, extraHours: plannedHours - normHours };
}

function renderMonthHours() {
  const el = $('monthHours'); if (!el) return;
  const { normHours, plannedHours, extraHours } = calcMonthHours(viewY, viewM);
  const sign  = extraHours > 0 ? '+' : '';
  const color = extraHours > 0 ? 'var(--zi)' : extraHours < 0 ? 'var(--danger)' : 'var(--conc)';
  $('mhNorm').textContent    = normHours + 'h';
  $('mhPlanned').textContent = plannedHours + 'h';
  $('mhExtra').textContent   = sign + extraHours + 'h';
  $('mhExtra').style.color   = color;
}

function overlaps(s, e) {
  return state.vacations.some(v => {
    const vs = parseISO(v.start), ve = parseISO(v.end);
    return vs && ve && s <= ve && e >= vs;
  });
}

/* ═══════════════════  5. STARE UI  ═══════════════════ */

let viewY = new Date().getFullYear();
let viewM = new Date().getMonth();
let selected = new Date();
let draftRefs = null;
let holViewY  = new Date().getFullYear();

const $ = id => document.getElementById(id);
const teamLbl = arr => arr.map(t => TEAMS[t]).join('+');

/* ═══════════════════  6. RANDARE  ═══════════════════ */

function renderAll() {
  _vset = null;                                   // invalideaza cache concedii
  $('myTeamBadge').textContent = 'Tura ' + TEAMS[myTeam()];
  $('lgMine').textContent      = TEAMS[myTeam()];      // legenda arata tura TA reala
  renderNext();
  renderStats();
  renderMonthHours();
  renderCalendar();
  renderVacList();
  renderPreview();
}

function renderNext() {
  const { next, current } = nextShift();
  const card = $('nextCard');
  card.classList.remove('is-zi', 'is-noapte');

  if (current) {
    $('nextNow').hidden = false;
    $('nextNow').textContent = `Acum esti in ${SHIFT_INFO[current.shift].nume.toLowerCase()} — iesi la ${hhmm(current.end)} (${humanDelta(current.end - new Date())})`;
  } else $('nextNow').hidden = true;

  if (!next) {
    $('nextPill').className = 'pill liber';
    $('nextPill').textContent = '—';
    $('nextWhen').textContent = 'Nicio tura in 60 de zile';
    $('nextCount').textContent = 'Verifica datele de referinta din setari.';
    return;
  }
  card.classList.add('is-' + next.shift);
  $('nextPill').className = 'pill ' + next.shift;
  $('nextPill').textContent = SHIFT_INFO[next.shift].scurt;
  // rand mare: ziua completa + ora de intrare
  $('nextWhen').textContent  = `${fmtLong(next.date)}, ${hhmm(next.start)}`;
  // rand mic: DOAR durata pana atunci
  $('nextCount').textContent = humanDelta(next.start - new Date());
}

function renderStats() {
  const total = (+state.annualDays || 0) + (+state.carryOver || 0);
  const used  = usedInYear(viewY);
  const left  = total - used;
  $('statTotal').textContent = total;
  $('statUsed').textContent  = used;
  $('statLeft').textContent  = left;
  $('statLeft').style.color  = left < 0 ? 'var(--danger)' : 'var(--conc)';
  $('statBar').style.width   = total > 0 ? Math.min(100, Math.max(0, used / total * 100)) + '%' : '0%';
  $('statYear').textContent  = `Concediu ${viewY}` + (state.carryOver > 0 ? ` · include ${state.carryOver} reportate` : '');
}

function cellHTML(date, isPad) {
  const key  = iso(date);
  const on   = teamsOn(date);
  const mine = myShift(date);
  const cls  = ['cell', 'my-' + mine];
  const hol  = holidayName(date);
  if (isPad) cls.push('pad');
  else {
    if (hol) cls.push('holiday');
    if (vacationSet().has(key)) { cls.push('vac'); if (mine === 'liber') cls.push('free'); }
    if (sameDay(date, new Date())) cls.push('today');
    if (sameDay(date, selected))   cls.push('sel');
  }
  const chip = (s, arr) => arr.length
    ? `<i class="chip ${s}${arr.indexOf(myTeam()) !== -1 ? ' mine' : ''}">${teamLbl(arr)}</i>`
    : `<i class="chip ${s}" style="opacity:.22">–</i>`;
  return `<div class="${cls.join(' ')}"${isPad ? '' : ` data-d="${key}"`}${hol && !isPad ? ` title="${hol}"` : ''}>
    <span class="dnum">${date.getDate()}</span>
    <span class="chips">${chip('zi', on.zi)}${chip('noapte', on.noapte)}</span>
  </div>`;
}

function renderCalendar() {
  $('calTitle').textContent = `${LUNI[viewM]} ${viewY}`;
  const offset = (new Date(viewY, viewM, 1).getDay() + 6) % 7;      // luni = 0
  const dim    = new Date(viewY, viewM + 1, 0).getDate();
  let html = '';
  for (let i = offset; i > 0; i--) html += cellHTML(new Date(viewY, viewM, 1 - i), true);
  for (let d = 1; d <= dim; d++)   html += cellHTML(new Date(viewY, viewM, d), false);
  const tail = (7 - ((offset + dim) % 7)) % 7;
  for (let i = 1; i <= tail; i++)  html += cellHTML(new Date(viewY, viewM + 1, i), true);

  const grid = $('calGrid');
  grid.innerHTML = html;
  grid.querySelectorAll('.cell[data-d]').forEach(el => el.addEventListener('click', () => {
    selected = parseISO(el.dataset.d);
    renderCalendar(); openDaySheet(selected);
  }));
  renderDayNav();
}

function renderDayNav() {
  const s = myShift(selected), on = teamsOn(selected);
  const v = vacationSet().has(iso(selected)) ? ' + concediu' : '';
  const hol = holidayName(selected);
  $('dayNavInfo').innerHTML = `${fmtShort(selected)} · <b>${SHIFT_INFO[s].scurt}</b>${v}
    <span class="muted">(zi ${teamLbl(on.zi) || '–'} / noapte ${teamLbl(on.noapte) || '–'})</span>`
    + (hol ? `<br><span class="hol-txt">${hol}</span>` : '');
}

function renderVacList() {
  const box = $('vacList');
  if (!state.vacations.length) {
    box.innerHTML = '<div class="empty">Nu ai niciun concediu inregistrat.</div>';
    $('vacCount').textContent = ''; return;
  }
  const sorted = state.vacations.slice().sort((a, b) => a.start.localeCompare(b.start));
  $('vacCount').textContent = `(${sorted.length})`;
  box.innerHTML = sorted.map(v => {
    const s = parseISO(v.start), e = parseISO(v.end), c = countVacation(s, e);
    return `<div class="vac-item">
      <div class="vi-main">
        <div class="vi-range">${fmtShort(s)} → ${fmtShort(e)}</div>
        <div class="vi-meta">${c.total} zile calend. · ${c.zi} zi / ${c.noapte} noapte</div>
      </div>
      <span class="vi-badge">-${c.consumate}</span>
      <button class="vi-del" data-id="${v.id}" aria-label="Sterge">&times;</button>
    </div>`;
  }).join('');
  box.querySelectorAll('.vi-del').forEach(b => b.addEventListener('click', () => {
    if (!confirm('Stergi acest concediu?')) return;
    state.vacations = state.vacations.filter(v => v.id !== b.dataset.id);
    save(); renderAll(); toast('Concediu sters');
  }));
}

function renderPreview() {
  const s = parseISO($('vacStart').value), e = parseISO($('vacEnd').value), box = $('vacPreview');
  if (!s || !e) { box.textContent = 'Alege perioada pentru a vedea cate zile se consuma.'; return; }
  if (e < s)    { box.textContent = 'Data de final este inaintea datei de start.'; return; }
  const c = countVacation(s, e);
  box.innerHTML = `<b>${c.total}</b> zile calendaristice → se consuma <b style="color:var(--conc)">${c.consumate}</b> zile de concediu
    <br>(${c.zi} ture de zi + ${c.noapte} ture de noapte) · ${c.libere} zile libere din schema, ignorate`;
}

/* ═══════════════════  7. SHEETS  ═══════════════════ */

function openSheet(el) { $('sheetBackdrop').classList.add('open'); el.classList.add('open'); }
function closeSheets() {
  $('sheetBackdrop').classList.remove('open');
  $('settingsSheet').classList.remove('open');
  $('daySheet').classList.remove('open');
}

function openDaySheet(d) {
  const on = teamsOn(d), s = myShift(d), isV = vacationSet().has(iso(d));
  const lbl = arr => arr.length ? 'Tura ' + teamLbl(arr) : '— nimeni';
  const hol = holidayName(d);
  $('dsHolRow').hidden = !hol;
  if (hol) $('dsHol').textContent = hol;
  $('dsTitle').textContent   = fmtLong(d);
  $('dsDay').textContent     = lbl(on.zi);
  $('dsNight').textContent   = lbl(on.noapte);
  $('dsMyTeam').textContent  = TEAMS[myTeam()];
  $('dsShift').textContent   = SHIFT_INFO[s].nume + (SHIFT_INFO[s].lucrata ? ' · ' + SHIFT_INFO[s].ore : '');
  $('dsShift').style.color   = s === 'zi' ? 'var(--zi-txt)' : s === 'noapte' ? 'var(--noapte-txt)' : 'var(--txt2)';
  $('dsVac').textContent     = isV ? 'Da' : 'Nu';
  $('dsConsume').textContent = !isV ? '—' : (SHIFT_INFO[s].lucrata ? 'Da (1 zi)' : 'Nu (era zi libera)');
  $('dsConsume').style.color = !isV ? 'var(--txt)' : (SHIFT_INFO[s].lucrata ? 'var(--zi)' : 'var(--conc)');
  openSheet($('daySheet'));
}

function openSettings() {
  draftRefs = state.refDates.slice();
  $('setDays').value  = state.annualDays;
  $('setCarry').value = state.carryOver;
  holViewY = viewY;
  // secitunile pliabile pornesc mereu inchise
  collapse('refBody', 'refToggle');
  collapse('holBody', 'holToggle');
  renderTeamPick(); renderRefRows(); renderHolList(); renderBackupHint();
  $('bkPaste').hidden = true; $('bkText').value = '';
  $('bkYear').textContent = viewY;
  openSheet($('settingsSheet'));
}

/* ---------- gestionare sarbatori legale (se aplica imediat) ---------- */

function renderHolList() {
  // rezumat pe butonul de deschidere: cate modificari manuale exista
  const nMod = Object.keys(state.holExtra).length + state.holHidden.length;
  $('holSub').textContent = nMod
    ? `${nMod} ${nMod === 1 ? 'modificare' : 'modificari'} manuale`
    : 'calculate automat';
  $('holSub').classList.toggle('mod', nMod > 0);

  if ($('holBody').hidden) return;          // nu randa lista cand e inchisa
  $('holYear').textContent = holViewY;
  const list = holidayList(holViewY);
  const box  = $('holList');
  if (!list.length) { box.innerHTML = '<div class="empty">Nicio sarbatoare in acest an.</div>'; return; }
  box.innerHTML = list.map(h => {
    const d = parseISO(h.key);
    return `<div class="hol-item${h.hidden ? ' off' : ''}">
      <span class="hi-d">${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}</span>
      <span class="hi-n">${h.nume}${h.custom ? '<i class="hi-tag">manual</i>' : ''}</span>
      <button type="button" class="hi-t" data-k="${h.key}" title="${h.hidden ? 'Activeaza' : 'Dezactiveaza'}">${h.hidden ? '○' : '●'}</button>
      ${h.custom ? `<button type="button" class="hi-x" data-x="${h.key}" title="Sterge">&times;</button>` : ''}
    </div>`;
  }).join('');

  box.querySelectorAll('.hi-t').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.k, i = state.holHidden.indexOf(k);
    if (i === -1) state.holHidden.push(k); else state.holHidden.splice(i, 1);
    save(); renderHolList(); renderCalendar();
  }));
  box.querySelectorAll('.hi-x').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.x;
    delete state.holExtra[k];
    state.holHidden = state.holHidden.filter(h => h !== k);
    save(); renderHolList(); renderCalendar(); toast('Sarbatoare stearsa');
  }));
}

function addHoliday() {
  const d = parseISO($('holDate').value);
  const n = $('holName').value.trim().slice(0, 60);
  if (!d) return toast('Alege o data');
  if (!n) return toast('Scrie denumirea sarbatorii');
  const k = iso(d);
  state.holExtra[k] = n;
  state.holHidden = state.holHidden.filter(h => h !== k);   // reactiveaza daca era ascunsa
  save();
  $('holDate').value = ''; $('holName').value = '';
  holViewY = d.getFullYear();
  renderHolList(); renderCalendar();
  toast('Adaugat: ' + n);
}

/* Selectorul de tura se aplica IMEDIAT in toata aplicatia. */
function renderTeamPick() {
  $('teamPick').innerHTML = TEAMS.map((t, i) =>
    `<button type="button" class="tp${i === myTeam() ? ' on' : ''}" data-t="${i}">${t}</button>`).join('');
  $('teamPick').querySelectorAll('.tp').forEach(b => b.addEventListener('click', () => {
    state.myTeam = +b.dataset.t;
    save();
    renderTeamPick(); renderRefRows();
    renderAll();                                  // calendar + contor + urmatoarea tura, instant
    toast('Tura ta: ' + TEAMS[state.myTeam]);
  }));
}

function renderRefRows() {
  if ($('refBody').hidden) return;           // nu randa cand e inchis
  $('refRows').innerHTML = TEAMS.map((t, i) =>
    `<div class="ref-row${i === myTeam() ? ' me' : ''}">
       <div class="rl">${t}</div>
       <input type="date" data-t="${i}" value="${draftRefs[i] || ''}">
     </div>`).join('');
  $('refRows').querySelectorAll('input').forEach(inp => inp.addEventListener('change', () => {
    draftRefs[+inp.dataset.t] = inp.value;
  }));
}

/* (butonul de completare automata a fost eliminat — datele se introduc manual
   pentru fiecare tura; hint-ul de mai jos marcheaza cu ⚠ acoperirea incompleta) */

/* Blocul de previzualizare a ciclului a fost eliminat — verificarea se face
   direct pe calendar. Validarea datelor lipsa se face la salvare. */

/* ═══════════════════  8. TOAST  ═══════════════════ */

let toastT;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2400);
}

/* ═══════════════════  9. EVENIMENTE  ═══════════════════ */

$('prevMonth').onclick = () => { if (--viewM < 0)  { viewM = 11; viewY--; } renderCalendar(); renderStats(); renderMonthHours(); };
$('nextMonth').onclick = () => { if (++viewM > 11) { viewM = 0;  viewY++; } renderCalendar(); renderStats(); renderMonthHours(); };
$('prevYear').onclick  = () => { viewY--; renderCalendar(); renderStats(); renderMonthHours(); };
$('nextYear').onclick  = () => { viewY++; renderCalendar(); renderStats(); renderMonthHours(); };
$('calTitle').onclick  = () => {
  const t = new Date(); viewY = t.getFullYear(); viewM = t.getMonth(); selected = t;
  renderCalendar(); renderStats(); toast('Am revenit la luna curenta');
};

function moveDay(step) {
  selected.setDate(selected.getDate() + step);
  if (selected.getMonth() !== viewM || selected.getFullYear() !== viewY) {
    viewM = selected.getMonth(); viewY = selected.getFullYear(); renderStats();
  }
  renderCalendar();
}
$('prevDay').onclick = () => moveDay(-1);
$('nextDay').onclick = () => moveDay(1);

// swipe orizontal pe calendar = luna anterioara / urmatoare
(function () {
  const g = $('calGrid'); let x0 = null, y0 = null;
  g.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
  g.addEventListener('touchend', e => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
    if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.6) (dx < 0 ? $('nextMonth') : $('prevMonth')).onclick();
    x0 = null;
  }, { passive: true });
})();

$('vacStart').addEventListener('change', () => {
  if (!$('vacEnd').value || $('vacEnd').value < $('vacStart').value) $('vacEnd').value = $('vacStart').value;
  renderPreview();
});
$('vacEnd').addEventListener('change', renderPreview);

$('vacForm').addEventListener('submit', e => {
  e.preventDefault();
  const s = parseISO($('vacStart').value), en = parseISO($('vacEnd').value);
  if (!s || !en)       return toast('Completeaza ambele date');
  if (en < s)          return toast('Data de final e inaintea celei de start');
  if (overlaps(s, en)) return toast('Perioada se suprapune cu un concediu existent');
  const c = countVacation(s, en);
  state.vacations.push({ id: 'v' + Date.now().toString(36), start: iso(s), end: iso(en) });
  save(); $('vacForm').reset();
  viewY = s.getFullYear(); viewM = s.getMonth(); selected = new Date(s);
  renderAll();
  toast(`Adaugat: ${c.consumate} zile consumate din ${c.total}`);
});

$('btnSettings').onclick   = openSettings;
$('closeSettings').onclick = closeSheets;
$('dsClose').onclick       = closeSheets;
$('sheetBackdrop').onclick = closeSheets;
/* ---------- secitiuni pliabile ---------- */

function collapse(bodyId, btnId) {
  $(bodyId).hidden = true;
  $(btnId).setAttribute('aria-expanded', 'false');
  $(btnId).classList.remove('open');
}
function toggleSection(bodyId, btnId, onOpen) {
  const body = $(bodyId), open = body.hidden;
  body.hidden = !open;
  $(btnId).setAttribute('aria-expanded', open ? 'true' : 'false');
  $(btnId).classList.toggle('open', open);
  if (open && onOpen) onOpen();
}

$('refToggle').onclick = () => toggleSection('refBody', 'refToggle', renderRefRows);
$('holToggle').onclick = () => toggleSection('holBody', 'holToggle', renderHolList);
$('holPrev').onclick  = () => { holViewY--; renderHolList(); };
$('holNext').onclick  = () => { holViewY++; renderHolList(); };
$('holAdd').onclick   = addHoliday;
$('holName').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addHoliday(); } });
$('holReset').onclick = () => {
  if (!confirm('Sterg toate modificarile manuale si revin la sarbatorile calculate automat?')) return;
  state.holExtra = {}; state.holHidden = [];
  save(); renderHolList(); renderCalendar(); toast('Sarbatori resetate');
};

$('saveSettings').onclick = () => {
  if (draftRefs.some(r => !parseISO(r))) return toast('Toate cele 4 ture au nevoie de o data de referinta');
  state.refDates   = draftRefs.slice();
  state.annualDays = Math.max(0, parseInt($('setDays').value, 10)  || 0);
  state.carryOver  = Math.max(0, parseInt($('setCarry').value, 10) || 0);
  save(); closeSheets(); renderAll(); toast('Setari salvate');
};

/* ═══════════════════  BACKUP: EXPORT / IMPORT  ═══════════════════ */

/**
 * Livreaza un fisier catre utilizator.
 * Pe telefon foloseste Web Share API (permite salvare in Files/Drive,
 * trimitere pe WhatsApp/e-mail); pe desktop cade pe descarcare clasica.
 */
async function deliverFile(blob, filename, title) {
  const file = new File([blob], filename, { type: blob.type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      markExport(); return 'shared';
    } catch (err) {
      if (err && err.name === 'AbortError') return 'cancel';   // utilizatorul a anulat
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  markExport(); return 'download';
}

function markExport() {
  state.lastExport = new Date().toISOString();
  save(); renderBackupHint();
}

function renderBackupHint() {
  const box = $('bkHint'); if (!box) return;
  const n = state.vacations.length;
  if (!state.lastExport) {
    box.className = 'bk-hint warn';
    box.textContent = `Nu ai facut niciun backup. Ai ${n} ${n === 1 ? 'concediu' : 'concedii'} salvate doar pe acest telefon.`;
    return;
  }
  const d = new Date(state.lastExport);
  const zile = Math.floor((dayNum(new Date()) - dayNum(d)));
  const cand = zile === 0 ? 'astazi' : zile === 1 ? 'ieri' : `acum ${zile} zile`;
  box.className = 'bk-hint' + (zile > 30 ? ' warn' : ' ok');
  box.textContent = `Ultimul backup: ${cand} (${fmtShort(d)} ${hhmm(d)})` + (zile > 30 ? ' — recomandat un backup nou.' : '');
}

/* ---------- 1. Export Excel (.xlsx) ---------- */

function buildWorkbook(year) {
  const S = XlsxLite.S;
  const H = t => ({ v: t, s: S.HEADER });
  const sheets = [];

  /* --- Foaia 1: Rezumat --- */
  const total = (+state.annualDays || 0) + (+state.carryOver || 0);
  const years = [...new Set(state.vacations.map(v => +v.start.slice(0, 4)))].sort();
  if (!years.length) years.push(year);

  const r1 = [
    [{ v: 'Ture & Concediu — backup', s: S.TITLE }],
    [{ v: 'Generat', s: S.BOLD }, `${fmtShort(new Date())} ${hhmm(new Date())}`],
    [],
    [{ v: 'CONFIGURARE', s: S.BOLD }],
    ['Tura mea', TEAMS[myTeam()]],
    ['Zile de concediu pe an', +state.annualDays || 0],
    ['Reportate din anii precedenti', +state.carryOver || 0],
    [{ v: 'Total disponibil', s: S.BOLD }, { v: total, s: S.BOLD }],
    [],
    [{ v: 'ZILE DE REFERINTA (tura de zi)', s: S.BOLD }],
    [H('Tura'), H('Zi de referinta'), H('Ziua saptamanii')]
  ];
  TEAMS.forEach((t, i) => {
    const d = refOf(i);
    r1.push([{ v: t + (i === myTeam() ? '  (tura mea)' : ''), s: S.BOLD },
             d ? fmtShort(d) : '—', d ? ZILE[d.getDay()] : '—']);
  });
  r1.push([], [{ v: 'EVIDENTA PE ANI', s: S.BOLD }], [H('An'), H('Consumate'), H('Ramase')]);
  years.forEach(y => {
    const u = usedInYear(y);
    r1.push([y, u, total - u]);
  });
  r1.push([], [{ v: 'Sistem: 12/24 in 4 ture — Zi, Noapte, Liber, Liber (ciclu de 4 zile).', s: S.MUTED }],
             [{ v: 'Concediul se scade doar in zilele cu tura (zi sau noapte).', s: S.MUTED }]);
  sheets.push({ name: 'Rezumat', cols: [32, 16, 14], rows: r1 });

  /* --- Foaia 2: Concedii --- */
  const r2 = [[H('Nr'), H('Start'), H('Final'),
               H('Zile calendaristice'), H('Zile consumate'), H('Ture zi'), H('Ture noapte'), H('Zile libere')]];
  state.vacations.slice().sort((a, b) => a.start.localeCompare(b.start)).forEach((v, i) => {
    const s = parseISO(v.start), e = parseISO(v.end), c = countVacation(s, e);
    r2.push([i + 1, fmtShort(s), fmtShort(e),
             c.total, { v: c.consumate, s: S.CONC }, c.zi, c.noapte, c.libere]);
  });
  if (state.vacations.length) {
    const tot = state.vacations.reduce((acc, v) => {
      const c = countVacation(parseISO(v.start), parseISO(v.end));
      acc.t += c.total; acc.c += c.consumate; acc.z += c.zi; acc.n += c.noapte; acc.l += c.libere;
      return acc;
    }, { t: 0, c: 0, z: 0, n: 0, l: 0 });
    r2.push([{ v: 'TOTAL', s: S.BOLD }, '', '',
             { v: tot.t, s: S.BOLD }, { v: tot.c, s: S.BOLD },
             { v: tot.z, s: S.BOLD }, { v: tot.n, s: S.BOLD }, { v: tot.l, s: S.BOLD }]);
  }
  sheets.push({ name: 'Concedii', cols: [5, 12, 12, 17, 15, 9, 12, 11], rows: r2, freeze: 1, filter: 1 });

  /* --- Foaia 3: Calendarul anului --- */
  const r3 = [[H('Data'), H('Zi'), H('Tura mea'), H('Tura de zi'),
               H('Tura de noapte'), H('Concediu'), H('Consuma'), H('Sarbatoare legala')]];
  const vset = vacationSet();
  const cur = new Date(year, 0, 1);
  while (cur.getFullYear() === year) {
    const on = teamsOn(cur), mine = myShift(cur);
    const isV = vset.has(iso(cur)), hol = holidayName(cur);
    const st = mine === 'zi' ? S.ZI : mine === 'noapte' ? S.NOAPTE : S.NORMAL;
    r3.push([
      fmtShort(cur), ZS[cur.getDay()],
      { v: SHIFT_INFO[mine].scurt, s: st },
      teamLbl(on.zi) || '–', teamLbl(on.noapte) || '–',
      isV ? { v: 'DA', s: S.CONC } : '',
      isV ? (SHIFT_INFO[mine].lucrata ? 'da' : 'nu') : '',
      hol ? { v: hol, s: S.HOL } : ''
    ]);
    cur.setDate(cur.getDate() + 1);
  }
  sheets.push({ name: 'Calendar ' + year, cols: [11, 6, 10, 10, 14, 10, 9, 34], rows: r3, freeze: 1, filter: 1 });

  /* --- Foaia 4: Sarbatori legale --- */
  const r4 = [[H('Data'), H('Zi'), H('Denumire'), H('Activa'), H('Sursa')]];
  holidayList(year).forEach(h => {
    const d = parseISO(h.key);
    r4.push([fmtShort(d), ZS[d.getDay()], { v: h.nume, s: h.hidden ? S.MUTED : S.HOL },
             h.hidden ? 'nu' : 'da', h.custom ? 'manual' : 'automat']);
  });
  sheets.push({ name: 'Sarbatori ' + year, cols: [11, 6, 40, 8, 10], rows: r4, freeze: 1 });

  /* --- Foaia 5: Date pentru restaurare --- */
  sheets.push({
    name: 'Restaurare',
    cols: [110],
    rows: [
      [{ v: 'Cum restaurezi datele', s: S.TITLE }],
      [],
      [{ v: 'VARIANTA 1 — direct din acest fisier (recomandat)', s: S.BOLD }],
      [{ v: 'Setari (iconita din dreapta sus) → Backup si siguranta →', s: S.NORMAL }],
      [{ v: '"Restaureaza dintr-un backup" → "Alege fisierul de backup" → selecteaza acest fisier .xlsx', s: S.NORMAL }],
      [],
      [{ v: 'VARIANTA 2 — prin text (daca nu ai acces la fisier)', s: S.BOLD }],
      [{ v: 'Copiaza tot textul din celula A11, apoi in aplicatie:', s: S.NORMAL }],
      [{ v: 'Setari → Backup si siguranta → "Restaureaza dintr-un backup" → lipeste in caseta → "Restaureaza din text"', s: S.NORMAL }],
      [{ v: 'NU modifica textul de mai jos — este folosit la restaurare.', s: S.HOL }],
      [JSON.stringify(state)]
    ]
  });

  return sheets;
}

$('btnExcel').onclick = async () => {
  try {
    const blob = XlsxLite.build(buildWorkbook(viewY));
    const name = `Ture-Concediu-${viewY}-${todayISO()}.xlsx`;
    const res = await deliverFile(blob, name, 'Backup ture si concediu');
    if (res !== 'cancel') toast(res === 'shared' ? 'Fisier Excel trimis' : 'Excel descarcat: ' + name);
  } catch (err) {
    toast('Nu am putut genera fisierul Excel');
  }
};

/* ---------- 2. Restaurare ----------
   Acelasi fisier .xlsx salvat mai sus poate fi incarcat inapoi: datele
   de restaurare sunt in foaia "Restaurare". Acceptam si .json (backup-uri
   mai vechi) sau text lipit. */

function applyBackup(raw) {
  const d = JSON.parse(raw);
  if (!d || typeof d !== 'object' || !Array.isArray(d.vacations)) throw new Error('format');
  state = normalize(d);
  save(); renderAll(); renderBackupHint();
  return state.vacations.length;
}

function restoreDone(n) {
  $('bkText').value = ''; $('bkPaste').hidden = true;
  closeSheets();
  toast(`Restaurat: ${n} ${n === 1 ? 'concediu' : 'concedii'}`);
}

$('btnRestore').onclick = () => {
  const box = $('bkPaste');
  box.hidden = !box.hidden;
};
$('rsFile').onclick = () => $('fileImport').click();

$('fileImport').addEventListener('change', async e => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  const isXlsx = /\.xlsx$/i.test(f.name);
  try {
    if (isXlsx) {
      const json = await XlsxLite.extractJson(await f.arrayBuffer());
      if (!json) throw new Error('no-data');
      restoreDone(applyBackup(json));
    } else {
      restoreDone(applyBackup(await f.text()));
    }
  } catch (err) {
    toast(isXlsx
      ? 'Excel-ul nu contine date de restaurare — foloseste foaia "Restaurare"'
      : 'Fisier invalid');
  }
});

$('bkTextOk').onclick = () => {
  const raw = $('bkText').value.trim();
  if (!raw) return toast('Lipeste mai intai textul backup');
  try { restoreDone(applyBackup(raw)); }
  catch (err) { toast('Text invalid — copiaza tot, dintr-o bucata'); }
};

$('bkCopy').onclick = async () => {
  const raw = JSON.stringify(state);
  try {
    await navigator.clipboard.writeText(raw);
    toast('Backup copiat — lipeste-l intr-o nota sau pe e-mail');
  } catch (err) {
    $('bkPaste').hidden = false;
    $('bkText').value = raw;
    $('bkText').select();
    toast('Selecteaza si copiaza textul manual');
  }
};
/* Butonul "Sterge toate datele" a fost eliminat intentionat — era o
   operatie ireversibila, la un singur tap de datele utilizatorului.
   Restaurarea dintr-un backup suprascrie oricum tot. */

/* ═══════════════════  10. PWA + REFRESH  ═══════════════════ */

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
setInterval(renderNext, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) renderAll(); });

/* ═══════════════════  11. START  ═══════════════════ */

$('ftYear').textContent = new Date().getFullYear();   // anul din footer, mereu actual
renderAll();
