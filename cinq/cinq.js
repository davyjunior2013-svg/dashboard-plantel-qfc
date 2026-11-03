/* CINQ · Centro de Inteligência do QFC */
'use strict';

const SUPABASE_URL = 'https://xucaymymsctgbllwplbm.supabase.co';
const SUPABASE_KEY = 'sb_publishable_UGBRJf6WSRv29tnCoYXatA_kH44SE85';
const INICIO_PRETEMPORADA = '2026-11-02';
const LOGO = 'logo_cinq.png';

const POSICOES = ['Goleiro','Lateral Direito','Lateral Esquerdo','Zagueiro','Volante','Meia','Ponta Direito','Ponta Esquerda','Atacante'];
const TURNOS = ['Manhã','Tarde','Noite'];
const TIPOS = ['Treino','Amistoso','Jogo','Avaliação','Recuperação','Folga'];
const FASES = ['Pré-temporada','Competição','Transição'];
const FUNCOES = {
  tecnico: 'Técnico / Auxiliar',
  fisico: 'Preparação física / Fisiologia',
  fisio: 'Fisioterapia / DM',
  analise: 'Análise de desempenho',
  visualizacao: 'Visualização'
};
const DIAS = ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const S = { user: null, perfil: null, page: 'inicio', atletas: [], sessoes: [], micros: [], perfis: [], historico: [], mapa: [], exercicios: [], urls: {}, semana: null, filtro: { q: '', pos: '', st: '' }, hf: { q: '', pos: '', ord: '' }, editMapa: false };

/* ---------- utilidades ---------- */
const $ = (s, el = document) => el.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12); };
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return ymd(d); };
const hoje = () => ymd(new Date());
const segunda = s => { const d = parse(s); const w = (d.getDay() + 6) % 7; d.setDate(d.getDate() - w); return ymd(d); };
const fmt = s => s ? parse(s).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '';
const fmtLong = s => s ? parse(s).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }) : '';
const turnoOrd = t => TURNOS.indexOf(t);
const opts = (arr, sel, vazio) => (vazio !== undefined ? `<option value="">${esc(vazio)}</option>` : '') + arr.map(o => { const [v, l] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}"${String(v) === String(sel ?? '') ? ' selected' : ''}>${esc(l)}</option>`; }).join('');
const isAdmin = () => !!S.perfil?.admin;
const podeSessoes = () => isAdmin() || ['tecnico', 'analise'].includes(S.perfil?.funcao);
const podeHistorico = () => isAdmin() || S.perfil?.funcao === 'analise';
const podeMapa = () => isAdmin() || ['tecnico', 'analise'].includes(S.perfil?.funcao);
const num = v => (v === null || v === undefined || v === '' ? '—' : Number(v).toLocaleString('pt-BR'));
const dataBR = s => s ? parse(s).toLocaleDateString('pt-BR') : '—';
const histDe = a => S.historico.find(h => h.atleta_id === a.id);
const horaTxt = s => (s.hora ? String(s.hora).slice(0, 5).replace(':', 'h') : s.turno);
const ordSes = (a, b) => a.data.localeCompare(b.data) || String(a.hora || '99').localeCompare(String(b.hora || '99')) || turnoOrd(a.turno) - turnoOrd(b.turno);
const exDe = id => S.exercicios.filter(e => e.sessao_id === id).sort((a, b) => a.ordem - b.ordem || a.id - b.id);
const turnoDaHora = h => { const n = parseInt(h, 10); return isNaN(n) ? 'Manhã' : n < 12 ? 'Manhã' : n < 18 ? 'Tarde' : 'Noite'; };
const ytId = u => { const m = String(u || '').match(/(?:youtu\.be\/|v=|\/embed\/|\/live\/|\/shorts\/)([A-Za-z0-9_-]{11})/); return m ? m[1] : null; };
const segs = t => { if (!t) return null; const p = String(t).trim().split(':').map(Number); if (p.some(isNaN)) return null; return p.reduce((a, v) => a * 60 + v, 0); };
async function urlsAssinadas(paths) {
  if (!S.urlsEm || Date.now() - S.urlsEm > 45 * 60e3) { S.urls = {}; S.urlsEm = Date.now(); }
  const falta = [...new Set(paths.filter(p => p && !S.urls[p]))];
  if (falta.length) { const { data } = await sb.storage.from('planos').createSignedUrls(falta, 3600); (data || []).forEach(d => { if (d.signedUrl) S.urls[d.path] = d.signedUrl; }); }
  return S.urls;
}
function abrirDesenho(src, titulo) {
  let lb = document.getElementById('lightbox');
  if (!lb) { lb = document.createElement('div'); lb.id = 'lightbox'; document.body.appendChild(lb); lb.onclick = () => lb.remove(); }
  lb.innerHTML = `<div class="lb-top"><b>${esc(titulo || '')}</b><button class="btn sm">Fechar ✕</button></div><img src="${esc(src)}" alt="Desenho do exercício">`;
}
const fotoH = h => { const a = S.atletas.find(x => x.id === h.atleta_id); return foto({ ...(a || {}), nome: h.nome, foto_url: h.foto_url || a?.foto_url }); };
const iniciais = n => String(n || '?').trim().slice(0, 1).toUpperCase();
// enquadramento da foto: ponto de foco (padrão: centro na horizontal, parte de cima na vertical) e zoom, ajustados na ficha
const fotoQ = a => ({ x: a?.foto_x ?? 50, y: a?.foto_y ?? 20, z: +a?.foto_zoom || 1 });
const fotoImgSt = a => { const q = fotoQ(a); return `object-position:${q.x}% ${q.y}%${q.z > 1 ? `;transform:scale(${q.z});transform-origin:${q.x}% ${q.y}%` : ''}`; };
const foto = a => !a.foto_url ? `<div class="av">${esc(iniciais(a.nome))}</div>` : fotoQ(a).z > 1 ? `<span class="av avz"><img src="${esc(a.foto_url)}" alt="" style="${fotoImgSt(a)}"></span>` : `<img class="av" src="${esc(a.foto_url)}" alt="" style="${fotoImgSt(a)}">`;
// versão em fundo (usada nos cards: sai certo também na imagem PNG)
const fotoFundo = (a, url = a?.foto_url) => { const q = fotoQ(a); return `<i class="fbg" style="background-image:url('${esc(url)}');background-position:${q.x}% ${q.y}%;transform:scale(${q.z});transform-origin:${q.x}% ${q.y}%"></i>`; };
// troca/envio da foto: reduz no navegador (máx. 800 px, JPEG) e guarda no Storage (bucket fotos); enquadramento volta ao padrão
function trocarFoto(a, depois) {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/jpeg,image/png,image/webp';
  inp.onchange = async () => { const f = inp.files[0]; if (!f) return;
    try {
      const img = await new Promise((ok, err) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => err(new Error('Não consegui abrir a imagem.')); i.src = URL.createObjectURL(f); });
      if (Math.min(img.naturalWidth, img.naturalHeight) < 200) toast(`Foto pequena (${img.naturalWidth}×${img.naturalHeight} px): pode ficar borrada no card. O ideal é 600 px ou mais.`, true);
      const k = Math.min(1, 800 / Math.max(img.naturalWidth, img.naturalHeight)), cv = document.createElement('canvas');
      cv.width = Math.round(img.naturalWidth * k); cv.height = Math.round(img.naturalHeight * k);
      const cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height); cx.drawImage(img, 0, 0, cv.width, cv.height); URL.revokeObjectURL(img.src);
      const blob = await new Promise(ok => cv.toBlob(ok, 'image/jpeg', 0.88));
      const path = `atletas/${a.id}_${Date.now()}.jpg`;
      const up = await sb.storage.from('fotos').upload(path, blob, { contentType: 'image/jpeg', upsert: true }); if (up.error) throw up.error;
      const url = sb.storage.from('fotos').getPublicUrl(path).data.publicUrl, ant = a.foto_url;
      const v = { foto_url: url, foto_x: null, foto_y: null, foto_zoom: null };
      const { error } = await sb.from('atletas').update(v).eq('id', a.id); if (error) throw error;
      Object.assign(a, v); const at = S.atletas.find(x => x.id === a.id); if (at && at !== a) Object.assign(at, v);
      const m = ant && ant.match(/\/storage\/v1\/object\/public\/fotos\/(.+)$/); if (m) sb.storage.from('fotos').remove([decodeURIComponent(m[1])]).catch(() => {});
      toast('Foto trocada. Ajuste o enquadramento se precisar.'); try { ir(S.page); } catch (e) {} depois();
    } catch (e) { toast(erroAmigavel(e), true); } };
  inp.click();
}
function ajustarFoto(a, depois) {
  if (!a.foto_url) return trocarFoto(a, () => ajustarFoto(a, depois));
  let q = fotoQ(a); const url = esc(a.foto_url);
  modal(`<h2>Ajustar foto · ${esc(a.nome)}</h2><p class="m">Arraste a foto dentro da moldura para posicionar e use o zoom. Vale para todo o CINQ (elenco, mapa, DM, cards).</p>
    <div class="aj-wrap"><div><span class="aj-c aj-fr" data-aj="c"><img src="${url}" alt=""></span><small class="m">Elenco, mapa e listas</small></div>
      <div><span class="aj-r aj-fr" data-aj="r"><img src="${url}" alt=""></span><small class="m">Card do atleta</small></div></div>
    <label class="f"><span>Zoom</span><input type="range" id="ajz" min="1" max="3" step="0.05" value="${q.z}"></label>
    <div class="mfoot"><div class="row"><button class="btn" id="ajt">Trocar foto</button><button class="btn" id="ajp">Voltar ao padrão</button></div><div class="row"><button class="btn" id="ajc">Cancelar</button><button class="btn pri" id="ajs">Salvar</button></div></div>`);
  $('#ajt').onclick = () => trocarFoto(a, () => ajustarFoto(a, depois));
  const pinta = () => document.querySelectorAll('.aj-fr img').forEach(i => { i.style.cssText = `object-position:${q.x}% ${q.y}%;transform:scale(${q.z});transform-origin:${q.x}% ${q.y}%`; });
  pinta();
  document.querySelectorAll('.aj-fr').forEach(fr => fr.onpointerdown = e => { e.preventDefault(); fr.setPointerCapture(e.pointerId); const x0 = e.clientX, y0 = e.clientY, q0 = { ...q }, w = fr.clientWidth, h = fr.clientHeight;
    fr.onpointermove = m => { const cl = v => Math.round(Math.max(0, Math.min(100, v))); q.x = cl(q0.x - (m.clientX - x0) / w * 100 / q.z * 1.6); q.y = cl(q0.y - (m.clientY - y0) / h * 100 / q.z * 1.6); pinta(); };
    fr.onpointerup = () => { fr.onpointermove = null; }; });
  $('#ajz').oninput = e => { q.z = +e.target.value; pinta(); };
  $('#ajp').onclick = () => { q = { x: 50, y: 20, z: 1 }; $('#ajz').value = 1; pinta(); };
  $('#ajc').onclick = () => depois ? depois() : fechar();
  $('#ajs').onclick = async () => { const v = { foto_x: q.x, foto_y: q.y, foto_zoom: q.z };
    const { error } = await sb.from('atletas').update(v).eq('id', a.id); if (error) return toast(erroAmigavel(error), true);
    Object.assign(a, v); const at = S.atletas.find(x => x.id === a.id); if (at) Object.assign(at, v); toast('Enquadramento salvo.'); try { ir(S.page); } catch (e) {} depois ? depois() : fechar(); };
}

function toast(msg, bad = false) {
  const t = $('#toast'); t.textContent = msg; t.className = 'toast' + (bad ? ' bad' : ''); t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), bad ? 6000 : 2800);
}
function erroAmigavel(e) {
  const m = e?.message || String(e);
  if (/Invalid login credentials/i.test(m)) return 'E-mail ou senha incorretos.';
  if (/Bucket not found/i.test(m)) return 'Armazenamento de planos não encontrado.';
  if (/mime type|file size/i.test(m)) return 'Arquivo não aceito (envie o PDF do plano, até 10 MB).';
  if (/duplicate key.*atletas_nome/i.test(m)) return 'Já existe um atleta com esse nome.';
  if (/row-level security|permission denied/i.test(m)) return 'Seu perfil não tem permissão para essa alteração.';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'Sem conexão com o servidor. Verifique a internet.';
  return m;
}
function modal(html, largo = false) { const m = $('#modal'); m.innerHTML = `<div class="mbox${largo ? ' wide' : ''}">${html}</div>`; m.hidden = false; m.scrollTop = 0; }
function fechar() { const m = $('#modal'); m.hidden = true; m.innerHTML = ''; }
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') fechar(); });
document.addEventListener('keydown', e => { if (e.key !== 'Escape') return; const lb = document.getElementById('lightbox'); lb ? lb.remove() : fechar(); });
const formData = form => Object.fromEntries([...new FormData(form).entries()].map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v]));
const nul = v => (v === '' || v === undefined ? null : v);

