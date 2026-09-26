import type { Metadata } from "next";
import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { ProfileClient } from "./profile-client";

export const metadata: Metadata = {
  title: "My Profile",
  description: "Update your profile details and change your password.",
};

export default async function AdminProfilePage() {
  const session = await requireSession();

  const me = await prisma.user.findUnique({
    where: { id: session.id },
    select: { name: true, email: true, avatarUrl: true, createdAt: true },
  });

  if (!me) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
        Profile not found. Please sign out and back in.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[Rasa] text-3xl font-bold tracking-tight">My Profile</h1>
        <p className="font-[Nunito] mt-1 text-sm text-muted-foreground">
          Manage your personal details and secure your account.
        </p>
      </div>

      <ProfileClient
        profile={{
          name: me.name ?? "",
          email: me.email,
          avatarUrl: me.avatarUrl ?? "",
          memberSince: me.createdAt.getFullYear(),
        }}
      />
    </div>
  );
}