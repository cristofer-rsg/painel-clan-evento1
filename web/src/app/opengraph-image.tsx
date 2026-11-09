import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Ghost Hunt — Central do Clã";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div style={{
        width: "100%", height: "100%", display: "flex", flexDirection: "column",
        justifyContent: "space-between", padding: "64px 76px",
        background: "radial-gradient(circle at 82% 20%, #59401d 0%, transparent 34%), linear-gradient(135deg, #090b0e 0%, #17130d 55%, #08090b 100%)",
        color: "#fff4dc", fontFamily: "Arial, sans-serif",
        border: "8px solid #a77b37",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          <div style={{
            width: 78, height: 78, display: "flex", alignItems: "center",
            justifyContent: "center", border: "3px solid #d8ae62", borderRadius: 20,
            color: "#f5d58e", fontSize: 35, fontWeight: 900,
          }}>GH</div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 31, fontWeight: 900, letterSpacing: 7 }}>GHOST HUNT</div>
            <div style={{ fontSize: 16, color: "#cbb78f", letterSpacing: 6, marginTop: 7 }}>CLAN COMMUNITY</div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ fontSize: 19, color: "#d6ad64", letterSpacing: 5, fontWeight: 800 }}>CENTRAL DO CLÃ</div>
          <div style={{ fontSize: 68, lineHeight: 1.05, fontWeight: 900 }}>Ranking, eventos</div>
          <div style={{ fontSize: 68, lineHeight: 1.05, fontWeight: 900, color: "#f2cc7e" }}>e desempenho.</div>
          <div style={{ fontSize: 25, color: "#d8cbb2", marginTop: 10 }}>Acompanhe a evolução dos jogadores e fortaleça seu clã.</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "1px solid #80602f", paddingTop: 22 }}>
          <div style={{ fontSize: 23, color: "#f2d18d", fontWeight: 700 }}>ghosthunt.com.br</div>
          <div style={{ fontSize: 17, color: "#b99a61", letterSpacing: 4 }}>GHOST HUNT</div>
        </div>
      </div>
    ),
    { ...size }
  );
}