/* ---------- autenticação ---------- */
function telaLogin(msg = '') {
  $('#app').innerHTML = `
  <div class="login"><form class="login-box" id="flogin">
    <img src="${LOGO}" alt="QFC">
    <h1>CINQ</h1><p class="sub">Centro de Inteligência do QFC</p>
    <label class="f"><span>E-mail</span><input class="in" name="email" type="email" autocomplete="username" required></label>
    <label class="f"><span>Senha</span><input class="in" name="senha" type="password" autocomplete="current-password" required></label>
    <button class="btn pri" style="width:100%" type="submit">Entrar</button>
    <div class="err" id="lerr">${esc(msg)}</div>
    <p class="sub" style="margin:14px 0 0">Esqueceu a senha ou ainda não tem acesso? Fale com o administrador do CINQ.</p>
  </form></div>`;
  $('#flogin').addEventListener('submit', async e => {
    e.preventDefault();
    const f = formData(e.target), b = e.target.querySelector('button');
    b.disabled = true; b.textContent = 'Entrando…'; $('#lerr').textContent = '';
    const { error } = await sb.auth.signInWithPassword({ email: f.email, password: f.senha });
    if (error) { $('#lerr').textContent = erroAmigavel(error); b.disabled = false; b.textContent = 'Entrar'; return; }
    await iniciar();
  });
}

async function sair() { await sb.auth.signOut(); S.user = S.perfil = null; telaLogin(); }

async function iniciar() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return telaLogin();
  S.user = session.user;
  const { data: perfil, error } = await sb.from('perfis').select('*').eq('id', S.user.id).maybeSingle();
  if (error) return telaLogin(erroAmigavel(error));
  if (!perfil || !perfil.ativo) {
    $('#app').innerHTML = `<div class="login"><div class="login-box"><img src="${LOGO}" alt=""><h1>CINQ</h1>
      <p class="sub">Seu login (${esc(S.user.email)}) ainda não está liberado na comissão. Fale com o administrador do CINQ.</p>
      <button class="btn" style="width:100%" id="bsair">Sair</button></div></div>`;
    $('#bsair').onclick = sair; return;
  }
  S.perfil = perfil;
  await carregar();
  shell();
}

/* ---------- dados ---------- */
async function carregar() {
  const [a, s, m, h, t, ex] = await Promise.all([
    sb.from('atletas').select('*').order('nome'),
    sb.from('sessoes').select('*').order('data').order('turno'),
    sb.from('microciclos').select('*').order('inicio'),
    sb.from('historico').select('*').order('nome'),
    sb.from('mapa_tatico').select('*').order('ordem'),
    sb.from('exercicios').select('*').order('ordem')
  ]);
  for (const r of [a, s, m, h, t, ex]) if (r.error) toast(erroAmigavel(r.error), true);
  S.exercicios = ex.data || [];
  S.atletas = a.data || []; S.sessoes = s.data || []; S.micros = m.data || []; S.historico = h.data || []; S.mapa = t.data || [];
  if (isAdmin()) { const p = await sb.from('perfis').select('*').order('nome'); S.perfis = p.data || []; }
}

/* ---------- estrutura ---------- */
const PAGINAS = [
  ['inicio', 'Painel Geral'], ['calendario', 'Calendário'], ['elenco', 'Elenco'], ['mapa', 'Mapa tático'], ['historico', 'Histórico']
];
const EM_BREVE = ['Fisiologia', 'Fisioterapia / DM', 'Técnico individual', 'Amistosos'];

function shell() {
  $('#app').innerHTML = `
  <div class="shell">
    <aside class="side">
      <div class="brand"><img src="${LOGO}" alt="QFC"><div><b>CINQ</b><span>Centro de Inteligência do QFC</span></div></div>
      <nav class="nav" id="nav">
        <div class="sec">Geral</div>
        ${PAGINAS.map(([k, l]) => `<button data-p="${k}">${l}</button>`).join('')}
        <div class="sec">Comissão</div>
        ${EM_BREVE.map(l => `<button disabled title="Em construção">${l} <small>em breve</small></button>`).join('')}
        ${isAdmin() ? `<div class="sec">Administração</div><button data-p="comissao">Acessos da comissão</button>` : ''}
      </nav>
      <div class="me"><div><b>${esc(S.perfil.nome)}</b>${esc(FUNCOES[S.perfil.funcao] || S.perfil.funcao)}${isAdmin() ? ' · admin' : ''}</div><button id="bsair">Sair</button></div>
    </aside>
    <main class="main" id="main"></main>
  </div>`;
  $('#bsair').onclick = sair;
  $('#nav').addEventListener('click', e => { const b = e.target.closest('button[data-p]'); if (b) ir(b.dataset.p); });
  ir(S.page);
}

function ir(p) {
  S.page = p;
  document.querySelectorAll('#nav button[data-p]').forEach(b => b.classList.toggle('on', b.dataset.p === p));
  ({ inicio: pInicio, calendario: pCalendario, elenco: pElenco, mapa: pMapa, historico: pHistorico, comissao: pComissao }[p] || pInicio)();
  window.scrollTo(0, 0);
}

const topo = (eyebrow, titulo, sub, acoes = '') => `<div class="top"><div><div class="eyebrow">${esc(eyebrow)}</div><h1>${esc(titulo)}</h1>${sub ? `<p>${esc(sub)}</p>` : ''}</div><div class="row">${acoes}</div></div>`;

/* ---------- Início ---------- */
function pInicio() {
  const h = hoje(), ini = segunda(h), fim = addDays(ini, 6);
  const ativos = S.atletas.filter(a => a.ativo && a.status !== 'Inativo');
  const semana = S.sessoes.filter(s => s.data >= ini && s.data <= fim && s.tipo !== 'Folga');
  const prox = S.sessoes.filter(s => s.data >= h).sort(ordSes)[0];
  const hojeS = S.sessoes.filter(s => s.data === h).sort(ordSes);
  const diasPre = Math.round((parse(INICIO_PRETEMPORADA) - parse(h)) / 864e5);
  const micro = S.micros.find(m => m.inicio <= h && m.fim >= h);
  const amistosos = S.sessoes.filter(s => s.tipo === 'Amistoso' && s.data >= h).length;
  $('#main').innerHTML = topo('CINQ · Painel Geral', `Olá, ${S.perfil.nome}`, fmtLong(h).replace(/^./, c => c.toUpperCase())) + `
  <div class="cards">
    <div class="card hl"><div class="l">${diasPre > 0 ? 'Início da pré-temporada' : 'Pré-temporada'}</div><div class="v">${diasPre > 0 ? `${diasPre} dia${diasPre > 1 ? 's' : ''}` : `Dia ${1 - diasPre}`}</div><div class="s">${diasPre > 0 ? 'Começa em ' + fmt(INICIO_PRETEMPORADA) : micro ? esc(micro.nome) : 'Em andamento'}</div></div>
    <div class="card"><div class="l">Atletas no elenco</div><div class="v">${ativos.length}</div><div class="s">${ativos.filter(a => a.status === 'Titular').length} titulares</div></div>
    <div class="card"><div class="l">Sessões nesta semana</div><div class="v">${semana.length}</div><div class="s">${fmt(ini)} a ${fmt(fim)}</div></div>
    <div class="card"><div class="l">Próximos amistosos</div><div class="v">${amistosos}</div><div class="s">agendados no calendário</div></div>
  </div>
  <div class="grid2">
    <div class="panel"><h2>Atletas por posição</h2>${barrasPosicao(ativos)}</div>
    <div class="panel"><h2>Status do elenco</h2><div class="stat3">${['Titular', 'Ativo', 'Inativo'].map(st => `<div><b>${S.atletas.filter(a => a.status === st).length}</b><span>${st}</span></div>`).join('')}</div>
      <div class="stat3" style="margin-top:10px"><div><b>${S.historico.filter(h => h.ativo_competicao).length}</b><span>Ativos em competição</span></div><div><b>${S.historico.filter(h => /voltando de les/i.test(h.observacao || '')).length}</b><span>Voltando de lesão</span></div><div><b>${S.atletas.filter(a => a.contrato_fim && a.contrato_fim >= h && a.contrato_fim <= addDays(h, 60)).length}</b><span>Contratos vencendo (60 dias)</span></div></div></div>
  </div>
  <div class="panel"><h2>Hoje</h2>${hojeS.length ? hojeS.map(cardSessaoLinha).join('') : '<div class="empty">Nenhuma sessão registrada para hoje.</div>'}</div>
  <div class="panel"><h2>Próxima sessão</h2>${prox ? cardSessaoLinha(prox) : `<div class="empty">Nenhuma sessão futura no calendário.${podeSessoes() ? ' Cadastre a primeira em Calendário.' : ''}</div>`}</div>`;
  document.querySelectorAll('[data-ses]').forEach(el => el.onclick = () => verSessao(+el.dataset.ses));
}
function barrasPosicao(lista) {
  const c = POSICOES.map(p => [p, lista.filter(a => a.posicao === p).length]).filter(x => x[1]);
  const max = Math.max(1, ...c.map(x => x[1]));
  return c.map(([p, n]) => `<div class="bar"><span>${esc(p)}</span><div><i style="width:${n / max * 100}%"></i></div><b>${n}</b></div>`).join('') || '<div class="empty">Sem atletas.</div>';
}
const cardSessaoLinha = s => `<div class="ses" data-ses="${s.id}" style="margin-bottom:8px"><div class="tt"><span>${esc(fmtLong(s.data))} · ${esc(horaTxt(s))}${exDe(s.id).length ? ' · ' + exDe(s.id).length + ' exercícios' : ''}</span><span class="badge t-${esc(s.tipo)}">${esc(s.tipo)}</span></div><div class="ti">${esc(s.titulo || (s.tipo === 'Amistoso' && s.adversario ? 'x ' + s.adversario : '') || exDe(s.id).map(e => e.nome).join(' · ') || s.objetivo || s.tipo)}</div></div>`;

/* ---------- Calendário ---------- */
function pCalendario() {
  if (!S.semana) S.semana = segunda(hoje() < INICIO_PRETEMPORADA ? INICIO_PRETEMPORADA : hoje());
  const ini = S.semana, fim = addDays(ini, 6), h = hoje();
  const micro = S.micros.find(m => m.inicio <= fim && m.fim >= ini);
  const dias = [...Array(7)].map((_, i) => addDays(ini, i));
  $('#main').innerHTML = topo('CINQ · Organização de treino', 'Calendário', 'Semanas, sessões e planejamento',
    `<button class="btn" id="bmicros">Microciclos</button>${podeSessoes() ? '<button class="btn" id="bimport">Importar planos de treino</button><button class="btn pri" id="bnova">+ Sessão</button>' : ''}`) + `
  <div class="weekbar">
    <button class="btn sm" id="bprev">◀</button><b>${fmt(ini)} a ${fmt(fim)}</b><button class="btn sm" id="bnext">▶</button>
    <button class="btn sm" id="bhoje">Semana atual</button>
    ${micro ? `<span class="micro">${esc(micro.nome)} · ${esc(micro.fase)}${micro.objetivo ? ' · ' + esc(micro.objetivo) : ''}</span>` : ''}
  </div>
  <div class="week">${dias.map((d, i) => {
    const ss = S.sessoes.filter(s => s.data === d).sort(ordSes);
    return `<div class="day${d === h ? ' today' : ''}"><h3>${DIAS[i]} <em>${fmt(d)}</em></h3>
      ${ss.map(s => { const ex = exDe(s.id); return `<div class="ses" data-ses="${s.id}"><div class="tt"><span>${esc(horaTxt(s))}</span><span class="badge t-${esc(s.tipo)}">${esc(s.tipo)}</span></div><div class="ti">${esc(s.titulo || (s.adversario ? 'x ' + s.adversario : '') || (ex[0] ? ex.map(e => e.nome).join(' · ') : s.objetivo || ''))}</div>${ex.length || s.video_url ? `<div class="sesmeta">${ex.length ? ex.length + ' exercício' + (ex.length > 1 ? 's' : '') : ''}${ex.length && s.video_url ? ' · ' : ''}${s.video_url ? 'vídeo' : ''}</div>` : ''}</div>`; }).join('')}
      ${podeSessoes() ? `<button class="addses" data-add="${d}">+ adicionar</button>` : ''}</div>`;
  }).join('')}</div>`;
  $('#bprev').onclick = () => { S.semana = addDays(S.semana, -7); pCalendario(); };
  $('#bnext').onclick = () => { S.semana = addDays(S.semana, 7); pCalendario(); };
  $('#bhoje').onclick = () => { S.semana = segunda(hoje()); pCalendario(); };
  $('#bmicros').onclick = verMicros;
  if ($('#bimport')) $('#bimport').onclick = () => escolherPlanos(null);
  if ($('#bnova')) $('#bnova').onclick = () => formSessao({ data: ini < h && fim >= h ? h : ini });
  document.querySelectorAll('[data-add]').forEach(b => b.onclick = () => formSessao({ data: b.dataset.add }));
  document.querySelectorAll('[data-ses]').forEach(el => el.onclick = () => verSessao(+el.dataset.ses));
}

