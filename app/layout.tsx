import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ControlCriadero - Granja Atuel",
  description: "Sistema de control de producción - Granja Atuel",
  manifest: "/manifest.json",
  icons: { apple: "/logo.webp" },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Criadero",
  },
};

export const viewport: Viewport = {
  themeColor: "#f9c74f",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="bg-gray-50">{children}</body>
    </html>
  );
}