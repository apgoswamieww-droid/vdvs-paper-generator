// ============================================================
//  Zod validation schemas — Phase 2 (Question Bank module)
//  zod@4
// ============================================================

import { z } from "zod";

// ------------------------------------------------------------
//  Shared enum values (kept in sync with prisma/schema.prisma)
// ------------------------------------------------------------
export const QUESTION_TYPES = [
  "MCQ",
  "SHORT_ANSWER",
  "LONG_ANSWER",
  "TRUE_FALSE",
  "FILL_IN_THE_BLANK",
  "MATCH_THE_FOLLOWING",
  "CASE_STUDY",
] as const;
export const DIFFICULTIES = ["EASY", "MEDIUM", "HARD"] as const;
export const BLOOM_LEVELS = ["REMEMBER", "UNDERSTAND", "APPLY", "ANALYZE", "EVALUATE", "CREATE"] as const;
export const CASE_STUDY_FORMATS = ["INLINE", "SHARED_PASSAGE"] as const;

export const questionTypeEnum = z.enum(QUESTION_TYPES);
export const difficultyEnum = z.enum(DIFFICULTIES);
export const bloomEnum = z.enum(BLOOM_LEVELS);
export const caseStudyFormatEnum = z.enum(CASE_STUDY_FORMATS);

// ------------------------------------------------------------
//  MCQ / matching option shapes (stored as JSON in `options`)
// ------------------------------------------------------------
export const mcqOptionSchema = z.object({
  label: z.string().min(1).max(10),
  text: z.string().min(1, "Option text is required"),
  isCorrect: z.boolean(),
});

export const matchPairSchema = z.object({
  left: z.string().min(1, "Left item is required"),
  right: z.string().min(1, "Right item is required"),
});

// ------------------------------------------------------------
//  Taxonomy
// ------------------------------------------------------------
export const classLevelSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(50),
  order: z.coerce.number().int().min(0).max(20).default(0),
});

export const subjectSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  code: z.string().trim().max(20).optional().or(z.literal("")),
  classLevelId: z.string().min(1, "Class is required"),
});

export const chapterSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(150),
  order: z.coerce.number().int().min(0).max(999).default(0),
});

export const topicSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(150),
  order: z.coerce.number().int().min(0).max(999).default(0),
});

// ------------------------------------------------------------
//  Question
// ------------------------------------------------------------
export const questionBaseSchema = z.object({
  subjectId: z.string().min(1, "Subject is required"),
  chapterId: z.string().min(1, "Chapter is required"),
  topicId: z.string().optional().or(z.literal("")),
  questionType: questionTypeEnum,
  difficulty: difficultyEnum,
  bloomLevel: bloomEnum,
  caseStudyFormat: caseStudyFormatEnum.optional(),
  marks: z.coerce.number().min(0.5).max(100),
  questionText: z.string().trim().min(1, "Question text is required").max(8000),
  answerKey: z.string().trim().max(8000).optional().or(z.literal("")),
  explanation: z.string().trim().max(8000).optional().or(z.literal("")),
  // Accepts an array OR a comma-separated string (UI inputs a string; it is
  // transformed to an array on parse — the parsed output is always string[]).
  tags: z
    .union([z.array(z.string().trim().min(1).max(50)).max(15), z.string().max(800)])
    .transform((v) =>
      Array.isArray(v)
        ? v
        : v
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
            .slice(0, 15)
    )
    .default([]),
  previousYearTag: z.string().trim().max(60).optional().or(z.literal("")),
});

export const questionFormSchema = z
  .discriminatedUnion("questionType", [
    questionBaseSchema.extend({
      questionType: z.literal("MCQ"),
      options: z.array(mcqOptionSchema).min(2, "At least 2 options").max(6),
    }),
    questionBaseSchema.extend({
      questionType: z.literal("MATCH_THE_FOLLOWING"),
      matchPairs: z.array(matchPairSchema).min(2, "At least 2 pairs").max(10),
    }),
    questionBaseSchema.extend({ questionType: z.literal("TRUE_FALSE") }),
    questionBaseSchema.extend({ questionType: z.literal("SHORT_ANSWER") }),
    questionBaseSchema.extend({ questionType: z.literal("LONG_ANSWER") }),
    questionBaseSchema.extend({ questionType: z.literal("CASE_STUDY") }),
    questionBaseSchema.extend({ questionType: z.literal("FILL_IN_THE_BLANK") }),
  ])
  .superRefine((val, ctx) => {
    if (val.questionType === "MCQ" && !val.options.some((o) => o.isCorrect)) {
      ctx.addIssue({
        code: "custom",
        path: ["options"],
        message: "Mark at least one correct option",
      });
    }
    if (val.questionType === "CASE_STUDY" && !val.caseStudyFormat) {
      ctx.addIssue({
        code: "custom",
        path: ["caseStudyFormat"],
        message: "Choose a case-study format",
      });
    }
  });

export type QuestionFormInput = z.input<typeof questionFormSchema>;
export type QuestionFormValue = z.output<typeof questionFormSchema>;

