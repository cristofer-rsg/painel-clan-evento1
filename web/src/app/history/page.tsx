import { redirect } from "next/navigation";
export default function PublicHistoryRedirect() {
  redirect("/admin/history");
}
