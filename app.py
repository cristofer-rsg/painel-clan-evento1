import io
import html
import hashlib
import hmac
import secrets
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pandas as pd
import streamlit as st
try:
    import extra_streamlit_components as stx
except Exception:
    stx = None
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
.podium {
    position:relative; isolation:isolate; overflow:hidden;
    background:linear-gradient(145deg,#252e40 0%,#171d2a 58%,#111722 100%);
    border:1px solid #46536a; border-radius:20px; padding:24px 16px 20px;
    text-align:center; min-height:178px; box-shadow:0 12px 28px #0006;
    transition:transform .18s ease, box-shadow .18s ease;
}
.podium:before {
    content:""; position:absolute; z-index:-1; inset:0;
    background:radial-gradient(ellipse at 50% 0%,#ffffff18,transparent 68%);
    pointer-events:none;
}
.podium .medal { font-size:38px; line-height:1.25; margin-bottom:8px; filter:drop-shadow(0 4px 5px #0007); }
.podium .name { color:#fff; font-size:20px; font-weight:850; overflow-wrap:anywhere; text-shadow:0 2px 8px #0008; }
.podium .score { font-size:29px; font-weight:950; margin-top:7px; letter-spacing:-.5px; }
.podium .small-note { font-size:11px; font-weight:800; letter-spacing:1.8px; margin-top:5px; }
.podium.gold {
    border:2px solid #f3c64e;
    background:linear-gradient(145deg,#59451b 0%,#302719 48%,#191d27 100%);
    box-shadow:0 0 0 1px #f3c64e35,0 14px 32px #c28a2530;
}
.podium.gold .score { color:#ffda70; text-shadow:0 0 18px #e5ad3d55; }
.podium.gold .small-note { color:#f5d98d; }
.podium.silver {
    border:2px solid #c8d2df;
    background:linear-gradient(145deg,#465366 0%,#2b3442 48%,#191f2b 100%);
    box-shadow:0 0 0 1px #dce5f033,0 12px 28px #aebed01c;
}
.podium.silver .score { color:#e5edf7; text-shadow:0 0 16px #d7e2f044; }
.podium.silver .small-note { color:#d0dae7; }
.podium.bronze {
    border:2px solid #c98750;
    background:linear-gradient(145deg,#5a3828 0%,#342820 48%,#1b1d27 100%);
    box-shadow:0 0 0 1px #d18b5233,0 12px 28px #a75d3020;
}
.podium.bronze .score { color:#f0b17d; text-shadow:0 0 16px #d58b5744; }
.podium.bronze .small-note { color:#e4b18e; }
.podium.empty { border-style:dashed; opacity:.72; }
.small-note { color:#aeb8c8; }
@media (max-width: 640px) {
    .podium { min-height:155px; padding:20px 12px 17px; border-radius:18px; }
    .podium .medal { font-size:34px; }
    .podium .name { font-size:19px; }
    .podium .score { font-size:27px; }
}
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

DEVICE_COOKIE = "ghost_hunt_device"
DEVICE_DAYS = 30

# Uma única instância do CookieManager por sessão Streamlit.
# O componente é criado uma vez e mantido no session_state para evitar
# múltiplos iframes/chaves concorrentes durante as reexecuções.
try:
    if stx is None:
        cookie_manager = None
        browser_cookies = {}
    else:
        if "ghost_hunt_cookie_manager_instance" not in st.session_state:
            st.session_state["ghost_hunt_cookie_manager_instance"] = stx.CookieManager(
                key="ghost_hunt_cookie_manager"
            )
        cookie_manager = st.session_state["ghost_hunt_cookie_manager_instance"]
        browser_cookies = cookie_manager.cookies
        if not isinstance(browser_cookies, dict):
            browser_cookies = {}
except Exception:
    cookie_manager = None
    browser_cookies = {}


def get_device_cookie(force_refresh=False):
    """Lê o cookie do request e, se necessário, solicita uma leitura nova ao navegador."""
    try:
        value = st.context.cookies.get(DEVICE_COOKIE)
        if value:
            return value
    except Exception:
        pass

    value = browser_cookies.get(DEVICE_COOKIE) if isinstance(browser_cookies, dict) else None
    if value:
        return value

    # Só força nova leitura quando o usuário solicita verificação.
    # A chave é fixa para reutilizar o mesmo componente de leitura.
    if force_refresh and cookie_manager is not None:
        try:
            refreshed = cookie_manager.get_all(key="ghost_hunt_cookie_refresh")
            if isinstance(refreshed, dict):
                value = refreshed.get(DEVICE_COOKIE)
                if value:
                    return value
        except Exception:
            pass
    return None


def diagnose_device_session():
    """Diagnóstico somente de leitura; nunca exibe o token nem dados secretos."""
    result = {
        "cookie_found": False,
        "session_record_found": False,
        "session_valid": False,
        "session_role": None,
        "problem": "Cookie não encontrado no navegador.",
    }
    token = get_device_cookie()
    if not token:
        return result

    result["cookie_found"] = True
    token_hash = hashlib.sha256(str(token).encode("utf-8")).hexdigest()
    try:
        rows = (db.table("device_sessions")
                .select("role,player_name,expires_at")
                .eq("token_hash", token_hash)
                .limit(1).execute().data or [])
        if not rows:
            result["problem"] = "Cookie existe, mas não há sessão correspondente no Supabase."
            return result

        result["session_record_found"] = True
        row = rows[0]
        result["session_role"] = row.get("role")
        expires = pd.to_datetime(row.get("expires_at"), utc=True, errors="coerce")
        if pd.isna(expires):
            result["problem"] = "A sessão existe, mas a data de validade não pôde ser interpretada."
            return result

        if expires <= pd.Timestamp.now(tz="UTC"):
            result["problem"] = "A sessão encontrada no Supabase está expirada."
            return result

        if row.get("role") == "player" and row.get("player_name"):
            approved = (db.table("player_accounts").select("status")
                        .ilike("player_name", row["player_name"])
                        .limit(1).execute().data or [])
            if not approved or approved[0].get("status") != "approved":
                result["problem"] = "A sessão existe, mas a conta do jogador não está aprovada."
                return result

        result["session_valid"] = True
        result["problem"] = "Cookie encontrado e sessão válida no Supabase."
        return result
    except Exception:
        result["problem"] = "Não foi possível consultar a sessão no Supabase. Pode ser uma falha temporária de conexão."
        return result


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


def issue_device_session(role, player_name=None):
    """Cria uma sessão persistente e solicita ao navegador que grave o cookie."""
    if cookie_manager is None:
        raise RuntimeError("O componente de cookies não está disponível neste navegador.")

    raw_token = secrets.token_urlsafe(48)
    token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
    expires_at = datetime.now(TZ) + timedelta(days=DEVICE_DAYS)

    db.table("device_sessions").insert({
        "token_hash": token_hash,
        "role": role,
        "player_name": player_name,
        "expires_at": expires_at.isoformat()
    }).execute()

    # A gravação é solicitada ao navegador em segundo plano.
    cookie_manager.set(
        DEVICE_COOKIE,
        raw_token,
        key="set_ghost_hunt_device_cookie",
        expires_at=expires_at.replace(tzinfo=None),
        path="/",
        same_site="lax",
        secure=True,
    )


def revoke_current_device():
    raw_token = get_device_cookie()
    if raw_token:
        token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
        try:
            db.table("device_sessions").delete().eq("token_hash", token_hash).execute()
        except Exception:
            pass
    if cookie_manager is not None:
        try:
            cookie_manager.delete(DEVICE_COOKIE, key="delete_ghost_hunt_device_cookie")
        except Exception:
            pass
    st.session_state.auth_role = None
    st.session_state.auth_player = None

# Recupera o acesso salvo neste navegador quando a sessão do Streamlit é reiniciada.
if st.session_state.auth_role is None:
    saved_token = get_device_cookie()
    if saved_token:
        saved_hash = hashlib.sha256(saved_token.encode("utf-8")).hexdigest()
        try:
            saved_sessions = (db.table("device_sessions")
                              .select("role,player_name,expires_at")
                              .eq("token_hash", saved_hash)
                              .gt("expires_at", datetime.now(TZ).isoformat())
                              .limit(1).execute().data or [])
            if saved_sessions:
                saved = saved_sessions[0]
                if saved.get("role") == "admin" and saved.get("player_name") == "__operator__":
                    st.session_state.auth_role = "operator"
                    st.session_state.auth_player = None
                elif saved.get("role") == "admin":
                    st.session_state.auth_role = "admin"
                    st.session_state.auth_player = None
                elif saved.get("role") == "player" and saved.get("player_name"):
                    st.session_state.auth_role = "player"
                    st.session_state.auth_player = saved["player_name"]
                else:
                    revoke_current_device()
            else:
                revoke_current_device()
        except Exception as e:
            # Falha temporária de rede/Supabase não deve apagar o cookie nem a sessão.
            st.warning("Não foi possível validar o acesso salvo neste momento. Tente atualizar novamente ou entre manualmente.")

if st.session_state.auth_role is None:
    login_tab, register_tab = st.tabs(["🔐 Entrar", "📝 Criar meu acesso"])
    with login_tab:
        st.subheader("🔐 Acesso Ghost Hunt")
        st.caption("Administrador principal: informe a senha. Operador: usuário operador e senha própria. Jogadores: usuário e senha cadastrados.")
        with st.form("login_admin_player"):
            login_name = st.text_input("Nome de usuário")
            login_password = st.text_input("Senha", type="password")
            remember_device = st.checkbox("Lembrar deste aparelho por 30 dias", value=True)
            login_submit = st.form_submit_button("Entrar", use_container_width=True)
        if login_submit:
            if login_name.strip().casefold() == "operador" and OPERATOR_PASSWORD and login_password == OPERATOR_PASSWORD:
                st.session_state.auth_role = "operator"
                st.session_state.auth_player = None
                if remember_device:
                    try:
                        # Usa role="admin" permitido pela tabela atual, com marcador próprio
                        # para restaurar o perfil operador sem conceder a sessão principal.
                        issue_device_session("admin", "__operator__")
                    except Exception:
                        st.warning("Login realizado. Não foi possível solicitar o salvamento deste aparelho; talvez seja necessário entrar novamente na próxima visita.")
                st.rerun()
            elif login_password == ADMIN_PASSWORD:
                st.session_state.auth_role = "admin"
                st.session_state.auth_player = None
                if remember_device:
                    try:
                        issue_device_session("admin")
                    except Exception:
                        st.warning("Login realizado. Não foi possível solicitar o salvamento deste aparelho; talvez seja necessário entrar novamente na próxima visita.")
                st.rerun()
            else:
                try:
                    account = (db.table("player_accounts").select("player_name,password_hash,status")
                               .ilike("player_name", login_name.strip()).limit(1).execute().data or [])
                    if account and verify_password(login_password, account[0]["password_hash"]):
                        st.session_state.auth_role = "player"
                        st.session_state.auth_player = account[0]["player_name"]
                        if remember_device:
                            try:
                                issue_device_session("player", account[0]["player_name"])
                            except Exception:
                                st.warning("Login realizado. Não foi possível solicitar o salvamento deste aparelho; talvez seja necessário entrar novamente na próxima visita.")
                        st.rerun()
                    else:
                        st.error("Nome ou senha incorretos, ou cadastro ainda não aprovado.")
                except Exception:
                    st.error("Não foi possível consultar os acessos. Confira se as tabelas do Supabase foram criadas.")
    with register_tab:
        st.subheader("📝 Criar acesso de jogador")
        st.caption("Escolha qualquer nome de usuário. Não precisa ser igual ao nome no jogo. A liderança precisará aprovar seu acesso.")
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
    order = [(1, "🥇", "gold"), (2, "🥈", "silver"), (3, "🥉", "bronze")]
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
