import io
from datetime import datetime
from zoneinfo import ZoneInfo

import pandas as pd
import streamlit as st
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from supabase import create_client

# ---------------------------------------------------------
# GHOST HUNT - RANKING MENSAL
# Os registros antigos da tabela "events" são preservados.
# O ranking é calculado usando apenas os lançamentos do mês.
# ---------------------------------------------------------

TZ = ZoneInfo("America/Sao_Paulo")
NOW = datetime.now(TZ)
CURRENT_MONTH = NOW.strftime("%Y-%m")

st.set_page_config(page_title="Ghost Hunt", page_icon="👻", layout="wide")

st.markdown("""
<style>
:root { --gold:#f5c451; --gold2:#ffe39a; --panel:#171b26; --line:#343b4c; }
.stApp { background: radial-gradient(ellipse at top, #20283a 0%, #10131b 52%, #0c0f16 100%); }
.block-container { padding-top: 2rem; padding-bottom: 3rem; max-width: 1450px; }
h1 { color:#fff; letter-spacing:-1.2px; font-weight:850 !important; }
h2,h3 { color:#f7f8fb !important; }
[data-testid="stCaptionContainer"] p { color:#aeb7c8; }
[data-testid="stMetric"] { background:linear-gradient(145deg,#202838,#151b27); border:1px solid #39445a; padding:18px 20px; border-radius:16px; box-shadow:0 8px 22px #0004; }
[data-testid="stMetricLabel"] { color:#c5ccda !important; }
[data-testid="stMetricValue"] { color:#f5c451 !important; font-weight:800; }
.stTabs [data-baseweb="tab-list"] { gap:8px; border-bottom:1px solid #39445a; }
.stTabs [data-baseweb="tab"] { color:#cbd3e1; border-radius:10px 10px 0 0; padding:12px 15px; }
.stTabs [aria-selected="true"] { color:#ffe39a !important; border-bottom:3px solid #f5c451 !important; }
.stButton button, .stFormSubmitButton button, .stDownloadButton button { border-radius:11px; border:1px solid #b88a2d; font-weight:700; }
.stButton button[kind="primary"], .stFormSubmitButton button[kind="primary"] { background:linear-gradient(110deg,#d99d2b,#f5c451); color:#17130a; }
div[data-testid="stExpander"] { border:1px solid #39445a; border-radius:12px; background:#151b27; }
div[data-testid="stDataFrame"] { border:1px solid #39445a; border-radius:12px; overflow:hidden; }
.podium { background:linear-gradient(145deg,#242d40,#151b27); border:1px solid #59647a; border-radius:16px; padding:18px 12px; text-align:center; min-height:132px; box-shadow:0 8px 20px #0004; }
.podium .medal { font-size:30px; }
.podium .name { color:#fff; font-size:18px; font-weight:800; overflow-wrap:anywhere; }
.podium .score { color:#f5c451; font-size:25px; font-weight:900; }
.podium.first { border:2px solid #e7b943; background:linear-gradient(145deg,#3a3020,#1c202b); }
.small-note { color:#9ca8bb; font-size:13px; }
@media (max-width: 640px) { .block-container { padding-left: .8rem; padding-right: .8rem; } h1 {font-size:2rem !important;} }
</style>
""", unsafe_allow_html=True)

st.title("👻 GHOST HUNT")
st.caption("⚔️ Ranking mensal • Controle de pontuação • Histórico de temporadas")

# --- Configuração e autenticação ---
try:
    SUPABASE_URL = st.secrets["SUPABASE_URL"]
    SUPABASE_SECRET_KEY = st.secrets["SUPABASE_SECRET_KEY"]
    ADMIN_PASSWORD = st.secrets["ADMIN_PASSWORD"]
except Exception:
    st.error("Configurações ausentes. Confira SUPABASE_URL, SUPABASE_SECRET_KEY e ADMIN_PASSWORD em Settings → Secrets no Streamlit.")
    st.stop()

@st.cache_resource
def get_db(url, key):
    return create_client(url, key)

try:
    db = get_db(SUPABASE_URL, SUPABASE_SECRET_KEY)
    db.table("players").select("name").limit(1).execute()
except Exception as e:
    st.error("Não foi possível conectar ao Supabase. Confira a URL, a chave secreta e se as tabelas players e events foram criadas.")
    st.code(str(e))
    st.stop()

if "logged_in" not in st.session_state:
    st.session_state.logged_in = False

if not st.session_state.logged_in:
    st.markdown("<div class='small-note'>ÁREA RESTRITA • LIDERANÇA GHOST HUNT</div>", unsafe_allow_html=True)
    with st.form("login"):
        st.subheader("🔐 Acesso da liderança")
        password = st.text_input("Senha de administrador", type="password")
        submitted = st.form_submit_button("Entrar no painel", use_container_width=True)
    if submitted:
        if password == ADMIN_PASSWORD:
            st.session_state.logged_in = True
            st.rerun()
        else:
            st.error("Senha incorreta.")
    st.stop()

