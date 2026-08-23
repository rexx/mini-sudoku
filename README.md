# 4x4 Sudoku

A clean, focused 4x4 Sudoku puzzle game with difficulty selection, answer verification, and bilingual UI (English / 繁體中文).

**Live demo:** https://rexx.github.io/mini-sudoku/

## Features

- 4x4 grid Sudoku with multiple difficulty levels
- Answer verification and puzzle generation
- Sound effects and animated transitions
- Bilingual interface (English / Traditional Chinese)

## Tech Stack

React 19, TypeScript, Vite 6, Tailwind CSS 4, Motion, Lucide icons.

## Run Locally

**Prerequisites:** Node.js 20+

```bash
npm install
npm run dev
```

The dev server listens on http://localhost:3000.

## Build

```bash
npm run build     # type-check, then bundle into dist/
npm run preview   # serve the production build locally
```

## Deployment

Pushing to `main` triggers `.github/workflows/deploy.yml`, which builds the app and publishes `dist/` to GitHub Pages.

The Vite `base` in [vite.config.ts](vite.config.ts) is set to `/mini-sudoku/` to match the repository name. Renaming the repository requires updating that value.
