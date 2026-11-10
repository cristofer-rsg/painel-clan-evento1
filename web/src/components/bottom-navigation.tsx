"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";

const items = [
  { href: "/", icon: "⌂", label: "Início" },
  { href: "/ranking", icon: "♛", label: "Ranking" },
  { href: "/performance", icon: "◈", label: "Desempenho" },
  { href: "/rules", icon: "⚖", label: "Regras" },
  { href: "/history", icon: "▤", label: "Histórico" },
];

export default function BottomNavigation() {
  const pathname = usePathname();
  const router = useRouter();
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) {
        touchStart.current = null;
        return;
      }

      const target = event.target;
      if (
        target instanceof Element &&
        target.closest("input, textarea, select, [contenteditable='true'], [data-no-swipe], .horizontal-scroll")
      ) {
        touchStart.current = null;
        return;
      }

      const touch = event.touches[0];
      touchStart.current = { x: touch.clientX, y: touch.clientY };
    };

    const onTouchEnd = (event: TouchEvent) => {
      const start = touchStart.current;
      touchStart.current = null;
      if (!start || event.changedTouches.length !== 1) return;

      const touch = event.changedTouches[0];
      const deltaX = touch.clientX - start.x;
      const deltaY = touch.clientY - start.y;

      // Ignore vertical scrolling and small/accidental movements.
      if (Math.abs(deltaX) < 75 || Math.abs(deltaX) < Math.abs(deltaY) * 1.35) return;

      const currentIndex = items.findIndex((item) =>
        item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(item.href + "/")
      );
      const fallbackIndex = pathname.startsWith("/player/") ? 1 : 0;
      const index = currentIndex >= 0 ? currentIndex : fallbackIndex;
      const nextIndex = deltaX < 0 ? Math.min(items.length - 1, index + 1) : Math.max(0, index - 1);

      if (nextIndex !== index) router.push(items[nextIndex].href);
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("touchcancel", () => { touchStart.current = null; }, { passive: true });

    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [pathname, router]);

  if (pathname.startsWith("/admin") || pathname === "/login") return null;

  return (
    <nav className="mobile-bottom-nav" aria-label="Navegação principal">
      {items.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href + "/"));
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
