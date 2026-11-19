/**
 * Night-run drift, chase view.
 * Pseudo-3D road, original canvas art, synthesized Web Audio. No libraries.
 * Keys are handled only while the game is focused.
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
  const speedEl = root.querySelector('[data-drift="speed"]');
  const muteBtn = root.querySelector('[data-drift="mute"]');
  const touchButtons = [...root.querySelectorAll("[data-touch]")];
  if (!canvas || typeof canvas.getContext !== "function") return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const BEST_KEY = "yui-drift-best";
  const MUTE_KEY = "yui-drift-mute";
  const SEGMENT_LENGTH = 180;
  const DRAW_DISTANCE = 130;
  const ROAD_WIDTH = 1900;
  const CAMERA_HEIGHT = 820;
  const FOV = (100 * Math.PI) / 180;
  const CAMERA_DEPTH = 1 / Math.tan(FOV / 2);
  const PLAYER_Z = CAMERA_HEIGHT * CAMERA_DEPTH;
  const MAX_SPEED = 4600;

  const COLORS = {
    skyTop: "#070b16",
    skyMid: "#121a2e",
    roadA: "#323a4c",
    roadB: "#384256",
    shoulderA: "#1a222c",
    shoulderB: "#141b26",
    grassA: "#070b09",
    grassB: "#0c120e",
    rumbleA: "#f4f7fb",
    rumbleB: "#2f6dff",
    lane: "rgba(244, 247, 251, 0.88)",
    fog: "#10182a",
  };

  const keys = { up: false, down: false, left: false, right: false, drift: false };
  const touch = { left: false, right: false, gas: false, drift: false };

  const segments = [];
  let lastY = 0;

  function addSegment(curve, y) {
    const n = segments.length;
    segments.push({
      index: n,
      curve,
      sprite: null,
      p1: { world: { x: 0, y: lastY, z: n * SEGMENT_LENGTH }, camera: {}, screen: {} },
      p2: { world: { x: 0, y, z: (n + 1) * SEGMENT_LENGTH }, camera: {}, screen: {} },
    });
    lastY = y;
  }

  function addRun(count, curve, hill) {
    for (let i = 0; i < count; i += 1) {
      const t = count <= 1 ? 1 : i / (count - 1);
      const bend = curve * Math.sin(t * Math.PI);
      addSegment(bend, lastY + hill / count);
    }
  }

  function buildTrack() {
    const pattern = [
      [50, 0, 180],
      [70, 3.2, 40],
      [28, 0, -20],
      [64, -3.6, 90],
      [24, 0, 220],
      [80, 4.4, -30],
      [36, -1.2, -160],
      [58, -4.1, 60],
      [40, 2.4, 140],
      [30, 0, -80],
    ];
    pattern.forEach(([count, curve, hill]) => addRun(count, curve, hill));
    segments.forEach((segment, index) => {
      if (index % 5 === 0) {
        const side = index % 10 === 0 ? -1 : 1;
        const roll = hash(index);
        segment.sprite = {
          side,
          offset: 1.25 + roll * 0.55,
          kind: roll > 0.62 ? "rock" : "tree",
        };
      }
      if (index % 6 === 0) segment.rail = true;
    });
  }

  buildTrack();
  const trackLength = segments.length * SEGMENT_LENGTH;

  let position = 0;
  let playerX = 0;
  let speed = 0;
  let driftAngle = 0;
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
  let comboTier = 1;
  let wasDrifting = false;
  const smoke = [];

  let audioCtx = null;
  let master = null;
  let engineA = null;
  let engineB = null;
  let engineFilter = null;
  let engineGain = null;
  let squealGain = null;
  let rumbleGain = null;
  let shiftMix = 1;
  let muted = false;

  try {
    best = Number(localStorage.getItem(BEST_KEY)) || 0;
    muted = localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    best = 0;
    muted = false;
  }
  paintHud();
  paintMute();

  function hash(n) {
    const x = Math.sin(n * 127.1 + 19.19) * 43758.5453;
    return x - Math.floor(x);
  }

  function formatScore(value) {
    return String(Math.max(0, Math.floor(value)));
  }

  function findSegment(z) {
    const wrapped = ((z % trackLength) + trackLength) % trackLength;
    return segments[Math.floor(wrapped / SEGMENT_LENGTH) % segments.length];
  }

  function paintHud() {
    if (scoreEl) scoreEl.textContent = formatScore(score);
    if (comboEl) comboEl.textContent = `x${combo.toFixed(1)}`;
    if (bestEl) bestEl.textContent = formatScore(best);
    if (speedEl) speedEl.textContent = String(Math.round((speed / MAX_SPEED) * 220));
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

  function paintMute() {
    if (!muteBtn) return;
    muteBtn.classList.toggle("is-muted", muted);
    muteBtn.setAttribute("aria-pressed", muted ? "true" : "false");
    muteBtn.setAttribute("aria-label", muted ? "Unmute sound" : "Mute sound");
  }

  function focused() {
    const active = document.activeElement;
    return active === canvas || root.contains(active);
  }

  function driving() {
    return started && !manualPause && !autoPause && !document.hidden;
  }

  function control() {
    const left = (keys.left || touch.left) && !(keys.right || touch.right);
    const right = (keys.right || touch.right) && !(keys.left || touch.left);
    return {
      throttle: keys.up || touch.gas,
      brake: keys.down,
      steer: (right ? 1 : 0) - (left ? 1 : 0),
      handbrake: keys.drift || touch.drift,
    };
  }

  function ensureAudio() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx || audioCtx) return;
    audioCtx = new Ctx();
    master = audioCtx.createGain();
    master.gain.value = muted ? 0 : 0.16;
    master.connect(audioCtx.destination);

    engineA = audioCtx.createOscillator();
    engineB = audioCtx.createOscillator();
    engineA.type = "sawtooth";
    engineB.type = "triangle";
    engineA.frequency.value = 55;
    engineB.frequency.value = 82;
    engineFilter = audioCtx.createBiquadFilter();
    engineFilter.type = "lowpass";
    engineFilter.frequency.value = 420;
    engineFilter.Q.value = 0.7;
    engineGain = audioCtx.createGain();
    engineGain.gain.value = 0.0001;
    engineA.connect(engineFilter);
    engineB.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(master);
    engineA.start();
    engineB.start();

    const length = audioCtx.sampleRate * 2;
    const buffer = audioCtx.createBuffer(1, length, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i += 1) {
      last = last * 0.96 + (Math.random() * 2 - 1) * 0.04;
      data[i] = last + (Math.random() * 2 - 1) * 0.35;
    }
    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    noise.start();

    const squealFilter = audioCtx.createBiquadFilter();
    squealFilter.type = "bandpass";
    squealFilter.frequency.value = 1600;
    squealFilter.Q.value = 6;
    squealGain = audioCtx.createGain();
    squealGain.gain.value = 0.0001;
    noise.connect(squealFilter);
    squealFilter.connect(squealGain);
    squealGain.connect(master);

    const rumbleFilter = audioCtx.createBiquadFilter();
    rumbleFilter.type = "lowpass";
    rumbleFilter.frequency.value = 140;
    rumbleGain = audioCtx.createGain();
    rumbleGain.gain.value = 0.0001;
    noise.connect(rumbleFilter);
    rumbleFilter.connect(rumbleGain);
    rumbleGain.connect(master);
  }

  function setMaster() {
    if (!master || !audioCtx) return;
    master.gain.setTargetAtTime(muted ? 0.0001 : 0.16, audioCtx.currentTime, 0.03);
  }

  function holdAudio(run) {
    if (!audioCtx) return;
    if (!run || muted) {
      if (audioCtx.state === "running") audioCtx.suspend();
      return;
    }
    if (audioCtx.state === "suspended") audioCtx.resume();
  }

  function blip(freq, dur, gainValue, type) {
    if (!audioCtx || muted || !master) return;
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type || "sine";
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq * 1.4), now + dur);
    gain.gain.setValueAtTime(gainValue, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  function updateAudio(speedPercent) {
    if (!audioCtx || !engineA) return;
    const gearSpan = speedPercent * 4;
    const gear = Math.min(3, Math.floor(gearSpan));
    const within = gearSpan - gear;
    if (gear !== updateAudio.gear) {
      if (gear > (updateAudio.gear ?? 0)) shiftMix = 0.62;
      updateAudio.gear = gear;
    }
    shiftMix += (1 - shiftMix) * 0.08;
    const pitch = (46 + within * 78 + gear * 10) * shiftMix;
    const now = audioCtx.currentTime;
    engineA.frequency.setTargetAtTime(pitch, now, 0.05);
    engineB.frequency.setTargetAtTime(pitch * 1.5, now, 0.05);
    engineFilter.frequency.setTargetAtTime(280 + speedPercent * 1100, now, 0.08);
    engineGain.gain.setTargetAtTime(0.012 + speedPercent * 0.05, now, 0.08);
    squealGain.gain.setTargetAtTime(drifting ? 0.045 + Math.abs(driftAngle) * 0.04 : 0.0001, now, 0.05);
    rumbleGain.gain.setTargetAtTime(offroad ? 0.05 : 0.0001, now, 0.08);
  }

  function step(dt) {
    const ctl = control();
    const base = findSegment(position);
    const speedPercent = Math.max(0, speed / MAX_SPEED);
    const hardSteer = Math.abs(ctl.steer) > 0.62 && speedPercent > 0.32;
    const wantDrift = (ctl.handbrake || hardSteer) && speedPercent > 0.22;

    if (ctl.throttle) speed += (offroad ? 900 : 3200) * dt;
    if (ctl.brake) speed -= 3200 * dt;
    if (ctl.handbrake) speed -= 900 * dt;
    speed -= speed * (offroad ? 1.7 : 0.16) * dt;
    speed = Math.max(0, Math.min(offroad ? MAX_SPEED * 0.38 : MAX_SPEED, speed));

    position = (position + speed * dt) % trackLength;

    const dx = dt * 2 * Math.max(0.25, speedPercent);
    playerX -= dx * speedPercent * base.curve * 0.32;
    playerX += dx * ctl.steer * (wantDrift ? 1.2 : 1.05);

    if (wantDrift) driftAngle += (ctl.steer * 0.85 - driftAngle * 0.35) * dt * 3.2;
    else driftAngle += (0 - driftAngle) * dt * 3.4;
    driftAngle = Math.max(-0.85, Math.min(0.85, driftAngle));
    if (wantDrift) playerX += driftAngle * dt * 0.65;

    offroad = Math.abs(playerX) > 1;
    if (offroad) {
      const sign = playerX < 0 ? -1 : 1;
      playerX = sign * Math.min(Math.abs(playerX), 1.45);
      combo = 1;
      comboTier = 1;
    }

    const sliding = wantDrift && Math.abs(driftAngle) > 0.12 && speedPercent > 0.28 && !offroad;
    drifting = sliding;
    if (sliding) {
      combo = Math.min(8, combo + dt * 0.9);
      score += (Math.abs(driftAngle) * 40 + speedPercent * 18) * combo * dt;
      rememberBest();
      const tier = Math.floor(combo);
      if (tier > comboTier) {
        comboTier = tier;
        blip(520 + tier * 70, 0.18, 0.05, "sine");
      }
    } else if (!offroad) {
      combo = Math.max(1, combo - dt * 0.7);
      if (combo < comboTier) comboTier = Math.max(1, Math.floor(combo));
    }

    if (wasDrifting && !sliding && comboTier >= 2 && !offroad) {
      blip(340, 0.28, 0.04, "triangle");
    }
    wasDrifting = sliding;

    if (smoke.length < 48 && sliding && Math.random() < dt * 36) {
      smoke.push({
        x: (Math.random() < 0.5 ? -1 : 1) * viewW * 0.09 + (Math.random() - 0.5) * 10,
        y: 0,
        vx: (Math.random() - 0.5) * 10 - driftAngle * 16,
        vy: 18 + Math.random() * 20,
        life: 0.55 + Math.random() * 0.35,
        r: 4 + Math.random() * 5,
      });
    }
    for (let i = smoke.length - 1; i >= 0; i -= 1) {
      const puff = smoke[i];
      puff.life -= dt;
      puff.x += puff.vx * dt;
      puff.y += puff.vy * dt;
      puff.r += dt * 14;
      if (puff.life <= 0) smoke.splice(i, 1);
    }

    paintHud();
    updateAudio(speedPercent);
  }

  function project(point, camX, camY, camZ, zFix) {
    point.camera.x = point.world.x - camX;
    point.camera.y = point.world.y - camY;
    point.camera.z = point.world.z + zFix - camZ;
    if (point.camera.z < 8) {
      point.screen.scale = 0;
      return;
    }
    const scale = CAMERA_DEPTH / point.camera.z;
    point.screen.scale = scale;
    point.screen.x = viewW / 2 + scale * point.camera.x * viewW / 2;
    point.screen.y = viewH * 0.4 - scale * point.camera.y * viewH / 2;
    point.screen.w = scale * ROAD_WIDTH * viewW / 2;
  }

  function trap(x1, y1, w1, x2, y2, w2) {
    ctx.beginPath();
    ctx.moveTo(x1 - w1, y1);
    ctx.lineTo(x1 + w1, y1);
    ctx.lineTo(x2 + w2, y2);
    ctx.lineTo(x2 - w2, y2);
    ctx.closePath();
    ctx.fill();
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
  }

  function drawSky(parallax) {
    const sky = ctx.createLinearGradient(0, 0, 0, viewH);
    sky.addColorStop(0, COLORS.skyTop);
    sky.addColorStop(0.55, COLORS.skyMid);
    sky.addColorStop(1, COLORS.fog);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, viewW, viewH);

    const moonX = viewW * 0.72 + parallax * 0.35;
    const moon = ctx.createRadialGradient(moonX, viewH * 0.16, 4, moonX, viewH * 0.16, 36);
    moon.addColorStop(0, "rgba(232, 238, 255, 0.95)");
    moon.addColorStop(1, "rgba(232, 238, 255, 0)");
    ctx.fillStyle = moon;
    ctx.beginPath();
    ctx.arc(moonX, viewH * 0.16, 34, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(232, 237, 245, 0.8)";
    for (let i = 0; i < 48; i += 1) {
      const sx = (hash(i) * viewW + parallax * (0.15 + hash(i + 4) * 0.4) + viewW) % viewW;
      const sy = hash(i + 9) * viewH * 0.38;
      ctx.fillRect(sx, sy, hash(i + 2) > 0.8 ? 2 : 1, 1);
    }

    for (let layer = 0; layer < 3; layer += 1) {
      const shift = parallax * (0.5 + layer * 0.45);
    const horizon = viewH * 0.46;
    ctx.beginPath();
    ctx.moveTo(0, horizon);
    for (let x = 0; x <= viewW; x += 28) {
      const h = 26 + layer * 14 + Math.sin((x + shift) * 0.012 + layer) * (18 + layer * 6);
      ctx.lineTo(x, horizon - h - layer * 16);
    }
    ctx.lineTo(viewW, horizon);
    ctx.closePath();
    ctx.fillStyle = `rgba(${12 + layer * 10}, ${18 + layer * 8}, ${32 + layer * 12}, 0.95)`;
    ctx.fill();
    }
  }

  function drawSprite(segment, sprite) {
    if (!sprite || segment.p1.screen.scale <= 0) return;
    const scale = segment.p1.screen.scale;
    const roadW = segment.p1.screen.w;
    const sx = segment.p1.screen.x + sprite.offset * sprite.side * roadW;
    const sy = segment.p1.screen.y;
    const h = roadW * (sprite.kind === "rock" ? 0.55 : 1.15);
    if (h < 4 || h > 72 || sy > viewH + 8 || sy < -20) return;
    if (sprite.kind === "rock") {
      ctx.fillStyle = "#1c212b";
      ctx.beginPath();
      ctx.ellipse(sx, sy, h * 0.7, h * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    ctx.fillStyle = "#142018";
    ctx.beginPath();
    ctx.moveTo(sx, sy - h);
    ctx.lineTo(sx - h * 0.38, sy);
    ctx.lineTo(sx + h * 0.38, sy);
    ctx.fill();
    ctx.fillStyle = "#2a2118";
    ctx.fillRect(sx - h * 0.06, sy - h * 0.08, h * 0.12, h * 0.22);
  }

  function drawRail(segment, side) {
    if (segment.p1.screen.scale <= 0) return;
    const roadW = segment.p1.screen.w;
    const sx = segment.p1.screen.x + side * roadW * 1.08;
    const sy = segment.p1.screen.y;
    const h = roadW * 0.22;
    if (h < 3 || h > 70) return;
    ctx.fillStyle = "#2c3648";
    ctx.fillRect(sx - 1, sy - h, 2, h);
  }

  function render() {
    const base = findSegment(position);
    const percent = (position % SEGMENT_LENGTH) / SEGMENT_LENGTH;
    const playerY = base.p1.world.y + (base.p2.world.y - base.p1.world.y) * percent;
    let shift = 0;
    let dShift = -base.curve * percent;
    let maxY = viewH;
    const sprites = [];
    let anchor = null;

    ctx.clearRect(0, 0, viewW, viewH);
    drawSky(base.curve * 80 + playerX * 40);
    ctx.fillStyle = COLORS.grassA;
    ctx.fillRect(0, viewH * 0.38, viewW, viewH);

    const camZ = position - PLAYER_Z;
    for (let n = 0; n < DRAW_DISTANCE; n += 1) {
      const index = (base.index + n) % segments.length;
      const segment = segments[index];
      const looped = index < base.index;
      const zFix = looped ? trackLength : 0;
      const camX = playerX * ROAD_WIDTH + shift;
      const camXFar = camX + dShift;
      project(segment.p1, camX, playerY + CAMERA_HEIGHT, camZ, zFix);
      project(segment.p2, camXFar, playerY + CAMERA_HEIGHT, camZ, zFix);
      shift += dShift;
      dShift += segment.curve;

      const s1 = segment.p1.screen;
      const s2 = segment.p2.screen;
      if (!s1.scale || !s2.scale || s2.y >= s1.y || s2.y >= maxY) continue;

      const fog = Math.pow(n / DRAW_DISTANCE, 1.35);
      ctx.globalAlpha = 1 - fog * 0.88;
      const alt = index % 2 === 0;
      const rumble = index % 4 < 2 ? COLORS.rumbleA : COLORS.rumbleB;
      ctx.fillStyle = alt ? COLORS.shoulderA : COLORS.shoulderB;
      trap(s1.x, s1.y, s1.w * 1.28, s2.x, s2.y, s2.w * 1.28);
      ctx.fillStyle = rumble;
      trap(s1.x, s1.y, s1.w * 1.04, s2.x, s2.y, s2.w * 1.04);
      ctx.fillStyle = alt ? COLORS.roadA : COLORS.roadB;
      trap(s1.x, s1.y, s1.w * 0.96, s2.x, s2.y, s2.w * 0.96);
      if (index % 6 < 3) {
        ctx.fillStyle = COLORS.lane;
        trap(s1.x, s1.y, s1.w * 0.018, s2.x, s2.y, s2.w * 0.018);
      }
      ctx.globalAlpha = 1;
      if (!anchor) anchor = { x: s1.x, y: s1.y, w: s1.w, road: alt ? COLORS.roadA : COLORS.roadB, rumble };
      maxY = s1.y;
      if (segment.sprite) sprites.push({ kind: "sprite", segment });
      if (segment.rail) sprites.push({ kind: "rail", segment });
    }

    if (anchor && anchor.y < viewH) {
      ctx.fillStyle = anchor.rumble;
      trap(anchor.x, viewH + 8, anchor.w * 1.12, anchor.x, anchor.y, anchor.w * 1.04);
      ctx.fillStyle = anchor.road;
      trap(anchor.x, viewH + 8, anchor.w * 1.02, anchor.x, anchor.y, anchor.w * 0.96);
    }

    const glow = ctx.createRadialGradient(viewW / 2, viewH * 0.72, 10, viewW / 2, viewH * 0.56, viewW * 0.2);
    glow.addColorStop(0, "rgba(226, 236, 255, 0.34)");
    glow.addColorStop(0.45, "rgba(90, 130, 255, 0.12)");
    glow.addColorStop(1, "rgba(31, 79, 216, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.ellipse(viewW / 2, viewH * 0.64, viewW * 0.16, viewH * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();

    for (let i = sprites.length - 1; i >= 0; i -= 1) {
      const item = sprites[i];
      if (item.kind === "rail") {
        drawRail(item.segment, -1);
        drawRail(item.segment, 1);
      } else {
        drawSprite(item.segment, item.segment.sprite);
      }
    }

    drawCar();
  }

  let carSprites = null;

  function paintPose(g, cssW, cssH, pose) {
    const W = cssW * 0.7;
    const H = W * 0.64;
    const near = pose;
    const fx = (x) => {
      if (!pose) return x;
      return x < 0 ? x * (pose > 0 ? 0.74 : 1.08) : x * (pose > 0 ? 1.08 : 0.74);
    };
    const poly = (pts) => {
      g.beginPath();
      pts.forEach((p, i) => (i ? g.lineTo(fx(p[0]), p[1]) : g.moveTo(fx(p[0]), p[1])));
      g.closePath();
    };
    const tire = (x, y, w, h) => {
      const grad = g.createLinearGradient(x, y, x + w, y);
      grad.addColorStop(0, "#2a2e36");
      grad.addColorStop(0.18, "#0c0e12");
      grad.addColorStop(0.55, "#1a1e26");
      grad.addColorStop(1, "#050608");
      g.fillStyle = grad;
      g.beginPath();
      g.roundRect(x, y, w, h, 7);
      g.fill();
      g.fillStyle = "#07080c";
      for (let i = 0; i < 5; i += 1) g.fillRect(x + 4, y + 5 + i * (h / 5.4), w - 8, Math.max(2, h * 0.08));
      g.fillStyle = "rgba(255,255,255,0.14)";
      g.fillRect(x + 2, y + 3, 3, h - 6);
    };

    g.translate(cssW / 2, cssH - 8);

    tire(fx(-W * 0.56), -H * 0.5, W * 0.18, H * 0.46);
    tire(fx(W * 0.38), -H * 0.5, W * 0.18, H * 0.46);
    if (near) {
      const side = near > 0 ? 1 : -1;
      tire(fx(side * W * 0.5), -H * 0.78, W * 0.15, H * 0.34);
    }

    if (near) {
      const side = near > 0 ? 1 : -1;
      const flank = g.createLinearGradient(0, -H, 0, 0);
      flank.addColorStop(0, "#6f93ff");
      flank.addColorStop(0.45, "#1a3fbe");
      flank.addColorStop(1, "#0c226e");
      g.fillStyle = flank;
      poly([
        [side * W * 0.46, -H * 0.1],
        [side * W * 0.36, -H * 0.62],
        [side * W * 0.7, -H * 0.78],
        [side * W * 0.78, -H * 0.28],
      ]);
      g.fill();
      g.fillStyle = "#10244f";
      poly([
        [side * W * 0.4, -H * 0.58],
        [side * W * 0.34, -H * 0.78],
        [side * W * 0.62, -H * 0.9],
        [side * W * 0.66, -H * 0.66],
      ]);
      g.fill();
      g.strokeStyle = "rgba(0,0,0,0.45)";
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(fx(side * W * 0.52), -H * 0.32);
      g.lineTo(fx(side * W * 0.58), -H * 0.7);
      g.stroke();
    }

    const body = g.createLinearGradient(0, -H * 1.05, 0, 0);
    body.addColorStop(0, "#8eacff");
    body.addColorStop(0.22, "#3d6ef0");
    body.addColorStop(0.55, "#1f4fd8");
    body.addColorStop(0.82, "#16348f");
    body.addColorStop(1, "#0c2268");
    g.fillStyle = body;
    poly([
      [-W * 0.48, -H * 0.12],
      [-W * 0.4, -H * 0.64],
      [W * 0.4, -H * 0.64],
      [W * 0.48, -H * 0.12],
    ]);
    g.fill();
    g.strokeStyle = "rgba(214, 228, 255, 0.55)";
    g.lineWidth = Math.max(1.5, W * 0.012);
    g.beginPath();
    g.moveTo(fx(-W * 0.36), -H * 0.6);
    g.lineTo(fx(W * 0.36), -H * 0.6);
    g.stroke();

    g.fillStyle = "#0b0e16";
    poly([
      [-W * 0.3, -H * 0.64],
      [-W * 0.16, -H * 1.02],
      [W * 0.16, -H * 1.02],
      [W * 0.3, -H * 0.64],
    ]);
    g.fill();
    const glass = g.createLinearGradient(0, -H * 1.02, 0, -H * 0.64);
    glass.addColorStop(0, "#9eb6de");
    glass.addColorStop(0.35, "#24344e");
    glass.addColorStop(1, "#121a28");
    g.fillStyle = glass;
    poly([
      [-W * 0.24, -H * 0.7],
      [-W * 0.13, -H * 0.96],
      [W * 0.13, -H * 0.96],
      [W * 0.24, -H * 0.7],
    ]);
    g.fill();
    g.strokeStyle = "rgba(255,255,255,0.55)";
    g.lineWidth = Math.max(1.2, W * 0.01);
    g.beginPath();
    g.moveTo(fx(-W * 0.18), -H * 0.9);
    g.lineTo(fx(W * 0.08), -H * 0.78);
    g.stroke();
    g.strokeStyle = "rgba(0,0,0,0.55)";
    g.beginPath();
    g.moveTo(fx(-W * 0.22), -H * 0.66);
    g.lineTo(fx(-W * 0.12), -H * 0.98);
    g.moveTo(fx(W * 0.22), -H * 0.66);
    g.lineTo(fx(W * 0.12), -H * 0.98);
    g.stroke();

    g.fillStyle = "#1a1e28";
    poly([
      [-W * 0.34, -H * 0.78],
      [-W * 0.3, -H * 0.7],
      [W * 0.3, -H * 0.7],
      [W * 0.34, -H * 0.78],
    ]);
    g.fill();
    g.fillStyle = "#3a4252";
    g.fillRect(fx(-W * 0.34), -H * 0.78, fx(W * 0.34) - fx(-W * 0.34), H * 0.035);
    g.fillStyle = "#0a0c12";
    g.fillRect(fx(-W * 0.22), -H * 0.7, W * 0.035, H * 0.1);
    g.fillRect(fx(W * 0.18), -H * 0.7, W * 0.035, H * 0.1);

    const bumper = g.createLinearGradient(0, -H * 0.34, 0, -H * 0.08);
    bumper.addColorStop(0, "#2a3140");
    bumper.addColorStop(0.4, "#12161e");
    bumper.addColorStop(1, "#07090e");
    g.fillStyle = bumper;
    g.fillRect(fx(-W * 0.48), -H * 0.28, fx(W * 0.48) - fx(-W * 0.48), H * 0.18);
    g.fillStyle = "#05070b";
    g.fillRect(fx(-W * 0.3), -H * 0.16, fx(W * 0.3) - fx(-W * 0.3), H * 0.07);
    g.strokeStyle = "rgba(255,255,255,0.16)";
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(fx(-W * 0.4), -H * 0.3);
    g.lineTo(fx(W * 0.4), -H * 0.3);
    g.stroke();

    [-0.36, -0.24, 0.24, 0.36].forEach((spot) => {
      const cx = fx(spot * W);
      const cy = -H * 0.4;
      const r = W * 0.048;
      const bloom = g.createRadialGradient(cx, cy, r * 0.2, cx, cy, r * 2.4);
      bloom.addColorStop(0, "rgba(255,50,50,0.95)");
      bloom.addColorStop(0.45, "rgba(255,20,20,0.35)");
      bloom.addColorStop(1, "rgba(255,0,0,0)");
      g.fillStyle = bloom;
      g.beginPath();
      g.arc(cx, cy, r * 2.4, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#4a0000";
      g.beginPath();
      g.arc(cx, cy, r, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = "#7a1010";
      g.lineWidth = Math.max(1, r * 0.28);
      g.stroke();
      g.fillStyle = "#ff2d2d";
      g.beginPath();
      g.arc(cx, cy, r * 0.62, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#ffe4e4";
      g.beginPath();
      g.arc(cx - r * 0.22, cy - r * 0.22, r * 0.18, 0, Math.PI * 2);
      g.fill();
    });

    g.fillStyle = "#4a515c";
    g.beginPath();
    g.arc(fx(-W * 0.16), -H * 0.1, W * 0.03, 0, Math.PI * 2);
    g.arc(fx(W * 0.16), -H * 0.1, W * 0.03, 0, Math.PI * 2);
    g.fill();
  }

  function ensureCarSprites() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = Math.max(200, Math.round(viewW * 0.38));
    const cssH = Math.round(cssW * 0.8);
    if (carSprites && carSprites.cssW === cssW && carSprites.dpr === dpr) return;
    carSprites = {
      cssW,
      cssH,
      dpr,
      poses: [-1, 0, 1].map((pose) => {
        const c = document.createElement("canvas");
        c.width = Math.round(cssW * dpr);
        c.height = Math.round(cssH * dpr);
        const g = c.getContext("2d");
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        paintPose(g, cssW, cssH, pose);
        return c;
      }),
    };
  }

  function drawCar() {
    ensureCarSprites();
    const steer = (keys.right || touch.right ? 1 : 0) - (keys.left || touch.left ? 1 : 0);
    const yaw = Math.max(-1, Math.min(1, driftAngle * 1.35 + steer * 0.55));
    const pose = yaw > 0.18 ? 1 : yaw < -0.18 ? -1 : 0;
    const bob = Math.sin(position / 80) * (0.6 + (speed / MAX_SPEED) * 2.2) * (offroad ? 1.8 : 1);
    const sprite = carSprites.poses[pose + 1];
    const drawW = carSprites.cssW;
    const drawH = carSprites.cssH;

    ctx.save();
    ctx.translate(viewW / 2, viewH - 8);
    ctx.scale(1, 0.22);
    ctx.fillStyle = "rgba(0, 0, 0, 0.42)";
    ctx.beginPath();
    ctx.ellipse(0, 0, drawW * 0.34, drawW * 0.34, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    [-0.1, 0.1].forEach((spot) => {
      ctx.fillStyle = "rgba(255, 40, 40, 0.22)";
      ctx.beginPath();
      ctx.ellipse(viewW / 2 + spot * drawW, viewH - 10 + bob, drawW * 0.06, drawH * 0.03, 0, 0, Math.PI * 2);
      ctx.fill();
    });

    smoke.forEach((puff) => {
      ctx.fillStyle = `rgba(198, 206, 216, ${Math.max(0, puff.life) * 0.4})`;
      ctx.beginPath();
      ctx.arc(viewW / 2 + puff.x, viewH - drawH * 0.28 + puff.y + bob, puff.r, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.save();
    ctx.translate(viewW / 2, viewH - 2 + bob);
    ctx.rotate(yaw * 0.06);
    ctx.drawImage(sprite, -drawW / 2, -drawH + 6, drawW, drawH);
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

  function frame(now) {
    if (!driving()) {
      raf = 0;
      return;
    }
    const dt = Math.min(0.033, (now - lastTime) / 1000 || 0.016);
    lastTime = now;
    step(dt);
    render();
    raf = requestAnimationFrame(frame);
  }

  function loop() {
    if (raf || !driving()) return;
    lastTime = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function resetRun() {
    position = 0;
    playerX = 0;
    speed = 0;
    driftAngle = 0;
    score = 0;
    combo = 1;
    comboTier = 1;
    drifting = false;
    offroad = false;
    wasDrifting = false;
    smoke.length = 0;
    paintHud();
  }

  function showPause(on) {
    if (pauseEl) pauseEl.hidden = !on;
  }

  function start() {
    ensureAudio();
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
    setMaster();
    if (!started) {
      started = true;
      resetRun();
      root.classList.add("is-running");
      canvas.hidden = false;
      if (hud) hud.hidden = false;
      if (startBtn) startBtn.hidden = true;
      resize();
    }
    manualPause = false;
    showPause(false);
    canvas.focus({ preventScroll: true });
    holdAudio(true);
    loop();
  }

  function togglePause() {
    if (!started) return;
    manualPause = !manualPause;
    showPause(manualPause);
    if (manualPause) {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      holdAudio(false);
      render();
    } else {
      holdAudio(true);
      loop();
    }
  }

  function toggleMute() {
    muted = !muted;
    try {
      localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
    } catch {
      /* ignore */
    }
    paintMute();
    setMaster();
    if (!muted && driving()) holdAudio(true);
  }

  startBtn?.addEventListener("click", start);
  pauseEl?.addEventListener("click", () => {
    if (manualPause) start();
  });
  muteBtn?.addEventListener("click", (event) => {
    event.stopPropagation();
    if (!started) return;
    ensureAudio();
    toggleMute();
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
      if (event.code === "KeyM") {
        event.preventDefault();
        ensureAudio();
        toggleMute();
        return;
      }
      if (!driving() && manualPause) return;
      setKey(event.code, true);
    },
    true
  );

  window.addEventListener("keyup", (event) => setKey(event.code, false));

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
      if (!started || manualPause) start();
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
      holdAudio(false);
    } else if (!manualPause) {
      holdAudio(true);
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
          holdAudio(false);
        } else if (!manualPause) {
          holdAudio(driving());
          loop();
        }
      },
      { threshold: 0.2 }
    );
    io.observe(root);
  }

  const play = canvas.parentElement;
  if (window.ResizeObserver && play) {
    const ro = new ResizeObserver(() => {
      resize();
      if (started) render();
    });
    ro.observe(play);
  } else {
    window.addEventListener("resize", resize);
  }
  resize();

  window.addEventListener("blur", () => {
    keys.up = keys.down = keys.left = keys.right = keys.drift = false;
  });
})();
