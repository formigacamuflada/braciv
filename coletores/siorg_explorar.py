"""Descobre como percorrer a arvore de orgaos do SIORG.

A API do SIORG (estruturaorganizacional.dados.gov.br) nao tem documentacao
publica de endpoints que eu tenha conseguido abrir. Confirmei que
/doc/unidade-organizacional/26 devolve a Presidencia da Republica, mas os
caminhos que tentei para listar unidades filhas deram 404.

Este script testa candidatos contra o servidor de verdade e relata o que
responde. Nao grava nada: e so reconhecimento.

Uso: python coletores/siorg_explorar.py
"""
import json
import urllib.error
import urllib.request

BASE = "https://estruturaorganizacional.dados.gov.br"
PRESIDENCIA = 26   # confirmado: Presidencia da Republica


def tenta(caminho):
    url = BASE + caminho
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=40) as r:
            corpo = r.read().decode("utf-8", "replace")
            return r.status, corpo
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")[:200]
    except Exception as e:
        return None, f"{type(e).__name__}: {e}"


CANDIDATOS = [
    # o que ja funciona, para servir de controle
    f"/doc/unidade-organizacional/{PRESIDENCIA}",
    f"/doc/unidade-organizacional/{PRESIDENCIA}.json",
    # variacoes de "completa" e de listagem de filhas
    f"/doc/unidade-organizacional/{PRESIDENCIA}/completa",
    f"/doc/unidade-organizacional/completa/{PRESIDENCIA}",
    f"/doc/unidade-organizacional/lista/{PRESIDENCIA}",
    f"/doc/unidade-organizacional/filhas/{PRESIDENCIA}",
    f"/doc/unidade-organizacional/subordinadas/{PRESIDENCIA}",
    f"/doc/unidade-organizacional/codigoUnidadePai/{PRESIDENCIA}",
    f"/doc/unidade-organizacional?codigoUnidadePai={PRESIDENCIA}",
    # estrutura organizacional
    f"/doc/estrutura-organizacional/{PRESIDENCIA}",
    f"/doc/estrutura-organizacional/completa/{PRESIDENCIA}",
    f"/doc/estrutura-organizacional/atual/{PRESIDENCIA}",
    "/doc/estrutura-organizacional",
    # catalogos que podem listar tudo de uma vez
    "/doc/cargo-funcao/alocados-estrutura.json",
    "/doc/cargo-funcao/alocados-estrutura",
    "/doc/esfera",
    "/doc/poder",
    "/doc/tipo-unidade",
    "/doc/natureza-juridica",
    # descoberta de documentacao
    "/swagger-ui/index.html",
    "/v3/api-docs",
    "/openapi.json",
]


def main():
    print(f"SIORG - reconhecimento de endpoints (base {BASE})\n")
    funcionaram = []
    for caminho in CANDIDATOS:
        status, corpo = tenta(caminho)
        marca = "OK  " if status == 200 else f"{status if status else 'ERRO'}"
        print(f"[{marca}] {caminho}")
        if status == 200:
            funcionaram.append(caminho)
            try:
                d = json.loads(corpo)
                chaves = list(d)[:8] if isinstance(d, dict) else f"lista com {len(d)} itens"
                print(f"        chaves: {chaves}")
            except Exception:
                print(f"        corpo: {corpo[:160]}")
            print(f"        {len(corpo)} bytes")

    print("\n--- varredura de codigos vizinhos ---")
    print("(para ver se da para percorrer a arvore so incrementando o codigo)")
    for cod in [1, 2, 25, 26, 27, 100, 208613]:   # 208613 = a unidade-pai da Presidencia
        status, corpo = tenta(f"/doc/unidade-organizacional/{cod}")
        if status == 200:
            try:
                u = json.loads(corpo).get("unidade", {})
                pai = (u.get("codigoUnidadePai") or "").rsplit("/", 1)[-1]
                print(f"  {cod}: {u.get('sigla')} - {u.get('nome')} (pai: {pai})")
            except Exception:
                print(f"  {cod}: resposta ilegivel")
        else:
            print(f"  {cod}: HTTP {status}")

    print(f"\nendpoints que responderam 200: {len(funcionaram)}")
    for c in funcionaram:
        print(" ", c)


if __name__ == "__main__":
    main()