# --- Carregamento dos dados: nenhuma tabela é apagada ou recriada ---
PLAYERS_FALLBACK = [
    "Allehx", "Shiro", "DangerKeepWay", "Luffy", "King", "Daniel", "Akashi", "Aladdin", "Hawks", "Andre",
    "Benedita", "Bielzinx", "Najar", "Soldado 724", "Kiko", "Garauto", "Pele", "Guilherme", "Higor Claudio",
    "Poseidon", "Extreme", "Allen", "Matheus", "Weslezeira", "Pedroska", "Thawa", "Vinicius", "Zagui", "Silva", "Electros"
]

@st.cache_data(ttl=20)
def load_players():
    return db.table("players").select("name,eligible,whatsapp").order("name").execute().data or []

@st.cache_data(ttl=20)
def load_events():
    return db.table("events").select("id,player,category,activity,points,created_at").order("created_at", desc=True).execute().data or []

try:
    players = load_players()
    if not players:
        names = PLAYERS_FALLBACK
        for name in dict.fromkeys(names):
            db.table("players").upsert({"name": name, "eligible": "Elegível", "whatsapp": "Sim"}).execute()
        load_players.clear()
        players = load_players()
    events = load_events()
except Exception as e:
    st.error("Erro ao carregar os dados do Supabase.")
    st.code(str(e))
    st.stop()

player_names = [p["name"] for p in players]

# Converte os horários para o fuso de Brasília antes de separar os meses.
events_df = pd.DataFrame(events)
if not events_df.empty:
    events_df["created_at"] = pd.to_datetime(events_df["created_at"], errors="coerce", utc=True)
    events_df["data_local"] = events_df["created_at"].dt.tz_convert("America/Sao_Paulo")
    events_df["mes"] = events_df["data_local"].dt.strftime("%Y-%m")
else:
    events_df = pd.DataFrame(columns=["id", "player", "category", "activity", "points", "created_at", "data_local", "mes"])

# --- Ranking: as regras e os limites são aplicados separadamente em cada mês ---
def build_ranking(players_data, events_data):
    rows = []
    for p in players_data:
        pe = [e for e in events_data if e.get("player") == p["name"]]
        positive = {}
        penalties = 0
        for e in pe:
            pts = int(e.get("points") or 0)
            if pts < 0:
                penalties += abs(pts)
            else:
                positive[e.get("category", "")] = positive.get(e.get("category", ""), 0) + pts

        wars = min(200, positive.get("Guerras", 0))
        league = min(20, positive.get("Liga dos Clãs", 0))
        donations = min(15, positive.get("Doações", 0))
        games = min(25, max([
            int(e.get("points") or 0)
            for e in pe
            if e.get("category") == "Jogos do Clã" and int(e.get("points") or 0) > 0
        ] or [0]))

        total = max(0, wars + league + donations + games - penalties) if p.get("eligible") == "Elegível" and p.get("whatsapp") == "Sim" else 0
        rows.append({
            "Jogador": p["name"], "Elegibilidade": p.get("eligible", "Elegível"),
            "WhatsApp": p.get("whatsapp", "Sim"), "Guerras": wars, "Liga": league,
            "Doações": donations, "Jogos": games, "Penalidades": penalties, "Total": total
        })

    df = pd.DataFrame(rows)
    if not df.empty:
        df = df.sort_values(["Total", "Jogador"], ascending=[False, True]).reset_index(drop=True)
        df.insert(0, "Posição", range(1, len(df) + 1))
    return df

current_events = [
    e for e in events
    if e.get("created_at") and pd.to_datetime(e["created_at"], errors="coerce", utc=True).tz_convert(TZ).strftime("%Y-%m") == CURRENT_MONTH
]
ranking = build_ranking(players, current_events)

# Meses disponíveis no histórico. O mês atual sempre aparece, mesmo sem lançamentos.
available_months = set(events_df["mes"].dropna().tolist()) if not events_df.empty else set()
available_months.add(CURRENT_MONTH)
month_options = sorted(available_months, reverse=True)

def month_label(month_key):
    try:
        return datetime.strptime(month_key, "%Y-%m").strftime("%m/%Y")
    except Exception:
        return month_key

# --- Navegação ---
aba = st.tabs(["🏆 Ranking do mês", "➕ Lançar pontos", "👥 Jogadores", "📜 Histórico mensal", "📤 Exportar"])

