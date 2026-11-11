"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Mantém o ranking público sincronizado com o intervalo de 60s do Streamlit original. */
export default function RankingAutoRefresh() {
  const router = useRouter();
  useEffect(() => {
    const interval = window.setInterval(() => router.refresh(), 60_000);
    return () => window.clearInterval(interval);
  }, [router]);
  return null;
}
