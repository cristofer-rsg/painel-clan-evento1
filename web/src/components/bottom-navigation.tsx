"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";

const items = [
  { href: "/ghosthunt", route: "/", icon: "⌂", label: "Início" },
  { href: "/ghosthunt/ranking", route: "/ranking", icon: "♛", label: "Ranking" },
  { href: "/ghosthunt/performance", route: "/performance", icon: "◈", label: "Desempenho" },
  { href: "/ghosthunt/tempo-de-cla", route: "/tempo-de-cla", icon: "◷", label: "Tempo de Clã" },
  { href: "/ghosthunt/rules", route: "/rules", icon: "⚖", label: "Regras" },
];

function normalizePath(pathname: string) {
  if (pathname === "/ghosthunt" || pathname === "/ghosthunt/") return "/";
  if (pathname.startsWith("/ghosthunt/")) return pathname.slice("/ghosthunt".length) || "/";
  return pathname;
}

export default function BottomNavigation() {
  const pathname = usePathname();
  const router = useRouter();
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const navigationPending = useRef(false);
  const currentPath = useRef(pathname);

  useEffect(() => {
    currentPath.current = pathname;
    navigationPending.current = false;
    touchStart.current = null;
  }, [pathname]);

  useEffect(() => {

    const onTouchStart = (event: TouchEvent) => {
      if (currentPath.current.startsWith("/admin") || currentPath.current === "/login") {
        touchStart.current = null;
        return;
      }
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
      const path = currentPath.current;
      if (path.startsWith("/admin") || path === "/login") return;
      const touch = event.changedTouches[0];
      const deltaX = touch.clientX - start.x;
      const deltaY = touch.clientY - start.y;
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);
      if (absX < 48 || absX < absY * 1.2) return;

      const normalizedPath = normalizePath(path);
      const currentIndex = items.findIndex((item) =>
        item.route === "/" ? normalizedPath === "/" || normalizedPath === "/home"
          : normalizedPath === item.route || normalizedPath.startsWith(item.route + "/")
      );
      const index = currentIndex >= 0 ? currentIndex : normalizedPath.startsWith("/player/") ? 1 : 0;
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
  }, [router]);

  if (pathname.startsWith("/admin") || pathname === "/login") return null;

  const normalizedPath = normalizePath(pathname);
  return (
    <nav className="mobile-bottom-nav" aria-label="Navegação principal">
      <span className="mobile-nav-swipe-arrow" aria-hidden="true">‹</span>
      {items.map((item) => {
        const active = item.route === "/"
          ? normalizedPath === "/" || normalizedPath === "/home"
          : normalizedPath === item.route || normalizedPath.startsWith(item.route + "/");
        return (
          <Link className={active ? "mobile-nav-item active" : "mobile-nav-item"} href={item.href} key={item.label} aria-current={active ? "page" : undefined} prefetch={false} onMouseEnter={() => router.prefetch(item.href)} onFocus={() => router.prefetch(item.href)} onTouchStart={() => router.prefetch(item.href)}>
            <span className="mobile-nav-icon" aria-hidden="true">{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        );
      })}
      <Link href="https://ghosthunt.com.br/" className="mobile-nav-item" aria-label="Voltar à página de escolha dos clãs" prefetch={false}>
        <span className="mobile-nav-icon" aria-hidden="true">⇄</span>
        <span>Trocar clã</span>
      </Link>
      <span className="mobile-nav-swipe-arrow" aria-hidden="true">›</span>
    </nav>
  );
}
