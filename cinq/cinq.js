/* CINQ · Centro de Inteligência do QFC */
'use strict';

const SUPABASE_URL = 'https://xucaymymsctgbllwplbm.supabase.co';
const SUPABASE_KEY = 'sb_publishable_UGBRJf6WSRv29tnCoYXatA_kH44SE85';
const INICIO_PRETEMPORADA = '2026-11-02';
const LOGO = '../fotos/logo_qfc.png';

const POSICOES = ['Goleiro','Lateral Direito','Lateral Esquerdo','Zagueiro','Volante','Meia','Ponta Direito','Ponta Esquerda','Atacante'];
const TURNOS = ['Manhã','Tarde','Noite'];
const TIPOS = ['Treino','Amistoso','Avaliação','Recuperação','Folga'];
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
const S = { user: null, perfil: null, page: 'inicio', atletas: [], sessoes: [], micros: [], perfis: [], historico: [], mapa: [], semana: null, filtro: { q: '', pos: '', st: '' }, hf: { q: '', pos: '', ord: '' }, editMapa: false };

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
const fotoH = h => { const a = S.atletas.find(x => x.id === h.atleta_id); return foto({ nome: h.nome, foto_url: h.foto_url || a?.foto_url }); };
const iniciais = n => String(n || '?').trim().slice(0, 1).toUpperCase();
const foto = a => a.foto_url ? `<img class="av" src="${esc(a.foto_url)}" alt="">` : `<div class="av">${esc(iniciais(a.nome))}</div>`;

function toast(msg, bad = false) {
  const t = $('#toast'); t.textContent = msg; t.className = 'toast' + (bad ? ' bad' : ''); t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), bad ? 6000 : 2800);
}
function erroAmigavel(e) {
  const m = e?.message || String(e);
  if (/Invalid login credentials/i.test(m)) return 'E-mail ou senha incorretos.';
  if (/duplicate key.*sessoes_data_turno/i.test(m)) return 'Já existe uma sessão nesse dia e turno.';
  if (/duplicate key.*atletas_nome/i.test(m)) return 'Já existe um atleta com esse nome.';
  if (/row-level security|permission denied/i.test(m)) return 'Seu perfil não tem permissão para essa alteração.';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'Sem conexão com o servidor. Verifique a internet.';
  return m;
}
function modal(html) { const m = $('#modal'); m.innerHTML = `<div class="mbox">${html}</div>`; m.hidden = false; }
function fechar() { const m = $('#modal'); m.hidden = true; m.innerHTML = ''; }
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') fechar(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') fechar(); });
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
  const [a, s, m, h, t] = await Promise.all([
    sb.from('atletas').select('*').order('nome'),
    sb.from('sessoes').select('*').order('data').order('turno'),
    sb.from('microciclos').select('*').order('inicio'),
    sb.from('historico').select('*').order('nome'),
    sb.from('mapa_tatico').select('*').order('ordem')
  ]);
  for (const r of [a, s, m, h, t]) if (r.error) toast(erroAmigavel(r.error), true);
  S.atletas = a.data || []; S.sessoes = s.data || []; S.micros = m.data || []; S.historico = h.data || []; S.mapa = t.data || [];
  if (isAdmin()) { const p = await sb.from('perfis').select('*').order('nome'); S.perfis = p.data || []; }
}

