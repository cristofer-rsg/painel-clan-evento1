import "server-only";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

type Player = { name: string; player_tag: string | null; active: boolean | null };
type Stats = { month_key: string; player_tag: string | null; player: string | null; war_attacks: number | null; league_attacks: number | null; raid_attacks: number | null; donations: number | null; clan_games_points: number | null };
type EventRow = { player: string | null; category: string | null; activity: string | null; points: number | null };
export type PerformanceRow = {
  position: number; player: string; tag: string; wars: number; league: number;
  raid: number; donations: number; games: number; capital: number; index: number; active: boolean;
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
      allRows<Stats>(db.from("player_monthly_stats").select("month_key,player_tag,player,war_attacks,league_attacks,raid_attacks,donations,clan_games_points").order("month_key", { ascending: false })),
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
    const capital = new Map<string, number>();
    const manualDonations = new Map<string, number>();
    for (const event of events) {
      const key = (event.player || "").trim().toLocaleLowerCase("pt-BR");
      if (!key) continue;
      if ((event.category || "").trim() === "Capital do Clã") capital.set(key, (capital.get(key) || 0) + Number(event.points || 0));
      if (useManualDonationFallback && (event.category || "").trim() === "Doações" && (event.activity || "").startsWith("TROPAS_DOADAS:")) {
        manualDonations.set(key, (manualDonations.get(key) || 0) + Math.max(0, Number(event.points || 0)));
      }
    }
    const byTag = new Map(stats.filter(row => row.player_tag).map(row => [String(row.player_tag).trim().toUpperCase(), row]));
    const byName = new Map(stats.filter(row => row.player).map(row => [String(row.player).trim().toLocaleLowerCase("pt-BR"), row]));
    const players = playersResult.data || [];
    const rows = players.map((player: Player) => {
      const stat = (player.player_tag ? byTag.get(player.player_tag.trim().toUpperCase()) : undefined)
        || byName.get(player.name.trim().toLocaleLowerCase("pt-BR"));
      // O desempenho administrativo usa apenas player_monthly_stats.donations.
      // A consulta pública original usa os lançamentos manuais como fallback quando o valor automático é zero.
      const recordedDonations = Number(stat?.donations || 0);
      const donations = useManualDonationFallback && recordedDonations <= 0
        ? (manualDonations.get(player.name.trim().toLocaleLowerCase("pt-BR")) || 0)
        : recordedDonations;
      const wars = Number(stat?.war_attacks || 0);
      const league = Number(stat?.league_attacks || 0);
      const raid = Number(stat?.raid_attacks || 0);
      const games = Number(stat?.clan_games_points || 0);
      const capitalValue = capital.get(player.name.trim().toLocaleLowerCase("pt-BR")) || 0;
      // O índice é calculado na apresentação: consulta pública usa metas fixas (0–100);
      // administração usa máximos dinâmicos por categoria (0–600).
      return {
        player: player.name, tag: player.player_tag || "", wars, league, raid, donations, games,
        capital: capitalValue, active: player.active !== false, index: 0, position: 0,
      };
    });
    // O resumo original soma todos os jogadores cadastrados, mesmo quando
    // a lista do ranking está filtrada para exibir apenas os ativos.
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
