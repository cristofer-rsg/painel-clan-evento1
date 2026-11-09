import AdminNavigation from "@/components/admin-navigation";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import PlayersManager from "@/components/players-manager";
import { adminSessionCookie, isAdminSessionValid } from "@/lib/ghost-hunt/session";
export const dynamic = "force-dynamic";
export const metadata = { title: "Gerenciar jogadores | Ghost Hunt" };
export default async function AdminPlayersPage() {
  const store = await cookies();
  if (!(await isAdminSessionValid(store.get(adminSessionCookie.name)?.value))) redirect("/login");
  return <main className="admin-shell"><header className="admin-header"><a className="brand" href="/"><span className="brand-mark">GH</span><span className="brand-copy"><strong>GHOST <i>HUNT</i></strong><small>CLAN MANAGEMENT</small></span></a></header><AdminNavigation current="/admin/players" /><PlayersManager /></main>;
}
