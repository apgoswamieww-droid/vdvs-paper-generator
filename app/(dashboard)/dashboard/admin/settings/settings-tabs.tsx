"use client";

import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ShieldAlert, Upload, X, Save, Bell } from "lucide-react";
import type { PlanTier } from "@/types";
import type { NotificationType } from "@prisma/client";
import { updateSchoolSettings, sendTestNotification } from "./actions";
import {
  deleteHeaderTemplate,
  saveHeaderTemplate,
  type HeaderTemplateDTO,
} from "../../papers/actions";
import { HeaderBuilderCanvas } from "@/components/paper/header-builder-canvas";
import {
  buildHeaderContext,
  defaultCanvasFromSchool,
  type HeaderConfig,
} from "@/lib/paper-header";
import {
  NOTIFICATION_EVENTS,
  defaultsFor,
  type ChannelPrefs,
} from "@/lib/notification-events";
import { showLocalNotification } from "@/lib/push-client";

export type SchoolSettingsValue = {
  name: string;
  slug: string;
  board: "GSEB" | "CBSE";
  address: string;
  phone: string;
  website: string;
  logoUrl: string;
  academicYear: string;
  mediums: ("ENGLISH" | "GUJARATI")[];
  defaultInstructions: string;
  watermarkText: string;
  headerConfig: HeaderConfig | null;
  allowSelfRegistration: boolean;
  teacherCanEdit: boolean;
  planTier: PlanTier;
  isActive: boolean;
};

const BOARDS = [
  { value: "GSEB", label: "GSEB — Gujarat State Board" },
  { value: "CBSE", label: "CBSE — Central Board" },
] as const;

const MEDIUM_OPTIONS = [
  { value: "ENGLISH", label: "English" },
  { value: "GUJARATI", label: "Gujarati" },
] as const;

const CHANNELS: { key: "inApp" | "push" | "email"; label: string; hint: string }[] = [
  { key: "inApp", label: "In-app", hint: "Bell badge and toast inside the app." },
  { key: "push", label: "Push", hint: "Browser notification — needs the recipient to allow push." },
  { key: "email", label: "Email", hint: "Sent through the school SMTP settings." },
];

