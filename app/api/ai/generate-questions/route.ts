import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { resolveAdminScope } from "@/app/(dashboard)/dashboard/admin/scope";
import { omniChat, OmniRouteError } from "@/lib/ai/omniroutes";
import { BLOOM_LEVELS } from "@/lib/validations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ------------------------------------------------------------------
//  Input contract
// ------------------------------------------------------------------

const generateBodySchema = z.object({
  schoolId: z.string().optional().nullable(),
  classLevelId: z.string().min(1, "Standard is required."),
  subjectId: z.string().min(1, "Subject is required."),
  chapterId: z.string().min(1, "Chapter is required."),
  topicId: z.string().optional().nullable(),
  medium: z.enum(["ENGLISH", "GUJARATI"]),
  questionType: z.enum(["MCQ", "SHORT_ANSWER", "LONG_ANSWER", "TRUE_FALSE"]),
  quantity: z.coerce.number().int().min(1, "At least 1 question is required.").max(20).default(5),
  previousYear: z.boolean().default(false),
  examYear: z.string().trim().max(20).optional().nullable(),
});

type GenerateInput = z.infer<typeof generateBodySchema>;

// ------------------------------------------------------------------
//  Per-question normalization from raw LLM output
// ------------------------------------------------------------------

const rawQuestionSchema = z.object({
  questionText: z.string().min(1),
  options: z
    .array(
      z.object({
        label: z.string().min(1).max(10),
        text: z.string().min(1),
        isCorrect: z.boolean().default(false),
      })
    )
    .optional(),
  correctAnswer: z.string().optional(),
  detailedSolution: z.string().optional(),
  tags: z.array(z.string()).default([]),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).optional(),
  bloom: z.string().optional(),
});

function stripFencedJson(content: string): string {
  const text = content.trim();
  const fences = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fences) return fences[1]!.trim();
  const first = text[0];
  if (first === "[") {
    const end = text.lastIndexOf("]");
    return end > 0 ? text.slice(0, end + 1) : text;
  }
  if (first === "{") {
    const end = text.lastIndexOf("}");
    return end > 0 ? text.slice(0, end + 1) : text;
  }
  const start = Math.max(text.indexOf("["), text.indexOf("{"));
  if (start !== -1) {
    const open = text[start] === "[" ? "]" : "}";
    const end = text.lastIndexOf(open);
    if (end > start) return text.slice(start, end + 1);
  }
  return text;
}

function parseJsonArray(content: string): unknown[] {
  const cleaned = stripFencedJson(content);
  const parsed: unknown = JSON.parse(cleaned);
  if (!Array.isArray(parsed)) {
    throw new OmniRouteError("AI gateway did not return a JSON array of questions.");
  }
  return parsed;
}

function normalizeQuestion(raw: unknown, index: number) {
  const item = rawQuestionSchema.safeParse(raw);
  if (!item.success) {
    throw new OmniRouteError(`Question ${index + 1} is missing required fields (questionText).`);
  }
  const d = item.data;

  let bloom = d.bloom?.toUpperCase();
  if (!bloom || !BLOOM_LEVELS.includes(bloom as (typeof BLOOM_LEVELS)[number])) {
    bloom = "REMEMBER";
  }

  let options: { kind: "mcq"; choices: { label: string; text: string; isCorrect: boolean }[] } | null = null;
  let answerKey = d.correctAnswer?.trim() ?? "";

  if (d.options && d.options.length > 0) {
    const choices = d.options.map((o) => ({ label: o.label, text: o.text, isCorrect: o.isCorrect }));
    options = { kind: "mcq", choices };
    if (!answerKey) {
      answerKey = choices
        .filter((c) => c.isCorrect)
        .map((c) => c.label)
        .join(", ");
    }
  }

  return {
    questionText: d.questionText,
    options,
    answerKey,
    explanation: d.detailedSolution?.trim() ?? "",
    tags: d.tags.map((t) => t.toString()).slice(0, 8),
    difficulty: d.difficulty ?? "MEDIUM",
    bloom: bloom as typeof BLOOM_LEVELS[number],
  };
}

// ------------------------------------------------------------------
//  Prompt builders
// ------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a senior Indian school question paper setter with deep expertise in CBSE and GSEB board curricula.

You generate exam-quality questions for school teachers. Strict rules:
- Respond with ONLY a valid JSON array. No markdown fences, no commentary, no trailing text.
- Each element must match exactly:
  {"questionText": string, "options": [{"label":"A","text":string,"isCorrect":bool}, ...], "correctAnswer": string, "detailedSolution": string, "tags": string[], "difficulty": "EASY"|"MEDIUM"|"HARD", "bloom": "REMEMBER"|"UNDERSTAND"|"APPLY"|"ANALYZE"|"EVALUATE"|"CREATE"}
