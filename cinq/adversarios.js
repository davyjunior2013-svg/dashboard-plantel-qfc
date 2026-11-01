/* CINQ · Análise do adversário — controle de escalação
   Súmulas (PDF da federação) → jogos, escalações, substituições, gols e cartões dos dois clubes.
   Telas: Súmulas (envio e lista) e Escalações (página de cada clube com KPIs). O lado do QFC fica guardado à parte. */
'use strict';

S.adv = { ok: false, clubes: [], atletas: {}, jogos: [], esc: [], ev: [], clube: null, comp: null, aba: 'escalacoes' };
const POS_ADV = ['GOL', 'LD', 'ZAG', 'LE', 'VOL', 'MEI', 'PD', 'PE', 'ATA'];
const FASES_ADV = ['1ª fase', '2ª fase', 'Quartas de final', 'Semifinal', 'Final', 'Outra'];
const LIMITE_AMARELOS = 3; // suspensão automática a cada 3 amarelos (confirmar no regulamento)
const ADV_LS = 'cinq.adv.';
const advGet = k => { try { return localStorage.getItem(ADV_LS + k); } catch (e) { return null; } };
const advSet = (k, v) => { try { localStorage.setItem(ADV_LS + k, v); } catch (e) { /* sem armazenamento */ } };
const podeAdv = () => isAdmin() || ['tecnico', 'analise'].includes(S.perfil?.funcao);

/* ---------- dados ---------- */
async function advTodos(tabela, ordem) {
  const out = [];
  for (let i = 0; ; i += 1000) {
    let q = sb.from(tabela).select('*').range(i, i + 999);
    if (ordem) q = q.order(ordem);
    const { data, error } = await q;
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) return out;
  }
}
async function carregarAdv(forcar) {
  if (S.adv.ok && !forcar) return;
  const [cl, at, jg, es, ev] = await Promise.all([advTodos('adv_clubes', 'id'), advTodos('adv_atletas', 'id'), advTodos('adv_jogos', 'id'), advTodos('adv_escalacoes', 'jogo_id'), advTodos('adv_eventos', 'id')]);
  S.adv.clubes = cl; S.adv.atletas = Object.fromEntries(at.map(a => [a.id, a]));
  S.adv.jogos = jg.sort((a, b) => String(a.data).localeCompare(String(b.data)) || a.jogo_num - b.jogo_num);
  S.adv.esc = es; S.adv.ev = ev; S.adv.ok = true;
  S.adv.escJ = {}; es.forEach(e => (S.adv.escJ[e.jogo_id] = S.adv.escJ[e.jogo_id] || []).push(e));
  S.adv.evJ = {}; ev.forEach(e => (S.adv.evJ[e.jogo_id] = S.adv.evJ[e.jogo_id] || []).push(e));
}
const clubeAdv = id => S.adv.clubes.find(c => c.id === id);
const nomeClube = id => clubeAdv(id)?.nome || '?';
const atl = id => S.adv.atletas[id] || {};
const nomeAtl = id => atl(id).apelido || atl(id).nome || '?';
const competicoes = () => [...new Set(S.adv.jogos.map(j => j.competicao))];
const minTxt = e => e.tempo === 'INT' ? 'Int.' : sumMinTxt(e.tempo, e.minuto);
const faseTxt = j => `${j.fase}${j.rodada ? ' · R' + j.rodada : ''}`;
const posIdx = a => { const i = POS_ADV.indexOf(atl(a.atleta_id).posicao); return i < 0 ? 50 : i; };
const ordXI = (a, b) => posIdx(a) - posIdx(b) || (a.ordem || 0) - (b.ordem || 0);

/* ---------- análise de um clube ---------- */
function analisarClubeAdv(cid, comp) {
  const jogos = S.adv.jogos.filter(j => (j.mandante_id === cid || j.visitante_id === cid) && (!comp || j.competicao === comp));
  const P = {}; // atletas
  const pa = id => (P[id] = P[id] || { id, jogos: 0, tit: 0, min: 0, gols: 0, ca: 0, cv: 0, num: {}, cel: {}, saiuX: [], entrouX: [], suspenso: false, amarelosAcum: 0 });
  const J = [];
  let prevXI = null, tecAnt = null;
  jogos.forEach(g => {
    const casa = g.mandante_id === cid, adv = casa ? g.visitante_id : g.mandante_id;
    const gp = casa ? g.gols_m : g.gols_v, gc = casa ? g.gols_v : g.gols_m;
    const esc = (S.adv.escJ[g.id] || []).filter(e => e.clube_id === cid);
    const evs = S.adv.evJ[g.id] || [];
    const xi = esc.filter(e => e.titular).sort(ordXI);
    const xiIds = new Set(xi.map(e => e.atleta_id));
    const novos = prevXI ? xi.filter(e => !prevXI.has(e.atleta_id)).map(e => e.atleta_id) : [];
    const sairam = prevXI ? [...prevXI].filter(id => !xiIds.has(id)) : [];
    const subs = evs.filter(e => e.tipo === 'sub' && e.clube_id === cid).sort((a, b) => a.minuto_abs - b.minuto_abs);
    const golsPro = evs.filter(e => e.tipo === 'gol' && (e.detalhe === 'CT' ? e.clube_id !== cid : e.clube_id === cid));
    const golsContra = evs.filter(e => e.tipo === 'gol' && (e.detalhe === 'CT' ? e.clube_id === cid : e.clube_id !== cid));
    const cart = evs.filter(e => (e.tipo === 'amarelo' || e.tipo === 'vermelho') && e.clube_id === cid);
    const tec = casa ? g.tecnico_m : g.tecnico_v;
    // suspensos para este jogo (vindos do anterior)
    const suspensosAqui = Object.values(P).filter(p => p.suspenso).map(p => p.id);
    Object.values(P).forEach(p => { p.suspenso = false; });
    esc.forEach(e => {
      const p = pa(e.atleta_id); p.jogos++; if (e.titular) p.tit++; p.min += e.minutos || 0; p.num[e.numero] = (p.num[e.numero] || 0) + 1;
      p.cel[g.id] = { tit: e.titular, min: e.minutos || 0, entrou: e.entrou, saiu: e.saiu };
      if (e.titular && e.saiu != null && e.saiu < 90) p.saiuX.push(e.saiu);
      if (!e.titular && e.entrou != null) p.entrouX.push(e.entrou);
    });
    golsPro.filter(e => e.detalhe !== 'CT' && e.atleta_id).forEach(e => pa(e.atleta_id).gols++);
    cart.filter(e => e.atleta_id).forEach(e => {
      const p = pa(e.atleta_id);
      if (e.tipo === 'amarelo') { p.ca++; p.amarelosAcum++; if (p.amarelosAcum % LIMITE_AMARELOS === 0) p.suspenso = true; }
      else { p.cv++; p.suspenso = true; }
    });
    J.push({ g, casa, adv, gp, gc, res: gp > gc ? 'V' : gp < gc ? 'D' : 'E', xi, novos, sairam, subs, golsPro, golsContra, cart, tec,
      tecMudou: tecAnt && tec && tec !== tecAnt ? tecAnt : null, suspensosAqui,
      banco: esc.filter(e => !e.titular).sort((a, b) => (a.entrou ?? 999) - (b.entrou ?? 999) || a.numero - b.numero) });
    prevXI = xiIds; tecAnt = tec || tecAnt;
  });
  const n = J.length;
  const mud = J.slice(1).map(j => j.novos.length);
  const prim = J.map(j => j.subs[0]).filter(Boolean);
  const nucleo = n ? Object.values(P).filter(p => p.tit / n >= 0.8 && n >= 2) : [];
  const atletas = Object.values(P);
  return {
    J, n, atletas, nucleo,
    v: J.filter(j => j.res === 'V').length, e: J.filter(j => j.res === 'E').length, d: J.filter(j => j.res === 'D').length,
    gp: J.reduce((s, j) => s + (j.gp || 0), 0), gc: J.reduce((s, j) => s + (j.gc || 0), 0),
    mudMedia: mud.length ? mud.reduce((a, b) => a + b, 0) / mud.length : null, mudUlt: n > 1 ? J[n - 1].novos.length : null,
    primSub: prim.length ? prim.reduce((s, e) => s + e.minuto_abs, 0) / prim.length : null,
    subsInt: J.reduce((s, j) => s + j.subs.filter(e => e.tempo === 'INT').length, 0),
    subsMedia: n ? J.reduce((s, j) => s + j.subs.length, 0) / n : null,
    amarelos: J.reduce((s, j) => s + j.cart.filter(e => e.tipo === 'amarelo' && e.atleta_id).length, 0),
    vermelhos: J.reduce((s, j) => s + j.cart.filter(e => e.tipo === 'vermelho' && e.atleta_id).length, 0),
    pendurados: atletas.filter(p => !p.suspenso && p.amarelosAcum % LIMITE_AMARELOS === LIMITE_AMARELOS - 1),
    suspensos: atletas.filter(p => p.suspenso),
    tecnico: J[n - 1]?.tec || null
  };
}

