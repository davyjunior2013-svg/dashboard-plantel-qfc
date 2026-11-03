/* CINQ · Fisioterapia / DM — Central, Atendimento, Lesões e Prevenção
   Central: indicadores do departamento (hoje, período, temporada), alertas e acompanhamento por atleta.
   Atendimento: registro diário do fisio (condutas com botões criados por ele, PSE só de quem passou no DM, atenção especial)
   e o relatório geral do dia em PDF/texto. Lesões: registro (padrão UEFA/COI), etapas até a liberação médica,
   linha do tempo, dias fora. Prevenção: preventivos de cada atleta (ciclo de até 45 dias) com adesão automática pelos atendimentos.
   A situação do atleta (DM, Restrito/Transição, Liberado) aparece no Painel Geral, Elenco, Calendário e Mapa tático. */
'use strict';

FUNCOES.medico = 'Médico';
S.dm = { ok: false, condutas: [], dias: {}, pse: [], lesoes: [], notas: [], prev: [], atend: [], cfg: {}, data: null, semana: null, periodo: 7 };
const ETAPAS = ['DM', 'Reabilitação', 'Transição em campo', 'Treino com restrição', 'Liberado'];
const ETAPA_SIT = { 'DM': 'DM', 'Reabilitação': 'DM', 'Transição em campo': 'Restrito/Transição', 'Treino com restrição': 'Restrito/Transição', 'Liberado': 'Liberado' };
const FINALIDADES = ['Tratamento', 'Prevenção', 'Recuperação'];
const MOMENTOS_AT = ['Antes do treino', 'Depois do treino', 'Outro'];
const CONTEXTOS = ['Treino', 'Jogo', 'Fora do clube', 'Anterior ao clube'];
const MECANISMOS = ['Sem contato', 'Contato', 'Sobrecarga', 'Não informado'];
const TIPOS_LESAO = ['Muscular', 'Ligamentar', 'Tendínea', 'Articular', 'Contusão', 'Fratura', 'Outra'];
const CICLO_PREV = 45; // dias: cada atleta fica no máximo 1 mês e meio com o preventivo, depois reavalia e atualiza os exercícios
const REGIOES = ['Posterior de coxa', 'Anterior de coxa', 'Adutores', 'Panturrilha', 'Joelho', 'Tornozelo', 'Pé', 'Quadril', 'Virilha', 'Lombar', 'Tronco', 'Ombro', 'Cervical', 'MMII', 'MMSS'];
const podeDM = () => isAdmin() || ['fisio', 'medico'].includes(S.perfil?.funcao);
const podeLiberar = () => isAdmin() || S.perfil?.funcao === 'medico';
const classifPSE = m => m == null ? null : Math.round(m) <= 4 ? 'Leve' : Math.round(m) <= 6 ? 'Moderado' : 'Intenso';
const ladoTxtDM = l => ({ D: 'direito', E: 'esquerdo', Bilateral: 'bilateral' }[l] || '');
const nomeA = id => S.atletas.find(a => a.id === id)?.nome || '?';
const diasEntre = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);
const dmLista = (arr, sel) => opts(arr, sel, '—');
const pseDe = (d, id) => S.dm.pse.find(x => x.data === d && x.atleta_id === id)?.nota;
const mediaPSE = d => { const v = S.dm.pse.filter(x => x.data === d).map(x => x.nota); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length * 10) / 10 : null; };

/* ============ dados ============ */
async function carregarDM(forcar) {
  if (S.dm.ok && !forcar) return;
  const desde = addDays(hoje(), -400);
  const q = (t, f) => { let x = sb.from(t).select('*'); return f ? f(x) : x; };
  const [c, d, p, l, n, pv, at, cf] = await Promise.all([
    q('fisio_condutas', x => x.order('ordem').order('id')), q('fisio_dias', x => x.gte('data', desde)), q('fisio_pse', x => x.gte('data', desde)),
    q('fisio_lesoes', x => x.order('data_inicio')), q('fisio_notas', x => x.order('data').order('id')), q('fisio_prevencao', x => x.order('id')),
    q('fisio_atendimentos', x => x.gte('data', desde).order('data').order('ordem').order('id')), q('fisio_config')]);
  for (const r of [c, d, p, l, n, pv, at, cf]) if (r.error) throw r.error;
  S.dm.condutas = c.data; S.dm.dias = Object.fromEntries(d.data.map(x => [x.data, x])); S.dm.pse = p.data;
  S.dm.lesoes = l.data; S.dm.notas = n.data; S.dm.prev = pv.data; S.dm.atend = at.data;
  S.dm.cfg = Object.fromEntries(cf.data.map(x => [x.chave, x.valor])); S.dm.ok = true;
}
const lesaoAtiva = l => !l.anterior_clube && l.etapa !== 'Liberado';
function situacao(id) {
  const l = S.dm.lesoes.filter(x => x.atleta_id === id && lesaoAtiva(x)).sort((a, b) => ETAPAS.indexOf(a.etapa) - ETAPAS.indexOf(b.etapa))[0];
  return l ? { sit: ETAPA_SIT[l.etapa], lesao: l } : { sit: 'Liberado', lesao: null };
}
const sitBadge = s => s === 'DM' ? '<span class="badge dm-b dm-dm">DM</span>' : s === 'Restrito/Transição' ? '<span class="badge dm-b dm-rt">Restrito/Transição</span>' : '';
const tituloLesao = l => l.diagnostico || [l.categoria === 'Doença' ? 'Doença' : l.tipo, l.grau ? 'grau ' + l.grau : '', l.regiao, ladoTxtDM(l.lado)].filter(Boolean).join(' ') || l.categoria;
const diasFora = l => diasEntre(l.data_inicio, l.data_retorno || hoje());
function sessoesPerdidas(l) {
  const fim = l.data_retorno || hoje();
  const s = S.sessoes.filter(x => x.data >= l.data_inicio && x.data < fim);
  return { treinos: s.filter(x => ['Treino', 'Avaliação', 'Recuperação'].includes(x.tipo)).length, jogos: s.filter(x => ['Jogo', 'Amistoso'].includes(x.tipo)).length };
}

/* ============ abas ============ */
async function pFisioDM(aba) {
  const tit = { central: 'Central', atendimento: 'Atendimento', lesoes: 'Lesões', prevencao: 'Prevenção' }[aba];
  $('#main').innerHTML = topo('Fisioterapia / DM', tit, '') + fsTabs(aba) + '<div class="panel empty">Carregando…</div>';
  ligarAbasFs();
  try { await carregarDM(); if (aba === 'central') await carregarFisio().catch(() => {}); } catch (e) { $('#main .panel').innerHTML = esc(erroAmigavel(e)); return; }
  ({ central: pCentral, atendimento: pAtendimento, lesoes: pLesoes, prevencao: pPrevencao }[aba])();
}

/* ============ CENTRAL ============ */
// região da queixa × achados da última avaliação (título + foco)
const REG_ACHADO = { 'posterior de coxa': /isquio|posterior de coxa/, 'anterior de coxa': /quadricep|reto femoral|anterior de coxa|flexores do quadril/, 'adutores': /adut|virilha/, 'virilha': /adut|virilha|flexores do quadril/,
  'panturrilha': /panturr|solear|gastroc|dorsiflex/, 'tornozelo': /tornozelo|dorsiflex/, 'pe': /arco plantar|controle do pe/, 'joelho': /joelho/, 'quadril': /quadril|glute|pelv/,
  'lombar': /lombo|tronco|pelv/, 'tronco': /lombo|tronco|pelv/, 'ombro': /ombro|quadrante superior|ckcuest/ };
