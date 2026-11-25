/* CINQ – Competição de treinos: classificação semanal pelos resultados das atividades do treino.
   Cada atividade: atletas do grupo vencedor = Vitória, perdedor = Derrota, ou Empate. Pontos: V 2 · E 1 · D 0.
   Desempate: mais vitórias, menos derrotas, melhor aproveitamento. Quem não participou não pontua. Tabela semanal (segunda a domingo), com pódio e
   exportação para imprimir (A4 retrato) e imagem.
   Lança: Análise de desempenho e admin. Leitura: comissão. */
const podeComp = () => isAdmin() || S.perfil?.funcao === 'analise';
const COMP_PTS = { V: 2, E: 1, D: 0 };
const compPV = x => x?.pts_v == null ? COMP_PTS.V : +x.pts_v;   // pontos da vitória da atividade (padrão 2; jogo-treino 3; 0 = não vale pontos → fora da tabela)
const compVale = x => compPV(x) > 0;
const COMP_RES = [['V', 'Venceu'], ['E', 'Empate'], ['D', 'Perdeu']];
S.comp = { ref: null, at: [], res: [] };
const compDS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'], compDL = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const compAtl = id => S.atletas.find(a => a.id === id);
const compNome = a => { const ap = String(a?.nome || '').match(/\(([^)]+)\)/); return ap ? ap[1].trim() : (a?.nome || '?'); };
const compFt = (a, cls = '') => { const q = fotoQ(a); return a?.foto_url ? `<span class="cp-ft ${cls}"><img src="${esc(a.foto_url)}" alt="" style="object-position:${q.x}% ${q.y}%"></span>` : `<span class="cp-ft cp-ini ${cls}">${esc(iniciais(a?.nome || '?'))}</span>`; };

async function carregarComp() {
  const ini = S.comp.ref, fim = addDays(ini, 6);
  const a = await sb.from('comp_atividades').select('*').gte('data', ini).lte('data', fim).order('data').order('ordem').order('id');
  if (a.error) throw a.error;
  const ids = a.data.map(x => x.id);
  const r = ids.length ? await sb.from('comp_resultados').select('*').in('atividade_id', ids) : { data: [] };
  if (r.error) throw r.error;
  S.comp.at = a.data; S.comp.res = r.data;
}
// classificação sem posição repetida: pontos → mais vitórias → menos derrotas → melhor aproveitamento (pontos ÷ possíveis) → nome
function compTabela(at = S.comp.at, res = S.comp.res) {
  const pv = Object.fromEntries(at.filter(compVale).map(x => [x.id, compPV(x)])), m = {};
  res.filter(r => pv[r.atividade_id]).forEach(r => { const o = m[r.atleta_id] = m[r.atleta_id] || { id: r.atleta_id, V: 0, E: 0, D: 0, P: 0, Pmax: 0 }; const v = pv[r.atividade_id];
    o[r.res]++; o.P += r.res === 'V' ? v : r.res === 'E' ? COMP_PTS.E : COMP_PTS.D; o.Pmax += v; });
  const L = Object.values(m).map(o => ({ ...o, a: compAtl(o.id), J: o.V + o.E + o.D, apr: o.Pmax ? Math.round(o.P / o.Pmax * 100) : 0 }))
    .sort((x, y) => y.P - x.P || y.V - x.V || x.D - y.D || (y.Pmax ? y.P / y.Pmax : 0) - (x.Pmax ? x.P / x.Pmax : 0) || compNome(x.a).localeCompare(compNome(y.a), 'pt'));
  L.forEach((o, i) => { o.pos = i + 1; });
  return L;
}