with aba[0]:
    st.subheader(f"🏆 Ranking de {month_label(CURRENT_MONTH)}")
    st.caption("A pontuação é reiniciada automaticamente na virada do mês. Os lançamentos antigos permanecem no histórico.")
    c1, c2, c3 = st.columns(3)
    c1.metric("👥 Jogadores", len(players))
    c2.metric("🥇 Pontos do líder", int(ranking.iloc[0]["Total"]) if not ranking.empty else 0)
    c3.metric("📝 Lançamentos no mês", len(current_events))

    st.markdown("### 🏅 Pódio do mês")
    if not ranking.empty:
        top = ranking.head(3).to_dict("records")
        order = [(1, "🥇", "first"), (2, "🥈", ""), (3, "🥉", "")]
        cols = st.columns(3)
        for col, (pos, medal, cls) in zip(cols, order):
            with col:
                if len(top) >= pos:
                    item = top[pos - 1]
                    st.markdown(
                        f"<div class='podium {cls}'><div class='medal'>{medal}</div><div class='name'>{item['Jogador']}</div><div class='score'>{int(item['Total'])} pts</div><div class='small-note'>{pos}º LUGAR</div></div>",
                        unsafe_allow_html=True
                    )
                else:
                    st.markdown("<div class='podium'><div class='medal'>🏆</div><div class='name'>Aguardando</div><div class='small-note'>SEM PONTUAÇÃO</div></div>", unsafe_allow_html=True)

    st.markdown("### 📊 Classificação completa")
    st.caption("🥇 1º lugar • 🥈 2º lugar • 🥉 3º lugar")

    def destacar_podio(row):
        posicao = int(row.get("Posição", 0))
        if posicao == 1:
            cor = "background-color: #5a461d; color: #fff2c2; font-weight: 800;"
        elif posicao == 2:
            cor = "background-color: #3d4653; color: #f0f3f7; font-weight: 800;"
        elif posicao == 3:
            cor = "background-color: #55392c; color: #ffe0cc; font-weight: 800;"
        else:
            cor = ""
        return [cor] * len(row)

    st.dataframe(ranking.style.apply(destacar_podio, axis=1), use_container_width=True, hide_index=True, height=620)

with aba[1]:
    st.subheader("➕ Lançar pontuação")
    if not player_names:
        st.warning("Cadastre um jogador primeiro.")
    else:
        with st.form("add_points"):
            who = st.selectbox("Jogador", player_names)
            kind = st.selectbox("Tipo de lançamento", ["Guerras", "Liga dos Clãs", "Doações", "Jogos do Clã", "Penalidade"])

            if kind == "Guerras":
                activity = st.selectbox("Ação", ["Participou da guerra (+5)", "Fez os 2 ataques (+10)", "Atacou corretamente o espelho (+5)"])
                pts = {"Participou da guerra (+5)": 5, "Fez os 2 ataques (+10)": 10, "Atacou corretamente o espelho (+5)": 5}[activity]
            elif kind == "Liga dos Clãs":
                activity = "Participou da Liga (+5)"
                pts = 5
            elif kind == "Doações":
                activity = st.text_input("Descrição", "Doações")
                pts = st.number_input("Pontos", min_value=0, max_value=15, value=1, step=1)
            elif kind == "Jogos do Clã":
                activity = st.selectbox("Faixa alcançada", ["4000 pontos", "6000 pontos", "8000 pontos", "10000 pontos"])
                pts = {"4000 pontos": 10, "6000 pontos": 15, "8000 pontos": 20, "10000 pontos": 25}[activity]
            else:
                activity = st.selectbox("Motivo", ["Não fez um ataque (-5)", "Não fez os dois ataques (-10)", "Atacou fora do espelho sem autorização (-5)", "Outra penalidade"])
                pts = -5 if "(-5)" in activity else (-10 if "(-10)" in activity else -int(st.number_input("Valor da penalidade", min_value=1, max_value=200, value=5)))

            if kind == "Penalidade":
                pts = -abs(int(pts))
                category_db = "Guerras"
            else:
                category_db = kind

            ok = st.form_submit_button("💾 Salvar lançamento", use_container_width=True)

        if ok:
            try:
                db.table("events").insert({
                    "player": who, "category": category_db, "activity": activity,
                    "points": int(pts)
                }).execute()
                load_events.clear()
                st.success("Lançamento salvo no mês atual!")
                st.rerun()
            except Exception as e:
                st.error("Não foi possível salvar o lançamento.")
                st.code(str(e))

