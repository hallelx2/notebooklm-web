import type { Metadata } from "next";
import TRPCProvider from "@/trpc/provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "NotebookLM",
  description: "Your AI-powered research notebook.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-background-light dark:bg-background-dark text-gray-900 dark:text-gray-200 min-h-screen antialiased">
        <TRPCProvider>{children}</TRPCProvider>
      </body>
    </html>
  );
}
