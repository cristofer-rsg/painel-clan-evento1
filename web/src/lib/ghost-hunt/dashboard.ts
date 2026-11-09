import "server-only";

import { createSupabaseAdmin } from "@/lib/supabase/admin";

type Player = {
  name: string;
  eligible?: string | null;
  whatsapp?: string | null;
  active?: boolean | null;
};

type EventRow = {
  id: number;
  player: string | null;
  category: string | null;
  activity: string | null;
  points: number | null;
  created_at: string;
};

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
  // São Paulo uses UTC-03:00 for the current operating period.
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
    const events = await fetchAllEvents(bounds.start, bounds.end);
    // O painel de novos membros é complementar: sua indisponibilidade não derruba o ranking.
    const recentResult = await supabase.from("clan_member_entries")
      .select("player_name,player_tag,first_seen_at").eq("is_baseline", false)
      .order("first_seen_at", { ascending: false }).limit(3);
    const recentMembers = recentResult.error ? [] : (recentResult.data ?? []) as RecentMember[];
    // O ranking operacional considera somente membros atualmente ativos no clã.
    const players = ((playerData ?? []) as Player[]).filter((player) => player.active !== false);
    const totals = new Map<string, {
      wars: number; league: number; donatedTroops: number;
      games: number; raid: number; capitalCoins: number; penalties: number;
    }>();

    for (const event of events) {
      if (!event.player) continue;
      const bucket = totals.get(event.player) ?? {
        wars: 0, league: 0, donatedTroops: 0, games: 0,
        raid: 0, capitalCoins: 0, penalties: 0,
      };
      const points = Number(event.points ?? 0);
      const category = (event.category ?? "").trim().toLocaleLowerCase("pt-BR");
      const activity = event.activity ?? "";
      if (points < 0) bucket.penalties += Math.abs(points);
      else if (category === "guerras") bucket.wars += points;
      else if (category === "liga dos clãs") bucket.league += points;
      else if (category === "doações" && activity.startsWith("TROPAS_DOADAS:")) bucket.donatedTroops += Math.max(0, points);
      else if (category === "jogos do clã") bucket.games = Math.max(bucket.games, points);
      else if (category === "raide de fim de semana") bucket.raid += points;
      else if (category === "capital do clã") bucket.capitalCoins += points;
      totals.set(event.player, bucket);
    }

    const ranking = players.map((player) => {
      const bucket = totals.get(player.name) ?? {
        wars: 0, league: 0, donatedTroops: 0, games: 0,
        raid: 0, capitalCoins: 0, penalties: 0,
      };
      const donations = Math.min(50, Math.floor(bucket.donatedTroops / 100));
      const games = Math.min(25, bucket.games);
      const eligible = (player.eligible ?? "Elegível") === "Elegível"
        && (player.whatsapp ?? "Sim") === "Sim";
      const total = eligible
        ? Math.max(0, bucket.wars + bucket.league + donations + games + bucket.raid
          + Math.floor(bucket.capitalCoins / 2500) - bucket.penalties)
        : 0;
      return {
        position: 0,
        player: player.name,
        tag: (player as Player & { player_tag?: string | null }).player_tag || "",
        total,
        wars: bucket.wars,
        league: bucket.league,
        donations,
        games,
        raid: bucket.raid,
        capitalCoins: bucket.capitalCoins,
        penalties: bucket.penalties,
        eligible,
        eligibilityStatus: player.eligible ?? "Elegível",
        whatsapp: player.whatsapp ?? "Sim",
      };
    }).sort((a, b) => b.total - a.total || a.player.localeCompare(b.player, "pt-BR"))
      .map((row, index) => ({ ...row, position: index + 1 }));

    return {
      monthKey,
      monthLabel: monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1),
      leaderPoints: ranking[0]?.total ?? 0,
      activePlayers: players.filter((player) => player.active !== false).length,
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
