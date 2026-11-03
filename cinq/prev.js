/* CINQ · Preventivos (Fisioterapia/DM): catálogo de exercícios por letra (cada dosagem é um exercício, com foto),
   programação semanal por atleta (letras de segunda a sexta, com repetição 2X/3X), registro do que foi feito no dia
   (o preventivo é obrigação do atleta: o CINQ só mostra a prescrição, sem marcação de feito) e folhas para imprimir. Importa os dois documentos do Word do fisioterapeuta. Carregado depois do dm.js. */
'use strict';

S.pv = { ok: false, cat: [], prog: [], feito: [], urls: {}, sub: 'programa' };
const DIAS_PV = [[1, 'Seg'], [2, 'Ter'], [3, 'Qua'], [4, 'Qui'], [5, 'Sex']];
const pvDiaSem = d => { const w = parse(d).getDay(); return w === 0 ? 7 : w; };
const pvParse = t => { const out = []; String(t || '').toUpperCase().replace(/([A-Z])\s*(?:\(\s*(?:(\d)\s*X|X\s*(\d))\s*\))?/g, (m, l, a, b) => { out.push({ l, x: +(a || b || 1) }); return m; }); return out; };
const pvTxt = arr => (arr || []).map(i => i.l + (i.x > 1 ? `(${i.x}X)` : '')).join(', ');
const pvNome = p => p.atleta_id ? nomeA(p.atleta_id) : (typeof flTitulo === 'function' ? flTitulo(p.nome_origem) : p.nome_origem) || '?';
const pvAtivos = () => S.pv.prog.filter(p => p.ativo).sort((a, b) => pvNome(a).localeCompare(pvNome(b), 'pt'));
const pvRevisar = p => p.revisar_em || addDays(p.inicio || hoje(), CICLO_PREV);
const pvCat = l => S.pv.cat.find(c => c.letra === l);
const pvFeito = (p, d, l) => S.pv.feito.find(f => f.programa_id === p.id && f.data === d && f.letra === l);
const pvDoDia = (p, d) => (p.dias || {})[String(pvDiaSem(d))] || [];

async function carregarPrev(forcar) {
  if (S.pv.ok && !forcar) return;
  const [c, p, f] = await Promise.all([sb.from('fisio_prev_catalogo').select('*').order('letra'), sb.from('fisio_prev_programa').select('*').order('id'),
    sb.from('fisio_prev_feito').select('*').gte('data', addDays(hoje(), -200))]);
  for (const r of [c, p, f]) if (r.error) throw r.error;
  S.pv.cat = c.data; S.pv.prog = p.data; S.pv.feito = f.data; S.pv.ok = true; await pvUrls();
}
async function pvUrls() {
  const paths = [...new Set(S.pv.cat.flatMap(c => (c.partes || []).flatMap(x => x.fotos || [])))].filter(x => !S.pv.urls[x]); if (!paths.length) return;
  const { data } = await sb.storage.from('fisio').createSignedUrls(paths, 6 * 3600); (data || []).forEach(d => { if (d.signedUrl && d.path) S.pv.urls[d.path] = d.signedUrl; });
}
const pvFotoUrl = path => S.pv.urls[path] || '';

/* ============ adesão ============ */
function pvAdesao(p, ini, ate = hoje()) {
  let prev = 0, feitos = 0;
  DIAS_PV.forEach(([n]) => { const d = addDays(ini, n - 1); if (d > ate || d < (p.inicio || d)) return; const it = (p.dias || {})[String(n)] || []; prev += it.length; feitos += it.filter(i => pvFeito(p, d, i.l)).length; });
  return { prev, feitos, pct: prev ? Math.round(feitos / prev * 100) : null };
}
async function pvMarcar(pid, d, l) {
  const p = S.pv.prog.find(x => x.id === pid), f = pvFeito(p, d, l);
  if (f) { const { error } = await sb.from('fisio_prev_feito').delete().eq('id', f.id); if (error) return toast(erroAmigavel(error), true); S.pv.feito = S.pv.feito.filter(x => x.id !== f.id); }
  else { const { data, error } = await sb.from('fisio_prev_feito').insert({ data: d, programa_id: pid, letra: l }).select().single(); if (error) return toast(erroAmigavel(error), true); S.pv.feito.push(data); }
}
async function pvMarcarTodos(pid, d) {
  const p = S.pv.prog.find(x => x.id === pid), falta = pvDoDia(p, d).filter(i => !pvFeito(p, d, i.l)); if (!falta.length) return;
  const { data, error } = await sb.from('fisio_prev_feito').insert(falta.map(i => ({ data: d, programa_id: pid, letra: i.l }))).select(); if (error) return toast(erroAmigavel(error), true);
  S.pv.feito.push(...data);
}
const pvChip = (p, d, i) => { const f = null, clic = false;
  return `<span class="pv-ch${f ? ' ok' : ''}${clic ? ' clic' : ''}"${clic ? ` data-pvf="${p.id}|${d}|${i.l}"` : ''} title="${esc([pvCat(i.l)?.nome, (pvCat(i.l)?.partes || []).map(x => x.dosagem).filter(Boolean).join(' · ')].filter(Boolean).join(' — ') || i.l)}${f ? ' · feito' : ''}">${esc(i.l)}${i.x > 1 ? `<sup>${i.x}x</sup>` : ''}</span>`; };
