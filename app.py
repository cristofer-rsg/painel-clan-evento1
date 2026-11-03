import io
from datetime import datetime
import pandas as pd
import streamlit as st
from supabase import create_client

st.set_page_config(page_title="ClanEvento", page_icon="🏆", layout="wide")

st.title("🏆 Painel ClanEvento")
st.caption("Ranking e controle de pontuação do clã")

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
    with st.form("login"):
        st.subheader("Acesso do administrador")
        password = st.text_input("Senha de administrador", type="password")
        submitted = st.form_submit_button("Entrar", use_container_width=True)
    if submitted:
        if password == ADMIN_PASSWORD:
            st.session_state.logged_in = True
            st.rerun()
        else:
            st.error("Senha incorreta.")
    st.stop()

# --- Dados ---
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
        # Importa os nomes da planilha atualizada; usa lista de segurança se a planilha não estiver preenchida.
        names = []
        try:
            df_names = pd.read_excel("ClanEvento.xlsx", sheet_name="Ranking Principal")
            if "Nome do Jogador" in df_names.columns:
                names = [str(x).strip() for x in df_names["Nome do Jogador"].dropna().tolist() if str(x).strip()]
        except Exception:
            pass
        if not names:
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

# --- Cálculo do ranking ---
def build_ranking(players_data, events_data):
    rows = []
    for p in players_data:
        pe = [e for e in events_data if e["player"] == p["name"]]
        positive = {}
        penalties = 0
        for e in pe:
            pts = int(e.get("points") or 0)
            if pts < 0:
                penalties += abs(pts)
            else:
                positive[e["category"]] = positive.get(e["category"], 0) + pts
        wars = min(200, positive.get("Guerras", 0))
        league = min(20, positive.get("Liga dos Clãs", 0))
        donations = min(15, positive.get("Doações", 0))
        games = min(25, max([int(e["points"]) for e in pe if e["category"] == "Jogos do Clã" and int(e["points"]) > 0] or [0]))
        total = max(0, wars + league + donations + games - penalties) if p["eligible"] == "Elegível" and p["whatsapp"] == "Sim" else 0
        rows.append({"Jogador": p["name"], "Elegibilidade": p["eligible"], "WhatsApp": p["whatsapp"], "Guerras": wars, "Liga": league, "Doações": donations, "Jogos": games, "Penalidades": penalties, "Total": total})
    df = pd.DataFrame(rows)
    if not df.empty:
        df = df.sort_values(["Total", "Jogador"], ascending=[False, True]).reset_index(drop=True)
        df.insert(0, "Posição", range(1, len(df) + 1))
    return df

ranking = build_ranking(players, events)

# --- Navegação ---
aba = st.tabs(["🏆 Ranking", "➕ Lançar pontos", "👥 Jogadores", "📜 Histórico", "📤 Exportar"])

with aba[0]:
    st.subheader("Ranking geral")
    c1, c2, c3 = st.columns(3)
    c1.metric("Jogadores", len(players))
    c2.metric("Pontos do líder", int(ranking.iloc[0]["Total"]) if not ranking.empty else 0)
    c3.metric("Lançamentos", len(events))
    st.dataframe(ranking, use_container_width=True, hide_index=True)

with aba[1]:
    st.subheader("Lançar pontuação")
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
            ok = st.form_submit_button("Salvar lançamento", use_container_width=True)
        if ok:
            try:
                db.table("events").insert({"player": who, "category": category_db, "activity": activity, "points": int(pts)}).execute()
                load_events.clear()
                st.success("Lançamento salvo!")
                st.rerun()
            except Exception as e:
                st.error("Não foi possível salvar o lançamento.")
                st.code(str(e))

with aba[2]:
    st.subheader("Gerenciar jogadores")
    with st.form("new_player"):
        new_name = st.text_input("Nome no jogo")
        add = st.form_submit_button("Adicionar jogador")
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
        with st.expander(p["name"]):
            with st.form("edit_" + p["name"]):
                elig = st.selectbox("Elegibilidade", ["Elegível", "Inelegível"], index=0 if p["eligible"] == "Elegível" else 1, key="elig_" + p["name"])
                whats = st.selectbox("Grupo WhatsApp", ["Sim", "Não"], index=0 if p["whatsapp"] == "Sim" else 1, key="wa_" + p["name"])
                save = st.form_submit_button("Atualizar")
            if save:
                db.table("players").update({"eligible": elig, "whatsapp": whats}).eq("name", p["name"]).execute()
                load_players.clear()
                st.success("Cadastro atualizado.")
                st.rerun()

with aba[3]:
    st.subheader("Histórico de lançamentos")
    if events:
        hist = pd.DataFrame(events)
        hist["created_at"] = pd.to_datetime(hist["created_at"], errors="coerce")
        st.dataframe(hist[["created_at", "player", "category", "activity", "points"]], use_container_width=True, hide_index=True)
    else:
        st.info("Ainda não há lançamentos.")

with aba[4]:
    st.subheader("Exportar ranking")
    out = io.BytesIO()
    with pd.ExcelWriter(out, engine="openpyxl") as writer:
        ranking.to_excel(writer, index=False, sheet_name="Ranking")
        pd.DataFrame(events).to_excel(writer, index=False, sheet_name="Historico")
    st.download_button("Baixar Excel", data=out.getvalue(), file_name=f"ClanEvento_{datetime.now():%Y%m%d_%H%M}.xlsx", mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    st.download_button("Baixar CSV", data=ranking.to_csv(index=False).encode("utf-8-sig"), file_name="ClanEvento_Ranking.csv", mime="text/csv")

with st.sidebar:
    st.success("Conectado ao Supabase")
    st.caption("Painel administrativo ClanEvento")
    if st.button("Sair"):
        st.session_state.logged_in = False
        st.rerun()
