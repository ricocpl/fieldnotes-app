# Fieldnotes English Companion V1.0.2 — iPhone Web App Edition

## What this is
A working static web app with iPhone-responsive bottom navigation, Safari Home Screen integration, icons and an offline cache for the application shell. No Python, Node, server runtime, build tooling, login, or subscription is required for app visitors. Browser HTML/CSS/JavaScript only.

## How to use it on iPhone (recommended)
1. **Host all the files in this folder together** on a static HTTPS website. Do not upload only index.html; its CSS, JavaScript, icons and service worker are separate files. For example, use GitHub Pages or another approved HTTPS static hosting provider.
2. Open the published **HTTPS URL in Safari** on iPhone (e.g. `https://your-site.example/index.html`). Opening a ZIP or HTML file from iPhone Files is not the installed web-app experience.
3. Tap **Share** → **Add to Home Screen**, enable **Open as Web App** where shown, then tap **Add**.
4. Open **Fieldnotes** from your Home Screen.
5. **Company-Safe is the default:** locally stored vocabulary and manual entry remain available. In **Settings** you can enable Personal Online mode for non-confidential text; requests use public providers and require internet.

## Hosting example: GitHub Pages (public repository; public files)
1. Create a GitHub repository (a PUBLIC repository if using free Pages under typical personal-account settings).
2. Upload ALL extracted app files to its repository root in the browser. The root must contain `index.html`.
3. In repository **Settings → Pages**, select **Deploy from a branch**, choose **main** and **/(root)**, save.
4. After GitHub Pages publishes, use the displayed `https://...github.io/.../` URL. No Python or development environment is needed for visitors.
5. Do NOT commit private records or secrets to a public repo. Vocabulary is saved on your iPhone locally, not in the repository.

## Offline & data
- After a successful online visit and service-worker installation, the cached app shell can reopen offline. **Live translation and LanguageTool grammar checking are NOT available offline.**
- Previously saved vocabulary, manual editing, revision, and exports can work offline using IndexedDB.
- Browser storage may still be removed by iOS storage management, data clearing or device changes. Export **Settings & Backup → Full JSON Backup** regularly.
- **Data does not sync between iPhone and PC.** Export a JSON backup on one device and import it on the other.
- V1.0/V1.0.1 backups remain compatible (schemaVersion 1). No auto-migration from a `file://` opened app to an HTTPS site is possible; export/import to transfer data.
- Do not open in Private Browsing if you want reliable retention.
- Only copy public/non-confidential vocabulary to third-party online providers. The app defaults to Company-Safe Mode.

## Online providers and privacy
- MyMemory public endpoint: translations (en → zh-Hant); Free Dictionary API: English definitions for single words; LanguageTool public endpoint: en-GB grammar suggestions.
- APIs may have rate limits, CORS/network restrictions and privacy considerations; no live results are faked. External Google Translate and Copilot actions remain manual.
- Public API access is not guaranteed and must be tested in the actual Safari environment.
- No login, backend, server-side storage, or API keys. The static site host serves only static files; the app communicates with public API providers only after user interaction and if Personal Online mode allows it.

## Compatibility and scope
- Designed for recent iPhone Safari, plus Android and desktop browsers.
- iOS/iPadOS Home Screen behaviour depends on system version. No App Store package is created.
- Safari on a real iPhone and real public API access are not available in this container; tests on an emulated mobile viewport are not real-device tests.
- `appVersion:1.0.2`, `schemaVersion:1`, IndexedDB database name remains `fieldnotes-english-companion` for backward compatibility on the SAME origin.
