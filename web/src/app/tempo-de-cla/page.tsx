import type { Metadata } from "next";
import { getClanTenureData } from "@/lib/ghost-hunt/clan-tenure";
import PublicNavigation from "@/components/public-navigation";
import "./tempo-de-cla.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Tempo de Clã" };

function date(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}
function duration(milliseconds: number) {
  const totalHours = Math.floor(milliseconds / 3_600_000);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return days > 0 ? `${days}d ${hours}h` : `${hours}h`;
}

export default async function ClanTenurePage() {
  const data = await getClanTenureData();

  return <main className="admin-shell">
    <header className="admin-header">
      <a className="brand" href="/"><span className="brand-mark">GH</span><span className="brand-copy"><strong>GHOST <i>HUNT</i></strong><small>CLAN COMMUNITY</small></span></a>
      <a className="back-link" href="/">← Início</a>
    </header>
    <PublicNavigation />
    <section className="admin-content history-content tenure-content">
      <span className="auth-kicker">HISTÓRICO DE PERMANÊNCIA</span>
      <h1>Tempo <em>de Clã</em></h1>
      <p className="tenure-intro">Acompanhe quanto tempo cada jogador acumulou no Ghost Hunt. Quando alguém sai, o período é encerrado; quando retorna, um novo período começa e o tempo anterior continua somando.</p>

      {!data.connected && <div className="connection-alert"><b>Não foi possível carregar o Tempo de Clã.</b><span>{data.error || "Verifique a conexão com o banco de dados."}</span></div>}

      <div className="tenure-summary">
        <article><small>Jogadores registrados</small><strong>{data.players.length}</strong></article>
        <article><small>No clã agora</small><strong>{data.activeCount}</strong></article>
      </div>

      {data.trackedFrom && <div className="tenure-notice">Base histórica disponível a partir de <b>{date(data.trackedFrom)}</b>. O tempo anterior a esse primeiro registro não é estimado. As entradas e saídas passam a ser contabilizadas pelas sincronizações automáticas do clã.</div>}

      <div className="history-section-title"><h2>Ranking de permanência</h2><span>{data.players.length} JOGADORES</span></div>
      <div className="tenure-list">
        {data.players.map((player, index) => <article className="tenure-player-card" key={player.tag}>
          <div className="tenure-player-top">
            <span className="tenure-position">{index + 1}</span>
            <div className="tenure-identity"><strong>{player.name}</strong><small>{player.tag}</small></div>
            <div className="tenure-duration"><strong>{duration(player.totalMilliseconds)}</strong><small>TEMPO ACUMULADO</small></div>
          </div>
          <span className={player.active ? "tenure-status" : "tenure-status inactive"}>{player.active ? "● NO CLÃ" : "○ FORA DO CLÃ"}</span>
          <div className="tenure-meta">
            <span><b>Primeira entrada registrada</b>{date(player.firstJoinedAt)}</span>
            <span><b>Entrada mais recente</b>{date(player.latestJoinedAt)}</span>
            <span><b>Períodos registrados</b>{player.periods.length}</span>
            <span><b>Última saída</b>{player.latestLeftAt ? date(player.latestLeftAt) : "Ainda no clã"}</span>
          </div>
          <details className="tenure-history"><summary>Ver histórico de permanência ({player.periods.length})</summary>
            <div className="tenure-history-list">{player.periods.map((period, periodIndex) => <div className="tenure-history-item" key={period.joined_at + periodIndex}>
              <span>Período {periodIndex + 1}<br />Entrada: {date(period.joined_at)}</span>
              <strong>{period.left_at ? `Saída: ${date(period.left_at)}` : "Em andamento"}</strong>
            </div>)}</div>
          </details>
        </article>)}
        {data.connected && !data.players.length && <div className="tenure-empty">Ainda não há períodos de permanência registrados.</div>}
      </div>
      <a className="back-link" href="/">← Voltar ao início</a>
    </section>
  </main>;
}
