/* CINQ · Fisioterapia / DM — Atendimento, Lesões e Prevenção
   Atendimento: relatório diário do fisio (classificação do treino pela PSE dos atletas, condutas com botões criados por ele,
   atenção especial) e o texto pronto para o WhatsApp. Lesões: registro (padrão UEFA/COI), etapas até a liberação médica,
   linha do tempo, dias fora. Prevenção: preventivos de cada atleta com adesão automática pelos atendimentos.
   A situação do atleta (DM, Restrito/Transição, Liberado) aparece no Painel Geral, Elenco, Calendário e Mapa tático. */
'use strict';

FUNCOES.medico = 'Médico';
S.dm = { ok: false, condutas: [], dias: {}, pse: [], lesoes: [], notas: [], prev: [], atend: [], cfg: {}, data: null, semana: null };
const ETAPAS = ['DM', 'Reabilitação', 'Transição em campo', 'Treino com restrição', 'Liberado'];
const ETAPA_SIT = { 'DM': 'DM', 'Reabilitação': 'DM', 'Transição em campo': 'Restrito/Transição', 'Treino com restrição': 'Restrito/Transição', 'Liberado': 'Liberado' };
const FINALIDADES = ['Tratamento', 'Prevenção', 'Recuperação'];
const MOMENTOS_AT = ['Antes do treino', 'Depois do treino', 'Outro'];
const CONTEXTOS = ['Treino', 'Jogo', 'Fora do clube', 'Anterior ao clube'];
const MECANISMOS = ['Sem contato', 'Contato', 'Sobrecarga', 'Não informado'];
const TIPOS_LESAO = ['Muscular', 'Ligamentar', 'Tendínea', 'Articular', 'Contusão', 'Fratura', 'Outra'];
const ORIGENS_PREV = ['Avaliação', 'Lesão anterior', 'Posição', 'Pedido do atleta', 'Protocolo do grupo'];
const REGIOES = ['Posterior de coxa', 'Anterior de coxa', 'Adutores', 'Panturrilha', 'Joelho', 'Tornozelo', 'Pé', 'Quadril', 'Virilha', 'Lombar', 'Tronco', 'Ombro', 'Cervical', 'MMII', 'MMSS'];
const podeDM = () => isAdmin() || ['fisio', 'medico', 'analise'].includes(S.perfil?.funcao);
const podeLiberar = () => isAdmin() || S.perfil?.funcao === 'medico';
const classifPSE = m => m == null ? null : Math.round(m) <= 4 ? 'Leve' : Math.round(m) <= 6 ? 'Moderado' : 'Intenso';
const ladoTxtDM = l => ({ D: 'direito', E: 'esquerdo', Bilateral: 'bilateral' }[l] || '');
const nomeA = id => S.atletas.find(a => a.id === id)?.nome || '?';
const diasEntre = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);
const dmLista = (arr, sel) => opts(arr, sel, '—');

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
  const tit = { atendimento: 'Atendimento', lesoes: 'Lesões', prevencao: 'Prevenção' }[aba];
  $('#main').innerHTML = topo('Fisioterapia / DM', tit, '') + fsTabs(aba) + '<div class="panel empty">Carregando…</div>';
  ligarAbasFs();
  try { await carregarDM(); } catch (e) { $('#main .panel').innerHTML = esc(erroAmigavel(e)); return; }
  ({ atendimento: pAtendimento, lesoes: pLesoes, prevencao: pPrevencao }[aba])();
}

