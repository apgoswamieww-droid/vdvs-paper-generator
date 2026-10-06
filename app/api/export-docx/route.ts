import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { normalizePageConfig, pageDimensions, type PageConfig } from "@/lib/paper-page";
import { imagePixelSize, type DocxImage } from "@/lib/docx";
import { buildPaperDocx, type DocxLogo } from "@/lib/paper-docx";
import { normalizeHeaderConfig } from "@/lib/paper-header";
import { normalizeSetCount } from "@/lib/paper-sets";
import {
  documentFileSuffix,
  isPaperDocumentType,
  type PaperDocumentType,
} from "@/lib/paper-document";

// ============================================================
//  POST /api/export-docx
//  Body: { paperId: string, documentType?: "paper" | "answer-key" | "solution" | "omr",
//          includeAnswerKey?: boolean, pageOverrides?: PageConfig,
//          setCount?: number }
//
//  Renders the requested document (paper, answer key or solution)
//  as a Word (.docx) file, honoring the selected heading template,
//  page setup and the paper's set count (Set A / Set B … are
//  reshuffled per set, matching the PDF engine). No third-party
//  dependency — the OOXML package is assembled in lib/docx.ts.
// ============================================================

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    const body = await request.json();
    const {
      paperId,
      includeAnswerKey = false,
      pageOverrides,
      documentType: rawDocumentType,
      setCount: rawSetCount,
    } = body;
    const documentType: PaperDocumentType = isPaperDocumentType(rawDocumentType)
      ? rawDocumentType
      : "paper";

    // The OMR sheet's layout depends on exact print geometry (registration
    // marks, fixed bubble columns) and only ships as a PDF; the export dialog
    // disables the Word option for it. Guard the route too.
    if (documentType === "omr") {
      return NextResponse.json(
        { error: "OMR sheet exports as PDF only." },
        { status: 400 }
      );
    }

    if (!paperId) {
      return NextResponse.json({ error: "paperId is required" }, { status: 400 });
    }

    const paper = await prisma.paper.findFirst({
      where: { id: paperId, schoolId: session.schoolId },
      select: {
        id: true,
        title: true,
        setCount: true,
        totalMarks: true,
        duration: true,
        instructions: true,
        pageConfig: true,
        createdAt: true,
        headerTemplate: { select: { config: true } },
        subject: {
          select: { name: true, classLevel: { select: { name: true } } },
        },
        school: {
          select: {
            name: true,
            logoUrl: true,
            address: true,
            phone: true,
            board: true,
            academicYear: true,
            headerConfig: true,
          },
        },
        sections: {
          orderBy: { order: "asc" },
          select: {
            title: true,
            instructions: true,
            totalMarks: true,
            questions: {
              orderBy: { order: "asc" },
              select: {
                marksOverride: true,
                question: {
                  select: {
                    questionText: true,
                    questionType: true,
                    marks: true,
                    options: true,
                    answerKey: true,
                    explanation: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!paper) {
      return NextResponse.json({ error: "Paper not found" }, { status: 404 });
    }

    const pageConfig: PageConfig = normalizePageConfig(pageOverrides ?? paper.pageConfig);

    // Sets: the request may override the paper's own set count.
    const setCount = normalizeSetCount(rawSetCount ?? paper.setCount);

    // Heading: the paper's chosen template wins, then the school default.
    const headerConfig = paper.headerTemplate?.config ?? paper.school?.headerConfig ?? null;

    // Best-effort: embed the school logo, but only when the header shows one
    // (avoids fetching an image that would never be rendered).
    const hasLogoRow = normalizeHeaderConfig(headerConfig).rows.some(
      (row) => row.type === "cells" && row.cells.some((c) => c.content.type === "logo")
    );
    const logo = hasLogoRow
      ? await resolveLogo(paper.school?.logoUrl ?? null, headerConfig, pageConfig)
      : null;

    const docx = buildPaperDocx(
      {
        id: paper.id,
        title: paper.title,
        totalMarks: paper.totalMarks,
        duration: paper.duration,
        instructions: paper.instructions,
        headerConfig,
        createdAt: paper.createdAt,
        subject: paper.subject,
        school: paper.school,
        sections: paper.sections,
      },
      { includeAnswerKey, pageConfig, logo, documentType, setCount }
    );

    const baseName = paper.title.replace(/[^a-zA-Z0-9]/g, "_") || "paper";
    const setsSuffix = setCount > 1 ? "_all_sets" : "";

    return new Response(new Uint8Array(docx), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${baseName}${documentFileSuffix(documentType)}${setsSuffix}.docx"`,
      },
    });
  } catch (error) {
    console.error("DOCX export error:", error);
    return NextResponse.json(
      { error: "Failed to generate the Word file. Please try again." },
      { status: 500 }
    );
  }
}

// ============================================================
//  Logo resolution — data URL first, then a best-effort fetch
// ============================================================

async function resolveLogo(
  logoUrl: string | null,
  headerConfig: unknown,
  pageConfig: PageConfig
): Promise<DocxLogo | null> {
  if (!logoUrl) return null;

  const image = await loadImage(logoUrl);
  if (!image) return null;

  const size = imagePixelSize(image.data, image.contentType);
  const { widthMm } = pageDimensions(pageConfig);
  const contentWidthPt = ((widthMm - pageConfig.margins.left - pageConfig.margins.right) * 72) / 25.4;

  // The header's logo row carries the intended height in px (CSS px = 0.75pt).
  const rowHeightPx = findLogoRowHeight(headerConfig) ?? 80;
  let heightPt = rowHeightPx * 0.75;

  let widthPt = heightPt;
  if (size && size.height > 0) {
    widthPt = (heightPt * size.width) / size.height;
  }

  // Never let the logo overflow the printable width.
  if (widthPt > contentWidthPt) {
    const scale = contentWidthPt / widthPt;
    widthPt *= scale;
    heightPt *= scale;
  }

  return { ...image, widthPt, heightPt };
}

function findLogoRowHeight(headerConfig: unknown): number | null {
  for (const row of normalizeHeaderConfig(headerConfig).rows) {
    if (row.type !== "cells") continue;
    const logoCell = row.cells.find((c) => c.content.type === "logo");
    if (logoCell && logoCell.content.type === "logo") return logoCell.content.height;
  }
  return null;
}

async function loadImage(url: string): Promise<DocxImage | null> {
  try {
    const dataUrl = /^data:(image\/(?:png|jpeg|jpg));base64,(.+)$/i.exec(url);
    if (dataUrl) {
      const contentType: DocxImage["contentType"] = /png/i.test(dataUrl[1])
        ? "image/png"
        : "image/jpeg";
      return {
        fileName: "",
        data: new Uint8Array(Buffer.from(dataUrl[2], "base64")),
        contentType,
      };
    }

    if (!/^https?:\/\//i.test(url)) return null;

    const res = await fetch(url);
    if (!res.ok) return null;

    const header = res.headers.get("content-type") ?? "";
    if (!/image\/(png|jpe?g)/i.test(header)) return null;

    const contentType: DocxImage["contentType"] = /png/i.test(header) ? "image/png" : "image/jpeg";
    return {
      fileName: "",
      data: new Uint8Array(await res.arrayBuffer()),
      contentType,
    };
  } catch {
    return null;
  }
}
