/* CINQ · Fisioterapia — Avaliações
   Lê o relatório de avaliação do app Phast (PDF), guarda os testes por atleta, colore cada teste,
   compara com a avaliação anterior e monta os achados (com sugestão de foco) para o fisioterapeuta validar.
   O sistema não diagnostica nem prevê lesão: mostra perfil, evolução e foco. A decisão é do fisio. */
'use strict';

S.fisio = { ok: false, av: [], vinc: [], aba: 'avaliacoes' };
const podeLerFisio = () => !!S.perfil && S.perfil.funcao !== 'visualizacao';
const podeFisio = () => isAdmin() || ['fisio', 'analise'].includes(S.perfil?.funcao);
const MOTIVOS_FISIO = ['Pré-temporada', 'Reavaliação', 'Retorno de lesão', 'Outro'];
const FISIO_ASS_ISQ = [10, 15]; // isquiossurais: diferença entre os lados (%) — amarelo a partir de 10, vermelho a partir de 15
const fNorm = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const fNum = v => (v == null || isNaN(v)) ? '—' : (Math.round(v * 10) / 10).toLocaleString('pt-BR');

/* ============ leitura do relatório Phast ============ */
const PH_CAT = /^(sim|nao|não|leve|moderad[oa]|grave|sever[oa]|nao se aplica|não se aplica|normal|alterad[oa]|presente|ausente)$/i;
const PH_VAL = /^-?\d+[.,]\d+\s*(°|%|reps|repeti[cç][oõ]es|seconds|segundos|s|cm|kg)?$/i;
const PH_UNI = /^(°|%|reps|seconds|segundos|s|cm|kg)$/i;

function lerPhast(pags) {
  const r = { anamnese: {}, testes: [], alertas: [] };
  const p1 = pags[0]?.items || [];
  const txt1 = p1.map(i => i[0]).join(' ');
  if (!/RELAT[ÓO]RIO DA AVALIA/i.test(txt1)) throw new Error('Não parece um relatório de avaliação do Phast.');
  r.data = (txt1.match(/EXECUTADA EM:\s*(\d{2})\/(\d{2})\/(\d{4})/i) || []).slice(1).reverse().join('-') || null;
  if (!r.data) { const d = p1.map(i => i[0]).find(s => /^\d{2}\/\d{2}\/\d{4}$/.test(s)); if (d) r.data = d.split('/').reverse().join('-'); }
  const em = p1.find(i => /@/.test(i[0])); r.avaliador_email = em ? em[0] : null;
  const lblF = p1.find(i => /^Fisioterapeuta$/i.test(i[0]));
  if (lblF) { const n = p1.filter(i => i[1] > 300 && i[2] > 760 && !/@|Fisioterapeuta/i.test(i[0])).sort((a, b) => b[2] - a[2])[0]; r.avaliador = n ? n[0] : null; }
  // paciente (coluna da esquerda, abaixo de "Paciente")
  const lp = p1.find(i => /^Paciente$/i.test(i[0])), la = p1.find(i => /^Anamnese$/i.test(i[0]));
  if (lp) {
    const xs = la ? la[1] : 200;
    const linhas = p1.filter(i => i[1] < xs - 10 && i[2] < lp[2] - 10 && i[2] > lp[2] - 120).sort((a, b) => b[2] - a[2]).map(i => i[0].trim());
    const nome = [];
    linhas.forEach(l => { const m = l.match(/^-?\s*(\d{1,2})\s*anos$/i) || l.match(/^(.*?)\s*-\s*(\d{1,2})\s*anos$/i); if (m) { if (m[2]) { nome.push(m[1]); r.idade = +m[2]; } else r.idade = +m[1]; } else nome.push(l); });
    r.nome = nome.join(' ').replace(/\s+/g, ' ').trim();
  }
  // anamnese: rótulo "X:" com o valor logo abaixo
  if (la) p1.filter(i => /:$/.test(i[0]) && i[1] >= la[1] - 5 && i[2] < la[2] && i[2] > la[2] - 140).forEach(l => {
    const v = p1.find(i => Math.abs(i[1] - l[1]) <= 4 && l[2] - i[2] >= 8 && l[2] - i[2] <= 20);
    if (v) r.anamnese[l[0].replace(/:$/, '').trim()] = v[0].trim();
  });
  r.total = +(txt1.match(/(\d+)\s*TESTES/i) || [])[1] || null;

  // testes: título com a região logo abaixo (mesmo x)
  pags.forEach((pg, ip) => {
    const it = pg.items;
    const cab = it.filter(a => it.some(b => b !== a && Math.abs(b[1] - a[1]) <= 3 && a[2] - b[2] >= 10 && a[2] - b[2] <= 22) && a[1] > 80 && a[1] < 110 && !/^(Direit|Esquerd|Assimetria|Tempo)/i.test(a[0]))
      .filter(a => !(ip === 0 && a[2] > 480)).sort((a, b) => b[2] - a[2]);
    // descarta o par (título, região) como dois títulos: fica só o de cima
    const tit = cab.filter(a => !cab.some(b => b !== a && Math.abs(b[1] - a[1]) <= 3 && b[2] - a[2] >= 10 && b[2] - a[2] <= 22));
    tit.forEach((t, k) => {
      const grupo = it.find(b => Math.abs(b[1] - t[1]) <= 3 && t[2] - b[2] >= 10 && t[2] - b[2] <= 22);
      const yFim = tit[k + 1] ? tit[k + 1][2] : -1;
      const corpo = it.filter(b => b[2] < (grupo ? grupo[2] : t[2]) - 2 && b[2] > yFim + 2 && !(ip === 0 && b[2] > 480));
      const teste = { nome: t[0].trim(), grupo: grupo ? grupo[0].trim() : '', itens: [] };
      [0, 1, 2].forEach(col => {
        const cel = corpo.filter(b => (b[1] < 200 ? 0 : b[1] < 380 ? 1 : 2) === col).sort((a, b) => b[2] - a[2] || a[1] - b[1]);
        let cur = { rot: [], refs: [] };
        const fecha = () => { if (cur.val != null || cur.txt != null) teste.itens.push(phItem(cur)); cur = { rot: [], refs: [] }; };
        cel.forEach(b => {
          const s = b[0].trim();
          if (/^\d+$/.test(s)) { cur.refs.push(+s); return; }
          if (PH_UNI.test(s)) { const u = teste.itens[teste.itens.length - 1]; if (u && !u.unidade && cur.val == null) u.unidade = s; else cur.uni = s; return; }
          if (PH_VAL.test(s)) { const m = s.match(/^(-?\d+[.,]\d+)\s*(.*)$/); cur.val = parseFloat(m[1].replace(',', '.')); cur.uni = m[2] || cur.uni || ''; fecha(); return; }
          if (PH_CAT.test(s)) { cur.txt = s; fecha(); return; }
          if (cur.val != null || cur.txt != null) fecha();
          cur.rot.push(s);
        });
        if (cur.val != null || cur.txt != null) fecha();
      });
      if (teste.itens.length) r.testes.push(teste);
    });
  });
  if (!r.testes.length) throw new Error('Não encontrei os testes no relatório.');
  if (r.total && r.testes.length !== r.total) r.alertas.push(`O relatório diz ${r.total} testes e o CINQ leu ${r.testes.length}. Confira.`);
  return r;
}
function phItem(c) {
  let rot = c.rot.join(' ').replace(/\s+-\s*-?\s*/g, ' - ').replace(/\s+/g, ' ').replace(/^-\s*/, '').trim();
  let lado = null;
  if (/^assimetria$/i.test(rot)) { lado = 'ASS'; rot = ''; }
  else if (/^direit[ao]$/i.test(rot)) { lado = 'D'; rot = ''; }
  else if (/^esquerd[ao]$/i.test(rot)) { lado = 'E'; rot = ''; }
  else if (/\s-\s*direit[ao]$/i.test(rot)) { lado = 'D'; rot = rot.replace(/\s-\s*direit[ao]$/i, ''); }
  else if (/\s-\s*esquerd[ao]$/i.test(rot)) { lado = 'E'; rot = rot.replace(/\s-\s*esquerd[ao]$/i, ''); }
  else if (/^tempo$/i.test(rot)) rot = 'Tempo';
  const uni = String(c.uni || '').replace(/^seconds$/i, 's').replace(/^segundos$/i, 's').replace(/^repeti.*/i, 'reps');
  return { medida: rot, lado, valor: c.val ?? null, unidade: uni, texto: c.txt ?? null, refs: [...new Set(c.refs)].sort((a, b) => a - b) };
}

