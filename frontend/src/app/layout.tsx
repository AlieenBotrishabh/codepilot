import "./globals.css";
import { AuthProvider } from "../lib/auth-context";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "CodePilot RAG — Autonomous Coding Copilot",
  description:
    "Repository understanding, debugging, and patch generation pipeline powered by LangGraph.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-white text-[#09090b] antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
