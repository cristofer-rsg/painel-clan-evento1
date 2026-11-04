import io
import html
import hashlib
import hmac
import secrets
from datetime import datetime, timedelta
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

st.markdown('\n<style>\n:root {\n  --gh-gold:#f4c45e; --gh-gold-light:#ffe7a3; --gh-bg:#080d18;\n  --gh-panel:#111a2a; --gh-panel2:#172338; --gh-border:#2a3a53;\n  --gh-muted:#a9b7ca; --gh-text:#f5f7fb;\n}\n.stApp {\n  background:\n    radial-gradient(ellipse at 12% -8%, #263958 0%, transparent 34%),\n    radial-gradient(ellipse at 95% 8%, #3a2b17 0%, transparent 25%),\n    linear-gradient(155deg,#0b1220 0%,#080d18 55%,#0b111d 100%);\n  color:var(--gh-text);\n}\n.block-container {max-width:1480px;padding-top:1.35rem;padding-bottom:3rem;}\nheader[data-testid="stHeader"] {background:rgba(8,13,24,.78);}\nh1,h2,h3 {color:#fff!important;letter-spacing:-.45px;}\nh1 {font-weight:900!important;letter-spacing:-1.5px;}\np, label, .stMarkdown {color:inherit;}\n[data-testid="stCaptionContainer"] p {color:var(--gh-muted)!important;}\n.gh-hero {\n  position:relative; overflow:hidden; padding:26px 28px; margin:8px 0 24px;\n  border:1px solid #42516a; border-radius:24px;\n  background:linear-gradient(115deg,rgba(27,42,64,.97),rgba(17,25,40,.96) 58%,rgba(50,39,20,.88));\n  box-shadow:0 18px 48px #0006;\n}\n.gh-hero:after {\n  content:"👻"; position:absolute; right:34px; top:50%; transform:translateY(-50%);\n  font-size:88px; opacity:.13; filter:grayscale(.2);\n}\n.gh-kicker {font-size:11px;font-weight:900;letter-spacing:3px;color:var(--gh-gold-light);text-transform:uppercase;}\n.gh-title {font-size:clamp(30px,5vw,48px);font-weight:950;line-height:1.05;color:#fff;margin:7px 0;}\n.gh-subtitle {font-size:14px;color:#c1ccdc;max-width:650px;}\n[data-testid="stMetric"] {\n  background:linear-gradient(145deg,rgba(29,43,64,.96),rgba(15,24,39,.98));\n  border:1px solid #344761; padding:17px 19px; border-radius:18px;\n  box-shadow:0 10px 28px #0004; min-height:112px;\n}\n[data-testid="stMetricLabel"] {color:#c2cede!important;font-weight:650;}\n[data-testid="stMetricValue"] {color:var(--gh-gold-light)!important;font-weight:900;}\n[data-testid="stMetricDelta"] {color:#b9d9c5!important;}\n.stTabs [data-baseweb="tab-list"] {gap:8px;background:#101a2a;padding:7px;border:1px solid var(--gh-border);border-radius:15px;}\n.stTabs [data-baseweb="tab"] {color:#c8d3e3;border-radius:10px;padding:10px 15px;}\n.stTabs [aria-selected="true"] {background:#28364b;color:var(--gh-gold-light)!important;border-bottom:2px solid var(--gh-gold)!important;}\n.stRadio [role="radiogroup"] {gap:8px;}\n.stRadio [role="radio"] {\n  background:linear-gradient(145deg,#18263a,#111b2b);border:1px solid #344761;\n  border-radius:12px;padding:10px 14px;min-height:42px;\n}\n.stRadio [role="radio"][aria-checked="true"] {border-color:var(--gh-gold);background:linear-gradient(120deg,#4a391d,#263044);color:#ffe7a3;}\n.stButton button,.stFormSubmitButton button,.stDownloadButton button {\n  border-radius:12px;border:1px solid #9b762f;font-weight:800;min-height:43px;\n  transition:transform .15s ease,filter .15s ease,box-shadow .15s ease;\n}\n.stButton button:hover,.stFormSubmitButton button:hover,.stDownloadButton button:hover {\n  transform:translateY(-1px);filter:brightness(1.08);box-shadow:0 8px 22px #0005;\n  border-color:var(--gh-gold);\n}\n.stButton button[kind="primary"],.stFormSubmitButton button[kind="primary"] {\n  background:linear-gradient(115deg,#c9922e,#f4c45e);color:#17130a;border:0;\n}\ninput,textarea,[data-baseweb="select"]>div {\n  background:#111b2a!important;border-color:#344761!important;border-radius:11px!important;\n}\ndiv[data-testid="stForm"] {\n  background:linear-gradient(145deg,rgba(22,34,52,.92),rgba(13,21,34,.96));\n  border:1px solid #2c3e58;border-radius:18px;padding:20px;\n}\ndiv[data-testid="stExpander"] {border:1px solid #344761;border-radius:14px;background:#111b2a;}\ndiv[data-testid="stDataFrame"] {border:1px solid #344761;border-radius:14px;overflow:hidden;}\n[data-testid="stSidebar"] {\n  background:linear-gradient(180deg,#111b2b,#0b1220 75%);\n  border-right:1px solid #293a52;\n}\n[data-testid="stSidebar"] [data-testid="stMarkdownContainer"] p {color:#c0ccdc;}\nhr {border-color:#2b3b52!important;}\n.podium {\n  position:relative;isolation:isolate;overflow:hidden;text-align:center;\n  background:linear-gradient(145deg,#26364d,#141e2e 68%,#101827);\n  border:1px solid #485a74;border-radius:22px;padding:25px 16px 21px;\n  min-height:184px;box-shadow:0 15px 34px #0006;\n  transition:transform .18s ease,box-shadow .18s ease;\n}\n.podium:hover {transform:translateY(-4px);box-shadow:0 20px 38px #0008;}\n.podium:before {content:"";position:absolute;z-index:-1;inset:0;background:radial-gradient(ellipse at 50% 0%,#ffffff20,transparent 70%);pointer-events:none;}\n.podium .medal {font-size:40px;line-height:1.2;margin-bottom:9px;filter:drop-shadow(0 4px 6px #0008);}\n.podium .name {color:#fff;font-size:20px;font-weight:900;overflow-wrap:anywhere;}\n.podium .score {font-size:30px;font-weight:950;margin-top:8px;letter-spacing:-.5px;}\n.podium .small-note {font-size:10px;font-weight:900;letter-spacing:2px;margin-top:6px;}\n.podium.gold {border:2px solid #f3c64e;background:linear-gradient(145deg,#624b1c,#342a1a 54%,#171d29);box-shadow:0 0 0 1px #f3c64e35,0 16px 36px #c28a2530;}\n.podium.gold .score {color:#ffda70;text-shadow:0 0 18px #e5ad3d55;}.podium.gold .small-note{color:#f5d98d;}\n.podium.silver {border:2px solid #c8d2df;background:linear-gradient(145deg,#4b5a70,#2b3545 54%,#171e2b);}\n.podium.silver .score {color:#e5edf7;}.podium.silver .small-note{color:#d0dae7;}\n.podium.bronze {border:2px solid #c98750;background:linear-gradient(145deg,#60402e,#382a23 54%,#1b1d27);}\n.podium.bronze .score {color:#f0b17d;}.podium.bronze .small-note{color:#e4b18e;}\n.podium.empty {border-style:dashed;opacity:.72;}\n@media(max-width:700px){\n .block-container{padding-left:.75rem;padding-right:.75rem;padding-top:.7rem;}\n .gh-hero{padding:21px 18px;border-radius:18px;margin-bottom:17px;}\n .gh-hero:after{right:12px;font-size:58px;}\n .gh-subtitle{max-width:78%;font-size:12px;}\n .podium{min-height:155px;padding:18px 9px;border-radius:17px;}\n .podium .medal{font-size:32px}.podium .name{font-size:16px;}.podium .score{font-size:23px;}\n [data-testid="stMetric"]{padding:12px;border-radius:14px;min-height:95px;}\n [data-testid="stMetricLabel"]{font-size:11px;}\n [data-testid="stMetricValue"]{font-size:24px;}\n}\n</style>\n', unsafe_allow_html=True)

