import io
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

    # Guarda apenas o estado pendente no servidor. Não autentica ainda.
    st.session_state.pending_device_token = raw_token
    st.session_state.pending_device_role = role
    st.session_state.pending_device_player = player_name
    st.session_state.pending_device_expires = expires_at.isoformat()

    # A gravação é assíncrona no navegador; não chamar st.rerun() aqui.
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

# Confirma a gravação do cookie antes de liberar o acesso recém-criado.
pending_token = st.session_state.get("pending_device_token")
if pending_token:
    visible_token = get_device_cookie()
    if visible_token and hmac.compare_digest(str(visible_token), str(pending_token)):
        st.session_state.auth_role = st.session_state.get("pending_device_role")
        st.session_state.auth_player = st.session_state.get("pending_device_player")
        for key in ("pending_device_token", "pending_device_role", "pending_device_player", "pending_device_expires"):
            st.session_state.pop(key, None)
        st.success("Acesso deste aparelho salvo com sucesso.")
    else:
        st.info("Estamos salvando o acesso neste aparelho. Quando o navegador confirmar, clique em **Verificar acesso**.")
        if st.button("Verificar acesso", key="verify_device_cookie"):
            refreshed_token = get_device_cookie(force_refresh=True)
            if refreshed_token and hmac.compare_digest(str(refreshed_token), str(pending_token)):
                st.session_state.auth_role = st.session_state.get("pending_device_role")
                st.session_state.auth_player = st.session_state.get("pending_device_player")
                for key in ("pending_device_token", "pending_device_role", "pending_device_player", "pending_device_expires"):
                    st.session_state.pop(key, None)
                st.rerun()
            else:
                st.warning("O navegador ainda não confirmou o cookie. Tente novamente em alguns segundos.")

# Recupera o acesso salvo neste navegador quando a sessão do Streamlit é reiniciada.
if st.session_state.auth_role is None and not st.session_state.get("pending_device_token"):
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
                if saved.get("role") == "admin":
                    st.session_state.auth_role = "admin"
                    st.session_state.auth_player = None
                elif saved.get("role") == "player" and saved.get("player_name"):
                    approved = (db.table("player_accounts").select("status")
                                .ilike("player_name", saved["player_name"]).limit(1).execute().data or [])
                    if approved and approved[0].get("status") == "approved":
                        st.session_state.auth_role = "player"
                        st.session_state.auth_player = saved["player_name"]
                    else:
                        revoke_current_device()
                else:
                    revoke_current_device()
            else:
                revoke_current_device()
        except Exception as e:
            # Falha temporária de rede/Supabase não deve apagar o cookie nem a sessão.
            st.warning("Não foi possível validar o acesso salvo neste momento. Tente atualizar novamente ou entre manualmente.")

if st.session_state.auth_role is None:
    with st.expander("🔎 Diagnóstico do acesso neste aparelho", expanded=False):
        if st.button("Verificar cookie e sessão", key="run_device_diagnostic"):
            diagnostic = diagnose_device_session()
            st.write("Cookie encontrado no navegador:", "Sim" if diagnostic["cookie_found"] else "Não")
            st.write("Registro correspondente no Supabase:", "Sim" if diagnostic["session_record_found"] else "Não")
            st.write("Sessão válida:", "Sim" if diagnostic["session_valid"] else "Não")
            st.info(diagnostic["problem"])
        else:
            st.caption("A verificação não mostra senha nem token. Ela apenas confere a presença do cookie e a validade da sessão.")

    login_tab, register_tab = st.tabs(["🔐 Entrar", "📝 Criar meu acesso"])
    with login_tab:
        st.subheader("🔐 Acesso Ghost Hunt")
        with st.form("login_admin_player"):
            login_name = st.text_input("Nome de usuário")
            login_password = st.text_input("Senha", type="password")
            remember_device = st.checkbox("Lembrar deste aparelho por 30 dias", value=True)
            login_submit = st.form_submit_button("Entrar", use_container_width=True)
        if login_submit:
            if login_password == ADMIN_PASSWORD:
                try:
                    if remember_device:
                        issue_device_session("admin")
                    else:
                        st.session_state.auth_role = "admin"
                        st.session_state.auth_player = None
                    if remember_device:
                        st.info("Aguardando a confirmação do navegador para salvar seu acesso.")
                        if st.button("Verificar acesso salvo", key="verify_admin_cookie_now"):
                            st.rerun()
                    else:
                        st.rerun()
                except Exception:
                    st.error("Não foi possível salvar o acesso deste aparelho. Confira se a tabela device_sessions foi criada no Supabase.")
            else:
                try:
                    account = (db.table("player_accounts").select("player_name,password_hash,status")
                               .ilike("player_name", login_name.strip()).limit(1).execute().data or [])
                    if account and account[0].get("status") == "approved" and verify_password(login_password, account[0]["password_hash"]):
                        try:
                            if remember_device:
                                issue_device_session("player", account[0]["player_name"])
                            else:
                                st.session_state.auth_role = "player"
                                st.session_state.auth_player = account[0]["player_name"]
                            if remember_device:
                                st.info("Aguardando a confirmação do navegador para salvar seu acesso.")
                                if st.button("Verificar acesso salvo", key="verify_player_cookie_now"):
                                    st.rerun()
                            else:
                                st.rerun()
                        except Exception:
                            st.error("Não foi possível salvar o acesso deste aparelho. Confira se a tabela device_sessions foi criada no Supabase.")
                    elif account and account[0].get("status") == "pending":
                        st.warning("Seu cadastro está aguardando aprovação da liderança.")
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
                    account_rows = (db.table("player_accounts").select("id,player_name")
                                    .limit(1001).execute().data or [])
                    existing = any((row.get("player_name") or "").strip().casefold() == clean_name.casefold() for row in account_rows)
                    if existing:
                        st.error("Esse nome de usuário já está em uso. Escolha outro.")
                    elif len(account_rows) >= 1000:
                        st.error("Limite de 1.000 contas atingido. Não é possível criar novos acessos.")
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

