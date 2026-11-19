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
    const aiTag = item.aiAssisted !== false ? `<span class="ai-tag">AI-assisted</span>` : "";
    const shots = Array.isArray(item.screenshots) ? item.screenshots.filter((shot) => shot && shot.src) : [];
    const shotsHtml = shots.length
      ? `<section class="shots" aria-label="Screenshots">
          <h4 class="shots-label">Screenshots</h4>
          <div class="shots-strip">
            ${shots
              .map(
                (shot, index) => `<button class="shot" type="button" data-shot-index="${index}" aria-label="${escapeHtml(shot.caption || "Screenshot")}">
                  <img src="${escapeHtml(shot.src)}" alt="${escapeHtml(shot.caption || "")}" width="640" height="360" loading="lazy">
                </button>`
              )
              .join("")}
          </div>
        </section>`
      : "";

    return `
      <article class="card${shots.length ? " has-shots" : ""}" data-type="${escapeHtml(item.type)}" data-id="${escapeHtml(item.id)}">
        <div class="card-media">
          ${media}
          <span class="pill pill-type">${escapeHtml(typeLabel)}</span>
          ${status ? `<span class="pill pill-soon"${statusTitle}>${escapeHtml(status)}</span>` : ""}
        </div>
        <div class="card-body">
          <h3 class="card-title">${escapeHtml(item.title)}</h3>
          ${aiTag}
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
        ${shotsHtml}
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

  const lightbox = document.createElement("div");
  lightbox.className = "lightbox";
  lightbox.hidden = true;
  lightbox.innerHTML = `
    <button class="lightbox-backdrop" type="button" data-lightbox-close aria-label="Close screenshot"></button>
    <div class="lightbox-dialog" role="dialog" aria-modal="true" aria-labelledby="lightbox-caption">
      <button class="lightbox-close" type="button" data-lightbox-close aria-label="Close">Close</button>
      <button class="lightbox-nav lightbox-prev" type="button" data-step="-1" aria-label="Previous screenshot"></button>
      <figure class="lightbox-figure">
        <img class="lightbox-img" alt="">
        <figcaption id="lightbox-caption"></figcaption>
      </figure>
      <button class="lightbox-nav lightbox-next" type="button" data-step="1" aria-label="Next screenshot"></button>
    </div>
  `;
  document.body.appendChild(lightbox);

  const lightboxImg = lightbox.querySelector(".lightbox-img");
  const lightboxCaption = lightbox.querySelector("#lightbox-caption");
  let activeShots = [];
  let activeIndex = 0;
  let returnFocus = null;

  const showShot = () => {
    const shot = activeShots[activeIndex];
    if (!shot) return;
    lightboxImg.src = shot.src;
    lightboxImg.alt = shot.caption || "";
    const total = activeShots.length;
    lightboxCaption.textContent = total > 1 ? `${shot.caption || ""}  ·  ${activeIndex + 1} / ${total}` : shot.caption || "";
  };

  const closeLightbox = () => {
    if (lightbox.hidden) return;
    lightbox.hidden = true;
    lightboxImg.removeAttribute("src");
    document.body.classList.remove("lightbox-open");
    activeShots = [];
    const focusTarget = returnFocus;
    returnFocus = null;
    focusTarget?.focus();
  };

  const openLightbox = (gameId, index) => {
    const game = games.find((item) => item.id === gameId);
    const shots = game?.screenshots?.filter((shot) => shot && shot.src) || [];
    if (!shots.length) return;
    activeShots = shots;
    activeIndex = (index + shots.length) % shots.length;
    showShot();
    lightbox.hidden = false;
    document.body.classList.add("lightbox-open");
    lightbox.querySelector(".lightbox-close").focus();
  };

  const stepLightbox = (delta) => {
    if (!activeShots.length) return;
    activeIndex = (activeIndex + delta + activeShots.length) % activeShots.length;
    showShot();
  };

  grid?.addEventListener("click", (event) => {
    const button = event.target.closest(".shot");
    if (!button || !grid.contains(button)) return;
    const card = button.closest(".card");
    returnFocus = button;
    openLightbox(card?.dataset.id, Number(button.dataset.shotIndex) || 0);
  });

  lightbox.addEventListener("click", (event) => {
    if (event.target.closest("[data-lightbox-close]")) {
      closeLightbox();
      return;
    }
    const stepButton = event.target.closest("[data-step]");
    if (stepButton) stepLightbox(Number(stepButton.dataset.step) || 0);
  });

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
    if (!lightbox.hidden) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeLightbox();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        stepLightbox(1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        stepLightbox(-1);
      }
      return;
    }
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
