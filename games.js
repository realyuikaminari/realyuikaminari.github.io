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
 * size        Optional download size, e.g. "about 65 MB"
 * description One or two short sentences
 * thumbnail   Path to the card image (relative to index.html)
 * download    URL to the file, itch.io page, or GitHub Release
 *             Use null while the build is not ready
 * downloadLabel Optional button text. Default is "Download"
 * note        Optional short note under the description
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
    platform: "Windows 11 (PC)",
    version: "1.12.0",
    size: "about 65 MB",
    description:
      "An 1890s outlaw romp. Grab the loot, outrun the law, and don’t leave the pack behind.",
    thumbnail: "assets/thumb-fomx-gang.webp",
    download:
      "https://github.com/realyuikaminari/realyuikaminari.github.io/releases/download/fomx-gang/FomxGangRidesAgain-1.12.0-portable.exe",
    downloadLabel: "Download for Windows",
    note:
      "Portable .exe — no install needed. Windows SmartScreen may show “Windows protected your PC” because it’s from an indie developer. Click More info, then Run anyway.",
    comingSoon: false,
  },
];

// Older browsers / no-module setup: also hang it on window.
window.GAMES = GAMES;
