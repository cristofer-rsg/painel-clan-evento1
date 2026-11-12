const links = [
  { href: "/admin", label: "Visão geral", icon: "⌂" },
  { href: "/admin/players", label: "Jogadores", icon: "♟" },
  { href: "/admin/events", label: "Lançamentos", icon: "✎" },
  { href: "/admin/performance", label: "Desempenho", icon: "◈" },
  { href: "/admin/history", label: "Histórico", icon: "▤" },
];
export default function AdminNavigation({ current }: { current: string }) {
  return <nav className="admin-navigation" aria-label="Navegação administrativa">
    {links.map(link => <a key={link.href} href={link.href} className={current === link.href ? "admin-nav-link active" : "admin-nav-link"} aria-current={current === link.href ? "page" : undefined}>
      <span aria-hidden="true">{link.icon}</span>{link.label}
    </a>)}
  </nav>;
}
