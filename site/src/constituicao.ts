// Trechos literais da Constituição Federal, conferidos em
// https://www.planalto.gov.br/ccivil_03/constituicao/constituicao.htm (07/10/2026).
export const FONTE_CF = "https://www.planalto.gov.br/ccivil_03/constituicao/constituicao.htm";

export type Base = { dispositivo: string; texto: string };

export const CF: Record<string, Base> = {
  "1u": { dispositivo: "CF, art. 1º, parágrafo único", texto: "Todo o poder emana do povo, que o exerce por meio de representantes eleitos ou diretamente, nos termos desta Constituição." },
  "2": { dispositivo: "CF, art. 2º", texto: "São Poderes da União, independentes e harmônicos entre si, o Legislativo, o Executivo e o Judiciário." },
  "14": { dispositivo: "CF, art. 14", texto: "A soberania popular será exercida pelo sufrágio universal e pelo voto direto e secreto, com valor igual para todos, e, nos termos da lei, mediante: (…)" },
  "44": { dispositivo: "CF, art. 44", texto: "O Poder Legislativo é exercido pelo Congresso Nacional, que se compõe da Câmara dos Deputados e do Senado Federal." },
  "45": { dispositivo: "CF, art. 45", texto: "A Câmara dos Deputados compõe-se de representantes do povo, eleitos, pelo sistema proporcional, em cada Estado, em cada Território e no Distrito Federal." },
  "46": { dispositivo: "CF, art. 46", texto: "O Senado Federal compõe-se de representantes dos Estados e do Distrito Federal, eleitos segundo o princípio majoritário." },
  "49x": { dispositivo: "CF, art. 49, X", texto: "fiscalizar e controlar, diretamente, ou por qualquer de suas Casas, os atos do Poder Executivo, incluídos os da administração indireta;" },
  "52iii": { dispositivo: "CF, art. 52, III", texto: "aprovar previamente, por voto secreto, após argüição pública, a escolha de: a) Magistrados, nos casos estabelecidos nesta Constituição; (…) d) Presidente e diretores do banco central; e) Procurador-Geral da República; (…)" },
  "76": { dispositivo: "CF, art. 76", texto: "O Poder Executivo é exercido pelo Presidente da República, auxiliado pelos Ministros de Estado." },
  "77": { dispositivo: "CF, art. 77", texto: "A eleição do Presidente e do Vice-Presidente da República realizar-se-á, simultaneamente, noventa dias antes do término do mandato presidencial vigente." },
  "84i": { dispositivo: "CF, art. 84, I", texto: "nomear e exonerar os Ministros de Estado;" },
  "84xiv": { dispositivo: "CF, art. 84, XIV", texto: "nomear, após aprovação pelo Senado Federal, os Ministros do Supremo Tribunal Federal e dos Tribunais Superiores, os Governadores de Territórios, o Procurador-Geral da República, o presidente e os diretores do banco central e outros servidores, quando determinado em lei;" },
  "87i": { dispositivo: "CF, art. 87, parágrafo único, I", texto: "exercer a orientação, coordenação e supervisão dos órgãos e entidades da administração federal na área de sua competência e referendar os atos e decretos assinados pelo Presidente da República;" },
  "101u": { dispositivo: "CF, art. 101, parágrafo único", texto: "Os Ministros do Supremo Tribunal Federal serão nomeados pelo Presidente da República, depois de aprovada a escolha pela maioria absoluta do Senado Federal." },
  "102": { dispositivo: "CF, art. 102", texto: "Compete ao Supremo Tribunal Federal, precipuamente, a guarda da Constituição, cabendo-lhe: (…)" },
  "127": { dispositivo: "CF, art. 127", texto: "O Ministério Público é instituição permanente, essencial à função jurisdicional do Estado, incumbindo-lhe a defesa da ordem jurídica, do regime democrático e dos interesses sociais e individuais indisponíveis." },
};
