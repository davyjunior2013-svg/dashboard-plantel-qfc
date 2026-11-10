/* CINQ – Live Tagging: marcação manual de eventos ao vivo.
   Coleta (notebook): clica no campo onde aconteceu o lance e aperta a tecla do botão. Depois, se o botão pedir:
   destino (seta), descritor (1–9) e camisa (número + Enter). Esc cancela, Ctrl+Z desfaz o último lance.
   Cada pessoa monta o próprio painel de botões e só vê o seu. Os lances de todos caem no mesmo jogo.
   Resultados: atualizam sozinhos (Realtime) – números, campo (pontos, calor das ações, zonas), tabelas e PDF.
   Coordenadas x,y em % com a nossa equipe atacando para a direita (x=100). O campo da coleta pode ser invertido
   para acompanhar a transmissão e vira sozinho no 2º tempo.
   Função coleta: só enxerga o Live Tagging. Coletar: admin, analise, coleta. Jogos e escudos: admin e analise. */
FUNCOES.coleta = 'Coleta de dados (Live Tagging)';
const ltSouColeta = () => !isAdmin() && S.perfil?.funcao === 'coleta';
const ltColetar = () => isAdmin() || ['analise', 'coleta'].includes(S.perfil?.funcao);
const ltGerenciar = () => isAdmin() || S.perfil?.funcao === 'analise';
S.lt = { jogos: null, jogo: null, aba: 'coleta', lances: [], botoes: null, escudos: {}, nomes: {}, pend: null, canal: null, tick: null, poll: null, fila: [],
  f: { t: 0, eq: '', acao: '', num: '', vis: 'pontos' } };
const LT_FAIXAS = [[1, 0, 15, "0–15'"], [1, 15, 30, "16–30'"], [1, 30, 999, "31–45+'"], [2, 45, 60, "46–60'"], [2, 60, 75, "61–75'"], [2, 75, 999, "76–90+'"]];
const LT_COR = ['Esquerdo', 'Central', 'Direito'], LT_TER = ['Defensivo', 'Médio', 'Ofensivo'];
const LT_FASE = { pre: 'Antes do jogo', '1T': '1º tempo', INT: 'Intervalo', '2T': '2º tempo', FIM: 'Encerrado' };
const LT_SUGESTAO = [
  { nome: 'Finalização', tecla: 'F', cor: '#0f7a3d', equipe: 'QFC', descritores: ['Gol', 'No alvo', 'Fora', 'Bloqueada'], camisa: true },
  { nome: 'Fin. adversário', tecla: 'A', cor: '#13295b', equipe: 'ADV', descritores: ['Gol', 'No alvo', 'Fora', 'Bloqueada'], camisa: false },
  { nome: 'Recuperação', tecla: 'R', cor: '#e57373', equipe: 'QFC', descritores: ['Bem-sucedida', 'Mal-sucedida'], camisa: true },
  { nome: 'Roubada', tecla: 'B', cor: '#b71c1c', equipe: 'QFC', descritores: ['Bem-sucedida', 'Mal-sucedida'], camisa: true },
  { nome: 'Perda de posse', tecla: 'P', cor: '#ef6c00', equipe: 'QFC', descritores: [], camisa: true },
  { nome: 'Falta cometida', tecla: 'C', cor: '#5d6b78', equipe: 'QFC', descritores: ['Sem cartão', 'Amarelo', 'Vermelho'], camisa: true },
  { nome: 'Escanteio a favor', tecla: 'E', cor: '#7b3fa0', equipe: 'QFC', descritores: [], camisa: false },
  { nome: 'Cruzamento', tecla: 'X', cor: '#e0a526', equipe: 'QFC', descritores: ['Certo', 'Errado'], camisa: true, seta: true }
];

/* ---------- campo: zonas e relógio ---------- */
const ltCorr = y => y < 100 / 3 ? 0 : y < 200 / 3 ? 1 : 2;           // nosso ataque para a direita: esquerdo = parte de cima
const ltTerco = x => x < 100 / 3 ? 0 : x < 200 / 3 ? 1 : 2;
const ltArea = (x, y) => y >= 20.4 && y <= 79.6 && (x >= 84.3 ? 'ataque' : x <= 15.7 ? 'defesa' : null);
const ltMin = s => s == null ? '—' : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const ltTempoJ = j => ['2T', 'FIM'].includes(j?.relogio?.fase) ? 2 : 1;
function ltSeg(j) {
  const r = j?.relogio || {}, dec = () => Math.max(0, Math.floor((Date.now() - (+r.ini || Date.now())) / 1000) + (+r.aj || 0));
  if (r.fase === '1T') return dec();
  if (r.fase === '2T') return 2700 + dec();
  if (r.fase === 'INT') return r.fim1 ?? 2700;
  if (r.fase === 'FIM') return r.fim2 ?? 5400;
  return 0;
}
const ltJogo = () => (S.lt.jogos || []).find(j => j.id === S.lt.jogo);
const ltNomeAut = id => S.lt.nomes[id] || '';
const ltGols = (j, L) => [j.gols_nos ?? L.filter(l => l.gol && l.equipe === 'QFC').length, j.gols_adv ?? L.filter(l => l.gol && l.equipe === 'ADV').length];
const ltChave = n => String(n || '').trim().toLowerCase();
const ltAtlNum = n => n ? S.atletas.find(a => a.ativo && a.status !== 'Inativo' && String(a.numero) === String(n)) : null;
const ltOrd = L => L.sort((a, b) => a.tempo - b.tempo || (a.seg ?? -1) - (b.seg ?? -1) || a.id - b.id);

/* ---------- dados ---------- */
async function ltCarregarJogos() {
  const [j, e, p] = await Promise.all([
    sb.from('lt_jogos').select('*').order('data', { ascending: false, nullsFirst: false }).order('id', { ascending: false }),
    sb.from('lt_escudos').select('*'), sb.from('perfis').select('id,nome')]);
  if (j.error) throw j.error;
  S.lt.jogos = j.data; S.lt.escudos = {}; (e.data || []).forEach(x => { S.lt.escudos[x.nome] = x.img; });
  S.lt.nomes = {}; (p.data || []).forEach(x => { S.lt.nomes[x.id] = x.nome.split(' ')[0]; });
}
async function ltCarregarLances(id) {
  const { data, error } = await sb.from('lt_lances').select('*').eq('jogo_id', id).order('id');
  if (error) throw error; S.lt.lances = data;
}
async function ltCarregarBotoes() {
  if (!ltColetar()) { S.lt.botoes = []; return; }
  const { data, error } = await sb.from('lt_botoes').select('*').eq('dono', S.perfil.id).order('ordem').order('id');
  if (error) throw error; S.lt.botoes = data;
}
function ltSair() {
  if (S.lt.canal) { try { sb.removeChannel(S.lt.canal); } catch (e) { /* ok */ } S.lt.canal = null; }
  clearInterval(S.lt.tick); clearInterval(S.lt.poll); S.lt.tick = S.lt.poll = null; S.lt.pend = null; clearTimeout(S.lt.auto);
}
function ltAssinar(id) {
  ltSair();
  S.lt.canal = sb.channel('lt-' + id)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'lt_lances', filter: 'jogo_id=eq.' + id }, p => {
      if (p.eventType === 'DELETE') S.lt.lances = S.lt.lances.filter(l => l.id !== p.old?.id);
      else if (p.new) { const i = S.lt.lances.findIndex(l => l.id === p.new.id); i >= 0 ? (S.lt.lances[i] = p.new) : S.lt.lances.push(p.new); }
      ltMudou();
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'lt_jogos', filter: 'id=eq.' + id }, p => {
      const j = ltJogo(); if (j && p.new) { Object.assign(j, p.new); ltMudou(true); }
    })
    .subscribe();
  S.lt.tick = setInterval(ltRelogioTxt, 1000);
  S.lt.poll = setInterval(async () => {   // segurança caso o ao vivo caia
    if (S.page !== 'live' || S.lt.jogo !== id) return;
    try { const n = S.lt.lances.length; await ltCarregarLances(id); const { data } = await sb.from('lt_jogos').select('*').eq('id', id).single();
      if (data) Object.assign(ltJogo() || {}, data); if (S.lt.lances.length !== n || data) ltMudou(!!data); } catch (e) { /* tenta de novo */ }
    ltEnviarFila();
  }, 20000);
}
let ltMudouT = null;
function ltMudou(placar) {
  clearTimeout(ltMudouT);
  ltMudouT = setTimeout(() => {
    if (S.page !== 'live' || !S.lt.jogo) return;
    ltPlacarAtualiza();
    if (S.lt.aba === 'resultados') ltResultadosRender();
    else if (S.lt.aba === 'coleta') { ltMeusLances(); ltCampoColetaPontos(); }
  }, placar ? 0 : 250);
}

