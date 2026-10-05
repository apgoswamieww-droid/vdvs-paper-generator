import { NextResponse } from "next/server";
import { omniStatus } from "@/lib/ai/omniroutes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ------------------------------------------------------------------
//  GET /api/ai/status
//  Lightweight health probe for the local OmniRoute gateway. Powers
//  the admin-facing status indicator on the AI generator page.
//  Session is enforced by middleware (route is not in publicPaths).
// ------------------------------------------------------------------

export async function GET() {
  const gateway = await omniStatus();
  return NextResponse.json({ ok: true, gateway });
}
