import "server-only";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

type Player = { name: string; player_tag: string | null; active: boolean | null };
type Stats = { month_key: string; player_tag: string | null; player: string | null; donations: number | null; clan_games_points: number | null };
type EventRow = { player: string | null; category: string | null; activity: string | null; points: number | null };
const WEIGHTS = {
  wars: { target: 200, max: 200 },
  league: { target: 140, max: 200 },
  raid: { target: 32, max: 150 },
  donations: { target: 10000, max: 150 },
  games: { target: 10000, max: 100 },
  capital: { target: 250000, max: 200 },
} as const;
function score(raw: number, target: number, max: number) {
  return Math.round(Math.min(Math.max(raw, 0) / target, 1) * max);
}
export type PerformanceRow = {
  position: number; player: string; tag: string;
  wars: number; league: number; raid: number; donations: number; games: number; capital: number;
  warsPoints: number; leaguePoints: number; raidPoints: number; donationsPoints: number; gamesPoints: number; capitalPoints: number;
  warsPercent: number; leaguePercent: number; raidPercent: number; donationsPercent: number; gamesPercent: number; capitalPercent: number;
  totalPoints: number; index: number; penalties: number; active: boolean;
};
export type PerformanceData = {
  monthKey: string; monthLabel: string; months: string[]; rows: PerformanceRow[];
  totals: { wars: number; league: number; raid: number; donations: number; games: number; capital: number };
  connected: boolean; error?: string;
};
function currentMonth() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).formatToParts(new Date());
  return (parts.find(p => p.type === "year")?.value || "2026") + "-" + (parts.find(p => p.type === "month")?.value || "01");
}
async function allRows<T>(query: any): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await query.range(offset, offset + 999);
    if (error) throw error;
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < 1000) break;
  }
  return rows;
}
function label(key: string) {
  const value = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "America/Sao_Paulo" })
    .format(new Date(key + "-15T12:00:00-03:00"));
  return value.charAt(0).toUpperCase() + value.slice(1);
}
export async function getPerformanceData(requestedMonth?: string, useManualDonationFallback = false): Promise<PerformanceData> {
  const fallbackMonth = currentMonth();
  try {
    const db = createSupabaseAdmin();
    const [playersResult, allStats] = await Promise.all([
      db.from("players").select("name,player_tag,active").order("name", { ascending: true }),
      allRows<Stats>(db.from("player_monthly_stats").select("month_key,player_tag,player,donations,clan_games_points").order("month_key", { ascending: false })),
    ]);
    if (playersResult.error) throw playersResult.error;
    const months = Array.from(new Set([fallbackMonth, ...allStats.map(row => row.month_key).filter(Boolean)])).sort().reverse();
    const monthKey = requestedMonth && /^\d{4}-(0[1-9]|1[0-2])$/.test(requestedMonth) && months.includes(requestedMonth)
      ? requestedMonth : fallbackMonth;
    const stats = allStats.filter(row => row.month_key === monthKey);
    const start = new Date(monthKey + "-01T00:00:00-03:00");
    const [year, month] = monthKey.split("-").map(Number);
    const end = new Date((month === 12 ? year + 1 : year) + "-" + String(month === 12 ? 1 : month + 1).padStart(2, "0") + "-01T00:00:00-03:00");
    const events = await allRows<EventRow>(db.from("events").select("player,category,activity,points")
      .gte("created_at", start.toISOString()).lt("created_at", end.toISOString()));
    const byTag = new Map(stats.filter(row => row.player_tag).map(row => [String(row.player_tag).trim().toUpperCase(), row]));
    const byName = new Map(stats.filter(row => row.player).map(row => [String(row.player).trim().toLocaleLowerCase("pt-BR"), row]));
    const rawByPlayer = new Map<string, { wars: number; league: number; raid: number; donationsEvents: number; gamesEvents: number; capital: number; penalties: number }>();
    for (const event of events) {
      const key = (event.player || "").trim().toLocaleLowerCase("pt-BR");
      if (!key) continue;
      const bucket = rawByPlayer.get(key) ?? { wars: 0, league: 0, raid: 0, donationsEvents: 0, gamesEvents: 0, capital: 0, penalties: 0 };
      const points = Number(event.points || 0);
      const category = (event.category || "").trim().toLocaleLowerCase("pt-BR");
      const activity = (event.activity || "").trim();
      if (points < 0) {
        if (activity.toLocaleLowerCase("pt-BR").includes("fora do espelho")) bucket.penalties += 50;
      } else if (category === "guerras") bucket.wars += points;
      else if (category === "liga dos clãs") bucket.league += points;
      else if (category === "raide de fim de semana") bucket.raid += points;
      else if (category === "doações" && activity.startsWith("TROPAS_DOADAS:")) bucket.donationsEvents += Math.max(0, points);
      else if (category === "jogos do clã") bucket.gamesEvents = Math.max(bucket.gamesEvents, points);
      else if (category === "capital do clã" && activity === "Doação automática de Ouro da Capital") bucket.capital += Math.max(0, points);
      rawByPlayer.set(key, bucket);
    }
    const players = playersResult.data || [];
    const rows = players.map((player: Player) => {
      const key = player.name.trim().toLocaleLowerCase("pt-BR");
      const stat = (player.player_tag ? byTag.get(player.player_tag.trim().toUpperCase()) : undefined) || byName.get(key);
      const raw = rawByPlayer.get(key) ?? { wars: 0, league: 0, raid: 0, donationsEvents: 0, gamesEvents: 0, capital: 0, penalties: 0 };
      const recordedDonations = Number(stat?.donations || 0);
      const donations = useManualDonationFallback && recordedDonations <= 0 ? raw.donationsEvents : recordedDonations;
      const games = Math.max(Number(stat?.clan_games_points || 0), raw.gamesEvents);
      const warsPoints = score(raw.wars, WEIGHTS.wars.target, WEIGHTS.wars.max);
      const leaguePoints = score(raw.league, WEIGHTS.league.target, WEIGHTS.league.max);
      const raidPoints = score(raw.raid, WEIGHTS.raid.target, WEIGHTS.raid.max);
      const donationsPoints = score(donations, WEIGHTS.donations.target, WEIGHTS.donations.max);
      const gamesPoints = score(games, WEIGHTS.games.target, WEIGHTS.games.max);
      const capitalPoints = score(raw.capital, WEIGHTS.capital.target, WEIGHTS.capital.max);
      const totalPoints = Math.max(0, warsPoints + leaguePoints + raidPoints + donationsPoints + gamesPoints + capitalPoints - raw.penalties);
      const index = Math.round(totalPoints / 10);
      return {
        player: player.name, tag: player.player_tag || "", wars: raw.wars, league: raw.league, raid: raw.raid,
        donations, games, capital: raw.capital,
        warsPoints, leaguePoints, raidPoints, donationsPoints, gamesPoints, capitalPoints,
        warsPercent: Math.round(warsPoints / 200 * 100), leaguePercent: Math.round(leaguePoints / 200 * 100),
        raidPercent: Math.round(raidPoints / 150 * 100), donationsPercent: Math.round(donationsPoints / 150 * 100),
        gamesPercent: Math.round(gamesPoints / 100 * 100), capitalPercent: Math.round(capitalPoints / 200 * 100),
        totalPoints, index, penalties: raw.penalties, active: player.active !== false, position: 0,
      };
    });
    const totals = {
      wars: rows.reduce((sum, row) => sum + row.wars, 0),
      league: rows.reduce((sum, row) => sum + row.league, 0),
      raid: rows.reduce((sum, row) => sum + row.raid, 0),
      donations: rows.reduce((sum, row) => sum + row.donations, 0),
      games: rows.reduce((sum, row) => sum + row.games, 0),
      capital: rows.reduce((sum, row) => sum + row.capital, 0),
    };
    return { monthKey, monthLabel: label(monthKey), months, rows, totals, connected: true };
  } catch (error) {
    return {
      monthKey: fallbackMonth, monthLabel: label(fallbackMonth), months: [fallbackMonth], rows: [],
      totals: { wars: 0, league: 0, raid: 0, donations: 0, games: 0, capital: 0 },
      connected: false, error: error instanceof Error ? error.message : "Falha ao carregar desempenho.",
    };
  }
}