function verSessao(id, foco) {
  const s = S.sessoes.find(x => x.id === id); if (!s) return;
  const micro = S.micros.find(m => m.id === s.microciclo_id), ex = exDe(id), pode = podeSessoes(), yt = ytId(s.video_url);
  const total = ex.reduce((a, e) => a + (e.duracao_min || 0), 0), jog = Math.max(0, ...ex.map(e => e.jogadores || 0));
  const campo = (k, v) => v ? `<div class="k">${k}</div><p class="pre">${esc(v)}</p>` : '';
  modal(`<div class="sh"><div><div class="eyebrow">${esc(s.tipo)}${micro ? ' · ' + esc(micro.nome) : ''}</div><h2>${esc(fmtLong(s.data)).replace(/^./, c => c.toUpperCase())} · ${esc(horaTxt(s))}${s.local ? ' · ' + esc(s.local) : ''}</h2>
    ${s.titulo || s.adversario ? `<p class="m" style="margin:0">${esc(s.titulo || '')}${s.adversario ? ' x ' + esc(s.adversario) : ''}</p>` : ''}</div>
    <div class="row">${pode ? '<button class="btn sm" id="sedit">Editar sessão</button>' : ''}<button class="btn sm" id="sfechar">Fechar</button></div></div>
  ${micro?.objetivo ? `<div class="note"><b>Objetivo da semana:</b> ${esc(micro.objetivo)}</div>` : ''}
  <div class="panel video">${yt ? `<div class="yt"><iframe id="ytf" src="https://www.youtube-nocookie.com/embed/${yt}" title="Vídeo do treino" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe></div><div class="row" style="margin-top:8px"><a class="btn sm" href="${esc(s.video_url)}" target="_blank" rel="noopener">Abrir no YouTube ↗</a>${pode ? '<button class="btn sm" id="svid">Trocar vídeo</button>' : ''}</div>`
    : `<div class="vazio-video"><b>Vídeo do treino</b><span>${pode ? 'Depois de gravar, suba no YouTube como <b>Não listado</b> e cole o link aqui.' : 'O vídeo ainda não foi adicionado.'}</span>${pode ? '<button class="btn sm pri" id="svid">Adicionar link do vídeo</button>' : ''}</div>`}</div>
  ${ex.length ? `<div class="panel"><h2>Resumo do treino</h2>
    <div class="metric-grid"><div><b>${ex.length}</b><span>Exercícios</span></div><div><b>${total ? total + "'" : '—'}</b><span>Tempo total</span></div><div><b>${jog || '—'}</b><span>Jogadores (máx.)</span></div><div><b>${esc(ex[0].periodo || '—')}</b><span>Período</span></div></div>
    <div class="k" style="margin-top:12px">Sequência de comportamentos-chave</div>
    <ol class="seq">${ex.map(e => `<li><b>${esc(e.nome)}</b>${espacoTxt(e) || e.espaco ? ` <small class="m">· ${esc([espacoTxt(e), m2Jog(e) ? m2Jog(e) + ' m²/jog.' : '', e.espaco, e.direcionamento].filter(Boolean).join(' · '))}</small>` : ''}<br><span>${esc(e.comportamento || '—')}</span></li>`).join('')}</ol>
    <div class="k">Material</div><ul class="mat">${ex.map(e => e.material ? `<li><b>${e.ordem}.</b> ${esc(e.material)}</li>` : '').join('')}</ul></div>` : ''}
  <div class="exhead"><h2>Exercícios</h2>${pode ? '<div class="row"><button class="btn sm" id="sexman">+ Exercício sem PDF</button><button class="btn pri sm" id="splanos">+ Adicionar planos de treino (PDF)</button></div>' : ''}</div>
  <div id="exlist">${ex.length ? ex.map((e, i) => cardExercicio(e, i, ex.length, pode, !!yt)).join('') : `<div class="panel empty">Nenhum plano de treino nesta sessão.${pode ? ' Clique em <b>Adicionar planos de treino</b> e selecione os PDFs do Dossier do Treinador.' : ''}</div>`}</div>
  ${s.objetivo || s.conteudo || s.observacoes ? `<div class="panel detail">${campo('Objetivo (manual)', s.objetivo)}${campo('Conteúdo (manual)', s.conteudo)}${campo('Observações', s.observacoes)}</div>` : ''}`, true);
  $('#sfechar').onclick = fechar;
  if ($('#sedit')) $('#sedit').onclick = () => formSessao(s);
  if ($('#svid')) $('#svid').onclick = async () => {
    const u = prompt('Cole o link do vídeo no YouTube (de preferência "Não listado"):', s.video_url || '');
    if (u === null) return;
    if (u && !ytId(u)) return toast('Não reconheci esse link do YouTube.', true);
    const { data, error } = await sb.from('sessoes').update({ video_url: u || null }).eq('id', s.id).select().single();
    if (error) return toast(erroAmigavel(error), true);
    S.sessoes = S.sessoes.map(x => x.id === data.id ? data : x); toast(u ? 'Vídeo adicionado.' : 'Vídeo removido.'); verSessao(id);
  };
  if ($('#splanos')) $('#splanos').onclick = () => escolherPlanos(s);
  if ($('#sexman')) $('#sexman').onclick = () => formExercicio({ sessao_id: s.id, nome: '', periodo: ex[0]?.periodo || null });
  urlsAssinadas(ex.flatMap(e => [e.img_path, e.pdf_path])).then(u => {
    document.querySelectorAll('img[data-img]').forEach(im => { if (u[im.dataset.img]) im.src = u[im.dataset.img]; });
    document.querySelectorAll('a[data-pdf]').forEach(a => { if (u[a.dataset.pdf]) a.href = u[a.dataset.pdf]; });
  });
  const box = $('#exlist');
  box.onclick = async e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const ex1 = S.exercicios.find(x => x.id === +b.dataset.ex), act = b.dataset.act;
    if (act === 'desc') { const d = $(`#desc${ex1.id}`); d.hidden = !d.hidden; b.textContent = d.hidden ? 'Descrição completa' : 'Ocultar descrição'; }
    if (act === 'pdf') { if (!b.getAttribute('href') || b.getAttribute('href') === '#') { e.preventDefault(); toast('O PDF ainda está carregando, tente de novo.'); } return; }
    if (act === 'img') { if (b.src) abrirDesenho(b.src, ex1.nome); else toast('O desenho ainda está carregando.'); return; }
    if (act === 'play') { const f = $('#ytf'); if (f) { f.src = `https://www.youtube-nocookie.com/embed/${yt}?start=${segs(ex1.video_inicio) || 0}&autoplay=1`; $('#modal').scrollTop = 0; } }
    if (act === 'edit') formExercicio(ex1);
    if (act === 'up' || act === 'down') {
      const lst = exDe(id), k = lst.findIndex(x => x.id === ex1.id), o = lst[act === 'up' ? k - 1 : k + 1]; if (!o) return;
      const a1 = ex1.ordem, a2 = o.ordem === a1 ? a1 + (act === 'up' ? -1 : 1) : o.ordem;
      const r1 = await sb.from('exercicios').update({ ordem: a2 }).eq('id', ex1.id), r2 = await sb.from('exercicios').update({ ordem: a1 }).eq('id', o.id);
      if (r1.error || r2.error) return toast(erroAmigavel(r1.error || r2.error), true);
      ex1.ordem = a2; o.ordem = a1; verSessao(id);
    }
    if (act === 'del') {
      if (!confirm(`Remover "${ex1.nome}" desta sessão? O PDF também será apagado.`)) return;
      const { error } = await sb.from('exercicios').delete().eq('id', ex1.id);
      if (error) return toast(erroAmigavel(error), true);
      await sb.storage.from('planos').remove([ex1.pdf_path, ex1.img_path].filter(Boolean));
      S.exercicios = S.exercicios.filter(x => x.id !== ex1.id); toast('Exercício removido.'); verSessao(id); if (S.page === 'calendario') pCalendario();
    }
  };
  if (foco) { const el = document.getElementById('ex' + foco); if (el) el.scrollIntoView({ block: 'center' }); }
}

/* ---------- espaço do exercício (referência do QFC: espaço → direcionamento → métrica) ---------- */
const ESPACOS = ['Grande', 'Médio', 'Pequeno'];
const DIRECAO_ESPACO = { Grande: 'Resistência', 'Médio': 'Velocidade', Pequeno: 'Força' };
const METRICA_DIRECAO = { 'Resistência': 'Distância', Velocidade: 'Sprint', 'Força': 'Acc/Dcc' };
function dimDoTexto(t) {
  const m = String(t || '').match(/(\d{2,3}(?:[.,]\d+)?)\s*[xX×]\s*(\d{2,3}(?:[.,]\d+)?)\s*m/); if (!m) return null;
  const a = +m[1].replace(',', '.'), b = +m[2].replace(',', '.');
  return Math.max(a, b) <= 150 && Math.min(a, b) <= 100 ? { comprimento: Math.max(a, b), largura: Math.min(a, b) } : null;
}
const areaEx = e => e.comprimento && e.largura ? Math.round(e.comprimento * e.largura) : null;
const m2Jog = e => areaEx(e) && e.jogadores ? Math.round(areaEx(e) / e.jogadores) : null;
const numBR = v => v == null || v === '' ? '' : String(v).replace('.', ',');
const espacoTxt = e => e.comprimento && e.largura ? `${numBR(e.comprimento)} × ${numBR(e.largura)} m` : '';
const seriesTxt = e => e.series && e.tempo_serie_min ? `${e.series} × ${numBR(e.tempo_serie_min)}'${e.pausa_min != null ? ` · pausa ${numBR(e.pausa_min)}'` : ''}` : '';
function avisoEspaco(e) {
  if (!e.espaco || !e.direcionamento || DIRECAO_ESPACO[e.espaco] === e.direcionamento) return '';
  const d = DIRECAO_ESPACO[e.espaco];
  return `Espaço ${e.espaco.toLowerCase()} com direcionamento ${e.direcionamento.toLowerCase()}: pela referência do QFC, espaço ${e.espaco.toLowerCase()} trabalha ${d.toLowerCase()} (métrica: ${METRICA_DIRECAO[d]}). Confirmar com o treinador.`;
}

function cardExercicio(e, i, n, pode, temVideo) {
  const lista = t => (t || '').split('\n').filter(Boolean).map(l => `<li>${esc(l)}</li>`).join('');
  return `<div class="panel exc" id="ex${e.id}">
    <div class="exc-top"><div class="exn">${e.ordem}</div><div style="flex:1;min-width:0"><h3>${esc(e.nome)}</h3>
      <div class="row tags">${e.numero_plano ? `<span class="badge">Plano ${e.numero_plano}</span>` : ''}${e.jogadores ? `<span class="badge">${e.jogadores} jogadores</span>` : ''}${e.duracao_min ? `<span class="badge t-Treino">${e.duracao_min} min</span>` : (pode ? '<span class="badge s-Inativo">sem tempo</span>' : '')}${e.video_inicio ? `<span class="badge t-Amistoso">vídeo ${esc(e.video_inicio)}</span>` : ''}${espacoTxt(e) ? `<span class="badge ex-esp">${esc(espacoTxt(e))}${m2Jog(e) ? ` · ${m2Jog(e)} m²/jog.` : ''}</span>` : (pode ? '<span class="badge s-Inativo">sem tamanho</span>' : '')}${e.espaco ? `<span class="badge ex-dir">${esc(e.espaco)}${e.direcionamento ? ` · ${esc(e.direcionamento)} → ${esc(METRICA_DIRECAO[e.direcionamento])}` : ''}</span>` : ''}${seriesTxt(e) ? `<span class="badge">${esc(seriesTxt(e))}</span>` : ''}${e.nome_gerado ? `<span class="m" title="Nome criado a partir do objetivo">no plano: “${esc(e.titulo_original || '')}”</span>` : ''}</div></div>
      ${pode ? `<div class="row"><button class="btn sm" data-act="up" data-ex="${e.id}" ${i === 0 ? 'disabled' : ''} title="Subir">↑</button><button class="btn sm" data-act="down" data-ex="${e.id}" ${i === n - 1 ? 'disabled' : ''} title="Descer">↓</button></div>` : ''}</div>
    ${avisoEspaco(e) ? `<div class="note ex-aviso">⚠️ ${esc(avisoEspaco(e))}</div>` : ''}
    <div class="exc-body">
      ${e.img_path ? `<img class="diag" data-img="${esc(e.img_path)}" data-act="img" data-ex="${e.id}" alt="Desenho do exercício" title="Abrir desenho em tamanho maior">` : ''}
      <div class="exc-txt">
        ${e.comportamento ? `<div class="comp"><span>Comportamento-chave</span>${esc(e.comportamento).replace(/\n/g, '<br>')}</div>` : ''}
        ${e.objetivo ? `<div class="k">Objetivo</div><p class="pre">${esc(e.objetivo)}</p>` : ''}
        ${e.indicadores ? `<div class="k">Indicadores de êxito</div><ul class="ind">${lista(e.indicadores)}</ul>` : ''}
        ${e.material ? `<div class="k">Material e espaço</div><p class="pre">${esc(e.material)}</p>` : ''}
      </div>
    </div>
    <div id="desc${e.id}" hidden><div class="k">Descrição e organização metodológica</div><p class="pre">${esc(e.descricao || '—')}</p></div>
    ${e.balanco ? `<div class="balanco"><span>Observações / balanço</span><p class="pre">${esc(e.balanco)}</p></div>` : ''}
    <div class="row exc-act"><button class="btn sm" data-act="desc" data-ex="${e.id}">Descrição completa</button>${e.pdf_path ? `<a class="btn sm" href="#" target="_blank" rel="noopener" data-act="pdf" data-pdf="${esc(e.pdf_path)}" data-ex="${e.id}">PDF original ↗</a>` : ''}${temVideo && e.video_inicio ? `<button class="btn sm" data-act="play" data-ex="${e.id}">▶ Ver no vídeo</button>` : ''}${pode ? `<button class="btn sm pri" data-act="edit" data-ex="${e.id}">Editar exercício</button><button class="btn sm dan" data-act="del" data-ex="${e.id}">Remover</button>` : ''}</div>
  </div>`;
}

