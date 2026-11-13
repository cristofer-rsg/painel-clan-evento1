"use client";

import { useState } from "react";

type Props = {
  months: string[];
  monthKey: string;
  monthLabel: string;
  query: string;
  event: string;
  situation: string;
  order: "asc" | "desc";
};

export default function PerformanceFilters({ months, monthKey, query, event, situation, order }: Props) {
  const [selectedEvent, setSelectedEvent] = useState(event);
  const [selectedSituation, setSelectedSituation] = useState(situation);

  function changeEvent(value: string) {
    setSelectedEvent(value);
    if (!value) setSelectedSituation("");
  }

  return (
    <form className="history-filter performance-filter" action="/performance" method="get">
      <label htmlFor="month">Mês de referência</label>
      <select id="month" name="month" defaultValue={monthKey}>
        {months.map(month => <option value={month} key={month}>{new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "America/Sao_Paulo" }).format(new Date(month + "-15T12:00:00-03:00"))}</option>)}
      </select>
      <label htmlFor="q">Buscar jogador</label>
      <input id="q" name="q" type="search" placeholder="Nome ou tag" defaultValue={query} />
      <label htmlFor="event">Evento recente</label>
      <select id="event" name="event" value={selectedEvent} onChange={e => changeEvent(e.target.value)}>
        <option value="">Classificação geral</option>
        <option value="war">Última Guerra</option>
        <option value="league">Última batalha da Liga</option>
        <option value="raid">Última Raide</option>
      </select>
      <label htmlFor="situation">Situação</label>
      <select id="situation" name="situation" value={selectedSituation} onChange={e => setSelectedSituation(e.target.value)} disabled={!selectedEvent}>
        <option value="">Todas as situações</option>
        <option value="attacked">Realizou ataques</option>
        <option value="no-attack">Não realizou ataques</option>
        <option value="no-data">{selectedEvent === "war" ? "Fora da guerra" : "Sem dados confiáveis"}</option>
      </select>
      <label htmlFor="order">Ordenação</label>
      <select id="order" name="order" defaultValue={order}>
        <option value="desc">Maior para menor</option>
        <option value="asc">Menor para maior</option>
      </select>
      <button type="submit">Consultar</button>
    </form>
  );
}