st.markdown('\n<style>\n.gh-hero {\n  min-height:148px;display:flex;flex-direction:column;justify-content:center;\n  background:radial-gradient(circle at 88% 45%,rgba(246,190,62,.20),transparent 23%),\n  linear-gradient(112deg,rgba(7,17,34,.98),rgba(19,37,64,.96) 58%,rgba(45,34,19,.96));\n  border:1px solid rgba(245,197,83,.52);\n  box-shadow:0 0 0 1px rgba(255,215,125,.08),0 18px 55px rgba(0,0,0,.48),inset 0 1px rgba(255,255,255,.08);\n}\n.gh-hero:after {right:5%;font-size:clamp(70px,10vw,112px);opacity:.23;text-shadow:0 0 28px rgba(255,203,87,.5);}\n.gh-title {background:linear-gradient(180deg,#fff 15%,#e8edf5 52%,#b8c4d6 100%);-webkit-background-clip:text;background-clip:text;color:transparent;}\n.podium {display:flex;flex-direction:column;justify-content:center;min-height:205px;border-radius:20px;}\n.podium.gold {min-height:232px;transform:translateY(-10px);}\n.podium.gold:hover {transform:translateY(-14px);}\n.podium .medal {font-size:46px;}\n.podium.gold .medal {font-size:54px;filter:drop-shadow(0 0 13px rgba(255,205,70,.6));}\n.podium.gold:after {content:"CAMPEÃO DO MÊS";display:block;color:#ffe6a0;font-size:9px;font-weight:950;letter-spacing:2px;margin-top:9px;}\n[data-testid="stMetric"] {position:relative;overflow:hidden;background:linear-gradient(145deg,rgba(23,43,68,.98),rgba(10,19,33,.98));border-color:rgba(105,137,177,.45);}\n[data-testid="stMetric"]:after {content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:linear-gradient(180deg,#ffe49a,#c28a2d);}\n@media(max-width:700px) {\n .gh-hero{min-height:125px;}\n .podium,.podium.gold{min-height:150px;transform:none;}\n .podium.gold:hover{transform:translateY(-2px);}\n .podium .medal{font-size:30px;}.podium.gold .medal{font-size:35px;}\n .podium.gold:after{font-size:7px;letter-spacing:1px;}\n}\n</style>\n', unsafe_allow_html=True)