function formExercicio(e) {
  const novo = !e.id, v = k => esc(e[k] ?? ''), ta = (k, rot, rows = 3, ph = '') => `<label class="f"><span>${rot}</span><textarea class="in" name="${k}" rows="${rows}" placeholder="${ph}">${v(k)}</textarea></label>`;
  modal(`<h2>${novo ? 'Novo exercício' : 'Editar exercício'}</h2>
  ${!novo && e.pdf_path ? '<p class="m">Os campos vieram do PDF do plano de treino. O que mudar aqui vale para o CINQ; o PDF original continua guardado.</p>' : ''}
  <form id="fex">
    <div class="g3"><label class="f" style="grid-column:span 2"><span>Nome do exercício *</span><input class="in" name="nome" value="${v('nome')}" required></label>
      <label class="f"><span>Nº do plano</span><input class="in" type="number" min="1" name="numero_plano" value="${v('numero_plano')}"></label></div>
    <h3 class="fx-h">Espaço e organização</h3>
    <div class="g4"><label class="f"><span>Comprimento (m)</span><input class="in" type="number" min="1" max="150" step="0.5" name="comprimento" value="${v('comprimento')}" placeholder="ex.: 40"></label>
      <label class="f"><span>Largura (m)</span><input class="in" type="number" min="1" max="100" step="0.5" name="largura" value="${v('largura')}" placeholder="ex.: 30"></label>
      <label class="f"><span>Jogadores</span><input class="in" type="number" min="1" max="40" name="jogadores" value="${v('jogadores')}"></label>
      <div class="f"><span>Área</span><div class="fx-calc" id="fxarea">—</div></div></div>
    <div class="g3"><label class="f"><span>Tipo de espaço</span><select class="in" name="espaco">${opts(ESPACOS, e.espaco, '—')}</select></label>
      <label class="f"><span>Direcionamento</span><select class="in" name="direcionamento">${opts(Object.keys(METRICA_DIRECAO), e.direcionamento, '—')}</select></label>
      <div class="f"><span>Métrica-alvo</span><div class="fx-calc" id="fxmet">—</div></div></div>
    <p class="m fx-ref">Referência do QFC: espaço grande → resistência → distância · médio → velocidade → sprint · pequeno → força → acelerações e desacelerações.</p>
    <div class="note ex-aviso" id="fxaviso" hidden></div>
    <h3 class="fx-h">Tempo</h3>
    <div class="g4"><label class="f"><span>Séries</span><input class="in" type="number" min="1" max="30" name="series" value="${v('series')}"></label>
      <label class="f"><span>Tempo por série (min)</span><input class="in" type="number" min="0.25" step="0.25" name="tempo_serie_min" value="${v('tempo_serie_min')}"></label>
      <label class="f"><span>Pausa (min)</span><input class="in" type="number" min="0" step="0.25" name="pausa_min" value="${v('pausa_min')}"></label>
      <label class="f"><span>Tempo total (min)</span><input class="in" type="number" min="0" max="300" name="duracao_min" value="${v('duracao_min')}" placeholder="ex.: 20"></label></div>
    <div class="g2"><label class="f"><span>Período</span><input class="in" name="periodo" value="${v('periodo')}" placeholder="ex.: Preparatório"></label>
      <label class="f"><span>Início no vídeo (mm:ss)</span><input class="in" name="video_inicio" value="${v('video_inicio')}" placeholder="Ex.: 12:30 ou 1:05:10"></label></div>
    <h3 class="fx-h">Conteúdo</h3>
    ${ta('comportamento', 'Comportamento-chave', 2)}${ta('objetivo', 'Objetivo', 3)}${ta('indicadores', 'Indicadores de êxito (um por linha)', 3)}
    ${ta('material', 'Material e espaço', 2, 'fitas de marcação, discos, 2 traves...')}${ta('descricao', 'Descrição e organização metodológica', 5)}
    ${ta('balanco', 'Observações / balanço', 3, 'Como o exercício funcionou, ajustes, comportamentos que apareceram ou não…')}
    <div class="mfoot"><span></span><div class="row"><button type="button" class="btn" id="exvolta">Voltar</button><button class="btn pri" type="submit">Salvar</button></div></div>
  </form>`, true);
  const f0 = $('#fex'), val = n => f0.querySelector(`[name=${n}]`).value;
  const atualiza = () => {
    const x = { comprimento: +val('comprimento') || null, largura: +val('largura') || null, jogadores: +val('jogadores') || null };
    $('#fxarea').textContent = areaEx(x) ? `${areaEx(x).toLocaleString('pt-BR')} m²${m2Jog(x) ? ` · ${m2Jog(x)} m²/jogador` : ''}` : '—';
    const d = val('direcionamento'); $('#fxmet').textContent = d ? METRICA_DIRECAO[d] : '—';
    const av = avisoEspaco({ espaco: val('espaco'), direcionamento: d }); $('#fxaviso').hidden = !av; $('#fxaviso').textContent = av ? '⚠️ ' + av : '';
  };
  f0.querySelector('[name=espaco]').addEventListener('change', ev => { const d = f0.querySelector('[name=direcionamento]'); if (!d.value && ev.target.value) d.value = DIRECAO_ESPACO[ev.target.value]; atualiza(); });
  ['comprimento', 'largura', 'jogadores', 'direcionamento'].forEach(n => f0.querySelector(`[name=${n}]`).addEventListener('input', atualiza));
  ['series', 'tempo_serie_min', 'pausa_min'].forEach(n => f0.querySelector(`[name=${n}]`).addEventListener('input', () => {
    const se = +val('series'), t = +val('tempo_serie_min'), pa = +val('pausa_min') || 0;
    if (se && t) f0.querySelector('[name=duracao_min]').value = Math.round(se * t + (se - 1) * pa); }));
  atualiza();
  $('#exvolta').onclick = () => verSessao(e.sessao_id, e.id);
  f0.onsubmit = async ev => {
    ev.preventDefault();
    const f = formData(ev.target), n = k => f[k] === '' || f[k] == null ? null : +f[k];
    if (f.video_inicio && segs(f.video_inicio) === null) return toast('Use o formato mm:ss, por exemplo 12:30.', true);
    if ((f.comprimento && !f.largura) || (!f.comprimento && f.largura)) return toast('Informe o comprimento e a largura do espaço.', true);
    const row = { nome: f.nome.trim(), numero_plano: n('numero_plano'), comprimento: n('comprimento'), largura: n('largura'), jogadores: n('jogadores'),
      espaco: nul(f.espaco), direcionamento: nul(f.direcionamento), series: n('series'), tempo_serie_min: n('tempo_serie_min'), pausa_min: n('pausa_min'),
      duracao_min: n('duracao_min'), periodo: nul(f.periodo), video_inicio: nul(f.video_inicio), comportamento: nul(f.comportamento), objetivo: nul(f.objetivo),
      indicadores: nul(f.indicadores), material: nul(f.material), descricao: nul(f.descricao), balanco: nul(f.balanco) };
    if (row.comprimento && row.largura && row.largura > row.comprimento) [row.comprimento, row.largura] = [row.largura, row.comprimento];
    if (!novo && row.nome !== e.nome) row.nome_gerado = false;
    if (novo) Object.assign(row, { sessao_id: e.sessao_id, ordem: Math.max(0, ...exDe(e.sessao_id).map(x => x.ordem)) + 1 });
    const { data, error } = novo ? await sb.from('exercicios').insert(row).select().single() : await sb.from('exercicios').update(row).eq('id', e.id).select().single();
    if (error) return toast(erroAmigavel(error), true);
    S.exercicios = novo ? [...S.exercicios, data] : S.exercicios.map(x => x.id === data.id ? data : x);
    toast(novo ? 'Exercício criado.' : 'Exercício salvo.'); verSessao(data.sessao_id, data.id); if (S.page === 'calendario') pCalendario();
  };
}

/* ---------- Importação dos planos de treino (PDF do Dossier do Treinador) ---------- */
function escolherPlanos(sessao) {
  if (!window.pdfjsLib) return toast('O leitor de PDF não carregou. Recarregue a página.', true);
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'application/pdf'; inp.multiple = true;
  inp.onchange = () => inp.files.length && importarPlanos([...inp.files], sessao);
  inp.click();
}

async function lerPdf(file) {
  const buf = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf.slice(0)) }).promise;
  const page = await doc.getPage(1), vp1 = page.getViewport({ scale: 1 });
  const tc = await page.getTextContent();
  const r = lerPlanoDT(tc.items, vp1.width, vp1.height);
  if (!r.objetivo && !r.titulo_original) throw new Error('Esse PDF não parece um plano de treino do Dossier do Treinador.');
  const esc2 = 2.2, vp = page.getViewport({ scale: esc2 }), cv = document.createElement('canvas');
  cv.width = vp.width; cv.height = vp.height;
  await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
  const k = r.recorte, sx = k.x0 * esc2, sy = (vp1.height - k.yTopo) * esc2, sw = (k.x1 - k.x0) * esc2, sh = (k.yTopo - k.yBase) * esc2;
  const out = document.createElement('canvas'), w = Math.min(1100, sw); out.width = w; out.height = Math.round(sh * w / sw);
  out.getContext('2d').drawImage(cv, sx, sy, sw, sh, 0, 0, out.width, out.height);
  const img = await new Promise(res => out.toBlob(res, 'image/jpeg', 0.82));
  return { r, img };
}

async function importarPlanos(files, sessaoFixa) {
  const ordemArq = f => { const m = f.name.match(/(\d+)\s*\.pdf$/i); return m ? +m[1] : 999; };
  files.sort((a, b) => ordemArq(a) - ordemArq(b) || a.name.localeCompare(b.name));
  const linhas = files.map((f, i) => `<li id="imp${i}"><b>${esc(f.name)}</b> <span class="m">aguardando…</span></li>`).join('');
  modal(`<h2>Lendo os planos de treino</h2><div class="note">O CINQ lê cada PDF, separa objetivo, comportamento-chave, indicadores, material e descrição, recorta o desenho do exercício e coloca tudo na sessão, na ordem dos arquivos.</div><ol class="imp">${linhas}</ol><div class="mfoot"><span></span><button class="btn" id="impfim" disabled>Aguarde…</button></div>`, true);
  const st = (i, t, ok) => { const li = $('#imp' + i); if (li) li.querySelector('span').outerHTML = `<span class="${ok === false ? 'red' : ok ? 'ok' : 'm'}">${t}</span>`; };
  let ultima = sessaoFixa?.id || null, nOk = 0;
  for (let i = 0; i < files.length; i++) {
    try {
      st(i, 'lendo o PDF…');
      const { r, img } = await lerPdf(files[i]);
      const nm = nomeDoExercicio(r.titulo_original, r.objetivo);
      let ses = sessaoFixa ? S.sessoes.find(x => x.id === sessaoFixa.id) : null;
      if (!ses) {
        if (!r.data) throw new Error('o PDF não tem data. Abra a sessão no calendário e adicione por lá.');
        const hr = r.hora ? r.hora.padStart(5, '0') : null;
        ses = S.sessoes.find(x => x.data === r.data && hr && String(x.hora || '').slice(0, 5) === hr)
          || S.sessoes.find(x => x.data === r.data && x.tipo === 'Treino' && !x.hora);
        if (ses && !ses.hora && hr) { const u = await sb.from('sessoes').update({ hora: hr }).eq('id', ses.id).select().single(); if (!u.error) { ses = u.data; S.sessoes = S.sessoes.map(x => x.id === ses.id ? ses : x); } }
        if (!ses) {
          const c = await sb.from('sessoes').insert({ data: r.data, hora: hr, turno: turnoDaHora(hr), tipo: 'Treino', microciclo_id: microDaData(r.data) || null }).select().single();
          if (c.error) throw c.error;
          ses = c.data; S.sessoes = [...S.sessoes, ses];
        }
      } else if (r.data && r.data !== ses.data) st(i, `atenção: o PDF é de ${fmt(r.data)}, mas foi adicionado nesta sessão…`);
      st(i, 'guardando o PDF e o desenho…');
      const base = `${ses.id}/${Date.now()}_${r.numero_plano || i + 1}`;
      const up1 = await sb.storage.from('planos').upload(base + '.pdf', files[i], { contentType: 'application/pdf' });
      if (up1.error) throw up1.error;
      const up2 = img ? await sb.storage.from('planos').upload(base + '.jpg', img, { contentType: 'image/jpeg' }) : { error: null };
      const ordem = Math.max(0, ...exDe(ses.id).map(e => e.ordem)) + 1;
      const ins = await sb.from('exercicios').insert({ sessao_id: ses.id, ordem, nome: nm.nome, titulo_original: r.titulo_original, nome_gerado: nm.gerado,
        numero_plano: r.numero_plano, jogadores: r.jogadores, microciclo: r.microciclo, mesociclo: r.mesociclo, periodo: r.periodo || null,
        material: r.material || null, objetivo: r.objetivo || null, comportamento: r.comportamento || null, indicadores: r.indicadores || null, descricao: r.descricao || null,
        ...(dimDoTexto([r.material, r.descricao].filter(Boolean).join(' ')) || {}),
        pdf_path: base + '.pdf', img_path: up2.error ? null : base + '.jpg' }).select().single();
      if (ins.error) throw ins.error;
      S.exercicios = [...S.exercicios, ins.data]; ultima = ses.id; nOk++;
      st(i, `✓ ${esc(nm.nome)}${nm.gerado ? ' (nome criado a partir do objetivo)' : ''} · ${fmt(ses.data)} ${esc(horaTxt(ses))}`, true);
    } catch (err) { st(i, 'erro: ' + esc(erroAmigavel(err)), false); }
  }
  const b = $('#impfim'); b.disabled = false; b.textContent = nOk ? 'Ver a sessão' : 'Fechar'; b.classList.add('pri');
  b.onclick = () => { if (nOk && ultima) { const s1 = S.sessoes.find(x => x.id === ultima); S.semana = segunda(s1.data); if (S.page === 'calendario') pCalendario(); verSessao(ultima); } else fechar(); };
  if (S.page === 'calendario') pCalendario();
}

