// ============================================================
//  .docx Bulk Import Parser
//
//  Teachers upload a Microsoft Word (.docx) file following the
//  template below. mammoth extracts raw text; this module parses
//  it into structured question drafts.
//
//  TEMPLATE (one block per question, blocks separated by ---):
//
//    Q1. What is the value of x if 2x + 5 = 15?
//    Type: MCQ
//    Difficulty: Easy
//    Marks: 1
//    Bloom: Apply
//    Year: GSEB 2023
//    Tags: algebra, linear-equations
//    Options:
//    A) x = 3
//    B) x = 5 *
//    C) x = 7
//    D) x = 10
//    Answer: B
//    Explanation: 2x = 10, so x = 5
//
//    ---
//
//    Q2. Solve $\frac{d}{dx}(x^2) = ?$
//    Type: SHORT_ANSWER
//    ...
//    Answer: 2x
//
//  Notes:
//   - `*` after an option marks it correct (alternative to Answer:).
//   - Question text may contain Gujarati Unicode and KaTeX ($...$).
//   - Type values: MCQ | SHORT_ANSWER | LONG_ANSWER | TRUE_FALSE |
//     FILL_IN_THE_BLANK | MATCH_THE_FOLLOWING | CASE_STUDY
//   - CASE_STUDY blocks may include "Format: INLINE | SHARED_PASSAGE"
//   - MATCH_THE_FOLLOWING pairs are written as "L => R" lines under Pairs:
// ============================================================

export type ParsedQuestionDraft = {
  row: number;
  questionText: string;
  questionType: string; // validated later by Zod
  difficulty: string;
  marks: number;
  bloomLevel: string;
  previousYearTag: string | null;
  tags: string[];
  options: { label: string; text: string; isCorrect: boolean }[];
  matchPairs: { left: string; right: string }[];
  answerKey: string | null;
  explanation: string | null;
  caseStudyFormat: string | null;
};

export type ParseResult = {
  drafts: ParsedQuestionDraft[];
  errors: { row: number; questionPreview: string; error: string }[];
};

const FIELD_RE = /^(Type|Difficulty|Marks|Bloom|Year|Tags|Options|Pairs|Answer|Explanation|Format)\s*:\s*(.*)$/i;
const MCQ_OPTION_RE = /^([A-Fa-f])[\).]\s*(.+)$/;
const MATCH_PAIR_RE = /^(.+?)\s*=>\s*(.+)$/;
const QUESTION_START_RE = /^Q\s*(\d+)\s*[\.\)]\s*(.*)$/i;

/**
 * Parses the plain text extracted from a .docx template.
 */
