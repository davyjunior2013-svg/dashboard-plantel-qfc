/* CINQ – Pós-jogo: lances do jogo marcados no campo e o relatório que sai sozinho.
   Lances: recuperação (roubada = com confronto direto; subcategoria da recuperação; bem-sucedida = manteve a posse),
   perda de posse, finalização (nossa e do adversário; gol, no alvo, fora, bloqueada; área/fora da área; assistência e corredor),
   bola parada (escanteio/falta, a favor/contra) e faltas com cartão. Defesa/ataque = campo onde aconteceu (nosso campo = defesa).
   Coordenadas x,y em % do campo com a nossa equipe atacando para a direita (x=100); na tela cada tempo aparece no sentido real.
   Escrita: Análise de desempenho e admin. Leitura: comissão. */
const podePJ = () => isAdmin() || S.perfil?.funcao === 'analise';
S.pj = { jogos: null, lances: {}, jogo: null, aba: 'lancar', tempo: 1, ver: 0, relogio: '', vis: 'jogos', pend: null };
const PJ_TIPOS = {
  recuperacao: { l: 'Recuperação', eq: 'QFC', cor: '#e57373' },
  roubada: { l: 'Roubada', eq: 'QFC', cor: '#b71c1c', base: 'recuperacao' },
  perda: { l: 'Perda de posse', eq: 'QFC', cor: '#ef6c00' },
  finalizacao: { l: 'Finalização', eq: 'QFC', cor: '#0f7a3d' },
  fin_adv: { l: 'Finalização adversário', eq: 'ADV', cor: '#13295b', base: 'finalizacao' },
  bola_parada: { l: 'Bola parada', eq: null, cor: '#7b3fa0' },
  falta: { l: 'Falta / cartão', eq: null, cor: '#5d6b78' }
};
const PJ_RES = ['Gol', 'No alvo', 'Fora', 'Bloqueada'];
const PJ_COR = ['Esquerdo', 'Central', 'Direito'];
const PJ_FAIXAS = [[1, 0, 15, "0–15'"], [1, 15, 30, "15–30'"], [1, 30, 999, "30–45+'"], [2, 45, 60, "45–60'"], [2, 60, 75, "60–75'"], [2, 75, 999, "75–90+'"]];
const pjMin = s => s == null ? '' : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const pjLerMin = (txt, tempo) => { const t = String(txt || '').trim().replace(/[´'’]/g, ':').replace(/\s/g, ''); if (!t) return null;
  const p = t.split(':').map(Number); if (p.some(isNaN)) return null; let s = p.length === 1 ? p[0] * 60 : p.length === 2 ? p[0] * 60 + p[1] : p[0] * 3600 + p[1] * 60 + p[2];
  if (tempo === 2 && s < 45 * 60) s += 45 * 60; return s; };
const pjAtl = id => S.atletas.find(a => a.id === id);
const pjNome = l => l.atleta_id ? (pjAtl(l.atleta_id)?.nome || '?') : (l.nome || (l.equipe === 'ADV' ? 'Adversário' : '—'));
const pjNum = l => l.num || (l.atleta_id ? (pjAtl(l.atleta_id)?.numero ?? '') : '') || '';
const pjCampo = l => l.x != null ? (+l.x < 50 ? 'defesa' : 'ataque') : (l.dados?.campo || null);
const pjArea = (x, y, eq) => eq === 'ADV' ? x <= 15.7 && y >= 20.4 && y <= 79.6 : x >= 84.3 && y >= 20.4 && y <= 79.6;
const pjEhRec = l => l.tipo === 'recuperacao', pjRoub = l => pjEhRec(l) && l.dados?.roubada;
const pjEquipe = j => j?.equipe || 'QFC';
// sentido real em cada tempo: 'dir' = atacamos para a direita
const pjSentido = (j, tempo) => (tempo === 1) === (j.ataque_1t !== 'esq') ? 'dir' : 'esq';
const pjTela = (j, tempo, x, y) => pjSentido(j, tempo) === 'dir' ? [x, y] : [100 - x, 100 - y];

async function pjCarregarJogos() {
  const { data, error } = await sb.from('pj_jogos').select('*').order('data', { ascending: false, nullsFirst: false }).order('id', { ascending: false });
  if (error) throw error; S.pj.jogos = data;
}
async function pjCarregarLances(ids) {
  const falta = ids.filter(id => !S.pj.lances[id]); if (!falta.length) return;
  const { data, error } = await sb.from('pj_lances').select('*').in('jogo_id', falta).order('seg', { ascending: true, nullsFirst: true }).order('id');
  if (error) throw error; falta.forEach(id => { S.pj.lances[id] = []; }); data.forEach(l => S.pj.lances[l.jogo_id].push(l));
}
const pjOrdena = L => L.sort((a, b) => a.tempo - b.tempo || (a.seg ?? -1) - (b.seg ?? -1) || a.id - b.id);

/* ---------- estatísticas ---------- */
function pjStats(L) {
  const nos = L.filter(l => l.equipe === 'QFC'), adv = L.filter(l => l.equipe === 'ADV');
  const rec = nos.filter(pjEhRec), roub = rec.filter(l => l.dados?.roubada), recInf = rec.filter(l => l.dados?.sucesso != null), recOk = recInf.filter(l => l.dados.sucesso);
  const perdas = nos.filter(l => l.tipo === 'perda');
  const fin = e => L.filter(l => l.tipo === 'finalizacao' && l.equipe === e), fN = fin('QFC'), fA = fin('ADV');
  const alvo = F => F.filter(l => ['Gol', 'No alvo'].includes(l.dados?.resultado)).length, gols = F => F.filter(l => l.dados?.resultado === 'Gol').length;
  const area = F => F.filter(l => (l.dados?.regiao || (l.x != null && (pjArea(+l.x, +l.y, l.equipe) ? 'Área' : 'Fora da área'))) === 'Área').length;
  const bp = (e, s) => L.filter(l => l.tipo === 'bola_parada' && l.equipe === e && (l.dados?.subtipo || 'Escanteio') === s).length;
  const faltas = e => L.filter(l => l.tipo === 'falta' && l.equipe === e), cart = (e, c) => faltas(e).filter(l => l.dados?.cartao === c).length;
  const cor = {}; fN.filter(l => l.dados?.corredor).forEach(l => { cor[l.dados.corredor] = (cor[l.dados.corredor] || 0) + 1; });
  const faixa = F => PJ_FAIXAS.map(([t, a, b]) => F.filter(l => l.tempo === t && l.seg != null && l.seg / 60 >= a && l.seg / 60 < b).length);
  const semMin = F => F.filter(l => l.seg == null).length;
  // jogadores (nossa equipe)
  const J = {}; const chave = l => l.atleta_id ? 'a' + l.atleta_id : l.nome ? 'n' + l.nome.toLowerCase() : null;
  const pj = (k, l) => J[k] || (J[k] = { k, nome: pjNome(l), num: pjNum(l), rec: 0, roub: 0, ok: 0, inf: 0, perda: 0, fin: 0, alvo: 0, gol: 0, ass: 0, falta: 0, am: 0, vm: 0 });
  nos.forEach(l => { const k = chave(l); if (!k) return; const p = pj(k, l);
    if (pjEhRec(l)) { p.rec++; if (l.dados?.roubada) p.roub++; if (l.dados?.sucesso != null) { p.inf++; if (l.dados.sucesso) p.ok++; } }
    if (l.tipo === 'perda') p.perda++;
    if (l.tipo === 'finalizacao') { p.fin++; if (['Gol', 'No alvo'].includes(l.dados?.resultado)) p.alvo++; if (l.dados?.resultado === 'Gol') p.gol++; }
    if (l.tipo === 'falta') { p.falta++; if (l.dados?.cartao === 'Amarelo') p.am++; if (l.dados?.cartao === 'Vermelho') p.vm++; } });
  fN.forEach(l => { const a = l.dados?.assist_id ? { atleta_id: l.dados.assist_id } : l.dados?.assist_nome ? { nome: l.dados.assist_nome } : null; if (!a) return;
    const k = chave(a); pj(k, { ...a, equipe: 'QFC' }).ass++; });
  const jog = Object.values(J).sort((a, b) => (b.fin + b.ass + b.rec) - (a.fin + a.ass + a.rec) || a.nome.localeCompare(b.nome, 'pt'));
  return { rec, roub, recInf, recOk, perdas, fN, fA, alvoN: alvo(fN), alvoA: alvo(fA), golsN: gols(fN), golsA: gols(fA), areaN: area(fN), areaA: area(fA),
    escN: bp('QFC', 'Escanteio'), escA: bp('ADV', 'Escanteio'), fbN: bp('QFC', 'Falta'), fbA: bp('ADV', 'Falta'),
    faltaN: faltas('QFC').length, faltaA: faltas('ADV').length, amN: cart('QFC', 'Amarelo'), amA: cart('ADV', 'Amarelo'), vmN: cart('QFC', 'Vermelho'), vmA: cart('ADV', 'Vermelho'),
    cor, jog, recDef: rec.filter(l => pjCampo(l) === 'defesa').length, recAtq: rec.filter(l => pjCampo(l) === 'ataque').length,
    perdaDef: perdas.filter(l => pjCampo(l) === 'defesa').length, perdaAtq: perdas.filter(l => pjCampo(l) === 'ataque').length,
    fx: { finN: faixa(fN), finA: faixa(fA), rec: faixa(rec), perda: faixa(perdas) }, semMin: semMin(L) };
}
const pjPct = (a, b) => b ? Math.round(a / b * 100) + '%' : '—';

/* ---------- campo ---------- */
/* ---------- campo (sempre com a nossa equipe atacando para a direita) ---------- */
const pjModo = l => l.tipo === 'finalizacao' ? (l.equipe === 'ADV' ? 'fin_adv' : 'finalizacao') : pjEhRec(l) ? (l.dados?.roubada ? 'roubada' : 'recuperacao') : l.tipo;
const PJ_LINHAS = `<g fill="none" stroke="#1d2a34" stroke-width=".4"><rect x="0" y="0" width="105" height="68"/><line x1="52.5" y1="0" x2="52.5" y2="68"/><circle cx="52.5" cy="34" r="9.15"/>
    <rect x="0" y="13.84" width="16.5" height="40.32"/><rect x="88.5" y="13.84" width="16.5" height="40.32"/><rect x="0" y="24.84" width="5.5" height="18.32"/><rect x="99.5" y="24.84" width="5.5" height="18.32"/>
    <path d="M16.5 26.7 A9.15 9.15 0 0 1 16.5 41.3"/><path d="M88.5 26.7 A9.15 9.15 0 0 0 88.5 41.3"/><rect x="-1.6" y="30.34" width="1.6" height="7.32"/><rect x="105" y="30.34" width="1.6" height="7.32"/></g>
    <g fill="#1d2a34"><circle cx="52.5" cy="34" r=".5"/><circle cx="11" cy="34" r=".4"/><circle cx="94" cy="34" r=".4"/></g>
    <g stroke="#9aa6b0" stroke-width=".22" stroke-dasharray="1 1"><line x1="35" y1="0" x2="35" y2="68"/><line x1="70" y1="0" x2="70" y2="68"/><line x1="0" y1="22.67" x2="105" y2="22.67"/><line x1="0" y1="45.33" x2="105" y2="45.33"/></g>`;
function pjDotSVG(l, sel) {
  const cx = +l.x * 1.05, cy = +l.y * .68, c = PJ_TIPOS[pjModo(l)]?.cor || '#555';
  const oco = l.tipo === 'finalizacao' && ['Fora', 'Bloqueada'].includes(l.dados?.resultado);
  const falhou = l.dados?.sucesso === false, gol = l.tipo === 'finalizacao' && l.dados?.resultado === 'Gol';
  const card = l.tipo === 'falta' && l.dados?.cartao ? `<rect x="${cx + 1.6}" y="${cy - 3.2}" width="1.6" height="2.2" rx=".25" fill="${l.dados.cartao === 'Vermelho' ? '#d32f2f' : '#f9c80e'}" stroke="#333" stroke-width=".12"/>` : '';
  const n = String(pjNum(l) || '').slice(0, 3), r = 2.3, t2 = l.tempo === 2;
  return `<g class="pj-dot${sel ? ' sel' : ''}" data-l="${l.id}"><title>${esc(`${l.tempo}ºT ${pjMin(l.seg)} · ${pjRotulo(l)} · ${pjNome(l)}`)}</title>
    ${gol ? `<circle cx="${cx}" cy="${cy}" r="${r + .9}" fill="none" stroke="#e0a526" stroke-width=".7"/>` : ''}
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="${oco ? '#fff' : c}" stroke="${t2 ? '#1d2a34' : c}" stroke-width="${oco ? .6 : t2 ? .45 : .3}"${falhou ? ' stroke-dasharray=".7 .5" opacity=".7"' : ''}/>
    ${n ? `<text x="${cx}" y="${cy + .78}" text-anchor="middle" font-size="${n.length > 2 ? 1.6 : 2.1}" font-weight="800" fill="${oco ? c : '#fff'}">${esc(n)}</text>` : ''}${card}</g>`;
}
function pjCampoSVG(L, opt = {}) {
  return `<div class="pj-campo${opt.m ? ' clic' : ''}"${opt.m ? ` data-m="${opt.m}"` : ''}><div class="pj-ct"><b>${esc(opt.tit || '')} <b class="pj-n">${L.length}</b></b><span class="pj-seta">${opt.sem ? `<small class="m">${opt.sem} sem local · </small>` : ''}ataque →</span></div>
    <svg viewBox="-2 -1 109 70" preserveAspectRatio="xMidYMid meet"><rect x="-2" y="-1" width="109" height="70" fill="#f3f7f4"/>${PJ_LINHAS}
${L.filter(l => l.x != null).map(l => pjDotSVG(l, opt.sel === l.id)).join('')}</svg></div>`;
}
/* ---------- gráfico circular ---------- */
function pjDonut(parts, tit, centro, opt = {}) {
  const tot = parts.reduce((s, p) => s + p[1], 0), R = 15.9155, sz = opt.sz || 120;
  let acc = 0;
  const arcos = tot ? parts.filter(p => p[1]).map(([l, v, c]) => { const pct = v / tot * 100, el = `<circle r="${R}" cx="21" cy="21" fill="none" stroke="${c}" stroke-width="7" stroke-dasharray="${pct} ${100 - pct}" stroke-dashoffset="${25 - acc}"/>`; acc += pct; return el; }).join('')
    : `<circle r="${R}" cx="21" cy="21" fill="none" stroke="#e8edf1" stroke-width="7"/>`;
  return `<div class="pj-dn"><svg viewBox="0 0 42 42" width="${sz}" height="${sz}">${arcos}<text x="21" y="21" text-anchor="middle" font-size="8" font-weight="800" fill="#15202b">${centro ?? tot}</text>${tit ? `<text x="21" y="27" text-anchor="middle" font-size="3.2" fill="#74808a">${esc(opt.sub || '')}</text>` : ''}</svg>
    <div class="pj-dn-l">${tit ? `<b>${esc(tit)}</b>` : ''}${parts.map(([l, v, c]) => `<span><i style="background:${c}"></i>${esc(l)} <b>${v}</b> <small>${tot ? Math.round(v / tot * 100) + '%' : ''}</small></span>`).join('')}</div></div>`;
}
const PJ_C = { alvo: '#0f7a3d', fora: '#b8c2ca', area: '#13295b', foraA: '#e0a526', def: '#13295b', atq: '#e0a526', roub: '#c62828', rec: '#f19a9a', ok: '#0f7a3d', nok: '#c62828', ni: '#d5dbe0' };

function pjRotulo(l) {
  const d = l.dados || {};
  if (pjEhRec(l)) return `${d.roubada ? 'Roubada' : 'Recuperação'}${d.sucesso === true ? ' ✓' : d.sucesso === false ? ' ✕' : ''}`;
  if (l.tipo === 'perda') return 'Perda de posse';
  if (l.tipo === 'finalizacao') return `Finalização${l.equipe === 'ADV' ? ' adv.' : ''}${d.resultado ? ' · ' + d.resultado : ''}${d.regiao ? ' · ' + d.regiao : ''}`;
  if (l.tipo === 'bola_parada') return `${d.subtipo || 'Escanteio'} ${l.equipe === 'QFC' ? 'a favor' : 'contra'}`;
  if (l.tipo === 'falta') return `Falta ${l.equipe === 'QFC' ? 'cometida' : 'sofrida'}${d.cartao ? ' · ' + d.cartao : ''}`;
  return l.tipo;
}
function pjDetalhe(l) {
  const d = l.dados || {}, a = d.assist_id ? pjAtl(d.assist_id)?.nome : d.assist_nome;
  return [l.tipo === 'finalizacao' && a ? `assist. ${a}${d.corredor ? ' (' + d.corredor + ')' : ''}` : l.tipo === 'finalizacao' && d.corredor ? `corredor ${d.corredor}` : '',
    (pjEhRec(l) || l.tipo === 'perda') && pjCampo(l) ? (pjCampo(l) === 'defesa' ? 'defesa' : 'ataque') : '', l.tipo === 'bola_parada' && d.gerou ? 'gerou ' + d.gerou.toLowerCase() : '', d.obs || ''].filter(Boolean).join(' · ');
}

/* ---------- lista de jogos e temporada ---------- */
/* ---------- lista de jogos e médio-longo prazo ---------- */
async function pPosJogo() {
  if (S.pj.jogo) return pjJogo(S.pj.jogo);
  const pode = podePJ(), cab = () => topo('Análise de jogo', 'Pós-jogo', 'Lances marcados no campo. O relatório pós-jogo sai sozinho; o médio-longo prazo soma os jogos.', pode ? '<button class="btn pri" id="pjnovo">+ Novo jogo</button>' : '');
  $('#main').innerHTML = cab() + '<div class="panel empty">Carregando…</div>';
  try { await pjCarregarJogos(); await pjCarregarLances(S.pj.jogos.map(j => j.id)); } catch (e) { $('#main .panel').innerHTML = esc(erroAmigavel(e)); return; }
  const J = S.pj.jogos, reais = J.filter(j => !j.teste);
  const lin = j => { const st = pjStats(S.pj.lances[j.id] || []);
    return `<tr class="dm-tr" data-j="${j.id}"><td>${j.data ? dataBR(j.data) : '—'}${j.teste ? ' <span class="badge">demonstração</span>' : ''}</td><td><b>${esc(pjEquipe(j))} ${j.gols_nos ?? st.golsN} × ${j.gols_adv ?? st.golsA} ${esc(j.adversario)}</b><small class="m">${esc([j.competicao, j.rodada, j.mando].filter(Boolean).join(' · '))}</small></td>
      <td>${st.fN.length} <small class="m">(${pjPct(st.alvoN, st.fN.length)} no alvo)</small></td><td>${st.fA.length}</td><td>${st.rec.length} <small class="m">(${st.roub.length} roub.)</small></td><td>${st.perdas.length}</td><td>${(S.pj.lances[j.id] || []).length}</td></tr>`; };
  const abas = `<div class="ind-tabs pj-abas"><button data-v="jogos" class="${S.pj.vis === 'jogos' ? 'on' : ''}">Jogos</button><button data-v="longo" class="${S.pj.vis === 'longo' ? 'on' : ''}">Médio-longo prazo</button></div>`;
  const corpo = S.pj.vis === 'longo' ? pjLongoHTML(reais)
    : J.length ? `<div class="panel"><div class="tablewrap"><table class="tb fl-tab pj-tj"><thead><tr><th>Data</th><th>Jogo</th><th>Finalizações</th><th>Fin. adv.</th><th>Recuperações</th><th>Perdas</th><th>Lances</th></tr></thead><tbody>${J.map(lin).join('')}</tbody></table></div></div>`
    : `<div class="panel empty">Nenhum jogo ainda.${pode ? ' Use “+ Novo jogo”.' : ''}</div>`;
  $('#main').innerHTML = cab() + abas + corpo;
  document.querySelectorAll('.pj-abas [data-v]').forEach(b => b.onclick = () => { S.pj.vis = b.dataset.v; pPosJogo(); });
  document.querySelectorAll('[data-j]').forEach(tr => tr.onclick = () => { S.pj.jogo = +tr.dataset.j; S.pj.aba = podePJ() ? 'lancar' : 'relatorio'; pjJogo(S.pj.jogo); });
  if ($('#pjnovo')) $('#pjnovo').onclick = () => pjFormJogo(null);
}
// médio-longo prazo: todos os dados somados (sem o jogo de demonstração)
function pjLongoHTML(J) {
  if (!J.length) return '<div class="panel empty">Nenhum jogo lançado ainda (o jogo de demonstração não entra aqui).</div>';
  const L = J.flatMap(j => S.pj.lances[j.id] || []), st = pjStats(L), n = J.length;
  const porJogo = `<div class="panel"><h2>Jogo a jogo</h2><div class="tablewrap"><table class="tb fl-tab"><thead><tr><th>Jogo</th><th>Fin.</th><th>No alvo</th><th>Área</th><th>Fin. adv.</th><th>Rec.</th><th>Roub.</th><th>Rec. ataque</th><th>Perdas</th><th>Faltas</th></tr></thead><tbody>
    ${J.map(j => { const s = pjStats(S.pj.lances[j.id] || []); return `<tr><td>${j.data ? fmt(j.data) + ' · ' : ''}<b>${esc(j.adversario)}</b></td><td>${s.fN.length}</td><td>${pjPct(s.alvoN, s.fN.length)}</td><td>${pjPct(s.areaN, s.fN.length)}</td><td>${s.fA.length}</td><td>${s.rec.length}</td><td>${s.roub.length}</td><td>${s.recAtq}</td><td>${s.perdas.length}</td><td>${s.faltaN}</td></tr>`; }).join('')}</tbody></table></div></div>`;
  return `<p class="m fl-nota">${n} jogo${n === 1 ? '' : 's'} somados. Todos os dados, para o acompanhamento ao longo da temporada.</p><div class="cards fs-kpis">${pjKpis(st, n)}</div>${porJogo}${pjFaixasHTML(st)}${pjBlocosHTML(st)}${pjJogadoresHTML(st, n)}`;
}

/* ---------- página do jogo ---------- */
const PJ_BLOCOS = [
  { id: 'fin', t: 'Finalizações', campos: [['finalizacao', 'Nossas finalizações'], ['fin_adv', 'Finalizações do adversário']] },
  { id: 'rec', t: 'Recuperações', campos: [['recuperacao', 'Recuperação (sem confronto)'], ['roubada', 'Roubada (com confronto)']] },
  { id: 'falta', t: 'Falta / cartão', campos: [['falta', 'Faltas e cartões']] },
  { id: 'bp', t: 'Bola parada', campos: [['bola_parada', 'Escanteios e faltas']] },
  { id: 'perda', t: 'Perda de posse', campos: [['perda', 'Perdas de posse']] }
];
async function pjJogo(id) {
  const pode = podePJ();
  try { if (!S.pj.jogos) await pjCarregarJogos(); await pjCarregarLances([id]); } catch (e) { $('#main').innerHTML = `<div class="panel">${esc(erroAmigavel(e))}</div>`; return; }
  const j = S.pj.jogos.find(x => x.id === id); if (!j) { S.pj.jogo = null; return pPosJogo(); }
  const L = pjOrdena(S.pj.lances[id]), st = pjStats(L), aba = pode ? S.pj.aba : (S.pj.aba === 'lancar' ? 'relatorio' : S.pj.aba);
  const tit = `${pjEquipe(j)} ${j.gols_nos ?? st.golsN} × ${j.gols_adv ?? st.golsA} ${j.adversario}`;
  const acoes = `<button class="btn" id="pjvolta">◀ Jogos</button><button class="btn" id="pjpdf">Baixar PDF</button>${pode ? '<button class="btn" id="pjedj">Dados do jogo</button>' : ''}`;
  const sub = [j.data ? dataBR(j.data) : '', j.competicao, j.rodada, j.mando, j.teste ? 'jogo de demonstração' : ''].filter(Boolean).join(' · ');
  const abas = `<div class="ind-tabs pj-abas">${pode ? `<button data-a="lancar" class="${aba === 'lancar' ? 'on' : ''}">Lançar</button>` : ''}<button data-a="relatorio" class="${aba === 'relatorio' ? 'on' : ''}">Relatório pós-jogo</button><button data-a="lances" class="${aba === 'lances' ? 'on' : ''}">Lances (${L.length})</button></div>`;
  const corpo = aba === 'lancar' ? pjLancarHTML(j, L) : aba === 'relatorio' ? `<div class="pj-rel">${pjRelatorioHTML(j, L)}</div>` : pjListaHTML(j, L, pode);
  $('#main').innerHTML = topo('Pós-jogo', tit, sub, acoes) + abas + corpo;
  $('#pjvolta').onclick = () => { S.pj.jogo = null; S.pj.pend = null; pPosJogo(); };
  $('#pjpdf').onclick = () => pjPDF(j);
  document.querySelectorAll('.pj-abas [data-a]').forEach(b => b.onclick = () => { S.pj.aba = b.dataset.a; S.pj.pend = null; pjJogo(id); });
  if (!pode) return;
  $('#pjedj').onclick = () => pjFormJogo(j);
  if (aba === 'lancar') pjLigarLancar(j, L);
  if (aba === 'lances') pjLigarLista(j, L);
}
const pjVisiveis = L => S.pj.ver === 1 || S.pj.ver === 2 ? L.filter(l => l.tempo === S.pj.ver) : L;
function pjLancarHTML(j, L) {
  const t = S.pj.tempo, V = pjVisiveis(L), pend = S.pj.pend;
  const bloco = b => { const n = L.filter(l => b.campos.some(([m]) => pjModo(l) === m)).length;
    return `<div class="panel pj-bl"><div class="pj-blh"><h2>${b.t} <small class="m">${n}</small></h2><button class="btn sm" data-graf="${b.id}">Gerar gráfico</button></div>
      <div class="pj-bl-c${b.campos.length === 1 ? ' um' : ''}">${b.campos.map(([m, tt]) => { const F = V.filter(l => pjModo(l) === m); return pjCampoSVG(F, { m, tit: tt, sem: F.filter(l => l.x == null).length }); }).join('')}</div></div>`; };
  return `<div class="panel pj-bar"><div class="gol-seg"><button data-t="1" class="${t === 1 ? 'on' : ''}">1º tempo</button><button data-t="2" class="${t === 2 ? 'on' : ''}">2º tempo</button></div>
      <label class="m">Minuto <input class="in pj-min" id="pjmin" value="${esc(S.pj.relogio)}" placeholder="opcional"></label>
      <span class="pj-ver m">Mostrar <span class="gol-seg"><button data-ver="0" class="${!S.pj.ver ? 'on' : ''}">Jogo</button><button data-ver="1" class="${S.pj.ver === 1 ? 'on' : ''}">1º T</button><button data-ver="2" class="${S.pj.ver === 2 ? 'on' : ''}">2º T</button></span></span>
      <span class="m pj-dica">${pend ? `<b>Clique no campo para marcar o lance de ${esc(pjRotulo(pend))}.</b> <button class="btn sm" id="pjpendx">Cancelar</button>` : 'Clique no campo do lance → escolha o jogador. Bolinha com contorno escuro = 2º tempo.'}</span></div>
    ${PJ_BLOCOS.filter(b => b.campos.length > 1).map(bloco).join('')}<div class="pj-bl3">${PJ_BLOCOS.filter(b => b.campos.length === 1).map(bloco).join('')}</div>`;
}
function pjLigarLancar(j, L) {
  document.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { S.pj.tempo = +b.dataset.t; S.pj.relogio = $('#pjmin').value; pjJogo(j.id); });
  document.querySelectorAll('[data-ver]').forEach(b => b.onclick = () => { S.pj.ver = +b.dataset.ver || 0; S.pj.relogio = $('#pjmin').value; pjJogo(j.id); });
  $('#pjmin').oninput = e => { S.pj.relogio = e.target.value; };
  if ($('#pjpendx')) $('#pjpendx').onclick = () => { S.pj.pend = null; pjJogo(j.id); };
  document.querySelectorAll('[data-graf]').forEach(b => b.onclick = () => pjGraficoBloco(j, L, b.dataset.graf));
  document.querySelectorAll('.pj-campo.clic').forEach(box => { const svg = box.querySelector('svg'), m = box.dataset.m;
    svg.onclick = async ev => {
      const dot = ev.target.closest('.pj-dot'); if (dot && !S.pj.pend) return pjFormLance(j, L.find(x => x.id === +dot.dataset.l));
      const p = svg.createSVGPoint(); p.x = ev.clientX; p.y = ev.clientY; const q = p.matrixTransform(svg.getScreenCTM().inverse());
      const x = +Math.max(0, Math.min(100, q.x / 1.05)).toFixed(1), y = +Math.max(0, Math.min(100, q.y / .68)).toFixed(1);
      if (S.pj.pend) { const l = S.pj.pend; if (pjModo(l) !== m) return toast(`Esse lance é de “${PJ_TIPOS[pjModo(l)].l}”: clique no campo dele.`, true);
        const d = { ...(l.dados || {}) }; if (l.tipo === 'finalizacao' && !d.regiao_manual) d.regiao = pjArea(x, y, l.equipe) ? 'Área' : 'Fora da área';
        const { error } = await sb.from('pj_lances').update({ x, y, dados: d }).eq('id', l.id); if (error) return toast(erroAmigavel(error), true);
        Object.assign(l, { x, y, dados: d }); S.pj.pend = null; toast('Local marcado.'); return pjJogo(j.id); }
      pjFormLance(j, null, { modo: m, x, y });
    }; });
}
/* gráfico de cada bloco (pizza) */
function pjGraficoBloco(j, L, b) {
  const V = pjVisiveis(L), st = pjStats(V), C = PJ_C, cont = (F, f) => F.filter(f).length;
  const per = S.pj.ver === 1 ? '1º tempo' : S.pj.ver === 2 ? '2º tempo' : 'jogo todo';
  const res = F => [['Gol', cont(F, l => l.dados?.resultado === 'Gol'), '#e0a526'], ['No alvo (defendida)', cont(F, l => l.dados?.resultado === 'No alvo'), C.alvo], ['Fora', cont(F, l => l.dados?.resultado === 'Fora'), C.fora], ['Bloqueada', cont(F, l => l.dados?.resultado === 'Bloqueada'), '#5d6b78']];
  const reg = F => { const a = cont(F, l => pjRegiao(l) === 'Área'); return [['Dentro da área', a, C.area], ['Fora da área', F.length - a, C.foraA]]; };
  const lado = F => [['Defesa', cont(F, l => pjCampo(l) === 'defesa'), C.def], ['Ataque', cont(F, l => pjCampo(l) === 'ataque'), C.atq]];
  let h = '';
  if (b === 'fin') h = `<div class="pj-gg"><h3>Nossas finalizações</h3>${pjDonut(res(st.fN), 'Resultado')}${pjDonut(reg(st.fN), 'Região')}<h3>Adversário</h3>${pjDonut(res(st.fA), 'Resultado')}${pjDonut(reg(st.fA), 'Região')}</div>`;
  if (b === 'rec') h = `<div class="pj-gg">${pjDonut([['Roubadas', st.roub.length, C.roub], ['Recuperações sem confronto', st.rec.length - st.roub.length, C.rec]], 'Tipo')}${pjDonut(lado(st.rec), 'Onde aconteceu')}
    ${pjDonut([['Manteve a posse', cont(st.rec, l => l.dados?.sucesso === true), C.ok], ['Perdeu em seguida', cont(st.rec, l => l.dados?.sucesso === false), C.nok], ['Não informado', cont(st.rec, l => l.dados?.sucesso == null), C.ni]], 'Bem-sucedida?')}</div>`;
  if (b === 'falta') { const F = V.filter(l => l.tipo === 'falta');
    h = `<div class="pj-gg">${pjDonut([['Cometidas por nós', st.faltaN, '#5d6b78'], ['Sofridas', st.faltaA, '#b8c2ca']], 'Faltas')}${pjDonut(lado(F.filter(l => l.equipe === 'QFC')), 'Nossas faltas: onde')}
      ${pjDonut([['🟨 nossos', st.amN, '#f9c80e'], ['🟥 nossos', st.vmN, '#d32f2f'], ['🟨 adversário', st.amA, '#f5e08a'], ['🟥 adversário', st.vmA, '#ef9a9a']], 'Cartões')}</div>`; }
  if (b === 'bp') { const F = V.filter(l => l.tipo === 'bola_parada');
    h = `<div class="pj-gg">${pjDonut([['Escanteio a favor', st.escN, '#7b3fa0'], ['Escanteio contra', st.escA, '#c9a6dd'], ['Falta a favor', st.fbN, '#13295b'], ['Falta contra', st.fbA, '#9fb0cf']], 'Bola parada')}
      ${pjDonut([['Gerou gol', cont(F.filter(l => l.equipe === 'QFC'), l => l.dados?.gerou === 'Gol'), '#e0a526'], ['Gerou finalização', cont(F.filter(l => l.equipe === 'QFC'), l => l.dados?.gerou === 'Finalização'), C.alvo], ['Nada', cont(F.filter(l => l.equipe === 'QFC'), l => !l.dados?.gerou || l.dados.gerou === 'Nada'), C.fora]], 'A favor: o que gerou')}</div>`; }
  if (b === 'perda') h = `<div class="pj-gg">${pjDonut(lado(st.perdas), 'Perdas: onde')}</div>`;
  modal(`<h2>${esc(PJ_BLOCOS.find(x => x.id === b).t)} <small class="m">${per}</small></h2>${h}<div class="mfoot"><span></span><button class="btn" id="pjgx">Fechar</button></div>`, true);
  $('#pjgx').onclick = fechar;
}
const pjRegiao = l => l.dados?.regiao || (l.x != null ? (pjArea(+l.x, +l.y, l.equipe) ? 'Área' : 'Fora da área') : null);

/* ---------- relatório pós-jogo (imediato, para os jogadores) ---------- */
function pjRelatorioHTML(j, L) {
  const st = pjStats(L), C = PJ_C, cont = (F, f) => F.filter(f).length;
  const alvoFora = F => [['No alvo', cont(F, l => ['Gol', 'No alvo'].includes(l.dados?.resultado)), C.alvo], ['Fora do alvo', cont(F, l => ['Fora', 'Bloqueada'].includes(l.dados?.resultado)), C.fora]];
  const areaFora = F => { const a = cont(F, l => pjRegiao(l) === 'Área'); return [['Dentro da área', a, C.area], ['Fora da área', F.length - a, C.foraA]]; };
  const lado = F => [['Campo de defesa', cont(F, l => pjCampo(l) === 'defesa'), C.def], ['Campo de ataque', cont(F, l => pjCampo(l) === 'ataque'), C.atq]];
  const F = (m) => L.filter(l => pjModo(l) === m), faltasN = L.filter(l => l.tipo === 'falta' && l.equipe === 'QFC');
  const time = (nome, Fs, gols) => `<div class="pjr-col"><div class="pjr-num"><b>${Fs.length}</b><span>finalizações · ${esc(nome)}</span>${gols ? `<em>${gols} gol${gols === 1 ? '' : 's'}</em>` : ''}</div><div class="pjr-dd">${pjDonut(alvoFora(Fs), '', null, { sz: 84 })}${pjDonut(areaFora(Fs), '', null, { sz: 84 })}</div></div>`;
  const mini = (Fs, t) => pjCampoSVG(Fs, { tit: t });
  return `<section class="pjr-sec"><h3 class="pjr-h">Finalizações</h3><div class="pjr-fin">${time(pjEquipe(j), st.fN, st.golsN)}${time(j.adversario, st.fA, st.golsA)}</div>
      <div class="pjr-mapas">${mini(F('finalizacao'), 'Nossas finalizações')}${mini(F('fin_adv'), 'Finalizações do adversário')}</div></section>
    <section class="pjr-sec"><h3 class="pjr-h">Recuperações, perdas e faltas</h3>
      <div class="pjr-k">${[['Recuperações', st.rec.length, `${st.roub.length} roubada${st.roub.length === 1 ? '' : 's'} · ${st.rec.length - st.roub.length} sem confronto`], ['Roubadas', st.roub.length, 'com confronto'], ['Perdas de posse', st.perdas.length, ''], ['Faltas cometidas', st.faltaN, `${st.amN ? st.amN + ' 🟨 ' : ''}${st.vmN ? st.vmN + ' 🟥' : ''}`]].map(([l, v, s]) => `<div><b>${v}</b><span>${l}</span>${s ? `<small>${s}</small>` : ''}</div>`).join('')}</div>
      <div class="pjr-dn">${pjDonut(lado(st.rec), 'Recuperações', null, { sz: 96 })}${pjDonut(lado(st.perdas), 'Perdas de posse', null, { sz: 96 })}${pjDonut(lado(faltasN), 'Faltas cometidas', null, { sz: 96 })}</div>
      <div class="pjr-mapas">${mini([...F('recuperacao'), ...F('roubada')], 'Recuperações e roubadas')}${mini(F('perda'), 'Perdas de posse')}</div></section>
    <p class="m pjr-leg">Campo sempre com o nosso ataque para a direita (→). Bolinha cheia = no alvo/roubada · vazia = fora do alvo · anel dourado = gol · contorno escuro = 2º tempo.</p>`;
}

function pjKpis(st, n = 1) {
  const md = v => n > 1 ? ` · ${(v / n).toFixed(1).replace('.', ',')}/jogo` : '';
  const k = (l, v, s) => `<div class="card"><div class="l">${l}</div><div class="v">${v}</div>${s ? `<div class="s">${s}</div>` : ''}</div>`;
  return k('Finalizações', `${st.fN.length} <small>× ${st.fA.length}</small>`, `no alvo ${pjPct(st.alvoN, st.fN.length)} × ${pjPct(st.alvoA, st.fA.length)}${md(st.fN.length)}`)
    + k('Gols', `${st.golsN} <small>× ${st.golsA}</small>`, `área ${st.areaN}/${st.fN.length} finalizações`)
    + k('Recuperações', st.rec.length, `${st.roub.length} roubadas · ${st.recDef} defesa / ${st.recAtq} ataque${st.recInf.length ? ` · ${pjPct(st.recOk.length, st.recInf.length)} bem-sucedidas` : ''}`)
    + k('Perdas de posse', st.perdas.length, `${st.perdaDef} defesa / ${st.perdaAtq} ataque`)
    + k('Bola parada', `${st.escN + st.fbN} <small>× ${st.escA + st.fbA}</small>`, `escanteios ${st.escN} × ${st.escA} · faltas ${st.fbN} × ${st.fbA}`)
    + k('Faltas', `${st.faltaN} <small>× ${st.faltaA}</small>`, `cartões 🟨 ${st.amN} × ${st.amA} · 🟥 ${st.vmN} × ${st.vmA}`);
}
function pjFaixasHTML(st) {
  const row = (l, a) => `<tr><td><b>${l}</b></td>${a.map((v, i) => `<td class="${i === 3 ? 'pj-2t' : ''}">${v || '<span class="m">0</span>'}</td>`).join('')}<td><b>${a.reduce((x, y) => x + y, 0)}</b></td></tr>`;
  return `<div class="panel"><h2>Por faixa de 15 minutos <small class="m">1º tempo | 2º tempo${st.semMin ? ` · ${st.semMin} lance(s) sem minuto ficam fora` : ''}</small></h2><div class="tablewrap"><table class="tb fl-tab pj-fx"><thead><tr><th></th>${PJ_FAIXAS.map((f, i) => `<th class="${i === 3 ? 'pj-2t' : ''}">${f[3]}</th>`).join('')}<th>Total</th></tr></thead><tbody>
    ${row('Finalizações (nós)', st.fx.finN)}${row('Finalizações (adv.)', st.fx.finA)}${row('Recuperações', st.fx.rec)}${row('Perdas de posse', st.fx.perda)}</tbody></table></div></div>`;
}
function pjBlocosHTML(st) {
  const reg = (F, e) => { const a = F.filter(l => (l.dados?.regiao || (l.x != null && (pjArea(+l.x, +l.y, e) ? 'Área' : 'Fora da área'))) === 'Área'), f = F.filter(l => !a.includes(l)), al = X => X.filter(l => ['Gol', 'No alvo'].includes(l.dados?.resultado)).length;
    return `<div class="kv small"><span>Dentro da área</span><b>${a.length} <small class="m">${pjPct(al(a), a.length)} no alvo</small></b></div><div class="kv small"><span>Fora da área</span><b>${f.length} <small class="m">${pjPct(al(f), f.length)} no alvo</small></b></div>`; };
  const corT = PJ_COR.reduce((s, c) => s + (st.cor[c] || 0), 0);
  return `<div class="grid2 pj-g2"><div class="panel"><h2>Finalizações por região</h2><h4 class="dm-h4">Nós</h4>${reg(st.fN, 'QFC')}<h4 class="dm-h4">Adversário</h4>${reg(st.fA, 'ADV')}</div>
    <div class="panel"><h2>Assistências por corredor <small class="m">${corT} com corredor marcado</small></h2>${PJ_COR.map(c => `<div class="pj-cor"><span>${c === 'Central' ? 'Corredor central' : 'Lado ' + c.toLowerCase()}</span><i><s style="width:${corT ? (st.cor[c] || 0) / corT * 100 : 0}%"></s></i><b>${st.cor[c] || 0} <small class="m">${pjPct(st.cor[c] || 0, corT)}</small></b></div>`).join('')}</div></div>`;
}
function pjJogadoresHTML(st, n = 1) {
  if (!st.jog.length) return '';
  return `<div class="panel"><h2>Jogadores ${n > 1 ? `<small class="m">${n} jogos</small>` : ''}</h2><div class="tablewrap"><table class="tb fl-tab"><thead><tr><th>Jogador</th><th>Recuperações</th><th>Roubadas</th><th>Bem-sucedidas</th><th>Perdas</th><th>Finalizações</th><th>No alvo</th><th>Gols</th><th>Assistências</th><th>Participação em fin.</th><th>Faltas</th><th>Cartões</th></tr></thead><tbody>
    ${st.jog.map(p => `<tr><td>${p.num ? `<span class="pj-n">${esc(p.num)}</span> ` : ''}<b>${esc(p.nome)}</b></td><td>${p.rec || ''}</td><td>${p.roub || ''}</td><td>${p.inf ? pjPct(p.ok, p.inf) : ''}</td><td>${p.perda || ''}</td><td>${p.fin || ''}</td><td>${p.alvo || ''}</td><td>${p.gol || ''}</td><td>${p.ass || ''}</td><td>${p.fin + p.ass || ''}</td><td>${p.falta || ''}</td><td>${p.am ? '🟨'.repeat(p.am) : ''}${p.vm ? '🟥' : ''}</td></tr>`).join('')}</tbody></table></div></div>`;
}
function pjListaHTML(j, L, pode) {
  if (!L.length) return '<div class="panel empty">Nenhum lance.</div>';
  return `<div class="panel"><div class="tablewrap"><table class="tb fl-tab"><thead><tr><th>Tempo</th><th>Minuto</th><th>Lance</th><th>Jogador</th><th>Detalhe</th><th>Local</th>${pode ? '<th></th>' : ''}</tr></thead><tbody>
    ${L.map(l => `<tr><td>${l.tempo}º</td><td>${pjMin(l.seg) || '—'}</td><td><span class="pj-n" style="background:${PJ_TIPOS[l.tipo === 'finalizacao' && l.equipe === 'ADV' ? 'fin_adv' : l.tipo]?.cor}">${esc(pjNum(l) || '·')}</span> ${esc(pjRotulo(l))}</td><td>${esc(pjNome(l))}</td><td class="m">${esc(pjDetalhe(l))}</td>
      <td>${l.x != null ? '✓' : pode ? `<button class="btn sm" data-marca="${l.id}">Marcar no campo</button>` : '<span class="m">—</span>'}</td>${pode ? `<td><button class="btn sm" data-ed="${l.id}">Editar</button></td>` : ''}</tr>`).join('')}</tbody></table></div></div>`;
}
function pjLigarLista(j, L) {
  document.querySelectorAll('[data-ed]').forEach(b => b.onclick = () => pjFormLance(j, L.find(x => x.id === +b.dataset.ed)));
  document.querySelectorAll('[data-marca]').forEach(b => b.onclick = () => { const l = L.find(x => x.id === +b.dataset.marca); S.pj.pend = l; S.pj.tempo = l.tempo; S.pj.modo = null; S.pj.aba = 'lancar'; pjJogo(j.id); });
}

/* ---------- formulários ---------- */
function pjFormJogo(j) {
  const n = !j; j = j || { equipe: 'QFC', ataque_1t: 'dir', data: hoje() };
  modal(`<h2>${n ? 'Novo jogo' : 'Dados do jogo'}</h2>
    <div class="g3"><label class="f"><span>Data</span><input type="date" class="in" id="pjd" value="${esc(j.data || '')}"></label>
      <label class="f"><span>Adversário *</span><input class="in" id="pja" value="${esc(j.adversario || '')}"></label>
      <label class="f"><span>Mando</span><select class="in" id="pjmd">${opts(['Casa', 'Fora', 'Neutro'], j.mando || '', '—')}</select></label>
      <label class="f"><span>Competição</span><input class="in" id="pjc" value="${esc(j.competicao || '')}" placeholder="Potiguar 2027"></label>
      <label class="f"><span>Rodada / fase</span><input class="in" id="pjr" value="${esc(j.rodada || '')}" placeholder="Rodada 1"></label>
      <label class="f"><span>Nossa equipe</span><input class="in" id="pje" value="${esc(j.equipe || 'QFC')}"></label>
      <label class="f"><span>Gols nossos</span><input type="number" class="in" id="pjgn" min="0" value="${j.gols_nos ?? ''}" placeholder="pelos lances"></label>
      <label class="f"><span>Gols adversário</span><input type="number" class="in" id="pjga" min="0" value="${j.gols_adv ?? ''}" placeholder="pelos lances"></label>
      <label class="f"><span>No 1º tempo atacamos para</span><select class="in" id="pjat">${opts([['dir', 'a direita →'], ['esq', '← a esquerda']], j.ataque_1t)}</select></label></div>
    <label class="f"><span>Observações</span><textarea class="in" id="pjo" rows="2">${esc(j.obs || '')}</textarea></label>
    <div class="mfoot">${n ? '<span></span>' : '<button class="btn dan" id="pjdel">Excluir jogo</button>'}<div class="row"><button class="btn" id="pjcx">Cancelar</button><button class="btn pri" id="pjsv">Salvar</button></div></div>`, true);
  $('#pjcx').onclick = fechar;
  if ($('#pjdel')) $('#pjdel').onclick = async () => { if (!confirm(`Excluir o jogo contra ${j.adversario} e todos os ${(S.pj.lances[j.id] || []).length} lances? Não dá para desfazer.`)) return;
    const { error } = await sb.from('pj_jogos').delete().eq('id', j.id); if (error) return toast(erroAmigavel(error), true);
    S.pj.jogos = S.pj.jogos.filter(x => x.id !== j.id); delete S.pj.lances[j.id]; S.pj.jogo = null; fechar(); toast('Jogo excluído.'); pPosJogo(); };
  $('#pjsv').onclick = async () => {
    const num = id => $(id).value === '' ? null : +$(id).value;
    const row = { data: $('#pjd').value || null, adversario: $('#pja').value.trim(), mando: $('#pjmd').value || null, competicao: $('#pjc').value.trim() || null, rodada: $('#pjr').value.trim() || null,
      equipe: $('#pje').value.trim() || 'QFC', gols_nos: num('#pjgn'), gols_adv: num('#pjga'), ataque_1t: $('#pjat').value, obs: $('#pjo').value.trim() || null, atualizado_em: new Date().toISOString() };
    if (!row.adversario) return toast('Informe o adversário.', true);
    const q = n ? sb.from('pj_jogos').insert(row).select().single() : sb.from('pj_jogos').update(row).eq('id', j.id).select().single();
    const { data, error } = await q; if (error) return toast(erroAmigavel(error), true);
    if (n) { S.pj.jogos = [data, ...(S.pj.jogos || [])]; S.pj.lances[data.id] = []; S.pj.aba = 'lancar'; S.pj.tempo = 1; S.pj.relogio = ''; } else Object.assign(j, data);
    S.pj.jogo = data.id; fechar(); toast('Jogo salvo.'); pjJogo(data.id); };
}
function pjChipsAtl(sel, id) {
  const at = S.atletas.filter(a => a.ativo && a.status !== 'Inativo').sort((a, b) => (a.numero ?? 999) - (b.numero ?? 999) || a.nome.localeCompare(b.nome, 'pt'));
  return `<div class="pj-chips" id="${id}">${at.map(a => `<button type="button" class="chip${sel === a.id ? ' on' : ''}" data-a="${a.id}">${a.numero != null ? `<b>${a.numero}</b> ` : ''}${esc(a.nome.split(' ')[0])}</button>`).join('')}</div>`;
}
function pjFormLance(j, l, novo) {
  const ed = !!l; let modo = novo?.modo;
  if (ed) modo = l.tipo === 'finalizacao' && l.equipe === 'ADV' ? 'fin_adv' : pjRoub(l) ? 'roubada' : l.tipo;
  const base = PJ_TIPOS[modo].base || modo, d = { ...(l?.dados || {}) };
  if (!ed && modo === 'roubada') d.roubada = true; if (!ed && modo === 'recuperacao') d.roubada = false;
  if (!ed && base === 'finalizacao' && novo.x != null) d.regiao = pjArea(novo.x, novo.y, modo === 'fin_adv' ? 'ADV' : 'QFC') ? 'Área' : 'Fora da área';
  if (!ed && modo === 'finalizacao' && novo.x != null) d.corredor_sug = novo.y < 33.3 ? 'Esquerdo' : novo.y > 66.7 ? 'Direito' : 'Central';
  let eq = ed ? l.equipe : PJ_TIPOS[modo].eq || 'QFC', atl = l?.atleta_id || null, assist = d.assist_id || null;
  const tempo = ed ? l.tempo : S.pj.tempo, minTxt = ed ? pjMin(l.seg) : S.pj.relogio;
  const seg2 = (txt, el) => `<div class="gol-seg pj-sg" data-g="${el}">${txt}</div>`;
  const op = (g, vals, v) => vals.map(x => { const [k, t] = Array.isArray(x) ? x : [x, x]; return `<button type="button" data-g="${g}" data-v="${esc(k)}" class="${String(v) === String(k) ? 'on' : ''}">${t}</button>`; }).join('');
  const campos = () => {
    const nosJog = eq === 'QFC';
    let h = '';
    if (modo === 'bola_parada') h += `<div class="f"><span>Tipo</span>${seg2(op('subtipo', ['Escanteio', 'Falta'], d.subtipo || 'Escanteio'), 'subtipo')}</div><div class="f"><span>Para</span>${seg2(op('eq', [['QFC', 'a favor'], ['ADV', 'contra']], eq), 'eq')}</div>
      <div class="f"><span>Gerou</span>${seg2(op('gerou', ['Nada', 'Finalização', 'Gol'], d.gerou || 'Nada'), 'gerou')}</div>`;
    if (modo === 'falta') h += `<div class="f"><span>Falta</span>${seg2(op('eq', [['QFC', 'cometida por nós'], ['ADV', 'sofrida (cometida pelo adv.)']], eq), 'eq')}</div><div class="f"><span>Cartão</span>${seg2(op('cartao', [['', 'Nenhum'], ['Amarelo', '🟨 Amarelo'], ['Vermelho', '🟥 Vermelho']], d.cartao || ''), 'cartao')}</div>`;
    if (base === 'recuperacao') h += `${ed ? `<div class="f"><span>Tipo</span>${seg2(op('roubada', [['1', 'Roubada (com confronto)'], ['0', 'Recuperação (sem confronto)']], d.roubada ? '1' : '0'), 'roubada')}</div>` : ''}
      <div class="f"><span>Manteve a posse?${ed ? '' : ' <small class="m">(clicar já salva)</small>'}</span>${seg2(op('sucesso', [['1', 'Sim · bem-sucedida'], ['0', 'Não · perdeu em seguida'], ['', 'Não informado']], ed ? (d.sucesso == null ? '' : d.sucesso ? '1' : '0') : '-'), 'sucesso')}</div>`;
    if (base === 'finalizacao') h += `<div class="f"><span>Resultado</span>${seg2(op('resultado', PJ_RES, d.resultado || ''), 'resultado')}</div><div class="f"><span>Região</span>${seg2(op('regiao', ['Área', 'Fora da área'], d.regiao || ''), 'regiao')}</div>`;
    if (modo === 'finalizacao') h += `<div class="f"><span>Assistência (quem deu o passe)</span>${pjChipsAtl(assist, 'pjass')}<input class="in sm" id="pjassn" value="${esc(d.assist_nome || '')}" placeholder="ou nome (fora do elenco)"></div>
      <div class="f"><span>Corredor da assistência</span>${seg2(op('corredor', [['', '—'], ...PJ_COR], d.corredor || ''), 'corredor')}${d.corredor_sug && !d.corredor ? `<small class="m"> sugestão pelo local: ${d.corredor_sug}</small>` : ''}</div>`;
    const jog = nosJog ? `<div class="f"><span>Jogador${modo === 'falta' ? ' (quem cometeu)' : ''}${!ed && modo === 'perda' ? ' <small class="m">(clicar já salva)</small>' : ''}</span>${pjChipsAtl(atl, 'pjatl')}<input class="in sm" id="pjnome" value="${esc(!atl ? l?.nome || '' : '')}" placeholder="ou nome (fora do elenco)"> <input class="in sm pj-num" id="pjnum" value="${esc(l?.num || '')}" placeholder="nº"></div>`
      : `<div class="f"><span>Jogador adversário (opcional)</span><input class="in sm pj-num" id="pjnum" value="${esc(l?.num || '')}" placeholder="nº"> <input class="in sm" id="pjnome" value="${esc(l?.nome || '')}" placeholder="nome"></div>`;
    h = (modo === 'bola_parada' || modo === 'falta' ? h + jog : jog + h);
    h += `<label class="f"><span>Observação</span><input class="in" id="pjobs" value="${esc(d.obs || '')}"></label>`;
    return h;
  };
  const desenha = () => {
    modal(`<h2>${ed ? 'Editar lance' : PJ_TIPOS[modo].l}</h2>
      <div class="g3"><label class="f"><span>Tempo</span><select class="in" id="pjtp">${opts([[1, '1º tempo'], [2, '2º tempo']], tempo)}</select></label><label class="f"><span>Minuto</span><input class="in" id="pjfm" value="${esc(minTxt)}" placeholder="mm:ss"></label>
        <div class="f"><span>Local</span><span class="m">${(ed ? l.x : novo.x) != null ? 'marcado no campo' : 'sem local'}</span></div></div>
      <div id="pjcampos">${campos()}</div>
      <div class="mfoot">${ed ? '<button class="btn dan" id="pjldel">Excluir lance</button>' : '<span></span>'}<div class="row"><button class="btn" id="pjlc">Cancelar</button><button class="btn pri" id="pjls">Salvar</button></div></div>`, true);
    ligar();
  };
  const ligar = () => {
    document.querySelectorAll('#modal [data-g][data-v]').forEach(b => b.onclick = () => { const g = b.dataset.g, v = b.dataset.v;
      if (g === 'eq') { eq = v; return desenhaCampos(); }
      if (g === 'roubada') d.roubada = v === '1'; else if (g === 'sucesso') d.sucesso = v === '' ? null : v === '1'; else if (g === 'regiao') { d.regiao = v; d.regiao_manual = true; } else d[g] = v || null;
      b.parentElement.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
      if (!ed && (g === 'sucesso' || (g === 'resultado' && modo === 'fin_adv'))) salvar(); });
    const chip = (box, set) => { const el = $('#' + box); if (el) el.onclick = e => { const c = e.target.closest('[data-a]'); if (!c) return; const id = +c.dataset.a; set(id); el.querySelectorAll('.chip').forEach(x => x.classList.toggle('on', +x.dataset.a === id)); }; };
    chip('pjatl', id => { atl = atl === id ? null : id; if (atl === null) document.querySelectorAll('#pjatl .chip').forEach(x => x.classList.remove('on')); if (!ed && modo === 'perda' && atl) salvar(); });
    chip('pjass', id => { assist = assist === id ? null : id; if (assist === null) document.querySelectorAll('#pjass .chip').forEach(x => x.classList.remove('on')); });
    $('#pjlc').onclick = fechar;
    if ($('#pjldel')) $('#pjldel').onclick = async () => { if (!confirm('Excluir este lance?')) return; const { error } = await sb.from('pj_lances').delete().eq('id', l.id); if (error) return toast(erroAmigavel(error), true);
      S.pj.lances[j.id] = S.pj.lances[j.id].filter(x => x.id !== l.id); fechar(); pjJogo(j.id); };
    $('#pjls').onclick = salvar;
  };
  const desenhaCampos = () => { lerTxt(); $('#pjcampos').innerHTML = campos(); ligar(); };
  const lerTxt = () => { if ($('#pjobs')) d.obs = $('#pjobs').value.trim() || null; if ($('#pjassn')) d.assist_nome = $('#pjassn').value.trim() || null; };
  const salvar = async () => {
    lerTxt(); const tp = +$('#pjtp').value, seg = pjLerMin($('#pjfm').value, tp);
    if ($('#pjfm').value.trim() && seg == null) return toast('Minuto inválido (use mm:ss).', true);
    const nome = $('#pjnome')?.value.trim() || null, num = $('#pjnum')?.value.trim() || null;
    if (base === 'finalizacao' && !d.resultado) return toast('Marque o resultado da finalização.', true);
    if (modo === 'finalizacao') { d.assist_id = assist || null; if (assist) d.assist_nome = null; }
    delete d.corredor_sug; if (d.sucesso === undefined && base === 'recuperacao') d.sucesso = null;
    if (base !== 'recuperacao') { delete d.roubada; delete d.sucesso; }
    const row = { tempo: tp, seg, equipe: modo === 'fin_adv' ? 'ADV' : eq, tipo: base, atleta_id: eq === 'QFC' ? atl : null, nome: eq === 'QFC' && atl ? null : nome, num, dados: d };
    if (!ed) Object.assign(row, { jogo_id: j.id, x: novo.x, y: novo.y });
    const { data, error } = ed ? await sb.from('pj_lances').update(row).eq('id', l.id).select().single() : await sb.from('pj_lances').insert(row).select().single();
    if (error) return toast(erroAmigavel(error), true);
    if (ed) Object.assign(l, data); else S.pj.lances[j.id].push(data);
    S.pj.relogio = pjMin(seg) || S.pj.relogio; S.pj.tempo = tp; fechar(); toast(ed ? 'Lance atualizado.' : 'Lance salvo.'); pjJogo(j.id);
  };
  desenha();
}

/* ---------- PDF (A4 paisagem) ---------- */
/* ---------- PDF do relatório pós-jogo (A4 paisagem, 1 página) ---------- */
function pjPDF(j) {
  const L = pjOrdena(S.pj.lances[j.id] || []), st = pjStats(L);
  const tit = `${pjEquipe(j)} ${j.gols_nos ?? st.golsN} × ${j.gols_adv ?? st.golsA} ${j.adversario}`;
  const html = `<section class="pjp"><div class="flp-cab"><img src="${LOGO}" alt=""><div><small>QFC | ANÁLISE DE DESEMPENHO</small><h1>PÓS-JOGO</h1></div><div class="flp-dt"><b>${esc(tit)}</b><span>${esc([j.data ? dataBR(j.data) : '', j.competicao, j.rodada, j.mando, j.teste ? 'demonstração' : ''].filter(Boolean).join(' · '))}</span></div></div>
    <div class="pj-rel">${pjRelatorioHTML(j, L)}</div></section>`;
  document.querySelectorAll('#print-area').forEach(x => x.remove());
  const w = document.createElement('div'); w.id = 'print-area'; w.className = 'flp pjp-w'; w.innerHTML = html;
  const stl = document.createElement('style'); stl.id = 'flp-page'; stl.textContent = '@page{size:A4 landscape;margin:8mm}';
  document.head.appendChild(stl); document.body.appendChild(w); document.body.classList.add('imprimindo');
  const tt = document.title; document.title = `Pos-jogo_${(j.data || '').replace(/-/g, '')}_${(j.adversario || '').replace(/\s+/g, '_')}`;
  setTimeout(() => { window.print(); setTimeout(() => { w.remove(); stl.remove(); document.body.classList.remove('imprimindo'); document.title = tt; }, 500); }, 400);
}

function navPJ() {
  const nav = $('#nav'); if (!nav || nav.querySelector('[data-p=posjogo]')) return;
  if (typeof pagPermitida === 'function' && typeof modulosPerm === 'function' && modulosPerm() && !pagPermitida('posjogo')) return;
  const box = document.createElement('div'); box.style.display = 'contents';
  box.innerHTML = `<div class="sec">Análise de jogo</div><button data-p="posjogo" class="${S.page === 'posjogo' ? 'on' : ''}">Pós-jogo</button>`;
  const ref = [...nav.querySelectorAll('.sec')].find(s => /Análise do advers|Administra/i.test(s.textContent));
  ref ? ref.parentNode.insertBefore(box, ref) : nav.appendChild(box);
}
const _shellPJ = shell;
shell = function () { _shellPJ(); navPJ(); };
const _irPJ = ir;
ir = function (p) {
  if (p !== 'posjogo') return _irPJ(p);
  if (typeof pagPermitida === 'function' && typeof modulosPerm === 'function' && modulosPerm() && !pagPermitida('posjogo')) return _irPJ('inicio');
  S.page = p; document.querySelectorAll('#nav button[data-p]').forEach(b => b.classList.toggle('on', b.dataset.p === p));
  pPosJogo(); window.scrollTo(0, 0);
};
if (document.getElementById('main') && S.perfil) { navPJ(); if (S.page === 'posjogo') ir('posjogo'); }
