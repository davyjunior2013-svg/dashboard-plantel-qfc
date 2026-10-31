/* CINQ · Resumo do ciclo de treinos
   Um ciclo é a sequência de dias seguidos com sessões de trabalho (treino, avaliação, recuperação).
   Ele fecha quando o dia seguinte é folga, amistoso ou jogo, ou não tem sessão (domingo sem nada conta como folga).
   A análise compara os exercícios do ciclo com o modelo de jogo do QFC (skill treino-qfc / métricas por espaço). */
'use strict';

/* ---------- Modelo de jogo do QFC (referência da análise) ---------- */
const MODELO = [
  { m: 'Organização ofensiva', id: 'saida', nome: 'Saída de bola com 3 + volante', chaves: ['saida de bola', 'saida com 3', 'construcao', 'constroi', 'desde o goleiro', 'primeira fase', '1a fase', 'goleiro com os pes'],
    sug: 'Construção desde o goleiro com a saída de 3 (2 zagueiros + lateral-esquerdo) e o volante à frente, contra pressão em 4-4-2.' },
  { m: 'Organização ofensiva', id: 'posse', nome: 'Posse com circulação, mobilidade e apoio ao portador', chaves: ['posse', 'circula', 'circulacao', 'mobilidade', 'apoio ao portador', 'linhas de passe', 'linha de passe em', 'ocupacao', 'manutencao'],
    sug: 'Posse a 2 toques com coringas internos/externos, linhas de passe em diferentes alturas e apoio constante ao portador.' },
  { m: 'Organização ofensiva', id: 'atrair', nome: 'Atrair → fixar → homem livre → superar a 1ª linha', chaves: ['atrai', 'atrair', 'fixa', 'fixar', 'homem livre', 'jogador livre', 'superar a 1', 'superar a primeira', 'primeira linha', '1a linha', 'passe vertical', 'entrelinhas', 'entre linhas'],
    sug: 'Atividade que obrigue a atrair e fixar para encontrar o homem livre e superar a 1ª linha de pressão.' },
  { m: 'Organização ofensiva', id: 'superioridade', nome: 'Gerar superioridade numérica (2x1, 3x2, 4x3…)', chaves: ['superioridade', '2x1', '3x2', '4x3', '5x4', '6x5', '6x4', '5x3', 'coringa', 'apoio externo', 'apoios externos'],
    sug: 'Situações de 3x2 / 4x3 depois de superar a linha, terminando em finalização.' },
  { m: 'Organização ofensiva', id: 'orientado', nome: 'Receber orientado, ombro livre e terceiro homem', chaves: ['orientado', 'orientada', 'ombro livre', 'terceiro homem', '3o homem', 'perfil corporal', 'posicionamento corporal'],
    sug: 'Exercício de receção orientada com ataque ao ombro livre e terceiro homem quando o receptor estiver marcado.' },
  { m: 'Organização ofensiva', id: 'profundidade', nome: 'Ataque à profundidade (ruptura + 2 atacando o espaço)', chaves: ['ruptura', 'profundidade', 'costas da linha', 'nas costas', 'atacar o espaco', 'atacam o espaco', 'ataque ao espaco'],
    sug: 'Passe de ruptura com 2 jogadores atacando o espaço ao mesmo tempo, nas costas da linha defensiva.' },
  { m: 'Organização ofensiva', id: 'amplitude', nome: 'Amplitude e movimentações ofensivas da equipe', chaves: ['amplitude', 'extremo', 'corredor lateral', 'cruzamento', 'cruza', 'movimentacao ofensiva', 'movimentacoes ofensivas', 'lateral direito', 'ponta'],
    sug: 'Treinar as 4 movimentações ofensivas da comissão, com amplitude do extremo esquerdo e do lateral-direito.' },
  { m: 'Organização ofensiva', id: 'finalizacao', nome: 'Finalização (domínio orientado + até 2 toques)', chaves: ['finaliza', 'finalizacao', 'finalizar', 'chute', 'baliza', 'gol '],
    sug: 'Domínio orientado + finalização em até 2 toques, em situação de jogo.' },
  { m: 'Transição defensiva', id: 'reacao', nome: 'Reação imediata pós-perda (regra dos 6 s)', chaves: ['pos-perda', 'pos perda', 'perdeu', 'perda da bola', 'na perda', 'apos perder', 'reage', 'reagir', 'reacao imediata', 'reacao a perda', 'reacao em', '6 segundos', '7 segundos', 'seis segundos', 'sete segundos', 'atacar marcando'],
    sug: 'Jogo reduzido com a regra dos 6 segundos: PERDEU → REAGE → APROXIMA → CRIA SUPERIORIDADE → RECUPERA.' },
  { m: 'Organização defensiva', id: 'pressao', nome: 'Pressão coordenada (1 salta, os demais fecham linhas)', chaves: ['pressiona', 'pressao', 'pressionar', 'salta no portador', 'fecham linha', 'fechar linha', 'tiram a linha', 'tirar a linha', 'induz', 'induzir'],
    sug: 'Pressão coordenada: 1 salta no portador e os demais fecham as linhas de passe para induzir o erro.' },
  { m: 'Organização defensiva', id: 'bloco', nome: 'Reorganização defensiva (4-3-1, linha de 4 compacta)', chaves: ['4-3-1', 'linha de 4', 'linha defensiva', 'bloco', 'compact', 'reorganiza', 'balanco defensivo', 'balanco'],
    sug: 'Reorganização em 4-3-1 com a linha de 4 compacta e balanço defensivo.' },
  { m: 'Transição ofensiva', id: 'recuperou', nome: 'Ao recuperar: assegurar a 1ª ação e atacar rápido', chaves: ['ao recuperar', 'recupera', 'recuperar', 'recuperacao', 'transita', 'transicao', 'contra-ataque', 'contra ataque', 'ataque rapido', 'procurar a frente'],
    sug: 'Ao recuperar: assegurar a 1ª ação, procurar a frente / conectar com o apoio ou atacar rápido as mini-traves.' },
  { m: 'Bola parada', id: 'bp', nome: 'Bola parada ofensiva e defensiva', chaves: ['bola parada', 'escanteio', 'falta frontal', 'cobranca de falta', 'tiro de canto', 'lateral cobrado'],
    sug: 'Bloco de bola parada ofensiva e defensiva (ainda não detalhada no modelo de jogo registrado).', fora: true }
];
const MOMENTOS = ['Organização ofensiva', 'Transição defensiva', 'Organização defensiva', 'Transição ofensiva'];
const TIPO_TRAB = ['Treino', 'Avaliação', 'Recuperação'], TIPO_PAUSA = ['Folga', 'Amistoso', 'Jogo'];