function pvLigarChips(re) {
  document.querySelectorAll('[data-pvf]').forEach(c => c.onclick = async e => { e.stopPropagation(); const [pid, d, l] = c.dataset.pvf.split('|'); await pvMarcar(+pid, d, l); re(); });
  document.querySelectorAll('[data-pvt]').forEach(b => b.onclick = async e => { e.stopPropagation(); const [pid, d] = b.dataset.pvt.split('|'); await pvMarcarTodos(+pid, d); re(); });
}

/* ============ página: Prevenção (sub-abas) ============ */
const pvSub = ab => `<div class="ind-tabs fl-modo pv-sub">${[['programa', 'Programação semanal'], ['catalogo', 'Catálogo de exercícios'], ['itens', 'Itens e ciclos']].map(([k, l]) => `<button data-pvsub="${k}" class="${k === ab ? 'on' : ''}">${l}</button>`).join('')}</div>`;
const pvLigarSub = () => document.querySelectorAll('[data-pvsub]').forEach(b => b.onclick = () => { S.pv.sub = b.dataset.pvsub; pPrevencao(); window.scrollTo(0, 0); });
const _pPrevItens = pPrevencao;
pPrevencao = function () {
  if (!S.pv.ok) { $('#main').innerHTML = topo('Fisioterapia / DM', 'Prevenção', '') + fsTabs('prevencao') + '<div class="panel empty">Carregando…</div>'; ligarAbasFs();
    carregarPrev().then(() => pPrevencao()).catch(e => { $('#main .panel').innerHTML = esc(erroAmigavel(e)); }); return; }
  if (S.pv.sub === 'itens') { _pPrevItens(); const t = document.querySelector('.fs-tabs'); if (t) t.insertAdjacentHTML('afterend', pvSub('itens')); pvLigarSub(); return; }
  (S.pv.sub === 'catalogo' ? pvCatalogo : pvPrograma)();
};

