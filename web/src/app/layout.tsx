import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./home-community.css";
import "./gold-theme.css";
import "./readability-polish.css";
import BottomNavigation from "@/components/bottom-navigation";

export const metadata: Metadata = {
  title: "Ghost Hunt | Central do Clã",
  description: "Painel de acompanhamento, ranking e desempenho do clã.",
  applicationName: "Ghost Hunt",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Ghost Hunt" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#100f0d",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}<BottomNavigation /></body>
    </html>
  );
}