/* ============ ATENDIMENTO ============ */
function relatorioTexto(data) {
  const dia = S.dm.dias[data] || {}, at = S.dm.atend.filter(x => x.data === data), notas = S.dm.notas.filter(x => x.data === data && ['atencao', 'atualizacao', 'exame'].includes(x.tipo));
  const L = [`RELATÓRIO FISIOTERAPÊUTICO ${dataBR(data)}`, '.', 'Atletas que Buscaram Atendimento/Queixa/Condutas', ''];
  if (dia.classificacao) L.push('⭕ CLASSIFICAÇÃO:', ` ${dia.classificacao}`, '');
  if (dia.turno_local) L.push(dia.turno_local, '');
  const porAtl = []; at.forEach(x => { let g = porAtl.find(y => y.id === x.atleta_id); if (!g) porAtl.push(g = { id: x.atleta_id, it: [] }); g.it.push(x); });
  porAtl.forEach(g => { L.push(nomeA(g.id)); g.it.forEach(x => L.push(`${x.queixa ? `Queixa: ${x.queixa.replace(/\.*\s*$/, '')}. ` : ''}${String(x.descricao).trim().replace(/\.*\s*$/, '')}.(${x.finalidade})`)); L.push(''); });
  if (!porAtl.length) L.push('Nenhum atendimento registrado.', '');
  if (notas.length) {
    L.push('🚨 Atletas que precisam de atenção especial', '');
    const porN = []; notas.forEach(x => { let g = porN.find(y => y.id === x.atleta_id); if (!g) porN.push(g = { id: x.atleta_id, it: [] }); g.it.push(x); });
    porN.forEach(g => { L.push(` ${nomeA(g.id)}`); g.it.forEach(x => { const l = x.lesao_id && S.dm.lesoes.find(y => y.id === x.lesao_id);
      L.push(String(x.texto || '').trim() + (l ? ` (${diasEntre(l.data_inicio, data)}º dia · ${l.etapa}${l.previsao_retorno && l.etapa !== 'Liberado' ? ` · previsão de retorno ${dataBR(l.previsao_retorno)}` : ''})` : '')); }); L.push(''); });
  }
  return L.join('\n').replace(/\n{3,}/g, '\n\n').trim();
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
  const pse = S.dm.pse.filter(x => x.data === d);
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
  const porAtl = []; at.forEach(x => { let g = porAtl.find(y => y.id === x.atleta_id); if (!g) porAtl.push(g = { id: x.atleta_id, it: [] }); g.it.push(x); });
  $('#main').innerHTML = topo('Fisioterapia / DM', 'Atendimento', 'O que cada atleta fez antes e depois do treino, com o relatório do dia pronto para enviar.',
    `${pode ? '<button class="btn" id="dmbot">Meus botões de conduta</button>' : ''}<button class="btn pri" id="dmcop">Copiar relatório</button>`) + fsTabs('atendimento') + `
  <div class="dm-dia"><button class="btn sm" id="dmant">◀</button><input type="date" class="in" id="dmdata" value="${d}"><button class="btn sm" id="dmprox">▶</button>${d !== hoje() ? '<button class="btn sm" id="dmhoje">Hoje</button>' : ''}<b>${esc(fmtLong(d))}</b></div>
  <div class="dm-grid">
    <div>
      <div class="panel dm-cab">
        <div class="dm-class c-${(dia.classificacao || 'nd').toLowerCase()}"><span>Classificação do treino</span><b>${esc(dia.classificacao || '—')}</b>
          <small>${dia.pse_media != null ? `PSE média ${String(dia.pse_media).replace('.', ',')} · ${pse.length} atleta${pse.length === 1 ? '' : 's'}` : 'sem PSE lançada'}</small></div>
        <div class="dm-cab-f">${pode ? `<button class="btn sm" id="dmpse">Lançar PSE dos atletas</button>
          <label class="m">ou classificar direto <select class="in" id="dmclass">${dmLista(['Leve', 'Moderado', 'Intenso'], dia.classificacao)}</select></label>
          <label class="m">Turno/local <input class="in" id="dmturno" value="${esc(dia.turno_local || '')}" placeholder="Tarde/ESTÁDIO"></label>` : `<span class="m">${esc(dia.turno_local || '')}</span>`}</div>
      </div>
      <div class="panel"><h2>Atendimentos <small class="m">${at.length} lançamento${at.length === 1 ? '' : 's'} · ${porAtl.length} atleta${porAtl.length === 1 ? '' : 's'}</small>${pode ? '<button class="btn pri sm dm-add" id="dmnovo">+ Atendimento</button>' : ''}</h2>
        ${porAtl.length ? porAtl.map(g => { const s = situacao(g.id);
          return `<div class="dm-at"><div class="dm-at-h"><b>${esc(nomeA(g.id))}</b>${sitBadge(s.sit)}</div>${g.it.map(x => `<div class="dm-at-i">
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
      <div class="panel"><h2>Relatório do dia <small class="m">texto para o WhatsApp</small></h2><pre class="dm-rel">${esc(relatorioTexto(d))}</pre></div>
    </div>
  </div>`;
  ligarAbasFs();
  const irDia = n => { S.dm.data = n; pAtendimento(); };
  $('#dmant').onclick = () => irDia(addDays(d, -1)); $('#dmprox').onclick = () => irDia(addDays(d, 1));
  if ($('#dmhoje')) $('#dmhoje').onclick = () => irDia(hoje());
  $('#dmdata').onchange = e => e.target.value && irDia(e.target.value);
  $('#dmcop').onclick = async () => toast(await copiarTexto(relatorioTexto(d)) ? 'Relatório copiado. É só colar no WhatsApp.' : 'Não consegui copiar; selecione o texto no painel.', false);
  document.querySelectorAll('#main [data-les]').forEach(el => el.onclick = () => fichaLesao(+el.dataset.les));
  if (!pode) return;
  $('#dmbot').onclick = gerenciarCondutas;
  $('#dmpse').onclick = () => lancarPSE(d);
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
function lancarPSE(d) {
  const ativos = S.atletas.filter(a => a.ativo && a.status !== 'Inativo').sort((a, b) => POSICOES.indexOf(a.posicao) - POSICOES.indexOf(b.posicao) || a.nome.localeCompare(b.nome));
  const atual = Object.fromEntries(S.dm.pse.filter(x => x.data === d).map(x => [x.atleta_id, x.nota]));
  modal(`<h2>PSE do treino · ${dataBR(d)}</h2><p class="m">Nota de 0 a 10 que cada atleta deu para a intensidade do treino. Deixe em branco quem não respondeu. Classificação pela média: até 4 Leve, 5 a 6 Moderado, 7 ou mais Intenso.</p>
    <div class="dm-pse">${ativos.map(a => `<label><span>${esc(a.nome)}<small>${esc(a.posicao)}</small></span><input class="in" type="number" min="0" max="10" step="1" inputmode="numeric" data-pse="${a.id}" value="${atual[a.id] ?? ''}"></label>`).join('')}</div>
    <div class="mfoot"><span class="m" id="dmpsem"></span><div class="row"><button class="btn" id="dmpsec">Cancelar</button><button class="btn pri" id="dmpses">Salvar</button></div></div>`, true);
  const media = () => { const v = [...document.querySelectorAll('[data-pse]')].map(i => i.value).filter(x => x !== '').map(Number).filter(n => n >= 0 && n <= 10);
    const m = v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length * 10) / 10 : null;
    $('#dmpsem').textContent = m == null ? 'Sem notas' : `Média ${String(m).replace('.', ',')} → ${classifPSE(m)} (${v.length} atletas)`; return m; };
  document.querySelectorAll('[data-pse]').forEach(i => i.oninput = media); media();
  $('#dmpsec').onclick = fechar;
  $('#dmpses').onclick = async () => {
    const vals = [...document.querySelectorAll('[data-pse]')].map(i => ({ id: +i.dataset.pse, v: i.value }));
    if (vals.some(x => x.v !== '' && !(+x.v >= 0 && +x.v <= 10 && Number.isInteger(+x.v)))) return toast('Use notas inteiras de 0 a 10.', true);
    const ins = vals.filter(x => x.v !== '').map(x => ({ data: d, atleta_id: x.id, nota: +x.v })), del = vals.filter(x => x.v === '' && atual[x.id] != null).map(x => x.id);
    if (ins.length) { const { error } = await sb.from('fisio_pse').upsert(ins, { onConflict: 'data,atleta_id' }); if (error) return toast(erroAmigavel(error), true); }
    if (del.length) { const { error } = await sb.from('fisio_pse').delete().eq('data', d).in('atleta_id', del); if (error) return toast(erroAmigavel(error), true); }
    S.dm.pse = S.dm.pse.filter(x => x.data !== d).concat(ins);
    const m = media(); fechar(); await salvarDia(d, { pse_media: m, classificacao: classifPSE(m) ?? (S.dm.dias[d]?.classificacao || null) }); toast('PSE salva.');
  };
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
    <div class="f"><span class="m">Condutas ${condAtivas.length ? '' : '· crie seus botões em “Meus botões de conduta”'}</span><div class="dm-cbtn">${condAtivas.map(c => `<button type="button" class="chip${cds.includes(c.id) ? ' on' : ''}" data-cb="${c.id}" title="${esc(c.texto)}">${esc(c.nome)}</button>`).join('')}</div></div>
    <label class="f"><span>Descrição (é o texto que vai para o relatório)</span><textarea class="in" id="fad" rows="3" placeholder="Foi realizado ...">${esc(x?.descricao || '')}</textarea></label>
    <div id="faprev"></div>
    <div class="mfoot"><span class="m" id="famsg"></span><div class="row"><button class="btn" id="fac">Cancelar</button><button class="btn pri" id="fas">Salvar</button></div></div>`, true);
  const atualizaLesao = () => {
    const ls = sel.length === 1 ? S.dm.lesoes.filter(l => l.atleta_id === sel[0] && lesaoAtiva(l)) : [];
    $('#fal').innerHTML = opts(ls.map(l => [l.id, tituloLesao(l)]), x?.lesao_id ?? (ls[0] && $('#faf').value === 'Tratamento' ? ls[0].id : ''), 'nenhuma');
    $('#fal').disabled = !ls.length;
  };
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
    atualizaLesao(); atualizaPrev(); };
  document.querySelector('.dm-cbtn').onclick = e => { const b = e.target.closest('[data-cb]'); if (!b) return; const c = condAtivas.find(k => k.id === +b.dataset.cb);
    const ta = $('#fad'); if (!cds.includes(c.id)) { cds.push(c.id); b.classList.add('on');
      const t = ta.value.trim(); ta.value = t ? `${t.replace(/[.\s]+$/, '')}, ${c.texto}` : `Foi realizado ${c.texto}`;
      if (c.finalidade && !edit && cds.length === 1) { $('#faf').value = c.finalidade; atualizaLesao(); } }
    else { cds = cds.filter(i => i !== c.id); b.classList.remove('on'); }
    atualizaPrev(); };
  $('#faf').onchange = atualizaLesao;
  atualizaLesao(); atualizaPrev();
  $('#fac').onclick = fechar;
  $('#fas').onclick = async () => {
    if (!sel.length) return toast('Escolha o atleta.', true);
    const desc = $('#fad').value.trim(); if (!desc) return toast('Escreva a descrição (ou use os botões).', true);
    const base = { data: d, momento: $('#fam').value, finalidade: $('#faf').value, queixa: $('#faq').value.trim() || null, regiao: $('#far').value.trim() || null, lado: $('#fala').value || null, descricao: desc, conduta_ids: cds };
    const marcados = [...document.querySelectorAll('[data-pv]:checked')].map(i => +i.dataset.pv);
    const rows = sel.map(id => ({ ...base, atleta_id: id, lesao_id: sel.length === 1 && $('#fal').value ? +$('#fal').value : null,
      prevencao_ids: sel.length === 1 ? marcados : S.dm.prev.filter(p => p.ativo && p.atleta_id === id && p.conduta_id && cds.includes(p.conduta_id)).map(p => p.id),
      ordem: S.dm.atend.filter(y => y.data === d).length }));
    const b = $('#fas'); b.disabled = true;
    const r = edit ? await sb.from('fisio_atendimentos').update(rows[0]).eq('id', x.id).select() : await sb.from('fisio_atendimentos').insert(rows).select();
    b.disabled = false; if (r.error) return toast(erroAmigavel(r.error), true);
    if (edit) S.dm.atend = S.dm.atend.map(y => y.id === x.id ? r.data[0] : y); else S.dm.atend.push(...r.data);
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
function adesao(p, ini) {
  const fim = addDays(ini, 6);
  const dias = new Set(S.dm.atend.filter(x => x.atleta_id === p.atleta_id && x.data >= ini && x.data <= fim && (x.prevencao_ids || []).includes(p.id)).map(x => x.data));
  return { feitos: dias.size, alvo: p.vezes_semana || null };
}
function pPrevencao() {
  const pode = podeDM(), ini = S.dm.semana || (S.dm.semana = segunda(hoje()));
  const ativos = S.dm.prev.filter(p => p.ativo), pausados = S.dm.prev.filter(p => !p.ativo);
  const atls = [...new Set(ativos.map(p => p.atleta_id))].sort((a, b) => nomeA(a).localeCompare(nomeA(b)));
  let alvoT = 0, feitoT = 0; const devendo = new Set();
  ativos.forEach(p => { const a = adesao(p, ini); if (a.alvo) { alvoT += a.alvo; feitoT += Math.min(a.feitos, a.alvo); if (a.feitos < a.alvo && ini <= hoje()) devendo.add(p.atleta_id); } });
  const kpi = (l, v, s) => `<div class="card"><div class="l">${l}</div><div class="v">${v}</div><div class="s">${s}</div></div>`;
  $('#main').innerHTML = topo('Fisioterapia / DM', 'Prevenção', 'Preventivos de cada atleta. A adesão conta sozinha pelos atendimentos marcados como prevenção.',
    pode ? '<button class="btn pri" id="dmpv">+ Preventivo</button>' : '') + fsTabs('prevencao') + `
  <div class="dm-dia"><button class="btn sm" id="dmsa">◀</button><b>Semana de ${fmt(ini)} a ${fmt(addDays(ini, 6))}</b><button class="btn sm" id="dmsp">▶</button>${ini !== segunda(hoje()) ? '<button class="btn sm" id="dmsh">Esta semana</button>' : ''}</div>
  <div class="cards fs-kpis">
    ${kpi('Preventivos ativos', ativos.length, `${atls.length} atleta${atls.length === 1 ? '' : 's'}`)}
    ${kpi('Adesão da semana', alvoT ? Math.round(feitoT / alvoT * 100) + '%' : '—', alvoT ? `${feitoT} de ${alvoT} sessões previstas` : 'defina as vezes por semana')}
    ${kpi('Com pendência na semana', devendo.size, devendo.size ? [...devendo].map(nomeA).slice(0, 3).join(', ') + (devendo.size > 3 ? '…' : '') : 'todos em dia')}
    ${kpi('Pausados', pausados.length, 'fora do controle de adesão')}
  </div>
  <div class="panel"><h2>Por atleta</h2>
    ${atls.length ? atls.map(id => { const s = situacao(id).sit;
      return `<div class="dm-pa"><div class="dm-pa-h"><b>${esc(nomeA(id))}</b>${sitBadge(s)}${pode ? `<button class="btn sm" data-pvn="${id}">+ item</button>` : ''}</div>
        <table class="tb dm-ptab"><tbody>${ativos.filter(p => p.atleta_id === id).map(p => { const a = adesao(p, ini);
          return `<tr><td><b>${esc(p.item)}</b>${p.regiao ? `<div class="m">${esc(p.regiao)}</div>` : ''}</td><td class="sm">${esc(p.dosagem || '')}</td>
          <td class="sm">${esc(p.origem || '')}${p.motivo ? ` · ${esc(p.motivo)}` : ''}${p.grupo ? ' <span class="badge">grupo</span>' : ''}</td>
          <td class="dm-ad">${a.alvo ? `${[...Array(a.alvo)].map((_, k) => `<i class="${k < a.feitos ? 'ok' : ''}"></i>`).join('')}<span>${a.feitos}/${a.alvo}</span>` : `<span class="m">${a.feitos}× na semana</span>`}</td>
          ${pode ? `<td class="dm-act"><button class="btn sm" data-pve="${p.id}">Editar</button><button class="btn sm" data-pvp="${p.id}">Pausar</button></td>` : ''}</tr>`; }).join('')}</tbody></table></div>`; }).join('') : '<p class="empty">Nenhum preventivo cadastrado.</p>'}
  </div>
  ${pausados.length ? `<div class="panel"><h2>Pausados</h2>${pausados.map(p => `<div class="kv small"><span><b>${esc(nomeA(p.atleta_id))}</b> · ${esc(p.item)}</span>${pode ? `<span><button class="btn sm" data-pvr="${p.id}">Reativar</button> <button class="btn sm" data-pvx="${p.id}">Excluir</button></span>` : ''}</div>`).join('')}</div>` : ''}`;
  ligarAbasFs();
  const irS = n => { S.dm.semana = n; pPrevencao(); };
  $('#dmsa').onclick = () => irS(addDays(ini, -7)); $('#dmsp').onclick = () => irS(addDays(ini, 7)); if ($('#dmsh')) $('#dmsh').onclick = () => irS(segunda(hoje()));
  if (!pode) return;
  $('#dmpv').onclick = () => formPrevencao();
  document.querySelectorAll('[data-pvn]').forEach(b => b.onclick = () => formPrevencao(null, +b.dataset.pvn));
  document.querySelectorAll('[data-pve]').forEach(b => b.onclick = () => formPrevencao(S.dm.prev.find(p => p.id === +b.dataset.pve)));
  const upd = async (id, campos, msg) => { const { error } = await sb.from('fisio_prevencao').update(campos).eq('id', id); if (error) return toast(erroAmigavel(error), true); Object.assign(S.dm.prev.find(p => p.id === id), campos); toast(msg); pPrevencao(); };
  document.querySelectorAll('[data-pvp]').forEach(b => b.onclick = () => upd(+b.dataset.pvp, { ativo: false }, 'Preventivo pausado.'));
  document.querySelectorAll('[data-pvr]').forEach(b => b.onclick = () => upd(+b.dataset.pvr, { ativo: true }, 'Preventivo reativado.'));
  document.querySelectorAll('[data-pvx]').forEach(b => b.onclick = async () => { if (!confirm('Excluir este preventivo?')) return;
    const { error } = await sb.from('fisio_prevencao').delete().eq('id', +b.dataset.pvx); if (error) return toast(erroAmigavel(error), true); S.dm.prev = S.dm.prev.filter(p => p.id !== +b.dataset.pvx); pPrevencao(); });
}
function formPrevencao(p, atletaPre) {
  const edit = !!p; let sel = edit ? [p.atleta_id] : atletaPre ? [atletaPre] : [];
  const sugestoes = id => { const out = [];
    try { const av = typeof ultimaAv === 'function' && S.fisio?.ok ? ultimaAv(id) : null; if (av) focosDe(av.achados, av.revisao || {}).slice(0, 4).forEach(f => out.push(['Avaliação', f])); } catch (e) { /* sem avaliação */ }
    S.dm.lesoes.filter(l => l.atleta_id === id && l.categoria === 'Lesão').slice(-3).forEach(l => out.push(['Lesão anterior', tituloLesao(l)]));
    return out; };
  modal(`<h2>${edit ? 'Editar preventivo' : 'Novo preventivo'}</h2>
    ${edit ? `<p><b>${esc(nomeA(p.atleta_id))}</b></p>` : `<label class="f"><span>Atletas (marque vários para um protocolo do grupo)</span><div class="row dm-selall"><button type="button" class="btn sm" id="pvtodos">Todo o elenco</button>${POSICOES.map(x => `<button type="button" class="btn sm" data-pos="${esc(x)}">${esc(x)}</button>`).join('')}<button type="button" class="btn sm" id="pvlimpa">Limpar</button></div>${chipsAtletas(sel, true)}</label>`}
    <div id="pvsug"></div>
    <div class="g2"><label class="f"><span>Preventivo</span><input class="in" id="pvi" value="${esc(p?.item || '')}" placeholder="ex.: Nórdico, Copenhagen, mobilização de quadril"></label>
      <label class="f"><span>Região</span><input class="in" id="pvr" list="dmreg3" value="${esc(p?.regiao || '')}"></label></div>
    <datalist id="dmreg3">${REGIOES.map(r => `<option value="${esc(r)}">`).join('')}</datalist>
    <div class="g3"><label class="f"><span>Vezes por semana</span><input class="in" type="number" min="1" max="14" id="pvv" value="${p?.vezes_semana ?? ''}"></label>
      <label class="f"><span>Dosagem</span><input class="in" id="pvd" value="${esc(p?.dosagem || '')}" placeholder="3x8, 2x30s..."></label>
      <label class="f"><span>Origem</span><select class="in" id="pvo">${dmLista(ORIGENS_PREV, p?.origem)}</select></label></div>
    <div class="g2"><label class="f"><span>Motivo</span><input class="in" id="pvm" value="${esc(p?.motivo || '')}" placeholder="ex.: mobilidade de quadril (avaliação 14/10)"></label>
      <label class="f"><span>Botão de conduta ligado (conta a adesão sozinho)</span><select class="in" id="pvc">${dmLista(S.dm.condutas.filter(c => c.ativo).map(c => [c.id, c.nome]), p?.conduta_id)}</select></label></div>
    <div class="mfoot"><span class="m">Com o botão ligado, todo atendimento de prevenção que usar esse botão conta como feito.</span><div class="row"><button class="btn" id="pvcan">Cancelar</button><button class="btn pri" id="pvsal">Salvar</button></div></div>`, true);
  const atualizaSug = () => { const box = $('#pvsug'); if (sel.length !== 1) { box.innerHTML = ''; return; }
    const s = sugestoes(sel[0]); box.innerHTML = s.length ? `<div class="f"><span class="m">Sugestões para ${esc(nomeA(sel[0]))}</span><div class="dm-cbtn">${s.map(([o, t]) => `<button type="button" class="chip" data-so="${esc(o)}" data-st="${esc(t)}">${esc(o)}: ${esc(t)}</button>`).join('')}</div></div>` : '';
    box.querySelectorAll('[data-so]').forEach(b => b.onclick = () => { $('#pvo').value = b.dataset.so; $('#pvm').value = b.dataset.st; if (!$('#pvi').value) $('#pvi').value = b.dataset.st; }); };
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
    const base = { item, regiao: $('#pvr').value.trim() || null, vezes_semana: $('#pvv').value ? +$('#pvv').value : null, dosagem: $('#pvd').value.trim() || null,
      origem: $('#pvo').value || (sel.length > 1 ? 'Protocolo do grupo' : null), motivo: $('#pvm').value.trim() || null, conduta_id: $('#pvc').value ? +$('#pvc').value : null };
    if (base.vezes_semana != null && !(base.vezes_semana >= 1 && base.vezes_semana <= 14)) return toast('Vezes por semana: de 1 a 14.', true);
    const grupo = sel.length > 1 ? `${item} · ${hoje()}` : null;
    const r = edit ? await sb.from('fisio_prevencao').update(base).eq('id', p.id).select() : await sb.from('fisio_prevencao').insert(sel.map(id => ({ ...base, atleta_id: id, grupo, ativo: true }))).select();
    if (r.error) return toast(erroAmigavel(r.error), true);
    if (edit) S.dm.prev = S.dm.prev.map(x => x.id === p.id ? r.data[0] : x); else S.dm.prev.push(...r.data);
    fechar(); toast(edit ? 'Preventivo atualizado.' : `${r.data.length} preventivo${r.data.length > 1 ? 's' : ''} criado${r.data.length > 1 ? 's' : ''}.`); pPrevencao();
  };
}

/* ============ resumo do atleta (ficha do Elenco) ============ */
function resumoDM(id) {
  const s = situacao(id), ls = S.dm.lesoes.filter(l => l.atleta_id === id).sort((a, b) => b.data_inicio.localeCompare(a.data_inicio));
  const pv = S.dm.prev.filter(p => p.atleta_id === id && p.ativo), at = S.dm.atend.filter(x => x.atleta_id === id).slice(-8).reverse();
  modal(`<h2>${esc(nomeA(id))} · DM</h2><p>${sitBadge(s.sit) || '<span class="badge s-Titular">Liberado</span>'} ${s.lesao ? esc(tituloLesao(s.lesao)) + ' · ' + esc(s.lesao.etapa) : ''}</p>
    <h3 class="fs-h">Lesões e doenças</h3>${ls.length ? ls.map(l => `<div class="kv small dm-tr" data-les="${l.id}"><span>${esc(tituloLesao(l))}${l.anterior_clube ? ' <span class="badge">anterior ao clube</span>' : ''}</span><span class="m">${dataBR(l.data_inicio)}${l.anterior_clube ? '' : ' · ' + diasFora(l) + ' dias'}</span></div>`).join('') : '<p class="empty">Nenhuma.</p>'}
    <h3 class="fs-h">Preventivos</h3>${pv.length ? pv.map(p => { const a = adesao(p, segunda(hoje())); return `<div class="kv small"><span>${esc(p.item)}${p.dosagem ? ' · ' + esc(p.dosagem) : ''}</span><span class="m">${a.alvo ? `${a.feitos}/${a.alvo} na semana` : `${a.feitos}× na semana`}</span></div>`; }).join('') : '<p class="empty">Nenhum.</p>'}
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
pMapa = function () { _pMapaDM(); if (!S.dm.ok) return;
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
