// Ghisha Web Asset FIN — a noise-morphed sphere of glowing points with an
// iridescent shell, a SOLID 2D membrane and interactive floating particles.
// Based on v02. Two radial background gradients (A + B) sit below the sphere.
// Extracted from the Ghisha Sphere tool (v13) as a lightweight, drop-in website
// asset: no UI, no export, no recording. It fills its container, is fully
// responsive, and is tuned so it stays smooth on weaker machines —
//   • pixelDensity(1)                → never oversamples on retina/hi-dpi screens
//   • pauses when scrolled off-screen (IntersectionObserver)
//   • pauses when the browser tab is hidden (visibilitychange)
//   • honours prefers-reduced-motion (renders a single static frame)
//
// Difference vs v01: the membrane is the "Solid 2D" type — a single
// noise-wobbled silhouette blob filled with a radial gradient (ONE fill per
// frame) instead of thousands of point sprites. Cheaper and a smoother shell.
//
// Deploy: include p5.min.js + this file, and give #ghisha-sphere a size in CSS.
// Tune the whole look from the CONFIG block below (values match Sphere tool v13).

// ── CONFIG — the entire look, matching Sphere tool v13's defaults ─────────────
const CONFIG = {
  quality:       30,        // 1..100 — point density (LOWER this first if it lags)
  glow:          25,        // 1..100 — glow intensity of the shell points
  smoothness:    3,         // 1..4   — noise smoothness of the morph
  shapeSeed:     0,         // noise seed (fixes the silhouette)

  particleCount: 250,       // floating particles (0..400)

  // Two radial background gradients (below the sphere).
  gradA: { diameter: 50, density: 40, opacity: 100, x: -15,   y: -35, color: '#8C31EC' },
  gradB: { diameter: 80, density: 45, opacity: 100, x: 50, y: 50, color: '#4D0079' },
};

// ── Fixed look (constants carried over unchanged from v13) ────────────────────
const N_BUCKETS = 32;      // pre-tinted sphere sprites (A→B gradient)
const N_IRIS = 96;         // pre-tinted sprites around the hue wheel (iridescence)
const SPRITE_PX = 96;      // offscreen size of each sprite
const DISP = 0.34;         // radial displacement as a fraction of base radius

const COLOR_A = '#b25be1', COLOR_B = '#ffffff';   // sphere shell A→B duotone
const MEMBRANE_COLOR = '#c5a0de';
const FLOAT_COLOR = '#1b0e45', INSIDE_COLOR = '#7D26E6';
const GRAD_A_COLOR = '#4D0079';                   // Gradient A — fixed purple
const noiseSpeed = 0.007;
const hollow = 40;
const irisCoverage = 50, irisPatch = 45, irisBands = 35, irisScale = 14,
      irisSeed = 0, irisAngle = 42, irisHue = 40;   // iridescence
const irisSat = 0.51;
const reach = 45, pullForce = 1, floatTrail = 1, cloudSize = 25, breakthrough = 45;

// ── Membrane — SOLID 2D (v13 "Solid 2D" defaults) ─────────────────────────────
const membraneOpacity = 50, membraneDelay = 400, membraneGap = 70;   // solid → gap 70
const membGradDiameter = 60, membGradDensity = 100, membGradCenter = 72, membGradWidth = 16;

// ── Derived live settings (computed from CONFIG in setup) ─────────────────────
let sphereCount, pointSize, glow, noiseScaleVal, particleCount;
const sphereShiftX = 0, sphereShiftY = 0, sphereScale = 1;   // centred, unscaled
let gradDiameter, gradDensity, gradOpacity, gradPosX, gradPosY, gradAColor;
let gradBDiameter, gradBDensity, gradBOpacity, gradBPosX, gradBPosY, gradBColor;
const bgColor = '#000000';

// ── State ─────────────────────────────────────────────────────────────────────
let dirs = [];
let coreSprites = [], irisSprites = [];
let floatGlow = null, floatCore = null, insideGlow = null, insideCore = null;

