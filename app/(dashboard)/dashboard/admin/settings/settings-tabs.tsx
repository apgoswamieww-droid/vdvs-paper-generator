"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ShieldAlert, Upload, X, Save } from "lucide-react";
import type { PlanTier } from "@/types";
import { updateSchoolSettings } from "./actions";

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

export function SettingsTabs({
  school,
  auditSchoolId,
}: {
  school: SchoolSettingsValue;
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
  // Tab 4 — Permissions & Security
  const [perms, setPerms] = useState({
    allowSelfRegistration: school.allowSelfRegistration,
    teacherCanEdit: school.teacherCanEdit,
  });

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
    await save("papers", papers);
  }

  async function savePermissions(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await save("permissions", perms);
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
      </Tabs>
    </div>
  );
}