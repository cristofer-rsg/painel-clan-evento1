import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { adminSessionCookie, isAdminSessionValid } from "@/lib/ghost-hunt/session";
import LogoutButton from "@/components/logout-button";
export const dynamic = "force-dynamic";
export default async function AdminPage() {
  const store = await cookies();
  if (!(await isAdminSessionValid(store.get(adminSessionCookie.name)?.value))) redirect("/login");
  return <main className="admin-shell"><header className="admin-header">
    <a className="brand" href="/"><span className="brand-mark">GH</span><span className="brand-copy"><strong>GHOST <i>HUNT</i></strong><small>CLAN MANAGEMENT</small></span></a><LogoutButton />
  </header><section className="admin-content">
    <span className="auth-kicker">SESSÃO SEGURA • ADMINISTRADOR</span><h1>Central de <em>administração</em></h1>
    <p>Escolha uma ferramenta para administrar os registros atuais do Ghost Hunt.</p>
    <div className="admin-tools">
      <a href="/admin/players"><span>♟</span><b>Gerenciar jogadores</b><small>Cadastro, elegibilidade e WhatsApp</small><i>→</i></a>
      <a href="/admin/events"><span>✎</span><b>Editar lançamentos</b><small>Corrigir ou excluir registros do mês</small><i>→</i></a>
      <a href="/api/admin/export?format=xlsx"><span>▦</span><b>Exportar Excel</b><small>Ranking mensal e histórico completo</small><i>↓</i></a>
      <a href="/api/admin/export?format=csv"><span>▤</span><b>Exportar CSV</b><small>Ranking mensal em planilha simples</small><i>↓</i></a>
    </div>
    <div className="admin-notice"><b>Recursos preservados</b><span>Lançamentos manuais continuam desativados. As sincronizações automáticas do clã seguem pelos workflows existentes.</span></div>
    <a className="back-link" href="/">← Abrir ranking público</a>
  </section></main>;
}