let fx, fy, fvx, fvy, ax, ay, hx, hy, fesc, fAlpha, fInside, fchg;
let floatT = 0, floatReady = false, cursorOver = false;

let noiseHist = [], membNT = 0, noiseT = 40.0, rot = 0;
let playing = true, reducedMotion = false;

// ── Canvas sizing — fill the container, responsive ────────────────────────────
function canvasSize() {
  const c = document.getElementById('ghisha-sphere');
  const w = Math.max(1, c.clientWidth);
  const h = Math.max(1, c.clientHeight);
  return [w, h];
}

// Fibonacci sphere — an even spread of `count` unit vectors over the sphere.
function buildPoints(count) {
  dirs = new Array(count);
  const ga = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const th = i * ga;
    dirs[i] = { x: Math.cos(th) * r, y: y, z: Math.sin(th) * r };
  }
}

// ── Floating particles ────────────────────────────────────────────────────────
function buildFloaters() {
  const n = particleCount;
  fx = new Float32Array(n); fy = new Float32Array(n);
  fvx = new Float32Array(n); fvy = new Float32Array(n);
  ax = new Float32Array(n); ay = new Float32Array(n);
  hx = new Float32Array(n); hy = new Float32Array(n);
  fesc = new Float32Array(n); fAlpha = new Float32Array(n);
  fInside = new Uint8Array(n); fchg = new Float32Array(n);
  for (let i = 0; i < n; i++) { fesc[i] = Math.random(); respawnFloater(i); }
}

function resetFloaters() { for (let i = 0; i < particleCount; i++) respawnFloater(i); }

// Place particle i (and its home) at a random spot on the canvas, outside the sphere.
function respawnFloater(i) {
  const cx = width / 2, cy = height / 2;
  const R = Math.min(width, height) * 0.29 * sphereScale;
  let x, y, dc, tries = 0;
  do {
    x = random(4, width - 4); y = random(4, height - 4);
    dc = Math.hypot(x - cx, y - cy); tries++;
  } while (dc < R * 1.25 && tries < 10);
  fx[i] = x; fy[i] = y; ax[i] = x; ay[i] = y; hx[i] = x; hy[i] = y;
  fvx[i] = random(-1, 1); fvy[i] = random(-1, 1);
  fAlpha[i] = 1;
  if (fInside) fInside[i] = 0;
  if (fchg) fchg[i] = 0;
}

// ── Sprites ───────────────────────────────────────────────────────────────────
function makeSprite(r, g, bl, stops) {
  const cv = document.createElement('canvas');
  cv.width = SPRITE_PX; cv.height = SPRITE_PX;
  const cx = cv.getContext('2d');
  const cen = SPRITE_PX / 2;
  const grad = cx.createRadialGradient(cen, cen, 0, cen, cen, cen);
  for (const [pos, a] of stops) grad.addColorStop(pos, `rgba(${r},${g},${bl},${a})`);
  cx.fillStyle = grad;
  cx.fillRect(0, 0, SPRITE_PX, SPRITE_PX);
  return cv;
}

// One MERGED sprite per colour bucket: crisp core + glow halo baked in.
function buildSprites() {
  const ca = color(COLOR_A), cb = color(COLOR_B);
  const gCore = map(glow, 1, 100, 0.16, 0.5);
  const coreStop = map(pointSize, 1, 100, 0.09, 0.5);

  coreSprites = new Array(N_BUCKETS);
  for (let b = 0; b < N_BUCKETS; b++) {
    const t = b / (N_BUCKETS - 1);
    const c = lerpColor(ca, cb, t);
    const r = Math.round(red(c)), g = Math.round(green(c)), bl = Math.round(blue(c));
    coreSprites[b] = makeSprite(r, g, bl, [
      [0.0, 0.98], [coreStop, 0.92], [coreStop * 1.7, gCore],
      [0.5, gCore * 0.35], [0.78, gCore * 0.1], [1.0, 0]
    ]);
  }
  buildIrisSprites();
}

