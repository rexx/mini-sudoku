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

Confirmed on an iPhone: an install made at `72004ca` launched from the home screen in airplane mode after being fully closed, three commits later, with no reinstall. So the service worker keeps serving the shell across subsequent deploys.

A caveat about a convention you may see elsewhere: iOS is said to keep stale start-URL and service-worker state in an installation made *before* offline support existed, such that it fails offline while a fresh install succeeds. That cannot be checked in this repository — the manifest, the service worker and `apple-touch-icon.png` all arrived in the same commit, so no install predating offline support can exist here. If a home-screen install ever does misbehave offline, deleting and re-adding it from Safari is the cheap thing to try.

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

Edit the SVG, re-run the script, and commit the output — the Pages workflow does not generate icons.

The script checks two things and reports a third:

| Check | Range | If it warns |
| --- | --- | --- |
| Mean saturation | at least 0.5 | The mark probably depends on a dark background existing. Saturate the colours. |
| Maskable safe circle | ink within r=40% | A circular launcher mask would clip the mark. Lower `scale` on the maskable output — the warning prints the value that fits. |

The maskable check measures the generated result rather than trusting `scale`, because reshaping `icon.svg` moves the outermost ink and nothing else would catch a `scale` that no longer buys back enough.

It also fingerprints the mark — ink coverage, component count, cavity perimeter — and warns when those drift from the shape that was checked on a device. The warning claims no threshold, only that the result has gone back to being unknown.

### Why there is no rule for the iOS home screen

A web clip cannot declare icon layers the way a native app can, so iOS infers them from the alpha channel: it either composites the mark, generating a backdrop and edge lighting, or decides the image is finished and drops it on white. **A white tile means it was not composited.** The tile colour reads the result directly; no pixel measurement is needed to tell which happened.

What decides it is not known. Ten marks were checked on one iPhone, five composited and five did not, and every property that could be measured overlaps across the two groups:

| | ink | components | cavities | cavity area | perimeter | |
| --- | --- | --- | --- | --- | --- | --- |
| pocket line art (another project) | 12.2% | 9 | 1 | 13.0% | 2.63 | composited |
| same, recoloured to this palette | 12.2% | 9 | 1 | 13.0% | 2.63 | composited |
| same, with a frame added | 25.8% | 10 | 2 | 49.4% | 7.87 | composited |
| same, reduced to one component | 8.2% | 1 | 1 | 16.0% | 1.50 | composited |
| **the current mark** | **24.1%** | **16** | **0** | **0.0%** | **0.00** | **composited** |
| near-white 4x4 grid | 16.1% | 1 | 17 | 14.2% | 5.72 | flat on white |
| the same grid, enlarged | 26.5% | 1 | 17 | 27.9% | 8.30 | flat on white |
| grid with the frame removed | 14.9% | 1 | 4 | 7.7% | 2.13 | flat on white |
| solid block | 39.3% | 1 | 0 | 0.0% | 0.00 | flat on white |
| the same block in cyan | 39.3% | 1 | 0 | 0.0% | 0.00 | flat on white |

Two marks measuring 0.00 perimeter sit on opposite sides. So do two at 0 cavities and two at 1 component. Four rules were built on these numbers over one day — a transparency floor, an edge-margin band, a cavity-area limit, a cavity-perimeter limit — and a device falsified each one. Colour is ruled out (the pocket art composites in this palette; this mark stayed flat in cyan), and so is the page: both marks behave the same whether the page declares `sizes`, declares `apple-mobile-web-app-capable`, or neither.

**So the geometry in `icon.svg` is a verified sample, not an instance of a rule.** `public/apple-touch-icon.png` is byte-identical to the file that produced a composited tile. Change the shape and that evidence no longer applies — which is what the fingerprint warning is for: re-check by adding the page to a home screen, then update the `VERIFIED_` constants in the generator.

Serving variants from separate URLs is the cheap way to do that — each becomes its own web clip, so several can sit on one home screen at once and none of them collides with the icon cache that otherwise forces a delete-and-re-add between rounds.

For the state of the wider investigation, read `docs/app-icon-ios-liquid-glass.md` in the Cozy-Pocket project. Read it rather than expecting this section to be current: it has already carried claims that document later retracted.

## Deployment

Pushing to `main` triggers [.github/workflows/deploy.yml](.github/workflows/deploy.yml), which type-checks, builds, and publishes `dist/` to GitHub Pages.