st.markdown("""
<div class="gh-hero">
  <div class="gh-kicker">Clash of Clans • Painel oficial do clã</div>
  <div class="gh-title">👻 GHOST HUNT</div>
  <div class="gh-subtitle">Ranking mensal, controle de pontuação e histórico de temporadas em um só lugar.</div>
</div>
""", unsafe_allow_html=True)

# --- Configuração e autenticação ---
try:
    SUPABASE_URL = st.secrets["SUPABASE_URL"]
    SUPABASE_SECRET_KEY = st.secrets["SUPABASE_SECRET_KEY"]
    ADMIN_PASSWORD = st.secrets["ADMIN_PASSWORD"]
    OPERATOR_PASSWORD = "ghosthunt"  # Login do Operador já configurado no código
except Exception:
    st.error("Configurações ausentes. Confira SUPABASE_URL, SUPABASE_SECRET_KEY e ADMIN_PASSWORD em Settings → Secrets no Streamlit.")
    st.stop()

@st.cache_resource
def get_db(url, key):
    return create_client(url, key)

try:
    db = get_db(SUPABASE_URL, SUPABASE_SECRET_KEY)
except Exception as e:
    st.error("Não foi possível conectar ao Supabase. Confira a URL, a chave secreta e se as tabelas players e events foram criadas.")
    st.code(str(e))
    st.stop()

# --- Autenticação persistente por aparelho/navegador ---
if "auth_role" not in st.session_state:
    st.session_state.auth_role = None
if "auth_player" not in st.session_state:
    st.session_state.auth_player = None

# Autenticação sem componente externo de cookies; a sessão é mantida pelo Streamlit.


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


def revoke_current_device():
    """Encerra apenas a sessão atual do aplicativo."""
    st.session_state.auth_role = None
    st.session_state.auth_player = None

