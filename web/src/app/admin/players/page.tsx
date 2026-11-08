import PlayersManager from "@/components/players-manager";
export const dynamic = "force-dynamic";
export const metadata = { title: "Gerenciar jogadores | Ghost Hunt" };
export default function AdminPlayersPage() {
  return <main className="admin-shell"><header className="admin-header"><a className="brand" href="/"><span className="brand-mark">GH</span><span className="brand-copy"><strong>GHOST <i>HUNT</i></strong><small>CLAN MANAGEMENT</small></span></a></header><PlayersManager /></main>;
}
