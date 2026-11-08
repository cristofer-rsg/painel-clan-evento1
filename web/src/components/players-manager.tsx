"use client";
import { FormEvent, useEffect, useState } from "react";
type Player = { name: string; player_tag: string | null; eligible: string; whatsapp: string; active: boolean };
export default function PlayersManager() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/players", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Falha ao carregar jogadores.");
      setPlayers(result.players || []);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao carregar."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setMessage("");
    try {
      const response = await fetch("/api/admin/players", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Falha ao cadastrar.");
      setName(""); setMessage("Jogador cadastrado como inativo; a sincronização do clã poderá ativá-lo."); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao cadastrar."); }
    finally { setSaving(false); }
  }
  async function save(player: Player) {
    setSaving(true); setMessage("");
    try {
      const response = await fetch("/api/admin/players", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: player.name, eligible: player.eligible, whatsapp: player.whatsapp }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Falha ao atualizar.");
      setMessage("Cadastro de " + player.name + " atualizado."); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao atualizar."); }
    finally { setSaving(false); }
  }
  return <section className="admin-content manager-content">
    <span className="auth-kicker">ADMINISTRAÇÃO DO CLÃ</span><h1>Gerenciar <em>jogadores</em></h1>
    <p>Novos cadastros entram inativos e serão ativados pela sincronização do clã.</p>
    <form className="manager-add" onSubmit={add}><input value={name} onChange={e => setName(e.target.value)} placeholder="Nome exatamente como aparece no jogo" maxLength={80} required /><button disabled={saving || !name.trim()}>{saving ? "Salvando..." : "Adicionar"}</button></form>
    {message && <div className="manager-message" role="status">{message}</div>}
    {loading ? <p>Carregando jogadores...</p> : <div className="manager-list">{players.map(player => <article className="manager-player" key={player.name}>
      <div className="manager-player-title"><b>{player.name}</b><span className={player.active ? "member-status active" : "member-status"}>{player.active ? "ATIVO" : "INATIVO"}</span></div>
      {player.player_tag && <small className="player-tag">{player.player_tag}</small>}
      <div className="manager-fields">
        <label>Elegibilidade<select value={player.eligible || "Elegível"} onChange={e => setPlayers(rows => rows.map(row => row.name === player.name ? { ...row, eligible: e.target.value } : row))}><option>Elegível</option><option>Inelegível</option></select></label>
        <label>Grupo WhatsApp<select value={player.whatsapp || "Sim"} onChange={e => setPlayers(rows => rows.map(row => row.name === player.name ? { ...row, whatsapp: e.target.value } : row))}><option>Sim</option><option>Não</option></select></label>
      </div>
      <button className="manager-save" type="button" disabled={saving} onClick={() => void save(player)}>Salvar alterações</button>
    </article>)}{!players.length && <p>Nenhum jogador cadastrado.</p>}</div>}
    <a className="back-link" href="/admin">← Voltar à administração</a>
  </section>;
}
