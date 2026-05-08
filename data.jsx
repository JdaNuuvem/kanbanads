// Mock data + constants
const COLUMNS = [
  { id: 'separados', title: 'Produtos Separados', color: 'var(--col-separados)', icon: 'inbox' },
  { id: 'coletados', title: 'Criativos Coletados', color: 'var(--col-coletados)', icon: 'layers' },
  { id: 'editados', title: 'Criativos Editados', color: 'var(--col-editados)', icon: 'sparkle' },
  { id: 'subir', title: 'Para Subir', color: 'var(--col-subir)', icon: 'upload' },
  { id: 'rodando', title: 'Rodando', color: 'var(--col-rodando)', icon: 'play' },
  { id: 'escala', title: 'Escala', color: 'var(--col-escala)', icon: 'rocket' },
  { id: 'morto', title: 'Produto Morto', color: 'var(--col-morto)', icon: 'skull' },
];

const FOLDERS = ['CA1', 'CA2', 'CA3', 'CA4', 'UPSELLS', 'SOURCES', 'VARIAÇÕES'];

const LABEL_OPTIONS = [
  { id: 'gadget', name: 'Gadget', color: 'oklch(0.72 0.12 240)' },
  { id: 'beleza', name: 'Beleza', color: 'oklch(0.72 0.14 340)' },
  { id: 'pet', name: 'Pet', color: 'oklch(0.78 0.14 80)' },
  { id: 'casa', name: 'Casa', color: 'oklch(0.72 0.14 160)' },
  { id: 'fitness', name: 'Fitness', color: 'oklch(0.72 0.14 30)' },
  { id: 'kids', name: 'Kids', color: 'oklch(0.72 0.14 300)' },
  { id: 'wow', name: 'WOW', color: 'oklch(0.82 0.16 90)' },
  { id: 'inverno', name: 'Inverno', color: 'oklch(0.72 0.10 220)' },
];

// Checklists per stage
const STAGE_CHECKLISTS = {
  separados: [
    { id: 'fornecedor', text: 'Fornecedor confirmado' },
    { id: 'margem', text: 'Margem mínima validada (≥ 2x)' },
    { id: 'concorrencia', text: 'Pesquisa de concorrência feita' },
  ],
  coletados: [
    { id: 'sources', text: 'Mínimo 5 sources coletadas' },
    { id: 'hooks', text: 'Hooks identificados' },
    { id: 'angulos', text: 'Ângulos de venda mapeados' },
  ],
  editados: [
    { id: 'ca1', text: 'CA1 com 3+ criativos prontos' },
    { id: 'ca2', text: 'CA2 com 3+ criativos prontos' },
    { id: 'thumbs', text: 'Thumbnails revisadas' },
    { id: 'copies', text: 'Copies aprovadas' },
  ],
  subir: [
    { id: 'pixel', text: 'Pixel/CAPI funcionando' },
    { id: 'site', text: 'Site / checkout testado' },
    { id: 'estoque', text: 'Estoque/fornecedor alinhado' },
    { id: 'conta', text: 'Conta de anúncio liberada' },
    { id: 'utm', text: 'UTMs configuradas' },
  ],
  rodando: [
    { id: 'monitor', text: 'Monitorando 3x ao dia' },
    { id: 'roas', text: 'ROAS mínimo definido' },
  ],
  escala: [
    { id: 'cbo', text: 'CBOs estruturadas' },
    { id: 'lookalike', text: 'Lookalikes ativados' },
    { id: 'upsell', text: 'Upsell rodando' },
  ],
  morto: [
    { id: 'analise', text: 'Análise de morte registrada' },
    { id: 'pausado', text: 'Campanhas pausadas' },
  ],
};

const CREATIVE_STATUSES = [
  { id: 'rascunho', name: 'Rascunho', color: 'oklch(0.65 0.04 250)' },
  { id: 'aprovado', name: 'Aprovado', color: 'oklch(0.78 0.16 135)' },
  { id: 'rodando', name: 'Rodando', color: 'oklch(0.72 0.12 240)' },
  { id: 'pausado', name: 'Pausado', color: 'oklch(0.82 0.14 80)' },
  { id: 'morto', name: 'Morto', color: 'oklch(0.55 0.06 25)' },
];

