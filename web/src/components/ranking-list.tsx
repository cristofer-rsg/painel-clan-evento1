"use client";
import Link from "next/link";
import { useMemo, useState } from "react";

type RankingPlayer = {
  position: number; player: string; tag: string; total: number; eligible: boolean;
  wars: number; league: number; donations: number; games: number;
  raid: number; capitalCoins: number; capitalPoints: number; penalties: number;
};
function number(value: number) { return new Intl.NumberFormat("pt-BR").format(value); }

const categories = [
  { key: "wars", label: "Guerras", max: 200 },
  { key: "league", label: "Liga", max: 200 },
  { key: "donations", label: "Doações", max: 150 },
  { key: "games", label: "Jogos", max: 100 },
  { key: "raid", label: "Raide", max: 150 },
  { key: "capitalPoints", label: "Capital", max: 200 },
] as const;

export default function RankingList({ players }: { players: RankingPlayer[] }) {
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    if (!term) return players;
    return players.filter(player => player.player.toLocaleLowerCase("pt-BR").includes(term)
      || player.tag.toLocaleLowerCase("pt-BR").includes(term));
  }, [players, search]);
  const visible = search.trim() || showAll ? filtered : filtered.slice(0, 5);
  const leader = players.find(player => player.position === 1) ?? players[0];
  return <>
    <div className="ranking-search">
      <input aria-label="Buscar jogador" placeholder="Buscar por nome ou tag..." value={search} onChange={event => setSearch(event.target.value)} />
      <small>{filtered.length} de {players.length} jogador(es)</small>
    </div>
    {visible.map(player => {
      const isExpanded = expanded === player.player;
      return <article className={`ranking-entry${player.position <= 3 ? ` ranking-top-${player.position}` : ""}`} key={player.player}>
        <div className="ranking-row ranking-row-toggle">
          <span className="ranking-player"><b className="ranking-position">{player.position}</b><span>
            {player.tag ? <Link className="ranking-profile-link" href={`/player/${encodeURIComponent(player.tag)}`}>{player.player}</Link> : <b>{player.player}</b>}
            <small>{player.eligible ? "Elegível" : "Não elegível"}{player.tag ? " · " + player.tag : ""}</small>
          </span></span>
          <span className="ranking-score"><strong>{number(player.total)} pts</strong>
            <button className="ranking-details-button" type="button" aria-expanded={isExpanded}
              aria-label={`${isExpanded ? "Ocultar" : "Ver"} pontuação por categoria de ${player.player}`}
              onClick={() => setExpanded(isExpanded ? null : player.player)}>
              {isExpanded ? "Recolher" : "Detalhes"} <i>{isExpanded ? "−" : "+"}</i>
            </button>
          </span>
        </div>
        {isExpanded && <div className="ranking-breakdown">
          <div className="ranking-breakdown-heading">PONTUAÇÃO POR CATEGORIA {player.position === leader?.position ? "· LÍDER / REFERÊNCIA" : "(vs. " + (leader?.player ?? "1º colocado") + ")"}</div>
          <div className="ranking-breakdown-grid">{categories.map(category => {
            const value = player[category.key];
            const delta = value - (leader?.[category.key] ?? value);
            const bestValue = Math.max(...categories.map(item => player[item.key]));
            const isBest = value > 0 && value === bestValue;
            return <span className={(delta > 0 ? "is-above" : delta < 0 ? "is-below" : "is-equal") + (isBest ? " is-best" : "")} key={category.key}>
              <small>{category.label}{isBest && <i className="ranking-best-star" aria-label="Melhor categoria"> ★</i>}</small>
              <b><span>{number(value)} pts</span><strong>{delta > 0 ? "↑ +" + number(delta) : delta < 0 ? "↓ −" + number(Math.abs(delta)) : "= 0"}</strong></b>
            </span>;
          })}</div>
          <div className="ranking-comparison-legend"><span><i className="legend-up">↑</i> Acima do líder</span><span><i className="legend-down">↓</i> Abaixo do líder</span><span><i className="legend-equal">=</i> Empatado</span><span><i className="legend-star">★</i> Melhor categoria</span></div>
          {player.penalties > 0 && <div className="ranking-penalty">Penalidades aplicadas: <b>−{number(player.penalties)} pts</b></div>}
        </div>}
      </article>;
    })}
    {!visible.length && <div className="empty-state"><b>Nenhum jogador encontrado</b><p>Confira o nome ou a tag pesquisada.</p></div>}
    {!search.trim() && filtered.length > 5 && <div className="ranking-actions">
      <button className="outline-button" type="button" onClick={() => setShowAll(value => !value)}>
        {showAll ? "Mostrar somente os 5 primeiros" : "Ver classificação completa"} <span>{showAll ? "↑" : "↓"}</span>
      </button>
    </div>}
  </>;
}
