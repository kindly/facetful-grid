// Performance, recorded rather than assumed (§15). Numbers are attached to the
// test and printed; the assertions are only loose sanity bounds.
import { test, expect } from "@playwright/test";
import { open } from "./helpers.js";

test.skip(({ browserName }) => browserName !== "chromium", "CPU throttling needs CDP");

async function measure(page, throttle) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: throttle });
  const r = await page.evaluate(async () => {
    const s = document.querySelector(".fg-scroller");
    const times = [];
    // per-frame paint: a synchronous scroll handler run on 30 columns × the pool
    for (let i = 0; i < 200; i++) {
      s.scrollTop += 7 * 25 + (i % 3);
      const t = performance.now();
      s.dispatchEvent(new Event("scroll"));
      times.push(performance.now() - t);
      if (i % 20 === 0) await new Promise(requestAnimationFrame);
    }
    times.sort((a, b) => a - b);
    // frames during a fast "scrollbar drag": a large jump every frame for 60 frames
    let frames = 0, slow = 0, last = performance.now();
    await new Promise((done) => {
      const step = () => {
        const now = performance.now();
        if (now - last > 20) slow++;
        last = now;
        s.scrollTop = (s.scrollHeight - s.clientHeight) * Math.random();
        if (++frames < 60) requestAnimationFrame(step); else done();
      };
      requestAnimationFrame(step);
    });
    return {
      pool: document.querySelectorAll(".fg-row").length,
      paintMedianMs: +times[100].toFixed(3), paintP95Ms: +times[190].toFixed(3), paintMaxMs: +times[199].toFixed(3),
      dragFrames: frames, dragSlowFrames: slow,
    };
  });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  return r;
}

test("first paint and per-frame paint time, 30 columns", async ({ page }, info) => {
  await open(page, { rows: 2000000, cols: 30 });
  const first = await page.evaluate(() => demo.firstPaint);
  const desktop = await measure(page, 1);
  const mobile = await measure(page, 4);
  const out = { createGridToPaintedMs: first, desktop, throttled4x: mobile };
  console.log(JSON.stringify(out, null, 1));
  await info.attach("perf.json", { body: JSON.stringify(out, null, 1), contentType: "application/json" });
  expect(first).toBeLessThan(200);
  expect(desktop.paintP95Ms).toBeLessThan(8);
});
