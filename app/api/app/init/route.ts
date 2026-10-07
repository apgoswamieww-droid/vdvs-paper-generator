import { NextResponse } from "next/server";
import { readAppConfig, toInitPayload } from "@/lib/app-config";

export const runtime = "nodejs";
// Fresh on every boot check — a maintenance flip must reach clients immediately.
export const dynamic = "force-dynamic";

/**
 * GET /api/app/init — PUBLIC (listed in middleware `publicPaths`).
 *
 * React Native calls this as soon as it launches:
 *   - maintenance_mode=true  → show the Under Maintenance screen
 *   - installed version < android/ios version while the matching
 *     compulsory_update flag is on → force the user to the store
 *
 * Reply: { maintenance_mode, android: { version, compulsory_update },
 *          ios: { version, compulsory_update }, updated_at }
 */
export async function GET() {
  try {
    const config = await readAppConfig();
    return NextResponse.json(toInitPayload(config), { status: 200 });
  } catch (err) {
    console.error("[/api/app/init] failed", err);
    return NextResponse.json(
      { error: "Could not load app configuration." },
      { status: 500 }
    );
  }
}