/* ---------- página ---------- */
async function pCompeticao() {
  S.comp.ref = S.comp.ref || segunda(hoje());
  const pode = podeComp(), ini = S.comp.ref, fim = addDays(ini, 6);
  const cab = topo('Comissão', 'Competição de treinos', 'Vitória 2 pontos (ou o valor da atividade) · empate 1 · derrota 0. Desempate: mais vitórias, menos derrotas, melhor aproveitamento. Quem não participou não pontua.',
    `<button class="btn" id="cpcrit">📘 Critérios</button><button class="btn pri" id="cpexp">🖨️ Exportar tabela</button>${pode ? '<button class="btn" id="cpnova">+ Atividade</button>' : ''}`);
  $('#main').innerHTML = cab + '<div class="panel empty">Carregando…</div>';
  try { await carregarComp(); } catch (e) { $('#main .panel').innerHTML = esc(erroAmigavel(e)); return; }
  const L = compTabela(), A = S.comp.at, n = A.filter(compVale).length, nz = A.length - n;
  const nav = `<div class="gol-per"><button class="btn sm" id="cpprev">◀</button><b>Semana ${fmt(ini)} a ${fmt(fim)}</b><button class="btn sm" id="cpnext">▶</button>${ini !== segunda(hoje()) ? '<button class="btn sm" id="cphoje">Atual</button>' : ''}
    <span class="m">${n} atividade${n === 1 ? '' : 's'} valendo pontos${nz ? ` · ${nz} sem pontos (fora da tabela)` : ''} · ${L.length} atletas pontuaram</span></div>`;
  const dias = [...new Set(A.map(x => x.data))];
  const ativ = `<div class="panel"><h2>Atividades da semana</h2>${dias.length ? `<div class="cp-dias">${dias.map(d => `<div class="cp-dia"><h4>${compDL[parse(d).getDay()]} <small>${fmt(d)}</small></h4>
      ${A.filter(x => x.data === d).map(x => { const R = S.comp.res.filter(r => r.atividade_id === x.id), c = k => R.filter(r => r.res === k).length;
        return `<button class="cp-at" data-cpat="${x.id}"><b>${esc(x.nome)}${!compVale(x) ? ' <small class="cp-pv cp-pv0">não vale pontos</small>' : compPV(x) !== COMP_PTS.V ? ` <small class="cp-pv">vitória = ${compPV(x)} pts</small>` : ''}</b><span><i class="v">${c('V')} V</i><i class="e">${c('E')} E</i><i class="d">${c('D')} D</i></span></button>`; }).join('')}</div>`).join('')}</div>`
    : `<p class="empty">Nenhuma atividade lançada nesta semana.${pode ? ' Use “+ Atividade”.' : ''}</p>`}</div>`;
  $('#main').innerHTML = cab + nav + (L.length ? compPodio(L) + compTabelaHTML(L) : '') + ativ;
  $('#cpprev').onclick = () => { S.comp.ref = addDays(ini, -7); pCompeticao(); };
  $('#cpnext').onclick = () => { S.comp.ref = addDays(ini, 7); pCompeticao(); };
  if ($('#cphoje')) $('#cphoje').onclick = () => { S.comp.ref = segunda(hoje()); pCompeticao(); };
  $('#cpcrit').onclick = compCriterios;
  $('#cpexp').onclick = () => L.length ? compExportar(L) : toast('Nenhum resultado nesta semana.', true);
  if ($('#cpnova')) $('#cpnova').onclick = () => compForm(null);
  document.querySelectorAll('[data-cpat]').forEach(b => b.onclick = () => compForm(A.find(x => x.id === +b.dataset.cpat)));
}
function compPodio(L, imp) {
  const T = L.slice(0, 3), ordem = [1, 0, 2];
  return `<div class="cp-pod${imp ? ' imp' : ''}">${ordem.map(i => { const o = T[i]; if (!o) return '<div class="cp-pc vazio"></div>';
    return `<div class="cp-pc p${i + 1}">${compFt(o.a, 'g')}<em>${o.pos}º</em><b>${esc(compNome(o.a))}</b><span>${o.P} pts · ${o.V} V</span><div class="cp-deg"></div></div>`; }).join('')}</div>`;
}
function compTabelaHTML(L, imp) {
  return `<div class="${imp ? 'cp-timp' : 'panel'}">${imp ? '' : '<h2>Classificação da semana</h2>'}<div class="tablewrap"><table class="tb cp-tb"><thead><tr><th>#</th><th>Atleta</th><th class="c">Pontos</th><th class="c">V</th><th class="c">E</th><th class="c">D</th><th class="c">Jogos</th><th class="c">Aprov.</th></tr></thead><tbody>
    ${L.map((o, i) => `<tr class="${o.pos <= 3 && i < Math.ceil(L.length / 2) ? 'cp-t' + o.pos : ''}${i >= Math.ceil(L.length / 2) ? ' cp-baixo' : ''}${L.length > 1 && i === Math.ceil(L.length / 2) ? ' cp-meio' : ''}"><td><b class="cp-pos">${o.pos}º</b></td><td><span class="cp-at-n">${compFt(o.a)}<b>${esc(o.a?.nome || '?')}</b></span></td><td class="c"><b class="cp-pts">${o.P}</b></td>
      <td class="c">${o.V}</td><td class="c">${o.E}</td><td class="c">${o.D}</td><td class="c">${o.J}</td><td class="c">${o.apr}%</td></tr>`).join('')}</tbody></table></div></div>`;
}

