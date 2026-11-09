import { getDashboardData } from "@/lib/ghost-hunt/dashboard";
import RankingList from "@/components/ranking-list";
import RankingAutoRefresh from "@/components/ranking-auto-refresh";

export const dynamic = "force-dynamic";

function number(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value);
}

const shortcuts = [
  { icon: "⚔", label: "Guerras", detail: "Confrontos do clã", href: "/history" },
  { icon: "🛡", label: "Liga do Clã", detail: "Temporada competitiva", href: "/history" },
  { icon: "🏰", label: "Capital", detail: "Raides e melhorias", href: "/history" },
  { icon: "📋", label: "Jogos do Clã", detail: "Desafios coletivos", href: "/history" },
  { icon: "🤝", label: "Doações", detail: "Ajude seus aliados", href: "/performance" },
  { icon: "🏆", label: "Ranking", detail: "Ver classificação", href: "/ranking" },
];

export default async function HomePage() {
  const data = await getDashboardData();
  const topThree = data.ranking.slice(0, 3);
  const metrics = [
    { icon: "♛", label: "PONTOS DO LÍDER", value: number(data.leaderPoints), note: "No mês atual", tone: "gold" },
    { icon: "♟", label: "JOGADORES ATIVOS", value: number(data.activePlayers), note: "Membros do clã", tone: "neutral" },
    { icon: "⚔", label: "GUERRAS", value: number(data.warRecords), note: "Registros no mês", tone: "neutral" },
    { icon: "▤", label: "ATIVIDADES", value: number(data.eventCount), note: "Eventos registrados", tone: "neutral" },
  ];

  return (
    <main className="app-shell gh-home gh-home-v2">
      <RankingAutoRefresh />
      <header className="topbar gh-topbar">
        <a className="brand" href="/" aria-label="Ghost Hunt início">
          <span className="brand-mark">GH</span>
          <span className="brand-copy"><strong>GHOST <i>HUNT</i></strong><small>CLAN COMMUNITY</small></span>
        </a>
        <div className="topbar-right">
          <span className={data.connected ? "status" : "status status-offline"}>
            <span className="status-dot" /> {data.connected ? "CLÃ CONECTADO" : "AGUARDANDO CONEXÃO"}
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

        <section className="content gh-content gh-home-content">
          <section className="gh-v2-hero">
            <div className="gh-v2-hero-art" aria-hidden="true"><span className="gh-v2-sigil">GH</span><span className="gh-v2-orbit orbit-one" /><span className="gh-v2-orbit orbit-two" /></div>
            <div className="gh-v2-hero-copy">
              <div className="gh-v2-eyebrow"><span className="gh-v2-live-dot" /> BEM-VINDO, CAÇADOR <span>•</span> {data.monthLabel.toUpperCase()}</div>
              <h1>BEM-VINDO,<br /><em>CAÇADOR.</em></h1>
              <p>O desempenho do Ghost Hunt em um só lugar.</p>
              <a className="gh-v2-hero-link" href="/ranking">ACOMPANHAR RANKING <b>↗</b></a>
            </div>
            <div className="gh-v2-season-stamp"><small>TEMPORADA</small><strong>{data.monthLabel.split(" de ")[0].slice(0,3).toUpperCase()}</strong><span>2026</span></div>
          </section>

          {!data.connected && <div className="connection-alert">
            <b>Dados do clã temporariamente indisponíveis.</b>
            <span>O painel continua protegido; confira a conexão com o Supabase.</span>
            {data.error && <small>{data.error}</small>}
          </div>}

          <section className="gh-v2-stats" aria-label="Resumo do clã">
            {metrics.map((metric) => <article className={`gh-v2-stat ${metric.tone}`} key={metric.label}>
              <span className="gh-v2-stat-icon">{metric.icon}</span>
              <div><small>{metric.label}</small><strong>{metric.value}</strong><span>{metric.note}</span></div>
            </article>)}
          </section>

          <section className="gh-v2-section">
            <div className="gh-v2-section-head"><div><small>NAVEGUE PELO CLÃ</small><h2>Central de atividades</h2></div><span>ATALHOS</span></div>
            <nav className="gh-v2-activity-grid" aria-label="Atividades do clã">
              {shortcuts.map(item => <a href={item.href} className="gh-v2-activity" key={item.label}>
                <span className="gh-v2-activity-icon">{item.icon}</span><b>{item.label}</b><small>{item.detail}</small><i>↗</i>
              </a>)}
            </nav>
          </section>

          <section className="gh-v2-season-strip">
            <div className="gh-v2-season-emblem">♜</div>
            <div><small>TEMPORADA EM ANDAMENTO</small><strong>{data.monthLabel}</strong><span>Participe, some pontos e dispute o topo.</span></div>
            <a href="/rules">VER REGRAS <b>›</b></a>
          </section>

          <section className="gh-rewards-banner" aria-labelledby="gh-rewards-title">
            <div className="gh-rewards-glow" aria-hidden="true" />
            <div className="gh-rewards-heading">
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
                  <div className="gh-leader-buttons"><a className="gh-reward-button gh-clash-button" href="https://link.clashofclans.com/?action=OpenSCID&p=84-546b40e0-6315-4ad3-a43a-34a9cac4bdfb" target="_blank" rel="noopener noreferrer">Adicionar aos amigos <b>↗</b></a><a className="gh-reward-button gh-whatsapp-button" href="https://chat.whatsapp.com/L8S4ivyohzF8DQQCU0SFUI?s=cl&p=a&iam=2" target="_blank" rel="noopener noreferrer"><span>◉</span> WhatsApp <b>↗</b></a></div>
                </div>
              </div>
            </div>
            <p className="gh-rewards-footnote">Válido para os dois primeiros do ranking que cumprirem as regras.</p>
          </section>

          <section className="gh-v2-section gh-v2-ranking-section" id="ranking">
            <div className="gh-v2-section-head"><div><small>DISPUTA DO MÊS</small><h2>Ranking em destaque</h2></div><a href="/ranking">VER TUDO ↗</a></div>
            <div className="gh-v2-podium">
              {topThree.length ? [topThree[1], topThree[0], topThree[2]].filter(Boolean).map((player) => {
                const place = data.ranking.findIndex(item => item.player === player.player) + 1;
                return <a className={`gh-v2-podium-card rank-${place}`} href={player.tag ? `/player/${encodeURIComponent(player.tag)}` : "/ranking"} key={player.player}>
                  <span className="gh-v2-medal">{place === 1 ? "👑" : place === 2 ? "🥈" : "🥉"}</span>
                  <span className="gh-v2-player-avatar">{player.player.slice(0,1).toUpperCase()}</span>
                  <b>{player.player}</b><strong>{number(player.total)} <small>PTS</small></strong><span className="gh-v2-rank-label">{place}º LUGAR</span>
                </a>;
              }) : <p className="recent-members-empty">{data.connected ? "O pódio aparecerá quando houver jogadores classificados." : "Aguardando conexão para carregar o ranking."}</p>}
            </div>
            <div className="gh-v2-full-ranking-head" id="ranking-full"><div><small>CLASSIFICAÇÃO GERAL</small><h3>Todos os jogadores</h3></div><span>{data.monthLabel.toUpperCase()}</span></div>
            <section className="ranking-panel">
              <div className="ranking-head"><span>JOGADOR</span><span>PONTUAÇÃO</span></div>
              {data.ranking.length ? <RankingList players={data.ranking} /> : <div className="empty-state"><span className="empty-icon">♜</span><b>{data.connected ? "Ainda não há jogadores cadastrados" : "Conectando os dados do clã"}</b><p>{data.connected ? "Os jogadores aparecerão aqui assim que estiverem cadastrados." : "O ranking será exibido quando a conexão com o Supabase estiver configurada."}</p></div>}
            </section>
          </section>

          <section className="recent-members-panel gh-recent gh-v2-recent">
            <div className="recent-members-heading"><div><p className="overline">CHEGARAM RECENTEMENTE</p><h2>Novos membros</h2></div><span>3 RECENTES</span></div>
            {data.recentMembers.length ? <div className="recent-members-list">{data.recentMembers.map(member => <article key={member.player_tag || member.player_name}>
              <span className="recent-member-shield">♜</span><div><b>{member.player_name}</b><small>{member.player_tag || "Tag não informada"}</small></div>
              <time>{new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(member.first_seen_at))}</time><strong>NOVO</strong>
            </article>)}</div> : <p className="recent-members-empty">Os novos integrantes aparecerão aqui após a sincronização.</p>}
          </section>
          <footer className="footer"><span>GHOST HUNT <b>•</b> CENTRAL DO CLÃ</span><span>Dados do Supabase • Atualizado ao abrir</span></footer>
        </section>
      </div>
    </main>
  );
}