/* ---------- página ---------- */
async function pLive() {
  if (S.lt.jogo) return ltAbrir(S.lt.jogo);
  ltSair();
  const g = ltGerenciar(), cab = () => topo('Análise de jogo', 'Live Tagging', 'Marcação manual de eventos ao vivo: clique no campo e aperte a tecla. Os resultados aparecem sozinhos.',
    (ltColetar() ? '<button class="btn" id="ltbot">Meus botões</button>' : '') + (g ? '<button class="btn pri" id="ltnovo">+ Novo jogo</button>' : ''));
  $('#main').innerHTML = cab() + '<div class="panel empty">Carregando…</div>';
  try { await ltCarregarJogos(); await ltCarregarBotoes(); } catch (e) { $('#main .panel').innerHTML = esc(erroAmigavel(e)); return; }
  const J = S.lt.jogos;
  const fase = j => { const f = j.relogio?.fase || 'pre'; return `<span class="badge lt-f-${f}">${['1T', '2T'].includes(f) ? '● ' : ''}${LT_FASE[f]}</span>`; };
  $('#main').innerHTML = cab() + (S.lt.botoes && !S.lt.botoes.length && ltColetar() ? `<div class="panel lt-aviso"><b>Monte o seu painel de botões antes do jogo.</b> Cada botão tem nome, tecla, cor e, se quiser, descritores. <button class="btn sm pri" id="ltbot2">Montar meus botões</button></div>` : '')
    + (J.length ? `<div class="panel"><div class="tablewrap"><table class="tb fl-tab"><thead><tr><th>Data</th><th>Jogo</th><th>Situação</th><th></th></tr></thead><tbody>${J.map(j =>
      `<tr class="dm-tr" data-j="${j.id}"><td>${j.data ? dataBR(j.data) : '—'}</td><td>${ltEscudo(j.equipe, 22)} <b>${esc(j.equipe)}${j.gols_nos != null ? ` ${j.gols_nos} × ${j.gols_adv ?? 0}` : ' ×'} ${esc(j.adversario)}</b> ${ltEscudo(j.adversario, 22)}<small class="m">${esc([j.competicao, j.rodada, j.mando].filter(Boolean).join(' · '))}</small></td><td>${fase(j)}</td><td><button class="btn sm">Abrir</button></td></tr>`).join('')}</tbody></table></div></div>`
      : `<div class="panel empty">Nenhum jogo ainda.${g ? ' Use “+ Novo jogo”.' : ' O analista cria o jogo antes da partida.'}</div>`);
  document.querySelectorAll('[data-j]').forEach(tr => tr.onclick = () => { S.lt.jogo = +tr.dataset.j; S.lt.aba = ltColetar() ? 'coleta' : 'resultados'; ltAbrir(S.lt.jogo); });
  if ($('#ltnovo')) $('#ltnovo').onclick = () => ltFormJogo(null);
  ['#ltbot', '#ltbot2'].forEach(s => { if ($(s)) $(s).onclick = () => ltFormBotoes(); });
}
function ltEscudo(nome, sz = 40) {
  const img = S.lt.escudos[ltChave(nome)];
  if (img) return `<img class="lt-esc" src="${img}" alt="" style="width:${sz}px;height:${sz}px">`;
  const ini = String(nome || '?').split(/\s+/).map(p => p[0]).join('').slice(0, 3).toUpperCase();
  return `<span class="lt-esc lt-esc-i" style="width:${sz}px;height:${sz}px;font-size:${Math.round(sz * .34)}px">${esc(ini)}</span>`;
}
async function ltAbrir(id) {
  $('#main').innerHTML = '<div class="panel empty">Carregando…</div>';
  try { if (!S.lt.jogos) await ltCarregarJogos(); if (!S.lt.botoes) await ltCarregarBotoes(); await ltCarregarLances(id); }
  catch (e) { $('#main').innerHTML = `<div class="panel">${esc(erroAmigavel(e))}</div>`; return; }
  const j = ltJogo(); if (!j) { S.lt.jogo = null; return pLive(); }
  if (S.lt.aba === 'coleta' && !ltColetar()) S.lt.aba = 'resultados';
  try { S.lt.fila = JSON.parse(localStorage.getItem('lt_fila') || '[]'); } catch (e) { S.lt.fila = []; }
  $('#main').innerHTML = `<div class="lt-top"><button class="btn sm" id="ltvolta">← Jogos</button><div id="ltplacar"></div></div>
    <div class="ind-tabs lt-abas">${ltColetar() ? `<button data-a="coleta" class="${S.lt.aba === 'coleta' ? 'on' : ''}">Coleta</button>` : ''}<button data-a="resultados" class="${S.lt.aba === 'resultados' ? 'on' : ''}">Resultados <span class="lt-vivo" title="Atualiza sozinho">● ao vivo</span></button>
    ${ltGerenciar() ? '<button class="fl-refb" id="ltedj">Dados do jogo</button>' : ''}</div><div id="ltcorpo"></div>`;
  $('#ltvolta').onclick = () => { ltSair(); S.lt.jogo = null; pLive(); };
  document.querySelectorAll('.lt-abas [data-a]').forEach(b => b.onclick = () => { S.lt.aba = b.dataset.a; S.lt.pend = null;
    document.querySelectorAll('.lt-abas [data-a]').forEach(x => x.classList.toggle('on', x === b)); ltCorpo(); });
  if ($('#ltedj')) $('#ltedj').onclick = () => ltFormJogo(j);
  ltPlacarAtualiza(); ltCorpo(); ltAssinar(id); ltEnviarFila();
}
function ltCorpo() { S.lt.aba === 'coleta' ? ltColetaRender() : ltResultadosRender(); }