/* ---------- lançar / editar uma atividade ---------- */
function compForm(x) {
  const pode = podeComp(), novo = !x, d0 = x?.data || (S.comp.ref <= hoje() && hoje() <= addDays(S.comp.ref, 6) ? hoje() : S.comp.ref);
  const R = {}; if (x) S.comp.res.filter(r => r.atividade_id === x.id).forEach(r => { R[r.atleta_id] = r.res; });
  const ats = S.atletas.filter(a => a.ativo && a.status !== 'Inativo' || R[a.id]).sort((a, b) => a.nome.localeCompare(b.nome, 'pt'));
  const exs = data => S.sessoes.filter(s => s.data === data).flatMap(s => exDe(s.id).map(e => [e.nome, `${horaTxt(s)} · ${e.ordem}. ${e.nome}`]));
  const linha = a => `<div class="cp-l" data-cpa="${a.id}">${compFt(a)}<b>${esc(a.nome)}</b><span class="cp-seg">${COMP_RES.map(([k, l]) => `<button type="button" data-k="${k}" class="${R[a.id] === k ? 'on ' + k : ''}"${pode ? '' : ' disabled'}>${l}</button>`).join('')}</span></div>`;
  const nAt = A => A.filter(y => y.data === d0).length;
  modal(`<h2>${novo ? 'Nova atividade' : esc(x.nome)}</h2>
    <div class="gol-f3"><label class="f"><span>Data</span><input type="date" class="in" id="cpd" value="${esc(d0)}"${pode ? '' : ' disabled'}></label>
      <label class="f"><span>Nome da atividade</span><input class="in" id="cpn" value="${esc(x?.nome || `Atividade ${nAt(S.comp.at) + 1}`)}"${pode ? '' : ' disabled'}></label>
      <label class="f"><span>Do plano de treino <small class="m">(opcional)</small></span><select class="in" id="cpex"${pode ? '' : ' disabled'}>${opts(exs(d0), '', '—')}</select></label>
      <label class="f"><span>Vitória vale <small class="m">pontos (padrão ${COMP_PTS.V}; 0 = não vale, fica fora da tabela)</small></span><input type="number" min="0" max="10" class="in" id="cppv" value="${compPV(x)}"${pode ? '' : ' disabled'}></label></div>
    ${pode ? `<div class="cp-bulk"><span class="m">Clique no resultado de cada atleta (clicar de novo desmarca = não participou).</span><button type="button" class="btn sm" id="cpallE">Todos empataram</button><button type="button" class="btn sm" id="cplimpa">Limpar</button></div>` : ''}
    <div class="cp-cont" id="cpcont"></div>
    <div class="cp-ls">${ats.map(linha).join('')}</div>
    <div class="mfoot">${!novo && pode ? '<button class="btn dan" id="cpdel">Excluir atividade</button>' : '<span></span>'}<div class="row"><button class="btn" id="cpx">${pode ? 'Cancelar' : 'Fechar'}</button>${pode ? '<button class="btn pri" id="cps">Salvar</button>' : ''}</div></div>`, true);
  const conta = () => { const v = Object.values(R); $('#cpcont').innerHTML = `<i class="v">${v.filter(k => k === 'V').length} venceram</i><i class="e">${v.filter(k => k === 'E').length} empataram</i><i class="d">${v.filter(k => k === 'D').length} perderam</i>`; };
  const pinta = id => document.querySelectorAll(`[data-cpa="${id}"] [data-k]`).forEach(b => { b.className = R[id] === b.dataset.k ? 'on ' + b.dataset.k : ''; });
  conta();
  $('#cpx').onclick = fechar;
  if (!pode) return;
  document.querySelectorAll('.cp-l').forEach(l => l.querySelectorAll('[data-k]').forEach(b => b.onclick = () => { const id = +l.dataset.cpa, k = b.dataset.k; if (R[id] === k) delete R[id]; else R[id] = k; pinta(id); conta(); }));
  $('#cpallE').onclick = () => { ats.forEach(a => { R[a.id] = 'E'; pinta(a.id); }); conta(); };
  $('#cplimpa').onclick = () => { Object.keys(R).forEach(k => { delete R[k]; pinta(+k); }); conta(); };
  $('#cpex').onchange = e => { if (e.target.value) $('#cpn').value = e.target.value; };
  $('#cpd').onchange = e => { $('#cpex').innerHTML = opts(exs(e.target.value), '', '—'); };
  if ($('#cpdel')) $('#cpdel').onclick = async () => { if (!confirm(`Excluir “${x.nome}” de ${dataBR(x.data)} e os resultados dela?`)) return;
    const { error } = await sb.from('comp_atividades').delete().eq('id', x.id); if (error) return toast(erroAmigavel(error), true); fechar(); toast('Atividade excluída.'); pCompeticao(); };
  $('#cps').onclick = async () => {
    const data = $('#cpd').value, nome = $('#cpn').value.trim(), pts_v = $('#cppv').value === '' ? COMP_PTS.V : Math.round(+$('#cppv').value); if (!data || !nome) return toast('Informe a data e o nome.', true);
    if (!(pts_v >= 0 && pts_v <= 10)) return toast('A vitória vale de 0 a 10 pontos (0 = não vale pontos).', true);
    if (!Object.keys(R).length) return toast('Marque o resultado de ao menos um atleta.', true);
    $('#cps').disabled = true;
    try {
      let id = x?.id;
      if (novo) { const { data: d, error } = await sb.from('comp_atividades').insert({ data, nome, pts_v, ordem: nAt(S.comp.at) + 1 }).select().single(); if (error) throw error; id = d.id; }
      else { const { error } = await sb.from('comp_atividades').update({ data, nome, pts_v }).eq('id', id); if (error) throw error;
        const { error: e2 } = await sb.from('comp_resultados').delete().eq('atividade_id', id); if (e2) throw e2; }
      const { error } = await sb.from('comp_resultados').insert(Object.entries(R).map(([a, k]) => ({ atividade_id: id, atleta_id: +a, res: k }))); if (error) throw error;
      fechar(); toast('Atividade salva.'); S.comp.ref = segunda(data); pCompeticao();
    } catch (e) { $('#cps').disabled = false; toast(erroAmigavel(e), true); }
  };
}

