import { getPerformanceData } from "@/lib/ghost-hunt/performance";

export const dynamic = "force-dynamic";
type Props = { searchParams: Promise<{ month?: string; active?: string; direction?: string; q?: string }> };
function fmt(value: number) { return new Intl.NumberFormat("pt-BR").format(value); }

export default async function PerformancePage({ searchParams }: Props) {
  const params = await searchParams;
  const data = await getPerformanceData(params.month);
  const showInactive = params.active === "0";
  const descending = params.direction !== "asc";
  const searchTerm = (params.q || "").trim().toLocaleLowerCase("pt-BR");
  const filteredRows = showInactive ? data.rows : data.rows.filter(row => row.active);
  const rankedRows = filteredRows.map(row => ({
    ...row,
    index: Number(([
      Math.min(row.wars / 20, 1),
      Math.min(row.league / 7, 1),
      Math.min(row.raid / 24, 1),
      Math.min(row.donations / 5000, 1),
      Math.min(row.games / 10000, 1),
      Math.min(row.capital / 250000, 1),
    ].reduce((sum, value) => sum + value, 0) / 6 * 100).toFixed(1)),
  })).sort((a, b) => (descending ? b.index - a.index : a.index - b.index)
    || a.player.localeCompare(b.player, "pt-BR"))
    .map((row, index) => ({ ...row, position: index + 1 }));
  const visibleRows = searchTerm ? rankedRows.filter(row => row.player.toLocaleLowerCase("pt-BR").includes(searchTerm) || row.tag.toLocaleLowerCase("pt-BR").includes(searchTerm)) : rankedRows;
  const metrics = [
    ["Guerras", data.totals.wars, "ataques"],
    ["Liga", data.totals.league, "ataques"],
    ["Raide", data.totals.raid, "ataques"],
    ["Doações", data.totals.donations, "tropas"],
    ["Jogos", data.totals.games, "pontos"],
    ["Capital", data.totals.capital, "moedas"],
  ] as const;
  return <main className="admin-shell">
    <header className="admin-header"><a className="brand" href="/"><span className="brand-mark">GH</span><span className="brand-copy"><strong>GHOST <i>HUNT</i></strong><small>CLAN MANAGEMENT</small></span></a><a className="back-link" href="/">← Ranking</a></header>
    <section className="admin-content performance-content">
      <span className="auth-kicker">INDICADORES DO CLÃ</span><h1>Desempenho <em>mensal</em></h1><p>Índice de atividade equilibrado, com seis metas fixas e pontuação máxima de 100%.</p>
      <form className="history-filter" action="/performance" method="get"><label htmlFor="month">Mês de referência</label><select id="month" name="month" defaultValue={data.monthKey}>{data.months.map(month => <option value={month} key={month}>{new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "America/Sao_Paulo" }).format(new Date(month + "-15T12:00:00-03:00"))}</option>)}</select><label htmlFor="active">Jogadores</label><select id="active" name="active" defaultValue={showInactive ? "0" : "1"}><option value="0">Incluir inativos</option><option value="1">Somente ativos</option></select><label htmlFor="direction">Ordenação</label><select id="direction" name="direction" defaultValue={descending ? "desc" : "asc"}><option value="desc">Mais ativos primeiro</option><option value="asc">Menos ativos primeiro</option></select><label htmlFor="q">Buscar jogador</label><input id="q" name="q" type="search" placeholder="Nome ou tag" defaultValue={params.q || ""}/><button type="submit">Consultar</button></form>
      {!data.connected && <div className="connection-alert"><b>Não foi possível carregar o desempenho.</b><span>Confira a conexão do servidor com o Supabase.</span>{data.error && <small>{data.error}</small>}</div>}
      <div className="performance-period">{data.monthLabel}</div>
      <div className="performance-totals">{metrics.map(([label, value, unit]) => <article key={label}><small>{label}</small><b>{fmt(value)}</b><span>{unit}</span></article>)}</div>
      <div className="performance-list"><p className="performance-result-count">{visibleRows.length} de {rankedRows.length} jogador(es)</p>{visibleRows.map(row => <article className="performance-card" key={row.player}>
        <div className="performance-card-head"><b><span>#{row.position}</span>{row.player}</b><strong>{row.index.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} <small>/ 100%</small></strong></div>
        <div className="performance-card-grid">
          <span>Guerras <b>{fmt(row.wars)}</b></span><span>Liga <b>{fmt(row.league)}</b></span><span>Raide <b>{fmt(row.raid)}</b></span>
          <span>Doações <b>{fmt(row.donations)}</b></span><span>Jogos <b>{fmt(row.games)}</b></span><span>Capital <b>{fmt(row.capital)}</b></span>
        </div>
        <small className={row.active ? "performance-status active" : "performance-status"}>{row.active ? "ATIVO" : "INATIVO"} {row.tag}</small>
      </article>)}
      {!visibleRows.length && data.connected && <p>Nenhum jogador cadastrado neste filtro.</p>}</div>
      <a className="back-link" href="/">← Voltar ao ranking</a>
    </section>
  </main>;
}
