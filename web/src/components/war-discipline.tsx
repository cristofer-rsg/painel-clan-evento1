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
  const db = createSupabaseAdmin();
  const snapshotsResult = await db.from("player_monthly_stat_sources")
    .select("source_key,player_tag,player,war_attacks,updated_at")
    .like("source_key","war:%").order("updated_at",{ascending:false}).limit(5000);
  if (snapshotsResult.error) throw new Error("Não foi possível carregar a sincronização da guerra.");
  const snapshots=(snapshotsResult.data??[]) as Array<{source_key:string;player_tag:string|null;player:string|null;war_attacks:number|null;updated_at:string|null}>;
  const latestWar=snapshots.find((row)=>/^war:.+:#([A-Z0-9]+)$/.test(row.source_key));
  if(!latestWar)return {state:"notInWar",startedAt:null,members:[] as Array<{tag:string;name:string;mapPosition:number;attacks:Array<{order:number;battleTime:number|null;defenderTag:string|null;defenderPosition:number|null}>;mirrorOrders:number[];offMirrorOrders:number[];syncedAttackCount:number}>};
  const match=latestWar.source_key.match(/^war:(.+):#[A-Z0-9]+$/);
  const warKey=match?.[1]??"";
  const warRows=snapshots.filter((row)=>row.source_key.startsWith(`war:${warKey}:`));
  const startMatch=warKey.match(/:(\d{8}T\d{6}(?:\.\d+)?Z)$/);
  const startedAt=startMatch?parseClashTime(startMatch[1]):null;
  if(!startedAt)throw new Error("A sincronização não contém o início válido da guerra.");
  const automationResult=await db.from("clash_war_automation").select("source_key,player_tag,event_id").eq("war_key",warKey);
  if(automationResult.error)throw new Error("Não foi possível carregar os ataques sincronizados.");
  const automation=(automationResult.data??[]) as Array<{source_key:string;player_tag:string;event_id:string|null}>;
  const eventIds=[...new Set(automation.map((row)=>row.event_id).filter((id):id is string=>Boolean(id)))];
  const eventsResult=eventIds.length?await db.from("events").select("id,battle_time").in("id",eventIds.map(Number)):{data:[],error:null};
  if(eventsResult.error)throw new Error("Não foi possível carregar os horários dos ataques.");
  const eventTimes=new Map<number,number>();
  for(const event of (eventsResult.data??[]) as Array<{id:number;battle_time:string|null}>){if(event.battle_time)eventTimes.set(event.id,new Date(event.battle_time).getTime());}
  const members=warRows.flatMap((row)=>{
    if(!row.player_tag||!row.player)return[];
    const tag=row.player_tag.trim().toUpperCase();
    const own=automation.filter((entry)=>entry.player_tag.trim().toUpperCase()===tag);
    const attacks=own.filter((entry)=>entry.source_key.includes(":attack:")&&entry.source_key.endsWith(":stars"))
      .map((entry)=>{const m=entry.source_key.match(/:attack:(\d+):stars$/);return {order:m?Number(m[1]):0,battleTime:entry.event_id?eventTimes.get(Number(entry.event_id))??null:null,defenderTag:null,defenderPosition:null};})
      .filter((attack)=>attack.order>0).sort((a,b)=>a.order-b.order);
    return [{tag,name:row.player,mapPosition:0,attacks,
      mirrorOrders:own.flatMap((entry)=>{const m=entry.source_key.match(/:mirror:(\d+)$/);return m?[Number(m[1])]:[];}),
      offMirrorOrders:own.flatMap((entry)=>{const m=entry.source_key.match(/:penalty:off-mirror:(\d+)$/);return m?[Number(m[1])]:[];}),
      syncedAttackCount:Number(row.war_attacks??attacks.length)}];
  });
  return {state:Date.now()-startedAt.getTime()>36*60*60*1000?"warEnded":"inWar",startedAt:startedAt.toISOString(),members};
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
    const firstMirror=first
      ? member.mirrorOrders.includes(first.order) ? true
        : member.offMirrorOrders.includes(first.order) ? false : null
      : null;
    return {tag:member.tag,name:member.name,attacks:member.syncedAttackCount,
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
      {currentPlayers.length>0?<div className="wd-player-grid">{currentPlayers.map((player)=>{
        const compliant=player.firstWithin12h===true&&player.secondAfter12h===true&&player.firstMirror===true;
        return <article className="wd-player-card" key={player.tag}>
          <strong className="wd-player-name">{player.name}</strong>
          <span className={`wd-shield ${compliant?"is-green":"is-red"}`} aria-label={compliant?"Escudo verde":"Escudo vermelho"}>
            <svg viewBox="0 0 24 28" aria-hidden="true"><path d="M12 1.5 21 5v7.2c0 6.2-3.8 11.2-9 14.3-5.2-3.1-9-8.1-9-14.3V5l9-3.5Z" /></svg>
          </span>
          <span className={`wd-result-seal ${compliant?"is-pass":"is-fail"}`}>{compliant?"Fez tudo correto":"Não fez tudo correto"}</span>
        </article>;
      })}</div>:<p className="wd-message">A API não informa uma guerra em andamento para este clã.</p>}
      <p className="wd-note">A auditoria é informativa e não altera pontos, penalidades ou classificação.</p>
    </section>
    <section className="wd-history"><div className="wd-section-title"><h3>Última guerra concluída</h3><span>{wars[0]?.participants ?? 0} participantes</span></div>
      {!wars.length?<p className="wd-message">Ainda não há guerras concluídas para auditar.</p>:wars.map((war,index)=><details className="wd-war" key={war.war_key} open={index===0}><summary><span><strong>{index===0?"Última guerra concluída":`Guerra anterior ${index}`}</strong><small>{formatDate(war.started_at)} · {war.participants} participantes</small></span><b>{war.passed}/{war.participants}</b></summary><div className="wd-history-list">{war.roster.map((player)=>{const compliant=player.firstWithin12h===true&&player.secondAfter12h===true&&player.firstMirror===true;return <article className="wd-history-player" key={player.tag}><strong className="wd-player-name">{player.name}</strong><span className={`wd-shield ${compliant?"is-green":"is-red"}`} aria-label={compliant?"Escudo verde":"Escudo vermelho"}><svg viewBox="0 0 24 28" aria-hidden="true"><path d="M12 1.5 21 5v7.2c0 6.2-3.8 11.2-9 14.3-5.2-3.1-9-8.1-9-14.3V5l9-3.5Z" /></svg></span><span className={`wd-result-seal ${compliant?"is-pass":"is-fail"}`}>{compliant?"Fez tudo correto":"Não fez tudo correto"}</span></article>;})}</div></details>)}
    </section>
    <p className="wd-note">A auditoria é informativa e não altera pontos, penalidades ou classificação.</p>
  </section>;
}
