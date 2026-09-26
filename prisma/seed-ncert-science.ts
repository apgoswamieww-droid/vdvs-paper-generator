/**
 * prisma/seed-ncert-science.ts
 *
 * Imports ncert_science_seeder.json (repo root) into the taxonomy module
 * (ClassLevel → Subject → Chapter → Topic) for a target school.
 *
 * Run with: npx tsx prisma/seed-ncert-science.ts
 *   or:      npm run db:seed:ncert
 *   target:  npm run db:seed:ncert -- --school=<slug>   (default: demo-school)
 *
 * Behavior: idempotent. Rows already present (same unique key) are left
 * untouched; only missing rows are created. Re-runs are safe no-ops.
 */

import path from "node:path";
import { readFile } from "node:fs/promises";
import { PrismaClient, Medium } from "@prisma/client";

const prisma = new PrismaClient();

type JsonTopic = { name: string };
type JsonChapter = { name: string; topics: JsonTopic[] };
type JsonSubject = { name: string; medium: string; chapters: JsonChapter[] };
type JsonStandard = { standard: string; stream?: string; subjects: JsonSubject[] };

const MEDIUM_NAMES = new Set(["English", "Gujarati"]);

function parseSchoolArg(): string {
  const arg = process.argv.find((a) => a.startsWith("--school="));
  return arg ? arg.split("=")[1]?.trim() || "demo-school" : "demo-school";
}

function normalizeStandard(raw: string): string {
  return raw.replace(/-/g, " ").trim();
}

function toMedium(raw: string): Medium {
  const m = raw.trim().toLowerCase();
  if (m === "gujarati") return Medium.GUJARATI;
  if (m === "english") return Medium.ENGLISH;
  throw new Error(`Unsupported medium "${raw}" — expected "English" or "Gujarati".`);
}

function gradeOrder(name: string): number | null {
  const m = name.match(/\d+/);
  const n = m ? Number.parseInt(m[0], 10) : NaN;
  return Number.isFinite(n) ? n : null;
}

function subjectKey(classLevelId: string, name: string, medium: Medium): string {
  return `${classLevelId}$${name}$${medium}`;
}

function chapterKey(subjectId: string, name: string): string {
  return `${subjectId}$${name}`;
}

function topicKey(chapterId: string, name: string): string {
  return `${chapterId}$${name}`;
}

async function loadJson(): Promise<JsonStandard[]> {
  const file = path.join(process.cwd(), "ncert_science_seeder.json");
  const raw = await readFile(file, "utf8");
  const data: unknown = JSON.parse(raw);
  if (!Array.isArray(data)) {
    throw new Error("ncert_science_seeder.json must contain an array of standards.");
  }

  return data.map((entry, i) => {
    const s = entry as Partial<JsonStandard>;
    if (!s || typeof s.standard !== "string" || !s.standard.trim()) {
      throw new Error(`entry[${i}] is missing a "standard" name.`);
    }
    if (!Array.isArray(s.subjects)) {
      throw new Error(`entry[${i}] ("${s.standard}") is missing the "subjects" array.`);
    }
    for (const [j, sub] of s.subjects.entries()) {
      if (typeof sub?.name !== "string" || !sub.name.trim()) {
        throw new Error(`entry[${i}] subject[${j}] is missing a "name".`);
      }
      if (typeof sub.medium !== "string" || !MEDIUM_NAMES.has(sub.medium)) {
        throw new Error(`subject "${sub.name}" has invalid medium "${sub.medium}".`);
      }
      if (!Array.isArray(sub.chapters)) {
        throw new Error(`subject "${sub.name}" is missing the "chapters" array.`);
      }
      for (const [k, ch] of sub.chapters.entries()) {
        if (typeof ch?.name !== "string" || !ch.name.trim()) {
          throw new Error(`subject "${sub.name}" chapter[${k}] is missing a "name".`);
        }
        if (!Array.isArray(ch.topics)) {
          throw new Error(`chapter "${ch.name}" is missing the "topics" array.`);
        }
        for (const [l, t] of ch.topics.entries()) {
          if (typeof t?.name !== "string" || !t.name.trim()) {
            throw new Error(`chapter "${ch.name}" topic[${l}] is missing a "name".`);
          }
        }
      }
    }
    return { standard: s.standard, stream: s.stream, subjects: s.subjects };
  });
}

