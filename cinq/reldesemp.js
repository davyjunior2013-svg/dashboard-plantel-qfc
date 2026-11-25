/* CINQ – Relatório de desempenho do atleta (Técnico individual).
   Compara o atleta com a média do grupo nos mesmos treinos (GPS), mostra a evolução, a Competição de treinos e a
   composição corporal, e fecha com uma mensagem da comissão. PDF A4 retrato no padrão do Departamento de Saúde e Performance.
   Destaques e "próximo passo" saem por regras fixas a partir dos dados; a mensagem final vem com um modelo editável. */
const RD_MET = [['dist', 'Distância total', 'm', 0], ['mmin', 'Distância relativa (m/min)', '', 0], ['pl', 'Player Load (carga total)', '', 0], ['plmin', 'Player Load por minuto', '', 2],
  ['n_acel', 'Acelerações', '', 0], ['n_desac', 'Desacelerações', '', 0], ['ai', 'Alta intensidade (19,8–25,2 km/h)', 'm', 0], ['sprint', 'Sprint (≥25,2 km/h)', 'm', 0], ['vmax', 'Velocidade máxima do treino', 'km/h', 1]];
const RD_NOME = Object.fromEntries(RD_MET.map(m => [m[0], m[1]]));
const rdF = (v, d = 0) => v == null || isNaN(v) ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const rdPct = v => v == null ? '—' : Math.round(v) + '%';
const rdLista = L => L.length > 6 ? `${fmt(L[0].s.data)} a ${fmt(L[L.length - 1].s.data)}` : L.map(x => fmt(x.s.data)).join(', ');
const rdCurto = n => (String(n || '').match(/\(([^)]+)\)/) || [])[1] || String(n || '').split(' ')[0];

async function rdCarregar(aid, de, ate) {
  const tudo = async q => { const out = []; for (let i = 0; ; i += 1000) { const { data, error } = await q().range(i, i + 999); if (error) throw error; out.push(...data); if (data.length < 1000) return out; } };
  const ss = await tudo(() => sb.from('fisl_sessoes').select('id,data,tipo,md').gte('data', de).lte('data', ate).order('data'));
  const ids = ss.map(s => s.id), gps = [];
  for (let i = 0; i < ids.length; i += 100) gps.push(...await tudo(() => sb.from('fisl_gps').select('sessao_id,atleta_id,duracao_s,dist,mmin,ai,sprint,n_sprints,vmax,vmax_status,n_acel,n_desac,pl,plmin').eq('periodo', 0).not('atleta_id', 'is', null).in('sessao_id', ids.slice(i, i + 100)).order('id')));
  const at = await tudo(() => sb.from('comp_atividades').select('id,data,pts_v').lte('data', ate).order('id'));
  const cv = at.filter(x => (x.pts_v ?? 2) > 0), cres = [];
  for (let i = 0; i < cv.length; i += 150) cres.push(...await tudo(() => sb.from('comp_resultados').select('atividade_id,atleta_id,res').in('atividade_id', cv.slice(i, i + 150).map(x => x.id)).order('id')));
  const nut = await tudo(() => sb.from('nut_avaliacoes').select('atleta_id,data,peso,coxa,abdominal,triceps,panturrilha').lte('data', ate).order('data'));
  return { ss, gps, cv, cres, nut };
}

