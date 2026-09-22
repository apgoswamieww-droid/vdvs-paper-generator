import type { Metadata } from "next";
import "./globals.css";
import { SessionProvider } from "@/components/auth/session-provider";
import { Toaster } from "sonner";

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
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans:ital,wght@0,100..900;1,100..900&family=Noto+Serif+Gujarati:wght@100..900&family=Nunito:ital,wght@0,200..1000;1,200..1000&family=Rasa:ital,wght@0,300..700;1,300..700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased">
        <SessionProvider>
          {children}
          <Toaster
            theme="dark"
            position="top-right"
            richColors
            closeButton
            duration={4000}
            toastOptions={{
              style: {
                background: "oklch(0.14 0.025 280)",
                border: "1px solid oklch(0.22 0.025 280)",
                color: "oklch(0.95 0.005 90)",
                fontFamily: "Nunito, sans-serif",
              },
            }}
          />
        </SessionProvider>
      </body>
    </html>
  );
}
