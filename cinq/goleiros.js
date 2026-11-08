/* CINQ – Departamento de Goleiros (v2).
   Um relatório por treino (data, turno, duração, quem treinou, atividades com nome/tipo/descrição,
   observação opcional por goleiro e observação geral). A página mostra os goleiros, os KPIs do período
   (semana ou mês) e a lista de treinos; o PDF junta os treinos do período.
   Escrita: Treinador de goleiros (funcao 'goleiros') e admin. Leitura: toda a comissão. */
FUNCOES.goleiros = 'Treinador de goleiros';
S.gol = { ok: false, per: 'semana', ref: null, tr: [], ult: null, bib: [], cfg: {} };
const podeGol = () => isAdmin() || S.perfil?.funcao === 'goleiros';
const golElenco = () => S.atletas.filter(a => a.ativo && a.status !== 'Inativo' && a.posicao === 'Goleiro').sort((a, b) => (a.numero ?? 99) - (b.numero ?? 99) || a.nome.localeCompare(b.nome, 'pt'));
// goleiros que treinam com o grupo sem ser do elenco profissional (Ajustes): id negativo, ficam só neste módulo
const golExtrasCfg = () => Array.isArray(S.gol.cfg.extras) ? S.gol.cfg.extras : [];
const golGoleiros = () => [...golElenco(), ...golExtrasCfg().filter(x => x.ativo !== false).map(x => ({ id: x.id, nome: x.nome, foto_url: x.foto || null, numero: null, posicao: 'Goleiro', ativo: true, extra: true }))];
const golTipos = () => Array.isArray(S.gol.cfg.tipos) ? S.gol.cfg.tipos : [];
const golTrein = () => S.gol.cfg.treinador || '';
const GOL_DS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
const GOL_DL = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
const GOL_MES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const golOrdT = t => t.data + (TURNOS.indexOf(t.turno) + 1) + String(t.id || 0).padStart(9, '0');
const golPrim = a => esc(a.nome.split(' ')[0]);

// período: semana (seg–dom) ou mês
function golFaixa() {
  const r = S.gol.ref;
  if (S.gol.per === 'mes') { const [y, m] = r.split('-').map(Number), ult = new Date(y, m, 0).getDate(); return { de: r, ate: `${r.slice(0, 8)}${String(ult).padStart(2, '0')}`, txt: `${GOL_MES[m - 1][0].toUpperCase() + GOL_MES[m - 1].slice(1)} de ${y}`, curto: `${GOL_MES[m - 1]}_${y}` }; }
  const fim = addDays(r, 6); return { de: r, ate: fim, txt: `${fmt(r)} a ${fmt(fim)}`, curto: r };
}
function golRefHoje() { const h = hoje(); return S.gol.per === 'mes' ? h.slice(0, 8) + '01' : segunda(h); }
function golMove(n) {
  if (S.gol.per === 'semana') S.gol.ref = addDays(S.gol.ref, 7 * n);
  else { const [y, m] = S.gol.ref.split('-').map(Number), d = new Date(y, m - 1 + n, 1); S.gol.ref = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; }
  pGoleiros();
}

async function carregarGol() {
  if (!S.gol.ok) {
    const [b, c] = await Promise.all([sb.from('gol_biblioteca').select('*').order('nome'), sb.from('gol_config').select('*')]);
    if (b.error) throw b.error; if (c.error) throw c.error;
    S.gol.bib = b.data; S.gol.cfg = Object.fromEntries(c.data.map(x => [x.chave, x.valor])); S.gol.ok = true;
  }
  const f = golFaixa();
  const [t, u] = await Promise.all([sb.from('gol_treinos').select('*').gte('data', f.de).lte('data', f.ate), sb.from('gol_treinos').select('*').order('data', { ascending: false }).limit(6)]);
  if (t.error) throw t.error; if (u.error) throw u.error;
  S.gol.tr = t.data.sort((a, b) => golOrdT(a).localeCompare(golOrdT(b)));
  S.gol.ult = u.data.sort((a, b) => golOrdT(b).localeCompare(golOrdT(a)))[0] || null;
}