function rdAnalisar(aid, D) {
  const media = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  const S = D.ss.map(s => { const rs = D.gps.filter(g => g.sessao_id === s.id), me = rs.find(g => g.atleta_id === aid); if (!me || rs.length < 3) return null;
    const durM = media(rs.map(r => +r.duracao_s || 0)), o = { s, n: rs.length, parcial: durM && (+me.duracao_s || 0) < durM * 0.7, m: {} };
    RD_MET.forEach(([k]) => { const v = +me[k] || 0, gm = media(rs.map(r => +r[k] || 0)); o.m[k] = { v, gm, pct: gm ? v / gm * 100 : null, rank: rs.filter(r => (+r[k] || 0) > v).length + 1 }; });
    return o; }).filter(Boolean);
  if (!S.length) return { S };
  const soma = (L, k, q) => L.reduce((t, x) => t + x.m[k][q], 0), pctL = (L, k) => { const g = soma(L, k, 'gm'); return g ? soma(L, k, 'v') / g * 100 : null; };
  const h = S.length >= 4 ? Math.floor(S.length / 2) : 0, ini = h ? S.slice(0, h) : [], fim = h ? S.slice(h) : [];
  const T = RD_MET.map(([k]) => ({ k, tot: pctL(S, k), ini: h ? pctL(ini, k) : null, fim: h ? pctL(fim, k) : null, acima: S.filter(x => x.m[k].v > 0 && x.m[k].v >= x.m[k].gm).length }));
  // velocidade máxima: pico do atleta × média dos picos do grupo no período
  const pico = {}; D.gps.filter(g => S.some(x => x.s.id === g.sessao_id) && g.vmax_status !== 'falso').forEach(g => { pico[g.atleta_id] = Math.max(pico[g.atleta_id] || 0, +g.vmax || 0); });
  const picos = Object.values(pico).filter(v => v > 0), vm = pico[aid] || null, vmG = media(picos), vmRank = vm ? picos.filter(v => v > vm).length + 1 : null;
  const vmS = S.find(x => x.m.vmax.v === vm);
  // destaques por regras
  const dest = [];
  const ac = T.filter(t => t.k !== 'vmax' && t.acima >= Math.max(3, Math.ceil(S.length * 0.6))).sort((a, b) => b.acima - a.acima || b.tot - a.tot)[0];
  if (ac) dest.push({ k: ac.k, v: `${ac.acima} de ${S.length} treinos`, t: `com ${RD_NOME[ac.k].toLowerCase()} <b>acima da média do grupo</b>${ac.tot > 100 ? ` – no período, ${Math.round(ac.tot - 100)}% acima` : ''}.`, ok: 1 });
  const ev = h ? T.filter(t => t.fim >= 90 && t.ini != null && t.fim - t.ini >= 10 && (!ac || t.k !== ac.k)).sort((a, b) => (b.fim - b.ini) - (a.fim - a.ini))[0] : null;
  if (ev) dest.push({ k: ev.k, v: `${rdPct(ev.ini)} → ${rdPct(ev.fim)}`, t: `${RD_NOME[ev.k].toLowerCase()} em relação à média do grupo: dos primeiros treinos do período para os últimos.`, ok: 1 });
  let best = null; S.forEach(x => ['dist', 'mmin', 'pl', 'ai', 'sprint', 'n_acel'].forEach(k => { const m = x.m[k]; if (m.v > 0 && m.rank <= 3 && (!best || m.rank < best.r)) best = { r: m.rank, k, x }; }));
  if (best) dest.push({ k: best.k, v: `${best.r}º do grupo`, t: `em ${RD_NOME[best.k].toLowerCase()} no treino de ${fmt(best.x.s.data)}, entre ${best.x.n} atletas.` });
  if (vm) dest.push({ k: 'vmax', v: `${rdF(vm, 1)} km/h`, t: `velocidade máxima no período${vmS ? ` (${fmt(vmS.s.data)})` : ''}. ${vmRank <= 5 ? `Entre os ${vmRank <= 3 ? 3 : 5} mais rápidos do grupo.` : vm >= vmG * 0.97 ? `A média do pico do grupo é ${rdF(vmG, 1)} km/h: está no nível do elenco.` : `A média do pico do grupo é ${rdF(vmG, 1)} km/h.`}` });
  T.filter(t => t.k !== 'vmax' && !dest.some(d => d.k === t.k)).sort((a, b) => b.tot - a.tot).forEach(t => { if (dest.length < 4 && t.tot >= 95) dest.push({ k: t.k, v: rdPct(t.tot), t: `${RD_NOME[t.k].toLowerCase()} em relação à média do grupo no período.` }); });
  const prox = T.filter(t => (h ? t.fim : t.tot) < 85);
  // competição (geral) e composição corporal
  const cm = {}; D.cres.forEach(r => { const a = D.cv.find(x => x.id === r.atividade_id), v = a.pts_v ?? 2, o = cm[r.atleta_id] = cm[r.atleta_id] || { V: 0, E: 0, D: 0, P: 0, Pm: 0 }; o[r.res]++; o.P += r.res === 'V' ? v : r.res === 'E' ? 1 : 0; o.Pm += v; });
  const CL = Object.entries(cm).sort((x, y) => y[1].P - x[1].P || y[1].V - x[1].V || x[1].D - y[1].D || (y[1].P / y[1].Pm) - (x[1].P / x[1].Pm)), cpos = CL.findIndex(x => +x[0] === aid) + 1;
  const comp = cpos ? { pos: cpos, n: CL.length, ...cm[aid], apr: Math.round(cm[aid].P / cm[aid].Pm * 100), aprG: Math.round(media(CL.map(x => x[1].P / x[1].Pm)) * 100) } : null;
  const ult = {}; D.nut.forEach(r => { ult[r.atleta_id] = r; });
  const gord = r => 5.174 + 0.124 * r.coxa + 0.147 * r.abdominal + 0.196 * r.triceps + 0.13 * r.panturrilha;
  const NG = Object.values(ult).map(r => ({ a: r.atleta_id, g: gord(r), d: r.data })), meN = NG.find(x => x.a === aid);
  const nut = meN ? { g: meN.g, d: meN.d, rank: NG.filter(x => x.g < meN.g).length + 1, n: NG.length, gm: media(NG.map(x => x.g)) } : null;
  return { S, h, T, dest: dest.slice(0, 4), prox, vm, vmG, comp, nut, parciais: S.filter(x => x.parcial) };
}

