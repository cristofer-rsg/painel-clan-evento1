import io
import hashlib
import hmac
import secrets
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

# --- Autenticação: administrador e contas individuais dos jogadores ---
if "auth_role" not in st.session_state:
    st.session_state.auth_role = None
if "auth_player" not in st.session_state:
    st.session_state.auth_player = None


def hash_password(password, salt=None):
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 260000).hex()
    return f"{salt}${digest}"


def verify_password(password, stored):
    try:
        salt, expected = stored.split("$", 1)
        actual = hash_password(password, salt).split("$", 1)[1]
        return hmac.compare_digest(actual, expected)
    except Exception:
        return False


if st.session_state.auth_role is None:
    login_tab, register_tab = st.tabs(["🔐 Entrar", "📝 Criar meu acesso"])
    with login_tab:
        st.subheader("🔐 Acesso Ghost Hunt")
        with st.form("login_admin_player"):
            login_name = st.text_input("Nome no Clash of Clans (jogadores)")
            login_password = st.text_input("Senha", type="password")
            login_submit = st.form_submit_button("Entrar", use_container_width=True)
        if login_submit:
            if login_password == ADMIN_PASSWORD:
                st.session_state.auth_role = "admin"
                st.session_state.auth_player = None
                st.rerun()
            else:
                try:
                    account = (db.table("player_accounts").select("player_name,password_hash,status")
                               .ilike("player_name", login_name.strip()).limit(1).execute().data or [])
                    if account and account[0].get("status") == "approved" and verify_password(login_password, account[0]["password_hash"]):
                        st.session_state.auth_role = "player"
                        st.session_state.auth_player = account[0]["player_name"]
                        st.rerun()
                    elif account and account[0].get("status") == "pending":
                        st.warning("Seu cadastro está aguardando aprovação da liderança.")
                    else:
                        st.error("Nome ou senha incorretos, ou cadastro ainda não aprovado.")
                except Exception:
                    st.error("Não foi possível consultar os acessos. Confira se a tabela player_accounts foi criada no Supabase.")
    with register_tab:
        st.subheader("📝 Criar acesso de jogador")
        st.caption("Use exatamente seu nome cadastrado no clã. A liderança precisará aprovar seu primeiro acesso.")
        with st.form("register_player_account"):
            register_name = st.text_input("Seu nome no Clash of Clans")
            register_password = st.text_input("Crie uma senha", type="password")
            register_confirm = st.text_input("Repita a senha", type="password")
            register_submit = st.form_submit_button("Criar meu login", use_container_width=True)
        if register_submit:
            clean_name = register_name.strip()
            known_names = [x["name"] for x in (db.table("players").select("name").execute().data or [])]
            if clean_name not in known_names:
                st.error("Esse nome não está cadastrado no clã. Confira a escrita ou fale com a liderança.")
            elif len(register_password) < 8:
                st.error("A senha precisa ter pelo menos 8 caracteres.")
            elif register_password != register_confirm:
                st.error("As senhas não são iguais.")
            else:
                try:
                    existing = (db.table("player_accounts").select("id")
                                .ilike("player_name", clean_name).limit(1).execute().data or [])
                    if existing:
                        st.error("Já existe um acesso solicitado para esse jogador. Fale com a liderança.")
                    else:
                        db.table("player_accounts").insert({
                            "player_name": clean_name,
                            "password_hash": hash_password(register_password),
                            "status": "pending"
                        }).execute()
                        st.success("Cadastro enviado! Aguarde a aprovação da liderança para entrar.")
                except Exception:
                    st.error("Não foi possível criar o acesso. Confira se a tabela player_accounts foi criada no Supabase.")
    st.stop()

is_admin = st.session_state.auth_role == "admin"

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


