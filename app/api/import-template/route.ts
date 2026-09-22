import { NextResponse } from "next/server";
import { buildImportTemplateDocx, IMPORT_TEMPLATE_FILENAME } from "@/lib/docx-template";
import { requireSession } from "@/lib/session";

// ============================================================
//  GET /api/import-template
//  Downloads the .docx bulk question-import template.
// ============================================================

export async function GET() {
  // Any signed-in user of a school may download the template
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const bytes = buildImportTemplateDocx();

  return new NextResponse(bytes as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${IMPORT_TEMPLATE_FILENAME}"`,
      "Content-Length": String(bytes.length),
      "Cache-Control": "no-store",
    },
  });
}
