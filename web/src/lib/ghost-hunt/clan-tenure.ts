import "server-only";

import { createSupabaseAdmin } from "@/lib/supabase/admin";

type MembershipPeriod = {
  player_tag: string;
  player_name: string;
  joined_at: string;
  left_at: string | null;
  entry_source: string;
  exit_source: string | null;
};

export type ClanTenurePlayer = {
  tag: string;
  name: string;
  totalMilliseconds: number;
  firstJoinedAt: string;
  latestJoinedAt: string;
  latestLeftAt: string | null;
  active: boolean;
  periods: MembershipPeriod[];
};

export type ClanTenureData = {
  players: ClanTenurePlayer[];
  activeCount: number;
  connected: boolean;
  trackedFrom: string | null;
  error?: string;
};

export async function getClanTenureData(): Promise<ClanTenureData> {
  try {
    const { data, error } = await createSupabaseAdmin()
      .from("clan_membership_periods")
      .select("player_tag,player_name,joined_at,left_at,entry_source,exit_source")
      .order("joined_at", { ascending: true });
    if (error) throw error;

    const now = Date.now();
    const grouped = new Map<string, MembershipPeriod[]>();
    for (const raw of (data ?? []) as MembershipPeriod[]) {
      const tag = raw.player_tag.trim().toUpperCase();
      const rows = grouped.get(tag) ?? [];
      rows.push(raw);
      grouped.set(tag, rows);
    }

    const players = Array.from(grouped.entries()).map(([tag, periods]) => {
      periods.sort((a, b) => new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime());
      const totalMilliseconds = periods.reduce((sum, period) => {
        const start = new Date(period.joined_at).getTime();
        const end = period.left_at ? new Date(period.left_at).getTime() : now;
        return sum + Math.max(0, end - start);
      }, 0);
      const latest = periods[periods.length - 1];
      const exits = periods.filter(period => period.left_at).map(period => period.left_at as string);
      return {
        tag,
        name: latest.player_name,
        totalMilliseconds,
        firstJoinedAt: periods[0].joined_at,
        latestJoinedAt: latest.joined_at,
        latestLeftAt: exits.length ? exits.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] : null,
        active: latest.left_at === null,
        periods,
      };
    }).sort((a, b) =>
      Number(b.active) - Number(a.active) ||
      b.totalMilliseconds - a.totalMilliseconds ||
      a.name.localeCompare(b.name, "pt-BR")
    );

    return {
      players,
      activeCount: players.filter(player => player.active).length,
      connected: true,
      trackedFrom: players.length ? players.reduce((earliest, player) => player.firstJoinedAt < earliest ? player.firstJoinedAt : earliest, players[0].firstJoinedAt) : null,
    };
  } catch (error) {
    return { players: [], activeCount: 0, connected: false, trackedFrom: null, error: error instanceof Error ? error.message : "Falha ao consultar o tempo de clã." };
  }
}
