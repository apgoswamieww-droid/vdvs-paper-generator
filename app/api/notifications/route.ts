import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getNotifications, sweepReminders } from "@/lib/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ------------------------------------------------------------------
//  GET /api/notifications?limit=&offset=&unread=1
//  Feed for the header bell (polled every ~30s by open tabs).
//  Also drives the lazy reminder sweep — there is no job runner in
//  this app, so overdue-review nudges are computed here, throttled
//  per school inside sweepReminders().
// ------------------------------------------------------------------

export async function GET(request: Request) {
  const user = await getSession();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") ?? "20");
  const offset = Number(url.searchParams.get("offset") ?? "0");
  const unreadOnly = url.searchParams.get("unread") === "1";

  if (user.schoolId) {
    await sweepReminders(user.schoolId);
  }

  try {
    const feed = await getNotifications(user.id, {
      limit: Number.isFinite(limit) ? limit : 20,
      offset: Number.isFinite(offset) ? offset : 0,
      unreadOnly,
    });
    return NextResponse.json({ ok: true, ...feed });
  } catch {
    return NextResponse.json({ error: "Could not load notifications." }, { status: 500 });
  }
}