function microDaData(d) { return S.micros.find(m => m.inicio <= d && m.fim >= d)?.id || ''; }

function formSessao(s) {
  const novo = !s.id;
  const microSel = s.microciclo_id ?? microDaData(s.data);
  modal(`<h2>${novo ? 'Nova sessão' : 'Editar sessão'}</h2>
  <form id="fses">
    <div class="g3">
      <label class="f"><span>Data *</span><input class="in" type="date" name="data" value="${esc(s.data || '')}" required></label>
      <label class="f"><span>Horário</span><input class="in" type="time" name="hora" value="${esc(s.hora ? String(s.hora).slice(0, 5) : '')}"></label>
      <label class="f"><span>Tipo *</span><select class="in" name="tipo" id="ftipo" required>${opts(TIPOS, s.tipo || 'Treino')}</select></label>
    </div>
    <label class="f" id="fadv"><span>Adversário</span><input class="in" name="adversario" value="${esc(s.adversario || '')}" placeholder="Ex.: América-RN"></label>
    <div class="g3">
      <label class="f"><span>Local</span><input class="in" name="local" value="${esc(s.local || '')}" placeholder="Ex.: Campo 1"></label>
      <label class="f"><span>Microciclo</span><select class="in" name="microciclo_id">${opts(S.micros.map(m => [m.id, m.nome]), microSel, '—')}</select></label>
      <label class="f"><span>Turno</span><select class="in" name="turno">${opts(TURNOS, s.turno || 'Manhã')}</select></label>
    </div>
    <label class="f"><span>Título (opcional)</span><input class="in" name="titulo" value="${esc(s.titulo || '')}" placeholder="Se vazio, a sessão mostra os nomes dos exercícios"></label>
    <label class="f"><span>Vídeo do treino (link do YouTube, de preferência "Não listado")</span><input class="in" name="video_url" value="${esc(s.video_url || '')}" placeholder="https://youtu.be/…"></label>
    <label class="f"><span>Observações</span><textarea class="in" name="observacoes" style="min-height:60px">${esc(s.observacoes || '')}</textarea></label>
    <div class="note" style="margin-bottom:0">O conteúdo do treino vem dos planos de treino: depois de salvar, abra a sessão e clique em <b>Adicionar planos de treino</b>.</div>
    <div class="mfoot">${novo ? '<span></span>' : '<button type="button" class="btn dan" id="fdel">Excluir sessão</button>'}
      <div class="row"><button type="button" class="btn" id="fcanc">Cancelar</button><button class="btn pri" type="submit">Salvar</button></div></div>
  </form>`);
  const tipo = $('#ftipo'), adv = () => ($('#fadv').style.display = tipo.value === 'Amistoso' ? '' : 'none');
  tipo.onchange = adv; adv();
  $('#fcanc').onclick = fechar;
  $('#fses [name=data]').onchange = e => { const sel = $('#fses [name=microciclo_id]'); if (!sel.value) sel.value = microDaData(e.target.value); };
  if ($('#fdel')) $('#fdel').onclick = async () => {
    if (!confirm('Excluir esta sessão? Essa ação não pode ser desfeita.')) return;
    const { error } = await sb.from('sessoes').delete().eq('id', s.id);
    if (error) return toast(erroAmigavel(error), true);
    S.sessoes = S.sessoes.filter(x => x.id !== s.id); fechar(); toast('Sessão excluída.'); ir(S.page);
  };
  $('#fses').onsubmit = async e => {
    e.preventDefault();
    const f = formData(e.target), b = e.target.querySelector('[type=submit]');
    if (f.video_url && !ytId(f.video_url)) return toast('Não reconheci esse link do YouTube.', true);
    const row = { data: f.data, hora: nul(f.hora), turno: f.hora ? turnoDaHora(f.hora) : f.turno, tipo: f.tipo, titulo: nul(f.titulo), video_url: nul(f.video_url),
      local: nul(f.local), microciclo_id: f.microciclo_id ? +f.microciclo_id : null,
      adversario: f.tipo === 'Amistoso' ? nul(f.adversario) : null, observacoes: nul(f.observacoes) };
    b.disabled = true;
    const q = novo ? sb.from('sessoes').insert(row).select().single() : sb.from('sessoes').update(row).eq('id', s.id).select().single();
    const { data, error } = await q;
    b.disabled = false;
    if (error) return toast(erroAmigavel(error), true);
    S.sessoes = novo ? [...S.sessoes, data] : S.sessoes.map(x => x.id === data.id ? data : x);
    toast('Sessão salva.'); if (S.page === 'calendario') S.semana = segunda(data.data); ir(S.page); verSessao(data.id);
  };
}

function verMicros() {
  const pode = podeSessoes();
  modal(`<h2>Microciclos</h2>
  <div class="note">Cada microciclo é uma semana (ou bloco) de trabalho com um objetivo. As sessões dentro das datas dele ficam associadas automaticamente.</div>
  ${S.micros.length ? `<div class="tablewrap"><table class="tb"><tr><th>Nome</th><th>Período</th><th>Fase</th><th>Objetivo</th>${pode ? '<th></th>' : ''}</tr>
  ${S.micros.map(m => `<tr><td><b>${esc(m.nome)}</b></td><td>${fmt(m.inicio)} a ${fmt(m.fim)}</td><td>${esc(m.fase)}</td><td>${esc(m.objetivo || '')}</td>${pode ? `<td><button class="btn sm" data-em="${m.id}">Editar</button></td>` : ''}</tr>`).join('')}</table></div>` : '<p class="empty">Nenhum microciclo cadastrado.</p>'}
  <div class="mfoot">${pode ? '<button class="btn" id="bgerar">Gerar semanas da pré-temporada</button>' : '<span></span>'}<div class="row"><button class="btn" id="mf">Fechar</button>${pode ? '<button class="btn pri" id="mnovo">+ Microciclo</button>' : ''}</div></div>`);
  $('#mf').onclick = fechar;
  if (!pode) return;
  $('#mnovo').onclick = () => formMicro({});
  document.querySelectorAll('[data-em]').forEach(b => b.onclick = () => formMicro(S.micros.find(m => m.id === +b.dataset.em)));
  $('#bgerar').onclick = async () => {
    const n = prompt('Quantas semanas de pré-temporada a partir de 02/11/2026?', '6');
    const k = parseInt(n, 10); if (!k || k < 1 || k > 12) return;
    const rows = [...Array(k)].map((_, i) => ({ nome: `Semana ${i + 1}`, inicio: addDays(INICIO_PRETEMPORADA, i * 7), fim: addDays(INICIO_PRETEMPORADA, i * 7 + 6), fase: 'Pré-temporada' }))
      .filter(r => !S.micros.some(m => m.inicio === r.inicio));
    if (!rows.length) return toast('Essas semanas já existem.');
    const { data, error } = await sb.from('microciclos').insert(rows).select();
    if (error) return toast(erroAmigavel(error), true);
    S.micros = [...S.micros, ...data].sort((a, b) => a.inicio.localeCompare(b.inicio));
    toast(`${data.length} semana(s) criada(s).`); verMicros(); if (S.page === 'calendario') pCalendario();
  };
}

function formMicro(m) {
  const novo = !m.id;
  modal(`<h2>${novo ? 'Novo microciclo' : 'Editar microciclo'}</h2>
  <form id="fmic">
    <label class="f"><span>Nome *</span><input class="in" name="nome" value="${esc(m.nome || '')}" required placeholder="Ex.: Semana 1 – Adaptação"></label>
    <div class="g3">
      <label class="f"><span>Início *</span><input class="in" type="date" name="inicio" value="${esc(m.inicio || '')}" required></label>
      <label class="f"><span>Fim *</span><input class="in" type="date" name="fim" value="${esc(m.fim || '')}" required></label>
      <label class="f"><span>Fase</span><select class="in" name="fase">${opts(FASES, m.fase || 'Pré-temporada')}</select></label>
    </div>
    <label class="f"><span>Objetivo</span><textarea class="in" name="objetivo" style="min-height:60px">${esc(m.objetivo || '')}</textarea></label>
    <div class="mfoot">${novo ? '<span></span>' : '<button type="button" class="btn dan" id="mdel">Excluir</button>'}<div class="row"><button type="button" class="btn" id="mvolta">Voltar</button><button class="btn pri" type="submit">Salvar</button></div></div>
  </form>`);
  $('#mvolta').onclick = verMicros;
  if ($('#mdel')) $('#mdel').onclick = async () => {
    if (!confirm('Excluir este microciclo? As sessões continuam, só perdem o vínculo.')) return;
    const { error } = await sb.from('microciclos').delete().eq('id', m.id);
    if (error) return toast(erroAmigavel(error), true);
    S.micros = S.micros.filter(x => x.id !== m.id); S.sessoes.forEach(s => { if (s.microciclo_id === m.id) s.microciclo_id = null; });
    toast('Microciclo excluído.'); verMicros(); if (S.page === 'calendario') pCalendario();
  };
  $('#fmic').onsubmit = async e => {
    e.preventDefault();
    const f = formData(e.target);
    if (f.fim < f.inicio) return toast('A data de fim precisa ser depois do início.', true);
    const row = { nome: f.nome, inicio: f.inicio, fim: f.fim, fase: f.fase, objetivo: nul(f.objetivo) };
    const { data, error } = novo ? await sb.from('microciclos').insert(row).select().single() : await sb.from('microciclos').update(row).eq('id', m.id).select().single();
    if (error) return toast(erroAmigavel(error), true);
    S.micros = (novo ? [...S.micros, data] : S.micros.map(x => x.id === data.id ? data : x)).sort((a, b) => a.inicio.localeCompare(b.inicio));
    toast('Microciclo salvo.'); verMicros(); if (S.page === 'calendario') pCalendario();
  };
}

/* ---------- Elenco ---------- */
function pElenco() {
  const F = S.filtro;
  const lista = S.atletas.filter(a => (!F.q || a.nome.toLowerCase().includes(F.q.toLowerCase())) && (!F.pos || a.posicao === F.pos) && (!F.st || a.status === F.st))
    .sort((a, b) => POSICOES.indexOf(a.posicao) - POSICOES.indexOf(b.posicao) || a.nome.localeCompare(b.nome));
  $('#main').innerHTML = topo('CINQ · Elenco profissional', 'Elenco', `${S.atletas.filter(a => a.status !== 'Inativo').length} atletas ativos`, isAdmin() ? '<button class="btn pri" id="bnovoat">+ Atleta</button>' : '') + `
  <div class="filters">
    <input class="in" id="fq" placeholder="Buscar atleta…" value="${esc(F.q)}">
    <select class="in" id="fpos">${opts(POSICOES, F.pos, 'Todas as posições')}</select>
    <select class="in" id="fst">${opts(['Titular', 'Ativo', 'Inativo'], F.st, 'Todos os status')}</select>
  </div>
  <div class="athletes">${lista.map(a => `<div class="ath" data-at="${a.id}">${foto(a)}<div><b>${esc(a.nome)}</b><div class="m">${esc(a.posicao)} · ${esc(a.pe || '—')}${a.idade ? ' · ' + a.idade + ' anos' : ''}</div><span class="badge s-${esc(a.status)}">${esc(a.status)}</span></div></div>`).join('') || '<div class="empty">Nenhum atleta encontrado.</div>'}</div>`;
  $('#fq').oninput = e => { F.q = e.target.value; const p = e.target.selectionStart; pElenco(); const i = $('#fq'); i.focus(); i.setSelectionRange(p, p); };
  $('#fpos').onchange = e => { F.pos = e.target.value; pElenco(); };
  $('#fst').onchange = e => { F.st = e.target.value; pElenco(); };
  if ($('#bnovoat')) $('#bnovoat').onclick = () => formAtleta({});
  document.querySelectorAll('[data-at]').forEach(el => el.onclick = () => verAtleta(S.atletas.find(x => x.id === +el.dataset.at)));
}