with aba[2]:
    st.subheader("👥 Gerenciar jogadores")
    with st.form("new_player"):
        new_name = st.text_input("Nome no jogo")
        add = st.form_submit_button("➕ Adicionar jogador")
    if add and new_name.strip():
        try:
            db.table("players").upsert({"name": new_name.strip(), "eligible": "Elegível", "whatsapp": "Sim"}).execute()
            load_players.clear()
            st.success("Jogador adicionado.")
            st.rerun()
        except Exception as e:
            st.error("Não foi possível adicionar o jogador.")
            st.code(str(e))

    st.divider()
    for p in players:
        with st.expander("⚔️ " + p["name"]):
            with st.form("edit_" + p["name"]):
                elig = st.selectbox("Elegibilidade", ["Elegível", "Inelegível"], index=0 if p.get("eligible") == "Elegível" else 1, key="elig_" + p["name"])
                whats = st.selectbox("Grupo WhatsApp", ["Sim", "Não"], index=0 if p.get("whatsapp") == "Sim" else 1, key="wa_" + p["name"])
                save = st.form_submit_button("Atualizar")
            if save:
                db.table("players").update({"eligible": elig, "whatsapp": whats}).eq("name", p["name"]).execute()
                load_players.clear()
                st.success("Cadastro atualizado.")
                st.rerun()

with aba[3]:
    st.subheader("📜 Histórico mensal")
    st.caption("Escolha um mês para consultar o ranking final e todos os lançamentos daquele período. O histórico completo é mantido no Supabase.")
    selected_month = st.selectbox(
        "Mês para consultar",
        month_options,
        index=0,
        format_func=month_label
    )

    month_events_df = events_df[events_df["mes"] == selected_month].copy() if not events_df.empty else pd.DataFrame()
    month_events = month_events_df[["id", "player", "category", "activity", "points", "created_at"]].to_dict("records") if not month_events_df.empty else []
    historical_ranking = build_ranking(players, month_events)

    st.markdown(f"### 🏆 Classificação de {month_label(selected_month)}")
    st.dataframe(historical_ranking, use_container_width=True, hide_index=True, height=520)

    st.markdown(f"### 🧾 Lançamentos de {month_label(selected_month)}")
    if not month_events_df.empty:
        history_view = month_events_df.copy()
        history_view["Data"] = history_view["data_local"].dt.strftime("%d/%m/%Y %H:%M")
        history_view = history_view.rename(columns={
            "player": "Jogador", "category": "Categoria",
            "activity": "Atividade", "points": "Pontos"
        })
        st.dataframe(
            history_view[["Data", "Jogador", "Categoria", "Atividade", "Pontos"]],
            use_container_width=True, hide_index=True
        )
    else:
        st.info("Não há lançamentos registrados neste mês.")

with aba[4]:
    st.subheader("📤 Exportar dados")
    st.caption(f"O ranking exportado corresponde ao mês atual: {month_label(CURRENT_MONTH)}. O histórico exportado inclui todos os meses.")
    out = io.BytesIO()
    with pd.ExcelWriter(out, engine="openpyxl") as writer:
        ranking.to_excel(writer, index=False, sheet_name="Ranking do mês")
        events_df.to_excel(writer, index=False, sheet_name="Historico completo")
        for ws in writer.book.worksheets:
            ws.freeze_panes = "A2"
            ws.auto_filter.ref = ws.dimensions
            ws.sheet_view.showGridLines = False
            for cell in ws[1]:
                cell.fill = PatternFill("solid", fgColor="17365D")
                cell.font = Font(color="FFFFFF", bold=True)
                cell.alignment = Alignment(horizontal="center", vertical="center")
            ws.row_dimensions[1].height = 26
            for col in ws.columns:
                letter = get_column_letter(col[0].column)
                max_len = max((len(str(c.value)) if c.value is not None else 0) for c in col)
                ws.column_dimensions[letter].width = min(max(max_len + 3, 12), 34)
            for row in ws.iter_rows(min_row=2):
                for cell in row:
                    cell.alignment = Alignment(vertical="center")
                    cell.border = Border(bottom=Side(style="hair", color="D9E2F3"))

    st.download_button(
        "⬇️ Baixar Excel (ranking do mês + histórico completo)",
        data=out.getvalue(),
        file_name=f"Ghost_Hunt_{CURRENT_MONTH}.xlsx",
        mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        use_container_width=True
    )
    st.download_button(
        "⬇️ Baixar CSV do ranking mensal",
        data=ranking.to_csv(index=False).encode("utf-8-sig"),
        file_name=f"Ghost_Hunt_Ranking_{CURRENT_MONTH}.csv",
        mime="text/csv",
        use_container_width=True
    )

with st.sidebar:
    st.success("🟢 Conectado ao Supabase")
    st.caption("Painel administrativo Ghost Hunt")
    st.caption(f"Temporada atual: {month_label(CURRENT_MONTH)}")
    st.markdown("---")
    if st.button("🚪 Sair", use_container_width=True):
        st.session_state.logged_in = False
        st.rerun()
