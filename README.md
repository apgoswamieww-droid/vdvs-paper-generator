opencode -s ses_ef021a8e8ffeWwwxq8Nq3w8qA2
# School Paper Generator

A multi-tenant SaaS web app for Indian schools (GSEB / CBSE) to build, print and assign exam papers — with a bilingual (English / Gujarati) question bank, AI question generation, OCR import, PDF / Word export, and online exams with grading.

## Tech stack

| Layer      | Choice                                                                 |
| ---------- | ---------------------------------------------------------------------- |
| Framework  | Next.js 16 (App Router) + React 19, TypeScript                          |
| Database   | PostgreSQL (Neon) via Prisma 5                                          |
| Auth       | NextAuth v5 (credentials, JWT sessions, Prisma adapter)                 |
| Styling    | Tailwind CSS 4 + shadcn/ui                                              |
| AI         | OmniRoute — a local OpenAI-compatible gateway                           |
| PDF export | Puppeteer-core (uses a locally installed Chrome/Chromium)               |
| OCR        | tesseract.js with English + Gujarati traineddata                        |
| Tests      | Vitest (`npm test`)                                                     |

## Getting started

### Prerequisites

- **Node.js 20.9+** and npm
- **Google Chrome or Chromium** — required for PDF export ([app/api/export-pdf/route.ts](app/api/export-pdf/route.ts) auto-discovers standard install paths on Windows, macOS and Linux)
- **OmniRoute gateway** — only needed for AI question generation and bilingual translation (see below)

### 1. Install & configure

```bash
npm install
cp .env.example .env   # then fill in the values below
```

### 2. Environment variables

| Variable              | Required | Purpose                                                                                                   |
| --------------------- | -------- | --------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`        | ✅       | Neon PostgreSQL connection string (pooler) used by the app                                                 |
| `DIRECT_URL`          | ✅       | Direct (non-pooled) Neon URL — required by Prisma migrations                                               |
| `AUTH_SECRET`         | ✅ prod  | NextAuth v5 signing secret (`npx auth secret` generates one)                                               |
| `NEXT_PUBLIC_APP_URL` | —        | Public base URL used in email links (defaults to `http://localhost:3000`)                                  |
| `RESEND_API_KEY`      | —        | Email via Resend. If unset, the app falls back to SMTP                                                     |
| `SMTP_HOST` `SMTP_PORT` `SMTP_USER` `SMTP_PASS` `EMAIL_FROM` | — | SMTP fallback for email ([lib/email.ts](lib/email.ts))                                                     |
| `OMNIROUTES_BASE_URL` | —        | AI gateway endpoint (default `http://localhost:20128/v1`)                                                   |
| `OMNIROUTES_API_KEY`  | —        | Bearer key for the AI gateway if it requires one                                                            |
| `OMNIROUTES_MODEL`    | —        | Model id (default `auto` — the gateway picks the provider)                                                  |
| `TESSERACT_LANG_PATH` | —        | Directory holding `eng.traineddata` / `guj.traineddata`; when unset, tesseract.js resolves language data itself (reference copies ship in the repo root)  |

### 3. Database

```bash
npm run db:generate   # generate the Prisma client
npm run db:push       # or: npm run db:migrate for a migration history
npm run db:seed       # demo school, users, taxonomy + 30+ questions
```

The dev seed ([prisma/seed.ts](prisma/seed.ts)) creates **Demo High School** with a Std 10 curriculum (Maths, Science, English), chapters/topics, and 30+ questions across all types — including Gujarati text and KaTeX math. All demo users share the password **`Demo@123`**:

| Email                 | Role         |
| --------------------- | ------------ |
| `superadmin@demo.edu` | SUPER_ADMIN  |
| `admin@demo.edu`      | SCHOOL_ADMIN |
| `priya@demo.edu`      | TEACHER      |
| `aarav@demo.edu`      | STUDENT      |

(plus a second teacher `amit@demo.edu` and four more students).

Optionally, import the full NCERT science taxonomy (idempotent, target any school slug):

```bash
npm run db:seed:ncert            # into demo-school
npm run db:seed:ncert -- --school=<slug>
```

### 4. Run