function smoothstep(e0, e1, x) {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

function hsv2rgb(h, s, v) {
  const i = Math.floor(h * 6), f = h * 6 - i;
  const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  let r, g, b;
  switch (i % 6) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    default: r = v; g = p; b = q;
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function buildIrisSprites() {
  const gCore = map(glow, 1, 100, 0.16, 0.5);
  const coreStop = map(pointSize, 1, 100, 0.09, 0.5);
  irisSprites = new Array(N_IRIS);
  for (let k = 0; k < N_IRIS; k++) {
    const [r, g, bl] = hsv2rgb(k / N_IRIS, irisSat, 1.0);
    irisSprites[k] = makeSprite(r, g, bl, [
      [0.0, 1.0], [coreStop, 0.95], [coreStop * 1.7, gCore],
      [0.5, gCore * 0.35], [0.78, gCore * 0.1], [1.0, 0]
    ]);
  }
}

function buildParticleSprites(hex) {
  const c = color(hex);
  const r = Math.round(red(c)), g = Math.round(green(c)), bl = Math.round(blue(c));
  return [
    makeSprite(r, g, bl, [[0.0, 0.5], [0.4, 0.18], [1.0, 0]]),
    makeSprite(r, g, bl, [[0.0, 0.95], [0.5, 0.85], [0.75, 0.2], [1.0, 0]])
  ];
}

function buildFloatSprites() {
  [floatGlow, floatCore] = buildParticleSprites(FLOAT_COLOR);
  [insideGlow, insideCore] = buildParticleSprites(INSIDE_COLOR);
}

// ── Setup ─────────────────────────────────────────────────────────────────────
function setup() {
  const [cW, cH] = canvasSize();
  createCanvas(cW, cH).parent('ghisha-sphere');
  pixelDensity(1);
  colorMode(RGB, 255);

  // Apply CONFIG.
  noiseSeed(CONFIG.shapeSeed);
  noiseScaleVal = CONFIG.smoothness;
  glow = CONFIG.glow;
  sphereCount = Math.round(map(CONFIG.quality, 1, 100, 2000, 16000));
  pointSize   = map(CONFIG.quality, 1, 100, 45, 12.5);
  particleCount = CONFIG.particleCount;
  gradDiameter = CONFIG.gradA.diameter; gradDensity = CONFIG.gradA.density;
  gradOpacity  = CONFIG.gradA.opacity;  gradPosX = CONFIG.gradA.x; gradPosY = CONFIG.gradA.y;
  gradAColor = CONFIG.gradA.color || GRAD_A_COLOR;
  gradBDiameter = CONFIG.gradB.diameter; gradBDensity = CONFIG.gradB.density;
  gradBOpacity  = CONFIG.gradB.opacity;  gradBPosX = CONFIG.gradB.x; gradBPosY = CONFIG.gradB.y;
  gradBColor = CONFIG.gradB.color;

  buildFloaters();
  buildPoints(sphereCount);
  buildSprites();
  buildFloatSprites();

  // Track whether the cursor is genuinely over the canvas (otherwise mouseX/Y
  // default to 0,0 and would pull every particle into the top-left corner).
  const cnv = document.querySelector('#ghisha-sphere canvas');
  cnv.addEventListener('mouseenter', () => cursorOver = true);
  cnv.addEventListener('mouseleave', () => cursorOver = false);

  // ── Performance: only animate when actually visible ──
  reducedMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (reducedMotion) {
    redraw();
    noLoop();
    return;
  }

  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      const visible = entries[0].isIntersecting;
      if (visible && !document.hidden) loop(); else noLoop();
    }, { threshold: 0 });
    io.observe(document.getElementById('ghisha-sphere'));
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) noLoop();
    else if (isOnScreen()) loop();
  });

  loop();
}

function isOnScreen() {
  const el = document.getElementById('ghisha-sphere');
  const r = el.getBoundingClientRect();
  return r.bottom > 0 && r.top < (window.innerHeight || document.documentElement.clientHeight);
}

