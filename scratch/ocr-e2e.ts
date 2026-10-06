// Live check for the OCR flow in the editor:
//   login -> new question -> OCR toolbar button -> upload image ->
//   "Extract text" -> text inserted. Also reports the upload size.
// Run: npx tsx scratch/ocr-e2e.ts
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import puppeteer, { type Browser, type Page } from "puppeteer-core";

const BASE = "http://localhost:3000";
const EMAIL = "vidyadhish.edu@gmail.com";
const PASSWORD = "Admin@123";
const IMAGE = path.resolve(process.env.OCR_IMAGE ?? "scratch/ocr-test.png");

function chromePath(): string {
  const candidates = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) throw new Error("No Chrome/Chromium executable found.");
  return found;
}

function waitForText(page: Page, text: string, timeout = 20000): Promise<void> {
  return page.waitForFunction(
    (needle: string) => document.body.innerText.includes(needle),
    { timeout },
    text
  );
}

async function main() {
  const browser: Browser = await puppeteer.launch({
    executablePath: chromePath(),
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--window-size=1280,900"],
    defaultViewport: { width: 1280, height: 900 },
  });

  let uploadBytes = 0;
  try {
    const page = await browser.newPage();
    page.on("pageerror", (error) => console.log("[pageerror]", error.message));
    page.on("request", (request) => {
      if (request.url().endsWith("/api/ocr") && request.method() === "POST") {
        uploadBytes = Buffer.byteLength(request.postData() ?? "", "utf8");
      }
    });

    // 1. Sign in
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
    await page.type("#email", EMAIL);
    await page.type("#password", PASSWORD);
    await Promise.all([
      page.waitForFunction(() => location.pathname.startsWith("/dashboard"), {
        timeout: 30000,
      }),
      page.click('button[type="submit"]'),
    ]);
    console.log("PASS login");

    // 2. Open the OCR dialog from an editor toolbar
    await page.goto(`${BASE}/dashboard/questions/new`, {
      waitUntil: "networkidle2",
    });
    const opened = await page.evaluate(() => {
      const button = [...document.querySelectorAll("button")].find(
        (candidate) =>
          (candidate.getAttribute("title") ?? "").includes("Insert text from an image") &&
          candidate.offsetParent !== null
      );
      if (!button) return false;
      button.click();
      return true;
    });
    if (!opened) throw new Error("No visible OCR toolbar button");
    await waitForText(page, "Insert from image (OCR)");
    console.log("PASS OCR dialog opened");

    // 3. Upload the test image through the hidden file input
    const fileInputs = await page.$$('input[type="file"]');
    if (!fileInputs.length) throw new Error("No file input in the dialog");
    await fileInputs[fileInputs.length - 1].uploadFile(IMAGE);
    await page.waitForFunction(
      () => [...document.images].some((img) => img.alt === "Original image"),
      { timeout: 10000 }
    );
    console.log("PASS image preview rendered");

    // 4. Extract
    await page.evaluate(() => {
      const button = [...document.querySelectorAll("button")].find(
        (candidate) => candidate.textContent?.trim() === "Extract text"
      );
      button?.click();
    });
    await waitForText(page, "Text extracted and inserted", 60000);
    console.log("PASS text extracted and inserted");

    const extracted = await page.evaluate(() => {
      const block = [...document.querySelectorAll("div")].find(
        (div) => div.textContent?.trim() === "Extracted text"
      );
      return block?.parentElement?.textContent ?? "";
    });
    const rawSize = statSync(IMAGE).size;
    console.log(
      `PASS extracted="${extracted.slice(0, 120)}" | upload ${uploadBytes}B vs raw ${rawSize}B`
    );
  } catch (error) {
    console.log("FAIL", error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
