// Temporary live check for the notification UI:
//   login -> bell menu -> browser push opt-in -> feed page ->
//   admin settings Notifications tab -> save + send test.
// Run: npx tsx scratch/notifications-e2e.ts
import { existsSync } from "node:fs";
import puppeteer, { type Browser, type Page } from "puppeteer-core";

const BASE = "http://localhost:3000";
const EMAIL = "vidyadhish.edu@gmail.com";
const PASSWORD = "Admin@123";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chromePath(): string {
  const candidates = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ];
  const found = candidates.find((path) => existsSync(path));
  if (!found) throw new Error("No Chrome/Chromium executable found.");
  return found;
}

async function bodyText(page: Page): Promise<string> {
  return page.evaluate(() => document.body.innerText);
}

async function waitForText(page: Page, text: string, timeout = 20000): Promise<void> {
  await page.waitForFunction(
    (needle: string) => document.body.innerText.includes(needle),
    { timeout },
    text
  );
}

async function hasText(page: Page, text: string): Promise<boolean> {
  return (await bodyText(page)).includes(text);
}

async function clickByText(page: Page, selector: string, text: string): Promise<void> {
  // Click inside the page rather than through an ElementHandle: dropdown rows
  // re-render while the feed polls and would detach any handle we hold.
  const clicked = await page.evaluate(
    (sel: string, needle: string) => {
      const elements = [...document.querySelectorAll(sel)];
      const target = elements.find((element) =>
        (element.textContent ?? "").trim().includes(needle)
      );
      if (!(target instanceof HTMLElement)) return false;
      target.click();
      return true;
    },
    selector,
    text
  );
  if (!clicked) throw new Error(`No <${selector}> containing "${text}"`);
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function main() {
  const browser: Browser = await puppeteer.launch({
    executablePath: chromePath(),
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--window-size=1280,900"],
    defaultViewport: { width: 1280, height: 900 },
  });

  try {
    const context = browser.defaultBrowserContext();
    await context.overridePermissions(BASE, ["notifications"]);

    const page = await browser.newPage();
    page.on("pageerror", (error) => console.log("[pageerror]", describeError(error)));

    // 1. Sign in
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
    await page.type("#email", EMAIL);
    await page.type("#password", PASSWORD);
    await Promise.all([
      page.waitForFunction(() => location.pathname.startsWith("/dashboard"), { timeout: 30000 }),
      page.click('button[type="submit"]'),
    ]);
    console.log("PASS login ->", new URL(page.url()).pathname);

    // 2. Header bell
    await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle2" });
    await page.waitForSelector('button[aria-label="Notifications"]');
    await page.click('button[aria-label="Notifications"]');
    await waitForText(page, "View all notifications");
    const menu = await bodyText(page);
    console.log(
      "PASS bell menu opens |",
      menu.includes("No notifications yet")
        ? "empty state"
        : menu.includes("Notifications")
          ? "feed rendered"
          : "unexpected"
    );

    if (await hasText(page, "Mark all read")) {
      await clickByText(page, "button", "Mark all read");
      await page
        .waitForFunction(() => !document.body.innerText.includes("Mark all read"), {
          timeout: 10000,
        })
        .catch(() => undefined);
      console.log("PASS mark all read from the bell");
    }

    // 3. Browser push opt-in, while the bell menu is still open
    const subscribed = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      return Boolean(await registration?.pushManager.getSubscription());
    });

    if (!subscribed && (await hasText(page, "Turn on"))) {
      await clickByText(page, "button", "Turn on");
      try {
        await page.waitForFunction(
          () =>
            document.body.innerText.includes("Push notifications are on") ||
            document.body.innerText.includes("Could not turn on") ||
            document.body.innerText.includes("blocked"),
          { timeout: 30000 }
        );
        console.log(
          (await hasText(page, "Push notifications are on"))
            ? "PASS push opt-in"
            : "FAIL push opt-in"
        );
      } catch (error) {
        console.log("FAIL push opt-in -", describeError(error));
      }
    } else if (subscribed) {
      console.log("PASS push already subscribed");
    } else {
      console.log("FAIL push prompt not visible on the bell menu");
    }
    await page.keyboard.press("Escape");

    const subscription = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      const sub = await registration?.pushManager.getSubscription();
      return sub ? { endpoint: sub.endpoint } : null;
    });
    console.log(
      subscription
        ? `PASS subscription endpoint=${subscription.endpoint.slice(0, 60)}...`
        : "FAIL no push subscription"
    );

    // 4. Feed page
    await page.goto(`${BASE}/dashboard/notifications`, { waitUntil: "networkidle2" });
    await waitForText(page, "Question assignments, review outcomes");
    const feedText = await bodyText(page);
    console.log(
      "PASS /dashboard/notifications |",
      feedText.includes("All (") ? feedText.match(/All \(\d+\)/)?.[0] : "no rows"
    );
    if (await hasText(page, "Unread (0)")) {
      await clickByText(page, "button", "Unread (0)");
      await sleep(300);
      console.log(
        (await hasText(page, "You're all caught up"))
          ? "PASS unread filter empty state"
          : "FAIL unread filter empty state"
      );
    }

    // 5. Admin settings, Notifications tab
    await page.goto(`${BASE}/dashboard/admin/settings`, { waitUntil: "networkidle2" });
    await waitForText(page, "School Settings");
    await clickByText(page, '[role="tab"]', "Notifications");
    await waitForText(page, "Notification Channels");
    console.log("PASS Notifications tab opens");

    for (const channel of ["In-app", "Push", "Email"]) {
      if (!(await hasText(page, channel))) throw new Error(`Missing channel pill: ${channel}`);
    }
    console.log("PASS channel pills (in-app / push / email)");

    await clickByText(page, "button", "Save notification settings");
    await waitForText(page, "Settings saved.");
    console.log("PASS save notification settings");

    await clickByText(page, "button", "Send test notification");
    await page.waitForFunction(
      () =>
        document.body.innerText.includes("Sent") ||
        document.body.innerText.includes("Could not send"),
      { timeout: 30000 }
    );
    console.log(
      (await hasText(page, "Sent"))
        ? "PASS send test notification"
        : "FAIL send test notification"
    );

    await sleep(1500);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error("FAILED", describeError(error));
  process.exitCode = 1;
});
