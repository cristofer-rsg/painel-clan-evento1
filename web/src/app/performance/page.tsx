import { getPerformanceData } from "@/lib/ghost-hunt/performance";
import PublicNavigation from "@/components/public-navigation";

export const dynamic = "force-dynamic";
type Props = { searchParams: Promise<{ month?: string; q?: string; order?: string; activity?: string }> };
function fmt(value: number) { return new Intl.NumberFormat("pt-BR").format(value); }
const metrics = [
  { key: "wars", label: "Guerras", max: 200, unit: "Ataques", pointsKey: "warsPoints", percentKey: "warsPercent" },
  { key: "league", label: "Liga", max: 200, unit: "Ataques", pointsKey: "leaguePoints", percentKey: "leaguePercent" },
  { key: "raid", label: "Raide", max: 150, unit: "Ataques", pointsKey: "raidPoints", percentKey: "raidPercent" },
  { key: "donations", label: "Doações", max: 150, unit: "Tropas Doadas", pointsKey: "donationsPoints", percentKey: "donationsPercent" },
  { key: "games", label: "Jogos do Clã", max: 100, unit: "Pontos Obtidos", pointsKey: "gamesPoints", percentKey: "gamesPercent" },
  { key: "capital", label: "Capital", max: 200, unit: "Moedas Doadas", pointsKey: "capitalPoints", percentKey: "capitalPercent" },
] as const;

