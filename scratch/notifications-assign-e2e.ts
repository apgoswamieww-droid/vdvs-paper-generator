// Temporary live check for the assignment trigger:
//   seed an AI PENDING question -> assign it to a teacher from the
//   Question Bank UI -> assert the teacher's QUESTION_ASSIGNED
//   notification was created.
// Run: npx tsx scratch/notifications-assign-e2e.ts
import { existsSync } from "node:fs";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import prisma from "@/lib/prisma";

const BASE = "http://localhost:3000";
const EMAIL = "vidyadhish.edu@gmail.com";
const PASSWORD = "Admin@123";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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

async function waitForText(page: Page, text: string, timeout = 20000): Promise<void> {
  await page.waitForFunction(
    (needle: string) => document.body.innerText.includes(needle),
    { timeout },
    text
  );
}

/** Real mouse click on the first match, retried if the row re-renders. */
async function clickByText(
  page: Page,
  selector: string,
  text: string,
  attempts = 4
): Promise<void> {
  let lastError: unknown = new Error(`No <${selector}> containing "${text}"`);
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const handle = await page.evaluateHandle(
        (sel: string, needle: string) => {
          const elements = [...document.querySelectorAll(sel)];
          const target = elements.find((element) =>
            (element.textContent ?? "").trim().includes(needle)
          );
          return target instanceof HTMLElement ? target : null;
        },
        selector,
        text
      );
      const element = handle.asElement();
      if (!element) throw new Error(`No <${selector}> containing "${text}"`);
      const box = await element.boundingBox();
      await handle.dispose();
      if (!box) throw new Error(`<${selector}> containing "${text}" is not visible`);
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      return;
    } catch (error) {
      lastError = error;
      await sleep(400);
    }
  }
  throw lastError;
}

async function main() {
  const admin = await prisma.user.findFirst({
    where: { role: "SCHOOL_ADMIN", isActive: true, schoolId: { not: "" } },
    select: { id: true, schoolId: true },
  });
  if (!admin?.schoolId) throw new Error("No active SCHOOL_ADMIN found");
  const schoolId = admin.schoolId;

  const teacher = await prisma.user.findFirst({
    where: { role: "TEACHER", isActive: true, schoolId },
    select: { id: true, name: true },
  });
  if (!teacher) throw new Error("No active teacher found");

  // 1. An AI question waiting for a reviewer
  let question: { id: string; code: string } | null = await prisma.question.findFirst({
    where: { schoolId, createdByAi: true, status: "PENDING", assignedTeacherId: null },
    select: { id: true, code: true },
  });
  if (!question) {
    const subject = await prisma.subject.findFirst({
      where: { schoolId },
      select: { id: true },
    });
    if (!subject) throw new Error("No subject in this school");
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = String(700000 + Math.floor(Math.random() * 99999));
      try {
        question = await prisma.question.create({
          data: {
            code,
            questionText: "E2E: Which instrument measures atmospheric pressure?",
            questionType: "MCQ",
            marks: 1,
            tags: ["e2e"],
            options: [
              { label: "A", text: "Barometer", isCorrect: true },
              { label: "B", text: "Thermometer", isCorrect: false },
            ],
            status: "PENDING",
            createdByAi: true,
            schoolId,
            subjectId: subject.id,
          },
          select: { id: true, code: true },
        });
        break;
      } catch {
        question = null;
      }
    }
    if (!question) throw new Error("Could not seed a PENDING AI question");
    console.log("seeded question", question.code);
  } else {
    console.log("using existing question", question.code);
  }

  const before = await prisma.notification.count({
    where: { userId: teacher.id, type: "QUESTION_ASSIGNED" },
  });

  // 2. Assign it through the Question Bank UI
  const browser: Browser = await puppeteer.launch({
    executablePath: chromePath(),
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
    defaultViewport: { width: 1400, height: 900 },
  });

  try {
    const page = await browser.newPage();
    page.on("pageerror", (error) => console.log("[pageerror]", describeError(error)));

    await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
    await page.type("#email", EMAIL);
    await page.type("#password", PASSWORD);
    await Promise.all([
      page.waitForFunction(() => location.pathname.startsWith("/dashboard"), { timeout: 30000 }),
      page.click('button[type="submit"]'),
    ]);

    await page.goto(`${BASE}/dashboard/questions`, { waitUntil: "networkidle2" });
    await waitForText(page, "No questions loaded yet");
    await clickByText(page, "button", "Show all questions");
    await page.waitForSelector('button[aria-label="Assign to a teacher"]', { timeout: 30000 });
    console.log("PASS question listed with an assign button");

    await page.click('button[aria-label="Assign to a teacher"]');
    await waitForText(page, "Assign to a teacher");
    await clickByText(page, "button", "Select a teacher");
    await page.waitForSelector('[role="option"]', { timeout: 15000 });
    await clickByText(page, '[role="option"]', teacher.name ?? "teacher");
    await sleep(300);
    console.log("PASS teacher picked in the dialog");

    await clickByText(page, "button", "Assign");
    await waitForText(page, "Question assigned to teacher.", 30000);
    console.log("PASS assignment toast");
  } finally {
    await browser.close();
  }

  // 3. The teacher's notification
  await sleep(1500);
  const updated = await prisma.question.findUnique({
    where: { id: question.id },
    select: { assignedTeacherId: true },
  });
  console.log(
    updated?.assignedTeacherId === teacher.id
      ? "PASS question now assigned in the database"
      : `FAIL question not assigned (got ${updated?.assignedTeacherId})`
  );

  const after = await prisma.notification.count({
    where: { userId: teacher.id, type: "QUESTION_ASSIGNED" },
  });
  console.log(
    after > before
      ? `PASS teacher notification created (${before} -> ${after})`
      : `FAIL no notification created (${before} -> ${after})`
  );

  const latest = await prisma.notification.findFirst({
    where: { userId: teacher.id, type: "QUESTION_ASSIGNED" },
    orderBy: { createdAt: "desc" },
    select: { title: true, body: true, readAt: true },
  });
  console.log("latest:", JSON.stringify(latest));
}

main()
  .catch((error) => {
    console.error("FAILED", describeError(error));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
