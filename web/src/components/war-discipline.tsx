import "server-only";

import { createSupabaseAdmin } from "@/lib/supabase/admin";
import "./war-discipline.css";

type Player = { name: string; player_tag: string | null };
type Completion = { war_key: string; started_at: string; ended_at: string };
type AutomationRow = { war_key: string; source_key: string; player_tag: string; event_id: string | null; created_at: string };
type WarEvent = { id: number; battle_time: string | null };
type Check = boolean | null;
type DisciplinePlayer = { tag: string; name: string; attacks: number; firstWithin12h: Check; secondAfter12h: Check; firstMirror: Check };

function orderFromKey(key: string, kind: "attack" | "mirror"): number | null {
  const match = key.match(new RegExp(`:${kind}:(\\d+)(?::|$)`));
  return match ? Number(match[1]) : null;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value));
}

async function loadHistory() {
  const db = createSupabaseAdmin();
  const [playersResult, warsResult] = await Promise.all([
    db.from("players").select("name,player_tag").order("name", { ascending: true }),
    db.from("clan_war_completions").select("war_key,started_at,ended_at").order("ended_at", { ascending: false }).limit(6),
  ]);
  if (playersResult.error) throw new Error(playersResult.error.message);
  if (warsResult.error) throw new Error(warsResult.error.message);

  const players = (playersResult.data ?? []) as Player[];
  let wars = (warsResult.data ?? []) as Completion[];
  let automation: AutomationRow[] = [];

  if (!wars.length) {
    const fallbackResult = await db.from("clash_war_automation")
      .select("war_key,source_key,player_tag,event_id,created_at")
      .order("created_at", { ascending: false })
      .limit(5000);
    if (fallbackResult.error) throw new Error(fallbackResult.error.message);
    automation = (fallbackResult.data ?? []) as AutomationRow[];
    const latestSnapshotByWar = new Map<string, string>();
    for (const row of automation) {
      const current = latestSnapshotByWar.get(row.war_key) ?? "";
      if (row.created_at > current) latestSnapshotByWar.set(row.war_key, row.created_at);
    }
    wars = Array.from(latestSnapshotByWar.entries()).flatMap(([war_key, snapshotAt]) => {
      const match = war_key.match(/:(\\d{8}T\\d{6}(?:\\.\\d+)?Z)$/);
      if (!match) return [];
      const compact = match[1];
      const startedAt = new Date(`${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}T${compact.slice(9, 11)}:${compact.slice(11, 13)}:${compact.slice(13, 15)}Z`);
      const endedAt = new Date(startedAt.getTime() + 24 * 60 * 60 * 1000);
      if (!Number.isFinite(startedAt.getTime()) || endedAt.getTime() > Date.now()
        || new Date(snapshotAt).getTime() < endedAt.getTime() - 60 * 60 * 1000) return [];
      return [{ war_key, started_at: startedAt.toISOString(), ended_at: endedAt.toISOString() }];
    }).sort((a, b) => b.ended_at.localeCompare(a.ended_at)).slice(0, 6);
    const allowedKeys = new Set(wars.map((war) => war.war_key));
    automation = automation.filter((row) => allowedKeys.has(row.war_key));
  } else {
    const keys = wars.map((war) => war.war_key);
    const automationResult = await db.from("clash_war_automation")
      .select("war_key,source_key,player_tag,event_id,created_at").in("war_key", keys);
    if (automationResult.error) throw new Error(automationResult.error.message);
    automation = (automationResult.data ?? []) as AutomationRow[];
  }
  if (!wars.length) return [];
  const eventIds = Array.from(new Set(automation.map((row) => row.event_id).filter((id): id is string => Boolean(id))));
  const eventMap = new Map<number, WarEvent>();

  if (eventIds.length) {
    const eventsResult = await db.from("events").select("id,battle_time").in("id", eventIds.map(Number));
    if (eventsResult.error) throw new Error(eventsResult.error.message);
    for (const event of (eventsResult.data ?? []) as WarEvent[]) eventMap.set(event.id, event);
  }

  return wars.map((war) => {
    const rows = automation.filter((row) => row.war_key === war.war_key);
    const mark = new Date(war.started_at).getTime() + 12 * 60 * 60 * 1000;
    const roster: DisciplinePlayer[] = players.flatMap((player) => {
      const tag = (player.player_tag ?? "").trim().toUpperCase();
      if (!tag) return [];
      const ownRows = rows.filter((row) => row.player_tag.trim().toUpperCase() === tag);
      if (!ownRows.some((row) => row.source_key.endsWith(":participation"))) return [];
      const attacks = ownRows
        .filter((row) => row.source_key.includes(":attack:") && row.source_key.endsWith(":stars"))
        .map((row) => {
          const order = orderFromKey(row.source_key, "attack");
          const time = row.event_id ? eventMap.get(Number(row.event_id))?.battle_time : null;
          return { order, time: time ? new Date(time).getTime() : null };
        })
        .filter((attack): attack is { order: number; time: number | null } => attack.order !== null)
        .sort((a, b) => a.order - b.order);
      const first = attacks[0];
      const second = attacks[1];
      const firstMirror = first
        ? ownRows.some((row) => orderFromKey(row.source_key, "mirror") === first.order)
        : null;
      return [{
        tag,
        name: player.name,
        attacks: attacks.length,
        firstWithin12h: first?.time == null ? null : first.time <= mark,
        secondAfter12h: second?.time == null ? null : second.time >= mark,
        firstMirror,
      }];
    });
    const participants = roster.filter((player) => player.attacks > 0);
    const passed = participants.filter((player) =>
      player.firstWithin12h === true && player.secondAfter12h === true && player.firstMirror === true).length;
    return { ...war, roster, participants: participants.length, passed };
  });
}

