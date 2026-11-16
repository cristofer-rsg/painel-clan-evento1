"use client";

import { useEffect, useState } from "react";
import "./performance-filters.css";

type Props = {
  months: string[];
  monthKey: string;
  monthLabel: string;
  query: string;
  event: string;
  situation: string;
  order: "asc" | "desc";
  selectedTroops: string;
  selectedCoins: string;
};

type FilterChip = { key: string; label: string };

function buildRemovalUrl(key: string, values: Record<string, string>) {
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(values)) {
    if (name !== key && value) params.set(name, value);
  }
  const queryString = params.toString();
  return queryString ? `/performance?${queryString}` : "/performance";
}

export default function PerformanceFilters({
  months,
  monthKey,
  monthLabel,
  query,
  event,
  situation,
  order,
  selectedTroops,
  selectedCoins,
}: Props) {
  const [selectedMonth, setSelectedMonth] = useState(monthKey);
  const [selectedQuery, setSelectedQuery] = useState(query);
  const [selectedEvent, setSelectedEvent] = useState(event);
  const [selectedSituation, setSelectedSituation] = useState(situation);
  const [selectedTroopsValue, setSelectedTroopsValue] = useState(selectedTroops);
  const [selectedCoinsValue, setSelectedCoinsValue] = useState(selectedCoins);
  const [selectedOrder, setSelectedOrder] = useState(order);

  useEffect(() => {
    setSelectedMonth(monthKey);
    setSelectedQuery(query);
    setSelectedEvent(event);
    setSelectedSituation(situation);
    setSelectedTroopsValue(selectedTroops);
    setSelectedCoinsValue(selectedCoins);
    setSelectedOrder(order);
  }, [monthKey, query, event, situation, selectedTroops, selectedCoins, order]);

  function changeEvent(value: string) {
    const nextValue = value === "all" && selectedEvent === "all" ? "" : value;
    setSelectedEvent(nextValue);
    setSelectedSituation(nextValue && nextValue !== "all" ? "all" : "");
    if (nextValue) {
      setSelectedTroopsValue("");
      setSelectedCoinsValue("");
    }
  }

  function changeSituation(value: string) {
    setSelectedSituation(value === "all" && selectedSituation === "all" ? "" : value);
  }

  function changeTroops(value: string) {
    const nextValue = value === "all" && selectedTroopsValue === "all" ? "" : value;
    setSelectedTroopsValue(nextValue);
    if (nextValue) {
      setSelectedEvent("");
      setSelectedSituation("");
      setSelectedCoinsValue("");
    }
  }

  function changeCoins(value: string) {
    const nextValue = value === "all" && selectedCoinsValue === "all" ? "" : value;
    setSelectedCoinsValue(nextValue);
    if (nextValue) {
      setSelectedEvent("");
      setSelectedSituation("");
      setSelectedTroopsValue("");
    }
  }

  const values = {
    month: monthKey,
    q: query.trim(),
    event,
    situation,
    troops: selectedTroops,
    coins: selectedCoins,
    order: order === "desc" ? "" : order,
  };

  const eventLabels: Record<string, string> = {
    war: "Última Guerra",
    league: "Última batalha da Liga",
    raid: "Última Raide",
  };
  const situationLabels: Record<string, string> = {
    attacked: "Realizou ataques",
    "no-attack": "Não realizou ataques",
    "no-data": "Não participou",
  };
  const chips: FilterChip[] = [
    { key: "month", label: `Mês: ${monthLabel}` },
    ...(query.trim() ? [{ key: "q", label: `Jogador: ${query.trim()}` }] : []),
    ...(event ? [{ key: "event", label: event === "all" ? "Eventos: Todos" : `Evento: ${eventLabels[event]}` }] : []),
    ...(situation ? [{ key: "situation", label: situation === "all" ? "Situação: Todas" : `Situação: ${situationLabels[situation]}` }] : []),
    ...(selectedTroops ? [{ key: "troops", label: selectedTroops === "all" ? "Doações: Todas" : selectedTroops === "with" ? "Doações: Com doações" : "Doações: Sem doações" }] : []),
    ...(selectedCoins ? [{ key: "coins", label: selectedCoins === "all" ? "Moedas: Todas" : selectedCoins === "with" ? "Moedas: Com moedas" : "Moedas: Sem moedas" }] : []),
    ...(order === "asc" ? [{ key: "order", label: "Ordenação: Menor para maior" }] : []),
  ];

  return (
    <section className="performance-search">
      <form className="performance-search-form" action="/performance" method="get">
        <div className="performance-filter-heading">
          <div>
            <span className="performance-filter-eyebrow">PESQUISA AVANÇADA</span>
            <h2>Filtros de desempenho</h2>
            <p>Escolha uma categoria por vez para consultar os resultados.</p>
          </div>
          <span className="performance-filter-count">{chips.length} {chips.length === 1 ? "critério" : "critérios"}</span>
        </div>

        <div className="performance-filter-group">
          <h3><span aria-hidden="true">▦</span> Período</h3>
          <div className="performance-filter-grid">
            <label htmlFor="performance-month">
              <span>Mês de referência</span>
              <select id="performance-month" name="month" value={selectedMonth} onChange={(change) => setSelectedMonth(change.target.value)}>
                {months.map((month) => (
                  <option value={month} key={month}>
                    {new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "America/Sao_Paulo" }).format(new Date(`${month}-15T12:00:00-03:00`))}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="performance-filter-group">
          <h3><span aria-hidden="true">♙</span> Jogadores</h3>
          <div className="performance-filter-grid">
            <label htmlFor="performance-player">
              <span>Buscar jogador</span>
              <input id="performance-player" name="q" type="search" maxLength={80} placeholder="Nome ou tag do jogador" value={selectedQuery} onChange={(change) => setSelectedQuery(change.target.value)} />
            </label>
          </div>
        </div>
        <div className="performance-filter-group">
          <h3><span aria-hidden="true">⚔</span> Eventos</h3>
          <input type="hidden" name="event" value={selectedEvent} disabled={!selectedEvent} />
          <div className="performance-filter-grid two-columns">
            <fieldset className="performance-choice-group">
              <legend>Evento recente</legend>
              {[
                { value: "all", label: "Todas" },
                { value: "war", label: "Última Guerra" },
                { value: "league", label: "Última batalha da Liga" },
                { value: "raid", label: "Última Raide" },
              ].map((option) => (
                <label key={option.value}><input type="radio" name="event-choice" value={option.value} checked={selectedEvent === option.value} onClick={option.value === "all" ? () => changeEvent(option.value) : undefined} onChange={option.value === "all" ? undefined : () => changeEvent(option.value)} /> <span>{option.label}</span></label>
              ))}
            </fieldset>
            <fieldset className="performance-choice-group">
              <legend>Situação do evento</legend>
              <input type="hidden" name="situation" value={selectedSituation} disabled={!selectedSituation || !selectedEvent || selectedEvent === "all"} />
              {[
                { value: "all", label: "Todas" },
                { value: "attacked", label: selectedEvent === "raid" ? "Com ataques" : "Realizou ataques" },
                { value: "no-attack", label: selectedEvent === "raid" ? "Sem ataques" : "Não realizou ataques" },
                ...(selectedEvent !== "raid" ? [{ value: "no-data", label: "Não participou" }] : []),
              ].map((option) => (
                <label key={option.value}><input type="radio" name="situation-choice" value={option.value} checked={selectedSituation === option.value} onClick={option.value === "all" ? () => changeSituation(option.value) : undefined} onChange={option.value === "all" ? undefined : () => changeSituation(option.value)} disabled={!selectedEvent || selectedEvent === "all"} /> <span>{option.label}</span></label>
              ))}
            </fieldset>
          </div>
        </div>

        <div className="performance-filter-group">
          <h3><span aria-hidden="true">▥</span> Participação e contribuições</h3>
          <div className="performance-filter-grid two-columns">
            <fieldset className="performance-choice-group">
              <legend>Doações</legend>
              <input type="hidden" name="troops" value={selectedTroopsValue} disabled={!selectedTroopsValue} />
              <label><input type="radio" name="troops-choice" value="all" checked={selectedTroopsValue === "all"} onClick={() => changeTroops("all")} /> <span>Todas</span></label>
              <label><input type="radio" name="troops-choice" value="with" checked={selectedTroopsValue === "with"} onChange={() => changeTroops("with")} /> <span>Com doações</span></label>
              <label><input type="radio" name="troops-choice" value="without" checked={selectedTroopsValue === "without"} onChange={() => changeTroops("without")} /> <span>Sem doações</span></label>
            </fieldset>
            <fieldset className="performance-choice-group">
              <legend>Moedas da Capital</legend>
              <input type="hidden" name="coins" value={selectedCoinsValue} disabled={!selectedCoinsValue} />
              <label><input type="radio" name="coins-choice" value="all" checked={selectedCoinsValue === "all"} onClick={() => changeCoins("all")} /> <span>Todas</span></label>
              <label><input type="radio" name="coins-choice" value="with" checked={selectedCoinsValue === "with"} onChange={() => changeCoins("with")} /> <span>Com moedas</span></label>
              <label><input type="radio" name="coins-choice" value="without" checked={selectedCoinsValue === "without"} onChange={() => changeCoins("without")} /> <span>Sem moedas</span></label>
            </fieldset>
          </div>
        </div>

        <div className="performance-filter-group">
          <h3><span aria-hidden="true">↕</span> Ordenação</h3>
          <label className="performance-sort-field" htmlFor="performance-order">
            <span>Ordenar resultados por pontuação</span>
            <input type="hidden" name="order" value="asc" disabled={selectedOrder !== "asc"} />
            <select id="performance-order" value={selectedOrder} onChange={(change) => setSelectedOrder(change.target.value as "asc" | "desc")}>
              <option value="desc">Maior para menor</option>
              <option value="asc">Menor para maior</option>
            </select>
          </label>
        </div>

        <div className="performance-filter-actions">
          <a className="performance-clear-button" href="/performance">Limpar pesquisa</a>
          <button className="performance-apply-button" type="submit">Aplicar filtros</button>
        </div>
      </form>

      {chips.length > 0 && (
        <div className="performance-applied">
          <div className="performance-applied-heading">
            <strong>Critérios da consulta ({chips.length})</strong>
            <a href="/performance">Remover todos</a>
          </div>
          <div className="performance-applied-chips">
            {chips.map((chip) => (
              <a key={chip.key} href={buildRemovalUrl(chip.key, values)} aria-label={`Remover filtro: ${chip.label}`}>
                {chip.label}<span aria-hidden="true">×</span>
              </a>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