function achadoDaRegiao(id, regiao) {
  const re = REG_ACHADO[fNorm(regiao)]; if (!re || typeof ultimaAv !== 'function' || !S.fisio?.ok) return null;
  const av = ultimaAv(id); if (!av) return null; const rv = av.revisao || {};
  return (av.achados || []).find(a => (a.nivel === 'al' || a.nivel === 'at') && rv[a.chave] !== 'descartado' && re.test(fNorm(a.titulo + ' ' + (a.foco || '')))) || null;
}
function alertasDM(h) {
  const A = [], add = (nivel, tipo, id, texto) => A.push({ nivel, tipo, id, texto });
  const ativos = S.atletas.filter(a => a.ativo && a.status !== 'Inativo'), ids = new Set(ativos.map(a => a.id));
  S.dm.lesoes.filter(l => lesaoAtiva(l) && ids.has(l.atleta_id) && l.previsao_retorno && l.previsao_retorno < h).forEach(l =>
    add('al', 'Retorno atrasado', l.atleta_id, `${tituloLesao(l)} · previsão era ${fmt(l.previsao_retorno)} (${diasEntre(l.previsao_retorno, h)} dias) · etapa ${l.etapa}`));
  const u7 = S.dm.atend.filter(x => x.queixa && x.regiao && x.data > addDays(h, -7) && x.data <= h), kk = {};
  u7.forEach(x => { const k = x.atleta_id + '|' + x.regiao; (kk[k] = kk[k] || new Set()).add(x.data); });
  Object.entries(kk).forEach(([k, st]) => { if (st.size >= 3) { const [id, r] = k.split('|'); add('al', 'Queixa repetida', +id, `${r}: queixa em ${st.size} dias da última semana`); } });
  const vistos = new Set();
  S.dm.atend.filter(x => x.queixa && x.regiao && x.data > addDays(h, -14) && x.data <= h).forEach(x => { const k = x.atleta_id + '|' + fNorm(x.regiao); if (vistos.has(k)) return;
    const a = achadoDaRegiao(x.atleta_id, x.regiao); if (a) { vistos.add(k); add('at', 'Queixa × avaliação', x.atleta_id, `queixa em ${x.regiao} (${fmt(x.data)}) e a avaliação já apontava: ${a.titulo}`); } });
  const ini = segunda(h), restam = diasEntre(h, addDays(ini, 6));
  S.dm.prev.filter(p => p.ativo && ids.has(p.atleta_id)).forEach(p => {
    const n = diasRevisar(p);
    if (n <= 0) add('at', 'Preventivo para revisar', p.atleta_id, `${p.item}: ciclo ${n < 0 ? `venceu há ${-n} dia${n === -1 ? '' : 's'}` : 'vence hoje'} · reavaliar e atualizar os exercícios`);
    const a = adesao(p, ini); if (a.alvo && a.feitos + restam < a.alvo) add('at', 'Preventivo atrasado', p.atleta_id, `${p.item}: ${a.feitos} de ${a.alvo} na semana, não fecha a meta`);
  });
  S.dm.lesoes.filter(l => !l.anterior_clube && l.data_retorno && ids.has(l.atleta_id) && l.data_retorno <= h && diasEntre(l.data_retorno, h) <= 14).forEach(l =>
    add('at', 'Recém-liberado', l.atleta_id, `liberado em ${fmt(l.data_retorno)} (${tituloLesao(l)}) · atenção à carga nos primeiros 14 dias`));
  if (S.fisio?.ok && typeof ultimaAv === 'function') ativos.forEach(a => { const v = ultimaAv(a.id); if (v?.proxima_reavaliacao && v.proxima_reavaliacao <= h) add('at', 'Reavaliação vencida', a.id, `avaliação física prevista para ${fmt(v.proxima_reavaliacao)}`); });
  const p7 = S.dm.pse.filter(x => x.nota >= 8 && x.data > addDays(h, -7) && x.data <= h), cp = {}; p7.forEach(x => { cp[x.atleta_id] = (cp[x.atleta_id] || 0) + 1; });
  Object.entries(cp).forEach(([id, n]) => { if (n >= 2 && ids.has(+id)) add('at', 'PSE alta repetida', +id, `PSE 8 ou mais em ${n} dias da última semana`); });
  return A.sort((a, b) => (a.nivel === 'al' ? 0 : 1) - (b.nivel === 'al' ? 0 : 1) || nomeA(a.id).localeCompare(nomeA(b.id)));
}
function linhaDisp(pts) {
  if (pts.length < 2) return '<p class="empty">A linha aparece a partir da segunda semana da temporada.</p>';
  const W = 640, H = 170, pl = 34, pr = 22, pt = 12, pb = 26, mn = Math.min(70, ...pts.map(p => p.v)), x = i => pl + i * (W - pl - pr) / (pts.length - 1), y = v => pt + (100 - v) * (H - pt - pb) / (100 - mn);
  const grid = [100, Math.round((100 + mn) / 2), mn].map(v => `<line x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}" class="dc-g"/><text x="${pl - 6}" y="${y(v) + 4}" text-anchor="end">${v}%</text>`).join('');
  const passo = Math.ceil(pts.length / 8);
  return `<svg viewBox="0 0 ${W} ${H}" class="dc-svg" role="img" aria-label="Disponibilidade semanal">${grid}
    <polyline points="${pts.map((p, i) => `${x(i)},${y(p.v)}`).join(' ')}" class="dc-l"/>
    ${pts.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.v)}" r="3.5" class="dc-p"><title>${fmt(p.d)}: ${p.v}% (${p.fora} fora)</title></circle>${i % passo === 0 || i === pts.length - 1 ? `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">${fmt(p.d)}</text>` : ''}`).join('')}</svg>`;
}
function pCentral() {
  const h = hoje(), per = S.dm.periodo || 7;
  const ativos = S.atletas.filter(a => a.ativo && a.status !== 'Inativo');
  const sit = ativos.map(a => ({ a, s: situacao(a.id) })), fora = sit.filter(x => x.s.sit !== 'Liberado');
  const nDM = fora.filter(x => x.s.sit === 'DM').length, nRT = fora.length - nDM, disp = ativos.length ? Math.round((ativos.length - nDM) / ativos.length * 100) : 100;
  const ativasL = S.dm.lesoes.filter(l => lesaoAtiva(l)), ret7 = ativasL.filter(l => l.previsao_retorno && l.previsao_retorno >= h && l.previsao_retorno <= addDays(h, 7)), atras = ativasL.filter(l => l.previsao_retorno && l.previsao_retorno < h);
  const atHoje = S.dm.atend.filter(x => x.data === h), diaH = S.dm.dias[h] || {};
  // período
  const iniTemp = INICIO_PRETEMPORADA <= h ? INICIO_PRETEMPORADA : null;
  const desde = per === 'temp' ? (iniTemp || addDays(h, -29)) : addDays(h, -(per - 1));
  const atP = S.dm.atend.filter(x => x.data >= desde && x.data <= h), contF = {}; atP.forEach(x => { contF[x.finalidade] = (contF[x.finalidade] || 0) + 1; });
  const nAtl = new Set(atP.map(x => x.atleta_id)).size;
  let alvoT = 0, feitoT = 0;
  for (let w = segunda(desde); w <= h; w = addDays(w, 7)) S.dm.prev.filter(p => p.ativo && (p.inicio || h) <= addDays(w, 6)).forEach(p => { const a = adesao(p, w); if (a.alvo) { alvoT += a.alvo; feitoT += Math.min(a.feitos, a.alvo); } });
  const temAv = S.fisio?.ok && typeof ultimaAv === 'function', semAv = temAv ? ativos.filter(a => !ultimaAv(a.id)).length : null, reavV = temAv ? ativos.filter(a => { const v = ultimaAv(a.id); return v?.proxima_reavaliacao && v.proxima_reavaliacao <= h; }).length : null;
  // barras por dia (ou semana na temporada)
  const porSemana = per === 'temp' || per > 31, chaves = [];
  if (porSemana) for (let w = segunda(desde); w <= h; w = addDays(w, 7)) chaves.push(w); else for (let d = desde; d <= h; d = addDays(d, 1)) chaves.push(d);
  const chaveDe = d => porSemana ? segunda(d) : d, cols = Object.fromEntries(chaves.map(k => [k, { Tratamento: 0, 'Prevenção': 0, 'Recuperação': 0 }]));
  atP.forEach(x => { const c = cols[chaveDe(x.data)]; if (c) c[x.finalidade]++; });
  const mxC = Math.max(1, ...Object.values(cols).map(c => c.Tratamento + c['Prevenção'] + c['Recuperação']));
  const conta = (arr, f) => { const o = {}; arr.forEach(x => { const k = f(x); if (k) o[k] = (o[k] || 0) + 1; }); return Object.entries(o).sort((a, b) => b[1] - a[1]); };
  const barras = (lst, suf = '') => { const mx = Math.max(1, ...lst.map(x => x[1])); return lst.slice(0, 7).map(([k, n, ex]) => `<div class="bar"><span>${esc(k)}</span><div><i style="width:${n / mx * 100}%"></i></div><b>${n}${suf}</b></div>${ex ? `<div class="dc-ex">${esc(ex)}</div>` : ''}`).join('') || '<p class="empty">—</p>'; };
  // temporada
  const lesT = iniTemp ? S.dm.lesoes.filter(l => !l.anterior_clube && l.data_inicio >= iniTemp) : [], so = lesT.filter(l => l.categoria === 'Lesão');
  const diasP = lesT.reduce((t, l) => t + diasFora(l), 0);
  const comPrev = so.filter(l => l.data_retorno && l.previsao_retorno), dif = comPrev.length ? Math.round(comPrev.reduce((t, l) => t + diasEntre(l.previsao_retorno, l.data_retorno), 0) / comPrev.length) : null;
  const carga = {}; so.forEach(l => { const k = l.regiao || 'Não informado'; carga[k] = carga[k] || { n: 0, d: 0 }; carga[k].n++; carga[k].d += diasFora(l); });
  const pts = []; if (iniTemp) for (let w = segunda(iniTemp) < iniTemp ? addDays(segunda(iniTemp), 7) : iniTemp; w <= h; w = addDays(w, 7)) { const f = ativos.filter(a => situacaoEm(a.id, w).sit === 'DM').length; pts.push({ d: w, v: ativos.length ? Math.round((ativos.length - f) / ativos.length * 100) : 100, fora: f }); }
  if (iniTemp && pts.length && pts[pts.length - 1].d !== h) pts.push({ d: h, v: disp, fora: nDM });
  // alertas e acompanhamento por atleta
  const AL = alertasDM(h), alPor = {}; AL.forEach(a => { alPor[a.id] = (alPor[a.id] || 0) + 1; });
  const linhas = ativos.map(a => { const s = situacao(a.id), at = atP.filter(x => x.atleta_id === a.id), q = at.filter(x => x.queixa);
    const qr = conta(q, x => x.regiao)[0], pv = S.dm.prev.filter(p => p.ativo && p.atleta_id === a.id), w = segunda(h);
    let al = 0, fe = 0; pv.forEach(p => { const x = adesao(p, w); if (x.alvo) { al += x.alvo; fe += Math.min(x.feitos, x.alvo); } });
    const v = temAv ? ultimaAv(a.id) : null, venc = pv.filter(p => diasRevisar(p) <= 0).length;
    const ps = S.dm.pse.filter(x => x.atleta_id === a.id && x.data >= desde && x.data <= h).map(x => x.nota);
    const score = (s.sit === 'DM' ? 1000 : s.sit !== 'Liberado' ? 500 : 0) + (alPor[a.id] || 0) * 20 + q.length * 3 + at.length;
    return { a, s, at, q, qr, pv, al, fe, v, venc, ps, score }; }).sort((x, y) => y.score - x.score || x.a.nome.localeCompare(y.a.nome));
  const kpi = (l, v, s, cls = '') => `<div class="card ${cls}"><div class="l">${l}</div><div class="v">${v}</div><div class="s">${s}</div></div>`;
  const perTxt = per === 'temp' ? (iniTemp ? 'na temporada' : 'nos últimos 30 dias (temporada ainda não começou)') : `nos últimos ${per} dias`;
  $('#main').innerHTML = topo('Fisioterapia / DM', 'Central', 'O que está acontecendo no departamento: quem está disponível, o que pede atenção e onde o elenco mais sofre.',
    `<button class="btn" id="dcrel">Relatório de hoje</button>`) + fsTabs('central') + `
  <h3 class="dc-bloco">Hoje <small>${esc(fmtLong(h))}</small></h3>
  <div class="cards fs-kpis">
    ${kpi('Disponibilidade', disp + '%', `${ativos.length - nDM} de ${ativos.length} atletas${nRT ? ` · ${nRT} com restrição` : ''}`, disp < 85 ? 'dc-ruim' : '')}
    ${kpi('DM / Restrito', `${nDM} / ${nRT}`, fora.length ? fora.slice(0, 3).map(x => x.a.nome).join(', ') + (fora.length > 3 ? '…' : '') : 'todos liberados')}
    ${kpi('Retornos em 7 dias', ret7.length, atras.length ? `<b class="dm-atr">${atras.length} atrasado${atras.length > 1 ? 's' : ''}</b>` : 'nenhum atrasado')}
    ${kpi('Atendidos hoje', new Set(atHoje.map(x => x.atleta_id)).size, `${atHoje.length} atendimento${atHoje.length === 1 ? '' : 's'}${diaH.classificacao ? ' · treino ' + diaH.classificacao : ''}`)}
  </div>
  <div class="dm-grid">
    <div class="panel"><h2>Alertas <small class="m">${AL.length ? `${AL.length} · o sistema sinaliza, o fisio decide` : ''}</small></h2>
      ${AL.length ? `<div class="dc-al">${AL.map(x => `<div class="dc-ali n-${x.nivel}" data-rdm="${x.id}"><span class="dc-tp">${esc(x.tipo)}</span><b>${esc(nomeA(x.id))}</b><span class="m">${esc(x.texto)}</span></div>`).join('')}</div>` : '<p class="empty">Nada pedindo atenção agora.</p>'}</div>
    <div class="panel"><h2>Fora ou com restrição</h2>${fora.length ? fora.sort((x, y) => x.s.sit.localeCompare(y.s.sit)).map(x => { const l = x.s.lesao;
      return `<div class="dm-sit" data-les="${l.id}">${sitBadge(x.s.sit)}<b>${esc(x.a.nome)}</b><span class="m">${esc(tituloLesao(l))} · ${esc(l.etapa)} · ${diasFora(l)} dia${diasFora(l) === 1 ? '' : 's'}${l.previsao_retorno ? ` · retorno ${fmt(l.previsao_retorno)}${l.previsao_retorno < h ? ' <b class="dm-atr">atrasado</b>' : ''}` : ''}</span></div>`; }).join('') : '<p class="empty">Todos liberados.</p>'}</div>
  </div>
  <h3 class="dc-bloco">Período <small>${esc(perTxt)}</small><span class="dc-per">${[[7, '7 dias'], [30, '30 dias'], ['temp', 'Temporada']].map(([v, t]) => `<button class="chip${per === v ? ' on' : ''}" data-per="${v}">${t}</button>`).join('')}</span></h3>
  <div class="cards fs-kpis">
    ${kpi('Atendimentos', atP.length, nAtl === 1 ? '1 atleta' : `${nAtl} atletas diferentes`)}
    ${kpi('Tratamento · Prevenção · Recuperação', `${contF.Tratamento || 0} · ${contF['Prevenção'] || 0} · ${contF['Recuperação'] || 0}`, atP.length ? `${Math.round((contF['Prevenção'] || 0) / atP.length * 100)}% do trabalho é prevenção` : '—')}
    ${kpi('Adesão aos preventivos', alvoT ? Math.round(feitoT / alvoT * 100) + '%' : '—', alvoT ? `${feitoT} de ${alvoT} sessões previstas` : 'sem meta semanal definida')}
    ${kpi('Avaliação física', temAv ? `${semAv} sem · ${reavV} vencida${reavV === 1 ? '' : 's'}` : '—', temAv ? 'sem avaliação · reavaliação vencida' : 'sem acesso às avaliações')}
  </div>
  <div class="grid2">
    <div class="panel"><h2>Atendimentos por ${porSemana ? 'semana' : 'dia'}</h2>
      <div class="dc-cols">${chaves.map((k, ki) => { const c = cols[k], t = c.Tratamento + c['Prevenção'] + c['Recuperação'];
        return `<div class="dc-col" title="${fmt(k)}: ${t} (T ${c.Tratamento} · P ${c['Prevenção']} · R ${c['Recuperação']})"><div class="dc-stk" style="height:${t / mxC * 100}%">${['Tratamento', 'Prevenção', 'Recuperação'].map(f => c[f] ? `<i class="f-${fNorm(f)[0]}" style="flex:${c[f]}"></i>` : '').join('')}</div><b>${t || ''}</b><span>${porSemana || chaves.length > 7 ? (ki % Math.ceil(chaves.length / 8) === 0 || ki === chaves.length - 1 ? fmt(k) : '') : parse(k).toLocaleDateString('pt-BR', { weekday: 'short' }).slice(0, 3) + ' ' + fmt(k).slice(0, 2)}</span></div>`; }).join('')}</div>
      <div class="dc-leg"><span><i class="f-t"></i>Tratamento</span><span><i class="f-p"></i>Prevenção</span><span><i class="f-r"></i>Recuperação</span></div></div>
    <div class="panel"><h2>Queixas por região <small class="m">${atP.filter(x => x.queixa).length} queixas</small></h2><div class="fs-bars">${barras(conta(atP.filter(x => x.queixa), x => x.regiao || 'Sem região'))}</div>
      <h4 class="dm-h4">Quem mais buscou o DM</h4><div class="fs-bars">${barras(conta(atP, x => nomeA(x.atleta_id)))}</div></div>
  </div>
  <h3 class="dc-bloco">Temporada <small>${iniTemp ? 'desde ' + dataBR(iniTemp) : 'começa em ' + dataBR(INICIO_PRETEMPORADA)}</small></h3>
  <div class="cards fs-kpis">
    ${kpi('Lesões', so.length, `${so.filter(l => l.recidiva).length} recidiva${so.filter(l => l.recidiva).length === 1 ? '' : 's'} · ${lesT.length - so.length} doença${lesT.length - so.length === 1 ? '' : 's'}`)}
    ${kpi('Dias perdidos', diasP, lesT.length ? `${Math.round(diasP / lesT.length)} dias por ocorrência` : '—')}
    ${kpi('Treino × jogo', `${so.filter(l => l.contexto === 'Treino').length} × ${so.filter(l => l.contexto === 'Jogo').length}`, 'lesões por contexto')}
    ${kpi('Retorno real × previsto', dif == null ? '—' : (dif > 0 ? '+' : '') + dif + ' dias', dif == null ? 'aparece com as liberações' : dif > 0 ? 'em média, depois do previsto' : dif < 0 ? 'em média, antes do previsto' : 'em média, no previsto')}
  </div>
  <div class="grid2">
    <div class="panel"><h2>Disponibilidade semanal</h2>${iniTemp ? linhaDisp(pts) : '<p class="empty">Começa com a temporada.</p>'}</div>
    <div class="panel"><h2>Onde mais custa <small class="m">dias perdidos por região</small></h2><div class="fs-bars">${barras(Object.entries(carga).sort((a, b) => b[1].d - a[1].d).map(([k, v]) => [k, v.d, `${v.n} lesão${v.n > 1 ? 'ões' : ''}`]), 'd')}</div>
      <h4 class="dm-h4">Mecanismo</h4><div class="fs-bars">${barras(conta(so, l => l.mecanismo || 'Não informado'))}</div></div>
  </div>
  <div class="panel"><h2>Acompanhamento por atleta <small class="m">${linhas.length} atletas · quem precisa de mais atenção primeiro · ${esc(perTxt)}</small></h2>
    <input class="in fs-busca" id="dcbusca" placeholder="Buscar atleta ou posição...">
    <div class="tablewrap fs-mapa-wrap dc-tab"><table class="tb fs-mapa"><thead><tr><th>Atleta</th><th>Situação</th><th>Atend.</th><th>Queixas</th><th>Preventivos</th><th>Avaliação</th><th>PSE</th><th>Alertas</th></tr></thead><tbody>
      ${linhas.map(x => `<tr data-rdm="${x.a.id}" data-busca="${esc(fNorm(x.a.nome + ' ' + x.a.posicao))}"><td class="fs-at"><b>${esc(x.a.nome)}</b><div class="m">${esc(x.a.posicao)}</div></td>
        <td>${sitBadge(x.s.sit) || '<span class="m">Liberado</span>'}</td><td>${x.at.length || '<span class="m">0</span>'}</td>
        <td>${x.q.length ? `${x.q.length}${x.qr ? ` <span class="m">· ${esc(x.qr[0])}</span>` : ''}` : '<span class="m">—</span>'}</td>
        <td>${x.pv.length ? `${x.pv.length} · ${x.al ? `${x.fe}/${x.al}` : 'sem meta'}${x.venc ? ' <span class="badge s-Inativo">revisar</span>' : ''}` : '<span class="m">—</span>'}</td>
        <td>${!temAv ? '—' : x.v ? `${fmt(x.v.data)}${x.v.proxima_reavaliacao && x.v.proxima_reavaliacao <= h ? ' <span class="badge s-Inativo">reavaliar</span>' : ''}` : '<span class="badge">sem</span>'}</td>
        <td>${x.ps.length ? (Math.round(x.ps.reduce((a, b) => a + b, 0) / x.ps.length * 10) / 10).toString().replace('.', ',') : '<span class="m">—</span>'}</td>
        <td>${alPor[x.a.id] ? `<span class="badge dm-rt">${alPor[x.a.id]}</span>` : ''}</td></tr>`).join('')}
    </tbody></table></div></div>`;
  ligarAbasFs();
  $('#dcrel').onclick = () => abrirRelatorio(h);
  document.querySelectorAll('[data-per]').forEach(b => b.onclick = () => { S.dm.periodo = b.dataset.per === 'temp' ? 'temp' : +b.dataset.per; pCentral(); });
  document.querySelectorAll('#main [data-les]').forEach(el => el.onclick = () => fichaLesao(+el.dataset.les));
  document.querySelectorAll('#main [data-rdm]').forEach(el => el.onclick = () => resumoDM(+el.dataset.rdm));
  $('#dcbusca').oninput = e => { const t = fNorm(e.target.value); document.querySelectorAll('.dc-tab tbody tr').forEach(tr => tr.classList.toggle('hidden', !!t && !tr.dataset.busca.includes(t))); };
}

