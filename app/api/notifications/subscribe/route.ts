import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const subscribeSchema = z.object({
  endpoint: z.string().url().max(2048),
  keys: z.object({
    p256dh: z.string().min(1).max(512),
    auth: z.string().min(1).max(512),
  }),
  platform: z.string().trim().max(20).optional().default("WEB"),
});

const unsubscribeSchema = z.object({
  endpoint: z.string().url().max(2048),
});

// ------------------------------------------------------------------
//  POST /api/notifications/subscribe   — store the browser push
//  subscription returned by pushManager.subscribe(). Keyed by
//  endpoint so re-subscribing (new keys, same device) upserts.
//  DELETE /api/notifications/subscribe — called on opt-out.
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

  const parsed = subscribeSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid subscription payload." }, { status: 400 });
  }

  const { endpoint, keys, platform } = parsed.data;
  const userAgent = request.headers.get("user-agent")?.slice(0, 255) ?? null;

  try {
    const row = await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: {
        userId: user.id,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        platform,
        userAgent,
        lastSeenAt: new Date(),
      },
      update: {
        userId: user.id,
        p256dh: keys.p256dh,
        auth: keys.auth,
        platform,
        userAgent,
        lastSeenAt: new Date(),
      },
      select: { id: true },
    });
    return NextResponse.json({ ok: true, id: row.id });
  } catch {
    return NextResponse.json({ error: "Could not save the subscription." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
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

  const parsed = unsubscribeSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  try {
    const result = await prisma.pushSubscription.deleteMany({
      where: { endpoint: parsed.data.endpoint, userId: user.id },
    });
    return NextResponse.json({ ok: true, removed: result.count });
  } catch {
    return NextResponse.json({ error: "Could not remove the subscription." }, { status: 500 });
  }
}
