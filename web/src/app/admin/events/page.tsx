import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import EventsManager from "@/components/events-manager";
import { adminSessionCookie, isAdminSessionValid } from "@/lib/ghost-hunt/session";
export const dynamic = "force-dynamic";
export const metadata = { title: "Editar lançamentos | Ghost Hunt" };
export default async function AdminEventsPage() {
  const store = await cookies();
  if (!(await isAdminSessionValid(store.get(adminSessionCookie.name)?.value))) redirect("/login");
  return <main className="admin-shell"><header className="admin-header"><a className="brand" href="/"><span className="brand-mark">GH</span><span className="brand-copy"><strong>GHOST <i>HUNT</i></strong><small>CLAN MANAGEMENT</small></span></a></header><EventsManager /></main>;
}
