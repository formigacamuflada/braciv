# Site do BRA.CIV

React + Vite + Tailwind CSS; o grafo é desenhado com sigma.js (WebGL) e graphology.

Os dados não ficam aqui: na publicação, `coletores/grafo.py` gera `dados/grafo/`,
que é copiado para `public/dados/` antes do build (ver `.github/workflows/site.yml`).

Para rodar no computador: `npm install`, copiar `../dados/grafo/*` para `public/dados/` e `npm run dev`.