function pvPrograma() {
  const pode = podeDM(), ini = S.dm.semana || (S.dm.semana = segunda(hoje())), h = hoje(), progs = pvAtivos();
  const datas = DIAS_PV.map(([n]) => addDays(ini, n - 1)), hojeP = progs.filter(p => pvDoDia(p, h).length);
  const prevH = hojeP.reduce((t, p) => t + pvDoDia(p, h).length, 0), semProg = S.atletas.filter(a => a.ativo && a.status !== 'Inativo' && !progs.some(p => p.atleta_id === a.id));
  const venc = progs.filter(p => pvRevisar(p) <= h), semCat = [...new Set(progs.flatMap(p => Object.values(p.dias || {}).flat().map(i => i.l)))].filter(l => !pvCat(l));
  const kpi = (l, v, s) => `<div class="card"><div class="l">${l}</div><div class="v">${v}</div><div class="s">${s}</div></div>`;
  $('#main').innerHTML = topo('Fisioterapia / DM', 'Prevenção', 'Programação semanal dos preventivos específicos: as letras de cada dia são os exercícios do catálogo. O preventivo é obrigação do atleta nos dias estipulados.',
    `<button class="btn" id="pvgpdf">Imprimir grade</button>${pode ? '<button class="btn" id="pvimp">Importar programação (Word)</button><button class="btn pri" id="pvnovo">+ Programa</button>' : ''}`) + fsTabs('prevencao') + pvSub('programa') + `
  <div class="dm-dia"><button class="btn sm" id="pvsa">◀</button><b>Semana de ${fmt(ini)} a ${fmt(addDays(ini, 4))}</b><button class="btn sm" id="pvsp">▶</button>${ini !== segunda(h) ? '<button class="btn sm" id="pvsh">Esta semana</button>' : ''}</div>
  <div class="cards fs-kpis">${kpi('Atletas com programa', progs.length, `${progs.filter(p => !p.atleta_id).length ? progs.filter(p => !p.atleta_id).length + ' ainda fora do elenco do CINQ' : 'todos ligados ao elenco'}`)}
    ${kpi(`Hoje (${['', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'][pvDiaSem(h)]})`, prevH ? `${hojeP.length} atletas` : '—', prevH ? `${prevH} exercícios prescritos` : 'sem preventivo programado')}
    ${kpi('Elenco sem programa', semProg.length, semProg.length ? semProg.map(a => a.nome).slice(0, 3).join(', ') + (semProg.length > 3 ? '…' : '') : 'todos com programa')}
    ${kpi('Para revisar', venc.length, venc.length ? venc.map(pvNome).slice(0, 3).join(', ') + (venc.length > 3 ? '…' : '') : `ciclo de ${CICLO_PREV} dias em dia`)}</div>
  ${semCat.length ? `<div class="note">Letras usadas na programação que ainda não estão no catálogo: <b>${semCat.join(', ')}</b>.${pode ? ' Cadastre em “Catálogo de exercícios”.' : ''}</div>` : ''}
  <div class="panel"><h2>Programação da semana <small class="m">passe o mouse na letra para ver o exercício e a dosagem</small></h2>
    ${progs.length ? `<div class="tablewrap pv-wrap"><table class="tb pv-tab"><thead><tr><th>Atleta</th>${datas.map((d, k) => `<th class="${d === h ? 'pv-hoje' : ''}">${DIAS_PV[k][1]} <small>${fmt(d)}</small></th>`).join('')}<th>Ciclo</th>${pode ? '<th></th>' : ''}</tr></thead><tbody>
      ${progs.map(p => { const s = p.atleta_id ? situacao(p.atleta_id).sit : 'Liberado', nv = diasEntre(h, pvRevisar(p));
        return `<tr><td><b>${esc(pvNome(p))}</b>${p.atleta_id ? sitBadge(s) : ' <small class="m">fora do elenco</small>'}</td>
        ${datas.map(d => `<td class="${d === h ? 'pv-hoje' : ''}">${pvDoDia(p, d).map(i => pvChip(p, d, i)).join('')}</td>`).join('')}
        <td class="sm">${fmt(p.inicio)} → ${fmt(pvRevisar(p))}${nv < 0 ? ' <span class="badge s-Inativo">revisar</span>' : nv <= 7 ? ` <span class="badge dm-rt">${nv} d</span>` : ''}</td>
        ${pode ? `<td class="dm-act"><button class="btn sm" data-pvfolha="${p.id}">Folha</button><button class="btn sm" data-pvedit="${p.id}">Editar</button></td>` : `<td><button class="btn sm" data-pvfolha="${p.id}">Folha</button></td>`}</tr>`; }).join('')}
    </tbody></table></div>` : `<p class="empty">Nenhuma programação ainda.${pode ? ' Use “Importar programação (Word)” com o documento da programação semanal, ou “+ Programa”.' : ''}</p>`}
    <p class="m fl-nota">2X/3X = repetir o exercício no dia. Ciclo de ${CICLO_PREV} dias: depois da reavaliação, atualize o programa do atleta (Editar → Novo ciclo).</p></div>
  ${S.pv.prog.some(p => !p.ativo) ? `<div class="panel"><h2>Programas anteriores</h2>${S.pv.prog.filter(p => !p.ativo).sort((a, b) => b.id - a.id).slice(0, 30).map(p => `<div class="kv small"><span><b>${esc(pvNome(p))}</b> · ${fmt(p.inicio)} → ${fmt(pvRevisar(p))}</span><span class="m">${DIAS_PV.map(([n, l]) => `${l}: ${esc(pvTxt((p.dias || {})[n]))}`).join(' · ')}</span></div>`).join('')}</div>` : ''}`;
  ligarAbasFs(); pvLigarSub();
  const irS = n => { S.dm.semana = n; pvPrograma(); };
  $('#pvsa').onclick = () => irS(addDays(ini, -7)); $('#pvsp').onclick = () => irS(addDays(ini, 7)); if ($('#pvsh')) $('#pvsh').onclick = () => irS(segunda(h));
  $('#pvgpdf').onclick = () => imprimirFl(pvGradeHTML(), `Preventivos_QFC_${ini}`);
  document.querySelectorAll('[data-pvfolha]').forEach(b => b.onclick = () => { const p = S.pv.prog.find(x => x.id === +b.dataset.pvfolha); imprimirFl(pvFolhaHTML(p), `Preventivo_${pvNome(p).replace(/\s+/g, '_')}`); });
  if (!pode) return;
  $('#pvnovo').onclick = () => pvFormProg();
  $('#pvimp').onclick = pvImportarProg;
  document.querySelectorAll('[data-pvedit]').forEach(b => b.onclick = () => pvFormProg(S.pv.prog.find(x => x.id === +b.dataset.pvedit)));
}

/* ============ programa do atleta ============ */
function pvFormProg(p) {
  const edit = !!p, ativos = S.atletas.filter(a => a.ativo).sort((a, b) => a.nome.localeCompare(b.nome, 'pt'));
  modal(`<h2>${edit ? 'Programa de ' + esc(pvNome(p)) : 'Novo programa de preventivos'}</h2>
    <div class="g2"><label class="f"><span>Atleta</span><select class="in" id="pvat">${opts(ativos.map(a => [a.id, `${a.nome} · ${a.posicao}`]), p?.atleta_id ?? '', p?.nome_origem ? `— fora do elenco: ${p.nome_origem} —` : '— escolha —')}</select></label>
      <label class="f"><span>Observação</span><input class="in" id="pvobs" value="${esc(p?.observacao || '')}" placeholder="opcional"></label></div>
    <p class="m">Escreva as letras de cada dia como na programação: <b>A, B, C, J(2X)</b>. Letras do catálogo: ${S.pv.cat.map(c => `<b>${esc(c.letra)}</b>${c.nome ? ' ' + esc(c.nome) : ''}`).join(' · ') || 'nenhuma ainda'}.</p>
    <div class="pv-dias">${DIAS_PV.map(([n, l]) => `<label class="f"><span>${l}</span><input class="in" data-pvd="${n}" value="${esc(pvTxt((p?.dias || {})[n]))}"><small class="pv-prev" id="pvpv${n}"></small></label>`).join('')}</div>
    <div class="g3"><label class="f"><span>Início do ciclo</span><input type="date" class="in" id="pvini" value="${p?.inicio || hoje()}"></label><label class="f"><span>Revisar em</span><input type="date" class="in" id="pvrev" value="${p ? pvRevisar(p) : addDays(hoje(), CICLO_PREV)}"></label>
      ${edit ? '<label class="f row pv-novo"><input type="checkbox" id="pvciclo"> <span style="margin:0">Novo ciclo (guarda o programa atual no histórico)</span></label>' : ''}</div>
    <div class="mfoot">${edit ? '<button class="btn" id="pvrm">Encerrar programa</button>' : '<span></span>'}<div class="row"><button class="btn" id="pvc">Cancelar</button><button class="btn pri" id="pvs">Salvar</button></div></div>`, true);
  const prev = () => DIAS_PV.forEach(([n]) => { const it = pvParse($(`[data-pvd="${n}"]`).value); $('#pvpv' + n).innerHTML = it.map(i => `<span class="pv-ch${pvCat(i.l) ? '' : ' nc'}">${esc(i.l)}${i.x > 1 ? `<sup>${i.x}x</sup>` : ''}</span>`).join(''); });
  document.querySelectorAll('[data-pvd]').forEach(i => i.oninput = prev); prev();
  $('#pvini').onchange = e => { $('#pvrev').value = addDays(e.target.value, CICLO_PREV); };
  if ($('#pvciclo')) $('#pvciclo').onchange = e => { if (e.target.checked) { $('#pvini').value = hoje(); $('#pvrev').value = addDays(hoje(), CICLO_PREV); } };
  $('#pvc').onclick = fechar;
  if ($('#pvrm')) $('#pvrm').onclick = async () => { if (!confirm(`Encerrar o programa de ${pvNome(p)}? Ele vai para o histórico.`)) return;
    const { error } = await sb.from('fisio_prev_programa').update({ ativo: false }).eq('id', p.id); if (error) return toast(erroAmigavel(error), true); p.ativo = false; fechar(); pPrevencao(); };
  $('#pvs').onclick = async () => {
    const aid = $('#pvat').value ? +$('#pvat').value : null; if (!aid && !p?.nome_origem) return toast('Escolha o atleta.', true);
    const dias = Object.fromEntries(DIAS_PV.map(([n]) => [String(n), pvParse($(`[data-pvd="${n}"]`).value)]).filter(([, v]) => v.length));
    const row = { atleta_id: aid, nome_origem: aid ? (p?.nome_origem || null) : p.nome_origem, dias, inicio: $('#pvini').value || hoje(), revisar_em: $('#pvrev').value || null, observacao: $('#pvobs').value.trim() || null, ativo: true };
    const novoCiclo = !edit || $('#pvciclo')?.checked;
    if (novoCiclo) { const velhos = S.pv.prog.filter(x => x.ativo && (aid ? x.atleta_id === aid : x.nome_origem === row.nome_origem) || (edit && x.id === p.id));
      if (velhos.length) { const { error } = await sb.from('fisio_prev_programa').update({ ativo: false }).in('id', velhos.map(x => x.id)); if (error) return toast(erroAmigavel(error), true); velhos.forEach(x => { x.ativo = false; }); }
      const { data, error } = await sb.from('fisio_prev_programa').insert(row).select().single(); if (error) return toast(erroAmigavel(error), true); S.pv.prog.push(data);
    } else { const { data, error } = await sb.from('fisio_prev_programa').update(row).eq('id', p.id).select().single(); if (error) return toast(erroAmigavel(error), true); Object.assign(p, data); }
    fechar(); toast('Programa salvo.'); pPrevencao(); };
}

/* ============ importação do Word ============ */
const pvJSZip = () => window.JSZip ? Promise.resolve() : new Promise((ok, err) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'; s.onload = ok; s.onerror = () => err(new Error('Não consegui carregar o leitor de Word (sem internet?).')); document.head.appendChild(s); });
const pvEscolher = (accept, fn) => { const i = document.createElement('input'); i.type = 'file'; i.accept = accept; i.onchange = () => i.files[0] && fn(i.files[0]).catch(e => toast(e.message || erroAmigavel(e), true)); i.click(); };
async function pvDocx(f) { await pvJSZip(); const z = await window.JSZip.loadAsync(f); const x = await z.file('word/document.xml')?.async('string'); if (!x) throw new Error('O arquivo não parece um documento do Word (.docx).'); return { z, doc: new DOMParser().parseFromString(x, 'application/xml') }; }
const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const pvTxtNo = n => [...n.getElementsByTagNameNS(W_NS, 't')].map(t => t.textContent).join('').replace(/\s+/g, ' ').trim();
// programação semanal: tabela ATLETA | Seg | Ter | Qua | Qui | Sex
function pvImportarProg() {
  pvEscolher('.docx', async f => {
    const { doc } = await pvDocx(f), tb = [...doc.getElementsByTagNameNS(W_NS, 'tbl')]; if (!tb.length) throw new Error('Não achei a tabela da programação no documento.');
    const linhas = [...tb[0].getElementsByTagNameNS(W_NS, 'tr')].map(tr => [...tr.getElementsByTagNameNS(W_NS, 'tc')].map(pvTxtNo));
    const cab = linhas[0].map(c => fNorm(c).slice(0, 3)), col = n => cab.indexOf(['seg', 'ter', 'qua', 'qui', 'sex'][n - 1]);
    if (!cab.some(c => c.startsWith('atl')) || col(1) < 0) throw new Error('A primeira linha da tabela precisa ter ATLETA e os dias (Seg., Ter., …).');
    const rows = linhas.slice(1).filter(l => l[0]).map(l => ({ nome: l[0].replace(/\s+/g, ' ').trim(), dias: Object.fromEntries(DIAS_PV.map(([n]) => [String(n), pvParse(l[col(n)] || '')]).filter(([, v]) => v.length)) }));
    if (!rows.length) throw new Error('A tabela não tem atletas.');
    if (typeof carregarFl === 'function') await carregarFl().catch(() => {});
    const ativos = S.atletas.filter(a => a.ativo).sort((a, b) => a.nome.localeCompare(b.nome, 'pt'));
    const sug1 = nm => { const ant = S.pv.prog.find(p => p.nome_origem && fNorm(p.nome_origem) === fNorm(nm) && p.atleta_id); if (ant) return ant.atleta_id;
      const limpo = nm.replace(/^(d[aeo]s?)\s+/i, ''); try { return typeof flSugere === 'function' ? flSugere(limpo).id || '' : ''; } catch (e) { return ''; } };
    // a mesma sugestão para duas linhas: fica só com a que tem mais palavras em comum com o nome do atleta
    const sugs = rows.map(r => sug1(r.nome)), comum = (nm, id) => { const a = fNorm(S.atletas.find(x => x.id === id)?.nome || '').split(' '); return fNorm(nm).split(' ').filter(w => a.includes(w)).length; };
    sugs.forEach((id, k) => { if (!id) return; const outros = sugs.map((x, j) => x === id ? j : -1).filter(j => j >= 0); if (outros.length < 2) return;
      const melhor = outros.sort((a, b) => comum(rows[b].nome, id) - comum(rows[a].nome, id))[0]; outros.forEach(j => { if (j !== melhor) sugs[j] = ''; }); });
    const sug = nm => sugs[rows.findIndex(r => r.nome === nm)] ?? '';
    const letras = [...new Set(rows.flatMap(r => Object.values(r.dias).flat().map(i => i.l)))].sort();
    modal(`<h2>Importar programação dos preventivos</h2><p class="m">${esc(f.name)} · ${rows.length} atletas · letras ${letras.join(', ')}${letras.some(l => !pvCat(l)) ? ` <span class="badge dm-rt">fora do catálogo: ${letras.filter(l => !pvCat(l)).join(', ')}</span>` : ''}</p>
      <div class="g2"><label class="f"><span>Início do ciclo</span><input type="date" class="in" id="pviini" value="${hoje()}"></label><label class="f"><span>Revisar em</span><input type="date" class="in" id="pvirev" value="${addDays(hoje(), CICLO_PREV)}"></label></div>
      <p class="m">Confira quem é quem no elenco. Quem ainda não está no elenco do CINQ entra com o nome da planilha e pode ser ligado depois (Editar). O programa ativo do atleta vai para o histórico.</p>
      <div class="tablewrap pv-imp"><table class="tb"><thead><tr><th>Na planilha</th><th>Atleta do elenco</th>${DIAS_PV.map(([, l]) => `<th>${l}</th>`).join('')}</tr></thead><tbody>
      ${rows.map((r, k) => `<tr><td><b>${esc(r.nome)}</b></td><td><select class="in" data-pvim="${k}">${opts(ativos.map(a => [a.id, `${a.nome} · ${a.posicao}`]), sug(r.nome), '— fora do elenco —')}</select></td>${DIAS_PV.map(([n]) => `<td class="sm">${esc(pvTxt(r.dias[n]))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
      <div class="mfoot"><span></span><div class="row"><button class="btn" id="pvic">Cancelar</button><button class="btn pri" id="pvis">Importar</button></div></div>`, true);
    $('#pviini').onchange = e => { $('#pvirev').value = addDays(e.target.value, CICLO_PREV); };
    $('#pvic').onclick = fechar;
    $('#pvis').onclick = async () => {
      const mapa = rows.map((r, k) => $(`[data-pvim="${k}"]`).value ? +$(`[data-pvim="${k}"]`).value : null), usados = mapa.filter(Boolean);
      if (new Set(usados).size !== usados.length) return toast('O mesmo atleta foi escolhido para duas linhas.', true);
      $('#pvis').disabled = true;
      const velhos = S.pv.prog.filter(p => p.ativo && rows.some((r, k) => mapa[k] ? p.atleta_id === mapa[k] : !p.atleta_id && fNorm(p.nome_origem || '') === fNorm(r.nome)));
      if (velhos.length) { const { error } = await sb.from('fisio_prev_programa').update({ ativo: false }).in('id', velhos.map(p => p.id)); if (error) { $('#pvis').disabled = false; return toast(erroAmigavel(error), true); } velhos.forEach(p => { p.ativo = false; }); }
      const { data, error } = await sb.from('fisio_prev_programa').insert(rows.map((r, k) => ({ atleta_id: mapa[k], nome_origem: r.nome, dias: r.dias, inicio: $('#pviini').value || hoje(), revisar_em: $('#pvirev').value || null, ativo: true }))).select();
      if (error) { $('#pvis').disabled = false; return toast(erroAmigavel(error), true); }
      S.pv.prog.push(...data); fechar(); toast(`${data.length} programas importados.`); S.pv.sub = 'programa'; pPrevencao(); };
  });
}
// catálogo "Preventivo específico": no documento do QFC, cada letra tem uma ou duas dosagens e cada dosagem é um exercício com a foto logo abaixo
const PV_DOC_QFC = { A: [['3 x 12 reps. cada perna', ['image2.jpeg', 'image3.jpeg']]], B: [['3 x 12 reps. cada perna', ['image4.jpeg', 'image5.jpeg']]], C: [['3 x 10 repetições', ['image7.jpeg', 'image6.jpeg']]],
  D: [['3 x 10 repetições', ['image9.jpeg']], ['3 x 35 segundos', ['image8.jpeg']]], E: [['3 x 12 reps. cada perna', ['image11.jpeg']], ['3 x 10 segundos isometria', ['image10.jpeg']]],
  F: [['3 x 25 segundos cada perna', ['image13.jpeg']], ['3 x 10 reps', ['image12.jpeg']]], G: [['3 x 8 reps', ['image15.jpeg']], ['3 x 10 reps', ['image14.jpeg']]],
  H: [['3 x 45 segundos', ['image17.jpeg']], ['3 x 30 segundos', ['image16.jpeg']]], I: [['3 x 10 reps', ['image19.jpeg']]], J: [['6 x 3 reps', ['image21.jpeg', 'image22.jpeg']]], K: [['3 x 10 reps', ['image23.jpeg']]] };
async function pvReduzir(blob, max = 900) {
  const img = await new Promise((ok, err) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => err(new Error('Imagem inválida.')); i.src = URL.createObjectURL(blob); });
  const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight)), cv = document.createElement('canvas'); cv.width = Math.round(img.naturalWidth * k); cv.height = Math.round(img.naturalHeight * k);
  const cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height); cx.drawImage(img, 0, 0, cv.width, cv.height); URL.revokeObjectURL(img.src);
  return new Promise(ok => cv.toBlob(ok, 'image/jpeg', 0.85));
}
async function pvSubir(blob, letra) {
  const path = `preventivos/${letra}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.jpg`;
  const { error } = await sb.storage.from('fisio').upload(path, await pvReduzir(blob), { contentType: 'image/jpeg' }); if (error) throw error; return path;
}
function pvImportarCat() {
  pvEscolher('.docx', async f => {
    const { z, doc } = await pvDocx(f), media = Object.keys(z.files).filter(n => n.startsWith('word/media/')).map(n => n.slice(11));
    const texto = fNorm(pvTxtNo(doc.documentElement)), ok = Object.values(PV_DOC_QFC).flat().every(([, fs]) => fs.every(x => media.includes(x))) && /preventivo especifico/.test(texto);
    if (!ok) throw new Error('Este documento não está no formato do “Preventivo específico” do QFC. Cadastre as letras em “+ Exercício”.');
    const existe = Object.keys(PV_DOC_QFC).filter(l => pvCat(l));
    if (existe.length && !confirm(`As letras ${existe.join(', ')} já existem no catálogo. Substituir as dosagens e fotos delas pelas do documento? (os nomes e regiões ficam)`)) return;
    toast('Importando o catálogo e as fotos…');
    let n = 0;
    for (const [l, partes] of Object.entries(PV_DOC_QFC)) {
      const ps = [];
      for (const [dos, fs] of partes) { const fotos = []; for (const nm of fs) fotos.push(await pvSubir(await z.file('word/media/' + nm).async('blob'), l)); ps.push({ dosagem: dos, nome: '', fotos }); }
      const at = pvCat(l), row = { letra: l, partes: ps, nome: at?.nome || null, regiao: at?.regiao || null, objetivo: at?.objetivo || null, atualizado_em: new Date().toISOString() };
      const { data, error } = await sb.from('fisio_prev_catalogo').upsert(row, { onConflict: 'letra' }).select().single(); if (error) throw error;
      S.pv.cat = S.pv.cat.filter(c => c.letra !== l).concat(data).sort((a, b) => a.letra.localeCompare(b.letra)); n++;
    }
    await pvUrls(); toast(`Catálogo importado: ${n} letras. Agora é só dar nome aos exercícios.`); S.pv.sub = 'catalogo'; pPrevencao();
  });
}

/* ============ catálogo ============ */
const pvFotos = (fs, cl = '') => (fs || []).map(p => pvFotoUrl(p) ? `<img src="${esc(pvFotoUrl(p))}" alt="" class="pv-foto ${cl}">` : '').join('');
function pvCatalogo() {
  const pode = podeDM(), usados = {}; pvAtivos().forEach(p => Object.values(p.dias || {}).flat().forEach(i => { usados[i.l] = (usados[i.l] || 0) + 1; }));
  $('#main').innerHTML = topo('Fisioterapia / DM', 'Prevenção', 'Catálogo dos preventivos específicos: cada letra tem um ou mais exercícios (cada dosagem é um exercício), com foto.',
    pode ? `<button class="btn" id="pvcimp">Importar do Word</button><button class="btn pri" id="pvcnovo">+ Exercício</button>` : '') + fsTabs('prevencao') + pvSub('catalogo') + `
  ${S.pv.cat.length ? `<div class="pv-cat">${S.pv.cat.map(c => `<div class="panel pv-card"><div class="pv-ch-h"><span class="pv-letra">${esc(c.letra)}</span><div><b>${esc(c.nome || 'Sem nome')}</b>${c.regiao ? `<small class="m">${esc(c.regiao)}</small>` : ''}</div>
      <span class="m sm">${usados[c.letra] ? `${usados[c.letra]}× na semana` : 'não usado'}</span>${pode ? `<button class="btn sm" data-pvce="${c.id}">Editar</button>` : ''}</div>
      ${c.objetivo ? `<p class="m sm">${esc(c.objetivo)}</p>` : ''}
      <div class="pv-partes">${(c.partes || []).map(x => `<div class="pv-parte"><div class="pv-fotos">${pvFotos(x.fotos) || '<span class="m sm">sem foto</span>'}</div><b>${esc(x.dosagem || '')}</b>${x.nome ? `<small>${esc(x.nome)}</small>` : ''}</div>`).join('')}</div></div>`).join('')}</div>`
    : `<div class="panel empty">Catálogo vazio.${pode ? ' Use “Importar do Word” com o documento “Preventivo específico” ou cadastre em “+ Exercício”.' : ''}</div>`}`;
  ligarAbasFs(); pvLigarSub();
  if (!pode) return;
  $('#pvcimp').onclick = pvImportarCat; $('#pvcnovo').onclick = () => pvFormCat();
  document.querySelectorAll('[data-pvce]').forEach(b => b.onclick = () => pvFormCat(S.pv.cat.find(c => c.id === +b.dataset.pvce)));
}
function pvFormCat(c) {
  const edit = !!c; let partes = JSON.parse(JSON.stringify(c?.partes?.length ? c.partes : [{ dosagem: '', nome: '', fotos: [] }]));
  const prox = () => { const us = S.pv.cat.map(x => x.letra); for (let k = 65; k < 91; k++) { const l = String.fromCharCode(k); if (!us.includes(l)) return l; } return ''; };
  modal(`<h2>${edit ? 'Exercício ' + esc(c.letra) : 'Novo exercício preventivo'}</h2>
    <div class="g3"><label class="f"><span>Letra</span><input class="in" id="pvcl" maxlength="2" value="${esc(c?.letra || prox())}"${edit ? ' disabled' : ''}></label><label class="f"><span>Nome</span><input class="in" id="pvcn" value="${esc(c?.nome || '')}" placeholder="ex.: Mobilidade de quadril"></label>
      <label class="f"><span>Região / foco</span><input class="in" id="pvcr" list="pvregs" value="${esc(c?.regiao || '')}"><datalist id="pvregs">${REGIOES.map(r => `<option value="${esc(r)}">`).join('')}</datalist></label></div>
    <label class="f"><span>Objetivo / observação</span><input class="in" id="pvco" value="${esc(c?.objetivo || '')}"></label>
    <h4 class="dm-h4">Exercícios desta letra <small class="m">cada dosagem é um exercício</small></h4><div id="pvcps"></div><button class="btn sm" id="pvcadd">+ outro exercício nesta letra</button>
    <div class="mfoot">${edit ? '<button class="btn" id="pvcx">Excluir letra</button>' : '<span></span>'}<div class="row"><button class="btn" id="pvcc">Cancelar</button><button class="btn pri" id="pvcs">Salvar</button></div></div>`, true);
  const desenha = () => { $('#pvcps').innerHTML = partes.map((x, k) => `<div class="pv-pe"><div class="g2"><label class="f"><span>Dosagem</span><input class="in" data-pvpd="${k}" value="${esc(x.dosagem || '')}" placeholder="3 x 12 reps cada perna"></label><label class="f"><span>Nome (opcional)</span><input class="in" data-pvpn="${k}" value="${esc(x.nome || '')}"></label></div>
      <div class="pv-fotos">${(x.fotos || []).map((p, j) => `<span class="pv-fw">${pvFotoUrl(p) ? `<img src="${esc(pvFotoUrl(p))}" alt="" class="pv-foto">` : '<span class="m sm">foto</span>'}<button data-pvfx="${k}|${j}" title="tirar a foto">×</button></span>`).join('')}<button class="btn sm" data-pvfa="${k}">+ foto</button>${partes.length > 1 ? `<button class="btn sm" data-pvpx="${k}">remover exercício</button>` : ''}</div></div>`).join('');
    const ler = () => partes.forEach((x, k) => { x.dosagem = $(`[data-pvpd="${k}"]`).value.trim(); x.nome = $(`[data-pvpn="${k}"]`).value.trim(); });
    document.querySelectorAll('[data-pvfx]').forEach(b => b.onclick = () => { ler(); const [k, j] = b.dataset.pvfx.split('|').map(Number); partes[k].fotos.splice(j, 1); desenha(); });
    document.querySelectorAll('[data-pvpx]').forEach(b => b.onclick = () => { ler(); partes.splice(+b.dataset.pvpx, 1); desenha(); });
    document.querySelectorAll('[data-pvfa]').forEach(b => b.onclick = () => { ler(); pvEscolher('image/*', async f => { const l = ($('#pvcl').value || 'X').toUpperCase(); toast('Enviando a foto…'); const p = await pvSubir(f, l); S.pv.urls[p] = URL.createObjectURL(f); partes[+b.dataset.pvfa].fotos.push(p); desenha(); }); });
    desenha.ler = ler; };
  desenha();
  $('#pvcadd').onclick = () => { desenha.ler(); partes.push({ dosagem: '', nome: '', fotos: [] }); desenha(); };
  $('#pvcc').onclick = fechar;
  if ($('#pvcx')) $('#pvcx').onclick = async () => { if (!confirm(`Excluir a letra ${c.letra} do catálogo? A programação continua mostrando a letra.`)) return;
    const { error } = await sb.from('fisio_prev_catalogo').delete().eq('id', c.id); if (error) return toast(erroAmigavel(error), true); S.pv.cat = S.pv.cat.filter(x => x.id !== c.id); fechar(); pPrevencao(); };
  $('#pvcs').onclick = async () => { desenha.ler();
    const l = ($('#pvcl').value || '').trim().toUpperCase(); if (!/^[A-Z]{1,2}$/.test(l)) return toast('Use uma letra (A, B, C…).', true); if (!edit && pvCat(l)) return toast(`A letra ${l} já existe.`, true);
    const row = { letra: l, nome: $('#pvcn').value.trim() || null, regiao: $('#pvcr').value.trim() || null, objetivo: $('#pvco').value.trim() || null, partes: partes.filter(x => x.dosagem || x.nome || x.fotos.length), atualizado_em: new Date().toISOString() };
    const q = edit ? sb.from('fisio_prev_catalogo').update(row).eq('id', c.id) : sb.from('fisio_prev_catalogo').insert(row);
    const { data, error } = await q.select().single(); if (error) return toast(erroAmigavel(error), true);
    S.pv.cat = S.pv.cat.filter(x => x.id !== data.id).concat(data).sort((a, b) => a.letra.localeCompare(b.letra)); fechar(); toast('Exercício salvo.'); pPrevencao(); };
}

/* ============ folhas (PDF) ============ */
const pvLetrasDe = p => [...new Set(Object.values(p.dias || {}).flat().map(i => i.l))].sort();
const pvCatHTML = ls => `<div class="pvp-cat">${ls.map(l => { const c = pvCat(l); return `<div class="pvp-ex"><div class="pvp-exh"><span class="pv-letra">${esc(l)}</span><b>${esc(c?.nome || '')}</b></div>
  ${c ? (c.partes || []).map(x => `<div class="pvp-parte"><div class="pvp-fotos">${pvFotos(x.fotos)}</div><b>${esc(x.dosagem || '')}</b>${x.nome ? ` <small>${esc(x.nome)}</small>` : ''}</div>`).join('') : '<small>fora do catálogo</small>'}</div>`; }).join('')}</div>`;
function pvFolhaHTML(p) {
  return `<section class="flp-pg">${flCab('PREVENTIVO ESPECÍFICO', p.inicio || hoje(), `${pvNome(p)} · ciclo até ${fmt(pvRevisar(p))}`)}
    <table class="tb fl-tab pvp-sem"><thead><tr>${DIAS_PV.map(([, l]) => `<th>${l}</th>`).join('')}</tr></thead><tbody><tr>${DIAS_PV.map(([n]) => `<td>${esc(pvTxt((p.dias || {})[n])) || '—'}</td>`).join('')}</tr></tbody></table>
    ${pvCatHTML(pvLetrasDe(p))}<p class="flp-nota">2X/3X = repetir o exercício no dia. Fisioterapia e Preparação física · QFC.</p></section>`;
}
function pvGradeHTML() {
  const progs = pvAtivos(), ls = [...new Set(progs.flatMap(pvLetrasDe))].sort();
  return `<section class="flp-pg">${flCab('PROGRAMAÇÃO SEMANAL DOS PREVENTIVOS', hoje(), `${progs.length} atletas`)}
    <table class="tb fl-tab pvp-grade"><thead><tr><th>Atleta</th>${DIAS_PV.map(([, l]) => `<th>${l}</th>`).join('')}</tr></thead><tbody>${progs.map(p => `<tr><td><b>${esc(pvNome(p).toUpperCase())}</b></td>${DIAS_PV.map(([n]) => `<td>${esc(pvTxt((p.dias || {})[n]))}</td>`).join('')}</tr>`).join('')}</tbody></table></section>
    <section class="flp-pg">${flCab('PREVENTIVO ESPECÍFICO', hoje(), 'exercícios do catálogo')}${pvCatHTML(ls)}</section>`;
}

/* ============ Central: preventivo de hoje ============ */
const _pCentralPv = pCentral;
pCentral = function () {
  _pCentralPv();
  const pinta = () => {
    if (!document.querySelector('[data-fsaba="central"].on')) return;
    document.querySelectorAll('.pv-central').forEach(x => x.remove());
    const h = hoje(), progs = pvAtivos().filter(p => pvDoDia(p, h).length), pode = podeDM(); if (!progs.length) return;
    const prev = progs.reduce((t, p) => t + pvDoDia(p, h).length, 0);
    const el = document.querySelector('.fs-kpis'); if (!el) return;
    el.insertAdjacentHTML('afterend', `<div class="panel pv-central"><h2>Preventivo de hoje <small class="m">${progs.length} atletas · ${prev} exercícios prescritos · obrigação do atleta</small><button class="btn sm" id="pvcen">Abrir programação</button></h2>
      <div class="pv-hl">${progs.map(p => `<div class="pv-hi"><b>${esc(pvNome(p))}</b><span>${pvDoDia(p, h).map(i => pvChip(p, h, i)).join('')}</span></div>`).join('')}</div></div>`);
    $('#pvcen').onclick = () => { S.fisio.aba = 'prevencao'; S.pv.sub = 'programa'; pFisio(); window.scrollTo(0, 0); };
  };
  if (S.pv.ok) pinta(); else carregarPrev().then(pinta).catch(() => {});
};
