"""Contorno oficial dos 27 estados (IBGE, API de malhas v3) para o mapa do site.

Fontes:
  https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR?intrarregiao=UF&qualidade=minima&formato=application/vnd.geo+json
  https://servicodados.ibge.gov.br/api/v1/localidades/estados   (sigla, nome e regiao de cada codigo)

Grava dados/ibge_ufs.json (GeoJSON com sigla, nome e regiao em cada estado).
Uso: python coletores/ibge.py
"""
import json
import pathlib

import requests

MALHA = "https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR"
ESTADOS = "https://servicodados.ibge.gov.br/api/v1/localidades/estados"
SAIDA = pathlib.Path(__file__).resolve().parent.parent / "dados" / "ibge_ufs.json"


def main():
    malha = requests.get(MALHA, params={"intrarregiao": "UF", "qualidade": "minima", "formato": "application/vnd.geo+json"}, timeout=120)
    malha.raise_for_status()
    estados = {str(e["id"]): e for e in requests.get(ESTADOS, timeout=60).json()}
    geo = malha.json()
    for f in geo["features"]:
        e = estados[f["properties"]["codarea"]]
        f["properties"] = {"codarea": f["properties"]["codarea"], "sigla": e["sigla"], "nome": e["nome"], "regiao": e["regiao"]["nome"]}
    geo["features"].sort(key=lambda f: f["properties"]["sigla"])
    SAIDA.write_text(json.dumps(geo, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{len(geo['features'])} estados gravados")


if __name__ == "__main__":
    main()
