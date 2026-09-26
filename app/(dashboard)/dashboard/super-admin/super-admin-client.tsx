"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  Building2,
  FileText,
  HelpCircle,
  ShieldCheck,
  Users,
  Plus,
  Copy,
  Check,
  PauseCircle,
  PlayCircle,
  Eye,
  Pencil,
  Mail,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoadingButton } from "@/components/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { onboardSchool, setSchoolStatus, getSchoolDetail, updateSchool } from "./actions";
import type { SchoolRow, SchoolDetail } from "./actions";
import type { getPlatformStats } from "./actions";

type Stats = Awaited<ReturnType<typeof getPlatformStats>>;

const PLAN_TIERS = [
  { value: "FREE", label: "Free" },
  { value: "STARTER", label: "Starter" },
  { value: "PRO", label: "Pro" },
  { value: "ENTERPRISE", label: "Enterprise" },
] as const;

const BOARDS = [
  { value: "GSEB", label: "GSEB (Gujarat)" },
  { value: "CBSE", label: "CBSE (Central)" },
] as const;

const MEDIUM_OPTIONS = [
  { value: "ENGLISH", label: "English" },
  { value: "GUJARATI", label: "Gujarati" },
] as const;

type EditForm = {
  name: string;
  slug: string;
  logoUrl: string;
  address: string;
  phone: string;
  website: string;
  planTier: string;
  isActive: boolean;
  board: string;
  academicYear: string;
  watermarkText: string;
  defaultInstructions: string;
  allowSelfRegistration: boolean;
  teacherCanEdit: boolean;
  mediums: string[];
  adminEmail: string;
};

function toEditForm(d: SchoolDetail): EditForm {
  return {
    name: d.name,
    slug: d.slug,
    logoUrl: d.logoUrl ?? "",
    address: d.address ?? "",
    phone: d.phone ?? "",
    website: d.website ?? "",
    planTier: d.planTier,
    isActive: d.isActive,
    board: d.board,
    academicYear: d.academicYear ?? "",
    watermarkText: d.watermarkText ?? "",
    defaultInstructions: d.defaultInstructions ?? "",
    allowSelfRegistration: d.allowSelfRegistration,
    teacherCanEdit: d.teacherCanEdit,
    mediums: d.mediums,
    adminEmail: d.adminUsers[0]?.email ?? "",
  };
}

function formatDate(date: Date | string) {
  return new Date(date).toLocaleDateString("en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function DetailItem({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="font-[Nunito] text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="font-[Nunito] text-sm text-foreground">{value ?? "—"}</div>
    </div>
  );
}