async function main() {
  console.log("🌱 Seeding NCERT Science taxonomy...");

  const slug = parseSchoolArg();
  const school = await prisma.school.findUnique({
    where: { slug },
    select: { id: true, name: true },
  });
  if (!school) {
    throw new Error(
      `School with slug "${slug}" not found. Run the demo seed first, or pass --school=<slug>.`
    );
  }

  const data = await loadJson();

  const createdClassCounts = { classes: 0, existing: 0 };

  await prisma.$transaction(
    async (tx) => {
    // ──────────────────────────────────────────────────
    //  ClassLevels (normalize "Std-11" → "Std 11")
    // ──────────────────────────────────────────────────
    const classNames = data.map((e) => normalizeStandard(e.standard));
    const existingClasses = await tx.classLevel.findMany({
      where: { schoolId: school.id },
      select: { id: true, name: true, order: true },
    });
    const classByName = new Map(existingClasses.map((c) => [c.name, c]));
    const maxOrder = existingClasses.reduce((max, c) => Math.max(max, c.order), 0);

    const missingClassNames = classNames.filter((n) => !classByName.has(n));
    const createdClasses = missingClassNames.length
      ? await tx.classLevel.createManyAndReturn({
          data: missingClassNames.map((name) => ({
            name,
            order:
              gradeOrder(name) ??
              maxOrder + missingClassNames.indexOf(name) + 1,
            schoolId: school.id,
          })),
        })
      : [];
    createdClassCounts.classes += createdClasses.length;
    createdClassCounts.existing += classNames.length - createdClasses.length;

    const classIdByName = new Map<string, string>();
    for (const c of existingClasses) classIdByName.set(c.name, c.id);
    for (const c of createdClasses) classIdByName.set(c.name, c.id);

    // ──────────────────────────────────────────────────
    //  Subjects  (@@unique [classLevelId, name, medium])
    // ──────────────────────────────────────────────────
    const existingSubjects = await tx.subject.findMany({
      where: { schoolId: school.id },
      select: { id: true, name: true, medium: true, classLevelId: true },
    });
    const subjectIdByKey = new Map<string, string>();
    for (const s of existingSubjects) {
      subjectIdByKey.set(
        subjectKey(s.classLevelId, s.name, s.medium),
        s.id
      );
    }

    const missingSubjects: Array<{
      classLevelId: string;
      name: string;
      medium: Medium;
    }> = [];
    for (const entry of data) {
      const classId = classIdByName.get(normalizeStandard(entry.standard));
      if (!classId) continue;
      for (const sub of entry.subjects) {
        const medium = toMedium(sub.medium);
        if (!subjectIdByKey.has(subjectKey(classId, sub.name, medium))) {
          missingSubjects.push({ classLevelId: classId, name: sub.name, medium });
        }
      }
    }
    const createdSubjects = missingSubjects.length
      ? await tx.subject.createManyAndReturn({
          data: missingSubjects.map((s) => ({
            name: s.name,
            medium: s.medium,
            classLevelId: s.classLevelId,
            schoolId: school.id,
          })),
        })
      : [];
    for (const s of createdSubjects) {
      subjectIdByKey.set(subjectKey(s.classLevelId, s.name, s.medium), s.id);
    }

    // ──────────────────────────────────────────────────
    //  Chapters  (@@unique [subjectId, name])
    //  order = index+1 ; medium inherits the subject's
    // ──────────────────────────────────────────────────
    const subjectIds = [...subjectIdByKey.values()];
    const existingChapters = await tx.chapter.findMany({
      where: { subjectId: { in: subjectIds } },
      select: { id: true, name: true, subjectId: true },
    });
    const chapterIdByKey = new Map<string, string>();
    for (const c of existingChapters) {
      chapterIdByKey.set(chapterKey(c.subjectId, c.name), c.id);
    }

    const missingChapters: Array<{
      subjectId: string;
      name: string;
      order: number;
      medium: Medium;
    }> = [];
    for (const entry of data) {
      const classId = classIdByName.get(normalizeStandard(entry.standard));
      if (!classId) continue;
      for (const sub of entry.subjects) {
        const medium = toMedium(sub.medium);
        const subjectId = subjectIdByKey.get(subjectKey(classId, sub.name, medium));
        if (!subjectId) continue;
        sub.chapters.forEach((ch, idx) => {
          if (!chapterIdByKey.has(chapterKey(subjectId, ch.name))) {
            missingChapters.push({
              subjectId,
              name: ch.name,
              order: idx + 1,
              medium,
            });
          }
        });
      }
    }
    const createdChapters = missingChapters.length
      ? await tx.chapter.createManyAndReturn({
          data: missingChapters.map((c) => ({
            name: c.name,
            order: c.order,
            medium: c.medium,
            subjectId: c.subjectId,
          })),
        })
      : [];
    for (const c of createdChapters) {
      chapterIdByKey.set(chapterKey(c.subjectId, c.name), c.id);
    }

    // ──────────────────────────────────────────────────
    //  Topics  (@@unique [chapterId, name])
    // ──────────────────────────────────────────────────
    const chapterIds = [...chapterIdByKey.values()];
    const existingTopics = await tx.topic.findMany({
      where: { chapterId: { in: chapterIds } },
      select: { id: true, name: true, chapterId: true },
    });
    const existingTopicKeys = new Set(
      existingTopics.map((t) => topicKey(t.chapterId, t.name))
    );

    const missingTopics: Array<{ chapterId: string; name: string; order: number }> = [];
    for (const entry of data) {
      const classId = classIdByName.get(normalizeStandard(entry.standard));
      if (!classId) continue;
      for (const sub of entry.subjects) {
        const medium = toMedium(sub.medium);
        const subjectId = subjectIdByKey.get(subjectKey(classId, sub.name, medium));
        if (!subjectId) continue;
        for (const ch of sub.chapters) {
          const chapterId = chapterIdByKey.get(chapterKey(subjectId, ch.name));
          if (!chapterId) continue;
          ch.topics.forEach((t, idx) => {
            const key = topicKey(chapterId, t.name);
            if (!existingTopicKeys.has(key)) {
              missingTopics.push({ chapterId, name: t.name, order: idx + 1 });
              existingTopicKeys.add(key);
            }
          });
        }
      }
    }
    const createdTopics = missingTopics.length
      ? await tx.topic.createMany({ data: missingTopics })
      : [];

    // ──────────────────────────────────────────────────
    //  Report
    // ──────────────────────────────────────────────────
    const createdSubjectKeys = new Set(
      createdSubjects.map((s) => subjectKey(s.classLevelId, s.name, s.medium))
    );
    const createdChapterKeys = new Set(
      createdChapters.map((c) => chapterKey(c.subjectId, c.name))
    );
    const createdTopicKeys = new Set(
      missingTopics.map((t) => topicKey(t.chapterId, t.name))
    );

    console.log(`✅ Target school: ${school.name} (${school.id})`);
    console.log(
      `   Classes: ${createdClassCounts.classes} created / ${createdClassCounts.existing} existing\n`
    );

    const totals = { subjects: 0, chapters: 0, topics: 0 };
    for (const entry of data) {
      const stdName = normalizeStandard(entry.standard);
      const classId = classIdByName.get(stdName);
      let subC = 0;
      let subE = 0;
      let chapC = 0;
      let chapE = 0;
      let topC = 0;
      let topE = 0;
      if (classId) {
        for (const sub of entry.subjects) {
          const medium = toMedium(sub.medium);
          const subjectId = subjectIdByKey.get(subjectKey(classId, sub.name, medium));
          if (createdSubjectKeys.has(subjectKey(classId, sub.name, medium))) {
            subC += 1;
          } else {
            subE += 1;
          }
          if (subjectId) {
            for (const ch of sub.chapters) {
              if (createdChapterKeys.has(chapterKey(subjectId, ch.name))) {
                chapC += 1;
              } else {
                chapE += 1;
              }
              const chapterId = chapterIdByKey.get(chapterKey(subjectId, ch.name));
              if (chapterId) {
                for (const t of ch.topics) {
                  if (createdTopicKeys.has(topicKey(chapterId, t.name))) {
                    topC += 1;
                  } else {
                    topE += 1;
                  }
                }
              } else {
                topE += ch.topics.length;
              }
            }
          } else {
            chapE += sub.chapters.length;
            topE += sub.chapters.reduce(
              (acc, ch) => acc + ch.topics.length,
              0
            );
          }
        }
      }
      totals.subjects += subC + subE;
      totals.chapters += chapC + chapE;
      totals.topics += topC + topE;
      console.log(
        `   ${stdName} → subjects ${subC} created / ${subE} existing · ` +
          `chapters ${chapC} created / ${chapE} existing · ` +
          `topics ${topC} created / ${topE} existing`
      );
    }

    console.log(
      `\n   Totals: ${totals.subjects} subjects, ${totals.chapters} chapters, ${totals.topics} topics.`
    );
    void createdTopics;
  },
  { maxWait: 15000, timeout: 120000 }
);
}

main()
  .then(async () => {
    await prisma.$disconnect();
    console.log("🎉 NCERT Science seeding complete.");
  })
  .catch(async (e) => {
    console.error("❌ Seeder failed:", e);
    await prisma.$disconnect();
    process.exit(1);
  });