const semAcento = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/* ---------- Ciclos ---------- */
function calcularCiclos() {
  const porDia = {};
  S.sessoes.forEach(s => (porDia[s.data] = porDia[s.data] || []).push(s));
  const trabalho = d => (porDia[d] || []).some(s => TIPO_TRAB.includes(s.tipo)) && !(porDia[d] || []).some(s => TIPO_PAUSA.includes(s.tipo));
  const dias = Object.keys(porDia).filter(trabalho).sort();
  const ciclos = [];
  for (const d of dias) {
    const c = ciclos[ciclos.length - 1];
    if (c && addDays(c.fim, 1) === d) c.fim = d, c.dias.push(d); else ciclos.push({ ini: d, fim: d, dias: [d] });
  }
  const h = hoje(), agora = new Date();
  ciclos.forEach(c => {
    c.sessoes = S.sessoes.filter(s => s.data >= c.ini && s.data <= c.fim && TIPO_TRAB.includes(s.tipo)).sort(ordSes);
    c.exercicios = c.sessoes.flatMap(s => exDe(s.id).map(e => ({ ...e, _s: s })));
    const prox = addDays(c.fim, 1), ps = (porDia[prox] || []).sort(ordSes);
    const pausa = ps.find(s => TIPO_PAUSA.includes(s.tipo));

    // fim real da última sessão: hora + tempo dos exercícios (ou 2 h)
    const ult = c.sessoes[c.sessoes.length - 1];
    const min = exDe(ult.id).reduce((a, e) => a + (e.duracao_min || 0), 0) || 120;
    const [hh, mm] = String(ult.hora || '18:00').split(':').map(Number);
    const fimUlt = new Date(parse(ult.data)); fimUlt.setHours(hh, mm + min, 0, 0);
    const dow = parse(prox).getDay();
    const pausaConfirmada = !!pausa || (!ps.length && (dow === 0 || prox < h));
    c.fechado = agora > fimUlt && pausaConfirmada;
    c.proximo = pausa ? `${pausa.tipo}${pausa.adversario ? ' x ' + pausa.adversario : ''} · ${fmt(prox)}` : (pausaConfirmada ? `Folga · ${fmt(prox)}` : '');
    c.id = c.ini;
  });
  return ciclos;
}

