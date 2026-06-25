import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

export const metadata: Metadata = {
  title: "Case & Co. Checkout Demo",
  description: "Checkout.com integration demo for interview walkthroughs.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full bg-[#FFFFFD] text-[#323416]">
        <SiteHeader />
        {children}
      </body>
    </html>
  );
}
