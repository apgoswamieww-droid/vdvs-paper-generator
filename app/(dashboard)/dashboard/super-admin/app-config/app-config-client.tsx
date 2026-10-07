"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Save, Smartphone, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { LoadingButton } from "@/components/shared";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { AppConfigView } from "@/lib/app-config";
import { updateAppConfig } from "./actions";

const SEMVER = /^\d+\.\d+\.\d+$/;

function switchRow(
  label: string,
  description: string,
  checked: boolean,
  onChange: (value: boolean) => void
) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border/50 bg-muted/30 px-4 py-3">
      <div>
        <p className="font-[Nunito] text-sm font-medium">{label}</p>
        <p className="font-[Nunito] text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function VersionField({
  id,
  label,
  hint,
  value,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const invalid = !SEMVER.test(value.trim());
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="font-[Nunito] text-sm">
        {label}
      </Label>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="1.0.0"
        inputMode="decimal"
        aria-invalid={invalid}
        className="max-w-40 font-mono"
      />
      <p
        className={
          invalid
            ? "font-[Nunito] text-xs text-destructive"
            : "font-[Nunito] text-xs text-muted-foreground"
        }
      >
        {invalid ? "Use semantic versioning, e.g. 1.2.3." : hint}
      </p>
    </div>
  );
}

export function AppConfigClient({ config }: { config: AppConfigView }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [androidVersion, setAndroidVersion] = useState(config.androidVersion);
  const [androidCompulsory, setAndroidCompulsory] = useState(
    config.androidCompulsoryUpdate
  );
  const [iosVersion, setIosVersion] = useState(config.iosVersion);
  const [iosCompulsory, setIosCompulsory] = useState(
    config.iosCompulsoryUpdate
  );
  const [maintenanceMode, setMaintenanceMode] = useState(config.maintenanceMode);

  const versionsValid =
    SEMVER.test(androidVersion.trim()) && SEMVER.test(iosVersion.trim());

  function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!versionsValid) {
      toast.error("Versions must look like 1.2.3.");
      return;
    }
    startTransition(async () => {
      const result = await updateAppConfig({
        androidVersion: androidVersion.trim(),
        androidCompulsoryUpdate: androidCompulsory,
        iosVersion: iosVersion.trim(),
        iosCompulsoryUpdate: iosCompulsory,
        maintenanceMode,
      });
      if (!result.success) {
        toast.error(result.error ?? "Could not save the app configuration.");
        return;
      }
      toast.success("App configuration saved.");
      router.refresh();
    });
  }

  return (
    <form onSubmit={save} className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-[Rasa] text-3xl font-bold tracking-tight">
            App Configuration
          </h1>
          <p className="font-[Nunito] mt-1 text-sm text-muted-foreground">
            Version gates and maintenance mode for the mobile app — checked on
            every launch via{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
              GET /api/app/init
            </code>
            .
          </p>
        </div>
        <Badge
          variant={maintenanceMode ? "destructive" : "outline"}
          className={
            maintenanceMode
              ? undefined
              : "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
          }
        >
          {maintenanceMode ? "Maintenance ON" : "Live"}
        </Badge>
      </div>

      {maintenanceMode && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <p className="font-[Nunito] text-sm text-amber-300">
            Maintenance mode is ON — mobile users will see the Under
            Maintenance screen and cannot use the app until you turn it off.
          </p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="font-[Rasa] flex items-center gap-2 text-lg font-semibold">
              <Smartphone className="h-4 w-4" /> Android
            </CardTitle>
            <CardDescription className="font-[Nunito] text-xs">
              Build served to Android users from the Play Store.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <VersionField
              id="android-version"
              label="Version"
              hint="Compared against the installed app version on launch."
              value={androidVersion}
              onChange={setAndroidVersion}
            />
            {switchRow(
              "Compulsory update",
              "Older builds must update before they can continue.",
              androidCompulsory,
              setAndroidCompulsory
            )}
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="font-[Rasa] flex items-center gap-2 text-lg font-semibold">
              <Smartphone className="h-4 w-4" /> iOS
            </CardTitle>
            <CardDescription className="font-[Nunito] text-xs">
              Build served to iOS users from the App Store.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <VersionField
              id="ios-version"
              label="Version"
              hint="Compared against the installed app version on launch."
              value={iosVersion}
              onChange={setIosVersion}
            />
            {switchRow(
              "Compulsory update",
              "Older builds must update before they can continue.",
              iosCompulsory,
              setIosCompulsory
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="font-[Rasa] text-lg font-semibold">
            Maintenance mode
          </CardTitle>
          <CardDescription className="font-[Nunito] text-xs">
            Block the mobile app entirely while you fix or deploy something.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {switchRow(
            "Enable maintenance mode",
            "Every mobile launch is redirected to the Under Maintenance screen until this is turned off.",
            maintenanceMode,
            setMaintenanceMode
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/50 pt-4">
        <p className="font-[Nunito] text-xs text-muted-foreground">
          Last updated{" "}
          {/* Explicit locale + timeZone: `undefined` renders in the host's
              locale, so the server emitted "Oct 7, 2026" and the browser
              re-rendered "7 Oct 2026" — a hydration mismatch. */}
          <time dateTime={config.updatedAt}>
            {new Date(config.updatedAt).toLocaleString("en-US", {
              day: "2-digit",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
              hour12: true,
              timeZone: "UTC",
            })}
          </time>
          UTC
        </p>
        <LoadingButton
          type="submit"
          loading={isPending}
          loadingText="Saving…"
          disabled={!versionsValid}
          className="gap-1.5 font-[Nunito]"
        >
          <Save className="h-4 w-4" />
          Save changes
        </LoadingButton>
      </div>
    </form>
  );
}
