"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/ghosthunt", activePath: "/ghosthunt", icon: "⌂", label: "Início" },
  { href: "/ghosthunt/ranking", activePath: "/ghosthunt/ranking", icon: "♛", label: "Ranking" },
  { href: "/ghosthunt/performance", activePath: "/ghosthunt/performance", icon: "◈", label: "Desempenho" },
  { href: "/ghosthunt/tempo-de-cla", activePath: "/ghosthunt/tempo-de-cla", icon: "◷", label: "Tempo de Clã" },
  { href: "/ghosthunt/rules", activePath: "/ghosthunt/rules", icon: "⚖", label: "Regras" },
];

export default function PublicNavigation() {
  const pathname = usePathname();
  return <nav className="public-page-navigation" aria-label="Navegação pública">
    {items.map(item => {
      const active = pathname === item.activePath
        || (item.activePath !== "/ghosthunt" && pathname.startsWith(item.activePath + "/"))
        || (item.activePath === "/ghosthunt/ranking" && pathname.startsWith("/ghosthunt/player/"));
      return <Link href={item.href} key={item.label} className={active ? "public-page-nav-link active" : "public-page-nav-link"} aria-current={active ? "page" : undefined}>
        <span aria-hidden="true">{item.icon}</span>{item.label}
      </Link>;
    })}
  </nav>;
}
