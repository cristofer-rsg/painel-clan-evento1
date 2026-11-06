
import json
import os
import sys
import urllib.request
import urllib.error
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
            "User-Agent": "ClanEvento/1.0"
        }
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            dados = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as erro:
        detalhe = erro.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Erro na API ({erro.code}): {detalhe}")

    membros = dados.get("items")

    if not isinstance(membros, list):
        raise RuntimeError("A API não retornou a lista de membros.")

    return membros


def main():
    token = "".join(os.environ["CLASH_API_TOKEN"].split())

    partes = token.split(".")
    if len(partes) != 3 or any(not p for p in partes):
        raise RuntimeError("Token incompleto ou em formato inválido.")

    url = os.environ["SUPABASE_URL"].strip().rstrip("/")
    chave = os.environ["SUPABASE_SECRET_KEY"].strip()

    if not url.startswith("https://"):
        raise RuntimeError("SUPABASE_URL inválida.")

    membros = buscar_membros(token)

    membros_api = {}

    for membro in membros:
        if not isinstance(membro, dict):
            continue

        nome = membro.get("name")
        tag = membro.get("tag")

        if not isinstance(nome, str) or not nome.strip():
            continue

        if not isinstance(tag, str) or not tag.strip():
            raise RuntimeError(
                f"A API não retornou a tag de um jogador: {nome}"
            )

        nome = nome.strip()
        membros_api.setdefault(
            normalizar(nome),
            {"name": nome, "player_tag": tag.strip()}
        )

    if not membros_api:
        raise RuntimeError("Nenhum membro encontrado. Banco não alterado.")

    db = create_client(url, chave)

    cadastrados = (
        db.table("players")
        .select("name")
        .execute()
        .data or []
    )

    existentes = {}

    for jogador in cadastrados:
        nome = jogador.get("name")

        if not nome:
            continue

        chave_nome = normalizar(nome)

        if chave_nome in existentes:
            raise RuntimeError(
                f"Existem nomes duplicados no banco: {nome}"
            )

        existentes[chave_nome] = nome

    novos = 0
    tags_atualizadas = 0

    for chave_nome, membro in membros_api.items():
        nome_api = membro["name"]
        player_tag = membro["player_tag"]

        if chave_nome in existentes:
            nome_banco = existentes[chave_nome]

            db.table("players").update({
                "player_tag": player_tag
            }).eq("name", nome_banco).execute()

            tags_atualizadas += 1

        else:
            db.table("players").insert({
                "name": nome_api,
                "player_tag": player_tag,
                "eligible": "Elegível",
                "whatsapp": "Sim"
            }).execute()

            novos += 1

    print(f"Membros encontrados: {len(membros_api)}")
    print(f"Novos jogadores cadastrados: {novos}")
    print(f"Tags atualizadas: {tags_atualizadas}")
    print("Sincronização concluída!")


if __name__ == "__main__":
    try:
        main()
    except Exception as erro:
        print(f"ERRO: {erro}", file=sys.stderr)
        sys.exit(1)
