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
        raise RuntimeError(
            f"Erro na API ({erro.code}): {detalhe}"
        )

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

    nomes_api = {}

    for membro in membros:
        if not isinstance(membro, dict):
            continue

        nome = membro.get("name")

        if isinstance(nome, str) and nome.strip():
            nome = nome.strip()
            nomes_api.setdefault(normalizar(nome), nome)

    if not nomes_api:
        raise RuntimeError(
            "Nenhum membro encontrado. Banco não alterado."
        )

    db = create_client(url, chave)

    cadastrados = (
        db.table("players")
        .select("name")
        .execute()
        .data or []
    )

    nomes_existentes = {
        normalizar(p["name"])
        for p in cadastrados
        if p.get("name")
    }

    novos = [
        nome
        for chave_nome, nome in nomes_api.items()
        if chave_nome not in nomes_existentes
    ]

    if novos:
        registros = [
            {
                "name": nome,
                "eligible": "Elegível",
                "whatsapp": "Sim"
            }
            for nome in novos
        ]

        db.table("players").insert(registros).execute()

    print(f"Membros encontrados: {len(nomes_api)}")
    print(f"Novos cadastrados: {len(novos)}")
    print("Sincronização concluída!")


if __name__ == "__main__":
    try:
        main()
    except Exception as erro:
        print(f"ERRO: {erro}", file=sys.stderr)
        sys.exit(1)
