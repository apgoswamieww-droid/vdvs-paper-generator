// ============================================================
//  Question form-value → Prisma create/update data mapper
//
//  Shared between the question CRUD Server Actions and the
//  .docx bulk-import action so the mapping stays in one place.
// ============================================================

import { Prisma } from "@prisma/client";
import type {
  QuestionType,
  DifficultyLevel,
  BloomLevel,
  CaseStudyFormat,
  Medium,
} from "@prisma/client";
import type { QuestionFormValue } from "@/lib/validations";

/** Normalizes discriminated-union form output into Question columns. */
export function toQuestionData(v: QuestionFormValue): {
  questionType: QuestionType;
  difficulty: DifficultyLevel;
  medium: Medium;
  bloomLevel: BloomLevel;
  caseStudyFormat: CaseStudyFormat | null;
  marks: number;
  questionText: string;
  answerKey: string | null;
  explanation: string | null;
  tags: string[];
  previousYearTag: string | null;
  topicId: string | null;
  options: Prisma.InputJsonValue | typeof Prisma.DbNull;
} {
  let options: Prisma.InputJsonValue | typeof Prisma.DbNull = Prisma.DbNull;
  let answerKey: string | null = v.answerKey || null;

  if (v.questionType === "MCQ") {
    options = { kind: "mcq", choices: v.options };
    answerKey =
      v.options
        .filter((o) => o.isCorrect)
        .map((o) => o.label)
        .join(", ") || null;
  } else if (v.questionType === "MATCH_THE_FOLLOWING") {
    options = { kind: "match", pairs: v.matchPairs };
  } else if (v.questionType === "TRUE_FALSE") {
    options = { kind: "trueFalse" };
  }
  // NUMERIC keeps only its answer key — there are no printed options, so
  // `options` stays DbNull and the student types the value.

  return {
    questionType: v.questionType as QuestionType,
    difficulty: v.difficulty as DifficultyLevel,
    medium: v.medium as Medium,
    bloomLevel: v.bloomLevel as BloomLevel,
    caseStudyFormat: (v.caseStudyFormat as CaseStudyFormat) ?? null,
    marks: v.marks,
    questionText: v.questionText,
    answerKey,
    explanation: v.explanation || null,
    tags: v.tags,
    previousYearTag: v.previousYearTag || null,
    topicId: v.topicId || null,
    options,
  };
}
