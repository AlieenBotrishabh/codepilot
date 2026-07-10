import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "CodePilot RAG — Autonomous Coding Copilot",
  description: "Repository understanding, debugging, and patch generation pipeline powered by LangGraph.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
// 
