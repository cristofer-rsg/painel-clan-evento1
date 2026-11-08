import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { adminSessionCookie, isAdminSessionValid } from "@/lib/ghost-hunt/session";
import LogoutButton from "@/components/logout-button";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(adminSessionCookie.name)?.value;
  if (!(await isAdminSessionValid(token))) redirect("/login");

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <a className="brand" href="/">
          <span className="brand-mark">GH</span>
          <span className="brand-copy"><strong>GHOST <i>HUNT</i></strong><small>CLAN MANAGEMENT</small></span>
        </a>
        <LogoutButton />
      </header>
      <section className="admin-content">
        <span className="auth-kicker">SESSÃO SEGURA • ADMINISTRADOR</span>
        <h1>Central de <em>administração</em></h1>
        <p>O acesso administrativo está protegido por sessão assinada e cookie HttpOnly.</p>
        <div className="admin-notice">
          <b>Próxima etapa de implementação</b>
          <span>As ferramentas de edição de lançamentos, gestão de jogadores, histórico e exportação serão conectadas aqui, mantendo as mesmas regras do aplicativo atual.</span>
        </div>
        <a className="back-link" href="/">← Abrir ranking público</a>
      </section>
    </main>
  );
}
