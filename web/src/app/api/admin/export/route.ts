import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { adminSessionCookie, isAdminSessionValid } from "@/lib/ghost-hunt/session";
import { getDashboardData } from "@/lib/ghost-hunt/dashboard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return '"' + text.replace(/"/g, '""') + '"';
}
async function fetchAllEvents() {
  const rows: Array<Record<string, unknown>> = [];
  const db = createSupabaseAdmin();
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.from("events").select("id,player,category,activity,points,created_at")
      .order("created_at", { ascending: true }).range(offset, offset + 999);
    if (error) throw error;
    const page = data ?? [];
    rows.push(...page);
    if (page.length < 1000) break;
  }
  return rows;
}

export async function GET(request: NextRequest) {
  const token = request.cookies.get(adminSessionCookie.name)?.value;
  if (!(await isAdminSessionValid(token))) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const format = request.nextUrl.searchParams.get("format") || "xlsx";
  if (!["csv", "xlsx"].includes(format)) return NextResponse.json({ error: "Formato inválido." }, { status: 400 });
  try {
    const dashboard = await getDashboardData();
    if (!dashboard.connected) return NextResponse.json({ error: "Não foi possível consultar o ranking no Supabase." }, { status: 503 });
    const events = await fetchAllEvents();
    if (format === "csv") {
      const headers = ["Posição", "Jogador", "Elegibilidade", "WhatsApp", "Guerras", "Liga", "Doações", "Jogos", "Raide", "Capital do Clã", "Penalidades", "Total"];
      const rows = dashboard.ranking.map(row => [row.position, row.player, row.eligibilityStatus, row.whatsapp, row.wars, row.league, row.donations, row.games, row.raid, row.capitalCoins, row.penalties, row.total]);
      const csv = "\uFEFF" + [headers, ...rows].map(row => row.map(csvCell).join(";")).join("\r\n");
      return new NextResponse(csv, { headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="Ghost_Hunt_Ranking_' + dashboard.monthKey + '.csv"',
        "Cache-Control": "no-store",
      }});
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Ghost Hunt";
    workbook.created = new Date();
    const rankingSheet = workbook.addWorksheet("Ranking do mês");
    rankingSheet.columns = [
      { header: "Posição", key: "position", width: 10 }, { header: "Jogador", key: "player", width: 26 },
      { header: "Elegibilidade", key: "eligibilityStatus", width: 16 }, { header: "WhatsApp", key: "whatsapp", width: 12 },
      { header: "Guerras", key: "wars", width: 12 }, { header: "Liga", key: "league", width: 12 },
      { header: "Doações", key: "donations", width: 12 }, { header: "Jogos", key: "games", width: 12 },
      { header: "Raide", key: "raid", width: 12 }, { header: "Capital do Clã", key: "capitalCoins", width: 18 },
      { header: "Penalidades", key: "penalties", width: 14 }, { header: "Total", key: "total", width: 12 },
    ];
    dashboard.ranking.forEach(row => rankingSheet.addRow(row));
    const eventSheet = workbook.addWorksheet("Historico completo");
    eventSheet.columns = [
      { header: "id", key: "id", width: 12 }, { header: "player", key: "player", width: 26 },
      { header: "category", key: "category", width: 24 }, { header: "activity", key: "activity", width: 64 },
      { header: "points", key: "points", width: 12 }, { header: "created_at", key: "created_at", width: 24 },
    ];
    events.forEach(event => eventSheet.addRow(event));
    for (const sheet of [rankingSheet, eventSheet]) {
      sheet.views = [{ state: "frozen", ySplit: 1 }];
      sheet.autoFilter = { from: "A1", to: sheet.getRow(1).getCell(sheet.columnCount).address };
      const header = sheet.getRow(1);
      header.height = 24;
      header.eachCell(cell => {
        cell.font = { bold: true, color: { argb: "FFF4D99A" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF142B43" } };
        cell.alignment = { vertical: "middle", horizontal: "center" };
      });
      sheet.eachRow((row, rowNumber) => {
        if (rowNumber > 1) row.alignment = { vertical: "middle" };
      });
    }
    const buffer = await workbook.xlsx.writeBuffer();
    return new NextResponse(new Uint8Array(buffer), { headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="Ghost_Hunt_' + dashboard.monthKey + '.xlsx"',
      "Cache-Control": "no-store",
    }});
  } catch {
    return NextResponse.json({ error: "Não foi possível preparar a exportação." }, { status: 500 });
  }
}
