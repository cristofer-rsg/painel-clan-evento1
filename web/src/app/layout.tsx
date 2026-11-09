import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./home-community.css";
import "./gold-theme.css";
import "./readability-polish.css";
import BottomNavigation from "@/components/bottom-navigation";

const siteUrl = "https://ghosthunt.com.br";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Ghost Hunt | Central do Clã",
    template: "%s | Ghost Hunt",
  },
  description: "Acompanhe o ranking, a pontuação, os eventos e o desempenho dos jogadores do clã Ghost Hunt.",
  applicationName: "Ghost Hunt",
  openGraph: {
    type: "website",
    locale: "pt_BR",
    url: siteUrl,
    siteName: "Ghost Hunt",
    title: "Ghost Hunt | Central do Clã",
    description: "Ranking, pontuação e desempenho dos jogadores. Acompanhe a temporada e fortaleça o clã!",
  },
  twitter: {
    card: "summary_large_image",
    title: "Ghost Hunt | Central do Clã",
    description: "Ranking, pontuação e desempenho dos jogadores do clã.",
    images: ["/opengraph-image"],
  },
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