/* ---------- Análise ---------- */
function tipoAtividade(e) {
  const t = semAcento([e.nome, e.objetivo, e.comportamento, e.descricao].join(' '));
  if (/11x11|10x10|jogo formal|coletivo/.test(t)) return { r: 4, n: 'Jogo formal' };
  const temSit = /\d+\s?x\s?\d+/.test(t) || /goleiro|gk|baliza|mini-?trave/.test(t);
  if (/sem oposicao|circulacao tecnica|analitic|tecnico/.test(t) && !/x\d/.test(t.replace(/\s/g, ''))) return { r: 0, n: 'Técnico / analítico' };
  if (temSit && /finaliz/.test(t)) return { r: 3, n: 'Jogo reduzido com finalização' };
  if (/posse|rondo|manutencao/.test(t) && /transi|recupera/.test(t)) return { r: 2, n: 'Posse com transição' };
  if (/posse|rondo|manutencao|pressao|pressiona/.test(t)) return { r: 1, n: 'Posse / pressão' };
  return { r: temSit ? 3 : 1, n: temSit ? 'Jogo reduzido' : 'Outro' };
}

function medidas(e) {
  const t = semAcento([e.material, e.descricao].join(' '));
  const m = t.match(/(\d{2,3})\s?x\s?(\d{2,3})\s?m/);
  return m ? { txt: `${m[1]} x ${m[2]} m`, area: +m[1] * +m[2] } : null;
}