function golStats(T, gks = golGoleiros()) {
  const n = T.length, min = T.reduce((s, t) => s + (+t.dur || 0), 0);
  const gk = Object.fromEntries(gks.map(a => { const fe = T.filter(t => (t.presentes || []).includes(a.id)); return [a.id, { n: fe.length, min: fe.reduce((s, t) => s + (+t.dur || 0), 0) }]; }));
  const tipos = {}; let nAt = 0; T.forEach(t => (t.ativ || []).forEach(x => { nAt++; if (x.tipo) tipos[x.tipo] = (tipos[x.tipo] || 0) + 1; }));
  const marc = Object.values(tipos).reduce((s, v) => s + v, 0);
  const pres = gks.length && n ? Math.round(gks.reduce((s, a) => s + gk[a.id].n, 0) / (gks.length * n) * 100) : null;
  return { n, min, media: n ? Math.round(min / n) : null, gk, pres, nAt, tipos: Object.entries(tipos).sort((a, b) => b[1] - a[1]).map(([t, v]) => [t, v, Math.round(v / marc * 100)]) };
}
// última observação de cada goleiro no período
const golObsUlt = (T, id) => { for (let i = T.length - 1; i >= 0; i--) if (T[i].obs?.[id]) return { txt: T[i].obs[id], data: T[i].data }; return null; };