function rdModelo(a, R) {
  const nm = rdCurto(a.nome), d = R.dest || [];
  if (!R.S?.length) return `${nm}, siga firme no processo.`;
  const partes = [];
  const ac = R.T.find(t => t.k === 'plmin' && t.tot >= 100) || R.T.find(t => t.tot >= 100 && t.k !== 'vmax');
  if (ac) partes.push(`você está acima da média do grupo em ${RD_NOME[ac.k].toLowerCase()}`);
  const ev = R.h ? R.T.filter(t => t.fim - t.ini >= 10).sort((x, y) => (y.fim - y.ini) - (x.fim - x.ini))[0] : null;
  if (ev) partes.push(`em ${RD_NOME[ev.k].toLowerCase()} você saiu de ${rdPct(ev.ini)} para ${rdPct(ev.fim)} da média`);
  return `${nm}, os números deste período mostram a sua evolução${partes.length ? ': ' + partes.join(' e ') : ''}. Continue no processo: o caminho está certo.`;
}

function rdGrafico(R) {
  const S = R.S, W = 700, H = 240, L = 40, Rt = 20, T = 20, B = 40, ymax = Math.max(140, ...S.flatMap(x => ['dist', 'pl', 'ai'].map(k => Math.min(200, x.m[k].pct || 0))));
  const x = i => S.length > 1 ? L + i * (W - L - Rt) / (S.length - 1) : (L + W - Rt) / 2, y = v => T + (H - T - B) * (1 - Math.min(v, ymax) / ymax);
  const C = { dist: '#13295b', pl: '#e0a526', ai: '#0e9384' };
  let s = `<svg viewBox="0 0 ${W} ${H}" width="100%">`;
  [0, 50, 100, Math.round(ymax / 10) * 10].forEach(g => { s += `<line x1="${L}" x2="${W - Rt}" y1="${y(g)}" y2="${y(g)}" stroke="${g === 100 ? '#d64545' : '#e6ebef'}" stroke-width="${g === 100 ? 2 : 1}"${g === 100 ? ' stroke-dasharray="6 4"' : ''}/><text x="${L - 6}" y="${y(g) + 4}" font-size="10" text-anchor="end" fill="#7a8794">${g}%</text>`; });
  s += `<text x="${L + 6}" y="${y(100) - 5}" font-size="10" fill="#d64545" font-weight="700">média do grupo = 100%</text>`;
  if (R.h) { const xm = (x(R.h - 1) + x(R.h)) / 2; s += `<rect x="${xm}" y="${T}" width="${W - Rt - xm}" height="${H - T - B}" fill="#e0a526" opacity=".07"/><text x="${xm + 6}" y="${T + 12}" font-size="10" fill="#8a6200" font-weight="700">últimos ${S.length - R.h} treinos</text>`; }
  const passo = Math.ceil(S.length / 12);
  S.forEach((p, i) => { if (i !== S.length - 1 && (i % passo || S.length - 1 - i < passo / 2 + 0.5 && passo > 1)) return; s += `<text x="${x(i)}" y="${H - B + 16}" font-size="10" text-anchor="middle" fill="#4a5866">${fmt(p.s.data)}${p.parcial ? '*' : ''}</text>`; });
  ['ai', 'pl', 'dist'].forEach(k => { s += `<polyline points="${S.map((p, i) => `${x(i)},${y(p.m[k].pct || 0)}`).join(' ')}" fill="none" stroke="${C[k]}" stroke-width="2.5"/>` + S.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.m[k].pct || 0)}" r="3.5" fill="${C[k]}"/>`).join(''); });
  return s + '</svg>' + `<div class="rd-leg">${[['dist', 'Distância total'], ['pl', 'Player Load'], ['ai', 'Alta intensidade']].map(([k, l]) => `<span><i style="background:${C[k]}"></i>${l}</span>`).join('')}</div>`;
}

