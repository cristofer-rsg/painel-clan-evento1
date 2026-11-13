import "server-only";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { calculatePlayerScore } from "@/lib/ghost-hunt/scoring";

type Player = { name: string; player_tag: string | null; active: boolean | null };
type Stats = { month_key: string; player_tag: string | null; player: string | null; war_attacks: number | null; donations: number | null; clan_games_points: number | null };
type ActivitySource = { source_key: string; player_tag: string | null; war_attacks: number | null; league_attacks: number | null; raid_attacks: number | null; updated_at: string | null };
type EventRow = { player: string | null; category: string | null; activity: string | null; points: number | null };
export type PerformanceRow = {
  position: number; player: string; tag: string;
  wars: number; league: number; raid: number; donations: number; games: number; capital: number;
  warsPoints: number; leaguePoints: number; raidPoints: number; donationsPoints: number; gamesPoints: number; capitalPoints: number;
  warsPercent: number; leaguePercent: number; raidPercent: number; donationsPercent: number; gamesPercent: number; capitalPercent: number;
  totalPoints: number; index: number; penalties: number; active: boolean;
  lastWarAttacks: number; lastLeagueAttacks: number; lastRaidAttacks: number;
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
    const [playersResult, allStats, activitySources] = await Promise.all([
      db.from("players").select("name,player_tag,active").order("name", { ascending: true }),
      allRows<Stats>(db.from("player_monthly_stats").select("month_key,player_tag,player,war_attacks,donations,clan_games_points").order("month_key", { ascending: false })),
      allRows<ActivitySource>(db.from("player_monthly_stat_sources").select("source_key,player_tag,war_attacks,league_attacks,raid_attacks,updated_at").order("updated_at", { ascending: false })),
    ]);
    if (playersResult.error) throw playersResult.error;
    const months = Array.from(new Set([fallbackMonth, ...allStats.map(row => row.month_key).filter(Boolean)])).sort().reverse();
    const monthKey = requestedMonth && /^\d{4}-(0[1-9]|1[0-2])$/.test(requestedMonth) && months.includes(requestedMonth)
      ? requestedMonth : fallbackMonth;
    const stats = allStats.filter(row => row.month_key === monthKey);
    // Fontes individuais mais recentes; bônus mensal da Liga não é batalha.
    const latestWarKey = activitySources.map(row => row.source_key.match(/^war:(#[^:]+:\d{8}T\d{6}\.\d+Z):/)?.[1] || "").sort().at(-1) || "";
    const latestLeagueKey = activitySources.map(row => row.source_key.match(/^league:(\d{8}T\d{6}\.\d+Z):/)?.[1] || "").sort().at(-1) || "";
    const raidRows = activitySources.filter(row => /^raid:\d{4}-\d{2}-\d{2}:/.test(row.source_key));
    const latestRaidSync = raidRows.reduce((latest, row) => row.updated_at && row.updated_at > latest ? row.updated_at : latest, "");
    const latestRaidAnchor = raidRows.find(row => row.updated_at === latestRaidSync)?.source_key.match(/^raid:(\d{4}-\d{2}-\d{2}):/)?.[1] || "";
    const lastActivityByTag = new Map<string, { war: number; league: number; raid: number }>();
    for (const source of activitySources) {
      const tag = (source.player_tag || "").trim().toUpperCase();
      if (!tag) continue;
      const current = lastActivityByTag.get(tag) || { war: 0, league: 0, raid: 0 };
      if (latestWarKey && source.source_key.startsWith("war:" + latestWarKey + ":")) current.war = Number(source.war_attacks || 0);
      if (latestLeagueKey && source.source_key.startsWith("league:" + latestLeagueKey + ":")) current.league = Number(source.league_attacks || 0);
      if (latestRaidAnchor && source.source_key.startsWith("raid:" + latestRaidAnchor + ":")) current.raid = Number(source.raid_attacks || 0);
      lastActivityByTag.set(tag, current);
    }
    const start = new Date(monthKey + "-01T00:00:00-03:00");
    const [year, month] = monthKey.split("-").map(Number);
    const end = new Date((month === 12 ? year + 1 : year) + "-" + String(month === 12 ? 1 : month + 1).padStart(2, "0") + "-01T00:00:00-03:00");
    const events = await allRows<EventRow>(db.from("events").select("player,category,activity,points")
      .gte("created_at", start.toISOString()).lt("created_at", end.toISOString()));
    const byTag = new Map(stats.filter(row => row.player_tag).map(row => [String(row.player_tag).trim().toUpperCase(), row]));
    const byName = new Map(stats.filter(row => row.player).map(row => [String(row.player).trim().toLocaleLowerCase("pt-BR"), row]));
    const rawByPlayer = new Map<string, { wars: number; warAttacks: number; league: number; leagueAttacks: number; raid: number; raidAttacks: number; donationsEvents: number; gamesEvents: number; capital: number; penalties: number }>();
    for (const event of events) {
      const key = (event.player || "").trim().toLocaleLowerCase("pt-BR");
      if (!key) continue;
      const bucket = rawByPlayer.get(key) ?? { wars: 0, warAttacks: 0, league: 0, leagueAttacks: 0, raid: 0, raidAttacks: 0, donationsEvents: 0, gamesEvents: 0, capital: 0, penalties: 0 };
      const points = Number(event.points || 0);
      const category = (event.category || "").trim().toLocaleLowerCase("pt-BR");
      const activity = (event.activity || "").trim();
      if (points < 0) {
        bucket.penalties += Math.abs(points);
      } else if (category === "guerras") {
        bucket.wars += points;
        if (/^Fez [1-3] estrela/i.test(activity)) bucket.warAttacks += 1;
        else if (activity === "Fez os dois ataques (+10)") bucket.warAttacks = Math.max(bucket.warAttacks, 2);
      }
      else if (category === "liga dos clãs") {
        bucket.league += points;
        if (activity.startsWith("Realizou ataque ")) bucket.leagueAttacks += 1;
      }
      else if (category === "raide de fim de semana") {
        bucket.raid += points;
        const attackMatch = activity.match(/(\d+)\s+ataque/i);
        if (attackMatch) bucket.raidAttacks += Number(attackMatch[1]);
      }
      else if (category === "doações" && activity.startsWith("TROPAS_DOADAS:")) bucket.donationsEvents += Math.max(0, points);
      else if (category === "jogos do clã") bucket.gamesEvents = Math.max(bucket.gamesEvents, points);
      else if (category === "capital do clã" && activity === "Doação automática de Ouro da Capital") bucket.capital += Math.max(0, points);
      rawByPlayer.set(key, bucket);
    }
    const players = playersResult.data || [];
    const rows = players.map((player: Player) => {
      const key = player.name.trim().toLocaleLowerCase("pt-BR");
      const statByTag = player.player_tag ? byTag.get(player.player_tag.trim().toUpperCase()) : undefined;
      const statByName = byName.get(key);
      const stat = statByTag || statByName;
      const raw = rawByPlayer.get(key) ?? { wars: 0, warAttacks: 0, league: 0, leagueAttacks: 0, raid: 0, raidAttacks: 0, donationsEvents: 0, gamesEvents: 0, capital: 0, penalties: 0 };
      const recordedDonations = Number(stat?.donations || 0);
      const donations = useManualDonationFallback && recordedDonations <= 0 ? raw.donationsEvents : recordedDonations;
      const games = Math.max(Number(statByTag?.clan_games_points || 0), Number(statByName?.clan_games_points || 0), raw.gamesEvents);
      const scoring = calculatePlayerScore({
        playerName: player.name,
        events,
        clanGamesPoints: games,
      });
      const warsPoints = scoring.wars;
      const leaguePoints = scoring.league;
      const raidPoints = scoring.raid;
      const donationsPoints = scoring.donations;
      const gamesPoints = scoring.games;
      const capitalPoints = scoring.capitalPoints;
      const totalPoints = scoring.total;
      const index = Math.round(totalPoints / 10);
      const latestActivity = player.player_tag ? lastActivityByTag.get(player.player_tag.trim().toUpperCase()) : undefined;
      return {
        player: player.name, tag: player.player_tag || "", lastWarAttacks: latestActivity?.war || 0, lastLeagueAttacks: latestActivity?.league || 0, lastRaidAttacks: latestActivity?.raid || 0, wars: stat?.war_attacks == null ? raw.warAttacks : Number(stat.war_attacks), league: raw.leagueAttacks, raid: raw.raidAttacks,
        donations, games, capital: raw.capital,
        warsPoints, leaguePoints, raidPoints, donationsPoints, gamesPoints, capitalPoints,
        warsPercent: Math.round(warsPoints / 200 * 100), leaguePercent: Math.round(leaguePoints / 200 * 100),
        raidPercent: Math.round(raidPoints / 150 * 100), donationsPercent: Math.round(donationsPoints / 150 * 100),
        gamesPercent: Math.round(gamesPoints / 100 * 100), capitalPercent: Math.round(capitalPoints / 200 * 100),
        totalPoints, index, penalties: scoring.penalties, active: player.active !== false, position: 0,
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
