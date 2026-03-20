import type { Metadata } from "next";
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
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className="font-sans antialiased"
      >
        {children}
      </body>
    </html>
  );
}
