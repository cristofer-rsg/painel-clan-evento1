import "server-only";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { calculatePlayerScore, isRankingEligible } from "@/lib/ghost-hunt/scoring";

type Player = { name: string; player_tag: string | null; eligible: string | null; whatsapp: string | null; active?: boolean | null };
type MonthlyStat = { player_tag: string | null; player: string | null; clan_games_points: number | null };
type EventRow = { id: number; player: string; category: string; activity: string; points: number; created_at: string };
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
function calculate(players: Player[], events: EventRow[], stats: MonthlyStat[] = []): HistoryRanking[] {
  const gamesByTag = new Map(stats.filter(row => row.player_tag).map(row => [String(row.player_tag).trim().toUpperCase(), Number(row.clan_games_points || 0)]));
  const gamesByName = new Map(stats.filter(row => row.player).map(row => [String(row.player).trim().toLocaleLowerCase("pt-BR"), Number(row.clan_games_points || 0)]));
  return players.filter(isRankingEligible).map(player => {
    const scoring = calculatePlayerScore({
      playerName: player.name,
      events,
      clanGamesPoints: Math.max(
        gamesByTag.get((player.player_tag || "").trim().toUpperCase()) ?? 0,
        gamesByName.get(player.name.trim().toLocaleLowerCase("pt-BR")) ?? 0,
      ),
    });
    return {
      position: 0,
      player: player.name,
      eligible: player.eligible || "Elegível",
      whatsapp: player.whatsapp || "Não",
      wars: scoring.wars,
      league: scoring.league,
      donations: scoring.donations,
      games: scoring.games,
      raid: scoring.raid,
      capitalPoints: scoring.capitalPoints,
      penalties: scoring.penalties,
      total: scoring.total,
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
    const events = await pages<EventRow>(db.from("events").select("id,player,category,activity,points,created_at").gte("created_at", bounds.start).lt("created_at", bounds.end).order("created_at", { ascending: false }));
    if (snapshotData?.length) {
      const ranking = snapshotData.map(row => ({
        position: Number(row.position), player: row.player, eligible: row.eligible || "", whatsapp: row.whatsapp || "",
        wars: Number(row.wars || 0), league: Number(row.league || 0), donations: Number(row.donations || 0),
        games: Number(row.games || 0), raid: Number(row.raid || 0), capitalPoints: Number(row.capital_points || 0), penalties: Number(row.penalties || 0), total: Number(row.total || 0),
      }));
      return { month, months, ranking, events, snapshot: true };
    }
    const [{ data: players, error: playerError }, stats] = await Promise.all([
      db.from("players").select("name,player_tag,eligible,whatsapp,active").order("name", { ascending: true }),
      pages<MonthlyStat>(db.from("player_monthly_stats").select("player_tag,player,clan_games_points").eq("month_key", month)),
    ]);
    if (playerError) throw playerError;
    return { month, months, ranking: calculate((players || []) as Player[], events, stats), events, snapshot: false };
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

  const [players, stats] = await Promise.all([
    pages<Player>(db.from("players").select("name,player_tag,eligible,whatsapp,active").order("name", { ascending: true })),
    pages<MonthlyStat>(db.from("player_monthly_stats").select("player_tag,player,clan_games_points").eq("month_key", monthKey)),
  ]);
  if (!players.length) return false;

  const ranking = calculate(players, events, stats);
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
    capital_points: row.capitalPoints,
    penalties: row.penalties,
    total: row.total,
  }));
  const { error } = await db.from("monthly_rankings").upsert(snapshot, { onConflict: "month_key,player" });
  if (error) throw error;
  return true;
}
