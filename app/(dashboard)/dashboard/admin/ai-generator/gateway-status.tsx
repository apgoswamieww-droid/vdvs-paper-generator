"use client";

import { Loader2, RefreshCw, ServerCog, Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type GatewayState = {
  online: boolean | null; // null = still probing
  displayUrl: string;
  model: string;
  detail: string;
};

// ------------------------------------------------------------
//  Pill — "AI gateway online / offline / checking…"
// ------------------------------------------------------------

export function GatewayStatusPill({
  gateway,
  checking,
  onRecheck,
}: {
  gateway: GatewayState;
  checking: boolean;
  onRecheck: () => void;
}) {
  const online = gateway.online;

  return (
    <div className="flex items-center gap-1.5">
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium",
          checking
            ? "border-border bg-muted/40 text-muted-foreground"
            : online
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
              : "border-red-500/40 bg-red-500/10 text-red-400"
        )}
        title={
          checking
            ? "Checking the AI gateway…"
            : online
              ? `AI gateway ready at ${gateway.displayUrl} (model: ${gateway.model})`
              : `AI gateway unreachable at ${gateway.displayUrl} — ${gateway.detail}`
        }
      >
        {checking ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : online ? (
          <Wifi className="h-3 w-3" />
        ) : (
          <WifiOff className="h-3 w-3" />
        )}
        {checking ? "Checking AI gateway…" : online ? "AI gateway online" : "AI gateway offline"}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        title="Re-check the AI gateway"
        disabled={checking}
        onClick={onRecheck}
      >
        <RefreshCw className={cn("h-3.5 w-3.5", checking && "animate-spin")} />
      </Button>
    </div>
  );
}

// ------------------------------------------------------------
//  Banner — setup help shown while the gateway is unreachable
// ------------------------------------------------------------

export function GatewayOfflineBanner({ gateway }: { gateway: GatewayState }) {
  return (
    <div className="space-y-2.5 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
      <div className="flex items-center gap-2.5">
        <ServerCog className="h-4 w-4 shrink-0" />
        <p>
          The AI gateway is <strong className="font-semibold">not reachable</strong> at{" "}
          <code className="rounded bg-red-500/15 px-1.5 py-0.5 text-xs">{gateway.displayUrl}</code>
          <span className="text-red-400/80"> — {gateway.detail}</span>
        </p>
      </div>
      <ul className="ml-6 list-disc space-y-1 text-xs text-red-300/80">
        <li>
          Start the local <strong>OmniRoute</strong> service on this machine — it serves an OpenAI-compatible API on port{" "}
          <code className="rounded bg-red-500/15 px-1 py-0.5">20128</code> by default.
        </li>
        <li>
          Or set <code className="rounded bg-red-500/15 px-1 py-0.5">OMNIROUTES_BASE_URL</code> in{" "}
          <code className="rounded bg-red-500/15 px-1 py-0.5">.env</code> to another reachable gateway
          (optionally <code className="rounded bg-red-500/15 px-1 py-0.5">OMNIROUTES_MODEL</code>, currently{" "}
          <span className="font-semibold">{gateway.model}</span>).
        </li>
        <li>
          Restart <code className="rounded bg-red-500/15 px-1 py-0.5">npm run dev</code> after changing the env, then
          press the re-check button above.
        </li>
      </ul>
    </div>
  );
}