/* ============ interpretação ============ */
const tKey = t => fNorm(t.nome);
const ehIsquio = t => /isquio/.test(tKey(t));
// cor de um item: ok (verde), at (amarelo), al (vermelho), na (não realizado), '' (sem referência)
function fisioCor(t, i) {
  if (i.texto != null) {
    const v = fNorm(i.texto);
    if (/^(nao|nao se aplica|normal|ausente)$/.test(v)) return 'ok';
    if (/^(leve|sim|presente|alterad)/.test(v)) return 'at';
    return 'al';
  }
  if (i.valor == null) return '';
  if (i.lado === 'DIF') return i.valor < FISIO_ASS_ISQ[0] ? 'ok' : i.valor < FISIO_ASS_ISQ[1] ? 'at' : 'al';
  if (ehIsquio(t)) return '';
  if (i.lado !== 'ASS' && i.valor === 0 && /reps|s/.test(i.unidade || '')) return 'na';
  const r = i.refs || [];
  if (!r.length) return '';
  if (i.lado === 'ASS') return i.valor <= r[r.length - 1] ? 'ok' : i.valor <= r[r.length - 1] * 1.5 ? 'at' : 'al';
  if (r.length >= 2) return i.valor < r[0] ? 'al' : i.valor < r[r.length - 1] ? 'at' : 'ok';
  return i.valor >= r[0] ? 'ok' : i.valor >= r[0] * 0.8 ? 'at' : 'al';
}
const COR_RANK = { '': 0, na: 0, ok: 1, at: 2, al: 3 };
// isquiossurais: acrescenta a diferença entre os lados (%), que é o que vale nesse teste
function fisioPreparar(testes) {
  return (testes || []).map(t => {
    const x = { ...t, itens: t.itens.map(i => ({ ...i })) };
    if (ehIsquio(x) && !x.itens.some(i => i.lado === 'DIF')) {
      const d = x.itens.find(i => i.lado === 'D' && i.valor != null), e = x.itens.find(i => i.lado === 'E' && i.valor != null);
      if (d && e && Math.max(d.valor, e.valor) > 0) x.itens.push({ medida: 'Diferença entre os lados', lado: 'DIF', valor: Math.round(Math.abs(d.valor - e.valor) / Math.max(d.valor, e.valor) * 1000) / 10, unidade: '%', texto: null, refs: FISIO_ASS_ISQ });
    }
    x.itens.forEach(i => { i.cor = fisioCor(x, i); });
    x.cor = x.itens.reduce((m, i) => COR_RANK[i.cor] > COR_RANK[m] ? i.cor : m, x.itens.every(i => i.cor === 'na') ? 'na' : '');
    return x;
  });
}
const achaT = (T, re) => T.find(t => re.test(tKey(t)));
const itensDe = (t, lado, medRe) => t ? t.itens.filter(i => (!lado || i.lado === lado) && (!medRe || medRe.test(fNorm(i.medida)))) : [];
const ladoTxt = l => l === 'D' ? 'direito' : l === 'E' ? 'esquerdo' : '';
const ladosTxt = ls => ls.length === 2 ? 'nos dois lados' : ls.length ? `no lado ${ladoTxt(ls[0])}` : '';

