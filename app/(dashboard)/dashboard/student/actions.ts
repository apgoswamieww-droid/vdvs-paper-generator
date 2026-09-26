"use server";

import { requireSession } from "@/lib/session";
import prisma from "@/lib/prisma";
import { parseMcqOptions, parseNumericAnswer } from "@/lib/question-options";

export type StudentAssignmentDTO = {
  id: string;
  assignmentId: string;
  title: string;
  type: string;
  assignmentStatus: string;
  submissionStatus: string;
  startTime: Date;
  endTime: Date;
  paperTitle: string;
  totalMarks: number;
  duration: number | null;
};

export async function listStudentAssignments(): Promise<StudentAssignmentDTO[]> {
  const session = await requireSession();

  const submissions = await prisma.studentSubmission.findMany({
    where: { studentId: session.id },
    include: {
      assignment: {
        include: {
          paper: { select: { title: true, totalMarks: true, duration: true } },
        },
      },
    },
    orderBy: { assignment: { startTime: "desc" } },
  });

  return submissions.map((s) => ({
    id: s.id,
    assignmentId: s.assignmentId,
    title: s.assignment.title,
    type: s.assignment.type,
    assignmentStatus: s.assignment.status,
    submissionStatus: s.status,
    startTime: s.assignment.startTime,
    endTime: s.assignment.endTime,
    paperTitle: s.assignment.paper.title,
    totalMarks: s.assignment.paper.totalMarks,
    duration: s.assignment.paper.duration,
  }));
}

export async function startExam(assignmentId: string) {
  const session = await requireSession();

  const submission = await prisma.studentSubmission.findFirst({
    where: { assignmentId, studentId: session.id },
  });

  if (!submission) throw new Error("Not found");
  if (submission.status !== "NOT_STARTED") return submission.id;

  await prisma.studentSubmission.update({
    where: { id: submission.id },
    data: { startedAt: new Date(), status: "IN_PROGRESS" },
  });

  return submission.id;
}

export async function getExamData(submissionId: string) {
  const session = await requireSession();

  const submission = await prisma.studentSubmission.findFirst({
    where: { id: submissionId, studentId: session.id },
    include: {
      assignment: {
        include: {
          paper: {
            include: {
              sections: {
                include: {
                  questions: {
                    include: {
                      question: {
                        select: {
                          id: true,
                          questionText: true,
                          questionType: true,
                          options: true,
                          marks: true,
                          difficulty: true,
                        },
                      },
                    },
                    orderBy: { order: "asc" },
                  },
                },
                orderBy: { order: "asc" },
              },
            },
          },
        },
      },
      answers: { select: { questionId: true, selectedOption: true, answerText: true } },
    },
  });

  if (!submission) throw new Error("Not found");

  return {
    submissionId: submission.id,
    status: submission.status,
    startedAt: submission.startedAt?.toISOString(),
    endTime: submission.assignment.endTime.toISOString(),
    paper: submission.assignment.paper,
    existingAnswers: submission.answers.reduce(
      (acc, a) => ({ ...acc, [a.questionId]: a.selectedOption || a.answerText || "" }),
      {} as Record<string, string>
    ),
  };
}

export async function submitExam(submissionId: string, answers: Record<string, string>) {
  const session = await requireSession();

  const submission = await prisma.studentSubmission.findFirst({
    where: { id: submissionId, studentId: session.id },
    include: {
      assignment: {
        include: {
          paper: {
            include: {
              sections: {
                include: {
                  questions: {
                    include: {
                      question: {
                        select: {
                          id: true,
                          options: true,
                          marks: true,
                          questionType: true,
                          answerKey: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!submission) throw new Error("Not found");

  const now = new Date();
  const isAutoSubmit = now > submission.assignment.endTime;

  // Create/update answers
  for (const [questionId, answerText] of Object.entries(answers)) {
    const existing = await prisma.answer.findFirst({
      where: { submissionId, questionId },
    });

    // Auto-grade MCQ and numeric questions
    let awardedMarks: number | null = null;
    const allQuestions = submission.assignment.paper.sections.flatMap((s) => s.questions);
    const pq = allQuestions.find((pq) => pq.questionId === questionId);
    if (pq?.question.questionType === "MCQ" && pq.question.options) {
      // Options are stored as { kind: "mcq", choices: [...] } — parse both shapes.
      const choices = parseMcqOptions(pq.question.options);
      const correct = choices.find((o) => o.isCorrect);
      awardedMarks =
        correct && correct.label === answerText ? (pq.marksOverride ?? pq.question.marks) : 0;
    } else if (pq?.question.questionType === "NUMERIC" && pq.question.answerKey) {
      // Numeric answers are exact, so they grade themselves — tolerating the
      // usual notation differences (25% / 1,000 / 1/2) via the shared parser.
      const expected = parseNumericAnswer(pq.question.answerKey);
      const given = parseNumericAnswer(answerText);
      if (expected !== null && given !== null) {
        awardedMarks =
          Math.abs(expected - given) < 1e-9 ? (pq.marksOverride ?? pq.question.marks) : 0;
      }
    }

    if (existing) {
      await prisma.answer.update({
        where: { id: existing.id },
        data: {
          selectedOption: answerText.length <= 10 ? answerText : null,
          answerText: answerText.length > 10 ? answerText : null,
          awardedMarks,
          gradedAt: awardedMarks !== null ? now : null,
        },
      });
    } else {
      await prisma.answer.create({
        data: {
          submissionId,
          questionId,
          selectedOption: answerText.length <= 10 ? answerText : null,
          answerText: answerText.length > 10 ? answerText : null,
          awardedMarks,
          gradedAt: awardedMarks !== null ? now : null,
        },
      });
    }
  }

  // Calculate total
  const allAnswers = await prisma.answer.findMany({ where: { submissionId } });
  const totalScore = allAnswers.reduce((sum, a) => sum + (a.awardedMarks ?? 0), 0);
  const allGraded = allAnswers.length > 0 && allAnswers.every((a) => a.gradedAt !== null);

  await prisma.studentSubmission.update({
    where: { id: submissionId },
    data: {
      submittedAt: now,
      status: isAutoSubmit ? "AUTO_SUBMITTED" : "SUBMITTED",
      totalScore,
      gradedAt: allGraded ? now : null,
    },
  });

  return { totalScore, totalMarks: submission.assignment.paper.totalMarks };
}

export async function getStudentResults() {
  const session = await requireSession();

  const submissions = await prisma.studentSubmission.findMany({
    where: {
      studentId: session.id,
      status: { in: ["SUBMITTED", "AUTO_SUBMITTED"] },
    },
    include: {
      assignment: {
        include: {
          paper: { select: { title: true, totalMarks: true } },
        },
      },
      answers: {
        select: { awardedMarks: true, question: { select: { questionType: true, difficulty: true } } },
      },
    },
    orderBy: { submittedAt: "desc" },
  });

  return submissions.map((s) => ({
    id: s.id,
    assignmentTitle: s.assignment.title,
    paperTitle: s.assignment.paper.title,
    totalMarks: s.assignment.paper.totalMarks,
    score: s.totalScore,
    submittedAt: s.submittedAt,
    gradedAt: s.gradedAt,
    status: s.status,
    mcqScore: s.answers
      .filter((a) => a.question.questionType === "MCQ")
      .reduce((sum, a) => sum + (a.awardedMarks ?? 0), 0),
    subjectiveScore: s.answers
      .filter((a) => a.question.questionType !== "MCQ")
      .reduce((sum, a) => sum + (a.awardedMarks ?? 0), 0),
  }));
}