function verAtleta(a) {
  const c = (k, v) => v ? `<div class="kv"><span>${k}</span><b>${esc(v)}</b></div>` : '';
  const h = histDe(a), noXI = S.mapa.some(m => m.atleta_id === a.id);
  const blocoH = h ? `<h3 class="sub">Histórico</h3>
    <div class="metric-grid">
      <div><b>${num(h.min_2026)}</b><span>Min 2026</span></div><div><b>${num(h.disp_2026)}/${num(h.rel_2026)}</b><span>Jogos 2026 (disp./rel.)</span></div>
      <div><b>${num(h.min_2025)}</b><span>Min 2025</span></div><div><b>${num(h.disp_2025)}/${num(h.rel_2025)}</b><span>Jogos 2025 (disp./rel.)</span></div>
    </div>
    <div class="g2" style="margin-top:10px">${c('Último jogo atuando', h.ultimo_jogo && dataBR(h.ultimo_jogo))}${c('Ativo em competição', h.ativo_competicao ? 'Sim' : 'Não')}</div>
    ${h.titulos ? `<div class="k">Títulos</div><p class="pre">${esc(h.titulos)}</p>` : ''}
    ${h.rebaixamento ? `<div class="k">Rebaixamento</div><p class="pre">${esc(h.rebaixamento)}</p>` : ''}
    ${h.observacao ? `<div class="k">Observação</div><p class="pre">${esc(h.observacao)}</p>` : ''}
    <div class="row">${h.ogol ? `<a class="btn sm" href="${esc(h.ogol)}" target="_blank" rel="noopener">Ogol ↗</a>` : ''}${h.drive ? `<a class="btn sm" href="${esc(h.drive)}" target="_blank" rel="noopener">Últimos 10 jogos (Drive) ↗</a>` : ''}</div>`
    : '<h3 class="sub">Histórico</h3><p class="empty">Sem histórico cadastrado.</p>';
  modal(`<div class="row" style="margin-bottom:14px">${foto(a)}<div><h2 style="margin:0">${esc(a.nome)}</h2><span class="m">${esc(a.posicao)} · ${esc(a.pe || '—')}</span> <span class="badge s-${esc(a.status)}">${esc(a.status)}</span>${noXI ? ' <span class="badge t-Treino">11 inicial</span>' : ''}</div></div>
  <div class="detail">
    <h3 class="sub">Cadastro</h3>
    <div class="g2">${c('Idade', a.idade && a.idade + ' anos')}${c('Altura', a.altura && String(a.altura).replace('.', ',') + ' m')}${c('Nº', a.numero)}${c('Contrato até', a.contrato_fim && dataBR(a.contrato_fim))}${c('Entrada', a.data_entrada && dataBR(a.data_entrada))}${c('Perfil', a.perfil)}</div>
    ${a.observacoes ? `<div class="k">Observações</div><p class="pre">${esc(a.observacoes)}</p>` : ''}
    ${blocoH}
  </div>
  <div class="mfoot"><div class="row">${isAdmin() ? '<button class="btn" id="medcad">Editar cadastro</button>' : ''}${isAdmin() ? `<button class="btn" id="medfoto">${a.foto_url ? 'Ajustar / trocar foto' : 'Adicionar foto'}</button>` : ''}${podeHistorico() ? `<button class="btn" id="medhist">${h ? 'Editar histórico' : 'Adicionar histórico'}</button>` : ''}</div><button class="btn pri" id="mf">Fechar</button></div>`);
  $('#mf').onclick = fechar;
  if ($('#medcad')) $('#medcad').onclick = () => formAtleta(a);
  if ($('#medfoto')) $('#medfoto').onclick = () => ajustarFoto(a, () => verAtleta(a));
  if ($('#medhist')) $('#medhist').onclick = () => formHistorico(h || { atleta_id: a.id, nome: a.nome, posicao: a.posicao });
}

function formAtleta(a) {
  const novo = !a.id;
  modal(`<h2>${novo ? 'Novo atleta' : 'Editar atleta'}</h2>
  <form id="fat">
    <div class="g2">
      <label class="f"><span>Nome no painel *</span><input class="in" name="nome" value="${esc(a.nome || '')}" required></label>
      <label class="f"><span>Posição *</span><select class="in" name="posicao" required>${opts(POSICOES, a.posicao, 'Selecione')}</select></label>
    </div>
    <div class="g3">
      <label class="f"><span>Pé</span><select class="in" name="pe">${opts(['Destro', 'Canhoto', 'Ambidestro'], a.pe, '—')}</select></label>
      <label class="f"><span>Idade</span><input class="in" type="number" min="14" max="50" name="idade" value="${esc(a.idade ?? '')}"></label>
      <label class="f"><span>Altura (m)</span><input class="in" type="number" step="0.01" min="1.4" max="2.2" name="altura" value="${esc(a.altura ?? '')}"></label>
      <label class="f"><span>Status *</span><select class="in" name="status">${opts(['Titular', 'Ativo', 'Inativo'], a.status || 'Ativo')}</select></label>
      <label class="f"><span>Nº camisa</span><input class="in" type="number" min="1" max="99" name="numero" value="${esc(a.numero ?? '')}"></label>
      <label class="f"><span>Contrato até</span><input class="in" type="date" name="contrato_fim" value="${esc(a.contrato_fim || '')}"></label>
      <label class="f"><span>Data de entrada</span><input class="in" type="date" name="data_entrada" value="${esc(a.data_entrada || '')}"></label>
      <label class="f"><span>Data de saída</span><input class="in" type="date" name="data_saida" value="${esc(a.data_saida || '')}"></label>
    </div>
    <label class="f"><span>Endereço da foto</span><input class="in" name="foto_url" value="${esc(a.foto_url || '')}" placeholder="https://…"></label>
    <label class="f"><span>Perfil</span><input class="in" name="perfil" value="${esc(a.perfil || '')}"></label>
    <label class="f"><span>Observações</span><textarea class="in" name="observacoes" style="min-height:60px">${esc(a.observacoes || '')}</textarea></label>
    <div class="mfoot">${novo ? '<span></span>' : `<button type="button" class="btn dan" id="adel">${a.ativo ? 'Remover do elenco' : 'Excluir definitivamente'}</button>`}
      <div class="row"><button type="button" class="btn" id="acanc">Cancelar</button><button class="btn pri" type="submit">Salvar</button></div></div>
  </form>`);
  $('#acanc').onclick = fechar;
  if ($('#adel')) $('#adel').onclick = async () => {
    if (!confirm(`Remover ${a.nome} do elenco? Ele sai das listas, mas o histórico é mantido.`)) return;
    const { data, error } = await sb.from('atletas').update({ ativo: false, status: 'Inativo', data_saida: a.data_saida || hoje() }).eq('id', a.id).select().single();
    if (error) return toast(erroAmigavel(error), true);
    S.atletas = S.atletas.map(x => x.id === data.id ? data : x); fechar(); toast('Atleta removido do elenco.'); pElenco();
  };
  $('#fat').onsubmit = async e => {
    e.preventDefault();
    const f = formData(e.target);
    if (!f.posicao) return toast('Escolha a posição.', true);
    const row = { nome: f.nome, posicao: f.posicao, pe: nul(f.pe), idade: f.idade ? +f.idade : null, altura: f.altura ? +f.altura : null, status: f.status,
      numero: f.numero ? +f.numero : null, contrato_fim: nul(f.contrato_fim), data_entrada: nul(f.data_entrada), data_saida: nul(f.data_saida),
      foto_url: nul(f.foto_url), perfil: nul(f.perfil), observacoes: nul(f.observacoes), ativo: f.status !== 'Inativo' || !!a.ativo };
    const { data, error } = novo ? await sb.from('atletas').insert(row).select().single() : await sb.from('atletas').update(row).eq('id', a.id).select().single();
    if (error) return toast(erroAmigavel(error), true);
    S.atletas = (novo ? [...S.atletas, data] : S.atletas.map(x => x.id === data.id ? data : x)).sort((x, y) => x.nome.localeCompare(y.nome));
    fechar(); toast('Atleta salvo.'); pElenco();
  };
}

