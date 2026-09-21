import { NextResponse } from "next/server";

/**
 * GET /api/health
 * Health check endpoint — returns service status.
 * Useful for monitoring, deployment checks, and uptime services.
 */
export async function GET() {
  return NextResponse.json(
    {
      status: "ok",
      service: "school-paper-gen",
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
    },
    { status: 200 }
  );
}