/* ---------- navegação ---------- */
function navAdv() {
  const nav = document.getElementById('nav'); if (!nav || nav.querySelector('[data-p=adversarios]')) return;
  const box = document.createElement('div'); box.style.display = 'contents';
  box.innerHTML = '<div class="sec">Análise do adversário</div><button data-p="adversarios">Escalações</button><button data-p="sumulas">Súmulas</button>';
  const adm = [...nav.querySelectorAll('.sec')].find(s => /Administra/.test(s.textContent));
  adm ? nav.insertBefore(box, adm) : nav.appendChild(box);
  nav.querySelectorAll('[data-p=adversarios],[data-p=sumulas]').forEach(b => b.classList.toggle('on', b.dataset.p === S.page));
}
const _shellAdv = shell;
shell = function () { _shellAdv(); navAdv(); };
const _irAdv = ir;
ir = function (p) {
  if (p !== 'adversarios' && p !== 'sumulas') return _irAdv(p);
  S.page = p;
  document.querySelectorAll('#nav button[data-p]').forEach(b => b.classList.toggle('on', b.dataset.p === p));
  (p === 'sumulas' ? pSumulas : pAdversarios)(); window.scrollTo(0, 0);
};

/* ---------- tela Súmulas ---------- */
async function pSumulas() {
  $('#main').innerHTML = topo('Análise do adversário', 'Súmulas', 'Envie as súmulas da federação em PDF. Cada jogo alimenta os dois clubes automaticamente.',
    podeAdv() ? '<button class="btn pri" id="senv">+ Enviar súmulas</button>' : '') + '<div class="panel empty">Carregando…</div>';
  if ($('#senv')) $('#senv').onclick = escolherSumulas;
  try { await carregarAdv(); } catch (e) { return toast(erroAmigavel(e), true); }
  if (S.page !== 'sumulas') return;
  const comps = competicoes();
  if (!S.adv.comp || !comps.includes(S.adv.comp)) S.adv.comp = comps[comps.length - 1] || null;
  const jogos = S.adv.jogos.filter(j => j.competicao === S.adv.comp);
  const grupos = {};
  jogos.forEach(j => { const k = j.fase; (grupos[k] = grupos[k] || []).push(j); });
  const ordemFase = f => { const i = FASES_ADV.indexOf(f); return i < 0 ? 99 : i; };
  const pode = podeAdv();
  const clubes = S.adv.clubes.map(c => ({ c, n: S.adv.jogos.filter(j => j.mandante_id === c.id || j.visitante_id === c.id).length })).sort((a, b) => a.c.nome.localeCompare(b.c.nome));
  const corpo = !S.adv.jogos.length ? `<div class="panel ind-vazio"><b>Nenhuma súmula lançada ainda.</b><span>Baixe as súmulas no site da federação e envie aqui (pode ser a rodada inteira de uma vez). O CINQ lê o PDF, monta a escalação, as substituições, os gols e os cartões dos dois clubes e mostra tudo para você conferir antes de salvar.</span>${pode ? '<button class="btn pri" id="senv2">+ Enviar súmulas</button>' : ''}</div>`
    : `${comps.length > 1 ? `<div class="filters"><select class="in" id="scomp">${opts(comps, S.adv.comp)}</select></div>` : `<p class="m adv-comp">${esc(S.adv.comp)}</p>`}
    <div class="adv-sgrid">
      <div>${Object.keys(grupos).sort((a, b) => ordemFase(a) - ordemFase(b)).map(f => `<div class="panel"><h2>${esc(f)}</h2>
        <div class="tablewrap"><table class="tb adv-jogos"><thead><tr><th>Rod.</th><th>Jogo</th><th>Data</th><th class="r">Mandante</th><th></th><th>Visitante</th><th></th></tr></thead><tbody>
        ${grupos[f].sort((a, b) => (a.rodada || 0) - (b.rodada || 0) || String(a.data).localeCompare(String(b.data))).map(j => `<tr>
          <td>${j.rodada ?? '—'}</td><td class="m">nº ${j.jogo_num}</td><td>${j.data ? dataBR(j.data) : '—'}</td>
          <td class="r"><b>${esc(nomeClube(j.mandante_id))}</b></td><td class="placar">${j.gols_m ?? '-'} x ${j.gols_v ?? '-'}</td><td><b>${esc(nomeClube(j.visitante_id))}</b></td>
          <td class="acoes">${j.arquivo_path ? `<a class="btn sm" data-pdf="${esc(j.arquivo_path)}" target="_blank" rel="noopener">PDF</a>` : ''}${pode ? `<button class="btn sm dan" data-del="${j.id}">Excluir</button>` : ''}</td></tr>`).join('')}
        </tbody></table></div></div>`).join('')}</div>
      <div class="panel"><h2>Clubes</h2><p class="m" style="margin-top:-8px">Nome curto usado nas telas. ${pode ? 'Clique para editar.' : ''}</p>
        ${clubes.map(({ c, n }) => `<div class="adv-clube"><span>${pode ? `<button class="lnk" data-cl="${c.id}">${esc(c.nome)}</button>` : esc(c.nome)}${c.qfc ? ' <span class="badge t-Treino">QFC</span>' : ''}<small>${esc(c.nome_sumula)}</small></span><b>${n} ${n === 1 ? 'jogo' : 'jogos'}</b></div>`).join('')}
      </div>
    </div>`;
  $('#main').innerHTML = topo('Análise do adversário', 'Súmulas', 'Envie as súmulas da federação em PDF. Cada jogo alimenta os dois clubes automaticamente.',
    pode ? '<button class="btn pri" id="senv">+ Enviar súmulas</button>' : '') + corpo;
  if ($('#senv')) $('#senv').onclick = escolherSumulas;
  if ($('#senv2')) $('#senv2').onclick = escolherSumulas;
  if ($('#scomp')) $('#scomp').onchange = e => { S.adv.comp = e.target.value; pSumulas(); };
  const pdfs = [...document.querySelectorAll('[data-pdf]')];
  if (pdfs.length) urlsAssinadas(pdfs.map(a => a.dataset.pdf)).then(u => pdfs.forEach(a => { if (u[a.dataset.pdf]) a.href = u[a.dataset.pdf]; }));
  document.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    const j = S.adv.jogos.find(x => x.id === +b.dataset.del);
    if (!confirm(`Excluir o jogo nº ${j.jogo_num} (${nomeClube(j.mandante_id)} ${j.gols_m}x${j.gols_v} ${nomeClube(j.visitante_id)})? Escalações, gols, cartões e substituições desse jogo saem dos dois clubes.`)) return;
    const { error } = await sb.from('adv_jogos').delete().eq('id', j.id);
    if (error) return toast(erroAmigavel(error), true);
    if (j.arquivo_path) sb.storage.from('planos').remove([j.arquivo_path]);
    toast('Jogo excluído.'); await carregarAdv(true); pSumulas();
  });
  document.querySelectorAll('[data-cl]').forEach(b => b.onclick = () => {
    const c = clubeAdv(+b.dataset.cl);
    modal(`<h2>Clube</h2><form id="fcl"><label class="f"><span>Nome curto *</span><input class="in" name="nome" value="${esc(c.nome)}" required></label>
      <p class="m">Na súmula: ${esc(c.nome_sumula)}</p>
      <label class="f chk"><input type="checkbox" name="qfc" ${c.qfc ? 'checked' : ''}> É o QFC (fica fora do controle de adversários)</label>
      <div class="mfoot"><span></span><div class="row"><button type="button" class="btn" id="fclc">Cancelar</button><button class="btn pri">Salvar</button></div></div></form>`);
    $('#fclc').onclick = fechar;
    $('#fcl').onsubmit = async e => {
      e.preventDefault(); const f = new FormData(e.target);
      const { error } = await sb.from('adv_clubes').update({ nome: String(f.get('nome')).trim(), qfc: f.get('qfc') === 'on' }).eq('id', c.id);
      if (error) return toast(erroAmigavel(error), true);
      fechar(); toast('Clube atualizado.'); await carregarAdv(true); pSumulas();
    };
  });
}

