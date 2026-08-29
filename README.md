# Kurs — Währungsrechner (PWA)

Währungsrechner mit Verlaufs-Charts für iPhone. Kurse: EZB-Referenzkurse über
[Frankfurter](https://frankfurter.dev) — kein API-Key, kein Konto.

## Deployment (GitHub Pages)

1. Dateien ins Repo-Root hochladen (Add file → Upload files → Commit).
2. Settings → Pages → Source: `Deploy from a branch`, Branch: `main` / `root`.
3. Live unter `https://yaakov25.github.io/CurrencyConverter/`.
4. Auf dem iPhone in **Safari** öffnen → Teilen → **Zum Home-Bildschirm**.

## Tab «Rechner»

- Oben Basiswährung + Betrag, darunter die Liste, alle Werte live.
- Betrag antippen → iOS-Zifferntastatur. Komma und Punkt werden beide akzeptiert.
- **↺** neben dem Betrag setzt auf 1 zurück.
- Währungskürzel antippen → Auswahlliste mit Suche; in einer Listenzeile gibt es
  dort auch «Aus Liste entfernen».
- Zeile **lange drücken und ziehen** → Reihenfolge ändern.
- Zeile auf die **obere Karte** ziehen → wird zur neuen Basis. Der Betrag wird
  umgerechnet mitgenommen (250 CHF → 266,81 EUR bleibt derselbe Geldbetrag).
- **Nach unten ziehen** → Kurse neu laden. Der Punkt oben rechts pulsiert,
  solange geladen wird.

## Tab «Verlauf»

- Zeigt immer das Paar **Basis → erste Zeile der Liste**. Andere Kombination:
  im Rechner die Liste umsortieren.
- Zeitraum: 1W / 1M / 3M / 1J / 5J / 10J / Alle (zurück bis 04.01.1999).
- Linie grün bei Anstieg, rot bei Rückgang; Prozentangabe bezieht sich auf den
  gewählten Zeitraum.
- Finger auf den Chart legen und ziehen → Fadenkreuz mit Datum und Kurs.
- Tief / Hoch stehen unter dem Chart.
- **Kein Intraday**: die EZB publiziert genau einen Kurs pro Werktag, gegen
  16:00 CET. Wochenenden und Feiertage fehlen in den Daten.

## Zahlenformat

- Tausender mit Apostroph, Dezimalen mit Komma, bis zu 4 Nachkommastellen:
  `1'067,2359`. Nachlaufende Nullen fallen weg (`1'000`, nicht `1'000,0000`).
- **JPY, KRW, ISK** ohne Nachkommastellen — diese Währungen haben keine
  Untereinheit.
- Kurszeilen bekommen mehr Stellen, je kleiner der Kurs ist
  (`1 IDR → 0,00005065 CHF`), sonst wäre die Zeile leer.
- Prozentwerte immer 2 Stellen.

## Offline

Die Tageskurse werden einmal als EUR-Tabelle geholt und in `localStorage`
gespeichert; jedes Paar wird daraus lokal gerechnet. Verlaufsdaten werden pro
Paar komplett (1999 bis heute, ca. 230 KB) geholt und zwischengespeichert; alle
Zeiträume sind Ausschnitte davon, also ohne weitere Requests. Es werden maximal
6 Paare vorgehalten, ältere fliegen raus.

Ohne Netz rechnet die App mit den letzten Kursen weiter; das Datum oben rechts
zeigt den Stand, der Punkt wird rot ab 4 Tagen.

## Änderungen

Datei auf github.com bearbeiten, committen — und **`CACHE` in `sw.js` hochzählen**
(`kurs-v3` → `kurs-v4`), sonst behält das iPhone die alte Version. Danach App
schliessen und zweimal öffnen: der Service Worker liefert beim ersten Start noch
die alte Fassung aus.

## Dateien

| Datei | Zweck |
|---|---|
| `index.html` | Markup + komplettes CSS, beide Tabs |
| `app.js` | Kurse, Umrechnung, Liste, Drag & Drop, Chart, Auswahl |
| `sw.js` | Service Worker, Offline-Cache |
| `manifest.webmanifest` | Name, Icon, Vollbild-Modus |
| `icon-*.png`, `apple-touch-icon.png` | Icons |

---

## Optional: Live-Kurse statt EZB-Tageskurse

Standardmässig läuft die App mit EZB-Referenzkursen (einmal pro Werktag). Wer
marktnahe Kurse braucht, kann Twelve Data dazuschalten. Der API-Key darf **nicht**
ins öffentliche Repo — dafür gibt es den Worker in `worker/worker.js`.

1. **twelvedata.com** → kostenloser Basic-Plan → API-Key kopieren.
2. **dash.cloudflare.com** → Compute (Workers) → Create → Hello World →
   Inhalt von `worker/worker.js` einfügen → Deploy.
3. Worker → Settings → Variables and Secrets → Add → **Secret**,
   Name `TD_KEY`, Wert = der Twelve-Data-Key.
4. In `worker.js` die Liste `ALLOW` prüfen (dort steht die GitHub-Pages-Domain).
5. In `app.js` ganz oben `LIVE_URL` auf die `*.workers.dev`-Adresse setzen,
   `CACHE` in `sw.js` hochzählen, committen.

Bleibt `LIVE_URL` leer, ändert sich nichts — die App läuft wie zuvor.

**Wann aktualisiert wird:** ausschliesslich beim Öffnen der App (nach mehr als
90 Sekunden im Hintergrund) und beim Ziehen nach unten. Kein Polling, kein
Timer. Zusätzlich beim Wechsel der Basiswährung oder der Liste, weil die
Live-Tabelle nur Basis + Zielwährungen abdeckt.

**Budget:** 1 Credit pro Zielwährung und Abruf. Bei 4 Währungen und 20 Starts
am Tag sind das 80 von 800 Credits. `LIVE_BUDGET` in `app.js` deckelt es bei
700/Tag, damit eine Fehlerschleife das Kontingent nicht leerräumt.

**Rückfallebene:** Antwortet der Worker nicht oder ist das Budget aufgebraucht,
holt die App automatisch die EZB-Kurse. Die Kopfzeile zeigt dann `EZB · Datum`
statt `Live · vor X Min`. Der Verlaufs-Tab nutzt immer Frankfurter, da
historische Daten bei den Live-Anbietern kostenpflichtig sind.