# Arquiva uma fotografia dos rankings de meses encerrados.
# A rotina roda quando o painel é aberto; não depende de apagar os lançamentos.
def archive_closed_months():
    closed_months = sorted(
        set(events_df["mes"].dropna().tolist()) - {CURRENT_MONTH}
    ) if not events_df.empty else []

    for month_key in closed_months:
        existing = (
            db.table("monthly_rankings")
            .select("id")
            .eq("month_key", month_key)
            .limit(1)
            .execute()
            .data or []
        )
        if existing:
            continue

        month_df = events_df[events_df["mes"] == month_key].copy()
        month_events = month_df[
            ["id", "player", "category", "activity", "points", "created_at"]
        ].to_dict("records")

        month_ranking = build_ranking(players, month_events)
        snapshot = []
        for row in month_ranking.to_dict("records"):
            snapshot.append({
                "month_key": month_key,
                "player": row["Jogador"],
                "position": int(row["Posição"]),
                "eligible": row["Elegibilidade"],
                "whatsapp": row["WhatsApp"],
                "wars": int(row["Guerras"]),
                "league": int(row["Liga"]),
                "donations": int(row["Doações"]),
                "games": int(row["Jogos"]),
                "penalties": int(row["Penalidades"]),
                "total": int(row["Total"]),
            })

        if snapshot:
            db.table("monthly_rankings").upsert(
                snapshot, on_conflict="month_key,player"
            ).execute()


try:
    archive_closed_months()
    archived_month_rows = (
        db.table("monthly_rankings")
        .select("month_key")
        .execute()
        .data or []
    )
    archived_months = {r["month_key"] for r in archived_month_rows}
except Exception as e:
    st.error("Não foi possível consultar ou arquivar os rankings mensais.")
    st.code(str(e))
    st.stop()


current_events = [
    e for e in events
    if e.get("created_at") and pd.to_datetime(e["created_at"], errors="coerce", utc=True).tz_convert(TZ).strftime("%Y-%m") == CURRENT_MONTH
]
ranking = build_ranking(players, current_events)

# Meses disponíveis no histórico. O mês atual sempre aparece, mesmo sem lançamentos.
available_months = set(events_df["mes"].dropna().tolist()) if not events_df.empty else set()
available_months.update(archived_months)
available_months.add(CURRENT_MONTH)
month_options = sorted(available_months, reverse=True)

def month_label(month_key):
    try:
        return datetime.strptime(month_key, "%Y-%m").strftime("%m/%Y")
    except Exception:
        return month_key

# Jogadores autenticados só recebem a tela de consulta; abas e ações administrativas não são renderizadas.
if not is_admin:
    st.subheader(f"🏆 Ranking do mês — {month_label(CURRENT_MONTH)}")
    st.caption(f"Bem-vindo(a), {st.session_state.auth_player}! Este acesso permite somente visualizar a classificação.")
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
                    st.markdown(f"<div class='podium {cls}'><div class='medal'>{medal}</div><div class='name'>{item['Jogador']}</div><div class='score'>{int(item['Total'])} pts</div><div class='small-note'>{pos}º LUGAR</div></div>", unsafe_allow_html=True)
                else:
                    st.markdown("<div class='podium'><div class='medal'>🏆</div><div class='name'>Aguardando</div><div class='small-note'>SEM PONTUAÇÃO</div></div>", unsafe_allow_html=True)
    st.markdown("### 📊 Classificação completa")
    st.dataframe(ranking[["Posição", "Jogador", "Guerras", "Liga", "Doações", "Jogos", "Penalidades", "Total"]], use_container_width=True, hide_index=True, height=620)
    with st.sidebar:
        st.success("🟢 Acesso de jogador")
        st.caption(f"Conta: {st.session_state.auth_player}")
        if st.button("🚪 Sair", use_container_width=True):
            st.session_state.auth_role = None
            st.session_state.auth_player = None
            st.rerun()
    st.stop()

