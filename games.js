/**
 * Yui Kaminari's Garage — downloads catalog
 *
 * Add a new game or app by appending an object to GAMES, then drop a
 * thumbnail into /assets (webp or jpg, ~16:9, under ~400 KB).
 *
 * Fields
 * ------
 * id          Unique slug (used as a key, keep it stable)
 * title       Card heading
 * type        "game" or "app"
 * platform    e.g. "Windows / Linux", "Web", "Android"
 * version     e.g. "1.0.2" or "TBA"
 * description One or two short sentences
 * thumbnail   Path to the card image (relative to index.html)
 * download    URL to the file, itch.io page, or GitHub Release
 *             Use null while the build is not ready
 * comingSoon  true shows a "Coming soon" badge and disables the button
 *
 * Host large binaries on itch.io or GitHub Releases. GitHub Pages has a
 * 100 MB file limit and is meant for the site itself, not big installers.
 */
const GAMES = [
  {
    id: "night-pass",
    title: "Night Pass",
    type: "game",
    platform: "Windows / Linux",
    version: "TBA",
    description:
      "A midnight downhill run through tight mountain switchbacks. Keep the lights on, trust the tires, and don’t look down.",
    thumbnail: "assets/thumb-night-pass.webp",
    download: null,
    comingSoon: true,
  },
  {
    id: "fomx-gang",
    title: "Fomx Gang Rides Again",
    type: "game",
    platform: "Web / Desktop",
    version: "TBA",
    description:
      "An 1890s outlaw romp. Grab the loot, outrun the law, and don’t leave the pack behind. Coming soon to the Garage.",
    thumbnail: "assets/thumb-fomx-gang.webp",
    download: null,
    comingSoon: true,
  },
  {
    id: "garage-kit",
    title: "Garage Kit",
    type: "app",
    platform: "Android / iOS",
    version: "TBA",
    description:
      "A little companion from the Garage — notes, builds, and late-night doodles, packed into a pocket-sized kit.",
    thumbnail: "assets/thumb-garage-kit.webp",
    download: null,
    comingSoon: true,
  },
];

// Older browsers / no-module setup: also hang it on window.
window.GAMES = GAMES;
