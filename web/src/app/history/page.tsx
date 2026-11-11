import { getHistoryData } from "@/lib/ghost-hunt/history";
import PublicNavigation from "@/components/public-navigation";

export const dynamic = "force-dynamic";
type Props = { searchParams: Promise<{ month?: string; category?: string }> };
function fmt(value: number) { return new Intl.NumberFormat("pt-BR").format(value); }
function date(value: string) { return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(value)); }
function monthLabel(value: string) {
  const [year, month] = value.split("-");
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "America/Sao_Paulo" }).format(new Date(year + "-" + month + "-15T12:00:00-03:00"));
}
export default async function HistoryPage({ searchParams }: Props) {
  const params = await searchParams;
  const data = await getHistoryData(params.month);
  const categories = Array.from(new Set(data.events.map(event => event.category).filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt-BR"));
  const selectedCategory = params.category || "todas";
  const filteredEvents = selectedCategory === "todas" ? data.events : data.events.filter(event => event.category === selectedCategory);
  return <main className="admin-shell">
    <header className="admin-header"><a className="brand" href="/"><span className="brand-mark">GH</span><span className="brand-copy"><strong>GHOST <i>HUNT</i></strong><small>CLAN MANAGEMENT</small></span></a><a className="back-link" href="/">← Ranking</a></header>
    <PublicNavigation />
    <section className="admin-content history-content">
      <span className="auth-kicker">TEMPORADAS DO CLÃ</span><h1>Histórico <em>mensal</em></h1><p>Consulte a classificação final e os lançamentos preservados no Supabase.</p>
      <form className="history-filter" action="/history" method="get"><label htmlFor="month">Mês de referência</label><select id="month" name="month" defaultValue={data.month}>{data.months.map(month => <option value={month} key={month}>{monthLabel(month)}</option>)}</select><label htmlFor="category">Filtrar lançamentos por categoria</label><select id="category" name="category" defaultValue={selectedCategory}><option value="todas">Todas as categorias</option>{categories.map(category => <option value={category} key={category}>{category}</option>)}</select><button type="submit">Consultar</button></form>
      {data.error && <div className="connection-alert"><b>Não foi possível carregar o histórico.</b><span>{data.error}</span></div>}
      <div className="history-section-title"><h2>Ranking de {monthLabel(data.month)}</h2><span>{data.snapshot ? "CLASSIFICAÇÃO ARQUIVADA" : "CÁLCULO ATUAL"}</span></div>
      <div className="history-ranking">{data.ranking.map(row => <article key={row.player}>
        <b className="history-position">{row.position}</b><div className="history-player"><strong>{row.player}</strong><small>{row.eligible} • WhatsApp: {row.whatsapp}</small><small>Guerras {fmt(row.wars)} · Liga {fmt(row.league)} · Doações {fmt(row.donations)} · Jogos {fmt(row.games)} · Raide {fmt(row.raid)}</small></div><strong className="history-total">{fmt(row.total)} pts</strong>
      </article>)}{!data.ranking.length && <p>Não há classificação registrada para este mês.</p>}</div>
      <div className="history-section-title"><h2>Lançamentos</h2><span>{filteredEvents.length} REGISTROS</span></div>
      <div className="history-events">{filteredEvents.map(event => <article key={event.id}><div><b>{event.player}</b><small>{date(event.created_at)} · {event.category}</small><p>{event.activity}</p></div><strong>{fmt(event.points)} pts</strong></article>)}{!filteredEvents.length && <p>{data.events.length ? "Nenhum lançamento encontrado nesta categoria." : "Nenhum lançamento neste mês."}</p>}</div>
      <a className="back-link" href="/">← Voltar ao ranking</a>
    </section>
  </main>;
}
