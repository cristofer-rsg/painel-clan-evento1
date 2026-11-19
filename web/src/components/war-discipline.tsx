import "server-only";

import { createSupabaseAdmin } from "@/lib/supabase/admin";

import "./war-discipline.css";

type Check = boolean | null;
type Completion = { war_key: string; started_at: string; ended_at: string };
type AutomationRow = { war_key: string; source_key: string; player_tag: string; event_id: string | null };
type WarEvent = { id: number; battle_time: string | null; created_at: string; activity: string | null };
type WarPreference = "in" | "out" | "unknown" | null;
type DisciplinePlayer = { tag: string; name: string; attacks: number; warPreference: WarPreference; firstWithin12h: Check; secondAfter12h: Check; firstMirror: Check };

async function loadCurrentWar() {
  const db = createSupabaseAdmin();
  const snapshotsResult = await db.from("player_monthly_stat_sources")
    .select("source_key,player_tag,player,war_attacks,updated_at")
    .like("source_key","war:%").order("updated_at",{ascending:false}).limit(5000);
  if (snapshotsResult.error) throw new Error("Não foi possível carregar a sincronização da guerra.");
  const snapshots=(snapshotsResult.data??[]) as Array<{source_key:string;player_tag:string|null;player:string|null;war_attacks:number|null;updated_at:string|null}>;
  const latestWar=snapshots.find((row)=>/^war:.+:#([A-Z0-9]+)$/.test(row.source_key));
  if(!latestWar)return {state:"notInWar",startedAt:null,members:[] as Array<{tag:string;name:string;mapPosition:number;attacks:Array<{order:number;battleTime:number|null;observedAt:number|null;defenderTag:string|null;defenderPosition:number|null}>;warPreference:WarPreference;mirrorOrders:number[];offMirrorOrders:number[];earlySecondOrders:number[];syncedAttackCount:number}>};
  const match=latestWar.source_key.match(/^war:(.+):#[A-Z0-9]+$/);
  const warKey=match?.[1]??"";
  const snapshotWarRows=snapshots.filter((row)=>row.source_key.startsWith(`war:${warKey}:`));
  const preferenceResult=await db.from("clan_war_preferences").select("player_tag,player_name,war_preference").eq("war_key",warKey);
  if(preferenceResult.error)throw new Error("Não foi possível carregar as preferências de guerra.");
  const preferenceRows=(preferenceResult.data??[]) as Array<{player_tag:string;player_name:string;war_preference:WarPreference}>;
  const preferences=new Map(preferenceRows.map((row)=>[row.player_tag.trim().toUpperCase(),row.war_preference]));
  const warRowsByTag=new Map<string,typeof snapshotWarRows[number]>();
  for(const row of snapshotWarRows){if(row.player_tag)warRowsByTag.set(row.player_tag.trim().toUpperCase(),row);}
  for(const row of preferenceRows){
    const tag=row.player_tag.trim().toUpperCase();
    if(tag&&!warRowsByTag.has(tag)&&row.player_name.trim()){
      warRowsByTag.set(tag,{
        source_key:`war:${warKey}:${row.player_tag}`,
        player_tag:row.player_tag,
        player:row.player_name,
        war_attacks:null,
        updated_at:null,
      });
    }
  }
  const warRows=[...warRowsByTag.values()];
  const startMatch=warKey.match(/:(\d{8}T\d{6}(?:\.\d+)?Z)$/);
  const startedAt=startMatch?parseClashTime(startMatch[1]):null;
  if(!startedAt)throw new Error("A sincronização não contém o início válido da guerra.");
  const completionResult=await db.from("clan_war_completions").select("ended_at").eq("war_key",warKey).maybeSingle();
  if(completionResult.error)throw new Error("Não foi possível consultar o encerramento oficial da guerra.");
  const recordedEnd=completionResult.data?.ended_at?new Date(completionResult.data.ended_at):null;
  const scheduledEnd=new Date(startedAt.getTime()+24*60*60*1000);
  const warEnd=recordedEnd&&Number.isFinite(recordedEnd.getTime())&&recordedEnd.getTime()>startedAt.getTime()?recordedEnd:scheduledEnd;
  const now=Date.now();
  const state=now<startedAt.getTime()?"preparation":now>=warEnd.getTime()?"warEnded":"inWar";
  const automationResult=await db.from("clash_war_automation").select("source_key,player_tag,event_id").eq("war_key",warKey);
  if(automationResult.error)throw new Error("Não foi possível carregar os ataques sincronizados.");
  const automation=(automationResult.data??[]) as Array<{source_key:string;player_tag:string;event_id:string|null}>;
  const eventIds=[...new Set(automation.map((row)=>row.event_id).filter((id):id is string=>Boolean(id)))];
  const eventsResult=eventIds.length?await db.from("events").select("id,battle_time,created_at,activity").in("id",eventIds.map(Number)):{data:[],error:null};
  if(eventsResult.error)throw new Error("Não foi possível carregar os horários dos ataques.");
  const eventTimes=new Map<number,number>();
  const attackEventTimes=new Map<number,number>();
  const eventActivities=new Map<number,string|null>();
  for(const event of (eventsResult.data??[]) as Array<{id:number;battle_time:string|null;created_at:string;activity:string|null}>){
    if(event.battle_time)eventTimes.set(event.id,new Date(event.battle_time).getTime());
    attackEventTimes.set(event.id,new Date(event.created_at).getTime());
    eventActivities.set(event.id,event.activity);
  }
  const observedTimes=new Map<number,number>();
  for(const entry of automation){
    const observedMatch=entry.source_key.match(/:attack:(\d+):observed-time$/);
    if(!observedMatch||!entry.event_id)continue;
    const eventId=Number(entry.event_id);
    const observed=attackEventTimes.get(eventId);
    if(observed!==undefined)observedTimes.set(Number(observedMatch[1]),observed);
  }
  const members=warRows.flatMap((row)=>{
    if(!row.player_tag||!row.player)return[];
    const tag=row.player_tag.trim().toUpperCase();
    const own=automation.filter((entry)=>entry.player_tag.trim().toUpperCase()===tag);
    const attackOrders=[...new Set(own.flatMap((entry)=>{const m=entry.source_key.match(/:attack:(\d+):(stars|observed-time|battle-time)$/);return m?[Number(m[1])]:[];}))].sort((a,b)=>a-b);
    const attacks=attackOrders.map((order)=>{
      const starEntry=own.find((entry)=>entry.source_key.endsWith(`:attack:${order}:stars`));
      const timeEntry=own.find((entry)=>entry.source_key.endsWith(`:attack:${order}:battle-time`));
      return {order,battleTime:(starEntry?.event_id?eventTimes.get(Number(starEntry.event_id)):undefined)??(timeEntry?.event_id?eventTimes.get(Number(timeEntry.event_id)):undefined)??null,observedAt:earliestObservedTime(observedTimes.get(order),starEntry?.event_id?attackEventTimes.get(Number(starEntry.event_id)):undefined,timeEntry?.event_id?attackEventTimes.get(Number(timeEntry.event_id)):undefined),defenderTag:null,defenderPosition:null};
    });
    const isActivePenalty=(entry:{event_id:string|null})=>{const activity=entry.event_id?eventActivities.get(Number(entry.event_id)):null;return !activity?.startsWith("Penalidade removida:");};
    return [{tag,name:row.player,mapPosition:0,attacks,warPreference:preferences.get(tag)??null,
      mirrorOrders:own.flatMap((entry)=>{const m=entry.source_key.match(/:mirror:(\d+)$/);return m?[Number(m[1])]:[];}),
      offMirrorOrders:own.flatMap((entry)=>{const m=entry.source_key.match(/:penalty:off-mirror:(\d+)$/);return m&&isActivePenalty(entry)?[Number(m[1])]:[];}),
      earlySecondOrders:own.flatMap((entry)=>{const m=entry.source_key.match(/:penalty:early-second:(\d+)$/);return m&&isActivePenalty(entry)?[Number(m[1])]:[];}),
      syncedAttackCount:Number(row.war_attacks??attacks.length)}];
  });
  return {state,startedAt:startedAt.toISOString(),endsAt:warEnd.toISOString(),members};
}
function parseClashTime(value: string) {
  const normalized = value.replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(?:\.\d+)?Z/, "$1-$2-$3T$4:$5:$6Z");
  const date = new Date(normalized);
  return Number.isFinite(date.getTime()) ? date : null;
}
function earliestObservedTime(...values: Array<number | null | undefined>): number | null {
  const valid=values.filter((value):value is number=>value!==null&&value!==undefined&&Number.isFinite(value));
  return valid.length?Math.min(...valid):null;
}
function resolveFirstWithin12h(actual:number|null,observed:number|null,mark:number,noAttacks=false):Check {
  if(noAttacks)return false;
  if(actual!==null)return actual<=mark;
  return observed!==null&&observed<=mark?true:null;
}
function resolveSecondAfter12h(actual:number|null,observed:number|null,mark:number,missedSecond=false,noAttacks=false):Check {
  if(noAttacks||missedSecond)return false;
  if(actual!==null)return actual>=mark;
  return observed!==null&&observed<mark?false:null;
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
  const [warsResult, snapshotsResult] = await Promise.all([
    db.from("clan_war_completions").select("war_key,started_at,ended_at").order("ended_at", { ascending: false }).limit(6),
    db.from("player_monthly_stat_sources").select("source_key,player_tag,player,war_attacks,updated_at").like("source_key", "war:%").order("updated_at", { ascending: false }).limit(5000),
  ]);
  if (warsResult.error) throw new Error(warsResult.error.message);
  if (snapshotsResult.error) throw new Error(snapshotsResult.error.message);
  const warSnapshots = (snapshotsResult.data ?? []) as Array<{source_key:string;player_tag:string|null;player:string|null;war_attacks:number|null;updated_at:string|null}>;
  const recordedWars = (warsResult.data ?? []) as Completion[];
  const latestSnapshots = new Map<string, string>();
  for (const row of warSnapshots) {
    const match = row.source_key.match(/^war:(.+):#[A-Z0-9]+$/);
    if (match && row.updated_at && row.updated_at > (latestSnapshots.get(match[1]) ?? "")) {
      latestSnapshots.set(match[1], row.updated_at);
    }
  }
  const inferredWars = [...latestSnapshots.entries()].flatMap(([war_key, snapshotAt]) => {
    const match = war_key.match(/:(\d{8}T\d{6}(?:\.\d+)?Z)$/);
    if (!match) return [];
    const startedAt = parseClashTime(match[1]);
    if (!startedAt) return [];
    const endedAt = new Date(startedAt.getTime() + 86400000);
    if (endedAt.getTime() > Date.now() || new Date(snapshotAt).getTime() < endedAt.getTime() - 3600000) return [];
    return [{war_key,started_at:startedAt.toISOString(),ended_at:endedAt.toISOString()}];
  });
  const warsByKey = new Map<string, Completion>();
  for (const war of recordedWars) warsByKey.set(war.war_key, war);
  for (const war of inferredWars) {
    if (!warsByKey.has(war.war_key)) warsByKey.set(war.war_key, war);
  }
  const wars = [...warsByKey.values()]
    .sort((a,b)=>b.ended_at.localeCompare(a.ended_at))
    .slice(0,6);
  const keys = wars.map((war)=>war.war_key);
  const automationResult = keys.length ? await db.from("clash_war_automation").select("war_key,source_key,player_tag,event_id").in("war_key",keys) : {data:[],error:null};
  if (automationResult.error) throw new Error(automationResult.error.message);
  const automation = (automationResult.data ?? []) as AutomationRow[];
  const preferenceResult = keys.length
    ? await db.from("clan_war_preferences").select("war_key,player_tag,player_name,war_preference").in("war_key",keys)
    : {data:[],error:null};
  if (preferenceResult.error) throw new Error(preferenceResult.error.message);
  const preferenceRows = (preferenceResult.data ?? []) as Array<{war_key:string;player_tag:string;player_name:string;war_preference:WarPreference}>;
  const preferences = new Map(preferenceRows.map((row)=>[`${row.war_key}|${row.player_tag.trim().toUpperCase()}`,row.war_preference]));
  const eventIds = [...new Set(automation.map((row)=>row.event_id).filter((id):id is string=>Boolean(id)))];
  const eventsResult = eventIds.length ? await db.from("events").select("id,battle_time,created_at,activity").in("id",eventIds.map(Number)) : {data:[],error:null};
  if (eventsResult.error) throw new Error(eventsResult.error.message);
  const eventMap = new Map<number,WarEvent>();
  for (const event of (eventsResult.data ?? []) as WarEvent[]) eventMap.set(event.id,event);
  return wars.map((war)=>{
    const rows = automation.filter((row)=>row.war_key===war.war_key);
    const mark = new Date(war.ended_at).getTime()-12*3600000;
    const snapshotRoster=warSnapshots.filter((row)=>row.source_key.startsWith(`war:${war.war_key}:`));
    const rosterByTag = new Map<string,{player_tag:string;player:string;war_attacks:number|null}>();
    for (const snapshot of snapshotRoster) {
      if (snapshot.player_tag && snapshot.player) {
        rosterByTag.set(snapshot.player_tag.trim().toUpperCase(), {
          player_tag:snapshot.player_tag,
          player:snapshot.player,
          war_attacks:snapshot.war_attacks,
        });
      }
    }
    for (const preference of preferenceRows.filter((row)=>row.war_key===war.war_key)) {
      const tag=preference.player_tag.trim().toUpperCase();
      if (tag && !rosterByTag.has(tag)) {
        rosterByTag.set(tag,{
          player_tag:preference.player_tag,
          player:preference.player_name,
          war_attacks:0,
        });
      }
    }
    const completeRoster=[...rosterByTag.values()];
    const roster: DisciplinePlayer[] = completeRoster.flatMap((snapshot)=>{
          if(!snapshot.player_tag||!snapshot.player)return[];
          const tag=snapshot.player_tag.trim().toUpperCase();
          const own=rows.filter((row)=>row.player_tag.trim().toUpperCase()===tag);
          const observedTimes=new Map<number,number>();
          for(const row of own){
            const observedMatch=row.source_key.match(/:attack:(\d+):observed-time$/);
            const event=row.event_id?eventMap.get(Number(row.event_id)):null;
            if(observedMatch&&event)observedTimes.set(Number(observedMatch[1]),new Date(event.created_at).getTime());
          }
          const attackOrders=[...new Set(own.flatMap((row)=>{const match=row.source_key.match(/:attack:(\d+):(stars|observed-time|battle-time)$/);return match?[Number(match[1])]:[];}))].sort((a,b)=>a-b);
          const attacks=attackOrders.map((order)=>{
            const starRow=own.find((row)=>row.source_key.endsWith(`:attack:${order}:stars`));
            const timeRow=own.find((row)=>row.source_key.endsWith(`:attack:${order}:battle-time`));
            const starEvent=starRow?.event_id?eventMap.get(Number(starRow.event_id)):null;
            const timeEvent=timeRow?.event_id?eventMap.get(Number(timeRow.event_id)):null;
            const battleTime=starEvent?.battle_time??timeEvent?.battle_time??null;
            const observedAt=earliestObservedTime(observedTimes.get(order),starEvent?new Date(starEvent.created_at).getTime():undefined,timeEvent?new Date(timeEvent.created_at).getTime():undefined);
            return {order,time:battleTime?new Date(battleTime).getTime():null,observedAt};
          });
          const expectedAttacks=Number(snapshot.war_attacks??attacks.length);
          const timelineComplete=attacks.length===expectedAttacks;
          const first=timelineComplete?attacks[0]:undefined, second=timelineComplete?attacks[1]:undefined;
          const isActivePenalty=(row:AutomationRow)=>{const event=row.event_id?eventMap.get(Number(row.event_id)):null;return !event?.activity?.startsWith("Penalidade removida:");};
          const noAttacks=own.some((row)=>row.source_key.endsWith(":penalty:no-attacks")&&isActivePenalty(row));
          const oneAttack=own.some((row)=>row.source_key.endsWith(":penalty:one-attack")&&isActivePenalty(row));
          const earlySecond=own.some((row)=>row.source_key.includes(":penalty:early-second:")&&isActivePenalty(row));
          const offMirrorOrders=own.flatMap((row)=>{const match=row.source_key.match(/:penalty:off-mirror:(\d+)$/);return match&&isActivePenalty(row)?[Number(match[1])]:[];});
          return [{tag,name:snapshot.player,attacks:expectedAttacks,warPreference:preferences.get(`${war.war_key}|${tag}`)??null,
            firstWithin12h:noAttacks?false:first?resolveFirstWithin12h(first.time,first.observedAt,mark):null,
            secondAfter12h:noAttacks||oneAttack||earlySecond?false:second?resolveSecondAfter12h(second.time,second.observedAt,mark):null,
            firstMirror:first?(offMirrorOrders.includes(first.order)?false:own.some((row)=>row.source_key.endsWith(`:mirror:${first.order}`))?true:first.time!==null&&first.time>=mark?true:null):null}];
        })
    const participantCount=roster.length;
    const passed=roster.filter((player)=>player.firstWithin12h===true&&player.secondAfter12h===true&&player.firstMirror===true).length;
    return {...war,roster,participants:participantCount,passed};
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
  const currentMark = current?.endsAt ? new Date(current.endsAt).getTime()-12*3600000 : null;
  const currentPlayers = currentMembers.map((member)=>{
    const attacks=[...member.attacks].sort((a,b)=>a.order-b.order);
    const timelineComplete=attacks.length===member.syncedAttackCount;
    const first=timelineComplete?attacks[0]:undefined, second=timelineComplete?attacks[1]:undefined;
    const firstMirror=first?(member.offMirrorOrders.includes(first.order)?false:member.mirrorOrders.includes(first.order)?true:first.battleTime!==null&&currentMark!==null&&first.battleTime>=currentMark?true:null):null;
    return {tag:member.tag,name:member.name,attacks:member.syncedAttackCount,warPreference:member.warPreference,
      firstWithin12h:currentMark===null?null:first?resolveFirstWithin12h(first.battleTime,first.observedAt,currentMark):null,
      secondAfter12h:currentMark===null?null:second?(member.earlySecondOrders.includes(second.order)?false:resolveSecondAfter12h(second.battleTime,second.observedAt,currentMark)):null,
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
        const hasFailure=player.firstWithin12h===false||player.secondAfter12h===false||player.firstMirror===false;
        const isPerfect=player.firstWithin12h===true&&player.secondAfter12h===true&&player.firstMirror===true;
        const resultClass=isPerfect?"is-pass":hasFailure?"is-fail":"is-unknown";
        const resultLabel=isPerfect?"Perfeito":hasFailure?"Ruim":"Em análise";
        return <article className="wd-player-card" key={player.tag}>
          <strong className="wd-player-name">{player.name}</strong>
          <span className={`wd-shield ${player.warPreference === "in" ? "is-green" : player.warPreference === "out" ? "is-red" : "is-unknown"}`} aria-label={player.warPreference === "in" ? "Quero lutar: disponível para guerras" : player.warPreference === "out" ? "Não quero: não deseja participar de guerras" : "Preferência não registrada para esta guerra"} title={player.warPreference === "in" ? "Quero lutar!" : player.warPreference === "out" ? "Não quero!" : "Preferência não registrada"}>
            <svg viewBox="0 0 24 28" aria-hidden="true"><path d="M12 1.5 21 5v7.2c0 6.2-3.8 11.2-9 14.3-5.2-3.1-9-8.1-9-14.3V5l9-3.5Z" /></svg>
          </span>
          <span className={`wd-result-seal ${resultClass}`}>{resultLabel}</span>
        </article>;
      })}</div>:<p className="wd-message">A API não informa uma guerra em andamento para este clã.</p>}
      <p className="wd-note">A auditoria é informativa e não altera pontos, penalidades ou classificação.</p>
    </section>
    <section className="wd-history"><div className="wd-section-title"><h3>Última guerra concluída</h3><span>{wars[0]?.participants ?? 0} participantes</span></div>
      {!wars.length?<p className="wd-message">Ainda não há guerras concluídas para auditar.</p>:wars.map((war,index)=><details className="wd-war" key={war.war_key} open={index===0}><summary><span><strong>{index===0?"Última guerra concluída":`Guerra anterior ${index}`}</strong><small>{formatDate(war.started_at)} · {war.participants} participantes</small></span><b>{war.passed}/{war.participants}</b></summary><div className="wd-history-list">{war.roster.map((player)=>{const hasFailure=player.firstWithin12h===false||player.secondAfter12h===false||player.firstMirror===false;
        const isPerfect=player.firstWithin12h===true&&player.secondAfter12h===true&&player.firstMirror===true;
        const resultClass=isPerfect?"is-pass":hasFailure?"is-fail":"is-unknown";
        const resultLabel=isPerfect?"Perfeito":hasFailure?"Ruim":"Em análise";return <article className="wd-history-player" key={player.tag}><strong className="wd-player-name">{player.name}</strong><span className={`wd-shield ${player.warPreference === "in" ? "is-green" : player.warPreference === "out" ? "is-red" : "is-unknown"}`} aria-label={player.warPreference === "in" ? "Quero lutar: disponível para guerras" : player.warPreference === "out" ? "Não quero: não deseja participar de guerras" : "Preferência não registrada para esta guerra"} title={player.warPreference === "in" ? "Quero lutar!" : player.warPreference === "out" ? "Não quero!" : "Preferência não registrada"}><svg viewBox="0 0 24 28" aria-hidden="true"><path d="M12 1.5 21 5v7.2c0 6.2-3.8 11.2-9 14.3-5.2-3.1-9-8.1-9-14.3V5l9-3.5Z" /></svg></span><span className={`wd-result-seal ${resultClass}`}>{resultLabel}</span></article>;})}</div></details>)}
    </section>
    <p className="wd-note">A auditoria é informativa e não altera pontos, penalidades ou classificação.</p>
  </section>;
}
