import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, HelpCircle, FolderTree, Users, ArrowRight, Plus } from "lucide-react";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Your SchoolPaperGen control panel.",
};

export default function DashboardPage() {
  const stats = [
    {
      label: "Total Papers",
      value: "0",
      icon: FileText,
      color: "text-secondary",
      bg: "bg-secondary/10",
    },
    {
      label: "Question Bank",
      value: "0",
      icon: HelpCircle,
      color: "text-emerald-400",
      bg: "bg-emerald-500/10",
    },
    {
      label: "Subjects",
      value: "0",
      icon: FolderTree,
      color: "text-amber-400",
      bg: "bg-amber-500/10",
    },
    {
      label: "Teachers",
      value: "0",
      icon: Users,
      color: "text-violet-400",
      bg: "bg-violet-500/10",
    },
  ] as const;

  const quickActions = [
    {
      label: "Create Paper",
      href: "/dashboard/papers/new",
      icon: Plus,
      variant: "default" as const,
    },
    {
      label: "Add Question",
      href: "/dashboard/questions",
      icon: HelpCircle,
      variant: "outline" as const,
    },
    {
      label: "Manage Curriculum",
      href: "/dashboard/taxonomy",
      icon: FolderTree,
      variant: "outline" as const,
    },
  ];

  return (
    <div className="space-y-8">
      {/* Welcome */}
      <div>
        <h1 className="font-[Rasa] text-3xl font-bold tracking-tight">
          Good morning
        </h1>
        <p className="font-[Nunito] mt-1 text-sm text-muted-foreground">
          Here&apos;s an overview of your school&apos;s paper generation activity.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="relative overflow-hidden border-border/50">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-[Nunito] text-sm font-medium text-muted-foreground">
                    {stat.label}
                  </p>
                  <p className="font-[Rasa] mt-2 text-3xl font-bold tracking-tight">
                    {stat.value}
                  </p>
                </div>
                <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${stat.bg}`}>
                  <stat.icon className={`h-5 w-5 ${stat.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Actions */}
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="font-[Rasa] text-lg font-semibold">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {quickActions.map((action) => (
              <Link key={action.href} href={action.href}>
                <Button variant={action.variant} className="gap-2 font-[Nunito]">
                  <action.icon className="h-4 w-4" />
                  {action.label}
                </Button>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Recent Activity */}
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="font-[Rasa] text-lg font-semibold">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/50">
              <FileText className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="font-[Nunito] mt-4 text-sm text-muted-foreground">
              No recent activity. Create your first paper to get started.
            </p>
            <Link href="/dashboard/papers/new">
              <Button variant="outline" size="sm" className="mt-4 gap-2 font-[Nunito]">
                Create Paper
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