// achados: regras combinadas com o fisioterapeuta (validadas por ele na ficha)
function fisioAchados(T) {
  const A = [], add = (chave, nivel, titulo, texto, foco) => A.push({ chave, nivel, titulo, texto, foco });
  const dorsi = achaT(T, /dorsiflex/), quad = achaT(T, /rigidez de quadril|rotacao.*quadril/), glu = achaT(T, /gluteo medio/);
  const salto = achaT(T, /salto unipodal/), agach = achaT(T, /agachamento/), isq = T.find(ehIsquio);
  const dinam = [salto, agach].filter(Boolean);
  const temSinal = (re, lado) => dinam.some(t => itensDe(t, lado, re).some(i => i.cor === 'at' || i.cor === 'al'));
  const ondeSinal = re => dinam.filter(t => itensDe(t, null, re).some(i => i.cor === 'at' || i.cor === 'al')).map(t => fNorm(t.nome).includes('salto') ? 'salto unipodal' : 'agachamento');

  // 1) dorsiflexão: medida parada × movimento
  const limDin = ['D', 'E'].filter(l => temSinal(/dorso ?flex/, l));
  if (dorsi) {
    const baixo = ['D', 'E'].filter(l => itensDe(dorsi, l).some(i => i.cor === 'al'));
    const quadBaixo = quad && ['D', 'E'].some(l => itensDe(quad, l).some(i => i.cor === 'al' || i.cor === 'at'));
    if (limDin.length && !baixo.length) add('dorsi-funcional', 'at', 'Dorsiflexão limitada no movimento com boa ADM',
      `A medida isolada está boa, mas no movimento (${ondeSinal(/dorso ?flex/).join(' e ')}) aparece limitação ${ladosTxt(limDin)}. Provável compensação, não falta de mobilidade do tornozelo.${quadBaixo ? ' A rigidez de quadril também está abaixo da referência.' : ''}`,
      quadBaixo ? 'Mobilidade de quadril' : 'Controle de movimento (cadeia)');
    else if (limDin.length && baixo.length) add('dorsi-mobilidade', 'al', 'Limitação de mobilidade do tornozelo', `ADM de dorsiflexão abaixo da referência ${ladosTxt(baixo)} e limitação também no movimento.`, 'Mobilidade de tornozelo');
    else if (baixo.length) add('dorsi-acompanhar', 'at', 'ADM de dorsiflexão reduzida', `Abaixo da referência ${ladosTxt(baixo)}, sem limitação aparente no movimento. Acompanhar.`, 'Mobilidade de tornozelo');
  }
  // 2) glúteo médio × joelho para dentro no movimento
  const medial = ['D', 'E'].filter(l => temSinal(/medializacao do joelho|valgo/, l));
  if (medial.length) {
    const gluBaixo = glu && ['D', 'E'].some(l => itensDe(glu, l).some(i => i.cor === 'al' || i.cor === 'at'));
    if (glu && !gluBaixo) add('joelho-controle', 'at', 'Joelho para dentro com glúteo médio forte', `Medialização do joelho ${ladosTxt(medial)} (${ondeSinal(/medializacao do joelho|valgo/).join(' e ')}), com função de glúteo médio dentro da referência. Indica controle, não força.`, 'Controle neuromuscular (joelho/quadril)');
    else add('joelho-forca', gluBaixo ? 'al' : 'at', 'Joelho para dentro no movimento', `Medialização do joelho ${ladosTxt(medial)}${gluBaixo ? ' e função de glúteo médio abaixo da referência' : ''}.`, gluBaixo ? 'Força de glúteo médio' : 'Controle neuromuscular (joelho/quadril)');
  }
  // 3) outras compensações no movimento
  const dorsiFunc = A.some(x => x.chave === 'dorsi-funcional');
  [[/queda pelvica/, 'pelve', 'Queda pélvica no movimento', 'Estabilidade lombo-pélvica e tronco'],
   [/inclinacao anterior do tronco/, 'tronco', 'Inclinação do tronco no movimento', 'Estabilidade lombo-pélvica e tronco'],
   [/desabamento do arco|arco plantar/, 'arco', 'Arco plantar cedendo no movimento', 'Controle do pé / arco plantar'],
   [/restricao da adm do agachamento/, 'agach-adm', 'Restrição de amplitude no agachamento', dorsiFunc || (quad && quad.cor === 'al') ? 'Mobilidade de quadril' : 'Mobilidade de quadril e tornozelo']].forEach(([re, k, tit, foco]) => {
    const ls = ['D', 'E'].filter(l => temSinal(re, l));
    if (ls.length) add('mov-' + k, 'at', tit, `Aparece ${ladosTxt(ls)} (${ondeSinal(re).join(' e ')}).`, foco);
  });
  // 4) encurtamentos
  T.filter(t => /encurtamento/.test(tKey(t))).forEach(t => {
    const ls = ['D', 'E'].filter(l => itensDe(t, l).some(i => i.cor === 'at' || i.cor === 'al'));
    if (ls.length) add('enc-' + tKey(t), 'at', t.nome, `Presente ${ladosTxt(ls)}.`, /iliopsoas|reto/.test(tKey(t)) ? 'Flexibilidade de flexores do quadril' : 'Flexibilidade');
  });
  // 5) isquiossurais: só a diferença entre os lados
  if (isq) { const d = isq.itens.find(i => i.lado === 'DIF'); if (d && (d.cor === 'at' || d.cor === 'al')) add('isquio-dif', d.cor, 'Diferença entre os lados nos isquiossurais', `${fNum(d.valor)}% de diferença (direita ${fNum(itensDe(isq, 'D')[0]?.valor)}° × esquerda ${fNum(itensDe(isq, 'E')[0]?.valor)}°).`, 'Flexibilidade de cadeia posterior'); }
  // 6) medidas numéricas fora da referência e assimetrias (exceto dorsiflexão e isquiossurais, já tratados)
  const FOCO = [[/rigidez de quadril|rotacao/, 'Mobilidade de quadril'], [/gluteo medio/, 'Força de glúteo médio'], [/extensores do quadril|ponte/, 'Força de extensores do quadril'], [/prone|prancha|tronco/, 'Estabilidade lombo-pélvica e tronco'], [/hop|salto/, 'Potência / controle no salto'], [/ckcuest|superior/, 'Estabilidade de membros superiores']];
  const focoDe = t => (FOCO.find(([re]) => re.test(tKey(t))) || [0, 'Avaliar com o fisio'])[1];
  T.filter(t => t !== dorsi && t !== isq).forEach(t => {
    const ruins = ['D', 'E'].map(l => itensDe(t, l).filter(i => i.valor != null && !i.medida)).flat().filter(i => i.cor === 'al' || i.cor === 'at');
    if (ruins.length) {
      const pior = ruins.some(i => i.cor === 'al') ? 'al' : 'at', ls = [...new Set(ruins.map(i => i.lado))];
      add('ref-' + tKey(t), pior, `${t.nome} ${pior === 'al' ? 'abaixo da referência' : 'na faixa intermediária'}`, `${ruins.map(i => `${i.lado === 'D' ? 'Direita' : 'Esquerda'} ${fNum(i.valor)}${i.unidade ? ' ' + i.unidade : ''}`).join(' · ')} (referência ${ruins[0].refs.join('–')}) ${ladosTxt(ls)}.`, focoDe(t));
    }
    const ass = itensDe(t, 'ASS').find(i => i.cor === 'at' || i.cor === 'al');
    if (ass) add('ass-' + tKey(t), ass.cor, `Assimetria em ${t.nome}`, `${fNum(ass.valor)}${ass.unidade ? ' ' + ass.unidade : ''} de diferença (limite ${ass.refs.slice(-1)[0]}).`, focoDe(t));
    const na = t.itens.filter(i => i.cor === 'na');
    if (na.length && na.length === t.itens.filter(i => i.valor != null).length) add('na-' + tKey(t), 'info', `${t.nome}: não realizado`, 'Resultado zerado no relatório; tratado como teste não feito.', '');
  });
  const ord = { al: 0, at: 1, info: 2 };
  return A.sort((a, b) => ord[a.nivel] - ord[b.nivel]);
}
// focos ordenados por peso (alerta vale 3, atenção 1; achado confirmado pelo fisio vale o dobro)
const focosDe = (achados, rev = {}) => {
  const p = {};
  achados.filter(a => a.foco && rev[a.chave] !== 'descartado').forEach(a => { p[a.foco] = (p[a.foco] || 0) + (a.nivel === 'al' ? 3 : 1) * (rev[a.chave] === 'confirmado' ? 2 : 1); });
  return Object.entries(p).sort((a, b) => b[1] - a[1]).map(x => x[0]);
};

