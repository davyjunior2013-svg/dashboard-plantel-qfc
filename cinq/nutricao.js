/* CINQ – Nutrição.
   1) Avaliação física: peso + 4 dobras (coxa, abdominal, tríceps, panturrilha, em mm). %G pela equação de Reilly (4 dobras):
      %G = 5,174 + 0,124·coxa + 0,147·abdominal + 0,196·tríceps + 0,13·panturrilha; massa gorda = peso·%G/100;
      massa livre de gordura = peso − massa gorda. Evolução por atleta e visão do elenco.
   2) Suplementação diária: quem tomou, por suplemento e dia (semana); adesão = dias que tomou / dias em que o suplemento foi dado.
   3) Jogos: densidade da urina no pré-jogo (faixas de hidratação), peso pré e pós (% de perda) e suplementação Pré/Intervalo/Pós
      (protocolo do jogo + quem tomou).
   PDF em todas as seções: do período (semana/mês) e individual.
   Edição: Nutrição (funcao 'nutricao') e admin. Leitura: toda a comissão. */
FUNCOES.nutricao = 'Nutrição';
S.nut = { gAt: '', gPos: '', ok: false, aba: 'aval', per: 'semana', ref: null, cfg: {}, av: [], sup: [], jg: [], sp: null };
const podeNut = () => isAdmin() || S.perfil?.funcao === 'nutricao';
const NUT_DOBRAS = [['coxa', 'Coxa'], ['abdominal', 'Abdominal'], ['triceps', 'Tríceps'], ['panturrilha', 'Panturrilha']];
const NUT_MOM = [['pre', 'Pré'], ['int', 'Intervalo'], ['pos', 'Pós']];
const nutAtl = () => S.atletas.filter(a => a.ativo && a.status !== 'Inativo').sort((a, b) => (a.numero ?? 999) - (b.numero ?? 999) || a.nome.localeCompare(b.nome, 'pt'));
const nutA = id => S.atletas.find(a => a.id === +id);
const nutN = v => { const t = String(v ?? '').trim().replace(',', '.'); return t === '' || isNaN(+t) ? null : +t; };
const nutF = (x, d = 1) => x == null || !isFinite(x) ? '—' : (+x).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const nutSupl = () => Array.isArray(S.nut.cfg.suplementos) ? S.nut.cfg.suplementos : [];
const nutSuplJogo = () => Array.isArray(S.nut.cfg.supl_jogo) ? S.nut.cfg.supl_jogo : [];
const nutNutri = () => S.nut.cfg.nutricionista || '';
const NUT_DS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
const NUT_MES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/* ---------- cálculos ---------- */
function nutCalc(v) {
  const d = NUT_DOBRAS.map(([k]) => nutN(v[k]));
  if (d.some(x => x == null || x <= 0)) return null;
  const g = 5.174 + .124 * d[0] + .147 * d[1] + .196 * d[2] + .13 * d[3], soma = d.reduce((s, x) => s + x, 0), p = nutN(v.peso);
  const mg = p ? p * g / 100 : null;
  return { g, soma, mg, mlg: p ? p - mg : null, peso: p };
}
// densidade da urina: aceita 1015, 1,015 ou 1.015
const nutUSG = v => { let x = nutN(v); if (x == null) return null; if (x > 2) x = x / 1000; return x >= 1 && x <= 1.06 ? Math.round(x * 1000) / 1000 : null; };
const nutHid = u => u == null ? null : u < 1.010 ? ['ok', 'Hidratado'] : u <= 1.020 ? ['leve', 'Desidratação leve'] : u <= 1.030 ? ['sig', 'Desidratação significativa'] : ['grave', 'Desidratação grave'];
const nutPerda = r => { const a = nutN(r?.pp), b = nutN(r?.pd); return a && b ? (a - b) / a * 100 : null; };
const nutUSGtxt = u => u == null ? '—' : u.toFixed(3).replace('.', ',');

/* ---------- período ---------- */
function nutFaixa() {
  const r = S.nut.ref;
  if (S.nut.per === 'mes') { const [y, m] = r.split('-').map(Number), ult = new Date(y, m, 0).getDate(); return { de: r, ate: `${r.slice(0, 8)}${String(ult).padStart(2, '0')}`, txt: `${NUT_MES[m - 1][0].toUpperCase() + NUT_MES[m - 1].slice(1)} de ${y}`, curto: `${NUT_MES[m - 1]}_${y}` }; }
  const fim = addDays(r, 6); return { de: r, ate: fim, txt: `Semana ${fmt(r)} a ${fmt(fim)}`, curto: r };
}
const nutRefHoje = () => S.nut.per === 'mes' ? hoje().slice(0, 8) + '01' : segunda(hoje());
function nutMove(n) {
  if (S.nut.per === 'semana') S.nut.ref = addDays(S.nut.ref, 7 * n);
  else { const [y, m] = S.nut.ref.split('-').map(Number), d = new Date(y, m - 1 + n, 1); S.nut.ref = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; }
  pNutricao();
}
const nutNoPer = (d, f) => d >= f.de && d <= f.ate;

async function carregarNut() {
  const f = nutFaixa();
  const [c, a, s, j] = await Promise.all([
    S.nut.ok ? { data: null } : sb.from('nut_config').select('*'),
    sb.from('nut_avaliacoes').select('*').order('data'),
    sb.from('nut_supl').select('*').gte('data', f.de).lte('data', f.ate),
    sb.from('nut_jogos').select('*').order('data')]);
  for (const r of [c, a, s, j]) if (r.error) throw r.error;
  if (c.data) { S.nut.cfg = Object.fromEntries(c.data.map(x => [x.chave, x.valor])); S.nut.ok = true; }
  S.nut.av = a.data; S.nut.sup = s.data; S.nut.jg = j.data;
}
// avaliações de um atleta (mais antiga primeiro) e a última até uma data
const nutAvDe = (id, ate) => S.nut.av.filter(v => v.atleta_id === id && (!ate || v.data <= ate)).sort((x, y) => x.data.localeCompare(y.data) || x.id - y.id);