export default async function PerformancePage({ searchParams }: Props) {
  const params = await searchParams;
  const data = await getPerformanceData(params.month, true);
  const activeRows = data.rows.filter(row => row.active);
  const searchTerm = (params.q || "").trim().toLocaleLowerCase("pt-BR");
  const leadershipTags = new Map([
    ["#L8GV8C2Y", "LÍDER"],
    ["#P8CCGYU0", "CO-LÍDER"],
    ["#QU0GC0VLU", "CO-LÍDER"],
    ["#9CLLGV8CC", "CO-LÍDER"],
  ]);
  const rankedRows = activeRows.map(row => {
    const role = leadershipTags.get(row.tag.trim().toUpperCase());
    return { ...row, role };
  }).sort((a, b) =>
    b.totalPoints - a.totalPoints
    || b.warsPoints - a.warsPoints
    || b.leaguePoints - a.leaguePoints
    || b.raidPoints - a.raidPoints
    || b.capitalPoints - a.capitalPoints
    || b.donationsPoints - a.donationsPoints
    || b.gamesPoints - a.gamesPoints
    || a.player.localeCompare(b.player, "pt-BR")
  ).map((row, index) => ({ ...row, position: index + 1 }));
  const activityFilter = params.activity || "all";
  const activityRows = rankedRows.filter(row => {
    if (activityFilter === "war-participated") return row.lastWarAttacks > 0;
    if (activityFilter === "war-two-attacks") return row.lastWarAttacks >= 2;
    if (activityFilter === "league-attacked") return row.lastLeagueAttacks > 0;
    if (activityFilter === "raid-attacked") return row.lastRaidAttacks > 0;
    return true;
  });
  const visibleRows = searchTerm
    ? activityRows.filter(row => row.player.toLocaleLowerCase("pt-BR").includes(searchTerm) || row.tag.toLocaleLowerCase("pt-BR").includes(searchTerm))
    : activityRows;
  const sortOrder = params.order === "asc" ? "asc" : "desc";
  const totals = metrics.map(metric => ({
    ...metric,
    value: activeRows.reduce((sum, row) => sum + row[metric.key], 0),
  }));
  return <main className="admin-shell">
    <header className="admin-header"><a className="brand" href="/"><span className="brand-mark">GH</span><span className="brand-copy"><strong>GHOST <i>HUNT</i></strong><small>CLAN MANAGEMENT</small></span></a><a className="back-link" href="/">← Ranking</a></header>
    <PublicNavigation />
    <section className="admin-content performance-content">
      <span className="auth-kicker">CONSULTA PÚBLICA • INDICADORES DO CLÃ</span><h1>Desempenho <em>mensal</em></h1>
      <p>Consulte os indicadores de participação e o aproveitamento calculado pela mesma pontuação e pelos mesmos critérios de desempate do ranking. Jogadores inelegíveis também aparecem nesta avaliação.</p>
      <form className="history-filter" action="/performance" method="get">
        <label htmlFor="month">Mês de referência</label><select id="month" name="month" defaultValue={data.monthKey}>{data.months.map(month => <option value={month} key={month}>{new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "America/Sao_Paulo" }).format(new Date(month + "-15T12:00:00-03:00"))}</option>)}</select>
        <label htmlFor="q">Buscar jogador</label><input id="q" name="q" type="search" placeholder="Nome ou tag" defaultValue={params.q || ""}/>
        <label htmlFor="activity">Filtrar atividade recente</label><select id="activity" name="activity" defaultValue={activityFilter}>
          <option value="all">Todas as atividades</option>
          <option value="war-participated">Participou da última Guerra</option>
          <option value="war-two-attacks">Fez os 2 ataques da última Guerra</option>
          <option value="league-attacked">Atacou na última batalha da Liga</option>
          <option value="raid-attacked">Realizou ataques na última Raide</option>
        </select>
        <label htmlFor="order">Ordenação</label><select id="order" name="order" defaultValue={sortOrder}><option value="desc">Maior para menor</option><option value="asc">Menor para maior</option></select>
        <button type="submit">Consultar</button>
      </form>
      {!data.connected && <div className="connection-alert"><b>Não foi possível carregar o desempenho.</b><span>Confira a conexão do servidor com o Supabase.</span>{data.error && <small>{data.error}</small>}</div>}
      <div className="performance-period">{data.monthLabel}</div>
      <div className="performance-section-heading"><h2>Desempenho do clã</h2><span>{activeRows.length} JOGADORES</span></div>
      <div className="performance-totals">{totals.map(metric => <article key={metric.key}><small>{metric.label}</small><b>{fmt(metric.value)}</b><span>{metric.unit}</span></article>)}</div>
      <div className="performance-list">
        <div className="performance-section-heading"><h2>Desempenho dos jogadores</h2><span>{visibleRows.length} JOGADORES</span></div>
        <p className="performance-result-count">{visibleRows.length} de {activityRows.length} jogador(es)</p>
        {visibleRows.map(row => <article className="performance-card" key={row.player}>
          <div className="performance-card-head">
            <b><span className="performance-position-badge">{row.position}</span><span className="performance-player-name">{row.player}</span>{row.role && <small className="performance-leader-role">{row.role}</small>}</b>
            <strong>{fmt(row.index)}%</strong>
          </div>
          <div className="performance-progress" role="img" aria-label={`Desempenho geral: ${row.index}%`}><span style={{ width: `${Math.min(row.index, 100)}%` }} /></div>
          <div className="performance-player-stats">
            {metrics.map(metric => <div className="performance-player-stat-row" key={metric.key}>
              <span className="performance-player-stat-label"><i aria-hidden="true">{metric.key === "wars" ? "⚔" : metric.key === "league" ? "🏆" : metric.key === "raid" ? "🛡" : metric.key === "donations" ? "👥" : metric.key === "games" ? "🎮" : "🏰"}</i>{metric.label}</span>
              <strong className="performance-player-stat-tile"><b>{fmt(row[metric.key])}</b><small>{metric.key === "wars" || metric.key === "league" || metric.key === "raid" ? "Ataques" : metric.key === "donations" ? "Tropas" : metric.key === "capital" ? "Moedas" : "Pontos"}</small></strong>
            </div>)}
          </div>
          {row.penalties > 0 && <small className="performance-status penalty">Penalidades: −{fmt(row.penalties)} pontos</small>}
          <small className="performance-status active">ATIVO</small>
        </article>)}
        {!visibleRows.length && data.connected && <p>Nenhum jogador cadastrado neste mês.</p>}
      </div>

      <a className="back-link" href="/">← Voltar ao ranking</a>
    </section>
  </main>;
}