/* ============ ATENDIMENTO ============ */
/* histórico da etapa (pelas anotações de etapa) para saber a situação em qualquer dia */
function etapaEm(l, d) {
  if (l.anterior_clube || d < l.data_inicio) return null;
  if (l.data_retorno && d >= l.data_retorno) return 'Liberado';
  const ns = S.dm.notas.filter(n => n.lesao_id === l.id && n.tipo === 'etapa').sort((a, b) => a.data.localeCompare(b.data) || a.id - b.id);
  const qual = n => { const m = (n.texto || '').match(/etapa (.+)$/i); if (!m) return null; const t = fNorm(m[1]); return ETAPAS.find(e => fNorm(e) === t) || ETAPAS.find(e => t.startsWith(fNorm(e))) || null; };
  let e = null; ns.forEach(n => { if (n.data <= d) e = qual(n) || e; });
  if (!e) e = ns.length ? (qual(ns[0]) || 'DM') : (l.etapa === 'Liberado' ? 'DM' : l.etapa);
  return e === 'Liberado' && !l.data_retorno ? l.etapa : e;
}
function situacaoEm(id, d) {
  if (d >= hoje()) return situacao(id);
  const l = S.dm.lesoes.filter(x => x.atleta_id === id).map(x => ({ x, e: etapaEm(x, d) })).filter(y => y.e && y.e !== 'Liberado').sort((a, b) => ETAPAS.indexOf(a.e) - ETAPAS.indexOf(b.e))[0];
  return l ? { sit: ETAPA_SIT[l.e], lesao: l.x, etapa: l.e } : { sit: 'Liberado', lesao: null };
}
const agruparAtl = arr => { const g = []; arr.forEach(x => { let y = g.find(k => k.id === x.atleta_id); if (!y) g.push(y = { id: x.atleta_id, it: [] }); y.it.push(x); }); return g; };

/* ============ RELATÓRIO GERAL DO DIA ============ */
function dadosDia(data) {
  const dia = S.dm.dias[data] || {}, at = S.dm.atend.filter(x => x.data === data);
  const notas = S.dm.notas.filter(x => x.data === data && ['atencao', 'atualizacao', 'exame'].includes(x.tipo));
  const cont = {}; at.forEach(x => { cont[x.finalidade] = (cont[x.finalidade] || 0) + 1; });
  const fora = S.atletas.filter(a => a.ativo && a.status !== 'Inativo').map(a => ({ a, s: situacaoEm(a.id, data) })).filter(x => x.s.sit !== 'Liberado')
    .sort((x, y) => x.s.sit.localeCompare(y.s.sit) || x.a.nome.localeCompare(y.a.nome));
  const npse = S.dm.pse.filter(x => x.data === data).length;
  return { dia, at, notas, porAtl: agruparAtl(at), cont, fora, media: mediaPSE(data), npse };
}
const fimPonto = t => String(t || '').trim().replace(/[.\s]+$/, '');
function linhaFora(x, data) { const l = x.s.lesao, e = x.s.etapa || l.etapa;
  return `${tituloLesao(l)} · ${e} · ${diasEntre(l.data_inicio, data) + 1}º dia${l.previsao_retorno ? ` · previsão de retorno ${dataBR(l.previsao_retorno)}` : ''}`; }
