import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requireSession } from "@/lib/session";
import prisma from "@/lib/prisma";

// ============================================================
//  GET /api/student-import-template
//  Downloads the .xlsx bulk student-import template.
//  The Class Name column carries a dropdown listing the school's
//  real classes, so admins cannot mistype them.
// ============================================================

export async function GET() {
  let schoolId: string;
  try {
    const session = await requireSession();
    schoolId = session.schoolId;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const classes = await prisma.classLevel.findMany({
    where: { schoolId },
    orderBy: { order: "asc" },
    select: { name: true },
  });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "SchoolPaperGen";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Students");

  // ── Instructions block (rows 1-2 above the header would break parsing,
  //    so it lives in a separate sheet instead) ──
  const info = workbook.addWorksheet("Read me");
  info.getColumn(1).width = 100;
  info.addRow(["How to use this template"]);
  info.addRow([]);
  info.addRow(["1. Fill the 'Students' sheet — one student per row."]);
  info.addRow(["2. Full Name, Email and Class Name are required."]);
  info.addRow(["3. Password is OPTIONAL — leave it empty and a secure password is generated for that student."]);
  info.addRow(["4. Generated passwords are shown after the import and emailed to students (when email is configured)."]);
  info.addRow(["5. Class Name must match one of your school's classes — use the dropdown."]);
  info.addRow(["6. Do not rename or delete the header row."]);
  info.getRow(1).font = { bold: true, size: 12 };

  // ── Header row ──
  const headers = ["Full Name", "Email", "Password", "Class Name", "Roll Number", "Phone"];
  sheet.columns = headers.map((h) => ({ header: h, key: h, width: h === "Full Name" ? 28 : 24 }));
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1E293B" },
  };
  sheet.getRow(1).height = 22;

  // ── Two example rows the admin can overwrite ──
  // Password is optional: leave it empty and a secure password is
  // generated automatically (returned after import + emailed).
  sheet.addRow({
    "Full Name": "Aarav Mehta",
    Email: "aarav@example.com",
    Password: "student123",
    "Class Name": classes[0]?.name ?? "Std 6",
    "Roll Number": "01",
    Phone: "9876500001",
  });
  sheet.addRow({
    "Full Name": "Diya Joshi",
    Email: "diya@example.com",
    Password: "",
    "Class Name": classes[0]?.name ?? "Std 6",
    "Roll Number": "02",
    Phone: "9876500002",
  });

  // ── Data validation: Class Name dropdown (rows 2-500) ──
  if (classes.length > 0) {
    // ExcelJS validation lists must be <= 255 chars; fall back to free text beyond that.
    const list = classes.map((c) => c.name);
    const joined = `"${list.join(",")}"`;
    if (joined.length <= 255) {
      for (let i = 2; i <= 500; i++) {
        sheet.getRow(i).getCell(4).dataValidation = {
          type: "list",
          allowBlank: false,
          formulae: [joined],
          showErrorMessage: true,
          errorStyle: "stop",
          error: "Pick a class from the list (matches your school's classes).",
          errorTitle: "Invalid class",
        };
      }
    }
  }

  // ── Freeze the header row for readability ──
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="student-import-template.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
