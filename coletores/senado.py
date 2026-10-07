"""Coleta senadores em exercício e a Comissão Diretora (Mesa) do Senado.
Fonte: https://legis.senado.leg.br/dadosabertos — aberta, sem chave."""
import json, pathlib, urllib.request

URL = "https://legis.senado.leg.br/dadosabertos/senador/lista/atual.json"
MESA = "https://legis.senado.leg.br/dadosabertos/composicao/mesaSF.json"
SAIDA = pathlib.Path(__file__).parent.parent / "dados"


def main():
    SAIDA.mkdir(exist_ok=True)
    req = urllib.request.Request(URL, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        corpo = json.load(r)
    lista = corpo["ListaParlamentarEmExercicio"]["Parlamentares"]["Parlamentar"]
    (SAIDA / "senado_senadores.json").write_text(
        json.dumps(lista, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"senadores: {len(lista)}")
    req = urllib.request.Request(MESA, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        mesa = json.load(r)
    col = mesa["MesaSenado"]["Colegiados"]["Colegiado"]
    col = col[0] if isinstance(col, list) else col
    cargos = col["Cargos"]["Cargo"]
    (SAIDA / "senado_mesa.json").write_text(json.dumps({"colegiado": col.get("NomeColegiado"), "versao": mesa["MesaSenado"]["Metadados"].get("Versao"),
                                                        "cargos": cargos if isinstance(cargos, list) else [cargos]}, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"comissao diretora: {len(cargos)} cargos")


if __name__ == "__main__":
    main()
