const navigation = [
  { icon: "⌂", label: "Início", active: true },
  { icon: "♛", label: "Ranking" },
  { icon: "◈", label: "Desempenho" },
  { icon: "⚔", label: "Pontos" },
  { icon: "♟", label: "Clã" },
];

const metrics = [
  { icon: "♛", label: "PONTOS DO LÍDER", value: "—", note: "Aguardando Supabase" },
  { icon: "♟", label: "JOGADORES ATIVOS", value: "—", note: "Aguardando Supabase" },
  { icon: "⚔", label: "REGISTROS DE GUERRA", value: "—", note: "Mês atual" },
  { icon: "▤", label: "LANÇAMENTOS", value: "—", note: "Mês atual" },
];

export default function HomePage() {
  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Ghost Hunt início">
          <span className="brand-mark">GH</span>
          <span className="brand-copy"><strong>GHOST <i>HUNT</i></strong><small>CLAN MANAGEMENT</small></span>
        </a>
        <div className="topbar-right">
          <span className="status"><span className="status-dot" /> NOVA PLATAFORMA</span>
          <button className="avatar" aria-label="Área de acesso">GH</button>
        </div>
      </header>

      <div className="layout">
        <aside className="sidebar">
          <div className="side-label">MENU PRINCIPAL</div>
          {navigation.map((item) => (
            <a className={item.active ? "nav-item active" : "nav-item"} href="#" key={item.label}>
              <span className="nav-icon">{item.icon}</span><span>{item.label}</span>
              {item.active && <span className="active-bar" />}
            </a>
          ))}
          <div className="side-divider" />
          <div className="side-label">ADMINISTRAÇÃO</div>
          <a className="nav-item" href="#"><span className="nav-icon">⚙</span><span>Gerenciar aplicativo</span></a>
          <div className="sidebar-foot"><span className="shield">◆</span><span><b>GHOST HUNT</b><small>Temporada do clã</small></span></div>
        </aside>

        <section className="content">
          <div className="eyebrow"><span /> CENTRAL DO CLÃ</div>
          <div className="welcome-row">
            <div><p className="overline">BEM-VINDO DE VOLTA</p><h1>Olá, <em>Caçador.</em></h1><p className="muted">Acompanhe a atividade e o desempenho do seu clã.</p></div>
            <div className="season-chip"><span>◷</span><div><small>TEMPORADA ATUAL</small><b>Novembro / 2026</b></div></div>
          </div>

          <div className="metrics-grid">
            {metrics.map((metric) => <article className="metric-card" key={metric.label}>
              <div className="metric-top"><span className="metric-icon">{metric.icon}</span><span className="metric-kicker">{metric.label}</span></div>
              <strong className="metric-value">{metric.value}</strong><span className="metric-note">{metric.note}</span>
            </article>)}
          </div>

          <div className="section-heading"><div><p className="overline">DESTAQUES</p><h2>Hall da Fama</h2></div><span className="period-pill">MÊS ATUAL</span></div>
          <section className="podium-panel">
            <div className="panel-caption"><span className="gold-line" /> PÓDIO DO MÊS <span className="panel-caption-right">TOP 3 JOGADORES</span></div>
            <div className="podium">
              <div className="podium-place second"><span className="medal">Ⅱ</span><div className="player-orb">?</div><b>2º LUGAR</b><strong>—</strong><small>Aguardando dados</small></div>
              <div className="podium-place first"><span className="crown">♛</span><div className="player-orb champion">?</div><b>1º LUGAR</b><strong>—</strong><small>Aguardando dados</small><span className="champion-base" /></div>
              <div className="podium-place third"><span className="medal">Ⅲ</span><div className="player-orb">?</div><b>3º LUGAR</b><strong>—</strong><small>Aguardando dados</small></div>
            </div>
          </section>

          <div className="section-heading ranking-heading"><div><p className="overline">CLASSIFICAÇÃO</p><h2>Ranking do clã</h2></div><button className="outline-button">Ver ranking completo <span>→</span></button></div>
          <section className="ranking-panel">
            <div className="ranking-head"><span>JOGADOR</span><span>PONTUAÇÃO</span></div>
            <div className="empty-state"><span className="empty-icon">♜</span><b>Conectando os dados do clã</b><p>O ranking real aparecerá aqui após a integração segura com o Supabase.</p></div>
          </section>
          <footer className="footer"><span>GHOST HUNT <b>•</b> CENTRAL DO CLÃ</span><span>Nova experiência em construção</span></footer>
        </section>
      </div>
    </main>
  );
}
