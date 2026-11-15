"use client";

import { usePathname } from "next/navigation";
import BottomNavigation from "@/components/bottom-navigation";

export default function AppNavigation() {
  const pathname = usePathname();
  const isGhostHunt = pathname === "/ghosthunt" || pathname.startsWith("/ghosthunt/");

  if (!isGhostHunt) return null;

  return <BottomNavigation />;
}
