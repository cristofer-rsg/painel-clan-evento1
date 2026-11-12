"use client";

import { useCallback, useEffect, useState } from "react";

type Item = { label: string; count: number };
type Summary = {
  period: { days: number; from: string; to: string };
  totals: { visitors: number; views: number; active: number };
  daily: { date: string; label: string; views: number }[];
  pages: Item[];
  referrers: Item[];
  devices: Item[];
  locations: Item[];
  updatedAt: string;
};

const periods = [{ value: "1", label: "Hoje" }, { value: "7", label: "7 dias" }, { value: "30", label: "30 dias" }, { value: "90", label: "90 dias" }, { value: "custom", label: "Personalizado" }];

function dateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value);
}

function DataList({ title, items, empty }: { title: string; items: Item[]; empty: string }) {
  const max = Math.max(1, ...items.map((item) => item.count));
  return <section className="analytics-list-card">
    <h3>{title}</h3>
    {items.length ? <ol>{items.map((item) => <li key={item.label}>
      <div><span title={item.label}>{item.label}</span><b>{formatNumber(item.count)}</b></div>
      <i><span style={{ width: `${Math.max(3, item.count / max * 100)}%` }} /></i>
    </li>)}</ol> : <p className="analytics-empty">{empty}</p>}
  </section>;
}

export default function AnalyticsDashboard() {
  const [range, setRange] = useState("7");
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const today = dateInputValue(new Date());
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 6);
  const [customFrom, setCustomFrom] = useState(dateInputValue(weekAgo));
  const [customTo, setCustomTo] = useState(today);
  const query = range === "custom" ? `from=${customFrom}&to=${customTo}` : `days=${range}`;
  const customRangeInvalid = range === "custom" && (!customFrom || !customTo || customFrom > customTo);

  const load = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      if (customRangeInvalid) throw new Error("Informe uma data inicial e final válidas.");
      const response = await fetch(`/api/site-analytics/summary?${query}`, { cache: "no-store" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || (response.status === 401 ? "Sua sessão expirou. Entre novamente." : "Não foi possível carregar as estatísticas."));
      }
      setData(await response.json() as Summary);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar os dados.");
    } finally {
      setLoading(false);
    }
  }, [query, customRangeInvalid]);

  useEffect(() => { void load(true); }, [load]);
  useEffect(() => {
    const timer = window.setInterval(() => { void load(false); }, 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const maxViews = Math.max(1, ...(data?.daily.map((day) => day.views) || [1]));
  return <div className="analytics-dashboard">
    <div className="analytics-toolbar">
      <div><span className="analytics-live-dot" /> Atualização automática a cada minuto</div>
      <label>Período <select value={range} onChange={(event) => setRange(event.target.value)}>{periods.map((period) => <option key={period.value} value={period.value}>{period.label}</option>)}</select></label>
      <button type="button" onClick={() => void load(true)} disabled={loading || customRangeInvalid}>↻ Atualizar</button>
    </div>
    {range === "custom" ? <div className="analytics-custom-range">
      <label>De <input type="date" value={customFrom} max={customTo || today} onChange={(event) => setCustomFrom(event.target.value)} /></label>
      <label>Até <input type="date" value={customTo} min={customFrom} max={today} onChange={(event) => setCustomTo(event.target.value)} /></label>
    </div> : null}

    {error ? <div className="analytics-error" role="alert">{error}</div> : null}
    {loading && !data ? <div className="analytics-loading">Carregando dados de acesso…</div> : null}

    {data ? <>
      <div className="analytics-kpis">
        <article><span>Visitantes únicos</span><strong>{formatNumber(data.totals.visitors)}</strong><small>No período selecionado</small></article>
        <article><span>Visualizações</span><strong>{formatNumber(data.totals.views)}</strong><small>Páginas públicas acessadas</small></article>
        <article><span>Ativos agora</span><strong>{formatNumber(data.totals.active)}</strong><small>Visitantes nos últimos 5 minutos</small></article>
        <article><span>Média diária</span><strong>{formatNumber(Math.round(data.totals.views / Math.max(1, data.period.days)))}</strong><small>Visualizações por dia</small></article>
      </div>

      <section className="analytics-chart-card">
        <div className="analytics-section-heading"><div><span className="auth-kicker">MOVIMENTO DO SITE</span><h2>Visualizações por dia</h2></div><b>{formatNumber(data.totals.views)} no total</b></div>
        <div className="analytics-chart" role="img" aria-label="Gráfico de visualizações por dia">
          {data.daily.map((day) => <div className="analytics-bar-column" key={day.date}>
            <span className="analytics-bar-value">{day.views || ""}</span>
            <i><span style={{ height: `${Math.max(day.views ? 4 : 0, day.views / maxViews * 100)}%` }} /></i>
            <small>{day.label}</small>
          </div>)}
        </div>
      </section>

      <div className="analytics-breakdown-grid">
        <DataList title="Páginas mais acessadas" items={data.pages} empty="Ainda não há visitas registradas." />
        <DataList title="Origem dos acessos" items={data.referrers} empty="Acessos diretos ou sem referência identificada." />
        <DataList title="Dispositivos" items={data.devices.map((item) => ({ ...item, label: ({ mobile: "Celular", desktop: "Computador", tablet: "Tablet", unknown: "Não identificado" } as Record<string, string>)[item.label] || item.label }))} empty="Sem dados de dispositivos." />
        <DataList title="Regiões aproximadas" items={data.locations} empty="A localização ainda não está disponível." />
      </div>
      <p className="analytics-updated">Dados atualizados em {new Date(data.updatedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}. A coleta começa após esta versão entrar no ar.</p>
    </> : null}
  </div>;
}
