"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", icon: "⌂", label: "Início" },
  { href: "/#ranking", icon: "♛", label: "Ranking" },
  { href: "/performance", icon: "◈", label: "Desempenho" },
  { href: "/history", icon: "▤", label: "Histórico" },
];

export default function PublicNavigation() {
  const pathname = usePathname();
  return <nav className="public-page-navigation" aria-label="Navegação pública">
    {items.map(item => {
      const active = item.href === "/history" ? pathname === "/history"
        : item.href === "/performance" ? pathname === "/performance"
        : item.href === "/" ? pathname === "/" : false;
      return <Link href={item.href} key={item.label} className={active ? "public-page-nav-link active" : "public-page-nav-link"} aria-current={active ? "page" : undefined}>
        <span aria-hidden="true">{item.icon}</span>{item.label}
      </Link>;
    })}
  </nav>;
}
