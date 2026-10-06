// ============================================================
//  Competitive-exam paper presets
//
//  A preset is a ready-made exam pattern: sections with their
//  question counts / marks / negative marking, the duration, the
//  standard instruction block, a branded heading template and the
//  blueprint-rule skeleton. Applying one prefills the paper builder
//  — everything stays editable, because the conducting body revises
//  these patterns (each preset carries a note when that matters).
//
//  Patterns verified against public 2026 exam pattern sources.
// ============================================================

import {
  newCellsRow,
  newDividerRow,
  newMetaGridRow,
  newLogoCell,
  newTextCell,
  type HeaderConfig,
} from "@/lib/paper-header";

export type PresetQuestionType =
  | "MCQ"
  | "NUMERIC"
  | "SHORT_ANSWER"
  | "LONG_ANSWER"
  | "TRUE_FALSE"
  | "FILL_IN_THE_BLANK"
  | "MATCH_THE_FOLLOWING"
  | "CASE_STUDY";

export type ExamPresetSection = {
  title: string;
  questionType: PresetQuestionType;
  count: number;
  marksEach: number;
  /** Marks deducted per wrong answer — 0 = no negative marking. */
  negativeMarks: number;
  instructions?: string;
};

export type ExamPresetBlueprintRule = {
  questionType: PresetQuestionType;
  count: number;
  marksEach: number;
  negativeMarks: number;
  difficultyDistribution: { easy: number; medium: number; hard: number };
};

export type ExamPreset = {
  id: string;
  /** Short label used in the picker and as the template name. */
  name: string;
  fullName: string;
  /** Brand colour used by the preset header (hex). */
  accent: string;
  duration: number; // minutes
  totalMarks: number;
  instructions: string;
  sections: ExamPresetSection[];
  /** Branded heading template applied with the preset. */
  header: HeaderConfig;
  /** Skeleton for blueprint mode — the chapter is picked by the author. */
  blueprintRules: ExamPresetBlueprintRule[];
  /** Honesty note shown next to the preset. */
  note?: string;
};

// ------------------------------------------------------------
//  Shared instruction blocks
// ------------------------------------------------------------

const MCQ_INSTRUCTIONS = [
  "1. All questions are compulsory.",
  "2. Read each question carefully before answering.",
  "3. Mark your answers only on the OMR sheet / as instructed.",
  "4. Marks are as indicated against each question; negative marking applies where stated.",
  "5. No electronic devices are allowed inside the examination hall.",
].join("\n");

// ------------------------------------------------------------
//  Header builders
// ------------------------------------------------------------

/** Compact exam heading: school line · exam banner · divider · meta box. */
function examHeader(opts: {
  examLabel: string;
  accent: string;
  paperLine: string;
}): HeaderConfig {
  const { examLabel, accent, paperLine } = opts;
  return {
    rows: [
      newCellsRow([
        newTextCell(
          { text: "{{schoolName}}", fontSize: 11, bold: true, color: "#1a1a1a" },
          "left",
          "fill"
        ),
        newLogoCell(54, "center", "auto"),
        newTextCell({ text: "{{date}}", fontSize: 10, color: "#444" }, "right", "auto"),
      ]),
      newCellsRow([
        newTextCell(
          {
            text: examLabel,
            fontSize: 17,
            fontFamily: "Rasa",
            bold: true,
            color: accent,
          },
          "center",
          "fill"
        ),
      ]),
      newCellsRow([
        newTextCell(
          { text: paperLine, fontSize: 10.5, bold: true, color: "#333" },
          "center",
          "fill"
        ),
      ]),
      newDividerRow("double", accent),
      newMetaGridRow({
        section: examLabel,
        color: accent,
        showSection: false,
        showClass: true,
        showDate: true,
        showDuration: true,
        showTotalMarks: true,
        showSubject: true,
      }),
      newDividerRow("single", accent),
    ],
  };
}

