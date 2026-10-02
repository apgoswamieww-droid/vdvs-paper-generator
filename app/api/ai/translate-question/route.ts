import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/session";
import { OmniRouteError } from "@/lib/ai/omniroutes";
import { translateQuestion } from "@/lib/ai/translate-question";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ------------------------------------------------------------------
//  POST /api/ai/translate-question
//  Stateless English ⇄ Gujarati translation of one question's content
//  via the local OmniRoute gateway. Creates nothing — persistence is
//  the autoTranslateCreatePair server action's job.
// ------------------------------------------------------------------

const translateBodySchema = z.object({
  targetLanguage: z.enum(["Gujarati", "English"]),
  questionType: z.string().trim().min(1).max(40),
  questionText: z.string().trim().min(1).max(8000),
  options: z
    .array(
      z.object({
        label: z.string().min(1).max(10),
        text: z.string().min(1).max(2000),
        isCorrect: z.boolean(),
      })
    )
    .max(6)
    .optional()
    .nullable(),
  matchPairs: z
    .array(z.object({ left: z.string().min(1).max(2000), right: z.string().min(1).max(2000) }))
    .max(10)
    .optional()
    .nullable(),
  answerKey: z.string().max(8000).optional().nullable(),
  explanation: z.string().max(8000).optional().nullable(),
});

export async function POST(req: Request) {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  let body: z.infer<typeof translateBodySchema>;
  try {
    body = translateBodySchema.parse(await req.json());
  } catch (err) {
    const message =
      err instanceof z.ZodError
        ? err.issues[0]?.message ?? "Invalid request payload."
        : "Invalid request payload.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }

  try {
    const translated = await translateQuestion({
      targetLanguage: body.targetLanguage,
      questionType: body.questionType,
      questionText: body.questionText,
      options: body.options ?? null,
      matchPairs: body.matchPairs ?? null,
      answerKey: body.answerKey ?? null,
      explanation: body.explanation ?? null,
    });
    return NextResponse.json({ ok: true, translated });
  } catch (err) {
    const message =
      err instanceof OmniRouteError ? err.message : "AI translation failed unexpectedly.";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