function windowResized() {
  const [cW, cH] = canvasSize();
  resizeCanvas(cW, cH);
  resetFloaters();
  if (reducedMotion) redraw();
}

function delayedNoiseT(now, delayMs) {
  const target = now - delayMs;
  let v = noiseHist.length ? noiseHist[0].v : noiseT;
  for (let i = 0; i < noiseHist.length; i++) {
    if (noiseHist[i].t <= target) v = noiseHist[i].v; else break;
  }
  return v;
}

function draw() {
  if (playing && !reducedMotion) { noiseT += noiseSpeed; rot += 0.0035; }
  floatT += 0.006;

  const now = millis();
  noiseHist.push({ t: now, v: noiseT });
  while (noiseHist.length > 1 && noiseHist[0].t < now - 6000) noiseHist.shift();
  membNT = delayedNoiseT(now, membraneDelay);

  if (!floatReady) { resetFloaters(); floatReady = true; }
  if (!reducedMotion) updateFloaters();

  renderScene(drawingContext, width, height, true, 1);
}

// ── Floating-particle physics ─────────────────────────────────────────────────
function updateFloaters() {
  const cx = width / 2, cy = height / 2;
  const minDim = Math.min(width, height);
  const R = minDim * 0.29 * sphereScale;
  const gapWorld = minDim * map(membraneGap, 0, 100, 0.0, 0.05);
  const Rmem = R + gapWorld + minDim * 0.015;

  const overC = cursorOver;
  const captureR = map(reach, 1, 100, minDim * 0.18, minDim * 0.65);
  const grabAmt = map(pullForce, 1, 100, 0.09, 0.22);
  const returnEase = map(floatTrail, 1, 100, 0.09, 0.03);
  const maxSp = minDim * 0.022;
  const wanderR = minDim * 0.025;
  const cloudR = captureR * map(cloudSize, 1, 100, 0.0, 1.4);
  const frac = breakthrough / 100;
  const cursorInside = overC && Math.hypot(mouseX - cx, mouseY - cy) < Rmem * 1.1;
  const membResist = 0.32;
  const membEscape = 12;

  for (let i = 0; i < particleCount; i++) {
    const a = noise(i * 0.123, floatT * 0.5) * Math.PI * 4;
    hx[i] = ax[i] + Math.cos(a) * wanderR;
    hy[i] = ay[i] + Math.sin(a) * wanderR;

    const canFollow = overC;
    let w = 0;
    if (canFollow) {
      const d = Math.hypot(mouseX - fx[i], mouseY - fy[i]);
      if (d < captureR) {
        w = 1 - d / captureR;
        const ang = i * 2.39996 + floatT * 0.5;
        const rad = cloudR * Math.sqrt(fesc[i]);
        const tx = mouseX + Math.cos(ang) * rad, ty = mouseY + Math.sin(ang) * rad;
        const grab = grabAmt * w * (fInside[i] ? 0.6 : 1);
        fx[i] += (tx - fx[i]) * grab;
        fy[i] += (ty - fy[i]) * grab;
      }
    }

    fvx[i] *= 0.85; fvy[i] *= 0.85;
    fx[i] += fvx[i]; fy[i] += fvy[i];

    if (!(fInside[i] && w > 0.05)) {
      const ease = returnEase * (1 - w) * (1 - w);
      fx[i] += (hx[i] - fx[i]) * ease;
      fy[i] += (hy[i] - fy[i]) * ease;
    }

    const rx = fx[i] - cx, ry = fy[i] - cy, dc = Math.hypot(rx, ry) || 0.0001;
    if (fInside[i]) {
      if (dc > Rmem && w > 0.05) {
        const held = Rmem + (dc - Rmem) * (1 - membResist);
        fx[i] = cx + rx / dc * held; fy[i] = cy + ry / dc * held;
        fchg[i] += w * Math.min(1, (held - Rmem) / (Rmem * 0.06));
        if (fchg[i] > membEscape) {
          fInside[i] = 0; fchg[i] = 0;
          ax[i] = fx[i]; ay[i] = fy[i]; hx[i] = fx[i]; hy[i] = fy[i];
        }
      } else {
        fchg[i] *= 0.9;
        if (dc > Rmem) {
          fx[i] = cx + rx / dc * Rmem; fy[i] = cy + ry / dc * Rmem;
          const vr = fvx[i] * rx / dc + fvy[i] * ry / dc;
          if (vr > 0) { fvx[i] -= vr * rx / dc; fvy[i] -= vr * ry / dc; }
        }
      }
    } else if (dc < Rmem) {
      const penetrator = fesc[i] < frac;
      if (penetrator && cursorInside) {
        fInside[i] = 1;
        const ang = Math.random() * Math.PI * 2, rr = Math.random() * Rmem * 0.65;
        ax[i] = cx + Math.cos(ang) * rr; ay[i] = cy + Math.sin(ang) * rr;
        hx[i] = ax[i]; hy[i] = ay[i];
      } else {
        fx[i] = cx + rx / dc * Rmem; fy[i] = cy + ry / dc * Rmem;
        const vr = fvx[i] * rx / dc + fvy[i] * ry / dc;
        if (vr < 0) { fvx[i] -= vr * rx / dc; fvy[i] -= vr * ry / dc; }
      }
    }

    if (!fInside[i]) {
      if (fx[i] < 0)      { fx[i] = 0;      if (fvx[i] < 0) fvx[i] = 0; }
      if (fx[i] > width)  { fx[i] = width;  if (fvx[i] > 0) fvx[i] = 0; }
      if (fy[i] < 0)      { fy[i] = 0;      if (fvy[i] < 0) fvy[i] = 0; }
      if (fy[i] > height) { fy[i] = height; if (fvy[i] > 0) fvy[i] = 0; }
    }

    const sp = Math.sqrt(fvx[i] * fvx[i] + fvy[i] * fvy[i]);
    if (sp > maxSp) { fvx[i] *= maxSp / sp; fvy[i] *= maxSp / sp; }
  }
}

