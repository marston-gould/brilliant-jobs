// human-sim.ts — Human behavior simulation for anti-detection
// Injected into pages via chrome.scripting.executeScript({ files: [...] })
// Runs in page context. Mouse movement uses dispatchEvent — isTrusted is false
// but biometric systems analyze the PATTERN (bezier curves, variable acceleration),
// not the trust flag on mousemove. Scrolling pairs WheelEvent with scrollTo.

const HumanSim = (() => {

  function rand(min, max) {
    return Math.random() * (max - min) + min;
  }

  function randInt(min, max) {
    return Math.floor(rand(min, max + 1));
  }

  function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  // ============================================================
  // BEZIER CURVE PATHS
  // ============================================================

  function bezierPath(x1, y1, x2, y2, steps) {
    steps = steps || randInt(15, 35);
    const cx1 = x1 + (x2 - x1) * rand(0.2, 0.5) + rand(-80, 80);
    const cy1 = y1 + (y2 - y1) * rand(0.1, 0.4) + rand(-80, 80);
    const cx2 = x1 + (x2 - x1) * rand(0.5, 0.8) + rand(-60, 60);
    const cy2 = y1 + (y2 - y1) * rand(0.6, 0.9) + rand(-60, 60);

    const points = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const it = 1 - t;
      const x = it*it*it*x1 + 3*it*it*t*cx1 + 3*it*t*t*cx2 + t*t*t*x2;
      const y = it*it*it*y1 + 3*it*it*t*cy1 + 3*it*t*t*cy2 + t*t*t*y2;
      points.push({ x: Math.round(x), y: Math.round(y) });
    }
    return points;
  }

  // ============================================================
  // MOUSE MOVEMENT
  // ============================================================

  function dispatchMouse(type, x, y, el) {
    const target = el || document.elementFromPoint(x, y) || document.body;
    target.dispatchEvent(new MouseEvent(type, {
      bubbles: true, cancelable: true,
      clientX: x, clientY: y,
      screenX: x + window.screenX, screenY: y + window.screenY,
      view: window,
    }));
  }

  async function moveMouse(toX, toY, fromX, fromY) {
    const startX = fromX ?? rand(100, window.innerWidth - 100);
    const startY = fromY ?? rand(100, window.innerHeight - 100);
    const path = bezierPath(startX, startY, toX, toY);

    for (let i = 0; i < path.length; i++) {
      dispatchMouse('mousemove', path[i].x, path[i].y);
      const progress = i / path.length;
      // Natural acceleration: slow at start/end, fast in middle
      const delay = progress < 0.2 || progress > 0.8 ? rand(12, 25) : rand(4, 12);
      await sleep(8 + delay);
    }
    return { x: toX, y: toY };
  }

  async function idleWiggle(durationMs) {
    durationMs = durationMs || rand(500, 1500);
    const cx = rand(200, window.innerWidth - 200);
    const cy = rand(200, window.innerHeight - 200);
    const start = Date.now();
    while (Date.now() - start < durationMs) {
      dispatchMouse('mousemove', cx + rand(-15, 15), cy + rand(-15, 15));
      await sleep(rand(50, 200));
    }
  }

  async function randomGlance(lastPos) {
    const regions = [
      { x: [100, 400], y: [100, 300] },   // top-left (nav area)
      { x: [300, 800], y: [200, 500] },   // main content
      { x: [300, 700], y: [400, 700] },   // lower content
      { x: [600, 1000], y: [100, 400] },  // right sidebar
    ];
    const region = pick(regions);
    const pos = await moveMouse(
      rand(region.x[0], region.x[1]),
      rand(region.y[0], region.y[1]),
      lastPos?.x, lastPos?.y
    );
    await sleep(rand(200, 800));
    return pos;
  }

  // Move mouse to an element (for pre-click mousemove chain)
  async function moveToElement(selector, lastPos) {
    const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
    if (!el) return lastPos;
    const rect = el.getBoundingClientRect();
    const targetX = rect.left + rand(rect.width * 0.2, rect.width * 0.8);
    const targetY = rect.top + rand(rect.height * 0.2, rect.height * 0.8);
    return await moveMouse(targetX, targetY, lastPos?.x, lastPos?.y);
  }

  // ============================================================
  // SCROLLING (WheelEvent + scrollTo for realistic event chain)
  // ============================================================

  async function humanScroll(targetY, options = {}) {
    const { duration = rand(800, 2500), overshoot = Math.random() > 0.7 } = options;
    const startY = window.scrollY;
    const distance = targetY - startY;
    if (Math.abs(distance) < 10) return;

    const steps = Math.max(10, Math.floor(duration / 30));
    const pauseAt = Math.random() > 0.6 ? rand(0.3, 0.7) : null;
    const wheelX = rand(200, window.innerWidth - 200);
    const wheelY = rand(200, window.innerHeight - 200);

    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const ease = t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3) / 2;
      const newY = startY + distance * ease + rand(-2, 2);
      const wheelDelta = newY - window.scrollY;

      document.dispatchEvent(new WheelEvent('wheel', {
        bubbles: true, cancelable: true,
        deltaY: wheelDelta + rand(-3, 3),
        deltaMode: 0,
        clientX: wheelX + rand(-5, 5),
        clientY: wheelY + rand(-5, 5),
      }));

      window.scrollTo({ top: newY });

      if (pauseAt && Math.abs(t - pauseAt) < 0.05) {
        await sleep(rand(300, 1200));
      }
      await sleep(rand(15, 40));
    }

    if (overshoot && Math.abs(distance) > 200) {
      const amt = distance > 0 ? rand(30, 80) : rand(-80, -30);
      document.dispatchEvent(new WheelEvent('wheel', {
        bubbles: true, deltaY: amt, deltaMode: 0,
        clientX: wheelX, clientY: wheelY,
      }));
      window.scrollTo({ top: targetY + amt });
      await sleep(rand(100, 300));
      document.dispatchEvent(new WheelEvent('wheel', {
        bubbles: true, deltaY: -amt, deltaMode: 0,
        clientX: wheelX, clientY: wheelY,
      }));
      window.scrollTo({ top: targetY, behavior: 'smooth' });
      await sleep(rand(200, 400));
    }
  }

  async function scrollPage() {
    const scrollAmount = window.innerHeight * rand(0.6, 0.95);
    await humanScroll(window.scrollY + scrollAmount);
  }

  async function scrollToElement(selector) {
    const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    await humanScroll(window.scrollY + rect.top + rand(-100, 50));
    return true;
  }

  async function scrollCorrection() {
    if (window.scrollY > 200) {
      await humanScroll(window.scrollY + rand(-150, -40), { duration: rand(300, 700), overshoot: false });
    }
  }

  // ============================================================
  // BROWSING SIMULATION
  // ============================================================

  async function simulateBrowsing(durationSec) {
    durationSec = durationSec || rand(8, 20);
    const endTime = Date.now() + durationSec * 1000;
    let mousePos = { x: rand(200, 600), y: rand(200, 400) };

    while (Date.now() < endTime) {
      const action = Math.random();

      if (action < 0.35) {
        await scrollPage();
        await sleep(rand(500, 1500));
      } else if (action < 0.50) {
        await scrollCorrection();
        await sleep(rand(300, 800));
      } else if (action < 0.70) {
        mousePos = await randomGlance(mousePos);
        await sleep(rand(400, 1200));
      } else if (action < 0.85) {
        await idleWiggle(rand(500, 1500));
      } else {
        await sleep(rand(800, 3500));
      }
    }
  }

  return {
    rand, randInt, sleep, pick,
    bezierPath, moveMouse, idleWiggle, randomGlance, moveToElement, dispatchMouse,
    humanScroll, scrollPage, scrollToElement, scrollCorrection,
    simulateBrowsing,
  };
})();

if (typeof window !== 'undefined') {
  window.HumanSim = HumanSim;
}
