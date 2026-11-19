import "server-only";

import { createSupabaseAdmin } from "@/lib/supabase/admin";

import "./war-discipline.css";

type Check = boolean | null;
type Player = { name: string; player_tag: string | null };
type Completion = { war_key: string; started_at: string; ended_at: string };
type AutomationRow = { war_key: string; source_key: string; player_tag: string; event_id: string | null };
type WarEvent = { id: number; battle_time: string | null };
type DisciplinePlayer = { tag: string; name: string; attacks: number; firstWithin12h: Check; secondAfter12h: Check; firstMirror: Check };

async function loadCurrentWar() {
  const token = process.env.CLASH_API_TOKEN?.replace(/\\s+/g, "");
  if (!token) throw new Error("A chave da API do Clash of Clans não está configurada.");
  const response = await fetch("https://cocproxy.royaleapi.dev/v1/clans/%232GCGP0RQ9/currentwar", {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "User-Agent": "GhostHunt/1.0" },
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`Falha ao consultar a guerra atual (HTTP ${response.status}).`);
  const war = await response.json() as {
    state?: string; startTime?: string; clan?: { tag?: string; members?: Array<{ tag: string; name: string; mapPosition: number; attacks?: Array<{ order: number; battleTime?: string; defenderTag?: string }> }> };
    opponent?: { tag?: string; members?: Array<{ tag: string; mapPosition: number }> };
  };
  if (war.state === "notInWar") return { state: "notInWar", startedAt: null, members: [] as Array<{tag:string;name:string;mapPosition:number;attacks:Array<{order:number;battleTime:number|null;defenderTag:string|null}>}> };
  if (!war.startTime || !Array.isArray(war.clan?.members) || !Array.isArray(war.opponent?.members)) throw new Error("A API retornou dados incompletos da guerra atual.");
  const own = war.clan.tag?.toUpperCase() === "#2GCGP0RQ9" ? war.clan : war.opponent;
  const enemy = own === war.clan ? war.opponent : war.clan;
  const positions = new Map((enemy.members ?? []).map((member) => [member.tag.toUpperCase(), member.mapPosition]));
  return { state: war.state ?? "unknown", startedAt: parseClashTime(war.startTime)?.toISOString() ?? null,
    members: (own.members ?? []).map((member) => ({ tag: member.tag.toUpperCase(), name: member.name, mapPosition: member.mapPosition,
      attacks: (member.attacks ?? []).map((attack) => ({ order: attack.order, battleTime: attack.battleTime ? parseClashTime(attack.battleTime)?.getTime() ?? null : null, defenderTag: attack.defenderTag?.toUpperCase() ?? null, defenderPosition: attack.defenderTag ? positions.get(attack.defenderTag.toUpperCase()) ?? null : null })) })) };
}
function parseClashTime(value: string) {
  const normalized = value.replace(/(\\d{4})(\\d{2})(\\d{2})T(\\d{2})(\\d{2})(\\d{2})(?:\\.\\d+)?Z/, "$1-$2-$3T$4:$5:$6Z");
  const date = new Date(normalized);
  return Number.isFinite(date.getTime()) ? date : null;
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value));
}
function check(value: Check) {
  return value === null ? "Sem auditoria" : value ? "Cumprido" : "Não cumprido";
}
function CheckPill({ value }: { value: Check }) {
  return <span className={`wd-pill ${value === null ? "is-unknown" : value ? "is-pass" : "is-fail"}`}>{check(value)}</span>;
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
  if (!wars.length) {
    const snapshotsResult = await db.from("player_monthly_stat_sources").select("source_key,updated_at").like("source_key", "war:%").order("updated_at", { ascending: false }).limit(5000);
    if (snapshotsResult.error) throw new Error(snapshotsResult.error.message);
    const latest = new Map<string, string>();
    for (const row of (snapshotsResult.data ?? []) as Array<{source_key:string;updated_at:string|null}>) {
      const match = row.source_key.match(/^war:(.+):#[A-Z0-9]+$/);
      if (match && row.updated_at && row.updated_at > (latest.get(match[1]) ?? "")) latest.set(match[1], row.updated_at);
    }
    wars = [...latest.entries()].flatMap(([war_key, snapshotAt]) => {
      const match = war_key.match(/:(\\d{8}T\\d{6}(?:\\.\\d+)?Z)$/);
      if (!match) return [];
      const startedAt = parseClashTime(match[1]);
      if (!startedAt) return [];
      const endedAt = new Date(startedAt.getTime() + 86400000);
      if (endedAt.getTime() > Date.now() || new Date(snapshotAt).getTime() < endedAt.getTime() - 3600000) return [];
      return [{war_key,started_at:startedAt.toISOString(),ended_at:endedAt.toISOString()}];
    }).sort((a,b)=>b.ended_at.localeCompare(a.ended_at)).slice(0,6);
  }
  const keys = wars.map((war)=>war.war_key);
  const automationResult = keys.length ? await db.from("clash_war_automation").select("war_key,source_key,player_tag,event_id").in("war_key",keys) : {data:[],error:null};
  if (automationResult.error) throw new Error(automationResult.error.message);
  const automation = (automationResult.data ?? []) as AutomationRow[];
  const eventIds = [...new Set(automation.map((row)=>row.event_id).filter((id):id is string=>Boolean(id)))];
  const eventsResult = eventIds.length ? await db.from("events").select("id,battle_time").in("id",eventIds.map(Number)) : {data:[],error:null};
  if (eventsResult.error) throw new Error(eventsResult.error.message);
  const eventMap = new Map<number,WarEvent>();
  for (const event of (eventsResult.data ?? []) as WarEvent[]) eventMap.set(event.id,event);
  return wars.map((war)=>{
    const rows = automation.filter((row)=>row.war_key===war.war_key);
    const mark = new Date(war.started_at).getTime()+12*3600000;
    const roster: DisciplinePlayer[] = players.flatMap((player)=>{
      const tag=(player.player_tag??"").trim().toUpperCase();
      if(!tag)return[];
      const own=rows.filter((row)=>row.player_tag.trim().toUpperCase()===tag);
      if(!own.some((row)=>row.source_key.endsWith(":participation")))return[];
      const attacks=own.filter((row)=>row.source_key.includes(":attack:")&&row.source_key.endsWith(":stars")).map((row)=>{
        const match=row.source_key.match(/:attack:(\\d+):stars$/);
        const time=row.event_id?eventMap.get(Number(row.event_id))?.battle_time:null;
        return {order:match?Number(match[1]):0,time:time?new Date(time).getTime():null};
      }).filter((attack)=>attack.order>0).sort((a,b)=>a.order-b.order);
      const first=attacks[0], second=attacks[1];
      return [{tag,name:player.name,attacks:attacks.length,
        firstWithin12h:first?.time==null?null:first.time<=mark,
        secondAfter12h:second?.time==null?null:second.time>=mark,
        firstMirror:first?own.some((row)=>row.source_key.includes(`:mirror:${first.order}`)):null}];
    });
    const participants=roster.filter((player)=>player.attacks>0);
    const passed=participants.filter((player)=>player.firstWithin12h===true&&player.secondAfter12h===true&&player.firstMirror===true).length;
    return {...war,roster,participants:participants.length,passed};
  });
}
export default async function WarDiscipline() {
  let current: Awaited<ReturnType<typeof loadCurrentWar>> | null = null;
  let wars: Awaited<ReturnType<typeof loadHistory>> = [];
  let error = "";
  try { [current,wars] = await Promise.all([loadCurrentWar(),loadHistory()]); }
  catch (cause) { error = cause instanceof Error ? cause.message : "Falha ao consultar os dados da guerra."; }
  const currentMembers = current?.members ?? [];
  const currentCount = currentMembers.length;
  const currentStart = current?.startedAt;
  const currentMark = currentStart ? new Date(currentStart).getTime()+12*3600000 : null;
  const currentPlayers = currentMembers.map((member)=>{
    const attacks=[...member.attacks].sort((a,b)=>a.order-b.order);
    const first=attacks[0], second=attacks[1];
    const firstMirror=first ? ("defenderPosition" in first && typeof first.defenderPosition === "number" ? first.defenderPosition===member.mapPosition : null) : null;
    return {tag:member.tag,name:member.name,attacks:attacks.length,
      firstWithin12h:first?.battleTime==null||currentMark===null?null:first.battleTime<=currentMark,
      secondAfter12h:second?.battleTime==null||currentMark===null?null:second.battleTime>=currentMark,
      firstMirror};
  }).sort((a,b)=>a.name.localeCompare(b.name,"pt-BR"));
  const auditedCurrent=currentPlayers.filter((p)=>p.firstWithin12h!==null&&p.secondAfter12h!==null&&p.firstMirror!==null).length;
  const currentStatus=current?.state==="notInWar"?"Fora de guerra":current?.state==="preparation"?"Preparação":current?.state==="warEnded"?"Guerra encerrada":"Em andamento";
  return <section className="war-discipline" aria-labelledby="war-discipline-title">
    <header className="wd-heading"><span className="wd-kicker">AUDITORIA DE PARTICIPAÇÃO</span><h2 id="war-discipline-title">Disciplina na Guerra</h2><p>Acompanhamento da guerra atual e histórico das guerras concluídas.</p></header>
    {error&&<p className="wd-message is-error">{error}</p>}
    <section className="wd-current" aria-label="Guerra atual">
      <div className="wd-current-head"><div><span className="wd-kicker">ACOMPANHAMENTO AO VIVO</span><h3>Guerra atual</h3><small>{currentStatus}{currentStart? ` · Início ${formatDate(currentStart)} `:""}</small></div><strong className="wd-count">{currentCount}<small>participantes</small></strong></div>
      <div className="wd-stats"><span><b>{currentPlayers.filter(p=>p.attacks>0).length}</b> com ataques</span><span><b>{currentPlayers.filter(p=>p.attacks===0).length}</b> sem ataques</span><span><b>{auditedCurrent}</b> auditáveis</span></div>
      {currentPlayers.length>0?<div className="wd-player-grid">{currentPlayers.map((player)=>{
        const checks=[player.firstWithin12h,player.secondAfter12h,player.firstMirror];
        const completed=checks.filter((value)=>value===true).length;
        return <article className="wd-player-card" key={player.tag}><div className="wd-player-head"><strong>{player.name}</strong><span>{player.attacks}/2 ataques</span></div><div className="wd-progress"><span style={{width:`${completed/3*100}%`}}/></div><div className="wd-checks"><div><small>1º ataque até 12h</small><CheckPill value={player.firstWithin12h}/></div><div><small>2º ataque após 12h</small><CheckPill value={player.secondAfter12h}/></div><div><small>1º no espelho</small><CheckPill value={player.firstMirror}/></div></div><b className="wd-score">{completed}/3 critérios</b></article>;
      })}</div>:<p className="wd-message">A API não informa uma guerra em andamento para este clã.</p>}
      <p className="wd-note">Os critérios dependem dos horários e alvos oficiais disponibilizados pela API. Quando um dado não é fornecido, será exibido “Sem auditoria”, sem presumir cumprimento ou descumprimento.</p>
    </section>
    <section className="wd-history"><div className="wd-section-title"><h3>Última guerra concluída</h3><span>{wars[0]?.participants ?? 0} participantes</span></div>
      {!wars.length?<p className="wd-message">Ainda não há guerras concluídas para auditar.</p>:wars.map((war,index)=><details className="wd-war" key={war.war_key} open={index===0}><summary><span><strong>{index===0?"Última guerra concluída":`Guerra anterior ${index}`}</strong><small>{formatDate(war.started_at)} · {war.participants} participantes</small></span><b>{war.passed}/{war.participants}</b></summary><div className="wd-history-list">{war.roster.map((player)=>{const checks=[player.firstWithin12h,player.secondAfter12h,player.firstMirror];const completed=checks.filter((v)=>v===true).length;const audited=checks.every((v)=>v!==null);return <article className="wd-history-player" key={player.tag}><div><strong>{player.name}</strong><small>{player.attacks} ataques · {completed}/3 critérios</small></div><div className="wd-checks"><CheckPill value={player.firstWithin12h}/><CheckPill value={player.secondAfter12h}/><CheckPill value={player.firstMirror}/></div><span className={`wd-result ${audited&&completed===3?"is-pass":audited?"is-fail":"is-unknown"}`}>{!audited?"Sem auditoria":completed===3?"3/3 · Excelente":`${completed}/3 · Melhorar`}</span></article>;})}</div></details>)}
    </section>
    <p className="wd-note">A auditoria é informativa e não altera pontos, penalidades ou classificação.</p>
  </section>;
}
