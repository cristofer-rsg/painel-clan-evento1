import "server-only";

import { createSupabaseAdmin } from "@/lib/supabase/admin";

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
  player_tag: string | null;
  category: string | null;
  activity: string | null;
  points: number | null;
  created_at: string;
};

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
      .select("id,player,player_tag,category,activity,points,created_at")
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

    const players = ((playerData ?? []) as Player[]).filter((player) => player.active !== false && (player.whatsapp ?? "Não") === "Sim");
    const excludedLeaderTags = new Set(["#L8GV8C2Y", "#P8CCGYU0", "#QU0GC0VLU", "#9CLLGV8CC"]);
    const competitors = players.filter((player) => !excludedLeaderTags.has((player.player_tag ?? "").trim().toUpperCase()));
    const totals = new Map<string, {
      warsRaw: number; leagueRaw: number; donatedTroops: number;
      gamesRaw: number; raidRaw: number; capitalCoins: number; penalties: number;
    }>();

    for (const event of events) {
      const eventKey = event.player_tag ? event.player_tag.trim().toUpperCase() : `name:${(event.player || "").trim().toLocaleLowerCase("pt-BR")}`;
      if (!eventKey || eventKey === "name:") continue;
      const bucket = totals.get(eventKey) ?? {
        warsRaw: 0, leagueRaw: 0, donatedTroops: 0, gamesRaw: 0,
        raidRaw: 0, capitalCoins: 0, penalties: 0,
      };
      const points = Number(event.points ?? 0);
      const category = (event.category ?? "").trim().toLocaleLowerCase("pt-BR");
      const activity = (event.activity ?? "").trim();
      if (points < 0) {
        if (activity.toLocaleLowerCase("pt-BR").includes("fora do espelho")) bucket.penalties += 50;
      } else if (category === "guerras") bucket.warsRaw += points;
      else if (category === "liga dos clãs") bucket.leagueRaw += points;
      else if (category === "doações" && activity.startsWith("TROPAS_DOADAS:")) bucket.donatedTroops += Math.max(0, points);
      else if (category === "jogos do clã") bucket.gamesRaw = Math.max(bucket.gamesRaw, points);
      else if (category === "raide de fim de semana") bucket.raidRaw += points;
      else if (category === "capital do clã" && activity === "Doação automática de Ouro da Capital") bucket.capitalCoins += points;
      totals.set(eventKey, bucket);
    }

    const ranking = competitors.map((player) => {
      const playerKey = player.player_tag ? player.player_tag.trim().toUpperCase() : `name:${player.name.trim().toLocaleLowerCase("pt-BR")}`;
      const bucket = totals.get(playerKey) ?? {
        warsRaw: 0, leagueRaw: 0, donatedTroops: 0, gamesRaw: 0,
        raidRaw: 0, capitalCoins: 0, penalties: 0,
      };
      const wars = score(bucket.warsRaw, WEIGHTS.wars.target, WEIGHTS.wars.max);
      const league = score(bucket.leagueRaw, WEIGHTS.league.target, WEIGHTS.league.max);
      const donations = score(bucket.donatedTroops, WEIGHTS.donations.target, WEIGHTS.donations.max);
      const gamesRaw = Math.max(bucket.gamesRaw, gamesByTag.get((player.player_tag ?? "").trim().toUpperCase()) ?? 0, gamesByName.get(player.name.trim().toLocaleLowerCase("pt-BR")) ?? 0);
      const games = score(gamesRaw, WEIGHTS.games.target, WEIGHTS.games.max);
      const raid = score(bucket.raidRaw, WEIGHTS.raid.target, WEIGHTS.raid.max);
      const capitalPoints = score(bucket.capitalCoins, WEIGHTS.capital.target, WEIGHTS.capital.max);
      const totalBeforePenalty = wars + league + donations + games + raid + capitalPoints;
      const total = Math.max(0, totalBeforePenalty - bucket.penalties);
      return {
        position: 0,
        player: player.name,
        tag: player.player_tag || "",
        total,
        wars,
        league,
        donations,
        games,
        raid,
        capitalCoins: bucket.capitalCoins,
        capitalPoints,
        penalties: bucket.penalties,
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