/* ---------- placar e relógio ---------- */
function ltPlacarAtualiza() {
  const j = ltJogo(), box = $('#ltplacar'); if (!j || !box) return;
  const [gn, ga] = ltGols(j, S.lt.lances), f = j.relogio?.fase || 'pre', pode = ltColetar();
  const ctl = !pode ? '' : f === 'pre' ? '<button class="btn sm pri" data-r="1T">▶ Iniciar 1º tempo</button>'
    : f === '1T' ? '<button class="btn sm" data-r="INT">⏸ Fim do 1º tempo</button><button class="btn sm" data-r="aj">Ajustar</button>'
    : f === 'INT' ? '<button class="btn sm pri" data-r="2T">▶ Iniciar 2º tempo</button>'
    : f === '2T' ? '<button class="btn sm" data-r="FIM">■ Fim de jogo</button><button class="btn sm" data-r="aj">Ajustar</button>'
    : '<button class="btn sm" data-r="2T+">Reabrir 2º tempo</button>';
  box.innerHTML = `<div class="lt-placar"><div class="lt-eq">${ltEscudo(j.equipe, 44)}<b>${esc(j.equipe)}</b></div><div class="lt-gols">${gn}<i>×</i>${ga}</div><div class="lt-eq adv"><b>${esc(j.adversario)}</b>${ltEscudo(j.adversario, 44)}</div>
    <div class="lt-rel"><b id="ltclk">${ltMin(ltSeg(j))}</b><span class="lt-f lt-f-${f}">${['1T', '2T'].includes(f) ? '● ' : ''}${LT_FASE[f]}</span></div>
    <div class="lt-info"><small>${esc([j.data ? dataBR(j.data) : '', j.competicao, j.rodada, j.mando].filter(Boolean).join(' · '))}</small><div class="row">${ctl}</div></div></div>`;
  box.querySelectorAll('[data-r]').forEach(b => b.onclick = () => ltRelogioAcao(j, b.dataset.r));
}
function ltRelogioTxt() { const j = ltJogo(), el = $('#ltclk'); if (j && el) el.textContent = ltMin(ltSeg(j)); }
async function ltRelogioAcao(j, a) {
  const r = { ...(j.relogio || {}) }, agora = Date.now();
  if (a === 'aj') {
    modal(`<h2>Ajustar o relógio</h2><p class="m">Digite o minuto que está no relógio do jogo agora (ex.: ${ltTempoJ(j) === 2 ? '52:10' : '12:30'}).</p>
      <label class="f"><span>Minuto agora</span><input class="in" id="ltajv" value="${ltMin(ltSeg(j))}"></label>
      <div class="mfoot"><span></span><div class="row"><button class="btn" id="ltajx">Cancelar</button><button class="btn pri" id="ltajs">Ajustar</button></div></div>`);
    $('#ltajv').select(); $('#ltajx').onclick = fechar;
    const ok = async () => { const p = $('#ltajv').value.trim().split(':').map(Number); if (p.some(isNaN)) return toast('Use minutos:segundos.', true);
      const alvo = p.length === 1 ? p[0] * 60 : p[0] * 60 + p[1], base = ltTempoJ(j) === 2 ? 2700 : 0;
      r.aj = alvo - base - Math.floor((Date.now() - r.ini) / 1000); fechar(); await ltSalvarRelogio(j, r); };
    $('#ltajs').onclick = ok; $('#ltajv').onkeydown = e => { if (e.key === 'Enter') ok(); };
    return;
  }
  if (a === 'INT') { if (!confirm('Encerrar o 1º tempo?')) return; r.fim1 = ltSeg(j); r.fase = 'INT'; }
  else if (a === 'FIM') { if (!confirm('Encerrar o jogo?')) return; r.fim2 = ltSeg(j); r.fase = 'FIM'; }
  else if (a === '1T' || a === '2T') { r.fase = a; r.ini = agora; r.aj = 0; }
  else if (a === '2T+') { r.fase = '2T'; }
  await ltSalvarRelogio(j, r);
}
async function ltSalvarRelogio(j, r) {
  const ant = j.relogio; j.relogio = r; ltPlacarAtualiza(); if (S.lt.aba === 'coleta') ltColetaStatus();
  const { error } = await sb.rpc('lt_relogio', { p_jogo: j.id, p_relogio: r });
  if (error) { j.relogio = ant; ltPlacarAtualiza(); toast(erroAmigavel(error), true); }
}