/** Per-subject helper: (title suffix, count, type) → section + rule pair. */
function subjectSections(
  subjects: { name: string; mcq: number; numeric?: number }[],
  marksEach: number,
  negativeMarks: number
): { sections: ExamPresetSection[]; rules: ExamPresetBlueprintRule[] } {
  const sections: ExamPresetSection[] = [];
  const rules: ExamPresetBlueprintRule[] = [];

  for (const s of subjects) {
    sections.push({
      title: `${s.name} — MCQ`,
      questionType: "MCQ",
      count: s.mcq,
      marksEach,
      negativeMarks,
    });
    rules.push({
      questionType: "MCQ",
      count: s.mcq,
      marksEach,
      negativeMarks,
      difficultyDistribution: { easy: 30, medium: 50, hard: 20 },
    });

    if (s.numeric) {
      sections.push({
        title: `${s.name} — Numerical`,
        questionType: "NUMERIC",
        count: s.numeric,
        marksEach,
        negativeMarks,
        instructions: "Answer as a number. Round off to the required precision if stated.",
      });
      rules.push({
        questionType: "NUMERIC",
        count: s.numeric,
        marksEach,
        negativeMarks,
        difficultyDistribution: { easy: 20, medium: 50, hard: 30 },
      });
    }
  }

  return { sections, rules };
}

// ------------------------------------------------------------
//  Presets
// ------------------------------------------------------------

const JEE_MAIN = (() => {
  const s = subjectSections(
    [
      { name: "Physics", mcq: 20, numeric: 5 },
      { name: "Chemistry", mcq: 20, numeric: 5 },
      { name: "Mathematics", mcq: 20, numeric: 5 },
    ],
    4,
    1
  );
  return {
    id: "jee-main",
    name: "JEE Main",
    fullName: "JEE (Main) — Paper 1 (B.E./B.Tech)",
    accent: "#0b3d91",
    duration: 180,
    totalMarks: 300,
    instructions: MCQ_INSTRUCTIONS,
    sections: s.sections,
    blueprintRules: s.rules,
    header: examHeader({
      examLabel: "JEE (MAIN)",
      accent: "#0b3d91",
      paperLine: "PAPER 1 — B.E. / B.TECH  ·  {{subject}}  ·  {{class}}",
    }),
    note: "75 questions (25 per subject), +4 / −1, 300 marks.",
  };
})() satisfies ExamPreset;

const NEET = (() => {
  const s = subjectSections(
    [
      { name: "Physics", mcq: 45 },
      { name: "Chemistry", mcq: 45 },
      { name: "Botany", mcq: 45 },
      { name: "Zoology", mcq: 45 },
    ],
    4,
    1
  );
  return {
    id: "neet",
    name: "NEET UG",
    fullName: "NEET UG — MBBS/BDS Entrance",
    accent: "#8e1c1c",
    duration: 180,
    totalMarks: 720,
    instructions: MCQ_INSTRUCTIONS,
    sections: s.sections,
    blueprintRules: s.rules,
    header: examHeader({
      examLabel: "NEET (UG)",
      accent: "#8e1c1c",
      paperLine: "MBBS / BDS ENTRANCE  ·  {{subject}}  ·  {{class}}",
    }),
    note: "180 questions — Physics 45 · Chemistry 45 · Biology 90, +4 / −1, 720 marks.",
  };
})() satisfies ExamPreset;