function relatorioTexto(data) {
  const r = dadosDia(data), L = [`RELATÓRIO DA FISIOTERAPIA · ${dataBR(data)} (${parse(data).toLocaleDateString('pt-BR', { weekday: 'long' })})`];
  const cab = [r.dia.turno_local, r.dia.classificacao ? `Treino ${r.dia.classificacao}${r.media != null ? ` (PSE média ${String(r.media).replace('.', ',')} de ${r.npse} atleta${r.npse === 1 ? '' : 's'})` : ''}` : ''].filter(Boolean);
  if (cab.length) L.push(cab.join(' · '));
  L.push('', 'RESUMO', `${r.at.length} atendimento${r.at.length === 1 ? '' : 's'} · ${r.porAtl.length} atleta${r.porAtl.length === 1 ? '' : 's'}${FINALIDADES.filter(f => r.cont[f]).map(f => ` · ${f} ${r.cont[f]}`).join('')}`);
  L.push(`DM: ${r.fora.filter(x => x.s.sit === 'DM').length} · Restrito/Transição: ${r.fora.filter(x => x.s.sit !== 'DM').length}`, '', 'ATENDIMENTOS');
  if (!r.porAtl.length) L.push('Nenhum atendimento registrado.');
  r.porAtl.forEach(g => { const ps = pseDe(data, g.id); L.push(`• ${nomeA(g.id)}${ps != null ? ` (PSE ${ps})` : ''}`);
    g.it.forEach(x => L.push(`  ${[x.momento, x.finalidade].filter(Boolean).join(' · ')}: ${x.queixa ? `queixa ${fimPonto(x.queixa)}${x.regiao ? ` (${x.regiao}${x.lado ? ' ' + ladoTxtDM(x.lado) : ''})` : ''}. ` : ''}${fimPonto(x.descricao)}.`)); });
  if (r.notas.length) { L.push('', 'ATENÇÃO ESPECIAL');
    agruparAtl(r.notas).forEach(g => { L.push(`• ${nomeA(g.id)}`); g.it.forEach(x => { const l = x.lesao_id && S.dm.lesoes.find(y => y.id === x.lesao_id);
      L.push(`  ${fimPonto(x.texto)}${l ? ` (${diasEntre(l.data_inicio, data) + 1}º dia · ${etapaEm(l, data) || l.etapa})` : ''}.`); }); }); }
  if (r.fora.length) { L.push('', 'DEPARTAMENTO MÉDICO'); r.fora.forEach(x => L.push(`• ${x.a.nome} — ${x.s.sit}: ${linhaFora(x, data)}`)); }
  L.push('', `Fisioterapia QFC${S.perfil?.nome ? ' · ' + S.perfil.nome : ''}`);
  return L.join('\n');
}
function relatorioHTML(data) {
  const r = dadosDia(data);
  return `<div class="print-head"><img src="${LOGO}" alt=""><div><b>CINQ · Centro de Inteligência do QFC</b><span>Fisioterapia / DM · relatório geral do dia</span></div></div>
    <div class="rel-tit"><h1>Relatório da Fisioterapia</h1><span>${esc(fmtLong(data))} de ${parse(data).getFullYear()}</span></div>
    <div class="rel-res">
      <div><b>${r.at.length}</b><span>atendimentos</span></div><div><b>${r.porAtl.length}</b><span>atletas atendidos</span></div>
      ${FINALIDADES.map(f => `<div><b>${r.cont[f] || 0}</b><span>${f}</span></div>`).join('')}
      <div><b>${esc(r.dia.classificacao || '—')}</b><span>treino${r.media != null ? ` · PSE ${String(r.media).replace('.', ',')}` : ''}</span></div>
      <div><b>${r.fora.filter(x => x.s.sit === 'DM').length} / ${r.fora.filter(x => x.s.sit !== 'DM').length}</b><span>DM / restrito</span></div>
    </div>
    ${r.dia.turno_local ? `<p class="rel-m">Turno/local: ${esc(r.dia.turno_local)}</p>` : ''}
    <h3 class="rel-h">Atendimentos</h3>
    ${r.at.length ? `<table class="rel-tb"><thead><tr><th>Atleta</th><th>Momento</th><th>Queixa / região</th><th>Conduta</th><th>Finalidade</th></tr></thead><tbody>
      ${r.porAtl.map(g => g.it.map((x, k) => { const ps = pseDe(data, g.id);
        return `<tr${k === 0 ? ' class="rel-nov"' : ''}><td>${k === 0 ? `<b>${esc(nomeA(g.id))}</b>${ps != null ? `<small>PSE ${ps}</small>` : ''}` : ''}</td><td>${esc(x.momento || '')}</td>
        <td>${esc(x.queixa || '')}${x.regiao ? `<small>${esc(x.regiao)}${x.lado ? ' ' + esc(ladoTxtDM(x.lado)) : ''}</small>` : ''}</td><td>${esc(x.descricao)}</td><td><span class="rel-f f-${fNorm(x.finalidade).slice(0, 1)}">${esc(x.finalidade)}</span></td></tr>`; }).join('')).join('')}
    </tbody></table>` : '<p class="rel-m">Nenhum atendimento registrado.</p>'}
    ${r.notas.length ? `<h3 class="rel-h">Atenção especial</h3>${r.notas.map(x => { const l = x.lesao_id && S.dm.lesoes.find(y => y.id === x.lesao_id);
      return `<div class="rel-nota"><b>${esc(nomeA(x.atleta_id))}</b>${l ? ` <small>${esc(tituloLesao(l))} · ${diasEntre(l.data_inicio, data) + 1}º dia · ${esc(etapaEm(l, data) || l.etapa)}</small>` : ''}<p>${esc(x.texto || '')}</p></div>`; }).join('')}` : ''}
    <h3 class="rel-h">Departamento médico</h3>
    ${r.fora.length ? `<table class="rel-tb"><thead><tr><th>Atleta</th><th>Situação</th><th>Lesão / doença</th><th>Etapa</th><th>Dia</th><th>Previsão</th></tr></thead><tbody>
      ${r.fora.map(x => { const l = x.s.lesao; return `<tr><td><b>${esc(x.a.nome)}</b></td><td>${esc(x.s.sit)}</td><td>${esc(tituloLesao(l))}</td><td>${esc(x.s.etapa || l.etapa)}</td><td>${diasEntre(l.data_inicio, data) + 1}º</td><td>${l.previsao_retorno ? dataBR(l.previsao_retorno) : '—'}</td></tr>`; }).join('')}
    </tbody></table>` : '<p class="rel-m">Todos os atletas liberados.</p>'}
    <div class="ip-rodape">Quinho Futebol Clube · Fisioterapia${S.perfil?.nome ? ' · ' + esc(S.perfil.nome) : ''} · gerado em ${new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} · uso interno</div>`;
}
function abrirRelatorio(data) {
  modal(`<div class="rel-prev">${relatorioHTML(data)}</div>
    <div class="mfoot"><span class="m">Baixar PDF abre a impressão: escolha “Salvar como PDF”.</span><div class="row"><button class="btn" id="relf">Fechar</button>${navigator.share ? '<button class="btn" id="relsh">Compartilhar texto</button>' : ''}<button class="btn" id="relcp">Copiar texto</button><button class="btn pri" id="relpdf">Baixar PDF</button></div></div>`, true);
  $('#relf').onclick = fechar;
  $('#relcp').onclick = async () => toast(await copiarTexto(relatorioTexto(data)) ? 'Texto copiado. É só colar onde quiser enviar.' : 'Não consegui copiar.', false);
  if ($('#relsh')) $('#relsh').onclick = () => navigator.share({ title: `Relatório da Fisioterapia ${dataBR(data)}`, text: relatorioTexto(data) }).catch(() => {});
  $('#relpdf').onclick = () => imprimirRelatorio(data);
}
async function imprimirRelatorio(data) {
  document.querySelectorAll('#print-area').forEach(x => x.remove());
  const w = document.createElement('div'); w.id = 'print-area'; w.className = 'rel-print'; w.innerHTML = relatorioHTML(data);
  document.body.appendChild(w); document.body.classList.add('imprimindo');
  await Promise.all([...w.querySelectorAll('img')].map(i => i.decode ? i.decode().catch(() => {}) : null));
  const t = document.title; document.title = `Relatorio_Fisioterapia_${data}`;
  setTimeout(() => { window.print(); setTimeout(() => { w.remove(); document.body.classList.remove('imprimindo'); document.title = t; }, 500); }, 150);
}
async function copiarTexto(t) {
  try { await navigator.clipboard.writeText(t); return true; } catch (e) {
    const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch (e2) { ok = false; } ta.remove(); return ok;
  }
}
function pAtendimento() {
  const d = S.dm.data || (S.dm.data = hoje()), dia = S.dm.dias[d] || {}, pode = podeDM();
  const at = S.dm.atend.filter(x => x.data === d), notas = S.dm.notas.filter(x => x.data === d);
  const npse = S.dm.pse.filter(x => x.data === d).length, mpse = mediaPSE(d);
  const ini = segunda(d), sem = S.dm.atend.filter(x => x.data >= ini && x.data <= addDays(ini, 6));
  const contA = {}; sem.forEach(x => { contA[x.atleta_id] = (contA[x.atleta_id] || 0) + 1; });
  const contR = {}; sem.filter(x => x.regiao).forEach(x => { contR[x.regiao] = (contR[x.regiao] || 0) + 1; });
  const contF = {}; sem.forEach(x => { contF[x.finalidade] = (contF[x.finalidade] || 0) + 1; });
  // queixa repetida: mesma região em 3+ dias nos últimos 7
  const rep = []; const u7 = S.dm.atend.filter(x => x.queixa && x.regiao && x.data > addDays(d, -7) && x.data <= d);
  const kk = {}; u7.forEach(x => { const k = x.atleta_id + '|' + x.regiao; (kk[k] = kk[k] || new Set()).add(x.data); });
  Object.entries(kk).forEach(([k, s]) => { if (s.size >= 3) { const [id, r] = k.split('|'); rep.push(`${nomeA(+id)}: queixa em ${r} em ${s.size} dias da última semana`); } });
  const dm = S.atletas.filter(a => a.ativo).map(a => ({ a, s: situacao(a.id) })).filter(x => x.s.sit !== 'Liberado');
  const top = (o, n = 6) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n);
  const porAtl = agruparAtl(at);
  $('#main').innerHTML = topo('Fisioterapia / DM', 'Atendimento', 'Quem passou no DM, queixa e conduta. O relatório geral do dia sai pronto em PDF ou texto.',
    `${pode ? '<button class="btn" id="dmbot">Meus botões de conduta</button>' : ''}<button class="btn pri" id="dmcop">Relatório do dia</button>`) + fsTabs('atendimento') + `
  <div class="dm-dia"><button class="btn sm" id="dmant">◀</button><input type="date" class="in" id="dmdata" value="${d}"><button class="btn sm" id="dmprox">▶</button>${d !== hoje() ? '<button class="btn sm" id="dmhoje">Hoje</button>' : ''}<b>${esc(fmtLong(d))}</b></div>
  <div class="dm-grid">
    <div>
      <div class="panel dm-cab">
        <div class="dm-class c-${(dia.classificacao || 'nd').toLowerCase()}"><span>Classificação do treino</span><b>${esc(dia.classificacao || '—')}</b>
          <small>${mpse != null ? `PSE média ${String(mpse).replace('.', ',')} · ${npse} atleta${npse === 1 ? '' : 's'} atendido${npse === 1 ? '' : 's'}` : 'PSE: só de quem passou no DM'}</small></div>
        <div class="dm-cab-f">${pode ? `<label class="m">Classificação <select class="in" id="dmclass">${dmLista(['Leve', 'Moderado', 'Intenso'], dia.classificacao)}</select></label>
          <label class="m">Turno/local <input class="in" id="dmturno" value="${esc(dia.turno_local || '')}" placeholder="Tarde/ESTÁDIO"></label>` : `<span class="m">${esc(dia.turno_local || '')}</span>`}</div>
      </div>
      <div class="panel"><h2>Atendimentos <small class="m">${at.length} lançamento${at.length === 1 ? '' : 's'} · ${porAtl.length} atleta${porAtl.length === 1 ? '' : 's'}</small>${pode ? '<button class="btn pri sm dm-add" id="dmnovo">+ Atendimento</button>' : ''}</h2>
        ${porAtl.length ? porAtl.map(g => { const s = situacao(g.id);
          const ps = pseDe(d, g.id);
          return `<div class="dm-at"><div class="dm-at-h"><b>${esc(nomeA(g.id))}</b>${sitBadge(s.sit)}${ps != null ? `<span class="badge dm-pseb">PSE ${ps}</span>` : ''}</div>${g.it.map(x => `<div class="dm-at-i">
            <div><span class="badge dm-f-${x.finalidade === 'Tratamento' ? 't' : x.finalidade === 'Prevenção' ? 'p' : 'r'}">${esc(x.finalidade)}</span> <span class="m">${esc(x.momento || '')}${x.regiao ? ' · ' + esc(x.regiao) + (x.lado ? ' ' + esc(ladoTxtDM(x.lado)) : '') : ''}</span>
            ${x.queixa ? `<div class="dm-q">Queixa: ${esc(x.queixa)}</div>` : ''}<p>${esc(x.descricao)}</p>
            ${x.prevencao_ids?.length ? `<small class="dm-ok">✓ ${x.prevencao_ids.map(i => esc(S.dm.prev.find(p => p.id === i)?.item || '')).filter(Boolean).join(', ')}</small>` : ''}</div>
            ${pode ? `<div class="dm-act"><button class="btn sm" data-edat="${x.id}">Editar</button><button class="btn sm" data-rmat="${x.id}">✕</button></div>` : ''}</div>`).join('')}</div>`; }).join('') : '<p class="empty">Nenhum atendimento neste dia.</p>'}
      </div>
      <div class="panel"><h2>🚨 Atenção especial ${pode ? '<button class="btn sm dm-add" id="dmnota">+ Atenção especial</button>' : ''}</h2>
        ${notas.length ? notas.map(n => { const l = n.lesao_id && S.dm.lesoes.find(y => y.id === n.lesao_id);
          return `<div class="dm-nota t-${n.tipo}"><div><b>${esc(nomeA(n.atleta_id))}</b> ${n.tipo === 'etapa' ? '<span class="badge">etapa</span>' : n.tipo === 'exame' ? '<span class="badge">exame</span>' : ''}${l ? ` <button class="lnk" data-les="${l.id}">${esc(tituloLesao(l))}</button>` : ''}<p>${esc(n.texto || '')}</p></div>${pode && n.tipo !== 'etapa' ? `<button class="btn sm" data-rmnota="${n.id}">✕</button>` : ''}</div>`; }).join('') : '<p class="empty">Nada registrado.</p>'}
      </div>
    </div>
    <div>
      <div class="panel"><h2>Situação do elenco</h2>${dm.length ? dm.sort((a, b) => a.s.sit.localeCompare(b.s.sit)).map(x => `<div class="dm-sit" data-les="${x.s.lesao.id}">${sitBadge(x.s.sit)}<b>${esc(x.a.nome)}</b><span class="m">${esc(tituloLesao(x.s.lesao))} · ${diasFora(x.s.lesao)} dias${x.s.lesao.previsao_retorno ? ' · retorno ' + fmt(x.s.lesao.previsao_retorno) : ''}</span></div>`).join('') : '<p class="empty">Todos liberados.</p>'}</div>
      ${rep.length ? `<div class="note dm-alerta"><b>Queixa repetida</b><br>${rep.map(esc).join('<br>')}</div>` : ''}
      <div class="panel"><h2>Semana <small class="m">${fmt(ini)} a ${fmt(addDays(ini, 6))} · ${sem.length} atendimentos</small></h2>
        <div class="stat3">${FINALIDADES.map(f => `<div><b>${contF[f] || 0}</b><span>${f}</span></div>`).join('')}</div>
        <h4 class="dm-h4">Quem mais buscou atendimento</h4>${top(contA).map(([id, n]) => `<div class="kv small"><span>${esc(nomeA(+id))}</span><b>${n}</b></div>`).join('') || '<p class="empty">—</p>'}
        <h4 class="dm-h4">Regiões mais tratadas</h4>${top(contR).map(([r, n]) => `<div class="kv small"><span>${esc(r)}</span><b>${n}</b></div>`).join('') || '<p class="empty">—</p>'}
      </div>
    </div>
  </div>`;
  ligarAbasFs();
  const irDia = n => { S.dm.data = n; pAtendimento(); };
  $('#dmant').onclick = () => irDia(addDays(d, -1)); $('#dmprox').onclick = () => irDia(addDays(d, 1));
  if ($('#dmhoje')) $('#dmhoje').onclick = () => irDia(hoje());
  $('#dmdata').onchange = e => e.target.value && irDia(e.target.value);
  $('#dmcop').onclick = () => abrirRelatorio(d);
  document.querySelectorAll('#main [data-les]').forEach(el => el.onclick = () => fichaLesao(+el.dataset.les));
  if (!pode) return;
  $('#dmbot').onclick = gerenciarCondutas;
  $('#dmclass').onchange = e => salvarDia(d, { classificacao: e.target.value || null });
  $('#dmturno').onchange = e => salvarDia(d, { turno_local: e.target.value.trim() || null });
  $('#dmnovo').onclick = () => formAtendimento(d);
  $('#dmnota').onclick = () => formNota(d);
  document.querySelectorAll('[data-edat]').forEach(b => b.onclick = () => formAtendimento(d, S.dm.atend.find(x => x.id === +b.dataset.edat)));
  document.querySelectorAll('[data-rmat]').forEach(b => b.onclick = async () => {
    if (!confirm('Excluir este atendimento?')) return;
    const { error } = await sb.from('fisio_atendimentos').delete().eq('id', +b.dataset.rmat); if (error) return toast(erroAmigavel(error), true);
    S.dm.atend = S.dm.atend.filter(x => x.id !== +b.dataset.rmat); pAtendimento();
  });
  document.querySelectorAll('[data-rmnota]').forEach(b => b.onclick = async () => {
    if (!confirm('Excluir esta anotação?')) return;
    const { error } = await sb.from('fisio_notas').delete().eq('id', +b.dataset.rmnota); if (error) return toast(erroAmigavel(error), true);
    S.dm.notas = S.dm.notas.filter(x => x.id !== +b.dataset.rmnota); pAtendimento();
  });
}
async function salvarDia(d, campos) {
  const row = { ...(S.dm.dias[d] || {}), data: d, ...campos }; delete row.atualizado_em;
  const { data, error } = await sb.from('fisio_dias').upsert(row, { onConflict: 'data' }).select().single();
  if (error) return toast(erroAmigavel(error), true);
  S.dm.dias[d] = data; if (S.page === 'fisio' && S.fisio.aba === 'atendimento') pAtendimento();
}
async function salvarPSE(d, id, nota) {
  const atual = pseDe(d, id); if ((nota ?? null) === (atual ?? null)) return true;
  const r = nota == null ? await sb.from('fisio_pse').delete().eq('data', d).eq('atleta_id', id) : await sb.from('fisio_pse').upsert({ data: d, atleta_id: id, nota }, { onConflict: 'data,atleta_id' });
  if (r.error) { toast(erroAmigavel(r.error), true); return false; }
  S.dm.pse = S.dm.pse.filter(x => !(x.data === d && x.atleta_id === id)).concat(nota == null ? [] : [{ data: d, atleta_id: id, nota }]);
  const dia = S.dm.dias[d] || {}, antes = dia.pse_media != null ? classifPSE(dia.pse_media) : null, m = mediaPSE(d);
  // classificação automática pela média, a não ser que o fisio tenha escolhido outra
  const campos = { pse_media: m }; if (!dia.classificacao || dia.classificacao === antes) campos.classificacao = classifPSE(m);
  const row = { ...dia, data: d, ...campos }; delete row.atualizado_em;
  const u = await sb.from('fisio_dias').upsert(row, { onConflict: 'data' }).select().single(); if (!u.error) S.dm.dias[d] = u.data;
  return true;
}
function gerenciarCondutas() {
  const lin = c => `<tr data-cd="${c.id || ''}"><td><input class="in" data-k="nome" value="${esc(c.nome || '')}" placeholder="Rótulo do botão"></td><td><input class="in" data-k="texto" value="${esc(c.texto || '')}" placeholder="Texto que entra no atendimento"></td><td><select class="in" data-k="finalidade">${dmLista(FINALIDADES, c.finalidade)}</select></td><td><button class="btn sm" data-rmcd>✕</button></td></tr>`;
  modal(`<h2>Meus botões de conduta</h2><p class="m">Cada botão escreve o seu texto no atendimento, do seu jeito. Ex.: rótulo “US posterior”, texto “ultrassom 50% 1.4, 20% 0.6 posterior”. A finalidade é sugerida ao clicar.</p>
    <div class="tablewrap"><table class="tb dm-cd"><thead><tr><th>Botão</th><th>Texto</th><th>Finalidade</th><th></th></tr></thead><tbody id="dmcdl">${S.dm.condutas.filter(c => c.ativo).map(lin).join('')}</tbody></table></div>
    <button class="btn sm" id="dmcdadd">+ Novo botão</button>
    <div class="mfoot"><span class="m">A ordem da lista é a ordem dos botões.</span><div class="row"><button class="btn" id="dmcdc">Cancelar</button><button class="btn pri" id="dmcds">Salvar</button></div></div>`, true);
  const tb = $('#dmcdl');
  $('#dmcdadd').onclick = () => { tb.insertAdjacentHTML('beforeend', lin({})); tb.lastElementChild.querySelector('input').focus(); };
  tb.onclick = e => { if (e.target.closest('[data-rmcd]')) e.target.closest('tr').remove(); };
  $('#dmcdc').onclick = fechar;
  $('#dmcds').onclick = async () => {
    const linhas = [...tb.querySelectorAll('tr')].map((tr, i) => ({ id: tr.dataset.cd ? +tr.dataset.cd : null, ordem: i, ...Object.fromEntries([...tr.querySelectorAll('[data-k]')].map(x => [x.dataset.k, x.value.trim() || null])) }));
    if (linhas.some(l => !l.nome || !l.texto)) return toast('Preencha o rótulo e o texto de cada botão.', true);
    const ficam = new Set(linhas.filter(l => l.id).map(l => l.id));
    for (const c of S.dm.condutas.filter(c => c.ativo && !ficam.has(c.id))) { const { error } = await sb.from('fisio_condutas').update({ ativo: false }).eq('id', c.id); if (error) return toast(erroAmigavel(error), true); }
    for (const l of linhas) {
      const row = { nome: l.nome, texto: l.texto, finalidade: l.finalidade, ordem: l.ordem, ativo: true };
      const r = l.id ? await sb.from('fisio_condutas').update(row).eq('id', l.id) : await sb.from('fisio_condutas').insert(row);
      if (r.error) return toast(erroAmigavel(r.error), true);
    }
    await carregarDM(true); fechar(); toast('Botões salvos.'); pFisio();
  };
}
function chipsAtletas(sel, multi) {
  const ativos = S.atletas.filter(a => a.ativo && a.status !== 'Inativo').sort((a, b) => a.nome.localeCompare(b.nome));
  return `<div class="dm-chips${multi ? '' : ' um'}" id="dmatl">${ativos.map(a => { const s = situacao(a.id).sit;
    return `<button type="button" class="chip${sel.includes(a.id) ? ' on' : ''}" data-ca="${a.id}">${esc(a.nome)}${s !== 'Liberado' ? ` <i class="dm-pt ${s === 'DM' ? 'dm' : 'rt'}"></i>` : ''}</button>`; }).join('')}</div>`;
}
function formAtendimento(d, x) {
  const edit = !!x;
  let sel = edit ? [x.atleta_id] : [], cds = edit ? [...(x.conduta_ids || [])] : [];
  const condAtivas = S.dm.condutas.filter(c => c.ativo);
  modal(`<h2>${edit ? 'Editar atendimento' : 'Novo atendimento'} · ${dataBR(d)}</h2>
    <label class="f"><span>Atleta${edit ? '' : 's (marque vários para lançar a mesma conduta para todos)'}</span>${chipsAtletas(sel, !edit)}</label>
    <div class="g3"><label class="f"><span>Momento</span><select class="in" id="fam">${opts(MOMENTOS_AT, x?.momento || 'Depois do treino')}</select></label>
      <label class="f"><span>Finalidade</span><select class="in" id="faf">${opts(FINALIDADES, x?.finalidade || 'Prevenção')}</select></label>
      <label class="f"><span>Lesão (tratamento)</span><select class="in" id="fal"></select></label></div>
    <div class="g3"><label class="f"><span>Queixa</span><input class="in" id="faq" value="${esc(x?.queixa || '')}" placeholder="opcional"></label>
      <label class="f"><span>Região</span><input class="in" id="far" list="dmreg" value="${esc(x?.regiao || '')}"></label>
      <label class="f"><span>Lado</span><select class="in" id="fala">${dmLista([['D', 'Direito'], ['E', 'Esquerdo'], ['Bilateral', 'Bilateral']], x?.lado)}</select></label></div>
    <datalist id="dmreg">${REGIOES.map(r => `<option value="${esc(r)}">`).join('')}</datalist>
    <div class="g3" id="fapw"><label class="f"><span>PSE do treino (0 a 10)</span><input class="in" type="number" min="0" max="10" step="1" inputmode="numeric" id="fap" placeholder="se perguntou"></label></div>
    <div class="f"><span class="m">Condutas ${condAtivas.length ? '' : '· crie seus botões em “Meus botões de conduta”'}</span><div class="dm-cbtn">${condAtivas.map(c => `<button type="button" class="chip${cds.includes(c.id) ? ' on' : ''}" data-cb="${c.id}" title="${esc(c.texto)}">${esc(c.nome)}</button>`).join('')}</div></div>
    <label class="f"><span>Descrição (é o texto que vai para o relatório)</span><textarea class="in" id="fad" rows="3" placeholder="Foi realizado ...">${esc(x?.descricao || '')}</textarea></label>
    <div id="faprev"></div>
    <div class="mfoot"><span class="m" id="famsg"></span><div class="row"><button class="btn" id="fac">Cancelar</button><button class="btn pri" id="fas">Salvar</button></div></div>`, true);
  const atualizaLesao = () => {
    const ls = sel.length === 1 ? S.dm.lesoes.filter(l => l.atleta_id === sel[0] && lesaoAtiva(l)) : [];
    $('#fal').innerHTML = opts(ls.map(l => [l.id, tituloLesao(l)]), x?.lesao_id ?? (ls[0] && $('#faf').value === 'Tratamento' ? ls[0].id : ''), 'nenhuma');
    $('#fal').disabled = !ls.length;
  };
  const atualizaPSE = () => { const um = sel.length === 1; $('#fapw').style.display = um ? '' : 'none'; if (um) $('#fap').value = pseDe(d, sel[0]) ?? ''; };
  const atualizaPrev = () => {
    const box = $('#faprev');
    if (sel.length !== 1) { const n = S.dm.prev.filter(p => p.ativo && sel.includes(p.atleta_id) && p.conduta_id && cds.includes(p.conduta_id)).length;
      box.innerHTML = sel.length > 1 && n ? `<p class="m">✓ ${n} preventivo${n > 1 ? 's' : ''} dos atletas marcados ser${n > 1 ? 'ão' : 'á'} contado${n > 1 ? 's' : ''} pelos botões usados.</p>` : ''; return; }
    const it = S.dm.prev.filter(p => p.ativo && p.atleta_id === sel[0]);
    const marc = new Set(x?.prevencao_ids || []);
    box.innerHTML = it.length ? `<div class="f"><span class="m">Preventivos do atleta feitos neste atendimento</span><div class="dm-prevck">${it.map(p => `<label><input type="checkbox" data-pv="${p.id}"${marc.has(p.id) || (p.conduta_id && cds.includes(p.conduta_id)) ? ' checked' : ''}> ${esc(p.item)}${p.regiao ? ' · ' + esc(p.regiao) : ''}</label>`).join('')}</div></div>` : '';
  };
  $('#dmatl').onclick = e => { const b = e.target.closest('[data-ca]'); if (!b) return; const id = +b.dataset.ca;
    if (edit) { sel = [id]; document.querySelectorAll('#dmatl .chip').forEach(c => c.classList.toggle('on', c === b)); }
    else { sel = sel.includes(id) ? sel.filter(i => i !== id) : [...sel, id]; b.classList.toggle('on'); }
    atualizaLesao(); atualizaPrev(); atualizaPSE(); };
  document.querySelector('.dm-cbtn').onclick = e => { const b = e.target.closest('[data-cb]'); if (!b) return; const c = condAtivas.find(k => k.id === +b.dataset.cb);
    const ta = $('#fad'); if (!cds.includes(c.id)) { cds.push(c.id); b.classList.add('on');
      const t = ta.value.trim(); ta.value = t ? `${t.replace(/[.\s]+$/, '')}, ${c.texto}` : `Foi realizado ${c.texto}`;
      if (c.finalidade && !edit && cds.length === 1) { $('#faf').value = c.finalidade; atualizaLesao(); } }
    else { cds = cds.filter(i => i !== c.id); b.classList.remove('on'); }
    atualizaPrev(); };
  $('#faf').onchange = atualizaLesao;
  atualizaLesao(); atualizaPrev(); atualizaPSE();
  $('#fac').onclick = fechar;
  $('#fas').onclick = async () => {
    if (!sel.length) return toast('Escolha o atleta.', true);
    const desc = $('#fad').value.trim(); if (!desc) return toast('Escreva a descrição (ou use os botões).', true);
    const pv = sel.length === 1 ? $('#fap').value.trim() : '';
    if (pv !== '' && !(Number.isInteger(+pv) && +pv >= 0 && +pv <= 10)) return toast('PSE: nota inteira de 0 a 10.', true);
    const base = { data: d, momento: $('#fam').value, finalidade: $('#faf').value, queixa: $('#faq').value.trim() || null, regiao: $('#far').value.trim() || null, lado: $('#fala').value || null, descricao: desc, conduta_ids: cds };
    const marcados = [...document.querySelectorAll('[data-pv]:checked')].map(i => +i.dataset.pv);
    const rows = sel.map(id => ({ ...base, atleta_id: id, lesao_id: sel.length === 1 && $('#fal').value ? +$('#fal').value : null,
      prevencao_ids: sel.length === 1 ? marcados : S.dm.prev.filter(p => p.ativo && p.atleta_id === id && p.conduta_id && cds.includes(p.conduta_id)).map(p => p.id),
      ordem: S.dm.atend.filter(y => y.data === d).length }));
    const b = $('#fas'); b.disabled = true;
    const r = edit ? await sb.from('fisio_atendimentos').update(rows[0]).eq('id', x.id).select() : await sb.from('fisio_atendimentos').insert(rows).select();
    b.disabled = false; if (r.error) return toast(erroAmigavel(r.error), true);
    if (edit) S.dm.atend = S.dm.atend.map(y => y.id === x.id ? r.data[0] : y); else S.dm.atend.push(...r.data);
    if (sel.length === 1) await salvarPSE(d, sel[0], pv === '' ? null : +pv);
    fechar(); toast(edit ? 'Atendimento atualizado.' : `${rows.length} atendimento${rows.length > 1 ? 's' : ''} lançado${rows.length > 1 ? 's' : ''}.`); pAtendimento();
  };
}
function formNota(d, atletaPre, lesaoPre) {
  let sel = atletaPre ? [atletaPre] : [];
  modal(`<h2>Atenção especial · ${dataBR(d)}</h2>
    <label class="f"><span>Atleta</span>${chipsAtletas(sel, false)}</label>
    <div class="g2"><label class="f"><span>Ligado à lesão</span><select class="in" id="fnl"></select></label><label class="f"><span>Tipo</span><select class="in" id="fnt">${opts([['atencao', 'Atenção especial'], ['atualizacao', 'Atualização da lesão'], ['exame', 'Exame']], lesaoPre ? 'atualizacao' : 'atencao')}</select></label></div>
    <label class="f"><span>Texto (vai para o relatório do dia)</span><textarea class="in" id="fnx" rows="4"></textarea></label>
    <label class="f" id="fnaw"><span>Anexo (laudo, imagem) — opcional</span><input type="file" class="in" id="fna" accept="application/pdf,image/*"></label>
    <div class="mfoot"><span class="m">Quando ligado a uma lesão, o relatório mostra o dia da lesão e a etapa.</span><div class="row"><button class="btn" id="fnc">Cancelar</button><button class="btn pri" id="fns">Salvar</button></div></div>`, true);
  const atualiza = () => { const ls = sel.length ? S.dm.lesoes.filter(l => l.atleta_id === sel[0] && (lesaoAtiva(l) || l.id === lesaoPre)) : [];
    $('#fnl').innerHTML = opts(ls.map(l => [l.id, tituloLesao(l)]), lesaoPre || (ls[0]?.id ?? ''), 'nenhuma'); };
  $('#dmatl').onclick = e => { const b = e.target.closest('[data-ca]'); if (!b) return; sel = [+b.dataset.ca]; document.querySelectorAll('#dmatl .chip').forEach(c => c.classList.toggle('on', c === b)); atualiza(); };
  atualiza(); $('#fnc').onclick = fechar;
  $('#fns').onclick = async () => {
    if (!sel.length) return toast('Escolha o atleta.', true);
    const texto = $('#fnx').value.trim(); if (!texto) return toast('Escreva o texto.', true);
    const lesao = $('#fnl').value ? +$('#fnl').value : null, tipo = $('#fnt').value;
    const anexos = []; const f = $('#fna').files[0];
    if (f) { const path = `lesoes/${sel[0]}/${d}_${Date.now()}_${f.name.replace(/[^\w.-]+/g, '_')}`;
      const up = await sb.storage.from('fisio').upload(path, f, { contentType: f.type || 'application/octet-stream' }); if (up.error) return toast(erroAmigavel(up.error), true);
      anexos.push({ nome: f.name, path }); }
    const { data, error } = await sb.from('fisio_notas').insert({ data: d, atleta_id: sel[0], lesao_id: lesao, tipo: lesao ? (tipo === 'atencao' ? 'atualizacao' : tipo) : tipo, texto, anexos }).select().single();
    if (error) return toast(erroAmigavel(error), true);
    S.dm.notas.push(data); fechar(); toast('Registrado.');
    if (lesaoPre) fichaLesao(lesaoPre); else pFisio();
  };
}