// ── Render (sphere shell + solid membrane + floaters), additive on black ──────
function renderScene(ctx, W, H, opaque) {
  const cx = W / 2, cy = H / 2;
  const minDim = Math.min(W, H);
  const R = minDim * 0.29 * sphereScale;
  const focal = R * 3.4;

  const freq = map(noiseScaleVal, 1, 4, 0.25, 0.61);
  const offX = 50.3, offY = 80.7;
  const glowSize = minDim * map(glow, 1, 100, 0.008, 0.030) * sphereScale;
  const irFreq = map(irisScale, 1, 100, 0.25, 3.0);
  const irBandsN = map(irisBands, 1, 100, 0.4, 7.0);
  const irOff = irisSeed * 0.171 + 20.0;
  const irHueF = irisHue / 100;
  const irAngleAmt = irisAngle / 100 * 4.0;
  const mFreq = map(irisPatch, 1, 100, 3.0, 0.25);
  const mOff = 60.0;
  const mCut = map(irisCoverage, 0, 100, 1.06, -0.06);
  const gapWorld = minDim * map(membraneGap, 0, 100, 0.0, 0.05);
  const membAlpha = membraneOpacity / 100;
  const rimPow = map(hollow, 0, 100, 0.15, 4.0);

  const cyR = Math.cos(rot), syR = Math.sin(rot);
  const tilt = 1.3, ct = Math.cos(tilt), st = Math.sin(tilt);

  // Background base fill (black).
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  if (opaque) { ctx.fillStyle = bgColor; ctx.fillRect(0, 0, W, H); }
  else        { ctx.clearRect(0, 0, W, H); }

  // Two radial gradients BELOW the sphere.
  drawRadialGradient(ctx, W, H, gradAColor, gradDiameter, gradDensity, gradOpacity, gradPosX, gradPosY);
  drawGradientB(ctx, W, H);

  // Additive glow for membrane + sphere + particles (on black).
  ctx.globalCompositeOperation = 'lighter';

  // ── Membrane: SOLID 2D — one noise-wobbled silhouette blob, drawn BEHIND the
  //    shell (a single radial-gradient fill per frame). ──
  if (membAlpha > 0) {
    drawMembraneShape(ctx, { cx, cy, R, freq, offX, offY, gapWorld, membAlpha,
                             cyR, syR, ct, st, minDim });
  }

  // ── Sphere shell (glowing points) ──
  for (let i = 0; i < sphereCount; i++) {
    const d = dirs[i];
    const n = noise(d.x * freq + offX, d.y * freq + offY, d.z * freq + noiseT);
    const rBase = R * (1 + (n - 0.5) * 2 * DISP);

    const rx = d.x * cyR + d.z * syR;
    const rz = -d.x * syR + d.z * cyR;
    const ry = d.y * ct - rz * st;
    const rz2 = d.y * st + rz * ct;

    const rim = 1 - Math.abs(rz2);
    const facing = map(rz2, -1, 1, 0.55, 1.0);
    const alpha = Math.pow(rim, rimPow) * facing;
    if (alpha < 0.004) continue;

    const bucket = Math.min(N_BUCKETS - 1, Math.max(0, Math.round(n * (N_BUCKETS - 1))));
    const persp = focal / (focal - rz2 * rBase);
    const sx = cx + rx * rBase * persp, sy = cy + ry * rBase * persp;
    const gs = glowSize * persp;

    const mnoise = noise(d.x * mFreq + mOff, d.y * mFreq + 5.1, d.z * mFreq + noiseT);
    const w = smoothstep(mCut - 0.13, mCut + 0.13, mnoise);
    if (w < 0.997) {
      ctx.globalAlpha = alpha * (1 - w);
      ctx.drawImage(coreSprites[bucket], sx - gs / 2, sy - gs / 2, gs, gs);
    }
    if (w > 0.003) {
      const field = noise(d.x * irFreq + irOff, d.y * irFreq + 8.3, d.z * irFreq + noiseT);
      let hf = irHueF + field * irBandsN + rz2 * irAngleAmt;
      hf -= Math.floor(hf);
      ctx.globalAlpha = alpha * w;
      ctx.drawImage(irisSprites[Math.min(N_IRIS - 1, Math.floor(hf * N_IRIS))], sx - gs / 2, sy - gs / 2, gs, gs);
    }
  }

  // ── Floating particles ──
  const fGlow = minDim * 0.018, fCore = minDim * 0.0055;
  for (let i = 0; i < particleCount; i++) {
    const al = fAlpha[i];
    if (al <= 0.004) continue;
    const sx = fx[i], sy = fy[i];
    const outside = !fInside[i];
    const glowS = outside ? floatGlow : insideGlow;
    const coreS = outside ? floatCore : insideCore;
    ctx.globalAlpha = al * 0.7;
    ctx.drawImage(glowS, sx - fGlow / 2, sy - fGlow / 2, fGlow, fGlow);
    ctx.globalAlpha = al;
    ctx.drawImage(coreS, sx - fCore / 2, sy - fCore / 2, fCore, fCore);
  }

  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

// Membrane as a single 2D noise-wobbled blob filled with a radial gradient
// (membrane colour at the centre → fully transparent at the edge). One fill per
// frame instead of thousands of point sprites. The wobble spins with the sphere.
function drawMembraneShape(ctx, g) {
  const cx = g.cx, cy = g.cy;
  const R = g.R, gapWorld = g.gapWorld, freq = g.freq, offX = g.offX, offY = g.offY;
  const cyR = g.cyR, syR = g.syR, ct = g.ct, st = g.st;
  const RmemBase = R + gapWorld;
  const M = 120;

  // The outline traces the sphere's ACTUAL silhouette: for each screen angle the
  // silhouette direction is (cosθ, sinθ, 0) in view space (z = 0, so it projects
  // 1:1). Inverse-rotate it into object space to read the SAME noise the sphere
  // uses — at membNT, so the delayed-wobble membrane still trails the shape.
  ctx.beginPath();
  for (let i = 0; i <= M; i++) {
    const th = (i / M) * Math.PI * 2;
    const vx = Math.cos(th), vy = Math.sin(th);
    const rz = -vy * st, dy = vy * ct, rx = vx;
    const dx = rx * cyR - rz * syR, dz = rx * syR + rz * cyR;
    const nval = noise(dx * freq + offX, dy * freq + offY, dz * freq + membNT);
    const rr = R * (1 + (nval - 0.5) * 2 * DISP) + gapWorld;
    const px = cx + vx * rr, py = cy + vy * rr;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();

  const mc = color(MEMBRANE_COLOR);
  const mr = Math.round(red(mc)), mg = Math.round(green(mc)), mb = Math.round(blue(mc));

  // A perfectly CIRCULAR radial gradient: transparent → colour → transparent.
  // Because the fill is clipped to the wobbly silhouette, the fixed colour ring is
  // crossed differently around the shape, so the colour reads sharp where the edge
  // sits inside the ring and drifts off where the edge bulges past it.
  //   diameter → overall radius of the gradient circle
  //   center   → where along that radius the colour peaks (0 centre … 1 rim)
  //   width    → half-thickness of the colour band before it fades either side
  //   density  → peak opacity of the colour
  const a0 = map(membGradDensity, 0, 100, 0.0, 1.0) * g.membAlpha;
  const gRad = Math.max(1, RmemBase * map(membGradDiameter, 0, 100, 0.4, 2.2));
  const pos = map(membGradCenter, 0, 100, 0.0, 1.0);
  const halfW = map(membGradWidth, 0, 100, 0.02, 0.6);
  const clampOff = o => (o < 0 ? 0 : o > 1 ? 1 : o);
  const col = a => `rgba(${mr},${mg},${mb},${a})`;
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, gRad);
  grad.addColorStop(0, col(0));
  grad.addColorStop(clampOff(pos - halfW), col(0));
  grad.addColorStop(clampOff(pos), col(a0));
  grad.addColorStop(clampOff(pos + halfW), col(0));
  grad.addColorStop(1, col(0));
  ctx.globalAlpha = 1;
  ctx.fillStyle = grad;
  ctx.fill();
}

// A radial gradient (hex colour at its centre → transparent at the edge).
function drawRadialGradient(ctx, W, H, hex, diameter, density, opacity, posX, posY) {
  if (!(density > 0) || !(opacity > 0)) return;
  const minDim = Math.min(W, H);
  const gx = W / 2 + (posX / 100) * (W / 2);
  const gy = H / 2 + (posY / 100) * (H / 2);
  const gc = color(hex);
  const gr = Math.round(red(gc)), gg = Math.round(green(gc)), gb = Math.round(blue(gc));
  const gRad = Math.max(1, minDim * map(diameter, 0, 100, 0.1, 1.6));
  const a0 = map(density, 0, 100, 0.0, 1.0);
  const grad = ctx.createRadialGradient(gx, gy, 0, gx, gy, gRad);
  grad.addColorStop(0.0, `rgba(${gr},${gg},${gb},${a0})`);
  grad.addColorStop(map(density, 0, 100, 0.15, 0.7), `rgba(${gr},${gg},${gb},${a0 * 0.35})`);
  grad.addColorStop(1.0, `rgba(${gr},${gg},${gb},0)`);
  const prevAlpha = ctx.globalAlpha;
  ctx.globalAlpha = prevAlpha * (opacity / 100);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = prevAlpha;
}

function drawGradientB(ctx, W, H) {
  if (!(gradBDensity > 0)) return;
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  drawRadialGradient(ctx, W, H, gradBColor, gradBDiameter, gradBDensity, gradBOpacity, gradBPosX, gradBPosY);
}