const JEE_ADVANCED = (() => {
  const subjects = ["Physics", "Chemistry", "Mathematics"];
  const sections: ExamPresetSection[] = [];
  const rules: ExamPresetBlueprintRule[] = [];

  for (const name of subjects) {
    sections.push({
      title: `${name} — Section 1 (Single Correct)`,
      questionType: "MCQ",
      count: 6,
      marksEach: 3,
      negativeMarks: 1,
    });
    sections.push({
      title: `${name} — Section 2 (Multiple Correct)`,
      questionType: "MCQ",
      count: 6,
      marksEach: 4,
      negativeMarks: 1,
      instructions: "One or more options may be correct. Partial marking applies.",
    });
    sections.push({
      title: `${name} — Section 3 (Numerical)`,
      questionType: "NUMERIC",
      count: 6,
      marksEach: 3,
      negativeMarks: 0,
    });
    // One rule per section type, so the blueprint total matches the sections.
    rules.push({
      questionType: "MCQ",
      count: 6,
      marksEach: 3,
      negativeMarks: 1,
      difficultyDistribution: { easy: 10, medium: 50, hard: 40 },
    });
    rules.push({
      questionType: "MCQ",
      count: 6,
      marksEach: 4,
      negativeMarks: 1,
      difficultyDistribution: { easy: 5, medium: 35, hard: 60 },
    });
    rules.push({
      questionType: "NUMERIC",
      count: 6,
      marksEach: 3,
      negativeMarks: 0,
      difficultyDistribution: { easy: 10, medium: 40, hard: 50 },
    });
  }

  return {
    id: "jee-advanced",
    name: "JEE Advanced",
    fullName: "JEE (Advanced) — Paper 1",
    accent: "#7a1f1f",
    duration: 180,
    totalMarks: 180,
    instructions: MCQ_INSTRUCTIONS,
    sections,
    blueprintRules: rules,
    header: examHeader({
      examLabel: "JEE (ADVANCED)",
      accent: "#7a1f1f",
      paperLine: "PAPER 1  ·  {{subject}}  ·  {{class}}",
    }),
    note: "Two papers of 54 questions / 180 marks each. IIT revises the section format every year — match the sections to this year's pattern.",
  };
})() satisfies ExamPreset;

const GUJCET = (() => {
  const s = subjectSections(
    [
      { name: "Physics", mcq: 40 },
      { name: "Chemistry", mcq: 40 },
      { name: "Mathematics", mcq: 40 },
    ],
    1,
    0.25
  );
  return {
    id: "gujcet",
    name: "GUJCET",
    fullName: "GUJCET — Gujarat Common Entrance Test (PCM)",
    accent: "#0f6b3f",
    duration: 180,
    totalMarks: 120,
    instructions: MCQ_INSTRUCTIONS,
    sections: s.sections,
    blueprintRules: s.rules,
    header: examHeader({
      examLabel: "GUJCET",
      accent: "#0f6b3f",
      paperLine: "PCM  ·  {{subject}}  ·  {{class}}  ·  {{academicYear}}",
    }),
    note: "120 MCQs (40 per subject), +1 / −0.25, 120 marks.",
  };
})() satisfies ExamPreset;

const CMAT = (() => {
  const areas = [
    "Quantitative Techniques & Data Interpretation",
    "Logical Reasoning",
    "Language Comprehension",
    "General Awareness",
    "Innovation & Entrepreneurship",
  ];
  const sections: ExamPresetSection[] = areas.map((name) => ({
    title: name,
    questionType: "MCQ",
    count: 20,
    marksEach: 4,
    negativeMarks: 1,
  }));
  const blueprintRules: ExamPresetBlueprintRule[] = areas.map(() => ({
    questionType: "MCQ",
    count: 20,
    marksEach: 4,
    negativeMarks: 1,
    difficultyDistribution: { easy: 30, medium: 50, hard: 20 },
  }));
  return {
    id: "cmat",
    name: "CMAT",
    fullName: "CMAT — Common Management Admission Test",
    accent: "#1f4e79",
    duration: 180,
    totalMarks: 400,
    instructions: MCQ_INSTRUCTIONS,
    sections,
    blueprintRules,
    header: examHeader({
      examLabel: "CMAT",
      accent: "#1f4e79",
      paperLine: "MANAGEMENT ADMISSION TEST  ·  {{class}}  ·  {{academicYear}}",
    }),
    note: "100 MCQs across 5 sections, +4 / −1, 400 marks (3 hours).",
  };
})() satisfies ExamPreset;

export const EXAM_PRESETS: ExamPreset[] = [
  JEE_MAIN,
  NEET,
  JEE_ADVANCED,
  GUJCET,
  CMAT,
];

export function getExamPreset(id: string): ExamPreset | null {
  return EXAM_PRESETS.find((p) => p.id === id) ?? null;
}
