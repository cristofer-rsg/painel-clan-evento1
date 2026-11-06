import json
import os
import sys
import urllib.request
import urllib.error
from urllib.parse import quote

from supabase import create_client

CLAN_TAG = "#2GCGP0RQ9"
API_URL = "https://cocproxy.royaleapi.dev/v1"


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
    token = os.environ["CLASH_API_TOKEN"]
    url = os.environ["SUPABASE_URL"]
    chave = os.environ["SUPABASE_SECRET_KEY"]

    membros = buscar_membros(token)

    nomes = sorted({
        m["name"].strip()
        for m in membros
        if isinstance(m, dict) and m.get("name", "").strip()
    })

    if not nomes:
        raise RuntimeError("Nenhum membro encontrado. Banco não alterado.")

    db = create_client(url, chave)

    cadastrados = (
        db.table("players")
        .select("name")
        .execute()
        .data or []
    )

    existentes = {p["name"] for p in cadastrados}

    novos = [nome for nome in nomes if nome not in existentes]

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

    print(f"Membros encontrados: {len(nomes)}")
    print(f"Novos cadastrados: {len(novos)}")
    print("Sincronização concluída!")


if __name__ == "__main__":
    try:
        main()
    except Exception as erro:
        print(f"ERRO: {erro}", file=sys.stderr)
        sys.exit(1)
