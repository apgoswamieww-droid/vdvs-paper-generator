// ============================================================
//  Notification triggers — the server actions that must notify
//  somebody. Database and notification delivery are mocked, so
//  these tests assert the wiring (who gets told what, and that
//  a failed notification never fails the business action).
// ============================================================

import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, notifyMock, notifyManyMock, requireSessionMock, resolveScopeMock } = vi.hoisted(
  () => ({
    prismaMock: {
      question: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      user: { findMany: vi.fn(), findFirst: vi.fn() },
    },
    notifyMock: vi.fn(async () => ({ created: true })),
    notifyManyMock: vi.fn(async (inputs: unknown[]) => {
      void inputs;
      return [] as unknown[];
    }),
    requireSessionMock: vi.fn(),
    resolveScopeMock: vi.fn(async () => ({ schoolId: "school-1", role: "SCHOOL_ADMIN" })),
  })
);

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ default: prismaMock }));
vi.mock("@/lib/notifications", () => ({
  notify: notifyMock,
  notifyMany: notifyManyMock,
}));
vi.mock("@/lib/session", () => ({
  requireSession: requireSessionMock,
  getSession: vi.fn(async () => null),
}));
vi.mock("@/app/(dashboard)/dashboard/admin/scope", () => ({
  resolveAdminScope: resolveScopeMock,
}));

import { assignQuestionTeacher } from "@/app/(dashboard)/dashboard/questions/actions";
import { reviewQuestion } from "@/app/(dashboard)/dashboard/teacher/questions/review/actions";

const TEACHER_SESSION = {
  id: "teacher-1",
  name: "Shiv Sir",
  role: "TEACHER",
  schoolId: "school-1",
};

beforeEach(() => {
  vi.clearAllMocks();
  requireSessionMock.mockResolvedValue(TEACHER_SESSION);
  resolveScopeMock.mockResolvedValue({ schoolId: "school-1", role: "SCHOOL_ADMIN" });
  notifyMock.mockResolvedValue({ created: true });
  notifyManyMock.mockResolvedValue([]);
});

describe("assignQuestionTeacher", () => {
  it("notifies the teacher it was routed to", async () => {
    prismaMock.question.findFirst.mockResolvedValue({ id: "q1" });
    prismaMock.user.findFirst.mockResolvedValue({ id: "teacher-9" });
    prismaMock.question.updateMany.mockResolvedValue({ count: 1 });

    const result = await assignQuestionTeacher("q1", "teacher-9");

    expect(result).toEqual(
      expect.objectContaining({ success: true, message: "Question assigned to teacher." })
    );
    expect(notifyMock).toHaveBeenCalledTimes(1);
    expect(notifyMock).toHaveBeenCalledWith({
      userId: "teacher-9",
      schoolId: "school-1",
      type: "QUESTION_ASSIGNED",
      title: "A question was assigned to you for review",
      body: expect.stringContaining("review queue"),
      data: {
        url: "/dashboard/teacher/questions/review",
        questionIds: ["q1"],
      },
    });
  });

  it("tells nobody when the question is unassigned", async () => {
    prismaMock.question.findFirst.mockResolvedValue({ id: "q1" });
    prismaMock.question.updateMany.mockResolvedValue({ count: 1 });

    const result = await assignQuestionTeacher("q1", null);

    expect(result).toEqual(
      expect.objectContaining({ success: true, message: "Question unassigned." })
    );
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it("rejects a question from another school", async () => {
    prismaMock.question.findFirst.mockResolvedValue(null);

    const result = await assignQuestionTeacher("q1", "teacher-9");

    expect(result.success).toBe(false);
    expect(prismaMock.question.updateMany).not.toHaveBeenCalled();
    expect(notifyMock).not.toHaveBeenCalled();
  });
});

describe("reviewQuestion", () => {
  const pendingQuestion = {
    id: "q1",
    questionType: "MCQ",
    options: null,
    questionText:
      "Which mirror is used as a rear-view mirror in vehicles? ".repeat(3).slice(0, 200),
  };

  it("tells every active admin when a teacher approves", async () => {
    prismaMock.question.findFirst.mockResolvedValue(pendingQuestion);
    prismaMock.question.update.mockResolvedValue({});
    prismaMock.user.findMany.mockResolvedValue([{ id: "admin-1" }, { id: "admin-2" }]);

    const result = await reviewQuestion({ id: "q1", action: "approve" });

    expect(result.success).toBe(true);
    expect(prismaMock.question.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "q1" },
        data: expect.objectContaining({ status: "APPROVED" }),
      })
    );
    expect(notifyManyMock).toHaveBeenCalledTimes(1);

    const inputs = notifyManyMock.mock.calls[0][0] as Record<string, unknown>[];
    expect(inputs).toHaveLength(2);
    expect(inputs[0]).toMatchObject({
      userId: "admin-1",
      schoolId: "school-1",
      type: "QUESTION_REVIEWED",
      title: "A teacher approved an AI question",
      data: { url: "/dashboard/questions", questionIds: ["q1"] },
    });
    expect(inputs[1]).toMatchObject({ userId: "admin-2", type: "QUESTION_REVIEWED" });
    expect(String(inputs[0].body)).toContain("Shiv Sir");
  });

  it("says rejected in the admin's notice", async () => {
    prismaMock.question.findFirst.mockResolvedValue(pendingQuestion);
    prismaMock.question.update.mockResolvedValue({});
    prismaMock.user.findMany.mockResolvedValue([{ id: "admin-1" }]);

    const result = await reviewQuestion({ id: "q1", action: "reject" });

    expect(result.success).toBe(true);
    const inputs = notifyManyMock.mock.calls[0][0] as Record<string, unknown>[];
    expect(inputs[0].title).toBe("A teacher rejected an AI question");
  });

  it("skips the notification when the school has no admins", async () => {
    prismaMock.question.findFirst.mockResolvedValue(pendingQuestion);
    prismaMock.question.update.mockResolvedValue({});
    prismaMock.user.findMany.mockResolvedValue([]);

    await reviewQuestion({ id: "q1", action: "approve" });

    expect(notifyManyMock).not.toHaveBeenCalled();
  });

  it("refuses non-teacher sessions without notifying anyone", async () => {
    requireSessionMock.mockResolvedValue({
      id: "admin-1",
      role: "SCHOOL_ADMIN",
      schoolId: "school-1",
    });

    const result = await reviewQuestion({ id: "q1", action: "approve" });

    expect(result).toEqual({ success: false, error: "Only teachers can review questions." });
    expect(prismaMock.question.update).not.toHaveBeenCalled();
    expect(notifyManyMock).not.toHaveBeenCalled();
  });

  it("keeps the review working when notifications blow up", async () => {
    prismaMock.question.findFirst.mockResolvedValue(pendingQuestion);
    prismaMock.question.update.mockResolvedValue({});
    prismaMock.user.findMany.mockResolvedValue([{ id: "admin-1" }]);
    notifyManyMock.mockRejectedValue(new Error("push service down"));

    const result = await reviewQuestion({ id: "q1", action: "approve" });

    expect(result.success).toBe(true);
  });
});
