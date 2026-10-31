/* CINQ · Técnico individual
   Pasta de análise individual por atleta: ficha, análises ao longo do tempo (texto livre organizado),
   vídeos e anexos. Acesso só do admin; ele libera leitura/escrita por pasta ou para todas. */
'use strict';

S.ind = { meus: [], acessos: [], sel: null, aba: 'analises', an: null, analises: [], pasta: null, resumo: null, urls: {}, urlsEm: 0 };
const IND_KEY = 'cinq.ind.atleta';
const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, String(v)); } catch (e) { /* sem armazenamento */ } };

/* ---------- permissões ---------- */
async function carregarAcessosInd() {
  if (!S.perfil) return;
  if (isAdmin()) { const r = await sb.from('individual_acessos').select('*'); S.ind.acessos = r.data || []; S.ind.meus = []; }
  else { const r = await sb.from('individual_acessos').select('*').eq('perfil_id', S.perfil.id); S.ind.meus = r.data || []; }
}
const indPodeLer = id => isAdmin() || S.ind.meus.some(x => x.atleta_id == null || x.atleta_id === id);
const indPodeEditar = id => isAdmin() || S.ind.meus.some(x => x.nivel === 'escrita' && (x.atleta_id == null || x.atleta_id === id));
const indTemAcesso = () => isAdmin() || S.ind.meus.length > 0;
const ordPos = (a, b) => POSICOES.indexOf(a.posicao) - POSICOES.indexOf(b.posicao) || a.nome.localeCompare(b.nome);
const indAtletas = () => S.atletas.filter(a => a.ativo && indPodeLer(a.id)).sort(ordPos);

