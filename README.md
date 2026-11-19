# Yui Kaminari's Garage

A static download hub for indie games and apps, themed around the original character Yui Kaminari. Plain HTML, CSS, and vanilla JavaScript — no build step, ready for [GitHub Pages](https://pages.github.com/).

## Preview locally

From this folder:

```bash
python3 -m http.server 8080
```

Then open http://localhost:8080

## Add a game or app

1. Drop a thumbnail into `assets/`. A 16:9 WebP or JPEG under about 400 KB looks best.
2. Open `games.js` and append an object to the `GAMES` array:

```js
{
  id: "my-new-game",          // unique, stable slug
  title: "My New Game",
  type: "game",               // "game" or "app"
  platform: "Windows / macOS",
  version: "1.0.0",
  description: "A short pitch, one or two sentences.",
  thumbnail: "assets/thumb-my-new-game.webp",
  download: "https://your-name.itch.io/my-new-game", // or a Release URL
  comingSoon: false,
}
```

Set `comingSoon: true` and `download: null` to show a disabled **Coming soon** button instead of a download link. The grid on the homepage is rendered from this array, so you do not need to edit the card markup in `index.html`.

GitHub Pages caches static files for about 10 minutes (`Cache-Control: max-age=600`). `index.html` loads `games.js?v=12`, `main.js?v=12`, `styles.css?v=12`, and `drift.js?v=12`. `404.html` loads `styles.css?v=12`. Bump that `v` number whenever `games.js` or the styles change so browsers fetch the new file instead of the cached one.

## Host the download files

GitHub Pages is for the *website* (HTML, CSS, JS, images). It has a **100 MB file-size limit** per file and is a poor place for game installers or large zips.

Host the actual builds on:

- [itch.io](https://itch.io/) — good default for indie games, with a download page you can link from `download`
- [GitHub Releases](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository) — attach installers to a tagged release, then paste the asset or release URL into `download`

Keep `download` pointed at that external URL. Do not commit large binaries into this repo.

## Publish on GitHub Pages

1. Create a GitHub repository and push this folder to it (the `index.html` should be at the repo root, or in the `/docs` folder if you prefer that option).
2. In the repo: **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
4. Choose the `main` (or `master`) branch and the `/ (root)` folder — or `/docs` if you put the site there — then save.
5. After a minute or two, the site is live at `https://<your-username>.github.io/<repo-name>/`.

If the repo is named `<your-username>.github.io`, the site is served from the root: `https://<your-username>.github.io/`.

All asset paths in this project are relative, so it works both as a user site and as a project site.

A custom domain is optional: add a `CNAME` file with your domain, then point the DNS as GitHub describes in the Pages settings.

## Art notes

The hero, About portraits, and Garage car are original illustrations of Yui and her coupe (no manufacturer names or logos). Swap them by replacing the WebP files in `assets/`:

- `yui-hero.webp` — full-body hero (transparent background)
- `yui-bust-smile.webp` / `yui-bust-wink.webp` — About portraits
- `car-touge.webp` — Garage mountain-pass painting

Keep new images as WebP or JPEG under about 400 KB. The official husky patch (`husky-patch.png`, `emblem-husky.png`) still appears in the header, dossier, and favicon.
