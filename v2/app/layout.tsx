import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Tender Executive Dashboard",
  description: "Executive dashboard for monitoring tender participation and supply history",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <nav className="fixed top-0 left-0 right-0 z-50 flex items-center gap-1 px-2 h-[42px] bg-[#0a2540] text-white text-sm font-medium shadow-md">
          <Link href="/" className="px-3 py-1.5 rounded hover:bg-white/10 transition-colors">
            Executive Dashboard
          </Link>
          <Link href="/enquiry-to-quotation" className="px-3 py-1.5 rounded hover:bg-white/10 transition-colors">
            Enquiry to Quotation Dashboard
          </Link>
          <Link href="/supply-history" className="px-3 py-1.5 rounded hover:bg-white/10 transition-colors">
            Supply History Dashboard
          </Link>
          <Link href="/admin" className="px-3 py-1.5 rounded hover:bg-white/10 transition-colors ml-auto">
            Admin
          </Link>
        </nav>
        <div style={{ paddingTop: "42px", height: "100vh", display: "flex", flexDirection: "column" }}>
          {children}
        </div>
      </body>
    </html>
  );
}
