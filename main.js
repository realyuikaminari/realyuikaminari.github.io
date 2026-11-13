(() => {
  const games = window.GAMES || [];
  const grid = document.querySelector("#game-grid");
  const filters = document.querySelectorAll("[data-filter]");
  const nav = document.querySelector(".nav-links");
  const toggle = document.querySelector(".nav-toggle");
  const year = document.querySelector("#year");

  if (year) year.textContent = String(new Date().getFullYear());

  const escapeHtml = (value) =>
    String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");

  const downloadLink = (href, text, primary) =>
    `<a class="btn ${primary ? "btn-primary" : "btn-ghost"}" href="${escapeHtml(href)}" rel="noopener noreferrer">${escapeHtml(text)}</a>`;

  const cardTemplate = (item) => {
    const demo = item.demo && item.demo.url ? item.demo : null;
    const fullRelease = Boolean(item.download) && !item.comingSoon;
    const typeLabel = item.type === "app" ? "App" : "Game";
    const media = item.thumbnail
      ? `<img src="${escapeHtml(item.thumbnail)}" alt="" width="640" height="360">`
      : `<div class="card-fallback" aria-hidden="true"></div>`;
    const buttons = [];
    if (fullRelease) {
      buttons.push(downloadLink(item.download, item.downloadLabel || "Download", true));
    }
    if (demo) {
      buttons.push(downloadLink(demo.url, demo.label || "Demo", !fullRelease));
    }
    if (!buttons.length) {
      buttons.push(`<button class="btn btn-ghost" type="button" disabled>Coming soon</button>`);
    }
    const status =
      item.badge ||
      (item.comingSoon && demo
        ? "Demo available"
        : item.comingSoon || !fullRelease
          ? "Coming soon"
          : "");
    const statusTitle =
      item.comingSoon && demo ? ` title="Full game coming soon"` : "";
    const size = item.size
      ? `<span class="dot" aria-hidden="true"></span><span>${escapeHtml(item.size)}</span>`
      : "";
    const versionText = item.versionText || `Ver. ${item.version}`;
    const note = item.note ? `<p class="card-note">${escapeHtml(item.note)}</p>` : "";

    return `
      <article class="card" data-type="${escapeHtml(item.type)}" data-id="${escapeHtml(item.id)}">
        <div class="card-media">
          ${media}
          <span class="pill pill-type">${escapeHtml(typeLabel)}</span>
          ${status ? `<span class="pill pill-soon"${statusTitle}>${escapeHtml(status)}</span>` : ""}
        </div>
        <div class="card-body">
          <h3 class="card-title">${escapeHtml(item.title)}</h3>
          <p class="card-meta">
            <span>${escapeHtml(item.platform)}</span>
            <span class="dot" aria-hidden="true"></span>
            <span>${escapeHtml(versionText)}</span>
            ${size}
          </p>
          <p class="card-desc">${escapeHtml(item.description)}</p>
          ${note}
          <div class="card-actions">${buttons.join("")}</div>
        </div>
      </article>
    `;
  };

  const render = (filter = "all") => {
    if (!grid) return;
    const visible = games.filter((item) => filter === "all" || item.type === filter);
    if (!visible.length) {
      const message =
        filter === "app"
          ? "More coming soon."
          : "Nothing in this bay yet. Check back after the next night run.";
      grid.innerHTML = `<p class="empty">${message}</p>`;
      return;
    }
    grid.innerHTML = visible.map(cardTemplate).join("");
  };

  filters.forEach((btn) => {
    btn.addEventListener("click", () => {
      filters.forEach((b) => {
        b.classList.toggle("is-active", b === btn);
        b.setAttribute("aria-pressed", b === btn ? "true" : "false");
      });
      render(btn.dataset.filter);
    });
  });

  render("all");

  const setNav = (open) => {
    if (!nav || !toggle) return;
    nav.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    document.body.classList.toggle("nav-open", open);
  };

  toggle?.addEventListener("click", () => {
    setNav(!nav.classList.contains("is-open"));
  });

  nav?.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => setNav(false));
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setNav(false);
  });

  // Elevate the header once you leave the hero.
  const header = document.querySelector(".site-header");
  if (header && "IntersectionObserver" in window) {
    const sentinel = document.querySelector(".hero");
    if (sentinel) {
      const io = new IntersectionObserver(
        ([entry]) => header.classList.toggle("is-stuck", !entry.isIntersecting),
        { threshold: 0.08 }
      );
      io.observe(sentinel);
    }
  } else {
    header?.classList.add("is-stuck");
  }
})();