/* ============ dados ============ */
async function carregarFisio(forcar) {
  if (S.fisio.ok && !forcar) return;
  const [a, v] = await Promise.all([sb.from('fisio_avaliacoes').select('*').order('data'), sb.from('fisio_vinculos').select('*')]);
  if (a.error) throw a.error;
  S.fisio.av = (a.data || []).map(x => ({ ...x, T: fisioPreparar(x.testes) }));
  S.fisio.av.forEach(x => { x.achados = fisioAchados(x.T); });
  S.fisio.vinc = v.data || []; S.fisio.ok = true;
}
const avDe = id => S.fisio.av.filter(x => x.atleta_id === id).sort((a, b) => a.data.localeCompare(b.data));
const ultimaAv = id => avDe(id).slice(-1)[0];
const anteriorAv = av => { const l = avDe(av.atleta_id); const i = l.findIndex(x => x.id === av.id); return i > 0 ? l[i - 1] : null; };
const atletaF = id => S.atletas.find(a => a.id === id) || { nome: '?' };

/* ============ tela principal ============ */
const COR_TXT = { ok: 'dentro', at: 'atenção', al: 'alerta', na: 'não realizado', '': 'sem referência' };
const dotF = (c, t) => `<i class="fd fd-${c || 'nd'}" title="${esc(t || COR_TXT[c] || '')}"></i>`;
const curtoTeste = n => n.replace(/^(ADM de|Função( Muscular)? d[eo]s?|Encurtamento de|Flexibilidade de|Teste funcional do quadrante superior)\s*/i, '').replace(/\s*\(([^)]+)\)$/, (m, a) => /CKCUEST/.test(a) ? 'CKCUEST' : ' (' + a + ')').replace(/Test[e]?$/, '').trim();

