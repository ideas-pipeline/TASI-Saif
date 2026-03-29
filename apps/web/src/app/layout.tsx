import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tech Ideas — Sultan Saif",
  description: "AI-powered tech idea generation and management",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
