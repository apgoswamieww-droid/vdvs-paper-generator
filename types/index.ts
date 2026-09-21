// ============================================================
//  Global TypeScript types for the SaaS School Paper Generator
// ============================================================

import type { UserRole, PlanTier, PaperStatus, QuestionType, DifficultyLevel } from "@prisma/client";

// Re-export Prisma enums for convenience
export type { UserRole, PlanTier, PaperStatus, QuestionType, DifficultyLevel };

// ============================================================
//  API Response wrapper
// ============================================================
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// ============================================================
//  Pagination
// ============================================================
export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  meta: PaginationMeta;
}

// ============================================================
//  Auth / Session
// ============================================================
export interface SessionUser {
  id: string;
  name: string | null;
  email: string;
  role: UserRole;
  schoolId: string;
  avatarUrl?: string | null;
}

// ============================================================
//  Multi-tenant context
// ============================================================
export interface TenantContext {
  schoolId: string;
  schoolSlug: string;
  planTier: PlanTier;
}

// ============================================================
//  Question Bank
// ============================================================
export interface MCQOption {
  label: string;   // "A" | "B" | "C" | "D"
  text: string;
  isCorrect: boolean;
}

export interface QuestionFilters {
  subjectId?: string;
  chapterId?: string;
  questionType?: QuestionType;
  difficulty?: DifficultyLevel;
  tags?: string[];
  search?: string;
}

// ============================================================
//  Paper Builder
// ============================================================
export interface PaperSectionDraft {
  title: string;
  instructions?: string;
  questionIds: string[];
}

export interface CreatePaperPayload {
  title: string;
  description?: string;
  subjectId?: string;
  duration?: number;
  instructions?: string;
  sections: PaperSectionDraft[];
}

// ============================================================
//  Navigation
// ============================================================
export interface NavItem {
  label: string;
  href: string;
  icon?: string;
  badge?: string | number;
  children?: NavItem[];
}