if st.session_state.auth_role is None:
    login_tab, register_tab = st.tabs(["🔐 Entrar", "📝 Criar meu acesso"])
    with login_tab:
        st.subheader("🔐 Acesso Ghost Hunt")
        st.caption("Administrador principal: informe a senha. Operador: usuário operador e senha própria. Jogadores: usuário e senha cadastrados.")
        with st.form("login_admin_player"):
            login_name = st.text_input("Nome de usuário")
            login_password = st.text_input("Senha", type="password")
            login_submit = st.form_submit_button("Entrar", use_container_width=True)
        if login_submit:
            if login_name.strip().casefold() == "operador" and OPERATOR_PASSWORD and login_password == OPERATOR_PASSWORD:
                st.session_state.auth_role = "operator"
                st.session_state.auth_player = None
                st.rerun()
            elif login_password == ADMIN_PASSWORD:
                st.session_state.auth_role = "admin"
                st.session_state.auth_player = None
                st.rerun()
            else:
                try:
                    account = (db.table("player_accounts").select("player_name,password_hash,status")
                               .ilike("player_name", login_name.strip()).limit(1).execute().data or [])
                    if account and verify_password(login_password, account[0]["password_hash"]):
                        st.session_state.auth_role = "player"
                        st.session_state.auth_player = account[0]["player_name"]
                        st.rerun()
                    else:
                        st.error("Nome de usuário ou senha incorretos.")
                except Exception:
                    st.error("Não foi possível consultar os acessos. Confira se as tabelas do Supabase foram criadas.")
    with register_tab:
        st.subheader("📝 Criar acesso de jogador")
        st.caption("Escolha qualquer nome de usuário e senha. O acesso é liberado automaticamente após o cadastro.")
        with st.form("register_player_account"):
            register_name = st.text_input("Escolha seu nome de usuário", max_chars=30)
            register_password = st.text_input("Crie uma senha", type="password")
            register_confirm = st.text_input("Repita a senha", type="password")
            register_submit = st.form_submit_button("Criar meu login", use_container_width=True)
        if register_submit:
            clean_name = register_name.strip()
            if len(clean_name) < 3:
                st.error("O nome de usuário precisa ter pelo menos 3 caracteres.")
            elif "%" in clean_name or "_" in clean_name:
                st.error("Não use os caracteres % ou _ no nome de usuário.")
            elif len(register_password) < 8:
                st.error("A senha precisa ter pelo menos 8 caracteres.")
            elif register_password != register_confirm:
                st.error("As senhas não são iguais.")
            else:
                try:
                    duplicate = (db.table("player_accounts").select("id")
                                 .ilike("player_name", clean_name).limit(1).execute().data or [])
                    if duplicate:
                        st.error("Esse nome de usuário já está em uso. Escolha outro.")
                    else:
                        db.table("player_accounts").insert({
                            "player_name": clean_name,
                            "password_hash": hash_password(register_password),
                            "status": "approved"
                        }).execute()
                        st.success("Cadastro criado! Você já pode entrar no aplicativo.")
                except Exception:
                    st.error("Não foi possível criar o acesso. Confira se a tabela player_accounts foi criada no Supabase.")
    st.stop()

is_admin = st.session_state.auth_role in ("admin", "operator")
is_primary_admin = st.session_state.auth_role == "admin"
is_operator = st.session_state.auth_role == "operator"

# --- Carregamento dos dados: nenhuma tabela é apagada ou recriada ---
PLAYERS_FALLBACK = [
    "Allehx", "Shiro", "DangerKeepWay", "Luffy", "King", "Daniel", "Akashi", "Aladdin", "Hawks", "Andre",
    "Benedita", "Bielzinx", "Najar", "Soldado 724", "Kiko", "Garauto", "Pele", "Guilherme", "Higor Claudio",
    "Poseidon", "Extreme", "Allen", "Matheus", "Weslezeira", "Pedroska", "Thawa", "Vinicius", "Zagui", "Silva", "Electros"
]

@st.cache_data(ttl=300, max_entries=4, show_spinner=False)
def load_players():
    return db.table("players").select("name,eligible,whatsapp").order("name").execute().data or []

def month_utc_bounds(month_key):
    year, month = map(int, month_key.split("-"))
    start_local = datetime(year, month, 1, tzinfo=TZ)
    end_local = datetime(year + (month == 12), 1 if month == 12 else month + 1, 1, tzinfo=TZ)
    return start_local.astimezone(ZoneInfo("UTC")), end_local.astimezone(ZoneInfo("UTC"))

