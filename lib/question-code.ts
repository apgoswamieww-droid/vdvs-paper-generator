// ============================================================
//  Question code — a random 6-digit human-friendly identifier
//  (e.g. "483920"). The DB keeps it unique.
// ============================================================

export function randomQuestionCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000)); // 100000..999999
}