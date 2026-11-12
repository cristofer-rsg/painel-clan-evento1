import AdminNavigation from "@/components/admin-navigation";
import AnalyticsDashboard from "@/components/analytics-dashboard";
import LogoutButton from "@/components/logout-button";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { adminSessionCookie, isAdminSessionValid } from "@/lib/ghost-hunt/session";

export const dynamic = "force-dynamic";

const vercelAnalyticsUrl = "https://vercel.com/cristoferrsg-9877/ghost-hunt-preview/analytics";

export default async function AdminAnalyticsPage() {
  const cookieStore = await cookies();
  if (!(await isAdminSessionValid(cookieStore.get(adminSessionCookie.name)?.value))) redirect("/login");

  return <main className="admin-shell">
    <header className="admin-header">
      <a className="brand" href="/"><span className="brand-mark">GH</span><span className="brand-copy"><strong>GHOST <i>HUNT</i></strong><small>CLAN MANAGEMENT</small></span></a>
      <LogoutButton />
    </header>
    <AdminNavigation current="/admin/analytics" />
    <section className="admin-content analytics-content">
      <span className="auth-kicker">SESSÃO SEGURA • ESTATÍSTICAS DO SITE</span>
      <h1>Analytics <em>do Ghost Hunt</em></h1>
      <p>Acompanhe os acessos, descubra as páginas mais visitadas e veja de onde vêm os visitantes.</p>

      <div className="analytics-status">
        <span className="analytics-status-dot" aria-hidden="true" />
        <div><b>Analytics integrado ao Ghost Hunt</b><small>As visitas públicas são registradas de forma agregada. Áreas administrativas e login ficam fora da coleta.</small></div>
      </div>

      <AnalyticsDashboard />

      <section className="analytics-dashboard-link">
        <div><span className="auth-kicker">RELATÓRIOS AVANÇADOS</span><h2>Painel oficial da Vercel</h2><p>Consulte também os relatórios nativos da hospedagem, como complemento às estatísticas exibidas aqui.</p></div>
        <a href={vercelAnalyticsUrl} target="_blank" rel="noopener noreferrer">Abrir painel da Vercel <span aria-hidden="true">↗</span></a>
      </section>

      <p className="analytics-privacy">Privacidade: não armazenamos endereço IP, nome, tag de jogador ou conteúdo de contas. O identificador de visitante é aleatório e armazenado somente como hash; localização é aproximada e depende dos dados fornecidos pela hospedagem.</p>
      <a className="back-link" href="/admin">← Voltar à administração</a>
    </section>
  </main>;
}
