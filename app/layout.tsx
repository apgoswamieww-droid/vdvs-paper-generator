import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "SchoolPaperGen — Smart Exam Paper Generator",
    template: "%s | SchoolPaperGen",
  },
  description:
    "Multi-tenant SaaS platform for schools to create, manage, and distribute custom exam papers effortlessly.",
  keywords: ["exam paper", "question bank", "school", "SaaS", "education"],
  authors: [{ name: "SchoolPaperGen Team" }],
  openGraph: {
    type: "website",
    locale: "en_IN",
    url: process.env.NEXT_PUBLIC_APP_URL,
    siteName: "SchoolPaperGen",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
