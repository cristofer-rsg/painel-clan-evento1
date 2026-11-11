import "server-only";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

type Player = { name: string; player_tag: string | null; eligible: string | null; whatsapp: string | null };
type EventRow = { id: number; player: string; player_tag: string | null; category: string; activity: string; points: number; created_at: string };
export type HistoryRanking = { position: number; player: string; eligible: string; whatsapp: string; wars: number; league: number; donations: number; games: number; raid: number; capitalPoints: number; penalties: number; total: number };
export type HistoryData = { month: string; months: string[]; ranking: HistoryRanking[]; events: EventRow[]; snapshot: boolean; error?: string };

function currentMonth() {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).formatToParts(new Date());
  return (p.find(x => x.type === "year")?.value || "2026") + "-" + (p.find(x => x.type === "month")?.value || "01");
}
function rangeFor(key: string) {
  const [year, month] = key.split("-").map(Number);
  const start = new Date(key + "-01T00:00:00-03:00");
  const y = month === 12 ? year + 1 : year;
  const m = month === 12 ? 1 : month + 1;
  return { start: start.toISOString(), end: new Date(y + "-" + String(m).padStart(2, "0") + "-01T00:00:00-03:00").toISOString() };
}
async function pages<T>(query: any): Promise<T[]> {
  const result: T[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await query.range(offset, offset + 999);
    if (error) throw error;
    const part = (data || []) as T[]; result.push(...part);
    if (part.length < 1000) break;
  }
  return result;
}
function calculate(players: Player[], events: EventRow[]): HistoryRanking[] {
  const excludedLeaderTags = new Set(["#L8GV8C2Y", "#P8CCGYU0", "#QU0GC0VLU", "#9CLLGV8CC"]);
  players = players.filter(player => !excludedLeaderTags.has((player.player_tag || "").trim().toUpperCase()));
  const totals = new Map<string, { wars: number; league: number; donated: number; games: number; raid: number; capital: number; penalties: number }>();
  for (const event of events) {
    const eventKey = event.player_tag ? event.player_tag.trim().toUpperCase() : `name:${(event.player || "").trim().toLocaleLowerCase("pt-BR")}`;
    if (!eventKey || eventKey === "name:") continue;
    const b = totals.get(eventKey) || { wars: 0, league: 0, donated: 0, games: 0, raid: 0, capital: 0, penalties: 0 };
    const points = Number(event.points || 0), category = (event.category || "").trim().toLocaleLowerCase("pt-BR"), activity = event.activity || "";
    if (points < 0) b.penalties += Math.abs(points);
    else if (category === "guerras") b.wars += points;
    else if (category === "liga dos clãs") b.league += points;
    else if (category === "doações" && activity.startsWith("TROPAS_DOADAS:")) b.donated += Math.max(0, points);
    else if (category === "jogos do clã") b.games = Math.max(b.games, points);
    else if (category === "raide de fim de semana") b.raid += points;
    else if (category === "capital do clã") b.capital += points;
    totals.set(eventKey, b);
  }
  return players.map(player => {
    const playerKey = player.player_tag ? player.player_tag.trim().toUpperCase() : `name:${player.name.trim().toLocaleLowerCase("pt-BR")}`;
    const b = totals.get(playerKey) || { wars: 0, league: 0, donated: 0, games: 0, raid: 0, capital: 0, penalties: 0 };
    const eligible = (player.eligible || "Elegível") === "Elegível" && (player.whatsapp || "Sim") === "Sim";
    return {
      position: 0, player: player.name, eligible: player.eligible || "Elegível", whatsapp: player.whatsapp || "Sim",
      wars: b.wars, league: b.league, donations: Math.min(50, Math.floor(b.donated / 100)),
      games: Math.min(25, b.games), raid: b.raid, capitalPoints: Math.floor(b.capital / 2500), penalties: b.penalties,
      total: eligible ? Math.max(0, b.wars + b.league + Math.min(50, Math.floor(b.donated / 100)) + Math.min(25, b.games) + b.raid + Math.floor(b.capital / 2500) - b.penalties) : 0,
    };
  }).sort((a, b) => b.total - a.total || b.wars - a.wars || b.league - a.league || b.raid - a.raid || b.capitalPoints - a.capitalPoints || b.donations - a.donations || b.games - a.games || a.player.localeCompare(b.player, "pt-BR"))
    .map((row, i) => ({ ...row, position: i + 1 }));
}

