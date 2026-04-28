import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { cn } from "@/lib/utils";
import "./globals.css";

const sans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Invoice Copilot — AI for invoices & clients",
  description:
    "Simple, fast invoicing with an AI agent that plans, acts, and remembers — Copilot-style on mobile.",
};

export const viewport: Viewport = {
  themeColor: "#f1f4fb",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={sans.variable}>
      <body
        className={cn(
          "min-h-dvh min-h-[100dvh] bg-background font-sans text-foreground antialiased",
          sans.className
        )}
      >
        {children}
      </body>
    </html>
  );
}
