// Reproduce the Select clipping / overflow complaints across modules.
// Run: npx tsx scratch/select-repro.ts
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

async function audit(page: Page): Promise<
  Array<{ trigger: string; shown: string; clipped: boolean; popupW: number; widest: number; cutItems: number }>
> {
  return page.evaluate(() => {
    const popup = document.querySelector<HTMLElement>('[data-slot="select-content"]');
    const out: Array<{
      trigger: string;
      shown: string;
      clipped: boolean;
      popupW: number;
      widest: number;
      cutItems: number;
    }> = [];

    const triggers = [...document.querySelectorAll<HTMLElement>('[data-slot="select-trigger"]')];
    for (const t of triggers) {
      const value = t.querySelector<HTMLElement>('[data-slot="select-value"]');
      // Does the trigger paint outside its own box (i.e. collide with a sibling)?
      const painted = Math.max(
        t.scrollWidth,
        value ? value.scrollWidth : 0
      );
      out.push({
        trigger: (t.textContent ?? "").trim().slice(0, 28),
        shown: (value?.textContent ?? "").trim().slice(0, 40),
        clipped: painted > t.clientWidth + 1,
        popupW: 0,
        widest: 0,
        cutItems: 0,
      });
    }

    if (popup) {
      const popupW = Math.round(popup.getBoundingClientRect().width);
      let widest = 0;
      let cutItems = 0;
      for (const item of popup.querySelectorAll<HTMLElement>('[data-slot="select-item"]')) {
        const text =
          item.querySelector<HTMLElement>('[data-slot="select-item-text"]') ?? item;
        widest = Math.max(widest, text.scrollWidth);
        // Item text wider than the popup box => visually cut off.
        if (text.scrollWidth > popup.clientWidth - 8) cutItems++;
      }
      const idx = triggers.findIndex((t) =>
        document.querySelector('[data-slot="select-content"]')?.closest("[data-side]")?.contains(t)
      );
      const target = idx >= 0 ? idx : triggers.length - 1;
      if (out[target]) {
        out[target].popupW = popupW;
        out[target].widest = widest;
        out[target].cutItems = cutItems;
      }
    }
    return out;
  });
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
    console.log("PASS login");

    // ---------- A. Question Bank filters (min-w-32 triggers) ----------
    await page.goto(`${BASE}/dashboard/questions`, { waitUntil: "networkidle2" });
    await page.waitForSelector('[data-slot="select-trigger"]', { timeout: 20000 });
    await page.screenshot({ path: path.join(OUT, "sel-a-questions-closed.png") });
    console.log("A questions closed:", JSON.stringify(await audit(page), null, 0));

    await page.click('[data-slot="select-trigger"]');
    await page.waitForSelector('[data-slot="select-content"]', { timeout: 10000 });
    await page.screenshot({ path: path.join(OUT, "sel-b-questions-open.png") });
    console.log("A questions open:", JSON.stringify(await audit(page), null, 0));
    await page.keyboard.press("Escape");

    // ---------- B. Paper builder question filters (bare triggers) ----------
    await page.goto(`${BASE}/dashboard/papers/new`, { waitUntil: "networkidle2" });
    await page.waitForSelector('[data-slot="select-trigger"]', { timeout: 30000 });
    await page.screenshot({ path: path.join(OUT, "sel-c-builder-closed.png") });
    console.log("B builder closed:", JSON.stringify(await audit(page), null, 0));

    await page.evaluate(() => {
      document.querySelectorAll<HTMLElement>('[data-slot="select-trigger"]')[2]?.click();
    });
    await page.waitForSelector('[data-slot="select-content"]', { timeout: 10000 });
    await page.screenshot({ path: path.join(OUT, "sel-d-builder-open.png") });
    console.log("B builder open:", JSON.stringify(await audit(page), null, 0));
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error("FAIL", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});