/* ---------- exportação (para imprimir e pendurar no vestiário) ---------- */
function compExportHTML(L) {
  const ini = S.comp.ref, fim = addDays(ini, 6), A = S.comp.at.filter(compVale);
  const grade = A.length ? `<section class="cpp-pg"><div class="cpp-cab"><img src="${LOGO}" alt=""><div><small>QFC · COMPETIÇÃO DE TREINOS</small><h1>Resultados de cada atividade</h1></div><div class="cpp-dt"><b>Semana ${fmt(ini)} a ${fmt(fim)}</b></div></div>
    <table class="cpp-gr"><thead><tr><th>Atleta</th>${A.map(x => `<th>${compDS[parse(x.data).getDay()]} ${fmt(x.data)}<br><small>${esc(x.nome)}${compPV(x) !== COMP_PTS.V ? ` (V = ${compPV(x)} pts)` : ''}</small></th>`).join('')}<th>Pts</th></tr></thead><tbody>
    ${L.map(o => `<tr><td><b>${esc(o.a?.nome || '?')}</b></td>${A.map(x => { const r = S.comp.res.find(y => y.atividade_id === x.id && y.atleta_id === o.id); return `<td class="${r ? r.res : ''}">${r ? { V: 'V', E: 'E', D: 'D' }[r.res] : '–'}</td>`; }).join('')}<td><b>${o.P}</b></td></tr>`).join('')}</tbody></table>
    <p class="cpp-leg"><span class="V">V</span> venceu (2 pts) · <span class="E">E</span> empate (1 pt) · <span class="D">D</span> perdeu (0) · – não participou</p></section>` : '';
  return `<section class="cpp-pg"><div class="cpp-cab"><img src="${LOGO}" alt=""><div><small>QFC · COMPETIÇÃO DE TREINOS</small><h1>Classificação da semana</h1></div><div class="cpp-dt"><b>${fmt(ini)} a ${fmt(fim)}</b><span>${A.length} atividades</span></div></div>
    ${compPodio(L, true)}${compTabelaHTML(L, true)}<p class="cpp-leg">Vitória = 2 pontos${A.some(x => compPV(x) !== COMP_PTS.V) ? ' (atividades marcadas valem mais)' : ''} · empate = 1 · derrota = 0 · desempate: mais vitórias, menos derrotas, melhor aproveitamento</p></section>${grade}`;
}
function compExportar(L) {
  modal(`<h2>Exportar tabela</h2><p class="m">Semana ${fmt(S.comp.ref)} a ${fmt(addDays(S.comp.ref, 6))}. Página 1: pódio e classificação; página 2: resultado de cada atividade.</p>
    <div class="mfoot"><button class="btn" id="cpex0">Cancelar</button><div class="row">${typeof flPNG === 'function' ? '<button class="btn" id="cppng">Imagem (PNG)</button>' : ''}<button class="btn pri" id="cppdf">🖨️ Imprimir / PDF</button></div></div>`);
  $('#cpex0').onclick = fechar;
  const nome = `Competicao_treinos_${S.comp.ref}`;
  $('#cppdf').onclick = () => { fechar();
    document.querySelectorAll('#print-area').forEach(x => x.remove());
    const w = document.createElement('div'); w.id = 'print-area'; w.className = 'cpp-w'; w.innerHTML = compExportHTML(L);
    const st = document.createElement('style'); st.id = 'flp-page'; st.textContent = '@page{size:A4 portrait;margin:8mm}';
    document.head.appendChild(st); document.body.appendChild(w); document.body.classList.add('imprimindo');
    const t = document.title; document.title = nome;
    setTimeout(() => { window.print(); setTimeout(() => { w.remove(); st.remove(); document.body.classList.remove('imprimindo'); document.title = t; }, 500); }, 400); };
  if ($('#cppng')) $('#cppng').onclick = async () => { const b = $('#cppng'); b.disabled = true; b.textContent = 'Gerando…';
    try { await flPNG(`<div class="cpp-w cpp-png">${compExportHTML(L).split('</section>')[0]}</section></div>`, nome); fechar(); toast('Imagem baixada.'); }
    catch (e) { b.disabled = false; b.textContent = 'Imagem (PNG)'; toast(e.message || 'Não consegui gerar a imagem.', true); } };
}

