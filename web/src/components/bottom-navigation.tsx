"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";

const items = [
  { href: "/", icon: "⌂", label: "Início" },
  { href: "/ranking", icon: "♛", label: "Ranking" },
  { href: "/performance", icon: "◈", label: "Desempenho" },
  { href: "/tempo-de-cla", icon: "◷", label: "Tempo de Clã" },
  { href: "/rules", icon: "⚖", label: "Regras" },
];

export default function BottomNavigation() {
  const pathname = usePathname();
  const router = useRouter();
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const navigationPending = useRef(false);
  const currentPath = useRef(pathname);
  const isAdminArea = pathname.startsWith("/admin") || pathname === "/login";

  useEffect(() => {
    currentPath.current = pathname;
    navigationPending.current = false;
  }, [pathname]);

  useEffect(() => {
    // Admin and login areas must never inherit public swipe navigation.
    if (isAdminArea) {
      touchStart.current = null;
      navigationPending.current = false;
      return;
    }

    items.forEach((item) => router.prefetch(item.href));

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1 || navigationPending.current) {
        touchStart.current = null;
        return;
      }
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest("input, textarea, select, [contenteditable='true'], [data-no-swipe], .horizontal-scroll, [data-swipe-ignore]")
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
      if (!start || event.changedTouches.length !== 1 || navigationPending.current) return;
      const touch = event.changedTouches[0];
      const deltaX = touch.clientX - start.x;
      const deltaY = touch.clientY - start.y;
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);
      if (absX < 48 || absX < absY * 1.2) return;

      const path = currentPath.current;
      const currentIndex = items.findIndex((item) =>
        item.href === "/" ? path === "/" : path === item.href || path.startsWith(item.href + "/")
      );
      const index = currentIndex >= 0 ? currentIndex : path.startsWith("/player/") ? 1 : 0;
      const nextIndex = deltaX < 0
        ? Math.min(items.length - 1, index + 1)
        : Math.max(0, index - 1);

      if (nextIndex !== index) {
        navigationPending.current = true;
        router.push(items[nextIndex].href, { scroll: false });
      }
    };

    const onTouchCancel = () => { touchStart.current = null; };
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("touchcancel", onTouchCancel, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchCancel);
    };
  }, [router, isAdminArea]);

  if (isAdminArea) return null;

  return (
    <nav className="mobile-bottom-nav" aria-label="Navegação principal">
      <span className="mobile-nav-swipe-arrow" aria-hidden="true">‹</span>
      {items.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link className={active ? "mobile-nav-item active" : "mobile-nav-item"} href={item.href} key={item.label} aria-current={active ? "page" : undefined} prefetch>
            <span className="mobile-nav-icon" aria-hidden="true">{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        );
      })}
      <span className="mobile-nav-swipe-arrow" aria-hidden="true">›</span>
    </nav>
  );
}
