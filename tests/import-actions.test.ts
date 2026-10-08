import { beforeEach, describe, expect, it, vi } from "vitest";

// ============================================================
//  questions/import/actions.ts
//
//  The important behaviours are the ones the previous importer got
//  wrong: a partial import must SAVE the valid rows, Medium must
//  survive, and the same file must not import twice.
// ============================================================

const { prismaMock, requireSessionMock, revalidateMock } = vi.hoisted(() => ({
  prismaMock: {
    chapter: { findFirst: vi.fn() },
    topic: { findFirst: vi.fn() },
    question: { findUnique: vi.fn(), create: vi.fn() },
    questionImport: { findFirst: vi.fn(), create: vi.fn() },
    $transaction: vi.fn(),
  },
  requireSessionMock: vi.fn(),
  revalidateMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ default: prismaMock }));
vi.mock("@/lib/session", () => ({ requireSession: requireSessionMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidateMock }));

import {
  commitImport,
  parseImportFile,
  type ImportPreviewRow,
} from "@/app/(dashboard)/dashboard/questions/import/actions";
import { buildQuestionTemplateDocx } from "@/lib/docx-table-template";

const SESSION = { id: "usr_1", schoolId: "sch_1", role: "TEACHER", schoolSlug: "s" };

const TARGETS = { subjectId: "sub_1", chapterId: "ch_1", topicId: "tp_1" };

function row(over: Partial<ImportPreviewRow> = {}): ImportPreviewRow {
  return {
    index: 1,
    questionText: "What is 2x + 5?",
    questionType: "MCQ",
    medium: "ENGLISH",
    marks: 1,
    difficulty: "EASY",
    bloomLevel: "APPLY",
    previousYearTag: null,
    tags: [],
    answerKey: "B",
    explanation: null,
    options: [
      { label: "A", text: "11", isCorrect: false },
      { label: "B", text: "15", isCorrect: true },
    ],
    matchPairs: [],
    ...over,
  };
}

