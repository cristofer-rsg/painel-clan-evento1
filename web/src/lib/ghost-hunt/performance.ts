import "server-only";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

type Player = { name: string; player_tag: string | null; active: boolean | null };
type Stats = { player_tag: string | null; player: string | null; war_attacks: number | null; league_attacks: number | null; raid_attacks: number | null; donations: number | null; clan_games_points: number | null };

export type PerformanceRow = {
  position: number; player: string; tag: string; wars: number; league: number;
  raid: number; donations: number; games: number; capital: number; index: number; active: boolean;
};
export type PerformanceData = {
  monthKey: string; monthLabel: string; rows: PerformanceRow[];
  totals: { wars: number; league: number; raid: number; donations: number; games: number; capital: number };
  connected: boolean; error?: string;
};

function currentMonth() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).formatToParts(new Date());
  return (parts.find(p => p.type === "year")?.value || "2026") + "-" + (parts.find(p => p.type === "month")?.value || "01");
}
function bounds(key: string) {
  const [year, month] = key.split("-").map(Number);
  const start = new Date(key + "-01T00:00:00-03:00");
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const end = new Date(nextYear + "-" + String(nextMonth).padStart(2, "0") + "-01T00:00:00-03:00");
  return { start: start.toISOString(), end: end.toISOString() };
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

export async function getPerformanceData(): Promise<PerformanceData> {
  const monthKey = currentMonth();
  const monthLabel = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "America/Sao_Paulo" })
    .format(new Date(monthKey + "-15T12:00:00-03:00"));
  try {
    const db = createSupabaseAdmin();
    const [playersResult, statsResult] = await Promise.all([
      db.from("players").select("name,player_tag,active").order("name", { ascending: true }),
      allRows<Stats>(db.from("player_monthly_stats").select("player_tag,player,war_attacks,league_attacks,raid_attacks,donations,clan_games_points").eq("month_key", monthKey)),
    ]);
    if (playersResult.error) throw playersResult.error;
    const range = bounds(monthKey);
    const capitalEvents = await allRows<{ player: string; points: number | null }>(
      db.from("events").select("player,points").eq("category", "Capital do Clã").gte("created_at", range.start).lt("created_at", range.end)
    );
    const capital = new Map<string, number>();
    for (const event of capitalEvents) {
      const key = (event.player || "").trim().toLocaleLowerCase("pt-BR");
      if (key) capital.set(key, (capital.get(key) || 0) + Number(event.points || 0));
    }
    const byTag = new Map(statsResult.filter(s => s.player_tag).map(s => [String(s.player_tag).toUpperCase(), s]));
    const byName = new Map(statsResult.filter(s => s.player).map(s => [String(s.player).trim().toLocaleLowerCase("pt-BR"), s]));
    const raw = (playersResult.data || []).map((player: Player) => {
      const stat = (player.player_tag ? byTag.get(player.player_tag.toUpperCase()) : undefined)
        || byName.get(player.name.trim().toLocaleLowerCase("pt-BR"));
      return {
        player: player.name, tag: player.player_tag || "",
        wars: Number(stat?.war_attacks || 0), league: Number(stat?.league_attacks || 0),
        raid: Number(stat?.raid_attacks || 0), donations: Number(stat?.donations || 0),
        games: Number(stat?.clan_games_points || 0),
        capital: capital.get(player.name.trim().toLocaleLowerCase("pt-BR")) || 0,
        active: player.active !== false,
      };
    });
    const metrics = ["wars", "league", "raid", "donations", "games", "capital"] as const;
    const maxima = Object.fromEntries(metrics.map(key => [key, raw.reduce((max, row) => Math.max(max, row[key]), 0)])) as Record<typeof metrics[number], number>;
    const rows = raw.map(row => ({
      ...row,
      index: Math.min(600, metrics.reduce((sum, key) => sum + (maxima[key] > 0 ? row[key] / maxima[key] * 100 : 0), 0)),
      position: 0,
    })).sort((a, b) => b.index - a.index || b.wars - a.wars || b.league - a.league || b.raid - a.raid || b.donations - a.donations || b.games - a.games || b.capital - a.capital || a.player.localeCompare(b.player, "pt-BR"))
      .map((row, i) => ({ ...row, position: i + 1, index: Math.round(row.index * 10) / 10 }));
    const totals = {
      wars: raw.reduce((sum, row) => sum + row.wars, 0),
      league: raw.reduce((sum, row) => sum + row.league, 0),
      raid: raw.reduce((sum, row) => sum + row.raid, 0),
      donations: raw.reduce((sum, row) => sum + row.donations, 0),
      games: raw.reduce((sum, row) => sum + row.games, 0),
      capital: raw.reduce((sum, row) => sum + row.capital, 0),
    };
    return { monthKey, monthLabel: monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1), rows, totals, connected: true };
  } catch (error) {
    return {
      monthKey, monthLabel: monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1),
      rows: [], totals: { wars: 0, league: 0, raid: 0, donations: 0, games: 0, capital: 0 },
      connected: false, error: error instanceof Error ? error.message : "Falha ao carregar desempenho.",
    };
  }
}