function CheckBadge({ value }: { value: Check }) {
  const label = value === null ? "Sem auditoria" : value ? "Sim" : "Não";
  const className = value === null ? "is-unknown" : value ? "is-pass" : "is-fail";
  return <span className={`war-discipline-check ${className}`}>{label}</span>;
}

export default async function WarDiscipline() {
  let wars: Awaited<ReturnType<typeof loadHistory>> = [];
  let error = "";
  try {
    wars = await loadHistory();
  } catch (cause) {
    error = cause instanceof Error ? cause.message : "Falha ao consultar a auditoria das guerras.";
  }

  return (
    <section className="war-discipline" aria-labelledby="war-discipline-title">
      <div className="war-discipline-heading">
        <span className="war-discipline-kicker">AUDITORIA DE PARTICIPAÇÃO</span>
        <h2 id="war-discipline-title">Disciplina na Guerra</h2>
        <p>Histórico dos participantes e conferência dos três critérios com base nos horários oficiais registrados.</p>
      </div>
      {error && <p className="war-discipline-message is-error">{error}</p>}
      {!error && !wars.length && <p className="war-discipline-message">Ainda não há guerras concluídas para auditar.</p>}
      {wars.map((war, index) => (
        <details className="war-discipline-war" key={war.war_key} open={index === 0}>
          <summary>
            <span><strong>{index === 0 ? "Última guerra concluída" : `Guerra anterior ${index}`}</strong><small>{formatDate(war.started_at)} · {war.participants} participantes</small></span>
            <b>{war.passed}/{war.participants}</b>
          </summary>
          <div className="war-discipline-legend">
            <span><i className="is-pass" /> Cumprido</span><span><i className="is-fail" /> Não cumprido</span><span><i className="is-unknown" /> Sem auditoria histórica</span>
          </div>
          <div className="war-discipline-table-wrap">
            <table className="war-discipline-table">
              <thead><tr><th>Jogador</th><th>1º ataque até 12h</th><th>2º ataque após 12h</th><th>1º ataque no espelho</th><th>Resultado</th></tr></thead>
              <tbody>
                {war.roster.map((player) => {
                  const checks = [player.firstWithin12h, player.secondAfter12h, player.firstMirror];
                  const completed = checks.filter((value) => value === true).length;
                  const audited = player.attacks > 0 && checks.every((value) => value !== null);
                  const passed = audited && completed === 3;
                  return (
                    <tr key={player.tag}>
                      <td><strong>{player.name}</strong><small>{player.attacks} {player.attacks === 1 ? "ataque" : "ataques"}</small></td>
                      <td><CheckBadge value={player.firstWithin12h} /></td>
                      <td><CheckBadge value={player.secondAfter12h} /></td>
                      <td><CheckBadge value={player.firstMirror} /></td>
                      <td><span className={`war-discipline-result ${player.attacks === 0 ? "is-pending" : passed ? "is-ready" : audited ? "is-review" : "is-pending"}`}>
                        {player.attacks === 0 ? "Não atacou" : passed ? "3/3 · Excelente" : audited ? `${completed}/3 · Melhorar` : `${completed}/3 · Parcial`}
                      </span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className={`war-discipline-intent ${war.participants > 0 && war.passed === war.participants ? "is-ready" : "is-review"}`}>
            {war.participants > 0 && war.passed === war.participants
              ? "🟢 Todos os participantes cumpriram os três critérios. Manter esse padrão na próxima guerra."
              : "🔴 Existem critérios a melhorar. A próxima guerra é a oportunidade de corrigir a participação."}
          </p>
        </details>
      ))}
      <p className="war-discipline-note">Guerras antigas sem horários de ataque salvos aparecem como “Sem auditoria”. Os próximos registros com horário oficial serão calculados automaticamente. Esta auditoria é informativa e não altera pontos, penalidades ou classificação.</p>
    </section>
  );
}