const CREATIVE_TAGS = [
  'hook forte', 'social proof', 'antes/depois', 'UGC',
  'demonstração', 'unboxing', 'depoimento', 'problema/solução',
];

const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
};

const seedCreatives = (counts, statuses = ['rascunho','aprovado','rodando']) => {
  const types = ['video', 'image', 'copy'];
  const result = {};
  for (const f of FOLDERS) {
    const n = counts[f] || 0;
    result[f] = Array.from({ length: n }).map((_, i) => {
      const type = types[i % 3];
      const status = statuses[i % statuses.length];
      return {
        id: `${f}-${i}-${Math.random().toString(36).slice(2, 7)}`,
        name: type === 'copy' ? `Copy ${f} ${i+1}` : `${type === 'video' ? 'VID' : 'IMG'}_${f}_${String(i+1).padStart(2,'0')}`,
        type,
        version: (i % 3) + 1,
        status,
        size: type === 'video' ? `${(Math.random()*30+5).toFixed(1)} MB` : type === 'image' ? `${(Math.random()*2+0.4).toFixed(1)} MB` : '—',
        text: type === 'copy' ? 'Você ainda não conhece o segredo das donas de casa que economizam horas todo dia… até descobrirem isso. ⏰' : null,
        link: '',
        tags: i % 2 === 0 ? [CREATIVE_TAGS[i % CREATIVE_TAGS.length]] : [],
        metrics: { ctr: (Math.random()*4+0.5).toFixed(2), cpm: (Math.random()*30+10).toFixed(2), spent: (Math.random()*200).toFixed(2) },
        addedAt: daysAgo(Math.floor(Math.random()*10)),
      };
    });
  }
  return result;
};

// Daily metric entries — what user logs daily for a product
const seedMetrics = (n, baseSpend) => {
  return Array.from({ length: n }).map((_, i) => {
    const cost = +(baseSpend * (0.7 + Math.random()*0.6)).toFixed(2);
    const sales = Math.floor(Math.random() * 8);
    const revenue = sales * (Math.random()*60 + 60);
    return {
      id: 'm' + Math.random().toString(36).slice(2, 9),
      time: `${10 + i % 8}:${String(Math.floor(Math.random()*59)).padStart(2,'0')}`,
      date: daysAgo(n - i - 1).slice(0, 10),
      cost,
      bid: +(Math.random()*60+20).toFixed(2),
      budget: +(Math.random()*1500+500).toFixed(0),
      cpa: sales > 0 ? +(cost/sales).toFixed(2) : 0,
      sales,
      revenue: +revenue.toFixed(2),
      note: '',
    };
  });
};