function rdHTML(a, R, op) {
  const per = `${dataBR(op.de)} a ${dataBR(op.ate)}`, cab = (t, sub) => `<div class="rd-cab"><img src="${LOGO}" alt=""><div><small>QFC | DEPARTAMENTO DE SAÚDE E PERFORMANCE</small><h1>${t}</h1></div><div class="rd-dt"><b>${sub}</b>${R.S.length} treino${R.S.length === 1 ? '' : 's'} monitorado${R.S.length === 1 ? '' : 's'} (GPS)</div></div>`;
  const rod = `<div class="rd-rod"><span>CINQ · Centro de Inteligência do QFC</span><span>Relatório gerado em ${dataBR(hoje())}</span></div>`;
  const ft = a.foto_url ? `<span class="rd-ft"><img src="${esc(a.foto_url)}" alt="" style="object-position:${fotoQ(a).x}% ${fotoQ(a).y}%"></span>` : `<span class="rd-ft rd-ini">${esc(iniciais(a.nome))}</span>`;
  const bar = v => { const n = v ?? 0, c = n >= 100 ? '#2e9e5b' : n >= 80 ? '#e0a526' : '#9aa7b3'; return `<div class="rd-bw"><i style="width:${Math.min(n, 140) / 140 * 100}%;background:${c}"></i><em style="left:${100 / 140 * 100}%"></em></div>`; };
  const tab = `<table class="rd-tb"><thead><tr><th>Métrica</th><th class="c">${R.S.length} treinos</th>${R.h ? `<th class="c">Primeiros ${R.h}</th><th class="c">Últimos ${R.S.length - R.h}</th>` : ''}<th>${R.h ? 'Últimos treinos' : 'Período'} (linha vermelha = média do grupo)</th></tr></thead><tbody>
    ${R.T.map(t => `<tr><td>${RD_NOME[t.k]}</td><td class="c"><b>${rdPct(t.tot)}</b></td>${R.h ? `<td class="c">${rdPct(t.ini)}</td><td class="c"><b class="${t.fim > t.ini ? 'rd-up' : ''}">${rdPct(t.fim)}</b></td>` : ''}<td>${bar(R.h ? t.fim : t.tot)}</td></tr>`).join('')}</tbody></table>`;
  const notaP = R.parciais.length ? ` Treinos com * : o atleta fez menos de 70% do tempo do grupo (${R.parciais.map(x => fmt(x.s.data)).join(', ')}).` : '';
  const p1 = `<section class="rd-pg">${cab('RELATÓRIO DE DESEMPENHO DO ATLETA', per)}<div class="rd-in">
    <div class="rd-at">${ft}<div><h2>${esc(a.nome)}</h2><p>${esc(a.posicao || '')}${a.numero ? ' · nº ' + esc(a.numero) : ''} · comparação com a média do grupo nos mesmos treinos</p></div></div>
    ${op.sec.dest && R.dest.length ? `<h3>Destaques</h3><div class="rd-ks">${R.dest.map(d => `<div class="rd-k${d.ok ? ' ok' : ''}"><b>${d.v}</b><span>${d.t}</span></div>`).join('')}</div>` : ''}
    ${op.sec.tab ? `<h3>Você × média do grupo</h3>${tab}<p class="rd-nota">Valores em % da média do grupo no mesmo treino (100% = igual à média).${R.h ? ` Primeiros ${R.h} treinos: ${rdLista(R.S.slice(0, R.h))}. Últimos ${R.S.length - R.h}: ${rdLista(R.S.slice(R.h))}.` : ''}${notaP}</p>` : ''}
    </div>${rod}</section>`;
  const blocos = [op.sec.comp && R.comp ? `<div class="rd-box"><h4>Competição de treinos (geral)</h4><div class="rd-big">${R.comp.pos}º de ${R.comp.n}</div><p><b>${R.comp.V} vitória${R.comp.V === 1 ? '' : 's'}</b>${R.comp.E ? `, ${R.comp.E} empate${R.comp.E === 1 ? '' : 's'}` : ''} e ${R.comp.D} derrota${R.comp.D === 1 ? '' : 's'} em ${R.comp.V + R.comp.E + R.comp.D} atividades.</p><p>Aproveitamento de <b>${R.comp.apr}%</b> – a média do grupo é ${R.comp.aprG}%.</p></div>` : '',
    op.sec.nut && R.nut ? `<div class="rd-box"><h4>Composição corporal (Nutrição, ${fmt(R.nut.d)})</h4><div class="rd-big">${rdF(R.nut.g, 1)}% de gordura</div><p>${R.nut.rank <= Math.ceil(R.nut.n / 2) ? `<b>${R.nut.rank}º menor</b> percentual` : `${R.nut.rank}º de ${R.nut.n}`} de gordura entre ${R.nut.n} atletas avaliados.</p><p>Média do elenco: ${rdF(R.nut.gm, 1)}%.</p></div>` : ''].filter(Boolean);
  const prox = R.prox.length ? `As métricas que ainda estão abaixo de 85% da média do grupo: ${R.prox.map(t => `${RD_NOME[t.k].toLowerCase()} (${R.h ? `${rdPct(t.ini)} → ${rdPct(t.fim)}${t.fim > t.ini + 5 ? ', subindo' : t.fim < t.ini - 5 ? ', caindo' : ', estável'}` : rdPct(t.tot)})`).join('; ')}.` : 'Todas as métricas estão perto ou acima da média do grupo. O próximo passo é manter esse nível.';
  const p2 = `<section class="rd-pg">${cab('EVOLUÇÃO E OUTROS NÚMEROS', esc(a.nome))}<div class="rd-in">
    ${op.sec.evo && R.S.length > 1 ? `<h3>Evolução treino a treino (% da média do grupo)</h3>${rdGrafico(R)}<p class="rd-nota">Acima da linha vermelha = acima da média do grupo naquele treino.${R.parciais.length ? ' * treino com tempo reduzido para o atleta.' : ''}</p>` : ''}
    ${blocos.length ? `<h3>${op.sec.comp && R.comp && op.sec.nut && R.nut ? 'Competição de treinos e composição corporal' : op.sec.comp && R.comp ? 'Competição de treinos' : 'Composição corporal'}</h3><div class="rd-g2">${blocos.join('')}</div>` : ''}
    ${op.sec.prox ? `<h3>Próximo passo</h3><p class="rd-p">${prox}</p>` : ''}
    ${op.msg ? `<div class="rd-msg">${esc(op.msg).replace(/\n/g, '<br>')}</div>` : ''}
    </div>${rod}</section>`;
  return p1 + p2;
}

