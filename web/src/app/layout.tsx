import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ghost Hunt | Central do Clã",
  description: "Painel de acompanhamento, ranking e desempenho do clã.",
  applicationName: "Ghost Hunt",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Ghost Hunt" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#081426",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
