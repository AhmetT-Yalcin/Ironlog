# Ironlog

A workout-tracking PWA. This repo now builds and deploys itself automatically —
you never need to manually compile or upload anything.

## How it works
- `src/App.jsx` and `src/index.jsx` — the real, readable source code. This is what you edit.
- `public/` — the static PWA shell (icons, manifest, service worker, index.html). Also hand-edited, rarely.
- `.github/workflows/deploy.yml` — a GitHub Actions workflow. Every time you push to `main`,
  GitHub spins up a fresh machine, runs `npm install` and `npm run build`, and publishes the
  result to GitHub Pages. `public/app.js` is generated fresh by that build — it's not something
  you write or commit by hand.

## One-time setup on GitHub
1. Push this whole folder to your repo (replacing what's there now).
2. Go to **Settings → Pages**. Under "Build and deployment", change **Source** to
   **GitHub Actions** (instead of "Deploy from a branch").
3. Push once (or re-run the workflow from the **Actions** tab) to trigger the first deploy.
4. Your site is live at the same URL as before.

## Making a change from now on
1. Edit `src/App.jsx`.
2. `git add -A && git commit -m "describe your change" && git push`
3. That's it. Check the **Actions** tab on GitHub to watch it build (~30 seconds), then it's live.

No local build step, no manual file uploads, no zip files. If you'd rather not touch git directly,
just describe the change you want to Claude — it can edit `App.jsx` for you to commit and push.

## Testing locally first (optional)
```
npm install
npm run build
```
This writes `public/app.js` so you can open `public/index.html` in a browser before pushing.