def fetch_all_pages(query, page_size=1000):
    """Busca todos os registros em páginas para não truncar resultados no limite do Supabase."""
    rows = []
    offset = 0
    while True:
        page = query.range(offset, offset + page_size - 1).execute().data or []
        rows.extend(page)
        if len(page) < page_size:
            break
        offset += page_size
    return rows

@st.cache_data(ttl=60, max_entries=8, show_spinner=False)
def load_events(month_key):
    start_utc, end_utc = month_utc_bounds(month_key)
    query = (db.table("events").select("id,player,category,activity,points,created_at")
             .gte("created_at", start_utc.isoformat()).lt("created_at", end_utc.isoformat())
             .order("created_at", desc=True))
    return fetch_all_pages(query)

@st.cache_data(ttl=300, max_entries=2, show_spinner=False)
def load_all_events_for_export():
    query = (db.table("events").select("id,player,category,activity,points,created_at")
             .order("created_at", desc=True))
    return fetch_all_pages(query)


@st.cache_data(ttl=300, max_entries=2, show_spinner=False)
def make_export_workbook(ranking_records, event_records):
    """Gera o Excel uma vez e reaproveita o arquivo durante os reruns do Streamlit."""
    ranking_df = pd.DataFrame(ranking_records)
    events_df = pd.DataFrame(event_records)
    if not events_df.empty and "created_at" in events_df.columns:
        events_df["created_at"] = events_df["created_at"].astype(str)

    output = io.BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        ranking_df.to_excel(writer, index=False, sheet_name="Ranking do mês")
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
                max_len = max((len(str(cell.value)) if cell.value is not None else 0) for cell in col)
                ws.column_dimensions[letter].width = min(max(max_len + 3, 12), 34)
            for row in ws.iter_rows(min_row=2):
                for cell in row:
                    cell.alignment = Alignment(vertical="center")
                    cell.border = Border(bottom=Side(style="hair", color="D9E2F3"))
    return output.getvalue()

try:
    players = load_players()
    if not players:
        fallback_rows = [
            {"name": name, "eligible": "Elegível", "whatsapp": "Sim"}
            for name in dict.fromkeys(PLAYERS_FALLBACK)
        ]
        db.table("players").upsert(fallback_rows, on_conflict="name").execute()
        load_players.clear()
        players = load_players()
except Exception as e:
    st.error("Erro ao carregar os dados do Supabase.")
    st.code(str(e))
    st.stop()

player_names = [p["name"] for p in players]

# Os lançamentos do mês permanecem em registros simples até a tela que precisar deles.\n\n# --- Ranking: as regras e os limites são aplicados separadamente em cada mês ---
def build_ranking(players_data, events_data):
    # Agrega os lançamentos uma única vez, em vez de percorrer os eventos
    # novamente para cada jogador.
    totals = {}
    for event in events_data:
        name = event.get("player")
        if not name:
            continue
        bucket = totals.setdefault(name, {
            "Guerras": 0, "Liga dos Clãs": 0, "Doações": 0,
            "Jogos": 0, "Penalidades": 0
        })
        points = int(event.get("points") or 0)
        category = event.get("category") or ""
        if points < 0:
            bucket["Penalidades"] += abs(points)
        elif category == "Guerras":
            bucket["Guerras"] += points
        elif category == "Liga dos Clãs":
            bucket["Liga dos Clãs"] += points
        elif category == "Doações":
            bucket["Doações"] += points
        elif category == "Jogos do Clã":
            # Mantém a regra original: vale a maior faixa registrada.
            bucket["Jogos"] = max(bucket["Jogos"], points)

    rows = []
    for player in players_data:
        bucket = totals.get(player["name"], {})
        wars = min(200, bucket.get("Guerras", 0))
        league = min(20, bucket.get("Liga dos Clãs", 0))
        donations = min(15, bucket.get("Doações", 0))
        games = min(25, bucket.get("Jogos", 0))
        penalties = bucket.get("Penalidades", 0)
        eligible = (
            player.get("eligible", "Elegível") == "Elegível"
            and player.get("whatsapp", "Sim") == "Sim"
        )
        total = max(0, wars + league + donations + games - penalties) if eligible else 0
        rows.append({
            "Jogador": player["name"],
            "Elegibilidade": player.get("eligible", "Elegível"),
            "WhatsApp": player.get("whatsapp", "Sim"),
            "Guerras": wars,
            "Liga": league,
            "Doações": donations,
            "Jogos": games,
            "Penalidades": penalties,
            "Total": total
        })

    df = pd.DataFrame(rows)
    if not df.empty:
        df = df.sort_values(["Total", "Jogador"], ascending=[False, True]).reset_index(drop=True)
        df.insert(0, "Posição", range(1, len(df) + 1))
    return df


