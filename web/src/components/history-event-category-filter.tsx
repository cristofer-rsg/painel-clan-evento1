"use client";

import { useMemo, useState } from "react";

type EventRow = { id: number; player: string; category: string; activity: string; points: number; created_at: string };
type Props = { events: EventRow[] };

const categoryLabels = [
  "Todas",
  "Guerras",
  "Liga dos Clãs",
  "Doações",
  "Jogos do Clã",
  "Raide de fim de semana",
  "Capital do Clã",
];

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short",
  }).format(new Date(value));
}

export default function HistoryEventCategoryFilter({ events }: Props) {
  const [category, setCategory] = useState("Todas");
  const [search, setSearch] = useState("");

  const counts = useMemo(() => {
    const result = new Map<string, number>();
    for (const event of events) result.set(event.category, (result.get(event.category) || 0) + 1);
    return result;
  }, [events]);

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return events.filter((event) => {
      const matchesCategory = category === "Todas" || event.category === category;
      const matchesSearch = !term || event.player.toLocaleLowerCase("pt-BR").includes(term)
        || event.activity.toLocaleLowerCase("pt-BR").includes(term);
      return matchesCategory && matchesSearch;
    });
  }, [events, category, search]);

  return (
    <section className="history-event-filter" aria-label="Pesquisar lançamentos por categoria">
      <div className="history-event-filter-heading">
        <div>
          <span className="auth-kicker">CONSULTA DE LANÇAMENTOS</span>
          <h2>Pesquisar lançamentos</h2>
          <p>Filtre os registros do mês selecionado por categoria ou jogador.</p>
        </div>
        <span className="history-event-filter-count">{filtered.length} REGISTROS</span>
      </div>
      <label className="history-event-search-label" htmlFor="history-event-search">Buscar lançamento ou jogador</label>
      <input
        id="history-event-search"
        className="history-event-search"
        type="search"
        placeholder="Digite o nome do jogador ou atividade..."
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <span className="history-event-category-label">Categoria do lançamento</span>
      <div className="history-event-category-options" role="group" aria-label="Filtrar lançamentos por categoria">
        {categoryLabels.map((label) => (
          <button
            key={label}
            type="button"
            className={category === label ? "active" : ""}
            aria-pressed={category === label}
            onClick={() => setCategory(label)}
          >
            {label}
            {label !== "Todas" && <small>{counts.get(label) || 0}</small>}
          </button>
        ))}
      </div>
      <div className="history-events history-event-filter-results">
        {filtered.map((event) => (
          <article key={event.id}>
            <div>
              <b>{event.player}</b>
              <small>{formatDate(event.created_at)} · {event.category}</small>
              <p>{event.activity}</p>
            </div>
            <strong>{new Intl.NumberFormat("pt-BR").format(event.points)} pts</strong>
          </article>
        ))}
        {!filtered.length && <p className="history-event-empty">Nenhum lançamento encontrado para este filtro.</p>}
      </div>
    </section>
  );
}