async function pFisio() {
  $('#main').innerHTML = topo('Fisioterapia', 'Avaliações', 'Relatórios do Phast lidos automaticamente: testes, evolução e focos de cada atleta.',
    podeFisio() ? '<button class="btn pri" id="fimp">+ Importar avaliações (Phast)</button>' : '') + '<div class="panel empty">Carregando…</div>';
  if ($('#fimp')) $('#fimp').onclick = escolherPhast;
  try { await carregarFisio(); } catch (e) { $('#main .panel').innerHTML = esc(erroAmigavel(e)); return; }
  const h = hoje();
  const ativos = S.atletas.filter(a => a.ativo && a.status !== 'Inativo').sort((a, b) => POSICOES.indexOf(a.posicao) - POSICOES.indexOf(b.posicao) || a.nome.localeCompare(b.nome));
  const ult = Object.fromEntries(ativos.map(a => [a.id, ultimaAv(a.id)]));
  const avaliados = ativos.filter(a => ult[a.id]), sem = ativos.filter(a => !ult[a.id]);
  const vencidas = avaliados.filter(a => ult[a.id].proxima_reavaliacao && ult[a.id].proxima_reavaliacao <= h);
  const proximas = avaliados.filter(a => ult[a.id].proxima_reavaliacao && ult[a.id].proxima_reavaliacao > h && ult[a.id].proxima_reavaliacao <= addDays(h, 7));
  const focosCont = {}; avaliados.forEach(a => focosDe(ult[a.id].achados, ult[a.id].revisao || {}).forEach(f => { focosCont[f] = (focosCont[f] || 0) + 1; }));
  const focos = Object.entries(focosCont).sort((a, b) => b[1] - a[1]);
  // colunas do mapa: testes na ordem em que aparecem
  const cols = []; avaliados.forEach(a => ult[a.id].T.forEach(t => { if (!cols.includes(t.nome)) cols.push(t.nome); }));
  const kpi = (l, v, s) => `<div class="card"><div class="l">${l}</div><div class="v">${v}</div><div class="s">${s}</div></div>`;
  $('#main').innerHTML = topo('Fisioterapia', 'Avaliações', 'Relatórios do Phast lidos automaticamente: testes, evolução e focos de cada atleta.',
    podeFisio() ? '<button class="btn pri" id="fimp">+ Importar avaliações (Phast)</button>' : '') + `
  <div class="ind-tabs fs-tabs"><button class="on">Avaliações</button><button disabled>Atendimento <small>em breve</small></button><button disabled>Lesões <small>em breve</small></button><button disabled>Prevenção <small>em breve</small></button></div>
  <div class="cards fs-kpis">
    ${kpi('Avaliados', `${avaliados.length}/${ativos.length}`, 'atletas ativos com avaliação')}
    ${kpi('Sem avaliação', sem.length, sem.length ? 'ver lista abaixo' : 'elenco completo')}
    ${kpi('Reavaliação vencida', vencidas.length, proximas.length ? `${proximas.length} vencem nos próximos 7 dias` : 'nenhuma nos próximos 7 dias')}
    ${kpi('Foco mais comum', focos[0] ? esc(focos[0][0]) : '—', focos[0] ? `${focos[0][1]} atleta${focos[0][1] > 1 ? 's' : ''}` : 'aparece após as avaliações')}
  </div>
  ${vencidas.length ? `<div class="note fs-venc"><b>Reavaliação vencida:</b> ${vencidas.map(a => `<button class="lnk" data-fa="${a.id}">${esc(a.nome)}</button> (${dataBR(ult[a.id].proxima_reavaliacao)})`).join(' · ')}</div>` : ''}
  <div class="panel"><h2>Mapa do elenco <small class="m">última avaliação de cada atleta · clique no atleta para abrir a ficha</small></h2>
    ${avaliados.length ? `<div class="tablewrap"><table class="tb fs-mapa"><thead><tr><th>Atleta</th><th>Avaliação</th>${cols.map(c => `<th title="${esc(c)}">${esc(curtoTeste(c))}</th>`).join('')}<th>Focos</th></tr></thead><tbody>
      ${avaliados.map(a => { const v = ult[a.id]; const fo = focosDe(v.achados, v.revisao || {});
        return `<tr data-fa="${a.id}"><td><b>${esc(a.nome)}</b><div class="m">${esc(a.posicao)}</div></td><td>${dataBR(v.data)}${v.proxima_reavaliacao && v.proxima_reavaliacao <= h ? ' <span class="badge s-Inativo">reavaliar</span>' : ''}</td>
        ${cols.map(c => { const t = v.T.find(x => x.nome === c); return `<td class="c">${t ? dotF(t.cor, `${c}: ${COR_TXT[t.cor]}`) : '<span class="m">—</span>'}</td>`; }).join('')}
        <td class="sm">${fo.slice(0, 3).map(esc).join(' · ') || '<span class="m">—</span>'}</td></tr>`; }).join('')}
    </tbody></table></div>
    <div class="legenda fs-leg">${dotF('ok')} dentro da referência ${dotF('at')} atenção ${dotF('al')} alerta ${dotF('na')} não realizado ${dotF('')} sem referência</div>` : '<p class="empty">Nenhuma avaliação ainda. Use “Importar avaliações (Phast)”.</p>'}
  </div>
  <div class="grid2">
    <div class="panel"><h2>Focos do grupo</h2>${focos.length ? `<div class="bars fs-bars">${focos.map(([f, n]) => `<div class="bar"><span>${esc(f)}</span><i style="width:${Math.round(n / avaliados.length * 100)}%"></i><b>${n}</b></div>`).join('')}</div><p class="m">Atletas com cada foco na última avaliação (achados descartados pelo fisio não contam).</p>` : '<p class="empty">—</p>'}</div>
    <div class="panel"><h2>Sem avaliação <small class="m">${sem.length}</small></h2>${sem.length ? `<div class="fs-sem">${sem.map(a => `<span class="chip">${esc(a.nome)}</span>`).join('')}</div>` : '<p class="empty">Todos os atletas ativos já foram avaliados.</p>'}</div>
  </div>`;
  if ($('#fimp')) $('#fimp').onclick = escolherPhast;
  $('#main').querySelectorAll('[data-fa]').forEach(el => el.onclick = () => fichaFisio(+el.dataset.fa));
}

/* ============ ficha de avaliação do atleta ============ */
function deltaTxt(t, i, ant) {
  if (!ant || i.valor == null && i.texto == null) return '';
  const ta = ant.T.find(x => x.nome === t.nome); if (!ta) return '';
  const ia = ta.itens.find(x => x.medida === i.medida && x.lado === i.lado); if (!ia) return '';
  if (i.texto != null) {
    if (ia.texto == null || fNorm(ia.texto) === fNorm(i.texto)) return '';
    const melhor = COR_RANK[i.cor] < COR_RANK[fisioCor(ta, ia)];
    return `<span class="fdl ${melhor ? 'up' : 'down'}" title="antes: ${esc(ia.texto)}">${melhor ? '▲' : '▼'} antes ${esc(ia.texto)}</span>`;
  }
  if (ia.valor == null) return '';
  const d = Math.round((i.valor - ia.valor) * 10) / 10; if (!d) return '';
  const menorMelhor = i.lado === 'ASS' || i.lado === 'DIF';
  const melhor = menorMelhor ? d < 0 : d > 0;
  return `<span class="fdl ${melhor ? 'up' : 'down'}" title="antes: ${fNum(ia.valor)}">${d > 0 ? '+' : ''}${fNum(d)}</span>`;
}
function refTxt(t, i) {
  if (i.lado === 'DIF') return `bom &lt; ${FISIO_ASS_ISQ[0]}%`;
  if (ehIsquio(t) && i.lado !== 'DIF') return 'compara os lados';
  const r = i.refs || []; if (!r.length) return '';
  if (i.lado === 'ASS') return `até ${r[r.length - 1]}`;
  return r.length >= 2 ? `ref. ${r[0]}–${r[r.length - 1]}` : `ref. ${r[0]}`;
}
const ordItens = it => { const ms = [...new Set(it.map(i => i.medida))]; const lo = { D: 0, E: 1, ASS: 2, DIF: 3 }; return it.slice().sort((a, b) => ms.indexOf(a.medida) - ms.indexOf(b.medida) || (lo[a.lado] ?? -1) - (lo[b.lado] ?? -1)); };
const rotItem = i => [i.medida, i.lado === 'D' ? 'Direita' : i.lado === 'E' ? 'Esquerda' : i.lado === 'ASS' ? 'Assimetria' : ''].filter(Boolean).join(' · ') || 'Resultado';