export function SettingsTabs({
  school,
  templates: initialTemplates,
  notificationPrefs: initialNotificationPrefs,
  auditSchoolId,
}: {
  school: SchoolSettingsValue;
  templates: HeaderTemplateDTO[];
  notificationPrefs: { event: NotificationType; prefs: ChannelPrefs }[];
  auditSchoolId: string | null;
}) {
  const router = useRouter();

  // Tab 1 — General & Branding
  const [general, setGeneral] = useState({
    name: school.name,
    board: school.board,
    address: school.address,
    phone: school.phone,
    website: school.website,
    logoUrl: school.logoUrl,
  });
  // Tab 2 — Academic Setup
  const [academic, setAcademic] = useState({
    academicYear: school.academicYear,
    mediums: school.mediums,
  });
  // Tab 3 — Paper Defaults
  const [papers, setPapers] = useState({
    defaultInstructions: school.defaultInstructions,
    watermarkText: school.watermarkText,
  });
  // Tab 3b — reusable school header design (visual canvas)
  const schoolProfile = {
    name: school.name,
    logoUrl: school.logoUrl || null,
    address: school.address || null,
    phone: school.phone || null,
    board: school.board,
    academicYear: school.academicYear || null,
  };
  const initialHeader: HeaderConfig = school.headerConfig ?? {
    rows: [],
    canvas: defaultCanvasFromSchool(schoolProfile),
  };
  const [headerConfig, setHeaderConfig] = useState<HeaderConfig>(initialHeader);

  // Tab 3b — the reusable heading-template library (save / load / delete)
  const [templates, setTemplates] = useState<HeaderTemplateDTO[]>(initialTemplates);
  const [templateName, setTemplateName] = useState("");
  const [templateBusy, setTemplateBusy] = useState(false);

  async function saveCurrentAsTemplate() {
    const name = templateName.trim();
    if (!name) {
      toast.error("Give the template a name first.");
      return;
    }
    setTemplateBusy(true);
    try {
      const saved = await saveHeaderTemplate({ name, config: headerConfig });
      if ("error" in saved) {
        toast.error(saved.error);
      } else {
        setTemplates((prev) => [
          ...prev.filter((t) => t.id !== saved.id && t.name !== saved.name),
          saved,
        ]);
        setTemplateName("");
        toast.success(`Template "${saved.name}" saved.`);
      }
    } catch {
      toast.error("Could not save the template.");
    } finally {
      setTemplateBusy(false);
    }
  }

  async function removeTemplate(template: HeaderTemplateDTO) {
    if (!window.confirm(`Delete the template "${template.name}"? Papers using it fall back to the school default header.`)) {
      return;
    }
    setTemplateBusy(true);
    try {
      const result = await deleteHeaderTemplate(template.id);
      if (result.success) {
        setTemplates((prev) => prev.filter((t) => t.id !== template.id));
        toast.success("Template deleted.");
      } else {
        toast.error(result.error || "Could not delete the template.");
      }
    } catch {
      toast.error("Could not delete the template.");
    } finally {
      setTemplateBusy(false);
    }
  }
  const headerContext = useMemo(
    () =>
      buildHeaderContext({
        paperTitle: "",
        date: null,
        className: "",
        subjectName: "",
        totalMarks: 0,
        duration: null,
        school: schoolProfile,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  // Tab 4 — Permissions & Security
  const [perms, setPerms] = useState({
    allowSelfRegistration: school.allowSelfRegistration,
    teacherCanEdit: school.teacherCanEdit,
  });

  // Tab 5 — Notifications (one channel set per event)
  const [notifPrefs, setNotifPrefs] = useState<Record<NotificationType, ChannelPrefs>>(() => {
    const map = {} as Record<NotificationType, ChannelPrefs>;
    for (const ev of NOTIFICATION_EVENTS) map[ev.value] = defaultsFor(ev.value);
    for (const row of initialNotificationPrefs) map[row.event] = { ...row.prefs };
    return map;
  });
  const [testBusy, setTestBusy] = useState(false);

  function toggleChannel(event: NotificationType, key: "inApp" | "push" | "email") {
    setNotifPrefs((current) => ({
      ...current,
      [event]: { ...current[event], [key]: !current[event][key] },
    }));
  }

  function setReminderHours(value: number) {
    const hours = Number.isFinite(value) ? Math.min(720, Math.max(1, Math.round(value))) : 24;
    setNotifPrefs((current) => ({
      ...current,
      REVIEW_REMINDER: { ...current.REVIEW_REMINDER, reminderHours: hours },
    }));
  }

  async function sendTest() {
    setTestBusy(true);
    try {
      const result = await sendTestNotification();
      if (!result.success) {
        toast.error(result.error ?? "Could not send the test notification.");
        return;
      }
      const shown = await showLocalNotification({
        title: "Test notification",
        body: "Notifications are working for your school.",
        url: "/dashboard/notifications",
      });
      toast.success(
        shown
          ? "Sent — you should see the browser popup and your feed."
          : "Sent to your notification feed. Allow browser push to also get the popup."
      );
    } catch {
      toast.error("Could not send the test notification.");
    } finally {
      setTestBusy(false);
    }
  }

  const [savingSection, setSavingSection] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file (PNG/JPG/SVG).");
      return;
    }
    if (file.size > 1.5 * 1024 * 1024) {
      toast.error("Logo must be under 1.5 MB.");
      return;
    }
    setUploading(true);
    const reader = new FileReader();
    reader.onload = () => {
      setGeneral((g) => ({ ...g, logoUrl: String(reader.result) }));
      setUploading(false);
    };
    reader.onerror = () => {
      setUploading(false);
      toast.error("Could not read the image.");
    };
    reader.readAsDataURL(file);
  }

  async function save(section: string, payload: Record<string, unknown>) {
    setSavingSection(section);
    const result = await updateSchoolSettings({
      section,
      ...payload,
      schoolId: auditSchoolId ?? undefined,
    });
    setSavingSection(null);
    if (!result.success) {
      toast.error(result.error ?? "Could not save the settings.");
      return;
    }
    toast.success("Settings saved.");
    router.refresh();
  }

  async function saveGeneral(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await save("general", {
      name: general.name,
      board: general.board,
      address: general.address,
      phone: general.phone,
      website: general.website,
      logoUrl: general.logoUrl,
    });
  }

  async function saveAcademic(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (academic.mediums.length === 0) {
      toast.error("Select at least one medium.");
      return;
    }
    await save("academic", academic);
  }

  async function savePapers(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await save("papers", { ...papers, headerConfig });
  }

  async function savePermissions(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await save("permissions", perms);
  }

  async function saveNotifications(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await save("notifications", {
      entries: NOTIFICATION_EVENTS.map((ev) => ({
        event: ev.value,
        prefs: notifPrefs[ev.value],
      })),
    });
  }

  const switchRow = (label: string, description: string, checked: boolean, onChange: (v: boolean) => void) => (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border/60 bg-muted/30 px-4 py-3">
      <div>
        <p className="font-[Nunito] text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[Rasa] text-3xl font-bold tracking-tight">School Settings</h1>
        <p className="font-[Nunito] mt-1 text-sm text-muted-foreground">
          Manage branding, academics, paper defaults and security for {school.name}.
        </p>
      </div>

      {auditSchoolId && (
        <div className="flex items-center gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          Audit mode — editing <strong className="font-semibold">{school.name}</strong> as a super admin.
        </div>
      )}

      <Tabs defaultValue="general">
        <TabsList variant="line" className="w-full justify-start">
          <TabsTrigger value="general">General & Branding</TabsTrigger>
          <TabsTrigger value="academic">Academic Setup</TabsTrigger>
          <TabsTrigger value="papers">Paper Defaults</TabsTrigger>
          <TabsTrigger value="permissions">Permissions & Security</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
        </TabsList>

        {/* ── Tab 1: General & Branding ── */}
        <TabsContent value="general">
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="font-[Rasa] text-lg font-semibold">School Identity</CardTitle>
              <CardDescription className="font-[Nunito] text-xs">
                Name and board identify the school on exam-paper headers and PDF exports.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={saveGeneral} className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="g-name">School Name *</Label>
                    <Input id="g-name" value={general.name} onChange={(e) => setGeneral({ ...general, name: e.target.value })} required />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="g-slug">Subdomain (read-only)</Label>
                    <Input id="g-slug" value={school.slug} readOnly className="bg-muted/40 font-mono text-xs" />
                  </div>

                  <div className="space-y-1.5">
                    <Label>Education Board *</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {BOARDS.map((b) => {
                        const active = general.board === b.value;
                        return (
                          <button
                            type="button"
                            key={b.value}
                            onClick={() => setGeneral({ ...general, board: b.value })}
                            className={`rounded-lg border px-3 py-2.5 text-left font-[Nunito] text-xs transition-colors ${
                              active
                                ? "border-secondary bg-secondary/10 text-secondary"
                                : "border-border text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            <span className="block font-semibold">{b.value}</span>
                            <span className="mt-0.5 block opacity-75">{b.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="g-phone">Contact Number</Label>
                    <Input id="g-phone" value={general.phone} onChange={(e) => setGeneral({ ...general, phone: e.target.value })} placeholder="+91 …" />
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="g-address">Address</Label>
                    <Textarea id="g-address" rows={2} value={general.address} onChange={(e) => setGeneral({ ...general, address: e.target.value })} placeholder="Street, city, state — printed on paper headers" />
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="g-website">Website</Label>
                    <Input id="g-website" value={general.website} onChange={(e) => setGeneral({ ...general, website: e.target.value })} placeholder="https://…" />
                  </div>
                </div>

                {/* Logo upload */}
                <div className="space-y-2 rounded-lg border border-border/60 bg-muted/30 p-4">
                  <Label>School Logo</Label>
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-lg border border-border bg-slate-950">
                      {general.logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={general.logoUrl} alt="School logo" className="h-full w-full object-contain" />
                      ) : (
                        <span className="text-2xl font-bold text-muted-foreground">
                          {general.name.charAt(0).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <Button type="button" variant="outline" size="sm" className="gap-1.5 font-[Nunito] text-xs" onClick={() => fileRef.current?.click()} disabled={uploading}>
                          <Upload className="h-3.5 w-3.5" />
                          {uploading ? "Reading…" : "Upload logo"}
                        </Button>
                        {general.logoUrl && (
                          <Button type="button" variant="ghost" size="sm" className="gap-1.5 font-[Nunito] text-xs text-red-400" onClick={() => setGeneral({ ...general, logoUrl: "" })}>
                            <X className="h-3.5 w-3.5" />
                            Remove
                          </Button>
                        )}
                        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void handleUpload(e)} />
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        PNG / JPG / SVG under 1.5 MB. Used on generated paper headers.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 border-t border-border/50 pt-4">
                  <Button type="submit" disabled={savingSection === "general"} className="gap-1.5 font-[Nunito]">
                    <Save className="h-4 w-4" />
                    {savingSection === "general" ? "Saving…" : "Save branding"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 2: Academic Setup ── */}
        <TabsContent value="academic">
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="font-[Rasa] text-lg font-semibold">Academics</CardTitle>
              <CardDescription className="font-[Nunito] text-xs">
                The active academic year and the languages papers may be created in.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={saveAcademic} className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="a-year">Active Academic Year</Label>
                    <Input id="a-year" value={academic.academicYear} onChange={(e) => setAcademic({ ...academic, academicYear: e.target.value })} placeholder="e.g. 2026-27" />
                    <p className="text-[11px] text-muted-foreground">Printed on paper headers alongside the class.</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Enabled Mediums</Label>
                    <div className="flex items-center gap-2">
                      {MEDIUM_OPTIONS.map((m) => {
                        const active = academic.mediums.includes(m.value);
                        return (
                          <button
                            type="button"
                            key={m.value}
                            onClick={() =>
                              setAcademic({
                                ...academic,
                                mediums: active ? academic.mediums.filter((x) => x !== m.value) : [...academic.mediums, m.value],
                              })
                            }
                            className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                              active ? "border-secondary bg-secondary/10 text-secondary" : "border-border text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            {m.label}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[11px] text-muted-foreground">Teachers can only pick from these when creating papers.</p>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 border-t border-border/50 pt-4">
                  <Button type="submit" disabled={savingSection === "academic"} className="gap-1.5 font-[Nunito]">
                    <Save className="h-4 w-4" />
                    {savingSection === "academic" ? "Saving…" : "Save academics"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 3: Paper Defaults ── */}
        <TabsContent value="papers">
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="font-[Rasa] text-lg font-semibold">Paper Defaults</CardTitle>
              <CardDescription className="font-[Nunito] text-xs">
                Pre-filled into every new paper and used by the PDF engine. Teachers can override per paper.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={savePapers} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="p-instructions">Default Instructions</Label>
                  <Textarea
                    id="p-instructions"
                    rows={5}
                    value={papers.defaultInstructions}
                    onChange={(e) => setPapers({ ...papers, defaultInstructions: e.target.value })}
                    placeholder={"Answer all questions.\nEach question carries the marks shown beside it.\nCalculators are not allowed."}
                  />
                  <p className="text-[11px] text-muted-foreground">Printed in the instructions box on page 1 of every paper.</p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="p-watermark">Watermark Text</Label>
                  <Input
                    id="p-watermark"
                    value={papers.watermarkText}
                    onChange={(e) => setPapers({ ...papers, watermarkText: e.target.value })}
                    placeholder="e.g. CONFIDENTIAL — SCHOOL NAME"
                    maxLength={100}
                  />
                  <p className="text-[11px] text-muted-foreground">Repeated diagonally across every page of the PDF.</p>
                </div>

                <div className="space-y-2 border-t border-border/50 pt-4">
                  <div>
                    <Label>Default Header Design</Label>
                    <p className="text-[11px] text-muted-foreground">
                      New papers start from this layout. Drag blocks, resize them and pick a preview — then save.
                    </p>
                  </div>
                  <HeaderBuilderCanvas
                    value={headerConfig}
                    onChange={setHeaderConfig}
                    context={headerContext}
                    logoUrl={schoolProfile.logoUrl}
                    schoolDefault={initialHeader}
                    schoolProfile={schoolProfile}
                  />
                </div>

                {/* ── Heading template library ── */}
                <div className="space-y-3 border-t border-border/50 pt-4">
                  <div>
                    <Label>Saved Heading Templates</Label>
                    <p className="text-[11px] text-muted-foreground">
                      Save any design as a named template, then pick it on a paper (Create Paper →
                      Heading Template, or Customize on the paper page).
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      value={templateName}
                      onChange={(e) => setTemplateName(e.target.value)}
                      placeholder="Template name, e.g. Unit Test — GSEB"
                      maxLength={80}
                      className="h-9 max-w-xs flex-1"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void saveCurrentAsTemplate()}
                      disabled={templateBusy}
                      className="gap-1.5"
                    >
                      <Save className="h-4 w-4" />
                      {templateBusy ? "Saving…" : "Save current design as template"}
                    </Button>
                  </div>

                  {templates.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-border/60 p-3 text-xs text-muted-foreground">
                      No templates yet — the design you are editing can be saved above.
                    </p>
                  ) : (
                    <ul className="divide-y divide-border/50 rounded-lg border border-border/60">
                      {templates.map((t) => (
                        <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 p-2.5">
                          <span className="flex items-center gap-2 text-sm">
                            {t.name}
                            <span
                              className={`rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${
                                t.kind === "EXAM"
                                  ? "bg-violet-500/15 text-violet-300"
                                  : "bg-sky-500/15 text-sky-300"
                              }`}
                            >
                              {t.kind === "EXAM" ? "Exam" : "Custom"}
                            </span>
                          </span>
                          <span className="flex items-center gap-1.5">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              disabled={templateBusy}
                              onClick={() => {
                                setHeaderConfig(t.config);
                                toast.info(`Loaded "${t.name}" into the editor.`);
                              }}
                            >
                              Load into editor
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              disabled={templateBusy}
                              className="text-red-400 hover:text-red-300"
                              onClick={() => void removeTemplate(t)}
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="flex items-center justify-end gap-3 border-t border-border/50 pt-4">
                  <Button type="submit" disabled={savingSection === "papers"} className="gap-1.5 font-[Nunito]">
                    <Save className="h-4 w-4" />
                    {savingSection === "papers" ? "Saving…" : "Save paper defaults"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 4: Permissions & Security ── */}
        <TabsContent value="permissions">
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="font-[Rasa] text-lg font-semibold">Permissions</CardTitle>
              <CardDescription className="font-[Nunito] text-xs">
                Control sign-up and content-editing rights inside this school.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={savePermissions} className="space-y-4">
                <div className="space-y-3">
                  {switchRow(
                    "Allow self registration",
                    "Teachers and students can create their own accounts without an admin.",
                    perms.allowSelfRegistration,
                    (v) => setPerms({ ...perms, allowSelfRegistration: v })
                  )}
                  {switchRow(
                    "Teachers can edit papers",
                    "Teachers may create, edit and publish papers. Disable to make all content admin-only.",
                    perms.teacherCanEdit,
                    (v) => setPerms({ ...perms, teacherCanEdit: v })
                  )}
                </div>

                <div className="flex items-center justify-end gap-3 border-t border-border/50 pt-4">
                  <Button type="submit" disabled={savingSection === "permissions"} className="gap-1.5 font-[Nunito]">
                    <Save className="h-4 w-4" />
                    {savingSection === "permissions" ? "Saving…" : "Save permissions"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 5: Notifications ── */}
        <TabsContent value="notifications">
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="font-[Rasa] text-lg font-semibold">Notification Channels</CardTitle>
              <CardDescription className="font-[Nunito] text-xs">
                Choose how each event reaches teachers and admins. Changes apply to notifications
                sent from now on.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={saveNotifications} className="space-y-4">
                <div className="space-y-3">
                  {NOTIFICATION_EVENTS.map((ev) => {
                    const prefs = notifPrefs[ev.value];
                    const isReminder = ev.value === "REVIEW_REMINDER";
                    return (
                      <div
                        key={ev.value}
                        className="rounded-lg border border-border/60 bg-muted/30 px-4 py-3"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="font-[Nunito] text-sm font-medium">{ev.label}</p>
                            <p className="text-xs text-muted-foreground">{ev.description}</p>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {CHANNELS.map((ch) => {
                              const active = prefs[ch.key];
                              return (
                                <button
                                  key={ch.key}
                                  type="button"
                                  title={ch.hint}
                                  aria-pressed={active}
                                  onClick={() => toggleChannel(ev.value, ch.key)}
                                  className={`rounded-md border px-2.5 py-1 font-[Nunito] text-[11px] font-semibold transition-colors ${
                                    active
                                      ? "border-secondary bg-secondary/10 text-secondary"
                                      : "border-border bg-background text-muted-foreground hover:text-foreground"
                                  }`}
                                >
                                  {ch.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {isReminder && (
                          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/50 pt-3">
                            <Label htmlFor="rem-hours" className="text-xs text-muted-foreground">
                              Remind after
                            </Label>
                            <Input
                              id="rem-hours"
                              type="number"
                              min={1}
                              max={720}
                              value={prefs.reminderHours}
                              onChange={(e) => setReminderHours(Number(e.target.value))}
                              className="h-8 w-20 text-center"
                            />
                            <span className="font-[Nunito] text-xs text-muted-foreground">
                              hours still sitting in the review queue
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <p className="rounded-lg border border-dashed border-border/60 px-4 py-3 font-[Nunito] text-[11px] text-muted-foreground">
                  In-app items land in the header bell. Push needs each person to press &ldquo;Turn
                  on&rdquo; in the bell menu once per browser. Email needs SMTP to be configured;
                  the test button never sends mail.
                </p>

                <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border/50 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void sendTest()}
                    disabled={testBusy}
                    className="gap-1.5 font-[Nunito]"
                  >
                    <Bell className="h-4 w-4" />
                    {testBusy ? "Sending…" : "Send test notification"}
                  </Button>
                  <Button
                    type="submit"
                    disabled={savingSection === "notifications"}
                    className="gap-1.5 font-[Nunito]"
                  >
                    <Save className="h-4 w-4" />
                    {savingSection === "notifications" ? "Saving…" : "Save notification settings"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}