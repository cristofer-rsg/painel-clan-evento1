"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Não foi possível entrar.");
      router.replace("/admin");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao entrar.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-shell">
      <a className="brand auth-brand" href="/">
        <span className="brand-mark">GH</span>
        <span className="brand-copy"><strong>GHOST <i>HUNT</i></strong><small>CLAN MANAGEMENT</small></span>
      </a>
      <section className="auth-card">
        <span className="auth-kicker">ÁREA RESTRITA</span>
        <h1>Acesso do <em>administrador</em></h1>
        <p>Entre com a senha administrativa do Ghost Hunt.</p>
        <form onSubmit={submit}>
          <label htmlFor="admin-password">Senha</label>
          <input id="admin-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
          {error && <div className="auth-error" role="alert">{error}</div>}
          <button type="submit" disabled={loading || !password}>{loading ? "Verificando..." : "Entrar no painel"}</button>
        </form>
        <a className="back-link" href="/">← Voltar ao ranking público</a>
      </section>
    </main>
  );
}
