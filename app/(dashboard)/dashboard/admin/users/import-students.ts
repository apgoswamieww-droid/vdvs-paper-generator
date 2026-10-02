"use server";

// ============================================================
//  Bulk Import Students (.xlsx)
//
//  School-admin only. Parses the uploaded Excel workbook (the
//  downloadable template), validates every row, then creates
//  STUDENT users in one transaction (with the audit row).
//
//  Password column is optional:
//    • filled  → that exact password is used
//    • empty   → a secure password is generated and returned ONCE
//                in the result (also included in the welcome email
//                when email is configured)
//
//  Every finished import writes a `question_imports` audit row so
//  it appears alongside question-import history.
//
//  Column contract (template: /api/student-import-template):
//    A  Full Name *       B  Email *        C  Password (optional)
//    D  Class Name *      E  Roll Number    F  Phone
//  `Class Name` must match an existing class of this school
//  (e.g. "Std 6"). Roll Number / Phone are kept optional.
// ============================================================

import ExcelJS from "exceljs";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { Prisma, type ImportStatus } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { sendEmail, studentCredentialsEmail } from "@/lib/email";

const MAX_XLSX_BYTES = 2 * 1024 * 1024; // 2 MB
const EXPECTED_HEADERS = [
  "Full Name",
  "Email",
  "Password",
  "Class Name",
  "Roll Number",
  "Phone",
] as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type StudentRowError = {
  row: number; // Excel row number (header is row 1)
  name: string;
  error: string;
};

/** A generated credential the admin must hand out (only for auto rows). */
export type GeneratedCredential = {
  row: number;
  name: string;
  email: string;
  password: string;
};

export type StudentImportResult = {
  success: boolean;
  imported: number;
  failed: number;
  total: number;
  errors: StudentRowError[];
  /** Plaintext passwords for rows where the sheet left Password empty. */
  generatedCredentials: GeneratedCredential[];
  /** How many welcome emails were actually sent (0 when email unconfigured). */
  emailsSent: number;
  importId?: string;
  error?: string; // set when the whole upload failed
};

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    if ("text" in value && typeof value.text === "string") return value.text;
    if ("result" in value && value.result !== null && value.result !== undefined) {
      return String(value.result);
    }
    if (value instanceof Date) return value.toISOString();
    return "";
  }
  return String(value);
}

/**
 * Generated password: 3 groups of 4 base32-ish chars — easy to read aloud,
 * no ambiguous glyphs (no 0/O/1/I). ~45 bits of entropy.
 */
function generatePassword(): string {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const bytes = randomBytes(12);
  const chars = [...bytes].map((b) => alphabet[b % alphabet.length]);
  return `${chars.slice(0, 4).join("")}-${chars.slice(4, 8).join("")}-${chars.slice(8, 12).join("")}`;
}

function statusFor(imported: number, failed: number): ImportStatus {
  if (imported > 0 && failed === 0) return "COMPLETED";
  if (imported > 0) return "PARTIAL";
  return "FAILED";
}

