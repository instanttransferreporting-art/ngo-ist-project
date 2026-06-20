import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { NavigationLoader } from "@/components/NavigationLoader";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "STARGROUP - TASK LOG",
  description: "Système de gestion des tâches STARGROUP",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className={`${geistSans.variable} h-full`}>
      <body className="min-h-full antialiased">
        <NavigationLoader />
        {children}
      </body>
    </html>
  );
}