async function rdAbrir(a) {
  const ate0 = hoje(), de0 = addDays(ate0, -27);
  modal(`<h2>Relatório de desempenho · ${esc(a.nome)}</h2><p class="m">Compara o atleta com a média do grupo nos mesmos treinos (GPS), mostra a evolução, a Competição de treinos e a composição corporal. Destaques e “próximo passo” saem dos dados; a mensagem final você edita.</p>
    <div class="g2"><label class="f"><span>De</span><input type="date" class="in" id="rdde" value="${de0}"></label><label class="f"><span>Até</span><input type="date" class="in" id="rdate" value="${ate0}"></label></div>
    <div class="f"><span>Seções</span><div class="rd-secs">${[['dest', 'Destaques'], ['tab', 'Você × média do grupo'], ['evo', 'Evolução treino a treino'], ['comp', 'Competição de treinos'], ['nut', 'Composição corporal'], ['prox', 'Próximo passo']].map(([k, l]) => `<label class="chip on"><input type="checkbox" data-rds="${k}" checked> ${l}</label>`).join('')}</div></div>
    <div id="rdres" class="m">Calculando…</div>
    <label class="f"><span>Mensagem final <small class="m">(modelo – edite à vontade ou apague)</small></span><textarea class="in" id="rdmsg" rows="4"></textarea></label>
    <div class="mfoot"><span></span><div class="row"><button class="btn" id="rdx">Fechar</button><button class="btn pri" id="rdpdf" disabled>Gerar PDF</button></div></div>`, true);
  let R = null, D = null, editou = false;
  $('#rdx').onclick = fechar;
  $('#rdmsg').oninput = () => { editou = true; };
  document.querySelectorAll('[data-rds]').forEach(i => i.onchange = () => i.parentElement.classList.toggle('on', i.checked));
  const calc = async () => {
    const de = $('#rdde').value, ate = $('#rdate').value; if (!de || !ate || de > ate) return;
    $('#rdpdf').disabled = true; $('#rdres').textContent = 'Calculando…';
    try { D = await rdCarregar(a.id, de, ate); R = rdAnalisar(a.id, D); } catch (e) { $('#rdres').textContent = erroAmigavel(e); return; }
    if (!R.S.length) { $('#rdres').innerHTML = '<b>Sem treinos com GPS do atleta neste período.</b> Escolha outras datas.'; return; }
    $('#rdres').innerHTML = `<b>${R.S.length} treino(s)</b> com GPS no período${R.parciais.length ? ` · ${R.parciais.length} com tempo reduzido` : ''}. Destaques: ${R.dest.map(d => `<b>${d.v}</b>`).join(' · ') || '—'}`;
    if (!editou) $('#rdmsg').value = rdModelo(a, R);
    $('#rdpdf').disabled = false;
  };
  $('#rdde').onchange = calc; $('#rdate').onchange = calc; calc();
  $('#rdpdf').onclick = async () => {
    const op = { de: $('#rdde').value, ate: $('#rdate').value, msg: $('#rdmsg').value.trim(), sec: Object.fromEntries([...document.querySelectorAll('[data-rds]')].map(i => [i.dataset.rds, i.checked])) };
    const html = rdHTML(a, R, op); fechar();
    document.querySelectorAll('#print-area').forEach(x => x.remove());
    const w = document.createElement('div'); w.id = 'print-area'; w.className = 'rdp'; w.innerHTML = html;
    const st = document.createElement('style'); st.textContent = '@page{size:A4 portrait;margin:0}'; document.head.appendChild(st);
    document.body.appendChild(w); document.body.classList.add('imprimindo');
    await Promise.all([...w.querySelectorAll('img')].map(i => i.decode ? i.decode().catch(() => {}) : null));
    const t = document.title; document.title = `Relatorio_desempenho_${a.nome}_${op.de}_${op.ate}`;
    setTimeout(() => { window.print(); setTimeout(() => { w.remove(); st.remove(); document.body.classList.remove('imprimindo'); document.title = t; }, 500); }, 150);
  };
}

/* ---------- encaixe no Técnico individual: botão na pasta do atleta ---------- */
const _topoIndRd = topoInd;
topoInd = function (a) {
  const h = _topoIndRd(a);
  return a ? h.replace('<button class="btn" id="itrocar">', '<button class="btn" id="irdes">📈 Relatório de desempenho</button><button class="btn" id="itrocar">') : h;
};
const _renderPastaRd = renderPasta;
renderPasta = function (a) { _renderPastaRd(a); if ($('#irdes')) $('#irdes').onclick = () => rdAbrir(a); };
