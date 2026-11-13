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
    id: "mecha-savior",
    title: "Mecha Savior",
    type: "game",
    platform: "TBA",
    version: "TBA",
    description:
      "A horror visual novel with mechs. Level up your pilots RPG-style and survive turn-based mech battles. Coming soon.",
    thumbnail: "assets/thumb-mecha-savior.webp",
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
];

// Older browsers / no-module setup: also hang it on window.
window.GAMES = GAMES;
