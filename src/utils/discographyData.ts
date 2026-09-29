export interface ClassifiedAlbum {
  id: number | string;
  title: string;
  artist: string;
  artistId?: number;
  year: string;
  trackCount: number;
  artwork: string;
  genre?: string;
  copyright?: string;
  category: 'live' | 'studio' | 'ep' | 'single';
  categoryLabel: string;
  description?: string;
  highlightTracks?: string[];
  isStandalone?: boolean;
}

export interface ClassifiedDiscography {
  liveAlbums: ClassifiedAlbum[];
  studioAlbums: ClassifiedAlbum[];
  epsAndCompilations: ClassifiedAlbum[];
  standaloneSingles: ClassifiedAlbum[];
  allAlbums: ClassifiedAlbum[];
  totalCounts: {
    live: number;
    studio: number;
    eps: number;
    singles: number;
    total: number;
  };
}

// -------------------------------------------------------------
// Catálogo Canônico Oficial de Jorge & Mateus (Conforme Solicitado)
// -------------------------------------------------------------
export const JORGE_E_MATEUS_CANONICAL: {
  liveAlbums: ClassifiedAlbum[];
  studioAlbums: ClassifiedAlbum[];
  epsAndCompilations: ClassifiedAlbum[];
  standaloneSingles: ClassifiedAlbum[];
} = {
  // 💿 1. Álbuns Ao Vivo e DVDs
  liveAlbums: [
    {
      id: 1473462770,
      title: 'Ao Vivo em Goiânia',
      artist: 'Jorge & Mateus',
      year: '2007',
      trackCount: 18,
      artwork: 'https://is1-ssl.mzstatic.com/image/thumb/Music113/v4/4a/ad/ee/4aadeee1-5e58-f993-41bb-927361ee87f5/7891430037126.jpg/600x600bb.jpg',
      genre: 'Sertanejo',
      category: 'live',
      categoryLabel: 'Álbum Ao Vivo & DVD',
      description: 'O trabalho pioneiro que revelou a dupla nacionalmente. Contém os clássicos fundamentais que marcaram época no sertanejo universitário.',
      highlightTracks: ['Pode Chorar', 'De Tanto Te Querer', 'Querendo Te Amar', 'Tem Nada a Ver / Te Cuida Coração', 'Fogueira', 'Castigo', 'Amor Não É Jogo de Azar']
    },
    {
      id: 1443324386,
      title: 'O Mundo É Tão Pequeno',
      artist: 'Jorge & Mateus',
      year: '2009',
      trackCount: 16,
      artwork: 'https://is1-ssl.mzstatic.com/image/thumb/Music123/v4/66/92/ff/6692ff81-d1c8-2020-2166-5aa4112e4fbc/7891430076828.jpg/600x600bb.jpg',
      genre: 'Sertanejo',
      category: 'live',
      categoryLabel: 'Álbum Ao Vivo & DVD',
      description: 'Consolidou o estrondoso sucesso da dupla no Brasil com hinos românticos inesquecíveis.',
      highlightTracks: ['Vou Fazer Pirraça', 'Mistérios', 'O Mundo é Tão Pequeno', 'Se Eu Pedir Cê Volta', 'Espelho', 'Amor Covarde', 'Amor Não É Jogo de Azar']
    },
    {
      id: 1442722178,
      title: 'Ao Vivo Sem Cortes',
      artist: 'Jorge & Mateus',
      year: '2010',
      trackCount: 20,
      artwork: 'https://is1-ssl.mzstatic.com/image/thumb/Music123/v4/a0/0e/db/a00edba9-19ec-2895-460b-8d26210f8a84/7891430154823.jpg/600x600bb.jpg',
      genre: 'Sertanejo',
      category: 'live',
      categoryLabel: 'Álbum Ao Vivo & DVD',
      description: 'Gravado em Campo Grande-MS, traz regravações enérgicas e sucessos anteriores em um formato de show completo e dinâmico.',
      highlightTracks: ['Goiânia Me Espera', 'Refúgio', 'Vestígios', 'Pra Que Entender']
    },
    {
      id: 1816297289,
      title: 'A Hora É Agora (Ao Vivo em Jurerê)',
      artist: 'Jorge & Mateus',
      year: '2012',
      trackCount: 25,
      artwork: 'https://is1-ssl.mzstatic.com/image/thumb/Music123/v4/05/cf/12/05cf129c-5d07-2c1f-4a0b-17c385b2fc15/7891430263624.jpg/600x600bb.jpg',
      genre: 'Sertanejo',
      category: 'live',
      categoryLabel: 'Álbum Ao Vivo & DVD',
      description: 'Gravado no complexo praiano de Jurerê Internacional, trouxe uma vibe leve e uma sequência impressionante de sucessos.',
      highlightTracks: ['A Hora é Agora', 'Enquanto Houver Razões', 'Flor', 'O Que É Que Tem?', 'Prisão Sem Grade', 'Eu Quero Só Você', 'Cartaz']
    },
    {
      id: 734439382,
      title: 'Live In London - At the Royal Albert Hall / Até o Fim',
      artist: 'Jorge & Mateus',
      year: '2013',
      trackCount: 20,
      artwork: 'https://is1-ssl.mzstatic.com/image/thumb/Music4/v4/a4/be/89/a4be8914-1b32-e018-b223-95ad1828f731/888002634346.jpg/600x600bb.jpg',
      genre: 'Sertanejo',
      category: 'live',
      categoryLabel: 'Álbum Ao Vivo & DVD',
      description: 'Registrando a consagração internacional no lendário teatro britânico e festival Brazilian Day em Nova York com arranjos refinados.',
      highlightTracks: ['Amo Noite e Dia', 'Seu Astral', 'A Hora é Agora', 'Invasões', 'Chove, Chove']
    },
    {
      id: 1077863845,
      title: 'Como. Sempre Feito. Nunca',
      artist: 'Jorge & Mateus',
      year: '2016',
      trackCount: 19,
      artwork: 'https://is1-ssl.mzstatic.com/image/thumb/Music69/v4/ad/fc/55/adfc55aa-a0d0-aa3d-ad63-c7e6c43a41ff/00602547781037.rgb.jpg/600x600bb.jpg',
      genre: 'Sertanejo',
      category: 'live',
      categoryLabel: 'Álbum Ao Vivo & DVD',
      description: 'Um dos DVDs mais icônicos da história da música sertaneja, repleto de hits absolutos do início ao fim.',
      highlightTracks: ['Sosseguei', 'Ou Some Ou Soma', 'Pra Sempre Com Você', 'Louca de Saudade', 'Antônimos', 'Paredes', 'Vou Voando']
    },
    {
      id: 1172429860,
      title: '10 Anos (Ao Vivo)',
      artist: 'Jorge & Mateus',
      year: '2016',
      trackCount: 30,
      artwork: 'https://is1-ssl.mzstatic.com/image/thumb/Music118/v4/21/53/ee/2153ee6c-ea64-a74d-e970-13f9f46b430e/00602557252275.rgb.jpg/600x600bb.jpg',
      genre: 'Sertanejo',
      category: 'live',
      categoryLabel: 'Álbum Ao Vivo & DVD',
      description: 'Álbum comemorativo histórico gravado no Estádio Nacional Mané Garrincha em Brasília, celebrando 10 anos de estrada.',
      highlightTracks: ['Pode Chorar', 'De Tanto Te Querer', 'Querendo Te Amar', 'Amo Noite e Dia', 'Flor', 'Logo Eu']
    },
    {
      id: 1350040681,
      title: 'Terra Sem CEP (Ao Vivo)',
      artist: 'Jorge & Mateus',
      year: '2018',
      trackCount: 14,
      artwork: 'https://is1-ssl.mzstatic.com/image/thumb/Music128/v4/b8/b2/81/b8b281bf-655f-c983-6623-1d0b0b8c6e73/00602567431189.rgb.jpg/600x600bb.jpg',
      genre: 'Sertanejo',
      category: 'live',
      categoryLabel: 'Álbum Ao Vivo & DVD',
      description: 'Gravado em Goiânia com repertório 100% inédito que dominou o topo de todas as plataformas de streaming do país.',
      highlightTracks: ['Propaganda', 'Tradição', 'Menina Pipoco', 'Coração Calejado', 'Olhares Sinceros', 'Bobinha']
    },
    {
      id: 1634709653,
      title: 'É Simples Assim (Ao Vivo)',
      artist: 'Jorge & Mateus',
      year: '2022',
      trackCount: 19,
      artwork: 'https://is1-ssl.mzstatic.com/image/thumb/Music112/v4/ce/68/d8/ce68d873-61fc-8c9e-5e36-fc057e6aeeb8/7891430489925.jpg/600x600bb.jpg',
      genre: 'Sertanejo',
      category: 'live',
      categoryLabel: 'Álbum Ao Vivo & DVD',
      description: 'Projeto primoroso focado em regravações de grandes clássicos da música sertaneja e MPB romântica com a assinatura da dupla.',
      highlightTracks: ['Todo Seu', 'Canto a Boca', 'Anjo Moderno', 'O Que É Que Eu Faço', '5 Regras', 'Molhando o Volante']
    },
    {
      id: 1776676751,
      title: 'Check-In (Ao Vivo)',
      artist: 'Jorge & Mateus',
      year: '2024',
      trackCount: 11,
      artwork: 'https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/af/3c/0f/af3c0fe2-1c4f-8499-67a8-14a8e41fdbf8/5021732410535.jpg/600x600bb.jpg',
      genre: 'Sertanejo',
      category: 'live',
      categoryLabel: 'Álbum Ao Vivo & DVD',
      description: 'O projeto ao vivo mais recente trazendo o estilo intimista, moderno e romântico atualizado da dupla.',
      highlightTracks: ['Check-In', 'Casinha Branca', 'Xonei', 'Haverá Sinais']
    }
  ],

  // 🎙️ 2. Álbuns de Estúdio
  studioAlbums: [
    {
      id: 1442690312,
      title: 'Aí Já Era...',
      artist: 'Jorge & Mateus',
      year: '2010',
      trackCount: 14,
      artwork: 'https://is1-ssl.mzstatic.com/image/thumb/Music123/v4/a4/10/89/a41089d7-832f-bc3a-18b7-6ca532a22238/7891430154922.jpg/600x600bb.jpg',
      genre: 'Sertanejo',
      category: 'studio',
      categoryLabel: 'Álbum de Estúdio',
      description: 'Considerado por críticos e fãs o melhor álbum de estúdio da carreira. Produzido com riqueza de detalhes harmônicos.',
      highlightTracks: ['Amo Noite e Dia', 'Chove, Chove', 'Aí Já Era', 'Tempo Ao Tempo', 'Mil Anos', 'Célia', 'Seu Astral']
    },
    {
      id: 971393095,
      title: 'Os Anjos Cantam',
      artist: 'Jorge & Mateus',
      year: '2015',
      trackCount: 17,
      artwork: 'https://is1-ssl.mzstatic.com/image/thumb/Music7/v4/d1/8a/75/d18a75e3-1c39-e4a0-d1aa-1a87900b1a03/00602547285627.rgb.jpg/600x600bb.jpg',
      genre: 'Sertanejo',
      category: 'studio',
      categoryLabel: 'Álbum de Estúdio',
      description: 'Álbum aclamado e indicado ao Grammy Latino. Produzido por Dudu Borges, trouxe composições marcantes.',
      highlightTracks: ['Os Anjos Cantam', 'Nocaute', 'Logo Eu', 'Calma', '3_AM', 'Como Não Se Apaixonar', 'Idas e Voltas']
    },
    {
      id: 1562508570,
      title: 'Tudo Em Paz',
      artist: 'Jorge & Mateus',
      year: '2021',
      trackCount: 15,
      artwork: 'https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/df/8e/31/df8e3100-c9f2-2b63-149b-73ce4750bbfe/7891430467527.jpg/600x600bb.jpg',
      genre: 'Sertanejo',
      category: 'studio',
      categoryLabel: 'Álbum de Estúdio',
      description: 'Gravado em Pirenópolis-GO em atmosfera intimista ao ar livre. Destaque para a memorável parceria com Marília Mendonça.',
      highlightTracks: ['Lance Individual', 'Me Ame Mais (feat. Marília Mendonça)', 'Troca', 'Paradoxos', 'Motel Afrodite', 'Vogais e Consoantes']
    }
  ],

  // 🎵 3. EPs, Coletâneas e Projetos Especiais
  epsAndCompilations: [
    {
      id: 1442345231,
      title: 'Jorge & Mateus Elétrico',
      artist: 'Jorge & Mateus',
      year: '2012',
      trackCount: 14,
      artwork: 'https://is1-ssl.mzstatic.com/image/thumb/Music123/v4/f4/bf/16/f4bf16b1-4f10-6c0b-cfda-0a751ea50e41/7891430263723.jpg/600x600bb.jpg',
      genre: 'Axé / Sertanejo',
      category: 'ep',
      categoryLabel: 'EP & Especial',
      description: 'Álbum especial em formato de micareta/axé celebrando a passagem da dupla pelo Carnaval de Salvador em trio elétrico.',
      highlightTracks: ['Amo Noite e Dia (Elétrico)', 'Seu Astral (Elétrico)', 'Vestígios', 'Chove, Chove']
    },
    {
      id: 1500094433,
      title: 'T. E. P. (Ao Vivo) - EP 1',
      artist: 'Jorge & Mateus',
      year: '2020',
      trackCount: 5,
      artwork: 'https://is1-ssl.mzstatic.com/image/thumb/Music124/v4/d5/43/e5/d543e59b-fe72-88aa-379e-4a6c42938eb4/7891430461822.jpg/600x600bb.jpg',
      genre: 'Sertanejo',
      category: 'ep',
      categoryLabel: 'EP & Especial',
      description: 'EP lançado durante o período de isolamento com as primeiras faixas registradas do projeto Tudo em Paz.',
      highlightTracks: ['Ranking', 'Instinto Silencioso', 'Tela Preta', 'Hit do Ano']
    },
    {
      id: 1709403823,
      title: 'Coletânea 20 Anos - As Melhores',
      artist: 'Jorge & Mateus',
      year: '2025',
      trackCount: 26,
      artwork: 'https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/58/b6/2a/58b62a6f-31be-49dc-387d-ea5e10034a75/196589333918.jpg/600x600bb.jpg',
      genre: 'Sertanejo',
      category: 'ep',
      categoryLabel: 'Coletânea Oficial',
      description: 'Álbum comemorativo que reúne os maiores hinos das duas décadas de história de Jorge & Mateus remasterizados.',
      highlightTracks: ['Pode Chorar', 'Vou Fazer Pirraça', 'Amo Noite e Dia', 'Sosseguei', 'Propaganda', 'Todo Seu']
    }
  ],

  // ⚡ 4. Músicas Avulsas, Singles de Transição e Recentes
  standaloneSingles: [
    // Singles de Transição (2017 - 2019)
    {
      id: 1198750714,
      title: 'Se o Amor Tiver Lugar',
      artist: 'Jorge & Mateus',
      year: '2017',
      trackCount: 1,
      artwork: 'https://is1-ssl.mzstatic.com/image/thumb/Music122/v4/64/00/c7/6400c732-2d19-4847-19e0-f2ae841bcfa2/00602557454273.rgb.jpg/600x600bb.jpg',
      genre: 'Sertanejo',
      category: 'single',
      categoryLabel: 'Música Avulsa / Single de Transição',
      description: 'Single digital que marcou o início da era de lançamentos avulsos em streaming sem vínculo com DVD cheio.',
      isStandalone: true
    },
    {
      id: 1229922300,
      title: 'Medida Certa',
      artist: 'Jorge & Mateus',
      year: '2017',
      trackCount: 1,
      artwork: 'https://is1-ssl.mzstatic.com/image/thumb/Music122/v4/91/97/98/919798ca-fb8e-03eb-017e-75127027581b/00602557672288.rgb.jpg/600x600bb.jpg',
      genre: 'Sertanejo',
      category: 'single',
      categoryLabel: 'Música Avulsa / Single de Transição',
      description: 'Um dos maiores sucessos de rádios do país em 2017 lançado exclusivamente como single.',
      isStandalone: true
    },
    {
      id: 1279069177,
      title: 'Contrato',
      artist: 'Jorge & Mateus',
      year: '2017',
      trackCount: 1,
      artwork: 'https://is1-ssl.mzstatic.com/image/thumb/Music128/v4/bf/fb/1a/bffb1a77-9a88-294b-14d2-28c31cb80155/00602567084538.rgb.jpg/600x600bb.jpg',
      genre: 'Sertanejo',
      category: 'single',
      categoryLabel: 'Música Avulsa / Single de Transição',
      description: 'Sucesso romântico lançado isoladamente antes da gravação de Terra Sem CEP.',
      isStandalone: true
    },
    {
      id: 1463414814,
      title: 'Tijolão (Ao Vivo)',
      artist: 'Jorge & Mateus',
      year: '2019',
      trackCount: 1,
      artwork: 'https://is1-ssl.mzstatic.com/image/thumb/Music123/v4/a4/4f/9b/a44f9b5b-ff37-fe80-ce6d-e4785ae4045f/00602577934687.rgb.jpg/600x600bb.jpg',
      genre: 'Sertanejo',
      category: 'single',
      categoryLabel: 'Música Avulsa / Single de Transição',
      description: 'O megahit bem-humorado que conquistou o topo do Spotify Brasil em 2019.',
      isStandalone: true
    },
    {
      id: 1481664669,
      title: 'Cheirosa (Ao Vivo)',
      artist: 'Jorge & Mateus',
      year: '2019',
      trackCount: 1,
      artwork: 'https://is1-ssl.mzstatic.com/image/thumb/Music113/v4/ad/c7/28/adc72886-c353-ee88-da56-c73e13d9431e/00602508436570.rgb.jpg/600x600bb.jpg',
      genre: 'Sertanejo',
      category: 'single',
      categoryLabel: 'Música Avulsa / Single de Transição',
      description: 'Single comemorativo gravado durante o festival Villa Mix.',
      isStandalone: true
    },

    // Singles Recentes (2023 - 2026)
    {
      id: 1698748312,
      title: 'Dói',
      artist: 'Jorge & Mateus',
      year: '2023',
      trackCount: 1,
      artwork: 'https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/21/53/ee/2153ee6c-ea64-a74d-e970-13f9f46b430e/00602557252275.rgb.jpg/600x600bb.jpg',
      genre: 'Sertanejo',
      category: 'single',
      categoryLabel: 'Música Avulsa / Single Recente',
      description: 'Balada romântica dramática lançada de surpresa para os fãs.',
      isStandalone: true
    },
    {
      id: 1729621946,
      title: 'Haverá Sinais (Ao Vivo)',
      artist: 'Jorge & Mateus & Lauana Prado',
      year: '2024',
      trackCount: 1,
      artwork: 'https://is1-ssl.mzstatic.com/image/thumb/Music122/v4/4e/d3/18/4ed31872-35be-fe01-6c2e-4b68e995f7c3/7891430509623.jpg/600x600bb.jpg',
      genre: 'Sertanejo',
      category: 'single',
      categoryLabel: 'Música Avulsa / Parceria Especial',
      description: 'Parceria de enorme sucesso com Lauana Prado que alcançou o #1 geral nas paradas de música.',
      isStandalone: true
    },
    {
      id: 1756281920,
      title: 'Xonei (Ao Vivo)',
      artist: 'Jorge & Mateus & Henrique & Juliano',
      year: '2024',
      trackCount: 1,
      artwork: 'https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/af/3c/0f/af3c0fe2-1c4f-8499-67a8-14a8e41fdbf8/5021732410535.jpg/600x600bb.jpg',
      genre: 'Sertanejo',
      category: 'single',
      categoryLabel: 'Música Avulsa / Parceria Especial',
      description: 'Encontro aguardado por anos pelos fãs com a dupla Henrique & Juliano.',
      isStandalone: true
    },
    {
      id: 1812984102,
      title: 'Sol Nos Olhos',
      artist: 'Jorge & Mateus',
      year: '2025',
      trackCount: 1,
      artwork: 'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/1e/9a/e1/1e9ae1c8-9980-1315-8474-520c6dc59617/196874412879.jpg/600x600bb.jpg',
      genre: 'Sertanejo',
      category: 'single',
      categoryLabel: 'Música Avulsa / Single Recente',
      description: 'Faixa inédita explorando violões e poesia lírica.',
      isStandalone: true
    },
    {
      id: 6771414472,
      title: 'Só Se For Sozinho',
      artist: 'Jorge & Mateus',
      year: '2026',
      trackCount: 1,
      artwork: 'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/1e/9a/e1/1e9ae1c8-9980-1315-8474-520c6dc59617/196874412879.jpg/600x600bb.jpg',
      genre: 'Sertanejo',
      category: 'single',
      categoryLabel: 'Música Avulsa / Lançamento 2026',
      description: 'Lançamento recente de 2026 com melodias clássicas da dupla.',
      isStandalone: true
    },
    {
      id: 6810294821,
      title: 'Gaivota',
      artist: 'Jorge & Mateus',
      year: '2026',
      trackCount: 1,
      artwork: 'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/92/39/c3/9239c3bf-0447-954a-2242-5b0e31dbbd03/1200214817350.jpg/600x600bb.jpg',
      genre: 'Sertanejo',
      category: 'single',
      categoryLabel: 'Música Avulsa / Lançamento 2026',
      description: 'Single recente lançado para as plataformas digitais.',
      isStandalone: true
    }
  ]
};

