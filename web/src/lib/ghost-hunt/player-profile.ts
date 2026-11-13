import "server-only";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { calculatePlayerScore, isRankingEligible } from "@/lib/ghost-hunt/scoring";

type PlayerRow = {
  name: string;
  player_tag: string;
  eligible: string | null;
  whatsapp: string | null;
  active: boolean | null;
};
type MonthlyStat = { player_tag: string | null; player: string | null; clan_games_points: number | null };
type EventRow = {
  id: number;
  player: string | null;
  category: string | null;
  activity: string | null;
  points: number | null;
  created_at: string;
};
export type PlayerProfile = {
  name: string;
  tag: string;
  eligible: boolean;
  eligibilityLabel: string;
  monthKey: string;
  monthLabel: string;
  total: number;
  wars: number;
  league: number;
  donations: number;
  games: number;
  raid: number;
  capitalCoins: number;
  penalties: number;
  recentEvents: EventRow[];
};

function currentMonth() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit",
  }).formatToParts(new Date());
  return (parts.find(p => p.type === "year")?.value || "2026") + "-" +
    (parts.find(p => p.type === "month")?.value || "01");
}
function monthBounds(key: string) {
  const [year, month] = key.split("-").map(Number);
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return {
    start: new Date(key + "-01T00:00:00-03:00").toISOString(),
    end: new Date(nextYear + "-" + String(nextMonth).padStart(2, "0") + "-01T00:00:00-03:00").toISOString(),
  };
}

export async function getPlayerProfile(tag: string): Promise<PlayerProfile | null> {
  const db = createSupabaseAdmin();
  const { data: playerData, error: playerError } = await db.from("players")
    .select("name,player_tag,eligible,whatsapp,active")
    .eq("player_tag", tag).maybeSingle();
  if (playerError) throw new Error("Não foi possível consultar o jogador.");
  if (!playerData) return null;
  const player = playerData as PlayerRow;
  if (player.active === false) return null;
  const monthKey = currentMonth();
  const bounds = monthBounds(monthKey);
  const [recentResult, events, monthlyStatsResult] = await Promise.all([
    db.from("events").select("id,player,category,activity,points,created_at")
      .eq("player", player.name).order("created_at", { ascending: false }).limit(30),
    (async () => {
      const rows: EventRow[] = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await db.from("events")
          .select("id,player,category,activity,points,created_at")
          .eq("player", player.name).gte("created_at", bounds.start).lt("created_at", bounds.end)
          .order("created_at", { ascending: false }).range(offset, offset + 999);
        if (error) throw error;
        const page = (data || []) as EventRow[];
        rows.push(...page);
        if (page.length < 1000) break;
      }
      return rows;
    })(),
    db.from("player_monthly_stats").select("player_tag,player,clan_games_points")
      .eq("month_key", monthKey),
  ]);
  if (recentResult.error) throw new Error("Não foi possível carregar o histórico de pontuação.");
  if (monthlyStatsResult.error) throw new Error("Não foi possível carregar as estatísticas mensais.");
  const recentEvents = (recentResult.data || []) as EventRow[];
  const matchingStat = ((monthlyStatsResult.data || []) as MonthlyStat[]).find((row) =>
    (row.player_tag || "").trim().toUpperCase() === player.player_tag.trim().toUpperCase()
    || (row.player || "").trim().toLocaleLowerCase("pt-BR") === player.name.trim().toLocaleLowerCase("pt-BR")
  );
  const eligible = isRankingEligible(player);
  const scoring = calculatePlayerScore({
    playerName: player.name,
    events,
    clanGamesPoints: matchingStat?.clan_games_points ?? 0,
  });
  const { wars, league, donations, games, raid, capitalCoins, penalties } = scoring;
  const total = eligible ? scoring.total : 0;
  const monthLabel = new Intl.DateTimeFormat("pt-BR", {
    month: "long", year: "numeric", timeZone: "America/Sao_Paulo",
  }).format(new Date(monthKey + "-15T12:00:00-03:00"));
  return {
    name: player.name, tag: player.player_tag, eligible, eligibilityLabel: eligible ? "Elegível" : "Não elegível",
    monthKey, monthLabel: monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1),
    total, wars, league, donations, games, raid, capitalCoins, penalties, recentEvents,
  };
}
