# BRA.CIV — Grafo dos 3 Poderes

Mapa interativo das pessoas e posições de poder no governo federal brasileiro.
Equivalente brasileiro do graph.civlab.org/us.

## Estrutura

- `coletores/` — scripts que buscam dados nas fontes oficiais
- `dados/` — os arquivos JSON do grafo (é o "banco de dados" do projeto)
- `.github/workflows/` — rotinas que rodam sozinhas todo dia no GitHub

## Por que roda no GitHub

O ambiente do Claude não alcança sites .gov.br. O GitHub Actions alcança,
roda de graça e é onde isso precisa rodar em produção de qualquer forma.