const INITIAL_PRODUCTS = [
  {
    id: 'p1', name: 'Mini Aspirador Portátil USB', column: 'rodando', favorite: true,
    assigneeIds: ['u2'], createdById: 'u1',
    startDate: '2026-04-22', supplier: 'https://aliexpress.com/item/100482839',
    labels: ['gadget', 'casa'], color: 'oklch(0.72 0.12 240)',
    creatives: seedCreatives({ CA1: 6, CA2: 4, CA3: 3, CA4: 0, UPSELLS: 2, SOURCES: 5, 'VARIAÇÕES': 3 }),
    comments: [
      { id: 'c1', authorId: 'u2', text: 'CA2 está performando 30% melhor que CA1 — pausar criativos antigos. @Bruno consegue cortar mais 2 versões hoje?', mentions: ['u3'], at: daysAgo(2) },
      { id: 'c2', authorId: 'u1', text: '@Ana testar nova thumbnail com mão segurando o produto.', mentions: ['u2'], at: daysAgo(1) },
    ],
    history: [
      { id: 'h1', text: 'Movido para Rodando', at: daysAgo(3), type: 'move', byId: 'u2' },
      { id: 'h2', text: 'Movido para Para Subir', at: daysAgo(5), type: 'move', byId: 'u1' },
      { id: 'h3', text: 'Movido para Criativos Editados', at: daysAgo(8), type: 'move', byId: 'u3' },
      { id: 'h4', text: 'Produto criado', at: daysAgo(20), type: 'create', byId: 'u1' },
    ],
    enteredColumnAt: daysAgo(3),
    metrics: seedMetrics(8, 134),
    checklist: { pixel: true, site: true, estoque: true, conta: true, utm: false, monitor: true, roas: false },
  },
  {
    id: 'p2', name: 'Almofada Cervical Memory Foam', column: 'escala', favorite: true,
    assigneeIds: ['u1'], createdById: 'u1',
    startDate: '2026-03-15', supplier: 'https://cjdropshipping.com/product/29481',
    labels: ['casa', 'wow'], color: 'oklch(0.72 0.14 340)',
    creatives: seedCreatives({ CA1: 8, CA2: 8, CA3: 6, CA4: 4, UPSELLS: 5, SOURCES: 12, 'VARIAÇÕES': 7 }),
    comments: [{ id: 'c3', authorId: 'u1', text: 'ROAS médio 3.4x. Subir CBO de R$ 800 para R$ 1.500.', at: daysAgo(0) }],
    history: [
      { id: 'h5', text: 'Movido para Escala', at: daysAgo(5), type: 'move', byId: 'u1' },
      { id: 'h6', text: 'Movido para Rodando', at: daysAgo(23), type: 'move', byId: 'u2' },
      { id: 'h7', text: 'Produto criado', at: daysAgo(50), type: 'create', byId: 'u1' },
    ],
    enteredColumnAt: daysAgo(5),
    metrics: seedMetrics(12, 380),
    checklist: { cbo: true, lookalike: true, upsell: false },
  },
  {
    id: 'p3', name: 'Coleira Inteligente para Pet', column: 'editados', favorite: false,
    assigneeIds: ['u3'], createdById: 'u1',
    startDate: '2026-04-28', supplier: 'https://www.alibaba.com/product/29581',
    labels: ['pet', 'gadget'], color: 'oklch(0.78 0.14 80)',
    creatives: seedCreatives({ CA1: 4, CA2: 2, CA3: 0, CA4: 0, UPSELLS: 1, SOURCES: 6, 'VARIAÇÕES': 2 }),
    comments: [],
    history: [
      { id: 'h8', text: 'Movido para Criativos Editados', at: daysAgo(1), type: 'move', byId: 'u3' },
      { id: 'h9', text: 'Produto criado', at: daysAgo(6), type: 'create', byId: 'u1' },
    ],
    enteredColumnAt: daysAgo(1),
    metrics: [],
    checklist: { ca1: true, ca2: false, thumbs: true, copies: false },
  },
  {
    id: 'p4', name: 'Massageador Cervical Elétrico', column: 'subir', favorite: false,
    assigneeIds: ['u2'], createdById: 'u1',
    startDate: '2026-04-18', supplier: 'https://aliexpress.com/item/938472',
    labels: ['beleza', 'wow'], color: 'oklch(0.82 0.16 90)',
    creatives: seedCreatives({ CA1: 5, CA2: 5, CA3: 3, CA4: 0, UPSELLS: 2, SOURCES: 4, 'VARIAÇÕES': 4 }),
    comments: [{ id: 'c4', authorId: 'u2', text: 'Subir terça à noite — melhor janela. @Carla precisa da copy final até segunda.', mentions: ['u4'], at: daysAgo(0) }],
    history: [
      { id: 'h10', text: 'Movido para Para Subir', at: daysAgo(1), type: 'move', byId: 'u2' },
      { id: 'h11', text: 'Produto criado', at: daysAgo(16), type: 'create', byId: 'u1' },
    ],
    enteredColumnAt: daysAgo(1),
    metrics: [],
    checklist: { pixel: true, site: true, estoque: true, conta: false, utm: false },
  },
  {
    id: 'p5', name: 'Luminária Astronauta LED', column: 'coletados', favorite: false,
    assigneeIds: ['u4'], createdById: 'u1',
    startDate: '2026-04-30', supplier: 'https://cjdropshipping.com/product/aslsl',
    labels: ['casa', 'kids'], color: 'oklch(0.72 0.14 300)',
    creatives: seedCreatives({ CA1: 2, CA2: 0, CA3: 0, CA4: 0, UPSELLS: 0, SOURCES: 8, 'VARIAÇÕES': 1 }),
    comments: [],
    history: [{ id: 'h12', text: 'Produto criado', at: daysAgo(4), type: 'create', byId: 'u1' }],
    enteredColumnAt: daysAgo(4),
    metrics: [],
    checklist: { sources: true, hooks: false, angulos: false },
  },
  {
    id: 'p6', name: 'Pulseira Magnética Anti-Mosquito', column: 'morto', favorite: false,
    assigneeIds: ['u1'], createdById: 'u1',
    startDate: '2026-02-08', supplier: 'https://aliexpress.com/item/192833',
    labels: ['fitness'], color: 'oklch(0.55 0.06 25)',
    creatives: seedCreatives({ CA1: 3, CA2: 2, CA3: 1, CA4: 0, UPSELLS: 0, SOURCES: 3, 'VARIAÇÕES': 2 }),
    comments: [{ id: 'c5', authorId: 'u1', text: 'CPA muito alto. Sazonal — talvez voltar no verão.', at: daysAgo(30) }],
    history: [
      { id: 'h13', text: 'Movido para Produto Morto', at: daysAgo(30), type: 'move', byId: 'u1' },
      { id: 'h14', text: 'Produto criado', at: daysAgo(85), type: 'create', byId: 'u1' },
    ],
    enteredColumnAt: daysAgo(30),
    metrics: seedMetrics(20, 90),
    checklist: { analise: true, pausado: true },
  },
  {
    id: 'p7', name: 'Organizador de Cabos Magnético', column: 'separados', favorite: false,
    assigneeIds: [], createdById: 'u1',
    startDate: '2026-05-02', supplier: '',
    labels: ['gadget'], color: 'oklch(0.72 0.04 250)',
    creatives: seedCreatives({ CA1: 0, CA2: 0, CA3: 0, CA4: 0, UPSELLS: 0, SOURCES: 4, 'VARIAÇÕES': 0 }),
    comments: [],
    history: [{ id: 'h15', text: 'Produto criado', at: daysAgo(0), type: 'create', byId: 'u1' }],
    enteredColumnAt: daysAgo(0),
    metrics: [],
    checklist: { fornecedor: false, margem: false, concorrencia: false },
  },
  {
    id: 'p8', name: 'Espelho LED de Maquiagem', column: 'separados', favorite: false,
    assigneeIds: ['u4'], createdById: 'u1',
    startDate: '2026-05-01', supplier: '',
    labels: ['beleza'], color: 'oklch(0.72 0.14 340)',
    creatives: seedCreatives({ CA1: 0, CA2: 0, CA3: 0, CA4: 0, UPSELLS: 0, SOURCES: 2, 'VARIAÇÕES': 0 }),
    comments: [],
    history: [{ id: 'h16', text: 'Produto criado', at: daysAgo(1), type: 'create', byId: 'u1' }],
    enteredColumnAt: daysAgo(1),
    metrics: [],
    checklist: { fornecedor: true, margem: false, concorrencia: false },
  },
];

window.COLUMNS = COLUMNS;
window.FOLDERS = FOLDERS;
window.LABEL_OPTIONS = LABEL_OPTIONS;
window.STAGE_CHECKLISTS = STAGE_CHECKLISTS;
window.CREATIVE_STATUSES = CREATIVE_STATUSES;
window.CREATIVE_TAGS = CREATIVE_TAGS;
window.INITIAL_PRODUCTS = INITIAL_PRODUCTS;
