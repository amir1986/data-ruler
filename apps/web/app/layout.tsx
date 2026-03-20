import type { Metadata } from "next";
import { LanguageProvider } from "@/components/language-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Data Ruler",
  description: "Data quality management and profiling platform",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" dir="ltr" className="dark" suppressHydrationWarning>
      <body
        className="font-sans antialiased"
      >
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