/* ---------- coleta ---------- */
const ltInvKey = () => 'lt_inv_' + S.lt.jogo;
const ltInv1 = () => { try { return localStorage.getItem(ltInvKey()) === '1'; } catch (e) { return false; } };
const ltInvAgora = () => ltInv1() !== (ltTempoJ(ltJogo()) === 2);   // vira sozinho no 2º tempo
const ltTela = (x, y) => ltInvAgora() ? [100 - x, 100 - y] : [x, y];
function ltColetaRender() {
  const B = S.lt.botoes || [];
  $('#ltcorpo').innerHTML = `<div class="lt-col">
    <div class="lt-cw"><div class="lt-st" id="ltst"></div>
      <div class="lt-campo" id="ltcampo"><svg viewBox="-2 -1 109 70" preserveAspectRatio="xMidYMid meet" id="ltsvg"><rect x="-2" y="-1" width="109" height="70" fill="#3f7a4e"/>
        <g class="lt-gr">${PJ_LINHAS}</g><g id="ltpts"></g><g id="ltpend"></g></svg></div>
      <div class="lt-cbar"><span id="ltsent"></span><button class="btn sm" id="ltinv">⇄ Inverter campo</button>
        <small class="m"><kbd>Esc</kbd> cancela · <kbd>Ctrl</kbd>+<kbd>Z</kbd> desfaz o último · <kbd>Enter</kbd> confirma</small></div></div>
    <aside class="lt-pain"><div class="lt-ph"><b>Meu painel</b><button class="btn sm" id="ltbotc">Editar botões</button></div>
      ${B.length ? `<div class="lt-bts">${B.map(b => `<div class="lt-bt" data-b="${b.id}" style="--c:${esc(b.cor)}"><kbd>${esc(b.tecla)}</kbd><div><b>${esc(b.nome)}</b><small>${b.equipe === 'ADV' ? 'adversário' : 'nossa equipe'}${b.seta ? ' · seta' : ''}${b.camisa ? ' · camisa' : ''}${b.gol ? ' · gol' : ''}</small>
        ${(b.descritores || []).length ? `<small class="lt-ds">${b.descritores.map((d, i) => `<i>${i + 1}</i> ${esc(d)}`).join(' ')}</small>` : ''}</div></div>`).join('')}</div>`
        : '<p class="m">Você ainda não tem botões. <button class="btn sm pri" id="ltbotc2">Montar meus botões</button></p>'}
      <div class="lt-ph"><b>Meus últimos lances</b><small class="m" id="ltfila"></small></div><div id="ltmeus"></div></aside></div>`;
  $('#ltbotc').onclick = () => ltFormBotoes(); if ($('#ltbotc2')) $('#ltbotc2').onclick = () => ltFormBotoes();
  $('#ltinv').onclick = () => { try { localStorage.setItem(ltInvKey(), ltInv1() ? '0' : '1'); } catch (e) { /* ok */ } S.lt.pend = null; ltColetaStatus(); ltCampoColetaPontos(); ltPendDesenha(); };
  $('#ltsvg').addEventListener('mousedown', ltCliqueCampo);
  ltColetaStatus(); ltCampoColetaPontos(); ltMeusLances();
}
function ltColetaStatus() {
  const st = $('#ltst'); if (!st) return; const p = S.lt.pend, j = ltJogo(), f = j.relogio?.fase || 'pre';
  $('#ltsent').innerHTML = ltInvAgora() ? '<b>← Nosso ataque</b>' : '<b>Nosso ataque →</b>';
  let t;
  if (!p) t = f === 'pre' ? '<span class="lt-aten">O relógio ainda não começou.</span> Os lances entram como 0:00 até alguém iniciar o 1º tempo. Clique no campo para marcar.'
    : '<b>Clique no campo</b> onde aconteceu o lance.';
  else if (p.etapa === 'tecla') t = `<b class="lt-pisca">Aperte a tecla do lance</b> · ${ltMin(p.seg)}`;
  else if (p.etapa === 'destino') t = `<b style="color:${esc(p.b.cor)}">${esc(p.b.nome)}</b> · <b class="lt-pisca">clique no destino</b>`;
  else if (p.etapa === 'desc') t = `<b style="color:${esc(p.b.cor)}">${esc(p.b.nome)}</b> · ${p.b.descritores.map((d, i) => `<kbd>${i + 1}</kbd> ${esc(d)}`).join(' ')} · <kbd>Enter</kbd> sem descritor`;
  else if (p.etapa === 'camisa') t = `<b style="color:${esc(p.b.cor)}">${esc(p.b.nome)}</b>${p.desc ? ' · ' + esc(p.desc) : ''} · Camisa: <b class="lt-num">${esc(p.num || '_')}</b> <kbd>Enter</kbd> salva`;
  st.innerHTML = t + (p && p.etapa !== 'tecla' ? '<i class="lt-auto"></i>' : '');
}
function ltSvgPt(e) {
  const svg = $('#ltsvg'), pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
  const q = pt.matrixTransform(svg.getScreenCTM().inverse());
  const sx = Math.min(100, Math.max(0, q.x / 1.05)), sy = Math.min(100, Math.max(0, q.y / .68));
  const [x, y] = ltTela(sx, sy); return [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
}
function ltCliqueCampo(e) {
  e.preventDefault(); if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  const [x, y] = ltSvgPt(e), p = S.lt.pend, j = ltJogo();
  if (p && p.etapa === 'destino') { p.x2 = x; p.y2 = y; ltProxima(p); return; }
  if (p && (p.etapa === 'desc' || p.etapa === 'camisa')) ltSalvarPend();
  S.lt.pend = { x, y, seg: ltSeg(j), tempo: ltTempoJ(j), etapa: 'tecla', num: '' };
  ltPendDesenha(); ltColetaStatus();
}
function ltProxima(p) {
  if (p.b.seta && p.x2 == null) p.etapa = 'destino';
  else if ((p.b.descritores || []).length && p.desc === undefined) p.etapa = 'desc';
  else if (p.b.camisa && p.etapa !== 'camisa') p.etapa = 'camisa';
  else return ltSalvarPend();
  ltPendDesenha(); ltColetaStatus(); ltAutoSalvar();
}
function ltAutoSalvar() {  // se ninguém mexer, salva sozinho
  clearTimeout(S.lt.auto); const p = S.lt.pend; if (!p || p.etapa === 'tecla' || p.etapa === 'destino') return;
  const a = $('.lt-auto'); if (a) { a.style.animation = 'none'; void a.offsetWidth; a.style.animation = ''; }
  S.lt.auto = setTimeout(() => { if (S.lt.pend === p) ltSalvarPend(); }, 4000);
}
function ltPendDesenha() {
  const g = $('#ltpend'); if (!g) return; const p = S.lt.pend; if (!p) { g.innerHTML = ''; return; }
  const [x, y] = ltTela(p.x, p.y), c = p.b?.cor || '#fff';
  let s = '';
  if (p.x2 != null) { const [x2, y2] = ltTela(p.x2, p.y2); s += `<line x1="${x * 1.05}" y1="${y * .68}" x2="${x2 * 1.05}" y2="${y2 * .68}" stroke="${esc(c)}" stroke-width=".7"/><circle cx="${x2 * 1.05}" cy="${y2 * .68}" r="1" fill="${esc(c)}"/>`; }
  s += `<circle class="lt-pc" cx="${x * 1.05}" cy="${y * .68}" r="2.6" fill="${esc(c)}" stroke="#fff" stroke-width=".5"/>`;
  g.innerHTML = s;
}
function ltCampoColetaPontos() {
  const g = $('#ltpts'); if (!g) return; const t = ltTempoJ(ltJogo());
  const L = S.lt.lances.filter(l => l.autor === S.perfil.id && l.tempo === t && l.x != null).slice(-25);
  g.innerHTML = L.map(l => { const [x, y] = ltTela(+l.x, +l.y); return `<circle cx="${x * 1.05}" cy="${y * .68}" r="1.5" fill="${esc(l.cor || '#fff')}" stroke="#fff" stroke-width=".3" opacity=".75"/>`; }).join('');
}
function ltMeusLances() {
  const box = $('#ltmeus'); if (!box) return;
  const L = S.lt.lances.filter(l => l.autor === S.perfil.id).slice(-12).reverse();
  const fila = S.lt.fila.filter(f => f.jogo_id === S.lt.jogo);
  $('#ltfila').textContent = fila.length ? `${fila.length} aguardando internet` : '';
  box.innerHTML = (fila.map(l => `<div class="lt-ml fila"><span>${l.tempo}ºT ${ltMin(l.seg)}</span><b style="color:${esc(l.cor)}">${esc(l.acao)}</b><small>${esc([l.descritor, l.num ? '#' + l.num : ''].filter(Boolean).join(' · '))} · na fila</small></div>`).join('')
    + L.map(l => `<div class="lt-ml"><span>${l.tempo}ºT ${ltMin(l.seg)}</span><b style="color:${esc(l.cor)}">${esc(l.acao)}</b><small>${esc([l.descritor, l.num ? '#' + l.num : ''].filter(Boolean).join(' · '))}</small><button class="lt-x" data-x="${l.id}" title="Apagar">✕</button></div>`).join(''))
    || '<p class="m">Nenhum lance seu ainda.</p>';
  box.querySelectorAll('[data-x]').forEach(b => b.onclick = () => ltApagar(+b.dataset.x));
}
async function ltSalvarPend() {
  clearTimeout(S.lt.auto); const p = S.lt.pend; if (!p || !p.b) return; S.lt.pend = null;
  const b = p.b, at = b.equipe === 'QFC' ? ltAtlNum(p.num) : null;
  const row = { jogo_id: S.lt.jogo, autor: S.perfil.id, botao_id: b.id, acao: b.nome, cor: b.cor, equipe: b.equipe, tempo: p.tempo, seg: p.seg,
    x: p.x, y: p.y, x2: p.x2 ?? null, y2: p.y2 ?? null, descritor: p.desc || null, num: p.num || null, atleta_id: at?.id || null,
    gol: !!b.gol || /^gol$/i.test(String(p.desc || '').trim()) };
  ltPendDesenha(); ltColetaStatus();
  const st = $('#ltst'); if (st) st.insertAdjacentHTML('beforeend', `<span class="lt-ok">✓ ${esc(b.nome)}${row.descritor ? ' · ' + esc(row.descritor) : ''}${row.num ? ' · #' + esc(row.num) : ''} · ${ltMin(row.seg)}</span>`);
  const { data, error } = await sb.from('lt_lances').insert(row).select().single();
  if (error) {
    if (/fetch|network|Failed|timeout/i.test(error.message || '')) { S.lt.fila.push(row); ltGuardarFila(); toast('Sem internet: o lance ficou guardado e vai ser enviado sozinho.', true); }
    else toast(erroAmigavel(error), true);
  } else if (!S.lt.lances.some(l => l.id === data.id)) S.lt.lances.push(data);
  ltMeusLances(); ltCampoColetaPontos(); ltPlacarAtualiza();
}
const ltGuardarFila = () => { try { localStorage.setItem('lt_fila', JSON.stringify(S.lt.fila)); } catch (e) { /* ok */ } };
async function ltEnviarFila() {
  if (!S.lt.fila.length) return;
  const f = [...S.lt.fila]; const { data, error } = await sb.from('lt_lances').insert(f).select();
  if (error) return; S.lt.fila = []; ltGuardarFila();
  data.forEach(d => { if (!S.lt.lances.some(l => l.id === d.id) && d.jogo_id === S.lt.jogo) S.lt.lances.push(d); });
  toast(`${data.length} lance(s) guardado(s) enviados.`); ltMudou();
}
async function ltApagar(id) {
  const { error } = await sb.from('lt_lances').delete().eq('id', id); if (error) return toast(erroAmigavel(error), true);
  S.lt.lances = S.lt.lances.filter(l => l.id !== id); ltMudou(true);
}
document.addEventListener('keydown', e => {
  if (S.page !== 'live' || !S.lt.jogo || S.lt.aba !== 'coleta' || !$('#ltsvg')) return;
  if (!$('#modal').hidden) return;
  const tg = e.target; if (tg && /INPUT|TEXTAREA|SELECT/.test(tg.tagName)) return;
  const p = S.lt.pend, k = e.key;
  if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'z') { e.preventDefault(); if (p) { S.lt.pend = null; ltPendDesenha(); ltColetaStatus(); return; }
    const meu = S.lt.lances.filter(l => l.autor === S.perfil.id).sort((a, b) => b.id - a.id)[0]; if (meu) { ltApagar(meu.id); toast(`Desfeito: ${meu.acao} ${ltMin(meu.seg)}`); } return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (k === 'Escape') { if (p) { e.preventDefault(); clearTimeout(S.lt.auto); S.lt.pend = null; ltPendDesenha(); ltColetaStatus(); } return; }
  if (!p) { if (k.length === 1 && /\S/.test(k) && (S.lt.botoes || []).some(b => b.tecla.toUpperCase() === k.toUpperCase())) { e.preventDefault(); toast('Clique no campo primeiro, depois aperte a tecla.', true); } return; }
  if (p.etapa === 'tecla') {
    if (k.length !== 1) return; e.preventDefault();
    const b = (S.lt.botoes || []).find(x => x.tecla.toUpperCase() === k.toUpperCase());
    if (!b) return toast(`A tecla ${k.toUpperCase()} não está no seu painel.`, true);
    p.b = b; ltProxima(p); return;
  }
  if (p.etapa === 'desc') {
    const n = +k, D = p.b.descritores || [];
    if (k === 'Enter' || k === '0') { e.preventDefault(); p.desc = null; ltProxima(p); }
    else if (n >= 1 && n <= D.length) { e.preventDefault(); p.desc = D[n - 1]; ltProxima(p); }
    return;
  }
  if (p.etapa === 'camisa') {
    if (/^\d$/.test(k) && p.num.length < 3) { e.preventDefault(); p.num += k; ltColetaStatus(); ltAutoSalvar(); }
    else if (k === 'Backspace') { e.preventDefault(); p.num = p.num.slice(0, -1); ltColetaStatus(); ltAutoSalvar(); }
    else if (k === 'Enter') { e.preventDefault(); ltSalvarPend(); }
  }
});

/* ---------- botões (cada um monta o seu) ---------- */
function ltFormBotoes() {
  let B = (S.lt.botoes || []).map(b => ({ ...b, descritores: [...(b.descritores || [])] }));
  const linha = (b, i) => `<div class="lt-be" data-i="${i}">
    <input class="in lt-bk" maxlength="1" value="${esc(b.tecla || '')}" title="Tecla" data-k="tecla">
    <input class="in" value="${esc(b.nome || '')}" placeholder="Nome (ex.: Fin. C)" data-k="nome">
    <input type="color" class="lt-bc" value="${esc(b.cor || '#13295b')}" data-k="cor">
    <select class="in" data-k="equipe">${opts([['QFC', 'Nossa equipe'], ['ADV', 'Adversário']], b.equipe || 'QFC')}</select>
    <input class="in" value="${esc((b.descritores || []).join(', '))}" placeholder="Descritores: No alvo, Fora…" data-k="descritores">
    <label title="Pede o número da camisa"><input type="checkbox" data-k="camisa"${b.camisa ? ' checked' : ''}> camisa</label>
    <label title="Pede origem e destino (seta)"><input type="checkbox" data-k="seta"${b.seta ? ' checked' : ''}> seta</label>
    <label title="Todo lance deste botão conta como gol"><input type="checkbox" data-k="gol"${b.gol ? ' checked' : ''}> gol</label>
    <span class="lt-bo"><button type="button" class="btn sm" data-up="${i}" title="Subir">↑</button><button type="button" class="btn sm dan" data-del="${i}" title="Remover">✕</button></span></div>`;
  const ler = () => document.querySelectorAll('.lt-be').forEach(el => { const b = B[+el.dataset.i];
    el.querySelectorAll('[data-k]').forEach(i => { const k = i.dataset.k;
      b[k] = i.type === 'checkbox' ? i.checked : k === 'descritores' ? i.value.split(',').map(s => s.trim()).filter(Boolean).slice(0, 9) : k === 'tecla' ? i.value.trim().toUpperCase() : i.value.trim(); }); });
  const desenha = () => {
    $('#ltbl').innerHTML = B.length ? B.map(linha).join('') : '<p class="m">Nenhum botão. Use “+ Botão” ou comece pela sugestão.</p>';
    document.querySelectorAll('[data-del]').forEach(x => x.onclick = () => { ler(); B.splice(+x.dataset.del, 1); desenha(); });
    document.querySelectorAll('[data-up]').forEach(x => x.onclick = () => { ler(); const i = +x.dataset.up; if (i > 0) [B[i - 1], B[i]] = [B[i], B[i - 1]]; desenha(); });
  };
  modal(`<h2>Meus botões</h2><p class="m">Só você vê este painel. Cada botão tem uma <b>tecla</b> (letra), um nome e uma cor. <b>Descritores</b> viram as teclas 1, 2, 3… depois da letra (separe por vírgula).
    <b>Camisa</b> pede o número do jogador; <b>seta</b> pede origem e destino; <b>gol</b> conta no placar (um descritor chamado “Gol” também conta).</p>
    <div class="lt-bh"><span>Tecla</span><span>Nome</span><span>Cor</span><span>Equipe</span><span>Descritores (1–9)</span><span></span></div><div id="ltbl"></div>
    <div class="row"><button class="btn sm" id="ltbadd">+ Botão</button><button class="btn sm" id="ltbsug">Usar sugestão</button></div>
    <div class="mfoot"><span></span><div class="row"><button class="btn" id="ltbx">Cancelar</button><button class="btn pri" id="ltbs">Salvar</button></div></div>`, true);
  desenha();
  $('#ltbx').onclick = fechar;
  $('#ltbadd').onclick = () => { ler(); B.push({ tecla: '', nome: '', cor: '#13295b', equipe: 'QFC', descritores: [], camisa: true, seta: false, gol: false }); desenha(); };
  $('#ltbsug').onclick = () => { ler(); const usadas = new Set(B.map(b => b.tecla));
    LT_SUGESTAO.forEach(s => { if (!usadas.has(s.tecla) && !B.some(b => ltChave(b.nome) === ltChave(s.nome))) B.push({ seta: false, gol: false, ...s, descritores: [...s.descritores] }); }); desenha(); };
  $('#ltbs').onclick = async () => {
    ler();
    for (const b of B) {
      if (!b.nome) return toast('Todo botão precisa de nome.', true);
      if (!b.tecla || /[\d\s]/.test(b.tecla)) return toast(`“${b.nome}”: a tecla precisa ser uma letra (números ficam para os descritores).`, true);
    }
    const dup = B.map(b => b.tecla).find((t, i, a) => a.indexOf(t) !== i); if (dup) return toast(`A tecla ${dup} está repetida.`, true);
    const ant = S.lt.botoes || [], ficam = new Set(B.filter(b => b.id).map(b => b.id)), sai = ant.filter(b => !ficam.has(b.id)).map(b => b.id);
    $('#ltbs').disabled = true;
    try {
      if (sai.length) { const { error } = await sb.from('lt_botoes').delete().in('id', sai); if (error) throw error; }
      // troca de teclas entre botões: libera as teclas antes de gravar
      const exist = B.filter(b => b.id);
      if (exist.length) { const tmp = await Promise.all(exist.map((b, i) => sb.from('lt_botoes').update({ tecla: String.fromCharCode(0x2460 + i) }).eq('id', b.id))); const er = tmp.find(r => r.error); if (er) throw er.error; }
      const rows = B.map((b, i) => ({ ...(b.id ? { id: b.id } : {}), dono: S.perfil.id, nome: b.nome, tecla: b.tecla, cor: b.cor, equipe: b.equipe, descritores: b.descritores, camisa: !!b.camisa, seta: !!b.seta, gol: !!b.gol, ordem: i }));
      for (const r of rows.filter(r => r.id)) { const { id, ...rest } = r; const { error } = await sb.from('lt_botoes').update(rest).eq('id', id); if (error) throw error; }
      const novos = rows.filter(r => !r.id); if (novos.length) { const { error } = await sb.from('lt_botoes').insert(novos); if (error) throw error; }
      await ltCarregarBotoes(); fechar(); toast('Botões salvos.');
      if (S.lt.jogo && S.lt.aba === 'coleta') ltColetaRender(); else if (!S.lt.jogo) pLive();
    } catch (e) { $('#ltbs').disabled = false; toast(erroAmigavel(e), true); }
  };
}

/* ---------- jogo (analista) ---------- */
function ltLerEscudo(file) {
  return new Promise((ok, ko) => { const r = new FileReader(); r.onerror = ko; r.onload = () => { const im = new Image(); im.onerror = ko; im.onload = () => {
    const s = 160, c = document.createElement('canvas'); c.width = c.height = s; const k = Math.min(s / im.width, s / im.height), w = im.width * k, h = im.height * k;
    c.getContext('2d').drawImage(im, (s - w) / 2, (s - h) / 2, w, h); ok(c.toDataURL('image/png')); }; im.src = r.result; }; r.readAsDataURL(file); });
}
function ltFormJogo(j) {
  const n = !j; j = j || { equipe: 'QFC', data: hoje() }; const esc2 = {};
  const prev = (nome, id) => `<div class="lt-escf" id="${id}p">${ltEscudo(nome, 48)}</div>`;
  modal(`<h2>${n ? 'Novo jogo' : 'Dados do jogo'}</h2>
    <div class="g3"><label class="f"><span>Data</span><input type="date" class="in" id="ltd" value="${esc(j.data || '')}"></label>
      <label class="f"><span>Nossa equipe</span><input class="in" id="lte" value="${esc(j.equipe || 'QFC')}"></label>
      <label class="f"><span>Adversário *</span><input class="in" id="lta" value="${esc(j.adversario || '')}"></label>
      <label class="f"><span>Competição</span><input class="in" id="ltc" value="${esc(j.competicao || '')}"></label>
      <label class="f"><span>Rodada / fase</span><input class="in" id="ltr" value="${esc(j.rodada || '')}"></label>
      <label class="f"><span>Mando</span><select class="in" id="ltm">${opts(['Casa', 'Fora', 'Neutro'], j.mando || '', '—')}</select></label></div>
    <div class="lt-escs"><div class="f"><span>Nosso escudo</span><div class="row">${prev(j.equipe, 'lten')}<input type="file" accept="image/*" id="lten"></div></div>
      <div class="f"><span>Escudo do adversário</span><div class="row">${prev(j.adversario, 'ltea')}<input type="file" accept="image/*" id="ltea"></div><small class="m">Fica guardado e volta sozinho quando o adversário se repetir.</small></div></div>
    ${n ? '' : `<div class="g3"><label class="f"><span>Gols nossos (correção)</span><input type="number" class="in" id="ltgn" min="0" value="${j.gols_nos ?? ''}" placeholder="pelos lances"></label>
      <label class="f"><span>Gols adversário (correção)</span><input type="number" class="in" id="ltga" min="0" value="${j.gols_adv ?? ''}" placeholder="pelos lances"></label></div>`}
    <label class="f"><span>Observações</span><textarea class="in" id="lto" rows="2">${esc(j.obs || '')}</textarea></label>
    <div class="mfoot">${n ? '<span></span>' : '<button class="btn dan" id="ltdel">Excluir jogo</button>'}<div class="row"><button class="btn" id="ltx">Cancelar</button><button class="btn pri" id="lts">Salvar</button></div></div>`, true);
  $('#ltx').onclick = fechar;
  [['#lten', 'n'], ['#ltea', 'a']].forEach(([s, k]) => { $(s).onchange = async () => { const f = $(s).files[0]; if (!f) return;
    try { esc2[k] = await ltLerEscudo(f); $(s + 'p').innerHTML = `<img class="lt-esc" src="${esc2[k]}" style="width:48px;height:48px" alt="">`; } catch (e) { toast('Não consegui ler a imagem.', true); } }; });
  if ($('#ltdel')) $('#ltdel').onclick = async () => {
    if (!confirm(`Excluir o jogo contra ${j.adversario} e todos os ${S.lt.lances.length} lances? Não dá para desfazer.`)) return;
    const { error } = await sb.from('lt_jogos').delete().eq('id', j.id); if (error) return toast(erroAmigavel(error), true);
    S.lt.jogos = S.lt.jogos.filter(x => x.id !== j.id); ltSair(); S.lt.jogo = null; fechar(); toast('Jogo excluído.'); pLive(); };
  $('#lts').onclick = async () => {
    const nn = s => !$(s) || $(s).value === '' ? null : +$(s).value;
    const row = { data: $('#ltd').value || null, equipe: $('#lte').value.trim() || 'QFC', adversario: $('#lta').value.trim(), competicao: $('#ltc').value.trim() || null,
      rodada: $('#ltr').value.trim() || null, mando: $('#ltm').value || null, obs: $('#lto').value.trim() || null, atualizado_em: new Date().toISOString() };
    if (!n) { row.gols_nos = nn('#ltgn'); row.gols_adv = nn('#ltga'); }
    if (!row.adversario) return toast('Informe o adversário.', true);
    $('#lts').disabled = true;
    for (const [k, nome] of [['n', row.equipe], ['a', row.adversario]]) if (esc2[k]) {
      const { error } = await sb.from('lt_escudos').upsert({ nome: ltChave(nome), img: esc2[k], atualizado_em: new Date().toISOString() });
      if (error) { $('#lts').disabled = false; return toast(erroAmigavel(error), true); } S.lt.escudos[ltChave(nome)] = esc2[k]; }
    const q = n ? sb.from('lt_jogos').insert(row).select().single() : sb.from('lt_jogos').update(row).eq('id', j.id).select().single();
    const { data, error } = await q; if (error) { $('#lts').disabled = false; return toast(erroAmigavel(error), true); }
    if (n) S.lt.jogos = [data, ...(S.lt.jogos || [])]; else Object.assign(j, data);
    fechar(); toast('Jogo salvo.');
    if (n) { S.lt.jogo = data.id; S.lt.aba = ltColetar() ? 'coleta' : 'resultados'; ltAbrir(data.id); } else { ltPlacarAtualiza(); if (S.lt.aba === 'resultados') ltResultadosRender(); }
  };
}

/* ---------- resultados ---------- */
function ltFiltrados(L) {
  const f = S.lt.f;
  return L.filter(l => (!f.t || l.tempo === f.t) && (!f.eq || l.equipe === f.eq) && (!f.acao || l.acao === f.acao) && (!f.num || String(l.num || '') === f.num));
}
function ltAcoes(L) {   // ações na ordem do total
  const m = {}; L.forEach(l => { const k = l.acao; m[k] = m[k] || { acao: k, cor: l.cor || '#555', equipe: l.equipe, L: [] }; m[k].L.push(l); });
  return Object.values(m).sort((a, b) => b.L.length - a.L.length || a.acao.localeCompare(b.acao, 'pt'));
}
function ltResultadosRender() {
  const box = $('#ltcorpo'); if (!box) return;
  const f = S.lt.f, todos = S.lt.lances, A0 = ltAcoes(todos);
  if (f.acao && !A0.some(a => a.acao === f.acao)) f.acao = '';
  const nums = [...new Set(todos.filter(l => l.num).map(l => l.num))].sort((a, b) => +a - +b);
  const L = ltOrd(ltFiltrados(todos)), A = ltAcoes(L);
  const seg = (k, v, l) => `<button data-fk="${k}" data-fv="${v}" class="${String(f[k]) === String(v) ? 'on' : ''}">${l}</button>`;
  const yScroll = window.scrollY;
  box.innerHTML = `<div class="lt-filt">
      <div class="ind-tabs fl-modo">${seg('t', 0, 'Jogo')}${seg('t', 1, '1ºT')}${seg('t', 2, '2ºT')}</div>
      <div class="ind-tabs fl-modo">${seg('eq', '', 'Ambas')}${seg('eq', 'QFC', 'Nossa')}${seg('eq', 'ADV', 'Adversário')}</div>
      <select class="in" id="ltfa"><option value="">Todas as ações</option>${A0.map(a => `<option${a.acao === f.acao ? ' selected' : ''}>${esc(a.acao)}</option>`).join('')}</select>
      <select class="in" id="ltfn"><option value="">Todos os jogadores</option>${nums.map(n => { const at = ltAtlNum(n); return `<option value="${esc(n)}"${n === f.num ? ' selected' : ''}>#${esc(n)}${at ? ' ' + esc(at.nome.split(' ')[0]) : ''}</option>`; }).join('')}</select>
      <span class="lt-sp"></span><button class="btn sm" id="ltpdf">Exportar PDF</button></div>
    ${L.length ? ltRelatorio(L, A) : '<div class="panel empty">Nenhum lance com esses filtros ainda. Assim que a coleta marcar, aparece aqui.</div>'}`;
  box.querySelectorAll('[data-fk]').forEach(b => b.onclick = () => { const k = b.dataset.fk; f[k] = k === 't' ? +b.dataset.fv : b.dataset.fv; ltResultadosRender(); });
  box.querySelectorAll('[data-vis]').forEach(b => b.onclick = () => { f.vis = b.dataset.vis; ltResultadosRender(); });
  $('#ltfa').onchange = e => { f.acao = e.target.value; ltResultadosRender(); };
  $('#ltfn').onchange = e => { f.num = e.target.value; ltResultadosRender(); };
  $('#ltpdf').onclick = () => ltPDF();
  box.querySelectorAll('[data-dl]').forEach(b => b.onclick = async () => { if (!confirm('Apagar este lance?')) return; ltApagar(+b.dataset.dl); });
  window.scrollTo(0, yScroll);
}
function ltRelatorio(L, A, imp) {
  const f = S.lt.f, vis = imp ? null : f.vis;
  const kpis = `<div class="lt-kpis">${A.map(a => { const t1 = a.L.filter(l => l.tempo === 1).length;
    return `<div class="lt-k" style="--c:${esc(a.cor)}"><small>${esc(a.acao)}${a.equipe === 'ADV' && !/adv/i.test(a.acao) ? ' <i>adv.</i>' : ''}</small><b>${a.L.length}</b><span>1ºT ${t1} · 2ºT ${a.L.length - t1}</span></div>`; }).join('')}</div>`;
  const campo = imp ? `<div class="lt-imp2">${ltCampoRes(L, 'pontos')}${ltCampoRes(L, 'calor')}</div>`
    : `<div class="panel lt-cres"><div class="lt-ph"><b>Campo</b><div class="ind-tabs fl-modo">${[['pontos', 'Pontos'], ['calor', 'Mapa de calor'], ['zonas', 'Zonas']].map(([k, l]) => `<button data-vis="${k}" class="${vis === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      ${ltCampoRes(L, vis)}<small class="m">Nosso ataque para a direita. Corredor esquerdo = lado esquerdo do nosso ataque (parte de cima). ${vis === 'calor' ? 'O calor mostra onde as ações marcadas se concentraram.' : ''}</small></div>`;
  const pc = (v, t) => t ? `<small>${Math.round(v / t * 100)}%</small>` : '';
  const zonas = `<div class="panel"><h2>Por ação: tempo, terço, corredor e área</h2><div class="tablewrap"><table class="tb lt-tb"><thead><tr><th>Ação</th><th>Total</th><th>1ºT</th><th>2ºT</th>${LT_TER.map(t => `<th>T. ${t.toLowerCase()}</th>`).join('')}${LT_COR.map(c => `<th>C. ${c.toLowerCase()}</th>`).join('')}<th>Na área</th></tr></thead><tbody>
    ${A.map(a => { const P = a.L.filter(l => l.x != null), n = a.L.length;
      const ter = [0, 1, 2].map(i => P.filter(l => ltTerco(+l.x) === i).length), cor = [0, 1, 2].map(i => P.filter(l => ltCorr(+l.y) === i).length), ar = P.filter(l => ltArea(+l.x, +l.y)).length;
      return `<tr><td><i class="lt-dot" style="background:${esc(a.cor)}"></i><b>${esc(a.acao)}</b></td><td><b>${n}</b></td><td>${a.L.filter(l => l.tempo === 1).length}</td><td>${a.L.filter(l => l.tempo === 2).length}</td>
        ${ter.map(v => `<td>${v} ${pc(v, P.length)}</td>`).join('')}${cor.map(v => `<td>${v} ${pc(v, P.length)}</td>`).join('')}<td>${ar} ${pc(ar, P.length)}</td></tr>`; }).join('')}</tbody></table></div></div>`;
  const faixas = `<div class="panel"><h2>Por faixa de tempo</h2><div class="tablewrap"><table class="tb lt-tb"><thead><tr><th>Ação</th>${LT_FAIXAS.map(x => `<th>${x[3]}</th>`).join('')}</tr></thead><tbody>
    ${A.map(a => `<tr><td><i class="lt-dot" style="background:${esc(a.cor)}"></i><b>${esc(a.acao)}</b></td>${LT_FAIXAS.map(([t, i, s]) => { const v = a.L.filter(l => l.tempo === t && l.seg != null && l.seg / 60 >= (t === 2 && i === 45 ? 45 : i) && l.seg / 60 < s).length; return `<td class="${v ? '' : 'm'}">${v}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div></div>`;
  const PAL = ['#13295b', '#e0a526', '#0f7a3d', '#c62828', '#7b3fa0', '#5d6b78', '#ef6c00', '#2e86c1', '#8d6e63'];
  const comD = A.filter(a => a.L.some(l => l.descritor));
  const desc = comD.length ? `<div class="panel"><h2>Descritores</h2><div class="lt-dns">${comD.map(a => { const m = {}; a.L.forEach(l => { const k = l.descritor || 'Sem descritor'; m[k] = (m[k] || 0) + 1; });
    const parts = Object.entries(m).sort((x, y) => (x[0] === 'Sem descritor') - (y[0] === 'Sem descritor') || y[1] - x[1]).map(([k, v], i) => [k, v, k === 'Sem descritor' ? '#d5dbe0' : PAL[i % PAL.length]]);
    return pjDonut(parts, a.acao, a.L.length, { sz: 110 }); }).join('')}</div></div>` : '';
  const comN = L.filter(l => l.num), AN = ltAcoes(comN);
  const jog = comN.length ? `<div class="panel"><h2>Por jogador</h2><div class="tablewrap"><table class="tb lt-tb"><thead><tr><th>Jogador</th>${AN.map(a => `<th>${esc(a.acao)}</th>`).join('')}<th>Total</th></tr></thead><tbody>
    ${[...new Set(comN.map(l => l.equipe + '|' + l.num))].map(k => { const [eq, n] = k.split('|'), M = comN.filter(l => l.equipe === eq && l.num === n), at = eq === 'QFC' ? ltAtlNum(n) : null;
      return [M.length, `<tr><td><b>#${esc(n)}</b> ${at ? esc(at.nome) : eq === 'ADV' ? '<small class="m">adversário</small>' : ''}</td>${AN.map(a => { const v = M.filter(l => l.acao === a.acao).length; return `<td class="${v ? '' : 'm'}">${v}</td>`; }).join('')}<td><b>${M.length}</b></td></tr>`]; })
      .sort((x, y) => y[0] - x[0]).map(x => x[1]).join('')}</tbody></table></div></div>` : '';
  const feed = imp ? '' : `<div class="panel"><h2>Lances (${L.length})</h2><div class="tablewrap lt-feed"><table class="tb lt-tb"><thead><tr><th>Tempo</th><th>Ação</th><th>Descritor</th><th>Jogador</th><th>Zona</th><th>Marcado por</th><th></th></tr></thead><tbody>
    ${[...L].reverse().map(l => { const at = l.atleta_id ? S.atletas.find(a => a.id === l.atleta_id) : null, z = l.x != null ? `${LT_TER[ltTerco(+l.x)]} · ${LT_COR[ltCorr(+l.y)]}${ltArea(+l.x, +l.y) ? ' · área' : ''}` : '—';
      return `<tr><td>${l.tempo}ºT ${ltMin(l.seg)}</td><td><i class="lt-dot" style="background:${esc(l.cor || '#555')}"></i>${esc(l.acao)}${l.gol ? ' ⚽' : ''}</td><td>${esc(l.descritor || '')}</td><td>${l.num ? '#' + esc(l.num) : ''} ${at ? esc(at.nome.split(' ')[0]) : ''}</td><td class="sm">${z}</td><td class="m">${esc(ltNomeAut(l.autor))}</td>
        <td>${ltGerenciar() || l.autor === S.perfil.id ? `<button class="lt-x" data-dl="${l.id}" title="Apagar">✕</button>` : ''}</td></tr>`; }).join('')}</tbody></table></div></div>`;
  return kpis + campo + zonas + faixas + desc + jog + feed;
}
function ltCampoRes(L, vis) {
  const P = L.filter(l => l.x != null);
  let camada = '';
  if (vis === 'calor') camada = ltCalor(P) + ltCorredores(P);
  else if (vis === 'zonas') camada = ltZonas(P);
  else {
    const setas = P.filter(l => l.x2 != null).map(l => `<line x1="${l.x * 1.05}" y1="${l.y * .68}" x2="${l.x2 * 1.05}" y2="${l.y2 * .68}" stroke="${esc(l.cor || '#333')}" stroke-width=".55" marker-end="url(#lta-${esc((l.cor || '#333').replace('#', ''))})" opacity=".85"/>`).join('');
    const cores = [...new Set(P.filter(l => l.x2 != null).map(l => l.cor || '#333'))];
    const mk = cores.map(c => `<marker id="lta-${esc(c.replace('#', ''))}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path d="M0 0L10 5L0 10z" fill="${esc(c)}"/></marker>`).join('');
    camada = `<defs>${mk}</defs>${setas}` + P.map(l => { const cx = l.x * 1.05, cy = l.y * .68, n = String(l.num || '').slice(0, 3);
      return `<g><title>${esc(`${l.tempo}ºT ${ltMin(l.seg)} · ${l.acao}${l.descritor ? ' · ' + l.descritor : ''}${l.num ? ' · #' + l.num : ''}`)}</title>${l.gol ? `<circle cx="${cx}" cy="${cy}" r="3.2" fill="none" stroke="#e0a526" stroke-width=".7"/>` : ''}
        <circle cx="${cx}" cy="${cy}" r="2.2" fill="${esc(l.cor || '#555')}" stroke="${l.tempo === 2 ? '#15202b' : '#fff'}" stroke-width="${l.tempo === 2 ? .45 : .3}"/>${n ? `<text x="${cx}" y="${cy + .75}" text-anchor="middle" font-size="${n.length > 2 ? 1.6 : 2}" font-weight="800" fill="#fff">${esc(n)}</text>` : ''}</g>`; }).join('');
  }
  return `<div class="lt-cr"><svg viewBox="-2 -1 109 70" preserveAspectRatio="xMidYMid meet"><rect x="-2" y="-1" width="109" height="70" fill="#f3f7f4"/>${vis === 'calor' ? '' : PJ_LINHAS}${camada}${vis === 'calor' ? `<g class="lt-gr">${PJ_LINHAS}</g>` : ''}</svg>
    <div class="lt-crl"><span>${P.length} com local${L.length > P.length ? ` · ${L.length - P.length} sem local` : ''}</span><b>Nosso ataque →</b></div></div>`;
}
// mapa de calor das ações (soma de gaussianas), nas cores do QFC
function ltCalor(P) {
  if (!P.length) return '';
  const W = 105, H = 68, s = 7, g = new Float32Array(W * H);
  P.forEach(l => { const px = l.x * 1.05, py = l.y * .68;
    for (let y = Math.max(0, Math.floor(py - 3 * s)); y < Math.min(H, py + 3 * s); y++) for (let x = Math.max(0, Math.floor(px - 3 * s)); x < Math.min(W, px + 3 * s); x++) {
      const d2 = (x + .5 - px) ** 2 + (y + .5 - py) ** 2; g[y * W + x] += Math.exp(-d2 / (2 * s * s)); } });
  let mx = 0; for (const v of g) if (v > mx) mx = v;
  const c = document.createElement('canvas'); c.width = W; c.height = H; const ctx = c.getContext('2d'), im = ctx.createImageData(W, H);
  const stops = [[0, [19, 41, 91, 0]], [.12, [19, 41, 91, 70]], [.4, [46, 125, 191, 140]], [.65, [224, 165, 38, 190]], [.85, [230, 110, 30, 210]], [1, [198, 40, 40, 225]]];
  for (let i = 0; i < g.length; i++) { const v = g[i] / mx; let k = 1; while (k < stops.length - 1 && v > stops[k][0]) k++;
    const [a, ca] = stops[k - 1], [b, cb] = stops[k], t = Math.min(1, Math.max(0, (v - a) / (b - a)));
    for (let q = 0; q < 4; q++) im.data[i * 4 + q] = ca[q] + (cb[q] - ca[q]) * t; }
  ctx.putImageData(im, 0, 0);
  return `<rect x="0" y="0" width="105" height="68" fill="#3f7a4e"/><image href="${c.toDataURL()}" x="0" y="0" width="105" height="68" preserveAspectRatio="none"/>`;
}
function ltCorredores(P) {
  const n = [0, 1, 2].map(i => P.filter(l => ltCorr(+l.y) === i).length), t = P.length || 1;
  return [0, 1, 2].map(i => { const cy = (i * 68 / 3) + 68 / 6;
    return `${i ? `<line x1="0" y1="${i * 68 / 3}" x2="105" y2="${i * 68 / 3}" stroke="#fff" stroke-width=".25" stroke-dasharray="1.2 1" opacity=".8"/>` : ''}
      <text x="103" y="${cy}" text-anchor="end" font-size="5" font-weight="800" fill="#fff" stroke="#15202b" stroke-width=".25" paint-order="stroke">${n[i]}</text>
      <text x="103" y="${cy + 3.8}" text-anchor="end" font-size="2.4" font-weight="700" fill="#fff" stroke="#15202b" stroke-width=".18" paint-order="stroke">${Math.round(n[i] / t * 100)}% · ${LT_COR[i].toLowerCase()}</text>`; }).join('');
}
function ltZonas(P) {
  const t = P.length || 1, M = [0, 1, 2].map(r => [0, 1, 2].map(c => P.filter(l => ltCorr(+l.y) === r && ltTerco(+l.x) === c).length)), mx = Math.max(1, ...M.flat());
  return M.map((row, r) => row.map((v, c) => `<rect x="${c * 35}" y="${r * 68 / 3}" width="35" height="${68 / 3}" fill="#13295b" opacity="${(v / mx * .75).toFixed(2)}"/>
    <text x="${c * 35 + 17.5}" y="${r * 68 / 3 + 11}" text-anchor="middle" font-size="5.5" font-weight="800" fill="${v / mx > .45 ? '#fff' : '#15202b'}">${v}</text>
    <text x="${c * 35 + 17.5}" y="${r * 68 / 3 + 15.5}" text-anchor="middle" font-size="2.6" fill="${v / mx > .45 ? '#e0a526' : '#5d6b78'}" font-weight="700">${Math.round(v / t * 100)}%</text>`).join('')).join('');
}
function ltPDF() {
  const j = ltJogo(), L = ltOrd(ltFiltrados(S.lt.lances)), A = ltAcoes(L), [gn, ga] = ltGols(j, S.lt.lances), f = S.lt.f;
  const filtros = [f.t ? f.t + 'º tempo' : 'Jogo completo', f.eq === 'QFC' ? 'nossa equipe' : f.eq === 'ADV' ? 'adversário' : '', f.acao, f.num ? '#' + f.num : ''].filter(Boolean).join(' · ');
  const html = `<section class="ltp"><div class="flp-cab"><img src="${LOGO}" alt=""><div><small>QFC | ANÁLISE DE DESEMPENHO</small><h1>LIVE TAGGING</h1></div>
    <div class="flp-dt"><b>${esc(j.equipe)} ${gn} × ${ga} ${esc(j.adversario)}</b><span>${esc([j.data ? dataBR(j.data) : '', j.competicao, j.rodada, j.mando].filter(Boolean).join(' · '))}</span><span>${esc(filtros)}</span></div></div>
    ${L.length ? ltRelatorio(L, A, true) : '<p>Sem lances.</p>'}</section>`;
  document.querySelectorAll('#print-area').forEach(x => x.remove());
  const w = document.createElement('div'); w.id = 'print-area'; w.className = 'flp ltp-w'; w.innerHTML = html;
  const stl = document.createElement('style'); stl.id = 'flp-page'; stl.textContent = '@page{size:A4 landscape;margin:8mm}';
  document.head.appendChild(stl); document.body.appendChild(w); document.body.classList.add('imprimindo');
  const tt = document.title; document.title = `Live_${(j.data || '').replace(/-/g, '')}_${(j.adversario || '').replace(/\s+/g, '_')}`;
  setTimeout(() => { window.print(); setTimeout(() => { w.remove(); stl.remove(); document.body.classList.remove('imprimindo'); document.title = tt; }, 500); }, 400);
}

/* ---------- menu e navegação ---------- */
function navLT() {
  const nav = $('#nav'); if (!nav) return;
  if (ltSouColeta()) {   // função coleta: só o Live Tagging
    nav.innerHTML = `<div class="sec">Análise de jogo</div><button data-p="live" class="on">Live Tagging</button>`; return;
  }
  if (nav.querySelector('[data-p=live]')) return;
  if (typeof pagPermitida === 'function' && typeof modulosPerm === 'function' && modulosPerm() && !pagPermitida('live')) return;
  const b = document.createElement('button'); b.dataset.p = 'live'; b.textContent = 'Live Tagging'; if (S.page === 'live') b.className = 'on';
  const pj = nav.querySelector('[data-p=posjogo]');
  if (pj) { pj.parentNode.insertBefore(b, pj); return; }
  const box = document.createElement('div'); box.style.display = 'contents'; box.innerHTML = '<div class="sec">Análise de jogo</div>'; box.appendChild(b);
  const ref = [...nav.querySelectorAll('.sec')].find(s => /Análise do advers|Administra/i.test(s.textContent));
  ref ? ref.parentNode.insertBefore(box, ref) : nav.appendChild(box);
}
const _shellLT = shell;
shell = function () { _shellLT(); navLT(); if (ltSouColeta() && S.page !== 'live') ir('live'); };
const _irLT = ir;
ir = function (p) {
  if (ltSouColeta()) p = 'live';
  if (p !== 'live') { ltSair(); return _irLT(p); }
  if (typeof pagPermitida === 'function' && typeof modulosPerm === 'function' && modulosPerm() && !pagPermitida('live')) return _irLT('inicio');
  S.page = p; document.querySelectorAll('#nav button[data-p]').forEach(b => b.classList.toggle('on', b.dataset.p === p));
  pLive(); window.scrollTo(0, 0);
};
if (document.getElementById('main') && S.perfil) { navLT(); if (S.page === 'live' || ltSouColeta()) ir('live'); }
