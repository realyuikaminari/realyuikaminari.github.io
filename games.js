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
 * version     e.g. "1.0.2" or "TBA". Shown as "Ver. 1.0.2"
 * versionText Optional label that replaces the "Ver." line, e.g. "Demo v0.3.1"
 * size        Optional download size, e.g. "about 65 MB"
 * description One or two short sentences
 * thumbnail   Path to the card image (relative to index.html)
 * download    URL to the full build, itch.io page, or GitHub Release
 *             Use null while the full build is not ready
 * downloadLabel Optional full-build button text. Default is "Download"
 * demo        Optional playable demo: { url, label }. label defaults to "Demo"
 * note        Optional short note under the description
 * badge       Optional status pill. Defaults to "Demo available" when a demo
 *             exists and the full game is still coming soon, otherwise
 *             "Coming soon" when there is no full download
 * comingSoon  true keeps the full release marked coming soon. A demo still
 *             shows its own button
 * aiAssisted  Shows an "AI-assisted" tag. Defaults to true when omitted;
 *             set false for a project made without AI tools
 * screenshots Optional promo stills: [{ src, caption }, ...]. Shown as a
 *             strip under the card; captions are the image alt text and
 *             the lightbox label
 *
 * Host large binaries on itch.io or GitHub Releases. GitHub Pages has a
 * 100 MB file limit and is meant for the site itself, not big installers.
 */
const GAMES = [
  {
    id: "mecha-savior",
    title: "Mecha Savior",
    type: "game",
    platform: "Windows 11 (PC)",
    version: "0.3.1",
    versionText: "Demo v0.3.1",
    size: "about 81 MB",
    description:
      "A horror visual novel with mechs. Level up your pilots RPG-style and survive turn-based mech battles. Full game coming soon.",
    thumbnail: "assets/thumb-mecha-savior.webp",
    download: null,
    demo: {
      label: "Windows Demo",
      url: "https://github.com/realyuikaminari/realyuikaminari.github.io/releases/download/Mecha-Savior-DEMO/Mecha-Savior-Demo.exe",
    },
    note:
      "Portable .exe — no install needed. Windows SmartScreen may show “Windows protected your PC” because it’s from an indie developer. Click More info, then Run anyway.",
    badge: "Demo available",
    comingSoon: true,
    aiAssisted: true,
    screenshots: [
      { src: "assets/screens/mecha_1_title.webp", caption: "Title screen" },
      {
        src: "assets/screens/mecha_2_president.webp",
        caption: "President 88's arriving in Hangar 7",
      },
      {
        src: "assets/screens/mecha_3_hover.webp",
        caption: "Three mechs hovering over the city",
      },
      {
        src: "assets/screens/mecha_4_skymother.webp",
        caption: "Skymother boss battle",
      },
    ],
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
    aiAssisted: true,
    screenshots: [
      { src: "assets/screens/fomx_1_title.webp", caption: "Title screen" },
      { src: "assets/screens/fomx_2_select.webp", caption: "Choose Your Outlaw" },
      {
        src: "assets/screens/fomx_3_canyon.webp",
        caption: "88's in Red Mesa Canyon",
      },
      {
        src: "assets/screens/fomx_4_boss.webp",
        caption: "Federale boss, Mexico bonus",
      },
    ],
  },
];

// Older browsers / no-module setup: also hang it on window.
window.GAMES = GAMES;