/* ============ LESÕES ============ */
function pLesoes() {
  const pode = podeDM(), h = hoje();
  const ativos = S.atletas.filter(a => a.ativo && a.status !== 'Inativo');
  const sit = ativos.map(a => situacao(a.id));
  const nDM = sit.filter(s => s.sit === 'DM').length, nRT = sit.filter(s => s.sit === 'Restrito/Transição').length;
  const ativas = S.dm.lesoes.filter(lesaoAtiva).sort((a, b) => ETAPAS.indexOf(a.etapa) - ETAPAS.indexOf(b.etapa) || a.data_inicio.localeCompare(b.data_inicio));
  const doClube = S.dm.lesoes.filter(l => !l.anterior_clube), temporada = doClube.filter(l => l.data_inicio >= INICIO_PRETEMPORADA);
  const lesTemp = temporada.filter(l => l.categoria === 'Lesão');
  const encerradas = doClube.filter(l => l.etapa === 'Liberado').sort((a, b) => b.data_inicio.localeCompare(a.data_inicio));
  const anteriores = S.dm.lesoes.filter(l => l.anterior_clube).sort((a, b) => nomeA(a.atleta_id).localeCompare(nomeA(b.atleta_id)) || b.data_inicio.localeCompare(a.data_inicio));
  const conta = (arr, f) => { const o = {}; arr.forEach(l => { const k = f(l) || 'Não informado'; o[k] = (o[k] || 0) + 1; }); return Object.entries(o).sort((a, b) => b[1] - a[1]); };
  const barras = lst => { const mx = Math.max(1, ...lst.map(x => x[1])); return lst.map(([k, n]) => `<div class="bar"><span>${esc(k)}</span><i style="width:${n / mx * 100}%"></i><b>${n}</b></div>`).join('') || '<p class="empty">—</p>'; };
  const kpi = (l, v, s) => `<div class="card"><div class="l">${l}</div><div class="v">${v}</div><div class="s">${s}</div></div>`;
  const disp = ativos.length ? Math.round((ativos.length - nDM) / ativos.length * 100) : 100;
  $('#main').innerHTML = topo('Fisioterapia / DM', 'Lesões', 'Registro, etapas até a liberação médica e o histórico do DM.',
    `${pode ? '<button class="btn" id="dmcrit">Critérios das etapas</button><button class="btn pri" id="dmles">+ Registrar lesão / doença</button>' : ''}`) + fsTabs('lesoes') + `
  <div class="cards fs-kpis">
    ${kpi('Disponibilidade hoje', disp + '%', `${ativos.length - nDM} de ${ativos.length} atletas${nRT ? ` · ${nRT} com restrição` : ''}`)}
    ${kpi('No DM', nDM, nRT ? `${nRT} em restrito/transição` : 'nenhum em restrição')}
    ${kpi('Lesões na temporada', lesTemp.length, `${lesTemp.filter(l => l.recidiva).length} recidiva${lesTemp.filter(l => l.recidiva).length === 1 ? '' : 's'} · ${temporada.length - lesTemp.length} doença${temporada.length - lesTemp.length === 1 ? '' : 's'}`)}
    ${kpi('Dias perdidos', temporada.reduce((s, l) => s + diasFora(l), 0), 'soma dos dias fora na temporada')}
  </div>
  <div class="panel"><h2>Em acompanhamento <small class="m">${ativas.length}</small></h2>
    ${ativas.length ? `<div class="dm-lcards">${ativas.map(l => { const p = sessoesPerdidas(l), i = ETAPAS.indexOf(l.etapa);
      return `<div class="dm-lc" data-les="${l.id}"><div class="dm-lc-h">${sitBadge(ETAPA_SIT[l.etapa])}<b>${esc(nomeA(l.atleta_id))}</b>${l.categoria === 'Doença' ? '<span class="badge">doença</span>' : ''}${l.recidiva ? '<span class="badge s-Inativo">recidiva</span>' : ''}</div>
        <div class="dm-lc-t">${esc(tituloLesao(l))}</div>
        <div class="dm-steps">${ETAPAS.map((e, k) => `<i class="${k < i ? 'f' : k === i ? 'a' : ''}" title="${esc(e)}"></i>`).join('')}</div>
        <div class="dm-lc-m"><span><b>${esc(l.etapa)}</b></span><span>${diasFora(l)} dias fora</span><span>${p.treinos} treinos · ${p.jogos} jogos perdidos</span>${l.previsao_retorno ? `<span>retorno previsto ${fmt(l.previsao_retorno)}${l.previsao_retorno < h ? ' <b class="dm-atr">atrasado</b>' : ` (${diasEntre(h, l.previsao_retorno)} dias)`}</span>` : ''}</div></div>`; }).join('')}</div>` : '<p class="empty">Nenhum atleta no DM.</p>'}
  </div>
  <div class="grid2">
    <div class="panel"><h2>Por região <small class="m">lesões no clube</small></h2><div class="fs-bars">${barras(conta(doClube.filter(l => l.categoria === 'Lesão'), l => l.regiao))}</div></div>
    <div class="panel"><h2>Por tipo e mecanismo</h2><div class="fs-bars">${barras(conta(doClube.filter(l => l.categoria === 'Lesão'), l => l.tipo))}</div><h4 class="dm-h4">Mecanismo</h4><div class="fs-bars">${barras(conta(doClube.filter(l => l.categoria === 'Lesão'), l => l.mecanismo))}</div></div>
  </div>
  <div class="panel"><h2>Histórico no clube <small class="m">${encerradas.length}</small></h2>
    ${encerradas.length ? `<div class="tablewrap"><table class="tb"><thead><tr><th>Atleta</th><th>Início</th><th>Lesão / doença</th><th>Contexto</th><th>Retorno</th><th>Dias fora</th><th></th></tr></thead><tbody>
      ${encerradas.map(l => `<tr data-les="${l.id}" class="dm-tr"><td><b>${esc(nomeA(l.atleta_id))}</b></td><td>${dataBR(l.data_inicio)}</td><td>${esc(tituloLesao(l))}${l.categoria === 'Doença' ? ' <span class="badge">doença</span>' : ''}</td><td>${esc(l.contexto || '')}${l.mecanismo ? ' · ' + esc(l.mecanismo) : ''}</td><td>${dataBR(l.data_retorno)}</td><td>${diasFora(l)}</td><td>${l.recidiva ? '<span class="badge s-Inativo">recidiva</span>' : ''}</td></tr>`).join('')}
    </tbody></table></div>` : '<p class="empty">Nenhuma lesão encerrada.</p>'}
  </div>
  <div class="panel"><h2>Lesões anteriores ao clube <small class="m">histórico informado pelo atleta ou clube anterior</small></h2>
    ${anteriores.length ? anteriores.map(l => `<div class="kv small dm-tr" data-les="${l.id}"><span><b>${esc(nomeA(l.atleta_id))}</b> · ${esc(tituloLesao(l))}</span><span class="m">${dataBR(l.data_inicio)}</span></div>`).join('') : '<p class="empty">Nada registrado.</p>'}
  </div>`;
  ligarAbasFs();
  document.querySelectorAll('#main [data-les]').forEach(el => el.onclick = () => fichaLesao(+el.dataset.les));
  if (!pode) return;
  $('#dmles').onclick = () => formLesao();
  $('#dmcrit').onclick = editarCriterios;
}
function recidivaDe(atletaId, regiao, tipo, data, ignorar) {
  return S.dm.lesoes.some(l => l.id !== ignorar && l.atleta_id === atletaId && l.categoria === 'Lesão' && regiao && fNorm(l.regiao) === fNorm(regiao) && (!tipo || !l.tipo || l.tipo === tipo)
    && l.data_retorno && l.data_retorno <= data && diasEntre(l.data_retorno, data) <= 60);
}
function formLesao(l, atletaPre) {
  const edit = !!l; let sel = edit ? [l.atleta_id] : atletaPre ? [atletaPre] : [];
  modal(`<h2>${edit ? 'Editar registro' : 'Registrar lesão ou doença'}</h2>
    ${edit ? `<p><b>${esc(nomeA(l.atleta_id))}</b></p>` : `<label class="f"><span>Atleta</span>${chipsAtletas(sel, false)}</label>`}
    <div class="g3"><label class="f"><span>Categoria</span><select class="in" id="flc">${opts(['Lesão', 'Doença'], l?.categoria || 'Lesão')}</select></label>
      <label class="f"><span>Data de início</span><input type="date" class="in" id="fld" value="${l?.data_inicio || hoje()}"></label>
      <label class="f"><span>Contexto</span><select class="in" id="flx">${dmLista(CONTEXTOS, l?.contexto || 'Treino')}</select></label></div>
    <div class="g3 dm-lesao-only"><label class="f"><span>Minuto (jogo)</span><input class="in" id="flm" value="${esc(l?.minuto || '')}" placeholder="ex.: 2T 30'"></label>
      <label class="f"><span>Mecanismo</span><select class="in" id="flme">${dmLista(MECANISMOS, l?.mecanismo)}</select></label>
      <label class="f"><span>Tipo</span><select class="in" id="flt">${dmLista(TIPOS_LESAO, l?.tipo)}</select></label></div>
    <div class="g3"><label class="f"><span>Região</span><input class="in" id="flr" list="dmreg2" value="${esc(l?.regiao || '')}"></label>
      <label class="f"><span>Lado</span><select class="in" id="fll">${dmLista([['D', 'Direito'], ['E', 'Esquerdo'], ['Bilateral', 'Bilateral']], l?.lado)}</select></label>
      <label class="f dm-lesao-only"><span>Grau</span><select class="in" id="flg">${dmLista(['1', '2', '3'], l?.grau)}</select></label></div>
    <datalist id="dmreg2">${REGIOES.map(r => `<option value="${esc(r)}">`).join('')}</datalist>
    <label class="f"><span>Diagnóstico</span><input class="in" id="fldg" value="${esc(l?.diagnostico || '')}" placeholder="ex.: lesão muscular grau 2 posterior de coxa E"></label>
    <div class="g3"><label class="f"><span>Médico responsável</span><input class="in" id="flmd" value="${esc(l?.medico || '')}"></label>
      <label class="f"><span>Previsão de retorno</span><input type="date" class="in" id="flp" value="${l?.previsao_retorno || ''}"></label>
      ${edit ? '' : `<label class="f"><span>Etapa inicial</span><select class="in" id="fle">${opts(ETAPAS.slice(0, 4), 'DM')}</select></label>`}</div>
    ${edit ? '' : `<label class="f"><span>Texto para o relatório do dia (atenção especial) — opcional</span><textarea class="in" id="flrel" rows="3" placeholder="Atleta saiu do jogo sentindo incômodo... realizou avaliação clínica e ultrassom..."></textarea></label>`}
    <p class="m" id="flrec"></p>
    <div class="mfoot"><span class="m">“Anterior ao clube” entra só no histórico, já encerrada.</span><div class="row"><button class="btn" id="flcan">Cancelar</button><button class="btn pri" id="flsal">Salvar</button></div></div>`, true);
  const cat = () => document.querySelectorAll('.dm-lesao-only').forEach(e => { e.style.display = $('#flc').value === 'Doença' ? 'none' : ''; });
  const rec = () => { const r = sel.length && $('#flc').value === 'Lesão' && recidivaDe(sel[0], $('#flr').value, $('#flt').value, $('#fld').value, l?.id);
    $('#flrec').innerHTML = r ? '⚠️ <b>Recidiva:</b> mesma região e tipo de uma lesão encerrada há menos de 2 meses.' : ''; return r; };
  $('#flc').onchange = () => { cat(); rec(); }; ['#flr', '#flt', '#fld'].forEach(s => $(s).onchange = rec); cat(); rec();
  if (!edit) $('#dmatl').onclick = e => { const b = e.target.closest('[data-ca]'); if (!b) return; sel = [+b.dataset.ca]; document.querySelectorAll('#dmatl .chip').forEach(c => c.classList.toggle('on', c === b)); rec(); };
  $('#flcan').onclick = fechar;
  $('#flsal').onclick = async () => {
    if (!sel.length) return toast('Escolha o atleta.', true);
    const ant = $('#flx').value === 'Anterior ao clube', doenca = $('#flc').value === 'Doença';
    const row = { atleta_id: sel[0], categoria: $('#flc').value, data_inicio: $('#fld').value, contexto: $('#flx').value || null,
      minuto: doenca ? null : $('#flm').value.trim() || null, mecanismo: doenca ? null : $('#flme').value || null, tipo: doenca ? null : $('#flt').value || null, grau: doenca ? null : $('#flg').value || null,
      regiao: $('#flr').value.trim() || null, lado: $('#fll').value || null, diagnostico: $('#fldg').value.trim() || null, medico: $('#flmd').value.trim() || null,
      previsao_retorno: $('#flp').value || null, recidiva: !!rec(), anterior_clube: ant };
    if (!row.data_inicio) return toast('Informe a data de início.', true);
    if (!edit) { row.etapa = ant ? 'Liberado' : $('#fle').value; if (ant) row.data_retorno = row.data_inicio; row.criterios = {}; }
    const b = $('#flsal'); b.disabled = true;
    const r = edit ? await sb.from('fisio_lesoes').update(row).eq('id', l.id).select().single() : await sb.from('fisio_lesoes').insert(row).select().single();
    b.disabled = false; if (r.error) return toast(erroAmigavel(r.error), true);
    if (edit) S.dm.lesoes = S.dm.lesoes.map(y => y.id === l.id ? r.data : y);
    else {
      S.dm.lesoes.push(r.data);
      if (!ant) {
        const notas = [{ data: row.data_inicio, atleta_id: row.atleta_id, lesao_id: r.data.id, tipo: 'etapa', texto: `${row.categoria} registrada · etapa ${row.etapa}` }];
        const rel = $('#flrel').value.trim(); if (rel) notas.push({ data: hoje(), atleta_id: row.atleta_id, lesao_id: r.data.id, tipo: 'atualizacao', texto: rel });
        const n = await sb.from('fisio_notas').insert(notas).select(); if (!n.error) S.dm.notas.push(...n.data);
      }
    }
    fechar(); toast('Registro salvo.'); if (edit || !ant) fichaLesao(r.data.id); else pFisio();
  };
}
function criteriosDe(l, etapa) {
  const modelo = (S.dm.cfg.criterios_etapas || {})[etapa] || [];
  const salvo = (l.criterios || {})[etapa];
  if (salvo) return salvo;
  return modelo.map(t => ({ texto: t, ok: false }));
}
async function fichaLesao(id) {
  try { await carregarDM(); } catch (e) { return toast(erroAmigavel(e), true); }
  const l = S.dm.lesoes.find(x => x.id === id); if (!l) return toast('Registro não encontrado.', true);
  const pode = podeDM(), i = ETAPAS.indexOf(l.etapa), prox = ETAPAS[i + 1], p = sessoesPerdidas(l), a = S.atletas.find(x => x.id === l.atleta_id) || {};
  const notas = S.dm.notas.filter(n => n.lesao_id === l.id), ats = S.dm.atend.filter(x => x.lesao_id === l.id);
  const linha = [...notas.map(n => ({ d: n.data, k: n.id, t: n.tipo, html: `${n.tipo === 'etapa' ? '<span class="badge">etapa</span> ' : n.tipo === 'exame' ? '<span class="badge">exame</span> ' : ''}${esc(n.texto || '')}${(n.anexos || []).map(x => ` <button class="lnk" data-anx="${esc(x.path)}">📎 ${esc(x.nome)}</button>`).join('')}` })),
    ...ats.map(x => ({ d: x.data, k: 1e9 + x.id, t: 'at', html: `<span class="badge dm-f-t">atendimento</span> ${esc(x.descricao)}` }))].sort((x, y) => y.d.localeCompare(x.d) || y.k - x.k);
  const crit = l.anterior_clube || l.etapa === 'Liberado' ? [] : criteriosDe(l, l.etapa);
  const datasEtapa = {}; notas.filter(n => n.tipo === 'etapa').forEach(n => { const m = (n.texto || '').match(/etapa (.+)$/i) || (n.texto || '').match(/^(Liberado)/); if (m) { const e = ETAPAS.find(x => fNorm(m[1]).startsWith(fNorm(x))); if (e && !datasEtapa[e]) datasEtapa[e] = n.data; } });
  modal(`<div class="fs-head">${foto(a)}<div><h2>${esc(nomeA(l.atleta_id))}</h2><div class="m">${esc(a.posicao || '')}</div></div>
      <div class="fs-sel">${sitBadge(ETAPA_SIT[l.etapa])}${l.categoria === 'Doença' ? ' <span class="badge">doença</span>' : ''}${l.recidiva ? ' <span class="badge s-Inativo">recidiva</span>' : ''}${l.anterior_clube ? ' <span class="badge">anterior ao clube</span>' : ''}</div></div>
    <h3 class="dm-lt">${esc(tituloLesao(l))}</h3>
    <div class="dm-ficha-d">${[['Início', dataBR(l.data_inicio)], ['Contexto', [l.contexto, l.minuto].filter(Boolean).join(' · ')], ['Mecanismo', l.mecanismo], ['Tipo', [l.tipo, l.grau ? 'grau ' + l.grau : ''].filter(Boolean).join(' ')], ['Região', [l.regiao, ladoTxtDM(l.lado)].filter(Boolean).join(' ')], ['Médico', l.medico], ['Previsão de retorno', l.previsao_retorno ? dataBR(l.previsao_retorno) : ''], ['Retorno', l.data_retorno ? `${dataBR(l.data_retorno)}${l.liberado_por ? ' · ' + l.liberado_por : ''}` : '']].filter(x => x[1]).map(([k, v]) => `<span><small>${k}</small>${esc(v)}</span>`).join('')}</div>
    ${l.anterior_clube ? '' : `<div class="fs-resumo"><div><b>${diasFora(l)}</b><span>dias fora</span></div><div><b>${p.treinos}</b><span>treinos perdidos</span></div><div><b>${p.jogos}</b><span>jogos perdidos</span></div><div><b>${ats.length}</b><span>atendimentos</span></div><div><b>${l.previsao_retorno && l.etapa !== 'Liberado' ? diasEntre(hoje(), l.previsao_retorno) : '—'}</b><span>dias até a previsão</span></div></div>
    <div class="dm-stepper">${ETAPAS.map((e, k) => `<div class="${k < i ? 'f' : k === i ? 'a' : ''}"><i>${k < i ? '✓' : k + 1}</i><span>${esc(e)}</span><small>${datasEtapa[e] ? fmt(datasEtapa[e]) : ''}</small></div>`).join('')}</div>
    ${crit.length ? `<h3 class="fs-h">Critérios para sair de “${esc(l.etapa)}”</h3><div class="dm-crit">${crit.map((c, k) => `<label><input type="checkbox" data-crit="${k}"${c.ok ? ' checked' : ''}${pode ? '' : ' disabled'}> ${esc(c.texto)}</label>`).join('')}</div>` : ''}
    ${pode && prox ? `<div class="dm-avanca">${prox === 'Liberado' && !podeLiberar() ? '<span class="m">Próximo passo: <b>liberação pelo médico</b>.</span>' : prox === 'Liberado' ? `<label class="m">Data da liberação <input type="date" class="in" id="dmlibd" value="${hoje()}"></label><button class="btn pri" id="dmav">Liberar atleta</button>` : `<button class="btn pri" id="dmav">Avançar para “${esc(prox)}”</button>`}${i > 0 ? '<button class="btn sm" id="dmvolta">Voltar etapa</button>' : ''}</div>` : ''}`}
    <h3 class="fs-h">Linha do tempo ${pode ? '<button class="btn sm" id="dmnl">+ Atualização / exame</button>' : ''}</h3>
    <div class="dm-tl">${linha.length ? linha.map(x => `<div class="dm-tl-i t-${x.t}"><b>${fmt(x.d)}</b><div>${x.html}</div></div>`).join('') : '<p class="empty">Sem registros.</p>'}</div>
    <div class="mfoot"><div class="row">${pode ? '<button class="btn" id="dmled">Editar dados</button><button class="btn" id="dmlrm">Excluir</button>' : ''}</div><div class="row"><button class="btn" id="dmlf">Fechar</button></div></div>`, true);
  $('#dmlf').onclick = () => { fechar(); if (S.page === 'fisio') pFisio(); };
  document.querySelectorAll('#modal [data-anx]').forEach(bt => bt.onclick = async () => { const { data, error } = await sb.storage.from('fisio').createSignedUrl(bt.dataset.anx, 600); if (error) return toast(erroAmigavel(error), true); window.open(data.signedUrl, '_blank'); });
  if (!pode) return;
  $('#dmled').onclick = () => formLesao(l);
  $('#dmlrm').onclick = async () => {
    if (!confirm(`Excluir o registro de ${nomeA(l.atleta_id)} (${tituloLesao(l)})? A linha do tempo também é apagada.`)) return;
    const { error } = await sb.from('fisio_lesoes').delete().eq('id', l.id); if (error) return toast(erroAmigavel(error), true);
    S.dm.lesoes = S.dm.lesoes.filter(x => x.id !== l.id); S.dm.notas = S.dm.notas.filter(n => n.lesao_id !== l.id); fechar(); toast('Registro excluído.'); pFisio();
  };
  if ($('#dmnl')) $('#dmnl').onclick = () => formNota(hoje(), l.atleta_id, l.id);
  document.querySelectorAll('#modal [data-crit]').forEach(ck => ck.onchange = async () => {
    const lista = criteriosDe(l, l.etapa).map((c, k) => ({ ...c, ok: k === +ck.dataset.crit ? ck.checked : c.ok }));
    const cr = { ...(l.criterios || {}), [l.etapa]: lista };
    const { error } = await sb.from('fisio_lesoes').update({ criterios: cr }).eq('id', l.id); if (error) { ck.checked = !ck.checked; return toast(erroAmigavel(error), true); }
    l.criterios = cr;
  });
  const mudaEtapa = async (nova, extra = {}) => {
    const upd = { etapa: nova, ...extra };
    const { data, error } = await sb.from('fisio_lesoes').update(upd).eq('id', l.id).select().single(); if (error) return toast(erroAmigavel(error), true);
    Object.assign(l, data);
    const txt = nova === 'Liberado' ? `Liberado pelo médico${extra.liberado_por ? ' ' + extra.liberado_por : ''} · etapa Liberado` : `Mudou para a etapa ${nova}`;
    const n = await sb.from('fisio_notas').insert({ data: extra.data_retorno || hoje(), atleta_id: l.atleta_id, lesao_id: l.id, tipo: 'etapa', texto: txt }).select().single(); if (!n.error) S.dm.notas.push(n.data);
    toast(nova === 'Liberado' ? 'Atleta liberado.' : `Etapa: ${nova}.`); fichaLesao(l.id);
  };
  if ($('#dmav')) $('#dmav').onclick = () => {
    const falta = criteriosDe(l, l.etapa).filter(c => !c.ok);
    if (falta.length && !confirm(`Ainda há ${falta.length} critério(s) não marcado(s) para sair de “${l.etapa}”. Avançar mesmo assim?`)) return;
    if (prox !== 'Liberado') return mudaEtapa(prox);
    const dt = $('#dmlibd').value; if (!dt) return toast('Informe a data da liberação.', true);
    if (!confirm(`Liberar ${nomeA(l.atleta_id)} em ${dataBR(dt)}?`)) return;
    mudaEtapa('Liberado', { data_retorno: dt, liberado_por: S.perfil.nome });
  };
  if ($('#dmvolta')) $('#dmvolta').onclick = () => { if (confirm(`Voltar para “${ETAPAS[i - 1]}”?`)) mudaEtapa(ETAPAS[i - 1]); };
}
function editarCriterios() {
  const cfg = S.dm.cfg.criterios_etapas || {};
  modal(`<h2>Critérios das etapas</h2><p class="m">Um critério por linha. Vale para as próximas lesões; nas que já estão em andamento, a lista atual é mantida.</p>
    ${ETAPAS.slice(0, 4).map(e => `<label class="f"><span>Para sair de “${esc(e)}”</span><textarea class="in" rows="3" data-et="${esc(e)}">${esc((cfg[e] || []).join('\n'))}</textarea></label>`).join('')}
    <div class="mfoot"><span></span><div class="row"><button class="btn" id="dmcrc">Cancelar</button><button class="btn pri" id="dmcrs">Salvar</button></div></div>`, true);
  $('#dmcrc').onclick = fechar;
  $('#dmcrs').onclick = async () => {
    const v = Object.fromEntries([...document.querySelectorAll('[data-et]')].map(t => [t.dataset.et, t.value.split('\n').map(s => s.trim()).filter(Boolean)]));
    const { error } = await sb.from('fisio_config').upsert({ chave: 'criterios_etapas', valor: v }, { onConflict: 'chave' }); if (error) return toast(erroAmigavel(error), true);
    S.dm.cfg.criterios_etapas = v; fechar(); toast('Critérios salvos.');
  };
}

