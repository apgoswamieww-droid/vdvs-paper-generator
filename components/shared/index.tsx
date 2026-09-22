// ============================================================
//  Shared UI kit — used by every dashboard module
//
//  • ConfirmDialog  — proper modal popup for destructive/confirm
//    actions (replaces window.confirm)
//  • LoadingButton  — button with a built-in spinner while an
//    action is pending
//  • PageLoader     — full-area loading state
//  • Spinner        — inline Loader2 icon
//  • showResultToast — one consistent toast pattern for every
//    ActionState / fetch result (success + error)
// ============================================================

"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// ------------------------------------------------------------
//  Spinner
// ------------------------------------------------------------

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={`animate-spin ${className ?? "h-4 w-4"}`} />;
}

// ------------------------------------------------------------
//  PageLoader — shown while a page/section loads
// ------------------------------------------------------------

export function PageLoader({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center gap-3 py-12">
      <Spinner className="h-6 w-6 text-primary" />
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

// ------------------------------------------------------------
//  LoadingButton — same API as Button, shows a spinner and
//  disables itself while `loading` is true.
// ------------------------------------------------------------

interface LoadingButtonProps extends React.ComponentProps<typeof Button> {
  loading?: boolean;
  loadingText?: string;
}

export function LoadingButton({
  loading = false,
  loadingText,
  disabled,
  children,
  className,
  ...props
}: LoadingButtonProps) {
  return (
    <Button disabled={disabled || loading} className={className} {...props}>
      {loading && <Spinner className={props.size?.includes("icon") ? "h-3 w-3" : undefined} />}
      {loading && loadingText ? loadingText : children}
    </Button>
  );
}

// ------------------------------------------------------------
//  ConfirmDialog — modal confirmation for destructive actions
// ------------------------------------------------------------

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title = "Are you sure?",
  description = "This action cannot be undone.",
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = true,
  loading = false,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading && <Spinner />}
            {loading ? "Working…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------
//  useConfirm — imperative hook wrapping ConfirmDialog
//
//  const confirm = useConfirm();
//  const ok = await confirm({ title, description });
//  if (!ok) return;
// ------------------------------------------------------------

export interface ConfirmOptions {
  title?: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

interface PendingConfirm extends Required<ConfirmOptions> {
  resolve: (ok: boolean) => void;
}

export function useConfirm() {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const [loading, setLoading] = useState(false);

  const confirm = (opts: ConfirmOptions = {}): Promise<boolean> =>
    new Promise((resolve) => {
      setPending({
        title: opts.title ?? "Are you sure?",
        description: opts.description ?? "This action cannot be undone.",
        confirmLabel: opts.confirmLabel ?? "Confirm",
        cancelLabel: opts.cancelLabel ?? "Cancel",
        destructive: opts.destructive ?? true,
        resolve,
      });
    });

  const element = (
    <ConfirmDialog
      open={!!pending}
      onOpenChange={(o) => {
        if (!o) {
          pending?.resolve(false);
          setPending(null);
        }
      }}
      title={pending?.title}
      description={pending?.description}
      confirmLabel={pending?.confirmLabel}
      cancelLabel={pending?.cancelLabel}
      destructive={pending?.destructive}
      loading={loading}
      onConfirm={async () => {
        setLoading(true);
        pending?.resolve(true);
      }}
      // The caller keeps the dialog open while its async work runs —
      // closing is handled by `reset()`.
    />
  );

  const reset = () => {
    setLoading(false);
    setPending(null);
  };

  return { confirm, confirmElement: element, confirmLoading: loading, confirmReset: reset };
}

// ------------------------------------------------------------
//  Toast helpers — one pattern for the whole project
// ------------------------------------------------------------

type ActionResult = { success: boolean; message?: string; error?: string };

/** Toast for a server-action / API result. Returns success boolean. */
export function showResultToast(
  result: ActionResult | null | undefined,
  opts: { successMessage?: string; errorMessage?: string } = {}
): boolean {
  if (result?.success) {
    toast.success(result.message || opts.successMessage || "Done!");
    return true;
  }
  toast.error(result?.error || opts.errorMessage || "Something went wrong. Please try again.");
  return false;
}

/** Toast for thrown errors / failed fetches. */
export function showErrorToast(errorMessage?: string) {
  toast.error(errorMessage || "Something went wrong. Please try again.");
}

export function showSuccessToast(message: string) {
  toast.success(message);
}

// Re-exports so modules import everything UI-related from one place
export { toast };
