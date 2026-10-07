// Cross-module check: open the longest-labelled select on each page and
// confirm the popup is wide enough to show every option in full.
// Run: npx tsx scratch/select-sweep.ts
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import puppeteer, { type Browser, type Page } from "puppeteer-core";

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

/** Open the select whose popup ends up widest, then report clipping. */
async function auditWidest(page: Page, shot: string) {
  const triggers = await page.$$('[data-slot="select-trigger"]');
  let best = { idx: -1, widest: 0, clipped: 0, popupW: 0 };

  for (let i = 0; i < triggers.length; i++) {
    await page.keyboard.press("Escape").catch(() => {});
    await page.evaluate((n) => {
      document.querySelectorAll<HTMLElement>('[data-slot="select-trigger"]')[n]?.click();
    }, i);
    const opened = await page
      .waitForSelector('[data-slot="select-content"]', { timeout: 2500 })
      .catch(() => null);
    if (!opened) continue;

    const m = await page.evaluate(() => {
      const popup = document.querySelector<HTMLElement>('[data-slot="select-content"]');
      if (!popup) return null;
      const box = popup.getBoundingClientRect();
      let widest = 0;
      let clipped = 0;
      let offscreen = 0;
      for (const item of popup.querySelectorAll<HTMLElement>('[data-slot="select-item"]')) {
        const t = item.querySelector<HTMLElement>('[data-slot="select-item-text"]') ?? item;
        widest = Math.max(widest, t.scrollWidth);
        // Text wider than the popup's content box => visually cut off.
        if (t.getBoundingClientRect().right > box.right + 0.5) clipped++;
        // Popup itself must stay inside the viewport.
        if (box.right > window.innerWidth + 0.5 || box.left < -0.5) offscreen++;
      }
      return { popupW: Math.round(box.width), widest, clipped, offscreen };
    });
    if (m && m.widest > best.widest) best = { idx: i, ...m };
  }

  await page.keyboard.press("Escape").catch(() => {});
  console.log(
    `${shot.padEnd(34)} trigger#${best.idx} popup=${best.popupW}px widestOption=${best.widest}px clippedOptions=${best.clipped}`
  );
  return best;
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
    await page.setViewport({
      width: Number(process.env.SWEEP_WIDTH ?? 1280),
      height: 1000,
    });
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
    await page.type("#email", EMAIL);
    await page.type("#password", PASSWORD);
    await Promise.all([
      page.waitForFunction(() => location.pathname.startsWith("/dashboard"), { timeout: 30000 }),
      page.click('button[type="submit"]'),
    ]);
    console.log("PASS login");

    const pages: Array<[string, string]> = [
      ["/dashboard/questions", "questions (bank filters)"],
      ["/dashboard/questions/new", "questions/new (question form)"],
      ["/dashboard/papers", "papers (list filter)"],
      ["/dashboard/papers/new", "papers/new (builder)"],
      ["/dashboard/taxonomy", "taxonomy (curriculum)"],
      ["/dashboard/admin/users", "admin/users"],
      ["/dashboard/teacher/assignments/new", "teacher/assignments/new"],
    ];

    let totalClipped = 0;
    for (const [url, label] of pages) {
      await page.goto(`${BASE}${url}`, { waitUntil: "networkidle2" });
      await page
        .waitForSelector('[data-slot="select-trigger"]', { timeout: 20000 })
        .catch(() => null);
      if (!(await page.$('[data-slot="select-trigger"]'))) {
        console.log(`${label.padEnd(34)} (no selects)`);
        continue;
      }
      await new Promise((r) => setTimeout(r, 500));
      const r = await auditWidest(page, label);
      totalClipped += r.clipped;
      await page.screenshot({
        path: path.join(OUT, `sweep-${label.replace(/[^a-z0-9]+/gi, "-")}.png`),
      });
    }
    console.log(`\nTOTAL CLIPPED OPTIONS ACROSS ALL MODULES: ${totalClipped}`);
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error("FAIL", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});