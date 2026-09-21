/**
 * prisma/seed.ts
 *
 * Database seed script for development.
 * Run with: npm run db:seed
 */

import { PrismaClient, UserRole, PlanTier, QuestionType, DifficultyLevel, BloomLevel } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Demo credentials (dev only — rotate before any real deployment)
const DEMO_PASSWORD = "Demo@123";
const DEMO_USERS = [
  { name: "Admin User", email: "admin@demohighschool.edu", role: UserRole.SCHOOL_ADMIN },
  { name: "Jane Smith", email: "teacher@demohighschool.edu", role: UserRole.TEACHER },
] as const;

const STD_NAMES = ["Std 6", "Std 7", "Std 8", "Std 9", "Std 10", "Std 11", "Std 12"];

async function main() {
  console.log("🌱 Starting seed...");

  // ------------------------------------------------------------------
  // 1. Demo School (Tenant)
  // ------------------------------------------------------------------
  const school = await prisma.school.upsert({
    where: { slug: "demo-school" },
    update: {},
    create: {
      name: "Demo High School",
      slug: "demo-school",
      address: "123 Education Lane, Knowledge City",
      phone: "+91-9999999999",
      website: "https://demohighschool.edu",
      planTier: PlanTier.PRO,
      isActive: true,
    },
  });

  console.log(`✅ School created: ${school.name} (id: ${school.id})`);

  // ------------------------------------------------------------------
  // 2. Users
  // ------------------------------------------------------------------
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  const users = await Promise.all(
    DEMO_USERS.map((u) =>
      prisma.user.upsert({
        where: { email: u.email },
        // update keeps existing users' hashes in sync with DEMO_PASSWORD on re-run
        update: { passwordHash, name: u.name, role: u.role },
        create: {
          name: u.name,
          email: u.email,
          passwordHash,
          role: u.role,
          schoolId: school.id,
          isActive: true,
        },
      })
    )
  );

  const [admin, teacher] = users;
  console.log(`✅ Users ready (password: ${DEMO_PASSWORD}): ${admin.email}, ${teacher.email}`);

  // ------------------------------------------------------------------
  // 3. Class levels Std 6–12
  // ------------------------------------------------------------------
  const classLevels = await Promise.all(
    STD_NAMES.map((name, i) =>
      prisma.classLevel.upsert({
        where: { schoolId_name: { schoolId: school.id, name } },
        update: {},
        create: { name, order: i + 1, schoolId: school.id },
      })
    )
  );

  console.log(`✅ ${classLevels.length} class levels created (Std 6–12)`);

  const std10 = classLevels.find((c) => c.name === "Std 10")!;

  // ------------------------------------------------------------------
  // 4. Subjects under Std 10
  // ------------------------------------------------------------------
  const subjects = await Promise.all([
    prisma.subject.upsert({
      where: { classLevelId_name: { classLevelId: std10.id, name: "Mathematics" } },
      update: {},
      create: { name: "Mathematics", code: "MATH10", classLevelId: std10.id, schoolId: school.id },
    }),
    prisma.subject.upsert({
      where: { classLevelId_name: { classLevelId: std10.id, name: "Science" } },
      update: {},
      create: { name: "Science", code: "SCI10", classLevelId: std10.id, schoolId: school.id },
    }),
    prisma.subject.upsert({
      where: { classLevelId_name: { classLevelId: std10.id, name: "English" } },
      update: {},
      create: { name: "English", code: "ENG10", classLevelId: std10.id, schoolId: school.id },
    }),
  ]);

  console.log(`✅ ${subjects.length} subjects created under Std 10`);

  // ------------------------------------------------------------------
  // 5. Chapters + topics for Mathematics
  // ------------------------------------------------------------------
  const mathSubject = subjects[0];

  const chapters = await Promise.all([
    prisma.chapter.upsert({
      where: { subjectId_name: { subjectId: mathSubject.id, name: "Algebra" } },
      update: {},
      create: { name: "Algebra", order: 1, subjectId: mathSubject.id },
    }),
    prisma.chapter.upsert({
      where: { subjectId_name: { subjectId: mathSubject.id, name: "Geometry" } },
      update: {},
      create: { name: "Geometry", order: 2, subjectId: mathSubject.id },
    }),
    prisma.chapter.upsert({
      where: { subjectId_name: { subjectId: mathSubject.id, name: "Trigonometry" } },
      update: {},
      create: { name: "Trigonometry", order: 3, subjectId: mathSubject.id },
    }),
  ]);

  const [linearEq, triangles] = await Promise.all([
    prisma.topic.upsert({
      where: { chapterId_name: { chapterId: chapters[0].id, name: "Linear Equations" } },
      update: {},
      create: { name: "Linear Equations", order: 1, chapterId: chapters[0].id },
    }),
    prisma.topic.upsert({
      where: { chapterId_name: { chapterId: chapters[1].id, name: "Triangle Properties" } },
      update: {},
      create: { name: "Triangle Properties", order: 1, chapterId: chapters[1].id },
    }),
  ]);

  console.log(`✅ ${chapters.length} chapters + 2 topics created`);

  // ------------------------------------------------------------------
  // 6. Sample questions (varied types, incl. Gujarati + KaTeX)
  // ------------------------------------------------------------------
  const questionCount = await prisma.question.count({ where: { schoolId: school.id } });
  if (questionCount > 0) {
    console.log(`⏭️  ${questionCount} questions already exist — skipping sample questions`);
    console.log("\n🎉 Seed complete! You can now run: npm run dev");
    return;
  }

  await prisma.question.create({
    data: {
      questionText: "What is the value of x if 2x + 5 = 15?",
      questionType: QuestionType.MCQ,
      difficulty: DifficultyLevel.EASY,
      bloomLevel: BloomLevel.APPLY,
      marks: 1,
      options: {
        kind: "mcq",
        choices: [
          { label: "A", text: "x = 3", isCorrect: false },
          { label: "B", text: "x = 5", isCorrect: true },
          { label: "C", text: "x = 7", isCorrect: false },
          { label: "D", text: "x = 10", isCorrect: false },
        ],
      },
      answerKey: "B",
      explanation: "2x = 15 - 5 = 10, so x = 5",
      tags: ["algebra", "linear-equations"],
      schoolId: school.id,
      subjectId: mathSubject.id,
      chapterId: chapters[0].id,
      topicId: linearEq.id,
    },
  });

  await prisma.question.create({
    data: {
      questionText: "Solve: $\\frac{d}{dx}(x^2 + 3x) = ?$ (simplify before solving)",
      questionType: QuestionType.SHORT_ANSWER,
      difficulty: DifficultyLevel.MEDIUM,
      bloomLevel: BloomLevel.UNDERSTAND,
      marks: 2,
      answerKey: "2x + 3",
      explanation: "Differentiate term by term.",
      tags: ["calculus-basics"],
      previousYearTag: "GSEB 2023",
      schoolId: school.id,
      subjectId: mathSubject.id,
      chapterId: chapters[0].id,
    },
  });

  await prisma.question.create({
    data: {
      questionText:
        "ગુજરાતીમાં: ત્રિભુજના ત્રણ ખૂણાના માપનો સરવાળો કેટલો થાય? (What is the sum of angles of a triangle?)",
      questionType: QuestionType.SHORT_ANSWER,
      difficulty: DifficultyLevel.EASY,
      bloomLevel: BloomLevel.REMEMBER,
      marks: 1,
      answerKey: "180°",
      tags: ["geometry", "gujarati"],
      schoolId: school.id,
      subjectId: mathSubject.id,
      chapterId: chapters[1].id,
      topicId: triangles.id,
    },
  });

  await prisma.question.create({
    data: {
      questionText:
        "A school plants trees along a straight path such that the first tree is 2 m from the gate and each subsequent tree is 3 m further. Derive a formula for the distance of the n-th tree and compute the distance for n = 10.",
      questionType: QuestionType.CASE_STUDY,
      caseStudyFormat: "INLINE",
      difficulty: DifficultyLevel.HARD,
      bloomLevel: BloomLevel.ANALYZE,
      marks: 5,
      answerKey: "d(n) = 2 + (n-1)·3; d(10) = 29 m",
      explanation: "This is an arithmetic progression: d(n) = a + (n-1)d.",
      tags: ["ap", "case-study", "real-world"],
      previousYearTag: "Board 2024",
      schoolId: school.id,
      subjectId: mathSubject.id,
      chapterId: chapters[0].id,
    },
  });

  console.log("✅ 4 sample questions created");

  console.log("\n🎉 Seed complete! You can now run: npm run dev");
  console.log("   Login: admin@demohighschool.edu");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error("❌ Seed failed:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