/* ---------- página ---------- */
async function pGoleiros() {
  S.gol.ref = S.gol.ref || golRefHoje();
  const pode = podeGol();
  const acoes = `<button class="btn" id="golpdf">Baixar PDF</button>${pode ? '<button class="btn" id="golaj">Ajustes</button><button class="btn pri" id="goladd">+ Adicionar relatório</button>' : ''}`;
  const cabF = () => { const tr = golTrein(); return topo('Departamento de Goleiros', 'Goleiros', tr ? `Treinador de goleiros: ${tr}` : 'Treinamento dos goleiros', acoes); };
  $('#main').innerHTML = cabF() + '<div class="panel empty">Carregando…</div>';
  try { await carregarGol(); } catch (e) { $('#main .panel').innerHTML = esc(erroAmigavel(e)); return; }
  const cab = cabF();
  const f = golFaixa(), T = S.gol.tr, st = golStats(T), gks = golGoleiros(), u = S.gol.ult;
  const sit = a => !a.extra && typeof situacao === 'function' && S.dm?.ok ? situacao(a.id).sit : 'Liberado';
  const per = `<div class="gol-per"><div class="gol-seg"><button data-per="semana" class="${S.gol.per === 'semana' ? 'on' : ''}">Semana</button><button data-per="mes" class="${S.gol.per === 'mes' ? 'on' : ''}">Mês</button></div>
    <button class="btn sm" id="golprev">◀</button><b>${esc(f.txt)}</b><button class="btn sm" id="golnext">▶</button>${S.gol.ref !== golRefHoje() ? '<button class="btn sm" id="golhoje">Atual</button>' : ''}</div>`;
  const kpi = (l, v, s) => `<div class="card"><div class="l">${l}</div><div class="v">${v}</div>${s ? `<div class="s">${s}</div>` : ''}</div>`;
  const kpis = `<div class="cards gol-kpis">
    ${kpi('Treinos', st.n, S.gol.per === 'semana' ? 'nesta semana' : 'neste mês')}
    ${kpi('Minutos', st.min ? st.min + "'" : '—', st.media ? `média de ${st.media}' por treino` : '')}
    ${kpi('Último treino', u ? `${GOL_DS[parse(u.data).getDay()]} ${fmt(u.data)}` : '—', u ? `${esc(u.turno)}${u.dur ? ` · ${u.dur}'` : ''} · ${(u.presentes || []).length} goleiros` : '')}
    ${kpi('Mais trabalhado', st.tipos.length ? esc(st.tipos[0][0]) : '—', st.tipos.length ? `${st.tipos[0][2]}% das atividades${st.tipos[1] ? ` · depois ${esc(st.tipos[1][0])}` : ''}` : st.nAt ? 'marque o tipo nas atividades' : '')}</div>`;
  const gkCard = a => { const g = st.gk[a.id], o = golObsUlt(T, a.id), s = sit(a), pct = st.n ? g.n / st.n * 100 : 0;
    return `<div class="gol-k"><div class="gol-kf">${a.foto_url ? fotoFundo(a) : `<i class="fbg flk-escbg" style="background-image:url('${LOGO}')"></i>`}
      <div class="gol-kn">${a.numero ? `<em>${a.numero}</em>` : ''}<b>${esc(a.nome)}</b>${s !== 'Liberado' ? `<span class="gol-dm">${esc(s)}</span>` : ''}${a.extra ? '<span class="gol-ext">Fora do elenco profissional</span>' : ''}</div></div>
      <div class="gol-kb"><div class="gol-kl"><span>Presença</span><b>${g.n}/${st.n}</b></div><div class="gol-bar"><i style="width:${pct}%"></i></div>
      <div class="gol-kl"><span>Minutos</span><b>${g.min ? g.min + "'" : '—'}</b></div>
      ${o ? `<p class="gol-ko" title="${esc(o.txt)}">“${esc(o.txt)}” <small>${fmt(o.data)}</small></p>` : ''}</div></div>`; };
  const linha = t => { const d = parse(t.data), at = t.ativ || [];
    return `<button class="gol-tr" data-t="${t.id}"><span class="gol-dt"><small>${GOL_DS[d.getDay()]}</small><b>${String(d.getDate()).padStart(2, '0')}</b><small>${GOL_MES[d.getMonth()].slice(0, 3)}</small></span>
      <span class="gol-tm"><b>${esc(t.turno)}${t.dur ? ` · ${t.dur}'` : ''}</b><span class="gol-chs">${at.slice(0, 4).map(x => `<i>${esc(x.nome || 'Atividade')}</i>`).join('')}${at.length > 4 ? `<i class="m">+${at.length - 4}</i>` : ''}${at.length ? '' : '<i class="m">sem atividades</i>'}</span></span>
      <span class="gol-av">${gks.map(a => `<span class="${(t.presentes || []).includes(a.id) ? '' : 'fora'}" title="${esc(a.nome)}${(t.presentes || []).includes(a.id) ? '' : ' · não treinou'}">${foto(a)}</span>`).join('')}</span><span class="gol-ver">›</span></button>`; };
  $('#main').innerHTML = cab + per + kpis + `<div class="gol-ks">${gks.map(gkCard).join('') || '<div class="panel empty">Nenhum goleiro ativo no Elenco.</div>'}</div>
    <div class="panel"><h2>Treinos <small class="m">${esc(f.txt)}</small></h2>
      ${T.length ? `<div class="gol-trs">${[...T].reverse().map(linha).join('')}</div>` : `<p class="empty">Nenhum treino lançado neste período.${pode ? ' Use “+ Adicionar relatório”.' : ''}</p>`}
      ${st.tipos.length > 1 ? `<h3 class="gol-h3">Distribuição por tipo</h3><div class="gol-tps">${st.tipos.map(([t, v, p]) => `<div><span>${esc(t)}</span><div class="gol-bar"><i style="width:${p}%"></i></div><b>${p}%</b></div>`).join('')}</div>` : ''}</div>`;
  document.querySelectorAll('[data-per]').forEach(b => b.onclick = () => { S.gol.per = b.dataset.per; S.gol.ref = golRefHoje(); pGoleiros(); });
  $('#golprev').onclick = () => golMove(-1); $('#golnext').onclick = () => golMove(1); if ($('#golhoje')) $('#golhoje').onclick = () => { S.gol.ref = golRefHoje(); pGoleiros(); };
  $('#golpdf').onclick = () => T.length ? golPDFEscolher(T, f) : toast('Nenhum treino neste período.', true);
  document.querySelectorAll('.gol-tr').forEach(b => b.onclick = () => golVer(T.find(x => x.id === +b.dataset.t)));
  if (!pode) return;
  $('#goladd').onclick = () => golForm(null);
  $('#golaj').onclick = golAjustes;
}

/* ---------- ver um treino ---------- */
function golVer(t) {
  if (!t) return;
  const gks = golGoleiros(), pode = podeGol(), d = parse(t.data), fora = gks.filter(a => !(t.presentes || []).includes(a.id));
  const obs = gks.filter(a => t.obs?.[a.id]);
  modal(`<div class="gol-vh"><span class="gol-dt"><small>${GOL_DS[d.getDay()]}</small><b>${String(d.getDate()).padStart(2, '0')}</b><small>${GOL_MES[d.getMonth()].slice(0, 3)}</small></span>
      <div><h2>${GOL_DL[d.getDay()]}, ${dataBR(t.data)}</h2><p class="m">${esc(t.turno)}${t.dur ? ` · duração total ${t.dur} min` : ''} · treinaram ${(t.presentes || []).length} de ${gks.length}${fora.length ? ` (fora: ${fora.map(golPrim).join(', ')})` : ''}</p></div></div>
    <div class="gol-vats">${(t.ativ || []).map((x, i) => `<div class="gol-vat"><em>${i + 1}</em><div><b>${esc(x.nome || 'Atividade')}</b>${x.tipo ? ` <span class="badge">${esc(x.tipo)}</span>` : ''}${x.desc ? `<p>${esc(x.desc).replace(/\n/g, '<br>')}</p>` : ''}</div></div>`).join('') || '<p class="empty">Sem atividades descritas.</p>'}</div>
    ${obs.length ? `<h3 class="gol-h3">Observações por goleiro</h3><div class="gol-vobs">${obs.map(a => `<div><b>${esc(a.nome)}</b><span>${esc(t.obs[a.id])}</span></div>`).join('')}</div>` : ''}
    ${t.nota ? `<h3 class="gol-h3">Observação geral</h3><p>${esc(t.nota).replace(/\n/g, '<br>')}</p>` : ''}
    <div class="mfoot">${pode ? '<button class="btn dan" id="golvdel">Excluir</button>' : '<span></span>'}<div class="row"><button class="btn" id="golvpdf">PDF deste treino</button>${pode ? '<button class="btn" id="golved">Editar</button>' : ''}<button class="btn pri" id="golvx">Fechar</button></div></div>`, true);
  $('#golvx').onclick = fechar;
  $('#golvpdf').onclick = () => { fechar(); golPDF([t], { txt: `${GOL_DL[d.getDay()]}, ${dataBR(t.data)} · ${t.turno}`, curto: t.data, um: true }, (t.presentes || []).slice()); };
  if (!pode) return;
  $('#golved').onclick = () => golForm(t);
  $('#golvdel').onclick = async () => { if (!confirm(`Excluir o relatório do treino de ${dataBR(t.data)} (${t.turno})?`)) return;
    const { error } = await sb.from('gol_treinos').delete().eq('id', t.id); if (error) return toast(erroAmigavel(error), true);
    fechar(); S.golCal = {}; toast('Relatório excluído.'); pGoleiros(); };
}

/* ---------- adicionar / editar ---------- */
function golForm(t) {
  const gks = golGoleiros(), tipos = golTipos(), h = hoje();
  const sesHoje = S.sessoes?.find(s => s.data === h && !['Folga', 'Jogo', 'Amistoso'].includes(s.tipo));
  const F = t ? JSON.parse(JSON.stringify(t)) : { data: h, turno: sesHoje?.turno || 'Tarde', dur: null, presentes: gks.map(a => a.id), ativ: [{ nome: '', tipo: '', desc: '' }], obs: {}, nota: '' };
  F.ativ = F.ativ || []; F.obs = F.obs || {};
  const le = () => {
    F.data = $('#gfdata').value || F.data; F.turno = $('#gfturno').value; const v = $('#gfdur').value; F.dur = v === '' ? null : +v; F.nota = $('#gfnota').value.trim();
    F.presentes = [...document.querySelectorAll('[data-gp].on')].map(b => +b.dataset.gp);
    document.querySelectorAll('.gol-fat').forEach((el, k) => { ['nome', 'tipo', 'desc'].forEach(c => { F.ativ[k][c] = el.querySelector(`[data-f=${c}]`).value; }); });
    document.querySelectorAll('[data-go]').forEach(x => { const s = x.value.trim(); if (s) F.obs[x.dataset.go] = s; else delete F.obs[x.dataset.go]; });
  };
  const abreObs = Object.keys(F.obs).length > 0;
  const desenha = () => {
    modal(`<h2>${t ? 'Editar relatório do treino' : 'Novo relatório de treino'}</h2>
      <div class="gol-f3"><label class="f"><span>Data</span><input type="date" class="in" id="gfdata" value="${esc(F.data)}"></label>
        <label class="f"><span>Turno</span><select class="in" id="gfturno">${opts(TURNOS, F.turno)}</select></label>
        <label class="f"><span>Duração total (min)</span><input type="number" class="in" id="gfdur" min="0" max="400" value="${F.dur ?? ''}" placeholder="ex.: 60"></label></div>
      <div class="f"><span>Quem treinou</span><div class="gol-fp">${gks.map(a => `<button type="button" class="gol-pc${F.presentes.includes(a.id) ? ' on' : ''}" data-gp="${a.id}">${foto(a)}${golPrim(a)}</button>`).join('')}</div></div>
      <h3 class="gol-h3">Atividades</h3>
      <div id="gfats">${F.ativ.map((x, k) => `<div class="gol-fat"><div class="gol-fah"><em>${k + 1}</em><input class="in" data-f="nome" value="${esc(x.nome || '')}" placeholder="Nome da atividade (ex.: Trabalho de velocidade)">
        <select class="in" data-f="tipo">${opts(tipos, x.tipo || '', tipos.length ? 'Tipo' : 'Tipo (defina em Ajustes)')}</select>
        <button type="button" class="btn sm" data-fa="up" data-k="${k}" title="Subir">↑</button><button type="button" class="btn sm" data-fa="bib" data-k="${k}" title="Guardar na biblioteca">☆</button><button type="button" class="btn sm dan" data-fa="del" data-k="${k}" title="Remover">✕</button></div>
        <textarea class="in" data-f="desc" rows="3" placeholder="Descrição: movimentação, séries, repetições, observações da atividade…">${esc(x.desc || '')}</textarea></div>`).join('')}</div>
      <div class="row"><button type="button" class="btn sm" id="gfadd">+ Atividade</button>${S.gol.bib.length ? `<select class="in sm gol-bibsel" id="gfbib">${opts(S.gol.bib.map(b => [b.id, b.nome]), '', '+ da biblioteca…')}</select>` : ''}</div>
      <details class="gol-fobs"${abreObs ? ' open' : ''}><summary>Observação por goleiro <small class="m">(opcional)</small></summary>
        ${gks.map(a => `<label class="f"><span>${esc(a.nome)}</span><input class="in" data-go="${a.id}" value="${esc(F.obs[a.id] || '')}" placeholder="Ex.: evoluiu na queda meia altura"></label>`).join('')}</details>
      <label class="f"><span>Observação geral <small class="m">(opcional)</small></span><textarea class="in" id="gfnota" rows="2">${esc(F.nota || '')}</textarea></label>
      <div class="mfoot"><span></span><div class="row"><button class="btn" id="gfc">Cancelar</button><button class="btn pri" id="gfs">Salvar relatório</button></div></div>`, true);
    document.querySelectorAll('[data-gp]').forEach(b => b.onclick = () => b.classList.toggle('on'));
    $('#gfadd').onclick = () => { le(); F.ativ.push({ nome: '', tipo: '', desc: '' }); desenha(); };
    if ($('#gfbib')) $('#gfbib').onchange = () => { le(); const it = S.gol.bib.find(x => x.id === +$('#gfbib').value); if (it) { if (F.ativ.length === 1 && !F.ativ[0].nome && !F.ativ[0].desc) F.ativ = []; F.ativ.push({ nome: it.nome, tipo: it.tipo || '', desc: it.descricao || '' }); } desenha(); };
    document.querySelectorAll('[data-fa]').forEach(b => b.onclick = async () => { le(); const k = +b.dataset.k, a = b.dataset.fa;
      if (a === 'del') F.ativ.splice(k, 1); else if (a === 'up' && k > 0) [F.ativ[k - 1], F.ativ[k]] = [F.ativ[k], F.ativ[k - 1]];
      else if (a === 'bib') { const x = F.ativ[k]; if (!x.nome.trim()) return toast('Dê um nome à atividade.', true);
        const { data, error } = await sb.from('gol_biblioteca').insert({ nome: x.nome.trim(), descricao: x.desc || null, tipo: x.tipo || null }).select().single(); if (error) return toast(erroAmigavel(error), true);
        S.gol.bib.push(data); S.gol.bib.sort((p, q) => p.nome.localeCompare(q.nome, 'pt')); toast('Guardada na biblioteca.'); }
      desenha(); });
    $('#gfc').onclick = () => t ? golVer(t) : fechar();
    $('#gfs').onclick = async () => { le();
      if (!F.data) return toast('Informe a data.', true);
      const row = { data: F.data, turno: F.turno, dur: F.dur, presentes: F.presentes, obs: F.obs, nota: F.nota || null, atualizado_em: new Date().toISOString(),
        ativ: F.ativ.map(x => ({ nome: (x.nome || '').trim(), tipo: x.tipo || '', desc: (x.desc || '').trim() })).filter(x => x.nome || x.desc) };
      const q = t ? sb.from('gol_treinos').update(row).eq('id', t.id) : sb.from('gol_treinos').insert(row);
      const { error } = await q; if (error) return toast(erroAmigavel(error), true);
      fechar(); S.golCal = {}; toast('Relatório salvo.');
      // mostra o período do treino salvo
      S.gol.ref = S.gol.per === 'mes' ? F.data.slice(0, 8) + '01' : segunda(F.data); pGoleiros(); };
  };
  desenha();
}

/* ---------- ajustes: treinador, goleiros fora do elenco, tipos e biblioteca ---------- */
// reduz a foto para um quadrado de 320 px (fica guardada junto do ajuste)
function golFotoArq(file) {
  return new Promise((ok, no) => { const im = new Image(); im.onload = () => { const l = Math.min(im.width, im.height), c = document.createElement('canvas'); c.width = c.height = 320;
    c.getContext('2d').drawImage(im, (im.width - l) / 2, Math.max(0, (im.height - l) / 2 - (im.height - l) * .2), l, l, 0, 0, 320, 320); URL.revokeObjectURL(im.src); ok(c.toDataURL('image/jpeg', .82)); };
    im.onerror = no; im.src = URL.createObjectURL(file); });
}
function golAjustes() {
  const E = JSON.parse(JSON.stringify(golExtrasCfg()));
  const desenha = () => {
    const tr = $('#gatr') ? $('#gatr').value : golTrein(), ti = $('#gati') ? $('#gati').value : golTipos().join('\n');
    modal(`<h2>Ajustes do Departamento de Goleiros</h2>
    <label class="f"><span>Treinador de goleiros</span><input class="in" id="gatr" value="${esc(tr)}"></label>
    <div class="f"><span>Goleiros fora do elenco profissional <small class="m">treinam com o grupo; aparecem só neste módulo</small></span>
      <div class="gol-exs">${E.map((x, k) => `<div class="gol-ex"><label class="gol-exf" title="Trocar foto">${x.foto ? `<img src="${esc(x.foto)}" alt="">` : `<span>${esc(iniciais(x.nome || '?'))}</span>`}<input type="file" accept="image/*" data-exf="${k}" hidden></label>
        <input class="in" data-exn="${k}" value="${esc(x.nome || '')}" placeholder="Nome"><label class="m gol-exa"><input type="checkbox" data-exa="${k}"${x.ativo !== false ? ' checked' : ''}> treinando</label><button type="button" class="btn sm dan" data-exd="${k}" title="Remover">✕</button></div>`).join('') || '<p class="m">Nenhum.</p>'}</div>
      <button type="button" class="btn sm" id="gaexn">+ Goleiro fora do elenco</button></div>
    <label class="f"><span>Tipos de atividade <small class="m">um por linha · alimentam o “mais trabalhado” e a distribuição</small></span>
      <textarea class="in" id="gati" rows="7" placeholder="Ex.:\nVelocidade\nQuedas\nJogo com os pés\nBola aérea\nPreventivo / aquecimento">${esc(ti)}</textarea></label>
    <div class="mfoot"><button class="btn" id="gabib">Biblioteca de atividades (${S.gol.bib.length})</button><div class="row"><button class="btn" id="gac">Cancelar</button><button class="btn pri" id="gas">Salvar</button></div></div>`);
    const le = () => document.querySelectorAll('[data-exn]').forEach(i => { const k = +i.dataset.exn; E[k].nome = i.value.trim(); E[k].ativo = document.querySelector(`[data-exa="${k}"]`).checked; });
    $('#gaexn').onclick = () => { le(); const id = -1 - Math.max(0, ...E.map(x => -x.id)); E.push({ id, nome: '', foto: null, ativo: true }); desenha(); };
    document.querySelectorAll('[data-exd]').forEach(b => b.onclick = () => { le(); const k = +b.dataset.exd; if (!confirm(`Remover ${E[k].nome || 'este goleiro'}? Ele deixa de aparecer nos relatórios (para só esconder, desmarque “treinando”).`)) return; E.splice(k, 1); desenha(); });
    document.querySelectorAll('[data-exf]').forEach(i => i.onchange = async () => { le(); const f = i.files[0]; if (!f) return; try { E[+i.dataset.exf].foto = await golFotoArq(f); } catch (e) { return toast('Não consegui ler a imagem.', true); } desenha(); });
    $('#gac').onclick = fechar;
    $('#gabib').onclick = golBiblioteca;
    $('#gas').onclick = async () => { le();
      if (E.some(x => !x.nome)) return toast('Dê um nome a cada goleiro fora do elenco.', true);
      const L = [...new Set($('#gati').value.split('\n').map(x => x.trim()).filter(Boolean))], t = $('#gatr').value.trim();
      const { error } = await sb.from('gol_config').upsert([{ chave: 'tipos', valor: L }, { chave: 'treinador', valor: t }, { chave: 'extras', valor: E }]); if (error) return toast(erroAmigavel(error), true);
      S.gol.cfg.tipos = L; S.gol.cfg.treinador = t; S.gol.cfg.extras = E; fechar(); toast('Ajustes salvos.'); pGoleiros(); };
  };
  desenha();
}
function golBiblioteca() {
  const tipos = golTipos();
  modal(`<h2>Biblioteca de atividades</h2><p class="m">Atividades que se repetem, para inserir no relatório com “+ da biblioteca”. Também dá para guardar com ☆ dentro do relatório.</p>
    <div>${S.gol.bib.map(b => `<div class="gol-fat" data-b="${b.id}"><div class="gol-fah"><input class="in" data-f="nome" value="${esc(b.nome)}"><select class="in" data-f="tipo">${opts(tipos, b.tipo || '', 'Tipo')}</select><button class="btn sm dan" data-bdel="${b.id}">✕</button></div><textarea class="in" data-f="desc" rows="2">${esc(b.descricao || '')}</textarea></div>`).join('') || '<p class="empty">Biblioteca vazia.</p>'}</div>
    <div class="mfoot"><button class="btn" id="golbn">+ Nova atividade</button><div class="row"><button class="btn" id="golbc">Fechar</button><button class="btn pri" id="golbs">Salvar alterações</button></div></div>`, true);
  $('#golbc').onclick = fechar;
  $('#golbn').onclick = async () => { const { data, error } = await sb.from('gol_biblioteca').insert({ nome: 'Nova atividade' }).select().single(); if (error) return toast(erroAmigavel(error), true); S.gol.bib.push(data); golBiblioteca(); };
  document.querySelectorAll('[data-bdel]').forEach(b => b.onclick = async () => { if (!confirm('Remover da biblioteca? (os relatórios já feitos não mudam)')) return; const { error } = await sb.from('gol_biblioteca').delete().eq('id', +b.dataset.bdel); if (error) return toast(erroAmigavel(error), true); S.gol.bib = S.gol.bib.filter(x => x.id !== +b.dataset.bdel); golBiblioteca(); });
  $('#golbs').onclick = async () => {
    for (const el of document.querySelectorAll('[data-b]')) { const id = +el.dataset.b, v = { nome: el.querySelector('[data-f=nome]').value.trim() || 'Atividade', tipo: el.querySelector('[data-f=tipo]').value || null, descricao: el.querySelector('[data-f=desc]').value || null };
      const o = S.gol.bib.find(x => x.id === id); if (o.nome === v.nome && (o.tipo || null) === v.tipo && (o.descricao || null) === v.descricao) continue;
      const { error } = await sb.from('gol_biblioteca').update(v).eq('id', id); if (error) return toast(erroAmigavel(error), true); Object.assign(o, v); }
    S.gol.bib.sort((p, q) => p.nome.localeCompare(q.nome, 'pt')); toast('Biblioteca salva.'); fechar(); };
}

/* ---------- PDF (A4 retrato) ---------- */
// escolhe quem aparece no PDF: já vêm marcados só os goleiros que treinaram no período
function golPDFEscolher(T, f) {
  const gks = golGoleiros(), st = golStats(T, gks);
  modal(`<h2>Goleiros no PDF</h2><p class="m">${esc(f.txt)} · marcados os que treinaram no período. Quem ficar desmarcado não aparece no relatório.</p>
    <div class="gol-fp">${gks.map(a => `<button type="button" class="gol-pc${st.gk[a.id].n ? ' on' : ''}" data-gs="${a.id}">${foto(a)}${golPrim(a)} <small class="m">${st.gk[a.id].n}/${st.n}</small></button>`).join('')}</div>
    <div class="mfoot"><span></span><div class="row"><button class="btn" id="gsc">Cancelar</button><button class="btn pri" id="gsp">Gerar PDF</button></div></div>`);
  document.querySelectorAll('[data-gs]').forEach(b => b.onclick = () => b.classList.toggle('on'));
  $('#gsc').onclick = fechar;
  $('#gsp').onclick = () => { const sel = [...document.querySelectorAll('[data-gs].on')].map(b => +b.dataset.gs); if (!sel.length) return toast('Escolha ao menos um goleiro.', true); fechar(); golPDF(T, f, sel); };
}
function golPDF(T, f, sel) {
  if (!T.length) return;
  const gks = golGoleiros().filter(a => !sel || sel.includes(a.id)), st = golStats(T, gks), tr = golTrein();
  const ftG = a => a.foto_url ? `<span class="golp-ft">${fotoFundo(a)}</span>` : `<span class="golp-ft golp-ini">${esc(iniciais(a.nome))}</span>`;
  const box = (v, l) => `<div><b>${v}</b><span>${l}</span></div>`;
  const treino = t => { const d = parse(t.data), fora = gks.filter(a => !(t.presentes || []).includes(a.id)), obs = gks.filter(a => t.obs?.[a.id]);
    return `<div class="golp-t"><div class="golp-td"><small>${GOL_DS[d.getDay()]}</small><b>${fmt(t.data)}</b><span>${esc(t.turno)}</span>${t.dur ? `<em>${t.dur}'</em>` : ''}</div>
      <div class="golp-tc">${(t.ativ || []).map((x, i) => `<div class="golp-a"><i>${i + 1}</i><div><b>${esc(x.nome || 'Atividade')}</b>${x.tipo ? `<u>${esc(x.tipo)}</u>` : ''}${x.desc ? `<p>${esc(x.desc).replace(/\n/g, '<br>')}</p>` : ''}</div></div>`).join('') || '<p class="golp-m">Sem atividades descritas.</p>'}
        <div class="golp-tf">${fora.length ? `<span>Não treinou: <b>${fora.map(golPrim).join(', ')}</b></span>` : `<span>Treinaram os ${gks.length} goleiros</span>`}${obs.map(a => `<span><b>${golPrim(a)}:</b> ${esc(t.obs[a.id])}</span>`).join('')}${t.nota ? `<span><b>Obs.:</b> ${esc(t.nota)}</span>` : ''}</div></div></div>`; };
  const html = `<section class="golp">
    <div class="golp-cab"><img src="${LOGO}" alt=""><div class="golp-ct"><small>QFC · DEPARTAMENTO DE GOLEIROS</small><h1>Relatório de treinamento</h1></div>
      <div class="golp-cp"><b>${esc(f.um ? f.txt : (S.gol.per === 'mes' ? f.txt : 'Semana ' + f.txt))}</b>${tr ? `<span>Treinador de goleiros: ${esc(tr)}</span>` : ''}</div></div>
    ${f.um ? '' : `<div class="golp-k">${box(st.n, 'treinos')}${box(st.min ? st.min + "'" : '—', 'minutos no total')}${box(st.media ? st.media + "'" : '—', 'média por treino')}${box(st.pres != null ? st.pres + '%' : '—', 'presença média')}</div>`}
    <div class="golp-g" style="grid-template-columns:repeat(${Math.min(5, Math.max(gks.length, 3))},1fr)">${gks.map(a => { const g = st.gk[a.id]; return `<div>${ftG(a)}<b>${esc(a.nome)}</b><small>${g.n}/${st.n} treinos${g.min ? ` · ${g.min}'` : ''}</small></div>`; }).join('')}</div>
    ${!f.um && st.tipos.length ? `<div class="golp-tp"><h2>Distribuição por tipo de atividade</h2>${st.tipos.map(([t, v, p]) => `<div><span>${esc(t)}</span><i><s style="width:${p}%"></s></i><b>${p}%</b></div>`).join('')}</div>` : ''}
    <h2 class="golp-h2">${f.um ? 'Treino' : 'Treinos do período'}</h2>${T.map(treino).join('')}
    <div class="golp-rod">CINQ · Centro de Inteligência do QFC · gerado em ${new Date().toLocaleDateString('pt-BR')}</div></section>`;
  document.querySelectorAll('#print-area').forEach(x => x.remove());
  const w = document.createElement('div'); w.id = 'print-area'; w.className = 'golp-w'; w.innerHTML = html;
  const stl = document.createElement('style'); stl.id = 'flp-page'; stl.textContent = '@page{size:A4 portrait;margin:10mm}';
  document.head.appendChild(stl); document.body.appendChild(w); document.body.classList.add('imprimindo');
  const tt = document.title; document.title = `Relatorio_goleiros_${f.curto}`;
  setTimeout(() => { window.print(); setTimeout(() => { w.remove(); stl.remove(); document.body.classList.remove('imprimindo'); document.title = tt; }, 500); }, 400);
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
  const sem = S.semana; if (!(sem in S.golCal)) { let r = null; try { r = await sb.from('gol_treinos').select('data,turno,dur').gte('data', sem).lte('data', addDays(sem, 6)); } catch (e) { /* sem acesso */ } S.golCal[sem] = r?.data || []; }
  const dias = S.golCal[sem];
  document.querySelectorAll('#main .week .ses[data-ses]').forEach(el => { el.querySelector('.gol-selo')?.remove(); const s = S.sessoes.find(x => x.id === +el.dataset.ses); if (!s) return;
    const d = dias.find(x => x.data === s.data && x.turno === s.turno) || (dias.filter(x => x.data === s.data).length === 1 && S.sessoes.filter(x => x.data === s.data).length === 1 ? dias.find(x => x.data === s.data) : null);
    if (d) el.insertAdjacentHTML('beforeend', `<div class="gol-selo">🧤 Goleiros${d.dur ? ' · ' + d.dur + "'" : ''}</div>`); });
}
const _pCalendarioGol = pCalendario;
pCalendario = function () { _pCalendarioGol(); golSeloSemana(); };
if (document.getElementById('main') && S.perfil) { navGol(); if (S.page === 'goleiros') ir('goleiros'); }
