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
            "User-Agent": "ClanEvento/2.0",
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
        raise RuntimeError("A API não retornou uma lista válida de membros.")
    if not membros:
        raise RuntimeError("A API retornou zero membros. Banco não alterado.")

    resultado = {}
    tags_vistas = set()

    for membro in membros:
        if not isinstance(membro, dict):
            raise RuntimeError("A API retornou um membro em formato inválido.")

        nome = membro.get("name")
        tag_jogador = membro.get("tag")

        if not isinstance(nome, str) or not nome.strip():
            raise RuntimeError("A API retornou um jogador sem nome.")
        if not isinstance(tag_jogador, str) or not tag_jogador.strip():
            raise RuntimeError(f"A API não retornou a tag de {nome}.")

        nome = nome.strip()
        tag_jogador = tag_jogador.strip().upper()

        if tag_jogador in tags_vistas:
            raise RuntimeError(f"Tag duplicada na resposta da API: {tag_jogador}")

        tags_vistas.add(tag_jogador)
        resultado[tag_jogador] = {"name": nome, "player_tag": tag_jogador}

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

    # Primeiro valida a lista inteira da API. Nenhuma alteração é feita antes disso.
    membros_api = buscar_membros(token)
    db = create_client(url, chave)

    cadastrados = (
        db.table("players")
        .select("name,player_tag,active")
        .execute()
        .data or []
    )

    por_tag = {}
    por_nome_sem_tag = {}

    for jogador in cadastrados:
        nome = jogador.get("name")
        tag = jogador.get("player_tag")

        if tag:
            chave_tag = tag.strip().upper()
            if chave_tag in por_tag:
                raise RuntimeError(
                    f"Tag duplicada no cadastro do ClanEvento: {chave_tag}. "
                    "Banco não alterado."
                )
            por_tag[chave_tag] = jogador
        elif nome:
            chave_nome = normalizar(nome)
            if chave_nome in por_nome_sem_tag:
                raise RuntimeError(
                    f"Nome duplicado sem tag no cadastro: {nome}. "
                    "Banco não alterado."
                )
            por_nome_sem_tag[chave_nome] = jogador

    # Desativa todos antes de reativar os membros presentes na resposta validada.
    # Os registros não são excluídos; o histórico continua ligado ao cadastro.
    db.table("players").update({"active": False}).neq("name", "").execute()

    novos = 0
    atualizados = 0
    reativados = 0

    for membro in membros_api:
        nome_api = membro["name"]
        tag_api = membro["player_tag"]

        existente = por_tag.get(tag_api)
        if existente is None:
            # Migração segura de cadastros antigos que ainda não tinham player_tag.
            existente = por_nome_sem_tag.get(normalizar(nome_api))

        if existente is not None:
            nome_antigo = existente["name"]
            tag_antiga = existente.get("player_tag")
            estava_ativo = bool(existente.get("active"))

            atualizacao = {
                "name": nome_api,
                "player_tag": tag_api,
                "active": True,
            }

            if tag_antiga:
                db.table("players").update(atualizacao).eq(
                    "player_tag", tag_antiga
                ).execute()
            else:
                db.table("players").update(atualizacao).eq(
                    "name", nome_antigo
                ).execute()

            if estava_ativo:
                atualizados += 1
            else:
                reativados += 1
        else:
            db.table("players").insert({
                "name": nome_api,
                "player_tag": tag_api,
                "active": True,
                "eligible": "Elegível",
                "whatsapp": "Sim",
            }).execute()
            novos += 1

    print(f"Membros retornados pela API: {len(membros_api)}")
    print(f"Cadastros atualizados: {atualizados}")
    print(f"Jogadores reativados: {reativados}")
    print(f"Novos jogadores cadastrados: {novos}")
    print("Jogadores que não estão no clã foram marcados como inativos.")
    print("Nenhum cadastro foi excluído; o histórico foi preservado.")
    print("Sincronização concluída com identificação por tag.")


if __name__ == "__main__":
    try:
        main()
    except Exception as erro:
        print(f"ERRO: {erro}", file=sys.stderr)
        sys.exit(1)
