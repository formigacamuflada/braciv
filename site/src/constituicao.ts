// Trechos literais da Constituição Federal, conferidos em
// https://www.planalto.gov.br/ccivil_03/constituicao/constituicao.htm (07/10/2026).
export const FONTE_CF = "https://www.planalto.gov.br/ccivil_03/constituicao/constituicao.htm";

export type Base = { dispositivo: string; texto: string; fonte?: string };

// Regimentos internos (textos conferidos em 07/10/2026 nas páginas oficiais de cada Casa)
export const FONTE_RICD = "https://www2.camara.leg.br/legin/fed/rescad/1989/resolucaodacamaradosdeputados-17-21-setembro-1989-320110-normaatualizada-pl.html";
export const FONTE_RISF = "https://legis.senado.leg.br/norma/563958/publicacao/16433779";
export const REG: Record<string, Base> = {
  ricd7: { fonte: FONTE_RICD, dispositivo: "Regimento Interno da Câmara, art. 7º", texto: "A eleição dos membros da Mesa far-se-á em votação por escrutínio secreto e pelo sistema eletrônico, exigido maioria absoluta de votos, em primeiro escrutínio, e maioria simples, em segundo escrutínio, presente a maioria absoluta dos Deputados, (…)" },
  ricd9: { fonte: FONTE_RICD, dispositivo: "Regimento Interno da Câmara, art. 9º", texto: "Os Deputados são agrupados por representações partidárias ou de Blocos Parlamentares, cabendo-lhes escolher o Líder quando a representação atender os requisitos estabelecidos no § 3º do art. 17 da Constituição Federal." },
  ricd28: { fonte: FONTE_RICD, dispositivo: "Regimento Interno da Câmara, art. 28", texto: "(…) os Líderes comunicarão à Presidência, no prazo de 5 (cinco) sessões, os nomes dos membros das respectivas bancadas que, como titulares e suplentes, as integrarão; (…)" },
  ricd39: { fonte: FONTE_RICD, dispositivo: "Regimento Interno da Câmara, art. 39", texto: "As Comissões terão 1 (um) Presidente e 3 (três) Vice-Presidentes, eleitos por seus pares, com mandato até a posse dos novos componentes eleitos no ano subsequente, vedada a reeleição." },
  risf60: { fonte: FONTE_RISF, dispositivo: "Regimento Interno do Senado, art. 60", texto: "A eleição dos membros da Mesa será feita em escrutínio secreto, exigida maioria de votos, presente a maioria da composição do Senado (…)" },
  risf65p6: { fonte: FONTE_RISF, dispositivo: "Regimento Interno do Senado, art. 65, § 6º", texto: "A indicação dos líderes partidários será feita no início da primeira e da terceira sessões legislativas de cada legislatura, e comunicada à Mesa em documento subscrito pela maioria dos membros da respectiva bancada, podendo a mesma maioria substituí-los em qualquer oportunidade." },
  risf78: { fonte: FONTE_RISF, dispositivo: "Regimento Interno do Senado, art. 78", texto: "Os membros das comissões serão designados pelo Presidente, por indicação escrita dos respectivos líderes, (…)" },
  risf88: { fonte: FONTE_RISF, dispositivo: "Regimento Interno do Senado, art. 88", texto: "(…) cada comissão reunir-se-á para instalar seus trabalhos e eleger, em escrutínio secreto, seu Presidente e Vice-Presidente." },
};

export const CF: Record<string, Base> = {
  "101": { dispositivo: "CF, art. 101", texto: "O Supremo Tribunal Federal compõe-se de onze Ministros, escolhidos dentre cidadãos com mais de trinta e cinco e menos de setenta anos de idade, de notável saber jurídico e reputação ilibada." },
  "104": { dispositivo: "CF, art. 104", texto: "O Superior Tribunal de Justiça compõe-se de, no mínimo, trinta e três Ministros." },
  "111a": { dispositivo: "CF, art. 111-A", texto: "O Tribunal Superior do Trabalho compõe-se de vinte e sete Ministros, escolhidos dentre brasileiros com mais de trinta e cinco e menos de setenta anos de idade, de notável saber jurídico e reputação ilibada, nomeados pelo Presidente da República após aprovação pela maioria absoluta do Senado Federal, sendo: (…)" },
  "119": { dispositivo: "CF, art. 119", texto: "O Tribunal Superior Eleitoral compor-se-á, no mínimo, de sete membros, escolhidos: (…)" },
  "123": { dispositivo: "CF, art. 123", texto: "O Superior Tribunal Militar compor-se-á de quinze Ministros vitalícios, nomeados pelo Presidente da República, depois de aprovada a indicação pelo Senado Federal, sendo três dentre oficiais-generais da Marinha, quatro dentre oficiais-generais do Exército, três dentre oficiais-generais da Aeronáutica, todos da ativa e do posto mais elevado da carreira, e cinco dentre civis." },
  "103b": { dispositivo: "CF, art. 103-B", texto: "O Conselho Nacional de Justiça compõe-se de 15 (quinze) membros com mandato de 2 (dois) anos, admitida 1 (uma) recondução, sendo: (…)" },
  "58p1": { dispositivo: "CF, art. 58, § 1º", texto: "Na constituição das Mesas e de cada Comissão, é assegurada, tanto quanto possível, a representação proporcional dos partidos ou dos blocos parlamentares que participam da respectiva Casa." },
  "1u": { dispositivo: "CF, art. 1º, parágrafo único", texto: "Todo o poder emana do povo, que o exerce por meio de representantes eleitos ou diretamente, nos termos desta Constituição." },
  "2": { dispositivo: "CF, art. 2º", texto: "São Poderes da União, independentes e harmônicos entre si, o Legislativo, o Executivo e o Judiciário." },
  "14": { dispositivo: "CF, art. 14", texto: "A soberania popular será exercida pelo sufrágio universal e pelo voto direto e secreto, com valor igual para todos, e, nos termos da lei, mediante: (…)" },
  "44": { dispositivo: "CF, art. 44", texto: "O Poder Legislativo é exercido pelo Congresso Nacional, que se compõe da Câmara dos Deputados e do Senado Federal." },
  "57p4": { dispositivo: "CF, art. 57, § 4º", texto: "Cada uma das Casas reunir-se-á em sessões preparatórias, a partir de 1º de fevereiro, no primeiro ano da legislatura, para a posse de seus membros e eleição das respectivas Mesas, para mandato de 2 (dois) anos, vedada a recondução para o mesmo cargo na eleição imediatamente subseqüente." },
  "57p5": { dispositivo: "CF, art. 57, § 5º", texto: "A Mesa do Congresso Nacional será presidida pelo Presidente do Senado Federal, e os demais cargos serão exercidos, alternadamente, pelos ocupantes de cargos equivalentes na Câmara dos Deputados e no Senado Federal." },
  "58": { dispositivo: "CF, art. 58", texto: "O Congresso Nacional e suas Casas terão comissões permanentes e temporárias, constituídas na forma e com as atribuições previstas no respectivo regimento ou no ato de que resultar sua criação." },
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