export async function importStudentsFromExcel(
  formData: FormData
): Promise<StudentImportResult> {
  let session;
  try {
    session = await requireSession();
  } catch {
    return empty("Unauthorized.");
  }

  // School admins manage their own school's users only.
  if (session.role !== "SCHOOL_ADMIN") {
    return empty("Only school admins can bulk import students.");
  }
  const schoolId = session.schoolId;

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return empty("Choose an .xlsx file to upload.");
  }
  if (file.size > MAX_XLSX_BYTES) {
    return empty("File too large (max 2 MB).");
  }
  if (!/\.(xlsx|xlsm)$/i.test(file.name)) {
    return empty("Only Microsoft Excel .xlsx files are supported.");
  }

  // ── Parse the workbook ──
  const rows: { row: number; name: string; email: string; password: string; className: string }[] = [];
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);

    const sheet = workbook.worksheets[0];
    if (!sheet) return empty("The workbook has no sheets.");

    // Header row must contain all template headers (order-insensitive).
    const headerRow = sheet.getRow(1);
    const headerTexts = new Set<string>();
    headerRow.eachCell((cell) => {
      headerTexts.add(cellText(cell.value).trim().toLowerCase());
    });
    if (EXPECTED_HEADERS.some((h) => !headerTexts.has(h.toLowerCase()))) {
      return empty(
        "The file's columns do not match the template. Download the template and fill it in without renaming the headers."
      );
    }

    const headerIndex = new Map<string, number>();
    headerRow.eachCell((cell, col) => {
      const text = cellText(cell.value).trim().toLowerCase();
      if (text) headerIndex.set(text, col);
    });
    const col = (name: string) => headerIndex.get(name.toLowerCase()) ?? 0;

    const nameCol = col("Full Name");
    const emailCol = col("Email");
    const passwordCol = col("Password");
    const classCol = col("Class Name");

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const name = cellText(row.getCell(nameCol).value).trim();
      const email = cellText(row.getCell(emailCol).value).trim().toLowerCase();
      const password = cellText(row.getCell(passwordCol).value).trim();
      const className = cellText(row.getCell(classCol).value).trim();

      // Skip fully empty rows silently.
      if (!name && !email && !password && !className) return;

      rows.push({ row: rowNumber, name, email, password, className });
    });
  } catch {
    return empty("Could not read the file — make sure it is a valid .xlsx workbook.");
  }

  if (rows.length === 0) {
    return empty("The sheet has no student rows.");
  }
  if (rows.length > 500) {
    return empty("Too many rows — import at most 500 students per file.");
  }

  const total = rows.length;

  // ── Per-row validation ──
  const errors: StudentRowError[] = [];
  const valid: {
    row: number;
    name: string;
    email: string;
    password: string; // plaintext (needed for the email)
    autoPassword: boolean;
    passwordHash: string;
    className: string;
  }[] = [];

  for (const r of rows) {
    const fail = (error: string) => errors.push({ row: r.row, name: r.name || "(blank)", error });

    if (!r.name) fail("Full Name is required.");
    else if (r.name.length > 80) fail("Full Name is too long (max 80 characters).");

    if (!r.email) fail("Email is required.");
    else if (!EMAIL_RE.test(r.email)) fail(`"${r.email}" is not a valid email address.`);
    else if (r.email.length > 160) fail("Email is too long.");

    if (r.password && r.password.length < 8) {
      fail("Password must be at least 8 characters (or leave it empty to auto-generate).");
    }

    if (!r.className) fail("Class Name is required.");

    if (errors.some((e) => e.row === r.row)) continue;

    // Empty Password column → generate one and report it back.
    const autoPassword = !r.password;
    const password = autoPassword ? generatePassword() : r.password;

    valid.push({
      row: r.row,
      name: r.name,
      email: r.email,
      password,
      autoPassword,
      passwordHash: await bcrypt.hash(password, 12),
      className: r.className.trim(),
    });
  }

  // Duplicate emails within the sheet.
  const seen = new Map<string, number>();
  for (const v of valid) {
    const firstRow = seen.get(v.email);
    if (firstRow !== undefined) {
      errors.push({ row: v.row, name: v.name, error: `Duplicate email — already used on row ${firstRow}.` });
    } else {
      seen.set(v.email, v.row);
    }
  }
  const uniqueValid = valid.filter((v) => !errors.some((e) => e.row === v.row));

  // Resolve the mentioned classes (case-insensitive) against this school's classes.
  const classLevels = await prisma.classLevel.findMany({
    where: {
      schoolId,
      name: {
        in: [...new Set(uniqueValid.map((v) => v.className))],
        mode: "insensitive",
      },
    },
    select: { id: true, name: true },
  });
  const classIdByName = new Map(classLevels.map((c) => [c.name.trim().toLowerCase(), c.id]));

  // Emails that already exist anywhere in the school (any role).
  const existingUsers = await prisma.user.findMany({
    where: { schoolId, email: { in: uniqueValid.map((v) => v.email) } },
    select: { email: true },
  });
  const existingEmails = new Set(existingUsers.map((u) => u.email.toLowerCase()));

  const creatable: {
    row: number;
    name: string;
    email: string;
    password: string;
    autoPassword: boolean;
    passwordHash: string;
    classLevelId: string;
  }[] = [];
  for (const v of uniqueValid) {
    if (existingEmails.has(v.email)) {
      errors.push({ row: v.row, name: v.name, error: `${v.email} is already registered in this school.` });
      continue;
    }
    const classLevelId = classIdByName.get(v.className.toLowerCase());
    if (!classLevelId) {
      errors.push({
        row: v.row,
        name: v.name,
        error: `Class "${v.className}" was not found. Use an existing class name (see Classes & Subjects).`,
      });
      continue;
    }
    creatable.push({
      row: v.row,
      name: v.name,
      email: v.email,
      password: v.password,
      autoPassword: v.autoPassword,
      passwordHash: v.passwordHash,
      classLevelId,
    });
  }

  const generatedCredentials: GeneratedCredential[] = creatable
    .filter((v) => v.autoPassword)
    .map((v) => ({ row: v.row, name: v.name, email: v.email, password: v.password }));

  if (creatable.length === 0) {
    // Audit the failed attempt too.
    const audit = await prisma.questionImport.create({
      data: {
        fileName: file.name,
        kind: "STUDENT",
        status: "FAILED",
        totalCount: total,
        successCount: 0,
        failedCount: total,
        errors: errors as unknown as Prisma.InputJsonValue,
        schoolId,
        userId: session.id,
      },
      select: { id: true },
    });
    return {
      success: false,
      imported: 0,
      failed: total,
      total,
      errors,
      generatedCredentials: [],
      emailsSent: 0,
      importId: audit.id,
      error: "No rows could be imported — fix the errors and try again.",
    };
  }

  // ── Create the students + audit row in one transaction ──
  const importedStudents: { name: string; email: string; password: string; classLevelId: string }[] = [];
  try {
    await prisma.$transaction(async (tx) => {
      for (const v of creatable) {
        await tx.user.create({
          data: {
            name: v.name,
            email: v.email,
            passwordHash: v.passwordHash,
            role: "STUDENT",
            schoolId,
            isActive: true,
            classLevelId: v.classLevelId,
            // Force a password change on first login.
            mustChangePassword: true,
          },
          select: { id: true },
        });
        importedStudents.push({
          name: v.name,
          email: v.email,
          password: v.password,
          classLevelId: v.classLevelId,
        });
      }

      const status = statusFor(creatable.length, errors.length);
      await tx.questionImport.create({
        data: {
          fileName: file.name,
          kind: "STUDENT",
          status,
          totalCount: total,
          successCount: creatable.length,
          failedCount: errors.length,
          errors: errors as unknown as Prisma.InputJsonValue,
          schoolId,
          userId: session.id,
        },
      });
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return {
        success: false,
        imported: 0,
        failed: total,
        total,
        errors,
        generatedCredentials: [],
        emailsSent: 0,
        error: "One of the emails is already registered — nothing was imported.",
      };
    }
    return {
      success: false,
      imported: 0,
      failed: total,
      total,
      errors,
      generatedCredentials: [],
      emailsSent: 0,
      error: "Could not create the students. Nothing was imported.",
    };
  }

  // ── Welcome emails — best effort, never blocks the import result ──
  const classNameById = new Map(classLevels.map((c) => [c.id, c.name]));
  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: { name: true },
  });

  let emailsSent = 0;
  for (const s of importedStudents) {
    const mail = studentCredentialsEmail({
      studentName: s.name,
      email: s.email,
      password: s.password,
      className: classNameById.get(s.classLevelId) ?? "",
      schoolName: school?.name ?? "",
    });
    const result = await sendEmail({
      to: s.email,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    });
    if (result.status === "sent") emailsSent += 1;
  }

  revalidatePath("/dashboard/admin/users");
  revalidatePath("/dashboard");

  return {
    success: true,
    imported: creatable.length,
    failed: errors.length,
    total,
    errors,
    generatedCredentials,
    emailsSent,
  };
}

function empty(error: string): StudentImportResult {
  return {
    success: false,
    imported: 0,
    failed: 0,
    total: 0,
    errors: [],
    generatedCredentials: [],
    emailsSent: 0,
    error,
  };
}