/* ---------- envio de súmulas ---------- */
async function extrairPaginas(file) {
  if (!window.pdfjsLib) throw new Error('O leitor de PDF não carregou. Recarregue a página.');
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pags = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const pg = await doc.getPage(p), vp = pg.getViewport({ scale: 1 }), tc = await pg.getTextContent();
    pags.push({ w: vp.width, items: tc.items.map(i => [i.str, Math.round(i.transform[4]), Math.round(i.transform[5])]) });
  }
  return pags;
}

function escolherSumulas() {
  const inp = document.createElement('input'); inp.type = 'file'; inp.multiple = true; inp.accept = 'application/pdf';
  inp.onchange = () => { if (inp.files.length) lerSumulas([...inp.files]); };
  inp.click();
}

async function lerSumulas(files) {
  modal(`<h2>Lendo súmulas…</h2><p class="m" id="lprog">0 de ${files.length}</p>`);
  try { await carregarAdv(); } catch (e) { /* segue: só não marca "já lançado" */ }
  const lidas = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    if ($('#lprog')) $('#lprog').textContent = `${i + 1} de ${files.length}: ${f.name}`;
    try {
      const r = lerSumula(await extrairPaginas(f)); r.arquivo = f; r.info = sumInfoArquivo(f.name);
      if (r.info.placar && r.ft && (r.info.placar[0] !== r.ft[0] || r.info.placar[1] !== r.ft[1])) r.alertas.push(`O nome do arquivo diz ${r.info.placar[0]} x ${r.info.placar[1]}, a súmula diz ${r.ft[0]} x ${r.ft[1]}.`);
      lidas.push(r);
    }
    catch (e) { lidas.push({ erro: e.message || String(e), arquivo: f }); }
  }
  conferirSumulas(lidas);
}

