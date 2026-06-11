(function () {
  "use strict";

  // ---------------------------------------------------------------------------
  // TEST VERSION — vanilla-JS port of the pasted BoidsCanvas React component.
  // Behavior/constants/look kept faithful to that snippet so it can be judged
  // as-is. To restore the previous flocking: `git checkout boids.js`.
  // ---------------------------------------------------------------------------

  const canvas = document.getElementById("boids");
  const ctx = canvas.getContext("2d");

  const BOID_COUNT = 160;
  const SPEED = 1.4;
  const PERCEPTION = 80;
  const SEP_RADIUS = 28;
  const ALIGN_FORCE = 0.04;
  const COHESION_FORCE = 0.005;
  const SEP_FORCE = 0.06;
  const MAX_SPEED = 2.2;
  const MIN_SPEED = 0.8;

  // Anti-crowding: once a boid has more than MAX_CLUSTER neighbors within
  // PERCEPTION, it stops cohering and instead gets a steady outward push
  // (CROWD_FORCE) away from the local center, so dense knots break apart
  // instead of collapsing into a blob.
  const MAX_CLUSTER = 12;
  const CROWD_FORCE = 0.1;

  // Cursor interaction: boids flee the pointer within this radius.
  const MOUSE_RADIUS = 130;
  const MOUSE_FORCE = 1.2;

  function limit(vx, vy, max) {
    const mag = Math.sqrt(vx * vx + vy * vy);
    if (mag > max) return [(vx / mag) * max, (vy / mag) * max];
    return [vx, vy];
  }

  // Resolve the site's --accent color (indigo) so the boids match the theme.
  function hexToRgb(hex) {
    hex = (hex || "").replace("#", "").trim();
    if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
    const n = parseInt(hex, 16);
    if (isNaN(n)) return [59, 91, 219];
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const accentVar = getComputedStyle(document.documentElement)
    .getPropertyValue("--accent");
  const ACCENT = hexToRgb(accentVar || "#3b5bdb");
  const STROKE = "rgba(" + ACCENT[0] + "," + ACCENT[1] + "," + ACCENT[2] + ",0.6)";
  const FILL = "rgba(" + ACCENT[0] + "," + ACCENT[1] + "," + ACCENT[2] + ",0.85)";

  let boids = [];
  const mouse = { x: -9999, y: -9999, active: false };

  function resize() {
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
  }

  function init() {
    boids = Array.from({ length: BOID_COUNT }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * SPEED * 2,
      vy: (Math.random() - 0.5) * SPEED * 2,
    }));
  }

  function tick() {
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    for (let i = 0; i < boids.length; i++) {
      const b = boids[i];
      let avgVx = 0, avgVy = 0;
      let avgX = 0, avgY = 0;
      let sepX = 0, sepY = 0;
      let alignCount = 0, cohesionCount = 0, sepCount = 0;

      for (let j = 0; j < boids.length; j++) {
        if (i === j) continue;
        const other = boids[j];
        const dx = other.x - b.x;
        const dy = other.y - b.y;
        const d = Math.sqrt(dx * dx + dy * dy);

        if (d < PERCEPTION) {
          avgVx += other.vx;
          avgVy += other.vy;
          avgX += other.x;
          avgY += other.y;
          alignCount++;
          cohesionCount++;
        }

        if (d < SEP_RADIUS && d > 0) {
          sepX -= dx / d;
          sepY -= dy / d;
          sepCount++;
        }
      }

      let ax = 0, ay = 0;

      if (alignCount > 0) {
        ax += ((avgVx / alignCount) - b.vx) * ALIGN_FORCE;
        ay += ((avgVy / alignCount) - b.vy) * ALIGN_FORCE;
      }
      if (cohesionCount > 0) {
        const cx = avgX / cohesionCount;
        const cy = avgY / cohesionCount;
        if (cohesionCount > MAX_CLUSTER) {
          // Overcrowded: shove outward from the local center. Normalized so
          // the push stays strong even for boids deep inside the clump.
          const ox = b.x - cx;
          const oy = b.y - cy;
          const om = Math.sqrt(ox * ox + oy * oy) || 1;
          ax += (ox / om) * CROWD_FORCE;
          ay += (oy / om) * CROWD_FORCE;
        } else {
          // Normal cohesion: drift toward the local center.
          ax += (cx - b.x) * COHESION_FORCE;
          ay += (cy - b.y) * COHESION_FORCE;
        }
      }
      if (sepCount > 0) {
        ax += sepX * SEP_FORCE;
        ay += sepY * SEP_FORCE;
      }

      // Flee the cursor: stronger push the closer the boid is.
      if (mouse.active) {
        const mdx = b.x - mouse.x;
        const mdy = b.y - mouse.y;
        const md = Math.sqrt(mdx * mdx + mdy * mdy);
        if (md < MOUSE_RADIUS && md > 0) {
          const strength = (1 - md / MOUSE_RADIUS) * MOUSE_FORCE;
          ax += (mdx / md) * strength;
          ay += (mdy / md) * strength;
        }
      }

      b.vx += ax;
      b.vy += ay;
      [b.vx, b.vy] = limit(b.vx, b.vy, MAX_SPEED);

      const mag = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      if (mag < MIN_SPEED && mag > 0) {
        b.vx = (b.vx / mag) * MIN_SPEED;
        b.vy = (b.vy / mag) * MIN_SPEED;
      }

      b.x += b.vx;
      b.y += b.vy;

      if (b.x < 0) b.x += w;
      if (b.x > w) b.x -= w;
      if (b.y < 0) b.y += h;
      if (b.y > h) b.y -= h;
    }

    // Draw boids as small elongated shapes pointing in direction of travel
    for (const b of boids) {
      const angle = Math.atan2(b.vy, b.vx);
      const len = 6;
      const tailX = b.x - Math.cos(angle) * len;
      const tailY = b.y - Math.sin(angle) * len;

      ctx.beginPath();
      ctx.moveTo(b.x + Math.cos(angle) * 3, b.y + Math.sin(angle) * 3);
      ctx.lineTo(tailX, tailY);
      ctx.strokeStyle = STROKE;
      ctx.lineWidth = 1.4;
      ctx.lineCap = "round";
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(b.x, b.y, 1.5, 0, Math.PI * 2);
      ctx.fillStyle = FILL;
      ctx.fill();
    }

    requestAnimationFrame(tick);
  }

  window.addEventListener("resize", resize);
  window.addEventListener("mousemove", function (e) {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    mouse.active = true;
  });
  window.addEventListener("mouseout", function () {
    mouse.active = false;
  });

  resize();
  init();
  tick();
})();
