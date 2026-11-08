/* CINQ – Departamento de Goleiros: relatório semanal do treinamento dos goleiros.
   O relatório é do grupo (dia a dia: turno, duração, presença e atividades com nome + descrição + tipo),
   com observação curta por goleiro, visão geral da semana, biblioteca de atividades e PDF.
   Escrita: Preparação de goleiros (funcao 'goleiros') e admin. Leitura: toda a comissão. */
FUNCOES.goleiros = 'Preparação de goleiros';
S.gol = { ok: false, semana: null, rel: null, bib: [], cfg: {}, edit: null };
const podeGol = () => isAdmin() || S.perfil?.funcao === 'goleiros';
const golGoleiros = () => S.atletas.filter(a => a.ativo && a.status !== 'Inativo' && a.posicao === 'Goleiro').sort((a, b) => (a.numero ?? 99) - (b.numero ?? 99) || a.nome.localeCompare(b.nome, 'pt'));
const golTipos = () => Array.isArray(S.gol.cfg.tipos) ? S.gol.cfg.tipos : [];
const golId = () => Math.random().toString(36).slice(2, 9);
const DIAS_SEM = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
const golDiaNome = d => DIAS_SEM[parse(d).getDay()];

async function carregarGol(semana) {
  if (!S.gol.ok) {
    const [b, c] = await Promise.all([sb.from('gol_biblioteca').select('*').order('nome'), sb.from('gol_config').select('*')]);
    if (b.error) throw b.error; if (c.error) throw c.error;
    S.gol.bib = b.data; S.gol.cfg = Object.fromEntries(c.data.map(x => [x.chave, x.valor])); S.gol.ok = true;
  }
  const r = await sb.from('gol_relatorios').select('*').eq('semana', semana).maybeSingle(); if (r.error) throw r.error;
  S.gol.rel = r.data;
}
// rascunho editável: relatório salvo ou, se não houver, os dias de treino do calendário na semana
function golRascunho(semana) {
  const r = S.gol.rel, gks = golGoleiros().map(a => a.id);
  if (r) return { treinador: r.treinador || S.gol.cfg.treinador || '', visao: r.visao || '', obs: { ...(r.obs || {}) }, dias: JSON.parse(JSON.stringify(r.dias || [])) };
  const fim = addDays(semana, 6);
  const dias = S.sessoes.filter(s => s.data >= semana && s.data <= fim && !['Folga', 'Jogo', 'Amistoso'].includes(s.tipo)).sort((a, b) => (a.data + (a.hora || '')).localeCompare(b.data + (b.hora || '')))
    .map(s => ({ id: golId(), data: s.data, turno: s.turno || 'Tarde', dur: null, presentes: [...gks], ativ: [] }));
  return { treinador: S.gol.cfg.treinador || '', visao: '', obs: {}, dias };
}

function golResumo(R) {
  const gks = golGoleiros(), dias = R.dias || [], min = dias.reduce((a, d) => a + (+d.dur || 0), 0);
  const pres = Object.fromEntries(gks.map(a => [a.id, dias.filter(d => (d.presentes || []).includes(a.id)).length]));
  const tipos = {}; dias.forEach(d => (d.ativ || []).forEach(x => { if (x.tipo) tipos[x.tipo] = (tipos[x.tipo] || 0) + 1; }));
  return { min, n: dias.length, pres, tipos: Object.entries(tipos).sort((a, b) => b[1] - a[1]) };
}