export async function getHistoryData(requestedMonth?: string): Promise<HistoryData> {
  try {
    const db = createSupabaseAdmin();
    const monthRows = await pages<{ month_key: string }>(db.from("monthly_rankings").select("month_key").order("month_key", { ascending: false }));
    const months = Array.from(new Set([currentMonth(), ...monthRows.map(row => row.month_key).filter(Boolean)])).sort().reverse();
    const month = requestedMonth && /^\d{4}-(0[1-9]|1[0-2])$/.test(requestedMonth) && months.includes(requestedMonth) ? requestedMonth : currentMonth();
    const { data: snapshotData, error: snapshotError } = await db.from("monthly_rankings").select("*").eq("month_key", month).order("position", { ascending: true });
    if (snapshotError) throw snapshotError;
    const bounds = rangeFor(month);
    const events = await pages<EventRow>(db.from("events").select("id,player,player_tag,category,activity,points,created_at").gte("created_at", bounds.start).lt("created_at", bounds.end).order("created_at", { ascending: false }));
    if (snapshotData?.length) {
      const ranking = snapshotData.map(row => ({
        position: Number(row.position), player: row.player, eligible: row.eligible || "", whatsapp: row.whatsapp || "",
        wars: Number(row.wars || 0), league: Number(row.league || 0), donations: Number(row.donations || 0),
        games: Number(row.games || 0), raid: Number(row.raid || 0), capitalPoints: Number(row.capital_points || 0), penalties: Number(row.penalties || 0), total: Number(row.total || 0),
      }));
      return { month, months, ranking, events, snapshot: true };
    }
    const { data: players, error: playerError } = await db.from("players").select("name,player_tag,eligible,whatsapp").order("name", { ascending: true });
    if (playerError) throw playerError;
    return { month, months, ranking: calculate((players || []) as Player[], events), events, snapshot: false };
  } catch (error) {
    return { month: requestedMonth || currentMonth(), months: [currentMonth()], ranking: [], events: [], snapshot: false, error: error instanceof Error ? error.message : "Falha ao carregar histórico." };
  }
}

/**
 * Arquiva o mês anterior uma única vez, preservando o estado de elegibilidade
 * e WhatsApp vigente no fechamento, como fazia o aplicativo Streamlit.
 * Executado somente após autenticação administrativa.
 */
export async function archivePreviousMonthIfNeeded(): Promise<boolean> {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit",
  }).formatToParts(new Date());
  let year = Number(parts.find(part => part.type === "year")?.value || "2026");
  let month = Number(parts.find(part => part.type === "month")?.value || "1");
  if (month === 1) { year -= 1; month = 12; } else { month -= 1; }
  const monthKey = year + "-" + String(month).padStart(2, "0");

  const db = createSupabaseAdmin();
  const { data: existing, error: existingError } = await db.from("monthly_rankings")
    .select("player").eq("month_key", monthKey).limit(1);
  if (existingError) throw existingError;
  if (existing?.length) return false;

  const bounds = rangeFor(monthKey);
  const events = await pages<EventRow>(db.from("events")
    .select("id,player,category,activity,points,created_at")
    .gte("created_at", bounds.start).lt("created_at", bounds.end)
    .order("created_at", { ascending: false }));
  if (!events.length) return false;

  const players = await pages<Player>(db.from("players")
    .select("name,player_tag,eligible,whatsapp").order("name", { ascending: true }));
  if (!players.length) return false;

  const ranking = calculate(players, events);
  const snapshot = ranking.map(row => ({
    month_key: monthKey,
    player: row.player,
    position: row.position,
    eligible: row.eligible,
    whatsapp: row.whatsapp,
    wars: row.wars,
    league: row.league,
    donations: row.donations,
    games: row.games,
    raid: row.raid,
    penalties: row.penalties,
    total: row.total,
  }));
  const { error } = await db.from("monthly_rankings").upsert(snapshot, { onConflict: "month_key,player" });
  if (error) throw error;
  return true;
}