# Na virada do mês, arquiva somente o mês imediatamente anterior, se necessário.
@st.cache_data(ttl=300, max_entries=4, show_spinner=False)
def load_archived_months():
    rows = fetch_all_pages(db.table("monthly_rankings").select("month_key"))
    return sorted({r["month_key"] for r in rows if r.get("month_key")})

def ensure_previous_month_archive():
    previous_month = (datetime.now(TZ).replace(day=1) - timedelta(days=1)).strftime("%Y-%m")
    if previous_month in set(load_archived_months()):
        return
    previous_events = load_events(previous_month)
    if not previous_events:
        return
    previous_ranking = build_ranking(players, previous_events)
    snapshot = [{
        "month_key": previous_month, "player": row["Jogador"],
        "position": int(row["Posição"]), "eligible": row["Elegibilidade"],
        "whatsapp": row["WhatsApp"], "wars": int(row["Guerras"]),
        "league": int(row["Liga"]), "donations": int(row["Doações"]),
        "games": int(row["Jogos"]), "penalties": int(row["Penalidades"]),
        "total": int(row["Total"]),
    } for row in previous_ranking.to_dict("records")]
    if snapshot:
        db.table("monthly_rankings").upsert(snapshot, on_conflict="month_key,player").execute()
        load_archived_months.clear()

try:
    ensure_previous_month_archive()
    archived_months = set(load_archived_months())
except Exception:
    st.warning("Não foi possível atualizar a lista do histórico neste momento.")
    archived_months = set()

month_options = sorted(archived_months | {CURRENT_MONTH}, reverse=True)

def month_label(month_key):
    try:
        return datetime.strptime(month_key, "%Y-%m").strftime("%m/%Y")
    except Exception:
        return month_key

def render_live_ranking(player_mode=False):
    """Atualiza somente a área do ranking a cada 60 segundos."""
    fresh_players = load_players()
    now_local = datetime.now(TZ)
    month_now = now_local.strftime("%Y-%m")
    # load_events já aplica os limites UTC correspondentes ao mês local;
    # não é necessário converter cada timestamp novamente no navegador/servidor.
    month_events = load_events(month_now)
    live_ranking = build_ranking(fresh_players, month_events)
    st.caption(f"Atualização automática a cada 60 segundos • Última verificação: {now_local.strftime('%H:%M:%S')}")
    st.subheader(f"🏆 Ranking do mês — {month_label(month_now)}")
    if player_mode:
        st.caption(f"Bem-vindo(a), {st.session_state.auth_player}! Este acesso permite somente visualizar a classificação.")
    else:
        st.caption("A pontuação é reiniciada automaticamente na virada do mês. Os lançamentos antigos permanecem no histórico.")
    c1, c2, c3 = st.columns(3)
    c1.metric("👥 Jogadores", len(fresh_players))
    c2.metric("🥇 Pontos do líder", int(live_ranking.iloc[0]["Total"]) if not live_ranking.empty else 0)
    c3.metric("📝 Lançamentos no mês", len(month_events))
    st.markdown("### 🏅 Pódio do mês")
    top = live_ranking.head(3).to_dict("records") if not live_ranking.empty else []
    order = [(2, "🥈", "silver"), (1, "🥇", "gold"), (3, "🥉", "bronze")]
    cols = st.columns(3, gap="medium")
    for col, (pos, medal, cls) in zip(cols, order):
        with col:
            if len(top) >= pos:
                item = top[pos - 1]
                safe_name = html.escape(str(item.get("Jogador", "Jogador")))
                score = int(item.get("Total") or 0)
                st.markdown(
                    f"<div class='podium {cls}'><div class='medal'>{medal}</div>"
                    f"<div class='name'>{safe_name}</div><div class='score'>{score} pts</div>"
                    f"<div class='small-note'>{pos}º LUGAR</div></div>",
                    unsafe_allow_html=True
                )
            else:
                st.markdown(
                    "<div class='podium empty'><div class='medal'>🏆</div>"
                    "<div class='name'>Aguardando</div>"
                    "<div class='small-note'>SEM PONTUAÇÃO</div></div>",
                    unsafe_allow_html=True
                )
    st.markdown("### 📊 Classificação completa")
    if player_mode:
        st.dataframe(live_ranking[["Posição", "Jogador", "Guerras", "Liga", "Doações", "Jogos", "Penalidades", "Total"]], use_container_width=True, hide_index=True, height=620)
    else:
        st.caption("🥇 1º lugar • 🥈 2º lugar • 🥉 3º lugar")
        st.dataframe(live_ranking, use_container_width=True, hide_index=True, height=620)


