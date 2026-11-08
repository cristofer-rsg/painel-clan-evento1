import EventsManager from "@/components/events-manager";
export const dynamic = "force-dynamic";
export const metadata = { title: "Editar lançamentos | Ghost Hunt" };
export default function AdminEventsPage() {
  return <main className="admin-shell"><header className="admin-header"><a className="brand" href="/"><span className="brand-mark">GH</span><span className="brand-copy"><strong>GHOST <i>HUNT</i></strong><small>CLAN MANAGEMENT</small></span></a></header><EventsManager /></main>;
}