function CountChip({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
}) {
  return (
    <div className="rounded-lg border border-border/50 bg-muted/30 p-3">
      <div className="flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <p className="font-[Nunito] text-[11px] font-medium text-muted-foreground">{label}</p>
      </div>
      <p className="font-[Rasa] mt-1 text-xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

function StatusPill({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${
        active
          ? "bg-emerald-500/10 text-emerald-400 ring-emerald-500/30"
          : "bg-red-500/10 text-red-400 ring-red-500/30"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-emerald-400" : "bg-red-400"}`} />
      {active ? "Active" : "Suspended"}
    </span>
  );
}

export function SuperAdminClient({
  stats,
  schools,
}: {
  stats: Stats;
  schools: SchoolRow[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [credentials, setCredentials] = useState<{ email: string; password: string } | null>(null);
  const [emailStatus, setEmailStatus] = useState<"sent" | "skipped" | "failed" | null>(null);
  const [emailReason, setEmailReason] = useState("");
  const [copied, setCopied] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [slugHint, setSlugHint] = useState("");
  const [planTier, setPlanTier] = useState<string>("FREE");
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  // View / Edit school state
  const [viewOpen, setViewOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [detail, setDetail] = useState<SchoolDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editForm, setEditForm] = useState<EditForm | null>(null);

  const cards: Array<{
    label: string;
    value: string;
    icon: React.ElementType;
    color: string;
    bg: string;
  }> = [
    {
      label: "Active Schools",
      value: String(stats.activeSchools),
      icon: Building2,
      color: "text-secondary",
      bg: "bg-secondary/10",
    },
    {
      label: "Global Question Bank",
      value: stats.totalQuestions.toLocaleString(),
      icon: HelpCircle,
      color: "text-emerald-400",
      bg: "bg-emerald-500/10",
    },
    {
      label: "Papers Generated",
      value: stats.totalPapers.toLocaleString(),
      icon: FileText,
      color: "text-amber-400",
      bg: "bg-amber-500/10",
    },
    {
      label: "Total Teachers",
      value: stats.totalTeachers.toLocaleString(),
      icon: Users,
      color: "text-violet-400",
      bg: "bg-violet-500/10",
    },
    {
      label: "Total Students",
      value: stats.totalStudents.toLocaleString(),
      icon: Users,
      color: "text-sky-400",
      bg: "bg-sky-500/10",
    },
    {
      label: "Suspended Schools",
      value: String(stats.suspendedSchools),
      icon: ShieldCheck,
      color: "text-red-400",
      bg: "bg-red-500/10",
    },
  ];

  async function handleOnboard(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsSubmitting(true);
    setCredentials(null);
    setEmailStatus(null);
    setEmailReason("");
    setCopied(false);

    const result = await onboardSchool({
      name,
      slug: slugHint,
      planTier: planTier as (typeof PLAN_TIERS)[number]["value"],
      adminName,
      adminEmail,
      autoCreateClasses: true,
    });

    setIsSubmitting(false);

    if (!result.success) {
      toast.error(result.error ?? "Could not onboard the school.");
      return;
    }

    toast.success(`School "${result.school?.name}" onboarded.`);
    if (result.emailStatus === "sent") {
      toast.success(`Credentials emailed to ${result.credentials?.email}.`);
    } else {
      toast.warning(
        `Credentials could not be emailed${
          result.emailReason ? ` (${result.emailReason})` : ""
        }. Copy them below instead.`
      );
    }
    setCredentials(result.credentials ?? null);
    setEmailStatus(result.emailStatus ?? null);
    setEmailReason(result.emailReason ?? "");
    formRef.current?.reset();
    setName("");
    setSlugHint("");
    setAdminName("");
    setAdminEmail("");
    setPlanTier("FREE");
    router.refresh();
  }

  function handleToggleStatus(school: SchoolRow) {
    startTransition(async () => {
      const result = await setSchoolStatus({
        schoolId: school.id,
        isActive: !school.isActive,
      });
      if (result.success) {
        toast.success(
          result.isActive ? `"${school.name}" is now active.` : `"${school.name}" suspended.`
        );
        router.refresh();
      } else {
        toast.error(result.error ?? "Could not update the school.");
      }
    });
  }

  async function copyCredentials() {
    if (!credentials) return;
    await navigator.clipboard.writeText(
      `School admin login\nEmail: ${credentials.email}\nPassword: ${credentials.password}`
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function loadDetail(schoolId: string): Promise<SchoolDetail | null> {
    setDetailLoading(true);
    const d = await getSchoolDetail(schoolId);
    setDetailLoading(false);
    if (!d) toast.error("Could not load school details.");
    return d;
  }

  async function openView(s: SchoolRow) {
    setDetail(null);
    setViewOpen(true);
    const d = await loadDetail(s.id);
    if (d) setDetail(d);
    else setViewOpen(false);
  }

  async function openEditSchool(schoolId: string) {
    const d = await loadDetail(schoolId);
    if (!d) return;
    setDetail(d);
    setEditForm(toEditForm(d));
    setEditOpen(true);
  }

  function setEditField<K extends keyof EditForm>(key: K, value: EditForm[K]) {
    setEditForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function toggleMedium(medium: string) {
    setEditForm((prev) => {
      if (!prev) return prev;
      const has = prev.mediums.includes(medium);
      return {
        ...prev,
        mediums: has ? prev.mediums.filter((m) => m !== medium) : [...prev.mediums, medium],
      };
    });
  }

  async function handleEditSchool(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!detail || !editForm) return;
    setEditSaving(true);

    const result = await updateSchool({
      id: detail.id,
      name: editForm.name,
      slug: editForm.slug,
      logoUrl: editForm.logoUrl || null,
      address: editForm.address || null,
      phone: editForm.phone || null,
      website: editForm.website || null,
      planTier: editForm.planTier as (typeof PLAN_TIERS)[number]["value"],
      isActive: editForm.isActive,
      board: editForm.board as "GSEB" | "CBSE",
      academicYear: editForm.academicYear || null,
      watermarkText: editForm.watermarkText || null,
      defaultInstructions: editForm.defaultInstructions || null,
      allowSelfRegistration: editForm.allowSelfRegistration,
      teacherCanEdit: editForm.teacherCanEdit,
      mediums: editForm.mediums as ("ENGLISH" | "GUJARATI")[],
      adminEmail: detail.adminUsers[0] ? editForm.adminEmail : undefined,
    });

    setEditSaving(false);

    if (!result.success) {
      toast.error(result.error ?? "Could not update the school.");
      return;
    }
    toast.success(`"${result.school?.name}" updated.`);
    setEditOpen(false);
    setEditForm(null);
    router.refresh();
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-[Rasa] text-3xl font-bold tracking-tight">Platform Control</h1>
          <p className="font-[Nunito] mt-1 text-sm text-muted-foreground">
            Manage every school tenant on the SaaS platform.
          </p>
        </div>
        <Button
          className="gap-2 font-[Nunito]"
          onClick={() => {
            setCredentials(null);
            setOpen(true);
          }}
        >
          <Plus className="h-4 w-4" />
          Onboard New School
        </Button>
      </div>

      {/* Analytics */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {cards.map((stat) => (
          <Card key={stat.label} className="relative overflow-hidden border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-[Nunito] text-xs font-medium text-muted-foreground">{stat.label}</p>
                  <p className="font-[Rasa] mt-1.5 text-2xl font-bold tracking-tight">{stat.value}</p>
                </div>
                <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${stat.bg}`}>
                  <stat.icon className={`h-4.5 w-4.5 ${stat.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Schools table */}
      <Card className="border-border/50">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="font-[Rasa] text-lg font-semibold">All Schools</CardTitle>
          <p className="font-[Nunito] text-xs text-muted-foreground">{schools.length} tenants</p>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>School</TableHead>
                  <TableHead>Subdomain</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead className="text-center">Teachers</TableHead>
                  <TableHead className="text-center">Students</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-44 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className={isPending ? "opacity-50" : ""}>
                {schools.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                      No schools onboarded yet. Click “Onboard New School” to add your first tenant.
                    </TableCell>
                  </TableRow>
                )}
                {schools.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-[Nunito] text-sm font-medium">{s.name}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{s.slug}</TableCell>
                    <TableCell>
                      <span className="inline-flex rounded-md bg-muted px-2 py-0.5 text-[11px] font-semibold text-foreground/80">
                        {s.planTier}
                      </span>
                    </TableCell>
                    <TableCell className="text-center tabular-nums">{s.teachers}</TableCell>
                    <TableCell className="text-center tabular-nums">{s.students}</TableCell>
                    <TableCell>
                      <StatusPill active={s.isActive} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(s.createdAt).toLocaleDateString("en-US", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          disabled={isPending}
                          title="View details"
                          onClick={() => void openView(s)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          disabled={isPending}
                          title="Edit school"
                          onClick={() => void openEditSchool(s.id)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant={s.isActive ? "outline" : "default"}
                          size="sm"
                          className="h-8 gap-1.5 font-[Nunito] text-xs"
                          disabled={isPending}
                          onClick={() => handleToggleStatus(s)}
                        >
                          {s.isActive ? (
                            <>
                              <PauseCircle className="h-3.5 w-3.5" />
                              Suspend
                            </>
                          ) : (
                            <>
                              <PlayCircle className="h-3.5 w-3.5" />
                              Activate
                            </>
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Onboard dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Onboard New School</DialogTitle>
            <DialogDescription>
              Registers a new tenant, creates the default class levels and the first
              SCHOOL_ADMIN login. Show the auto-generated password to the school once.
            </DialogDescription>
          </DialogHeader>

          {credentials ? (
            <div className="space-y-4">
              {emailStatus === "sent" ? (
                <p className="font-[Nunito] text-xs text-emerald-400">
                  Credentials emailed to {credentials.email}.
                </p>
              ) : emailStatus === "skipped" || emailStatus === "failed" ? (
                <p className="font-[Nunito] text-xs text-amber-400">
                  {emailStatus === "skipped"
                    ? "Email isn't configured, so credentials were not emailed."
                    : `Email delivery failed (${emailReason}).`}{" "}
                  Copy them below instead.
                </p>
              ) : null}
              <div className="rounded-lg border border-emerald-800 bg-emerald-950/40 p-4">
                <p className="font-[Nunito] text-sm font-semibold text-emerald-300">
                  School ready — share these credentials:
                </p>
                <div className="mt-3 space-y-2 font-mono text-xs">
                  <div className="flex items-center justify-between rounded-md bg-slate-950 px-3 py-2">
                    <span className="text-slate-400">Email</span>
                    <span className="text-slate-100">{credentials.email}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-md bg-slate-950 px-3 py-2">
                    <span className="text-slate-400">Password</span>
                    <span className="text-emerald-300">{credentials.password}</span>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3 gap-1.5 font-[Nunito] text-xs"
                  onClick={() => void copyCredentials()}
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "Copied" : "Copy credentials"}
                </Button>
              </div>
              <DialogFooter>
                <Button type="button" onClick={() => setOpen(false)}>
                  Done
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <form ref={formRef} onSubmit={handleOnboard} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="school-name">School Name *</Label>
                <Input
                  id="school-name"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setSlugHint(slugify(name));
                  }}
                  placeholder="St. Xavier's High School"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="school-slug">Subdomain</Label>
                  <Input
                    id="school-slug"
                    value={slugHint}
                    onChange={(e) => setSlugHint(e.target.value)}
                    placeholder={name ? slugify(name) : "xavier-high"}
                    className="font-mono text-xs"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Auto-generated from the name. Leave as-is for a unique value.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label>Plan</Label>
                  <Select
                    items={PLAN_TIERS.map((p) => ({ value: p.value, label: p.label }))}
                    value={planTier || null}
                    onValueChange={(v) => setPlanTier(typeof v === "string" ? v : "FREE")}
                  >
                    <SelectTrigger className="w-full bg-slate-950">
                      <SelectValue placeholder="Select plan" />
                    </SelectTrigger>
                    <SelectContent>
                      {PLAN_TIERS.map((p) => (
                        <SelectItem key={p.value} value={p.value}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="admin-name">School Admin Name *</Label>
                <Input
                  id="admin-name"
                  value={adminName}
                  onChange={(e) => setAdminName(e.target.value)}
                  placeholder="Full name of the first admin"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="admin-email">School Admin Email *</Label>
                <Input
                  id="admin-email"
                  type="email"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  placeholder="admin@school.edu"
                  required
                />
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isSubmitting}>
                  Cancel
                </Button>
                <LoadingButton type="submit" loading={isSubmitting} loadingText="Onboarding…">
                  {isSubmitting ? "" : "Create school"}
                </LoadingButton>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* School details dialog */}
      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{detail?.name ?? "School details"}</DialogTitle>
            <DialogDescription>
              {detail ? `${detail.slug} · ${detail.planTier} plan` : "Loading school details…"}
            </DialogDescription>
          </DialogHeader>

          {detailLoading || !detail ? (
            <div className="space-y-3 py-4">
              {[100, 82, 92, 60].map((w) => (
                <div
                  key={w}
                  className="h-4 animate-pulse rounded bg-muted"
                  style={{ width: `${w}%` }}
                />
              ))}
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill active={detail.isActive} />
                <span className="inline-flex rounded-md bg-muted px-2 py-0.5 text-[11px] font-semibold text-foreground/80">
                  {detail.planTier}
                </span>
                <span className="inline-flex rounded-md bg-muted px-2 py-0.5 text-[11px] font-semibold text-foreground/80">
                  {detail.board}
                </span>
                {detail.academicYear && (
                  <span className="inline-flex rounded-md bg-muted px-2 py-0.5 text-[11px] font-semibold text-foreground/80">
                    {detail.academicYear} AY
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <CountChip label="Teachers" value={detail.counts.teachers} icon={Users} />
                <CountChip label="Students" value={detail.counts.students} icon={Users} />
                <CountChip label="Admins" value={detail.counts.admins} icon={ShieldCheck} />
                <CountChip label="Classes" value={detail.counts.classes} icon={Building2} />
                <CountChip label="Subjects" value={detail.counts.subjects} icon={FileText} />
                <CountChip label="Papers" value={detail.counts.papers} icon={FileText} />
                <CountChip label="Questions" value={detail.counts.questions} icon={HelpCircle} />
                <CountChip label="Assignments" value={detail.counts.assignments} icon={FileText} />
              </div>

              <div className="space-y-3">
                <h3 className="font-[Nunito] text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  School profile
                </h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <DetailItem label="Subdomain" value={detail.slug} />
                  <DetailItem label="Board" value={detail.board} />
                  <DetailItem label="Admin email" value={detail.adminUsers[0]?.email} />
                  <DetailItem label="Address" value={detail.address} />
                  <DetailItem label="Phone" value={detail.phone} />
                  <DetailItem
                    label="Website"
                    value={
                      detail.website ? (
                        <a
                          href={detail.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary underline underline-offset-2"
                        >
                          {detail.website}
                        </a>
                      ) : undefined
                    }
                  />
                  <DetailItem label="Academic year" value={detail.academicYear} />
                  <DetailItem label="Mediums" value={detail.mediums.join(", ")} />
                  <DetailItem label="Created" value={formatDate(detail.createdAt)} />
                  <DetailItem label="Last updated" value={formatDate(detail.updatedAt)} />
                </div>
                {detail.logoUrl && (
                  <div className="flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary URL or data-URL */}
                    <img
                      src={detail.logoUrl}
                      alt={`${detail.name} logo`}
                      className="h-12 w-12 rounded-lg border border-border/50 object-contain"
                    />
                    <p className="font-[Nunito] text-xs text-muted-foreground">Logo</p>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <h3 className="font-[Nunito] text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Configuration
                </h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-border/50 p-3">
                    <p className="font-[Nunito] text-xs font-semibold">Self registration</p>
                    <p className="font-[Nunito] text-xs text-muted-foreground">
                      {detail.allowSelfRegistration
                        ? "Open sign-up for teachers & students"
                        : "Closed — admins create accounts"}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border/50 p-3">
                    <p className="font-[Nunito] text-xs font-semibold">Teacher editing</p>
                    <p className="font-[Nunito] text-xs text-muted-foreground">
                      {detail.teacherCanEdit
                        ? "Teachers may create & edit papers"
                        : "Disabled for teachers"}
                    </p>
                  </div>
                  <div className="space-y-3 sm:col-span-2">
                    <DetailItem label="Watermark" value={detail.watermarkText} />
                    <DetailItem label="Default instructions" value={detail.defaultInstructions} />
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="font-[Nunito] text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Subscription
                </h3>
                {detail.subscription ? (
                  <div className="grid grid-cols-1 gap-4 rounded-lg border border-border/50 p-3 sm:grid-cols-3">
                    <DetailItem label="Plan" value={detail.subscription.planTier} />
                    <DetailItem label="Status" value={detail.subscription.status} />
                    <DetailItem
                      label="Renews"
                      value={
                        detail.subscription.currentPeriodEnd
                          ? formatDate(detail.subscription.currentPeriodEnd)
                          : undefined
                      }
                    />
                  </div>
                ) : (
                  <DetailItem label="Record" value="No subscription record" />
                )}
              </div>

              <div className="space-y-2">
                <h3 className="font-[Nunito] text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  School administrators
                </h3>
                {detail.adminUsers.length === 0 ? (
                  <p className="font-[Nunito] text-sm text-muted-foreground">No admin accounts.</p>
                ) : (
                  <ul className="divide-y divide-border/50 rounded-lg border border-border/50">
                    {detail.adminUsers.map((u) => (
                      <li key={u.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                            <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-[Nunito] truncate text-sm font-medium">
                              {u.name ?? "School admin"}
                            </p>
                            <p className="font-[Nunito] truncate text-xs text-muted-foreground">{u.email}</p>
                          </div>
                        </div>
                        <StatusPill active={u.isActive} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <DialogFooter className="gap-2">
                <Button type="button" variant="outline" onClick={() => setViewOpen(false)}>
                  Close
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    setViewOpen(false);
                    void openEditSchool(detail.id);
                  }}
                >
                  Edit school
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit school dialog */}
      <Dialog
        open={editOpen}
        onOpenChange={(o) => {
          setEditOpen(o);
          if (!o) setEditForm(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit School</DialogTitle>
            <DialogDescription>
              Update the tenant profile, plan, status and configuration of
              {detail ? ` ${detail.name}.` : " this school."}
            </DialogDescription>
          </DialogHeader>

          {editForm ? (
            <form onSubmit={handleEditSchool} className="mt-2 space-y-5">
              <div className="space-y-3">
                <h3 className="font-[Nunito] text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Identity
                </h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-name">School Name *</Label>
                    <Input
                      id="edit-name"
                      value={editForm.name}
                      onChange={(e) => setEditField("name", e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-slug">Subdomain *</Label>
                    <Input
                      id="edit-slug"
                      value={editForm.slug}
                      onChange={(e) => setEditField("slug", e.target.value)}
                      className="font-mono text-xs"
                      required
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-admin-email">Admin Email</Label>
                  <Input
                    id="edit-admin-email"
                    type="email"
                    value={editForm.adminEmail}
                    onChange={(e) => setEditField("adminEmail", e.target.value)}
                    placeholder="admin@school.edu"
                    disabled={!detail?.adminUsers[0]}
                    required={!!detail?.adminUsers[0]}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    {detail?.adminUsers[0]
                      ? "Login email for the school's primary administrator."
                      : "This school has no admin account, so the login email can't be edited."}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="font-[Nunito] text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Contact & branding
                </h3>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-logo">Logo URL</Label>
                  <Input
                    id="edit-logo"
                    value={editForm.logoUrl}
                    onChange={(e) => setEditField("logoUrl", e.target.value)}
                    placeholder="https://… or data:image/…"
                    className="font-mono text-xs"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    A public URL or data-URL for the school logo.
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-address">Address</Label>
                    <Input
                      id="edit-address"
                      value={editForm.address}
                      onChange={(e) => setEditField("address", e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-phone">Phone</Label>
                    <Input
                      id="edit-phone"
                      value={editForm.phone}
                      onChange={(e) => setEditField("phone", e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-website">Website</Label>
                    <Input
                      id="edit-website"
                      value={editForm.website}
                      onChange={(e) => setEditField("website", e.target.value)}
                      placeholder="https://school.edu"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-academic-year">Academic Year</Label>
                    <Input
                      id="edit-academic-year"
                      value={editForm.academicYear}
                      onChange={(e) => setEditField("academicYear", e.target.value)}
                      placeholder="2026-27"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Board</Label>
                  <Select
                    items={BOARDS.map((b) => ({ value: b.value, label: b.label }))}
                    value={editForm.board}
                    onValueChange={(v) => setEditField("board", typeof v === "string" ? v : editForm.board)}
                  >
                    <SelectTrigger className="w-full bg-slate-950">
                      <SelectValue placeholder="Select board" />
                    </SelectTrigger>
                    <SelectContent>
                      {BOARDS.map((b) => (
                        <SelectItem key={b.value} value={b.value}>
                          {b.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="font-[Nunito] text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Plan, status & mediums
                </h3>
                <div className="space-y-1.5">
                  <Label>Plan</Label>
                  <Select
                    items={PLAN_TIERS.map((p) => ({ value: p.value, label: p.label }))}
                    value={editForm.planTier}
                    onValueChange={(v) =>
                      setEditField("planTier", typeof v === "string" ? v : editForm.planTier)
                    }
                  >
                    <SelectTrigger className="w-full bg-slate-950">
                      <SelectValue placeholder="Select plan" />
                    </SelectTrigger>
                    <SelectContent>
                      {PLAN_TIERS.map((p) => (
                        <SelectItem key={p.value} value={p.value}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-lg border border-border/50 p-3">
                  <div>
                    <p className="font-[Nunito] text-sm font-medium">
                      {editForm.isActive ? "Active" : "Suspended"}
                    </p>
                    <p className="font-[Nunito] text-xs text-muted-foreground">
                      {editForm.isActive
                        ? "Tenant can sign in and use the platform."
                        : "Tenant sign-in is blocked."}
                    </p>
                  </div>
                  <Switch
                    checked={editForm.isActive}
                    onCheckedChange={(v) => setEditField("isActive", v)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Mediums *</Label>
                  <div className="flex gap-4">
                    {MEDIUM_OPTIONS.map((m) => (
                      <label key={m.value} className="flex items-center gap-2 font-[Nunito] text-sm">
                        <Checkbox
                          checked={editForm.mediums.includes(m.value)}
                          onCheckedChange={() => toggleMedium(m.value)}
                        />
                        {m.label}
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="font-[Nunito] text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Papers & permissions
                </h3>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-watermark">Watermark Text</Label>
                  <Input
                    id="edit-watermark"
                    value={editForm.watermarkText}
                    onChange={(e) => setEditField("watermarkText", e.target.value)}
                    placeholder="Watermark shown on generated PDFs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-instructions">Default Instructions</Label>
                  <Textarea
                    id="edit-instructions"
                    value={editForm.defaultInstructions}
                    onChange={(e) => setEditField("defaultInstructions", e.target.value)}
                    rows={3}
                    placeholder="Default exam instructions for new papers"
                  />
                </div>
                <div className="flex items-center justify-between gap-3 rounded-lg border border-border/50 p-3">
                  <div>
                    <p className="font-[Nunito] text-sm font-medium">Self registration</p>
                    <p className="font-[Nunito] text-xs text-muted-foreground">
                      Allow teachers & students to sign up on their own.
                    </p>
                  </div>
                  <Switch
                    checked={editForm.allowSelfRegistration}
                    onCheckedChange={(v) => setEditField("allowSelfRegistration", v)}
                  />
                </div>
                <div className="flex items-center justify-between gap-3 rounded-lg border border-border/50 p-3">
                  <div>
                    <p className="font-[Nunito] text-sm font-medium">Teacher can edit papers</p>
                    <p className="font-[Nunito] text-xs text-muted-foreground">
                      Let teachers create and edit papers without admin approval.
                    </p>
                  </div>
                  <Switch
                    checked={editForm.teacherCanEdit}
                    onCheckedChange={(v) => setEditField("teacherCanEdit", v)}
                  />
                </div>
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setEditOpen(false);
                    setEditForm(null);
                  }}
                  disabled={editSaving}
                >
                  Cancel
                </Button>
                <LoadingButton type="submit" loading={editSaving} loadingText="Saving…">
                  {editSaving ? "" : "Save changes"}
                </LoadingButton>
              </DialogFooter>
            </form>
          ) : (
            <div className="space-y-3 py-4">
              <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
              <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}