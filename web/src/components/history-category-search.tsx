"use client";

import { useMemo, useState } from "react";
import type { HistoryRanking } from "@/lib/ghost-hunt/history";

const categories = [
  { key: "all", label: "Todas" },
  { key: "wars", label: "Guerras" },
  { key: "league", label: "Liga" },
  { key: "donations", label: "Doações" },
  { key: "games", label: "Jogos" },
  { key: "raid", label: "Raide" },
  { key: "capitalPoints", label: "Capital do Clã" },
] as const;

type CategoryKey = (typeof categories)[number]["key"];
type Props = { ranking: HistoryRanking[] };

const number = (value: number) => new Intl.NumberFormat("pt-BR").format(value);

export default function HistoryCategorySearch({ ranking }: Props) {
  const [category, setCategory] = useState<CategoryKey>("all");
  const [search, setSearch] = useState("");

  const rows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return ranking
      .map((row) => ({
        ...row,
        categoryPoints: category === "all" ? row.total : row[category],
      }))
      .filter((row) => !term || row.player.toLocaleLowerCase("pt-BR").includes(term))
      .sort((a, b) => b.categoryPoints - a.categoryPoints || a.player.localeCompare(b.player, "pt-BR"))
      .map((row, index) => ({ ...row, categoryPosition: index + 1 }));
  }, [ranking, category, search]);

  const selectedLabel = categories.find((item) => item.key === category)?.label ?? "Todas";

  return (
    <section className="history-category-search" aria-label="Pesquisa do histórico por categoria">
      <div className="history-category-heading">
        <div>
          <span className="auth-kicker">CONSULTA DETALHADA</span>
          <h2>Pesquisar por categoria</h2>
          <p>Compare a pontuação dos jogadores em cada atividade do mês selecionado.</p>
        </div>
        <span className="history-category-count">{rows.length} JOGADORES</span>
      </div>

      <div className="history-category-controls">
        <label htmlFor="history-player-search">Buscar jogador</label>
        <input
          id="history-player-search"
          type="search"
          placeholder="Digite o nome do jogador..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <span className="history-category-label">Categoria</span>
        <div className="history-category-options" role="group" aria-label="Selecionar categoria">
          {categories.map((item) => (
            <button
              key={item.key}
              type="button"
              className={category === item.key ? "active" : ""}
              aria-pressed={category === item.key}
              onClick={() => setCategory(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="history-category-results">
        <div className="history-category-results-head">
          <h3>{category === "all" ? "Classificação geral" : `Classificação: ${selectedLabel}`}</h3>
          <span>PONTOS</span>
        </div>
        {rows.map((row) => (
          <article key={row.player}>
            <b className="history-category-position">{row.categoryPosition}</b>
            <div className="history-category-player">
              <strong>{row.player}</strong>
              <small>{row.eligible} · WhatsApp: {row.whatsapp}</small>
            </div>
            <strong className="history-category-points">{number(row.categoryPoints)} pts</strong>
          </article>
        ))}
        {!rows.length && <p className="history-category-empty">Nenhum jogador encontrado para essa pesquisa.</p>}
      </div>
    </section>
  );
}