/* ---------- tela ---------- */
async function pGoleiros() {
  S.gol.semana = S.gol.semana || segunda(hoje());
  const sem = S.gol.semana, fim = addDays(sem, 6), pode = podeGol();
  $('#main').innerHTML = topo('Departamento de Goleiros', 'Relatório semanal', 'Treinamento dos goleiros, dia a dia.', '') + '<div class="panel empty">Carregando…</div>';
  try { await carregarGol(sem); } catch (e) { $('#main .panel').innerHTML = esc(erroAmigavel(e)); return; }
  const R = S.gol.edit && S.gol.edit.semana === sem ? S.gol.edit : (pode ? { semana: sem, ...golRascunho(sem) } : (S.gol.rel ? { semana: sem, ...golRascunho(sem) } : null));
  if (pode) S.gol.edit = R;
  const gks = golGoleiros(), salvo = !!S.gol.rel;
  const acoes = `${salvo ? '<button class="btn" id="golpdf">Baixar PDF</button>' : ''}${pode ? '<button class="btn" id="golbib">Biblioteca</button><button class="btn" id="goltip">Tipos de atividade</button><button class="btn pri" id="golsal">Salvar relatório</button>' : ''}`;
  const cab = `<div class="weekbar"><button class="btn sm" id="golprev">◀</button><b>${fmt(sem)} a ${fmt(fim)}</b><button class="btn sm" id="golnext">▶</button><button class="btn sm" id="golhoje">Semana atual</button>
    ${salvo ? `<span class="m">salvo em ${new Date(S.gol.rel.atualizado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>` : pode ? '<span class="m">ainda não salvo · dias sugeridos pelo calendário</span>' : ''}</div>`;
  if (!R) { $('#main').innerHTML = topo('Departamento de Goleiros', 'Relatório semanal', 'Treinamento dos goleiros, dia a dia.', acoes) + cab + '<div class="panel empty">Sem relatório nesta semana.</div>'; golLigarSemana(); return; }
  const rs = golResumo(R), tipos = golTipos();
  const fotoG = a => `<div class="gol-gk">${foto(a)}<div><b>${esc(a.nome)}</b><small>${a.numero ? 'nº ' + a.numero : 'Goleiro'}${typeof situacao === 'function' && S.dm?.ok && situacao(a.id).sit !== 'Liberado' ? ' · ' + esc(situacao(a.id).sit) : ''}</small></div></div>`;
  const ativHTML = (d, x, k) => pode ? `<div class="gol-at" data-d="${d.id}" data-k="${k}">
      <div class="gol-at-h"><input class="in" data-f="nome" value="${esc(x.nome || '')}" placeholder="Atividade (ex.: 1º Trabalho de velocidade)">
        <select class="in" data-f="tipo">${opts(tipos, x.tipo || '', tipos.length ? '— tipo —' : 'defina os tipos')}</select>
        <button class="btn sm" data-act="up" title="Subir">↑</button><button class="btn sm" data-act="down" title="Descer">↓</button><button class="btn sm" data-act="bib" title="Salvar na biblioteca">☆</button><button class="btn sm dan" data-act="del" title="Remover">✕</button></div>
      <textarea class="in" data-f="desc" rows="2" placeholder="Descrição: movimentação, séries, repetições…">${esc(x.desc || '')}</textarea></div>`
    : `<tr><td><b>${esc(x.nome || '')}</b>${x.tipo ? `<br><span class="badge">${esc(x.tipo)}</span>` : ''}</td><td>${esc(x.desc || '').replace(/\n/g, '<br>')}</td></tr>`;
  const diaHTML = d => `<div class="panel gol-dia" data-d="${d.id}">
    <div class="gol-dia-h">${pode ? `<input type="date" class="in" data-df="data" value="${esc(d.data)}"><select class="in" data-df="turno">${opts(TURNOS, d.turno)}</select><label class="m">Duração total <input type="number" class="in gol-dur" data-df="dur" min="0" max="300" value="${d.dur ?? ''}"> min</label><button class="btn sm dan" data-dact="deldia">Remover dia</button>`
      : `<h3>${golDiaNome(d.data)} · ${esc(d.turno)}</h3><span class="m">${fmt(d.data)} · duração total: ${d.dur ? d.dur + ' min' : '—'}</span>`}</div>
    ${pode ? `<h4 class="gol-h4">${golDiaNome(d.data)}, ${fmt(d.data)}</h4>` : ''}
    <div class="gol-pres"><span class="m">Treinaram:</span>${gks.map(a => `<button type="button" class="chip${(d.presentes || []).includes(a.id) ? ' on' : ''}" data-pres="${a.id}"${pode ? '' : ' disabled'}>${esc(a.nome.split(' ')[0])}</button>`).join('')}</div>
    ${pode ? `<div class="gol-ats">${(d.ativ || []).map((x, k) => ativHTML(d, x, k)).join('')}</div>
      <div class="row"><button class="btn sm" data-dact="addat">+ Atividade</button>${S.gol.bib.length ? `<select class="in sm gol-bibsel" data-dact="addbib">${opts(S.gol.bib.map(b => [b.id, b.nome]), '', '+ da biblioteca…')}</select>` : ''}</div>`
      : `<table class="tb gol-tab">${(d.ativ || []).map((x, k) => ativHTML(d, x, k)).join('') || '<tr><td class="m">—</td></tr>'}</table>`}</div>`;
  $('#main').innerHTML = topo('Departamento de Goleiros', 'Relatório semanal', 'Treinamento dos goleiros, dia a dia.', acoes) + cab + `
    <div class="panel gol-cab"><div class="gol-cab-l"><img src="${LOGO}" alt=""><div><small>QFC · DEPARTAMENTO DE GOLEIROS</small><b>Relatório semanal do treinamento dos goleiros</b>
      <span>Treinador: ${pode ? `<input class="in sm" id="goltrein" value="${esc(R.treinador || '')}">` : esc(R.treinador || '—')}</span></div></div>
      <div class="gol-gks">${gks.map(fotoG).join('')}</div></div>
    <div class="cards fs-kpis"><div class="card"><div class="l">Dias de treino</div><div class="v">${rs.n}</div></div><div class="card"><div class="l">Tempo total</div><div class="v">${rs.min ? rs.min + ' min' : '—'}</div></div>
      <div class="card"><div class="l">Presença</div><div class="v gol-pv">${gks.map(a => `<span>${esc(a.nome.split(' ')[0])} <b>${rs.pres[a.id] || 0}/${rs.n}</b></span>`).join('')}</div></div>
      <div class="card"><div class="l">Mais trabalhado</div><div class="v gol-pv">${rs.tipos.length ? rs.tipos.slice(0, 3).map(([t, n]) => `<span>${esc(t)} <b>${n}</b></span>`).join('') : '<span class="m">marque o tipo das atividades</span>'}</div></div></div>
    ${R.dias.map(diaHTML).join('')}
    ${pode ? '<div class="row" style="margin-bottom:14px"><button class="btn" id="golADDdia">+ Dia de treino</button></div>' : ''}
    <div class="panel"><h2>Observações por goleiro <small class="m">curtas, opcionais</small></h2><div class="gol-obs">${gks.map(a => `<label class="f"><span>${esc(a.nome)}</span>${pode ? `<textarea class="in" rows="2" data-obs="${a.id}" placeholder="Ex.: evoluiu na queda meia altura">${esc(R.obs?.[a.id] || '')}</textarea>` : `<p>${esc(R.obs?.[a.id] || '—')}</p>`}</label>`).join('')}</div></div>
    <div class="panel"><h2>Visão geral da semana</h2>${pode ? `<textarea class="in" id="golvisao" rows="3" placeholder="Resumo do preparador sobre a semana do grupo de goleiros">${esc(R.visao || '')}</textarea>` : `<p>${esc(R.visao || '—').replace(/\n/g, '<br>')}</p>`}</div>`;
  golLigarSemana();
  if ($('#golpdf')) $('#golpdf').onclick = () => golPDF(S.gol.rel);
  if (!pode) return;
  const dia = id => R.dias.find(x => x.id === id), le = () => { // lê os campos da tela para o rascunho
    S.gol.sujo = true;
    R.treinador = $('#goltrein').value.trim(); R.visao = $('#golvisao').value;
    document.querySelectorAll('[data-obs]').forEach(t => { R.obs[t.dataset.obs] = t.value.trim(); if (!R.obs[t.dataset.obs]) delete R.obs[t.dataset.obs]; });
    document.querySelectorAll('.gol-dia').forEach(el => { const d = dia(el.dataset.d); if (!d) return;
      d.data = el.querySelector('[data-df=data]').value || d.data; d.turno = el.querySelector('[data-df=turno]').value; const v = el.querySelector('[data-df=dur]').value; d.dur = v === '' ? null : +v;
      el.querySelectorAll('.gol-at').forEach(a => { const x = d.ativ[+a.dataset.k]; ['nome', 'tipo', 'desc'].forEach(f => { x[f] = a.querySelector(`[data-f=${f}]`).value; }); }); });
    R.dias.sort((a, b) => (a.data + (a.turno === 'Manhã' ? 0 : a.turno === 'Tarde' ? 1 : 2)).localeCompare(b.data + (b.turno === 'Manhã' ? 0 : b.turno === 'Tarde' ? 1 : 2)));
  };
  const re = () => { le(); pGoleiros(); };
  S.gol.le = le; $('#main').addEventListener('input', () => { S.gol.sujo = true; });
  document.querySelectorAll('[data-pres]').forEach(b => b.onclick = () => { le(); const d = dia(b.closest('.gol-dia').dataset.d), id = +b.dataset.pres; d.presentes = d.presentes.includes(id) ? d.presentes.filter(x => x !== id) : [...d.presentes, id]; pGoleiros(); });
  document.querySelectorAll('[data-dact=addat]').forEach(b => b.onclick = () => { le(); dia(b.closest('.gol-dia').dataset.d).ativ.push({ nome: '', desc: '', tipo: '' }); pGoleiros(); });
  document.querySelectorAll('select[data-dact=addbib]').forEach(s => s.onchange = () => { le(); const it = S.gol.bib.find(x => x.id === +s.value); if (it) dia(s.closest('.gol-dia').dataset.d).ativ.push({ nome: it.nome, desc: it.descricao || '', tipo: it.tipo || '' }); pGoleiros(); });
  document.querySelectorAll('[data-dact=deldia]').forEach(b => b.onclick = () => { le(); if (!confirm('Remover este dia do relatório?')) return; R.dias = R.dias.filter(x => x.id !== b.closest('.gol-dia').dataset.d); pGoleiros(); });
  document.querySelectorAll('.gol-at [data-act]').forEach(b => b.onclick = async () => { le(); const el = b.closest('.gol-at'), d = dia(el.dataset.d), k = +el.dataset.k, a = b.dataset.act;
    if (a === 'del') d.ativ.splice(k, 1); else if (a === 'up' && k > 0) [d.ativ[k - 1], d.ativ[k]] = [d.ativ[k], d.ativ[k - 1]]; else if (a === 'down' && k < d.ativ.length - 1) [d.ativ[k + 1], d.ativ[k]] = [d.ativ[k], d.ativ[k + 1]];
    else if (a === 'bib') { const x = d.ativ[k]; if (!x.nome.trim()) return toast('Dê um nome à atividade.', true); const { data, error } = await sb.from('gol_biblioteca').insert({ nome: x.nome.trim(), descricao: x.desc || null, tipo: x.tipo || null }).select().single(); if (error) return toast(erroAmigavel(error), true); S.gol.bib.push(data); S.gol.bib.sort((p, q) => p.nome.localeCompare(q.nome, 'pt')); toast('Atividade salva na biblioteca.'); }
    pGoleiros(); });
  $('#golADDdia').onclick = () => { le(); const usados = R.dias.map(d => d.data), prox = [0, 1, 2, 3, 4, 5, 6].map(i => addDays(sem, i)).find(x => !usados.includes(x)) || sem; R.dias.push({ id: golId(), data: prox, turno: 'Tarde', dur: null, presentes: gks.map(a => a.id), ativ: [] }); pGoleiros(); };
  $('#golsal').onclick = () => golSalvar(R);
  $('#golbib').onclick = () => { le(); golBiblioteca(); };
  $('#goltip').onclick = () => { le(); golTiposForm(); };
}
function golLigarSemana() {
  const mud = n => { if (S.gol.sujo && !confirm('Trocar de semana? O que não foi salvo nesta semana será perdido.')) return; S.gol.sujo = false; S.gol.edit = null; S.gol.semana = n; pGoleiros(); };
  $('#golprev').onclick = () => mud(addDays(S.gol.semana, -7)); $('#golnext').onclick = () => mud(addDays(S.gol.semana, 7)); $('#golhoje').onclick = () => mud(segunda(hoje()));
}
async function golSalvar(R) {
  S.gol.le && S.gol.le();
  const row = { semana: R.semana, treinador: R.treinador || null, visao: R.visao || null, obs: R.obs, atualizado_em: new Date().toISOString(),
    dias: R.dias.map(d => ({ ...d, ativ: d.ativ.filter(x => (x.nome || '').trim() || (x.desc || '').trim()) })) };
  const { data, error } = await sb.from('gol_relatorios').upsert(row, { onConflict: 'semana' }).select().single(); if (error) return toast(erroAmigavel(error), true);
  if (R.treinador && R.treinador !== S.gol.cfg.treinador) { await sb.from('gol_config').upsert({ chave: 'treinador', valor: R.treinador }); S.gol.cfg.treinador = R.treinador; }
  S.gol.rel = data; S.gol.edit = null; S.gol.le = null; S.gol.sujo = false; S.golCal = {}; toast('Relatório salvo.'); pGoleiros();
}
function golTiposForm() {
  modal(`<h2>Tipos de atividade</h2><p class="m">Os tipos são do preparador de goleiros: um por linha. Servem para o resumo da semana (o que mais foi trabalhado).</p>
    <textarea class="in" id="goltl" rows="10" placeholder="Ex.:\nVelocidade\nQuedas\nJogo com os pés\nBola aérea\nChutes\nCruzamentos\nCoordenação\nPreventivo / aquecimento">${esc(golTipos().join('\n'))}</textarea>
    <div class="mfoot"><span></span><div class="row"><button class="btn" id="goltc">Cancelar</button><button class="btn pri" id="golts">Salvar</button></div></div>`);
  $('#goltc').onclick = fechar;
  $('#golts').onclick = async () => { const L = [...new Set($('#goltl').value.split('\n').map(x => x.trim()).filter(Boolean))];
    const { error } = await sb.from('gol_config').upsert({ chave: 'tipos', valor: L }); if (error) return toast(erroAmigavel(error), true); S.gol.cfg.tipos = L; fechar(); toast('Tipos salvos.'); pGoleiros(); };
}
function golBiblioteca() {
  const tipos = golTipos();
  modal(`<h2>Biblioteca de atividades</h2><p class="m">Atividades prontas para inserir nos dias com um clique (“+ da biblioteca”). Para incluir uma nova, use ☆ numa atividade do relatório ou o botão abaixo.</p>
    <div class="gol-bibl">${S.gol.bib.map(b => `<div class="gol-at" data-b="${b.id}"><div class="gol-at-h"><input class="in" data-f="nome" value="${esc(b.nome)}"><select class="in" data-f="tipo">${opts(tipos, b.tipo || '', '— tipo —')}</select><button class="btn sm dan" data-bdel="${b.id}">✕</button></div><textarea class="in" data-f="desc" rows="2">${esc(b.descricao || '')}</textarea></div>`).join('') || '<p class="empty">Biblioteca vazia.</p>'}</div>
    <div class="mfoot"><button class="btn" id="golbn">+ Nova atividade</button><div class="row"><button class="btn" id="golbc">Fechar</button><button class="btn pri" id="golbs">Salvar alterações</button></div></div>`, true);
  $('#golbc').onclick = () => { fechar(); pGoleiros(); };
  $('#golbn').onclick = async () => { const { data, error } = await sb.from('gol_biblioteca').insert({ nome: 'Nova atividade' }).select().single(); if (error) return toast(erroAmigavel(error), true); S.gol.bib.push(data); golBiblioteca(); };
  document.querySelectorAll('[data-bdel]').forEach(b => b.onclick = async () => { if (!confirm('Remover da biblioteca? (os relatórios já feitos não mudam)')) return; const { error } = await sb.from('gol_biblioteca').delete().eq('id', +b.dataset.bdel); if (error) return toast(erroAmigavel(error), true); S.gol.bib = S.gol.bib.filter(x => x.id !== +b.dataset.bdel); golBiblioteca(); });
  $('#golbs').onclick = async () => {
    for (const el of document.querySelectorAll('[data-b]')) { const id = +el.dataset.b, v = { nome: el.querySelector('[data-f=nome]').value.trim() || 'Atividade', tipo: el.querySelector('[data-f=tipo]').value || null, descricao: el.querySelector('[data-f=desc]').value || null };
      const o = S.gol.bib.find(x => x.id === id); if (o.nome === v.nome && (o.tipo || null) === v.tipo && (o.descricao || null) === v.descricao) continue;
      const { error } = await sb.from('gol_biblioteca').update(v).eq('id', id); if (error) return toast(erroAmigavel(error), true); Object.assign(o, v); }
    S.gol.bib.sort((p, q) => p.nome.localeCompare(q.nome, 'pt')); toast('Biblioteca salva.'); fechar(); pGoleiros(); };
}

/* ---------- PDF (A4 retrato, padrão do clube) ---------- */
function golPDF(r) {
  if (!r) return;
  const gks = golGoleiros(), rs = golResumo(r), sem = r.semana, fim = addDays(sem, 6);
  const per = `${parse(sem).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} a ${parse(fim).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}`.replace(/\./g, '');
  const html = `<section class="golp"><div class="golp-cab"><img src="${LOGO}" alt=""><div><small>QFC | DEPARTAMENTO DE GOLEIROS</small><h1>RELATÓRIO SEMANAL DO TREINAMENTO DOS GOLEIROS</h1><span>${esc(per)} · Treinador: ${esc(r.treinador || '—')}</span></div></div>
    <div class="golp-gks">${gks.map(a => `<div>${a.foto_url ? `<span class="golp-ft" style="background-image:url('${esc(a.foto_url)}');background-position:${a.foto_x ?? 50}% ${a.foto_y ?? 20}%"></span>` : ''}<b>${esc(a.nome)}</b><small>${rs.pres[a.id] || 0}/${rs.n} dias</small></div>`).join('')}</div>
    <div class="golp-res"><span><b>${rs.n}</b> dias de treino</span><span><b>${rs.min || '—'}</b> min no total</span>${rs.tipos.length ? `<span>Mais trabalhado: ${rs.tipos.slice(0, 4).map(([t, n]) => `${esc(t)} (${n})`).join(' · ')}</span>` : ''}</div>
    ${(r.dias || []).map(d => { const fora = gks.filter(a => !(d.presentes || []).includes(a.id));
      return `<div class="golp-dia"><h3>${golDiaNome(d.data)} · ${esc(d.turno)} <small>${fmt(d.data)} · duração total: ${d.dur ? d.dur + ' min' : '—'}${fora.length ? ` · não treinou: ${fora.map(a => esc(a.nome.split(' ')[0])).join(', ')}` : ''}</small></h3>
        <table>${(d.ativ || []).map(x => `<tr><td><b>${esc(x.nome || '')}</b>${x.tipo ? `<br><i>${esc(x.tipo)}</i>` : ''}</td><td>${esc(x.desc || '').replace(/\n/g, '<br>')}</td></tr>`).join('')}</table></div>`; }).join('')}
    ${Object.keys(r.obs || {}).length ? `<div class="golp-dia"><h3>Observações por goleiro</h3><table>${gks.filter(a => r.obs[a.id]).map(a => `<tr><td><b>${esc(a.nome)}</b></td><td>${esc(r.obs[a.id])}</td></tr>`).join('')}</table></div>` : ''}
    ${r.visao ? `<div class="golp-dia"><h3>Visão geral da semana</h3><p>${esc(r.visao).replace(/\n/g, '<br>')}</p></div>` : ''}</section>`;
  document.querySelectorAll('#print-area').forEach(x => x.remove());
  const w = document.createElement('div'); w.id = 'print-area'; w.className = 'golp-w'; w.innerHTML = html;
  const st = document.createElement('style'); st.id = 'flp-page'; st.textContent = '@page{size:A4 portrait;margin:12mm}';
  document.head.appendChild(st); document.body.appendChild(w); document.body.classList.add('imprimindo');
  const t = document.title; document.title = `Relatorio_goleiros_${sem}`;
  setTimeout(() => { window.print(); setTimeout(() => { w.remove(); st.remove(); document.body.classList.remove('imprimindo'); document.title = t; }, 500); }, 300);
}

/* ---------- menu, navegação e calendário ---------- */
function navGol() {
  const nav = $('#nav'); if (!nav || nav.querySelector('[data-p=goleiros]')) return;
  if (typeof pagPermitida === 'function' && typeof modulosPerm === 'function' && modulosPerm() && !pagPermitida('goleiros')) return;
  const n = document.createElement('button'); n.dataset.p = 'goleiros'; n.textContent = 'Departamento de Goleiros'; n.classList.toggle('on', S.page === 'goleiros');
  const ref = [...nav.querySelectorAll('button')].find(b => b.textContent.trim().startsWith('Amistosos')) || [...nav.querySelectorAll('.sec')].find(s => /Análise do advers|Administra/i.test(s.textContent));
  ref ? nav.insertBefore(n, ref) : nav.appendChild(n);
}
const _shellGol = shell;
shell = function () { _shellGol(); navGol(); };
const _irGol = ir;
ir = function (p) {
  if (p !== 'goleiros') return _irGol(p);
  if (typeof pagPermitida === 'function' && typeof modulosPerm === 'function' && modulosPerm() && !pagPermitida('goleiros')) return _irGol('inicio');
  S.page = p; document.querySelectorAll('#nav button[data-p]').forEach(b => b.classList.toggle('on', b.dataset.p === p));
  pGoleiros(); window.scrollTo(0, 0);
};
// caixinha do dia no Calendário: "🧤 Goleiros · 42'"
S.golCal = {};
async function golSeloSemana() {
  const ses = [...document.querySelectorAll('#main .week .ses[data-ses]')]; if (!ses.length || !S.semana) return;
  const sem = S.semana; if (!(sem in S.golCal)) { let r = null; try { r = await sb.from('gol_relatorios').select('dias').eq('semana', sem).maybeSingle(); } catch (e) { /* sem acesso */ } S.golCal[sem] = r?.data?.dias || []; }
  const dias = S.golCal[sem];
  document.querySelectorAll('#main .week .ses[data-ses]').forEach(el => { el.querySelector('.gol-selo')?.remove(); const s = S.sessoes.find(x => x.id === +el.dataset.ses); if (!s) return;
    const d = dias.find(x => x.data === s.data && x.turno === s.turno) || (dias.filter(x => x.data === s.data).length === 1 && S.sessoes.filter(x => x.data === s.data).length === 1 ? dias.find(x => x.data === s.data) : null);
    if (d) el.insertAdjacentHTML('beforeend', `<div class="gol-selo">🧤 Goleiros${d.dur ? ' · ' + d.dur + "'" : ''}</div>`); });
}
const _pCalendarioGol = pCalendario;
pCalendario = function () { _pCalendarioGol(); golSeloSemana(); };
if (document.getElementById('main') && S.perfil) { navGol(); if (S.page === 'goleiros') ir('goleiros'); }
