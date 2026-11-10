import { getPerformanceData } from "@/lib/ghost-hunt/performance";
import PublicNavigation from "@/components/public-navigation";

export const dynamic = "force-dynamic";
type Props = { searchParams: Promise<{ month?: string; q?: string; category?: string; order?: string }> };
function fmt(value: number) { return new Intl.NumberFormat("pt-BR").format(value); }
const metrics = [
  { key: "wars", label: "Guerras", target: 20, unit: "ataques" },
  { key: "league", label: "Liga", target: 7, unit: "ataques" },
  { key: "raid", label: "Raide", target: 24, unit: "ataques" },
  { key: "donations", label: "Doações", target: 5000, unit: "tropas" },
  { key: "games", label: "Jogos", target: 10000, unit: "pontos" },
  { key: "capital", label: "Capital", target: 250000, unit: "moedas" },
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
    const score = metrics.reduce((sum, metric) => sum + Math.min(row[metric.key] / metric.target, 1), 0) / metrics.length * 100;
    const role = leadershipTags.get(row.tag.trim().toUpperCase());
    return { ...row, index: Number(score.toFixed(1)), role };
  }).sort((a, b) => b.index - a.index || a.player.localeCompare(b.player, "pt-BR"))
    .map((row, index) => ({ ...row, position: index + 1 }));
  const visibleRows = searchTerm
    ? rankedRows.filter(row => row.player.toLocaleLowerCase("pt-BR").includes(searchTerm) || row.tag.toLocaleLowerCase("pt-BR").includes(searchTerm))
    : rankedRows;
  const selectedMetric = metrics.find(metric => metric.key === params.category) || metrics[0];
  const sortOrder = params.order === "asc" ? "asc" : "desc";
  const categoryRows = [...visibleRows].sort((a, b) =>
    sortOrder === "asc"
      ? a[selectedMetric.key] - b[selectedMetric.key] || a.player.localeCompare(b.player, "pt-BR")
      : b[selectedMetric.key] - a[selectedMetric.key] || a.player.localeCompare(b.player, "pt-BR")
  );
  const totals = metrics.map(metric => ({
    ...metric,
    value: activeRows.reduce((sum, row) => sum + row[metric.key], 0),
  }));
  return <main className="admin-shell">
    <header className="admin-header"><a className="brand" href="/"><span className="brand-mark">GH</span><span className="brand-copy"><strong>GHOST <i>HUNT</i></strong><small>CLAN MANAGEMENT</small></span></a><a className="back-link" href="/">← Ranking</a></header>
    <PublicNavigation />
    <section className="admin-content performance-content">
      <span className="auth-kicker">CONSULTA PÚBLICA • INDICADORES DO CLÃ</span><h1>Desempenho <em>mensal</em></h1>
      <p>Índice de Atividade Ghost Hunt: seis metas fixas, com pontuação equilibrada de 0 a 100. Apenas integrantes ativos aparecem nesta consulta.</p>
      <form className="history-filter" action="/performance" method="get">
        <label htmlFor="month">Mês de referência</label><select id="month" name="month" defaultValue={data.monthKey}>{data.months.map(month => <option value={month} key={month}>{new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "America/Sao_Paulo" }).format(new Date(month + "-15T12:00:00-03:00"))}</option>)}</select>
        <label htmlFor="q">Buscar jogador</label><input id="q" name="q" type="search" placeholder="Nome ou tag" defaultValue={params.q || ""}/>
        <label htmlFor="category">Classificar por categoria</label><select id="category" name="category" defaultValue={selectedMetric.key}>{metrics.map(metric => <option value={metric.key} key={metric.key}>{metric.label}</option>)}</select>
        <label htmlFor="order">Ordenação</label><select id="order" name="order" defaultValue={sortOrder}><option value="desc">Maior para menor</option><option value="asc">Menor para maior</option></select>
        <button type="submit">Consultar</button>
      </form>
      {!data.connected && <div className="connection-alert"><b>Não foi possível carregar o desempenho.</b><span>Confira a conexão do servidor com o Supabase.</span>{data.error && <small>{data.error}</small>}</div>}
      <div className="performance-period">{data.monthLabel}</div>
      <div className="performance-section-heading"><h2>Desempenho do clã</h2><span>{activeRows.length} JOGADORES</span></div>
      <div className="performance-totals">{totals.map(metric => <article key={metric.key}><small>{metric.label}</small><b>{fmt(metric.value)}</b><span>{metric.unit}</span></article>)}</div>
      <div className="performance-list">
        <div className="performance-section-heading"><h2>Desempenho dos jogadores</h2><span>{visibleRows.length} JOGADORES</span></div>
        <p className="performance-result-count">{visibleRows.length} de {rankedRows.length} jogador(es)</p>
        {visibleRows.map(row => <article className="performance-card" key={row.player}>
          <div className="performance-card-head">
            <b><span>#{row.position}</span>{row.player}{row.role && <small className="performance-leader-role">{row.role}</small>}</b>
            <strong>{row.index.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</strong>
          </div>
          <div className="performance-progress" role="img" aria-label={`Meta geral: ${row.index.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`}><span style={{ width: `${Math.min(row.index, 100)}%` }} /></div>
          <div className="performance-card-grid">
            <span>Guerras <b>{fmt(row.wars)}</b></span><span>Liga <b>{fmt(row.league)}</b></span><span>Raide <b>{fmt(row.raid)}</b></span>
            <span>Doações <b>{fmt(row.donations)}</b></span><span>Jogos <b>{fmt(row.games)}</b></span><span>Capital <b>{fmt(row.capital)}</b></span>
          </div>
          <small className="performance-status active">ATIVO {row.tag}</small>
        </article>)}
        {!visibleRows.length && data.connected && <p>Nenhum jogador cadastrado neste mês.</p>}
      </div>
      <section className="performance-list">
        <div className="performance-section-heading"><h2>Ranking por categoria</h2><span>{selectedMetric.label.toUpperCase()}</span></div>
        <p className="performance-result-count">Jogadores ordenados por {selectedMetric.label.toLocaleLowerCase("pt-BR")} • {sortOrder === "desc" ? "maior para menor" : "menor para maior"}</p>
        {categoryRows.map((row, index) => <article className="performance-card" key={`category-${row.player}`}>
          <div className="performance-card-head">
            <b><span>#{index + 1}</span>{row.player}{row.role && <small className="performance-leader-role">{row.role}</small>}</b>
            <strong>{fmt(row[selectedMetric.key])}</strong>
          </div>
          <small className="performance-status active">ATIVO {row.tag}</small>
        </article>)}
        {!categoryRows.length && data.connected && <p>Nenhum jogador encontrado para esta consulta.</p>}
      </section>
      <a className="back-link" href="/">← Voltar ao ranking</a>
    </section>
  </main>;
}
