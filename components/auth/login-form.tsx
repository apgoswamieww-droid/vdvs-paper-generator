"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { GraduationCap, Loader2, AlertCircle } from "lucide-react";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError("Invalid email or password. Please try again.");
        setLoading(false);
        return;
      }

      router.push(callbackUrl);
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
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
              <Input
                id="password"
                name="password"
                type="password"
                placeholder="Enter your password"
                required
                className="h-10"
                disabled={loading}
              />
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

          <div className="relative my-6">
            <Separator />
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">
              or
            </span>
          </div>

          <Button
            variant="outline"
            className="w-full h-10 border-border/60 font-[Nunito]"
            disabled={loading}
          >
            Continue with Google
          </Button>
        </CardContent>
      </Card>

      <p className="font-[Nunito] text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{" "}
        <Link
          href="/register"
          className="font-semibold text-secondary hover:underline"
        >
          Register your school
        </Link>
      </p>
    </div>
  );
}