- For MCQ questions include 4 options with labels A-D, exactly one correct, and set correctAnswer to that label.
- For SHORT_ANSWER / LONG_ANSWER / TRUE_FALSE omit the "options" field and put the model answer or "TRUE"/"FALSE" in correctAnswer.
- Never repeat a question within a batch. Ensure a variety of difficulty and Bloom levels across the batch.
- "tags" should hold short topic keywords (max 4).
- "detailedSolution" must give the reasoning/workings for the correct answer.
- All question text, options, answers and solutions must be in the language announced in the request.
- Output only the array.

The requested language and other constraints follow in the user message.`;

function buildUserPrompt(input: GenerateInput, labels: {
  board: string;
  className: string;
  subjectName: string;
  chapterName: string;
  topicName: string | null;
}): string {
  const lines: string[] = [];
  lines.push(`Language: ${input.medium === "GUJARATI" ? "GUJARATI (write all text in Gujarati using Unicode)" : "ENGLISH"}.`);
  lines.push(`Standard: Class ${labels.className}`);
  lines.push(`Subject: ${labels.subjectName}`);
  lines.push(`Chapter: ${labels.chapterName}`);
  if (labels.topicName) lines.push(`Topic: ${labels.topicName}`);
  lines.push(`Question type: ${input.questionType} (all ${input.quantity} questions).`);
  if (input.previousYear && input.examYear) {
    lines.push(`Pattern: Follow the ${labels.board} ${input.examYear} board examination pattern and mark-scheme.`);
  }
  lines.push(`Generate exactly ${input.quantity} ${input.questionType} questions on the ${labels.className} standard ${labels.subjectName} chapter "${labels.chapterName}"${labels.topicName ? `, topic "${labels.topicName}"` : ""}.`);
  return lines.join("\n");
}

// ------------------------------------------------------------------
//  POST /api/ai/generate-questions
// ------------------------------------------------------------------

export async function POST(req: Request) {
  let body: GenerateInput;
  try {
    body = generateBodySchema.parse(await req.json());
  } catch (err) {
    const message = err instanceof z.ZodError ? err.issues[0]?.message ?? "Invalid request payload." : "Invalid request payload.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }

  let schoolId: string;
  try {
    const scope = await resolveAdminScope(body.schoolId);
    schoolId = scope.schoolId;
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized: school admin access required." }, { status: 401 });
  }

  const taxonomy = await prisma.classLevel.findFirst({
    where: { id: body.classLevelId, schoolId },
    select: {
      id: true,
      name: true,
      subjects: {
        where: { id: body.subjectId },
        select: {
          id: true,
          name: true,
          chapters: {
            where: { id: body.chapterId },
            select: {
              id: true,
              name: true,
              topics: body.topicId ? { where: { id: body.topicId }, select: { id: true, name: true } } : true,
            },
          },
        },
      },
    },
  });

  const subject = taxonomy?.subjects.find((s) => s.id === body.subjectId);
  const chapter = subject?.chapters.find((c) => c.id === body.chapterId);
  if (!taxonomy || !subject || !chapter) {
    return NextResponse.json({ ok: false, error: "Selected standard / subject / chapter is not part of this school." }, { status: 404 });
  }

  const topic = body.topicId ? chapter.topics.find((t) => t.id === body.topicId) ?? null : null;

  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: { board: true, name: true, academicYear: true },
  });

  const boardLabel = school?.board === "GSEB" ? "GSEB" : "CBSE";

  let content: string;
  try {
    content = await omniChat({
      system: SYSTEM_PROMPT,
      user: buildUserPrompt(
        body,
        {
          board: boardLabel,
          className: taxonomy.name,
          subjectName: subject.name,
          chapterName: chapter.name,
          topicName: topic?.name ?? null,
        }
      ),
    });
  } catch (err) {
    const message = err instanceof OmniRouteError ? err.message : "AI generation failed unexpectedly.";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }

  let rawItems: unknown[];
  try {
    rawItems = parseJsonArray(content);
  } catch {
    return NextResponse.json({ ok: false, error: "AI response could not be parsed as JSON. Please try again." }, { status: 502 });
  }

  const indexOfTopic = body.topicId && topic ? ` / ${topic.name}` : "";
  const yearNote = body.previousYear && body.examYear ? `·${body.examYear}` : "";
  const sourceContext = `AI·${boardLabel}·Std ${taxonomy.name}·${subject.name}·${chapter.name}${indexOfTopic}${yearNote}`;

  try {
    const questions = rawItems.slice(0, body.quantity).map((raw, i) => normalizeQuestion(raw, i));
    return NextResponse.json({
      ok: true,
      context: {
        classLevelId: taxonomy.id,
        subjectId: subject.id,
        chapterId: chapter.id,
        topicId: topic?.id ?? null,
        medium: body.medium,
        questionType: body.questionType,
        previousYear: body.previousYear,
        examYear: body.examYear ?? null,
        sourceContext,
        school: { id: schoolId, name: school?.name, board: boardLabel, academicYear: school?.academicYear },
      },
      questions,
    });
  } catch {
    return NextResponse.json({ ok: false, error: "Generated questions were invalid. Please try again." }, { status: 502 });
  }
}