async function fichaFisio(atletaId, avId) {
  try { await carregarFisio(); } catch (e) { return toast(erroAmigavel(e), true); }
  const lista = avDe(atletaId); if (!lista.length) return toast('Atleta sem avaliação.', true);
  const av = lista.find(x => x.id === avId) || lista[lista.length - 1], ant = anteriorAv(av), a = atletaF(atletaId);
  const rev = av.revisao || {}, focos = focosDe(av.achados, rev);
  const nAl = av.T.filter(t => t.cor === 'al').length, nAt = av.T.filter(t => t.cor === 'at').length;
  modal(`<div class="fs-head">${foto(a)}<div><h2>${esc(a.nome)}</h2><div class="m">${esc(a.posicao || '')} · avaliação de ${dataBR(av.data)}${av.avaliador ? ' · ' + esc(av.avaliador) : ''} · ${esc(av.motivo || '')}</div>
      <div class="m">Relatório: ${esc(av.nome_relatorio || '')}${av.idade ? ` · ${av.idade} anos` : ''}</div></div>
      <div class="fs-sel">${lista.length > 1 ? `<label class="m">Avaliação <select class="in" id="fsav">${opts(lista.slice().reverse().map(x => [x.id, `${dataBR(x.data)} · ${x.motivo || ''}`]), av.id)}</select></label>` : ''}</div></div>
    <div class="fs-resumo">
      <div><b>${av.T.length}</b><span>testes</span></div><div class="al"><b>${nAl}</b><span>em alerta</span></div><div class="at"><b>${nAt}</b><span>em atenção</span></div>
      <div><b>${ant ? dataBR(ant.data) : '—'}</b><span>comparado com</span></div>
      <div><b>${av.proxima_reavaliacao ? dataBR(av.proxima_reavaliacao) : '—'}</b><span>reavaliação</span></div>
    </div>
    ${focos.length ? `<div class="fs-focos"><span>Focos sugeridos</span>${focos.map(f => `<b>${esc(f)}</b>`).join('')}</div>` : ''}
    <h3 class="fs-h">Achados <small class="m">o sistema sinaliza, o fisioterapeuta confirma ou descarta</small></h3>
    <div class="fs-ach">${av.achados.length ? av.achados.map(x => { const st = rev[x.chave];
      return `<div class="fs-a n-${x.nivel}${st === 'descartado' ? ' desc' : ''}"><div><b>${esc(x.titulo)}</b><p>${esc(x.texto)}</p>${x.foco ? `<small>Foco: ${esc(x.foco)}</small>` : ''}</div>
        <div class="fs-a-act">${st ? `<span class="badge ${st === 'confirmado' ? 's-Titular' : 's-Inativo'}">${st}</span>` : ''}${podeFisio() && x.nivel !== 'info' ? `<button class="btn sm" data-rv="${esc(x.chave)}" data-st="confirmado">Confirmar</button><button class="btn sm" data-rv="${esc(x.chave)}" data-st="descartado">Descartar</button>` : ''}</div></div>`; }).join('') : '<p class="empty">Nenhum achado: testes dentro das referências.</p>'}</div>
    <h3 class="fs-h">Conclusão do fisioterapeuta</h3>
    ${podeFisio() ? `<textarea class="in" id="fsconc" rows="3" placeholder="Conduta, prioridades, observações...">${esc(av.conclusao || '')}</textarea>` : `<p>${esc(av.conclusao || '—')}</p>`}
    <h3 class="fs-h">Testes ${ant ? `<small class="m">variação em relação a ${dataBR(ant.data)}</small>` : ''}</h3>
    <div class="fs-testes">${av.T.map(t => `<div class="fs-t c-${t.cor || 'nd'}"><div class="fs-t-h">${dotF(t.cor)}<b>${esc(t.nome)}</b><small>${esc(t.grupo)}</small></div>
      <table>${ordItens(t.itens).map(i => `<tr><td>${dotF(i.cor)}</td><td>${esc(rotItem(i))}</td><td class="v">${i.texto != null ? esc(i.texto) : i.cor === 'na' ? 'não realizado' : `${fNum(i.valor)}${i.unidade ? ' ' + esc(i.unidade) : ''}`}</td><td class="r">${refTxt(t, i)}</td><td>${deltaTxt(t, i, ant)}</td></tr>`).join('')}</table></div>`).join('')}</div>
    ${Object.keys(av.anamnese || {}).length ? `<h3 class="fs-h">Anamnese</h3><div class="fs-anam">${Object.entries(av.anamnese).map(([k, v]) => `<span><small>${esc(k)}</small>${esc(v)}</span>`).join('')}</div>` : ''}
    <p class="m fs-aviso">O CINQ não faz diagnóstico nem prevê lesão. Ele organiza os testes, compara com o próprio atleta e sugere focos; a decisão é do fisioterapeuta. Referências do Phast; nos isquiossurais vale a diferença entre os lados.</p>
    <div class="mfoot"><div class="row">${av.arquivo_path ? '<button class="btn" id="fspdf">Ver PDF</button>' : ''}${podeFisio() ? '<button class="btn" id="fsdel">Excluir avaliação</button>' : ''}</div>
      <div class="row">${podeFisio() ? `<label class="m fs-reav">Reavaliar em <input type="date" class="in" id="fsreav" value="${av.proxima_reavaliacao || ''}"></label><button class="btn sm" data-sem="4">+4 sem</button><button class="btn sm" data-sem="6">+6 sem</button><button class="btn pri" id="fssal">Salvar</button>` : ''}<button class="btn" id="fsfec">Fechar</button></div></div>`, true);
  $('#fsfec').onclick = fechar;
  if ($('#fsav')) $('#fsav').onchange = e => fichaFisio(atletaId, +e.target.value);
  if ($('#fspdf')) $('#fspdf').onclick = async () => { const { data, error } = await sb.storage.from('fisio').createSignedUrl(av.arquivo_path, 600); if (error) return toast(erroAmigavel(error), true); window.open(data.signedUrl, '_blank'); };
  if (!podeFisio()) return;
  document.querySelectorAll('#modal [data-sem]').forEach(b => b.onclick = () => { $('#fsreav').value = addDays(hoje(), 7 * +b.dataset.sem); });
  document.querySelectorAll('#modal [data-rv]').forEach(b => b.onclick = async () => {
    const r = { ...(av.revisao || {}) }; r[b.dataset.rv] = r[b.dataset.rv] === b.dataset.st ? undefined : b.dataset.st;
    Object.keys(r).forEach(k => r[k] === undefined && delete r[k]);
    const { error } = await sb.from('fisio_avaliacoes').update({ revisao: r }).eq('id', av.id);
    if (error) return toast(erroAmigavel(error), true);
    av.revisao = r; const conc = $('#fsconc').value, reav = $('#fsreav').value; await fichaFisio(atletaId, av.id); $('#fsconc').value = conc; $('#fsreav').value = reav;
  });
  $('#fssal').onclick = async () => {
    const upd = { conclusao: $('#fsconc').value.trim() || null, proxima_reavaliacao: $('#fsreav').value || null };
    const { error } = await sb.from('fisio_avaliacoes').update(upd).eq('id', av.id);
    if (error) return toast(erroAmigavel(error), true);
    Object.assign(av, upd); toast('Avaliação salva.'); fechar(); if (S.page === 'fisio') pFisio();
  };
  $('#fsdel').onclick = async () => {
    if (!confirm(`Excluir a avaliação de ${a.nome} de ${dataBR(av.data)}? Isso não pode ser desfeito.`)) return;
    const { error } = await sb.from('fisio_avaliacoes').delete().eq('id', av.id);
    if (error) return toast(erroAmigavel(error), true);
    if (av.arquivo_path) await sb.storage.from('fisio').remove([av.arquivo_path]);
    S.fisio.av = S.fisio.av.filter(x => x.id !== av.id); toast('Avaliação excluída.'); fechar(); if (S.page === 'fisio') pFisio();
  };
}

