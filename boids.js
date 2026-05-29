(function () {
  "use strict";

  const canvas = document.getElementById("boids");
  const ctx = canvas.getContext("2d");

  // ---------------------------------------------------------------------------
  // TUNABLE BOIDS PARAMETERS
  // ---------------------------------------------------------------------------
  const CONFIG = {
    // Density: one boid per this many screen pixels. Higher = fewer boids.
    // Total count is also capped by MAX_BOIDS so big monitors stay smooth.
    DENSITY: 8000,
    MAX_BOIDS: 220,
    MIN_BOIDS: 30,

    MAX_SPEED: 2.2,        // max velocity (px/frame) — clamps how fast boids move
    MAX_FORCE: 0.04,       // max steering force per frame — lower = smoother turns

    // Perception radii (px): how far a boid "sees" for each rule
    SEP_RADIUS: 38,        // separation: avoid crowding neighbors this close
    ALIGN_RADIUS: 55,      // alignment: match heading of neighbors within this range
    COH_RADIUS: 55,        // cohesion: steer toward the center of these neighbors

    // Rule weights: relative influence of each behavior.
    // High separation + low cohesion keeps the flock loose (less clumping).
    SEP_WEIGHT: 2.2,
    ALIGN_WEIGHT: 1.0,
    COH_WEIGHT: 0.45,

    MOUSE_RADIUS: 90,      // boids steer away from cursor within this radius (px)
    MOUSE_WEIGHT: 2.2,     // strength of the flee-from-mouse force

    SIZE: 5,               // triangle length (px)
    OPACITY: 0.32,         // boid opacity — keep low so text stays readable

    // Cluster coloring: a boid's color blends from base -> accent as its
    // neighbor count (within COH_RADIUS) climbs toward CLUSTER_FULL.
    // Low value = even small groups show strong accent color.
    CLUSTER_FULL: 3,       // neighbor count at which a boid is fully accent-colored
  };
  // ---------------------------------------------------------------------------

  const prefersReducedMotion =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let width = 0, height = 0, dpr = 1;
  let boids = [];
  const mouse = { x: -9999, y: -9999, active: false };

  // Parse a CSS hex color (#rgb or #rrggbb) into [r, g, b]
  function hexToRgb(hex) {
    hex = hex.replace("#", "");
    if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
    const n = parseInt(hex, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  // --- Tiny 2D vector helper (kept inline to avoid any dependency) ---
  function limit(vx, vy, max) {
    const m2 = vx * vx + vy * vy;
    if (m2 > max * max) {
      const m = Math.sqrt(m2);
      return [(vx / m) * max, (vy / m) * max];
    }
    return [vx, vy];
  }

  function makeBoid() {
    const angle = Math.random() * Math.PI * 2;
    const speed = CONFIG.MAX_SPEED * (0.5 + Math.random() * 0.5);
    return {
      x: Math.random() * width,
      y: Math.random() * height,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
    };
  }

  function targetCount() {
    const n = Math.floor((width * height) / CONFIG.DENSITY);
    return Math.max(CONFIG.MIN_BOIDS, Math.min(CONFIG.MAX_BOIDS, n));
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Re-scale the flock to the new screen size
    const want = targetCount();
    if (boids.length === 0) {
      for (let i = 0; i < want; i++) boids.push(makeBoid());
    } else {
      while (boids.length < want) boids.push(makeBoid());
      while (boids.length > want) boids.pop();
    }
  }

  // Apply the three classic boids rules plus mouse avoidance
  function step(b) {
    let sepX = 0, sepY = 0, sepN = 0;
    let aliX = 0, aliY = 0, aliN = 0;
    let cohX = 0, cohY = 0, cohN = 0;

    for (let i = 0; i < boids.length; i++) {
      const o = boids[i];
      if (o === b) continue;
      const dx = b.x - o.x;
      const dy = b.y - o.y;
      const d2 = dx * dx + dy * dy;
      if (d2 === 0) continue;

      // Separation: steer away from boids that are too close
      if (d2 < CONFIG.SEP_RADIUS * CONFIG.SEP_RADIUS) {
        const d = Math.sqrt(d2);
        sepX += dx / d; sepY += dy / d; sepN++;
      }
      // Alignment: average the velocity of nearby boids
      if (d2 < CONFIG.ALIGN_RADIUS * CONFIG.ALIGN_RADIUS) {
        aliX += o.vx; aliY += o.vy; aliN++;
      }
      // Cohesion: move toward the average position of nearby boids
      if (d2 < CONFIG.COH_RADIUS * CONFIG.COH_RADIUS) {
        cohX += o.x; cohY += o.y; cohN++;
      }
    }

    let ax = 0, ay = 0;

    // Each rule produces a steering force = desired - current velocity, capped.
    if (sepN > 0) {
      let [dx, dy] = limit(sepX, sepY, CONFIG.MAX_SPEED);
      let [fx, fy] = limit(dx - b.vx, dy - b.vy, CONFIG.MAX_FORCE);
      ax += fx * CONFIG.SEP_WEIGHT; ay += fy * CONFIG.SEP_WEIGHT;
    }
    if (aliN > 0) {
      let [dx, dy] = limit(aliX / aliN, aliY / aliN, CONFIG.MAX_SPEED);
      let [fx, fy] = limit(dx - b.vx, dy - b.vy, CONFIG.MAX_FORCE);
      ax += fx * CONFIG.ALIGN_WEIGHT; ay += fy * CONFIG.ALIGN_WEIGHT;
    }
    if (cohN > 0) {
      const tx = cohX / cohN - b.x;
      const ty = cohY / cohN - b.y;
      let [dx, dy] = limit(tx, ty, CONFIG.MAX_SPEED);
      let [fx, fy] = limit(dx - b.vx, dy - b.vy, CONFIG.MAX_FORCE);
      ax += fx * CONFIG.COH_WEIGHT; ay += fy * CONFIG.COH_WEIGHT;
    }

    // Mouse avoidance: flee the cursor when it's within MOUSE_RADIUS
    if (mouse.active) {
      const dx = b.x - mouse.x;
      const dy = b.y - mouse.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < CONFIG.MOUSE_RADIUS * CONFIG.MOUSE_RADIUS && d2 > 0) {
        const d = Math.sqrt(d2);
        // Stronger push the closer the cursor is
        const strength = (1 - d / CONFIG.MOUSE_RADIUS) * CONFIG.MAX_SPEED;
        let [fx, fy] = limit((dx / d) * strength, (dy / d) * strength, CONFIG.MAX_FORCE * 4);
        ax += fx * CONFIG.MOUSE_WEIGHT; ay += fy * CONFIG.MOUSE_WEIGHT;
      }
    }

    // Integrate: apply acceleration, clamp speed, move
    b.vx += ax; b.vy += ay;
    [b.vx, b.vy] = limit(b.vx, b.vy, CONFIG.MAX_SPEED);
    b.x += b.vx; b.y += b.vy;

    // Wrap around screen edges
    if (b.x < 0) b.x += width; else if (b.x > width) b.x -= width;
    if (b.y < 0) b.y += height; else if (b.y > height) b.y -= height;

    // Remember how crowded this boid is, for cluster coloring in render()
    b.neighbors = cohN;
  }

  function drawBoid(b, base, accent) {
    // Blend base -> accent based on how clustered this boid is
    const t = Math.min((b.neighbors || 0) / CONFIG.CLUSTER_FULL, 1);
    const r = Math.round(base[0] + (accent[0] - base[0]) * t);
    const g = Math.round(base[1] + (accent[1] - base[1]) * t);
    const bl = Math.round(base[2] + (accent[2] - base[2]) * t);
    ctx.fillStyle = "rgb(" + r + "," + g + "," + bl + ")";

    const angle = Math.atan2(b.vy, b.vx);
    const s = CONFIG.SIZE;
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(angle);
    // Small triangle pointing in the direction of travel
    ctx.beginPath();
    ctx.moveTo(s, 0);
    ctx.lineTo(-s * 0.6, s * 0.5);
    ctx.lineTo(-s * 0.6, -s * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function render() {
    ctx.clearRect(0, 0, width, height);
    // Resolve theme colors at runtime: base = --text, cluster = --accent
    const styles = getComputedStyle(document.documentElement);
    const base = hexToRgb(styles.getPropertyValue("--text").trim() || "#000000");
    const accent = hexToRgb(styles.getPropertyValue("--accent").trim() || "#3b5bdb");
    ctx.globalAlpha = CONFIG.OPACITY;
    for (let i = 0; i < boids.length; i++) drawBoid(boids[i], base, accent);
    ctx.globalAlpha = 1;
  }

  function tick() {
    for (let i = 0; i < boids.length; i++) step(boids[i]);
    render();
    requestAnimationFrame(tick);
  }

  // --- Events ---
  window.addEventListener("resize", resize);
  window.addEventListener("mousemove", function (e) {
    mouse.x = e.clientX; mouse.y = e.clientY; mouse.active = true;
  });
  window.addEventListener("mouseout", function () { mouse.active = false; });

  // --- Boot ---
  resize();
  if (prefersReducedMotion) {
    // Reduced motion: draw a single static frame, no animation loop.
    render();
  } else {
    requestAnimationFrame(tick);
  }
})();
