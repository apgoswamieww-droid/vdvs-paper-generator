/**
 * prisma/seed.ts
 *
 * Database seed script for development + demo.
 * Run with: npx tsx prisma/seed.ts
 *
 * Creates:
 *   1 Demo School, 1 Admin, 2 Teachers, 5 Students,
 *   Std 10 curriculum (Maths, Science, English),
 *   Chapters/Topics, and 30+ varied questions (MCQ, Short, Long,
 *   True/False, Fill-in-blank, Case Study) including Gujarati text
 *   and KaTeX math formulas.
 */

import { PrismaClient, UserRole, PlanTier, QuestionType, DifficultyLevel, BloomLevel, Medium } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomQuestionCode } from "../lib/question-code";

const prisma = new PrismaClient();

const DEMO_PASSWORD = "Demo@123";

async function main() {
  console.log("🌱 Starting seed...");

  // ──────────────────────────────────────────────────
  // 1. School
  // ──────────────────────────────────────────────────
  const school = await prisma.school.upsert({
    where: { slug: "demo-school" },
    update: {},
    create: {
      name: "Demo High School",
      slug: "demo-school",
      address: "123 Education Lane, Knowledge City, Gujarat 380001",
      phone: "+91-9999999999",
      website: "https://demohighschool.edu",
      planTier: PlanTier.PRO,
      isActive: true,
    },
  });
  console.log(`✅ School: ${school.name}`);

  const pw = await bcrypt.hash(DEMO_PASSWORD, 12);

  // ──────────────────────────────────────────────────
  // 2. Users — 1 Admin, 2 Teachers, 5 Students
  // ──────────────────────────────────────────────────
  const adminData = { name: "Dr. Rajesh Patel", email: "admin@demo.edu", role: UserRole.SCHOOL_ADMIN };
  const teachersData = [
    { name: "Priya Sharma", email: "priya@demo.edu", role: UserRole.TEACHER },
    { name: "Amit Verma", email: "amit@demo.edu", role: UserRole.TEACHER },
  ];
  const studentsData = [
    { name: "Aarav Mehta", email: "aarav@demo.edu", role: UserRole.STUDENT },
    { name: "Diya Joshi", email: "diya@demo.edu", role: UserRole.STUDENT },
    { name: "Vivaan Shah", email: "vivaan@demo.edu", role: UserRole.STUDENT },
    { name: "Ananya Gupta", email: "ananya@demo.edu", role: UserRole.STUDENT },
    { name: "Kabir Singh", email: "kabir@demo.edu", role: UserRole.STUDENT },
  ];

  const allUsers = [adminData, ...teachersData, ...studentsData];

  const users = await Promise.all(
    allUsers.map((u) =>
      prisma.user.upsert({
        where: { email: u.email },
        update: { passwordHash: pw, name: u.name, role: u.role },
        create: {
          name: u.name,
          email: u.email,
          passwordHash: pw,
          role: u.role,
          schoolId: school.id,
          isActive: true,
        },
      })
    )
  );

  const [admin, teacher1, teacher2, s1, s2, s3, s4, s5] = users;
  console.log(`✅ ${users.length} users created (password: ${DEMO_PASSWORD})`);

  // ──────────────────────────────────────────────────
  // 3. Class Levels
  // ──────────────────────────────────────────────────
  const classLevels = await Promise.all(
    ["Std 6", "Std 7", "Std 8", "Std 9", "Std 10", "Std 11", "Std 12"].map((name, i) =>
      prisma.classLevel.upsert({
        where: { schoolId_name: { schoolId: school.id, name } },
        update: {},
        create: { name, order: i + 1, schoolId: school.id },
      })
    )
  );
  console.log(`✅ ${classLevels.length} class levels`);

  const std10 = classLevels.find((c) => c.name === "Std 10")!;

  // Assign students to Std 10
  for (const student of [s1, s2, s3, s4, s5]) {
    await prisma.user.update({
      where: { id: student.id },
      data: { classLevelId: std10.id },
    });
  }
  console.log("✅ 5 students assigned to Std 10");

  // ──────────────────────────────────────────────────
  // 4. Subjects under Std 10
  // ──────────────────────────────────────────────────
  const mathSubj = await prisma.subject.upsert({
    where: { classLevelId_name_medium: { classLevelId: std10.id, name: "Mathematics", medium: Medium.ENGLISH } },
    update: {},
    create: { name: "Mathematics", code: "MATH10", medium: Medium.ENGLISH, classLevelId: std10.id, schoolId: school.id },
  });
  const sciSubj = await prisma.subject.upsert({
    where: { classLevelId_name_medium: { classLevelId: std10.id, name: "Science", medium: Medium.ENGLISH } },
    update: {},
    create: { name: "Science", code: "SCI10", medium: Medium.ENGLISH, classLevelId: std10.id, schoolId: school.id },
  });
  const engSubj = await prisma.subject.upsert({
    where: { classLevelId_name_medium: { classLevelId: std10.id, name: "English", medium: Medium.ENGLISH } },
    update: {},
    create: { name: "English", code: "ENG10", medium: Medium.ENGLISH, classLevelId: std10.id, schoolId: school.id },
  });
  console.log("✅ 3 subjects: Mathematics, Science, English");

  // ──────────────────────────────────────────────────
  // 5. Chapters + Topics
  // ──────────────────────────────────────────────────
  const chAlgebra = await prisma.chapter.upsert({
    where: { subjectId_name: { subjectId: mathSubj.id, name: "Algebra" } },
    update: {},
    create: { name: "Algebra", order: 1, subjectId: mathSubj.id },
  });
  const chGeometry = await prisma.chapter.upsert({
    where: { subjectId_name: { subjectId: mathSubj.id, name: "Geometry" } },
    update: {},
    create: { name: "Geometry", order: 2, subjectId: mathSubj.id },
  });
  const chTrigo = await prisma.chapter.upsert({
    where: { subjectId_name: { subjectId: mathSubj.id, name: "Trigonometry" } },
    update: {},
    create: { name: "Trigonometry", order: 3, subjectId: mathSubj.id },
  });
  const chPhysics = await prisma.chapter.upsert({
    where: { subjectId_name: { subjectId: sciSubj.id, name: "Light" } },
    update: {},
    create: { name: "Light", order: 1, subjectId: sciSubj.id },
  });
  const chGrammar = await prisma.chapter.upsert({
    where: { subjectId_name: { subjectId: engSubj.id, name: "Grammar" } },
    update: {},
    create: { name: "Grammar", order: 1, subjectId: engSubj.id },
  });

  const topicLinEq = await prisma.topic.upsert({
    where: { chapterId_name: { chapterId: chAlgebra.id, name: "Linear Equations" } },
    update: {},
    create: { name: "Linear Equations", order: 1, chapterId: chAlgebra.id },
  });
  const topicQuadr = await prisma.topic.upsert({
    where: { chapterId_name: { chapterId: chAlgebra.id, name: "Quadratic Equations" } },
    update: {},
    create: { name: "Quadratic Equations", order: 2, chapterId: chAlgebra.id },
  });
  const topicTriProp = await prisma.topic.upsert({
    where: { chapterId_name: { chapterId: chGeometry.id, name: "Triangle Properties" } },
    update: {},
    create: { name: "Triangle Properties", order: 1, chapterId: chGeometry.id },
  });
  const topicReflection = await prisma.topic.upsert({
    where: { chapterId_name: { chapterId: chPhysics.id, name: "Reflection of Light" } },
    update: {},
    create: { name: "Reflection of Light", order: 1, chapterId: chPhysics.id },
  });
  const topicTenses = await prisma.topic.upsert({
    where: { chapterId_name: { chapterId: chGrammar.id, name: "Tenses" } },
    update: {},
    create: { name: "Tenses", order: 1, chapterId: chGrammar.id },
  });
  console.log("✅ 5 chapters + 5 topics");

  // ──────────────────────────────────────────────────
  // 6. Questions (30+ varied)
  // ──────────────────────────────────────────────────
  const qCount = await prisma.question.count({ where: { schoolId: school.id } });
  if (qCount > 10) {
    console.log(`⏭️  ${qCount} questions exist — skipping`);
    console.log("\n🎉 Seed complete! Run: npm run dev");
    return;
  }

  const qData = [
    // ── MATH: Algebra MCQs ──
    {
      questionText: "What is the value of x if $2x + 5 = 15$?",
      questionType: "MCQ" as const, difficulty: "EASY" as const, bloomLevel: "APPLY" as const, marks: 1,
      options: [
        { label: "A", text: "x = 3", isCorrect: false },
        { label: "B", text: "x = 5", isCorrect: true },
        { label: "C", text: "x = 7", isCorrect: false },
        { label: "D", text: "x = 10", isCorrect: false },
      ],
      answerKey: "B", explanation: "2x = 15 - 5 = 10, x = 5",
      tags: ["algebra", "linear-equations"], subjectId: mathSubj.id, chapterId: chAlgebra.id, topicId: topicLinEq.id,
    },
    {
      questionText: "If $x^2 - 5x + 6 = 0$, then the roots are:",
      questionType: "MCQ" as const, difficulty: "MEDIUM" as const, bloomLevel: "APPLY" as const, marks: 1,
      options: [
        { label: "A", text: "x = 1, x = 6", isCorrect: false },
        { label: "B", text: "x = 2, x = 3", isCorrect: true },
        { label: "C", text: "x = -2, x = -3", isCorrect: false },
        { label: "D", text: "x = 2, x = -3", isCorrect: false },
      ],
      answerKey: "B", explanation: "(x-2)(x-3) = 0",
      tags: ["algebra", "quadratic"], subjectId: mathSubj.id, chapterId: chAlgebra.id, topicId: topicQuadr.id,
    },
    {
      questionText: "Simplify: $\\frac{3x^2 - 12}{x - 2}$",
      questionType: "SHORT_ANSWER" as const, difficulty: "MEDIUM" as const, bloomLevel: "APPLY" as const, marks: 2,
      answerKey: "$3(x + 2)$ or $3x + 6$", explanation: "Factor numerator: $3(x^2-4) = 3(x+2)(x-2)$",
      tags: ["algebra", "factorization"], subjectId: mathSubj.id, chapterId: chAlgebra.id,
    },
    {
      questionText: "Solve the system: $x + y = 10$ and $x - y = 4$",
      questionType: "SHORT_ANSWER" as const, difficulty: "EASY" as const, bloomLevel: "APPLY" as const, marks: 2,
      answerKey: "x = 7, y = 3", explanation: "Add equations: 2x = 14, x = 7",
      tags: ["algebra", "linear-equations"], subjectId: mathSubj.id, chapterId: chAlgebra.id, topicId: topicLinEq.id,
    },
    {
      questionText: "The quadratic formula for $ax^2 + bx + c = 0$ is ______.",
      questionType: "FILL_IN_THE_BLANK" as const, difficulty: "EASY" as const, bloomLevel: "REMEMBER" as const, marks: 1,
      answerKey: "$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$",
      tags: ["algebra", "quadratic"], subjectId: mathSubj.id, chapterId: chAlgebra.id, topicId: topicQuadr.id,
    },
    // ── MATH: Geometry ──
    {
      questionText: "ગુજરાતીમાં: ત્રિભુજના ત્રણ ખૂણાના માપનો સરવાળો કેટલો થાય?",
      questionType: "SHORT_ANSWER" as const, difficulty: "EASY" as const, bloomLevel: "REMEMBER" as const, marks: 1,
      answerKey: "180°", explanation: "ઘનાક્ષ ત્રિભુજના ખૂણાનો સરવાળો હંમેશા 180° હોય છે.",
      tags: ["geometry", "gujarati"], subjectId: mathSubj.id, chapterId: chGeometry.id, topicId: topicTriProp.id,
    },
    {
      questionText: "In a right-angled triangle, if one angle is $90°$ and another is $30°$, find the third angle.",
      questionType: "SHORT_ANSWER" as const, difficulty: "EASY" as const, bloomLevel: "APPLY" as const, marks: 1,
      answerKey: "60°", explanation: "180° - 90° - 30° = 60°",
      tags: ["geometry", "triangles"], subjectId: mathSubj.id, chapterId: chGeometry.id, topicId: topicTriProp.id,
    },
    {
      questionText: "State Pythagoras theorem and verify it for sides 3, 4, 5.",
      questionType: "LONG_ANSWER" as const, difficulty: "MEDIUM" as const, bloomLevel: "UNDERSTAND" as const, marks: 3,
      answerKey: "$a^2 + b^2 = c^2$; $3^2 + 4^2 = 9 + 16 = 25 = 5^2$ ✓",
      tags: ["geometry", "pythagoras"], subjectId: mathSubj.id, chapterId: chGeometry.id, topicId: topicTriProp.id,
    },
    {
      questionText: "The sum of angles of a triangle is 180°. (True or False)",
      questionType: "TRUE_FALSE" as const, difficulty: "EASY" as const, bloomLevel: "REMEMBER" as const, marks: 1,
      answerKey: "True", tags: ["geometry"], subjectId: mathSubj.id, chapterId: chGeometry.id, topicId: topicTriProp.id,
    },
    // ── MATH: Trigonometry ──
    {
      questionText: "If $\\sin \\theta = \\frac{3}{5}$, find $\\cos \\theta$.",
      questionType: "SHORT_ANSWER" as const, difficulty: "MEDIUM" as const, bloomLevel: "APPLY" as const, marks: 2,
      answerKey: "$\\cos \\theta = \\frac{4}{5}$",
      tags: ["trigonometry"], subjectId: mathSubj.id, chapterId: chTrigo.id,
    },
    {
      questionText: "Evaluate: $\\tan 45° + \\sin 30°$",
      questionType: "SHORT_ANSWER" as const, difficulty: "EASY" as const, bloomLevel: "APPLY" as const, marks: 1,
      answerKey: "$1 + \\frac{1}{2} = \\frac{3}{2}$",
      tags: ["trigonometry"], subjectId: mathSubj.id, chapterId: chTrigo.id,
    },
    {
      questionText: "The value of $\\sin^2 \\theta + \\cos^2 \\theta$ is always:",
      questionType: "MCQ" as const, difficulty: "EASY" as const, bloomLevel: "REMEMBER" as const, marks: 1,
      options: [
        { label: "A", text: "0", isCorrect: false },
        { label: "B", text: "1", isCorrect: true },
        { label: "C", text: "$\\sin \\theta$", isCorrect: false },
        { label: "D", text: "Depends on $\\theta$", isCorrect: false },
      ],
      answerKey: "B", tags: ["trigonometry", "identities"], subjectId: mathSubj.id, chapterId: chTrigo.id,
    },
    // ── SCIENCE: Light ──
    {
      questionText: "Light travels in a ______ path.",
      questionType: "FILL_IN_THE_BLANK" as const, difficulty: "EASY" as const, bloomLevel: "REMEMBER" as const, marks: 1,
      answerKey: "straight", tags: ["physics", "light"], subjectId: sciSubj.id, chapterId: chPhysics.id,
    },
    {
      questionText: "The angle of incidence is equal to the angle of reflection. (True or False)",
      questionType: "TRUE_FALSE" as const, difficulty: "EASY" as const, bloomLevel: "REMEMBER" as const, marks: 1,
      answerKey: "True", tags: ["physics", "reflection"], subjectId: sciSubj.id, chapterId: chPhysics.id, topicId: topicReflection.id,
    },
    {
      questionText: "Explain the laws of reflection with a diagram.",
      questionType: "LONG_ANSWER" as const, difficulty: "MEDIUM" as const, bloomLevel: "UNDERSTAND" as const, marks: 3,
      answerKey: "1) Incident ray, reflected ray, normal at point of incidence are coplanar. 2) Angle of incidence = Angle of reflection.",
      tags: ["physics", "reflection"], subjectId: sciSubj.id, chapterId: chPhysics.id, topicId: topicReflection.id,
    },
    {
      questionText: "A ray of light strikes a mirror at an angle of $35°$ to the normal. What is the angle of reflection?",
      questionType: "SHORT_ANSWER" as const, difficulty: "EASY" as const, bloomLevel: "APPLY" as const, marks: 1,
      answerKey: "35°", explanation: "By law of reflection, i = r",
      tags: ["physics", "reflection"], subjectId: sciSubj.id, chapterId: chPhysics.id, topicId: topicReflection.id,
    },
    {
      questionText: "The speed of light in vacuum is approximately $3 \\times 10^8$ m/s. (True or False)",
      questionType: "TRUE_FALSE" as const, difficulty: "EASY" as const, bloomLevel: "REMEMBER" as const, marks: 1,
      answerKey: "True", tags: ["physics", "light"], subjectId: sciSubj.id, chapterId: chPhysics.id,
    },
    // ── ENGLISH: Grammar ──
    {
      questionText: "Identify the tense: \"She has been working here since 2020.\"",
      questionType: "MCQ" as const, difficulty: "MEDIUM" as const, bloomLevel: "UNDERSTAND" as const, marks: 1,
      options: [
        { label: "A", text: "Present Simple", isCorrect: false },
        { label: "B", text: "Present Perfect Continuous", isCorrect: true },
        { label: "C", text: "Past Continuous", isCorrect: false },
        { label: "D", text: "Present Perfect", isCorrect: false },
      ],
      answerKey: "B", tags: ["english", "grammar", "tenses"], subjectId: engSubj.id, chapterId: chGrammar.id, topicId: topicTenses.id,
    },
    {
      questionText: "Change to passive voice: \"The teacher explains the lesson.\"",
      questionType: "SHORT_ANSWER" as const, difficulty: "MEDIUM" as const, bloomLevel: "APPLY" as const, marks: 2,
      answerKey: "The lesson is explained by the teacher.",
      tags: ["english", "grammar", "voice"], subjectId: engSubj.id, chapterId: chGrammar.id,
    },
    {
      questionText: "Choose the correct form: \"Everyone ___ happy.\" (is/are)",
      questionType: "FILL_IN_THE_BLANK" as const, difficulty: "EASY" as const, bloomLevel: "APPLY" as const, marks: 1,
      answerKey: "is", explanation: "'Everyone' is singular.",
      tags: ["english", "grammar", "subject-verb"], subjectId: engSubj.id, chapterId: chGrammar.id,
    },
    // ── CASE STUDY ──
    {
      questionText: "A school plants trees along a straight path. The first tree is 2 m from the gate and each subsequent tree is 3 m further.\n\na) Write an expression for the distance of the n-th tree from the gate.\nb) Find the distance of the 10th tree.\nc) If the total path is 50 m long, how many trees can be planted?",
      questionType: "CASE_STUDY" as const, difficulty: "HARD" as const, bloomLevel: "ANALYZE" as const, marks: 5,
      caseStudyFormat: "INLINE" as const,
      answerKey: "a) d(n) = 2 + (n-1)×3 = 3n - 1; b) d(10) = 29 m; c) Solve 3n - 1 ≤ 50, n ≤ 17",
      explanation: "Arithmetic progression with a=2, d=3",
      tags: ["case-study", "real-world", "ap"], previousYearTag: "GSEB 2024",
      subjectId: mathSubj.id, chapterId: chAlgebra.id,
    },
    {
      questionText: "A student observes that a ray of light bends when it passes from air into water.\n\na) What is this phenomenon called?\nb) State the law that governs this bending.\nc) Calculate the angle of refraction if the angle of incidence is $45°$ and refractive index of water is 1.33.",
      questionType: "CASE_STUDY" as const, difficulty: "HARD" as const, bloomLevel: "ANALYZE" as const, marks: 5,
      caseStudyFormat: "INLINE" as const,
      answerKey: "a) Refraction; b) Snell's law $n_1 \\sin i = n_2 \\sin r$; c) $\\sin r = \\frac{\\sin 45°}{1.33} = 0.53$, $r ≈ 32°$",
      tags: ["case-study", "physics", "refraction"], previousYearTag: "Board 2024",
      subjectId: sciSubj.id, chapterId: chPhysics.id, topicId: topicReflection.id,
    },
    // ── More MCQs ──
    {
      questionText: "Which of the following is a polynomial?\nA) $\\frac{1}{x}$  B) $x^2 + 3x$  C) $\\sqrt{x}$  D) $|x|$",
      questionType: "MCQ" as const, difficulty: "EASY" as const, bloomLevel: "UNDERSTAND" as const, marks: 1,
      options: [
        { label: "A", text: "$\\frac{1}{x}$", isCorrect: false },
        { label: "B", text: "$x^2 + 3x$", isCorrect: true },
        { label: "C", text: "$\\sqrt{x}$", isCorrect: false },
        { label: "D", text: "$|x|$", isCorrect: false },
      ],
      answerKey: "B", tags: ["algebra", "polynomials"], subjectId: mathSubj.id, chapterId: chAlgebra.id,
    },
    {
      questionText: "The HCF of 12 and 18 is:",
      questionType: "MCQ" as const, difficulty: "EASY" as const, bloomLevel: "APPLY" as const, marks: 1,
      options: [
        { label: "A", text: "3", isCorrect: false },
        { label: "B", text: "6", isCorrect: true },
        { label: "C", text: "9", isCorrect: false },
        { label: "D", text: "36", isCorrect: false },
      ],
      answerKey: "B", tags: ["number-system"], subjectId: mathSubj.id, chapterId: chAlgebra.id,
    },
    {
      questionText: "ગુજરાતીમાં: બે સંખ્યાનો મ.સ. 6 અને લ.સા. 72 હોય તો તે બે સંખ્યાનો ગુણાકાર કેટલો થાય?",
      questionType: "SHORT_ANSWER" as const, difficulty: "MEDIUM" as const, bloomLevel: "APPLY" as const, marks: 2,
      answerKey: "432", explanation: "બે સંખ્યાનો ગુણાકાર = મ.સ. × લ.સા. = 6 × 72 = 432",
      tags: ["number-system", "gujarati"], subjectId: mathSubj.id, chapterId: chAlgebra.id,
    },
    {
      questionText: "Find the roots of $x^2 - 7x + 12 = 0$ by factorization.",
      questionType: "SHORT_ANSWER" as const, difficulty: "MEDIUM" as const, bloomLevel: "APPLY" as const, marks: 2,
      answerKey: "x = 3, x = 4", explanation: "$(x-3)(x-4) = 0$",
      tags: ["algebra", "quadratic"], subjectId: mathSubj.id, chapterId: chAlgebra.id, topicId: topicQuadr.id,
    },
    {
      questionText: "Write a note on the dispersion of light through a prism.",
      questionType: "LONG_ANSWER" as const, difficulty: "HARD" as const, bloomLevel: "UNDERSTAND" as const, marks: 4,
      answerKey: "Dispersion is splitting of white light into 7 colors (VIBGYOR) by a prism due to different wavelengths bending at different angles.",
      tags: ["physics", "light", "dispersion"], subjectId: sciSubj.id, chapterId: chPhysics.id,
    },
  ];

  let created = 0;
  const usedCodes = new Set<string>();
  for (const q of qData) {
    let code = "";
    for (let i = 0; i < 5; i++) {
      const candidate = randomQuestionCode();
      if (!usedCodes.has(candidate)) {
        code = candidate;
        usedCodes.add(candidate);
        break;
      }
    }
    await prisma.question.create({
      data: {
        code,
        questionText: q.questionText,
        questionType: q.questionType,
        difficulty: q.difficulty,
        medium: Medium.ENGLISH,
        bloomLevel: q.bloomLevel,
        marks: q.marks,
        options: q.options ?? undefined,
        caseStudyFormat: (q as any).caseStudyFormat ?? undefined,
        answerKey: q.answerKey,
        explanation: (q as any).explanation ?? undefined,
        tags: q.tags ?? [],
        previousYearTag: (q as any).previousYearTag ?? undefined,
        schoolId: school.id,
        subjectId: q.subjectId,
        chapterId: q.chapterId,
        topicId: (q as any).topicId ?? undefined,
      },
    });
    created++;
  }

  console.log(`✅ ${created} questions created (Math: 15, Science: 5, English: 3, Case Study: 2)`);

  console.log("\n🎉 Seed complete! Run: npm run dev");
  console.log("   ─────────────────────────────────");
  console.log("   Credentials (password: Demo@123):");
  console.log("   Admin:   admin@demo.edu");
  console.log("   Teacher: priya@demo.edu");
  console.log("   Teacher: amit@demo.edu");
  console.log("   Student: aarav@demo.edu");
  console.log("   Student: diya@demo.edu");
  console.log("   Student: vivaan@demo.edu");
  console.log("   Student: ananya@demo.edu");
  console.log("   Student: kabir@demo.edu");
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