/* ---------- utilitários ---------- */
const dataExt = d => d ? parse(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }) : '';
const dataCurta = d => d ? parse(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/\./g, '') : '';
const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`;
const fotoGrande = a => a.foto_url ? `<img src="${esc(a.foto_url)}" alt="">` : `<span>${esc(iniciais(a.nome))}</span>`;

async function urlsInd(paths) {
  if (Date.now() - S.ind.urlsEm > 45 * 60e3) { S.ind.urls = {}; S.ind.urlsEm = Date.now(); }
  const falta = [...new Set(paths.filter(p => p && !S.ind.urls[p]))];
  if (falta.length) { const { data } = await sb.storage.from('individual').createSignedUrls(falta, 3600); (data || []).forEach(d => { if (d.signedUrl) S.ind.urls[d.path] = d.signedUrl; }); }
  return S.ind.urls;
}

/* texto livre organizado: "## " seção · "- " item · "+ " positivo · "! " atenção · **negrito** */
function mdInd(t) {
  const inl = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  const out = []; let lista = false;
  const fecha = () => { if (lista) { out.push('</ul>'); lista = false; } };
  String(t || '').split(/\r?\n/).forEach(l => {
    const s = l.trim(); let m;
    if (!s) return fecha();
    if ((m = s.match(/^#{1,3}\s+(.*)/))) { fecha(); out.push(`<h3>${inl(m[1])}</h3>`); return; }
    if ((m = s.match(/^([-•+!])\s+(.*)/))) {
      if (!lista) { out.push('<ul>'); lista = true; }
      const c = { '+': ' class="pos"', '!': ' class="aten"' }[m[1]] || '';
      out.push(`<li${c}>${inl(m[2])}</li>`); return;
    }
    fecha(); out.push(`<p>${inl(s)}</p>`);
  });
  fecha(); return out.join('');
}

/* ---------- dados da pasta ---------- */
async function carregarPasta(id) {
  const [an, pa] = await Promise.all([
    sb.from('individual_analises').select('*').eq('atleta_id', id).order('data', { ascending: false }).order('id', { ascending: false }),
    sb.from('individual_pastas').select('*').eq('atleta_id', id).maybeSingle()
  ]);
  if (an.error) toast(erroAmigavel(an.error), true);
  S.ind.analises = an.data || []; S.ind.pasta = pa.data || null;
  await urlsInd(S.ind.analises.flatMap(x => (x.anexos || []).map(f => f.path)));
  if (!S.ind.analises.some(x => x.id === S.ind.an)) S.ind.an = S.ind.analises[0]?.id || null;
}

/* ---------- tela ---------- */
async function pIndividual() {
  const lista = indAtletas();
  let id = S.ind.sel ?? (+lsGet(IND_KEY) || null);
  if (id && !lista.some(a => a.id === id)) id = null;
  S.ind.sel = id;
  if (!id) return telaEscolha(lista);
  const a = lista.find(x => x.id === id);
  $('#main').innerHTML = topoInd(a) + '<div class="panel empty">Abrindo a pasta…</div>';
  await carregarPasta(id);
  if (S.page !== 'individual' || S.ind.sel !== id) return;
  renderPasta(a);
}

function topoInd(a) {
  const acoes = (a ? '<button class="btn" id="itrocar">Trocar atleta</button>' : '') +
    (a && isAdmin() ? '<button class="btn" id="icomp">Compartilhar</button>' : '') +
    (a && indPodeEditar(a.id) ? '<button class="btn pri" id="inova">+ Nova análise</button>' : '');
  return topo('Comissão · Técnico individual', 'Análise individual', a ? '' : 'Selecione o atleta para abrir a pasta.', acoes);
}

async function resumoPastas() {
  const r = await sb.from('individual_analises').select('atleta_id,data');
  const m = {}; (r.data || []).forEach(x => { const o = m[x.atleta_id] || (m[x.atleta_id] = { n: 0, ult: null }); o.n++; if (!o.ult || x.data > o.ult) o.ult = x.data; });
  S.ind.resumo = m; return m;
}

function gradeAtletas(lista, res, filtro = '') {
  const f = semAcento(filtro.toLowerCase());
  const vis = lista.filter(a => !f || semAcento(a.nome.toLowerCase()).includes(f) || semAcento(a.posicao.toLowerCase()).includes(f));
  if (!vis.length) return '<div class="empty">Nenhum atleta encontrado.</div>';
  return POSICOES.map(p => {
    const g = vis.filter(a => a.posicao === p); if (!g.length) return '';
    return `<div class="pick-grupo"><div class="pick-pos">${esc(p)}</div><div class="pick-grid">${g.map(a => {
      const r = res?.[a.id];
      return `<button class="pick" data-ia="${a.id}">${foto(a)}<span><b>${esc(a.nome)}</b><small>${r ? `${plural(r.n, 'análise', 'análises')} · última ${fmt(r.ult)}` : 'Sem análises'}</small></span></button>`;
    }).join('')}</div></div>`;
  }).join('');
}

async function telaEscolha(lista) {
  $('#main').innerHTML = topoInd(null) + `<div class="panel">
    <input class="in" id="ibusca" placeholder="Buscar atleta ou posição…" style="max-width:340px;margin-bottom:6px">
    <div id="igrade"><div class="empty">Carregando…</div></div></div>`;
  const res = await resumoPastas();
  if (S.page !== 'individual') return;
  const pinta = () => { $('#igrade').innerHTML = gradeAtletas(lista, res, $('#ibusca').value); $('#igrade').querySelectorAll('[data-ia]').forEach(b => b.onclick = () => abrirPastaInd(+b.dataset.ia)); };
  $('#ibusca').oninput = pinta; pinta();
}

function abrirPastaInd(id) { S.ind.sel = id; S.ind.an = null; S.ind.aba = 'analises'; lsSet(IND_KEY, id); fechar(); ir('individual'); }

async function trocarAtleta() {
  const lista = indAtletas();
  modal(`<h2>Selecionar atleta</h2><input class="in" id="mbusca" placeholder="Buscar atleta ou posição…" style="margin-bottom:6px"><div id="mgrade"><div class="empty">Carregando…</div></div>
    <div class="mfoot"><span></span><button class="btn" id="mfc">Fechar</button></div>`, true);
  $('#mfc').onclick = fechar;
  const res = S.ind.resumo || await resumoPastas();
  const pinta = () => { $('#mgrade').innerHTML = gradeAtletas(lista, res, $('#mbusca').value); $('#mgrade').querySelectorAll('[data-ia]').forEach(b => b.onclick = () => abrirPastaInd(+b.dataset.ia)); };
  $('#mbusca').oninput = pinta; pinta(); $('#mbusca').focus();
}

function renderPasta(a) {
  const h = histDe(a), ans = S.ind.analises, noXI = S.mapa.some(m => m.atleta_id === a.id);
  const nVid = ans.reduce((s, x) => s + (x.videos || []).length, 0);
  const fato = (k, v) => `<div><span>${k}</span><b>${v ? esc(v) : '—'}</b></div>`;
  const pa = S.ind.pasta || {}, ogol = pa.ogol || h?.ogol, obs = pa.observacao, podeEd = indPodeEditar(a.id);
  $('#main').innerHTML = topoInd(a) + `
  <section class="panel ind-hero">
    <div class="ind-foto">${fotoGrande(a)}</div>
    <div class="ind-id">
      <div class="eyebrow">${esc(a.posicao)}${a.numero ? ' · Nº ' + esc(a.numero) : ''}</div>
      <h2>${esc(a.nome)}</h2>
      <div class="row"><span class="badge s-${esc(a.status)}">${esc(a.status)}</span>${noXI ? '<span class="badge t-Treino">11 inicial</span>' : ''}${ogol ? `<a class="btn sm ind-ogol" href="${esc(ogol)}" target="_blank" rel="noopener">oGol ↗</a>` : ''}</div>
      <div class="ind-facts">
        ${fato('Idade', a.idade && a.idade + ' anos')}${fato('Pé', a.pe)}${fato('Altura', a.altura && String(a.altura).replace('.', ',') + ' m')}
        ${fato('Contrato até', a.contrato_fim && dataBR(a.contrato_fim))}${fato('Min. 2026', h && h.min_2026 != null && num(h.min_2026))}${fato('Jogos 2026', h && h.disp_2026 != null && `${num(h.disp_2026)}/${num(h.rel_2026)}`)}
      </div>
    </div>
    <div class="ind-nums">
      <div><b>${ans.length}</b><span>${ans.length === 1 ? 'Análise' : 'Análises'}</span></div>
      <div><b>${nVid}</b><span>${nVid === 1 ? 'Vídeo' : 'Vídeos'}</span></div>
      <div><b>${ans[0] ? fmt(ans[0].data) : '—'}</b><span>Última análise</span></div>
    </div>
    ${obs ? `<div class="ind-obs"><div class="ind-obs-h"><span>Observação</span>${podeEd ? '<button class="btn sm" id="iobs">Editar</button>' : ''}</div><p>${esc(obs)}</p></div>`
      : podeEd ? `<div class="ind-obs vazio"><span>Observação</span><p>Registre aqui o que é importante saber sobre o atleta: trajetória, contexto pessoal, momento atual.</p><button class="btn sm" id="iobs">Adicionar observação</button></div>` : ''}
  </section>
  <div class="ind-tabs" id="itabs">
    <button data-aba="analises">Análises <small>${ans.length}</small></button>
    <button data-aba="videos">Vídeos <small>${nVid}</small></button>
    <button data-aba="ficha">Ficha do atleta</button>
  </div>
  <div id="icorpo"></div>`;
  $('#itrocar').onclick = trocarAtleta;
  if ($('#icomp')) $('#icomp').onclick = () => compartilharInd(a);
  if ($('#inova')) $('#inova').onclick = () => formAnalise(a, null);
  if ($('#iobs')) $('#iobs').onclick = () => formPerfilInd(a);
  $('#itabs').onclick = e => { const b = e.target.closest('[data-aba]'); if (b) { S.ind.aba = b.dataset.aba; abaInd(a); } };
  abaInd(a);
}

function abaInd(a) {
  document.querySelectorAll('#itabs [data-aba]').forEach(b => b.classList.toggle('on', b.dataset.aba === S.ind.aba));
  ({ analises: abaAnalises, videos: abaVideos, ficha: abaFicha }[S.ind.aba] || abaAnalises)(a);
}

/* ---------- aba Análises ---------- */
function abaAnalises(a) {
  const ans = S.ind.analises, pode = indPodeEditar(a.id);
  if (!ans.length) {
    $('#icorpo').innerHTML = `<div class="panel ind-vazio"><b>Nenhuma análise registrada para ${esc(a.nome)}.</b><span>Cada conversa, observação de treino ou estudo de vídeo vira uma análise, com data, texto e vídeos. Elas ficam em ordem na pasta para você acompanhar a evolução.</span>${pode ? '<button class="btn pri" id="inova2">+ Nova análise</button>' : ''}</div>`;
    if ($('#inova2')) $('#inova2').onclick = () => formAnalise(a, null);
    return;
  }
  $('#icorpo').innerHTML = `<div class="ind-grid">
    <aside class="panel ind-tl">
      <div class="ind-tl-h">Linha do tempo</div>
      ${ans.map(x => {
        const nv = (x.videos || []).length, nf = (x.anexos || []).length;
        return `<button class="tl-item${x.id === S.ind.an ? ' on' : ''}" data-an="${x.id}">
          <span class="tl-data">${esc(dataCurta(x.data))}</span>
          <b>${esc(x.titulo)}</b>
          ${x.contexto ? `<span class="tl-ctx">${esc(x.contexto)}</span>` : ''}
          ${nv || nf ? `<span class="tl-meta">${[nv && plural(nv, 'vídeo', 'vídeos'), nf && plural(nf, 'anexo', 'anexos')].filter(Boolean).join(' · ')}</span>` : ''}
        </button>`;
      }).join('')}
    </aside>
    <article class="panel ind-doc" id="idoc"></article>
  </div>`;
  $('#icorpo').querySelectorAll('[data-an]').forEach(b => b.onclick = () => {
    S.ind.an = +b.dataset.an;
    $('#icorpo').querySelectorAll('[data-an]').forEach(x => x.classList.toggle('on', x === b));
    docAnalise(a);
    if (window.innerWidth < 900) $('#idoc').scrollIntoView({ behavior: 'smooth' });
  });
  docAnalise(a);
}

const autorNome = id => (S.perfis || []).find(p => p.id === id)?.nome || (S.perfil?.id === id ? S.perfil.nome : null);

function htmlClip(v, i, k) {
  const id = ytId(v.url);
  return `<button class="clip" data-clip="${k}:${i}">
    <span class="clip-th">${id ? `<img src="https://i.ytimg.com/vi/${id}/mqdefault.jpg" alt="" loading="lazy">` : '<i>Link externo</i>'}<em>▶</em>${v.inicio ? `<small>${esc(v.inicio)}</small>` : ''}</span>
    <b>${esc(v.titulo || 'Vídeo ' + (i + 1))}</b>${v.nota ? `<span>${esc(v.nota)}</span>` : ''}
  </button>`;
}
function ligarClips(root, fonte) {
  root.querySelectorAll('[data-clip]').forEach(b => b.onclick = () => { const [k, i] = b.dataset.clip.split(':'); tocarVideo(fonte(+k)[+i]); });
}

function docAnalise(a) {
  const x = S.ind.analises.find(y => y.id === S.ind.an); if (!x) return;
  const pode = indPodeEditar(a.id), vids = x.videos || [], anx = x.anexos || [];
  const autor = autorNome(x.autor);
  const imgs = anx.filter(f => /^image\//.test(f.tipo)), docs = anx.filter(f => !/^image\//.test(f.tipo));
  $('#idoc').innerHTML = `
    <div class="doc-head">
      <div><div class="eyebrow">Análise · ${esc(dataExt(x.data))}</div><h2>${esc(x.titulo)}</h2>${x.contexto ? `<p class="doc-ctx">${esc(x.contexto)}</p>` : ''}</div>
      <div class="row nao-imprimir"><button class="btn sm" id="dpdf">Exportar PDF</button>${pode ? '<button class="btn sm" id="ded">Editar</button><button class="btn sm dan" id="ddel">Excluir</button>' : ''}</div>
    </div>
    <div class="doc-txt">${x.texto ? mdInd(x.texto) : '<p class="empty">Sem texto.</p>'}</div>
    ${vids.length ? `<h3 class="doc-sec">Vídeos</h3><div class="clips">${vids.map((v, i) => htmlClip(v, i, x.id)).join('')}</div>` : ''}
    ${anx.length ? `<h3 class="doc-sec">Anexos</h3><div class="anexos">
      ${imgs.map(f => `<button class="anx-img" data-img="${esc(f.path)}" title="${esc(f.nome)}"><img src="${esc(S.ind.urls[f.path] || '')}" alt="${esc(f.nome)}"></button>`).join('')}
      ${docs.map(f => `<a class="anx-doc" href="${esc(S.ind.urls[f.path] || '#')}" target="_blank" rel="noopener"><b>PDF</b><span>${esc(f.nome)}</span></a>`).join('')}</div>` : ''}
    <div class="doc-rodape">${autor ? `Registrado por ${esc(autor)} · ` : ''}atualizado em ${esc(new Date(x.atualizado_em).toLocaleDateString('pt-BR'))}</div>`;
  ligarClips($('#idoc'), k => (S.ind.analises.find(y => y.id === k) || {}).videos || []);
  $('#idoc').querySelectorAll('[data-img]').forEach(b => b.onclick = () => abrirDesenho(S.ind.urls[b.dataset.img], x.titulo));
  $('#dpdf').onclick = () => exportarAnalise(a, x);
  if (pode) {
    $('#ded').onclick = () => formAnalise(a, x);
    $('#ddel').onclick = async () => {
      if (!confirm(`Excluir a análise "${x.titulo}" (${dataBR(x.data)})? Os anexos também serão apagados.`)) return;
      const { error } = await sb.from('individual_analises').delete().eq('id', x.id);
      if (error) return toast(erroAmigavel(error), true);
      if (anx.length) sb.storage.from('individual').remove(anx.map(f => f.path));
      toast('Análise excluída.'); S.ind.an = null; pIndividual();
    };
  }
}

function tocarVideo(v) {
  if (!v) return;
  const id = ytId(v.url), ini = segs(v.inicio) || 0;
  if (!id) { window.open(v.url, '_blank', 'noopener'); return; }
  let lb = document.getElementById('lightbox');
  if (!lb) { lb = document.createElement('div'); lb.id = 'lightbox'; document.body.appendChild(lb); }
  lb.className = 'ind-lb';
  lb.innerHTML = `<div class="lb-top"><b>${esc(v.titulo || 'Vídeo')}${v.inicio ? ' · a partir de ' + esc(v.inicio) : ''}</b><div class="row"><a class="btn sm" href="https://youtu.be/${id}${ini ? '?t=' + ini : ''}" target="_blank" rel="noopener">Abrir no YouTube ↗</a><button class="btn sm" data-fechar>Fechar ✕</button></div></div>
    <div class="ind-player"><iframe src="https://www.youtube-nocookie.com/embed/${id}?rel=0&autoplay=1${ini ? '&start=' + ini : ''}" allow="autoplay; encrypted-media; fullscreen" allowfullscreen title="Vídeo"></iframe></div>
    ${v.nota ? `<p class="ind-lb-nota">${esc(v.nota)}</p>` : ''}`;
  lb.onclick = e => { if (e.target === lb || e.target.closest('[data-fechar]')) lb.remove(); };
}

/* ---------- aba Vídeos ---------- */
function abaVideos(a) {
  const com = S.ind.analises.filter(x => (x.videos || []).length);
  if (!com.length) { $('#icorpo').innerHTML = `<div class="panel ind-vazio"><b>Nenhum vídeo na pasta.</b><span>Os vídeos ficam dentro de cada análise. Suba o clipe no YouTube como "Não listado" e cole o link ao criar ou editar a análise.</span></div>`; return; }
  $('#icorpo').innerHTML = com.map(x => `<div class="panel ind-vgrupo">
    <div class="ind-vh"><div><span class="eyebrow">${esc(dataExt(x.data))}</span><h3>${esc(x.titulo)}</h3></div><button class="btn sm" data-ver="${x.id}">Ver análise</button></div>
    <div class="clips">${x.videos.map((v, i) => htmlClip(v, i, x.id)).join('')}</div></div>`).join('');
  ligarClips($('#icorpo'), k => (S.ind.analises.find(y => y.id === k) || {}).videos || []);
  $('#icorpo').querySelectorAll('[data-ver]').forEach(b => b.onclick = () => { S.ind.an = +b.dataset.ver; S.ind.aba = 'analises'; abaInd(a); });
}

/* ---------- aba Ficha ---------- */
function abaFicha(a) {
  const h = histDe(a), pode = indPodeEditar(a.id), vg = S.ind.pasta?.visao_geral;
  const c = (k, v) => `<div class="kv"><span>${k}</span><b>${v ? esc(v) : '—'}</b></div>`;
  $('#icorpo').innerHTML = `<div class="ind-ficha">
    <div class="panel">
      <div class="sh"><h2>Visão geral do atleta</h2>${pode ? `<button class="btn sm" id="ivg">${vg ? 'Editar' : 'Escrever'}</button>` : ''}</div>
      ${vg ? `<div class="doc-txt">${mdInd(vg)}</div>` : '<p class="empty">Espaço para o retrato atual do atleta: características, função no modelo, o que está sendo trabalhado. Atualize quando quiser.</p>'}
    </div>
    <div class="panel">
      <h2>Cadastro</h2>
      <div class="g2">${c('Posição', a.posicao)}${c('Pé', a.pe)}${c('Idade', a.idade && a.idade + ' anos')}${c('Altura', a.altura && String(a.altura).replace('.', ',') + ' m')}${c('Número', a.numero)}${c('Status', a.status)}${c('Contrato até', a.contrato_fim && dataBR(a.contrato_fim))}${c('Entrada', a.data_entrada && dataBR(a.data_entrada))}</div>
      ${a.perfil ? `<div class="k">Perfil</div><p class="pre">${esc(a.perfil)}</p>` : ''}
      ${a.observacoes ? `<div class="k">Observações</div><p class="pre">${esc(a.observacoes)}</p>` : ''}
      <h3 class="sub">Histórico</h3>
      ${h ? `<div class="metric-grid">
          <div><b>${num(h.min_2026)}</b><span>Min 2026</span></div><div><b>${num(h.disp_2026)}/${num(h.rel_2026)}</b><span>Jogos 2026 (disp./rel.)</span></div>
          <div><b>${num(h.min_2025)}</b><span>Min 2025</span></div><div><b>${num(h.disp_2025)}/${num(h.rel_2025)}</b><span>Jogos 2025 (disp./rel.)</span></div></div>
        <div class="g2" style="margin-top:10px">${c('Último jogo atuando', h.ultimo_jogo && dataBR(h.ultimo_jogo))}${c('Ativo em competição', h.ativo_competicao ? 'Sim' : 'Não')}</div>
        ${h.titulos ? `<div class="k">Títulos</div><p class="pre">${esc(h.titulos)}</p>` : ''}
        ${h.observacao ? `<div class="k">Observação</div><p class="pre">${esc(h.observacao)}</p>` : ''}
        <div class="row">${h.ogol ? `<a class="btn sm" href="${esc(h.ogol)}" target="_blank" rel="noopener">Ogol ↗</a>` : ''}${h.drive ? `<a class="btn sm" href="${esc(h.drive)}" target="_blank" rel="noopener">Últimos 10 jogos (Drive) ↗</a>` : ''}</div>`
        : '<p class="empty">Sem histórico cadastrado.</p>'}
    </div></div>`;
  if ($('#ivg')) $('#ivg').onclick = () => {
    modal(`<h2>Visão geral · ${esc(a.nome)}</h2><form id="fvg">
      ${barraEditor()}<textarea class="in ed-txt" name="visao_geral" rows="12">${esc(vg || '')}</textarea>
      <div class="doc-txt ed-prev" hidden></div>${dicaEditor()}
      <div class="mfoot"><span></span><div class="row"><button type="button" class="btn" id="vgc">Cancelar</button><button class="btn pri">Salvar</button></div></div></form>`, true);
    ligarEditor($('#fvg'));
    $('#vgc').onclick = fechar;
    $('#fvg').onsubmit = async e => {
      e.preventDefault();
      const { error } = await sb.from('individual_pastas').upsert({ atleta_id: a.id, visao_geral: nul(formData(e.target).visao_geral) });
      if (error) return toast(erroAmigavel(error), true);
      fechar(); toast('Visão geral salva.'); S.ind.aba = 'ficha'; pIndividual();
    };
  };
}

/* ---------- observação e oGol ---------- */
function formPerfilInd(a) {
  const pa = S.ind.pasta || {}, h = histDe(a);
  modal(`<h2>Observação · ${esc(a.nome)}</h2><form id="fpi">
    <label class="f"><span>Observação</span><textarea class="in" name="observacao" rows="7" placeholder="Ex.: atleta com lastro na base, momento pessoal, retorno...">${esc(pa.observacao || '')}</textarea></label>
    <label class="f"><span>Link do oGol</span><input class="in" name="ogol" type="url" value="${esc(pa.ogol || h?.ogol || '')}" placeholder="https://www.ogol.com.br/jogador/..."></label>
    <div class="note">A observação aparece no topo da pasta, logo abaixo do atleta, e só quem tem acesso à pasta vê.</div>
    <div class="mfoot"><span></span><div class="row"><button type="button" class="btn" id="fpic">Cancelar</button><button class="btn pri">Salvar</button></div></div></form>`);
  $('#fpic').onclick = fechar;
  $('#fpi').onsubmit = async e => {
    e.preventDefault();
    const d = formData(e.target);
    if (d.ogol && !/^https?:\/\//i.test(d.ogol)) return toast('Cole o link completo do oGol (https://…).', true);
    const { error } = await sb.from('individual_pastas').upsert({ atleta_id: a.id, observacao: nul(d.observacao), ogol: nul(d.ogol) });
    if (error) return toast(erroAmigavel(error), true);
    fechar(); toast('Observação salva.'); pIndividual();
  };
}

/* ---------- editor ---------- */
const barraEditor = () => `<div class="ed-bar">
  <button type="button" data-ed="sec" title="Título de seção">Seção</button>
  <button type="button" data-ed="neg" title="Negrito"><b>N</b></button>
  <button type="button" data-ed="item" title="Item de lista">• Item</button>
  <button type="button" data-ed="pos" title="Ponto positivo" class="ed-pos">+ Positivo</button>
  <button type="button" data-ed="aten" title="Ponto de atenção" class="ed-aten">! Atenção</button>
  <span></span><button type="button" data-ed="prev">Pré-visualizar</button></div>`;
const dicaEditor = () => `<div class="note">Organize do seu jeito: <b>##</b> no início da linha cria uma seção, <b>-</b> um item, <b>+</b> um ponto positivo, <b>!</b> um ponto de atenção e <b>**texto**</b> fica em negrito.</div>`;

