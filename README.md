# Kurs — Währungsrechner (PWA)

Ein Ein-Bildschirm-Währungsrechner für iPhone. Kurse: EZB-Referenzkurse über
[Frankfurter](https://frankfurter.dev) — kein API-Key, kein Konto.

## Deployment (GitHub Pages)

1. Neues **öffentliches** Repo anlegen, z. B. `kurs`.
2. Alle Dateien dieses Ordners ins Repo-Root hochladen
   (Add file → Upload files → alles reinziehen → Commit).
3. Settings → Pages → Source: `Deploy from a branch`, Branch: `main` / `root` → Save.
4. Nach ~1 Minute live unter `https://<username>.github.io/kurs/`.
5. Auf dem iPhone in **Safari** öffnen → Teilen → **Zum Home-Bildschirm**.

Wichtig: Safari, nicht Chrome — nur Safari installiert PWAs unter iOS.

## Bedienung

- Oben die Basiswährung + Betrag; darunter die Liste, alle Werte live.
- Betrag antippen → iOS-Zifferntastatur. Komma und Punkt werden beide akzeptiert.
- Währungskürzel antippen (oben oder in einer Zeile) → Auswahlliste mit Suche.
  In einer Listenzeile gibt es dort auch «Aus Liste entfernen».
- «＋ Währung hinzufügen» am Ende der Liste.
- Zeile **lange drücken und ziehen** → Reihenfolge ändern.
- Zeile auf die **obere Karte** ziehen → wird zur neuen Basis, Betrag springt auf 1.
- Punkt oben rechts: grün = aktuelle Kurse, rot = Kurse älter als 4 Tage
  (die EZB publiziert nur werktags gegen 16:00 CET).

## Zahlenformat

Tausender mit Apostroph, Dezimalen mit Komma, vier Nachkommastellen:
`1'000,0000`. Der eingetippte Betrag oben bleibt so stehen, wie er getippt
wurde (`1'000`), damit sich das Feld beim Bearbeiten nicht wehrt.

## Offline

Beim Start werden alle Kurse einmal geholt (EUR-basierte Tabelle) und in
`localStorage` gespeichert; jedes Währungspaar wird daraus lokal gerechnet.
Ohne Netz rechnet die App mit den letzten Kursen weiter, das Datum oben
rechts zeigt den Stand.

## Änderungen

Datei auf github.com bearbeiten, committen — und **`CACHE` in `sw.js` hochzählen**
(`kurs-v1` → `kurs-v2`), sonst behält das iPhone die alte Version.

## Dateien

| Datei | Zweck |
|---|---|
| `index.html` | Markup + komplettes CSS |
| `app.js` | Kurse, Umrechnung, Liste, Drag & Drop, Währungsauswahl |
| `sw.js` | Service Worker, Offline-Cache |
| `manifest.webmanifest` | Name, Icon, Vollbild-Modus |
| `icon-*.png`, `apple-touch-icon.png` | Icons |
