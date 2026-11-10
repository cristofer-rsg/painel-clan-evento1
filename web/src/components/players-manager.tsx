"use client";
import { FormEvent, useEffect, useState } from "react";
type Player = { name: string; player_tag: string | null; whatsapp: string; active: boolean };
function playerKey(player: Player) { return player.player_tag || player.name; }
export default function PlayersManager() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [name, setName] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const filteredPlayers = players.filter(player => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    const matchesText = !term || player.name.toLocaleLowerCase("pt-BR").includes(term) || (player.player_tag || "").toLocaleLowerCase("pt-BR").includes(term);
    return matchesText && (statusFilter === "todos" || (statusFilter === "ativos" ? player.active : !player.active));
  });
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
      const response = await fetch("/api/admin/players", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: player.name, player_tag: player.player_tag, whatsapp: player.whatsapp }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Falha ao atualizar.");
      setMessage("Cadastro de " + player.name + " atualizado."); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao atualizar."); }
    finally { setSaving(false); }
  }
  async function remove(player: Player) {
    const confirmed = window.confirm(`Tem certeza que deseja excluir o cadastro de ${player.name}? Os lançamentos e pontuações históricos serão preservados.`);
    if (!confirmed) return;
    setSaving(true); setMessage("");
    try {
      const response = await fetch("/api/admin/players", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: player.name, player_tag: player.player_tag }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Falha ao excluir jogador.");
      setMessage("Cadastro de " + player.name + " excluído. O histórico de pontuação foi preservado.");
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao excluir."); }
    finally { setSaving(false); }
  }
  return <section className="admin-content manager-content">
    <span className="auth-kicker">ADMINISTRAÇÃO DO CLÃ</span><h1>Gerenciar <em>jogadores</em></h1>
    <p>Novos cadastros entram inativos e serão ativados pela sincronização do clã.</p>
    <form className="manager-add" onSubmit={add}><input value={name} onChange={e => setName(e.target.value)} placeholder="Nome exatamente como aparece no jogo" maxLength={80} required /><button disabled={saving || !name.trim()}>{saving ? "Salvando..." : "Adicionar"}</button></form>
    {message && <div className="manager-message" role="status">{message}</div>}
    {!loading && <div className="manager-toolbar"><label className="manager-search-label">Buscar jogador<input value={search} onChange={e => setSearch(e.target.value)} placeholder="Nome ou tag do jogador..." /></label><label className="manager-filter-label">Situação<select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="todos">Todos</option><option value="ativos">Ativos</option><option value="inativos">Inativos</option></select></label><span className="manager-count">{filteredPlayers.length} de {players.length}</span></div>}
    {loading ? <p>Carregando jogadores...</p> : <div className="manager-list">{filteredPlayers.map(player => <article className="manager-player" key={playerKey(player)}>
      <div className="manager-player-title"><b>{player.name}</b><span className={player.active ? "member-status active" : "member-status"}>{player.active ? "ATIVO" : "INATIVO"}</span></div>
      {player.player_tag && <small className="player-tag">{player.player_tag}</small>}
      <div className="manager-fields">
        
        <label>Está no grupo do WhatsApp?<select value={player.whatsapp || "Não"} onChange={e => setPlayers(rows => rows.map(row => playerKey(row) === playerKey(player) ? { ...row, whatsapp: e.target.value } : row))}><option>Sim</option><option>Não</option></select></label>
      </div>
      <div className="manager-player-actions"><button className="manager-save" type="button" disabled={saving} onClick={() => void save(player)}>Salvar alterações</button><button className="manager-delete" type="button" disabled={saving} onClick={() => void remove(player)}>Excluir jogador</button></div>
    </article>)}{!filteredPlayers.length && <p className="manager-empty">Nenhum jogador encontrado com esses filtros.</p>}</div>}
    <a className="back-link" href="/admin">← Voltar à administração</a>
  </section>;
}