/* ---------- página ---------- */
async function pNutricao() {
  S.nut.ref = S.nut.ref || nutRefHoje();
  const pode = podeNut(), cab = () => topo('Comissão', 'Nutrição', nutNutri() ? `Nutricionista: ${nutNutri()}` : 'Avaliação física, suplementação e jogos', pode ? '<button class="btn" id="nutaj">Ajustes</button>' : '');
  $('#main').innerHTML = cab() + '<div class="panel empty">Carregando…</div>';
  try { await carregarNut(); } catch (e) { $('#main .panel').innerHTML = esc(erroAmigavel(e)); return; }
  const f = nutFaixa(), A = S.nut.aba;
  const abas = `<div class="ind-tabs nut-abas">${[['aval', 'Avaliação física'], ['sup', 'Suplementação'], ['jogo', 'Jogos']].map(([k, l]) => `<button data-na="${k}" class="${A === k ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  const per = `<div class="gol-per"><div class="gol-seg"><button data-np="semana" class="${S.nut.per === 'semana' ? 'on' : ''}">Semana</button><button data-np="mes" class="${S.nut.per === 'mes' ? 'on' : ''}">Mês</button></div>
    <button class="btn sm" id="nutprev">◀</button><b>${esc(f.txt)}</b><button class="btn sm" id="nutnext">▶</button>${S.nut.ref !== nutRefHoje() ? '<button class="btn sm" id="nuthoje">Atual</button>' : ''}
    <span class="nut-sp"></span><button class="btn sm" id="nutpdfp">PDF do período</button><button class="btn sm" id="nutpdfi">PDF individual</button></div>`;
  const corpo = A === 'sup' ? nutSupHTML(f) : A === 'jogo' ? nutJogosHTML(f) : nutAvalHTML(f);
  $('#main').innerHTML = cab() + abas + per + corpo;
  document.querySelectorAll('[data-na]').forEach(b => b.onclick = () => { S.nut.aba = b.dataset.na; pNutricao(); });
  document.querySelectorAll('[data-np]').forEach(b => b.onclick = () => { S.nut.per = b.dataset.np; S.nut.ref = nutRefHoje(); pNutricao(); });
  $('#nutprev').onclick = () => nutMove(-1); $('#nutnext').onclick = () => nutMove(1); if ($('#nuthoje')) $('#nuthoje').onclick = () => { S.nut.ref = nutRefHoje(); pNutricao(); };
  $('#nutpdfp').onclick = () => nutPDFPeriodo(f);
  $('#nutpdfi').onclick = () => nutEscolherAtleta(id => nutPDFIndividual(id, f));
  if ($('#nutaj')) $('#nutaj').onclick = nutAjustes;
  if (A === 'sup') nutSupLigar(f); else if (A === 'jogo') nutJogosLigar(f); else nutAvalLigar(f);
}
const nutKpi = (l, v, s) => `<div class="card"><div class="l">${l}</div><div class="v">${v}</div>${s ? `<div class="s">${s}</div>` : ''}</div>`;
const nutAtlCel = a => `<span class="nut-at">${foto(a)}<span><b>${a.numero != null ? a.numero + ' · ' : ''}${esc(a.nome)}</b><small>${esc(a.posicao || '')}</small></span></span>`;

/* ===== 1. avaliação física ===== */
function nutAvalResumo(ate) {
  const L = nutAtl().map(a => { const H = nutAvDe(a.id, ate), u = H[H.length - 1], p = H[H.length - 2]; return { a, u, p, cu: u && nutCalc(u), cp: p && nutCalc(p) }; });
  const com = L.filter(x => x.cu), med = k => { const v = com.map(x => x.cu[k]).filter(x => x != null); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
  const pos = {}; com.forEach(x => { const k = x.a.posicao || '—'; (pos[k] = pos[k] || []).push(x.cu); });
  return { L, com, g: med('g'), mlg: med('mlg'), soma: med('soma'), pos: POSICOES.filter(p => pos[p]).concat(Object.keys(pos).filter(p => !POSICOES.includes(p))).map(p => [p, pos[p].length, pos[p].reduce((s, c) => s + c.g, 0) / pos[p].length, (v => v.length ? v.reduce((s, x) => s + x, 0) / v.length : null)(pos[p].map(c => c.mlg).filter(x => x != null))]) };
}
const nutDelta = (a, b, inv) => { if (a == null || b == null) return ''; const d = a - b; if (Math.abs(d) < .05) return '<small class="nut-d">=</small>'; const bom = inv ? d > 0 : d < 0; return `<small class="nut-d ${bom ? 'bom' : 'ruim'}">${d > 0 ? '▲' : '▼'} ${nutF(Math.abs(d))}</small>`; };
// destaque: evolução da média do elenco em cada data de avaliação (+ atleta escolhido por cima)
function nutSerieGrupo(pos) {
  const ok = v => { const a = nutA(v.atleta_id); return a && (!pos || a.posicao === pos); };
  const datas = [...new Set(S.nut.av.filter(ok).map(v => v.data))].sort();
  return datas.map(d => { const C = S.nut.av.filter(v => v.data === d && ok(v)).map(nutCalc).filter(Boolean), m = k => { const x = C.map(c => c[k]).filter(y => y != null); return x.length ? x.reduce((a, b) => a + b, 0) / x.length : null; };
    return { d, n: C.length, g: m('g'), mlg: m('mlg') }; });
}
function nutGrafDestaque(G, Aser, k, tit, uni) {
  const datas = [...new Set([...G.map(p => p.d), ...Aser.map(p => p.d)])].sort();
  const gv = G.filter(p => p[k] != null), av = Aser.filter(p => p[k] != null); if (!gv.length && !av.length) return '';
  const W = 560, H = 230, l = 44, r = 18, t = 30, b = 40, vals = [...gv, ...av].map(p => p[k]), mn = Math.min(...vals), mx = Math.max(...vals), pad = (mx - mn) * .3 || Math.max(1, mx * .05);
  const lo = mn - pad, hi = mx + pad, X = d => datas.length === 1 ? (l + W - r) / 2 : l + datas.indexOf(d) * (W - l - r) / (datas.length - 1), Y = y => t + (hi - y) / (hi - lo) * (H - t - b);
  const lin = (P, cor, cls, n, abaixo) => P.length ? `<polyline points="${P.map(p => `${X(p.d)},${Y(p[k])}`).join(' ')}" fill="none" stroke="${cor}" stroke-width="3" stroke-linejoin="round"${cls ? ` class="${cls}"` : ''}/>
    ${P.map(p => `<circle cx="${X(p.d)}" cy="${Y(p[k])}" r="5" fill="#fff" stroke="${cor}" stroke-width="2.5"/><text x="${X(p.d)}" y="${Y(p[k]) + (abaixo ? 19 : -10)}" text-anchor="middle" class="nut-dv" fill="${cor}">${nutF(p[k])}${uni}</text>${n && p.n ? `<text x="${X(p.d)}" y="${H - 8}" text-anchor="middle" class="nut-dn">n = ${p.n}</text>` : ''}`).join('')}` : '';
  const ticks = [0, .5, 1].map(i => lo + (hi - lo) * (.12 + .76 * i));
  return `<div class="nut-dg"><svg viewBox="0 0 ${W} ${H}"><text x="${l}" y="16" class="nut-dt">${tit}</text>
    ${ticks.map(y => `<line x1="${l}" x2="${W - r}" y1="${Y(y)}" y2="${Y(y)}" class="nut-gg"/><text x="${l - 6}" y="${Y(y) + 4}" text-anchor="end" class="nut-dy">${nutF(y)}</text>`).join('')}
    ${datas.map(d => `<text x="${X(d)}" y="${H - 22}" text-anchor="middle" class="nut-dx">${fmt(d)}</text>`).join('')}
    ${lin(gv, '#13295b', '', true)}${lin(av, '#e0a526', 'nut-dat', false, true)}</svg></div>`;
}
function nutDestaque() {
  if (!S.nut.av.length) return '';
  const pos = S.nut.gPos, G = nutSerieGrupo(pos), at = S.nut.gAt ? nutA(+S.nut.gAt) : null;
  const Aser = at ? Object.values(Object.fromEntries(nutAvDe(at.id).map(v => [v.data, { d: v.data, ...nutCalc(v) }]))).filter(p => p.g != null) : [];   // uma por data (a mais recente)
  const poss = POSICOES.filter(p => S.nut.av.some(v => nutA(v.atleta_id)?.posicao === p));
  const g0 = G[0], g1 = G[G.length - 1], dg = G.length > 1 && g0.g != null && g1.g != null ? g1.g - g0.g : null, dm = G.length > 1 && g0.mlg != null && g1.mlg != null ? g1.mlg - g0.mlg : null;
  return `<div class="panel nut-dest"><div class="nut-dh"><div><h2>Evolução da composição corporal</h2><small class="m">Média ${pos ? 'dos ' + esc(pos.toLowerCase()) + 's' : 'do elenco'} em cada avaliação${G.length > 1 ? ` · desde ${fmt(g0.d)}: %G ${dg > 0 ? '+' : ''}${nutF(dg)} pp${dm != null ? ` · MLG ${dm > 0 ? '+' : ''}${nutF(dm)} kg` : ''}` : ''}</small></div>
      <div class="nut-df"><select class="in" id="nutgpos"><option value="">Todo o elenco</option>${poss.map(p => `<option${p === pos ? ' selected' : ''}>${esc(p)}</option>`).join('')}</select>
      <select class="in" id="nutgat"><option value="">Comparar atleta…</option>${nutAtl().filter(a => S.nut.av.some(v => v.atleta_id === a.id)).map(a => `<option value="${a.id}"${String(a.id) === String(S.nut.gAt) ? ' selected' : ''}>${esc(a.nome)}</option>`).join('')}</select></div></div>
    <div class="nut-dgs">${nutGrafDestaque(G, Aser, 'g', '% de gordura', '%')}${nutGrafDestaque(G, Aser, 'mlg', 'Massa livre de gordura (kg)', '')}</div>
    <div class="nut-dl"><span><i style="background:#13295b"></i>Média ${pos ? 'da posição' : 'do elenco'}</span>${at ? `<span><i style="background:#e0a526"></i>${esc(at.nome)}</span>` : ''}<small class="m">n = atletas na média daquela avaliação</small></div></div>`;
}
function nutAvalHTML(f) {
  const R = nutAvalResumo(f.ate), noPer = S.nut.av.filter(v => nutNoPer(v.data, f)), pode = podeNut();
  return `${nutDestaque()}<div class="cards gol-kpis">${nutKpi('Avaliados', `${R.com.length}<small class="m">/${R.L.length}</small>`, 'última avaliação de cada atleta')}${nutKpi('% de gordura · média', R.g != null ? nutF(R.g) + '%' : '—', 'elenco')}
      ${nutKpi('Massa livre de gordura · média', R.mlg != null ? nutF(R.mlg) + ' kg' : '—', R.soma != null ? `Σ 4 dobras médio ${nutF(R.soma)} mm` : '')}${nutKpi('Avaliações no período', noPer.length, esc(f.txt))}</div>
    <div class="panel"><h2>Elenco · última avaliação ${pode ? '<button class="btn sm pri nut-h2b" id="nutav">+ Nova avaliação</button>' : ''}</h2>
      <div class="tablewrap"><table class="tb nut-tb"><thead><tr><th>Atleta</th><th>Data</th><th>Peso</th><th>Σ dobras</th><th>% gordura</th><th>Massa gorda</th><th>Massa livre de gordura</th></tr></thead><tbody>
      ${R.L.map(x => `<tr class="dm-tr" data-na-at="${x.a.id}"><td>${nutAtlCel(x.a)}</td><td>${x.u ? dataBR(x.u.data) : '<span class="m">sem avaliação</span>'}</td><td>${x.cu?.peso ? nutF(x.cu.peso) + ' kg' : '—'}</td><td>${x.cu ? nutF(x.cu.soma) + ' mm' : '—'}</td>
        <td><b>${x.cu ? nutF(x.cu.g) + '%' : '—'}</b> ${nutDelta(x.cu?.g, x.cp?.g)}</td><td>${x.cu?.mg != null ? nutF(x.cu.mg) + ' kg' : '—'}</td><td><b>${x.cu?.mlg != null ? nutF(x.cu.mlg) + ' kg' : '—'}</b> ${nutDelta(x.cu?.mlg, x.cp?.mlg, true)}</td></tr>`).join('')}</tbody></table></div>
      <p class="m nut-nota">%G pela equação de Reilly (4 dobras). ▲▼ = diferença para a avaliação anterior do atleta. Clique no atleta para ver a evolução.</p></div>
    ${R.pos.length ? `<div class="panel"><h2>Por posição</h2><div class="tablewrap"><table class="tb nut-tb"><thead><tr><th>Posição</th><th>Atletas</th><th>% gordura</th><th>Massa livre de gordura</th></tr></thead><tbody>
      ${R.pos.map(([p, n, g, m]) => `<tr><td><b>${esc(p)}</b></td><td>${n}</td><td>${nutF(g)}%</td><td>${m != null ? nutF(m) + ' kg' : '—'}</td></tr>`).join('')}</tbody></table></div></div>` : ''}`;
}
function nutAvalLigar() {
  if ($('#nutgpos')) { $('#nutgpos').onchange = e => { S.nut.gPos = e.target.value; pNutricao(); }; $('#nutgat').onchange = e => { S.nut.gAt = e.target.value; pNutricao(); }; }
  document.querySelectorAll('[data-na-at]').forEach(tr => tr.onclick = () => nutIndiv(+tr.dataset.naAt));
  if ($('#nutav')) $('#nutav').onclick = () => nutFormAval(null);
}
// gráfico de linha simples (valores por data)
function nutLinha(P, tit, uni, cor) {
  if (!P.length) return '';
  const W = 320, H = 150, l = 34, r = 12, t = 22, b = 26, v = P.map(p => p[1]), mn = Math.min(...v), mx = Math.max(...v), pad = (mx - mn) * .25 || Math.max(1, mx * .05);
  const lo = mn - pad, hi = mx + pad, X = i => P.length === 1 ? (l + W - r) / 2 : l + i * (W - l - r) / (P.length - 1), Y = y => t + (hi - y) / (hi - lo) * (H - t - b);
  const ticks = [lo + (hi - lo) * .15, (lo + hi) / 2, hi - (hi - lo) * .15];
  return `<div class="nut-gr"><svg viewBox="0 0 ${W} ${H}"><text x="${l}" y="13" class="nut-gt">${esc(tit)}</text>
    ${ticks.map(y => `<line x1="${l}" x2="${W - r}" y1="${Y(y)}" y2="${Y(y)}" class="nut-gg"/><text x="${l - 4}" y="${Y(y) + 3}" text-anchor="end" class="nut-gy">${nutF(y)}</text>`).join('')}
    <polyline points="${P.map((p, i) => `${X(i)},${Y(p[1])}`).join(' ')}" fill="none" stroke="${cor}" stroke-width="2.5" stroke-linejoin="round"/>
    ${P.map((p, i) => `<circle cx="${X(i)}" cy="${Y(p[1])}" r="3.5" fill="#fff" stroke="${cor}" stroke-width="2"/><text x="${X(i)}" y="${Y(p[1]) - 8}" text-anchor="middle" class="nut-gv">${nutF(p[1])}${uni}</text><text x="${X(i)}" y="${H - 8}" text-anchor="middle" class="nut-gx">${fmt(p[0])}</text>`).join('')}</svg></div>`;
}
function nutGraficos(H) {
  const C = H.map(v => [v.data, nutCalc(v)]).filter(x => x[1]);
  return `<div class="nut-grs">${nutLinha(C.map(x => [x[0], x[1].g]), '% de gordura', '%', '#c62828')}${nutLinha(C.filter(x => x[1].mlg != null).map(x => [x[0], x[1].mlg]), 'Massa livre de gordura (kg)', '', '#13295b')}${nutLinha(C.filter(x => x[1].peso).map(x => [x[0], x[1].peso]), 'Peso (kg)', '', '#e0a526')}</div>`;
}
function nutHistTab(H, acoes) {
  return `<div class="tablewrap"><table class="tb nut-tb"><thead><tr><th>Data</th><th>Peso</th>${NUT_DOBRAS.map(([, l]) => `<th>${l}</th>`).join('')}<th>Σ</th><th>% gordura</th><th>MG</th><th>MLG</th>${acoes ? '<th></th>' : ''}</tr></thead><tbody>
    ${[...H].reverse().map((v, i, R) => { const c = nutCalc(v), p = R[i + 1] && nutCalc(R[i + 1]);
      return `<tr><td>${dataBR(v.data)}</td><td>${c?.peso ? nutF(c.peso) : '—'}</td>${NUT_DOBRAS.map(([k]) => `<td>${nutF(nutN(v[k]))}</td>`).join('')}<td>${c ? nutF(c.soma) : '—'}</td>
        <td><b>${c ? nutF(c.g) + '%' : '—'}</b> ${nutDelta(c?.g, p?.g)}</td><td>${c?.mg != null ? nutF(c.mg) : '—'}</td><td><b>${c?.mlg != null ? nutF(c.mlg) : '—'}</b> ${nutDelta(c?.mlg, p?.mlg, true)}</td>
        ${acoes ? `<td class="nut-ac"><button class="btn sm" data-ave="${v.id}">Editar</button><button class="btn sm dan" data-avd="${v.id}">✕</button></td>` : ''}</tr>`; }).join('')}</tbody></table></div>`;
}
function nutIndiv(id) {
  const a = nutA(id), H = nutAvDe(id), u = H[H.length - 1], c = u && nutCalc(u), c0 = H[0] && nutCalc(H[0]), pode = podeNut();
  modal(`<div class="gol-hh"><span class="gol-hf">${foto(a)}</span><div><small class="m">Avaliação física · evolução</small><h2>${esc(a.nome)}</h2><small class="m">${esc(a.posicao || '')}</small></div></div>
    ${H.length ? `<div class="cards gol-kpis">${nutKpi('% de gordura', c ? nutF(c.g) + '%' : '—', u ? 'em ' + dataBR(u.data) : '')}${nutKpi('Massa livre de gordura', c?.mlg != null ? nutF(c.mlg) + ' kg' : '—', c?.mg != null ? `massa gorda ${nutF(c.mg)} kg` : '')}
      ${nutKpi('Peso', c?.peso ? nutF(c.peso) + ' kg' : '—', c ? `Σ dobras ${nutF(c.soma)} mm` : '')}${nutKpi('Desde a 1ª avaliação', H.length > 1 && c && c0 ? `${c.g - c0.g > 0 ? '+' : ''}${nutF(c.g - c0.g)} pp` : '—', H.length > 1 ? `${H.length} avaliações · desde ${dataBR(H[0].data)}` : '1 avaliação')}</div>
      ${nutGraficos(H)}${nutHistTab(H, pode)}` : '<p class="empty">Nenhuma avaliação deste atleta.</p>'}
    <div class="mfoot"><span>${pode ? '<button class="btn" id="nuiav">+ Avaliação</button>' : ''}</span><div class="row"><button class="btn" id="nuipdf"${H.length ? '' : ' disabled'}>PDF individual</button><button class="btn pri" id="nuix">Fechar</button></div></div>`, true);
  $('#nuix').onclick = fechar;
  $('#nuipdf').onclick = () => { fechar(); nutPDFIndividual(id, nutFaixa(), 'aval'); };
  if (!pode) return;
  $('#nuiav').onclick = () => nutFormAval(null, id);
  document.querySelectorAll('[data-ave]').forEach(b => b.onclick = () => nutFormAval(S.nut.av.find(v => v.id === +b.dataset.ave)));
  document.querySelectorAll('[data-avd]').forEach(b => b.onclick = async () => { const v = S.nut.av.find(x => x.id === +b.dataset.avd); if (!confirm(`Excluir a avaliação de ${dataBR(v.data)}?`)) return;
    const { error } = await sb.from('nut_avaliacoes').delete().eq('id', v.id); if (error) return toast(erroAmigavel(error), true);
    S.nut.av = S.nut.av.filter(x => x.id !== v.id); toast('Avaliação excluída.'); nutIndiv(id); if (S.page === 'nutricao') pNutricao().then(() => nutIndiv(id)); });
}
// lançamento: uma data e uma linha por atleta (só as linhas preenchidas são salvas); edição = uma linha
function nutFormAval(v, soId) {
  const ed = !!v, L = ed ? [nutA(v.atleta_id)] : soId ? [nutA(soId)] : nutAtl();
  const cel = (a, k) => `<input class="in nut-in" inputmode="decimal" data-a="${a.id}" data-k="${k}" value="${ed && v[k] != null ? String(v[k]).replace('.', ',') : ''}">`;
  modal(`<h2>${ed ? 'Editar avaliação' : 'Nova avaliação física'}</h2>
    <p class="m">Dobras em mm e peso em kg. O % de gordura (Reilly, 4 dobras), a massa gorda e a massa livre de gordura saem sozinhos. ${ed || soId ? '' : 'Preencha só os atletas avaliados.'}</p>
    <label class="f nut-fd"><span>Data da avaliação</span><input type="date" class="in" id="nafd" value="${esc(ed ? v.data : hoje())}"></label>
    <div class="tablewrap"><table class="tb nut-tb nut-ftb"><thead><tr><th>Atleta</th><th>Peso</th>${NUT_DOBRAS.map(([, l]) => `<th>${l}</th>`).join('')}<th>% G</th><th>MLG</th></tr></thead><tbody>
      ${L.map(a => `<tr><td>${nutAtlCel(a)}</td>${cel(a, 'peso').replace(/^/, '<td>')}</td>${NUT_DOBRAS.map(([k]) => `<td>${cel(a, k)}</td>`).join('')}<td class="nut-res" data-rg="${a.id}">—</td><td class="nut-res" data-rm="${a.id}">—</td></tr>`).join('')}</tbody></table></div>
    <label class="f"><span>Observação <small class="m">(opcional)</small></span><input class="in" id="nafo" value="${esc(ed ? v.obs || '' : '')}"></label>
    <div class="mfoot"><span></span><div class="row"><button class="btn" id="nafx">Cancelar</button><button class="btn pri" id="nafs">Salvar</button></div></div>`, true);
  const linha = id => { const o = {}; document.querySelectorAll(`.nut-in[data-a="${id}"]`).forEach(i => { o[i.dataset.k] = i.value; }); return o; };
  const atual = id => { const c = nutCalc(linha(id)); $(`[data-rg="${id}"]`).textContent = c ? nutF(c.g) + '%' : '—'; $(`[data-rm="${id}"]`).textContent = c?.mlg != null ? nutF(c.mlg) + ' kg' : '—'; };
  L.forEach(a => atual(a.id));
  document.querySelectorAll('.nut-in').forEach(i => i.oninput = () => atual(+i.dataset.a));
  $('#nafx').onclick = () => ed ? nutIndiv(v.atleta_id) : soId ? nutIndiv(soId) : fechar();
  $('#nafs').onclick = async () => {
    const data = $('#nafd').value; if (!data) return toast('Informe a data.', true);
    const rows = [];
    for (const a of L) { const o = linha(a.id), algum = Object.values(o).some(x => String(x).trim() !== ''); if (!algum) continue;
      const c = nutCalc(o); if (!c) return toast(`${a.nome}: preencha as 4 dobras.`, true);
      const peso = nutN(o.peso); if (peso != null && (peso < 30 || peso > 200)) return toast(`${a.nome}: peso fora do normal.`, true);
      if (NUT_DOBRAS.some(([k]) => nutN(o[k]) > 80)) return toast(`${a.nome}: alguma dobra acima de 80 mm. Confira.`, true);
      rows.push({ atleta_id: a.id, data, peso, ...Object.fromEntries(NUT_DOBRAS.map(([k]) => [k, nutN(o[k])])), obs: $('#nafo').value.trim() || null, atualizado_em: new Date().toISOString() }); }
    if (!rows.length) return toast('Preencha ao menos um atleta.', true);
    $('#nafs').disabled = true;
    const q = ed ? sb.from('nut_avaliacoes').update(rows[0]).eq('id', v.id).select() : sb.from('nut_avaliacoes').insert(rows).select();
    const { data: dd, error } = await q; if (error) { $('#nafs').disabled = false; return toast(erroAmigavel(error), true); }
    if (ed) Object.assign(v, dd[0]); else S.nut.av.push(...dd);
    toast(ed ? 'Avaliação salva.' : `${dd.length} avaliação(ões) salva(s).`); fechar(); await pNutricao(); if (ed || soId) nutIndiv(ed ? v.atleta_id : soId);
  };
}

/* ===== 2. suplementação diária ===== */
const nutDias = f => { const n = Math.round((parse(f.ate) - parse(f.de)) / 864e5) + 1; return Array.from({ length: n }, (_, i) => addDays(f.de, i)); };
function nutAdesao(R, sup) {
  const dias = new Set(R.filter(r => r.suplemento === sup).map(r => r.data));
  return { dias: dias.size, de: id => { const n = R.filter(r => r.suplemento === sup && r.atleta_id === id).length; return { n, p: dias.size ? Math.round(n / dias.size * 100) : null }; } };
}
function nutSupHTML(f) {
  const SP = nutSupl(), pode = podeNut();
  if (!SP.length) return `<div class="panel empty">Nenhum suplemento cadastrado.${pode ? ' Use “Ajustes” para cadastrar a lista (ex.: creatina, whey, ômega 3).' : ''}</div>`;
  if (!SP.includes(S.nut.sp)) S.nut.sp = SP[0];
  const R = S.nut.sup, L = nutAtl(), ad = Object.fromEntries(SP.map(s => [s, nutAdesao(R, s)]));
  const media = s => { const v = L.map(a => ad[s].de(a.id).p).filter(x => x != null); return v.length && ad[s].dias ? Math.round(v.reduce((x, y) => x + y, 0) / v.length) : null; };
  const kpis = `<div class="cards nut-skpis">${SP.map(s => nutKpi(esc(s), media(s) != null ? media(s) + '%' : '—', `adesão média · dado em ${ad[s].dias} dia${ad[s].dias === 1 ? '' : 's'}`)).join('')}</div>`;
  let grade = '';
  if (S.nut.per === 'semana') {
    const D = nutDias(f), s = S.nut.sp, tem = (d, id) => R.find(r => r.data === d && r.atleta_id === id && r.suplemento === s);
    grade = `<div class="panel"><h2>Quem tomou · <span class="nut-chs">${SP.map(x => `<button class="chip${x === s ? ' on' : ''}" data-sp="${esc(x)}">${esc(x)}</button>`).join('')}</span></h2>
      <div class="tablewrap"><table class="tb nut-tb nut-grade"><thead><tr><th>Atleta</th>${D.map(d => `<th class="c">${NUT_DS[parse(d).getDay()]}<br><small>${fmt(d)}</small>${pode ? (L.every(a => tem(d, a.id)) ? `<br><button class="btn sm nut-tod nenhum" data-tod="${d}" title="Desmarcar todos neste dia">nenhum</button>` : `<br><button class="btn sm nut-tod" data-tod="${d}" title="Marcar todos neste dia">todos</button>`) : ''}</th>`).join('')}<th>Adesão</th></tr></thead><tbody>
      ${L.map(a => { const x = ad[s].de(a.id); return `<tr><td>${nutAtlCel(a)}</td>${D.map(d => `<td class="c"><button class="nut-ck${tem(d, a.id) ? ' on' : ''}" data-ck="${d}|${a.id}"${pode ? '' : ' disabled'}>${tem(d, a.id) ? '✓' : ''}</button></td>`).join('')}<td><b>${x.p != null ? x.p + '%' : '—'}</b> <small class="m">${x.n}/${ad[s].dias}</small></td></tr>`; }).join('')}</tbody></table></div>
      ${pode ? '<p class="m nut-nota">Clique na célula para marcar ou desmarcar. “todos” marca o elenco inteiro no dia.</p>' : ''}</div>`;
  }
  const resumo = `<div class="panel"><h2>Adesão por atleta · ${esc(f.txt)}</h2>${S.nut.per === 'mes' ? '<p class="m">Para marcar quem tomou, use a visão Semana.</p>' : ''}<div class="tablewrap"><table class="tb nut-tb"><thead><tr><th>Atleta</th>${SP.map(s => `<th>${esc(s)}</th>`).join('')}</tr></thead><tbody>
    ${L.map(a => `<tr class="dm-tr" data-sat="${a.id}"><td>${nutAtlCel(a)}</td>${SP.map(s => { const x = ad[s].de(a.id); return `<td>${x.p != null ? `<span class="nut-pct ${x.p >= 80 ? 'bom' : x.p >= 50 ? 'med' : 'ruim'}">${x.p}%</span> <small class="m">${x.n}/${ad[s].dias}</small>` : '<span class="m">—</span>'}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div>
    <p class="m nut-nota">Adesão = dias em que o atleta tomou ÷ dias em que o suplemento foi dado no período.</p></div>`;
  return kpis + grade + resumo;
}
function nutSupLigar(f) {
  document.querySelectorAll('[data-sp]').forEach(b => b.onclick = () => { S.nut.sp = b.dataset.sp; pNutricao(); });
  document.querySelectorAll('[data-sat]').forEach(tr => tr.onclick = () => nutPDFIndividual(+tr.dataset.sat, f, 'sup'));
  if (!podeNut()) return;
  document.querySelectorAll('[data-ck]').forEach(b => b.onclick = async () => {
    const [d, id] = b.dataset.ck.split('|'), s = S.nut.sp, ex = S.nut.sup.find(r => r.data === d && r.atleta_id === +id && r.suplemento === s);
    b.disabled = true;
    if (ex) { const { error } = await sb.from('nut_supl').delete().eq('id', ex.id); if (error) { b.disabled = false; return toast(erroAmigavel(error), true); } S.nut.sup = S.nut.sup.filter(r => r.id !== ex.id); }
    else { const { data, error } = await sb.from('nut_supl').insert({ data: d, atleta_id: +id, suplemento: s }).select().single(); if (error) { b.disabled = false; return toast(erroAmigavel(error), true); } S.nut.sup.push(data); }
    const y = window.scrollY; await pNutricao(); window.scrollTo(0, y);
  });
  document.querySelectorAll('[data-tod]').forEach(b => b.onclick = async () => {
    const d = b.dataset.tod, s = S.nut.sp, falta = nutAtl().filter(a => !S.nut.sup.some(r => r.data === d && r.atleta_id === a.id && r.suplemento === s));
    if (!falta.length) {   // todos marcados: desmarca o dia inteiro
      const R = S.nut.sup.filter(r => r.data === d && r.suplemento === s);
      if (!confirm(`Desmarcar ${s} dos ${R.length} atletas em ${NUT_DS[parse(d).getDay()]} ${fmt(d)}?`)) return;
      const { error } = await sb.from('nut_supl').delete().in('id', R.map(r => r.id)); if (error) return toast(erroAmigavel(error), true);
      const ids = new Set(R.map(r => r.id)); S.nut.sup = S.nut.sup.filter(r => !ids.has(r.id)); const y = window.scrollY; await pNutricao(); window.scrollTo(0, y); return;
    }
    const { data, error } = await sb.from('nut_supl').insert(falta.map(a => ({ data: d, atleta_id: a.id, suplemento: s }))).select(); if (error) return toast(erroAmigavel(error), true);
    S.nut.sup.push(...data); const y = window.scrollY; await pNutricao(); window.scrollTo(0, y);
  });
}

/* ===== 3. jogos: hidratação e suplementação ===== */
function nutJogoStats(j) {
  const D = Object.entries(j.atletas || {}).map(([id, r]) => ({ id: +id, r, u: nutUSG(r.usg), pe: nutPerda(r) }));
  const U = D.filter(x => x.u != null), P = D.filter(x => x.pe != null), cnt = k => U.filter(x => nutHid(x.u)[0] === k).length;
  return { D, U, n: U.length, med: U.length ? U.reduce((s, x) => s + x.u, 0) / U.length : null, ok: cnt('ok'), leve: cnt('leve'), sig: cnt('sig'), grave: cnt('grave'),
    perda: P.length ? P.reduce((s, x) => s + x.pe, 0) / P.length : null, perda2: P.filter(x => x.pe > 2).length, mom: Object.fromEntries(NUT_MOM.map(([k]) => [k, D.filter(x => x.r[k]).length])) };
}
const nutUSGBadge = u => { const h = nutHid(u); return h ? `<span class="nut-usg h-${h[0]}" title="${h[1]}">${nutUSGtxt(u)}</span>` : '<span class="m">—</span>'; };
function nutJogosHTML(f) {
  const J = S.nut.jg.filter(j => nutNoPer(j.data, f)).reverse(), pode = podeNut(), ult = S.nut.jg.slice(-10);
  const graf = ult.length ? (() => { const W = 640, H = 170, l = 40, r = 10, t = 14, b = 34, lo = 1.000, hi = 1.035, Y = u => t + (hi - Math.min(hi, Math.max(lo, u))) / (hi - lo) * (H - t - b), bw = (W - l - r) / ult.length;
    const faixas = [[1.000, 1.010, '#e6f4ea'], [1.010, 1.020, '#fff6d6'], [1.020, 1.030, '#ffe6cc'], [1.030, 1.035, '#fde0dd']];
    return `<div class="panel"><h2>Hidratação por jogo <small class="m">densidade média da urina no pré-jogo · últimos ${ult.length} jogos</small></h2><div class="nut-gj"><svg viewBox="0 0 ${W} ${H}">
      ${faixas.map(([a, z, c]) => `<rect x="${l}" y="${Y(z)}" width="${W - l - r}" height="${Y(a) - Y(z)}" fill="${c}"/>`).join('')}
      ${[1.010, 1.020, 1.030].map(u => `<text x="${l - 4}" y="${Y(u) + 3}" text-anchor="end" class="nut-gy">${nutUSGtxt(u)}</text>`).join('')}
      ${ult.map((j, i) => { const st = nutJogoStats(j), x = l + i * bw + bw * .2, w = bw * .6; return st.med == null ? '' : `<rect x="${x}" y="${Y(st.med)}" width="${w}" height="${Y(lo) - Y(st.med)}" rx="3" class="nut-bar h-${nutHid(st.med)[0]}"/><text x="${x + w / 2}" y="${Y(st.med) - 4}" text-anchor="middle" class="nut-gv">${nutUSGtxt(st.med)}</text>
        <text x="${x + w / 2}" y="${H - 20}" text-anchor="middle" class="nut-gx">${fmt(j.data)}</text><text x="${x + w / 2}" y="${H - 8}" text-anchor="middle" class="nut-gx">${esc(String(j.titulo).slice(0, 14))}</text>`; }).join('')}</svg></div>
      <p class="m nut-nota"><span class="nut-usg h-ok">&lt; 1,010 hidratado</span> <span class="nut-usg h-leve">1,010–1,020 leve</span> <span class="nut-usg h-sig">1,021–1,030 significativa</span> <span class="nut-usg h-grave">&gt; 1,030 grave</span></p></div>`; })() : '';
  return `${graf}<div class="panel"><h2>Jogos · ${esc(f.txt)} ${pode ? '<button class="btn sm pri nut-h2b" id="nutjn">+ Jogo</button>' : ''}</h2>
    ${J.length ? `<div class="tablewrap"><table class="tb nut-tb"><thead><tr><th>Data</th><th>Jogo</th><th>Densidade média</th><th>Hidratação</th><th>Perda de peso média</th>${NUT_MOM.map(([, l]) => `<th>${l}</th>`).join('')}</tr></thead><tbody>
      ${J.map(j => { const st = nutJogoStats(j); return `<tr class="dm-tr" data-jg="${j.id}"><td>${dataBR(j.data)}</td><td><b>${esc(j.titulo)}</b></td><td>${nutUSGBadge(st.med)} <small class="m">${st.n} atletas</small></td>
        <td class="sm">${st.n ? `${st.ok} hidratados · ${st.leve} leve · ${st.sig + st.grave} signif./grave` : '—'}</td><td>${st.perda != null ? nutF(st.perda) + '%' : '—'}${st.perda2 ? ` <small class="nut-d ruim">${st.perda2} acima de 2%</small>` : ''}</td>
        ${NUT_MOM.map(([k]) => `<td>${st.mom[k]}</td>`).join('')}</tr>`; }).join('')}</tbody></table></div>` : `<p class="empty">Nenhum jogo neste período.${pode ? ' Use “+ Jogo”.' : ''}</p>`}</div>`;
}
function nutJogosLigar() {
  document.querySelectorAll('[data-jg]').forEach(tr => tr.onclick = () => nutJogo(S.nut.jg.find(j => j.id === +tr.dataset.jg)));
  if ($('#nutjn')) $('#nutjn').onclick = nutNovoJogo;
}
function nutNovoJogo() {
  const usados = new Set(S.nut.jg.map(j => j.sessao_id).filter(Boolean));
  const ses = (S.sessoes || []).filter(s => ['Jogo', 'Amistoso'].includes(s.tipo) && !usados.has(s.id)).sort((a, b) => b.data.localeCompare(a.data)).slice(0, 15);
  modal(`<h2>Novo jogo</h2>${ses.length ? `<div class="f"><span>Jogo do Calendário</span><select class="in" id="nnjs">${opts(ses.map(s => [s.id, `${dataBR(s.data)} · ${s.titulo || s.tipo}`]), '', 'Escolha…')}</select></div><p class="m">ou preencha à mão:</p>` : ''}
    <div class="gol-f3"><label class="f"><span>Data</span><input type="date" class="in" id="nnjd" value="${hoje()}"></label><label class="f"><span>Jogo</span><input class="in" id="nnjt" placeholder="QFC x ABC"></label></div>
    <div class="mfoot"><span></span><div class="row"><button class="btn" id="nnjx">Cancelar</button><button class="btn pri" id="nnjk">Criar</button></div></div>`);
  if ($('#nnjs')) $('#nnjs').onchange = () => { const s = ses.find(x => x.id === +$('#nnjs').value); if (s) { $('#nnjd').value = s.data; $('#nnjt').value = s.titulo || s.tipo; } };
  $('#nnjx').onclick = fechar;
  $('#nnjk').onclick = async () => {
    const row = { data: $('#nnjd').value, titulo: $('#nnjt').value.trim(), sessao_id: $('#nnjs') && +$('#nnjs').value || null, protocolo: S.nut.cfg.padrao_jogo || { pre: [], int: [], pos: [] }, atletas: {} };
    if (!row.data || !row.titulo) return toast('Informe a data e o jogo.', true);
    const { data, error } = await sb.from('nut_jogos').insert(row).select().single(); if (error) return toast(erroAmigavel(error), true);
    S.nut.jg.push(data); S.nut.jg.sort((a, b) => a.data.localeCompare(b.data)); nutJogo(data);
  };
}
function nutJogo(j) {
  if (!j) return;
  const pode = podeNut(), SJ = nutSuplJogo(), P = JSON.parse(JSON.stringify(j.protocolo || { pre: [], int: [], pos: [] })), A = JSON.parse(JSON.stringify(j.atletas || {}));
  const L = pode ? nutAtl() : nutAtl().filter(a => A[a.id]), ex = Object.keys(A).map(Number).filter(id => !L.some(a => a.id === id)).map(nutA).filter(Boolean);
  const rows = [...L, ...ex], st = nutJogoStats(j);
  const prot = NUT_MOM.map(([k, l]) => `<div class="nut-pm"><b>${l}</b><span>${pode ? [...new Set([...SJ, ...(P[k] || [])])].map(s => `<button type="button" class="chip${(P[k] || []).includes(s) ? ' on' : ''}" data-pk="${k}" data-ps="${esc(s)}">${esc(s)}</button>`).join('') || '<small class="m">cadastre em Ajustes</small>'
    : (P[k] || []).map(s => `<span class="badge">${esc(s)}</span>`).join(' ') || '<small class="m">—</small>'}</span></div>`).join('');
  const inp = (id, k, ph) => pode ? `<input class="in nut-in" inputmode="decimal" data-ja="${id}" data-jk="${k}" value="${esc(A[id]?.[k] ?? '')}" placeholder="${ph}">` : esc(String(A[id]?.[k] ?? '—').replace('.', ','));
  modal(`<h2>${esc(j.titulo)} <small class="m">${dataBR(j.data)}</small></h2>
    ${st.n ? `<div class="cards gol-kpis">${nutKpi('Densidade média', nutUSGBadge(st.med), `${st.n} atletas`)}${nutKpi('Hidratados', `${st.ok}<small class="m">/${st.n}</small>`, `${st.leve} leve · ${st.sig} significativa · ${st.grave} grave`)}${nutKpi('Perda de peso média', st.perda != null ? nutF(st.perda) + '%' : '—', st.perda2 ? `${st.perda2} atleta(s) acima de 2%` : 'pré − pós')}${nutKpi('Suplementação', NUT_MOM.map(([k, l]) => `${l.slice(0, 3)} ${st.mom[k]}`).join(' · '), 'atletas que tomaram')}</div>` : ''}
    <h3 class="gol-h3">Protocolo de suplementação do jogo</h3><div class="nut-prot">${prot}</div>
    <h3 class="gol-h3">Atletas</h3><div class="tablewrap"><table class="tb nut-tb nut-jtb"><thead><tr><th>Atleta</th><th>Densidade urina</th><th>Peso pré</th><th>Peso pós</th><th>% perda</th>${NUT_MOM.map(([k, l]) => `<th class="c">${l}${pode ? `<br><button class="btn sm nut-tod" data-jt="${k}">todos</button>` : ''}</th>`).join('')}<th>Obs.</th></tr></thead><tbody>
      ${rows.map(a => `<tr><td>${nutAtlCel(a)}</td><td>${inp(a.id, 'usg', '1,0__')} <span data-jh="${a.id}"></span></td><td>${inp(a.id, 'pp', 'kg')}</td><td>${inp(a.id, 'pd', 'kg')}</td><td data-jp="${a.id}">—</td>
        ${NUT_MOM.map(([k]) => `<td class="c"><button class="nut-ck${A[a.id]?.[k] ? ' on' : ''}" data-jc="${a.id}|${k}"${pode ? '' : ' disabled'}>${A[a.id]?.[k] ? '✓' : ''}</button></td>`).join('')}
        <td>${pode ? `<input class="in nut-in nut-obs" data-ja="${a.id}" data-jk="obs" value="${esc(A[a.id]?.obs || '')}">` : esc(A[a.id]?.obs || '')}</td></tr>`).join('') || '<tr><td colspan="9" class="m">Sem dados.</td></tr>'}</tbody></table></div>
    <div class="mfoot">${pode ? '<button class="btn dan" id="njdel">Excluir jogo</button>' : '<span></span>'}<div class="row"><button class="btn" id="njpdf">PDF deste jogo</button>${pode ? '<button class="btn" id="njx">Cancelar</button><button class="btn pri" id="njs">Salvar</button>' : '<button class="btn pri" id="njx">Fechar</button>'}</div></div>`, true);
  const atual = id => { const r = A[id] || {}, u = nutUSG(r.usg), h = $(`[data-jh="${id}"]`), pe = nutPerda(r);
    if (h) h.innerHTML = u != null ? `<span class="nut-dot h-${nutHid(u)[0]}" title="${nutHid(u)[1]}"></span>` : '';
    const p = $(`[data-jp="${id}"]`); if (p) p.innerHTML = pe != null ? `<b class="${pe > 2 ? 'nut-alto' : ''}">${nutF(pe)}%</b>` : '—'; };
  const set = (id, k, v) => { A[id] = A[id] || {}; if (v === '' || v === false || v == null) delete A[id][k]; else A[id][k] = v; if (!Object.keys(A[id]).length) delete A[id]; };
  rows.forEach(a => atual(a.id));
  $('#njx').onclick = fechar;
  $('#njpdf').onclick = () => { fechar(); nutPDFJogos([j], { txt: `${j.titulo} · ${dataBR(j.data)}`, curto: j.data, um: true }); };
  if (!pode) return;
  document.querySelectorAll('[data-pk]').forEach(b => b.onclick = () => { const k = b.dataset.pk, s = b.dataset.ps; P[k] = P[k] || []; b.classList.toggle('on'); P[k] = b.classList.contains('on') ? [...new Set([...P[k], s])] : P[k].filter(x => x !== s); });
  document.querySelectorAll('[data-ja]').forEach(i => i.oninput = () => { set(i.dataset.ja, i.dataset.jk, i.value.trim()); atual(+i.dataset.ja); });
  document.querySelectorAll('[data-jc]').forEach(b => b.onclick = () => { const [id, k] = b.dataset.jc.split('|'), on = !b.classList.contains('on'); set(id, k, on); b.classList.toggle('on', on); b.textContent = on ? '✓' : ''; });
  const rotJT = () => document.querySelectorAll('[data-jt]').forEach(b => { const k = b.dataset.jt, todos = rows.length && rows.every(a => A[a.id]?.[k]);
    b.textContent = todos ? 'nenhum' : 'todos'; b.classList.toggle('nenhum', !!todos); b.title = todos ? 'Desmarcar todos' : 'Marcar todos'; });
  rotJT();
  document.querySelectorAll('[data-jc]').forEach(b => b.addEventListener('click', rotJT));
  document.querySelectorAll('[data-jt]').forEach(b => b.onclick = () => { const k = b.dataset.jt, lab = NUT_MOM.find(m => m[0] === k)[1], on = !rows.every(a => A[a.id]?.[k]);
    if (!on && !confirm(`Desmarcar ${lab} de todos os atletas?`)) return;
    rows.forEach(a => set(a.id, k, on)); document.querySelectorAll(`[data-jc$="|${k}"]`).forEach(c => { c.classList.toggle('on', on); c.textContent = on ? '✓' : ''; }); rotJT(); });
  $('#njdel').onclick = async () => { if (!confirm(`Excluir o jogo ${j.titulo} (${dataBR(j.data)}) e os dados de hidratação e suplementação? Não dá para desfazer.`)) return;
    const { error } = await sb.from('nut_jogos').delete().eq('id', j.id); if (error) return toast(erroAmigavel(error), true);
    S.nut.jg = S.nut.jg.filter(x => x.id !== j.id); fechar(); toast('Jogo excluído.'); pNutricao(); };
  $('#njs').onclick = async () => {
    for (const [id, r] of Object.entries(A)) { const a = nutA(id);
      if (r.usg != null && nutUSG(r.usg) == null) return toast(`${a?.nome}: densidade inválida (use 1,015 ou 1015).`, true);
      for (const k of ['pp', 'pd']) if (r[k] != null && (nutN(r[k]) == null || nutN(r[k]) < 30 || nutN(r[k]) > 200)) return toast(`${a?.nome}: peso inválido.`, true);
      if (r.usg != null) r.usg = nutUSG(r.usg); ['pp', 'pd'].forEach(k => { if (r[k] != null) r[k] = nutN(r[k]); }); }
    const { data, error } = await sb.from('nut_jogos').update({ protocolo: P, atletas: A, atualizado_em: new Date().toISOString() }).eq('id', j.id).select().single();
    if (error) return toast(erroAmigavel(error), true);
    Object.assign(j, data); fechar(); toast('Jogo salvo.'); pNutricao();
  };
}

/* ---------- ajustes ---------- */
function nutAjustes() {
  const c = S.nut.cfg, pj = c.padrao_jogo || { pre: [], int: [], pos: [] };
  modal(`<h2>Ajustes da Nutrição</h2>
    <label class="f"><span>Nutricionista</span><input class="in" id="najn" value="${esc(nutNutri())}"></label>
    <div class="g2 nut-aj"><label class="f"><span>Suplementos do dia a dia <small class="m">um por linha</small></span><textarea class="in" id="najs" rows="6" placeholder="Creatina\nWhey\nÔmega 3">${esc(nutSupl().join('\n'))}</textarea></label>
      <label class="f"><span>Suplementos do jogo <small class="m">um por linha</small></span><textarea class="in" id="najj" rows="6" placeholder="Carboidrato em gel\nCafeína\nIsotônico\nWhey">${esc(nutSuplJogo().join('\n'))}</textarea></label></div>
    <div class="f"><span>Protocolo padrão do jogo <small class="m">vem marcado em cada jogo novo (separe por vírgula)</small></span>
      ${NUT_MOM.map(([k, l]) => `<label class="f nut-pdj"><span>${l}</span><input class="in" data-pdj="${k}" value="${esc((pj[k] || []).join(', '))}"></label>`).join('')}</div>
    <div class="mfoot"><span></span><div class="row"><button class="btn" id="najx">Cancelar</button><button class="btn pri" id="najk">Salvar</button></div></div>`, true);
  $('#najx').onclick = fechar;
  $('#najk').onclick = async () => {
    const lst = s => [...new Set($(s).value.split('\n').map(x => x.trim()).filter(Boolean))];
    const pad = Object.fromEntries(NUT_MOM.map(([k]) => [k, [...new Set(document.querySelector(`[data-pdj=${k}]`).value.split(',').map(x => x.trim()).filter(Boolean))]]));
    const v = [{ chave: 'nutricionista', valor: $('#najn').value.trim() }, { chave: 'suplementos', valor: lst('#najs') }, { chave: 'supl_jogo', valor: lst('#najj') }, { chave: 'padrao_jogo', valor: pad }];
    const { error } = await sb.from('nut_config').upsert(v); if (error) return toast(erroAmigavel(error), true);
    v.forEach(x => { S.nut.cfg[x.chave] = x.valor; }); fechar(); toast('Ajustes salvos.'); pNutricao();
  };
}

/* ---------- PDF ---------- */
function nutEscolherAtleta(cb) {
  modal(`<h2>PDF individual</h2><p class="m">${esc(nutFaixa().txt)} · ${S.nut.aba === 'aval' ? 'avaliação física (todo o histórico do atleta)' : S.nut.aba === 'sup' ? 'suplementação do período' : 'jogos do período'}</p>
    <label class="f"><span>Atleta</span><select class="in" id="nutea">${opts(nutAtl().map(a => [a.id, `${a.numero != null ? a.numero + ' · ' : ''}${a.nome}`]), '', 'Escolha…')}</select></label>
    <div class="mfoot"><span></span><div class="row"><button class="btn" id="nutex">Cancelar</button><button class="btn pri" id="nutek">Gerar PDF</button></div></div>`);
  $('#nutex').onclick = fechar;
  $('#nutek').onclick = () => { const id = +$('#nutea').value; if (!id) return toast('Escolha o atleta.', true); fechar(); cb(id); };
}
function nutImprimir(tit, sub, corpo, nome, deitado) {
  const html = `<section class="golp nutp"><div class="golp-cab"><img src="${LOGO}" alt=""><div class="golp-ct"><small>QFC · NUTRIÇÃO</small><h1>${tit}</h1></div>
    <div class="golp-cp"><b>${esc(sub)}</b>${nutNutri() ? `<span>Nutricionista: ${esc(nutNutri())}</span>` : ''}</div></div>${corpo}
    <div class="golp-rod">CINQ · Centro de Inteligência do QFC · gerado em ${new Date().toLocaleDateString('pt-BR')}</div></section>`;
  document.querySelectorAll('#print-area').forEach(x => x.remove());
  const w = document.createElement('div'); w.id = 'print-area'; w.className = 'golp-w nutp-w'; w.innerHTML = html;
  const stl = document.createElement('style'); stl.id = 'flp-page'; stl.textContent = `@page{size:A4 ${deitado ? 'landscape' : 'portrait'};margin:10mm}`;
  document.head.appendChild(stl); document.body.appendChild(w); document.body.classList.add('imprimindo');
  const tt = document.title; document.title = nome.replace(/\s+/g, '_');
  setTimeout(() => { window.print(); setTimeout(() => { w.remove(); stl.remove(); document.body.classList.remove('imprimindo'); document.title = tt; }, 500); }, 400);
}
const nutBox = (v, l) => `<div><b>${v}</b><span>${l}</span></div>`;
function nutPDFPeriodo(f) {
  const A = S.nut.aba;
  if (A === 'aval') {
    const V = S.nut.av.filter(v => nutNoPer(v.data, f)).sort((a, b) => a.data.localeCompare(b.data) || (nutA(a.atleta_id)?.nome || '').localeCompare(nutA(b.atleta_id)?.nome || '', 'pt'));
    if (!V.length) return toast('Nenhuma avaliação neste período.', true);
    const C = V.map(v => ({ v, c: nutCalc(v), p: (H => { const i = H.findIndex(x => x.id === v.id); return i > 0 ? nutCalc(H[i - 1]) : null; })(nutAvDe(v.atleta_id)) }));
    const med = k => { const x = C.map(o => o.c?.[k]).filter(y => y != null); return x.length ? x.reduce((s, y) => s + y, 0) / x.length : null; };
    const R = nutAvalResumo(f.ate);
    const corpo = `<div class="golp-k">${nutBox(new Set(V.map(v => v.atleta_id)).size, 'atletas avaliados')}${nutBox(med('g') != null ? nutF(med('g')) + '%' : '—', '% gordura média')}${nutBox(med('mlg') != null ? nutF(med('mlg')) + ' kg' : '—', 'MLG média')}${nutBox(med('soma') != null ? nutF(med('soma')) + ' mm' : '—', 'Σ 4 dobras médio')}</div>
      <h2 class="golp-h2">Avaliações do período</h2><table class="nutp-tb"><thead><tr><th>Atleta</th><th>Pos.</th><th>Data</th><th>Peso</th>${NUT_DOBRAS.map(([, l]) => `<th>${l}</th>`).join('')}<th>Σ</th><th>%G</th><th>Δ %G</th><th>MG</th><th>MLG</th><th>Δ MLG</th></tr></thead><tbody>
      ${C.map(({ v, c, p }) => { const a = nutA(v.atleta_id); return `<tr><td><b>${esc(a?.nome || '?')}</b></td><td>${esc((a?.posicao || '').split(' ')[0])}</td><td>${fmt(v.data)}</td><td>${c?.peso ? nutF(c.peso) : '—'}</td>${NUT_DOBRAS.map(([k]) => `<td>${nutF(nutN(v[k]))}</td>`).join('')}<td>${nutF(c?.soma)}</td><td><b>${nutF(c?.g)}</b></td><td>${nutDelta(c?.g, p?.g)}</td><td>${nutF(c?.mg)}</td><td><b>${nutF(c?.mlg)}</b></td><td>${nutDelta(c?.mlg, p?.mlg, true)}</td></tr>`; }).join('')}</tbody></table>
      ${R.pos.length ? `<h2 class="golp-h2">Por posição (última avaliação)</h2><table class="nutp-tb"><thead><tr><th>Posição</th><th>Atletas</th><th>% gordura</th><th>MLG</th></tr></thead><tbody>${R.pos.map(([p, n, g, m]) => `<tr><td><b>${esc(p)}</b></td><td>${n}</td><td>${nutF(g)}%</td><td>${m != null ? nutF(m) + ' kg' : '—'}</td></tr>`).join('')}</tbody></table>` : ''}
      <p class="golp-m">%G pela equação de Reilly (4 dobras). MG = massa gorda; MLG = massa livre de gordura (kg). Δ = diferença para a avaliação anterior.</p>`;
    return nutImprimir('Avaliação física', f.txt, corpo, `Nutricao_avaliacao_${f.curto}`, true);
  }
  if (A === 'sup') {
    const SP = nutSupl(), R = S.nut.sup, L = nutAtl(); if (!SP.length || !R.length) return toast('Nenhuma suplementação marcada neste período.', true);
    const ad = Object.fromEntries(SP.map(s => [s, nutAdesao(R, s)]));
    const media = s => { const v = L.map(a => ad[s].de(a.id).p).filter(x => x != null); return v.length && ad[s].dias ? Math.round(v.reduce((x, y) => x + y, 0) / v.length) : null; };
    const D = nutDias(f), semana = S.nut.per === 'semana';
    const corpo = `<div class="golp-k" style="grid-template-columns:repeat(${Math.min(SP.length, 5)},1fr)">${SP.map(s => nutBox(media(s) != null ? media(s) + '%' : '—', `${esc(s)} · ${ad[s].dias} dia(s)`)).join('')}</div>
      <h2 class="golp-h2">Adesão por atleta</h2><table class="nutp-tb"><thead><tr><th>Atleta</th>${SP.map(s => `<th>${esc(s)}</th>`).join('')}</tr></thead><tbody>
      ${L.map(a => `<tr><td><b>${esc(a.nome)}</b></td>${SP.map(s => { const x = ad[s].de(a.id); return `<td>${x.p != null ? `${x.p}% <small>(${x.n}/${ad[s].dias})</small>` : '—'}</td>`; }).join('')}</tr>`).join('')}</tbody></table>
      ${semana ? SP.filter(s => ad[s].dias).map(s => `<h2 class="golp-h2">${esc(s)} · quem tomou</h2><table class="nutp-tb nutp-gr"><thead><tr><th>Atleta</th>${D.map(d => `<th>${NUT_DS[parse(d).getDay()]} ${fmt(d)}</th>`).join('')}</tr></thead><tbody>
        ${L.map(a => `<tr><td>${esc(a.nome)}</td>${D.map(d => `<td>${R.some(r => r.data === d && r.atleta_id === a.id && r.suplemento === s) ? '✓' : ''}</td>`).join('')}</tr>`).join('')}</tbody></table>`).join('') : ''}
      <p class="golp-m">Adesão = dias em que o atleta tomou ÷ dias em que o suplemento foi dado no período.</p>`;
    return nutImprimir('Suplementação', f.txt, corpo, `Nutricao_suplementacao_${f.curto}`, semana && D.length > 7);
  }
  const J = S.nut.jg.filter(j => nutNoPer(j.data, f)); if (!J.length) return toast('Nenhum jogo neste período.', true);
  nutPDFJogos(J, f);
}
function nutJogoPDFBloco(j, soId) {
  const st = nutJogoStats(j), P = j.protocolo || {};
  const ids = soId ? [soId] : Object.keys(j.atletas || {}).map(Number).sort((a, b) => (nutA(a)?.numero ?? 999) - (nutA(b)?.numero ?? 999));
  return `<div class="nutp-j"><h2 class="golp-h2">${esc(j.titulo)} · ${dataBR(j.data)}</h2>
    ${soId ? '' : `<div class="golp-k">${nutBox(st.med != null ? nutUSGtxt(st.med) : '—', 'densidade média')}${nutBox(st.n ? `${st.ok}/${st.n}` : '—', 'hidratados')}${nutBox(st.perda != null ? nutF(st.perda) + '%' : '—', 'perda de peso média')}${nutBox(NUT_MOM.map(([k]) => st.mom[k]).join(' / '), 'tomaram pré / int. / pós')}</div>`}
    <p class="golp-m"><b>Protocolo:</b> ${NUT_MOM.map(([k, l]) => `${l}: ${(P[k] || []).join(', ') || '—'}`).join(' · ')}</p>
    <table class="nutp-tb"><thead><tr><th>Atleta</th><th>Densidade</th><th>Hidratação</th><th>Peso pré</th><th>Peso pós</th><th>% perda</th>${NUT_MOM.map(([, l]) => `<th>${l}</th>`).join('')}<th>Obs.</th></tr></thead><tbody>
    ${ids.map(id => { const r = j.atletas?.[id] || {}, u = nutUSG(r.usg), h = nutHid(u), pe = nutPerda(r); return `<tr><td><b>${esc(nutA(id)?.nome || '?')}</b></td><td>${nutUSGtxt(u)}</td><td>${h ? `<span class="nut-usg h-${h[0]}">${h[1]}</span>` : '—'}</td><td>${r.pp != null ? nutF(nutN(r.pp)) : '—'}</td><td>${r.pd != null ? nutF(nutN(r.pd)) : '—'}</td><td>${pe != null ? nutF(pe) + '%' : '—'}</td>${NUT_MOM.map(([k]) => `<td>${r[k] ? '✓' : ''}</td>`).join('')}<td>${esc(r.obs || '')}</td></tr>`; }).join('') || '<tr><td colspan="10">Sem dados.</td></tr>'}</tbody></table></div>`;
}
function nutPDFJogos(J, f) {
  nutImprimir('Jogos · hidratação e suplementação', f.txt, J.map(j => nutJogoPDFBloco(j)).join('') + '<p class="golp-m">Densidade da urina: &lt; 1,010 hidratado · 1,010–1,020 desidratação leve · 1,021–1,030 significativa · &gt; 1,030 grave. % perda = (peso pré − peso pós) ÷ peso pré.</p>', `Nutricao_jogos_${f.curto}`);
}
function nutPDFIndividual(id, f, aba = S.nut.aba) {
  const a = nutA(id); if (!a) return;
  const cabA = `<div class="nutp-at">${a.foto_url ? `<span class="golp-ft">${fotoFundo(a)}</span>` : `<span class="golp-ft golp-ini">${esc(iniciais(a.nome))}</span>`}<div><b>${esc(a.nome)}</b><small>${esc([a.numero != null ? 'nº ' + a.numero : '', a.posicao].filter(Boolean).join(' · '))}</small></div></div>`;
  if (aba === 'aval') {
    const H = nutAvDe(id); if (!H.length) return toast('Este atleta ainda não tem avaliação.', true);
    const c = nutCalc(H[H.length - 1]), c0 = nutCalc(H[0]);
    return nutImprimir('Avaliação física · individual', 'Histórico completo', cabA + `<div class="golp-k">${nutBox(c ? nutF(c.g) + '%' : '—', '% gordura atual')}${nutBox(c?.mlg != null ? nutF(c.mlg) + ' kg' : '—', 'massa livre de gordura')}${nutBox(c?.peso ? nutF(c.peso) + ' kg' : '—', 'peso')}${nutBox(H.length > 1 && c && c0 ? `${c.g - c0.g > 0 ? '+' : ''}${nutF(c.g - c0.g)} pp` : '—', `%G desde ${fmt(H[0].data)}`)}</div>
      ${nutGraficos(H)}<h2 class="golp-h2">Avaliações</h2>${nutHistTab(H, false).replace('class="tb nut-tb"', 'class="nutp-tb"')}<p class="golp-m">%G pela equação de Reilly (4 dobras). MG = massa gorda; MLG = massa livre de gordura (kg).</p>`, `Nutricao_${a.nome}_avaliacao`);
  }
  if (aba === 'sup') {
    const SP = nutSupl(), R = S.nut.sup; if (!SP.length) return toast('Nenhum suplemento cadastrado.', true);
    const corpo = cabA + `<div class="golp-k" style="grid-template-columns:repeat(${Math.min(Math.max(SP.length, 1), 5)},1fr)">${SP.map(s => { const x = nutAdesao(R, s).de(id), d = nutAdesao(R, s).dias; return nutBox(x.p != null ? x.p + '%' : '—', `${esc(s)} · ${x.n}/${d} dia(s)`); }).join('')}</div>
      <h2 class="golp-h2">Dias em que tomou</h2><table class="nutp-tb"><thead><tr><th>Suplemento</th><th>Dias</th></tr></thead><tbody>${SP.map(s => `<tr><td><b>${esc(s)}</b></td><td>${R.filter(r => r.atleta_id === id && r.suplemento === s).map(r => r.data).sort().map(d => `${NUT_DS[parse(d).getDay()]} ${fmt(d)}`).join(' · ') || '—'}</td></tr>`).join('')}</tbody></table>
      <p class="golp-m">Adesão = dias em que tomou ÷ dias em que o suplemento foi dado no período.</p>`;
    return nutImprimir('Suplementação · individual', f.txt, corpo, `Nutricao_${a.nome}_suplementacao_${f.curto}`);
  }
  const J = S.nut.jg.filter(j => nutNoPer(j.data, f) && j.atletas?.[id]); if (!J.length) return toast('Nenhum jogo deste atleta no período.', true);
  const U = J.map(j => nutUSG(j.atletas[id].usg)).filter(x => x != null), Pe = J.map(j => nutPerda(j.atletas[id])).filter(x => x != null);
  const corpo = cabA + `<div class="golp-k">${nutBox(J.length, 'jogos')}${nutBox(U.length ? nutUSGtxt(U.reduce((s, x) => s + x, 0) / U.length) : '—', 'densidade média')}${nutBox(U.length ? `${U.filter(u => u < 1.010).length}/${U.length}` : '—', 'jogos hidratado')}${nutBox(Pe.length ? nutF(Pe.reduce((s, x) => s + x, 0) / Pe.length) + '%' : '—', 'perda de peso média')}</div>
    ${J.map(j => nutJogoPDFBloco(j, id)).join('')}<p class="golp-m">Densidade da urina: &lt; 1,010 hidratado · 1,010–1,020 leve · 1,021–1,030 significativa · &gt; 1,030 grave.</p>`;
  nutImprimir('Jogos · individual', f.txt, corpo, `Nutricao_${a.nome}_jogos_${f.curto}`);
}

/* ---------- menu e navegação ---------- */
function navNut() {
  const nav = $('#nav'); if (!nav || nav.querySelector('[data-p=nutricao]')) return;
  if (typeof pagPermitida === 'function' && typeof modulosPerm === 'function' && modulosPerm() && !pagPermitida('nutricao')) return;
  const n = document.createElement('button'); n.dataset.p = 'nutricao'; n.textContent = 'Nutrição'; n.classList.toggle('on', S.page === 'nutricao');
  const ref = [...nav.querySelectorAll('button')].find(b => b.textContent.trim().startsWith('Amistosos')) || [...nav.querySelectorAll('.sec')].find(s => /Análise de jogo|Análise do advers|Administra/i.test(s.textContent));
  ref ? ref.parentNode.insertBefore(n, ref) : nav.appendChild(n);
}
const _shellNut = shell;
shell = function () { _shellNut(); navNut(); };
const _irNut = ir;
ir = function (p) {
  if (p !== 'nutricao') return _irNut(p);
  if (typeof pagPermitida === 'function' && typeof modulosPerm === 'function' && modulosPerm() && !pagPermitida('nutricao')) return _irNut('inicio');
  S.page = p; document.querySelectorAll('#nav button[data-p]').forEach(b => b.classList.toggle('on', b.dataset.p === p));
  pNutricao(); window.scrollTo(0, 0);
};
if (document.getElementById('main') && S.perfil) { navNut(); if (S.page === 'nutricao') ir('nutricao'); }