/* ---------- estrutura ---------- */
const PAGINAS = [
  ['inicio', 'Início'], ['calendario', 'Calendário'], ['elenco', 'Elenco'], ['mapa', 'Mapa tático'], ['historico', 'Histórico']
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
  const prox = S.sessoes.filter(s => s.data >= h).sort((a, b) => a.data.localeCompare(b.data) || turnoOrd(a.turno) - turnoOrd(b.turno))[0];
  const hojeS = S.sessoes.filter(s => s.data === h).sort((a, b) => turnoOrd(a.turno) - turnoOrd(b.turno));
  const diasPre = Math.round((parse(INICIO_PRETEMPORADA) - parse(h)) / 864e5);
  const micro = S.micros.find(m => m.inicio <= h && m.fim >= h);
  const amistosos = S.sessoes.filter(s => s.tipo === 'Amistoso' && s.data >= h).length;
  $('#main').innerHTML = topo('CINQ · Painel', `Olá, ${S.perfil.nome}`, fmtLong(h).replace(/^./, c => c.toUpperCase())) + `
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
const cardSessaoLinha = s => `<div class="ses" data-ses="${s.id}" style="margin-bottom:8px"><div class="tt"><span>${esc(fmtLong(s.data))} · ${esc(s.turno)}${s.duracao_min ? ' · ' + s.duracao_min + ' min' : ''}</span><span class="badge t-${esc(s.tipo)}">${esc(s.tipo)}</span></div><div class="ti">${esc(s.titulo || s.objetivo || (s.tipo === 'Amistoso' && s.adversario ? 'x ' + s.adversario : s.tipo))}</div></div>`;

/* ---------- Calendário ---------- */
function pCalendario() {
  if (!S.semana) S.semana = segunda(hoje() < INICIO_PRETEMPORADA ? INICIO_PRETEMPORADA : hoje());
  const ini = S.semana, fim = addDays(ini, 6), h = hoje();
  const micro = S.micros.find(m => m.inicio <= fim && m.fim >= ini);
  const dias = [...Array(7)].map((_, i) => addDays(ini, i));
  $('#main').innerHTML = topo('CINQ · Organização de treino', 'Calendário', 'Semanas, sessões e planejamento',
    `<button class="btn" id="bmicros">Microciclos</button>${podeSessoes() ? '<button class="btn pri" id="bnova">+ Sessão</button>' : ''}`) + `
  <div class="weekbar">
    <button class="btn sm" id="bprev">◀</button><b>${fmt(ini)} a ${fmt(fim)}</b><button class="btn sm" id="bnext">▶</button>
    <button class="btn sm" id="bhoje">Semana atual</button>
    ${micro ? `<span class="micro">${esc(micro.nome)} · ${esc(micro.fase)}${micro.objetivo ? ' · ' + esc(micro.objetivo) : ''}</span>` : ''}
  </div>
  <div class="week">${dias.map((d, i) => {
    const ss = S.sessoes.filter(s => s.data === d).sort((a, b) => turnoOrd(a.turno) - turnoOrd(b.turno));
    return `<div class="day${d === h ? ' today' : ''}"><h3>${DIAS[i]} <em>${fmt(d)}</em></h3>
      ${ss.map(s => `<div class="ses" data-ses="${s.id}"><div class="tt"><span>${esc(s.turno)}${s.duracao_min ? ' · ' + s.duracao_min + "'" : ''}</span><span class="badge t-${esc(s.tipo)}">${esc(s.tipo)}</span></div><div class="ti">${esc(s.titulo || s.objetivo || (s.adversario ? 'x ' + s.adversario : ''))}</div></div>`).join('')}
      ${podeSessoes() ? `<button class="addses" data-add="${d}">+ adicionar</button>` : ''}</div>`;
  }).join('')}</div>`;
  $('#bprev').onclick = () => { S.semana = addDays(S.semana, -7); pCalendario(); };
  $('#bnext').onclick = () => { S.semana = addDays(S.semana, 7); pCalendario(); };
  $('#bhoje').onclick = () => { S.semana = segunda(hoje()); pCalendario(); };
  $('#bmicros').onclick = verMicros;
  if ($('#bnova')) $('#bnova').onclick = () => formSessao({ data: ini < h && fim >= h ? h : ini });
  document.querySelectorAll('[data-add]').forEach(b => b.onclick = () => formSessao({ data: b.dataset.add }));
  document.querySelectorAll('[data-ses]').forEach(el => el.onclick = () => verSessao(+el.dataset.ses));
}

function verSessao(id) {
  const s = S.sessoes.find(x => x.id === id); if (!s) return;
  const micro = S.micros.find(m => m.id === s.microciclo_id);
  const campo = (k, v) => v ? `<div class="k">${k}</div><p>${esc(v)}</p>` : '';
  modal(`<h2>${esc(s.tipo)} · ${esc(fmtLong(s.data))} · ${esc(s.turno)}</h2>
  <div class="detail">
    ${campo('Título', s.titulo)}${campo('Adversário', s.adversario)}${campo('Microciclo', micro?.nome)}
    ${campo('Objetivo', s.objetivo)}${campo('Conteúdo / exercícios', s.conteudo)}
    ${campo('Duração', s.duracao_min ? s.duracao_min + ' minutos' : '')}${campo('Local', s.local)}${campo('Observações', s.observacoes)}
    ${!s.titulo && !s.objetivo && !s.conteudo ? '<p class="empty">Sessão sem planejamento detalhado ainda.</p>' : ''}
  </div>
  <div class="mfoot"><span></span><div class="row"><button class="btn" id="mfechar">Fechar</button>${podeSessoes() ? '<button class="btn pri" id="meditar">Editar</button>' : ''}</div></div>`);
  $('#mfechar').onclick = fechar;
  if ($('#meditar')) $('#meditar').onclick = () => formSessao(s);
}

function microDaData(d) { return S.micros.find(m => m.inicio <= d && m.fim >= d)?.id || ''; }

function formSessao(s) {
  const novo = !s.id;
  const microSel = s.microciclo_id ?? microDaData(s.data);
  modal(`<h2>${novo ? 'Nova sessão' : 'Editar sessão'}</h2>
  <form id="fses">
    <div class="g3">
      <label class="f"><span>Data *</span><input class="in" type="date" name="data" value="${esc(s.data || '')}" required></label>
      <label class="f"><span>Turno *</span><select class="in" name="turno" required>${opts(TURNOS, s.turno || 'Manhã')}</select></label>
      <label class="f"><span>Tipo *</span><select class="in" name="tipo" id="ftipo" required>${opts(TIPOS, s.tipo || 'Treino')}</select></label>
    </div>
    <label class="f" id="fadv"><span>Adversário</span><input class="in" name="adversario" value="${esc(s.adversario || '')}" placeholder="Ex.: América-RN"></label>
    <label class="f"><span>Título</span><input class="in" name="titulo" value="${esc(s.titulo || '')}" placeholder="Ex.: Organização defensiva em bloco médio"></label>
    <label class="f"><span>Objetivo</span><textarea class="in" name="objetivo" style="min-height:60px">${esc(s.objetivo || '')}</textarea></label>
    <label class="f"><span>Conteúdo / exercícios</span><textarea class="in" name="conteudo" placeholder="Aquecimento, exercícios, jogos reduzidos…">${esc(s.conteudo || '')}</textarea></label>
    <div class="g3">
      <label class="f"><span>Duração (min)</span><input class="in" type="number" min="0" max="600" name="duracao_min" value="${esc(s.duracao_min ?? '')}"></label>
      <label class="f"><span>Local</span><input class="in" name="local" value="${esc(s.local || '')}"></label>
      <label class="f"><span>Microciclo</span><select class="in" name="microciclo_id">${opts(S.micros.map(m => [m.id, m.nome]), microSel, '—')}</select></label>
    </div>
    <label class="f"><span>Observações</span><textarea class="in" name="observacoes" style="min-height:60px">${esc(s.observacoes || '')}</textarea></label>
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
    const row = { data: f.data, turno: f.turno, tipo: f.tipo, titulo: nul(f.titulo), objetivo: nul(f.objetivo), conteudo: nul(f.conteudo),
      duracao_min: f.duracao_min ? +f.duracao_min : null, local: nul(f.local), microciclo_id: f.microciclo_id ? +f.microciclo_id : null,
      adversario: f.tipo === 'Amistoso' ? nul(f.adversario) : null, observacoes: nul(f.observacoes) };
    b.disabled = true;
    const q = novo ? sb.from('sessoes').insert(row).select().single() : sb.from('sessoes').update(row).eq('id', s.id).select().single();
    const { data, error } = await q;
    b.disabled = false;
    if (error) return toast(erroAmigavel(error), true);
    S.sessoes = novo ? [...S.sessoes, data] : S.sessoes.map(x => x.id === data.id ? data : x);
    fechar(); toast('Sessão salva.'); if (S.page === 'calendario') S.semana = segunda(data.data); ir(S.page);
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
  <div class="mfoot"><div class="row">${isAdmin() ? '<button class="btn" id="medcad">Editar cadastro</button>' : ''}${podeHistorico() ? `<button class="btn" id="medhist">${h ? 'Editar histórico' : 'Adicionar histórico'}</button>` : ''}</div><button class="btn pri" id="mf">Fechar</button></div>`);
  $('#mf').onclick = fechar;
  if ($('#medcad')) $('#medcad').onclick = () => formAtleta(a);
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
function pMapa() {
  const pode = podeMapa(), ed = S.editMapa && pode;
  const at = id => S.atletas.find(a => a.id === id);
  const noXI = new Set(S.mapa.map(m => m.atleta_id).filter(Boolean));
  const banco = S.atletas.filter(a => a.ativo && a.status !== 'Inativo' && !noXI.has(a.id)).sort((a, b) => POSICOES.indexOf(a.posicao) - POSICOES.indexOf(b.posicao) || a.nome.localeCompare(b.nome));
  const opcoes = S.atletas.filter(a => a.ativo).sort((a, b) => POSICOES.indexOf(a.posicao) - POSICOES.indexOf(b.posicao) || a.nome.localeCompare(b.nome)).map(a => [a.id, `${a.nome} · ${a.posicao}`]);
  $('#main').innerHTML = topo('CINQ · Modelo de jogo', 'Mapa tático', '11 inicial de referência', pode ? (ed ? '<button class="btn" id="bmcanc">Concluir</button>' : '<button class="btn pri" id="bmed">Editar escalação</button>') : '') + `
  <div class="tactical">
    <div class="pitch"><div class="pl mid"></div><div class="pc"></div><div class="pg top"></div><div class="pg bot"></div><div class="pa top"></div><div class="pa bot"></div>
      ${S.mapa.map(m => { const a = at(m.atleta_id); return `<div class="dot" style="left:${m.x}%;top:${m.y}%">${a ? foto(a) : '<div class="av">?</div>'}<span>${esc(a?.nome || '—')}</span></div>`; }).join('')}
    </div>
    <div class="panel"><h2>11 inicial</h2>
      ${S.mapa.map(m => { const a = at(m.atleta_id); return ed
        ? `<div class="kv"><span>${m.ordem}.</span><select class="in" data-slot="${m.ordem}" style="max-width:260px">${opts(opcoes, m.atleta_id, '— vazio —')}</select></div>`
        : `<div class="kv"><span><b>${m.ordem}.</b> ${esc(a?.nome || '—')}</span><b>${esc(a?.posicao || '')}</b></div>`; }).join('')}
      <h2 style="margin-top:16px">Banco / opções</h2>
      ${banco.map(a => `<div class="kv small"><span>${esc(a.nome)}</span><span class="m">${esc(a.posicao)}</span></div>`).join('') || '<div class="empty">—</div>'}
    </div>
  </div>`;
  if ($('#bmed')) $('#bmed').onclick = () => { S.editMapa = true; pMapa(); };
  if ($('#bmcanc')) $('#bmcanc').onclick = () => { S.editMapa = false; pMapa(); };
  document.querySelectorAll('[data-slot]').forEach(sel => sel.onchange = async () => {
    const ordem = +sel.dataset.slot, id = sel.value ? +sel.value : null;
    const dup = id && S.mapa.find(m => m.atleta_id === id && m.ordem !== ordem);
    const ups = [{ ordem, atleta_id: id }]; if (dup) ups.push({ ordem: dup.ordem, atleta_id: S.mapa.find(m => m.ordem === ordem).atleta_id });
    for (const u of ups) {
      const { error } = await sb.from('mapa_tatico').update({ atleta_id: u.atleta_id }).eq('ordem', u.ordem);
      if (error) { toast(erroAmigavel(error), true); return pMapa(); }
      S.mapa.find(m => m.ordem === u.ordem).atleta_id = u.atleta_id;
    }
    toast(dup ? 'Posições trocadas.' : 'Escalação atualizada.'); pMapa();
  });
}

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
    <div class="note" style="margin:0">Todas as funções <b>veem</b> todo o CINQ. Hoje, <b>editam</b>: calendário e sessões → Técnico/Auxiliar e Análise de desempenho; elenco e acessos → administrador. As áreas de Fisiologia, Fisioterapia e Técnico individual terão permissão de edição própria quando forem criadas. <b>Visualização</b> só consulta.</div></div>`;
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

/* ---------- start ---------- */
sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT') telaLogin(); });
iniciar().catch(e => telaLogin(erroAmigavel(e)));
