import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "HRP Insight", description: "Pelatihan dan evaluasi.", robots: { index: false, follow: false }, referrer: "no-referrer", icons: { icon: "/favicon.svg" } };
export default function RootLayout({ children }: Readonly<{
    children: React.ReactNode;
}>) { return <html lang="id"><body>{children}</body></html>; }