function analisarCiclo(c) {
  const ex = c.exercicios, porP = {};
  MODELO.forEach(p => (porP[p.id] = []));
  ex.forEach(e => {
    const forte = semAcento([e.nome, e.objetivo, e.comportamento].join(' ')), fraco = semAcento([e.indicadores, e.descricao].join(' '));
    MODELO.forEach(p => {
      const score = p.chaves.reduce((a, k) => a + (forte.includes(k) ? 2 : 0) + (fraco.includes(k) ? 1 : 0), 0);
      if (score >= 2) porP[p.id].push(e);
    });
  });
  const peso = e => e.duracao_min || 1, temTempo = ex.some(e => e.duracao_min);
  const momentos = MOMENTOS.map(m => {
    const ps = MODELO.filter(p => p.m === m), exs = new Set(ps.flatMap(p => porP[p.id]));
    return { m, cobertos: ps.filter(p => porP[p.id].length).length, total: ps.length, carga: [...exs].reduce((a, e) => a + peso(e), 0) };
  });
  const cargaTot = momentos.reduce((a, x) => a + x.carga, 0) || 1;
  momentos.forEach(x => (x.pct = Math.round(x.carga / cargaTot * 100)));
  const nucleo = MODELO.filter(p => !p.fora), trab = nucleo.filter(p => porP[p.id].length), falta = nucleo.filter(p => !porP[p.id].length);
  const momCobertos = momentos.filter(x => x.cobertos).length;

  // checagens metodológicas
  const checks = [];
  const doisToques = ex.filter(e => /2 toques|dois toques/.test(semAcento([e.descricao, e.objetivo, e.indicadores].join(' '))));
  const posses = ex.filter(e => tipoAtividade(e).r === 1 || tipoAtividade(e).r === 2);
  if (posses.length && !doisToques.length) checks.push({ n: 'warn', t: `Regra padrão de 2 toques não aparece em nenhum plano de posse (${posses.length} atividade${posses.length > 1 ? 's' : ''}).` });
  c.sessoes.forEach(s => {
    const lst = exDe(s.id); if (lst.length < 2) return;
    const rs = lst.map(tipoAtividade), quebra = rs.findIndex((r, i) => i && r.r < rs[i - 1].r);
    if (quebra > 0) checks.push({ n: 'warn', t: `${fmt(s.data)}: a progressão volta de “${rs[quebra - 1].n}” para “${rs[quebra].n}” (${lst[quebra].nome}). Pelo modelo, a sessão sobe de posse/pressão até o jogo.` });
  });
  const esperado = { 3: 'Grande · resistência (distância)', 6: 'Grande · resistência (distância)', 5: 'Médio · velocidade (sprint)', 4: 'Pequeno · força (Acc/Dcc)' };
  const espacos = [];
  c.sessoes.forEach(s => {
    const dow = parse(s.data).getDay(), exp = esperado[dow];
    exDe(s.id).forEach(e => {
      const md = medidas(e);
      let alerta = '';
      if (md && exp) {
        if (exp.startsWith('Pequeno') && md.area > 1000) alerta = 'espaço parece grande para força';
        if (exp.startsWith('Grande') && md.area < 800) alerta = 'espaço parece pequeno para resistência';
        if (exp.startsWith('Médio') && /transi/.test(semAcento([e.objetivo, e.comportamento, e.descricao].join(' '))) === false) alerta = 'sem transição, o sprint pode não ser atingido';
      }
      espacos.push({ d: s.data, e: e.nome, md, exp, alerta });
    });
  });
  espacos.filter(x => x.alerta).forEach(x => checks.push({ n: 'warn', t: `${fmt(x.d)} · ${x.e}: ${x.md.txt} num dia de ${x.exp.toLowerCase()} — ${x.alerta}. Conferir com o treinador.` }));
  const seg = ex.map(e => (semAcento([e.objetivo, e.comportamento, e.descricao].join(' ')).match(/(\d+)\s*segundos/) || [])[1]).filter(Boolean);
  const outros = [...new Set(seg.filter(x => x !== '6'))];
  if (outros.length) checks.push({ n: 'warn', t: `Regra de reação à perda: o modelo prevê 6 segundos, mas ${outros.length === 1 && outros[0] === '7' ? 'os planos usam 7 segundos' : 'os planos usam ' + outros.join(' / ') + ' segundos'}. Confirmar qual é a referência.` });
  const semTexto = ex.filter(e => !e.objetivo && !e.comportamento && !e.descricao);
  if (semTexto.length) checks.push({ n: 'warn', t: `${semTexto.map(e => `${fmt(e._s.data)} · ${e.nome}${e.numero_plano ? ' (plano ' + e.numero_plano + ')' : ''}`).join('; ')}: sem objetivo nem descrição no PDF, ficou fora da análise.` });
  const semMedida = espacos.filter(x => !x.md).length;
  if (semMedida) checks.push({ n: 'info', t: `${semMedida} atividade${semMedida > 1 ? 's' : ''} sem medida de espaço no plano: a checagem espaço × dia fica incompleta.` });
  const semTempo = ex.filter(e => !e.duracao_min).length;
  if (semTempo) checks.push({ n: 'info', t: `${semTempo} de ${ex.length} exercícios sem tempo preenchido: o equilíbrio entre momentos está sendo calculado pelo número de exercícios, não pelos minutos.` });
  const semBal = ex.filter(e => !e.balanco).length;
  if (ex.length && semBal === ex.length) checks.push({ n: 'info', t: 'Nenhum exercício tem balanço registrado: a leitura de “como foi” depende das observações da comissão.' });

  // veredito
  let ver, cls, motivo;
  const pctNucleo = trab.length / nucleo.length;
  if (!ex.length) { ver = 'Sem planos de treino'; cls = 'v-neutro'; motivo = 'O ciclo ainda não tem exercícios importados. A análise começa quando os planos do Dossier forem adicionados às sessões.'; }
  else if (momCobertos === 4 && pctNucleo >= 0.6) { ver = 'No caminho do modelo'; cls = 'v-ok'; motivo = `Os 4 momentos do jogo foram treinados e ${trab.length} de ${nucleo.length} princípios do modelo apareceram nos exercícios.`; }
  else if (momCobertos >= 2 && pctNucleo >= 0.35) { ver = 'Parcialmente alinhado'; cls = 'v-meio'; motivo = `${momCobertos} de 4 momentos do jogo e ${trab.length} de ${nucleo.length} princípios trabalhados. ${falta.length ? 'Há lacunas importantes listadas abaixo.' : ''}`; }
  else { ver = 'Atenção ao modelo'; cls = 'v-alerta'; motivo = `Só ${momCobertos} de 4 momentos e ${trab.length} de ${nucleo.length} princípios do modelo apareceram no ciclo.`; }
  const desequilibrio = momentos.filter(x => x.pct >= 60);
  if (ex.length && desequilibrio.length) motivo += ` O ciclo concentrou ${desequilibrio[0].pct}% do ${temTempo ? 'tempo' : 'volume'} em ${desequilibrio[0].m.toLowerCase()}.`;

  // prioridades para o próximo ciclo: primeiro momentos zerados, depois princípios que faltam
  const momZero = momentos.filter(x => !x.cobertos).map(x => x.m);
  const prioridades = [...falta].sort((a, b) => (momZero.includes(b.m) - momZero.includes(a.m))).slice(0, 4);
  const bp = MODELO.find(p => p.fora);

  return { porP, momentos, trab, falta, checks, ver, cls, motivo, prioridades, temTempo, bpTrab: porP[bp.id].length > 0, bp };
}