/* ---------- menu e navegação ---------- */
function navComp() {
  const nav = $('#nav'); if (!nav || nav.querySelector('[data-p=competicao]')) return;
  if (typeof pagPermitida === 'function' && typeof modulosPerm === 'function' && modulosPerm() && !pagPermitida('competicao')) return;
  const n = document.createElement('button'); n.dataset.p = 'competicao'; n.textContent = 'Competição de treinos'; n.classList.toggle('on', S.page === 'competicao');
  const ref = [...nav.querySelectorAll('button')].find(b => b.textContent.trim().startsWith('Amistosos')) || [...nav.querySelectorAll('.sec')].find(s => /Análise de jogo|Análise do advers|Administra/i.test(s.textContent));
  ref ? ref.parentNode.insertBefore(n, ref) : nav.appendChild(n);
}
const _shellComp = shell;
shell = function () { _shellComp(); navComp(); };
const _irComp = ir;
ir = function (p) {
  if (p !== 'competicao') return _irComp(p);
  if (typeof pagPermitida === 'function' && typeof modulosPerm === 'function' && modulosPerm() && !pagPermitida('competicao')) return _irComp('inicio');
  S.page = p; document.querySelectorAll('#nav button[data-p]').forEach(b => b.classList.toggle('on', b.dataset.p === p));
  pCompeticao(); window.scrollTo(0, 0);
};
if (document.getElementById('main') && S.perfil) { navComp(); if (S.page === 'competicao') ir('competicao'); }