# --- Navegação ---
aba = st.tabs(["🏆 Ranking do mês", "➕ Lançar pontos", "✏️ Editar lançamento", "👥 Jogadores", "📜 Histórico mensal", "📤 Exportar"])

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
    st.subheader("✏️ Editar lançamento")
    st.caption("Escolha um lançamento do mês atual para corrigir. O registro original será atualizado, sem duplicar pontos.")
    current_event_options = []
    current_event_lookup = {}
    for e in current_events:
        try:
            event_date = pd.to_datetime(e.get("created_at"), utc=True).tz_convert(TZ).strftime("%d/%m/%Y %H:%M")
        except Exception:
            event_date = "Data indisponível"
        label = f"{event_date} | {e.get('player', '')} | {e.get('category', '')} | {e.get('activity', '')} | {int(e.get('points') or 0)} pts | ID {e.get('id')}"
        current_event_options.append(label)
        current_event_lookup[label] = e

    if not current_event_options:
        st.info("Não há lançamentos neste mês para editar.")
    else:
        selected_event_label = st.selectbox("Selecione o lançamento", current_event_options)
        selected_event = current_event_lookup[selected_event_label]
        with st.form("edit_event_form"):
            edit_player = st.selectbox("Jogador", player_names, index=player_names.index(selected_event["player"]) if selected_event.get("player") in player_names else 0)
            category_options = ["Guerras", "Liga dos Clãs", "Doações", "Jogos do Clã"]
            current_category = selected_event.get("category", "Guerras")
            edit_category = st.selectbox("Categoria", category_options, index=category_options.index(current_category) if current_category in category_options else 0)
            edit_activity = st.text_input("Descrição do lançamento", value=str(selected_event.get("activity") or ""))
            edit_points = st.number_input("Pontos (use valor negativo para penalidade)", min_value=-200, max_value=200, value=int(selected_event.get("points") or 0), step=1)
            confirm_edit = st.form_submit_button("💾 Salvar alterações", use_container_width=True)

        if confirm_edit:
            try:
                db.table("events").update({
                    "player": edit_player,
                    "category": edit_category,
                    "activity": edit_activity.strip(),
                    "points": int(edit_points)
                }).eq("id", selected_event["id"]).execute()
                load_events.clear()
                st.success("Lançamento atualizado com sucesso! O ranking será recalculado.")
                st.rerun()
            except Exception as e:
                st.error("Não foi possível atualizar o lançamento.")
                st.code(str(e))

with aba[3]:
    st.subheader("👥 Gerenciar jogadores")
    st.markdown("### 🔐 Aprovar acessos dos jogadores")
    try:
        pending_accounts = (db.table("player_accounts").select("id,player_name,created_at")
                            .eq("status", "pending").order("created_at").execute().data or [])
        if not pending_accounts:
            st.caption("Nenhum acesso aguardando aprovação.")
        for account in pending_accounts:
            with st.container(border=True):
                st.write(f"**{account['player_name']}** — aguardando aprovação")
                if st.button("✅ Aprovar acesso", key=f"approve_{account['id']}"):
                    db.table("player_accounts").update({"status": "approved"}).eq("id", account["id"]).execute()
                    st.success(f"Acesso de {account['player_name']} aprovado.")
                    st.rerun()
    except Exception:
        st.warning("A tabela de acessos ainda não está disponível. Crie-a no Supabase usando o SQL fornecido.")
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

with aba[4]:
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
    saved_snapshot = (
        db.table("monthly_rankings")
        .select("*")
        .eq("month_key", selected_month)
        .order("position")
        .execute()
        .data or []
    )

    if saved_snapshot:
        historical_ranking = pd.DataFrame([{
            "Posição": int(r["position"]),
            "Jogador": r["player"],
            "Elegibilidade": r.get("eligible") or "",
            "WhatsApp": r.get("whatsapp") or "",
            "Guerras": int(r.get("wars") or 0),
            "Liga": int(r.get("league") or 0),
            "Doações": int(r.get("donations") or 0),
            "Jogos": int(r.get("games") or 0),
            "Penalidades": int(r.get("penalties") or 0),
            "Total": int(r.get("total") or 0),
        } for r in saved_snapshot])
    else:
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

with aba[5]:
    st.subheader("📤 Exportar dados")
    st.caption(f"O ranking exportado corresponde ao mês atual: {month_label(CURRENT_MONTH)}. O histórico exportado inclui todos os meses.")
    out = io.BytesIO()
    # O Excel não aceita datas com fuso horário; convertemos apenas a cópia exportada.
    export_events_df = events_df.copy()
    if not export_events_df.empty:
        if "created_at" in export_events_df.columns:
            export_events_df["created_at"] = export_events_df["created_at"].astype(str)
        if "data_local" in export_events_df.columns:
            export_events_df["data_local"] = export_events_df["data_local"].dt.strftime("%d/%m/%Y %H:%M:%S")

    with pd.ExcelWriter(out, engine="openpyxl") as writer:
        ranking.to_excel(writer, index=False, sheet_name="Ranking do mês")
        export_events_df.to_excel(writer, index=False, sheet_name="Historico completo")
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
        st.session_state.auth_role = None
        st.session_state.auth_player = None
        st.rerun()
