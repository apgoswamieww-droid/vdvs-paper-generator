// Screenshot the Super Admin App Configuration page in both states
// (Live / Maintenance ON) so the dark theme can be eyeballed.
// Run: npx tsx scratch/app-config-shot.ts
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import puppeteer, { type Browser } from "puppeteer-core";

const BASE = "http://localhost:3000";
const EMAIL = process.env.APP_CONFIG_EMAIL ?? "apgoswami.eww@gmail.com";
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
    defaultViewport: { width: 1440, height: 1000 },
  });
  try {
    const page = await browser.newPage();
    page.on("pageerror", (e: unknown) => console.log("[pageerror]", e instanceof Error ? e.message : String(e)));

    await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
    await page.type("#email", EMAIL);
    await page.type("#password", PASSWORD);
    await Promise.all([
      page.waitForFunction(() => location.pathname.startsWith("/dashboard"), { timeout: 30000 }),
      page.click('button[type="submit"]'),
    ]);
    console.log("PASS login");

    await page.goto(`${BASE}/dashboard/super-admin/app-config`, { waitUntil: "networkidle2" });
    await page.waitForFunction(() => document.body.innerText.includes("App Configuration"), {
      timeout: 20000,
    });
    await page.screenshot({ path: path.join(OUT, "app-config-live.png") });
    console.log("PASS shot 1 (live)");

    // Flip maintenance on to capture the amber banner + destructive badge.
    // Switch order on the page: android, ios, maintenance (last).
    const flipped = await page.evaluate(() => {
      const switches = [...document.querySelectorAll<HTMLElement>('[data-slot="switch"]')];
      const target = switches[switches.length - 1];
      if (!target) return false;
      target.click();
      return true;
    });
    if (!flipped) throw new Error("Maintenance switch not found");
    await page.waitForFunction(
      () => document.body.innerText.includes("Maintenance mode is ON"),
      { timeout: 10000 }
    );
    await page.screenshot({ path: path.join(OUT, "app-config-maintenance.png") });
    console.log("PASS shot 2 (maintenance on)");
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error("FAIL", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});