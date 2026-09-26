"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Upload, X, Save, KeyRound, Lock } from "lucide-react";
import { updateMyProfile, changeMyPassword } from "./actions";

export function ProfileClient({
  profile,
}: {
  profile: { name: string; email: string; avatarUrl: string; memberSince: number };
}) {
  const router = useRouter();
  const { update } = useSession();

  const [name, setName] = useState(profile.name);
  const [avatarUrl, setAvatarUrl] = useState(profile.avatarUrl);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  const initials = name.trim() ? name.trim()[0].toUpperCase() : "U";

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file (PNG/JPG/SVG).");
      return;
    }
    if (file.size > 1.5 * 1024 * 1024) {
      toast.error("Avatar must be under 1.5 MB.");
      return;
    }
    setUploading(true);
    const reader = new FileReader();
    reader.onload = () => {
      setAvatarUrl(String(reader.result));
      setUploading(false);
    };
    reader.onerror = () => {
      setUploading(false);
      toast.error("Could not read the image.");
    };
    reader.readAsDataURL(file);
  }

  async function saveProfile(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSavingProfile(true);
    const result = await updateMyProfile({ name, avatarUrl });
    setSavingProfile(false);
    if (!result.success) {
      toast.error(result.error ?? "Could not update your profile.");
      return;
    }
    toast.success("Profile updated.");
    router.refresh();
    try {
      await update({ name });
    } catch {
      // session refresh is best-effort; page data still reflects the new name
    }
  }

  async function savePassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSavingPassword(true);
    const result = await changeMyPassword({ currentPassword, newPassword, confirmPassword });
    setSavingPassword(false);
    if (!result.success) {
      toast.error(result.error ?? "Could not change your password.");
      return;
    }
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    toast.success("Password changed successfully.");
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* ── Profile details ── */}
      <Card className="border-border/50 h-fit">
        <CardHeader>
          <CardTitle className="font-[Rasa] text-lg font-semibold">Profile Details</CardTitle>
          <CardDescription className="font-[Nunito] text-xs">
            Your name and photo appear across the dashboard and on generated content.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={saveProfile} className="space-y-4">
            {/* Avatar */}
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16 ring-2 ring-secondary/20">
                <AvatarImage src={avatarUrl || undefined} alt={name} />
                <AvatarFallback className="bg-primary text-secondary text-2xl font-bold">{initials}</AvatarFallback>
              </Avatar>
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" variant="outline" size="sm" className="gap-1.5 font-[Nunito] text-xs" onClick={() => fileRef.current?.click()} disabled={uploading}>
                    <Upload className="h-3.5 w-3.5" />
                    {uploading ? "Reading…" : "Upload photo"}
                  </Button>
                  {avatarUrl && (
                    <Button type="button" variant="ghost" size="sm" className="gap-1.5 font-[Nunito] text-xs text-red-400" onClick={() => setAvatarUrl("")}>
                      <X className="h-3.5 w-3.5" />
                      Remove
                    </Button>
                  )}
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void handleUpload(e)} />
                </div>
                <p className="text-[11px] text-muted-foreground">PNG / JPG / SVG under 1.5 MB.</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="p-name">Full Name *</Label>
              <Input id="p-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="p-email">Email (read-only)</Label>
              <Input id="p-email" value={profile.email} readOnly className="bg-muted/40 font-mono text-xs" />
              <p className="text-[11px] text-muted-foreground">Your sign-in identity — ask your admin to change it.</p>
            </div>

            <div className="space-y-1.5">
              <Label>Member since</Label>
              <p className="font-[Nunito] text-sm text-muted-foreground">{profile.memberSince}</p>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-border/50 pt-4">
              <Button type="submit" disabled={savingProfile} className="gap-1.5 font-[Nunito]">
                <Save className="h-4 w-4" />
                {savingProfile ? "Saving…" : "Save profile"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* ── Change password ── */}
      <Card className="border-border/50 h-fit">
        <CardHeader>
          <CardTitle className="font-[Rasa] text-lg font-semibold">Change Password</CardTitle>
          <CardDescription className="font-[Nunito] text-xs">
            Use a strong password you don&apos;t reuse elsewhere.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={savePassword} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="c-current">Current Password *</Label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
                <Input
                  id="c-current"
                  type="password"
                  className="pl-9 font-mono"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="c-new">New Password *</Label>
              <div className="relative">
                <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
                <Input
                  id="c-new"
                  type="password"
                  className="pl-9 font-mono"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                />
              </div>
              <p className="text-[11px] text-muted-foreground">At least 8 characters.</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="c-confirm">Confirm New Password *</Label>
              <div className="relative">
                <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
                <Input
                  id="c-confirm"
                  type="password"
                  className="pl-9 font-mono"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-border/50 pt-4">
              <Button type="submit" disabled={savingPassword} className="gap-1.5 font-[Nunito]">
                <KeyRound className="h-4 w-4" />
                {savingPassword ? "Updating…" : "Change password"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}