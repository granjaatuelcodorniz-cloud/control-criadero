import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ControlCriadero - Granja Atuel",
  description: "Sistema de control de producción - Granja Atuel",
  icons: {
    icon: "/favicon.ico",
  },
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