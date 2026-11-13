import "server-only";

import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { calculatePlayerScore, isRankingEligible } from "@/lib/ghost-hunt/scoring";

type Player = {
  name: string;
  player_tag?: string | null;
  whatsapp?: string | null;
  active?: boolean | null;
};

type MonthlyStat = { month_key: string; player_tag: string | null; player: string | null; clan_games_points: number | null };

type EventRow = {
  id: number;
  player: string | null;
  category: string | null;
  activity: string | null;
  points: number | null;
  created_at: string;
};


export type RankingPenaltyDetail = { category: string; description: string; points: number };

export type RankingRow = {
  position: number;
  player: string;
  tag: string;
  total: number;
  wars: number;
  league: number;
  donations: number;
  games: number;
  raid: number;
  capitalCoins: number;
  capitalPoints: number;
  penalties: number;
  penaltyDetails: RankingPenaltyDetail[];
  eligible: boolean;
  eligibilityStatus: string;
  whatsapp: string;
};

export type RecentMember = { player_name: string; player_tag: string | null; first_seen_at: string };

export type DashboardData = {
  monthKey: string;
  monthLabel: string;
  leaderPoints: number;
  activePlayers: number;
  warRecords: number;
  eventCount: number;
  ranking: RankingRow[];
  recentMembers: RecentMember[];
  connected: boolean;
  error?: string;
};

function getSaoPauloMonth() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value ?? "2026";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  return `${year}-${month}`;
}

function monthBounds(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  const start = new Date(`${monthKey}-01T00:00:00-03:00`);
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const end = new Date(`${nextYear}-${String(nextMonth).padStart(2, "0")}-01T00:00:00-03:00`);
  return { start: start.toISOString(), end: end.toISOString() };
}

async function fetchAllEvents(start: string, end: string): Promise<EventRow[]> {
  const supabase = createSupabaseAdmin();
  const pageSize = 1000;
  const rows: EventRow[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from("events")
      .select("id,player,category,activity,points,created_at")
      .gte("created_at", start)
      .lt("created_at", end)
      .order("created_at", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(`Falha ao consultar lançamentos: ${error.message}`);
    const page = (data ?? []) as EventRow[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

export async function getDashboardData(): Promise<DashboardData> {
  const monthKey = getSaoPauloMonth();
  const monthLabel = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(`${monthKey}-15T12:00:00-03:00`));

  try {
    const supabase = createSupabaseAdmin();
    const { data: playerData, error: playerError } = await supabase
      .from("players")
      .select("name,player_tag,eligible,whatsapp,active")
      .order("name", { ascending: true });
    if (playerError) throw new Error(`Falha ao consultar jogadores: ${playerError.message}`);

    const bounds = monthBounds(monthKey);
    const [events, gamesStatsResult] = await Promise.all([
      fetchAllEvents(bounds.start, bounds.end),
      supabase.from("player_monthly_stats").select("month_key,player_tag,player,clan_games_points").eq("month_key", monthKey),
    ]);
    if (gamesStatsResult.error) throw new Error(`Falha ao consultar pontuação dos Jogos do Clã: ${gamesStatsResult.error.message}`);
    const gamesByTag = new Map((gamesStatsResult.data ?? []).filter((row: MonthlyStat) => row.player_tag).map((row: MonthlyStat) => [String(row.player_tag).trim().toUpperCase(), Number(row.clan_games_points || 0)]));
    const gamesByName = new Map((gamesStatsResult.data ?? []).filter((row: MonthlyStat) => row.player).map((row: MonthlyStat) => [String(row.player).trim().toLocaleLowerCase("pt-BR"), Number(row.clan_games_points || 0)]));
    const recentResult = await supabase.from("clan_member_entry_history")
      .select("player_name,player_tag,entered_at").eq("is_baseline", false)
      .order("entered_at", { ascending: false }).limit(3);
    const recentMembers = recentResult.error ? [] : (recentResult.data ?? []).map((row) => ({ player_name: row.player_name, player_tag: row.player_tag, first_seen_at: row.entered_at })) as RecentMember[];

    const players = (playerData ?? []) as (Player & { eligible?: string | null })[];
    const competitors = players.filter((player) => isRankingEligible(player));
    const ranking = competitors.map((player) => {
      const gamesRaw = Math.max(
        gamesByTag.get((player.player_tag ?? "").trim().toUpperCase()) ?? 0,
        gamesByName.get(player.name.trim().toLocaleLowerCase("pt-BR")) ?? 0,
      );
      const calculated = calculatePlayerScore({
        playerName: player.name,
        events,
        clanGamesPoints: gamesRaw,
      });
      return {
        position: 0,
        player: player.name,
        tag: player.player_tag || "",
        total: calculated.total,
        wars: calculated.wars,
        league: calculated.league,
        donations: calculated.donations,
        games: calculated.games,
        raid: calculated.raid,
        capitalCoins: calculated.capitalCoins,
        capitalPoints: calculated.capitalPoints,
        penalties: calculated.penalties,
        penaltyDetails: events
          .filter((event) => (event.player ?? "").trim().toLocaleLowerCase("pt-BR") === player.name.trim().toLocaleLowerCase("pt-BR")
            && Number(event.points ?? 0) < 0)
          .map((event) => ({
            category: event.category?.trim() || "Outros",
            description: (event.activity ?? "Motivo não informado")
              .trim()
              .replace(/^Penalidade:\\s*/i, "")
              .replace(/\\s*\\([−-]\\s*\\d+\\)\\s*$/, "") || "Motivo não informado",
            points: Math.abs(Number(event.points ?? 0)),
          })),
        eligible: true,
        eligibilityStatus: "Elegível",
        whatsapp: player.whatsapp ?? "Sim",
      };
    }).sort((a, b) => b.total - a.total || b.wars - a.wars || b.league - a.league || b.raid - a.raid || b.capitalPoints - a.capitalPoints || b.donations - a.donations || b.games - a.games || a.player.localeCompare(b.player, "pt-BR"))
      .map((row, index) => ({ ...row, position: index + 1 }));

    return {
      monthKey,
      monthLabel: monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1),
      leaderPoints: ranking[0]?.total ?? 0,
      activePlayers: ((playerData ?? []) as Player[]).filter((player) => player.active !== false).length,
      warRecords: events.filter((event) => (event.category ?? "").trim().toLocaleLowerCase("pt-BR") === "guerras").length,
      eventCount: events.length,
      ranking,
      recentMembers,
      connected: true,
    };
  } catch (error) {
    return {
      monthKey,
      monthLabel: monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1),
      leaderPoints: 0,
      activePlayers: 0,
      warRecords: 0,
      eventCount: 0,
      ranking: [],
      recentMembers: [],
      connected: false,
      error: error instanceof Error ? error.message : "Não foi possível carregar os dados.",
    };
  }
}