// ------------------------------------------------------------
//  Question filters (list query)
// ------------------------------------------------------------
export const questionFilterSchema = z.object({
  search: z.string().trim().max(200).optional(),
  subjectId: z.string().trim().optional(),
  chapterId: z.string().trim().optional(),
  topicId: z.string().trim().optional(),
  questionType: questionTypeEnum.optional(),
  difficulty: difficultyEnum.optional(),
  bloomLevel: bloomEnum.optional(),
  previousYearTag: z.string().trim().max(60).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(20),
});

export type QuestionFilterInput = z.infer<typeof questionFilterSchema>;

// ------------------------------------------------------------
//  Server Action result wrapper
// ------------------------------------------------------------
export type ActionState =
  | { success: true; message?: string; id?: string }
  | { success: false; error: string; fieldErrors?: Record<string, string> };

// ============================================================
//  Paper Builder — Phase 3
// ============================================================

export const PAPER_GENERATION_MODES = ["MANUAL", "BLUEPRINT"] as const;
export const paperGenerationModeEnum = z.enum(PAPER_GENERATION_MODES);

// --- Blueprint rule: what to pick for a single chapter ---
export const blueprintRuleSchema = z.object({
  chapterId: z.string().min(1, "Chapter is required"),
  chapterName: z.string().optional(), // display only, not saved
  questionType: questionTypeEnum,
  count: z.coerce.number().int().min(1, "At least 1 question").max(50),
  marksEach: z.coerce.number().min(0.5, "Minimum 0.5 marks").max(100),
  difficultyDistribution: z.object({
    easy: z.coerce.number().min(0).max(100).default(0),
    medium: z.coerce.number().min(0).max(100).default(0),
    hard: z.coerce.number().min(0).max(100).default(0),
  }).refine(
    (d) => d.easy + d.medium + d.hard === 100,
    { message: "Difficulty percentages must sum to 100%" }
  ),
});

export type BlueprintRuleInput = z.input<typeof blueprintRuleSchema>;
export type BlueprintRuleValue = z.output<typeof blueprintRuleSchema>;

// --- Paper creation (manual mode) ---
export const createManualPaperSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  description: z.string().trim().max(1000).optional().or(z.literal("")),
  subjectId: z.string().optional().or(z.literal("")),
  duration: z.coerce.number().int().min(1, "Duration is required").max(600).optional(),
  totalMarks: z.coerce.number().min(1, "Total marks is required").max(10000),
  passingMarks: z.coerce.number().min(0).max(10000).optional().or(z.literal("")),
  instructions: z.string().trim().max(5000).optional().or(z.literal("")),
  schoolHeader: z.string().trim().max(500).optional().or(z.literal("")),
  watermarkText: z.string().trim().max(100).optional().or(z.literal("")),
  generationMode: z.literal("MANUAL"),
  sections: z.array(z.object({
    title: z.string().trim().min(1, "Section title is required").max(100),
    instructions: z.string().trim().max(500).optional().or(z.literal("")),
    questionIds: z.array(z.string().min(1)).min(1, "Select at least one question"),
  })).min(1, "Add at least one section"),
});

export type CreateManualPaperInput = z.input<typeof createManualPaperSchema>;
export type CreateManualPaperValue = z.output<typeof createManualPaperSchema>;

// --- Paper creation (blueprint / auto mode) ---
export const createBlueprintPaperSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  description: z.string().trim().max(1000).optional().or(z.literal("")),
  subjectId: z.string().min(1, "Subject is required for blueprint mode"),
  classLevelId: z.string().min(1, "Class is required for blueprint mode"),
  duration: z.coerce.number().int().min(1, "Duration is required").max(600).optional(),
  totalMarks: z.coerce.number().min(1, "Total marks is required").max(10000),
  passingMarks: z.coerce.number().min(0).max(10000).optional().or(z.literal("")),
  instructions: z.string().trim().max(5000).optional().or(z.literal("")),
  schoolHeader: z.string().trim().max(500).optional().or(z.literal("")),
  watermarkText: z.string().trim().max(100).optional().or(z.literal("")),
  generationMode: z.literal("BLUEPRINT"),
  rules: z.array(blueprintRuleSchema).min(1, "Add at least one blueprint rule"),
});

export type CreateBlueprintPaperInput = z.input<typeof createBlueprintPaperSchema>;
export type CreateBlueprintPaperValue = z.output<typeof createBlueprintPaperSchema>;

// --- Paper update (customization fields) ---
export const updatePaperSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(1000).optional().or(z.literal("")),
  duration: z.coerce.number().int().min(1).max(600).optional(),
  totalMarks: z.coerce.number().min(0).max(10000).optional(),
  passingMarks: z.coerce.number().min(0).max(10000).optional().or(z.literal("")),
  instructions: z.string().trim().max(5000).optional().or(z.literal("")),
  schoolHeader: z.string().trim().max(500).optional().or(z.literal("")),
  watermarkText: z.string().trim().max(100).optional().or(z.literal("")),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional(),
});

export type UpdatePaperInput = z.input<typeof updatePaperSchema>;