/* ---------- Tela ---------- */
function htmlResumo(c, a) {
  const tempo = c.exercicios.reduce((x, e) => x + (e.duracao_min || 0), 0);
  const status = c.fechado ? '<span class="badge t-Recuperação">Fechado</span>' : '<span class="badge t-Amistoso">Em andamento</span>';
  const linhaP = p => { const n = a.porP[p.id].length; return `<li><b>${esc(p.nome)}</b> <span class="m">${n} exercício${n > 1 ? 's' : ''}: ${esc([...new Set(a.porP[p.id].map(e => e.nome))].join(', '))}</span></li>`; };
  return `<div class="ciclo" id="ciclo-${c.id}">
    <div class="ciclo-head"><div><div class="eyebrow">Resumo do ciclo · ${fmt(c.ini)} a ${fmt(c.fim)}</div>
      <h2>${c.dias.length} dia${c.dias.length > 1 ? 's' : ''} · ${c.sessoes.length} sess${c.sessoes.length > 1 ? 'ões' : 'ão'} · ${c.exercicios.length} exercícios${tempo ? ' · ' + tempo + ' min' : ''}</h2>
      <p class="m">${status}${c.proximo ? ' Próximo: ' + esc(c.proximo) : ''}</p></div>
      <div class="row nao-imprimir"><button class="btn sm" data-exp="pdf" data-c="${c.id}">Exportar PDF</button><button class="btn sm" data-exp="img" data-c="${c.id}">Exportar imagem</button></div></div>
    <div class="veredito ${a.cls}"><b>${esc(a.ver)}</b><span>${esc(a.motivo)}</span></div>
    ${c.exercicios.length ? `
    <div class="ciclo-grid">
      <div><div class="k">Equilíbrio entre os momentos do jogo ${a.temTempo ? '(por minutos)' : '(por nº de exercícios)'}</div>
        ${a.momentos.map(x => `<div class="bar"><span>${esc(x.m)}</span><div><i style="width:${x.pct}%;${x.cobertos ? '' : 'background:#e0a49c'}"></i></div><b>${x.pct}%</b></div>`).join('')}</div>
      <div><div class="k">O que faltou para o modelo</div>
        ${a.prioridades.length ? `<ol class="falta">${a.prioridades.map(p => `<li><b>${esc(p.nome)}</b> <span class="m">(${esc(p.m)})</span><br><span>${esc(p.sug)}</span></li>`).join('')}</ol>` : '<p class="ok">Todos os princípios do modelo apareceram no ciclo.</p>'}
        ${a.falta.length > a.prioridades.length ? `<p class="m" style="font-size:12px">Também não apareceram: ${esc(a.falta.slice(a.prioridades.length).map(p => p.nome).join('; '))}.</p>` : ''}
        ${!a.bpTrab ? `<p class="m" style="font-size:12px">Bola parada não foi treinada (não está detalhada no modelo registrado).</p>` : ''}</div>
    </div>
    <div class="k" style="margin-top:12px">Princípios do modelo trabalhados</div>
    <ul class="trab">${a.trab.map(linhaP).join('')}</ul>
    ${a.checks.length ? `<div class="k">Checagens de metodologia</div><ul class="checks">${a.checks.map(x => `<li class="${x.n}">${esc(x.t)}</li>`).join('')}</ul>` : ''}` : ''}
    <details class="nao-imprimir"><summary>Modelo de jogo usado nesta análise</summary><ul class="modelo">${MODELO.map(p => `<li><b>${esc(p.m)}:</b> ${esc(p.nome)}</li>`).join('')}</ul><p class="m" style="font-size:12px">A análise procura esses princípios no nome, objetivo, comportamento-chave, indicadores e descrição de cada plano do Dossier. Para mudar o modelo, fale com o administrador do CINQ.</p></details>
  </div>`;
}