@st.cache_data(ttl=300, max_entries=4, show_spinner=False)
def load_players():
    return db.table("players").select("name,eligible,whatsapp").order("name").execute().data or []

def month_utc_bounds(month_key):
    year, month = map(int, month_key.split("-"))
    start_local = datetime(year, month, 1, tzinfo=TZ)
    end_local = datetime(year + (month == 12), 1 if month == 12 else month + 1, 1, tzinfo=TZ)
    return start_local.astimezone(ZoneInfo("UTC")), end_local.astimezone(ZoneInfo("UTC"))

@st.cache_data(ttl=60, max_entries=8, show_spinner=False)
def load_events(month_key):
    start_utc, end_utc = month_utc_bounds(month_key)
    return (db.table("events").select("id,player,category,activity,points,created_at")
            .gte("created_at", start_utc.isoformat()).lt("created_at", end_utc.isoformat())
            .order("created_at", desc=True).execute().data or [])

@st.cache_data(ttl=300, max_entries=2, show_spinner=False)
def load_all_events_for_export():
    return (db.table("events").select("id,player,category,activity,points,created_at")
            .order("created_at", desc=True).execute().data or [])

try:
    players = load_players()
    if not players:
        for name in dict.fromkeys(PLAYERS_FALLBACK):
            db.table("players").upsert({"name": name, "eligible": "Elegível", "whatsapp": "Sim"}).execute()
        load_players.clear()
        players = load_players()
    events = load_events(CURRENT_MONTH)
except Exception as e:
    st.error("Erro ao carregar os dados do Supabase.")
    st.code(str(e))
    st.stop()

player_names = [p["name"] for p in players]

# Carrega somente os lançamentos do mês atual na abertura do painel.
events_df = pd.DataFrame(events)
if not events_df.empty:
    events_df["created_at"] = pd.to_datetime(events_df["created_at"], errors="coerce", utc=True)
    events_df["data_local"] = events_df["created_at"].dt.tz_convert("America/Sao_Paulo")
    events_df["mes"] = CURRENT_MONTH
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


# Na virada do mês, arquiva somente o mês imediatamente anterior, se necessário.
@st.cache_data(ttl=300, max_entries=4, show_spinner=False)
def load_archived_months():
    rows = db.table("monthly_rankings").select("month_key").execute().data or []
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

current_events = events
ranking = build_ranking(players, current_events)
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
    fresh_events = load_events(month_now)
    month_events = []
    for event in fresh_events:
        try:
            event_month = pd.to_datetime(event.get("created_at"), errors="coerce", utc=True).tz_convert(TZ).strftime("%Y-%m")
            if event_month == month_now:
                month_events.append(event)
        except Exception:
            continue
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
    if player_mode:
        st.dataframe(live_ranking[["Posição", "Jogador", "Guerras", "Liga", "Doações", "Jogos", "Penalidades", "Total"]], use_container_width=True, hide_index=True, height=620)
    else:
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
        st.dataframe(live_ranking.style.apply(destacar_podio, axis=1), use_container_width=True, hide_index=True, height=620)


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
                st.success("Lançamento salvo no mês atual!")
                st.rerun()
            except Exception as e:
                st.error("Não foi possível salvar o lançamento.")
                st.code(str(e))

if aba == "✏️ Editar lançamento":
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
                load_all_events_for_export.clear()
                st.success("Lançamento atualizado com sucesso! O ranking será recalculado.")
                st.rerun()
            except Exception as e:
                st.error("Não foi possível atualizar o lançamento.")
                st.code(str(e))

if aba == "👥 Jogadores":
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
    out = io.BytesIO()
    # O Excel não aceita datas com fuso horário; convertemos apenas a cópia exportada.
    export_events_df = pd.DataFrame(load_all_events_for_export())
    if not export_events_df.empty:
        export_events_df["created_at"] = export_events_df["created_at"].astype(str)

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
        revoke_current_device()
        st.rerun()
