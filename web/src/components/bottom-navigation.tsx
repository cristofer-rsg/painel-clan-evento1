"use client";

import { usePathname } from "next/navigation";

const items = [
  { href: "/", icon: "⌂", label: "Início" },
  { href: "/#ranking", icon: "♛", label: "Ranking" },
  { href: "/performance", icon: "◈", label: "Desempenho" },
  { href: "/history", icon: "▤", label: "Histórico" },
];

export default function BottomNavigation() {
  const pathname = usePathname();
  if (pathname.startsWith("/admin") || pathname === "/login") return null;

  return (
    <nav className="mobile-bottom-nav" aria-label="Navegação principal">
      {items.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname === item.href.split("#")[0];
        return (
          <a className={active ? "mobile-nav-item active" : "mobile-nav-item"} href={item.href} key={item.label} aria-current={active ? "page" : undefined}>
            <span className="mobile-nav-icon" aria-hidden="true">{item.icon}</span>
            <span>{item.label}</span>
          </a>
        );
      })}
    </nav>
  );
}