function resumoEquipe(r, lado) {
  const e = r.equipes[lado], tit = e.jogadores.filter(j => j.titular), nome = sumNomeCurto(e.nome_sumula);
  const subs = r.subs.filter(s => s.equipe === lado), gols = r.gols.filter(g => g.equipe === lado), cart = r.cartoes.filter(c => c.equipe === lado);
  return `<div class="conf-eq"><h4>${esc(nome)} <small>${lado ? 'visitante' : 'mandante'}${e.tecnico ? ' · téc. ' + esc(e.tecnico) : ''}</small></h4>
    <ol class="conf-xi">${tit.map(j => `<li><span>${j.numero}</span>${esc(j.apelido)}${j.goleiro ? ' <small>(g)</small>' : ''}${j.saiu < 90 ? ` <em>↓${j.saiu}'</em>` : ''}</li>`).join('')}</ol>
    <div class="conf-ev">${subs.length ? `<b>Substituições</b>${subs.map(s => `<div>${sumMinTxt(s.tempo, s.minuto)} ↑ ${esc(s.nome)} ↓ ${esc(s.nome2)}</div>`).join('')}` : '<b>Sem substituições</b>'}
    ${gols.length ? `<b>Gols</b>${gols.map(g => `<div>${sumMinTxt(g.tempo, g.minuto)} ${esc(g.nome)}${g.tipo && g.tipo !== 'NR' ? ' (' + esc(g.tipo) + ')' : ''}</div>`).join('')}` : ''}
    ${cart.length ? `<b>Cartões</b>${cart.map(c => `<div><i class="cq ${c.cor === 'amarelo' ? 'am' : 'vm'}"></i>${sumMinTxt(c.tempo, c.minuto)} ${esc(c.nome)}${/^\d+$/.test(c.numero) ? '' : ' (' + esc(c.numero) + ')'}</div>`).join('')}` : ''}</div></div>`;
}

function conferirSumulas(lidas) {
  const ok = lidas.filter(r => !r.erro), ruins = lidas.filter(r => r.erro);
  const comp0 = ok[0]?.competicao || '';
  const faseUlt = advGet('fase') || '1ª fase';
  const jaExiste = r => S.adv.jogos.some(j => j.competicao === r.competicao && j.jogo_num === r.jogo_num);
  modal(`<h2>Conferir súmulas</h2>
    <div class="g2"><label class="f"><span>Competição</span><input class="in" id="ccomp" value="${esc(comp0)}"></label>
    <label class="f"><span>Fase (aplicar a todos)</span><select class="in" id="cfase">${opts(FASES_ADV, faseUlt)}</select></label></div>
    <p class="m" style="margin-top:-4px">A súmula não diz a fase (a federação recomeça a contagem de rodadas em cada fase). O CINQ usa o nome do arquivo quando ele indica a fase (ex.: "Semifinal"); confira em cada jogo antes de salvar.</p>
    ${ruins.map(r => `<div class="note bad">${esc(r.arquivo.name)}: ${esc(r.erro)}</div>`).join('')}
    ${ok.map((r, i) => `<details class="conf"${ok.length === 1 ? ' open' : ''}><summary>
        <b>Jogo ${r.jogo_num}</b> · Rodada ${r.rodada ?? '—'} · ${r.data ? dataBR(r.data) : '—'} · <b>${esc(sumNomeCurto(r.equipes[0].nome_sumula))} ${r.ft?.[0] ?? '?'} x ${r.ft?.[1] ?? '?'} ${esc(sumNomeCurto(r.equipes[1].nome_sumula))}</b>
        ${jaExiste(r) ? '<span class="badge s-Ativo">já lançado · será atualizado</span>' : '<span class="badge t-Treino">novo</span>'}
        ${r.alertas.length ? `<span class="badge s-Inativo">${r.alertas.length} alerta${r.alertas.length > 1 ? 's' : ''}</span>` : ''}</summary>
      <div class="conf-fase"><label>Fase deste jogo <select class="in" data-fase="${i}">${opts(FASES_ADV, r.info?.fase || faseUlt)}</select></label>${r.info?.fase ? `<span class="m">pelo nome do arquivo${r.info.volta ? ' · jogo de volta' : r.info.ida ? ' · jogo de ida' : ''}</span>` : ''}</div>
      ${r.alertas.length ? `<ul class="conf-al">${r.alertas.map(a => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}
      <div class="conf-grid">${resumoEquipe(r, 0)}${resumoEquipe(r, 1)}</div>
      <p class="m">${esc(r.estadio || '')}${r.ht ? ` · 1º tempo ${r.ht[0]} x ${r.ht[1]}` : ''} · ${r.equipes.map(e => e.jogadores.length).join(' e ')} relacionados</p></details>`).join('')}
    <div class="mfoot"><span class="m">${ok.length} súmula${ok.length === 1 ? '' : 's'} pronta${ok.length === 1 ? '' : 's'}</span><div class="row"><button class="btn" id="ccan">Cancelar</button>${ok.length ? `<button class="btn pri" id="csal">Salvar ${ok.length} jogo${ok.length === 1 ? '' : 's'}</button>` : ''}</div></div>`, true);
  $('#ccan').onclick = fechar;
  if ($('#cfase')) $('#cfase').onchange = e => document.querySelectorAll('#modal [data-fase]').forEach(x => { x.value = e.target.value; });
  if (!$('#csal')) return;
  $('#csal').onclick = async () => {
    const comp = $('#ccomp').value.trim(), fase = $('#cfase').value, b = $('#csal');
    if (!comp) return toast('Informe a competição.', true);
    advSet('fase', fase); b.disabled = true;
    let feitos = 0;
    try {
      for (const [i, r] of ok.entries()) {
        const faseJ = document.querySelector(`#modal [data-fase="${i}"]`)?.value || fase;
        b.textContent = `Salvando ${feitos + 1} de ${ok.length}…`;
        const path = `sumulas/j${r.jogo_num}_${Date.now()}.pdf`;
        const up = await sb.storage.from('planos').upload(path, r.arquivo, { contentType: 'application/pdf' });
        const antigo = S.adv.jogos.find(j => j.competicao === comp && j.jogo_num === r.jogo_num)?.arquivo_path;
        const payload = {
          competicao: comp, fase: faseJ, jogo_num: r.jogo_num, rodada: r.rodada, data: r.data, hora: r.hora, estadio: r.estadio,
          gols_m: r.ft?.[0], gols_v: r.ft?.[1], ht_m: r.ht?.[0], ht_v: r.ht?.[1], arquivo_path: up.error ? null : path,
          equipes: r.equipes.map(e => ({ nome_sumula: e.nome_sumula, nome_curto: sumNomeCurto(e.nome_sumula), qfc: /\bqfc\b/i.test(e.nome_sumula), tecnico: e.tecnico, comissao: e.comissao,
            jogadores: e.jogadores.map(j => ({ cbf: j.cbf, apelido: j.apelido, nome: j.nome, numero: j.numero, titular: j.titular, goleiro: j.goleiro, ordem: j.ordem, entrou: j.entrou, saiu: j.saiu, minutos: j.minutos })) })),
          eventos: [
            ...r.gols.filter(g => g.equipe >= 0).map(g => ({ equipe: g.equipe, tipo: 'gol', tempo: g.tempo, minuto: g.minuto, minuto_abs: sumMinAbs(g.tempo, g.minuto), cbf: g.cbf, numero: g.numero, nome: g.nome, detalhe: g.tipo })),
            ...r.cartoes.filter(c => c.equipe >= 0).map(c => ({ equipe: c.equipe, tipo: c.cor, tempo: c.tempo, minuto: c.minuto, minuto_abs: sumMinAbs(c.tempo, c.minuto), cbf: c.cbf, numero: c.numero, nome: c.nome, detalhe: (c.segundo_amarelo ? '2º amarelo · ' : '') + c.motivo })),
            ...r.subs.filter(s => s.equipe >= 0).map(s => ({ equipe: s.equipe, tipo: 'sub', tempo: s.tempo, minuto: s.minuto, minuto_abs: sumMinAbs(s.tempo, s.minuto), cbf: s.cbf, cbf2: s.cbf2, numero: s.entrou, nome: `${s.nome} ↔ ${s.nome2}` }))
          ]
        };
        const { error } = await sb.rpc('adv_salvar_sumula', { p: payload });
        if (error) { if (!up.error) sb.storage.from('planos').remove([path]); throw new Error(`Jogo ${r.jogo_num}: ${erroAmigavel(error)}`); }
        if (antigo && !up.error) sb.storage.from('planos').remove([antigo]);
        feitos++;
      }
      fechar(); toast(`${feitos} jogo${feitos === 1 ? '' : 's'} salvo${feitos === 1 ? '' : 's'}.`);
      S.adv.comp = comp; await carregarAdv(true); ir(S.page === 'adversarios' ? 'adversarios' : 'sumulas');
    } catch (e) { b.disabled = false; b.textContent = 'Tentar de novo'; toast(e.message || erroAmigavel(e), true); if (feitos) carregarAdv(true); }
  };
}

