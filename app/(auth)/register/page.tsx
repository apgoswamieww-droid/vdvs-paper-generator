import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { GraduationCap } from "lucide-react";

export const metadata: Metadata = {
  title: "Register",
  description: "Register your school on SchoolPaperGen and get started for free.",
};

export default function RegisterPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-8">
        {/* Logo + heading */}
        <div className="flex flex-col items-center gap-3">
          <Link href="/" className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary shadow-xl shadow-primary/30 ring-2 ring-secondary/20">
            <GraduationCap className="h-7 w-7 text-secondary" />
          </Link>
          <div className="text-center space-y-1">
            <h1 className="font-[Rasa] text-3xl font-bold tracking-tight">
              Register your school
            </h1>
            <p className="font-[Nunito] text-sm text-muted-foreground">
              Start generating papers for free today
            </p>
          </div>
        </div>

        {/* Card */}
        <Card className="border-border/50 shadow-xl shadow-primary/5">
          <CardHeader className="pb-0">
            <p className="font-[Nunito] text-center text-xs text-muted-foreground">
              Create your admin account in seconds
            </p>
          </CardHeader>
          <CardContent className="p-6 pt-4">
            <form className="space-y-4" action="#" method="POST">
              <div className="space-y-2">
                <Label htmlFor="school-name" className="font-[Nunito] text-sm font-medium">
                  School Name
                </Label>
                <Input
                  id="school-name"
                  type="text"
                  placeholder="St. Xavier&apos;s High School"
                  required
                  className="h-10"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="admin-name" className="font-[Nunito] text-sm font-medium">
                  Your Name
                </Label>
                <Input
                  id="admin-name"
                  type="text"
                  placeholder="Full Name"
                  required
                  className="h-10"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="reg-email" className="font-[Nunito] text-sm font-medium">
                  Email
                </Label>
                <Input
                  id="reg-email"
                  type="email"
                  placeholder="admin@school.edu"
                  required
                  className="h-10"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="reg-password" className="font-[Nunito] text-sm font-medium">
                  Password
                </Label>
                <Input
                  id="reg-password"
                  type="password"
                  placeholder="Min. 8 characters"
                  required
                  className="h-10"
                />
              </div>

              <Button
                type="submit"
                className="h-10 w-full bg-secondary font-bold text-primary hover:bg-secondary/90"
              >
                Create Account
              </Button>
            </form>

            <div className="relative my-6">
              <Separator />
              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">
                or
              </span>
            </div>

            <Button variant="outline" className="w-full h-10 border-border/60 font-[Nunito]">
              Continue with Google
            </Button>
          </CardContent>
        </Card>

        <p className="font-[Nunito] text-center text-sm text-muted-foreground">
          Already registered?{" "}
          <Link href="/login" className="font-semibold text-secondary hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