/** A .docx File the parser can read, built by the real template code. */
function docxFile(): File {
  const bytes = buildTemplateBytes();
  return new File([bytes as BlobPart], "template.docx", {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}

function buildTemplateBytes(): Uint8Array {
  return buildQuestionTemplateDocx(
    {
      schoolId: "sch_1",
      classLevelId: "cl_1",
      subjectId: "sub_1",
      chapterId: "ch_1",
      topicId: "tp_1",
    },
    {
      school: "Test School",
      classLevel: "Std 10",
      subject: "Mathematics",
      chapter: "Linear Equations",
      topic: null,
    },
    2
  );
}

/** Runs the mocked $transaction callback against a fake tx client. */
async function runTransaction<T>(impl: (tx: unknown) => Promise<T>): Promise<T> {
  const tx = {
    question: prismaMock.question,
    questionImport: prismaMock.questionImport,
  };
  prismaMock.$transaction.mockImplementation((fn: (t: unknown) => Promise<T>) => fn(tx));
  return impl(tx);
}

beforeEach(() => {
  vi.clearAllMocks();
  requireSessionMock.mockResolvedValue(SESSION);
  // Tenant scoping passes by default.
  prismaMock.chapter.findFirst.mockResolvedValue({ id: "ch_1" });
  prismaMock.topic.findFirst.mockResolvedValue({ id: "tp_1" });
  prismaMock.questionImport.findFirst.mockResolvedValue(null);
  prismaMock.question.findUnique.mockResolvedValue(null);
  // The action reads `audit.id` from the create result.
  prismaMock.question.create.mockResolvedValue({ id: "q_new" });
  prismaMock.questionImport.create.mockResolvedValue({ id: "imp_new" });
});

describe("parseImportFile", () => {
  it("rejects a file that is not .docx", async () => {
    const form = new FormData();
    form.append("file", new File(["x"], "notes.txt", { type: "text/plain" }));
    form.append("subjectId", "sub_1");
    form.append("chapterId", "ch_1");

    const result = await parseImportFile(form);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/\.docx/i);
  });

  it("rejects an empty file", async () => {
    const form = new FormData();
    form.append("file", new File([], "empty.docx"));
    form.append("subjectId", "sub_1");
    form.append("chapterId", "ch_1");

    expect((await parseImportFile(form)).error).toMatch(/choose a/i);
  });

  it("refuses a chapter outside the tenant", async () => {
    prismaMock.chapter.findFirst.mockResolvedValue(null);
    const form = new FormData();
    form.append("file", docxFile());
    form.append("subjectId", "sub_1");
    form.append("chapterId", "ch_other");

    const result = await parseImportFile(form);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not part of your school/i);
  });

  it("writes nothing while parsing", async () => {
    const form = new FormData();
    form.append("file", docxFile());
    form.append("subjectId", "sub_1");
    form.append("chapterId", "ch_1");
    form.append("topicId", "tp_1");

    const result = await parseImportFile(form);
    expect(result.ok).toBe(true);
    expect(prismaMock.question.create).not.toHaveBeenCalled();
    expect(prismaMock.questionImport.create).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("returns a content hash the commit step can echo back", async () => {
    const form = new FormData();
    form.append("file", docxFile());
    form.append("subjectId", "sub_1");
    form.append("chapterId", "ch_1");

    const result = await parseImportFile(form);
    expect(result.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("reports the blank boxes a fresh template ships with", async () => {
    const form = new FormData();
    form.append("file", docxFile());
    form.append("subjectId", "sub_1");
    form.append("chapterId", "ch_1");

    // Nothing was filled in — two blank boxes, no questions.
    const result = await parseImportFile(form);
    expect(result.rows).toEqual([]);
    expect(result.blankBoxes).toBe(2);
  });

  it("accepts a chapter with no topic selected", async () => {
    prismaMock.topic.findFirst.mockClear();
    const form = new FormData();
    form.append("file", docxFile());
    form.append("subjectId", "sub_1");
    form.append("chapterId", "ch_1");
    form.append("topicId", "");

    expect((await parseImportFile(form)).ok).toBe(true);
    expect(prismaMock.topic.findFirst).not.toHaveBeenCalled();
  });
});

describe("commitImport", () => {
  const base = {
    fileName: "template.docx",
    contentHash: "a".repeat(64),
    targets: TARGETS,
  };

  it("refuses a file that has already been imported", async () => {
    prismaMock.questionImport.findFirst.mockResolvedValue({
      id: "imp_1",
      successCount: 5,
      createdAt: new Date("2026-10-01T00:00:00Z"),
    });

    const result = await commitImport({ ...base, rows: [row()] });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/already imported/i);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("imports a valid MCQ with its options and answer key", async () => {
    await runTransaction(async () => {
      const result = await commitImport({ ...base, rows: [row()] });

      expect(result.ok).toBe(true);
      expect(result.imported).toBe(1);
      expect(result.failed).toBe(0);

      const created = prismaMock.question.create.mock.calls[0][0];
      expect(created.data.questionText).toBe("What is 2x + 5?");
      expect(created.data.code).toMatch(/^\d{6}$/);
      expect(created.data.schoolId).toBe("sch_1");
      expect(created.data.subjectId).toBe("sub_1");
      expect(created.data.chapterId).toBe("ch_1");
    });
  });

  it("lands questions as PENDING, unassigned and not AI-flagged", async () => {
    await runTransaction(async () => {
      await commitImport({ ...base, rows: [row()] });
      const created = prismaMock.question.create.mock.calls[0][0];
      expect(created.data.status).toBe("PENDING");
      expect(created.data.createdByAi).toBe(false);
      expect(created.data.assignedTeacherId).toBeNull();
    });
  });

  it("keeps the Medium read from the file", async () => {
    // The old importer hard-defaulted every question to ENGLISH, which
    // mis-tagged every Gujarati import.
    await runTransaction(async () => {
      await commitImport({ ...base, rows: [row({ medium: "GUJARATI" })] });
      expect(prismaMock.question.create.mock.calls[0][0].data.medium).toBe("GUJARATI");
    });
  });

  it("SAVES the valid rows when another row is invalid", async () => {
    // The whole point of dropping the single all-or-nothing transaction:
    // one bad row must not discard the rest of the file.
    await runTransaction(async () => {
      const result = await commitImport({
        ...base,
        rows: [
          row({ index: 1 }),
          row({ index: 2, marks: 0 }), // below the schema minimum of 0.5
          row({ index: 3 }),
        ],
      });

      expect(result.ok).toBe(true);
      expect(result.imported).toBe(2);
      expect(result.failed).toBe(1);
      expect(result.errors[0].index).toBe(2);
      expect(prismaMock.question.create).toHaveBeenCalledTimes(2);
    });
  });

  it("writes the audit row with PARTIAL status when some rows failed", async () => {
    await runTransaction(async () => {
      await commitImport({ ...base, rows: [row({ index: 1 }), row({ index: 2, marks: 0 })] });
      const audit = prismaMock.questionImport.create.mock.calls[0][0];
      expect(audit.data.status).toBe("PARTIAL");
      expect(audit.data.successCount).toBe(1);
      expect(audit.data.failedCount).toBe(1);
      expect(audit.data.contentHash).toBe(base.contentHash);
    });
  });

  it("writes COMPLETED when every row is valid", async () => {
    await runTransaction(async () => {
      await commitImport({ ...base, rows: [row({ index: 1 }), row({ index: 2 })] });
      expect(prismaMock.questionImport.create.mock.calls[0][0].data.status).toBe("COMPLETED");
    });
  });

  it("imports nothing when no row is valid, and says so", async () => {
    const result = await commitImport({ ...base, rows: [row({ marks: 0 })] });
    expect(result.ok).toBe(false);
    expect(result.imported).toBe(0);
    expect(result.error).toMatch(/none of the rows were valid/i);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("rejects an MCQ with no correct option", async () => {
    await runTransaction(async () => {
      const result = await commitImport({
        ...base,
        rows: [
          row({
            answerKey: "C",
            options: [
              { label: "A", text: "1", isCorrect: false },
              { label: "B", text: "2", isCorrect: false },
            ],
          }),
        ],
      });
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/none of the rows were valid/i);
    });
  });

  it("gives each question a distinct code", async () => {
    await runTransaction(async () => {
      await commitImport({
        ...base,
        rows: [row({ index: 1 }), row({ index: 2 }), row({ index: 3 })],
      });
      const codes = prismaMock.question.create.mock.calls.map((c) => c[0].data.code);
      expect(new Set(codes).size).toBe(codes.length);
    });
  });

  it("skips a code that is already used in the bank", async () => {
    // First draw collides, second is free — the clash must be discarded
    // rather than reused.
    prismaMock.question.findUnique
      .mockResolvedValueOnce({ id: "q_existing" })
      .mockResolvedValue(null);

    await runTransaction(async () => {
      await commitImport({ ...base, rows: [row()] });
      const attempted = prismaMock.question.findUnique.mock.calls.map((c) => c[0].where.code);
      const used = prismaMock.question.create.mock.calls[0][0].data.code;
      expect(attempted.length).toBeGreaterThan(1);
      expect(attempted).toContain(used);
      expect(attempted[attempted.length - 1]).toBe(used);
    });
  });

  it("fails the batch instead of looping when no code is free", async () => {
    // Every draw collides. Without a bounded retry this would spin
    // forever inside the transaction and hang the request.
    prismaMock.question.findUnique.mockResolvedValue({ id: "q_existing" });

    const result = await commitImport({ ...base, rows: [row({ index: 1 }), row({ index: 2 })] });

    expect(result.ok).toBe(false);
    expect(prismaMock.question.create).not.toHaveBeenCalled();
  });

  it("rejects a non-docx filename", async () => {
    const result = await commitImport({ ...base, fileName: "notes.pdf", rows: [row()] });
    expect(result.error).toMatch(/\.docx/i);
  });

  it("rejects an empty batch", async () => {
    const result = await commitImport({ ...base, rows: [] });
    expect(result.error).toMatch(/nothing to import/i);
  });

  it("refuses targets outside the tenant", async () => {
    prismaMock.chapter.findFirst.mockResolvedValue(null);
    const result = await commitImport({ ...base, rows: [row()] });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not part of your school/i);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("surfaces a database failure instead of reporting a silent success", async () => {
    prismaMock.$transaction.mockRejectedValue(new Error("connection reset"));
    const result = await commitImport({ ...base, rows: [row()] });
    expect(result.ok).toBe(false);
    expect(result.imported).toBe(0);
    expect(result.error).toMatch(/nothing was saved/i);
  });
});