/* ============ PREVENÇÃO ============ */
// frequência é escrita livre ("3x na semana", "todo pré-treino"); quando tem número por semana, vira meta de adesão
function alvoFreq(f) {
  const t = fNorm(f); if (!t) return null;
  let m = t.match(/^(\d{1,2})\s*(x|vezes)?$/) || t.match(/(\d{1,2})\s*(x|vezes)?\s*(por|na|a|\/|p\/)?\s*sem/);
  return m && +m[1] >= 1 && +m[1] <= 14 ? +m[1] : null;
}
const revisarEm = p => p.revisar_em || addDays(p.inicio || hoje(), CICLO_PREV);
const diasRevisar = p => diasEntre(hoje(), revisarEm(p));
function cicloBadge(p) {
  const n = diasRevisar(p);
  return n < 0 ? `<span class="badge s-Inativo">revisar · venceu há ${-n} dia${n === -1 ? '' : 's'}</span>` : n === 0 ? '<span class="badge s-Inativo">revisar hoje</span>'
    : n <= 7 ? `<span class="badge dm-rt">revisar em ${n} dia${n === 1 ? '' : 's'}</span>` : '';
}
function adesao(p, ini) {
  const fim = addDays(ini, 6);
  const dias = new Set(S.dm.atend.filter(x => x.atleta_id === p.atleta_id && x.data >= ini && x.data <= fim && (x.prevencao_ids || []).includes(p.id)).map(x => x.data));
  return { feitos: dias.size, alvo: alvoFreq(p.vezes_semana) };
}
function pPrevencao() {
  const pode = podeDM(), ini = S.dm.semana || (S.dm.semana = segunda(hoje()));
  const ativos = S.dm.prev.filter(p => p.ativo), pausados = S.dm.prev.filter(p => !p.ativo);
  const atls = [...new Set(ativos.map(p => p.atleta_id))].sort((a, b) => nomeA(a).localeCompare(nomeA(b)));
  let alvoT = 0, feitoT = 0; const devendo = new Set();
  ativos.forEach(p => { const a = adesao(p, ini); if (a.alvo) { alvoT += a.alvo; feitoT += Math.min(a.feitos, a.alvo); if (a.feitos < a.alvo && ini <= hoje()) devendo.add(p.atleta_id); } });
  const vencidos = ativos.filter(p => diasRevisar(p) <= 0), breve = ativos.filter(p => diasRevisar(p) > 0 && diasRevisar(p) <= 7);
  const kpi = (l, v, s) => `<div class="card"><div class="l">${l}</div><div class="v">${v}</div><div class="s">${s}</div></div>`;
  $('#main').innerHTML = topo('Fisioterapia / DM', 'Prevenção', `Preventivos de cada atleta, por no máximo 1 mês e meio (${CICLO_PREV} dias): depois reavalia e atualiza os exercícios. A adesão conta sozinha pelos atendimentos.`,
    pode ? '<button class="btn pri" id="dmpv">+ Preventivo</button>' : '') + fsTabs('prevencao') + `
  <div class="dm-dia"><button class="btn sm" id="dmsa">◀</button><b>Semana de ${fmt(ini)} a ${fmt(addDays(ini, 6))}</b><button class="btn sm" id="dmsp">▶</button>${ini !== segunda(hoje()) ? '<button class="btn sm" id="dmsh">Esta semana</button>' : ''}</div>
  <div class="cards fs-kpis">
    ${kpi('Preventivos ativos', ativos.length, `${atls.length} atleta${atls.length === 1 ? '' : 's'}${pausados.length ? ` · ${pausados.length} pausado${pausados.length === 1 ? '' : 's'}` : ''}`)}
    ${kpi('Adesão da semana', alvoT ? Math.round(feitoT / alvoT * 100) + '%' : '—', alvoT ? `${feitoT} de ${alvoT} sessões previstas` : 'conta quando a frequência tem “x por semana”')}
    ${kpi('Para revisar', vencidos.length, breve.length ? `${breve.length} vence${breve.length === 1 ? '' : 'm'} nos próximos 7 dias` : 'nenhum vence nos próximos 7 dias')}
    ${kpi('Com pendência na semana', devendo.size, devendo.size ? [...devendo].map(nomeA).slice(0, 3).join(', ') + (devendo.size > 3 ? '…' : '') : 'todos em dia')}
  </div>
  ${vencidos.length ? `<div class="note fs-venc"><b>Ciclo encerrado, reavaliar e atualizar:</b> ${[...new Set(vencidos.map(p => p.atleta_id))].map(id => esc(nomeA(id))).join(' · ')}</div>` : ''}
  <div class="panel"><h2>Por atleta</h2>
    ${atls.length ? atls.map(id => { const s = situacao(id).sit;
      return `<div class="dm-pa"><div class="dm-pa-h"><b>${esc(nomeA(id))}</b>${sitBadge(s)}${pode ? `<button class="btn sm" data-pvn="${id}">+ item</button>` : ''}</div>
        <div class="tablewrap"><table class="tb dm-ptab"><tbody>${ativos.filter(p => p.atleta_id === id).map(p => { const a = adesao(p, ini);
          return `<tr><td><b>${esc(p.item)}</b>${p.regiao ? `<div class="m">${esc(p.regiao)}</div>` : ''}</td><td class="sm">${esc(p.vezes_semana || '')}</td>
          <td class="sm">${esc(p.motivo || '')}${p.grupo ? ' <span class="badge">grupo</span>' : ''}</td>
          <td class="sm dm-ciclo">${fmt(p.inicio)} → ${fmt(revisarEm(p))} ${cicloBadge(p)}</td>
          <td class="dm-ad">${a.alvo ? `${[...Array(a.alvo)].map((_, k) => `<i class="${k < a.feitos ? 'ok' : ''}"></i>`).join('')}<span>${a.feitos}/${a.alvo}</span>` : `<span class="m">${a.feitos}× na semana</span>`}</td>
          ${pode ? `<td class="dm-act"><button class="btn sm" data-pve="${p.id}">Editar</button>${diasRevisar(p) <= 7 ? `<button class="btn sm" data-pvnov="${p.id}">Renovar</button>` : ''}<button class="btn sm" data-pvp="${p.id}">Pausar</button></td>` : ''}</tr>`; }).join('')}</tbody></table></div></div>`; }).join('') : '<p class="empty">Nenhum preventivo cadastrado.</p>'}
  </div>
  ${pausados.length ? `<div class="panel"><h2>Pausados</h2>${pausados.map(p => `<div class="kv small"><span><b>${esc(nomeA(p.atleta_id))}</b> · ${esc(p.item)}</span>${pode ? `<span><button class="btn sm" data-pvr="${p.id}">Reativar</button> <button class="btn sm" data-pvx="${p.id}">Excluir</button></span>` : ''}</div>`).join('')}</div>` : ''}`;
  ligarAbasFs();
  const irS = n => { S.dm.semana = n; pPrevencao(); };
  $('#dmsa').onclick = () => irS(addDays(ini, -7)); $('#dmsp').onclick = () => irS(addDays(ini, 7)); if ($('#dmsh')) $('#dmsh').onclick = () => irS(segunda(hoje()));
  if (!pode) return;
  $('#dmpv').onclick = () => formPrevencao();
  document.querySelectorAll('[data-pvn]').forEach(b => b.onclick = () => formPrevencao(null, +b.dataset.pvn));
  document.querySelectorAll('[data-pve]').forEach(b => b.onclick = () => formPrevencao(S.dm.prev.find(p => p.id === +b.dataset.pve)));
  document.querySelectorAll('[data-pvnov]').forEach(b => b.onclick = () => formPrevencao(S.dm.prev.find(p => p.id === +b.dataset.pvnov), null, true));
  const upd = async (id, campos, msg) => { const { error } = await sb.from('fisio_prevencao').update(campos).eq('id', id); if (error) return toast(erroAmigavel(error), true); Object.assign(S.dm.prev.find(p => p.id === id), campos); toast(msg); pPrevencao(); };
  document.querySelectorAll('[data-pvp]').forEach(b => b.onclick = () => upd(+b.dataset.pvp, { ativo: false }, 'Preventivo pausado.'));
  document.querySelectorAll('[data-pvr]').forEach(b => b.onclick = () => { const p = S.dm.prev.find(x => x.id === +b.dataset.pvr);
    upd(p.id, diasRevisar(p) <= 0 ? { ativo: true, inicio: hoje(), revisar_em: addDays(hoje(), CICLO_PREV) } : { ativo: true }, 'Preventivo reativado.'); });
  document.querySelectorAll('[data-pvx]').forEach(b => b.onclick = async () => { if (!confirm('Excluir este preventivo?')) return;
    const { error } = await sb.from('fisio_prevencao').delete().eq('id', +b.dataset.pvx); if (error) return toast(erroAmigavel(error), true); S.dm.prev = S.dm.prev.filter(p => p.id !== +b.dataset.pvx); pPrevencao(); });
}
function formPrevencao(p, atletaPre, renovar) {
  const edit = !!p; let sel = edit ? [p.atleta_id] : atletaPre ? [atletaPre] : [];
  const ini0 = renovar || !edit ? hoje() : (p.inicio || hoje()), rev0 = renovar || !edit ? addDays(ini0, CICLO_PREV) : revisarEm(p);
  const sugestoes = id => { const out = [];
    try { const av = typeof ultimaAv === 'function' && S.fisio?.ok ? ultimaAv(id) : null; if (av) focosDe(av.achados, av.revisao || {}).slice(0, 4).forEach(f => out.push(`${f} (avaliação ${fmt(av.data)})`)); } catch (e) { /* sem avaliação */ }
    S.dm.lesoes.filter(l => l.atleta_id === id && l.categoria === 'Lesão').slice(-3).forEach(l => out.push(`lesão anterior: ${tituloLesao(l)}`));
    return out; };
  modal(`<h2>${renovar ? 'Renovar preventivo' : edit ? 'Editar preventivo' : 'Novo preventivo'}</h2>
    ${renovar ? '<p class="m">Novo ciclo a partir de hoje. Atualize os exercícios conforme a reavaliação.</p>' : ''}
    ${edit ? `<p><b>${esc(nomeA(p.atleta_id))}</b></p>` : `<label class="f"><span>Atletas (marque vários para um protocolo do grupo)</span><div class="row dm-selall"><button type="button" class="btn sm" id="pvtodos">Todo o elenco</button>${POSICOES.map(x => `<button type="button" class="btn sm" data-pos="${esc(x)}">${esc(x)}</button>`).join('')}<button type="button" class="btn sm" id="pvlimpa">Limpar</button></div>${chipsAtletas(sel, true)}</label>`}
    <div id="pvsug"></div>
    <div class="g2"><label class="f"><span>Preventivo</span><input class="in" id="pvi" value="${esc(p?.item || '')}" placeholder="ex.: Nórdico, Copenhagen, mobilização de quadril"></label>
      <label class="f"><span>Região</span><input class="in" id="pvr" list="dmreg3" value="${esc(p?.regiao || '')}"></label></div>
    <datalist id="dmreg3">${REGIOES.map(r => `<option value="${esc(r)}">`).join('')}</datalist>
    <div class="g3"><label class="f"><span>Vezes por semana</span><input class="in" id="pvv" value="${esc(p?.vezes_semana || '')}" placeholder="como você descreve"></label>
      <label class="f"><span>Início</span><input type="date" class="in" id="pvini" value="${ini0}"></label>
      <label class="f"><span>Revisar em (máx. ${CICLO_PREV} dias)</span><input type="date" class="in" id="pvrev" value="${rev0}"></label></div>
    <div class="g2"><label class="f"><span>Motivo</span><input class="in" id="pvm" value="${esc(p?.motivo || '')}" placeholder="ex.: mobilidade de quadril (avaliação 14/10)"></label>
      <label class="f"><span>Botão de conduta ligado (conta a adesão sozinho)</span><select class="in" id="pvc">${dmLista(S.dm.condutas.filter(c => c.ativo).map(c => [c.id, c.nome]), p?.conduta_id)}</select></label></div>
    <div class="mfoot"><span class="m">Com o botão ligado, todo atendimento de prevenção que usar esse botão conta como feito. Se a frequência tiver “x por semana”, vira meta de adesão.</span><div class="row"><button class="btn" id="pvcan">Cancelar</button><button class="btn pri" id="pvsal">Salvar</button></div></div>`, true);
  let revMexeu = false; $('#pvrev').oninput = () => { revMexeu = true; };
  $('#pvini').onchange = () => { if (!revMexeu && $('#pvini').value) $('#pvrev').value = addDays($('#pvini').value, CICLO_PREV); };
  const atualizaSug = () => { const box = $('#pvsug'); if (sel.length !== 1) { box.innerHTML = ''; return; }
    const s = sugestoes(sel[0]); box.innerHTML = s.length ? `<div class="f"><span class="m">Sugestões para ${esc(nomeA(sel[0]))} (preenche o motivo)</span><div class="dm-cbtn">${s.map(t => `<button type="button" class="chip" data-st="${esc(t)}">${esc(t)}</button>`).join('')}</div></div>` : '';
    box.querySelectorAll('[data-st]').forEach(b => b.onclick = () => { $('#pvm').value = b.dataset.st; }); };
  if (!edit) {
    const marca = ids => { sel = ids; document.querySelectorAll('#dmatl .chip').forEach(c => c.classList.toggle('on', sel.includes(+c.dataset.ca))); atualizaSug(); };
    $('#dmatl').onclick = e => { const b = e.target.closest('[data-ca]'); if (!b) return; const id = +b.dataset.ca; marca(sel.includes(id) ? sel.filter(i => i !== id) : [...sel, id]); };
    $('#pvtodos').onclick = () => marca(S.atletas.filter(a => a.ativo && a.status !== 'Inativo').map(a => a.id));
    $('#pvlimpa').onclick = () => marca([]);
    document.querySelectorAll('[data-pos]').forEach(b => b.onclick = () => marca([...new Set([...sel, ...S.atletas.filter(a => a.ativo && a.status !== 'Inativo' && a.posicao === b.dataset.pos).map(a => a.id)])]));
  }
  atualizaSug();
  $('#pvcan').onclick = fechar;
  $('#pvsal').onclick = async () => {
    if (!sel.length) return toast('Escolha o atleta.', true);
    const item = $('#pvi').value.trim(); if (!item) return toast('Informe o preventivo.', true);
    const ini = $('#pvini').value, rev = $('#pvrev').value;
    if (!ini || !rev) return toast('Informe o início e a data de revisão.', true);
    if (rev < ini) return toast('A revisão precisa ser depois do início.', true);
    if (diasEntre(ini, rev) > CICLO_PREV && !confirm(`O ciclo passa de ${CICLO_PREV} dias (1 mês e meio). Salvar assim mesmo?`)) return;
    const base = { item, regiao: $('#pvr').value.trim() || null, vezes_semana: $('#pvv').value.trim() || null, motivo: $('#pvm').value.trim() || null,
      conduta_id: $('#pvc').value ? +$('#pvc').value : null, inicio: ini, revisar_em: rev };
    if (renovar) base.ativo = true;
    const grupo = sel.length > 1 ? `${item} · ${hoje()}` : null;
    const r = edit ? await sb.from('fisio_prevencao').update(base).eq('id', p.id).select() : await sb.from('fisio_prevencao').insert(sel.map(id => ({ ...base, atleta_id: id, grupo, ativo: true }))).select();
    if (r.error) return toast(erroAmigavel(r.error), true);
    if (edit) S.dm.prev = S.dm.prev.map(x => x.id === p.id ? r.data[0] : x); else S.dm.prev.push(...r.data);
    fechar(); toast(renovar ? 'Novo ciclo iniciado.' : edit ? 'Preventivo atualizado.' : `${r.data.length} preventivo${r.data.length > 1 ? 's' : ''} criado${r.data.length > 1 ? 's' : ''}.`); pFisio();
  };
}

