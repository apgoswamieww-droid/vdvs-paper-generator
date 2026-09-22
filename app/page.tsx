import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { GraduationCap, FileText, HelpCircle, Shield, Zap, ArrowRight } from "lucide-react";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col">
      {/* ── Hero ── */}
      <section className="relative flex flex-1 flex-col items-center justify-center px-4 py-20 text-center">
        {/* background glow */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute left-1/2 top-0 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/20 blur-[120px]" />
          <div className="absolute bottom-0 right-0 h-[400px] w-[400px] translate-x-1/4 translate-y-1/4 rounded-full bg-secondary/10 blur-[100px]" />
        </div>

        <div className="relative z-10 space-y-8 max-w-3xl">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-secondary/30 bg-secondary/10 px-4 py-1.5 text-sm font-medium text-secondary backdrop-blur-sm">
            <span className="h-2 w-2 animate-pulse rounded-full bg-secondary" />
            Multi-Tenant SaaS — School Edition
          </div>

          {/* Logo + Title */}
          <div className="flex flex-col items-center gap-5">
            <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-primary shadow-2xl shadow-primary/40 ring-2 ring-secondary/20">
              <GraduationCap className="h-10 w-10 text-secondary" />
            </div>
            <h1 className="font-[Rasa] text-5xl font-bold tracking-tight md:text-7xl">
              School
              <span className="bg-gradient-to-r from-secondary via-amber-300 to-secondary bg-clip-text text-transparent">
                PaperGen
              </span>
            </h1>
          </div>

          <p className="mx-auto max-w-xl font-[Nunito] text-lg leading-relaxed text-muted-foreground">
            Create, manage, and distribute custom exam papers effortlessly.
            Powered by a rich question bank and built for every school.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link href="/register">
              <Button
                size="lg"
                className="bg-secondary px-10 text-sm font-bold text-primary shadow-lg shadow-secondary/20 hover:bg-secondary/90"
              >
                Get Started Free
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <Link href="/login">
              <Button
                variant="outline"
                size="lg"
                className="border-secondary/30 px-10 text-sm font-semibold text-secondary hover:bg-secondary/10"
              >
                Sign In
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="border-t border-border bg-card/50 px-4 py-20">
        <div className="mx-auto max-w-5xl space-y-12">
          <div className="text-center space-y-3">
            <h2 className="font-[Rasa] text-3xl font-bold tracking-tight">
              Everything you need
            </h2>
            <p className="text-muted-foreground">
              A complete platform for managing exam papers at your school.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: FileText,
                title: "Smart Paper Generator",
                desc: "Auto-generate balanced papers from your question bank using difficulty rules and blueprint templates.",
              },
              {
                icon: HelpCircle,
                title: "Question Bank",
                desc: "Organize questions by subject, chapter, topic, and difficulty. Tag with Bloom's taxonomy for deeper insights.",
              },
              {
                icon: Shield,
                title: "Multi-Tenant SaaS",
                desc: "Each school gets isolated data, customization options, and secure access with role-based permissions.",
              },
              {
                icon: Zap,
                title: "Instant PDF Export",
                desc: "Export print-ready PDFs with watermarks, page numbers, school headers, and optional answer keys.",
              },
              {
                icon: GraduationCap,
                title: "Bloom's Taxonomy",
                desc: "Tag questions with cognitive levels to ensure papers test a range of thinking skills.",
              },
              {
                icon: FileText,
                title: "BluePrint Mode",
                desc: "Define rules for section-wise question count and difficulty split, then let the engine build the paper.",
              },
            ].map((f) => (
              <Card key={f.title} className="group border-border/50 bg-card/80 hover:border-secondary/30 hover:ring-1 hover:ring-secondary/20">
                <CardContent className="p-6 space-y-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/20 text-secondary transition-colors group-hover:bg-secondary/20">
                    <f.icon className="h-5 w-5" />
                  </div>
                  <h3 className="font-[Rasa] text-lg font-semibold">{f.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-border px-4 py-8 text-center text-xs text-muted-foreground">
        <p>&copy; {new Date().getFullYear()} SchoolPaperGen. Built for schools, by schools.</p>
      </footer>
    </main>
  );
}
