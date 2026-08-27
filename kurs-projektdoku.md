# Kurs — Currency Converter PWA

**Project record — August 2026, revision 2 (v3)**
Live: `https://yaakov25.github.io/CurrencyConverter/`
Repo: `github.com/yaakov25/CurrencyConverter` (public)

---

## 1. What this is

A personal currency converter that lives on the iPhone Home Screen: own icon,
full-screen, no browser chrome, no expiry date, no Apple fee. Technically it is
a Progressive Web App — an HTML/JS page that iOS treats as an app once it has
been added to the Home Screen.

Two tabs. **Rechner**: one base currency at the top with an editable amount, a
reorderable list of target currencies below, all values updating live.
**Verlauf**: the historical chart for the current pair, back to 1999.

---

## 2. Why a PWA and not a native app

The original question was a native iOS app. That route needs a Mac:

| | Native iOS | PWA |
|---|---|---|
| Mac + Xcode | required | not needed |
| Apple Developer Program | $99/yr, or app expires every 7 days | not needed |
| Install | cable + Xcode rebuild | Safari → Add to Home Screen |
| Updates | rebuild, re-deploy to device | edit a file on github.com |
| Home Screen icon, full screen, offline | yes | yes |
| Widgets, Siri, Face ID | yes | no |

With no Mac available, and none of the native-only features mattering for a
converter, the PWA was the obvious path. Serving from the existing Nginx
container on the Raspberry Pi was considered and rejected: iOS only registers
service workers over a valid HTTPS certificate, and GitHub Pages provides that
for free with no VPN dependency when travelling.

---

## 3. Architecture

Six files, no build step, no framework, no dependencies.

| File | Role |
|---|---|
| `index.html` | Markup plus the complete stylesheet |
| `app.js` | Rates, conversion, list, drag & drop, currency picker |
| `sw.js` | Service worker — offline cache of the app shell |
| `manifest.webmanifest` | App name, icon, standalone display mode |
| `icon-192/512/maskable.png`, `apple-touch-icon.png` | Icons |
| `README.md` | Short operating notes kept next to the code |

**Rates.** Frankfurter (`api.frankfurter.dev`), which republishes the European
Central Bank reference rates. No API key, no account, no rate limit, CORS
enabled. Published on working days around 16:00 CET.

**One request covers everything.** The app fetches the full EUR-based rate
table once (`/v1/latest`), stores it in `localStorage`, and computes every pair
locally as a cross-rate: `rate(A→B) = table[B] / table[A]`. Consequences: any
currency pair works without another request, and the app keeps converting with
no connection at all. Currency names come from `/v1/currencies`, cached the
same way.

**Freshness.** Refetches at most once an hour, on launch, and whenever the app
returns to the foreground. The dot in the header is green for current rates,
red once they are more than four days old — which normally means a long
weekend, not a fault.

**Offline.** The service worker caches the app shell (cache-first, refreshed in
the background) and the Google font files on first use. API calls deliberately
bypass the worker: `app.js` handles the network failure itself and falls back
to the stored table, so the date in the header always tells the truth about how
old the numbers are.

---

## 4. Design decisions worth remembering

**Number format.** Thousands separated by an apostrophe, decimals by a comma,
up to four decimal places. Implemented as `de-CH` formatting with the decimal
point swapped for a comma — the Swiss locale already groups with the apostrophe.
Three refinements followed from real use:

- Trailing zeros are dropped, so a round thousand reads `1'000` rather than
  `1'000,0000`. The four decimals now appear only when they carry information.
- JPY, KRW and ISK get zero decimals. They have no minor unit, so decimals there
  were pure noise.
- Rate sub-lines gain decimals as the rate shrinks — `1 IDR → 0,00005065 CHF`
  instead of a rounded `0,0001` that says nothing.

The amount you type in the base card stays as typed; forcing decimals into a
field under active editing makes it fight the cursor.

**Manual refresh.** Pull down on the list past ~56px and release. The ECB
publishes once a day, so most manual refreshes return identical numbers — the
pulsing dot is the only confirmation, deliberately, since a toast claiming
"aktualisiert" every time would be noise. Rates always refetch; the chart series
only when the history tab is open.

**Flags without image files.** Emoji flags are rectangular. Each one sits in a
36px round container, scaled up ~1.55× and clipped, which produces the circular
flags of the reference design with zero external assets — so they still render
offline.

