"use client";

import { useState } from "react";
import { getCsrfToken, getSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { GraduationCap, Loader2, AlertCircle, Eye, EyeOff } from "lucide-react";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    try {
      const csrfToken = await getCsrfToken();
      if (!csrfToken) {
        setError("Could not start a sign-in session. Please refresh and try again.");
        setLoading(false);
        return;
      }

      const res = await fetch("/api/auth/callback/credentials?login=1", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "X-Auth-Return-Redirect": "1",
        },
        body: new URLSearchParams({
          csrfToken,
          email,
          password,
          callbackUrl: "/dashboard",
        }),
        redirect: "manual",
      });

      let payload: { url?: unknown } | null = null;
      try {
        payload = await res.json();
      } catch {
        payload = null;
      }

      const rawUrl = typeof payload?.url === "string" ? payload.url : "";
      const errorCode = rawUrl && /^https?:\/\//.test(rawUrl) ? new URL(rawUrl).searchParams.get("error") : null;

      if (errorCode) {
        setLoading(false);
        setError(
          errorCode === "CredentialsSignin"
            ? "Invalid email or password. Please try again."
            : "Sign-in was rejected. Please try again or contact your admin."
        );
        return;
      }

      // Refresh the React session context so the header reflects the login,
      // then navigate to the intended page.
      await getSession();
      router.push(callbackUrl);
      router.refresh();
    } catch {
      setLoading(false);
      setError("Sign-in service is unavailable right now. Please try again in a moment.");
    }
  }

  return (
    <div className="w-full max-w-md space-y-8">
      <div className="flex flex-col items-center gap-3">
        <Link
          href="/"
          className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary shadow-xl shadow-primary/30 ring-2 ring-secondary/20"
        >
          <GraduationCap className="h-7 w-7 text-secondary" />
        </Link>
        <div className="text-center space-y-1">
          <h1 className="font-[Rasa] text-3xl font-bold tracking-tight">
            Welcome back
          </h1>
          <p className="font-[Nunito] text-sm text-muted-foreground">
            Sign in to your school account
          </p>
        </div>
      </div>

      <Card className="border-border/50 shadow-xl shadow-primary/5">
        <CardHeader className="pb-0">
          <p className="font-[Nunito] text-center text-xs text-muted-foreground">
            Teacher & Student login
          </p>
        </CardHeader>
        <CardContent className="p-6 pt-4">
          {error && (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="font-[Nunito] text-sm font-medium">
                Email
              </Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="you@school.edu"
                required
                className="h-10"
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="font-[Nunito] text-sm font-medium">
                  Password
                </Label>
                <a
                  href="#"
                  className="font-[Nunito] text-xs font-medium text-secondary hover:underline"
                >
                  Forgot password?
                </a>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  required
                  className="h-10 pr-10"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="h-10 w-full bg-secondary font-bold text-primary hover:bg-secondary/90"
              disabled={loading}
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {loading ? "Signing in..." : "Sign In"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