```bash
npm run dev    # http://localhost:3000
npm run build  # production build
npm test       # vitest unit tests
```

## Role portal map

Routing and role boundaries are enforced in [middleware.ts](middleware.ts); every server action re-checks tenancy against the session's `schoolId`.

| Role         | Lands on                 | Can access                                                                                                   |
| ------------ | ------------------------ | ------------------------------------------------------------------------------------------------------------ |
| SUPER_ADMIN  | `/dashboard/super-admin` | Platform panel, plus school-level audit views under `/dashboard/admin/*`                                       |
| SCHOOL_ADMIN | `/dashboard`             | Everything school-level: `/dashboard/admin/*` (users, classes, AI generator, settings), papers, questions, taxonomy |
| TEACHER      | `/dashboard/teacher`     | Teacher portal (assignments, grading, submissions, AI review queue) + shared staff areas: papers, questions, taxonomy |
| STUDENT      | `/dashboard/student`     | Student portal only: assigned exams and results                                                                |

- `/dashboard/settings` (personal account) is available to every role.
- Bulk-imported students carry `mustChangePassword` and are funneled to `/dashboard/settings?force=1` until they set their own password.
- Teacher ↔ subject assignments (`TeacherSubject`) scope which questions a teacher sees in the bank and review queue.

## AI gateway (OmniRoute)

AI features run through **[OmniRoute](https://github.com/diegosouzapw/OmniRoute)** — a local, OpenAI-compatible gateway (default `http://localhost:20128/v1`, keyless auto-routing on a fresh install). It powers:

- `POST /api/ai/generate-questions` — exam questions drafted per class/subject/chapter with difficulty + Bloom mix
- `POST /api/ai/translate-question` — English ⇄ Gujarati translation of a question (creates bilingual pairs joined by `translationGroupId`)

Behavior when the gateway is down:

- The **AI Question Generator** page probes `GET /api/ai/status` and shows a live online/offline pill; the Generate button is disabled while the gateway is unreachable, with setup instructions in the banner.
- Server-side errors are classified (connection refused, DNS, dropped connection, timeout) and surfaced as actionable messages instead of generic failures.

If the gateway answers `401/403`, set `OMNIROUTES_API_KEY` in `.env` and restart the dev server.

## Paper creation & export

- **Manual mode** — pick questions into ordered sections; the server recomputes section marks from the bank.
- **Blueprint mode** — define rules (chapter × type × count × marks × difficulty distribution); the system auto-picks unused questions randomly and relaxes the difficulty filter only to fill shortfalls.
- **Export** — `POST /api/export-pdf` and `/api/export-docx` produce four document kinds per paper: `paper`, `answer-key`, `solution`, and `omr` (bubble sheet, PDF only). Page size, orientation, margins, font scale, columns and page numbers come from the paper's `pageConfig`, clamped to safe defaults.

## Project structure

```
app/
  (auth)/            login, register
  (dashboard)/       role portals (admin, teacher, student, super-admin)
  api/               ai/, export-pdf/, export-docx/, ocr/, import-template/, health/, auth/
components/          ui/ (shadcn) + paper/, editor/, dashboard/, student/, teacher/
lib/                 auth, session, prisma, validations,
                     ai/ (OmniRoute client), paper-page/-header/-docx (render engines),
                     question-code, question-mapper, paper-export-client
prisma/              schema.prisma, seed.ts, seed-ncert-science.ts
tests/               vitest unit tests (middleware access control, question codes, …)
```

## Useful scripts

| Script                  | What it does                              |
| ----------------------- | ----------------------------------------- |
| `npm run dev`           | Dev server (Turbopack)                    |
| `npm run build` / `start` | Production build / serve                |
| `npm run lint`          | ESLint                                    |
| `npm test` / `test:watch` | Vitest run / watch                      |
| `npm run db:generate`   | Regenerate the Prisma client              |
| `npm run db:push`       | Push schema to the database               |
| `npm run db:migrate`    | Create/apply dev migrations               |
| `npm run db:studio`     | Prisma Studio GUI                         |
| `npm run db:seed`       | Demo data (see above)                     |
| `npm run db:seed:ncert` | NCERT science taxonomy import             |
| `npm run db:reset`      | Drop & re-create the database             |