/* ---------- Mapa tático ---------- */
/* ---------- Mapa tático: quadro com peças que se movem ---------- */
// adversário: 11 peças pretas (4-4-2 na metade de cima) + bola; posições guardadas em quadro_pecas
const ADV_PADRAO = { a1: [50, 5], a2: [20, 17], a3: [40, 15], a4: [60, 15], a5: [80, 17], a6: [20, 31], a7: [40, 29], a8: [60, 29], a9: [80, 31], a10: [42, 41], a11: [58, 41], bola: [50, 50] };
const QUADRO_VIS = 'cinq_quadro_vis';
function quadroVis() { try { return JSON.parse(localStorage.getItem(QUADRO_VIS)) || { adv: true, bola: true }; } catch (e) { return { adv: true, bola: true }; } }
function salvarQuadroVis(v) { try { localStorage.setItem(QUADRO_VIS, JSON.stringify(v)); } catch (e) { /* sem armazenamento */ } }
async function carregarQuadro() {
  if (S.quadro) return;
  const { data, error } = await sb.from('quadro_pecas').select('*');
  S.quadro = Object.fromEntries(Object.entries(ADV_PADRAO).map(([k, [x, y]]) => [k, { id: k, x, y }]));
  if (!error) (data || []).forEach(r => { S.quadro[r.id] = r; });
}
async function pMapa() {
  const pode = podeMapa(), at = id => S.atletas.find(a => a.id === id), vis = quadroVis();
  await carregarQuadro().catch(() => {});
  const noXI = new Set(S.mapa.map(m => m.atleta_id).filter(Boolean));
  const banco = S.atletas.filter(a => a.ativo && a.status !== 'Inativo' && !noXI.has(a.id)).sort((a, b) => POSICOES.indexOf(a.posicao) - POSICOES.indexOf(b.posicao) || a.nome.localeCompare(b.nome));
  const advs = Object.keys(ADV_PADRAO).filter(k => k !== 'bola');
  $('#main').innerHTML = topo('CINQ · Modelo de jogo', 'Mapa tático', pode ? 'Arraste as peças como num quadro tático. Clique numa bolinha do QFC para trocar o atleta.' : '11 inicial de referência. Clique numa bolinha para ver o atleta.',
    `<button class="btn${vis.adv ? ' on' : ''}" id="qadv">${vis.adv ? 'Esconder' : 'Mostrar'} adversário</button><button class="btn${vis.bola ? ' on' : ''}" id="qbola">${vis.bola ? 'Esconder' : 'Mostrar'} bola</button>${pode ? '<button class="btn" id="qreset">Reorganizar adversário</button>' : ''}`) + `
  <div class="tactical">
    <div class="pitch quadro${pode ? ' editavel' : ''}" id="qpitch"><div class="pl mid"></div><div class="pc"></div><div class="pg top"></div><div class="pg bot"></div><div class="pa top"></div><div class="pa bot"></div>
      ${S.mapa.map(m => { const a = at(m.atleta_id); return `<div class="dot" data-ordem="${m.ordem}" style="left:${m.x}%;top:${m.y}%" title="${esc(a ? `${a.nome} · ${a.posicao}` : 'vazio')}">${a ? foto(a) : '<div class="av">?</div>'}<span>${esc(a?.nome || '—')}</span></div>`; }).join('')}
      ${vis.adv ? advs.map(k => `<div class="adv-dot" data-peca="${k}" style="left:${S.quadro[k].x}%;top:${S.quadro[k].y}%">${k.slice(1)}</div>`).join('') : ''}
      ${vis.bola ? `<div class="bola-peca" data-peca="bola" style="left:${S.quadro.bola.x}%;top:${S.quadro.bola.y}%"></div>` : ''}
    </div>
    <div class="panel"><h2>11 inicial <small class="m">${pode ? 'clique para trocar' : ''}</small></h2>
      ${S.mapa.map(m => { const a = at(m.atleta_id); return `<div class="kv q-lin" data-ordem="${m.ordem}"><span><b>${m.ordem}.</b> ${esc(a?.nome || '—')}</span><b>${esc(a?.posicao || '')}</b></div>`; }).join('')}
      <h2 style="margin-top:16px">Banco / opções</h2>
      ${banco.map(a => `<div class="kv small"><span>${esc(a.nome)}</span><span class="m">${esc(a.posicao)}</span></div>`).join('') || '<div class="empty">—</div>'}
      <p class="m q-leg"><i class="q-leg-qfc"></i> QFC · <i class="q-leg-adv"></i> adversário · <i class="q-leg-bola"></i> bola</p>
    </div>
  </div>`;
  $('#qadv').onclick = () => { salvarQuadroVis({ ...vis, adv: !vis.adv }); pMapa(); };
  $('#qbola').onclick = () => { salvarQuadroVis({ ...vis, bola: !vis.bola }); pMapa(); };
  if ($('#qreset')) $('#qreset').onclick = async () => {
    if (!confirm('Voltar as peças do adversário e a bola para a posição inicial (4-4-2)?')) return;
    const rows = Object.entries(ADV_PADRAO).map(([id, [x, y]]) => ({ id, x, y }));
    const { error } = await sb.from('quadro_pecas').upsert(rows, { onConflict: 'id' }); if (error) return toast(erroAmigavel(error), true);
    rows.forEach(r => { S.quadro[r.id] = r; }); pMapa();
  };
  document.querySelectorAll('.q-lin').forEach(l => l.onclick = () => clicarPeca(+l.dataset.ordem));
  ligarQuadro(pode);
}
function clicarPeca(ordem) {
  const m = S.mapa.find(x => x.ordem === ordem), a = S.atletas.find(x => x.id === m?.atleta_id);
  if (podeMapa()) return escolherAtletaMapa(ordem); if (a) verAtleta(a);
}
// arrastar com mouse, dedo ou caneta; clique sem arrastar abre a troca de atleta
function ligarQuadro(pode) {
  const pitch = $('#qpitch'); if (!pitch) return;
  pitch.querySelectorAll('.dot, .adv-dot, .bola-peca').forEach(el => {
    el.onpointerdown = ev => {
      if (ev.button > 0) return;
      const r = pitch.getBoundingClientRect(), x0 = ev.clientX, y0 = ev.clientY; let moveu = false;
      if (pode) el.setPointerCapture(ev.pointerId);
      const mover = e => {
        if (!pode) return;
        if (!moveu && Math.hypot(e.clientX - x0, e.clientY - y0) < 5) return;
        moveu = true; el.classList.add('arrastando');
        el.style.left = Math.max(0, Math.min(100, (e.clientX - r.left) / r.width * 100)) + '%';
        el.style.top = Math.max(0, Math.min(100, (e.clientY - r.top) / r.height * 100)) + '%';
      };
      const soltar = async () => {
        el.onpointermove = el.onpointerup = el.onpointercancel = null; el.classList.remove('arrastando');
        if (!moveu) { if (el.dataset.ordem) clicarPeca(+el.dataset.ordem); return; }
        const x = Math.round(parseFloat(el.style.left) * 10) / 10, y = Math.round(parseFloat(el.style.top) * 10) / 10;
        const r1 = el.dataset.ordem ? await sb.from('mapa_tatico').update({ x, y }).eq('ordem', +el.dataset.ordem) : await sb.from('quadro_pecas').upsert({ id: el.dataset.peca, x, y }, { onConflict: 'id' });
        if (r1.error) { toast(erroAmigavel(r1.error), true); return pMapa(); }
        if (el.dataset.ordem) Object.assign(S.mapa.find(m => m.ordem === +el.dataset.ordem), { x, y }); else S.quadro[el.dataset.peca] = { id: el.dataset.peca, x, y };
      };
      el.onpointermove = mover; el.onpointerup = soltar; el.onpointercancel = soltar;
      ev.preventDefault();
    };
  });
}
function escolherAtletaMapa(ordem) {
  const m = S.mapa.find(x => x.ordem === ordem), atual = S.atletas.find(a => a.id === m.atleta_id);
  const lista = S.atletas.filter(a => a.ativo && a.status !== 'Inativo').sort((a, b) => POSICOES.indexOf(a.posicao) - POSICOES.indexOf(b.posicao) || a.nome.localeCompare(b.nome));
  const sit = id => typeof situacao === 'function' && S.dm?.ok ? situacao(id).sit : 'Liberado';
  const item = a => { const no = S.mapa.find(x => x.atleta_id === a.id), s = sit(a.id);
    return `<button type="button" class="q-at${a.id === m.atleta_id ? ' on' : ''}" data-at="${a.id}" data-busca="${esc(fNormQ(a.nome + ' ' + a.posicao))}">${foto(a)}<span><b>${esc(a.nome)}</b><small>${esc(a.posicao)}${no && no.ordem !== ordem ? ` · no campo (${no.ordem})` : ''}</small></span>${s !== 'Liberado' && typeof sitBadge === 'function' ? sitBadge(s) : ''}</button>`; };
  modal(`<h2>Posição ${ordem} · ${esc(atual?.nome || 'vazia')}</h2><p class="m">Escolha quem entra nesta bolinha. Se o atleta já estiver no campo, os dois trocam de lugar.</p>
    <input class="in" id="qbusca" placeholder="Buscar atleta ou posição...">
    <div class="q-lista">${POSICOES.map(p => { const g = lista.filter(a => a.posicao === p); return g.length ? `<div class="q-grupo"><h4>${esc(p)}</h4>${g.map(item).join('')}</div>` : ''; }).join('')}
      ${lista.filter(a => !POSICOES.includes(a.posicao)).map(item).join('')}</div>
    <div class="mfoot"><button class="btn" id="qvazio">Deixar vazia</button><div class="row">${atual ? '<button class="btn" id="qver">Ver ficha</button>' : ''}<button class="btn" id="qfec">Fechar</button></div></div>`, true);
  $('#qfec').onclick = fechar; if ($('#qver')) $('#qver').onclick = () => verAtleta(atual);
  $('#qbusca').oninput = e => { const t = fNormQ(e.target.value); document.querySelectorAll('.q-at').forEach(b => { b.hidden = !!t && !b.dataset.busca.includes(t); }); document.querySelectorAll('.q-grupo').forEach(g => { g.hidden = ![...g.querySelectorAll('.q-at')].some(b => !b.hidden); }); };
  const aplicar = async id => {
    const dup = id && S.mapa.find(x => x.atleta_id === id && x.ordem !== ordem);
    const ups = [{ ordem, atleta_id: id }]; if (dup) ups.push({ ordem: dup.ordem, atleta_id: m.atleta_id });
    for (const u of ups) {
      const { error } = await sb.from('mapa_tatico').update({ atleta_id: u.atleta_id }).eq('ordem', u.ordem);
      if (error) { toast(erroAmigavel(error), true); return pMapa(); }
      S.mapa.find(x => x.ordem === u.ordem).atleta_id = u.atleta_id;
    }
    fechar(); toast(dup ? 'Atletas trocados de lugar.' : id ? 'Atleta trocado.' : 'Posição vazia.'); pMapa();
  };
  document.querySelectorAll('.q-at').forEach(b => b.onclick = () => +b.dataset.at === m.atleta_id ? fechar() : aplicar(+b.dataset.at));
  $('#qvazio').onclick = () => aplicar(null);
}
const fNormQ = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/* ---------- Histórico ---------- */
function pHistorico() {
  const F = S.hf, H = S.historico;
  let lista = H.filter(h => (!F.q || h.nome.toLowerCase().includes(F.q.toLowerCase())) && (!F.pos || h.posicao === F.pos));
  if (F.ord) lista = [...lista].sort((a, b) => ((a.min_2026 ?? -1) - (b.min_2026 ?? -1)) * (F.ord === 'asc' ? 1 : -1));
  const posicoes = [...new Set(H.map(h => h.posicao).filter(Boolean))];
  $('#main').innerHTML = topo('CINQ · Elenco profissional', 'Histórico', 'Minutagem, jogos, títulos e links de cada atleta', podeHistorico() ? '<button class="btn pri" id="bnh">+ Histórico</button>' : '') + `
  <div class="cards">
    <div class="card"><div class="l">Atletas com histórico</div><div class="v">${H.length}</div></div>
    <div class="card"><div class="l">Voltando de lesão</div><div class="v">${H.filter(h => /voltando de les/i.test(h.observacao || '')).length}</div></div>
    <div class="card hl"><div class="l">Ativos em competição</div><div class="v">${H.filter(h => h.ativo_competicao).length}</div></div>
    <div class="card"><div class="l">Atletas com títulos</div><div class="v">${H.filter(h => h.titulos && h.titulos !== '-').length}</div></div>
  </div>
  <div class="filters">
    <input class="in" id="hq" placeholder="Buscar atleta…" value="${esc(F.q)}">
    <select class="in" id="hpos">${opts(posicoes, F.pos, 'Todas as posições')}</select>
    <select class="in" id="hord">${opts([['desc', 'Minutagem 2026: maior → menor'], ['asc', 'Minutagem 2026: menor → maior']], F.ord, 'Sem ordenação')}</select>
  </div>
  <div class="note">Nomes destacados em verde estão atuando em uma competição neste momento. Clique na linha para ver ${podeHistorico() ? 'ou editar ' : ''}os detalhes.</div>
  <div class="panel tablewrap" style="padding:8px"><table class="tb hist"><tr><th></th><th>Atleta</th><th>Posição</th><th>Min 2026</th><th>Jogos 26<br><small>rel. / disp.</small></th><th>Último jogo</th><th>Min 2025</th><th>Jogos 25<br><small>rel. / disp.</small></th><th>Títulos</th><th>Observação</th><th>Links</th></tr>
  ${lista.map(h => `<tr data-h="${h.id}" class="${h.ativo_competicao ? 'ativo' : ''}"><td>${fotoH(h)}</td><td><b>${esc(h.nome)}</b>${h.atleta_id ? '' : '<br><small class="m">fora do elenco atual</small>'}</td><td>${esc(h.posicao || '')}</td><td><b>${num(h.min_2026)}</b></td><td>${num(h.rel_2026)} / ${num(h.disp_2026)}</td><td>${dataBR(h.ultimo_jogo)}</td><td>${num(h.min_2025)}</td><td>${num(h.rel_2025)} / ${num(h.disp_2025)}</td><td class="pre sm">${esc(h.titulos || '—')}${h.rebaixamento ? `<br><span class="red">Rebaixamento: ${esc(h.rebaixamento)}</span>` : ''}</td><td class="pre sm">${esc(h.observacao || '')}</td><td class="links">${h.ogol ? `<a href="${esc(h.ogol)}" target="_blank" rel="noopener">Ogol ↗</a>` : ''}${h.drive ? `<a href="${esc(h.drive)}" target="_blank" rel="noopener">Drive ↗</a>` : ''}</td></tr>`).join('')}</table></div>`;
  $('#hq').oninput = e => { F.q = e.target.value; const p = e.target.selectionStart; pHistorico(); const i = $('#hq'); i.focus(); i.setSelectionRange(p, p); };
  $('#hpos').onchange = e => { F.pos = e.target.value; pHistorico(); };
  $('#hord').onchange = e => { F.ord = e.target.value; pHistorico(); };
  if ($('#bnh')) $('#bnh').onclick = () => formHistorico({});
  document.querySelectorAll('[data-h]').forEach(tr => tr.onclick = e => {
    if (e.target.closest('a')) return;
    const h = S.historico.find(x => x.id === +tr.dataset.h), a = S.atletas.find(x => x.id === h.atleta_id);
    a ? verAtleta(a) : (podeHistorico() ? formHistorico(h) : null);
  });
}

function formHistorico(h) {
  const novo = !h.id;
  const semHist = S.atletas.filter(a => !S.historico.some(x => x.atleta_id === a.id) || a.id === h.atleta_id).map(a => [a.id, a.nome]);
  const n = (nm, lb, v) => `<label class="f"><span>${lb}</span><input class="in" type="number" min="0" name="${nm}" value="${esc(v ?? '')}"></label>`;
  modal(`<h2>${novo ? 'Novo histórico' : 'Editar histórico'} ${h.nome ? '· ' + esc(h.nome) : ''}</h2>
  <form id="fh">
    <div class="g2">
      <label class="f"><span>Atleta do elenco</span><select class="in" name="atleta_id">${opts(semHist, h.atleta_id, '— fora do elenco —')}</select></label>
      <label class="f"><span>Nome no histórico *</span><input class="in" name="nome" value="${esc(h.nome || '')}" required></label>
    </div>
    <div class="g2">
      <label class="f"><span>Posição</span><select class="in" name="posicao">${opts(POSICOES, h.posicao, '—')}</select></label>
      <label class="f"><span>Link Ogol</span><input class="in" name="ogol" value="${esc(h.ogol || '')}" placeholder="https://www.ogol.com.br/jogador/…"></label>
    </div>
    <div class="g3">${n('min_2026', 'Minutagem 2026', h.min_2026)}${n('rel_2026', 'Jogos relacionado 2026', h.rel_2026)}${n('disp_2026', 'Jogos disputado 2026', h.disp_2026)}
      ${n('min_2025', 'Minutagem 2025', h.min_2025)}${n('rel_2025', 'Jogos relacionado 2025', h.rel_2025)}${n('disp_2025', 'Jogos disputado 2025', h.disp_2025)}</div>
    <div class="g2">
      <label class="f"><span>Último jogo (atuando)</span><input class="in" type="date" name="ultimo_jogo" value="${esc(h.ultimo_jogo || '')}"></label>
      <label class="f"><span>Ativo em competição agora?</span><select class="in" name="ativo_competicao">${opts([['false', 'Não'], ['true', 'Sim']], String(!!h.ativo_competicao))}</select></label>
    </div>
    <label class="f"><span>Títulos (um por linha: COMPETIÇÃO (ano) - Clube)</span><textarea class="in" name="titulos">${esc(h.titulos || '')}</textarea></label>
    <label class="f"><span>Rebaixamento</span><input class="in" name="rebaixamento" value="${esc(h.rebaixamento || '')}" placeholder="2023 - SÉRIE B (ABC)"></label>
    <label class="f"><span>Observação (escreva "VOLTANDO DE LESÃO" para contar no card)</span><textarea class="in" name="observacao" style="min-height:60px">${esc(h.observacao || '')}</textarea></label>
    <label class="f"><span>Link Drive (últimos 10 jogos)</span><input class="in" name="drive" value="${esc(h.drive || '')}"></label>
    <div class="mfoot">${novo ? '<span></span>' : '<button type="button" class="btn dan" id="hdel">Excluir histórico</button>'}<div class="row"><button type="button" class="btn" id="hcanc">Cancelar</button><button class="btn pri" type="submit">Salvar</button></div></div>
  </form>`);
  $('#hcanc').onclick = fechar;
  const selA = $('#fh [name=atleta_id]');
  selA.onchange = () => { const a = S.atletas.find(x => x.id === +selA.value); if (a) { $('#fh [name=nome]').value ||= a.nome; $('#fh [name=posicao]').value ||= a.posicao; } };
  if ($('#hdel')) $('#hdel').onclick = async () => {
    if (!confirm(`Excluir o histórico de ${h.nome}?`)) return;
    const { error } = await sb.from('historico').delete().eq('id', h.id);
    if (error) return toast(erroAmigavel(error), true);
    S.historico = S.historico.filter(x => x.id !== h.id); fechar(); toast('Histórico excluído.'); ir(S.page);
  };
  $('#fh').onsubmit = async e => {
    e.preventDefault();
    const f = formData(e.target), int = v => (v === '' ? null : +v);
    const row = { atleta_id: f.atleta_id ? +f.atleta_id : null, nome: f.nome, posicao: nul(f.posicao), ogol: nul(f.ogol),
      min_2026: int(f.min_2026), rel_2026: int(f.rel_2026), disp_2026: int(f.disp_2026), min_2025: int(f.min_2025), rel_2025: int(f.rel_2025), disp_2025: int(f.disp_2025),
      ultimo_jogo: nul(f.ultimo_jogo), ativo_competicao: f.ativo_competicao === 'true', titulos: nul(f.titulos), rebaixamento: nul(f.rebaixamento), observacao: nul(f.observacao), drive: nul(f.drive) };
    const { data, error } = novo ? await sb.from('historico').insert(row).select().single() : await sb.from('historico').update(row).eq('id', h.id).select().single();
    if (error) return toast(/historico_atleta_unico/.test(error.message) ? 'Esse atleta já tem histórico.' : erroAmigavel(error), true);
    S.historico = (novo ? [...S.historico, data] : S.historico.map(x => x.id === data.id ? data : x)).sort((a, b) => a.nome.localeCompare(b.nome));
    fechar(); toast('Histórico salvo.'); ir(S.page);
  };
}

