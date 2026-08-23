# 4x4 Sudoku

A clean, focused 4x4 Sudoku puzzle game with difficulty selection, answer verification, and a bilingual UI (English / 繁體中文).

**Live demo:** https://rexx.github.io/mini-sudoku/

## Features

- 4x4 grid Sudoku with multiple difficulty levels and a custom blank count
- Answer verification, optional instant validation
- Synthesised sound effects, light and dark themes
- Bilingual interface (English / Traditional Chinese)
- **Fully offline.** Installable as a PWA; puzzles are generated on device and no gameplay feature needs the network.

## Offline behaviour

No gameplay depends on the network: puzzles come from `src/utils/sudoku4x4.ts` and sound is synthesised with the Web Audio API, so there is nothing to degrade when the connection drops. The page does make one request, the Google Analytics tag described under [Analytics](#analytics), and it is deliberately kept off the critical path.

Three things keep an offline cold start working, and all three have to stay in step:

- **No blocking external dependency.** Fonts resolve from the OS font stack defined in `src/index.css`; there are no webfonts and no external stylesheets. The analytics tag is the only external script and it is `async`, so it never holds up first paint. An HTTP cache alone would not be enough for the rest, because `max-age` has no "fall back to cache when the network fails" semantics.
- **The app shell is precached.** `vite-plugin-pwa` emits a service worker that precaches `index.html`, the JS and CSS chunks, `manifest.json`, and every icon. Runtime caching uses `StaleWhileRevalidate`, which serves the cache immediately rather than waiting out a network timeout, and is scoped to same-origin URLs so cross-origin requests never enter the cache.
- **`base`, `start_url`, `scope`, and `id` all point at `/mini-sudoku/`.** These live in [vite.config.ts](vite.config.ts) and [public/manifest.json](public/manifest.json). A mismatch still installs and still shows the right icon, but the offline launch requests a URL the service worker never cached.

Renaming the repository means updating all four values plus the absolute icon paths in [index.html](index.html).

### Verifying offline support

Service workers need a secure context, so a LAN IP over plain HTTP cannot be used to test this. Use `localhost`, a tunnel with a real certificate, or the deployed site.

1. Open the live site, then install it (Add to Home Screen on iOS).
2. Launch from the home screen while online, so the service worker completes its install.
3. Fully close the app, enable airplane mode, and launch it again from the home screen. It should open the app, not a browser error page.
4. Play a full puzzle offline.

On iOS, an installation made before these changes may keep stale start-URL and service-worker state. If an old install fails to launch offline while a fresh one succeeds, delete it and re-add it from Safari.

## Analytics

[index.html](index.html) loads the Google Analytics 4 tag (`gtag.js`) for property `G-MZDCQ8P6ZE`. It is the only third-party request the app makes.

It cannot break an offline session. The script is `async`, so it never blocks parsing or first paint, and it is cross-origin, so the service worker's same-origin runtime cache ignores it. With no network the request just fails, `gtag()` calls accumulate in `window.dataLayer`, and nothing else notices.

## Tech Stack

React 19, TypeScript, Vite 6, Tailwind CSS 4, Motion, Lucide icons, vite-plugin-pwa.

## Run Locally

**Prerequisites:** Node.js 24+

```bash
npm install
npm run dev
```

The dev server serves the app at http://localhost:3000/mini-sudoku/ — the path comes from the Vite `base`.

## Build

```bash
npm run build     # type-check, then bundle into dist/ and generate the service worker
npm run preview   # serve the production build, service worker included
npm run lint      # type-check only
```

The service worker is only emitted by a production build, so offline behaviour has to be checked through `npm run preview`, not `npm run dev`.

## Icons

Every raster icon in `public/` is generated from `public/icon.svg`:

```bash
npm run icons:generate
```

Edit the SVG, re-run the script, and commit the output. The script also reports how much of `apple-touch-icon.png` is transparent, which is the proxy for whether iOS will apply its Liquid Glass treatment to the mark.

## Deployment

Pushing to `main` triggers [.github/workflows/deploy.yml](.github/workflows/deploy.yml), which type-checks, builds, and publishes `dist/` to GitHub Pages.
