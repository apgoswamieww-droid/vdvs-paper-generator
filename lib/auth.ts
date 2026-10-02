import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";

// Augment the session so the forced-password-reset flag can travel through
// unstable_update() when the user sets their own password.
declare module "next-auth" {
  interface Session {
    mustChangePassword?: boolean;
  }
}

const {
  handlers,
  signIn,
  signOut,
  auth,
  // Server-side session refresh (e.g. clearing mustChangePassword).
  unstable_update,
} = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
        });

        if (!user || !user.isActive || !user.passwordHash) return null;

        const valid = await bcrypt.compare(
          credentials.password as string,
          user.passwordHash
        );
        if (!valid) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          schoolId: user.schoolId,
          // Bulk-imported students must set their own password first.
          mustChangePassword: user.mustChangePassword,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      const extra = user as {
        role?: string | null;
        schoolId?: string | null;
        mustChangePassword?: boolean | null;
      } | null;
      if (extra?.role) token.role = extra.role;
      if (extra?.schoolId) token.schoolId = extra.schoolId;
      if (extra && typeof extra.mustChangePassword === "boolean") {
        token.mustChangePassword = extra.mustChangePassword;
      }
      if (trigger === "update" && session) {
        const s = session as { name?: string | null; mustChangePassword?: boolean | null };
        if (s.name) token.name = s.name;
        if (typeof s.mustChangePassword === "boolean") {
          token.mustChangePassword = s.mustChangePassword;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        const su = session.user as {
          id?: string | null;
          role?: string | null;
          schoolId?: string | null;
          mustChangePassword?: boolean | null;
        };
        su.id = token.sub;
        su.role = typeof token.role === "string" ? token.role : null;
        su.schoolId = typeof token.schoolId === "string" ? token.schoolId : null;
        su.mustChangePassword = token.mustChangePassword === true;
      }
      return session;
    },
    async redirect({ url, baseUrl }) {
      // After login, redirect based on role is handled by middleware
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      if (new URL(url).origin === baseUrl) return url;
      return baseUrl;
    },
  },
});

// Server-side session refresh (used to clear mustChangePassword after a reset).
export { handlers, signIn, signOut, auth, unstable_update as updateSession };
