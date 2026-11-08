import { getDashboardData } from "@/lib/ghost-hunt/dashboard";
import RankingList from "@/components/ranking-list";

export const dynamic = "force-dynamic";

const navigation = [
  { icon: "⌂", label: "Início", href: "/" },
  { icon: "♛", label: "Ranking", href: "#ranking" },
  { icon: "◈", label: "Desempenho", href: "/performance" },
  { icon: "⚔", label: "Pontos", href: "#ranking" },
  { icon: "♟", label: "Clã", href: "#ranking" },
  { icon: "▤", label: "Histórico", href: "/history" },
];

function number(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value);
}

export default async function HomePage() {
  const data = await getDashboardData();
  const topThree = [data.ranking[1], data.ranking[0], data.ranking[2]];

  const metrics = [
    { icon: "♛", label: "PONTOS DO LÍDER", value: number(data.leaderPoints), note: "Ranking do mês" },
    { icon: "♟", label: "JOGADORES ATIVOS", value: number(data.activePlayers), note: "Membros cadastrados" },
    { icon: "⚔", label: "REGISTROS DE GUERRA", value: number(data.warRecords), note: "Lançamentos no mês" },
    { icon: "▤", label: "LANÇAMENTOS", value: number(data.eventCount), note: "Todos os eventos do mês" },
  ];

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Ghost Hunt início">
          <span className="brand-mark">GH</span>
          <span className="brand-copy"><strong>GHOST <i>HUNT</i></strong><small>CLAN MANAGEMENT</small></span>
        </a>
        <div className="topbar-right">
          <span className={data.connected ? "status" : "status status-offline"}>
            <span className="status-dot" /> {data.connected ? "SUPABASE CONECTADO" : "AGUARDANDO CONEXÃO"}
          </span>
          <a className="avatar" href="/login" aria-label="Acesso administrativo">GH</a>
        </div>
      </header>

      <div className="layout">
        <aside className="sidebar">
          <div className="side-label">MENU PRINCIPAL</div>
          {navigation.map((item, index) => (
            <a className={index === 0 ? "nav-item active" : "nav-item"} href={item.href} key={item.label}>
              <span className="nav-icon">{item.icon}</span><span>{item.label}</span>
              {index === 0 && <span className="active-bar" />}
            </a>
          ))}
          <div className="side-divider" />
          <div className="side-label">ADMINISTRAÇÃO</div>
          <a className="nav-item" href="#ranking"><span className="nav-icon">⚙</span><span>Gerenciar aplicativo</span></a>
          <div className="sidebar-foot"><span className="shield">◆</span><span><b>GHOST HUNT</b><small>Temporada do clã</small></span></div>
        </aside>

        <section className="content">
          <div className="eyebrow"><span /> CENTRAL DO CLÃ</div>
          <div className="welcome-row">
            <div><p className="overline">BEM-VINDO DE VOLTA</p><h1>Olá, <em>Caçador.</em></h1><p className="muted">Acompanhe a atividade e o desempenho do seu clã.</p></div>
            <div className="season-chip"><span>◷</span><div><small>TEMPORADA ATUAL</small><b>{data.monthLabel}</b></div></div>
          </div>

          {!data.connected && <div className="connection-alert">
            <b>Não foi possível carregar os dados reais.</b>
            <span>O painel continua protegido; confira as variáveis do Supabase no ambiente de hospedagem.</span>
            {data.error && <small>{data.error}</small>}
          </div>}

          <div className="metrics-grid">
            {metrics.map((metric) => <article className="metric-card" key={metric.label}>
              <div className="metric-top"><span className="metric-icon">{metric.icon}</span><span className="metric-kicker">{metric.label}</span></div>
              <strong className="metric-value">{metric.value}</strong><span className="metric-note">{metric.note}</span>
            </article>)}
          </div>

          <section className="recent-members-panel">
            <div className="recent-members-heading"><div><p className="overline">CHEGARAM RECENTEMENTE</p><h2>Novos membros do clã</h2></div><span>3 RECENTES</span></div>
            {data.recentMembers.length ? <div className="recent-members-list">{data.recentMembers.map(member => <article key={member.player_tag || member.player_name}>
              <span className="recent-member-shield">♜</span><div><b>{member.player_name}</b><small>{member.player_tag || "Tag não informada"}</small></div>
              <time>{new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(member.first_seen_at))}</time><strong>NOVO</strong>
            </article>)}</div> : <p className="recent-members-empty">Aguardando novos integrantes identificados pela sincronização.</p>}
          </section>

          <div className="section-heading"><div><p className="overline">DESTAQUES</p><h2>Hall da Fama</h2></div><span className="period-pill">{data.monthLabel.toUpperCase()}</span></div>
          <section className="podium-panel">
            <div className="panel-caption"><span className="gold-line" /> PÓDIO DO MÊS <span className="panel-caption-right">TOP 3 JOGADORES</span></div>
            <div className="podium">
              {topThree.map((player, index) => {
                const place = index === 0 ? "second" : index === 1 ? "first" : "third";
                const label = index === 0 ? "2º LUGAR" : index === 1 ? "1º LUGAR" : "3º LUGAR";
                return <div className={`podium-place ${place}`} key={label}>
                  {index === 1 ? <span className="crown">♛</span> : <span className="medal">{index === 0 ? "Ⅱ" : "Ⅲ"}</span>}
                  <div className={index === 1 ? "player-orb champion" : "player-orb"}>{player ? player.player.slice(0, 1).toUpperCase() : "—"}</div>
                  <b>{label}</b><strong>{player ? number(player.total) : "—"}</strong>
                  <small>{player ? player.player : "Sem classificação"}</small>
                  {index === 1 && <span className="champion-base" />}
                </div>;
              })}
            </div>
          </section>

          <div className="section-heading ranking-heading" id="ranking"><div><p className="overline">CLASSIFICAÇÃO</p><h2>Ranking do clã</h2></div><span className="period-pill">MÊS ATUAL</span></div>
          <section className="ranking-panel">
            <div className="ranking-head"><span>JOGADOR</span><span>PONTUAÇÃO</span></div>
            {data.ranking.length ? <RankingList players={data.ranking} /> : <div className="empty-state"><span className="empty-icon">♜</span><b>{data.connected ? "Ainda não há jogadores cadastrados" : "Conectando os dados do clã"}</b><p>{data.connected ? "Os jogadores aparecerão aqui assim que estiverem cadastrados." : "O ranking será exibido quando a conexão com o Supabase estiver configurada."}</p></div>}
          </section>
          <footer className="footer"><span>GHOST HUNT <b>•</b> CENTRAL DO CLÃ</span><span>Dados do Supabase • Atualizado ao abrir</span></footer>
        </section>
      </div>
    </main>
  );
}