/* ---------- critérios usados na classificação ---------- */
function compCriterios() {
  const sec = (t, itens) => `<h4 class="dm-h4">${t}</h4><ul class="fl-refl">${itens.map(i => `<li>${i}</li>`).join('')}</ul>`;
  modal(`<h2>Critérios · Competição de treinos</h2><p class="m">Como a classificação da semana é calculada.</p><div class="fl-ref">
    ${sec('Pontuação', [`<b>Vitória = ${COMP_PTS.V} pontos</b> · <b>empate = ${COMP_PTS.E} ponto</b> · <b>derrota = ${COMP_PTS.D}</b>.`, 'Uma atividade pode valer mais na vitória (ex.: jogo-treino = 3 pontos, combinado com o grupo). Ela aparece marcada com “vitória = N pts”.',
      '<b>Atividade que não vale pontos</b> (vitória vale 0) fica <b>fora da tabela</b>: não soma pontos nem conta como jogo. Sem marcação = não entra.',
      'Cada atividade lançada vale um jogo para quem participou. Atleta sem resultado na atividade = não participou (–) e não pontua.',
      'Atletas que ainda não estão no elenco não entram na tabela.'])}
    ${sec('Período', ['Tabela <b>semanal</b>: segunda a domingo. Cada semana começa do zero.'])}
    ${sec('Ordem da classificação (desempate)', ['<b>1º</b> mais pontos', '<b>2º</b> mais vitórias', '<b>3º</b> menos derrotas',
      '<b>4º</b> melhor aproveitamento',
      'Persistindo o empate (números idênticos), ordem alfabética. A posição <b>não se repete</b>: 1º, 2º, 3º… em sequência.'])}
    ${sec('Cálculos', ['<b>Jogos (J)</b> = vitórias + empates + derrotas.', '<b>Aproveitamento</b> = pontos ÷ pontos possíveis (soma do valor da vitória de cada atividade disputada) × 100.'])}
    ${sec('Divisão da tabela', ['A <b>linha pontilhada vermelha</b> divide a tabela ao meio (metade das linhas; com número ímpar, a metade de cima fica com um a mais).',
      'A <b>metade de baixo</b> aparece em vermelho, na tela e na folha impressa.'])}
    </div><div class="mfoot"><span></span><button class="btn" id="cpcritf">Fechar</button></div>`, true);
  $('#cpcritf').onclick = fechar;
}
