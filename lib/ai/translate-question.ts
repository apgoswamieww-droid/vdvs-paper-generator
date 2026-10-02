// ============================================================
//  Question translation — bilingual pair generation via OmniRoute.
//
//  Shared by the /api/ai/translate-question route and the
//  autoTranslateCreatePair server action: one English⇄Gujarati
//  translation pass over a question's content fields, keeping
//  LaTeX math, option labels and markdown structure intact.
// ============================================================

import { z } from "zod";
import { omniChat, OmniRouteError } from "@/lib/ai/omniroutes";

export type TranslateTargetLanguage = "Gujarati" | "English";

export const TRANSLATE_SYSTEM_PROMPT = `You are a professional bilingual exam translator (English ⇄ Gujarati) for Indian school question papers.

Translate this educational question accurately into {{TARGET}} preserving all LaTeX math formulas, variables, and markdown formatting.

Strict rules:
- Respond with ONLY a valid JSON object. No markdown fences, no commentary, no trailing text.
- Response shape: {"questionText": string, "options": [{"label": "A", "text": string, "isCorrect": bool}, ...], "matchPairs": [{"left": string, "right": string}, ...], "answerKey": string, "explanation": string}
- Omit any key that was absent from the request payload.
- Translate ALL human-readable text into {{TARGET}}: question text, option texts, match-pair columns, answer prose and the explanation.
- Keep unchanged, exactly as given: option labels (A, B, C, ...), the isCorrect flags, option/pair count and order, numbers, LaTeX/KaTeX expressions such as $x^2$ or \\frac{1}{2}, markdown formatting (bold, lists, tables) and variable names.
- Never invent, drop or reorder content — this is a faithful translation, not a rewrite.
- answerKey, when provided, is free prose: translate it.`;

const translatedSchema = z.object({
  questionText: z.string().min(1),
  options: z
    .array(
      z.object({
        label: z.string().min(1).max(10),
        text: z.string().min(1),
        isCorrect: z.boolean(),
      })
    )
    .optional(),
  matchPairs: z
    .array(z.object({ left: z.string().min(1), right: z.string().min(1) }))
    .optional(),
  answerKey: z.string().optional(),
  explanation: z.string().optional(),
});

export type TranslatedQuestion = z.infer<typeof translatedSchema>;

export type TranslateQuestionInput = {
  targetLanguage: TranslateTargetLanguage;
  questionType: string;
  questionText: string;
  options?: { label: string; text: string; isCorrect: boolean }[] | null;
  matchPairs?: { left: string; right: string }[] | null;
  /** Free-text answer to translate. Omit (null) for label/enum answers —
   *  MCQ labels, TRUE/FALSE values and numeric answers stay as they are. */
  answerKey?: string | null;
  explanation?: string | null;
};

function stripFencedJson(content: string): string {
  const text = content.trim();
  const fences = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fences) return fences[1]!.trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end > start) return text.slice(start, end + 1);
  return text;
}

export async function translateQuestion(
  input: TranslateQuestionInput
): Promise<TranslatedQuestion> {
  const payload: Record<string, unknown> = {
    questionText: input.questionText,
  };
  if (input.options?.length) payload.options = input.options;
  if (input.matchPairs?.length) payload.matchPairs = input.matchPairs;
  if (input.answerKey?.trim()) payload.answerKey = input.answerKey;
  if (input.explanation?.trim()) payload.explanation = input.explanation;

  const content = await omniChat({
    system: TRANSLATE_SYSTEM_PROMPT.replaceAll("{{TARGET}}", input.targetLanguage),
    user: `Question type: ${input.questionType}\nTarget language: ${input.targetLanguage}\nTranslate the question below into ${input.targetLanguage}:\n${JSON.stringify(payload)}`,
    temperature: 0.2,
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFencedJson(content));
  } catch {
    throw new OmniRouteError(
      "AI translation returned an unreadable response. Please try again."
    );
  }
  const result = translatedSchema.safeParse(parsed);
  if (!result.success) {
    throw new OmniRouteError(
      "AI translation returned an unexpected shape. Please try again."
    );
  }

  const out = result.data;
  // Fidelity checks: a translation must never change the question's structure.
  if (input.options?.length && (!out.options || out.options.length !== input.options.length)) {
    throw new OmniRouteError(
      "AI translation changed the number of options. Please try again."
    );
  }
  if (
    input.matchPairs?.length &&
    (!out.matchPairs || out.matchPairs.length !== input.matchPairs.length)
  ) {
    throw new OmniRouteError(
      "AI translation changed the number of match pairs. Please try again."
    );
  }
  return out;
}
