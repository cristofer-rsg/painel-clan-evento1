import AdminNavigation from "@/components/admin-navigation";
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
      <p>Acompanhe o alcance do site e entenda como os visitantes navegam pelo Ghost Hunt.</p>

      <div className="analytics-status">
        <span className="analytics-status-dot" aria-hidden="true" />
        <div><b>Coleta de visitas integrada ao site</b><small>O Vercel Web Analytics registra visualizações das páginas públicas após a ativação e a publicação.</small></div>
      </div>

      <div className="analytics-metrics">
        <article><span>◎</span><b>Visitantes únicos</b><small>Estimativa de visitantes no período selecionado.</small></article>
        <article><span>▤</span><b>Visualizações</b><small>Total de páginas públicas visualizadas.</small></article>
        <article><span>↗</span><b>Origem dos acessos</b><small>Referências e páginas que encaminharam visitantes.</small></article>
        <article><span>▦</span><b>Dispositivos e regiões</b><small>Distribuição agregada por dispositivo e localização aproximada.</small></article>
      </div>

      <section className="analytics-dashboard-link">
        <div><span className="auth-kicker">PAINEL DE DADOS</span><h2>Relatórios completos no Vercel</h2><p>Os números, gráficos, filtros de período, páginas mais acessadas e origens ficam no painel oficial do Vercel. Abra-o por este atalho, usando a conta que administra o projeto.</p></div>
        <a href={vercelAnalyticsUrl} target="_blank" rel="noopener noreferrer">Abrir painel de Analytics <span aria-hidden="true">↗</span></a>
      </section>

      <p className="analytics-privacy">Privacidade: as rotas administrativas e a tela de login são excluídas da coleta. Nenhum nome, tag de jogador ou conteúdo de conta é enviado como métrica de visita.</p>
      <a className="back-link" href="/admin">← Voltar à administração</a>
    </section>
  </main>;
}
