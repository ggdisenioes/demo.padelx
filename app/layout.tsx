// app/layout.tsx
import "./globals.css";
import type { Metadata } from "next";
import AppShell from "./components/AppShell";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "DEMO Padel Manager",
  description: "Plataforma DEMO para gestión de torneos y jugadores de pádel",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="bg-[#05070b] text-gray-900 antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}