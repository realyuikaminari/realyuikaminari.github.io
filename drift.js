/**
 * Night-run drift. Original canvas art, no external libraries.
 * Keys are handled only while the canvas (or its touch controls) is focused.
 */
(() => {
  const root = document.getElementById("drift-game");
  if (!root) return;

  const canvas = root.querySelector(".drift-canvas");
  const startBtn = root.querySelector(".drift-start");
  const pauseEl = root.querySelector(".drift-pause");
  const hud = root.querySelector(".drift-hud");
  const scoreEl = root.querySelector('[data-drift="score"]');
  const comboEl = root.querySelector('[data-drift="combo"]');
  const bestEl = root.querySelector('[data-drift="best"]');
  const touchButtons = [...root.querySelectorAll("[data-touch]")];

  if (!canvas || typeof canvas.getContext !== "function") return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const BEST_KEY = "yui-drift-best";
  const ROAD_HALF = 128;

  const keys = { up: false, down: false, left: false, right: false, drift: false };
  const touch = { left: false, right: false, gas: false, drift: false };

  const car = {
    x: 0,
    z: 0,
    heading: 0,
    vx: 0,
    vz: 0,
  };

  let score = 0;
  let combo = 1;
  let best = 0;
  let drifting = false;
  let offroad = false;
  let started = false;
  let manualPause = false;
  let autoPause = false;
  let raf = 0;
  let lastTime = 0;
  let viewW = 640;
  let viewH = 360;
  let scale = 1.35;

  const skids = [];
  const smoke = [];
  let lastSkidL = null;
  let lastSkidR = null;

  try {
    best = Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    best = 0;
  }
  if (bestEl) bestEl.textContent = formatScore(best);

  function roadX(z) {
    return (
      Math.sin(z * 0.0031) * 420 +
      Math.sin(z * 0.0074 + 1.1) * 110 +
      Math.sin(z * 0.0017 + 0.4) * 160
    );
  }

  function roadDx(z) {
    return (
      Math.cos(z * 0.0031) * 420 * 0.0031 +
      Math.cos(z * 0.0074 + 1.1) * 110 * 0.0074 +
      Math.cos(z * 0.0017 + 0.4) * 160 * 0.0017
    );
  }

  function roadHeading(z) {
    return Math.atan2(roadDx(z), 1);
  }

  function roadFrame(z) {
    const slope = roadDx(z);
    const len = Math.hypot(slope, 1) || 1;
    return {
      cx: roadX(z),
      nx: 1 / len,
      nz: -slope / len,
    };
  }

  function formatScore(value) {
    return String(Math.floor(value));
  }

  function resetCar() {
    car.z = 0;
    car.x = roadX(0);
    car.heading = roadHeading(0);
    car.vx = 0;
    car.vz = 0;
    score = 0;
    combo = 1;
    drifting = false;
    offroad = false;
    skids.length = 0;
    smoke.length = 0;
    lastSkidL = null;
    lastSkidR = null;
    paintHud();
  }

  function paintHud() {
    if (scoreEl) scoreEl.textContent = formatScore(score);
    if (comboEl) comboEl.textContent = `x${combo.toFixed(1)}`;
    if (bestEl) bestEl.textContent = formatScore(best);
  }

  function rememberBest() {
    if (score <= best) return;
    best = score;
    try {
      localStorage.setItem(BEST_KEY, String(Math.floor(best)));
    } catch {
      /* private mode */
    }
  }

  function focused() {
    const active = document.activeElement;
    return active === canvas || root.contains(active);
  }

  function driving() {
    return started && !manualPause && !autoPause && !document.hidden;
  }

  function input() {
    const left = (keys.left || touch.left) && !(keys.right || touch.right);
    const right = (keys.right || touch.right) && !(keys.left || touch.left);
    return {
      throttle: keys.up || touch.gas,
      brake: keys.down,
      steer: (right ? 1 : 0) - (left ? 1 : 0),
      handbrake: keys.drift || touch.drift,
    };
  }

  function step(dt) {
    const ctl = input();
    const hx = Math.sin(car.heading);
    const hz = Math.cos(car.heading);
    const rx = Math.cos(car.heading);
    const rz = -Math.sin(car.heading);

    let forward = car.vx * hx + car.vz * hz;
    let lateral = car.vx * rx + car.vz * rz;
    const speed = Math.hypot(car.vx, car.vz);

    const frame = roadFrame(car.z);
    const offset = (car.x - frame.cx) * frame.nx;
    offroad = Math.abs(offset) > ROAD_HALF;

    const hardSteer = Math.abs(ctl.steer) > 0.65 && speed > 150;
    const wantDrift = (ctl.handbrake || hardSteer) && speed > 70;
    const gripRate = wantDrift ? 1.35 : hardSteer ? 3.1 : 8.5;

    if (ctl.throttle) forward += (offroad ? 90 : 260) * dt;
    if (ctl.brake) forward -= 380 * dt;
    if (ctl.handbrake) forward -= 140 * dt;
    forward -= forward * (offroad ? 1.8 : 0.38) * dt;
    const maxSpeed = offroad ? 150 : 430;
    forward = Math.max(-70, Math.min(maxSpeed, forward));

    lateral *= Math.exp(-gripRate * dt);

    const steerRate = (wantDrift ? 2.35 : 1.65) * Math.min(1, Math.max(speed, 0) / 90);
    car.heading += ctl.steer * steerRate * dt;

    car.vx = hx * forward + rx * lateral;
    car.vz = hz * forward + rz * lateral;
    if (offroad) {
      car.vx *= Math.exp(-2.4 * dt);
      car.vz *= Math.exp(-2.4 * dt);
    }

    car.x += car.vx * dt;
    car.z += car.vz * dt;

    const slip = Math.abs(lateral);
    const sliding = slip > 46 && speed > 95 && !offroad;
    drifting = sliding;
    if (offroad || speed < 40) {
      combo = 1;
    } else if (sliding) {
      combo = Math.min(8, combo + dt * 0.85);
      score += slip * speed * 0.00012 * combo * dt * 60;
      rememberBest();
    } else if (slip < 22) {
      combo = Math.max(1, combo - dt * 1.4);
    }

    const rear = 16;
    const track = 8;
    const lx = car.x - hx * rear + rx * track;
    const lz = car.z - hz * rear + rz * track;
    const rwx = car.x - hx * rear - rx * track;
    const rwz = car.z - hz * rear - rz * track;
    if (sliding) {
      pushSkid(lastSkidL, lx, lz, 0.55);
      pushSkid(lastSkidR, rwx, rwz, 0.55);
      if (smoke.length < 80 && Math.random() < dt * 28) {
        smoke.push({
          x: (lx + rwx) / 2,
          z: (lz + rwz) / 2,
          vx: -hx * 12 + (Math.random() - 0.5) * 20,
          vz: -hz * 12 + (Math.random() - 0.5) * 20,
          life: 0.7 + Math.random() * 0.4,
          max: 1,
          r: 4 + Math.random() * 5,
        });
      }
    }
    lastSkidL = { x: lx, z: lz };
    lastSkidR = { x: rwx, z: rwz };

    for (let i = smoke.length - 1; i >= 0; i -= 1) {
      const p = smoke[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.z += p.vz * dt;
      p.r += dt * 8;
      if (p.life <= 0) smoke.splice(i, 1);
    }
    if (skids.length > 320) skids.splice(0, skids.length - 320);

    paintHud();
  }

  function pushSkid(prev, x, z, alpha) {
    if (!prev) return;
    const dist = Math.hypot(x - prev.x, z - prev.z);
    if (dist < 3 || dist > 40) return;
    skids.push({ x1: prev.x, z1: prev.z, x2: x, z2: z, a: alpha });
  }

  function resize() {
    const play = canvas.parentElement;
    const rect = play.getBoundingClientRect();
    viewW = Math.max(320, rect.width);
    viewH = Math.max(180, rect.height);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(viewW * dpr);
    canvas.height = Math.round(viewH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    scale = Math.max(1.15, Math.min(viewW, viewH) / 430);
  }

  function worldToScreen(wx, wz) {
    const dx = wx - car.x;
    const dz = wz - car.z;
    const s = Math.sin(car.heading);
    const c = Math.cos(car.heading);
    const forward = dx * s + dz * c;
    const right = dx * c - dz * s;
    return [viewW * 0.5 + right * scale, viewH * 0.72 - forward * scale];
  }

  function draw() {
    ctx.clearRect(0, 0, viewW, viewH);
    const sky = ctx.createLinearGradient(0, 0, 0, viewH);
    sky.addColorStop(0, "#10182a");
    sky.addColorStop(0.45, "#0b0e16");
    sky.addColorStop(1, "#07090c");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, viewW, viewH);

    ctx.fillStyle = "#0c1210";
    ctx.fillRect(0, viewH * 0.18, viewW, viewH);

    drawScenery();
    drawRoad();
    drawSkids();
    drawSmoke();
    drawHeadlights();
    drawCar();

    if (offroad) {
      ctx.fillStyle = "rgba(40, 18, 12, 0.18)";
      ctx.fillRect(0, 0, viewW, viewH);
    }
  }

  function drawScenery() {
    const start = Math.floor((car.z - 260) / 56) * 56;
    const end = car.z + 980;
    for (let z = start; z < end; z += 56) {
      const frame = roadFrame(z);
      const n = hash(z);
      const side = n > 0.5 ? 1 : -1;
      const dist = ROAD_HALF + 36 + hash(z + 3) * 90;
      const wx = frame.cx + frame.nx * dist * side;
      const wz = z + frame.nz * dist * side;
      const [sx, sy] = worldToScreen(wx, wz);
      if (sx < -40 || sx > viewW + 40 || sy < -40 || sy > viewH + 40) continue;
      if (n > 0.42) {
        ctx.fillStyle = "#1a1e24";
        ctx.beginPath();
        ctx.ellipse(sx, sy + 6, 9 + n * 6, 5, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = "#102018";
        ctx.beginPath();
        ctx.moveTo(sx, sy - 16);
        ctx.lineTo(sx - 8, sy + 8);
        ctx.lineTo(sx + 8, sy + 8);
        ctx.fill();
        ctx.fillStyle = "#24180f";
        ctx.fillRect(sx - 1.5, sy + 6, 3, 7);
      }
    }
  }

  function drawRoad() {
    const step = 18;
    const start = car.z - 220;
    const end = car.z + 860;
    const left = [];
    const right = [];
    for (let z = start; z <= end; z += step) {
      const frame = roadFrame(z);
      left.push(worldToScreen(frame.cx - frame.nx * ROAD_HALF, z - frame.nz * ROAD_HALF));
      right.push(worldToScreen(frame.cx + frame.nx * ROAD_HALF, z + frame.nz * ROAD_HALF));
    }

    ctx.beginPath();
    if (!left.length) return;
    ctx.moveTo(left[0][0], left[0][1]);
    for (let i = 1; i < left.length; i += 1) ctx.lineTo(left[i][0], left[i][1]);
    for (let i = right.length - 1; i >= 0; i -= 1) ctx.lineTo(right[i][0], right[i][1]);
    ctx.closePath();
    ctx.fillStyle = "#141820";
    ctx.fill();

    ctx.lineWidth = 5;
    ctx.strokeStyle = "rgba(77, 124, 255, 0.85)";
    ctx.beginPath();
    left.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
    ctx.beginPath();
    right.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();

    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(232, 237, 245, 0.8)";
    ctx.setLineDash([10, 14]);
    ctx.beginPath();
    for (let i = 0; i < left.length; i += 2) {
      const mx = (left[i][0] + right[i][0]) / 2;
      const my = (left[i][1] + right[i][1]) / 2;
      if (i === 0) ctx.moveTo(mx, my);
      else ctx.lineTo(mx, my);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = "#2a3344";
    ctx.lineWidth = 3;
    for (let z = Math.floor(start / 40) * 40; z < end; z += 40) {
      const frame = roadFrame(z);
      for (const side of [-1, 1]) {
        const inner = ROAD_HALF + 10;
        const outer = ROAD_HALF + 18;
        const a = worldToScreen(frame.cx + frame.nx * inner * side, z + frame.nz * inner * side);
        const b = worldToScreen(frame.cx + frame.nx * outer * side, z + frame.nz * outer * side);
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        ctx.stroke();
      }
    }
  }

  function drawSkids() {
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    skids.forEach((mark) => {
      const a = worldToScreen(mark.x1, mark.z1);
      const b = worldToScreen(mark.x2, mark.z2);
      ctx.strokeStyle = `rgba(186, 196, 214, ${mark.a})`;
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
      mark.a *= 0.997;
    });
  }

  function drawSmoke() {
    smoke.forEach((p) => {
      const [sx, sy] = worldToScreen(p.x, p.z);
      ctx.fillStyle = `rgba(180, 188, 200, ${Math.max(0, p.life) * 0.35})`;
      ctx.beginPath();
      ctx.arc(sx, sy, p.r, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function drawHeadlights() {
    const hx = Math.sin(car.heading);
    const hz = Math.cos(car.heading);
    const [sx, sy] = worldToScreen(car.x + hx * 18, car.z + hz * 18);
    const grad = ctx.createRadialGradient(sx, sy, 4, sx, sy, 90 * scale);
    grad.addColorStop(0, "rgba(210, 226, 255, 0.45)");
    grad.addColorStop(1, "rgba(31, 79, 216, 0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(sx, sy, 90 * scale, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawCar() {
    const [sx, sy] = worldToScreen(car.x, car.z);
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(0);
    ctx.fillStyle = "#0c0e12";
    ctx.fillRect(-16, -10, 7, 14);
    ctx.fillRect(9, -10, 7, 14);
    ctx.fillRect(-16, 12, 7, 14);
    ctx.fillRect(9, 12, 7, 14);
    ctx.fillStyle = "#1f4fd8";
    roundRect(-13, -22, 26, 46, 7);
    ctx.fill();
    ctx.fillStyle = "#12141a";
    roundRect(-9, -8, 18, 16, 4);
    ctx.fill();
    ctx.fillStyle = "#d7e4ff";
    ctx.fillRect(-9, -20, 5, 4);
    ctx.fillRect(4, -20, 5, 4);
    if (drifting) {
      ctx.fillStyle = "rgba(77, 124, 255, 0.8)";
      ctx.fillRect(-1, 22, 2, 12);
    }
    ctx.restore();
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function hash(n) {
    const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  }

  function frame(now) {
    if (!driving()) {
      raf = 0;
      return;
    }
    const dt = Math.min(0.05, (now - lastTime) / 1000 || 0.016);
    lastTime = now;
    step(dt);
    draw();
    raf = requestAnimationFrame(frame);
  }

  function loop() {
    if (raf || !driving()) return;
    lastTime = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function showPause(on) {
    if (!pauseEl) return;
    pauseEl.hidden = !on;
  }

  function start() {
    if (!started) {
      started = true;
      resetCar();
      root.classList.add("is-running");
      canvas.hidden = false;
      if (hud) hud.hidden = false;
      if (startBtn) startBtn.hidden = true;
      resize();
    }
    manualPause = false;
    showPause(false);
    canvas.focus({ preventScroll: true });
    loop();
    draw();
  }

  function togglePause() {
    if (!started) return;
    manualPause = !manualPause;
    showPause(manualPause);
    if (manualPause) {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      draw();
    } else {
      loop();
    }
  }

  startBtn?.addEventListener("click", start);
  pauseEl?.addEventListener("click", () => {
    if (manualPause) start();
  });

  canvas.addEventListener("pointerdown", () => {
    if (started) canvas.focus({ preventScroll: true });
  });

  window.addEventListener(
    "keydown",
    (event) => {
      if (!started || !focused()) return;
      const scrollKey = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(event.key);
      if (scrollKey || event.code === "Space") event.preventDefault();
      if (event.key === "Escape") {
        event.preventDefault();
        togglePause();
        return;
      }
      if (!driving() && manualPause) return;
      setKey(event.code, true);
    },
    true
  );

  window.addEventListener("keyup", (event) => {
    setKey(event.code, false);
  });

  function setKey(code, down) {
    if (code === "ArrowUp" || code === "KeyW") keys.up = down;
    else if (code === "ArrowDown" || code === "KeyS") keys.down = down;
    else if (code === "ArrowLeft" || code === "KeyA") keys.left = down;
    else if (code === "ArrowRight" || code === "KeyD") keys.right = down;
    else if (code === "Space" || code === "ShiftLeft" || code === "ShiftRight") keys.drift = down;
  }

  touchButtons.forEach((button) => {
    const name = button.dataset.touch;
    const press = (event) => {
      event.preventDefault();
      button.setPointerCapture?.(event.pointerId);
      if (started && manualPause) start();
      if (!started) start();
      button.classList.add("is-held");
      if (name === "left") touch.left = true;
      if (name === "right") touch.right = true;
      if (name === "gas") touch.gas = true;
      if (name === "drift") touch.drift = true;
    };
    const release = () => {
      button.classList.remove("is-held");
      if (name === "left") touch.left = false;
      if (name === "right") touch.right = false;
      if (name === "gas") touch.gas = false;
      if (name === "drift") touch.drift = false;
    };
    button.addEventListener("pointerdown", press);
    button.addEventListener("pointerup", release);
    button.addEventListener("pointercancel", release);
  });

  document.addEventListener("visibilitychange", () => {
    autoPause = document.hidden;
    if (document.hidden) {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    } else {
      loop();
    }
  });

  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      ([entry]) => {
        autoPause = !entry.isIntersecting;
        if (autoPause) {
          if (raf) cancelAnimationFrame(raf);
          raf = 0;
        } else {
          loop();
        }
      },
      { threshold: 0.2 }
    );
    io.observe(root);
  }

  const play = canvas.parentElement;
  if (window.ResizeObserver && play) {
    const ro = new ResizeObserver(() => resize());
    ro.observe(play);
  } else {
    window.addEventListener("resize", resize);
  }
  resize();

  window.addEventListener("blur", () => {
    keys.up = keys.down = keys.left = keys.right = keys.drift = false;
  });
})();