function ligarEditor(root) {
  const ta = root.querySelector('.ed-txt'), prev = root.querySelector('.ed-prev');
  root.querySelector('.ed-bar').onclick = e => {
    const b = e.target.closest('[data-ed]'); if (!b) return;
    const k = b.dataset.ed;
    if (k === 'prev') {
      const ver = prev.hidden; prev.hidden = !ver; ta.hidden = ver;
      prev.innerHTML = mdInd(ta.value) || '<p class="empty">Nada escrito ainda.</p>';
      b.textContent = ver ? 'Editar texto' : 'Pré-visualizar'; return;
    }
    if (!ta.hidden) {
      const v = ta.value, i = ta.selectionStart, f = ta.selectionEnd;
      if (k === 'neg') {
        const sel = v.slice(i, f) || 'texto';
        ta.value = v.slice(0, i) + '**' + sel + '**' + v.slice(f);
        ta.setSelectionRange(i + 2, i + 2 + sel.length);
      } else {
        const pre = { sec: '## ', item: '- ', pos: '+ ', aten: '! ' }[k];
        const ini = v.lastIndexOf('\n', i - 1) + 1, fim = f > i ? f : i;
        const bloco = v.slice(ini, fim).split('\n').map(l => pre + l.replace(/^(#{1,3}|[-•+!])\s+/, '')).join('\n');
        ta.value = v.slice(0, ini) + bloco + v.slice(fim);
        const p = ini + bloco.length; ta.setSelectionRange(p, p);
      }
      ta.focus();
    }
  };
}

function linhaVideo(v = {}) {
  return `<div class="vid-row">
    <input class="in" data-v="titulo" placeholder="Título do lance" value="${esc(v.titulo || '')}">
    <input class="in" data-v="url" placeholder="Link do YouTube (não listado)" value="${esc(v.url || '')}">
    <input class="in" data-v="inicio" placeholder="Início mm:ss" value="${esc(v.inicio || '')}">
    <input class="in" data-v="nota" placeholder="Observação (opcional)" value="${esc(v.nota || '')}">
    <button type="button" class="btn sm" data-rm title="Remover vídeo">✕</button></div>`;
}

function formAnalise(a, x) {
  const novo = !x;
  let anexos = [...(x?.anexos || [])]; const novos = [], removidos = [];
  modal(`<h2>${novo ? 'Nova análise' : 'Editar análise'} · ${esc(a.nome)}</h2>
  <form id="fan">
    <div class="g2 an-g"><label class="f"><span>Data *</span><input class="in" type="date" name="data" value="${esc(x?.data || hoje())}" required></label>
    <label class="f"><span>Título *</span><input class="in" name="titulo" value="${esc(x?.titulo || '')}" placeholder="Ex.: Conversa individual com vídeo de treinos" required></label></div>
    <label class="f"><span>Contexto</span><input class="in" name="contexto" value="${esc(x?.contexto || '')}" placeholder="Ex.: Conversa individual · vídeo de lances de treino · 20 min"></label>
    <label class="f"><span>Análise</span></label>
    ${barraEditor()}
    <textarea class="in ed-txt" name="texto" rows="16" placeholder="Escreva a análise. Use seções para organizar (## Com bola, ## Sem bola...).">${esc(x?.texto || '')}</textarea>
    <div class="doc-txt ed-prev" hidden></div>
    ${dicaEditor()}
    <h3 class="sub">Vídeos</h3>
    <div id="vids">${(x?.videos || []).map(linhaVideo).join('')}</div>
    <button type="button" class="btn sm" id="addv">+ Adicionar vídeo</button>
    <h3 class="sub">Anexos <small class="m">imagens ou PDF, até 10 MB</small></h3>
    <div id="anx" class="anx-lista"></div>
    <button type="button" class="btn sm" id="adda">+ Anexar arquivo</button>
    <div class="mfoot"><span></span><div class="row"><button type="button" class="btn" id="fanc">Cancelar</button><button class="btn pri" type="submit">${novo ? 'Salvar análise' : 'Salvar alterações'}</button></div></div>
  </form>`, true);
  const f = $('#fan');
  ligarEditor(f);
  const pintaAnx = () => {
    $('#anx').innerHTML = [...anexos.map((n, i) => ['a', i, n.nome]), ...novos.map((n, i) => ['n', i, n.name])]
      .map(([t, i, nome]) => `<span class="anx-chip">${esc(nome)}<button type="button" data-rx="${t}:${i}" title="Remover">✕</button></span>`).join('') || '<span class="m">Nenhum anexo.</span>';
  };
  pintaAnx();
  $('#anx').onclick = e => {
    const b = e.target.closest('[data-rx]'); if (!b) return;
    const [t, i] = b.dataset.rx.split(':');
    if (t === 'a') removidos.push(anexos.splice(+i, 1)[0]); else novos.splice(+i, 1);
    pintaAnx();
  };
  $('#adda').onclick = () => {
    const inp = document.createElement('input'); inp.type = 'file'; inp.multiple = true; inp.accept = 'image/jpeg,image/png,image/webp,application/pdf';
    inp.onchange = () => {
      [...inp.files].forEach(fl => {
        if (fl.size > 10 * 1048576) return toast(`${fl.name}: maior que 10 MB.`, true);
        if (!/^(image\/(jpeg|png|webp)|application\/pdf)$/.test(fl.type)) return toast(`${fl.name}: envie imagem ou PDF.`, true);
        novos.push(fl);
      });
      pintaAnx();
    };
    inp.click();
  };
  $('#vids').onclick = e => { const b = e.target.closest('[data-rm]'); if (b) b.closest('.vid-row').remove(); };
  $('#addv').onclick = () => { $('#vids').insertAdjacentHTML('beforeend', linhaVideo()); $('#vids').lastElementChild.querySelector('input').focus(); };
  $('#fanc').onclick = fechar;
  f.onsubmit = async ev => {
    ev.preventDefault();
    const d = formData(f);
    const videos = [...f.querySelectorAll('.vid-row')].map(r => Object.fromEntries([...r.querySelectorAll('[data-v]')].map(i => [i.dataset.v, i.value.trim()]))).filter(v => v.url || v.titulo);
    for (const v of videos) {
      if (!/^https?:\/\//i.test(v.url)) return toast(`Vídeo "${v.titulo || 'sem título'}": cole o link completo (https://…).`, true);
      if (v.inicio && segs(v.inicio) == null) return toast(`Vídeo "${v.titulo || v.url}": início no formato mm:ss.`, true);
    }
    const bt = f.querySelector('[type=submit]'); bt.disabled = true; bt.textContent = 'Salvando…';
    try {
      for (const fl of novos) {
        const ext = (fl.name.match(/\.[a-z0-9]+$/i) || [''])[0].toLowerCase();
        const base = semAcento(fl.name.replace(/\.[^.]+$/, '')).replace(/[^a-z0-9]+/gi, '_').slice(0, 40) || 'anexo';
        const path = `${a.id}/${Date.now()}_${base}${ext}`;
        const { error } = await sb.storage.from('individual').upload(path, fl, { contentType: fl.type });
        if (error) throw error;
        anexos.push({ nome: fl.name, path, tipo: fl.type });
      }
      const reg = { atleta_id: a.id, data: d.data, titulo: d.titulo, contexto: nul(d.contexto), texto: nul(d.texto), videos, anexos };
      const r = novo ? await sb.from('individual_analises').insert(reg).select().single()
                     : await sb.from('individual_analises').update(reg).eq('id', x.id).select().single();
      if (r.error) throw r.error;
      if (removidos.length) sb.storage.from('individual').remove(removidos.map(z => z.path));
      fechar(); toast(novo ? 'Análise registrada.' : 'Análise atualizada.');
      S.ind.an = r.data?.id || x?.id; S.ind.aba = 'analises'; pIndividual();
    } catch (e) { bt.disabled = false; bt.textContent = novo ? 'Salvar análise' : 'Salvar alterações'; toast(erroAmigavel(e), true); }
  };
}

/* ---------- compartilhar (admin) ---------- */
function compartilharInd(a) {
  const membros = (S.perfis || []).filter(p => p.ativo && !p.admin && p.id !== S.perfil.id);
  const nivel = (pid, aid) => S.ind.acessos.find(x => x.perfil_id === pid && (x.atleta_id ?? null) === aid)?.nivel || '';
  const sel = (pid, aid) => `<select class="in" data-pid="${pid}" data-aid="${aid ?? ''}">${opts([['', 'Sem acesso'], ['leitura', 'Leitura'], ['escrita', 'Leitura e escrita']], nivel(pid, aid))}</select>`;
  modal(`<h2>Compartilhar pastas</h2>
    <p class="m" style="margin-top:-6px">As pastas individuais são só suas. Libere aqui, para cada membro da comissão, a pasta de ${esc(a.nome)} ou todas as pastas.</p>
    ${membros.length ? `<div class="tablewrap"><table class="tb ind-share"><thead><tr><th>Membro</th><th>Pasta de ${esc(a.nome)}</th><th>Todas as pastas</th></tr></thead><tbody>
      ${membros.map(p => `<tr><td><b>${esc(p.nome)}</b><div class="m">${esc(FUNCOES[p.funcao] || p.funcao)}</div></td><td>${sel(p.id, a.id)}</td><td>${sel(p.id, null)}</td></tr>`).join('')}
    </tbody></table></div>` : '<p class="empty">Nenhum outro membro com acesso ao CINQ ainda. Libere logins em "Acessos da comissão".</p>'}
    <div class="mfoot"><span></span><div class="row"><button class="btn" id="shc">Cancelar</button>${membros.length ? '<button class="btn pri" id="shs">Salvar</button>' : ''}</div></div>`, true);
  $('#shc').onclick = fechar;
  if (!$('#shs')) return;
  $('#shs').onclick = async () => {
    const mud = [...document.querySelectorAll('#modal select[data-pid]')].map(s => ({ pid: s.dataset.pid, aid: s.dataset.aid ? +s.dataset.aid : null, v: s.value }))
      .filter(m => m.v !== nivel(m.pid, m.aid));
    try {
      for (const m of mud) {
        let q = sb.from('individual_acessos').delete().eq('perfil_id', m.pid);
        q = m.aid == null ? q.is('atleta_id', null) : q.eq('atleta_id', m.aid);
        const del = await q; if (del.error) throw del.error;
        if (m.v) { const ins = await sb.from('individual_acessos').insert({ perfil_id: m.pid, atleta_id: m.aid, nivel: m.v }); if (ins.error) throw ins.error; }
      }
      await carregarAcessosInd(); fechar(); toast(mud.length ? 'Acessos atualizados.' : 'Nada mudou.');
    } catch (e) { toast(erroAmigavel(e), true); }
  };
}

/* ---------- exportar PDF ---------- */
async function exportarAnalise(a, x) {
  const vids = x.videos || [], imgs = (x.anexos || []).filter(f => /^image\//.test(f.tipo));
  const w = document.createElement('div'); w.id = 'print-area'; w.className = 'ind-print';
  w.innerHTML = `<div class="print-head"><img src="${LOGO}" alt=""><div><b>CINQ · Centro de Inteligência do QFC</b><span>Análise individual · documento interno da comissão técnica</span></div></div>
    <div class="ip-atleta">${foto(a)}<div><b>${esc(a.nome)}</b><span>${esc(a.posicao)}${a.idade ? ' · ' + a.idade + ' anos' : ''}${a.pe ? ' · ' + esc(a.pe) : ''}</span></div></div>
    <div class="eyebrow">Análise · ${esc(dataExt(x.data))}</div><h1 class="ip-tit">${esc(x.titulo)}</h1>${x.contexto ? `<p class="doc-ctx">${esc(x.contexto)}</p>` : ''}
    <div class="doc-txt">${mdInd(x.texto)}</div>
    ${vids.length ? `<h3 class="doc-sec">Vídeos</h3><ol class="ip-vids">${vids.map(v => `<li><b>${esc(v.titulo || 'Vídeo')}</b>${v.inicio ? ' · a partir de ' + esc(v.inicio) : ''}${v.nota ? ' · ' + esc(v.nota) : ''}<br><span>${esc(v.url)}</span></li>`).join('')}</ol>` : ''}
    ${imgs.length ? `<h3 class="doc-sec">Anexos</h3>${imgs.map(f => `<img class="ip-img" src="${esc(S.ind.urls[f.path] || '')}" alt="">`).join('')}` : ''}
    <div class="ip-rodape">Quinho Futebol Clube · Comissão técnica · Uso interno</div>`;
  document.body.appendChild(w); document.body.classList.add('imprimindo');
  await Promise.all([...w.querySelectorAll('img')].map(i => i.decode ? i.decode().catch(() => {}) : null));
  const t = document.title; document.title = `CINQ_${a.nome}_${x.data}`;
  setTimeout(() => { window.print(); setTimeout(() => { w.remove(); document.body.classList.remove('imprimindo'); document.title = t; }, 500); }, 150);
}

/* ---------- encaixe no sistema ---------- */
const _carregarInd = carregar;
carregar = async function () { await _carregarInd(); try { await carregarAcessosInd(); } catch (e) { console.error(e); } };

function navInd() {
  const b = [...document.querySelectorAll('#nav button[disabled]')].find(x => x.textContent.trim().startsWith('Técnico individual'));
  if (!b) return;
  if (!indTemAcesso()) { b.remove(); return; }
  const n = document.createElement('button'); n.dataset.p = 'individual'; n.textContent = 'Técnico individual';
  n.classList.toggle('on', S.page === 'individual'); b.replaceWith(n);
}
const _shellInd = shell;
shell = function () { _shellInd(); navInd(); };

const _irInd = ir;
ir = function (p) {
  if (p !== 'individual') return _irInd(p);
  if (!indTemAcesso()) return _irInd('inicio');
  S.page = p;
  document.querySelectorAll('#nav button[data-p]').forEach(b => b.classList.toggle('on', b.dataset.p === p));
  pIndividual(); window.scrollTo(0, 0);
};

const _verAtletaInd = verAtleta;
verAtleta = function (a) {
  _verAtletaInd(a);
  if (!indPodeLer(a.id)) return;
  const r = document.querySelector('#modal .mfoot .row'); if (!r) return;
  const b = document.createElement('button'); b.className = 'btn'; b.textContent = 'Pasta individual';
  b.onclick = () => abrirPastaInd(a.id); r.prepend(b);
};

if (document.getElementById('main') && S.perfil) carregarAcessosInd().then(() => { navInd(); if (S.page === 'individual') ir('individual'); });