/* ---------- tela Escalações (clube) ---------- */
async function pAdversarios() {
  $('#main').innerHTML = topo('Análise do adversário', 'Escalações', '') + '<div class="panel empty">Carregando…</div>';
  try { await carregarAdv(); } catch (e) { return toast(erroAmigavel(e), true); }
  if (S.page !== 'adversarios') return;
  const comps = competicoes();
  if (!S.adv.comp || !comps.includes(S.adv.comp)) S.adv.comp = comps[comps.length - 1] || null;
  const clubes = S.adv.clubes.filter(c => !c.qfc && S.adv.jogos.some(j => j.competicao === S.adv.comp && (j.mandante_id === c.id || j.visitante_id === c.id))).sort((a, b) => a.nome.localeCompare(b.nome));
  if (!clubes.length) {
    $('#main').innerHTML = topo('Análise do adversário', 'Escalações', '') + `<div class="panel ind-vazio"><b>Ainda não há jogos de adversários.</b><span>Envie as súmulas na tela Súmulas. Cada jogo lançado aparece aqui, separado por clube.</span><button class="btn pri" id="irsum">Ir para Súmulas</button></div>`;
    $('#irsum').onclick = () => ir('sumulas'); return;
  }
  const salvo = +advGet('clube');
  if (!clubes.some(c => c.id === S.adv.clube)) S.adv.clube = clubes.some(c => c.id === salvo) ? salvo : clubes[0].id;
  const cid = S.adv.clube, A = analisarClubeAdv(cid, S.adv.comp), c = clubeAdv(cid);
  const ult = A.J[A.n - 1], tecMud = A.J.filter(j => j.tecMudou);
  const kpi = (l, v, s) => `<div class="card"><div class="l">${l}</div><div class="v">${v}</div><div class="s">${s}</div></div>`;
  const f1 = x => x == null ? '—' : x.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  $('#main').innerHTML = topo('Análise do adversário', 'Escalações', '',
    comps.length > 1 ? `<select class="in" id="acomp">${opts(comps, S.adv.comp)}</select>` : '') + `
  <div class="adv-chips">${clubes.map(x => `<button class="chip${x.id === cid ? ' on' : ''}" data-cid="${x.id}">${esc(x.nome)}</button>`).join('')}</div>
  <section class="panel adv-head">
    <div><div class="eyebrow">${esc(S.adv.comp || '')}</div><h2>${esc(c.nome)}</h2>
      <p class="m">${A.n} ${A.n === 1 ? 'jogo' : 'jogos'} · ${A.v}V ${A.e}E ${A.d}D · gols ${A.gp} x ${A.gc}${A.tecnico ? ' · técnico: <b>' + esc(A.tecnico) + '</b>' : ''}</p>
      ${tecMud.length ? `<div class="note bad">Troca de técnico: ${tecMud.map(j => `${esc(j.tecMudou)} → ${esc(j.tec)} (${esc(faseTxt(j.g))}, ${dataBR(j.g.data)})`).join('; ')}</div>` : ''}
      <div class="adv-forma">${A.J.slice(-6).map(j => `<span class="res r-${j.res}" title="${esc(nomeClube(j.adv))} ${j.gp}x${j.gc}">${j.res}</span>`).join('')}</div>
    </div>
    <div class="adv-prov"><div class="eyebrow">Provável escalação</div><p class="m">Último time titular${ult ? ` (${dataBR(ult.g.data)} × ${esc(nomeClube(ult.adv))})` : ''}, com suspensos e pendurados</p>
      <ol>${(ult?.xi || []).map(e => { const p = A.atletas.find(x => x.id === e.atleta_id); return `<li class="${p?.suspenso ? 'susp' : ''}"><span>${e.numero}</span>${esc(nomeAtl(e.atleta_id))}${atl(e.atleta_id).posicao ? ` <small>${atl(e.atleta_id).posicao}</small>` : ''}${p?.suspenso ? ' <b class="tag vm">suspenso</b>' : (p && p.amarelosAcum % LIMITE_AMARELOS === LIMITE_AMARELOS - 1 ? ' <b class="tag am">pendurado</b>' : '')}</li>`; }).join('')}</ol></div>
  </section>
  <div class="cards adv-kpis">
    ${kpi('Mudanças no time titular', f1(A.mudMedia), A.mudUlt != null ? `média por jogo · última: ${A.mudUlt}` : 'precisa de 2 jogos')}
    ${kpi('Núcleo fixo', A.n >= 2 ? A.nucleo.length : '—', 'titulares em 80%+ dos jogos')}
    ${kpi('1ª substituição', A.primSub != null ? Math.round(A.primSub) + "'" : '—', `minuto médio · ${A.subsInt} troca${A.subsInt === 1 ? '' : 's'} no intervalo`)}
    ${kpi('Substituições', f1(A.subsMedia), 'média por jogo')}
    ${kpi('Cartões amarelos', A.amarelos, `${f1(A.n ? A.amarelos / A.n : null)} por jogo · ${A.vermelhos} vermelho${A.vermelhos === 1 ? '' : 's'}`)}
    ${kpi('Próximo jogo', `${A.suspensos.length} / ${A.pendurados.length}`, 'suspensos / pendurados')}
  </div>
  <div class="ind-tabs" id="atabs">
    <button data-aba="escalacoes">Escalações por jogo</button><button data-aba="atletas">Atletas e minutagem</button>
    <button data-aba="subs">Substituições</button><button data-aba="disc">Cartões</button><button data-aba="gols">Gols</button>
  </div>
  <div id="acorpo"></div>`;
  if ($('#acomp')) $('#acomp').onchange = e => { S.adv.comp = e.target.value; pAdversarios(); };
  document.querySelectorAll('[data-cid]').forEach(b => b.onclick = () => { S.adv.clube = +b.dataset.cid; advSet('clube', S.adv.clube); pAdversarios(); });
  $('#atabs').onclick = e => { const b = e.target.closest('[data-aba]'); if (b) { S.adv.aba = b.dataset.aba; abaAdv(A); } };
  abaAdv(A);
}

