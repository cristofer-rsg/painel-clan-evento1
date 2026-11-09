import json
import os
import sys
import urllib.error
import urllib.request
from urllib.parse import quote

from supabase import create_client

CLAN_TAG = "#2GCGP0RQ9"
API_URL = "https://cocproxy.royaleapi.dev/v1"


def normalizar(nome):
    return nome.strip().casefold()


def buscar_membros(token):
    tag = quote(CLAN_TAG, safe="")
    url = f"{API_URL}/clans/{tag}/members?limit=50"
    req = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
            "User-Agent": "ClanEvento/2.2",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            dados = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as erro:
        detalhe = erro.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Erro na API ({erro.code}): {detalhe}") from erro

    membros = dados.get("items")
    if not isinstance(membros, list):
        raise RuntimeError("A API não retornou uma lista válida.")
    if not membros:
        raise RuntimeError("A API retornou zero membros. Banco não alterado.")

    resultado = {}
    for membro in membros:
        if not isinstance(membro, dict):
            raise RuntimeError("A API retornou um membro em formato inválido.")
        nome = membro.get("name")
        player_tag = membro.get("tag")
        if not isinstance(nome, str) or not nome.strip():
            raise RuntimeError("A API retornou um jogador sem nome.")
        if not isinstance(player_tag, str) or not player_tag.strip():
            raise RuntimeError(f"A API não retornou uma tag de {nome}.")
        player_tag = player_tag.strip().upper()
        if player_tag in resultado:
            raise RuntimeError(f"Tag duplicada na API: {player_tag}")
        resultado[player_tag] = {"name": nome.strip(), "player_tag": player_tag}

    return list(resultado.values())


def main():
    token = "".join(os.environ["CLASH_API_TOKEN"].split())
    partes = token.split(".")
    if len(partes) != 3 or any(not parte for parte in partes):
        raise RuntimeError("CLASH_API_TOKEN ausente ou em formato inválido.")

    url = os.environ["SUPABASE_URL"].strip().rstrip("/")
    chave = os.environ["SUPABASE_SECRET_KEY"].strip()
    if not url.startswith("https://") or not chave:
        raise RuntimeError("Configuração do Supabase inválida.")

    membros_api = buscar_membros(token)
    db = create_client(url, chave)
    cadastrados = (
        db.table("players").select("name,player_tag,active").execute().data or []
    )

    # A fotografia do último sync vem de uma tabela própria, não do campo
    # players.active, que também pode ser alterado manualmente pelo painel.
    estado = (
        db.table("clan_sync_state")
        .select("member_tags")
        .eq("id", "current_roster")
        .limit(1)
        .execute()
        .data or []
    )
    if estado:
        tags_anteriores = {str(tag).strip().upper() for tag in (estado[0].get("member_tags") or [])}
        primeira_fotografia = False
    else:
        # Primeira execução: usa os ativos cadastrados apenas como baseline,
        # sem gerar falsos positivos para todos os membros.
        tags_anteriores = {
            jogador["player_tag"].strip().upper()
            for jogador in cadastrados
            if jogador.get("active") is not False and jogador.get("player_tag")
        }
        primeira_fotografia = True

    por_tag = {}
    por_nome_sem_tag = {}
    for jogador in cadastrados:
        nome = jogador.get("name")
        player_tag = jogador.get("player_tag")
        if player_tag:
            chave_tag = player_tag.strip().upper()
            if chave_tag in por_tag:
                raise RuntimeError(f"Tag duplicada no ClanEvento: {chave_tag}. Banco não alterado.")
            por_tag[chave_tag] = jogador
        elif nome:
            chave_nome = normalizar(nome)
            if chave_nome in por_nome_sem_tag:
                raise RuntimeError(f"Nome duplicado sem tag: {nome}. Banco não alterado.")
            por_nome_sem_tag[chave_nome] = jogador

    entradas_detectadas = [] if primeira_fotografia else [
        membro for membro in membros_api
        if membro["player_tag"] not in tags_anteriores
    ]

    # Mantém registros e lançamentos históricos; apenas altera o estado atual.
    db.table("players").update({"active": False}).neq("name", "").execute()

    novos = atualizados = reativados = nomes_divergentes = 0
    for membro in membros_api:
        nome_api = membro["name"]
        player_tag = membro["player_tag"]
        existente = por_tag.get(player_tag)
        if existente is None:
            existente = por_nome_sem_tag.get(normalizar(nome_api))

        if existente is not None:
            nome_cadastrado = existente["name"]
            tag_antiga = existente.get("player_tag")
            estava_ativo = bool(existente.get("active"))
            atualizacao = {"player_tag": player_tag, "active": True}
            if tag_antiga:
                db.table("players").update(atualizacao).eq("player_tag", tag_antiga).execute()
            else:
                db.table("players").update(atualizacao).eq("name", nome_cadastrado).execute()

            if normalizar(nome_cadastrado) != normalizar(nome_api):
                nomes_divergentes += 1
            if estava_ativo:
                atualizados += 1
            else:
                reativados += 1
        else:
            db.table("players").insert({
                "name": nome_api,
                "player_tag": player_tag,
                "active": True,
                "eligible": "Elegível",
                "whatsapp": "Sim",
            }).execute()
            novos += 1

    historico_inseridos = 0
    for membro in entradas_detectadas:
        db.table("clan_member_entry_history").insert({
            "player_tag": membro["player_tag"],
            "player_name": membro["name"],
            "is_baseline": False,
            "source": "clan_api",
        }).execute()
        historico_inseridos += 1

    # Atualiza a fotografia somente depois de concluir o processamento.
    # Isso permite detectar saídas e retornos mesmo se players.active foi
    # alterado manualmente entre sincronizações.
    db.table("clan_sync_state").upsert({
        "id": "current_roster",
        "member_tags": [membro["player_tag"] for membro in membros_api],
        "synced_at": "now()",
    }, on_conflict="id").execute()

    print(f"Membros retornados pela API: {len(membros_api)}")
    print(f"Primeira fotografia do roster: {'sim' if primeira_fotografia else 'não'}")
    print(f"Cadastros atualizados: {atualizados}")
    print(f"Jogadores reativados: {reativados}")
    print(f"Novos jogadores cadastrados: {novos}")
    print(f"Novas entradas registradas no histórico: {historico_inseridos}")
    print(f"Nomes diferentes preservados por vínculo histórico: {nomes_divergentes}")
    print("Jogadores ausentes do clã marcados como inativos.")
    print("Nenhum cadastro ou lançamento histórico foi excluído.")
    print("Sincronização concluída por tag.")


if __name__ == "__main__":
    try:
        main()
    except Exception as erro:
        print(f"ERRO: {erro}", file=sys.stderr)
        sys.exit(1)
