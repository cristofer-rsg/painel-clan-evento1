import { getDashboardData } from "@/lib/ghost-hunt/dashboard";
import RankingList from "@/components/ranking-list";
import RankingAutoRefresh from "@/components/ranking-auto-refresh";

export const dynamic = "force-dynamic";

function number(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value);
}

const shortcuts = [
  { icon: "⚔", label: "Guerras", href: "/history" },
  { icon: "🛡", label: "Liga do Clã", href: "/history" },
  { icon: "🏰", label: "Capital do Clã", href: "/history" },
  { icon: "📋", label: "Jogos do Clã", href: "/history" },
  { icon: "🤝", label: "Doações", href: "/performance" },
  { icon: "🏆", label: "Ranking", href: "/ranking" },
];

export default async function HomePage() {
  const data = await getDashboardData();
  const topThree = data.ranking.slice(0, 3);
  const metrics = [
    { icon: "♛", label: "PONTOS DO LÍDER", value: number(data.leaderPoints), note: "Ranking do mês", tone: "gold" },
    { icon: "♟", label: "JOGADORES ATIVOS", value: number(data.activePlayers), note: "Membros do clã", tone: "cyan" },
    { icon: "⚔", label: "REGISTROS DE GUERRA", value: number(data.warRecords), note: "Lançamentos no mês", tone: "cyan" },
    { icon: "▤", label: "LANÇAMENTOS", value: number(data.eventCount), note: "Eventos do mês", tone: "copper" },
  ];

  return (
    <main className="app-shell gh-home">
      <RankingAutoRefresh />
      <header className="topbar gh-topbar">
        <a className="brand" href="/" aria-label="Ghost Hunt início">
          <span className="brand-mark">GH</span>
          <span className="brand-copy"><strong>GHOST <i>HUNT</i></strong><small>CLAN COMMUNITY</small></span>
        </a>
        <div className="topbar-right">
          <span className={data.connected ? "status" : "status status-offline"}>
            <span className="status-dot" /> {data.connected ? "SUPABASE CONECTADO" : "AGUARDANDO CONEXÃO"}
          </span>
          <a className="avatar" href="/login" aria-label="Acesso administrativo">GH</a>
        </div>
      </header>

      <div className="layout gh-layout">
        <aside className="sidebar">
          <div className="side-label">MENU PRINCIPAL</div>
          <a className="nav-item active" href="/"><span className="nav-icon">⌂</span><span>Início</span><span className="active-bar" /></a>
          <a className="nav-item" href="/ranking"><span className="nav-icon">♛</span><span>Ranking</span></a>
          <a className="nav-item" href="/performance"><span className="nav-icon">◈</span><span>Desempenho</span></a>
          <a className="nav-item" href="/history"><span className="nav-icon">▤</span><span>Histórico</span></a>
          <div className="side-divider" />
          <div className="side-label">ADMINISTRAÇÃO</div>
          <a className="nav-item" href="/admin"><span className="nav-icon">⚙</span><span>Gerenciar aplicativo</span></a>
          <div className="sidebar-foot"><span className="shield">◆</span><span><b>GHOST HUNT</b><small>Temporada do clã</small></span></div>
        </aside>

        <section className="content gh-content">
          <div className="gh-hero">
            <div className="gh-hero-art" aria-hidden="true">
              <div className="gh-moon" />
              <div className="gh-castle"><i /><i /><i /><b>GH</b></div>
              <div className="gh-hero-figure gh-figure-left">⚔</div>
              <div className="gh-hero-figure gh-figure-right">♛</div>
              <div className="gh-banner-flag gh-flag-left">GH</div>
              <div className="gh-banner-flag gh-flag-right">GH</div>
            </div>
            <div className="gh-hero-copy">
              <p className="overline">CENTRAL DO CLÃ · BEM-VINDO DE VOLTA</p>
              <h1>Olá, <em>Jogador!</em></h1>
              <p className="muted">Acompanhe a atividade e o desempenho do seu clã.</p>
              <div className="season-chip"><span>▣</span><div><small>TEMPORADA ATUAL</small><b>{data.monthLabel}</b></div></div>
            </div>
          </div>

          {!data.connected && <div className="connection-alert">
            <b>Não foi possível carregar os dados reais.</b>
            <span>O painel continua protegido; confira as variáveis do Supabase no ambiente de hospedagem.</span>
            {data.error && <small>{data.error}</small>}
          </div>}

          <div className="metrics-grid gh-metrics">
            {metrics.map((metric) => <article className={`metric-card gh-metric ${metric.tone}`} key={metric.label}>
              <div className="metric-top"><span className="metric-icon">{metric.icon}</span><span className="metric-kicker">{metric.label}</span></div>
              <strong className="metric-value">{metric.value}</strong><span className="metric-note">{metric.note}</span>
            </article>)}
          </div>

          <nav className="gh-shortcuts" aria-label="Atalhos das atividades do clã">
            {shortcuts.map(item => <a href={item.href} className="gh-shortcut" key={item.label}>
              <span>{item.icon}</span><b>{item.label}</b>
            </a>)}
          </nav>

          <section className="gh-season-banner">
            <div><p>TEMPORADA DE</p><h2>{data.monthLabel.split(" de ")[0].toUpperCase()}</h2>
              <span>Participe dos eventos, acumule pontos e fortaleça o clã!</span></div>
            <div className="gh-season-art" aria-hidden="true"><span>🏰</span><b>GH</b></div>
          </section>

          <section className="recent-members-panel gh-recent">
            <div className="recent-members-heading"><div><p className="overline">CHEGARAM RECENTEMENTE</p><h2>Novos membros do clã</h2></div><span>3 RECENTES</span></div>
            {data.recentMembers.length ? <div className="recent-members-list">{data.recentMembers.map(member => <article key={member.player_tag || member.player_name}>
              <span className="recent-member-shield">♜</span><div><b>{member.player_name}</b><small>{member.player_tag || "Tag não informada"}</small></div>
              <time>{new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(member.first_seen_at))}</time><strong>NOVO</strong>
            </article>)}</div> : <p className="recent-members-empty">Aguardando novos integrantes identificados pela sincronização.</p>}
          </section>

          <div className="section-heading ranking-heading" id="ranking"><div><p className="overline">CLASSIFICAÇÃO</p><h2>Ranking do mês</h2></div><a className="gh-view-all" href="/performance">Ver desempenho completo ›</a></div>
          <section className="gh-podium-section" aria-label="Pódio dos três primeiros colocados">
            <div className="gh-podium-heading"><span>🏆</span><div><p className="overline">DESTAQUES DO MÊS</p><h2>Pódio do mês</h2></div><span>🏆</span></div>
            {topThree.length ? <div className="gh-podium">
              {[topThree[1], topThree[0], topThree[2]].filter(Boolean).map((player) => {
                const place = data.ranking.findIndex(item => item.player === player.player) + 1;
                return <a className={`gh-podium-card podium-${place}`} href={player.tag ? `/player/${encodeURIComponent(player.tag)}` : "#ranking"} key={player.player}>
                  <span className="gh-podium-medal">{place === 1 ? "👑" : place === 2 ? "🥈" : "🥉"}</span>
                  <span className="gh-podium-avatar">{player.player.slice(0,1).toUpperCase()}</span>
                  <b className="gh-podium-name">{player.player}</b>
                  <strong>{number(player.total)} pts</strong>
                  <span className="gh-podium-base"><b>{place}º</b></span>
                </a>;
              })}
            </div> : <p className="recent-members-empty">O pódio aparecerá quando houver jogadores classificados.</p>}
          </section>

          <section className="gh-rewards-banner" aria-labelledby="gh-rewards-title">
            <div className="gh-rewards-glow" aria-hidden="true" />
            <div className="gh-rewards-heading">
              <span className="gh-rewards-crown" aria-hidden="true">♛</span>
              <p className="overline">PREMIAÇÃO MENSAL</p>
              <h2 id="gh-rewards-title">2 PASSES PARA OS TOP 2</h2>
              <p>1º e 2º lugar ganham 1 passe cada.</p>
            </div>
            <div className="gh-rewards-prizes">
              <div className="gh-reward-prize first"><span>🥇</span><b>1º LUGAR</b><strong>1 PASSE</strong></div>
              <div className="gh-reward-prize second"><span>🥈</span><b>2º LUGAR</b><strong>1 PASSE</strong></div>
            </div>
            <div className="gh-rewards-rules">
              <h3>COMO PARTICIPAR</h3>
              <p><span>01</span> Ficar no top 2 do ranking mensal.</p>
              <p><span>02</span> Estar no grupo oficial do WhatsApp.</p>
              <p><span>03</span> Adicionar o líder como amigo no Clash of Clans.</p>
            </div>
            <div className="gh-rewards-actions">
              <div className="gh-leader-profile">
                <div className="gh-leader-qr"><img src="/leader-friend-qr.png" alt="QR Code para adicionar o líder do clã como amigo" /></div>
                <div className="gh-leader-copy">
                  <small>ADICIONE O LÍDER AOS AMIGOS</small>
                  <strong>ˡⁱᵈᵉʳ░L░I░L░I░A░S</strong>
                  <span>Leia o QR ou toque no botão.</span>
                  <a className="gh-reward-button gh-clash-button" href="https://link.clashofclans.com/?action=OpenSCID&p=84-546b40e0-6315-4ad3-a43a-34a9cac4bdfb" target="_blank" rel="noopener noreferrer">Adicionar no Clash of Clans <b>↗</b></a>
                </div>
              </div>
              <a className="gh-reward-button gh-whatsapp-button" href="https://chat.whatsapp.com/L8S4ivyohzF8DQQCU0SFUI?s=cl&p=a&iam=2" target="_blank" rel="noopener noreferrer"><span>◉</span> Entrar no grupo do WhatsApp <b>↗</b></a>
            </div>
            <p className="gh-rewards-footnote">Válido para os dois primeiros do ranking que cumprirem as regras.</p>
          </section>

          <div className="section-heading" id="ranking-full"><div><p className="overline">TODOS OS JOGADORES</p><h2>Classificação completa</h2></div><span className="period-pill">{data.monthLabel.toUpperCase()}</span></div>
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