@st.fragment(run_every="60s")
def live_ranking_fragment(player_mode=False):
    render_live_ranking(player_mode)

# Jogadores autenticados só recebem a tela de consulta; abas e ações administrativas não são renderizadas.
if not is_admin:
    live_ranking_fragment(player_mode=True)
    with st.sidebar:
        st.success("🟢 Acesso de jogador")
        st.caption(f"Conta: {st.session_state.auth_player}")
        if st.button("🚪 Sair", use_container_width=True):
            revoke_current_device()
            st.rerun()
    st.stop()

# --- Navegação ---
aba = st.radio(
    "Navegação",
    ["🏆 Ranking do mês", "➕ Lançar pontos", "✏️ Editar lançamento", "👥 Jogadores", "📜 Histórico mensal", "📤 Exportar"],
    horizontal=True,
    label_visibility="collapsed",
    key="main_navigation"
)

if aba == "🏆 Ranking do mês":
    live_ranking_fragment(player_mode=False)

if aba == "➕ Lançar pontos":
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
                load_all_events_for_export.clear()
                make_export_workbook.clear()
                st.success("Lançamento salvo no mês atual!")
                st.rerun()
            except Exception as e:
                st.error("Não foi possível salvar o lançamento.")
                st.code(str(e))

if aba == "✏️ Editar lançamento":
    st.subheader("✏️ Editar lançamento")
    current_events = load_events(CURRENT_MONTH)
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
                load_all_events_for_export.clear()
                make_export_workbook.clear()
                st.success("Lançamento atualizado com sucesso! O ranking será recalculado.")
                st.rerun()
            except Exception as e:
                st.error("Não foi possível atualizar o lançamento.")
                st.code(str(e))

if aba == "👥 Jogadores":
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

if aba == "📜 Histórico mensal":
    st.subheader("📜 Histórico mensal")
    st.caption("Escolha um mês para consultar o ranking final e todos os lançamentos daquele período. O histórico completo é mantido no Supabase.")
    selected_month = st.selectbox(
        "Mês para consultar",
        month_options,
        index=0,
        format_func=month_label
    )

    month_events = load_events(selected_month)
    month_events_df = pd.DataFrame(month_events)
    if not month_events_df.empty:
        month_events_df["created_at"] = pd.to_datetime(month_events_df["created_at"], errors="coerce", utc=True)
        month_events_df["data_local"] = month_events_df["created_at"].dt.tz_convert("America/Sao_Paulo")
        month_events_df["mes"] = selected_month
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

if aba == "📤 Exportar":
    st.subheader("📤 Exportar dados")
    st.caption(f"O ranking exportado corresponde ao mês atual: {month_label(CURRENT_MONTH)}. O histórico completo é carregado somente nesta seção.")
    current_events = load_events(CURRENT_MONTH)
    ranking = build_ranking(players, current_events)
    export_events = load_all_events_for_export()
    with st.spinner("Preparando o arquivo Excel..."):
        excel_bytes = make_export_workbook(
            ranking.to_dict("records"),
            export_events
        )

    st.download_button(
        "⬇️ Baixar Excel (ranking do mês + histórico completo)",
        data=excel_bytes,
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
    st.caption("Administrador principal" if is_primary_admin else "Operador — acesso administrativo")
    st.caption("Painel administrativo Ghost Hunt")
    st.caption(f"Temporada atual: {month_label(CURRENT_MONTH)}")
    st.markdown("---")
    if st.button("🚪 Sair", use_container_width=True):
        revoke_current_device()
        st.rerun()
