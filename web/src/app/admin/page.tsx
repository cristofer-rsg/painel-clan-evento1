import AdminNavigation from "@/components/admin-navigation";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { adminSessionCookie, isAdminSessionValid } from "@/lib/ghost-hunt/session";
import LogoutButton from "@/components/logout-button";
import { archivePreviousMonthIfNeeded } from "@/lib/ghost-hunt/history";
export const dynamic = "force-dynamic";
export default async function AdminPage() {
  const store = await cookies();
  if (!(await isAdminSessionValid(store.get(adminSessionCookie.name)?.value))) redirect("/login");
  await archivePreviousMonthIfNeeded().catch(() => false);
  return <main className="admin-shell"><header className="admin-header">
    <a className="brand" href="/"><span className="brand-mark">GH</span><span className="brand-copy"><strong>GHOST <i>HUNT</i></strong><small>CLAN MANAGEMENT</small></span></a><LogoutButton />
  </header><AdminNavigation current="/admin" /><section className="admin-content">
    <span className="auth-kicker">SESSÃO SEGURA • ADMINISTRADOR</span><h1>Central de <em>administração</em></h1>
    <p>Escolha uma ferramenta para administrar os registros atuais do Ghost Hunt.</p>
    <div className="admin-tools">
      <a href="/admin/analytics"><span>▥</span><b>Analytics do site</b><small>Visitantes, visualizações e páginas mais acessadas</small><i>→</i></a>
    </div>
    <section className="export-center" aria-labelledby="export-title">
      <div className="export-heading"><span className="auth-kicker">RELATÓRIOS E ARQUIVOS</span><h2 id="export-title">Central de <em>exportações</em></h2><p>Baixe uma cópia dos dados para conferência, arquivo ou análise externa.</p></div>
      <div className="export-options">
        <a className="export-option export-xlsx" href="/api/admin/export?format=xlsx">
          <span className="export-file-icon">XLS</span><span className="export-option-copy"><b>Planilha Excel completa</b><small>Duas abas: ranking do mês e histórico completo de lançamentos.</small><small className="export-meta">.XLSX · Melhor para análise e arquivo</small></span><strong aria-hidden="true">↓</strong>
        </a>
        <a className="export-option export-csv" href="/api/admin/export?format=csv">
          <span className="export-file-icon">CSV</span><span className="export-option-copy"><b>Ranking em CSV</b><small>Classificação mensal, jogadores, categorias, penalidades e total de pontos.</small><small className="export-meta">.CSV · Compatível com planilhas e sistemas</small></span><strong aria-hidden="true">↓</strong>
        </a>
      </div>
      <p className="export-footnote">Os arquivos são gerados no momento da solicitação e exigem sessão administrativa válida.</p>
    </section>
    <div className="admin-notice"><b>Recursos preservados</b><span>Cadastros e lançamentos são recebidos exclusivamente pelas sincronizações automáticas do clã. A edição manual está desativada.</span></div>
    <a className="back-link" href="/">← Abrir ranking público</a>
  </section></main>;
}
