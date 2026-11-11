import { getDashboardData } from "@/lib/ghost-hunt/dashboard";
import RankingList from "@/components/ranking-list";
import PublicNavigation from "@/components/public-navigation";

export const dynamic = "force-dynamic";

export default async function RankingPage() {
  const data = await getDashboardData();
  return <main className="admin-shell">
    <header className="admin-header">
      <a className="brand" href="/"><span className="brand-mark">GH</span><span className="brand-copy"><strong>GHOST <i>HUNT</i></strong><small>CLAN COMMUNITY</small></span></a>
      <a className="back-link" href="/">← Início</a>
    </header>
    <PublicNavigation />
    <section className="admin-content history-content">
      <span className="auth-kicker">CLASSIFICAÇÃO OFICIAL • TEMPORADA ATUAL</span>
      <h1>Ranking <em>do clã</em></h1>
      <p>Acompanhe a pontuação dos jogadores, consulte os detalhes por categoria e veja quem está liderando o mês.</p>
      {!data.connected && <div className="connection-alert"><b>Não foi possível carregar o ranking.</b><span>Confira a conexão do servidor com o Supabase.</span>{data.error && <small>{data.error}</small>}</div>}
      <div className="history-section-title"><h2>Classificação de {data.monthLabel}</h2><span>{data.ranking.length} JOGADORES</span></div>
      <div className="ranking-panel">
        <div className="ranking-head"><span>JOGADOR</span><span>PONTUAÇÃO</span></div>
        {data.ranking.length ? <RankingList players={data.ranking} /> : <div className="empty-state"><span className="empty-icon">♜</span><b>{data.connected ? "Ainda não há jogadores cadastrados" : "Conectando os dados do clã"}</b><p>O ranking será exibido assim que os dados estiverem disponíveis.</p></div>}
      </div>
      <a className="back-link" href="/">← Voltar ao início</a>
    </section>
  </main>;
}
