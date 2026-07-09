import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Video Editor",
  description: "AI-assisted video editing pipeline",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
