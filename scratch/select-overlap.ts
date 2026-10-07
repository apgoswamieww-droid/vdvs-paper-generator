// Does a long selected value make the trigger overflow its grid cell and
// collide with the neighbouring select?
// Run: npx tsx scratch/select-overlap.ts
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import puppeteer, { type Browser } from "puppeteer-core";

const BASE = "http://localhost:3000";
const EMAIL = process.env.APP_CONFIG_EMAIL ?? "vidyadhish.edu@gmail.com";
const PASSWORD = process.env.APP_CONFIG_PASSWORD ?? "Admin@123";
const OUT = path.resolve("scratch/shots");

function chromePath(): string {
  const candidates = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
  ];
  const found = candidates.find((c) => existsSync(c));
  if (!found) throw new Error("No Chrome/Chromium executable found.");
  return found;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser: Browser = await puppeteer.launch({
    executablePath: chromePath(),
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 1000 });
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
    await page.type("#email", EMAIL);
    await page.type("#password", PASSWORD);
    await Promise.all([
      page.waitForFunction(() => location.pathname.startsWith("/dashboard"), { timeout: 30000 }),
      page.click('button[type="submit"]'),
    ]);

    await page.goto(`${BASE}/dashboard/papers/new`, { waitUntil: "networkidle2" });
    await page.waitForSelector('[data-slot="select-trigger"]', { timeout: 30000 });

    // Report the filter-row geometry BEFORE anything is selected.
    const before = await page.evaluate(() => {
      const row = [...document.querySelectorAll<HTMLElement>(
        '[data-slot="select-trigger"]'
      )].slice(1, 5);
      return row.map((t) => {
        const r = t.getBoundingClientRect();
        return {
          shown: (t.textContent ?? "").trim().slice(0, 24),
          left: Math.round(r.left),
          right: Math.round(r.right),
          w: Math.round(r.width),
          cellW: Math.round(t.parentElement?.getBoundingClientRect().width ?? 0),
          overflow: Math.round(r.width - (t.parentElement?.getBoundingClientRect().width ?? 0)),
        };
      });
    });
    console.log("BEFORE:", JSON.stringify(before, null, 1));

    // Select the longest Subject option via the keyboard (base-ui items need a
    // real pointer sequence; a synthetic .click() is swallowed).
    await page.evaluate(() => {
      document.querySelectorAll<HTMLElement>('[data-slot="select-trigger"]')[2]?.click();
    });
    await page.waitForSelector('[data-slot="select-content"]', { timeout: 10000 });
    const target = await page.evaluate(() => {
      const items = [
        ...document.querySelectorAll<HTMLElement>('[data-slot="select-item"]'),
      ];
      let best = 0;
      let bestW = 0;
      items.forEach((i, idx) => {
        if (i.scrollWidth > bestW) {
          bestW = i.scrollWidth;
          best = idx;
        }
      });
      return best;
    });
    for (let i = 0; i <= target; i++) await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await new Promise((r) => setTimeout(r, 600));
    console.log("selected item index:", target);

    const after = await page.evaluate(() => {
      const row = [...document.querySelectorAll<HTMLElement>(
        '[data-slot="select-trigger"]'
      )].slice(1, 5);
      return row.map((t) => {
        const r = t.getBoundingClientRect();
        const cell = t.parentElement?.getBoundingClientRect();
        return {
          shown: (t.textContent ?? "").trim().slice(0, 30),
          left: Math.round(r.left),
          right: Math.round(r.right),
          w: Math.round(r.width),
          cellW: Math.round(cell?.width ?? 0),
          overflowPx: Math.round(r.width - (cell?.width ?? 0)),
        };
      });
    });
    console.log("AFTER:", JSON.stringify(after, null, 1));

    // Overlap between adjacent trigger boxes?
    let overlaps = 0;
    for (let i = 1; i < after.length; i++) {
      if (after[i].left < after[i - 1].right) overlaps++;
    }
    console.log(`adjacent-trigger overlaps: ${overlaps}`);

    // Scroll the builder filter row into view before capturing.
    await page.evaluate(() => {
      document.querySelectorAll<HTMLElement>('[data-slot="select-trigger"]')[2]?.scrollIntoView({
        block: "center",
      });
    });
    await new Promise((r) => setTimeout(r, 300));
    await page.screenshot({ path: path.join(OUT, "sel-e-after-select.png") });

    // Tight-row check: Question Bank uses `min-w-32` triggers in a flex-wrap row.
    await page.goto(`${BASE}/dashboard/questions`, { waitUntil: "networkidle2" });
    await page.waitForSelector('[data-slot="select-trigger"]', { timeout: 20000 });
    // Pick a subject (index 2) and select the longest option by keyboard.
    await page.evaluate(() => {
      document.querySelectorAll<HTMLElement>('[data-slot="select-trigger"]')[2]?.click();
    });
    const opened = await page
      .waitForSelector('[data-slot="select-content"]', { timeout: 5000 })
      .catch(() => null);
    if (opened) {
      const n = await page.evaluate(
        () => document.querySelectorAll('[data-slot="select-item"]').length
      );
      for (let i = 0; i < n; i++) await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Enter");
      await new Promise((r) => setTimeout(r, 500));
    }
    const row = await page.evaluate(() => {
      const ts = [
        ...document.querySelectorAll<HTMLElement>('[data-slot="select-trigger"]'),
      ];
      const boxes = ts.map((t) => {
        const r = t.getBoundingClientRect();
        return {
          shown: (t.textContent ?? "").trim().slice(0, 34),
          top: Math.round(r.top),
          left: Math.round(r.left),
          right: Math.round(r.right),
          w: Math.round(r.width),
          scrollW: t.scrollWidth,
          clientW: t.clientWidth,
          spills: t.scrollWidth > t.clientWidth + 1,
        };
      });
      let overlaps = 0;
      // Only compare triggers sharing a visual row (flex-wrap moves some down).
      for (let i = 1; i < boxes.length; i++) {
        const sameRow = Math.abs(boxes[i].top - boxes[i - 1].top) < 4;
        if (sameRow && boxes[i].left < boxes[i - 1].right) overlaps++;
      }
      return { boxes, overlaps };
    });
    console.log("QB row:", JSON.stringify(row, null, 1));
    await page.screenshot({ path: path.join(OUT, "sel-f-qb-after-select.png") });
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error("FAIL", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});