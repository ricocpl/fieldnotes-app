# Fieldnotes English Companion V1.0.2 — Test report

## Implemented changes
- Added iOS Safari Home Screen meta tags and a custom Apple touch icon.
- Updated the web app manifest with 192/512px icons, standalone display, and stable scope.
- Added service worker application-shell precaching for a previously loaded HTTPS site; it excludes public dictionary/grammar requests.
- Added iPhone bottom tabs for Dictionary, Words, Grammar, Meeting and Review, while Settings remains available in the navigation drawer.
- Added touch-friendly 44px control targets, 16px phone form controls, responsive dialogs and safe-area padding for notched iPhones.
- Moved the dictionary search above the privacy notice for easier access on a small screen.
- Kept core vocabulary, grammar, online provider and backup code from V1.0.1 and kept schemaVersion = 1 and database ID unchanged.

## Checks actually executed
- **PASS**: `node --check` successfully parsed `app.js` and `sw.js`.
- **PASS**: Manifest parses as JSON and references the generated app icons.
- **PASS in Chromium with an emulated mobile viewport and simulated localStorage fallback**: loads the main UI, adds a word, shows it in vocabulary, locally looks up its translation, opens/closes navigation, navigates to Settings, triggers a JSON backup download and switches to Dark Mode. No JavaScript page errors observed.
- **PASS in emulated Chromium viewport**: 320, 375, 390, 430 and 768 CSS-pixel viewport widths showed zero document-level horizontal overflow. Mobile navigation tap targets measured 52px high at 390px width.
- **PASS by static inspection**: Company-Safe is the default and external-provider requests are gated behind an explicit switch to Personal Online and an action; no API secrets embedded.

## Not tested / limitations
- **NOT TESTED**: Physical iPhone Safari, real Home Screen install, or iOS safe-area rendering. An emulated Chromium mobile viewport is not an iOS Safari browser.
- **NOT TESTED**: Service worker actual install, update and offline recovery: the automated Chromium environment blocked local navigation, so no PWA network-origin test was possible.
- **NOT TESTED**: Real MyMemory, Free Dictionary API, and LanguageTool connections in Safari. Their rate limits, cross-origin behavior and permitted use can change.
- **NOT TESTED**: Live IndexedDB data persistence on iOS. The interactive test used a simulated browser localStorage fallback, not IndexedDB.
- **NOT TESTED**: JSON file downloads and imports in iOS standalone mode. iPhone Safari can handle downloads differently from Chromium.
- **NOT TESTED**: Safari/Chrome/Firefox cross-browser device compatibility.

## Important operational notes
- Deploy all application files to the same **HTTPS static web origin** and test on the actual iPhone before relying on the app for important data.
- Export a **Full JSON Backup** regularly. iOS can clear browser-origin data in some circumstances; backups are the user's responsibility.
- No cloud synchronisation is implemented. Phone and desktop data are separate, and transferring vocabulary requires a backup and restore.
- Live lookup and grammar checking require an internet connection and may transmit the submitted text to external public API providers in Personal Online mode. Do not submit confidential company data to those services.
