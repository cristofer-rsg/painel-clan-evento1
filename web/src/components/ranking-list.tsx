"use client";
import { useMemo, useState } from "react";

type RankingPlayer = {
  position: number; player: string; tag: string; total: number; eligible: boolean;
};
function number(value: number) { return new Intl.NumberFormat("pt-BR").format(value); }

export default function RankingList({ players }: { players: RankingPlayer[] }) {
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);
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
    {visible.map(player => <div className="ranking-row" key={player.player}>
      <span className="ranking-player"><b className="ranking-position">{player.position}</b><span>{player.player}<small>{player.eligible ? "Elegível" : "Não elegível"}{player.tag ? " · " + player.tag : ""}</small></span></span>
      <strong>{number(player.total)} pts</strong>
    </div>)}
    {!visible.length && <div className="empty-state"><b>Nenhum jogador encontrado</b><p>Confira o nome ou a tag pesquisada.</p></div>}
    {!search.trim() && filtered.length > 5 && <div className="ranking-actions">
      <button className="outline-button" type="button" onClick={() => setShowAll(value => !value)}>
        {showAll ? "Mostrar somente os 5 primeiros" : "Ver classificação completa"} <span>{showAll ? "↑" : "↓"}</span>
      </button>
    </div>}
  </>;
}