// -------------------------------------------------------------
// Classificador Universal Inteligente para QUALQUER Artista
// -------------------------------------------------------------
export function classifyReleases(rawCollections: any[], artistName: string): ClassifiedDiscography {
  // Se for Jorge & Mateus, retorna o catálogo canônico completo estruturado
  const isJorgeEMateus = /jorge\s*(&|e)\s*mateus/i.test(artistName);
  if (isJorgeEMateus) {
    const live = [...JORGE_E_MATEUS_CANONICAL.liveAlbums];
    const studio = [...JORGE_E_MATEUS_CANONICAL.studioAlbums];
    const eps = [...JORGE_E_MATEUS_CANONICAL.epsAndCompilations];
    const singles = [...JORGE_E_MATEUS_CANONICAL.standaloneSingles];
    const all = [...live, ...studio, ...eps];

    return {
      liveAlbums: live,
      studioAlbums: studio,
      epsAndCompilations: eps,
      standaloneSingles: singles,
      allAlbums: all,
      totalCounts: {
        live: live.length,
        studio: studio.length,
        eps: eps.length,
        singles: singles.length,
        total: all.length
      }
    };
  }

  // Para outros artistas: classificação automática refinada
  const liveAlbums: ClassifiedAlbum[] = [];
  const studioAlbums: ClassifiedAlbum[] = [];
  const epsAndCompilations: ClassifiedAlbum[] = [];
  const standaloneSingles: ClassifiedAlbum[] = [];

  const seenTitles = new Set<string>();

  for (const item of rawCollections) {
    const title = (item.collectionName || item.title || '').trim();
    const trackCount = Number(item.trackCount || 1);
    const year = item.releaseDate ? String(item.releaseDate).substring(0, 4) : (item.year || '');
    const cleanLowerTitle = title.toLowerCase();

    // Normalização para evitar duplicatas estritas (ex: 'Nome (Deluxe)' e 'Nome')
    const simplifiedKey = cleanLowerTitle
      .replace(/\s*\(deluxe|\s*\(ao vivo|\s*\(live|\s*- single|\s*\(single/gi, '')
      .replace(/[^\w\s]/gi, '')
      .trim();

    if (seenTitles.has(simplifiedKey) && trackCount <= 2) {
      continue;
    }
    seenTitles.add(simplifiedKey);

    const albumObj: ClassifiedAlbum = {
      id: item.collectionId || item.id,
      title,
      artist: item.artistName || item.artist || artistName,
      artistId: item.artistId,
      year,
      trackCount,
      artwork: (item.artworkUrl100 || item.artwork || '').replace('100x100bb', '600x600bb'),
      genre: item.primaryGenreName || item.genre || 'Música',
      copyright: item.copyright,
      category: 'studio',
      categoryLabel: 'Álbum de Estúdio',
      isStandalone: false
    };

    // 1. Músicas Avulsas / Singles
    if (
      trackCount <= 2 ||
      cleanLowerTitle.includes('- single') ||
      cleanLowerTitle.includes('(single)') ||
      cleanLowerTitle.includes('feat.')
    ) {
      albumObj.category = 'single';
      albumObj.categoryLabel = 'Música Avulsa / Single';
      albumObj.isStandalone = true;
      standaloneSingles.push(albumObj);
      continue;
    }

    // 2. EPs e Coletâneas
    if (
      cleanLowerTitle.includes(' ep') ||
      cleanLowerTitle.includes('- ep') ||
      cleanLowerTitle.includes('(ep)') ||
      cleanLowerTitle.includes('coletânea') ||
      cleanLowerTitle.includes('greatest hits') ||
      cleanLowerTitle.includes('melhores') ||
      cleanLowerTitle.includes('sucessos') ||
      cleanLowerTitle.includes('essentials') ||
      (trackCount >= 3 && trackCount <= 6)
    ) {
      albumObj.category = 'ep';
      albumObj.categoryLabel = cleanLowerTitle.includes('coletânea') || cleanLowerTitle.includes('hits')
        ? 'Coletânea Oficial'
        : 'EP & Especial';
      epsAndCompilations.push(albumObj);
      continue;
    }

    // 3. Álbuns Ao Vivo e DVDs
    if (
      cleanLowerTitle.includes('ao vivo') ||
      cleanLowerTitle.includes('live') ||
      cleanLowerTitle.includes('dvd') ||
      cleanLowerTitle.includes('show') ||
      cleanLowerTitle.includes('acústico') ||
      cleanLowerTitle.includes('sem cortes') ||
      cleanLowerTitle.includes('festival')
    ) {
      albumObj.category = 'live';
      albumObj.categoryLabel = 'Álbum Ao Vivo & DVD';
      liveAlbums.push(albumObj);
      continue;
    }

    // 4. Álbuns de Estúdio
    albumObj.category = 'studio';
    albumObj.categoryLabel = 'Álbum de Estúdio';
    studioAlbums.push(albumObj);
  }

  // Ordena cada grupo por ano decrescente
  const sortByYearDesc = (a: ClassifiedAlbum, b: ClassifiedAlbum) => (b.year || '').localeCompare(a.year || '');
  liveAlbums.sort(sortByYearDesc);
  studioAlbums.sort(sortByYearDesc);
  epsAndCompilations.sort(sortByYearDesc);
  standaloneSingles.sort(sortByYearDesc);

  const allAlbums = [...liveAlbums, ...studioAlbums, ...epsAndCompilations];

  return {
    liveAlbums,
    studioAlbums,
    epsAndCompilations,
    standaloneSingles,
    allAlbums,
    totalCounts: {
      live: liveAlbums.length,
      studio: studioAlbums.length,
      eps: epsAndCompilations.length,
      singles: standaloneSingles.length,
      total: allAlbums.length
    }
  };
}
