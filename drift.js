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

  function drawCar() {
    const steer = (keys.right || touch.right ? 1 : 0) - (keys.left || touch.left ? 1 : 0);
    const yaw = Math.max(-1, Math.min(1, driftAngle * 1.35 + steer * 0.55));
    const pose = yaw > 0.2 ? 1 : yaw < -0.2 ? -1 : 0;
    const W = viewW * 0.25;
    const H = W * 0.58;
    const bob = Math.sin(position / 90) * (offroad ? 1.6 : 0.45);
    const x = viewW / 2;
    const y = viewH - 2 + bob;

    smoke.forEach((puff) => {
      ctx.fillStyle = `rgba(198, 206, 216, ${Math.max(0, puff.life) * 0.4})`;
      ctx.beginPath();
      ctx.arc(x + puff.x, y - H * 0.22 + puff.y, puff.r, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.save();
    ctx.translate(x, y);
    ctx.transform(1, 0, pose * -0.2, 1, pose * W * 0.03, 0);

    ctx.fillStyle = "#07080c";
    roundRect(-W * 0.54, -H * 0.46, W * 0.16, H * 0.42, 5);
    ctx.fill();
    roundRect(W * 0.38, -H * 0.46, W * 0.16, H * 0.42, 5);
    ctx.fill();

    ctx.fillStyle = "#1f4fd8";
    ctx.beginPath();
    ctx.moveTo(-W * 0.46, -H * 0.08);
    ctx.lineTo(-W * 0.38, -H * 0.58);
    ctx.lineTo(W * 0.38, -H * 0.58);
    ctx.lineTo(W * 0.46, -H * 0.08);
    ctx.closePath();
    ctx.fill();

    if (pose !== 0) {
      ctx.fillStyle = "#16368f";
      ctx.beginPath();
      if (pose < 0) {
        ctx.moveTo(-W * 0.46, -H * 0.08);
        ctx.lineTo(-W * 0.38, -H * 0.58);
        ctx.lineTo(-W * 0.6, -H * 0.46);
        ctx.lineTo(-W * 0.64, -H * 0.1);
      } else {
        ctx.moveTo(W * 0.46, -H * 0.08);
        ctx.lineTo(W * 0.38, -H * 0.58);
        ctx.lineTo(W * 0.6, -H * 0.46);
        ctx.lineTo(W * 0.64, -H * 0.1);
      }
      ctx.closePath();
      ctx.fill();
    }

    ctx.fillStyle = "#0c0e14";
    ctx.beginPath();
    ctx.moveTo(-W * 0.3 + pose * W * 0.04, -H * 0.58);
    ctx.lineTo(-W * 0.16 + pose * W * 0.07, -H * 0.96);
    ctx.lineTo(W * 0.16 + pose * W * 0.07, -H * 0.96);
    ctx.lineTo(W * 0.3 + pose * W * 0.04, -H * 0.58);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#1c283c";
    ctx.beginPath();
    ctx.moveTo(-W * 0.22 + pose * W * 0.03, -H * 0.64);
    ctx.lineTo(-W * 0.12 + pose * W * 0.05, -H * 0.88);
    ctx.lineTo(W * 0.12 + pose * W * 0.05, -H * 0.88);
    ctx.lineTo(W * 0.22 + pose * W * 0.03, -H * 0.64);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#07080c";
    ctx.fillRect(-W * 0.36, -H * 0.7, W * 0.72, H * 0.07);

    ctx.fillStyle = "#141820";
    ctx.fillRect(-W * 0.46, -H * 0.24, W * 0.92, H * 0.16);

    [-0.34, -0.22, 0.22, 0.34].forEach((spot) => {
      const cx = spot * W;
      const cy = -H * 0.36;
      ctx.fillStyle = "rgba(255, 70, 70, 0.45)";
      ctx.beginPath();
      ctx.arc(cx, cy, W * 0.055, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ff3a3a";
      ctx.beginPath();
      ctx.arc(cx, cy, W * 0.03, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.fillStyle = "#3a404a";
    ctx.beginPath();
    ctx.arc(-W * 0.14, -H * 0.12, W * 0.028, 0, Math.PI * 2);
    ctx.arc(W * 0.14, -H * 0.12, W * 0.028, 0, Math.PI * 2);
    ctx.fill();
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