function ligarExport(root) {
  root.querySelectorAll('[data-exp]').forEach(b => b.onclick = () => exportarCiclo(b.dataset.c, b.dataset.exp));
}

async function exportarCiclo(id, tipo) {
  const el = document.getElementById('ciclo-' + id); if (!el) return;
  if (tipo === 'pdf') {
    const w = document.createElement('div'); w.id = 'print-area';
    w.innerHTML = `<div class="print-head"><img src="${LOGO}" alt=""><div><b>CINQ · Centro de Inteligência do QFC</b><span>Resumo do ciclo de treinos</span></div></div>` + el.outerHTML;
    document.body.appendChild(w); document.body.classList.add('imprimindo');
    setTimeout(() => { window.print(); setTimeout(() => { w.remove(); document.body.classList.remove('imprimindo'); }, 500); }, 200);
    return;
  }
  try {
    if (!window.html2canvas) await new Promise((ok, err) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'; s.onload = ok; s.onerror = err; document.head.appendChild(s); });
    el.classList.add('exportando');
    const cv = await html2canvas(el, { backgroundColor: '#ffffff', scale: 2, useCORS: true, ignoreElements: n => n.classList?.contains('nao-imprimir') });
    el.classList.remove('exportando');
    const a = document.createElement('a'); a.download = `CINQ_resumo_ciclo_${id}.png`; a.href = cv.toDataURL('image/png'); document.body.appendChild(a); a.click(); a.remove();
    toast('Imagem do resumo gerada.');
  } catch (e) { el.classList.remove('exportando'); toast('Não foi possível gerar a imagem. Tente exportar em PDF.', true); }
}

/* ---------- Encaixe nas telas existentes ---------- */
const _pCalendarioBase = pCalendario;
pCalendario = function () {
  _pCalendarioBase();
  const ini = S.semana, fim = addDays(ini, 6);
  const cs = calcularCiclos().filter(c => c.fim >= ini && c.ini <= fim);
  const box = document.createElement('div'); box.className = 'ciclos';
  try { box.innerHTML = cs.length ? cs.map(c => htmlResumo(c, analisarCiclo(c))).join('') : '<div class="panel empty">Nenhum ciclo de treino nesta semana ainda. O resumo aparece assim que houver sessões de treino.</div>'; }
  catch (e) { console.error(e); box.innerHTML = '<div class="panel empty">Não foi possível montar o resumo do ciclo.</div>'; }
  $('#main').appendChild(box); ligarExport(box);
};

const _pInicioBase = pInicio;
pInicio = function () {
  _pInicioBase();
  try { inicioCiclo(); } catch (e) { console.error(e); }
};
function inicioCiclo() {
  const h = hoje(), cs = calcularCiclos().filter(c => c.ini <= h);
  const c = cs[cs.length - 1]; if (!c) return;
  const a = analisarCiclo(c), box = document.createElement('div');
  box.className = 'panel';
  box.innerHTML = `<h2>Ciclo atual · ${fmt(c.ini)} a ${fmt(c.fim)} ${c.fechado ? '<span class="badge t-Recuperação">Fechado</span>' : '<span class="badge t-Amistoso">Em andamento</span>'}</h2>
    <div class="veredito ${a.cls}"><b>${esc(a.ver)}</b><span>${esc(a.motivo)}</span></div>
    ${a.prioridades.length ? `<p class="m" style="margin:8px 0 0;font-size:13px"><b>Faltou:</b> ${esc(a.prioridades.map(p => p.nome).join(' · '))}</p>` : ''}
    <button class="btn sm" id="vciclo" style="margin-top:10px">Ver resumo completo no calendário</button>`;
  const ref = [...document.querySelectorAll('#main .panel')].find(p => /Hoje/.test(p.querySelector('h2')?.textContent || ''));
  ref ? ref.before(box) : $('#main').appendChild(box);
  $('#vciclo').onclick = () => { S.semana = segunda(c.fim); ir('calendario'); setTimeout(() => document.getElementById('ciclo-' + c.id)?.scrollIntoView({ block: 'start' }), 50); };
}

// se a tela já foi montada antes deste arquivo carregar, monta de novo com o resumo
if (document.getElementById('main') && S.perfil) ir(S.page);