/* ============ resumo do atleta (ficha do Elenco) ============ */
function resumoDM(id) {
  const s = situacao(id), ls = S.dm.lesoes.filter(l => l.atleta_id === id).sort((a, b) => b.data_inicio.localeCompare(a.data_inicio));
  const pv = S.dm.prev.filter(p => p.atleta_id === id && p.ativo), at = S.dm.atend.filter(x => x.atleta_id === id).slice(-8).reverse();
  modal(`<h2>${esc(nomeA(id))} · DM</h2><p>${sitBadge(s.sit) || '<span class="badge s-Titular">Liberado</span>'} ${s.lesao ? esc(tituloLesao(s.lesao)) + ' · ' + esc(s.lesao.etapa) : ''}</p>
    <h3 class="fs-h">Lesões e doenças</h3>${ls.length ? ls.map(l => `<div class="kv small dm-tr" data-les="${l.id}"><span>${esc(tituloLesao(l))}${l.anterior_clube ? ' <span class="badge">anterior ao clube</span>' : ''}</span><span class="m">${dataBR(l.data_inicio)}${l.anterior_clube ? '' : ' · ' + diasFora(l) + ' dias'}</span></div>`).join('') : '<p class="empty">Nenhuma.</p>'}
    <h3 class="fs-h">Preventivos</h3>${pv.length ? pv.map(p => { const a = adesao(p, segunda(hoje())); return `<div class="kv small"><span>${esc(p.item)}${p.vezes_semana ? ' · ' + esc(p.vezes_semana) : ''} ${cicloBadge(p)}</span><span class="m">${a.alvo ? `${a.feitos}/${a.alvo} na semana` : `${a.feitos}× na semana`}</span></div>`; }).join('') : '<p class="empty">Nenhum.</p>'}
    <h3 class="fs-h">Últimos atendimentos</h3>${at.length ? at.map(x => `<div class="kv small"><span>${esc(x.descricao)}</span><span class="m">${fmt(x.data)} · ${esc(x.finalidade)}</span></div>`).join('') : '<p class="empty">Nenhum.</p>'}
    <div class="mfoot"><span></span><div class="row"><button class="btn" id="rdmf">Fechar</button></div></div>`, true);
  $('#rdmf').onclick = fechar;
  document.querySelectorAll('#modal [data-les]').forEach(el => el.onclick = () => fichaLesao(+el.dataset.les));
}