function abaAdv(A) {
  document.querySelectorAll('#atabs [data-aba]').forEach(b => b.classList.toggle('on', b.dataset.aba === S.adv.aba));
  ({ escalacoes: abaEscalacoes, atletas: abaAtletasAdv, subs: abaSubsAdv, disc: abaDiscAdv, gols: abaGolsAdv }[S.adv.aba] || abaEscalacoes)(A);
}

const marcasAtl = (j, id) => {
  const g = j.golsPro.filter(e => e.atleta_id === id && e.detalhe !== 'CT').length;
  const ca = j.cart.filter(e => e.atleta_id === id && e.tipo === 'amarelo').length, cv = j.cart.filter(e => e.atleta_id === id && e.tipo === 'vermelho').length;
  return (g ? `<b class="gol" title="Gol">${g > 1 ? g + '×' : ''}⚽︎</b>` : '') + (ca ? '<i class="cq am" title="Amarelo"></i>'.repeat(ca) : '') + (cv ? '<i class="cq vm" title="Vermelho"></i>' : '');
};

function abaEscalacoes(A) {
  const J = [...A.J].reverse();
  $('#acorpo').innerHTML = `<p class="m legenda"><span class="lg-novo"></span> entrou no time titular em relação ao jogo anterior · ↓ minuto em que saiu · ⚽︎ gol · <i class="cq am"></i><i class="cq vm"></i> cartões · Jogo mais recente à esquerda.</p>
  <div class="esc-scroll">${J.map(j => `<div class="esc-col">
    <div class="esc-h r-${j.res}"><div class="eyebrow">${esc(faseTxt(j.g))} · ${dataBR(j.g.data)}</div>
      <b>${j.casa ? 'vs' : '@'} ${esc(nomeClube(j.adv))}</b><span class="res r-${j.res}">${j.gp} x ${j.gc}</span>
      ${j.tec ? `<small>${j.tecMudou ? '<b class="tag vm">novo técnico</b> ' : ''}${esc(j.tec)}</small>` : ''}</div>
    <ol class="esc-xi">${j.xi.map(e => `<li class="${j.novos.includes(e.atleta_id) ? 'novo' : ''}"><span>${e.numero}</span><em>${esc(nomeAtl(e.atleta_id))}</em>${atl(e.atleta_id).posicao ? `<small>${atl(e.atleta_id).posicao}</small>` : ''}${marcasAtl(j, e.atleta_id)}${e.saiu != null && e.saiu < 90 ? `<u>↓${e.saiu}'</u>` : ''}</li>`).join('')}</ol>
    ${j.sairam.length ? `<div class="esc-sai"><b>Saíram do time titular:</b> ${j.sairam.map(id => esc(nomeAtl(id))).join(', ')}</div>` : (A.J.indexOf(j) > 0 ? '<div class="esc-sai ok">Mesmo time titular do jogo anterior</div>' : '')}
    ${j.suspensosAqui.length ? `<div class="esc-sai"><b>Suspensos neste jogo:</b> ${j.suspensosAqui.map(id => esc(nomeAtl(id))).join(', ')}</div>` : ''}
    <div class="esc-subs"><b>Substituições</b>${j.subs.length ? j.subs.map(s => `<div><span>${minTxt(s)}</span>↑ ${esc(nomeAtl(s.atleta_id))}${marcasAtl(j, s.atleta_id)} <small>↓ ${esc(nomeAtl(s.atleta2_id))}</small></div>`).join('') : '<div class="m">nenhuma</div>'}</div>
  </div>`).join('')}</div>`;
}

function abaAtletasAdv(A) {
  const J = [...A.J].reverse(), pode = podeAdv();
  const lista = [...A.atletas].sort((a, b) => { const pa = POS_ADV.indexOf(atl(a.id).posicao), pb = POS_ADV.indexOf(atl(b.id).posicao); return (pa < 0 ? 50 : pa) - (pb < 0 ? 50 : pb) || b.tit - a.tit || b.min - a.min; });
  const possivel = A.n * 90;
  const numMais = p => Object.entries(p.num).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
  $('#acorpo').innerHTML = `<p class="m legenda">Minutos por jogo (mais recente à esquerda): <span class="lg t">titular</span> <span class="lg e">entrou</span> <span class="lg b">banco</span> · vazio = não relacionado.${pode ? ' Defina a posição de cada atleta uma vez; o CINQ guarda para os próximos jogos.' : ''}</p>
  <div class="panel tablewrap"><table class="tb adv-at"><thead><tr><th>Pos.</th><th>Nº</th><th>Atleta</th><th>Jogos</th><th>Tit.</th><th>Min.</th><th>% min</th><th>Gols</th><th>CA</th><th>CV</th><th>Situação</th>
    ${J.map(j => `<th class="cj" title="${esc(nomeClube(j.adv))} ${j.gp}x${j.gc} · ${dataBR(j.g.data)}">${esc(nomeClube(j.adv)).slice(0, 3)}<br><small>${fmt(j.g.data)}</small></th>`).join('')}</tr></thead><tbody>
    ${lista.map(p => `<tr><td>${pode ? `<select class="in pos" data-pos="${p.id}">${opts(POS_ADV, atl(p.id).posicao, '—')}</select>` : esc(atl(p.id).posicao || '—')}</td>
      <td>${numMais(p)}</td><td>${pode ? `<button class="lnk" data-atl="${p.id}">${esc(nomeAtl(p.id))}</button>` : `<b>${esc(nomeAtl(p.id))}</b>`}</td>
      <td>${p.jogos}</td><td>${p.tit}</td><td>${p.min}</td><td>${possivel ? Math.round(p.min / possivel * 100) : 0}%</td><td>${p.gols || ''}</td><td>${p.ca || ''}</td><td>${p.cv || ''}</td>
      <td>${p.suspenso ? '<b class="tag vm">suspenso</b>' : p.amarelosAcum % LIMITE_AMARELOS === LIMITE_AMARELOS - 1 ? '<b class="tag am">pendurado</b>' : ''}</td>
      ${J.map(j => { const c = p.cel[j.g.id]; return `<td class="cj ${c ? (c.tit ? 't' : c.min ? 'e' : 'b') : ''}">${c ? (c.min || (c.tit ? 0 : '–')) : ''}</td>`; }).join('')}</tr>`).join('')}
  </tbody></table></div>`;
  document.querySelectorAll('[data-pos]').forEach(s => s.onchange = async () => {
    const id = +s.dataset.pos, v = s.value || null;
    const { error } = await sb.from('adv_atletas').update({ posicao: v }).eq('id', id);
    if (error) return toast(erroAmigavel(error), true);
    S.adv.atletas[id].posicao = v; toast(`Posição de ${nomeAtl(id)}: ${v || 'sem posição'}.`);
  });
  document.querySelectorAll('[data-atl]').forEach(b => b.onclick = () => {
    const a = atl(+b.dataset.atl);
    modal(`<h2>Atleta</h2><form id="fat2"><label class="f"><span>Nome de exibição *</span><input class="in" name="apelido" value="${esc(a.apelido || '')}" required></label>
      <label class="f"><span>Posição</span><select class="in" name="posicao">${opts(POS_ADV, a.posicao, '—')}</select></label>
      <p class="m">Nome na súmula: ${esc(a.nome || '—')} · CBF ${esc(a.cbf)}</p>
      <div class="mfoot"><span></span><div class="row"><button type="button" class="btn" id="fatc">Cancelar</button><button class="btn pri">Salvar</button></div></div></form>`);
    $('#fatc').onclick = fechar;
    $('#fat2').onsubmit = async e => {
      e.preventDefault(); const f = new FormData(e.target), upd = { apelido: String(f.get('apelido')).trim(), posicao: f.get('posicao') || null };
      const { error } = await sb.from('adv_atletas').update(upd).eq('id', a.id);
      if (error) return toast(erroAmigavel(error), true);
      Object.assign(S.adv.atletas[a.id], upd); fechar(); toast('Atleta atualizado.'); pAdversarios();
    };
  });
}

const barrasAdv = (itens, max) => itens.map(([l, v, extra]) => `<div class="bar"><span>${esc(l)}</span><div><i style="width:${max ? Math.round(v / max * 100) : 0}%"></i></div><b>${v}</b>${extra ? `<small>${extra}</small>` : ''}</div>`).join('');
const FAIXAS = [['0-15', 0, 15], ['16-30', 16, 30], ['31-45', 31, 45], ['Intervalo', 45, 45], ['46-60', 46, 60], ['61-75', 61, 75], ['76-90', 76, 90]];
// faixa de um gol/cartão, separando os acréscimos de cada tempo
const FAIXAS_EV = ['0-15', '16-30', '31-45', '45+', '46-60', '61-75', '76-90', '90+'];
function faixaEv(e) {
  if (e.tempo === 'INT') return null;
  if (e.minuto > 45) return e.tempo === '2T' ? '90+' : '45+';
  const m = e.tempo === '2T' ? 45 + e.minuto : e.minuto;
  return m <= 15 ? '0-15' : m <= 30 ? '16-30' : m <= 45 ? (e.tempo === '2T' ? '46-60' : '31-45') : m <= 60 ? '46-60' : m <= 75 ? '61-75' : '76-90';
}

function abaSubsAdv(A) {
  const subs = A.J.flatMap(j => j.subs);
  const fx = FAIXAS.map(([l, a, b]) => [l, subs.filter(s => l === 'Intervalo' ? s.tempo === 'INT' : s.tempo !== 'INT' && s.minuto_abs >= a && s.minuto_abs <= b).length]);
  const max = Math.max(1, ...fx.map(x => x[1]));
  const sai = A.atletas.filter(p => p.saiuX.length).sort((a, b) => b.saiuX.length - a.saiuX.length).slice(0, 8);
  const ent = A.atletas.filter(p => p.entrouX.length).sort((a, b) => b.entrouX.length - a.entrouX.length).slice(0, 8);
  const med = a => Math.round(a.reduce((s, x) => s + x, 0) / a.length);
  const ordem = [1, 2, 3, 4, 5].map(k => { const m = A.J.map(j => j.subs[k - 1]).filter(Boolean); return m.length ? [`${k}ª troca`, med(m.map(s => s.minuto_abs)), `${m.length} jogo${m.length > 1 ? 's' : ''}`] : null; }).filter(Boolean);
  $('#acorpo').innerHTML = `<div class="grid2">
    <div class="panel"><h2>Quando o técnico mexe</h2>${barrasAdv(fx, max)}<p class="m">${subs.length} substituições em ${A.n} jogo${A.n === 1 ? '' : 's'}.</p></div>
    <div class="panel"><h2>Minuto médio de cada troca</h2>${ordem.length ? ordem.map(([l, m, s]) => `<div class="kv"><span>${l}</span><b>${m}' <small class="m">(${s})</small></b></div>`).join('') : '<p class="empty">Sem substituições.</p>'}</div>
    <div class="panel"><h2>Titulares que mais saem</h2>${sai.length ? sai.map(p => `<div class="kv"><span>${esc(nomeAtl(p.id))}</span><b>${p.saiuX.length}× · média ${med(p.saiuX)}'</b></div>`).join('') : '<p class="empty">—</p>'}</div>
    <div class="panel"><h2>Reservas que mais entram</h2>${ent.length ? ent.map(p => `<div class="kv"><span>${esc(nomeAtl(p.id))}</span><b>${p.entrouX.length}× · média ${med(p.entrouX)}'${p.gols ? ' · ' + p.gols + ' gol' + (p.gols > 1 ? 's' : '') : ''}</b></div>`).join('') : '<p class="empty">—</p>'}</div>
  </div>`;
}

function abaDiscAdv(A) {
  const cart = A.J.flatMap(j => j.cart.map(e => ({ ...e, j })));
  const comissao = cart.filter(e => !e.atleta_id);
  const motivos = {};
  cart.forEach(e => { const m = String(e.detalhe || '').replace(/^2º amarelo · /, '').split(' - POR ')[0].replace(/^\d+\s*-\s*/, '').trim() || 'Sem motivo'; motivos[m] = (motivos[m] || 0) + 1; });
  const mot = Object.entries(motivos).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const porAt = A.atletas.filter(p => p.ca || p.cv).sort((a, b) => b.ca + b.cv * 3 - (a.ca + a.cv * 3));
  const ctA = cart.filter(e => e.atleta_id);
  const fxC = FAIXAS_EV.map(n => { const l = ctA.filter(e => faixaEv(e) === n), am = l.filter(e => e.tipo === 'amarelo').length, vm = l.length - am; return [n, l.length, [am && `${am} amarelo${am === 1 ? '' : 's'}`, vm && `${vm} vermelho${vm === 1 ? '' : 's'}`].filter(Boolean).join(' · ')]; });
  const maxC = Math.max(1, ...fxC.map(x => x[1]));
  const t1 = ctA.filter(e => e.tempo !== '2T').length, t2 = ctA.length - t1;
  const prim = A.J.map(j => j.cart.filter(e => e.atleta_id).sort((a, b) => a.minuto_abs - b.minuto_abs)[0]).filter(Boolean);
  const fimJogo = ctA.filter(e => ['76-90', '90+'].includes(faixaEv(e))).length;
  $('#acorpo').innerHTML = `<div class="panel"><h2>Cartões por tempo de jogo</h2>
    <div class="adv-ct"><div class="bars-cart">${barrasAdv(fxC, maxC)}</div>
    <div class="adv-ct-r">
      <div class="kv"><span>1º tempo</span><b>${t1} (${ctA.length ? Math.round(t1 / ctA.length * 100) : 0}%)</b></div>
      <div class="kv"><span>2º tempo</span><b>${t2} (${ctA.length ? Math.round(t2 / ctA.length * 100) : 0}%)</b></div>
      <div class="kv"><span>Últimos 15 min + acréscimos</span><b>${fimJogo} (${ctA.length ? Math.round(fimJogo / ctA.length * 100) : 0}%)</b></div>
      <div class="kv"><span>Minuto médio do 1º cartão</span><b>${prim.length ? Math.round(prim.reduce((s, e) => s + e.minuto_abs, 0) / prim.length) + "'" : '—'}</b></div>
      <div class="kv"><span>Cartões por jogo</span><b>${A.n ? (ctA.length / A.n).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : '—'}</b></div>
      <p class="m">Só atletas (cartões da comissão ficam no quadro abaixo). 45+ e 90+ = acréscimos.</p></div></div></div>
  <div class="grid2">
    <div class="panel"><h2>Próximo jogo</h2>
      <h3 class="sub">Suspensos</h3>${A.suspensos.length ? A.suspensos.map(p => `<div class="kv"><span>${esc(nomeAtl(p.id))}</span><b class="tag vm">${p.cv && A.J[A.n - 1].cart.some(e => e.atleta_id === p.id && e.tipo === 'vermelho') ? 'vermelho' : LIMITE_AMARELOS + 'º amarelo'}</b></div>`).join('') : '<p class="m">Nenhum.</p>'}
      <h3 class="sub">Pendurados (${LIMITE_AMARELOS - 1} amarelos)</h3>${A.pendurados.length ? A.pendurados.map(p => `<div class="kv"><span>${esc(nomeAtl(p.id))}</span><b class="tag am">pendurado</b></div>`).join('') : '<p class="m">Nenhum.</p>'}
      <p class="m">Regra usada: suspensão a cada ${LIMITE_AMARELOS} amarelos ou após vermelho. Confirmar no regulamento da competição.</p></div>
    <div class="panel"><h2>Cartões por atleta</h2>${porAt.length ? porAt.map(p => `<div class="kv"><span>${esc(nomeAtl(p.id))}</span><b>${'<i class="cq am"></i>'.repeat(p.ca)}${'<i class="cq vm"></i>'.repeat(p.cv)}</b></div>`).join('') : '<p class="empty">Sem cartões.</p>'}</div>
    <div class="panel"><h2>Motivos mais comuns</h2>${mot.length ? barrasAdv(mot, mot[0][1]) : '<p class="empty">—</p>'}</div>
    <div class="panel"><h2>Comissão técnica</h2>${comissao.length ? comissao.map(e => `<div class="kv"><span>${esc(e.nome)} <small class="m">(${esc(e.numero)})</small></span><b>${e.tipo === 'amarelo' ? '<i class="cq am"></i>' : '<i class="cq vm"></i>'} ${dataBR(e.j.g.data)}</b></div>`).join('') : '<p class="m">Nenhum cartão para a comissão.</p>'}</div>
  </div>`;
}

function abaGolsAdv(A) {
  const pro = A.J.flatMap(j => j.golsPro), contra = A.J.flatMap(j => j.golsContra);
  const fx = l => FAIXAS_EV.map(n => [n, l.filter(g => faixaEv(g) === n).length]);
  const fp = fx(pro), fc = fx(contra), max = Math.max(1, ...fp.map(x => x[1]), ...fc.map(x => x[1]));
  const art = A.atletas.filter(p => p.gols).sort((a, b) => b.gols - a.gols);
  const banco = A.J.flatMap(j => j.golsPro.filter(g => g.atleta_id && j.banco.some(b => b.atleta_id === g.atleta_id)).map(g => ({ g, j })));
  $('#acorpo').innerHTML = `<div class="grid2">
    <div class="panel"><h2>Gols marcados por faixa</h2>${barrasAdv(fp, max)}<p class="m">${pro.length} gols · 1º tempo ${pro.filter(g => g.tempo !== '2T').length} · 2º tempo ${pro.filter(g => g.tempo === '2T').length}</p></div>
    <div class="panel"><h2>Gols sofridos por faixa</h2>${barrasAdv(fc, max)}<p class="m">${contra.length} gols · 1º tempo ${contra.filter(g => g.tempo !== '2T').length} · 2º tempo ${contra.filter(g => g.tempo === '2T').length}</p></div>
    <div class="panel"><h2>Artilheiros</h2>${art.length ? art.map(p => `<div class="kv"><span>${esc(nomeAtl(p.id))}</span><b>${p.gols}</b></div>`).join('') : '<p class="empty">—</p>'}</div>
    <div class="panel"><h2>Gols de quem saiu do banco</h2>${banco.length ? banco.map(({ g, j }) => `<div class="kv"><span>${esc(nomeAtl(g.atleta_id))} <small class="m">vs ${esc(nomeClube(j.adv))}</small></span><b>${minTxt(g)}</b></div>`).join('') : '<p class="m">Nenhum.</p>'}</div>
  </div>`;
}

if (document.getElementById('main') && S.perfil) { navAdv(); if (S.page === 'adversarios' || S.page === 'sumulas') ir(S.page); }