/* ---------- Acessos da comissão (admin) ---------- */
function pComissao() {
  if (!isAdmin()) return pInicio();
  $('#main').innerHTML = topo('CINQ · Administração', 'Acessos da comissão', 'Quem entra no CINQ e o que cada um pode fazer', '<button class="btn pri" id="bvinc">+ Liberar acesso</button>') + `
  <div class="note"><b>Como liberar um novo membro:</b> 1) No Supabase, em <a href="https://supabase.com/dashboard/project/xucaymymsctgbllwplbm/auth/users" target="_blank" rel="noopener">Authentication → Users</a>, clique em <i>Add user → Create new user</i>, informe o e-mail e uma senha provisória e deixe <i>Auto confirm</i> marcado. 2) Aqui, clique em <b>+ Liberar acesso</b> e informe o mesmo e-mail, o nome e a função. 3) Envie o link do CINQ e a senha provisória para a pessoa.</div>
  <div class="panel tablewrap"><table class="tb"><tr><th>Nome</th><th>E-mail</th><th>Função</th><th>Admin</th><th>Situação</th><th></th></tr>
  ${S.perfis.map(p => `<tr><td><b>${esc(p.nome)}</b></td><td>${esc(p.email || '')}</td><td>${esc(FUNCOES[p.funcao] || p.funcao)}</td><td>${p.admin ? 'Sim' : '—'}</td><td>${p.ativo ? '<span class="badge s-Titular">Ativo</span>' : '<span class="badge s-Inativo">Bloqueado</span>'}</td><td>${p.id === S.perfil.id ? '<span class="m">você</span>' : `<button class="btn sm" data-pf="${p.id}">Editar</button>`}</td></tr>`).join('')}</table></div>
  <div class="panel"><h2>O que cada função pode fazer</h2>
    <div class="note" style="margin:0">Todas as funções <b>veem</b> o CINQ (dá para restringir por pessoa em “O que pode ver”). <b>Editam</b>: Calendário (sessões, exercícios e programação) e Mapa tático → Técnico/Auxiliar e Análise de desempenho; Histórico e Análise do adversário → Análise de desempenho; Fisioterapia/DM → Fisioterapia e Médico (liberação só o Médico); Fisiologia → Preparação física/Fisiologia; o administrador edita tudo; Técnico individual → quem tem acesso à pasta do atleta; elenco e acessos → administrador. <b>Visualização</b> só consulta e não vê dados de saúde.</div></div>`;
  $('#bvinc').onclick = () => formMembro({});
  document.querySelectorAll('[data-pf]').forEach(b => b.onclick = () => formMembro(S.perfis.find(p => p.id === b.dataset.pf)));
}

function formMembro(p) {
  const novo = !p.id;
  modal(`<h2>${novo ? 'Liberar acesso' : 'Editar acesso'}</h2>
  <form id="fmem">
    ${novo ? '<div class="note">O login com este e-mail precisa já existir no Supabase (Authentication → Users).</div>' : ''}
    <label class="f"><span>E-mail do login *</span><input class="in" type="email" name="email" value="${esc(p.email || '')}" ${novo ? '' : 'readonly'} required></label>
    <label class="f"><span>Nome *</span><input class="in" name="nome" value="${esc(p.nome || '')}" required></label>
    <label class="f"><span>Função *</span><select class="in" name="funcao">${opts(Object.entries(FUNCOES), p.funcao || 'tecnico')}</select></label>
    <label class="f row"><input type="checkbox" name="admin" ${p.admin ? 'checked' : ''}> <span style="margin:0">Administrador (gerencia elenco e acessos)</span></label>
    ${novo ? '' : `<label class="f row"><input type="checkbox" name="ativo" ${p.ativo ? 'checked' : ''}> <span style="margin:0">Acesso ativo (desmarque para bloquear)</span></label>`}
    <div class="mfoot"><span></span><div class="row"><button type="button" class="btn" id="pcanc">Cancelar</button><button class="btn pri" type="submit">Salvar</button></div></div>
  </form>`);
  $('#pcanc').onclick = fechar;
  $('#fmem').onsubmit = async e => {
    e.preventDefault();
    const f = formData(e.target);
    let res;
    if (novo) res = await sb.rpc('vincular_membro', { p_email: f.email, p_nome: f.nome, p_funcao: f.funcao, p_admin: !!f.admin });
    else res = await sb.from('perfis').update({ nome: f.nome, funcao: f.funcao, admin: !!f.admin, ativo: !!f.ativo }).eq('id', p.id).select().single();
    if (res.error) return toast(erroAmigavel(res.error), true);
    const d = res.data;
    S.perfis = (S.perfis.some(x => x.id === d.id) ? S.perfis.map(x => x.id === d.id ? d : x) : [...S.perfis, d]).sort((a, b) => a.nome.localeCompare(b.nome));
    fechar(); toast(novo ? `Acesso liberado para ${d.nome}.` : 'Acesso atualizado.'); pComissao();
  };
}

/* ---------- leitura do PDF do Dossier do Treinador ---------- */
// Leitura dos PDFs de Plano de Treino do Dossier do Treinador (DT).
// Recebe os itens de texto do pdf.js (página 1) e devolve os campos do exercício.
function lerPlanoDT(items, pageW, pageH) {
  const it = items.filter(i => i.str && i.str.trim()).map(i => ({ s: i.str.trim(), x: i.transform[4], y: i.transform[5], h: i.height }));
  const achar = re => it.find(i => re.test(i.s));
  const valorAoLado = label => {
    const l = achar(label); if (!l) return '';
    const v = it.filter(i => Math.abs(i.y - l.y) < 3 && i.x > l.x + 2).sort((a, b) => a.x - b.x)[0];
    // o valor precisa estar antes do próximo rótulo da mesma linha
    const prox = it.filter(i => Math.abs(i.y - l.y) < 3 && i.x > l.x + 2 && i.h > (v ? v.h : 0) + 0.5).sort((a, b) => a.x - b.x)[0];
    if (!v || (prox && prox.x <= v.x)) return '';
    return v.s;
  };
  const linhas = (lista) => {
    const ord = [...lista].sort((a, b) => b.y - a.y || a.x - b.x), out = [];
    for (const i of ord) { const l = out[out.length - 1]; if (l && Math.abs(l.y - i.y) < 3) l.parts.push(i); else out.push({ y: i.y, parts: [i] }); }
    return out.map(l => ({ y: l.y, t: l.parts.sort((a, b) => a.x - b.x).map(p => p.s).join(' ').replace(/\s+/g, ' ').trim() }));
  };
  const juntar = (ls) => {
    let txt = '', prevY = null;
    for (const l of ls) {
      if (!txt) txt = l.t;
      else if (prevY - l.y > 14) txt += '\n\n' + l.t;
      else if (/[.:;]$/.test(txt) || /^(Com posse|Sem posse|Com bola|Sem bola|Espa[cç]o)\b/i.test(l.t)) txt += '\n' + l.t;
      else txt += ' ' + l.t;
      prevY = l.y;
    }
    return txt.replace(/\s*→\s*/g, ' → ').trim();
  };

  const lMat = achar(/^Material$/), lObjG = achar(/^Objetivos Gerais$/);
  const lObj = achar(/^Objetivo\(s\) espec/i), lDesc = achar(/^Descri[cç][aã]o e Organiza/i), lObs = achar(/^Observa[cç][oõ]es/i);
  const yMat = lMat ? lMat.y : pageH * 0.86, yObj = lObj ? lObj.y : pageH * 0.33, yObs = lObs ? lObs.y : 0;
  const xCol = lDesc ? lDesc.x - 5 : pageW / 2, xMatFim = lObjG ? lObjG.x - 5 : pageW / 3;

  // título: maior fonte entre o material e o bloco de objetivos
  const candTit = it.filter(i => i.y < yMat - 2 && i.y > yObj + 5 && i.h >= 11 && !/^(gk|\d+)$/i.test(i.s)).sort((a, b) => b.y - a.y);
  const titulo = candTit.length ? linhas(candTit.filter(i => Math.abs(i.y - candTit[0].y) < 3))[0].t : '';
  const yTit = candTit.length ? candTit[0].y : yMat - 40;

  const material = juntar(linhas(it.filter(i => i.y < yMat - 2 && i.y > yTit + 5 && i.x < xMatFim)));
  const esq = linhas(it.filter(i => i.y < yObj - 2 && i.y > yObs + 2 && i.x < xCol));
  const dir = linhas(it.filter(i => i.y < yObj - 2 && i.y > yObs + 2 && i.x >= xCol));
  const iComp = esq.findIndex(l => /^Comportamento-chave/i.test(l.t)), iInd = esq.findIndex(l => /^Indicadores de [eê]xito/i.test(l.t));
  const fatia = (a, b) => esq.slice(a < 0 ? 0 : a, b < 0 ? esq.length : b);
  const objetivo = juntar(fatia(0, iComp >= 0 ? iComp : iInd));
  const comportamento = iComp >= 0 ? juntar(fatia(iComp + 1, iInd)) : '';
  const indicadores = iInd >= 0 ? juntar(esq.slice(iInd + 1)) : '';
  const descricao = juntar(dir);

  const numPlano = (it.find(i => i.x > pageW * 0.85 && i.y > pageH * 0.92 && /^\d+$/.test(i.s)) || {}).s || '';
  const dataTxt = valorAoLado(/^Data$/), m = dataTxt.match(/(\d{2})-(\d{2})-(\d{4})/);
  const hora = (valorAoLado(/^Hora$/).match(/\d{1,2}:\d{2}/) || [''])[0];
  const int = v => (/^\d+$/.test(v) ? +v : null);

  return {
    numero_plano: int(numPlano), titulo_original: titulo,
    jogadores: int(valorAoLado(/^N[ºo°] Jogadores$/)), microciclo: int(valorAoLado(/^Microciclo$/)), mesociclo: int(valorAoLado(/^Mesociclo$/)),
    periodo: valorAoLado(/^Per[ií]odo$/), data: m ? `${m[3]}-${m[2]}-${m[1]}` : null, hora: hora || null,
    material, objetivo, comportamento, indicadores, descricao,
    recorte: { // área do desenho, em coordenadas do PDF (origem embaixo)
      x0: 10, x1: pageW * 0.895, yTopo: yTit - 9, yBase: yObj + 11
    }
  };
}

// Nome do exercício: mantém o título do plano; se for genérico ("Exercício 1"), cria a partir do objetivo.
function nomeDoExercicio(titulo, objetivo) {
  const t = (titulo || '').trim();
  if (t && !/^exerc[ií]cio\s*\d*\s*$/i.test(t)) return { nome: t, gerado: false };
  let o = (objetivo || '').replace(/^(com posse|com bola)\s*:\s*/i, '').split(/\n/)[0];
  o = o.split(/[,.;]| para /)[0].trim();
  o = o.replace(/^(desenvolver|trabalhar|melhorar|aprimorar|refinar|treinar|explorar|identificar|criar|promover|potencializar|estimular|consolidar|implementar|aperfeiçoar)\s+/i, '');
  o = o.replace(/^(a|o|as|os)\s+/i, '');
  if (!o) return { nome: t || 'Exercício', gerado: false };
  o = o.charAt(0).toUpperCase() + o.slice(1);
  if (o.length > 60) o = o.slice(0, 57).replace(/\s+\S*$/, '') + '…';
  return { nome: o, gerado: true };
}
if (window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

/* ---------- start ---------- */
sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT') telaLogin(); });
iniciar().catch(e => telaLogin(erroAmigavel(e)));
