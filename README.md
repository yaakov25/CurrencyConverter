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
