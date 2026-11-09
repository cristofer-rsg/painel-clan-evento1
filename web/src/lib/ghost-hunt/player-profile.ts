import "server-only";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

type PlayerRow = {
  name: string;
  player_tag: string;
  eligible: string | null;
  whatsapp: string | null;
  active: boolean | null;
};
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
  const monthKey = currentMonth();
  const bounds = monthBounds(monthKey);
  const [monthResult, recentResult] = await Promise.all([
    db.from("events").select("id,player,category,activity,points,created_at")
      .eq("player", player.name).gte("created_at", bounds.start).lt("created_at", bounds.end)
      .order("created_at", { ascending: false }),
    db.from("events").select("id,player,category,activity,points,created_at")
      .eq("player", player.name).order("created_at", { ascending: false }).limit(30),
  ]);
  if (monthResult.error || recentResult.error) throw new Error("Não foi possível carregar o histórico de pontuação.");
  const events = (monthResult.data || []) as EventRow[];
  const recentEvents = (recentResult.data || []) as EventRow[];
  let wars = 0, league = 0, donatedTroops = 0, games = 0, raid = 0, capitalCoins = 0, penalties = 0;
  for (const event of events) {
    const points = Number(event.points || 0);
    const category = (event.category || "").trim().toLocaleLowerCase("pt-BR");
    const activity = event.activity || "";
    if (points < 0) penalties += Math.abs(points);
    else if (category === "guerras") wars += points;
    else if (category === "liga dos clãs") league += points;
    else if (category === "doações" && activity.startsWith("TROPAS_DOADAS:")) donatedTroops += Math.max(0, points);
    else if (category === "jogos do clã") games = Math.max(games, points);
    else if (category === "raide de fim de semana") raid += points;
    else if (category === "capital do clã") capitalCoins += points;
  }
  const donations = Math.min(50, Math.floor(donatedTroops / 100));
  games = Math.min(25, games);
  const eligible = (player.eligible || "Elegível") === "Elegível" && (player.whatsapp || "Sim") === "Sim";
  const total = eligible ? Math.max(0, wars + league + donations + games + raid + Math.floor(capitalCoins / 2500) - penalties) : 0;
  const monthLabel = new Intl.DateTimeFormat("pt-BR", {
    month: "long", year: "numeric", timeZone: "America/Sao_Paulo",
  }).format(new Date(monthKey + "-15T12:00:00-03:00"));
  return {
    name: player.name, tag: player.player_tag, eligible, eligibilityLabel: eligible ? "Elegível" : "Não elegível",
    monthKey, monthLabel: monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1),
    total, wars, league, donations, games, raid, capitalCoins, penalties, recentEvents,
  };
}