/* ============ importação ============ */
function escolherPhast() {
  const inp = document.createElement('input'); inp.type = 'file'; inp.multiple = true; inp.accept = 'application/pdf';
  inp.onchange = () => { if (inp.files.length) lerPhasts([...inp.files]); };
  inp.click();
}
// sugere o atleta: vínculo salvo, ou nome/apelido parecido (o fisio confirma)
function sugerirAtleta(nome) {
  const v = S.fisio.vinc.find(x => fNorm(x.nome_relatorio) === fNorm(nome)); if (v) return { id: v.atleta_id, certo: true };
  const toks = fNorm(nome).split(' ').filter(t => t.length > 2);
  const cands = S.atletas.filter(a => a.ativo).map(a => { const n = fNorm(a.nome); const ts = n.split(' ');
    let sc = 0; ts.forEach(t => { if (toks.includes(t)) sc += 3; else if (toks.some(k => t.length >= 4 && k.length >= 4 && (k.startsWith(t.slice(0, 4)) || t.startsWith(k.slice(0, 4))))) sc += 1; });
    if (toks.join(' ') === n) sc += 10; return { a, sc }; }).filter(x => x.sc > 0).sort((x, y) => y.sc - x.sc);
  if (!cands.length) return { id: null };
  return { id: cands[0].a.id, certo: false, empate: cands.length > 1 && cands[1].sc === cands[0].sc, opcoes: cands.slice(0, 4).map(x => x.a.id) };
}
async function lerPhasts(files) {
  try { await carregarFisio(); } catch (e) { return toast(erroAmigavel(e), true); }
  modal(`<h2>Lendo avaliações…</h2><div class="lbar"><i id="flbar"></i></div><p class="m" id="flmsg"></p>`);
  const lidas = [];
  for (const [k, f] of files.entries()) {
    $('#flmsg').textContent = f.name; $('#flbar').style.width = Math.round(k / files.length * 100) + '%';
    try {
      if (!window.pdfjsLib) throw new Error('O leitor de PDF não carregou. Recarregue a página.');
      const doc = await pdfjsLib.getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise;
      const pags = [];
      for (let p = 1; p <= doc.numPages; p++) { const pg = await doc.getPage(p), vp = pg.getViewport({ scale: 1 }), tc = await pg.getTextContent();
        pags.push({ w: vp.width, items: tc.items.filter(i => i.str.trim()).map(i => [i.str, Math.round(i.transform[4]), Math.round(i.transform[5])]) }); }
      const r = lerPhast(pags); r.arquivo = f; r.T = fisioPreparar(r.testes); r.achados = fisioAchados(r.T); r.sug = sugerirAtleta(r.nome || '');
      lidas.push(r);
    } catch (e) { lidas.push({ arquivo: f, erro: e.message }); }
  }
  conferirPhast(lidas);
}
function conferirPhast(lidas) {
  const ok = lidas.filter(r => !r.erro), ruins = lidas.filter(r => r.erro);
  const atlOpts = sel => opts(S.atletas.filter(a => a.ativo).sort((a, b) => a.nome.localeCompare(b.nome)).map(a => [a.id, `${a.nome} · ${a.posicao}`]), sel, 'Escolha o atleta…');
  modal(`<h2>Conferir avaliações</h2>
    <p class="m">Confira o atleta de cada relatório. Na primeira vez o CINQ aprende o vínculo entre o nome do Phast e o atleta do elenco.</p>
    ${ruins.map(r => `<div class="note bad">${esc(r.arquivo.name)}: ${esc(r.erro)}</div>`).join('')}
    ${ok.map((r, i) => { const ja = r.sug.id && S.fisio.av.some(x => x.atleta_id === r.sug.id && x.data === r.data);
      return `<details class="conf" data-i="${i}"${ok.length === 1 ? ' open' : ''}><summary><b>${esc(r.nome || '?')}</b> · ${dataBR(r.data)} · ${r.T.length} testes · ${r.T.filter(t => t.cor === 'al').length} em alerta
        ${r.sug.certo ? '<span class="badge s-Titular">atleta vinculado</span>' : r.sug.id && !r.sug.empate ? '<span class="badge t-Treino">confira o atleta</span>' : '<span class="badge s-Inativo">escolha o atleta</span>'}${ja ? ' <span class="badge s-Ativo">já existe · será atualizada</span>' : ''}</summary>
        <div class="g2 fs-cf"><label class="f"><span>Atleta do elenco</span><select class="in" data-atl="${i}">${atlOpts(r.sug.empate ? '' : r.sug.id)}</select></label>
          <label class="f"><span>Motivo</span><select class="in" data-mot="${i}">${opts(MOTIVOS_FISIO, S.atletas.length && r.data >= INICIO_PRETEMPORADA ? 'Pré-temporada' : 'Pré-temporada')}</select></label></div>
        ${r.alertas.length ? `<ul class="conf-al">${r.alertas.map(a => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}
        <div class="fs-cf-t">${r.T.map(t => `<span>${dotF(t.cor)}${esc(t.nome)}</span>`).join('')}</div>
        ${r.achados.length ? `<div class="fs-cf-a"><b>Achados:</b> ${r.achados.filter(x => x.nivel !== 'info').map(x => esc(x.titulo)).join(' · ') || '—'}</div>` : ''}
      </details>`; }).join('')}
    <div class="mfoot"><span class="m">${ok.length} relatório${ok.length === 1 ? '' : 's'}</span><div class="row"><button class="btn" id="fcan">Cancelar</button>${ok.length ? `<button class="btn pri" id="fsal">Salvar ${ok.length}</button>` : ''}</div></div>`, true);
  $('#fcan').onclick = fechar;
  if (!$('#fsal')) return;
  $('#fsal').onclick = async () => {
    const sel = ok.map((r, i) => ({ r, atl: +document.querySelector(`[data-atl="${i}"]`).value || null, mot: document.querySelector(`[data-mot="${i}"]`).value }));
    if (sel.some(x => !x.atl)) return toast('Escolha o atleta de todos os relatórios.', true);
    const b = $('#fsal'); b.disabled = true; b.textContent = 'Salvando…';
    let n = 0;
    for (const { r, atl, mot } of sel) {
      try {
        const path = `${atl}/${r.data}_${Date.now()}.pdf`;
        const up = await sb.storage.from('fisio').upload(path, r.arquivo, { contentType: 'application/pdf', upsert: true });
        if (up.error) throw up.error;
        const velha = S.fisio.av.find(x => x.atleta_id === atl && x.data === r.data);
        const row = { atleta_id: atl, data: r.data, origem: 'phast', motivo: mot, nome_relatorio: r.nome, idade: r.idade || null, avaliador: r.avaliador || null,
          anamnese: r.anamnese, testes: r.testes, arquivo_path: path };
        const res = await sb.from('fisio_avaliacoes').upsert(row, { onConflict: 'atleta_id,data' }).select().single();
        if (res.error) throw res.error;
        if (velha?.arquivo_path && velha.arquivo_path !== path) await sb.storage.from('fisio').remove([velha.arquivo_path]);
        if (r.nome) await sb.from('fisio_vinculos').upsert({ nome_relatorio: r.nome, atleta_id: atl }, { onConflict: 'nome_relatorio' });
        n++;
      } catch (e) { toast(`${r.nome}: ${erroAmigavel(e)}`, true); }
    }
    await carregarFisio(true); fechar();
    toast(`${n} avaliação${n === 1 ? '' : 'ões'} salva${n === 1 ? '' : 's'}.`);
    if (S.page === 'fisio') pFisio(); else ir('fisio');
  };
}

/* ============ encaixe no sistema ============ */
function navFisio() {
  const b = [...document.querySelectorAll('#nav button[disabled]')].find(x => x.textContent.trim().startsWith('Fisioterapia'));
  if (!b) return;
  if (!podeLerFisio()) return;
  const n = document.createElement('button'); n.dataset.p = 'fisio'; n.textContent = 'Fisioterapia / DM';
  n.classList.toggle('on', S.page === 'fisio'); b.replaceWith(n);
}
const _shellFisio = shell;
shell = function () { _shellFisio(); navFisio(); };
const _irFisio = ir;
ir = function (p) {
  if (p !== 'fisio') return _irFisio(p);
  if (!podeLerFisio()) return _irFisio('inicio');
  S.page = p;
  document.querySelectorAll('#nav button[data-p]').forEach(b => b.classList.toggle('on', b.dataset.p === p));
  pFisio(); window.scrollTo(0, 0);
};
const _verAtletaFisio = verAtleta;
verAtleta = function (a) {
  _verAtletaFisio(a);
  if (!podeLerFisio()) return;
  carregarFisio().then(() => {
    if (!avDe(a.id).length) return;
    const r = document.querySelector('#modal .mfoot .row'); if (!r) return;
    const b = document.createElement('button'); b.className = 'btn'; b.textContent = 'Avaliação fisio';
    b.onclick = () => fichaFisio(a.id); r.prepend(b);
  }).catch(() => {});
};
if (document.getElementById('main') && S.perfil) { navFisio(); if (S.page === 'fisio') ir('fisio'); }
