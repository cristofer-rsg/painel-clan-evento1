"use client";
import { useEffect, useState } from "react";
type EventRow = { id: number; player: string; category: string; activity: string; points: number; created_at: string };
type Player = { name: string };
const categories = ["Guerras", "Liga dos Clãs", "Doações", "Jogos do Clã", "Raide de Fim de Semana"];
function currentMonth() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).formatToParts(new Date());
  return (parts.find(p => p.type === "year")?.value || "") + "-" + (parts.find(p => p.type === "month")?.value || "");
}
function localDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}
export default function EventsManager() {
  const [month] = useState(currentMonth);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [selected, setSelected] = useState<EventRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  async function load() {
    setLoading(true);
    try {
      const [er, pr] = await Promise.all([fetch("/api/admin/events?month=" + month, { cache: "no-store" }), fetch("/api/admin/players", { cache: "no-store" })]);
      const ej = await er.json(); const pj = await pr.json();
      if (!er.ok) throw new Error(ej.error || "Falha ao carregar lançamentos.");
      if (!pr.ok) throw new Error(pj.error || "Falha ao carregar jogadores.");
      setEvents(ej.events || []); setPlayers(pj.players || []);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao carregar."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  function change(field: keyof EventRow, value: string | number) { setSelected(row => row ? { ...row, [field]: value } : row); }
  async function save() {
    if (!selected) return; setSaving(true); setMessage("");
    try {
      const response = await fetch("/api/admin/events", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(selected) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "Falha ao atualizar.");
      setSelected(null); setMessage("Lançamento atualizado; o ranking será recalculado."); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao salvar."); }
    finally { setSaving(false); }
  }
  async function remove(event: EventRow) {
    if (!window.confirm("Excluir definitivamente o lançamento de " + event.player + "?")) return;
    setSaving(true); setMessage("");
    try {
      const response = await fetch("/api/admin/events?id=" + event.id, { method: "DELETE" });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "Falha ao excluir.");
      setSelected(null); setMessage("Lançamento excluído."); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao excluir."); }
    finally { setSaving(false); }
  }
  return <section className="admin-content manager-content">
    <span className="auth-kicker">ADMINISTRAÇÃO DO CLÃ</span><h1>Editar <em>lançamentos</em></h1>
    <p>Registros do mês atual ({month}). Lançamentos manuais continuam desativados.</p>
    {message && <div className="manager-message" role="status">{message}</div>}
    {selected && <article className="event-editor"><div className="manager-player-title"><b>Editar lançamento #{selected.id}</b><button className="text-button" type="button" onClick={() => setSelected(null)}>Fechar</button></div>
      <label>Jogador<select value={selected.player} onChange={e => change("player", e.target.value)}>{players.map(p => <option key={p.name}>{p.name}</option>)}</select></label>
      <label>Categoria<select value={selected.category} onChange={e => change("category", e.target.value)}>{categories.map(c => <option key={c}>{c}</option>)}</select></label>
      <label>Descrição<input value={selected.activity || ""} maxLength={300} onChange={e => change("activity", e.target.value)} /></label>
      <label>Pontos<input type="number" min={-200} max={200} step={1} value={selected.points} onChange={e => change("points", Number(e.target.value))} /></label>
      <button className="manager-save" type="button" disabled={saving} onClick={() => void save()}>{saving ? "Salvando..." : "Salvar alterações"}</button>
    </article>}
    {loading ? <p>Carregando lançamentos...</p> : <div className="manager-list">{events.map(event => <article className="manager-player" key={event.id}>
      <div className="manager-player-title"><b>{event.player}</b><strong>{event.points} pts</strong></div>
      <small className="player-tag">{localDate(event.created_at)} • {event.category}</small><p className="event-activity">{event.activity}</p>
      <div className="event-actions"><button className="manager-save" type="button" onClick={() => setSelected({ ...event, player: players.some(player => player.name === event.player) ? event.player : (players[0]?.name ?? event.player), category: categories.includes(event.category) ? event.category : "Guerras" })}>Editar</button><button className="manager-delete" type="button" disabled={saving} onClick={() => void remove(event)}>Excluir</button></div>
    </article>)}{!events.length && <p>Não há lançamentos neste mês.</p>}</div>}
    <a className="back-link" href="/admin">← Voltar à administração</a>
  </section>;
}
