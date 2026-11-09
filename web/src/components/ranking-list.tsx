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
  { key: "wars", label: "Guerras", suffix: "pts" },
  { key: "league", label: "Liga", suffix: "pts" },
  { key: "donations", label: "Doações", suffix: "pts" },
  { key: "games", label: "Jogos", suffix: "pts" },
  { key: "raid", label: "Raide", suffix: "pts" },
  { key: "capitalPoints", label: "Capital", suffix: "pts" },
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
          <div className="ranking-breakdown-heading">PONTUAÇÃO POR CATEGORIA</div>
          <div className="ranking-breakdown-grid">{categories.map(category => <span key={category.key}>
            <small>{category.label}</small><b>{number(player[category.key])} <i>{category.suffix}</i></b>
          </span>)}</div>
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
