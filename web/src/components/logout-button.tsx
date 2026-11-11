"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  async function logout() {
    setLoading(true);
    await fetch("/api/auth/session", { method: "DELETE" });
    router.replace("/");
    router.refresh();
  }
  return <button className="logout-button" type="button" onClick={logout} disabled={loading}>{loading ? "Saindo..." : "Sair"}</button>;
}
