<div align="center">

# Ture & Concediu

**Shift & leave tracker for 12/24 four-team rotations**
Offline-first PWA · no build step · no dependencies · no backend

[English](#english) · [Română](#română)

</div>

---

## English

A mobile-first progressive web app that tracks a **12/24 shift rotation with four teams** and calculates annual leave against it. Built for factory workers who need to know two things at a glance: *when is my next shift*, and *how many leave days do I have left*.

The core problem it solves: in a rotating shift system, a two-week holiday does **not** cost fourteen leave days. Only the days you would actually have worked are deducted. Counting that by hand every time is error-prone, so the app does it.

### Why it exists

Rotation schedules are usually distributed as paper tables or spreadsheets that go stale. This app derives the entire schedule mathematically from four reference dates, so it is correct for any year — past or future — without maintenance.

### The rotation algorithm

Each team follows a **4-day cycle** anchored to a reference date on which that team worked a day shift:

| Offset | Status | Hours |
|:------:|--------|-------|
| `0` | Day shift | 06:00 – 18:00 |
| `1` | Night shift | 18:00 – 06:00 (next morning) |
| `2` | Off | *(you leave the night shift at 06:00)* |
| `3` | Off | |
| `4` | Day shift again | cycle repeats |

The four teams are offset by one day each, which produces complete coverage: **on any given day exactly one team is on days, exactly one is on nights, and two are off.**

```
        Mon 06   Tue 07   Wed 08   Thu 09   Fri 10
Day      T4       T3       T2       T1       T4
Night    T1       T4       T3       T2       T1
```

Two implementation details worth noting:

```js
// Normalise to UTC midnight — immune to daylight-saving transitions.
// A naive date subtraction breaks twice a year; this does not.
function dayNum(d) {
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
}

// Positive modulo, so the cycle propagates backwards as well as forwards.
// Plain `%` returns negatives for past dates and would shift the schedule.
function cycleIndex(d, ref) {
  return (((dayNum(d) - dayNum(ref)) % 4) + 4) % 4;
}
```

### Leave calculation

Only worked days are deducted. Scheduled days off inside a leave period are ignored:

```js
function countVacation(start, end) {
  const out = { total: 0, consumate: 0, libere: 0, zi: 0, noapte: 0 };
  const cur = new Date(start), lim = new Date(end);
  while (cur <= lim) {
    out.total++;
    const s = myShift(cur);                 // 'zi' | 'noapte' | 'liber'
    if (s === 'liber') out.libere++;
    else { out.consumate++; out[s]++; }
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}
```

A 14-day holiday in this rotation typically costs **7 leave days**, not 14. The app previews this before you commit the entry.

### Features

**Calendar** — one month at a time, each cell showing both shifts running that day (day / night) with the team letter. Your own team is outlined in white; the cell background reflects your status. Navigation by arrows (day, month, year), horizontal swipe, or tap the title to jump back to today.

**Next shift card** — the practical headline. Full date, start time, and a live countdown. It **skips days you are on leave**, so it always shows a shift you will actually work. If you are mid-shift, it tells you when you clock out instead.

**Leave management** — start and end date, with a live preview of calendar days versus days actually consumed. Overlapping periods are rejected. Dashboard shows total, used, and remaining for the year in view.

**Romanian public holidays** — the 12 fixed dates from the Labour Code plus 5 movable ones derived from **Orthodox Easter** (Meeus algorithm, Julian calendar + 13 days). Works for any year, no hardcoded list. Fully editable: add, rename, disable, or reset to automatic. Purely informational — holidays do not affect the schedule or leave arithmetic.

**Excel backup** — a real `.xlsx` file (5 sheets: summary, leave records, full-year calendar, holidays, restore data) written by a **from-scratch OOXML writer**, no external library. The same file can be loaded back to restore everything, so there is only one backup format to keep track of.

**PWA** — installable to the home screen, runs standalone, works fully offline after first load.

### Tech stack

Vanilla JavaScript, CSS custom properties, `localStorage`, Service Worker. **No framework, no bundler, no `npm install`.**

This is a deliberate choice, not laziness. The app is small enough that a build pipeline would add ~150 KB of runtime and a compilation step while solving no actual problem. The result is a handful of static files that deploy anywhere, load instantly on a phone, and stay readable without tooling.

The one place the "no dependencies" rule cost real effort is `xlsx.js`: writing a valid `.xlsx` means writing a ZIP archive (STORE method plus a CRC32 implementation) containing hand-built OOXML. It also reads its own output back — including files that Excel has re-saved, which switches everything to DEFLATE and relocates strings into `sharedStrings.xml`. Both paths are tested against a real Excel installation.

### Project structure

```
tracking days/
├── index.html      220 lines   markup
├── styles.css      457 lines   dark theme, fluid responsive
├── app.js          941 lines   rotation, leave, holidays, calendar, backup
├── xlsx.js         360 lines   XLSX writer + reader (no dependencies)
├── sw.js            55 lines   service worker, cache-first
├── manifest.json               PWA metadata
├── make_icons.py               regenerates icons (pure Python, optional)
└── icons/                      192, 512, maskable 512
```

### Running it

The service worker requires `http://localhost` or HTTPS — it will not register over `file://`. Everything else works fine from a double-click.

```bash
cd "tracking days"
python -m http.server 8080
# open http://localhost:8080
```

Or use the **Live Server** / **Live Preview** extension in VS Code.

### Installing on a phone

| Platform | Steps |
|----------|-------|
| **Android / Chrome** | ⋮ menu → *Install app* |
| **iPhone / Safari** | Share → *Add to Home Screen* (Safari only — Chrome on iOS cannot install PWAs) |

**On iOS, install before entering data.** The installed app gets a storage container separate from Safari, so anything configured in the browser tab will not appear in the app. The installed container is also exempt from Safari's 7-day eviction of unused site data — which is precisely why installing matters here.

### First-run setup

Open settings (gear icon, top right):

1. **My shift** — pick T1–T4. Applies immediately.
2. **Shift reference dates** — for each team, one date on which it worked a day shift.
3. **Leave days** — annual entitlement and any days carried over.

### Data and storage

Everything lives in `localStorage` under a single key (`ture-concediu.v2`), as one JSON object. Single-key storage makes writes atomic, export trivial, and versioned migration possible. Roughly ten years of records is about 4 KB — well under any browser limit.

`localStorage` is scoped to **origin** (scheme + host + port; the path is ignored). Consequences worth understanding:

- Data entered at `file://` does not appear at `localhost`, and neither transfers to a hosted domain.
- The only way to move data between devices is **Save backup → Restore**.
- Deleting the installed app deletes its data.
- Bumping `CACHE_VERSION` in `sw.js` refreshes the code cache and does **not** touch your data.

On mobile, saving uses the **Web Share API** where available, which opens the native share sheet (Files, iCloud, Drive, email). This matters on iOS, where plain downloads are unreliable inside an installed PWA. Text-based backup via clipboard is also available, for when file pickers are inconvenient.

### Development notes

- Bump `CACHE_VERSION` in `sw.js` after **any** file change, or devices will keep serving the cached version.
- Colours are CSS custom properties in `:root` — retheming touches one block.
- Sizing uses `clamp()` with `vw` units throughout, so layout scales continuously from 320 px upward rather than snapping at breakpoints.
- `normalize()` in `app.js` sanitises state on every load: a corrupted or hand-edited backup cannot put the app into a broken state.

### Known limitations

- Fixed 12-hour shifts at 06:00 and 18:00. Other patterns need code changes.
- One leave type only. No sick leave, unpaid leave, or separate categories.
- Single user per installation.
- Holiday rules are Romanian. The mechanism is general, the defaults are not.
- No sync between devices. Backup and restore is the transfer mechanism, by design.

### Licence

© 2026 Daniel Mazureac. All rights reserved.

---

## Română

Aplicație web progresivă, gândită pentru telefon, care urmărește un **sistem de ture 12/24 cu patru echipe** și calculează concediul de odihnă în raport cu el. Făcută pentru muncitori în ture care au nevoie de două informații rapide: *când e următoarea tură* și *câte zile de concediu au rămas*.

Problema pe care o rezolvă: într-un sistem cu ture, un concediu de două săptămâni **nu** costă paisprezece zile. Se scad doar zilele în care ai fi lucrat efectiv. Socoteala manuală duce la greșeli, deci o face aplicația.

### De ce există

Programele de ture circulă de obicei ca tabele pe hârtie sau fișiere care se învechesc. Aplicația derivă tot programul matematic din patru date de referință, deci e corect pentru orice an — trecut sau viitor — fără întreținere.

### Algoritmul turelor

Fiecare tură urmează un **ciclu de 4 zile**, ancorat într-o dată de referință în care acea tură a lucrat de zi:

| Offset | Status | Ore |
|:------:|--------|-----|
| `0` | Tura de zi | 06:00 – 18:00 |
| `1` | Tura de noapte | 18:00 – 06:00 (dimineața următoare) |
| `2` | Liber | *(ieși din tura de noapte la 06:00)* |
| `3` | Liber | |
| `4` | Iar tura de zi | ciclul se reia |

Cele patru ture sunt decalate cu o zi fiecare, ceea ce dă acoperire completă: **în fiecare zi exact o tură e pe zi, exact una pe noapte, iar două sunt libere.**

```
        Lun 06   Mar 07   Mie 08   Joi 09   Vin 10
Zi       T4       T3       T2       T1       T4
Noapte   T1       T4       T3       T2       T1
```

Două detalii de implementare care merită menționate:

```js
// Normalizare la miezul nopții UTC — imun la trecerea la ora de vară.
// O scădere naivă de date se rupe de două ori pe an; asta nu.
function dayNum(d) {
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
}

// Modulo pozitiv, ca ciclul să se propage și în trecut, nu doar în viitor.
// `%` simplu întoarce valori negative pentru date trecute și ar decala programul.
function cycleIndex(d, ref) {
  return (((dayNum(d) - dayNum(ref)) % 4) + 4) % 4;
}
```

### Calculul concediului

Se scad doar zilele lucrate. Zilele libere din schemă care cad în perioada de concediu sunt ignorate:

```js
function countVacation(start, end) {
  const out = { total: 0, consumate: 0, libere: 0, zi: 0, noapte: 0 };
  const cur = new Date(start), lim = new Date(end);
  while (cur <= lim) {
    out.total++;
    const s = myShift(cur);                 // 'zi' | 'noapte' | 'liber'
    if (s === 'liber') out.libere++;
    else { out.consumate++; out[s]++; }
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}
```

Un concediu de 14 zile în acest sistem costă de regulă **7 zile**, nu 14. Aplicația arată calculul înainte să confirmi.

### Funcționalități

**Calendar** — o lună pe ecran, fiecare celulă arătând ambele ture din ziua respectivă (zi / noapte) cu litera echipei. Tura ta e conturată cu alb; fundalul celulei reflectă statusul tău. Navigare prin săgeți (zi, lună, an), swipe orizontal, sau tap pe titlu pentru a reveni la luna curentă.

**Card „Următoarea tură"** — informația cea mai practică. Data completă, ora de intrare și numărătoare inversă live. **Sare peste zilele de concediu**, deci arată mereu o tură la care vei merge efectiv. Dacă ești în tură, îți spune la ce oră ieși.

**Gestionare concediu** — dată de start și de final, cu previzualizare live a zilelor calendaristice față de cele consumate efectiv. Perioadele suprapuse sunt respinse. Dashboard-ul arată total, consumate și rămase pentru anul afișat.

**Sărbători legale românești** — cele 12 date fixe din Codul Muncii plus 5 mobile, derivate din **Paștele ortodox** (algoritm Meeus, calendar julian + 13 zile). Funcționează pentru orice an, fără listă hardcodată. Complet editabile: adaugi, redenumești, dezactivezi sau revii la varianta automată. Strict informative — nu afectează programul sau calculul concediului.

**Backup în Excel** — un fișier `.xlsx` real (5 foi: rezumat, evidența concediilor, calendarul anului, sărbători, date de restaurare), scris de un **generator OOXML făcut de la zero**, fără bibliotecă externă. Același fișier poate fi încărcat înapoi pentru restaurare completă, deci există un singur format de backup de ținut minte.

**PWA** — instalabilă pe ecranul principal, rulează pe tot ecranul, funcționează complet offline după prima încărcare.

### Stack tehnologic

JavaScript vanilla, proprietăți CSS personalizate, `localStorage`, Service Worker. **Fără framework, fără bundler, fără `npm install`.**

E o alegere deliberată, nu lene. Aplicația e suficient de mică încât un build pipeline ar adăuga ~150 KB de runtime și un pas de compilare, fără să rezolve nicio problemă reală. Rezultatul: câteva fișiere statice care se pun oriunde, se încarcă instant pe telefon și rămân lizibile fără unelte.

Singurul loc unde regula „zero dependențe" a costat efort real e `xlsx.js`: un `.xlsx` valid înseamnă o arhivă ZIP (metoda STORE plus o implementare CRC32) care conține OOXML construit manual. Citește și înapoi ce a scris — inclusiv fișiere re-salvate din Excel, care trec totul pe DEFLATE și mută textul în `sharedStrings.xml`. Ambele căi sunt testate pe o instalare reală de Excel.

### Structura proiectului

```
tracking days/
├── index.html      220 linii   markup
├── styles.css      457 linii   temă întunecată, responsive fluid
├── app.js          941 linii   ture, concediu, sărbători, calendar, backup
├── xlsx.js         360 linii   scriere + citire XLSX (fără dependențe)
├── sw.js            55 linii   service worker, cache-first
├── manifest.json               metadate PWA
├── make_icons.py               regenerează iconițele (Python pur, opțional)
└── icons/                      192, 512, maskable 512
```

### Rulare locală

Service worker-ul cere `http://localhost` sau HTTPS — nu se înregistrează pe `file://`. Restul funcționează normal și la dublu-click.

```bash
cd "tracking days"
python -m http.server 8080
# deschide http://localhost:8080
```

Sau extensia **Live Server** / **Live Preview** din VS Code.

### Instalare pe telefon

| Platformă | Pași |
|-----------|------|
| **Android / Chrome** | meniu ⋮ → *Install app* |
| **iPhone / Safari** | Share → *Add to Home Screen* (doar Safari — Chrome pe iOS nu poate instala PWA) |

**Pe iOS, instalează înainte de a introduce date.** Aplicația instalată primește un container de stocare separat de Safari, deci ce configurezi în browser nu apare în aplicație. Containerul instalat e și exceptat de la ștergerea automată după 7 zile pe care o aplică Safari datelor nefolosite — exact de aceea instalarea contează aici.

### Configurare la prima pornire

Deschide setările (iconița de sus-dreapta):

1. **Tura mea** — alegi T1–T4. Se aplică imediat.
2. **Zile de referință ture** — pentru fiecare tură, o dată în care a lucrat de zi.
3. **Zile concediu** — numărul anual și eventualele zile reportate.

### Date și stocare

Totul stă în `localStorage`, sub o singură cheie (`ture-concediu.v2`), ca un obiect JSON. Stocarea într-o singură cheie face scrierile atomice, exportul trivial și migrarea versionată posibilă. Aproximativ zece ani de înregistrări ocupă circa 4 KB — mult sub orice limită de browser.

`localStorage` e izolat pe **origin** (schemă + host + port; path-ul e ignorat). Consecințe utile de știut:

- Datele introduse la `file://` nu apar la `localhost`, și niciunele nu se transferă pe un domeniu găzduit.
- Singura cale de a muta datele între dispozitive e **Salvează backup → Restaurează**.
- Ștergerea aplicației instalate șterge și datele ei.
- Creșterea `CACHE_VERSION` în `sw.js` reîmprospătează codul și **nu** atinge datele.

Pe telefon, salvarea folosește **Web Share API** unde e disponibil, deci se deschide meniul nativ de partajare (Files, iCloud, Drive, e-mail). Contează pe iOS, unde descărcările simple sunt nefiabile într-o PWA instalată. Există și backup prin text, în clipboard, pentru situațiile în care selectorul de fișiere e nepractic.

### Note de dezvoltare

- Crește `CACHE_VERSION` în `sw.js` după **orice** modificare de fișier, altfel dispozitivele servesc versiunea din cache.
- Culorile sunt proprietăți CSS în `:root` — o schimbare de temă atinge un singur bloc.
- Dimensionarea folosește `clamp()` cu unități `vw` peste tot, deci layout-ul scalează continuu de la 320 px în sus, fără salturi la breakpoint-uri.
- `normalize()` din `app.js` sanitizează starea la fiecare încărcare: un backup corupt sau editat manual nu poate strica aplicația.

### Limitări cunoscute

- Ture fixe de 12 ore, la 06:00 și 18:00. Alte modele necesită modificări în cod.
- Un singur tip de concediu. Fără medical, fără plată sau categorii separate.
- Un singur utilizator pe instalare.
- Regulile de sărbători sunt românești. Mecanismul e general, valorile implicite nu.
- Fără sincronizare între dispozitive. Backup-ul și restaurarea sunt mecanismul de transfer, prin proiectare.

### Licență

© 2026 Daniel Mazureac. Toate drepturile rezervate.