/* ============ situação do atleta no resto do CINQ ============ */
const _carregarDM = carregar;
carregar = async function () { await _carregarDM(); if (podeLerFisio()) { try { await carregarDM(true); } catch (e) { console.error(e); } } };
function painelDM() {
  if (!podeLerFisio() || !S.dm.ok) return '';
  const lst = S.atletas.filter(a => a.ativo).map(a => ({ a, s: situacao(a.id) })).filter(x => x.s.sit !== 'Liberado');
  return `<div class="panel dm-painel"><h2>Departamento médico <small class="m">${lst.length ? `${lst.filter(x => x.s.sit === 'DM').length} no DM · ${lst.filter(x => x.s.sit !== 'DM').length} em restrito/transição` : 'todos liberados'}</small></h2>
    ${lst.map(x => `<div class="dm-sit" data-les="${x.s.lesao.id}">${sitBadge(x.s.sit)}<b>${esc(x.a.nome)}</b><span class="m">${esc(tituloLesao(x.s.lesao))} · ${esc(x.s.lesao.etapa)}${x.s.lesao.previsao_retorno ? ' · retorno previsto ' + fmt(x.s.lesao.previsao_retorno) : ''}</span></div>`).join('')}</div>`;
}
const ligaPainel = () => document.querySelectorAll('.dm-painel [data-les]').forEach(el => el.onclick = () => fichaLesao(+el.dataset.les));
const _pInicioDM = pInicio;
pInicio = function () { _pInicioDM(); const html = painelDM(); if (!html) return; const c = document.querySelector('#main .cards'); if (c) { c.insertAdjacentHTML('afterend', html); ligaPainel(); } };
const _pElencoDM = pElenco;
pElenco = function () { _pElencoDM(); if (!S.dm.ok) return; document.querySelectorAll('#main .ath[data-at]').forEach(el => { const s = situacao(+el.dataset.at).sit; if (s !== 'Liberado') el.querySelector('.badge')?.insertAdjacentHTML('afterend', ' ' + sitBadge(s)); }); };
const _pMapaDM = pMapa;
pMapa = async function () { await _pMapaDM(); if (!S.dm.ok) return;
  const dots = document.querySelectorAll('#main .pitch .dot');
  S.mapa.forEach((m, k) => { const s = m.atleta_id ? situacao(m.atleta_id).sit : 'Liberado'; if (s !== 'Liberado' && dots[k]) { dots[k].classList.add(s === 'DM' ? 'dm-dot-dm' : 'dm-dot-rt'); dots[k].insertAdjacentHTML('beforeend', `<em class="dm-tag">${s === 'DM' ? 'DM' : 'RT'}</em>`); } });
  document.querySelectorAll('#main .tactical .panel .kv').forEach(kv => { const nome = kv.querySelector('span')?.textContent.replace(/^\d+\.\s*/, '').trim(); const a = S.atletas.find(x => x.nome === nome); if (a) { const s = situacao(a.id).sit; if (s !== 'Liberado') kv.querySelector('span').insertAdjacentHTML('beforeend', ' ' + sitBadge(s)); } });
};
const _pCalDM = pCalendario;
pCalendario = function () { _pCalDM(); const html = painelDM(); if (!html || !html.includes('dm-sit')) return; const t = document.querySelector('#main .top'); if (t) { t.insertAdjacentHTML('afterend', html.replace('panel dm-painel', 'panel dm-painel dm-compacto')); ligaPainel(); } };
const _verAtletaDM = verAtleta;
verAtleta = function (a) {
  _verAtletaDM(a);
  if (!podeLerFisio() || !S.dm.ok) return;
  const r = document.querySelector('#modal .mfoot .row'); if (!r) return;
  const b = document.createElement('button'); b.className = 'btn'; b.innerHTML = 'DM ' + (sitBadge(situacao(a.id).sit) || ''); b.onclick = () => resumoDM(a.id); r.prepend(b);
};
const _pFisioDM = pFisio;
pFisio = function () { if (S.fisio.aba && S.fisio.aba !== 'avaliacoes') { S.page = 'fisio'; return pFisioDM(S.fisio.aba); } return _pFisioDM(); };
if (document.getElementById('main') && S.perfil && podeLerFisio()) carregarDM().then(() => { if (S.page === 'fisio' || S.page === 'inicio') ir(S.page); }).catch(() => {});

/* ============ acesso restrito por módulo (perfis.modulos: vazio = todo o CINQ) ============
   Usado para liberar alguém só no próprio módulo (ex.: fisio em teste vê Painel Geral + Fisioterapia/DM).
   O menu esconde o resto e a navegação volta ao Painel Geral se tentar abrir outra página. */
const modulosPerm = () => !isAdmin() && Array.isArray(S.perfil?.modulos) && S.perfil.modulos.length ? S.perfil.modulos : null;
const pagPermitida = p => { const m = modulosPerm(); return !m || p === 'inicio' || m.includes(p); };
function aplicarModulos() {
  if (!modulosPerm()) return;
  document.querySelectorAll('#nav button').forEach(b => { b.hidden = !b.dataset.p || !pagPermitida(b.dataset.p); });
  document.querySelectorAll('#nav .sec').forEach(s => { let n = s.nextElementSibling, vis = false;
    while (n && !n.classList.contains('sec')) { if (n.tagName === 'BUTTON' && !n.hidden) vis = true; n = n.nextElementSibling; } s.hidden = !vis; });
}
const _irMod = ir;
ir = function (p) { if (!pagPermitida(p)) p = 'inicio'; _irMod(p); aplicarModulos(); };
const _shellMod = shell;
shell = function () { _shellMod(); aplicarModulos(); };
const paginasNav = () => [...document.querySelectorAll('#nav button[data-p]')].filter(b => !['inicio', 'comissao'].includes(b.dataset.p)).map(b => [b.dataset.p, b.textContent.trim()]);
const _formMembroMod = formMembro;
formMembro = function (p) {
  _formMembroMod(p);
  const f = $('#fmem'); if (!f) return;
  const mods = Array.isArray(p.modulos) && p.modulos.length ? p.modulos : null;
  f.querySelector('.mfoot').insertAdjacentHTML('beforebegin', `<div class="f mod-box"><span>O que pode ver</span>
    <label class="row"><input type="radio" name="modo" value="todo"${mods ? '' : ' checked'}> <span style="margin:0">Todo o CINQ</span></label>
    <label class="row"><input type="radio" name="modo" value="restrito"${mods ? ' checked' : ''}> <span style="margin:0">Só o Painel Geral e os módulos marcados</span></label>
    <div class="mod-lista"${mods ? '' : ' hidden'}>${paginasNav().map(([k, l]) => `<label class="row"><input type="checkbox" data-mod="${esc(k)}"${mods?.includes(k) ? ' checked' : ''}> <span style="margin:0">${esc(l)}</span></label>`).join('')}</div>
    <small class="m">O que a pessoa pode editar continua definido pela função.</small></div>`);
  f.querySelectorAll('[name=modo]').forEach(r => r.onchange = () => { f.querySelector('.mod-lista').hidden = f.querySelector('[name=modo]:checked').value !== 'restrito'; });
  const salvarOrig = f.onsubmit;
  f.onsubmit = async e => {
    e.preventDefault();
    const restrito = f.querySelector('[name=modo]:checked').value === 'restrito';
    const lista = restrito ? [...f.querySelectorAll('[data-mod]:checked')].map(c => c.dataset.mod) : null;
    if (restrito && !lista.length) return toast('Marque pelo menos um módulo, ou escolha “Todo o CINQ”.', true);
    const email = (f.querySelector('[name=email]').value || '').trim().toLowerCase();
    await salvarOrig(e);
    const alvo = S.perfis.find(x => (x.email || '').toLowerCase() === email); if (!alvo) return;
    if (JSON.stringify(alvo.modulos || null) === JSON.stringify(lista)) return;
    const { data, error } = await sb.from('perfis').update({ modulos: lista }).eq('id', alvo.id).select().single();
    if (error) return toast(erroAmigavel(error), true);
    S.perfis = S.perfis.map(x => x.id === data.id ? data : x); if (S.page === 'comissao') pComissao();
  };
};
const _pComissaoMod = pComissao;
pComissao = function () {
  _pComissaoMod(); const nomes = Object.fromEntries(paginasNav());
  document.querySelectorAll('#main [data-pf]').forEach(b => { const p = S.perfis.find(x => x.id === b.dataset.pf);
    if (p && Array.isArray(p.modulos) && p.modulos.length) b.closest('tr').children[2].insertAdjacentHTML('beforeend', `<br><small class="m">só Painel Geral + ${esc(p.modulos.map(k => nomes[k] || k).join(', '))}</small>`); });
};
if (document.getElementById('nav')) aplicarModulos();
