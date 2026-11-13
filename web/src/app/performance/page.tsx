import { getPerformanceData } from "@/lib/ghost-hunt/performance";
import PublicNavigation from "@/components/public-navigation";
import PerformanceFilters from "@/components/performance-filters";

export const dynamic = "force-dynamic";
type Props = { searchParams: Promise<{ month?: string; q?: string; order?: string; event?: string; situation?: string }> };
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
  const eventFilter = ["war", "league", "raid"].includes(params.event || "") ? params.event! : "";
  const hasEventFilter = eventFilter !== "";
  const situationFilter = hasEventFilter && ["attacked", "no-attack", "no-data"].includes(params.situation || "") ? params.situation! : "";
  const attackValue = (row: (typeof rankedRows)[number]) =>
    eventFilter === "league" ? row.lastLeagueAttacks : eventFilter === "raid" ? row.lastRaidAttacks : row.lastWarAttacks;
  const eventRows = rankedRows;
  const activityRows = hasEventFilter ? eventRows.filter(row => {
    const attacks = attackValue(row);
    if (situationFilter === "attacked") return attacks !== null && attacks > 0;
    if (situationFilter === "no-attack") return attacks === 0;
    if (situationFilter === "no-data") return attacks === null;
    return true;
  }) : eventRows;
  const eventCounts = {
    attacked: eventRows.filter(row => { const n = attackValue(row); return n !== null && n > 0; }).length,
    noAttack: eventRows.filter(row => attackValue(row) === 0).length,
    noData: eventRows.filter(row => attackValue(row) === null).length,
  };
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
      <PerformanceFilters
        months={data.months}
        monthKey={data.monthKey}
        monthLabel={data.monthLabel}
        query={params.q || ""}
        event={eventFilter}
        situation={situationFilter}
        order={sortOrder}
      />
      {!data.connected && <div className="connection-alert"><b>Não foi possível carregar o desempenho.</b><span>Confira a conexão do servidor com o Supabase.</span>{data.error && <small>{data.error}</small>}</div>}
      <div className="performance-period">{data.monthLabel}</div>
      <div className="performance-section-heading"><h2>Desempenho do clã</h2><span>{activeRows.length} JOGADORES</span></div>
      {!hasEventFilter && <div className="performance-totals">{totals.map(metric => <article key={metric.key}><small>{metric.label}</small><b>{fmt(metric.value)}</b><span>{metric.unit}</span></article>)}</div>}
      {hasEventFilter && <div className="performance-activity-summary" aria-label={`Resumo de ${eventFilter === "war" ? "última Guerra" : eventFilter === "league" ? "última batalha da Liga" : "última Raide"}`}>
        <article className="activity-summary-attacked"><small>Com ataques</small><b>{eventCounts.attacked}</b><span>Jogadores</span></article>
        <article className="activity-summary-no-attack"><small>Sem ataques</small><b>{eventCounts.noAttack}</b><span>Registro confirmado</span></article>
        <article className="activity-summary-no-data"><small>Sem dados</small><b>{eventCounts.noData}</b><span>Não classificado</span></article>
      </div>}
      <div className="performance-list">
        <div className="performance-section-heading"><h2>Desempenho dos jogadores</h2><span>{visibleRows.length} JOGADORES</span></div>
        <p className="performance-result-count">{visibleRows.length} de {activityRows.length} jogador(es){hasEventFilter ? ` • ${eventFilter === "war" ? "Última Guerra" : eventFilter === "league" ? "Última batalha da Liga" : "Última Raide"}` : " • Classificação geral"}</p>
        {visibleRows.map(row => {
          const attacks = eventFilter === "league" ? row.lastLeagueAttacks : eventFilter === "raid" ? row.lastRaidAttacks : row.lastWarAttacks;
          const eventLabel = eventFilter === "league" ? "Liga" : eventFilter === "raid" ? "Raide" : "Guerra";
          return <article className={hasEventFilter ? "performance-card performance-card-event" : "performance-card"} key={row.player}>
            <div className="performance-card-head">
              <b><span className="performance-position-badge">{row.position}</span><span className="performance-player-name">{row.player}</span>{row.role && <small className="performance-leader-role">{row.role}</small>}</b>
              {!hasEventFilter && <strong>{fmt(row.index)}%</strong>}
            </div>
            {!hasEventFilter && <>
              <div className="performance-progress" role="img" aria-label={`Desempenho geral: ${row.index}%`}><span style={{ width: `${Math.min(row.index, 100)}%` }} /></div>
              <div className="performance-player-stats">
                {metrics.map(metric => <div className="performance-player-stat-row" key={metric.key}>
                  <span className="performance-player-stat-label"><i aria-hidden="true">{metric.key === "wars" ? "⚔" : metric.key === "league" ? "🏆" : metric.key === "raid" ? "🛡" : metric.key === "donations" ? "👥" : metric.key === "games" ? "🎮" : "🏰"}</i>{metric.label}</span>
                  <strong className="performance-player-stat-tile"><b>{fmt(row[metric.key])}</b><small>{metric.key === "wars" || metric.key === "league" || metric.key === "raid" ? "Ataques" : metric.key === "donations" ? "Tropas" : metric.key === "capital" ? "Moedas" : "Pontos"}</small></strong>
                </div>)}
              </div>
              {row.penalties > 0 && <small className="performance-status penalty">Penalidades: −{fmt(row.penalties)} pontos</small>}
              <small className="performance-status active">ATIVO</small>
            </>}
            {hasEventFilter && <div className={attacks === null ? "performance-event-result no-data" : attacks === 0 ? "performance-event-result no-attack" : "performance-event-result attacked"}>
              <span>{eventLabel}</span><strong>{attacks === null ? "Sem dados" : `${fmt(attacks)} ${attacks === 1 ? "ataque" : "ataques"}`}</strong>
            </div>}
          </article>;
        })}
        {!visibleRows.length && data.connected && <p>Nenhum jogador corresponde aos filtros selecionados.</p>}
      </div>

      <a className="back-link" href="/">← Voltar ao ranking</a>
    </section>
  </main>;
}
