import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { markNotificationsRead } from "@/lib/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const readSchema = z.object({
  id: z.string().trim().min(1).optional(),
  all: z.boolean().optional(),
});

// ------------------------------------------------------------------
//  POST /api/notifications/read  { id } | { all: true }
// ------------------------------------------------------------------

export async function POST(request: Request) {
  const user = await getSession();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const parsed = readSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }
  if (!parsed.data.id && !parsed.data.all) {
    return NextResponse.json({ error: "Pass an id or all: true." }, { status: 400 });
  }

  try {
    const result = await markNotificationsRead(user.id, parsed.data.all ? undefined : parsed.data.id);
    return NextResponse.json({ ok: true, ...result });
  } catch {
    return NextResponse.json({ error: "Could not update notifications." }, { status: 500 });
  }
}