**iOS keyboard instead of a custom keypad.** The first version had a built-in
keypad; the second uses `inputmode="decimal"` to summon the native numeric
keyboard. Both comma and dot are accepted as the decimal separator, since iOS
chooses which key to show based on its own locale.

**Drag & drop, built by hand.** HTML5 drag events do not fire on touch at all,
so reordering is implemented on pointer events: 320 ms long-press to lift
(cancelled if the finger moves more than 9px first, which is a scroll), then
the row follows the finger while the others translate out of the way, with page
scrolling suppressed via a non-passive `touchmove` listener. Adjust the 320 in
`app.js` if it feels sticky or too eager.

**Promotion target is the base card, not list position 0.** Dragging a row onto
the top card makes it the new base. Reordering within the list never changes the
base — otherwise every reorder near the top would hijack it.

**Promotion carries the value.** 250 CHF promoted to EUR becomes 266,81 EUR:
the same money, seen from the other side. A ↺ button next to the amount resets
to 1 when what you actually wanted was the bare rate. (The first version reset
to 1 automatically; carrying the value turned out to be the more common need.)

---

## 4b. The history tab

**Pair selection follows the calculator** — base plus the first row of the list.
No separate pickers to keep in sync; reordering the list is how you change what
the chart shows.

**Ranges:** 1W / 1M / 3M / 1J / 5J / 10J / Alle, the last reaching back to
4 January 1999.

**One request per pair, not per range.** The full series is fetched once
(`/v1/1999-01-04..?base=X&symbols=Y`), roughly 230 KB and ~7'000 daily points,
and every range is a local slice of it. Cached per pair in `localStorage`, six
pairs kept, oldest evicted. Before drawing, the slice is downsampled to 320
points — the crosshair reads from that same downsampled array, so every value it
shows is a real published rate rather than an interpolation.

**No intraday, and this is a data limit, not an omission.** The ECB fixes one
rate per currency per working day around 16:00 CET. Intraday would require a
different provider, all of which want an API key — which would then sit in a
public repo. Weekends and holidays are simply absent, so a 1W chart has about
five points and looks angular.

**Colour carries direction:** green when the range ends above where it started,
red below, with a matching gradient under the line. The headline rate comes from
the live daily table rather than the last point of the series, so it always
agrees with the calculator tab.

**Percentages are fixed at two decimals.** Four would imply a precision the
underlying data doesn't have.

---

## 5. Deployment, and how to change something

Initial setup was: create a public repo (Pages needs public on a free plan),
upload the files to the repo root, then Settings → Pages → Deploy from a branch
→ `main` / `root`. Live about a minute later. Then open the URL **in Safari**
(only Safari installs PWAs on iOS) → Share → Add to Home Screen.

To change anything afterwards:

1. Edit the file on github.com and commit.
2. **Bump `CACHE` in `sw.js`** (`kurs-v2` → `kurs-v3`). Skipping this is the
   single most common reason an update appears not to have worked.
3. Wait for the green tick in the repo's Actions tab.
4. On the phone: open the app, close it fully, open it again. The installed
   service worker always serves the cached copy first and downloads the new one
   in the background, so the *second* launch after an update is the one that
   shows the change.

If it still looks old: load the URL with `?v=2` appended in Safari. If that
shows the new version, the service worker is the cause, not the deployment. The
last resort is Settings → Safari → Advanced → Website Data → delete the
`github.io` entry, then reinstall from Safari; only the cached rates and the
currency list are lost, and both rebuild immediately.

Also worth checking once: `index.html` must sit at the repo root, not inside a
folder. Dragging the containing folder instead of the files puts everything one
level down and the site silently serves nothing.

---

## 6. Operating notes

- Tap the amount → numeric keyboard. Tap any currency code → picker with search;
  in a list row that picker also offers "Aus Liste entfernen".
- "＋ Währung hinzufügen" at the bottom of the list.
- Long-press and drag a row to reorder; drag it onto the top card to make it the
  base.
- Base currency, list order, and last amount all persist between launches.
- The repo is public. It contains nothing sensitive — no keys, no personal data;
  everything the app stores lives in the browser on the phone.

---

## 7. Possible next steps

All four items from the first revision are now built. What remains open:

- The chart pair is tied to the first list row. If comparing two arbitrary
  currencies becomes a habit, the history tab would need its own pickers.
- Series cache holds six pairs. Changing base often will evict and refetch;
  a smarter policy could keep the base's whole set.
- Landscape orientation is unhandled — the manifest locks to portrait.
- The `1W` range is nearly pointless with five working-day points. Could be
  dropped, or replaced by `2W`.