export function parseDocxQuestions(text: string): ParseResult {
  const drafts: ParsedQuestionDraft[] = [];
  const errors: ParseResult["errors"] = [];

  // Split file into question blocks on --- separators
  const blocks = text
    .split(/^---+$/m)
    .map((b) => b.trim())
    .filter(Boolean);

  blocks.forEach((block, blockIdx) => {
    const lines = block.split(/\r?\n/).map((l) => l.trim());
    let current: ParsedQuestionDraft | null = null;
    let section: "options" | "pairs" | null = null;
    let textLines: string[] = [];

    const flushQuestionText = () => {
      if (current && textLines.length) {
        current.questionText = textLines.join("\n").trim();
      }
    };

    for (const line of lines) {
      if (!line) continue;

      const qStart = line.match(QUESTION_START_RE);
      if (qStart && !current) {
        current = blankDraft(Number(qStart[1]));
        textLines = qStart[2] ? [qStart[2]] : [];
        continue;
      }

      if (!current) {
        // Content before the first "Q1." line — try to be forgiving
        current = blankDraft(blockIdx + 1);
        textLines = [line];
        continue;
      }

      const field = line.match(FIELD_RE);
      if (field) {
        const key = field[1].toLowerCase();
        const value = field[2].trim();
        flushQuestionText();
        section = null;

        switch (key) {
          case "type":
            current.questionType = value.toUpperCase().replace(/[\s-]+/g, "_");
            break;
          case "difficulty":
            current.difficulty = value.toUpperCase();
            break;
          case "marks":
            current.marks = Number(value) || 1;
            break;
          case "bloom":
            current.bloomLevel = value.toUpperCase();
            break;
          case "year":
            current.previousYearTag = value || null;
            break;
          case "tags":
            current.tags = value
              .split(/[,;]/)
              .map((t) => t.trim())
              .filter(Boolean);
            break;
          case "options":
            section = "options";
            break;
          case "pairs":
            section = "pairs";
            break;
          case "answer":
            current.answerKey = value || null;
            break;
          case "explanation":
            current.explanation = value || null;
            break;
          case "format":
            current.caseStudyFormat = value.toUpperCase();
            break;
        }
        continue;
      }

      // MCQ option line
      const opt = line.match(MCQ_OPTION_RE);
      if (opt && (section === "options" || current.questionType === "MCQ")) {
        const isCorrect = /\*\s*$/.test(opt[2]);
        current.options.push({
          label: opt[1].toUpperCase(),
          text: opt[2].replace(/\*\s*$/, "").trim(),
          isCorrect,
        });
        continue;
      }

      // Matching pair line
      const pair = line.match(MATCH_PAIR_RE);
      if (pair && section === "pairs") {
        current.matchPairs.push({ left: pair[1].trim(), right: pair[2].trim() });
        continue;
      }

      // Continuation of question text (before any field seen)
      if (!section && textLines.length >= 0 && current.options.length === 0 && current.matchPairs.length === 0) {
        const lastFieldIdx = lines.indexOf(line);
        void lastFieldIdx;
        textLines.push(line);
      } else if (section === "options" || section === "pairs") {
        // Multi-line option/pair continuation → append to last entry
        if (section === "options" && current.options.length) {
          current.options[current.options.length - 1].text += ` ${line}`;
        } else if (section === "pairs" && current.matchPairs.length) {
          current.matchPairs[current.matchPairs.length - 1].right += ` ${line}`;
        }
      } else {
        // Continuation of explanation/answer
        if (current.explanation !== null) {
          current.explanation += ` ${line}`;
        } else if (current.answerKey !== null) {
          current.answerKey += ` ${line}`;
        }
      }
    }

    flushQuestionText();

    if (!current) return;

    // Per-block sanity checks (full validation happens in the action)
    if (!current.questionText) {
      errors.push({ row: current.row, questionPreview: "(empty)", error: "Question text is missing." });
      return;
    }
    if (current.questionType === "MCQ" && current.options.length < 2) {
      errors.push({
        row: current.row,
        questionPreview: truncate(current.questionText, 60),
        error: "MCQ requires at least 2 options (A), B), ...).",
      });
      return;
    }
    if (current.questionType === "MATCH_THE_FOLLOWING" && current.matchPairs.length < 2) {
      errors.push({
        row: current.row,
        questionPreview: truncate(current.questionText, 60),
        error: "MATCH_THE_FOLLOWING requires at least 2 pairs (L => R).",
      });
      return;
    }
    if (current.questionType === "MCQ") {
      const marked = current.options.filter((o) => o.isCorrect);
      if (marked.length === 0 && !current.answerKey) {
        errors.push({
          row: current.row,
          questionPreview: truncate(current.questionText, 60),
          error: "Mark the correct option with * or provide Answer: <label>.",
        });
        return;
      }
      if (marked.length === 0 && current.answerKey) {
        const label = current.answerKey.trim().toUpperCase();
        const hit = current.options.find((o) => o.label === label);
        if (hit) hit.isCorrect = true;
      }
    }

    drafts.push(current);
  });

  return { drafts, errors };
}

function blankDraft(row: number): ParsedQuestionDraft {
  return {
    row,
    questionText: "",
    questionType: "SHORT_ANSWER",
    difficulty: "MEDIUM",
    marks: 1,
    bloomLevel: "UNDERSTAND",
    previousYearTag: null,
    tags: [],
    options: [],
    matchPairs: [],
    answerKey: null,
    explanation: null,
    caseStudyFormat: null,
  };
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n) + "…";
}

/**
 * Human-readable template shown in the import UI and used to
 * generate a downloadable sample .docx guide (as text).
 */
export const DOCX_TEMPLATE_SAMPLE = `Q1. What is the value of x if 2x + 5 = 15?
Type: MCQ
Difficulty: Easy
Marks: 1
Bloom: Apply
Tags: algebra, linear-equations
Options:
A) x = 3
B) x = 5 *
C) x = 7
D) x = 10
Explanation: 2x = 15 - 5 = 10, so x = 5

---

Q2. ગુજરાતીમાં ઉત્તર આપો: $\\sqrt{144}$ ની કિંમત શું છે?
Type: SHORT_ANSWER
Difficulty: Easy
Marks: 1
Bloom: Remember
Answer: 12

---

Q3. Match the following shapes with their number of sides.
Type: MATCH_THE_FOLLOWING
Marks: 2
Pairs:
Triangle => 3
Square => 4
Pentagon => 5

---

Q4. Read the case and answer: A school plants trees along a path, first at 2 m and each next 3 m further. Find the distance of the 10th tree.
Type: CASE_STUDY
Format: INLINE
Difficulty: Hard
Marks: 5
Bloom: Analyze
Answer: d(n) = 2 + (n-1)*3 = 29 m
`;
