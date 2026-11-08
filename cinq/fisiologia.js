/* CINQ · Fisiologia
   Pós-treino: CSV de sessão do Catapult (OpenField) → relatório no padrão do Departamento de Saúde e Performance, com alta
   intensidade (faixa 5, 19,8–25,2), Sprint (faixa 6, ≥25,2), Player Load e PL/min, % da velocidade máxima de referência e o sino (🔔).
   Jogo: 3 arquivos (aquecimento, 1º e 2º tempo); total = 1º + 2º tempo, aquecimento separado. Tags MD+5…MD-5 por sessão.
   Prontidão: CMJ digitado no CINQ; referência = média das últimas 10 avaliações, DP, SWC = 0,2 × DP, faixas ±1 e ±2 DP.
   Velocidade: referência = maior marca válida, exposições ≥90%, dias sem exposição, falso pico a confirmar.
   Carga: período, filtros (posição, atleta, MD, tipo), por sessão e por atleta, ACWR 7:28. Evolução: gráficos. Cards. */
'use strict';

S.fl = { ok: false, sess: [], gps: [], cmj: [], vinc: [], cfg: {}, aba: 'pos', sel: null, dataP: null, rev: 0,
  cf: { per: 'semana', ref: null, pos: '', at: '', md: '', tipo: '', vis: 'atleta', modo: 'soma', met: 'dist' },
  ev: { per: '4sem', ref: null, modo: 'atletas', ats: [], pos: '', met: 'dist', md: '', tipo: '' },
  ck: { sel: null, modelo: 'comissao', vis: 'todos', at: null } };
const FL_ABAS = [['pos', 'Pós-treino'], ['prontidao', 'Prontidão'], ['velocidade', 'Velocidade 🔔'], ['carga', 'Carga'], ['evolucao', 'Evolução'], ['cards', 'Relatório de treino']];
const podeFisl = () => isAdmin() || S.perfil?.funcao === 'fisico';
const flN = v => v == null || v === '' || isNaN(v) ? null : Number(v);
const flFmt = (v, d = 0) => v == null || !isFinite(v) ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const flDur = s => { if (s == null) return '—'; const m = Math.floor(s / 60), r = Math.round(s % 60); return r ? `${m}min${String(r).padStart(2, '0')}s` : `${m} min`; };
const flHms = t => { const p = String(t || '').split(':').map(Number); return p.length === 3 && p.every(x => !isNaN(x)) ? p[0] * 3600 + p[1] * 60 + p[2] : null; };
const flTitulo = t => t && t === t.toUpperCase() ? t.toLowerCase().replace(/(^|\s)(\S)/g, (m, e, c) => e + c.toUpperCase()).replace(/\b(Da|De|Do|Dos|Das)\b/g, w => w.toLowerCase()) : t;
const flNomeAt = r => (r.atleta_id && S.atletas.find(a => a.id === r.atleta_id)?.nome) || flTitulo(r.nome_origem);
const flPos = r => (r.atleta_id && S.atletas.find(a => a.id === r.atleta_id)?.posicao) || r.posicao || '';
const flSoma = (arr, k) => arr.reduce((t, r) => t + (+r[k] || 0), 0);
const flMedia = (arr, k) => { const v = arr.map(r => typeof k === 'function' ? k(r) : r[k]).filter(x => x != null && isFinite(x)).map(Number); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
const FL_LIMIARES = 'Alta intensidade 19,8–25,2 km/h (faixa 5) · Sprint ≥25,2 km/h (faixa 6) · Acc ≥ +3 m/s² · Dcc ≤ −3 m/s² · PL = Player Load (UA)';
// parâmetros ajustáveis pelo fisiologista
const FL_DEF = { vmax: { pct: 90, dias: 7, jogo_min: 45, salto_conf: 5, n_min: 3 }, acwr: { min: 1.0, max: 1.5 }, prontidao: { ruido_pct: 3, n_ref: 10, n_min: 5 } };
const flCfg = k => ({ ...FL_DEF[k], ...(S.fl.cfg[k] || {}) });
const flRuido = () => +flCfg('prontidao').ruido_pct;
const flSig = () => `${S.fl.gps.length}:${S.fl.sess.length}:${S.fl.cmj.length}:${S.fl.rev}:${JSON.stringify(S.fl.cfg)}`;
const flCache = (nome, chave, fn) => { if (S.fl._sig !== flSig()) { S.fl._sig = flSig(); S.fl._c = {}; } const c = S.fl._c[nome] || (S.fl._c[nome] = {}); return chave in c ? c[chave] : (c[chave] = fn()); };

/* ============ dados ============ */
// completa HSR total e PL/min nas linhas antigas
function flPrep(g) {
  if (g.hsr_total == null) g.hsr_total = g.hsd != null ? +g.hsd : (g.ai != null || g.sprint != null ? (+g.ai || 0) + (+g.sprint || 0) : null);
  if (g.plmin == null && g.pl != null && g.duracao_s) g.plmin = g.pl / (g.duracao_s / 60);
  return g;
}
// o Supabase devolve no máximo 1000 linhas por consulta: busca em páginas
async function flTudo(q) { const out = []; for (let i = 0; ; i += 1000) { const r = await q().range(i, i + 999); if (r.error) return r; out.push(...r.data); if (r.data.length < 1000) return { data: out, error: null }; } }
async function carregarFl(forcar) {
  if (S.fl.ok && !forcar) return;
  const [s, g, c, v, cf] = await Promise.all([sb.from('fisl_sessoes').select('*').order('data').order('hora'), flTudo(() => sb.from('fisl_gps').select('*').order('id')),
    sb.from('fisl_cmj').select('*').order('data'), sb.from('fisl_vinculos').select('*'), sb.from('fisl_config').select('*')]);
  for (const r of [s, g, c, v, cf]) if (r.error) throw r.error;
  S.fl.sess = s.data.map(x => ({ ...x, md: x.md || [] })); S.fl.gps = g.data.map(flPrep); S.fl.cmj = c.data; S.fl.vinc = v.data; S.fl.cfg = Object.fromEntries(cf.data.map(x => [x.chave, x.valor])); S.fl.ok = true;
}
const flSessao = id => S.fl.sess.find(s => s.id === id);
const flTotais = sid => S.fl.gps.filter(g => g.sessao_id === sid && g.periodo === 0);
const flOrdS = (a, b) => (a.data + (a.hora || '')).localeCompare(b.data + (b.hora || ''));
// linhas de sessão (periodo 0) de um atleta, em ordem
const flLinhasAt = aid => flCache('lin', aid, () => S.fl.gps.filter(g => g.atleta_id === aid && g.periodo === 0).map(g => ({ g, s: flSessao(g.sessao_id) })).filter(x => x.s).sort((a, b) => flOrdS(a.s, b.s)));

/* ============ tags de MD ============ */
const MD_TAGS = ['MD-5', 'MD-4', 'MD-3', 'MD-2', 'MD-1', 'MD', 'MD+1', 'MD+2', 'MD+3', 'MD+4', 'MD+5'];
const flMdTxt = s => (s.md || []).join(' · ');
function flLerMD(txt) {
  const out = []; String(txt || '').replace(/(^|[^a-z0-9])md\s*([+\-−–]\s*[1-5])?(?![0-9])/gi, (m, a, n) => { const t = 'MD' + (n ? n.replace(/\s/g, '').replace(/[−–]/, '-') : ''); if (MD_TAGS.includes(t) && !out.includes(t)) out.push(t); });
  return out;
}
// sugestão pelos jogos do calendário (e jogos já importados do GPS): MD, MD+N depois do jogo, MD-N antes do próximo
function flSugereMD(data) {
  const jogos = [...new Set([...S.sessoes.filter(s => ['Jogo', 'Amistoso'].includes(s.tipo)).map(s => s.data), ...S.fl.sess.filter(s => s.tipo === 'Jogo').map(s => s.data)])].sort();
  if (jogos.includes(data)) return ['MD'];
  const ant = jogos.filter(d => d < data).pop(), prox = jogos.find(d => d > data), out = [];
  if (ant && diasEntre(ant, data) <= 5) out.push('MD+' + diasEntre(ant, data));
  if (prox && diasEntre(data, prox) <= 5) out.push('MD-' + diasEntre(data, prox));
  return out;
}
const flMdSel = (id, v) => `<select class="in fl-md" id="${id}">${opts(MD_TAGS, v || '', '—')}</select>`;

/* ============ velocidade máxima de referência e o sino ============ */
// percorre as sessões do atleta em ordem: referência = maior marca até a data (treino, jogo ou teste). Nova marca maior vira
// referência automaticamente ao subir o GPS; só sai se o fisiologista marcar "Falso pico".
function flVH(aid) {
  return flCache('vh', aid, () => {
    const C = flCfg('vmax'), lista = []; let ref = null, refS = null, n = 0, teste = false;
    for (const x of flLinhasAt(aid)) {
      const v = +x.g.vmax; if (!v) continue;
      const antes = ref, validoAntes = antes && (teste || n >= C.n_min);
      let st = x.g.vmax_status === 'falso' ? 'falso' : 'ok';
      let recorde = false;
      if (st === 'ok') { if (!ref || v > ref) { recorde = !!validoAntes; ref = v; refS = x.s; } n++; if (x.s.tipo === 'Teste') teste = true; }
      const valida = teste || n >= C.n_min;
      lista.push({ ...x, v, st, recorde, antes, ref: valida ? ref : null, refS: valida ? refS : null });
    }
    const ult = lista[lista.length - 1];
    return { lista, ref: ult?.ref ?? null, refS: ult?.refS ?? null, n: lista.filter(e => e.st === 'ok').length };
  });
}
const flVref = aid => aid ? flVH(aid).ref : null;
const flVEntrada = r => r?.atleta_id ? flVH(r.atleta_id).lista.find(e => e.g.id === r.id || (e.g.sessao_id === r.sessao_id && r.periodo === 0)) : null;
// exposição na sessão: pico ≥ pct% da referência (por parte; o aquecimento não conta) ou jogo com ≥ jogo_min minutos
function flExpo(e) {
  if (!e) return null;
  return flCache('ex', e.g.id, () => {
    const C = flCfg('vmax'), lim = e.ref ? e.ref * C.pct / 100 : null;
    const vel = !!lim && e.st !== 'falso' && e.st !== 'pendente' && e.v >= lim;
    const partes = lim ? S.fl.gps.filter(g => g.sessao_id === e.s.id && g.atleta_id === e.g.atleta_id && g.periodo > 0 && g.periodo !== 9 && +g.vmax >= lim) : [];
    const jogo = e.s.tipo === 'Jogo' && (e.g.duracao_s || 0) / 60 >= C.jogo_min;
    return vel || jogo ? { vel, jogo, pct: e.ref ? e.v / e.ref * 100 : null, partes, md1: (e.s.md || []).includes('MD-1') } : null;
  });
}
const flExpos = aid => flVH(aid).lista.filter(e => e.s.data <= hoje()).map(e => ({ e, x: flExpo(e) })).filter(o => o.x);
const flPctTxt = r => { const e = flVEntrada(r); if (!e) return '—'; if (e.st === 'pendente') return '<span class="badge fl-pend" title="passou a referência anterior em mais do limite: confirmar se não é pico falso do GPS">a confirmar</span>';
  if (e.st === 'falso') return '<span class="m" title="marcado como falso pico">falso</span>'; if (!e.ref) return '<span class="m" title="a referência aparece a partir de algumas sessões do atleta (ou com o teste de velocidade)">—</span>';
  const p = e.v / e.ref * 100; return `${Math.round(p)}%${p >= flCfg('vmax').pct ? ' <span class="fl-sino" title="exposição à velocidade máxima">🔔</span>' : ''}${e.recorde ? ' <span class="badge fl-rec">recorde</span>' : ''}`; };
async function flMarcarVmax(id, status) {
  const { error } = await sb.from('fisl_gps').update({ vmax_status: status }).eq('id', id); if (error) return toast(erroAmigavel(error), true);
  const g = S.fl.gps.find(x => x.id === id); if (g) g.vmax_status = status; S.fl.rev++; toast(status === 'ok' ? 'Falso pico desfeito: a marca volta a contar.' : 'Marcada como falso pico: fora da referência.'); pFisiologia();
}

/* ============ leitura do CSV do Catapult ============ */
function flCsvLinha(l) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < l.length; i++) { const ch = l[i];
    if (q) { if (ch === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
    else if (ch === '"') q = true; else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch; }
  out.push(cur); return out.map(x => x.trim());
}
const FL_COLS = { dist: ['average distance (session)', 'total distance'], pl: ['average player load (session)', 'total player load'], vmax: ['velocidade maxima', 'maximum velocity'],
  mmin: ['metros/min', 'meterage per minute'], ai: ['distancia alta intensidade', 'velocity band 5 average distance (session)'], sprint: ['distancia sprint', 'velocity band 6 average distance (session)'],
  n_sprints: ['sprint efforts'], acel_m: ['distancia aceleracao'], n_acel: ['n° aceleracoes', 'nº aceleracoes', 'n aceleracoes'], desac_m: ['distancia desaceleracao'],
  n_desac: ['n° desaceleracoes', 'nº desaceleracoes', 'n desaceleracoes'], hsd: ['high speed distance'], plmin: ['carga minuto', 'player load per minute'], dur: ['average duration (session)', 'total duration'] };
const FL_TAGCOLS = ['activity tags', 'period tags', 'game tags'];
// soma de partes (sem linha "Session" no arquivo, ou o total do jogo = 1º + 2º tempo)
function flSomaPartes(ps) {
  const s = k => flSoma(ps, k), dur = s('duracao_s'), min = dur / 60;
  return { duracao_s: dur, dist: s('dist'), mmin: min ? s('dist') / min : null, ai: s('ai'), sprint: s('sprint'), hsr_total: s('hsr_total'), hsd: s('hsd'), n_sprints: s('n_sprints'),
    vmax: Math.max(0, ...ps.map(r => +r.vmax || 0)) || null, acel_m: s('acel_m'), n_acel: s('n_acel'), desac_m: s('desac_m'), n_desac: s('n_desac'), pl: s('pl'), plmin: min ? s('pl') / min : null };
}
function lerCatapult(txt) {
  const linhas = txt.replace(/^﻿/, '').split(/\r?\n/);
  const meta = {}; let i = 0;
  for (; i < linhas.length; i++) { const c = flCsvLinha(linhas[i]); if (fNorm(c[0]) === 'player name') break;
    const m = linhas[i].match(/^"?([^:,"]+):"?,(.*)$/); if (m) meta[fNorm(m[1])] = m[2].replace(/^"|"$/g, '').trim(); }
  if (i >= linhas.length) throw new Error('Não encontrei a tabela de atletas (coluna “Player Name”). O arquivo é o relatório de sessão do OpenField em CSV?');
  const cab = flCsvLinha(linhas[i]).map(fNorm), idx = k => { for (const n of FL_COLS[k]) { const j = cab.indexOf(n); if (j >= 0) return j; } return -1; };
  const cabOrig = flCsvLinha(linhas[i]), iTags = FL_TAGCOLS.map(t => cab.indexOf(t)).filter(j => j >= 0);
  const iN = cab.indexOf('player name'), iP = cab.indexOf('period name'), iPn = cab.indexOf('period number');
  const rows = [], tags = [];
  for (let k = i + 1; k < linhas.length; k++) {
    if (!linhas[k].trim()) continue; const c = flCsvLinha(linhas[k]); if (!c[iN]) continue;
    const g = j => j >= 0 ? c[j] : null, n = key => flN(String(g(idx(key)) ?? '').replace(',', '.'));
    const pn = iPn >= 0 ? +c[iPn] || 0 : 0, pnome = iP >= 0 ? c[iP] : 'Session';
    const bruto = {}; cab.forEach((h, j) => { if (h && c[j] !== '' && c[j] != null) bruto[cabOrig[j]] = c[j]; });
    iTags.forEach(j => flLerMD(c[j]).forEach(t => { if (!tags.includes(t)) tags.push(t); }));
    const r = { nome_origem: c[iN].replace(/\s+/g, ' ').trim(), periodo: fNorm(pnome) === 'session' ? 0 : pn, periodo_nome: pnome, duracao_s: flHms(g(idx('dur'))),
      dist: n('dist'), mmin: n('mmin'), ai: n('ai'), sprint: n('sprint'), n_sprints: n('n_sprints'), vmax: n('vmax'), acel_m: n('acel_m'), n_acel: n('n_acel'),
      desac_m: n('desac_m'), n_desac: n('n_desac'), pl: n('pl'), hsd: n('hsd'), plmin: n('plmin'), bruto };
    r.hsr_total = r.hsd ?? (r.ai != null || r.sprint != null ? (r.ai || 0) + (r.sprint || 0) : null);
    if (r.plmin == null && r.pl != null && r.duracao_s) r.plmin = r.pl / (r.duracao_s / 60);
    rows.push(r);
  }
  if (!rows.length) throw new Error('O arquivo não tem linhas de atletas.');
  const dm = (meta.date || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  const data = dm ? `${dm[3]}-${dm[2].padStart(2, '0')}-${dm[1].padStart(2, '0')}` : null;
  const nomes = [...new Set(rows.map(r => r.nome_origem))];
  nomes.forEach(nm => { if (rows.some(r => r.nome_origem === nm && r.periodo === 0)) return;
    rows.push({ nome_origem: nm, periodo: 0, periodo_nome: 'Session', ...flSomaPartes(rows.filter(r => r.nome_origem === nm)), bruto: {} }); });
  const periodos = [...new Map(rows.filter(r => r.periodo > 0).map(r => [r.periodo, { num: r.periodo, nome: r.periodo_nome }])).values()].sort((a, b) => a.num - b.num);
  return { data, hora: meta['start time'] || null, duracao_s: flN(meta.duration), periodos, rows, nomes, md: tags.slice(0, 2) };
}
const FL_DB = ['nome_origem', 'duracao_s', 'dist', 'mmin', 'ai', 'sprint', 'n_sprints', 'vmax', 'acel_m', 'n_acel', 'desac_m', 'n_desac', 'pl', 'hsd', 'plmin', 'hsr_total'];
const FL_INT = ['duracao_s', 'n_sprints', 'n_acel', 'n_desac'];
const flLinhaDB = (x, sid, aid, periodo = x.periodo) => ({ ...Object.fromEntries(FL_DB.map(k => [k, x[k] == null ? null : FL_INT.includes(k) ? Math.round(x[k]) : x[k]])), bruto: x.bruto || {}, periodo, sessao_id: sid, atleta_id: aid ?? null });
// parte do jogo pelo nome do arquivo ou da parte
const FL_PJ = { 9: 'Aquecimento', 1: '1º tempo', 2: '2º tempo' };
function flParteNome(t) {
  const n = fNorm(t).replace(/[_\-.]/g, ' ');
  if (/aquec|warm/.test(n)) return 9;
  if (/(^|\D)1\s*(º|°|o)?\s*(t\b|tempo)|primeiro|first|1st\b|\bht1\b/.test(n)) return 1;
  if (/(^|\D)2\s*(º|°|o)?\s*(t\b|tempo)|segundo|second|2nd\b|\bht2\b/.test(n)) return 2;
  return null;
}

/* ============ vínculo de nomes (Catapult / software do salto → elenco) ============ */
// grafias diferentes do mesmo nome (Victor/Vitor, Villa/Vila, Ytalo/Italo)
const flCanon = t => fNorm(t).replace(/ct/g, 't').replace(/th/g, 't').replace(/ph/g, 'f').replace(/y/g, 'i').replace(/([a-z])\1/g, '$1');
const FL_POS_G = { goleiro: 'g', zagueiro: 'd', lateral: 'd', volante: 'm', meia: 'm', atacante: 'a', ponta: 'a', centroavante: 'a' };
const flGrupoPos = p => FL_POS_G[fNorm(p).split(' ')[0]] || null;
function flSugere(nome, pos) {
  const v = S.fl.vinc.find(x => fNorm(x.nome_origem) === fNorm(nome)); if (v) return { id: v.atleta_id ?? '', salvo: true };
  const t = flCanon(nome).split(' '), gp = pos ? flGrupoPos(pos) : null;
  const cand = S.atletas.filter(a => a.ativo && (!gp || !flGrupoPos(a.posicao) || flGrupoPos(a.posicao) === gp)), cn = a => flCanon(a.nome).split(' ');
  const unico = arr => arr.length === 1 ? arr[0] : null;
  const a = unico(cand.filter(x => cn(x).join(' ') === t.join(' ')))                                   // nome igual
    || unico(cand.filter(x => cn(x).length > 1 && cn(x).every(p => t.includes(p))))                     // todas as palavras do elenco estão no arquivo
    || unico(cand.filter(x => cn(x).length === 1 && t.includes(cn(x)[0])))                              // apelido de uma palavra (Renato)
    || unico(cand.filter(x => cn(x)[0] === t[0]))                                                        // mesmo primeiro nome, sem outro igual
    || unico(cand.filter(x => cn(x)[0].length > t[0].length && cn(x)[0].startsWith(t[0])));              // apelido derivado (Luiz → Luizinho)
  return { id: a?.id ?? '', salvo: false };
}
function conferirNomes(nomes, titulo, aoConfirmar, posDe = {}) {
  const ativos = S.atletas.filter(a => a.ativo).sort((a, b) => a.nome.localeCompare(b.nome));
  modal(`<h2>${esc(titulo)}</h2><p class="m">Confira quem é quem no elenco. Fica salvo: nas próximas importações o CINQ liga sozinho.</p>
    <div class="tablewrap"><table class="tb fl-vinc"><thead><tr><th>Nome no arquivo</th><th>Atleta do elenco</th></tr></thead><tbody>
    ${nomes.map((n, k) => { const s = flSugere(n, posDe[n]); return `<tr><td><b>${esc(n)}</b>${s.salvo ? ' <span class="badge">salvo</span>' : ''}</td><td><select class="in" data-vn="${k}">${opts(ativos.map(a => [a.id, `${a.nome} · ${a.posicao}`]), s.id, '— fora do elenco —')}</select></td></tr>`; }).join('')}
    </tbody></table></div>
    <div class="mfoot"><span class="m">“Fora do elenco” entra no relatório com o nome do arquivo.</span><div class="row"><button class="btn" id="flvc">Cancelar</button><button class="btn pri" id="flvs">Confirmar</button></div></div>`, true);
  $('#flvc').onclick = fechar;
  $('#flvs').onclick = async () => {
    const mapa = Object.fromEntries(nomes.map((n, k) => [n, $(`[data-vn="${k}"]`).value ? +$(`[data-vn="${k}"]`).value : null]));
    const usados = Object.values(mapa).filter(Boolean); if (new Set(usados).size !== usados.length) return toast('O mesmo atleta foi escolhido para dois nomes.', true);
    const { error } = await sb.from('fisl_vinculos').upsert(nomes.map(n => ({ nome_origem: n, atleta_id: mapa[n] })), { onConflict: 'nome_origem' });
    if (error) return toast(erroAmigavel(error), true);
    nomes.forEach(n => { S.fl.vinc = S.fl.vinc.filter(x => x.nome_origem !== n).concat({ nome_origem: n, atleta_id: mapa[n] }); });
    $('#flvs').disabled = true; await aoConfirmar(mapa);
  };
}

/* ============ importação ============ */
function escolherCatapult() {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.csv,text/csv'; inp.multiple = true;
  inp.onchange = async () => { const fs = [...inp.files].sort((a, b) => (flParteNome(a.name) === 9 ? -1 : flParteNome(a.name) || 5) - (flParteNome(b.name) === 9 ? -1 : flParteNome(b.name) || 5));
    for (const f of fs) { try { await importarCatapult(f); } catch (e) { toast(`${f.name}: ${e.message || erroAmigavel(e)}`, true); } } };
  inp.click();
}
async function importarCatapult(f) {
  if (/\.xlsx?$/i.test(f.name)) throw new Error('Envie o CSV como sai do OpenField (não o arquivo salvo no Excel).');
  const r = lerCatapult(await f.text()); if (!r.data) throw new Error('Não achei a data da sessão no cabeçalho do arquivo.');
  await new Promise(ok => {
    const sess = S.sessoes.filter(s => s.data === r.data), parteArq = flParteNome(f.name);
    const calJogo = sess.some(s => ['Jogo', 'Amistoso'].includes(s.tipo)), jogoGps = S.fl.sess.find(x => x.data === r.data && x.tipo === 'Jogo');
    const tipo0 = /jogo|game|partida/i.test(f.name) || parteArq || calJogo || jogoGps ? 'Jogo' : /teste|test/i.test(f.name) ? 'Teste' : 'Treino';
    const mdIni = r.md.length ? r.md : jogoGps?.md?.length ? jogoGps.md : flSugereMD(r.data), mdOrig = r.md.length ? 'do arquivo' : 'sugerido pelo calendário';
    modal(`<h2>Importar sessão do GPS</h2><p><b>${esc(fmtLong(r.data))}</b>${r.hora ? ' · início ' + esc(r.hora.slice(0, 5)) : ''} · ${r.nomes.length} atletas · ${r.periodos.length} parte${r.periodos.length === 1 ? '' : 's'}${r.duracao_s ? ' · ' + flDur(r.duracao_s) : ''}</p>
      <div class="g3"><label class="f"><span>Tipo</span><select class="in" id="flit">${opts(['Treino', 'Jogo', 'Teste'], tipo0)}</select></label>
        <label class="f"><span>Treino / jogo do calendário</span><select class="in" id="flis">${opts(sess.map(s => [s.id, `${s.turno || ''} ${s.tipo || ''} ${s.titulo || ''}`.trim()]), jogoGps?.sessao_id ?? sess[0]?.id ?? '', 'nenhum')}</select></label>
        <label class="f"><span>Título (opcional)</span><input class="in" id="flitt" placeholder="ex.: Treino tático" value="${esc(jogoGps?.titulo || '')}"></label></div>
      <div class="g3" id="fljg"><label class="f"><span>Este arquivo é</span><select class="in" id="flip">${opts([['0', 'O jogo inteiro (partes do arquivo)'], ['9', 'Aquecimento'], ['1', '1º tempo'], ['2', '2º tempo']], String(parteArq ?? 0))}</select></label>
        <div class="f fl-jgnota m">${jogoGps ? `Vai para o jogo já importado de ${dataBR(r.data)} (${esc(jogoGps.periodos.map(p => p.nome).join(', ') || 'sem partes')}). Mandar a mesma parte de novo substitui.` : 'Mande os 3 arquivos: aquecimento, 1º e 2º tempo. Total do jogo = 1º + 2º tempo; o aquecimento fica separado.'}</div></div>
      <div class="g3"><label class="f"><span>MD <small class="m">(${mdOrig})</small></span>${flMdSel('flmd1', mdIni[0])}</label><label class="f"><span>2ª tag (opcional)</span>${flMdSel('flmd2', mdIni[1])}</label>
        <div class="f m fl-jgnota">MD = dia do jogo · MD-1 = véspera · MD+1 = dia seguinte. Dá para mudar depois.</div></div>
      <p class="m">${r.periodos.map(p => esc(p.nome)).join(' · ')}</p>
      <div class="mfoot"><span class="m">${esc(f.name)}</span><div class="row"><button class="btn" id="flic">Cancelar</button><button class="btn pri" id="flio">Continuar</button></div></div>`, true);
    const vis = () => { $('#fljg').hidden = $('#flit').value !== 'Jogo'; }; vis();
    $('#flit').onchange = () => { vis(); if ($('#flit').value === 'Jogo' && !$('#flmd1').value) $('#flmd1').value = 'MD'; };
    $('#flic').onclick = () => { fechar(); ok(); };
    $('#flio').onclick = () => {
      const md = [...new Set([$('#flmd1').value, $('#flmd2').value].filter(Boolean))];
      const extra = { tipo: $('#flit').value, sessao_id: $('#flis').value ? +$('#flis').value : null, titulo: $('#flitt').value.trim() || null, md }, parte = +$('#flip').value;
      conferirNomes(r.nomes, 'Atletas do GPS', async mapa => {
        try {
          const s = extra.tipo === 'Jogo' ? await flSalvarJogo(r, f, extra, parte, mapa) : await flSalvarSessao(r, f, extra, mapa);
          S.fl.sel = s.id; S.fl.aba = 'pos'; S.fl.rev++; fechar(); toast(`${extra.tipo} de ${dataBR(r.data)} importado: ${r.nomes.length} atletas.`); pFisiologia(); ok();
        } catch (e) { $('#flvs').disabled = false; toast(erroAmigavel(e), true); }
      });
    };
  });
}
function flGuardarSessao(s, gpsNovos, apagar) {
  s.md = s.md || []; S.fl.sess = S.fl.sess.filter(x => x.id !== s.id).concat(s).sort(flOrdS);
  S.fl.gps = S.fl.gps.filter(x => !(x.sessao_id === s.id && apagar(x))).concat(gpsNovos.map(flPrep));
}
async function flSalvarSessao(r, f, extra, mapa) {
  const { data: s, error } = await sb.from('fisl_sessoes').upsert({ data: r.data, hora: r.hora, duracao_s: r.duracao_s, periodos: r.periodos, arquivo_nome: f.name, ...extra }, { onConflict: 'data,hora' }).select().single();
  if (error) throw error;
  const del = await sb.from('fisl_gps').delete().eq('sessao_id', s.id); if (del.error) throw del.error;
  const ins = await sb.from('fisl_gps').insert(r.rows.map(x => flLinhaDB(x, s.id, mapa[x.nome_origem]))).select(); if (ins.error) throw ins.error;
  flGuardarSessao(s, ins.data, () => true); return s;
}
// jogo: cada arquivo é uma parte (ou o jogo inteiro); o total (periodo 0) é refeito com todas as partes menos o aquecimento
async function flSalvarJogo(r, f, extra, parte, mapa) {
  let partes;
  if (parte) partes = [{ num: parte, nome: FL_PJ[parte], rows: r.rows.filter(x => x.periodo === 0) }];
  else if (!r.periodos.length) partes = [{ num: 1, nome: 'Jogo', rows: r.rows.filter(x => x.periodo === 0) }];
  else { const usados = new Set(); partes = r.periodos.map(p => { let n = flParteNome(p.nome); if (!n || usados.has(n)) n = 10 + p.num; usados.add(n); return { num: n, nome: n < 10 ? FL_PJ[n] : p.nome, rows: r.rows.filter(x => x.periodo === p.num) }; }); }
  const nums = partes.map(p => p.num), ordP = p => p.num === 9 ? -1 : p.num;
  let s = S.fl.sess.find(x => x.data === r.data && x.tipo === 'Jogo');
  const periodos = [...(s?.periodos || []).filter(p => !nums.includes(p.num)), ...partes.map(p => ({ num: p.num, nome: p.nome }))].sort((a, b) => ordP(a) - ordP(b));
  const base = { md: extra.md, sessao_id: extra.sessao_id ?? s?.sessao_id ?? null, titulo: extra.titulo ?? s?.titulo ?? null, periodos,
    arquivo_nome: [...new Set([...(s?.arquivo_nome || '').split(' + ').filter(Boolean), f.name])].join(' + ') };
  const q = s ? sb.from('fisl_sessoes').update(base).eq('id', s.id) : sb.from('fisl_sessoes').insert({ data: r.data, hora: r.hora, tipo: 'Jogo', ...base });
  const { data: sv, error } = await q.select().single(); if (error) throw error; s = sv;
  const del = await sb.from('fisl_gps').delete().eq('sessao_id', s.id).in('periodo', [0, ...nums]); if (del.error) throw del.error;
  const novas = partes.flatMap(p => p.rows.map(x => flLinhaDB(x, s.id, mapa[x.nome_origem], p.num)));
  const todas = [...S.fl.gps.filter(g => g.sessao_id === s.id && g.periodo > 0 && !nums.includes(g.periodo)), ...novas];
  const tot = [...new Set(todas.map(x => x.nome_origem))].map(nm => { const ps = todas.filter(x => x.nome_origem === nm && x.periodo !== 9); if (!ps.length) return null;
    return flLinhaDB({ nome_origem: nm, ...flSomaPartes(ps) }, s.id, ps[0].atleta_id ?? mapa[nm], 0); }).filter(Boolean);
  const ins = await sb.from('fisl_gps').insert([...novas, ...tot]).select(); if (ins.error) throw ins.error;
  const dur = Math.max(0, ...tot.map(t => t.duracao_s || 0)) || null;
  if (dur !== s.duracao_s) { const u = await sb.from('fisl_sessoes').update({ duracao_s: dur }).eq('id', s.id).select().single(); if (!u.error) s = u.data; }
  flGuardarSessao(s, ins.data, x => x.periodo === 0 || nums.includes(x.periodo)); return s;
}
function flEditarMD(s) {
  modal(`<h2>Tags da sessão · ${dataBR(s.data)}</h2><p class="m">Até duas tags. Sugestão pelo calendário: <b>${esc(flSugereMD(s.data).join(' · ') || 'nenhuma')}</b>.</p>
    <div class="g2"><label class="f"><span>MD</span>${flMdSel('flem1', s.md?.[0])}</label><label class="f"><span>2ª tag</span>${flMdSel('flem2', s.md?.[1])}</label></div>
    <label class="f"><span>Tipo</span><select class="in" id="flemt">${opts(['Treino', 'Jogo', 'Teste'], s.tipo)}</select></label>
    <div class="mfoot"><span></span><div class="row"><button class="btn" id="flemc">Cancelar</button><button class="btn pri" id="flems">Salvar</button></div></div>`);
  $('#flemc').onclick = fechar;
  $('#flems').onclick = async () => { const md = [...new Set([$('#flem1').value, $('#flem2').value].filter(Boolean))];
    const { data, error } = await sb.from('fisl_sessoes').update({ md, tipo: $('#flemt').value }).eq('id', s.id).select().single(); if (error) return toast(erroAmigavel(error), true);
    Object.assign(s, data, { md: data.md || [] }); S.fl.rev++; fechar(); pFisiologia(); };
}

/* ============ PÓS-TREINO ============ */
const FL_MET = [['dist', 'Distância total', 'm', 0], ['mmin', 'Distância relativa', 'm/min', 0], ['ai', 'Alta intensidade 19,8–25,2', 'm', 0], ['sprint', 'Sprint ≥25,2', 'm', 0],
  ['n_sprints', 'Nº sprints', '', 0], ['vmax', 'Vel. máxima', 'km/h', 2], ['acel_m', 'Dist. aceleração', 'm', 0], ['n_acel', 'Nº acelerações', '', 0], ['desac_m', 'Dist. desaceleração', 'm', 0],
  ['n_desac', 'Nº desacelerações', '', 0], ['pl', 'Player Load', 'UA', 0], ['plmin', 'PL/min', 'UA/min', 2]];
const flNomeParte = (s, n) => n === 0 ? (s.tipo === 'Jogo' ? 'Jogo (1º + 2º)' : 'Sessão') : s.periodos.find(p => p.num === n)?.nome || FL_PJ[n] || 'Parte ' + n;
// histórico do atleta: média das sessões anteriores do mesmo tipo (mínimo 3)
function flHist(r, s) {
  if (!r.atleta_id) return null;
  return flCache('hist', r.id, () => { const ant = flLinhasAt(r.atleta_id).filter(x => x.s.id !== s.id && x.s.tipo === s.tipo && x.s.data < s.data).map(x => x.g);
    return ant.length < 3 ? null : Object.fromEntries(['dist', 'mmin', 'ai', 'sprint', 'hsr_total', 'pl', 'plmin'].map(k => [k, flMedia(ant, k)])); });
}
const flSeta = (v, ref) => { if (v == null || !ref) return ''; const d = Math.round((v - ref) / ref * 100); return Math.abs(d) < 10 ? '' : `<small class="fl-d ${d > 0 ? 'up' : 'dn'}">${d > 0 ? '+' : ''}${d}%</small>`; };
function flDados(s) {
  const tot = flTotais(s.id).sort((a, b) => flNomeAt(a).localeCompare(flNomeAt(b), 'pt'));
  const durMax = Math.max(0, ...tot.map(r => r.duracao_s || 0)), C = flCfg('vmax');
  const per = s.periodos.map(p => { const rs = S.fl.gps.filter(g => g.sessao_id === s.id && g.periodo === p.num); return { ...p, rs, dur: Math.max(0, ...rs.map(r => r.duracao_s || 0)) || null, dist: flMedia(rs, 'dist'), mmin: flMedia(rs, 'mmin'), ai: flMedia(rs, 'ai'), hsr: flMedia(rs, 'hsr_total'), pl: flMedia(rs, 'pl') }; });
  const maior = k => tot.reduce((m, r) => (r[k] ?? -1) > (m?.[k] ?? -1) ? r : m, null);
  const dest = [];
  tot.forEach(r => { if (durMax && r.duracao_s < durMax * 0.9 && s.tipo !== 'Jogo') dest.push(['Tempo menor', r, `${flDur(r.duracao_s)} de ${flDur(durMax)}: saiu antes ou o aparelho parou de gravar`]);
    const e = flVEntrada(r), x = flExpo(e);
    if (e?.st === 'pendente') dest.push(['Pico a confirmar', r, `${flFmt(e.v, 2)} km/h passa a referência (${flFmt(e.antes, 2)}) em ${flFmt((e.v / e.antes - 1) * 100, 1)}%: confirmar se não é pico falso do GPS`, e.g.id]);
    else if (e?.recorde) dest.push(['Nova velocidade máxima', r, `${flFmt(e.v, 2)} km/h passa a ser a referência (antes ${flFmt(e.antes, 2)} km/h)`]);
    if (x?.vel) dest.push(['🔔 Velocidade máxima', r, `${flFmt(e.v, 1)} km/h = ${Math.round(x.pct)}% da referência${x.partes.length ? ` · ${x.partes.map(p => flNomeParte(s, p.periodo)).join(', ')}` : ''}`]);
    if (x?.vel && x.md1) dest.push(['MD-1 · para discutir', r, `exposição ≥${C.pct}% na véspera do jogo`]);
    const h = flHist(r, s); if (h) ['dist', 'ai', 'sprint'].forEach(k => { if (h[k] && r[k] != null && Math.abs(r[k] - h[k]) / h[k] >= 0.3) dest.push([r[k] > h[k] ? 'Acima do habitual' : 'Abaixo do habitual', r, `${FL_MET.find(m => m[0] === k)[1]}: ${flFmt(r[k])} m (média dele ${flFmt(h[k])} m)`]); });
    if (r.atleta_id && typeof situacao === 'function' && S.dm?.ok) { const st = situacao(r.atleta_id); if (st.sit !== 'Liberado') dest.push(['DM', r, `está em ${st.sit} (${st.lesao.etapa})`]);
      const lib = S.dm.lesoes.find(l => l.atleta_id === r.atleta_id && l.data_retorno && l.data_retorno <= s.data && diasEntre(l.data_retorno, s.data) <= 14);
      if (lib) dest.push(['Recém-liberado', r, `liberado em ${fmt(lib.data_retorno)} (${tituloLesao(lib)})`]); } });
  return { tot, per, durMax, maior, dest, med: Object.fromEntries(FL_MET.map(m => [m[0], flMedia(tot, m[0])])) };
}
// barras: régua = maior valor do grupo na sessão; risco = média do grupo
const flBarras = (tot, k, d = 0, suf = '', cor = '') => { const mx = Math.max(1, ...tot.map(r => +r[k] || 0)), md = flMedia(tot, k), mk = md == null ? '' : `<em class="fl-mk" style="left:${md / mx * 100}%" title="média do grupo: ${k === 'duracao_s' ? flDur(md) : flFmt(md, d) + suf}"></em>`;
  return [...tot].sort((a, b) => (+b[k] || 0) - (+a[k] || 0) || flNomeAt(a).localeCompare(flNomeAt(b), 'pt')).map(r => `<div class="bar fl-bar${cor}"><span>${esc(flNomeAt(r))}</span><div><i style="width:${(+r[k] || 0) / mx * 100}%"></i>${mk}</div><b>${k === 'duracao_s' ? flDur(r[k]) : flFmt(r[k], d) + suf}</b></div>`).join(''); };
function flTabela(s, D, pdf) {
  return `<table class="tb fl-tab"><thead><tr><th>Atleta</th><th>${s.tipo === 'Jogo' ? 'Minutos' : 'Duração'}</th><th>Total (m)</th><th>m/min</th><th>Alta int. 19,8–25,2</th><th>Sprint ≥25,2</th><th>Nº spr.</th><th>Vmáx</th><th>% vmáx</th><th>Acc (m)</th><th>Nº acc</th><th>Dcc (m)</th><th>Nº dcc</th><th>PL</th><th>PL/min</th></tr></thead><tbody>
    ${D.tot.map(r => { const h = pdf ? null : flHist(r, s);
      return `<tr${pdf ? '' : ` data-flat="${esc(r.nome_origem)}" class="dm-tr"`}><td><b>${esc(flNomeAt(r))}</b>${r.atleta_id ? '' : ' <small class="m">fora do elenco</small>'}</td><td${D.durMax && r.duracao_s < D.durMax * 0.9 && s.tipo !== 'Jogo' ? ' class="fl-curto"' : ''}>${flDur(r.duracao_s)}</td>
      <td>${flFmt(r.dist)}${flSeta(r.dist, h?.dist)}</td><td>${flFmt(r.mmin)}${flSeta(r.mmin, h?.mmin)}</td><td>${flFmt(r.ai)}${flSeta(r.ai, h?.ai)}</td><td>${flFmt(r.sprint)}${flSeta(r.sprint, h?.sprint)}</td><td>${flFmt(r.n_sprints)}</td>
      <td>${flFmt(r.vmax, 2)}</td><td>${pdf ? flPctTxt(r).replace(/<span class="badge[^>]*>([^<]*)<\/span>/g, '($1)') : flPctTxt(r)}</td><td>${flFmt(r.acel_m)}</td><td>${flFmt(r.n_acel)}</td><td>${flFmt(r.desac_m)}</td><td>${flFmt(r.n_desac)}</td><td>${flFmt(r.pl)}${flSeta(r.pl, h?.pl)}</td><td>${flFmt(r.plmin, 2)}</td></tr>`; }).join('')}
  </tbody></table>`;
}
// jogo: 1º × 2º tempo por minuto
const FL_PMIN = [['dist', 'm/min'], ['ai', 'Alta int./min'], ['sprint', 'Sprint/min'], ['accdcc', 'Acc+Dcc/min'], ['pl', 'PL/min']];
const flPorMin = (r, k) => !r || !r.duracao_s ? null : (k === 'accdcc' ? (+r.n_acel || 0) + (+r.n_desac || 0) : +r[k] || 0) / (r.duracao_s / 60);
function flTempos(s, pdf) {
  if (s.tipo !== 'Jogo' || !s.periodos.some(p => p.num === 1) || !s.periodos.some(p => p.num === 2)) return '';
  const g = S.fl.gps.filter(x => x.sessao_id === s.id), nomes = [...new Set(g.filter(x => x.periodo === 1 || x.periodo === 2).map(x => x.nome_origem))];
  const lin = nomes.map(nm => { const r1 = g.find(x => x.nome_origem === nm && x.periodo === 1), r2 = g.find(x => x.nome_origem === nm && x.periodo === 2); return { r: r1 || r2, r1, r2 }; }).sort((a, b) => flNomeAt(a.r).localeCompare(flNomeAt(b.r), 'pt'));
  const dlt = (a, b) => a && b != null ? (v => `<td class="${v <= -10 ? 'fl-neg' : v >= 10 ? 'fl-pos' : 'm'}">${v > 0 ? '+' : ''}${Math.round(v)}%</td>`)((b - a) / a * 100) : '<td>—</td>';
  const cel = (r1, r2, k) => { const a = flPorMin(r1, k), b = flPorMin(r2, k); return `<td>${flFmt(a, k === 'dist' ? 0 : 2)}</td><td>${flFmt(b, k === 'dist' ? 0 : 2)}</td>${dlt(a, b)}`; };
  const med = (p, k) => flMedia(lin.map(l => l[p]).filter(Boolean), r => flPorMin(r, k));
  return `<div class="${pdf ? '' : 'panel '}fl-tempos">${pdf ? '<h3>1º × 2º TEMPO <small>por minuto jogado</small></h3>' : '<h2>1º × 2º tempo <small class="m">por minuto jogado · Δ = 2º em relação ao 1º</small></h2>'}<div class="tablewrap"><table class="tb fl-tab"><thead>
    <tr><th rowspan="2">Atleta</th><th colspan="2">Minutos</th>${FL_PMIN.map(([, l]) => `<th colspan="3">${l}</th>`).join('')}</tr><tr><th>1º</th><th>2º</th>${FL_PMIN.map(() => '<th>1º</th><th>2º</th><th>Δ</th>').join('')}</tr></thead><tbody>
    <tr class="fl-totrow"><td><b>Média do grupo</b></td><td>${flFmt(flMedia(lin.map(l => l.r1).filter(Boolean), r => r.duracao_s / 60))}</td><td>${flFmt(flMedia(lin.map(l => l.r2).filter(Boolean), r => r.duracao_s / 60))}</td>${FL_PMIN.map(([k]) => { const a = med('r1', k), b = med('r2', k); return `<td>${flFmt(a, k === 'dist' ? 0 : 2)}</td><td>${flFmt(b, k === 'dist' ? 0 : 2)}</td>${dlt(a, b)}`; }).join('')}</tr>
    ${lin.map(l => `<tr><td><b>${esc(flNomeAt(l.r))}</b></td><td>${l.r1 ? flFmt(l.r1.duracao_s / 60) : '—'}</td><td>${l.r2 ? flFmt(l.r2.duracao_s / 60) : '—'}</td>${FL_PMIN.map(([k]) => cel(l.r1, l.r2, k)).join('')}</tr>`).join('')}
  </tbody></table></div></div>`;
}
function flAquec(s) {
  const rs = S.fl.gps.filter(g => g.sessao_id === s.id && g.periodo === 9).sort((a, b) => flNomeAt(a).localeCompare(flNomeAt(b), 'pt')); if (!rs.length) return '';
  return `<div class="panel"><h2>Aquecimento <small class="m">separado: não entra no total do jogo nem na carga</small></h2><div class="tablewrap"><table class="tb fl-tab"><thead><tr><th>Atleta</th><th>Duração</th><th>Distância</th><th>m/min</th><th>Alta int.</th><th>Sprint</th><th>Vmáx</th><th>Acc</th><th>Dcc</th><th>PL</th></tr></thead><tbody>
    ${rs.map(r => `<tr><td><b>${esc(flNomeAt(r))}</b></td><td>${flDur(r.duracao_s)}</td><td>${flFmt(r.dist)}</td><td>${flFmt(r.mmin)}</td><td>${flFmt(r.ai)}</td><td>${flFmt(r.sprint)}</td><td>${flFmt(r.vmax, 2)}</td><td>${flFmt(r.n_acel)}</td><td>${flFmt(r.n_desac)}</td><td>${flFmt(r.pl)}</td></tr>`).join('')}</tbody></table></div></div>`;
}
const flSessOpt = x => `${dataBR(x.data)} · ${x.tipo}${x.md?.length ? ' · ' + flMdTxt(x) : ''}${x.titulo ? ' · ' + x.titulo : ''}${x.hora ? ' · ' + x.hora.slice(0, 5) : ''}`;
function pPosTreino() {
  const pode = podeFisl(), sess = [...S.fl.sess].sort((a, b) => flOrdS(b, a));
  const s = flSessao(S.fl.sel) || sess[0];
  $('#main').innerHTML = topo('Fisiologia', 'Pós-treino', 'Relatório da sessão a partir do CSV do Catapult (OpenField), no padrão do Departamento de Saúde e Performance.',
    `${s ? '<button class="btn" id="flpdf">Baixar PDF</button>' : ''}${pode ? '<button class="btn pri" id="flimp">+ Importar sessão (CSV)</button>' : ''}`) + flTabs('pos') + (!s ? `<div class="panel empty">Nenhuma sessão importada ainda.${pode ? ' Use “+ Importar sessão (CSV)” com o arquivo exportado do OpenField. No jogo, mande os 3 arquivos (aquecimento, 1º e 2º tempo).' : ''}</div>` : (() => {
    const D = flDados(s), m = D.med, kpi = (l, v, sub = 'média') => `<div class="card"><div class="l">${l}</div><div class="v">${v}</div><div class="s">${sub}</div></div>`;
    const cal = s.sessao_id && S.sessoes.find(x => x.id === s.sessao_id), sinos = D.tot.filter(r => flExpo(flVEntrada(r))?.vel).length;
    return `<div class="dm-dia"><select class="in" id="flsel">${sess.map(x => `<option value="${x.id}"${x.id === s.id ? ' selected' : ''}>${esc(flSessOpt(x))}</option>`).join('')}</select>
      <b>${esc(fmtLong(s.data))}</b><span class="m">${esc(s.tipo)} · ${flDur(s.duracao_s)} · ${D.tot.length} atletas${cal ? ` · calendário: ${esc([cal.tipo, cal.titulo].filter(Boolean).join(' · '))}` : ''}</span>
      <span class="fl-mds">${(s.md || []).map(t => `<span class="badge fl-mdb">${esc(t)}</span>`).join('') || '<span class="m">sem MD</span>'}</span>${pode ? '<button class="btn sm" id="flmd">Tags / tipo</button><button class="btn sm" id="flrm">Excluir sessão</button>' : ''}</div>
    <h3 class="dc-bloco">Visão da sessão <small>média do grupo${s.tipo === 'Jogo' ? ' · jogo = 1º + 2º tempo' : ''}</small></h3>
    <div class="cards fs-kpis fl-kpis fl-r fl-r5">${kpi('Distância total', flFmt(m.dist, 1) + ' m')}${kpi('Distância relativa', flFmt(m.mmin, 1) + ' m/min')}${kpi('Alta intensidade 19,8–25,2', flFmt(m.ai, 1) + ' m')}${kpi('Sprint ≥25,2', flFmt(m.sprint, 1) + ' m')}${kpi('Nº de sprints', flFmt(m.n_sprints, 1))}</div>
    <div class="cards fs-kpis fl-kpis fl-r fl-r4">${kpi('Player Load', flFmt(m.pl, 0) + ' UA')}${kpi('PL/min', flFmt(m.plmin, 2))}${kpi('Acelerações', flFmt(m.n_acel, 1), `média · ${flFmt(m.acel_m, 1)} m`)}${kpi('Desacelerações', flFmt(m.n_desac, 1), `média · ${flFmt(m.desac_m, 1)} m`)}</div>
    <div class="cards fs-kpis fl-kpis fl-r fl-r3">${kpi('Vel. máxima', flFmt(m.vmax, 1) + ' km/h', `média · ${sinos} 🔔`)}${kpi('Maior distância', flFmt(D.maior('dist')?.dist) + ' m', esc(flNomeAt(D.maior('dist') || {})))}${kpi('Maior vel.', flFmt(D.maior('vmax')?.vmax, 1) + ' km/h', esc(flNomeAt(D.maior('vmax') || {})))}</div>
    ${D.per.length ? `<h3 class="dc-bloco">Distribuição por parte</h3><div class="fl-per">${D.per.map(p => `<div class="panel${p.num === 9 ? ' fl-aq' : ''}"><b>${esc(p.nome)}</b>${p.num === 9 ? ' <small class="m">fora do total</small>' : ''}<div class="fl-per-v"><span><small>Duração</small>${flDur(p.dur)}</span><span><small>Distância</small>${flFmt(p.dist)} m</span><span><small>m/min</small>${flFmt(p.mmin)}</span><span><small>Alta int.</small>${flFmt(p.ai)} m</span></div></div>`).join('')}</div>${flTempos(s)}${s.tipo === 'Jogo' ? '' : flPartesEx(s, D)}` : ''}
    <div class="panel"><h2>Indicadores individuais <small class="m">clique no atleta para ver cada parte · setas = diferença de 10% ou mais da média dele (a partir de 3 sessões do mesmo tipo)</small></h2><div class="tablewrap">${flTabela(s, D)}</div>
      <p class="m fl-nota">${FL_LIMIARES}. % vmáx = em relação à maior velocidade válida do atleta (treinos, jogos e teste); 🔔 = ${flCfg('vmax').pct}% ou mais.</p></div>
    ${D.dest.length ? `<div class="panel"><h2>Destaques <small class="m">o sistema sinaliza, o fisiologista decide</small></h2><div class="dc-al">${D.dest.map(([t, r, x, gid]) => `<div class="dc-ali n-${/Tempo|DM|Recém|confirmar|MD-1/.test(t) ? 'al' : 'at'}"><span class="dc-tp">${esc(t)}</span><b>${esc(flNomeAt(r))}</b><span class="m">${esc(x)}</span>${gid && pode ? `<span class="row fl-vc"><button class="btn sm pri" data-vok="${gid}">É real</button><button class="btn sm" data-vfalso="${gid}">Falso pico</button></span>` : ''}</div>`).join('')}</div></div>` : ''}
    ${flAquec(s)}
    <p class="m fl-nota fl-mkleg"><em class="fl-mk-s"></em> risco = média do grupo na sessão · barra cheia = maior valor do grupo</p>
    <div class="grid2"><div class="panel"><h2>Distância total (m)</h2><div class="fs-bars">${flBarras(D.tot, 'dist')}</div></div><div class="panel"><h2>Distância relativa (m/min)</h2><div class="fs-bars">${flBarras(D.tot, 'mmin')}</div></div>
      <div class="panel"><h2>Alta intensidade 19,8–25,2 (m)</h2><div class="fs-bars">${flBarras(D.tot, 'ai')}</div></div><div class="panel"><h2>Velocidade máxima (km/h)</h2><div class="fs-bars">${flBarras(D.tot, 'vmax', 2)}</div></div>
      <div class="panel"><h2>Sprint ≥25,2 (m)</h2><div class="fs-bars">${flBarras(D.tot, 'sprint')}</div></div><div class="panel"><h2>Nº de sprints</h2><div class="fs-bars">${flBarras(D.tot, 'n_sprints')}</div></div>
      <div class="panel"><h2>Player Load (UA)</h2><div class="fs-bars">${flBarras(D.tot, 'pl', 0, '', ' fl-pl')}</div></div><div class="panel"><h2>Player Load por minuto</h2><div class="fs-bars">${flBarras(D.tot, 'plmin', 2, '', ' fl-pl')}</div></div>
      <div class="panel"><h2>Acelerações (nº)</h2><div class="fs-bars">${flBarras(D.tot, 'n_acel', 0, '', ' fl-am')}</div></div><div class="panel"><h2>Desacelerações (nº)</h2><div class="fs-bars">${flBarras(D.tot, 'n_desac', 0, '', ' fl-am')}</div></div></div>`;
  })());
  ligarFlTabs();
  if ($('#flimp')) $('#flimp').onclick = escolherCatapult;
  if (!s) return;
  $('#flsel').onchange = e => { S.fl.sel = +e.target.value; pPosTreino(); };
  $('#flpdf').onclick = () => imprimirFl(relPosHTML(s), `Relatorio_${s.tipo}_QFC_${s.data}`);
  document.querySelectorAll('[data-flat]').forEach(tr => tr.onclick = () => flPartesAtleta(s, tr.dataset.flat));
  document.querySelectorAll('[data-vok]').forEach(b => b.onclick = () => flMarcarVmax(+b.dataset.vok, 'ok'));
  document.querySelectorAll('[data-vfalso]').forEach(b => b.onclick = () => flMarcarVmax(+b.dataset.vfalso, 'falso'));
  if (s.tipo !== 'Jogo') ligarPartesEx(s);
  if ($('#flmd')) $('#flmd').onclick = () => flEditarMD(s);
  if ($('#flrm')) $('#flrm').onclick = async () => { if (!confirm(`Excluir a sessão de ${dataBR(s.data)} e todos os dados do GPS dela?`)) return;
    const { error } = await sb.from('fisl_sessoes').delete().eq('id', s.id); if (error) return toast(erroAmigavel(error), true);
    S.fl.sess = S.fl.sess.filter(x => x.id !== s.id); S.fl.gps = S.fl.gps.filter(x => x.sessao_id !== s.id); S.fl.sel = null; toast('Sessão excluída.'); pPosTreino(); };
}
/* partes do GPS × exercícios do treino (espaço, direcionamento e a métrica-alvo de cada um) */
const flExDaParte = (s, p, k) => { const ex = s.sessao_id ? exDe(s.sessao_id) : []; if (p.exercicio_id === null) return null;
  return ex.find(e => e.id === p.exercicio_id) || (p.exercicio_id === undefined ? ex[k] : null) || null; };
function flPartesEx(s, D) {
  const pode = podeFisl(), cal = s.sessao_id && S.sessoes.find(x => x.id === s.sessao_id), ex = cal ? exDe(cal.id) : [];
  if (!cal) { const op = S.sessoes.filter(x => x.data === s.data);
    return `<div class="panel fl-pex"><h2>Partes do GPS × exercícios</h2><p class="m">${op.length ? 'Ligue esta sessão ao treino do calendário para ver o espaço e a métrica-alvo de cada exercício ao lado da carga de cada parte.' : `Não há treino no calendário em ${dataBR(s.data)}. Quando o treino estiver no calendário (com os planos de treino), dá para ligar aqui.`}</p>
      ${op.length && pode ? `<div class="row"><select class="in" id="flcal">${opts(op.map(x => [x.id, `${horaTxt(x)} · ${x.tipo}${x.titulo ? ' · ' + x.titulo : ''} (${exDe(x.id).length} exercícios)`]))}</select><button class="btn sm pri" id="flcalok">Ligar</button></div>` : ''}</div>`; }
  if (!ex.length) return `<div class="panel fl-pex"><h2>Partes do GPS × exercícios</h2><p class="m">O treino do calendário ainda não tem exercícios.</p></div>`;
  const col = (rs, k, porMin) => { const v = rs.map(r => porMin ? ((+r[k] || 0) + (+r[porMin] || 0)) / ((r.duracao_s || 0) / 60 || 1) : +r[k]).filter(x => x != null && !isNaN(x)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const alvo = (e, m) => e?.direcionamento && METRICA_DIRECAO[e.direcionamento] === m ? ' class="fl-alvo"' : '';
  return `<div class="panel fl-pex"><h2>Partes do GPS × exercícios <small class="m">média do grupo em cada parte · destaque = métrica-alvo do exercício</small></h2><div class="tablewrap"><table class="tb fl-tab"><thead><tr><th>Parte</th><th>Exercício</th><th>Espaço</th><th>m²/jog.</th><th>Direcionamento</th><th>Duração</th><th>Distância</th><th>m/min</th><th>Sprint (m)</th><th>Acel+desac/min</th></tr></thead><tbody>
    ${D.per.map((p, k) => { const e = flExDaParte(s, p, k);
      return `<tr><td><b>${esc(p.nome)}</b></td><td>${pode ? `<select class="in fl-pexs" data-pnum="${p.num}">${opts(ex.map(x => [x.id, `${x.ordem}. ${x.nome}`]), e?.id ?? '', '— nenhum —')}</select>` : esc(e?.nome || '—')}${p.exercicio_id === undefined && e ? ' <small class="m">sugestão pela ordem</small>' : ''}</td>
        <td>${esc(e ? espacoTxt(e) || '—' : '—')}</td><td>${e && m2Jog(e) ? m2Jog(e) : '—'}</td><td>${e?.espaco || e?.direcionamento ? esc([e.espaco, e.direcionamento && `${e.direcionamento} → ${METRICA_DIRECAO[e.direcionamento]}`].filter(Boolean).join(' · ')) : '—'}</td>
        <td>${flDur(p.dur)}</td><td${alvo(e, 'Distância')}>${flFmt(p.dist)} m</td><td${alvo(e, 'Distância')}>${flFmt(p.mmin)}</td><td${alvo(e, 'Sprint')}>${flFmt(col(p.rs, 'sprint'), 1)}</td><td${alvo(e, 'Acc/Dcc')}>${flFmt(col(p.rs, 'n_acel', 'n_desac'), 2)}</td></tr>`; }).join('')}
  </tbody></table></div><p class="m fl-nota">Espaço e direcionamento vêm do exercício no calendário (Editar exercício). Os limites numéricos entre espaço grande, médio e pequeno ainda serão definidos com o treinador e o fisiologista.</p></div>`;
}
function ligarPartesEx(s) {
  if ($('#flcalok')) $('#flcalok').onclick = async () => { const id = +$('#flcal').value;
    const { data, error } = await sb.from('fisl_sessoes').update({ sessao_id: id }).eq('id', s.id).select().single(); if (error) return toast(erroAmigavel(error), true);
    Object.assign(s, data); toast('Sessão ligada ao treino do calendário.'); pPosTreino(); };
  document.querySelectorAll('.fl-pexs').forEach(sel => sel.onchange = async () => {
    const per = s.periodos.map(p => p.num === +sel.dataset.pnum ? { ...p, exercicio_id: sel.value ? +sel.value : null } : p);
    const { data, error } = await sb.from('fisl_sessoes').update({ periodos: per }).eq('id', s.id).select().single(); if (error) return toast(erroAmigavel(error), true);
    Object.assign(s, data); pPosTreino(); });
}
function flPartesAtleta(s, nome) {
  const rs = S.fl.gps.filter(g => g.sessao_id === s.id && g.nome_origem === nome).sort((a, b) => (a.periodo === 9 ? -1 : a.periodo || 99) - (b.periodo === 9 ? -1 : b.periodo || 99));
  const tot = rs.find(r => r.periodo === 0), vr = flVEntrada(tot)?.ref;
  modal(`<h2>${esc(flNomeAt(tot || rs[0]))} · ${dataBR(s.data)}</h2><div class="tablewrap"><table class="tb"><thead><tr><th>Parte</th><th>Duração</th><th>Distância</th><th>m/min</th><th>Alta int. 19,8–25,2</th><th>Sprint</th><th>Vmáx</th><th>% ref.</th><th>Acc</th><th>Dcc</th><th>PL</th><th>PL/min</th></tr></thead><tbody>
    ${[...rs.filter(r => r.periodo > 0), tot].filter(Boolean).map(r => { const p = vr && r.vmax ? r.vmax / vr * 100 : null;
      return `<tr class="${r.periodo === 0 ? 'fl-totrow' : r.periodo === 9 ? 'fl-aqrow' : ''}"><td><b>${esc(flNomeParte(s, r.periodo))}</b>${r.periodo === 9 ? ' <small class="m">fora do total</small>' : ''}</td><td>${flDur(r.duracao_s)}</td><td>${flFmt(r.dist)} m</td><td>${flFmt(r.mmin)}</td><td>${flFmt(r.ai)} m</td><td>${flFmt(r.sprint)} m</td><td>${flFmt(r.vmax, 2)}</td><td>${p ? Math.round(p) + '%' + (p >= flCfg('vmax').pct ? ' 🔔' : '') : '—'}</td><td>${flFmt(r.n_acel)}</td><td>${flFmt(r.n_desac)}</td><td>${flFmt(r.pl)}</td><td>${flFmt(r.plmin, 2)}</td></tr>`; }).join('')}
    </tbody></table></div><div class="mfoot"><span class="m">${vr ? `referência de velocidade: ${flFmt(vr, 2)} km/h` : ''}</span><button class="btn" id="flpf">Fechar</button></div>`, true);
  $('#flpf').onclick = fechar;
}

/* ============ PRONTIDÃO (CMJ) ============ */
// CINQ calcula a referência de cada atleta: média das últimas n_ref avaliações anteriores, DP, SWC = 0,2 × DP.
// Antes de n_min avaliações: "em formação" (usa a referência do software se ela veio colada do relatório).
const flChaveC = c => c.atleta_id ? 'a' + c.atleta_id : 'n' + c.nome_origem;
function flCmjStats(c) {
  return flCache('cmj', c.id ?? flChaveC(c) + c.data, () => {
    const R = flCfg('prontidao'), k = flChaveC(c);
    const ant = S.fl.cmj.filter(x => flChaveC(x) === k && x.data < c.data).sort((a, b) => b.data.localeCompare(a.data)).slice(0, R.n_ref).map(x => +x.cmj);
    const n = ant.length;
    if (n >= R.n_min) { const ref = ant.reduce((a, b) => a + b, 0) / n, sd = Math.sqrt(ant.reduce((t, v) => t + (v - ref) ** 2, 0) / (n - 1)); return { ref, sd, swc: 0.2 * sd, n, fonte: 'CINQ' }; }
    if (c.ref != null) return { ref: +c.ref, sd: null, swc: c.swc != null ? +c.swc : null, n, fonte: 'software' };
    return { ref: null, n, fonte: 'formação' };
  });
}
function flLeitura(c) {
  const st = flCmjStats(c), R = flCfg('prontidao');
  if (st.ref == null) return { cq: `Referência em formação (${st.n}/${R.n_min})`, cor: 'nd', d: null, st };
  const d = c.cmj - st.ref, swc = st.swc || 0, lim = Math.max(swc, st.ref * R.ruido_pct / 100), z = st.sd ? d / st.sd : null, pct = d / st.ref * 100;
  let cor = 'ok', cq = 'Normal';
  if (z != null) {
    if (d < -lim && z < -2) [cor, cq] = ['al', 'Alerta: abaixo de −2 DP'];
    else if (d < -lim && z < -1) [cor, cq] = ['at', 'Atenção: entre −1 e −2 DP'];
    else if (d < -swc) cq = 'Normal (queda dentro do ruído)';
    else if (d > lim && z > 1) cq = 'Acima do habitual';
  } else {
    if (d < -lim) [cor, cq] = ['al', 'Queda além do ruído (ref. do software)'];
    else if (d < -swc) [cor, cq] = ['at', 'Queda pequena (ref. do software)'];
    else if (d > lim) cq = 'Melhor que o habitual';
  }
  return { cq, cor, d, z, lim, pct, st };
}
function flSemaforo(c, data) {
  const L = flLeitura(c), m = [];
  let cor = L.cor === 'al' ? 'vm' : L.cor === 'at' ? 'am' : 'vd';
  if (L.cor === 'al') m.push('CMJ abaixo de −2 DP'); else if (L.cor === 'at') m.push('CMJ entre −1 e −2 DP'); else if (L.cor === 'nd') m.push('referência do CMJ em formação');
  if (c.atleta_id && typeof situacao === 'function' && S.dm?.ok) {
    const st = situacao(c.atleta_id); if (st.sit !== 'Liberado') { m.push(`${st.sit} (${st.lesao.etapa})`); cor = 'vm'; }
    const lib = S.dm.lesoes.find(l => l.atleta_id === c.atleta_id && l.data_retorno && l.data_retorno <= data && diasEntre(l.data_retorno, data) <= 14);
    if (lib) { m.push(`recém-liberado (${fmt(lib.data_retorno)})`); if (cor === 'vd') cor = 'am'; }
  }
  if (c.atleta_id) { // carga do dia anterior acima do habitual
    const lin = flLinhasAt(c.atleta_id), ont = lin.filter(x => x.s.data < data && diasEntre(x.s.data, data) <= 1).map(x => x.g)[0];
    const med = flMedia(lin.map(x => x.g), 'dist');
    if (ont && lin.length >= 4 && med && ont.dist > med * 1.2) { m.push(`carga alta ontem (${flFmt(ont.dist)} m, média ${flFmt(med)} m)`); if (cor === 'vd') cor = 'am'; }
  }
  return { cor, motivos: m, L };
}
function pProntidao() {
  const pode = podeFisl(), datas = [...new Set(S.fl.cmj.map(c => c.data))].sort().reverse(), R = flCfg('prontidao');
  const d = S.fl.dataP && datas.includes(S.fl.dataP) ? S.fl.dataP : datas[0];
  const cs = S.fl.cmj.filter(c => c.data === d).sort((a, b) => flNomeAt(a).localeCompare(flNomeAt(b), 'pt'));
  const linhas = cs.map(c => ({ c, s: flSemaforo(c, d) })), n = k => linhas.filter(x => x.s.cor === k).length;
  const ant = c => S.fl.cmj.filter(x => flChaveC(x) === flChaveC(c) && x.data < d).sort((a, b) => b.data.localeCompare(a.data))[0];
  const medG = flMedia(cs, 'cmj'), medD = flMedia(linhas, x => x.s.L.pct);
  $('#main').innerHTML = topo('Fisiologia', 'Prontidão', 'CMJ antes do treino (1 salto). O CINQ calcula a referência de cada atleta e o semáforo junta o salto, a situação no DM e a carga do dia anterior: o sistema sinaliza, o fisiologista decide.',
    `${d ? '<button class="btn" id="flcpdf">Baixar PDF</button>' : ''}${pode ? '<button class="btn" id="flcfg">Parâmetros</button><button class="btn pri" id="flcmj">+ Lançar CMJ</button>' : ''}`) + flTabs('prontidao') + (!d ? `<div class="panel empty">Nenhum CMJ lançado ainda.${pode ? ' Use “+ Lançar CMJ” e digite o salto de cada atleta.' : ''}</div>` : `
    <div class="dm-dia"><select class="in" id="fldt">${datas.map(x => `<option value="${x}"${x === d ? ' selected' : ''}>${dataBR(x)}</option>`).join('')}</select><b>${esc(fmtLong(d))}</b>${pode ? '<button class="btn sm" id="flced">Editar este dia</button>' : ''}</div>
    <div class="cards fs-kpis fl-k5"><div class="card"><div class="l">Avaliados</div><div class="v">${cs.length}</div><div class="s">${cs.filter(c => c.atleta_id).length} do elenco</div></div>
      <div class="card"><div class="l">Média do grupo</div><div class="v">${flFmt(medG, 1)} cm</div><div class="s">${medD == null ? 'no dia' : `${medD > 0 ? '+' : ''}${flFmt(medD, 1)}% em relação às referências`}</div></div>
      <div class="card fl-c-vd"><div class="l">Verde</div><div class="v">${n('vd')}</div><div class="s">treino normal</div></div>
      <div class="card fl-c-am"><div class="l">Amarelo</div><div class="v">${n('am')}</div><div class="s">atenção</div></div>
      <div class="card fl-c-vm"><div class="l">Vermelho</div><div class="v">${n('vm')}</div><div class="s">conversar antes do treino</div></div></div>
    <div class="panel"><h2>Resultados individuais <small class="m">clique no atleta para ver a evolução com as faixas</small></h2><div class="tablewrap"><table class="tb fl-tab"><thead><tr><th></th><th>Atleta</th><th>Posição</th><th>CMJ (cm)</th><th>Ref. (cm)</th><th>DP</th><th>SWC</th><th>Δ (cm)</th><th>Δ (%)</th><th>z (DP)</th><th>Leitura</th><th>Aval.</th><th>Anterior</th><th>Motivos</th></tr></thead><tbody>
      ${linhas.map(({ c, s }) => { const a = ant(c), L = s.L, st = L.st;
        return `<tr data-flc="${esc(flChaveC(c))}" class="dm-tr"><td><i class="fl-sem fl-${s.cor}"></i></td><td><b>${esc(flNomeAt(c))}</b>${c.atleta_id ? '' : ' <small class="m">fora do elenco</small>'}</td><td>${esc(flPos(c))}</td><td><b>${flFmt(c.cmj, 2)}</b></td>
        <td>${flFmt(st.ref, 2)}${st.fonte === 'software' ? ' <small class="m">software</small>' : ''}</td><td>${flFmt(st.sd, 2)}</td><td>${flFmt(st.swc, 2)}</td>
        <td class="${L.cor === 'al' ? 'fl-neg' : ''}">${L.d == null ? '—' : (L.d > 0 ? '+' : '') + flFmt(L.d, 2)}</td><td>${L.d == null ? '—' : (L.pct > 0 ? '+' : '') + flFmt(L.pct, 1)}</td><td>${L.z == null ? '—' : (L.z > 0 ? '+' : '') + flFmt(L.z, 1)}</td>
        <td><b class="fl-l-${L.cor}">${esc(L.cq)}</b></td><td>${st.n}</td><td>${a ? `${flFmt(a.cmj, 2)} <small class="m">${fmt(a.data)}</small>` : '—'}</td><td class="m sm">${esc(s.motivos.join(' · '))}</td></tr>`; }).join('')}
    </tbody></table></div>
    <p class="m fl-nota">Referência = média das últimas ${R.n_ref} avaliações do atleta (antes do dia). DP = desvio padrão dessas avaliações; SWC = 0,2 × DP. Faixas aparecem com ${R.n_min} avaliações ou mais; antes disso, “em formação”.
      Leitura: <b>normal</b> até −1 DP · <b>atenção</b> entre −1 e −2 DP · <b>alerta</b> abaixo de −2 DP. Como é 1 salto por dia, uma queda só conta quando também passa do maior entre o SWC e o ruído do salto (${flFmt(R.ruido_pct, 1)}% da referência).</p></div>`);
  ligarFlTabs();
  if (pode) { $('#flcmj').onclick = () => formCMJ(hoje()); $('#flcfg').onclick = flParametros; if ($('#flced')) $('#flced').onclick = () => formCMJ(d); }
  if (!d) return;
  $('#fldt').onchange = e => { S.fl.dataP = e.target.value; pProntidao(); };
  $('#flcpdf').onclick = () => imprimirFl(relCmjHTML(d), `Relatorio_CMJ_QFC_${d}`);
  document.querySelectorAll('[data-flc]').forEach(tr => tr.onclick = () => flEvolucaoCMJ(tr.dataset.flc));
}
// parâmetros ajustáveis (velocidade, ACWR, prontidão)
function flParametros() {
  const V = flCfg('vmax'), A = flCfg('acwr'), R = flCfg('prontidao'), f = (id, l, v, st = 1, h = '') => `<label class="f"><span>${l}</span><input class="in" type="number" step="${st}" id="${id}" value="${v}">${h ? `<small class="m">${h}</small>` : ''}</label>`;
  modal(`<h2>Parâmetros da fisiologia</h2><p class="m">Valores de partida combinados com o fisiologista. Ele pode ajustar quando quiser; tudo é recalculado na hora.</p>
    <h4 class="dm-h4">Velocidade máxima</h4><div class="g3">${f('pv1', 'Sino 🔔 a partir de (% da referência)', V.pct)}${f('pv2', 'Alerta de dias sem exposição', V.dias)}${f('pv3', 'Jogo conta como exposição a partir de (min)', V.jogo_min)}
      ${f('pv5', 'Sessões mínimas para ter referência', V.n_min, 1, 'sem teste de velocidade')}</div>
    <h4 class="dm-h4">ACWR (semana aguda ÷ média das 4 semanas)</h4><div class="g3">${f('pa1', 'Abaixo de (alerta)', A.min, 0.05)}${f('pa2', 'Acima de (alerta)', A.max, 0.05)}</div>
    <h4 class="dm-h4">Prontidão (CMJ)</h4><div class="g3">${f('pr1', 'Ruído do salto (%)', R.ruido_pct, 0.5, 'CMJ costuma ficar entre 2% e 5%')}${f('pr2', 'Avaliações na referência', R.n_ref)}${f('pr3', 'Mínimo para mostrar as faixas', R.n_min)}</div>
    <div class="mfoot"><span></span><div class="row"><button class="btn" id="flpc">Cancelar</button><button class="btn pri" id="flps">Salvar</button></div></div>`, true);
  $('#flpc').onclick = fechar;
  $('#flps').onclick = async () => {
    const v = id => +$('#' + id).value;
    const novo = { vmax: { pct: v('pv1'), dias: v('pv2'), jogo_min: v('pv3'), salto_conf: V.salto_conf, n_min: v('pv5') }, acwr: { min: v('pa1'), max: v('pa2') }, prontidao: { ruido_pct: v('pr1'), n_ref: v('pr2'), n_min: v('pr3') } };
    if (!(novo.vmax.pct > 50 && novo.vmax.pct <= 100) || !(novo.acwr.min > 0 && novo.acwr.max > novo.acwr.min) || !(novo.prontidao.n_min >= 2 && novo.prontidao.n_ref >= novo.prontidao.n_min) || !(novo.prontidao.ruido_pct >= 0 && novo.prontidao.ruido_pct <= 15)) return toast('Confira os valores (ex.: sino entre 50 e 100%, ACWR máximo maior que o mínimo, mínimo de avaliações ≥ 2).', true);
    const { error } = await sb.from('fisl_config').upsert(Object.entries(novo).map(([chave, valor]) => ({ chave, valor })), { onConflict: 'chave' }); if (error) return toast(erroAmigavel(error), true);
    Object.assign(S.fl.cfg, novo); fechar(); toast('Parâmetros salvos.'); pFisiologia(); };
}
// cola a tabela do relatório do software: "Atleta  Posição  CMJ  Ref  Δcm  Δ%  SWC ..."
function lerTabelaCMJ(txt) {
  const out = [];
  txt.split(/\r?\n/).forEach(l => {
    const lim = l.replace(/\t/g, '  ').trim(); if (!lim || /^atleta\b/i.test(lim)) return;
    const nums = (lim.match(/[+-]?\d+(?:[.,]\d+)?/g) || []).map(x => +x.replace(',', '.'));
    const nome = lim.split(/\s+[+-]?\d/)[0].trim(); if (!nome || !nums.length) return;
    const pal = nome.split(/\s+/), posicoes = ['goleiro', 'zagueiro', 'lateral', 'volante', 'meia', 'atacante', 'ponta', 'centroavante', 'extremo'];
    let k = pal.findIndex(p => posicoes.includes(fNorm(p)));
    const nm = k > 0 ? pal.slice(0, k).join(' ') : nome, pos = k > 0 ? pal.slice(k).join(' ') : null;
    const [cmj, ref] = nums; const swc = nums.length >= 5 ? nums[4] : nums.length === 3 ? nums[2] : null;
    if (cmj > 10 && cmj < 90) out.push({ nome_origem: nm, posicao: pos, cmj, ref: ref > 10 && ref < 90 ? ref : null, swc });
  });
  return out;
}
const FL_ORD_POS = ['goleiro', 'zagueiro', 'lateral', 'volante', 'meia', 'ponta', 'atacante', 'centroavante'];
const flOrdPos = p => { const i = FL_ORD_POS.indexOf(fNorm(p).split(' ')[0]); return i < 0 ? 99 : i; };
// lançamento: lista do elenco para digitar o salto de cada um (ou colar a tabela do software)
function formCMJ(d) {
  const ativos = S.atletas.filter(a => a.ativo).sort((a, b) => flOrdPos(a.posicao) - flOrdPos(b.posicao) || a.nome.localeCompare(b.nome, 'pt'));
  const ult = a => S.fl.cmj.filter(c => c.atleta_id === a.id).sort((x, y) => y.data.localeCompare(x.data))[0];
  modal(`<h2>Lançar CMJ</h2>
    <div class="row fl-cmjtop"><label class="f"><span>Data</span><input type="date" class="in" id="flcd" value="${d}"></label><div class="ind-tabs fl-modo"><button class="on" data-cm="dig">Digitar</button><button data-cm="cola">Colar do relatório</button></div></div>
    <div id="flcdig"><p class="m">Digite a altura do salto (cm) de cada atleta. Quem não saltou fica em branco. Apagar um valor já lançado remove o salto do dia.</p>
      <input class="in fl-cbusca" id="flcbus" placeholder="Buscar atleta">
      <div class="fl-cgrid">${ativos.map(a => { const u = ult(a); return `<label class="fl-cl" data-busca="${esc(fNormQ(a.nome + ' ' + a.posicao))}"><span><b>${esc(a.nome)}</b><small>${esc(a.posicao)}${u ? ` · últ. ${flFmt(u.cmj, 1)} (${fmt(u.data)})` : ''}</small></span><input class="in" inputmode="decimal" data-ca="${a.id}" placeholder="cm"></label>`; }).join('')}</div></div>
    <div id="flccola" hidden><label class="f"><span>Cole a tabela do relatório (Atleta, Posição, CMJ, Ref., Δ cm, Δ %, SWC) — uma linha por atleta</span><textarea class="in fl-cola" id="flct" rows="9" placeholder="Antonio Villa	Meia	42,65	40,33	+2,32	+5,75	0,44"></textarea></label><div id="flcprev" class="m"></div></div>
    <div class="mfoot"><span class="m" id="flccont"></span><div class="row"><button class="btn" id="flcc">Cancelar</button><button class="btn pri" id="flcs">Salvar</button></div></div>`, true);
  let modo = 'dig';
  const preencher = () => { const dt = $('#flcd').value; document.querySelectorAll('[data-ca]').forEach(i => { const c = S.fl.cmj.find(x => x.data === dt && x.atleta_id === +i.dataset.ca); i.value = c ? String(c.cmj).replace('.', ',') : ''; i.dataset.orig = i.value; }); conta(); };
  const val = i => { const v = +String(i.value).replace(',', '.').trim(); return i.value.trim() === '' ? null : v; };
  const conta = () => { const n = [...document.querySelectorAll('[data-ca]')].filter(i => val(i) != null).length; $('#flccont').textContent = modo === 'dig' ? `${n} atleta${n === 1 ? '' : 's'} com salto` : ''; };
  preencher(); $('#flcd').onchange = preencher;
  document.querySelectorAll('[data-ca]').forEach(i => { i.oninput = conta; i.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); const L = [...document.querySelectorAll('[data-ca]')].filter(x => !x.closest('label').hidden); L[L.indexOf(i) + 1]?.focus(); } }; });
  $('#flcbus').oninput = e => { const t = fNormQ(e.target.value); document.querySelectorAll('.fl-cl').forEach(l => { l.hidden = !!t && !l.dataset.busca.includes(t); }); };
  document.querySelectorAll('[data-cm]').forEach(b => b.onclick = () => { modo = b.dataset.cm; document.querySelectorAll('[data-cm]').forEach(x => x.classList.toggle('on', x === b)); $('#flcdig').hidden = modo !== 'dig'; $('#flccola').hidden = modo !== 'cola'; $('#flcs').textContent = modo === 'dig' ? 'Salvar' : 'Continuar'; conta(); });
  const prev = () => { const r = lerTabelaCMJ($('#flct').value); $('#flcprev').innerHTML = r.length ? `${r.length} atleta${r.length > 1 ? 's' : ''}: ${r.map(x => `${esc(x.nome_origem)} ${flFmt(x.cmj, 2)}`).join(' · ')}` : ''; return r; };
  $('#flct').oninput = prev; $('#flcc').onclick = fechar;
  const concluir = (data, n) => { S.fl.dataP = data; S.fl.aba = 'prontidao'; S.fl.rev++; fechar(); toast(`CMJ de ${dataBR(data)}: ${n} atleta${n === 1 ? '' : 's'}.`); pFisiologia(); };
  $('#flcs').onclick = async () => {
    const data = $('#flcd').value; if (!data) return toast('Informe a data.', true);
    if (modo === 'dig') {
      const ins = [], del = [];
      for (const i of document.querySelectorAll('[data-ca]')) { const v = val(i), a = S.atletas.find(x => x.id === +i.dataset.ca), ex = S.fl.cmj.find(x => x.data === data && x.atleta_id === a.id);
        if (v == null) { if (ex) del.push(ex.id); continue; }
        if (!(v > 10 && v < 90)) return toast(`${a.nome}: ${i.value} cm não parece um CMJ (use cm, ex.: 41,5).`, true);
        if (ex && +ex.cmj === v) continue;
        const nomeO = ex?.nome_origem || S.fl.cmj.filter(c => c.atleta_id === a.id).sort((x, y) => y.data.localeCompare(x.data))[0]?.nome_origem || a.nome;
        ins.push({ data, nome_origem: nomeO, atleta_id: a.id, posicao: a.posicao, cmj: v }); }
      if (!ins.length && !del.length) return toast('Nada para salvar.', true);
      $('#flcs').disabled = true;
      if (ins.length) { const { data: r, error } = await sb.from('fisl_cmj').upsert(ins, { onConflict: 'data,nome_origem' }).select(); if (error) { $('#flcs').disabled = false; return toast(erroAmigavel(error), true); }
        S.fl.cmj = S.fl.cmj.filter(c => !r.some(x => x.id === c.id || (x.data === c.data && x.nome_origem === c.nome_origem))).concat(r); }
      if (del.length) { const { error } = await sb.from('fisl_cmj').delete().in('id', del); if (error) { $('#flcs').disabled = false; return toast(erroAmigavel(error), true); } S.fl.cmj = S.fl.cmj.filter(c => !del.includes(c.id)); }
      return concluir(data, S.fl.cmj.filter(c => c.data === data).length);
    }
    const r = prev(); if (!r.length) return toast('Não reconheci nenhuma linha. Confira se tem o nome e o CMJ.', true);
    conferirNomes(r.map(x => x.nome_origem), 'Atletas do CMJ', async mapa => {
      const rows = r.map(x => ({ ...x, data, atleta_id: mapa[x.nome_origem] ?? null }));
      const { data: ins, error } = await sb.from('fisl_cmj').upsert(rows, { onConflict: 'data,nome_origem' }).select();
      if (error) { $('#flvs').disabled = false; return toast(erroAmigavel(error), true); }
      S.fl.cmj = S.fl.cmj.filter(c => !(c.data === data && rows.some(x => x.nome_origem === c.nome_origem))).concat(ins); concluir(data, ins.length);
    }, Object.fromEntries(r.map(x => [x.nome_origem, x.posicao])));
  };
}
// gráfico do CMJ no modelo do software do salto: referência atual do atleta e linhas retas de ±SWC, ±1 DP e ±2 DP
// (referência = a usada na leitura do último salto: média das últimas n_ref avaliações anteriores)
function flSvgCmj(chave, ini, fim, o = {}) {
  const todos = S.fl.cmj.filter(c => flChaveC(c) === chave).sort((a, b) => a.data.localeCompare(b.data));
  const cs = todos.filter(c => (!ini || c.data >= ini) && (!fim || c.data <= fim)); if (!cs.length) return '<p class="empty">Sem CMJ no período.</p>';
  const ult = cs[cs.length - 1], st = flCmjStats(ult), R = flCfg('prontidao'), ref = st.ref, sd = st.sd, swc = st.swc;
  const W = o.W || 900, H = o.H || 300, pl = 44, pr = 64, pt = 26, pb = 30;
  const lin = ref == null ? [] : [['+2 DP', ref + 2 * sd, 'fl-c2'], ['+1 DP', ref + sd, 'fl-c1'], ['−1 DP', ref - sd, 'fl-c1'], ['−2 DP', ref - 2 * sd, 'fl-c2']].filter(l => sd);
  const vals = [...cs.map(c => +c.cmj), ...lin.map(l => l[1]), ...(ref != null ? [ref + (swc || 0), ref - (swc || 0)] : [])];
  let mn = Math.min(...vals), mx = Math.max(...vals); const pad = Math.max(0.6, (mx - mn) * 0.12); mn = Math.floor((mn - pad) * 2) / 2; mx = Math.ceil((mx + pad) * 2) / 2;
  const d0 = ini || cs[0].data, d1 = fim && fim > ult.data ? fim : ult.data, t0 = parse(d0).getTime() - 864e5, t1 = Math.max(parse(d1).getTime() + 864e5, t0 + 3 * 864e5);
  const x = d => pl + (parse(d).getTime() - t0) / (t1 - t0) * (W - pl - pr), y = v => pt + (mx - v) / (mx - mn || 1) * (H - pt - pb);
  const passoY = mx - mn > 8 ? 1 : 0.5, ty = []; for (let v = Math.ceil(mn / passoY) * passoY; v <= mx + 1e-9; v += passoY) ty.push(+v.toFixed(1));
  const nd = Math.round((t1 - t0) / 864e5), px = Math.max(1, Math.ceil(nd / 8)), tx = [...Array(Math.floor(nd / px) + 1)].map((_, k) => ymd(new Date(t0 + 864e5 + k * px * 864e5))).filter(d => parse(d).getTime() <= t1);
  const L = cs.map(c => ({ c, L: flLeitura(c) }));
  const cab = ref == null ? `Referência em formação (${st.n}/${R.n_min} avaliações)` : `Ref. (média) = ${flFmt(ref, 2)} cm${sd ? ` · DP = ${flFmt(sd, 2)}` : ''} · SWC = ${flFmt(swc, 2)}${st.fonte === 'software' ? ' · referência do software' : ` · ${st.n} avaliações`}`;
  return `<div class="fl-cmjg"><p class="fl-cmjcab"><b>${esc(o.nome || flNomeAt(ult))}</b> · ${cab}</p><svg viewBox="0 0 ${W} ${H}" class="dc-svg fl-svg">
    ${ty.map(v => `<line x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}" class="dc-g"/><text x="${pl - 6}" y="${y(v) + 4}" text-anchor="end">${flFmt(v, passoY < 1 ? 1 : 0)}</text>`).join('')}
    ${tx.map(d => `<text x="${x(d)}" y="${H - 8}" text-anchor="middle">${fmt(d)}</text>`).join('')}
    ${ref != null && swc ? `<rect x="${pl}" width="${W - pl - pr}" y="${y(ref + swc)}" height="${Math.max(1, y(ref - swc) - y(ref + swc))}" class="fl-cswc"/><text x="${W - pr + 4}" y="${y(ref + swc) + 3}" class="fl-clab">+SWC</text><text x="${W - pr + 4}" y="${y(ref - swc) + 9}" class="fl-clab">−SWC</text>` : ''}
    ${lin.map(([t, v, cl]) => `<line x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}" class="${cl}"/><text x="${W - pr + 4}" y="${y(v) + 4}" class="fl-clab ${cl}t">${t}</text>`).join('')}
    ${ref != null ? `<line x1="${pl}" x2="${W - pr}" y1="${y(ref)}" y2="${y(ref)}" class="fl-cref"/><rect x="${pl + 2}" y="${y(ref) - 9}" width="44" height="18" rx="3" class="fl-crefb"/><text x="${pl + 24}" y="${y(ref) + 4}" text-anchor="middle" class="fl-creft">${flFmt(ref, 2)}</text>` : ''}
    <polyline points="${cs.map(c => `${x(c.data)},${y(c.cmj)}`).join(' ')}" class="fl-cl"/>
    ${L.map(({ c, L: l }) => `<circle cx="${x(c.data)}" cy="${y(c.cmj)}" r="5" class="fl-pt-${l.cor}"><title>${fmt(c.data)}: ${flFmt(c.cmj, 2)} cm · ${esc(l.cq)}</title></circle><text x="${x(c.data)}" y="${y(c.cmj) - 10}" text-anchor="middle" class="fl-cval">${flFmt(c.cmj, 2)}</text>`).join('')}</svg>
    ${o.semLeg ? '' : `<p class="m fl-leg"><i class="fl-lg fl-lg-r"></i>referência (média das últimas ${R.n_ref}) <i class="fl-lg fl-lg-s"></i>±SWC <i class="fl-lg fl-lg-1"></i>±1 DP <i class="fl-lg fl-lg-2"></i>±2 DP · ponto: verde normal, amarelo atenção, vermelho alerta, cinza em formação · linhas = referência atual do atleta</p>`}</div>`;
}
function flEvolucaoCMJ(chave) {
  const cs = S.fl.cmj.filter(c => flChaveC(c) === chave).sort((a, b) => a.data.localeCompare(b.data)); if (!cs.length) return;
  modal(`<h2>${esc(flNomeAt(cs[0]))} · evolução do CMJ</h2>${flSvgCmj(chave)}
    <div class="tablewrap"><table class="tb"><thead><tr><th>Data</th><th>CMJ</th><th>Ref.</th><th>DP</th><th>z</th><th>Leitura</th></tr></thead><tbody>${cs.slice().reverse().map(c => { const L = flLeitura(c); return `<tr><td>${dataBR(c.data)}</td><td>${flFmt(c.cmj, 2)}</td><td>${flFmt(L.st.ref, 2)}</td><td>${flFmt(L.st.sd, 2)}</td><td>${L.z == null ? '—' : flFmt(L.z, 1)}</td><td class="fl-l-${L.cor}">${esc(L.cq)}</td></tr>`; }).join('')}</tbody></table></div>
    <div class="mfoot"><span></span><button class="btn" id="flef">Fechar</button></div>`, true);
  $('#flef').onclick = fechar;
}

/* ============ VELOCIDADE (o sino) ============ */
function flVelLinhas() {
  const C = flCfg('vmax'), h = hoje(), sem = segunda(h), ids = [...new Set(S.fl.gps.filter(g => g.atleta_id && g.periodo === 0).map(g => g.atleta_id))];
  return ids.map(aid => { const V = flVH(aid), ex = flExpos(aid), ultE = ex[ex.length - 1], ultS = V.lista[V.lista.length - 1];
    const dias = ultE ? diasEntre(ultE.e.s.data, h) : null;
    return { aid, a: S.atletas.find(x => x.id === aid), V, ex, ultE, ultS, dias, semana: ex.filter(o => o.e.s.data >= sem && o.e.s.data <= h).length, s4: ex.filter(o => diasEntre(o.e.s.data, h) <= 27 && o.e.s.data <= h).length,
      pend: V.lista.filter(e => e.st === 'pendente'), rec: V.lista.filter(e => e.recorde), md1: ex.filter(o => o.x.vel && o.x.md1), alerta: !ultE || dias > C.dias }; })
    .filter(x => x.a).sort((a, b) => (b.alerta - a.alerta) || ((b.dias ?? 999) - (a.dias ?? 999)) || a.a.nome.localeCompare(b.a.nome, 'pt'));
}
function pVelocidade() {
  const pode = podeFisl(), C = flCfg('vmax'), L = flVelLinhas(), pend = L.flatMap(x => x.pend.map(e => ({ x, e }))), md1 = L.flatMap(x => x.md1.map(o => ({ x, o })));
  const rec = L.flatMap(x => x.rec.map(e => ({ x, e }))).filter(o => diasEntre(o.e.s.data, hoje()) <= 30).sort((a, b) => b.e.s.data.localeCompare(a.e.s.data));
  const orig = s => s ? `${s.tipo === 'Teste' ? 'teste' : s.tipo.toLowerCase()} de ${fmt(s.data)}` : '';
  $('#main').innerHTML = topo('Fisiologia', 'Velocidade 🔔', `Referência = maior marca válida de cada atleta (treinos, jogos e teste de 30–40 m). 🔔 = pico de ${C.pct}% ou mais da referência. Jogo com ${C.jogo_min} min ou mais também conta como exposição.`,
    pode ? '<button class="btn" id="flvp">Parâmetros</button>' : '') + flTabs('velocidade') + (!L.length ? '<div class="panel empty">Sem sessões do GPS ligadas ao elenco ainda.</div>' : `
    <div class="cards fs-kpis fl-k5"><div class="card"><div class="l">Atletas</div><div class="v">${L.length}</div><div class="s">com GPS</div></div>
      <div class="card"><div class="l">Expostos esta semana</div><div class="v">${L.filter(x => x.semana).length}</div><div class="s">ao menos uma 🔔 ou jogo</div></div>
      <div class="card fl-c-vm"><div class="l">Sem exposição</div><div class="v">${L.filter(x => x.alerta).length}</div><div class="s">há mais de ${C.dias} dias</div></div>
      <div class="card fl-c-am"><div class="l">Nova referência</div><div class="v">${rec.filter(o => o.e.s.data >= segunda(hoje())).length}</div><div class="s">nesta semana</div></div>
      <div class="card"><div class="l">Novas referências</div><div class="v">${rec.length}</div><div class="s">últimos 30 dias</div></div></div>
    ${pend.length ? `<div class="panel"><h2>Picos a confirmar <small class="m">passaram a referência anterior em mais de ${C.salto_conf}%: só viram referência depois de confirmados</small></h2><div class="dc-al">${pend.map(({ x, e }) => `<div class="dc-ali n-al"><span class="dc-tp">${fmt(e.s.data)} · ${esc(e.s.tipo)}</span><b>${esc(x.a.nome)}</b><span class="m">${flFmt(e.v, 2)} km/h · referência anterior ${flFmt(e.antes, 2)} km/h (+${flFmt((e.v / e.antes - 1) * 100, 1)}%)</span>${pode ? `<span class="row fl-vc"><button class="btn sm pri" data-vok="${e.g.id}">É real</button><button class="btn sm" data-vfalso="${e.g.id}">Falso pico</button></span>` : ''}</div>`).join('')}</div></div>` : ''}
    ${md1.length ? `<div class="panel"><h2>Exposição em MD-1 <small class="m">para discutir com a comissão</small></h2><div class="dc-al">${md1.slice(-12).reverse().map(({ x, o }) => `<div class="dc-ali n-at"><span class="dc-tp">${fmt(o.e.s.data)} · MD-1</span><b>${esc(x.a.nome)}</b><span class="m">${flFmt(o.e.v, 1)} km/h = ${Math.round(o.x.pct)}% da referência</span></div>`).join('')}</div></div>` : ''}
    <div class="panel"><h2>Por atleta <small class="m">clique para ver o histórico · ordenado por quem está há mais tempo sem exposição</small></h2><div class="tablewrap"><table class="tb fl-tab"><thead><tr><th>Atleta</th><th>Posição</th><th>Referência</th><th>Origem</th><th>Última sessão</th><th>% ref.</th><th>Última exposição</th><th>Dias sem</th><th>Semana</th><th>4 semanas</th><th>Novas ref.</th></tr></thead><tbody>
      ${L.map(x => { const u = x.ultS, p = u && u.ref ? u.v / u.ref * 100 : null;
        return `<tr class="dm-tr" data-flv="${x.aid}"><td><b>${esc(x.a.nome)}</b></td><td>${esc(x.a.posicao)}</td><td>${x.V.ref ? `<b>${flFmt(x.V.ref, 2)}</b> km/h` : `<span class="m">em formação (${x.V.n}/${C.n_min})</span>`}</td><td class="m">${esc(orig(x.V.refS))}</td>
          <td>${u ? `${flFmt(u.v, 2)} <small class="m">${fmt(u.s.data)}</small>` : '—'}</td><td>${p ? Math.round(p) + '%' + (p >= C.pct ? ' 🔔' : '') : u?.st === 'pendente' ? '<span class="badge fl-pend">a confirmar</span>' : '—'}</td>
          <td>${x.ultE ? `${fmt(x.ultE.e.s.data)} <small class="m">${x.ultE.x.vel ? '🔔 ' + Math.round(x.ultE.x.pct) + '%' : 'jogo'}</small>` : '—'}</td><td class="${x.alerta ? 'fl-neg' : ''}">${x.dias == null ? 'nunca' : x.dias}</td><td>${x.semana}</td><td>${x.s4}</td><td>${x.rec.length}</td></tr>`; }).join('')}
    </tbody></table></div>
    <p class="m fl-nota">A exposição é contada por sessão (treino ou jogo) quando alguma parte teve pico ≥ ${C.pct}% (o aquecimento do jogo não conta). Como o CSV traz só a velocidade máxima de cada parte, não dá para contar quantas vezes dentro da mesma parte.
      Referência aparece com ${C.n_min} sessões do atleta ou com o teste de velocidade (sessão do tipo “Teste”). Toda marca maior que a referência, em treino ou jogo, vira a nova referência automaticamente ao subir o GPS.</p></div>
    ${rec.length ? `<div class="panel"><h2>Novas referências <small class="m">últimos 30 dias · atualizadas automaticamente pelo GPS${pode ? ' · se foi erro do GPS, use “Falso pico”' : ''}</small></h2><div class="dc-al">${rec.map(({ x, e }) => `<div class="dc-ali n-at"><span class="dc-tp">${fmt(e.s.data)} · ${esc(e.s.tipo)}</span><b>${esc(x.a.nome)}</b><span class="m">${flFmt(e.v, 2)} km/h (antes ${flFmt(e.antes, 2)} · +${flFmt((e.v / e.antes - 1) * 100, 1)}%)</span>${pode ? `<span class="row fl-vc"><button class="btn sm" data-vfalso="${e.g.id}">Falso pico</button></span>` : ''}</div>`).join('')}</div></div>` : ''}`);
  ligarFlTabs();
  if ($('#flvp')) $('#flvp').onclick = flParametros;
  document.querySelectorAll('[data-vok]').forEach(b => b.onclick = () => flMarcarVmax(+b.dataset.vok, 'ok'));
  document.querySelectorAll('[data-vfalso]').forEach(b => b.onclick = () => flMarcarVmax(+b.dataset.vfalso, 'falso'));
  document.querySelectorAll('[data-flv]').forEach(tr => tr.onclick = () => flVelAtleta(+tr.dataset.flv));
}
function flVelAtleta(aid) {
  const V = flVH(aid), a = S.atletas.find(x => x.id === aid), C = flCfg('vmax'), pode = podeFisl();
  const st = e => e.st === 'falso' ? 'falso pico' : e.recorde ? 'nova referência' : '';
  modal(`<h2>${esc(a?.nome || '')} · velocidade máxima</h2>${flGrafico([{ nome: 'Vmáx da sessão', cor: '#13295b', pts: V.lista.map(e => ({ d: e.s.data, v: e.v, sino: !!flExpo(e)?.vel, tit: `${fmt(e.s.data)} ${e.s.tipo}: ${flFmt(e.v, 2)} km/h` })) },
      { nome: 'Referência', cor: '#9aa5ad', tracejado: true, pts: V.lista.filter(e => e.ref).map(e => ({ d: e.s.data, v: e.ref })) }, { nome: `${C.pct}% da referência`, cor: '#e0a526', tracejado: true, pts: V.lista.filter(e => e.ref).map(e => ({ d: e.s.data, v: e.ref * C.pct / 100 })) }],
      V.lista[0]?.s.data || hoje(), V.lista[V.lista.length - 1]?.s.data || hoje(), { min: null })}
    <div class="tablewrap"><table class="tb"><thead><tr><th>Data</th><th>Tipo</th><th>MD</th><th>Vmáx</th><th>Referência</th><th>%</th><th>Partes ≥ ${C.pct}%</th><th>Situação</th>${pode ? '<th></th>' : ''}</tr></thead><tbody>
      ${V.lista.slice().reverse().map(e => { const x = flExpo(e); return `<tr><td>${dataBR(e.s.data)}</td><td>${esc(e.s.tipo)}</td><td>${esc(flMdTxt(e.s))}</td><td>${flFmt(e.v, 2)}</td><td>${flFmt(e.ref, 2)}</td><td>${e.ref ? Math.round(e.v / e.ref * 100) + '%' : '—'}${x?.vel ? ' 🔔' : x?.jogo ? ' <small class="m">jogo</small>' : ''}</td>
        <td class="m">${x?.partes?.length ? esc(x.partes.map(p => flNomeParte(e.s, p.periodo)).join(', ')) : ''}</td><td>${esc(st(e))}</td>${pode ? `<td>${e.st === 'falso' ? `<button class="btn sm" data-vok="${e.g.id}">Desfazer falso pico</button>` : ''}${e.st !== 'falso' && (e.st === 'pendente' || e.recorde) ? `<button class="btn sm" data-vfalso="${e.g.id}">Falso pico</button>` : ''}</td>` : ''}</tr>`; }).join('')}
    </tbody></table></div><div class="mfoot"><span></span><button class="btn" id="flvf">Fechar</button></div>`, true);
  $('#flvf').onclick = fechar;
  document.querySelectorAll('#modal [data-vok]').forEach(b => b.onclick = () => { fechar(); flMarcarVmax(+b.dataset.vok, 'ok'); });
  document.querySelectorAll('#modal [data-vfalso]').forEach(b => b.onclick = () => { fechar(); flMarcarVmax(+b.dataset.vfalso, 'falso'); });
}

/* ============ período e filtros (Carga e Evolução) ============ */
const FL_PER = [['semana', 'Semana'], ['micro', 'Microciclo'], ['mes', 'Mês'], ['4sem', 'Últimas 4 semanas'], ['temporada', 'Temporada'], ['pers', 'Personalizado']];
function flIntervalo(p) {
  const r = p.ref || hoje();
  if (p.per === 'semana') { const i = segunda(r); return [i, addDays(i, 6), `Semana de ${fmt(i)} a ${fmt(addDays(i, 6))}`]; }
  if (p.per === 'mes') { const i = r.slice(0, 7) + '-01', d = parse(i); d.setMonth(d.getMonth() + 1); d.setDate(0); return [i, ymd(d), parse(i).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })]; }
  if (p.per === 'micro') { const m = S.micros.find(x => x.inicio <= r && x.fim >= r); if (m) return [m.inicio, m.fim, `${m.nome} · ${fmt(m.inicio)} a ${fmt(m.fim)}`]; const i = segunda(r); return [i, addDays(i, 6), `Sem microciclo · semana de ${fmt(i)}`]; }
  if (p.per === '4sem') return [addDays(r, -27), r, `${fmt(addDays(r, -27))} a ${fmt(r)}`];
  if (p.per === 'temporada') { const ds = S.fl.sess.map(s => s.data).sort(); return [ds[0] || r, ds[ds.length - 1] > r ? ds[ds.length - 1] : r, 'Todas as sessões']; }
  return [p.ini || addDays(r, -27), p.fim || r, 'Personalizado'];
}
function flMover(p, n) {
  const r = p.ref || hoje();
  if (p.per === 'semana') p.ref = addDays(r, 7 * n);
  else if (p.per === '4sem') p.ref = addDays(r, 28 * n);
  else if (p.per === 'mes') { const d = parse(r.slice(0, 7) + '-01'); d.setMonth(d.getMonth() + n); p.ref = ymd(d); }
  else if (p.per === 'micro') { const ms = [...S.micros].sort((a, b) => a.inicio.localeCompare(b.inicio)), at = ms.findIndex(x => x.inicio <= r && x.fim >= r);
    const alvo = at >= 0 ? ms[at + n] : n > 0 ? ms.find(x => x.inicio > r) : [...ms].reverse().find(x => x.fim < r); p.ref = alvo ? alvo.inicio : addDays(r, 7 * n); }
}
const flPerHTML = (p, pre) => { const [i, f, t] = flIntervalo(p), nav = ['semana', 'mes', 'micro', '4sem'].includes(p.per);
  return `<select class="in" id="${pre}per">${opts(FL_PER, p.per)}</select>${nav ? `<button class="btn sm" id="${pre}a">◀</button><b>${esc(t)}</b><button class="btn sm" id="${pre}p">▶</button>${p.ref && p.ref !== hoje() ? `<button class="btn sm" id="${pre}h">Hoje</button>` : ''}`
    : p.per === 'pers' ? `<input type="date" class="in" id="${pre}i" value="${i}"><span>a</span><input type="date" class="in" id="${pre}f" value="${f}">` : `<b>${esc(t)}</b>`}`; };
function flLigarPer(p, pre, re) {
  $('#' + pre + 'per').onchange = e => { const [i, f] = flIntervalo(p); p.per = e.target.value; if (p.per === 'pers') { p.ini = i; p.fim = f; } re(); };
  if ($('#' + pre + 'a')) { $('#' + pre + 'a').onclick = () => { flMover(p, -1); re(); }; $('#' + pre + 'p').onclick = () => { flMover(p, 1); re(); }; }
  if ($('#' + pre + 'h')) $('#' + pre + 'h').onclick = () => { p.ref = null; re(); };
  if ($('#' + pre + 'i')) { $('#' + pre + 'i').onchange = e => { p.ini = e.target.value; re(); }; $('#' + pre + 'f').onchange = e => { p.fim = e.target.value; re(); }; }
}
const flPosicoes = () => [...new Set(S.atletas.filter(a => a.ativo).map(a => a.posicao).filter(Boolean))].sort((a, b) => flOrdPos(a) - flOrdPos(b) || a.localeCompare(b));
const flAtsGps = () => [...new Set(S.fl.gps.filter(g => g.atleta_id && g.periodo === 0).map(g => g.atleta_id))].map(id => S.atletas.find(a => a.id === id)).filter(Boolean).sort((a, b) => a.nome.localeCompare(b.nome, 'pt'));
const flFiltrosHTML = (f, pre, comAt = true) => `<select class="in" id="${pre}pos">${opts(flPosicoes(), f.pos, 'Todas as posições')}</select>
  ${comAt ? `<select class="in" id="${pre}at">${opts(flAtsGps().map(a => [a.id, a.nome]), f.at, 'Todos os atletas')}</select>` : ''}<select class="in" id="${pre}md">${opts(MD_TAGS, f.md, 'Todos os MD')}</select><select class="in" id="${pre}tp">${opts(['Treino', 'Jogo', 'Teste'], f.tipo, 'Treino e jogo')}</select>`;
function flLigarFiltros(f, pre, re) { [['pos', 'pos'], ['at', 'at'], ['md', 'md'], ['tp', 'tipo']].forEach(([i, k]) => { if ($('#' + pre + i)) $('#' + pre + i).onchange = e => { f[k] = e.target.value; re(); }; }); }
function flFiltrar(f, ini, fim) {
  const ss = S.fl.sess.filter(s => s.data >= ini && s.data <= fim && (!f.tipo || s.tipo === f.tipo) && (!f.md || (s.md || []).includes(f.md))).sort(flOrdS), ids = new Set(ss.map(s => s.id));
  const rs = S.fl.gps.filter(g => ids.has(g.sessao_id) && g.periodo === 0 && (!f.at || g.atleta_id === +f.at) && (!f.pos || flPos(g) === f.pos));
  return { ss: ss.filter(s => rs.some(r => r.sessao_id === s.id)), rs };
}
// métricas da carga; taxas (por minuto) = soma da base ÷ minutos
const FL_CM = [['dist', 'Distância', 'm', 0], ['ai', 'Alta int. 19,8–25,2', 'm', 0], ['sprint', 'Sprint ≥25,2', 'm', 0], ['n_sprints', 'Nº sprints', '', 0],
  ['acel_m', 'Dist. acc', 'm', 0], ['n_acel', 'Nº acc', '', 0], ['desac_m', 'Dist. dcc', 'm', 0], ['n_desac', 'Nº dcc', '', 0], ['pl', 'PL', 'UA', 0], ['plmin', 'PL/min', '', 2], ['mmin', 'm/min', '', 0]];
const FL_TAXA = { plmin: 'pl', mmin: 'dist' };
function flAgg(rs, k, modo = 'soma') {
  if (!rs.length) return null;
  if (FL_TAXA[k]) { const min = flSoma(rs, 'duracao_s') / 60; return min ? flSoma(rs, FL_TAXA[k]) / min : null; }
  const s = flSoma(rs, k); return modo === 'media' ? s / rs.length : s;
}
// ACWR 7:28 (média simples): soma dos últimos 7 dias ÷ (soma dos últimos 28 dias ÷ 4)
const FL_ACWR = [['dist', 'Distância'], ['ai', 'Alta int. 19,8–25,2'], ['sprint', 'Sprint'], ['accdcc', 'Acc+Dcc (nº)'], ['pl', 'Player Load']];
const flValK = (g, k) => k === 'accdcc' ? (+g.n_acel || 0) + (+g.n_desac || 0) : +g[k] || 0;
function flAcwr(aid, dia, k) {
  return flCache('acwr', `${aid}|${dia}|${k}`, () => {
    const lin = flLinhasAt(aid), prim = lin[0]?.s.data;
    if (!prim || prim > dia) return { formacao: true, dias: 0 };
    const dd0 = diasEntre(prim, dia); if (dd0 < 27) return { formacao: true, dias: dd0 + 1 };
    let a = 0, c = 0; for (const x of lin) { const dd = diasEntre(x.s.data, dia); if (dd < 0 || dd > 27) continue; const v = flValK(x.g, k); c += v; if (dd <= 6) a += v; }
    const cr = c / 4; return { a, c: cr, r: cr ? a / cr : null };
  });
}
const flZona = r => { const A = flCfg('acwr'); return r == null ? '' : r > A.max ? 'alto' : r < A.min ? 'baixo' : 'ok'; };
// gráfico por dia: escala a partir de perto do menor valor (diferença visível), colunas + linha de tendência
function flGrafDia(porDia, met) {
  const vs = porDia.filter(p => p.v != null).map(p => p.v); if (!vs.length) return '<p class="empty">Sem dados no período.</p>';
  const mx = Math.max(...vs), mn = Math.min(...vs), rng = mx - mn || mx || 1;
  const passo = (() => { const r = (mx - Math.max(0, mn - rng * .4)) / 4, e = Math.pow(10, Math.floor(Math.log10(r || 1))), f = r / e; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * e; })();
  let base = Math.max(0, Math.floor((mn - rng * .4) / passo) * passo); if (vs.length === 1 || mx === mn) base = 0;
  const topo = Math.ceil(mx / passo) * passo + (Math.ceil(mx / passo) * passo - mx < passo * .25 ? passo : 0);
  const n = porDia.length, cw = Math.max(44, Math.min(110, 1000 / n)), L = 56, R = 12, T = 22, H = 170, B = 40, W = L + n * cw + R;
  const y = v => T + H - (v - base) / (topo - base) * H, bw = Math.min(cw * .58, 40);
  const fx = v => flFmt(v, met[3]), ticks = []; for (let t = base; t <= topo + 1e-9; t += passo) ticks.push(t);
  const pts = porDia.map((p, i) => p.v == null ? null : [L + i * cw + cw / 2, y(p.v)]).filter(Boolean);
  const sem = s => parse(s).toLocaleDateString('pt-BR', { weekday: 'short' }).slice(0, 3);
  return `<div class="fl-gd"><svg viewBox="0 0 ${W} ${T + H + B}" style="min-width:${Math.min(W, 640)}px" role="img" aria-label="${esc(met[1])} por dia">
    ${ticks.map(t => `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" class="fl-gd-g"/><text x="${L - 6}" y="${y(t) + 4}" text-anchor="end" class="fl-gd-y">${fx(t)}</text>`).join('')}
    ${porDia.map((p, i) => { const cx = L + i * cw + cw / 2; return `${p.v != null ? `<rect x="${cx - bw / 2}" y="${y(p.v)}" width="${bw}" height="${T + H - y(p.v)}" rx="4" class="${p.t?.tipo === 'Jogo' ? 'fl-gd-j' : 'fl-gd-b'}"><title>${fmt(p.d)} · ${fx(p.v)}</title></rect><text x="${cx}" y="${y(p.v) - 14}" text-anchor="middle" class="fl-gd-v">${fx(p.v)}</text>` : ''}
      <text x="${cx}" y="${T + H + 16}" text-anchor="middle" class="fl-gd-x">${sem(p.d)} ${fmt(p.d).slice(0, 2)}</text>${p.md ? `<text x="${cx}" y="${T + H + 30}" text-anchor="middle" class="fl-gd-x fl-gd-md">${esc(p.md)}</text>` : ''}`; }).join('')}
    ${pts.length > 1 ? `<polyline points="${pts.map(q => q.join(',')).join(' ')}" class="fl-gd-l"/>` : ''}${pts.map(q => `<circle cx="${q[0]}" cy="${q[1]}" r="4" class="fl-gd-p"/>`).join('')}
  </svg></div><p class="m fl-nota">Escala a partir de ${fx(base)} para destacar a diferença entre os dias · linha = tendência (onda de alta e baixa)${porDia.some(p => p.t?.tipo === 'Jogo') ? ' · vermelho = jogo' : ''}.</p>`;
}
function pCargaFl() {
  const f = S.fl.cf, [ini, fim] = flIntervalo(f), { ss, rs } = flFiltrar(f, ini, fim), A = flCfg('acwr'), met = FL_CM.find(m => m[0] === f.met) || FL_CM[0];
  const cab = FL_CM.map(m => `<th>${m[1]}${m[2] && m[2] !== '' ? ` <small>(${m[2]})</small>` : ''}</th>`).join('');
  const cel = (arr, modo) => FL_CM.map(m => `<td>${flFmt(flAgg(arr, m[0], modo), m[3])}</td>`).join('');
  let corpo;
  if (f.vis === 'sessao') {
    const lin = ss.map(s => { const x = rs.filter(r => r.sessao_id === s.id); return { s, x, med: Object.fromEntries(FL_CM.map(m => [m[0], FL_TAXA[m[0]] ? flAgg(x, m[0]) : flMedia(x, m[0])])) }; });
    const medS = k => flMedia(lin, l => l.med[k]), somaS = k => FL_TAXA[k] ? null : lin.reduce((t, l) => t + (l.med[k] || 0), 0);
    corpo = `<h2>Por sessão <small class="m">média do grupo em cada sessão (filtros aplicados)</small></h2>${lin.length ? `<div class="tablewrap"><table class="tb fl-tab"><thead><tr><th>Data</th><th>Tipo</th><th>MD</th><th>Atletas</th><th>Min</th>${cab}</tr></thead><tbody>
      ${lin.map(l => `<tr class="dm-tr" data-fls="${l.s.id}"><td><b>${dataBR(l.s.data)}</b></td><td>${esc(l.s.tipo)}</td><td>${esc(flMdTxt(l.s))}</td><td>${l.x.length}</td><td>${flFmt(flMedia(l.x, r => r.duracao_s / 60))}</td>${FL_CM.map(m => `<td>${flFmt(l.med[m[0]], m[3])}</td>`).join('')}</tr>`).join('')}
      <tr class="fl-totrow"><td colspan="5">Média por sessão</td>${FL_CM.map(m => `<td>${flFmt(medS(m[0]), m[3])}</td>`).join('')}</tr>
      <tr class="fl-totrow"><td colspan="5">Soma do período <small class="m">(médias do grupo)</small></td>${FL_CM.map(m => `<td>${FL_TAXA[m[0]] ? '—' : flFmt(somaS(m[0]), m[3])}</td>`).join('')}</tr></tbody></table></div>` : '<p class="empty">Nenhuma sessão com esses filtros.</p>'}`;
  } else {
    const ids = [...new Set(rs.map(r => r.atleta_id ? 'a' + r.atleta_id : 'n' + r.nome_origem))];
    const lin = ids.map(k => { const x = rs.filter(r => (r.atleta_id ? 'a' + r.atleta_id : 'n' + r.nome_origem) === k); return { r: x[0], x }; }).sort((a, b) => (flAgg(b.x, met[0], f.modo) || 0) - (flAgg(a.x, met[0], f.modo) || 0));
    corpo = `<h2>Por atleta <small class="m">${f.modo === 'soma' ? 'soma do período' : 'média por sessão'} · ordenado por ${esc(met[1])} · PL/min e m/min = total ÷ minutos</small></h2>${lin.length ? `<div class="tablewrap"><table class="tb fl-tab"><thead><tr><th>Atleta</th><th>Posição</th><th>Sessões</th><th>Minutos</th>${cab}</tr></thead><tbody>
      ${lin.map(l => `<tr><td><b>${esc(flNomeAt(l.r))}</b></td><td>${esc(flPos(l.r))}</td><td>${l.x.length}</td><td>${flFmt(f.modo === 'soma' ? flSoma(l.x, 'duracao_s') / 60 : flSoma(l.x, 'duracao_s') / 60 / l.x.length)}</td>${cel(l.x, f.modo)}</tr>`).join('')}
      <tr class="fl-totrow"><td colspan="4">Média do grupo</td>${FL_CM.map(m => `<td>${flFmt(flMedia(lin, l => flAgg(l.x, m[0], f.modo)), m[3])}</td>`).join('')}</tr></tbody></table></div>` : '<p class="empty">Nenhuma sessão com esses filtros.</p>'}`;
  }
  // barras por dia (média do grupo da métrica escolhida)
  const dias = diasEntre(ini, fim) <= 42 ? [...Array(diasEntre(ini, fim) + 1)].map((_, k) => addDays(ini, k)) : [];
  const porDia = dias.map(d => { const x = rs.filter(r => flSessao(r.sessao_id)?.data === d); return { d, v: x.length ? (FL_TAXA[met[0]] ? flAgg(x, met[0]) : flMedia(x, met[0])) : null, t: ss.find(s => s.data === d), md: ss.filter(s => s.data === d).flatMap(s => s.md || [])[0] }; });
  // ACWR na data final do período (ou hoje)
  const dRef = fim < hoje() ? fim : hoje(), atsA = flAtsGps().filter(a => (!f.pos || a.posicao === f.pos) && (!f.at || a.id === +f.at));
  const acw = atsA.map(a => ({ a, v: FL_ACWR.map(([k]) => flAcwr(a.id, dRef, k)) }));
  $('#main').innerHTML = topo('Fisiologia', 'Carga', 'Carga externa do GPS no período (o aquecimento do jogo fica fora). Por sessão = média do grupo; por atleta = soma ou média por sessão.', podeFisl() ? '<button class="btn" id="flcp">Parâmetros</button>' : '') + flTabs('carga') + `
    <div class="dm-dia fl-filtros">${flPerHTML(f, 'flc')}</div>
    <div class="dm-dia fl-filtros">${flFiltrosHTML(f, 'flc')}<span class="fl-sep"></span>
      <div class="ind-tabs fl-modo"><button data-cv="atleta" class="${f.vis === 'atleta' ? 'on' : ''}">Por atleta</button><button data-cv="sessao" class="${f.vis === 'sessao' ? 'on' : ''}">Por sessão</button></div>
      ${f.vis === 'atleta' ? `<div class="ind-tabs fl-modo"><button data-cmo="soma" class="${f.modo === 'soma' ? 'on' : ''}">Soma</button><button data-cmo="media" class="${f.modo === 'media' ? 'on' : ''}">Média/sessão</button></div>` : ''}
      <span class="m">${ss.length} ${ss.length === 1 ? 'sessão' : 'sessões'} · ${new Set(rs.map(r => r.nome_origem)).size} atletas</span></div>
    ${dias.length ? `<div class="panel"><h2>${esc(met[1])} por dia <small class="m">média do grupo · escolha a métrica:</small> <select class="in sm" id="flcmet">${opts(FL_CM.map(m => [m[0], m[1]]), f.met)}</select></h2>${flGrafDia(porDia, met)}</div>` : `<div class="m fl-nota">Métrica para ordenar: <select class="in sm" id="flcmet">${opts(FL_CM.map(m => [m[0], m[1]]), f.met)}</select></div>`}
    <div class="panel">${corpo}<p class="m fl-nota">${FL_LIMIARES}.</p></div>
    <div class="panel"><h2>ACWR 7:28 em ${fmt(dRef)} <small class="m">carga dos últimos 7 dias ÷ média semanal das últimas 4 semanas · ok entre ${flFmt(A.min, 2)} e ${flFmt(A.max, 2)}</small></h2>
      ${acw.length ? `<div class="tablewrap"><table class="tb fl-tab"><thead><tr><th>Atleta</th><th>Posição</th>${FL_ACWR.map(([, l]) => `<th>${l}</th>`).join('')}</tr></thead><tbody>
      ${acw.map(({ a, v }) => `<tr><td><b>${esc(a.nome)}</b></td><td>${esc(a.posicao)}</td>${v.map(x => x.formacao ? `<td class="m" title="precisa de 4 semanas de dados">em formação (${x.dias}/28 d)</td>` : `<td class="fl-acwr fl-acwr-${flZona(x.r)}" title="7 dias: ${flFmt(x.a)} · média semanal 28 dias: ${flFmt(x.c)}">${flFmt(x.r, 2)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '<p class="empty">Sem atletas com esses filtros.</p>'}
      <p class="m fl-nota">Referência K-Sport, média simples, dias corridos (filtro de MD e de tipo não se aplica aqui: o ACWR usa todas as sessões). <b class="fl-acwr-alto">acima de ${flFmt(A.max, 2)}</b> = semana bem acima do habitual · <b class="fl-acwr-baixo">abaixo de ${flFmt(A.min, 2)}</b> = abaixo do habitual (risco de destreino ou de pico depois). É contexto para a decisão, não previsão de lesão. Mostra a partir de 4 semanas de dados do atleta.</p></div>`;
  ligarFlTabs();
  const re = () => pCargaFl();
  flLigarPer(f, 'flc', re); flLigarFiltros(f, 'flc', re);
  $('#flcmet').onchange = e => { f.met = e.target.value; re(); };
  document.querySelectorAll('[data-cv]').forEach(b => b.onclick = () => { f.vis = b.dataset.cv; re(); });
  document.querySelectorAll('[data-cmo]').forEach(b => b.onclick = () => { f.modo = b.dataset.cmo; re(); });
  document.querySelectorAll('[data-fls]').forEach(tr => tr.onclick = () => { S.fl.sel = +tr.dataset.fls; S.fl.aba = 'pos'; pFisiologia(); window.scrollTo(0, 0); });
  if ($('#flcp')) $('#flcp').onclick = flParametros;
}

/* ============ gráfico de linhas (SVG) ============ */
const FL_CORES = ['#13295b', '#e0a526', '#2e9e5b', '#d64545', '#7a5af8', '#0e9384', '#c4320a'];
function flGrafico(series, ini, fim, o = {}) {
  const W = 900, H = o.H || 260, pl = 46, pr = 14, pt = 18, pb = 28;
  const all = series.flatMap(s => s.pts.map(p => p.v)).filter(v => v != null && isFinite(v));
  if (!all.length) return '<p class="empty">Sem dados no período.</p>';
  let mn = o.min === undefined ? Math.min(0, ...all) : o.min ?? Math.min(...all) * 0.95, mx = Math.max(...all) * 1.08 || 1;
  if (o.zona) { mn = Math.min(mn, 0); mx = Math.max(mx, o.zona[1] * 1.25); }
  const t0 = parse(ini).getTime(), t1 = Math.max(parse(fim).getTime(), t0 + 864e5);
  const x = d => pl + (parse(d).getTime() - t0) / (t1 - t0) * (W - pl - pr), y = v => pt + (mx - v) / (mx - mn || 1) * (H - pt - pb);
  const dec = mx - mn < 5 ? 2 : mx - mn < 50 ? 1 : 0, ty = [0, 1, 2, 3].map(k => mn + (mx - mn) * k / 3);
  const nd = Math.round((t1 - t0) / 864e5), passo = Math.max(1, Math.ceil(nd / 8)), tx = [...Array(Math.floor(nd / passo) + 1)].map((_, k) => addDays(ini, k * passo));
  const seg = pts => { const out = []; let cur = []; pts.forEach(p => { if (p.v == null || !isFinite(p.v)) { if (cur.length) out.push(cur); cur = []; } else cur.push(p); }); if (cur.length) out.push(cur); return out; };
  return `<svg viewBox="0 0 ${W} ${H}" class="dc-svg fl-svg">${o.zona ? `<rect x="${pl}" width="${W - pl - pr}" y="${y(o.zona[1])}" height="${y(o.zona[0]) - y(o.zona[1])}" class="fl-zona"/><line x1="${pl}" x2="${W - pr}" y1="${y(o.zona[1])}" y2="${y(o.zona[1])}" class="fl-zl"/><line x1="${pl}" x2="${W - pr}" y1="${y(o.zona[0])}" y2="${y(o.zona[0])}" class="fl-zl"/>` : ''}
    ${ty.map(v => `<line x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}" class="dc-g"/><text x="${pl - 6}" y="${y(v) + 4}" text-anchor="end">${flFmt(v, dec)}</text>`).join('')}
    ${tx.map(d => `<text x="${x(d)}" y="${H - 8}" text-anchor="middle">${fmt(d)}</text>`).join('')}
    ${series.map((s, i) => { const c = s.cor || FL_CORES[i % FL_CORES.length];
      return seg(s.pts).map(sg => `<polyline points="${sg.map(p => `${x(p.d)},${y(p.v)}`).join(' ')}" fill="none" stroke="${c}" stroke-width="${s.tracejado ? 1.6 : 2.4}"${s.tracejado ? ' stroke-dasharray="5 4"' : ''}/>`).join('')
        + (s.tracejado ? '' : s.pts.filter(p => p.v != null && isFinite(p.v)).map(p => `<circle cx="${x(p.d)}" cy="${y(p.v)}" r="3.8" fill="${c}"><title>${esc(s.nome)} · ${esc(p.tit || `${fmt(p.d)}: ${flFmt(p.v, dec)}`)}</title></circle>${p.sino ? `<text x="${x(p.d)}" y="${y(p.v) - 7}" text-anchor="middle" class="fl-sinot">🔔</text>` : ''}`).join('')); }).join('')}</svg>
    <div class="fl-leg">${series.map((s, i) => `<span><i style="background:${s.cor || FL_CORES[i % FL_CORES.length]}"${s.tracejado ? ' class="tr"' : ''}></i>${esc(s.nome)}</span>`).join('')}${o.zona ? `<span><i class="fl-lgz"></i>zona ok ${flFmt(o.zona[0], 2)}–${flFmt(o.zona[1], 2)}</span>` : ''}</div>`;
}

/* ============ EVOLUÇÃO ============ */
const FL_EVM = [...FL_CM, ['vmax', 'Vel. máxima', 'km/h', 2], ['vpct', '% da vel. máxima', '%', 0], ['duracao', 'Minutos', 'min', 0]];
const flValEv = (g, k) => k === 'vpct' ? (e => e?.ref && e.st !== 'falso' ? e.v / e.ref * 100 : null)(flVEntrada(g)) : k === 'duracao' ? (g.duracao_s || 0) / 60 : g[k] == null ? null : +g[k];
function pEvolucao() {
  const f = S.fl.ev, [ini, fim] = flIntervalo(f), met = FL_EVM.find(m => m[0] === f.met) || FL_EVM[0], ats = flAtsGps(), A = flCfg('acwr');
  if (f.modo === 'atletas' && !f.ats.length && ats.length) f.ats = [ats[0].id];
  const { ss, rs } = flFiltrar({ ...f, pos: '', at: '' }, ini, fim);
  const pontos = sel => ss.map(s => { const x = rs.filter(r => r.sessao_id === s.id && sel(r)); if (!x.length) return null;
    const v = x.length === 1 ? flValEv(x[0], met[0]) : FL_TAXA[met[0]] ? flAgg(x, met[0]) : flMedia(x, r => flValEv(r, met[0]));
    return { d: s.data, v, sino: x.length === 1 && !!flExpo(flVEntrada(x[0]))?.vel, tit: `${fmt(s.data)} ${s.tipo}${s.md?.length ? ' ' + flMdTxt(s) : ''}: ${flFmt(v, met[3])} ${met[2]}` }; }).filter(Boolean);
  const series = f.modo === 'atletas' ? f.ats.map(id => ({ nome: S.atletas.find(a => a.id === id)?.nome || '?', pts: pontos(r => r.atleta_id === id) }))
    : (f.pos ? [f.pos] : flPosicoes()).map(p => ({ nome: p, pts: pontos(r => flPos(r) === p) })).filter(s => s.pts.length);
  series.push({ nome: 'Média do grupo', cor: '#9aa5ad', tracejado: true, pts: pontos(() => true) });
  const kA = { dist: 'dist', ai: 'ai', sprint: 'sprint', n_acel: 'accdcc', n_desac: 'accdcc', pl: 'pl' }[met[0]], dias = Math.min(diasEntre(ini, fim), 180);
  const acwrS = kA && f.modo === 'atletas' ? f.ats.map(id => ({ nome: S.atletas.find(a => a.id === id)?.nome || '?', pts: [...Array(dias + 1)].map((_, k) => { const d = addDays(ini, k), r = d <= hoje() ? flAcwr(id, d, kA) : {}; return { d, v: r.r ?? null }; }) })) : [];
  const cmjAt = f.modo === 'atletas' ? f.ats.filter(id => S.fl.cmj.some(c => c.atleta_id === id)) : [];
  $('#main').innerHTML = topo('Fisiologia', 'Evolução', 'Acompanhamento do atleta ou da posição ao longo do tempo: cada ponto é uma sessão (o jogo conta 1º + 2º tempo).', '') + flTabs('evolucao') + `
    <div class="dm-dia fl-filtros">${flPerHTML(f, 'fle')}</div>
    <div class="dm-dia fl-filtros"><div class="ind-tabs fl-modo"><button data-em="atletas" class="${f.modo === 'atletas' ? 'on' : ''}">Atletas</button><button data-em="posicao" class="${f.modo === 'posicao' ? 'on' : ''}">Posição</button></div>
      ${f.modo === 'posicao' ? `<select class="in" id="flepos">${opts(flPosicoes(), f.pos, 'Todas as posições')}</select>` : ''}
      <select class="in" id="flemet">${opts(FL_EVM.map(m => [m[0], m[1] + (m[2] ? ` (${m[2]})` : '')]), f.met)}</select><select class="in" id="flemd">${opts(MD_TAGS, f.md, 'Todos os MD')}</select><select class="in" id="fletp">${opts(['Treino', 'Jogo', 'Teste'], f.tipo, 'Treino e jogo')}</select></div>
    ${f.modo === 'atletas' ? `<div class="fl-chips">${ats.map(a => `<button class="fl-chip${f.ats.includes(a.id) ? ' on' : ''}" data-eat="${a.id}"${f.ats.includes(a.id) ? ` style="border-color:${FL_CORES[f.ats.indexOf(a.id) % FL_CORES.length]}"` : ''}>${esc(a.nome)}</button>`).join('')}<span class="m">até 6 atletas</span></div>` : ''}
    <div class="panel"><h2>${esc(met[1])}${met[2] ? ` <small class="m">(${met[2]})</small>` : ''} <small class="m">${ss.length} sessões · 🔔 = exposição à velocidade máxima</small></h2>${flGrafico(series, ini, fim, { min: ['vmax', 'vpct'].includes(met[0]) ? null : undefined })}</div>
    ${acwrS.length ? `<div class="panel"><h2>ACWR 7:28 · ${esc(FL_ACWR.find(a => a[0] === kA)[1])} <small class="m">dia a dia · vazio = em formação (menos de 4 semanas de dados)</small></h2>${flGrafico(acwrS, ini, fim, { zona: [A.min, A.max] })}</div>` : f.modo === 'atletas' && !kA ? '<p class="m fl-nota">O ACWR aparece para distância, alta intensidade, sprint, acc/dcc e Player Load.</p>' : ''}
    ${cmjAt.map(id => `<div class="panel"><h2>CMJ · ${esc(S.atletas.find(a => a.id === id).nome)}</h2>${flSvgCmj('a' + id, ini, fim)}</div>`).join('')}`;
  ligarFlTabs();
  const re = () => pEvolucao();
  flLigarPer(f, 'fle', re);
  document.querySelectorAll('[data-em]').forEach(b => b.onclick = () => { f.modo = b.dataset.em; re(); });
  if ($('#flepos')) $('#flepos').onchange = e => { f.pos = e.target.value; re(); };
  $('#flemet').onchange = e => { f.met = e.target.value; re(); }; $('#flemd').onchange = e => { f.md = e.target.value; re(); }; $('#fletp').onchange = e => { f.tipo = e.target.value; re(); };
  document.querySelectorAll('[data-eat]').forEach(b => b.onclick = () => { const id = +b.dataset.eat; f.ats = f.ats.includes(id) ? f.ats.filter(x => x !== id) : [...f.ats, id].slice(-6); re(); });
}

/* ============ CARDS ============ */
// barras em relação ao próprio atleta (maior valor dele em sessões do mesmo tipo, a partir de 3); antes disso, ao maior do grupo na sessão.
// Traço = média do grupo na sessão.
const FL_CK = { comissao: [['dist', 'Distância', 'm', 0], ['mmin', 'm/min', '', 0], ['ai', 'Alta intensidade 19,8–25,2', 'm', 0], ['sprint', 'Sprint ≥25,2', 'm', 0], ['n_sprints', 'Nº sprints', '', 0],
  ['vmax', 'Vel. máxima', 'km/h', 1], ['n_acel', 'Acelerações', '', 0], ['n_desac', 'Desacelerações', '', 0], ['pl', 'Player Load', 'UA', 0], ['plmin', 'PL/min', '', 2]],
  atleta: [['dist', 'Distância total', 'm', 0], ['ai', 'Alta intensidade', 'm', 0], ['n_sprints', 'Nº de sprints', '', 0], ['vmax', 'Velocidade máxima', 'km/h', 1]] };
function flCard(s, r, tot, modelo) {
  const a = r.atleta_id && S.atletas.find(x => x.id === r.atleta_id), e = flVEntrada(r), x = flExpo(e);
  const hs = r.atleta_id ? flLinhasAt(r.atleta_id).filter(y => y.s.tipo === s.tipo).map(y => y.g) : [];
  const esc0 = (k, v) => { const gm = flMedia(tot, k), base = hs.length >= 3 ? Math.max(...hs.map(g => +g[k] || 0), v) : Math.max(...tot.map(g => +g[k] || 0), v); return { gm, w: base ? v / base * 100 : 0, mk: base && gm != null ? Math.min(100, gm / base * 100) : null }; };
  const pctV = k => k === 'vmax' && e?.ref ? ` <small>${Math.round(e.v / e.ref * 100)}%</small>${x?.vel ? ' 🔔' : ''}` : '';
  const trilho = (b, d) => `<div class="flk-t"><i style="width:${b.w}%"></i>${b.mk != null ? `<em style="left:${b.mk}%" title="média do grupo: ${flFmt(b.gm, d)}"></em>` : ''}</div>`;
  const ft = a?.foto_url ? fotoFundo(a) : `<i class="fbg flk-escbg" style="background-image:url('${LOGO}')"></i>`;
  const sonda = a?.foto_url ? `<img class="flk-sonda" src="${esc(a.foto_url)}" alt="" onload="if(this.naturalWidth>=300)this.closest('.flk').classList.add('flk-hd')">` : '';
  const rod = `<div class="flk-rod">${hs.length >= 3 ? 'barra = em relação ao seu maior valor' : 'barra = em relação ao maior do grupo'} · traço = média do grupo</div>`;
  const dt = `${dataBR(s.data)} · ${esc(s.tipo)}${s.md?.length ? ' · ' + esc(flMdTxt(s)) : ''}`;
  if (modelo === 'atleta') return `<div class="flk flk-atleta">${sonda}<div class="flk-hero"><span class="flk-ft">${ft}</span>
      <div class="flk-id"><img src="${LOGO}" alt="" class="flk-logo"><b>${esc(flTitulo(r.nome_origem))}</b><small>${esc(flPos(r) || '—')}</small><span class="flk-dt">${dt}<br>${flDur(r.duracao_s)}</span></div></div>
    <div class="flk-ns">${FL_CK.atleta.map(([k, l, u, d]) => { const v = +r[k] || 0, b = esc0(k, v); return `<div class="flk-n"><div class="flk-nl"><span>${l}</span><b>${flFmt(r[k], d)}${u ? ` <small>${u}</small>` : ''}</b></div>${trilho(b, d)}</div>`; }).join('')}</div>
    ${rod}</div>`;
  const barra = ([k, l, u, d]) => { const v = +r[k] || 0, b = esc0(k, v); return `<div class="flk-b"><span>${l}</span>${trilho(b, d)}<b>${flFmt(r[k], d)}${u ? ` <small>${u}</small>` : ''}${pctV(k)}</b></div>`; };
  return `<div class="flk flk-comissao"><div class="flk-cab"><span class="flk-av">${ft}</span><div><b>${esc(flTitulo(r.nome_origem))}</b><small>${esc(flPos(r) || '—')}</small></div><img src="${LOGO}" alt="" class="flk-logo"></div>
    <div class="flk-sub"><span>${dt}</span><span>${flDur(r.duracao_s)}</span></div>
    <div class="flk-bs">${FL_CK.comissao.map(barra).join('')}</div>${rod}</div>`;
}
function pCards() {
  const c = S.fl.ck, sess = [...S.fl.sess].sort((a, b) => flOrdS(b, a)), s = flSessao(c.sel) || sess[0];
  const tot = s ? flTotais(s.id).sort((a, b) => flOrdPos(flPos(a)) - flOrdPos(flPos(b)) || flNomeAt(a).localeCompare(flNomeAt(b), 'pt')) : [];
  const um = c.vis === 'individual' ? tot.find(r => r.nome_origem === c.at) || tot[0] : null;
  $('#main').innerHTML = topo('Fisiologia', 'Relatório de treino', 'Card de cada atleta na sessão: modelo da comissão (completo) ou do atleta (simples, para mandar para ele).',
    s ? `<button class="btn" id="flkpdf">Baixar PDF</button><button class="btn pri" id="flkpng">Baixar ${c.vis === 'todos' ? 'imagens' : 'imagem'} (PNG)</button>` : '') + flTabs('cards') + (!s ? '<div class="panel empty">Nenhuma sessão importada ainda.</div>' : `
    <div class="dm-dia fl-filtros"><select class="in" id="flksel">${sess.map(x => `<option value="${x.id}"${x.id === s.id ? ' selected' : ''}>${esc(flSessOpt(x))}</option>`).join('')}</select>
      <div class="ind-tabs fl-modo"><button data-km="comissao" class="${c.modelo === 'comissao' ? 'on' : ''}">Comissão</button><button data-km="atleta" class="${c.modelo === 'atleta' ? 'on' : ''}">Atleta</button></div>
      <div class="ind-tabs fl-modo"><button data-kv="todos" class="${c.vis === 'todos' ? 'on' : ''}">Todos</button><button data-kv="individual" class="${c.vis === 'individual' ? 'on' : ''}">Individual</button></div>
      ${c.vis === 'individual' ? `<select class="in" id="flkat">${opts(tot.map(r => [r.nome_origem, flNomeAt(r)]), um?.nome_origem)}</select>` : ''}</div>
    <div class="flk-grid${c.vis === 'individual' ? ' um' : ''}" id="flkg">${(um ? [um] : tot).map(r => flCard(s, r, tot, c.modelo)).join('')}</div>
    <p class="m fl-nota">PNG: ${c.vis === 'todos' ? 'sai em imagens com até 8 atletas cada' : 'imagem do card do atleta, para mandar no WhatsApp'}. PDF: 4 cards por página A4.</p>`);
  ligarFlTabs();
  if (!s) return;
  $('#flksel').onchange = e => { c.sel = +e.target.value; pCards(); };
  document.querySelectorAll('[data-km]').forEach(b => b.onclick = () => { c.modelo = b.dataset.km; pCards(); });
  document.querySelectorAll('[data-kv]').forEach(b => b.onclick = () => { c.vis = b.dataset.kv; pCards(); });
  if ($('#flkat')) $('#flkat').onchange = e => { c.at = e.target.value; pCards(); };
  const lista = um ? [um] : tot;
  $('#flkpdf').onclick = () => { const pg = []; for (let i = 0; i < lista.length; i += 4) pg.push(lista.slice(i, i + 4));
    imprimirFl(pg.map(p => `<section class="flp-pg">${flCab(c.modelo === 'atleta' ? 'RELATÓRIO DE TREINO' : 'RELATÓRIO DE TREINO · COMISSÃO', s.data, `${s.tipo}${s.md?.length ? ' | ' + flMdTxt(s) : ''}`)}<div class="flk-grid flk-pdf">${p.map(r => flCard(s, r, tot, c.modelo)).join('')}</div></section>`).join(''), `Relatorio_de_treino_${s.tipo}_QFC_${s.data}`); };
  $('#flkpng').onclick = async () => {
    const b = $('#flkpng'); b.disabled = true; b.textContent = 'Gerando…';
    try { const grupos = []; for (let i = 0; i < lista.length; i += um ? 1 : 8) grupos.push(lista.slice(i, i + (um ? 1 : 8)));
      for (const [k, g] of grupos.entries()) { const nome = um ? `Relatorio_de_treino_${flTitulo(um.nome_origem).replace(/\s+/g, '_')}_${s.data}` : `Relatorio_de_treino_${s.data}_${k + 1}`;
        await flPNG(`<div class="flk-exp${um ? ' um' : ''}">${um ? '' : `<div class="flk-expcab"><img src="${LOGO}" alt=""><b>QFC · Relatório de treino · ${esc(s.tipo)} de ${dataBR(s.data)}${s.md?.length ? ' · ' + esc(flMdTxt(s)) : ''}</b></div>`}<div class="flk-grid">${g.map(r => flCard(s, r, tot, c.modelo)).join('')}</div></div>`, nome); }
      toast(grupos.length > 1 ? `${grupos.length} imagens baixadas.` : 'Imagem baixada.');
    } catch (e) { toast(e.message || 'Não consegui gerar a imagem.', true); }
    b.disabled = false; b.textContent = `Baixar ${c.vis === 'todos' ? 'imagens' : 'imagem'} (PNG)`; };
}
const flH2C = () => window.html2canvas ? Promise.resolve() : new Promise((ok, err) => { const sc = document.createElement('script'); sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'; sc.onload = ok; sc.onerror = () => err(new Error('Não consegui carregar o gerador de imagem (sem internet?).')); document.head.appendChild(sc); });
async function flPNG(html, nome) {
  await flH2C();
  const w = document.createElement('div'); w.className = 'flk-off'; w.innerHTML = html; document.body.appendChild(w);
  try { await Promise.all([...w.querySelectorAll('img')].map(i => i.complete ? null : new Promise(r => { i.onload = i.onerror = r; })));
    const cv = await window.html2canvas(w.firstElementChild, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false });
    const a = document.createElement('a'); a.href = cv.toDataURL('image/png'); a.download = nome + '.png'; document.body.appendChild(a); a.click(); a.remove();
  } finally { w.remove(); }
}

/* ============ PDF no padrão do Departamento de Saúde e Performance ============ */
const flCab = (tit, data, sub) => `<div class="flp-cab"><img src="${LOGO}" alt=""><div><small>QFC | DEPARTAMENTO DE SAÚDE E PERFORMANCE</small><h1>${esc(tit)}</h1></div><div class="flp-dt"><b>${parse(data).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/\./g, '').toUpperCase()}</b><span>${esc(sub)}</span></div></div>`;
function relPosHTML(s) {
  const D = flDados(s), m = D.med, sub = `${s.tipo}${s.md?.length ? ' ' + flMdTxt(s) : ''} | ${flDur(s.duracao_s)} | ${D.tot.length} atletas`, card = (l, v) => `<div class="flp-k"><small>${l}</small><b>${v}</b></div>`;
  const bl = (t, k, d = 0, cor = '') => `<div class="flp-box"><h4>${t}</h4>${flBarras(D.tot, k, d, '', cor)}</div>`, tit = s.tipo === 'Jogo' ? 'RELATÓRIO DE JOGO' : 'RELATÓRIO DE TREINO';
  return `<section class="flp-pg">${flCab(tit, s.data, sub)}<h3>VISÃO DA SESSÃO <small>média do grupo${s.tipo === 'Jogo' ? ' · 1º + 2º tempo' : ''}</small></h3>
      <div class="flp-ks">${card('Distância total', flFmt(m.dist, 1) + ' m')}${card('Distância relativa', flFmt(m.mmin, 1) + ' m/min')}${card('Alta intensidade 19,8–25,2', flFmt(m.ai, 1) + ' m')}${card('Sprint ≥25,2', `${flFmt(m.sprint, 1)} m · ${flFmt(m.n_sprints, 1)}`)}
        ${card('Velocidade máxima', flFmt(m.vmax, 1) + ' km/h')}${card('Acelerações', `${flFmt(m.acel_m, 1)} m · ${flFmt(m.n_acel, 1)}`)}${card('Desacelerações', `${flFmt(m.desac_m, 1)} m · ${flFmt(m.n_desac, 1)}`)}${card('Player Load', `${flFmt(m.pl, 0)} · ${flFmt(m.plmin, 2)}/min`)}</div>
      ${D.per.length ? `<h3>DISTRIBUIÇÃO POR PERÍODO</h3><div class="flp-ks">${D.per.map(p => card(p.nome + (p.num === 9 ? ' (fora do total)' : ''), `${flDur(p.dur)} · ${flFmt(p.dist)} m · ${flFmt(p.mmin)} m/min`)).join('')}</div>` : ''}
      ${D.dest.length ? `<h3>DESTAQUES</h3><ul class="flp-dest">${D.dest.map(([t, r, x]) => `<li><b>${esc(flNomeAt(r))}</b> · ${esc(t)}: ${esc(x)}</li>`).join('')}</ul>` : ''}</section>
    <section class="flp-pg">${flCab('INDICADORES INDIVIDUAIS', s.data, sub)}${flTabela(s, D, true)}<p class="flp-nota">${FL_LIMIARES} · 🔔 = ${flCfg('vmax').pct}% ou mais da velocidade máxima de referência.</p>
      <h3>MAIORES VALORES OBSERVADOS</h3><div class="flp-ks">${[['dist', 'Distância total', ' m', 0], ['ai', 'Alta intensidade', ' m', 0], ['vmax', 'Vmáx.', ' km/h', 2], ['pl', 'Player Load', '', 0]].map(([k, l, u, d]) => { const r = D.maior(k); return card(l, r ? `${esc(flNomeAt(r))} · ${flFmt(r[k], d)}${u}` : '—'); }).join('')}</div></section>
    ${s.tipo === 'Jogo' && flTempos(s) ? `<section class="flp-pg">${flCab('1º × 2º TEMPO', s.data, sub)}${flTempos(s, true)}</section>` : ''}
    <section class="flp-pg">${flCab('DURAÇÃO E DISTÂNCIAS', s.data, sub)}<div class="flp-g2">${bl('Duração individual', 'duracao_s')}${bl('Distância total (m)', 'dist')}${bl('Distância relativa (m/min)', 'mmin')}${bl('Alta intensidade 19,8–25,2 (m)', 'ai')}</div></section>
    <section class="flp-pg">${flCab('VELOCIDADE, SPRINT E ACELERAÇÕES', s.data, sub)}<div class="flp-g2">${bl('Velocidade máxima (km/h)', 'vmax', 2)}${bl('Sprint ≥25,2 (m)', 'sprint')}${bl('Número de acelerações', 'n_acel', 0, ' fl-am')}${bl('Número de desacelerações', 'n_desac', 0, ' fl-am')}</div></section>
    <section class="flp-pg">${flCab('PLAYER LOAD', s.data, sub)}<div class="flp-g2">${bl('Player Load (UA)', 'pl', 0, ' fl-pl')}${bl('Player Load por minuto', 'plmin', 2, ' fl-pl')}</div></section>`;
}
function relCmjHTML(d) {
  const cs = S.fl.cmj.filter(c => c.data === d).sort((a, b) => flNomeAt(a).localeCompare(flNomeAt(b), 'pt')), L = cs.map(c => ({ c, s: flSemaforo(c, d) })), n = k => L.filter(x => x.s.cor === k).length, R = flCfg('prontidao');
  return `<section class="flp-pg">${flCab('RELATÓRIO DE PRONTIDÃO | CMJ', d, `${cs.length} atletas`)}
    <div class="flp-ks">${[['Avaliados', cs.length], ['Média do grupo', flFmt(flMedia(cs, 'cmj'), 1) + ' cm'], ['Verde', n('vd')], ['Amarelo', n('am')], ['Vermelho', n('vm')]].map(([l, v]) => `<div class="flp-k"><small>${l}</small><b>${v}</b></div>`).join('')}</div>
    <table class="tb fl-tab"><thead><tr><th></th><th>Atleta</th><th>Posição</th><th>CMJ (cm)</th><th>Ref. (cm)</th><th>DP</th><th>SWC</th><th>Δ (cm)</th><th>Δ (%)</th><th>z</th><th>Leitura</th><th>Motivos</th></tr></thead><tbody>
    ${L.map(({ c, s }) => `<tr><td><i class="fl-sem fl-${s.cor}"></i></td><td><b>${esc(flNomeAt(c))}</b></td><td>${esc(flPos(c))}</td><td><b>${flFmt(c.cmj, 2)}</b></td><td>${flFmt(s.L.st.ref, 2)}</td><td>${flFmt(s.L.st.sd, 2)}</td><td>${flFmt(s.L.st.swc, 2)}</td><td>${s.L.d == null ? '—' : (s.L.d > 0 ? '+' : '') + flFmt(s.L.d, 2)}</td><td>${s.L.d == null ? '—' : (s.L.pct > 0 ? '+' : '') + flFmt(s.L.pct, 1)}</td><td>${s.L.z == null ? '—' : flFmt(s.L.z, 1)}</td><td>${esc(s.L.cq)}</td><td>${esc(s.motivos.join(' · '))}</td></tr>`).join('')}
    </tbody></table><p class="flp-nota">Referência = média das últimas ${R.n_ref} avaliações do atleta; SWC = 0,2 × DP; faixas com ${R.n_min} avaliações ou mais. Normal até −1 DP · atenção entre −1 e −2 DP · alerta abaixo de −2 DP; a queda só conta quando também passa do maior entre o SWC e o ruído do salto (${flFmt(R.ruido_pct, 1)}%). O semáforo junta o salto, a situação no DM e a carga do dia anterior; a decisão é do fisiologista.</p></section>${(() => { const pg = []; for (let k = 0; k < cs.length; k += 6) pg.push(cs.slice(k, k + 6));
    return pg.map(g => `<section class="flp-pg">${flCab('EVOLUÇÃO DO CMJ', d, 'referência e faixas de ±SWC, ±1 DP e ±2 DP')}<div class="flp-cmjg">${g.map(c => `<div class="flp-box">${flSvgCmj(flChaveC(c), null, d, { W: 560, H: 250, semLeg: true })}</div>`).join('')}</div><p class="flp-nota">Linhas = referência atual de cada atleta (média das últimas ${R.n_ref} avaliações) · faixa cinza ±SWC · amarelo ±1 DP · vermelho ±2 DP.</p></section>`).join(''); })()}`;
}
async function imprimirFl(html, nome) {
  document.querySelectorAll('#print-area').forEach(x => x.remove());
  const w = document.createElement('div'); w.id = 'print-area'; w.className = 'flp'; w.innerHTML = html;
  const st = document.createElement('style'); st.id = 'flp-page'; st.textContent = '@page{size:A4 landscape;margin:0}';
  document.head.appendChild(st); document.body.appendChild(w); document.body.classList.add('imprimindo');
  await Promise.all([...w.querySelectorAll('img')].map(i => i.decode ? i.decode().catch(() => {}) : null));
  const t = document.title; document.title = nome;
  setTimeout(() => { window.print(); setTimeout(() => { w.remove(); st.remove(); document.body.classList.remove('imprimindo'); document.title = t; }, 500); }, 150);
}

/* ============ REFERÊNCIAS (critérios e cálculos de cada aba, para conferência técnica) ============ */
function flRefConteudo(ab) {
  const V = flCfg('vmax'), A = flCfg('acwr'), R = flCfg('prontidao'), n = (v, d = 0) => flFmt(v, d);
  const sec = (t, itens) => `<h4 class="dm-h4">${t}</h4><ul class="fl-refl">${itens.map(i => `<li>${i}</li>`).join('')}</ul>`;
  const LIM = sec('Limiares do GPS (definidos no OpenField)', [
    '<b>Alta intensidade 19,8–25,2 km/h</b>: distância na faixa de velocidade 5 (coluna “Distância alta intensidade” / Velocity Band 5).',
    '<b>Sprint ≥ 25,2 km/h</b>: distância na faixa 6 (“Distância sprint” / Velocity Band 6). <b>Nº sprints</b> = Sprint Efforts (nº de entradas acima de 25,2 km/h).',
    '<b>Aceleração</b> ≥ +3 m/s² e <b>desaceleração</b> ≤ −3 m/s² (distância e número de esforços).',
    '<b>Player Load (UA)</b>: carga do acelerômetro triaxial da Catapult (soma das variações da aceleração nos 3 eixos). <b>PL/min</b> = coluna “Carga minuto” (ou PL ÷ minutos).',
    'Distância relativa = metros por minuto da sessão (coluna “Metros/min”).']);
  const BIB = l => sec('Referências bibliográficas', l);
  const C = {
    pos: [sec('Fonte e cálculos', [
        'Fonte: CSV de sessão do Catapult (OpenField). A linha “Session” é o total; as demais são as partes. Sem linha “Session”, o total é a soma das partes.',
        'Média do grupo = média simples dos atletas com dado na sessão. Duração da parte = maior duração entre os atletas.',
        'Setas na tabela: diferença ≥ 10% em relação à média do próprio atleta nas sessões anteriores do <b>mesmo tipo</b> (mínimo 3 sessões).',
        'Destaques: “acima/abaixo do habitual” = diferença ≥ 30% dessa média (distância, alta intensidade, sprint); “tempo menor” = menos de 90% da maior duração da sessão (não vale para jogo); DM e recém-liberado (até 14 dias do retorno) vêm da Fisioterapia/DM.',
        `% vmáx e 🔔: ver a aba Velocidade (🔔 = ${n(V.pct)}% ou mais da referência).`,
        'Gráficos de barras: barra cheia = maior valor do grupo na sessão; risco = média do grupo.']), LIM,
      sec('Jogo', ['3 arquivos: aquecimento, 1º e 2º tempo. Total do jogo = 1º + 2º tempo (somas; vmáx = maior das partes; m/min e PL/min = total ÷ minutos).',
        'Aquecimento fica separado: não entra no total, na carga, no ACWR nem na exposição à velocidade.',
        '1º × 2º tempo: cada métrica ÷ minutos jogados na parte; Δ = (2º − 1º) ÷ 1º. Destaque com queda ou aumento de 10% ou mais.']),
      sec('Partes do GPS × exercícios', ['Cada parte do GPS é ligada a um exercício do treino do calendário (sugestão pela ordem, ajustável).',
        'Referência de metodologia do QFC: espaço grande → resistência → distância; médio → velocidade → sprint; pequeno → força → acelerações/desacelerações. A célula destacada é a métrica-alvo do exercício.',
        'Espaço = comprimento × largura do plano; m²/jogador = área ÷ nº de jogadores. Limites numéricos entre grande, médio e pequeno ainda a definir com o treinador e o fisiologista.']),
      BIB(['Bradley PS et al. High-intensity running in English FA Premier League soccer matches. J Sports Sci, 2009 (limiares de alta intensidade e sprint em tempo-movimento).',
        'Boyd LJ, Ball K, Aughey RJ. The reliability of MinimaxX accelerometers for measuring physical activity in Australian football. Int J Sports Physiol Perform, 2011 (Player Load).',
        'Harper DJ, Carling C, Kiely J. High-intensity acceleration and deceleration demands in elite team sports competitive match play: a systematic review. Sports Med, 2019.'])],
    prontidao: [sec('Coleta', ['CMJ, 1 salto por dia, software Elite Jump, antes do treino.']),
      sec('Cálculo da referência (por atleta)', [
        `Referência = média das últimas <b>${R.n_ref}</b> avaliações anteriores ao dia (o salto do dia não entra).`,
        'DP = desvio padrão amostral dessas avaliações. <b>SWC = 0,2 × DP</b> (menor mudança relevante; efeito “pequeno” de Cohen).',
        'z = (CMJ do dia − referência) ÷ DP. Δ% = (CMJ − referência) ÷ referência.',
        `Faixas aparecem com <b>${R.n_min}</b> avaliações ou mais. Antes disso: “em formação” (se o relatório do software foi colado, usa a referência e o SWC dele).`]),
      sec('Leitura', [`<b>Normal</b>: até −1 DP · <b>Atenção</b>: entre −1 e −2 DP · <b>Alerta</b>: abaixo de −2 DP.`,
        `Por ser 1 salto, uma queda só conta quando também passa do <b>maior entre o SWC e o ruído do salto (${n(R.ruido_pct, 1)}% da referência)</b>.`,
        'Média do grupo = média simples dos saltos do dia.',
        'Gráfico (modelo do software do salto): linhas retas da referência atual do atleta (a usada na leitura do último salto), faixa ±SWC e linhas de ±1 DP e ±2 DP; cada ponto com o valor e a cor da leitura daquele dia (calculada com a referência daquele dia).']),
      sec('Semáforo', ['<b>Vermelho</b>: CMJ em alerta ou atleta em DM/restrito.',
        '<b>Amarelo</b>: CMJ em atenção, recém-liberado (até 14 dias) ou distância do dia anterior acima de 120% da média do próprio atleta (mínimo 4 sessões).',
        '<b>Verde</b>: nenhum dos anteriores. O sistema sinaliza; a decisão é do fisiologista.']),
      BIB(['Claudino JG et al. The countermovement jump to monitor neuromuscular status: a meta-analysis. J Sci Med Sport, 2017.',
        'Hopkins WG. Measures of reliability in sports medicine and science. Sports Med, 2000 (erro típico e menor mudança relevante).'])],
    velocidade: [sec('Referência de velocidade máxima (por atleta)', [
        'Referência = <b>maior marca válida</b> do atleta até a data, em treinos, jogos e no teste de velocidade (sessão do tipo “Teste”, 30–40 m).',
        `Precisa de ${n(V.n_min)} sessões do atleta ou de um teste; antes disso, “em formação”.`,
        'Nova marca maior que a referência (treino ou jogo) <b>vira a referência automaticamente</b> ao subir o GPS. Se for erro do aparelho, o fisiologista marca “Falso pico” e ela sai da referência.',
        'O % de cada sessão usa a referência válida até aquela data (o histórico não muda quando surge um recorde novo).']),
      sec('Exposição (🔔)', [`Exposição = sessão em que alguma parte teve pico ≥ <b>${n(V.pct)}%</b> da referência (aquecimento do jogo não conta).`,
        `Jogo com <b>${n(V.jogo_min)} min</b> ou mais também conta como exposição.`,
        `Alerta quando o atleta passa de <b>${n(V.dias)} dias</b> sem exposição. Contagem na semana (segunda a domingo) e nas últimas 4 semanas.`,
        'Exposição em MD-1 aparece separada, para discussão com a comissão.',
        'Limite: o CSV traz só a velocidade máxima de cada parte, então a contagem é por sessão/parte, não por número de esforços dentro da parte.']),
      BIB(['Malone S et al. High chronic training loads and exposure to bouts of maximal velocity running reduce injury risk in elite Gaelic football. J Sci Med Sport, 2017.'])],
    carga: [sec('Período e filtros', ['Só a linha total de cada sessão (jogo = 1º + 2º tempo; aquecimento fora).',
        '<b>Por atleta</b>: soma do período ou média por sessão. Taxas (PL/min e m/min) = total ÷ minutos do período.',
        '<b>Por sessão</b>: média do grupo em cada sessão; “soma do período” = soma dessas médias.',
        'Filtros de posição, atleta, MD e tipo se aplicam a essas tabelas.']), LIM,
      sec('ACWR (semana aguda ÷ crônica)', [
        '<b>Aguda</b> = soma dos últimos 7 dias; <b>crônica</b> = soma dos últimos 28 dias ÷ 4 (média semanal). ACWR = aguda ÷ crônica.',
        'Média simples, dias corridos (rolling), modelo acoplado (os 7 dias agudos fazem parte dos 28). Referência usada pelo fisiologista: K-Sport.',
        `Zona ok: <b>${n(A.min, 2)} a ${n(A.max, 2)}</b>; acima ou abaixo = alerta.`,
        'Métricas: distância, alta intensidade 19,8–25,2, sprint, acc + dcc (nº) e Player Load. Usa todas as sessões (filtros de MD e tipo não se aplicam).',
        '“Em formação” até o atleta ter 28 dias desde a primeira sessão no CINQ.',
        'Uso: contexto para a decisão da carga, não previsão de lesão.']),
      BIB(['Gabbett TJ. The training–injury prevention paradox: should athletes be training smarter and harder? Br J Sports Med, 2016.',
        'Hulin BT et al. The acute:chronic workload ratio predicts injury: high chronic workload may decrease injury risk in elite rugby league players. Br J Sports Med, 2016.',
        'Impellizzeri FM et al. Acute:chronic workload ratio: conceptual issues and fundamental pitfalls. Int J Sports Physiol Perform, 2020 (limitações do indicador).'])],
    evolucao: [sec('Gráficos', ['Cada ponto = uma sessão (linha total; jogo = 1º + 2º tempo).',
        '<b>Média do grupo</b> = média dos atletas presentes na sessão. <b>Posição</b> = média dos atletas daquela posição.',
        'Taxas (PL/min, m/min) da posição/grupo = total ÷ minutos. % da vel. máxima = vmáx da sessão ÷ referência válida na data.',
        '🔔 = exposição à velocidade máxima na sessão (critério da aba Velocidade).',
        `ACWR dia a dia: mesmo cálculo da aba Carga; zona verde = ${n(A.min, 2)} a ${n(A.max, 2)}.`,
        'CMJ: referência e faixas de ±1 e ±2 DP calculadas a cada avaliação (critério da aba Prontidão).'])],
    cards: [sec('Barras', ['<b>Barra</b> = valor do atleta na sessão em relação ao <b>maior valor dele</b> em sessões do mesmo tipo (treino com treino, jogo com jogo), a partir de 3 sessões. Antes disso, em relação ao maior valor do grupo na sessão (o rodapé do card indica qual).',
        '<b>Risco</b> = média do grupo na sessão, na mesma régua.',
        `Vel. máxima mostra o % da referência e 🔔 a partir de ${n(V.pct)}%.`]),
      sec('Modelos', ['<b>Comissão</b>: distância, m/min, alta intensidade 19,8–25,2, sprint ≥25,2, nº sprints, vmáx, acelerações, desacelerações, PL e PL/min.',
        '<b>Atleta</b>: distância total, alta intensidade, nº de sprints e velocidade máxima (com % da referência e 🔔).']), LIM]
  };
  return (C[ab] || C.pos).join('');
}
function flReferencias(ab) {
  modal(`<h2>Referências · ${esc(FL_ABAS.find(a => a[0] === ab)?.[1] || '')}</h2><p class="m">Critérios, cálculos e fontes usados nesta aba, para conferência técnica. Os números ajustáveis aparecem com o valor atual (botão Parâmetros).</p>
    <div class="fl-ref">${flRefConteudo(ab)}</div><div class="mfoot"><span></span><button class="btn" id="flrfc">Fechar</button></div>`, true);
  $('#flrfc').onclick = fechar;
}

/* ============ abas e encaixe no sistema ============ */
const FL_PAG = { pos: () => pPosTreino(), prontidao: () => pProntidao(), velocidade: () => pVelocidade(), carga: () => pCargaFl(), evolucao: () => pEvolucao(), cards: () => pCards() };
const flTabs = ab => `<div class="ind-tabs fs-tabs">${FL_ABAS.map(([k, l]) => `<button data-flaba="${k}" class="${k === ab ? 'on' : ''}">${l}</button>`).join('')}<span class="fl-sep"></span><button class="fl-refb" data-flref="${ab}" title="critérios, cálculos e referências desta aba">📘 Referências</button></div>`;
const ligarFlTabs = () => { document.querySelectorAll('[data-flaba]').forEach(b => b.onclick = () => { S.fl.aba = b.dataset.flaba; pFisiologia(); window.scrollTo(0, 0); });
  document.querySelectorAll('[data-flref]').forEach(b => b.onclick = () => flReferencias(b.dataset.flref)); };
async function pFisiologia() {
  if (!S.fl.ok) $('#main').innerHTML = topo('Fisiologia', FL_ABAS.find(a => a[0] === S.fl.aba)?.[1] || '', '') + flTabs(S.fl.aba) + '<div class="panel empty">Carregando…</div>';
  try { await carregarFl(); if (typeof carregarDM === 'function') await carregarDM().catch(() => {}); } catch (e) { $('#main .panel').innerHTML = esc(erroAmigavel(e)); return; }
  (FL_PAG[S.fl.aba] || FL_PAG.pos)();
}
function navFisiologia() {
  const b = [...document.querySelectorAll('#nav button[disabled]')].find(x => x.textContent.trim().startsWith('Fisiologia'));
  if (!b || !podeLerFisio()) return;
  const n = document.createElement('button'); n.dataset.p = 'fisiologia'; n.textContent = 'Fisiologia'; n.classList.toggle('on', S.page === 'fisiologia'); b.replaceWith(n);
}
const _shellFl = shell;
shell = function () { _shellFl(); navFisiologia(); };
const _irFl = ir;
ir = function (p) {
  if (p !== 'fisiologia') return _irFl(p);
  if (!podeLerFisio()) return _irFl('inicio');
  S.page = p; document.querySelectorAll('#nav button[data-p]').forEach(b => b.classList.toggle('on', b.dataset.p === p));
  pFisiologia(); window.scrollTo(0, 0);
};
if (document.getElementById('main') && S.perfil) { navFisiologia(); if (S.page === 'fisiologia') ir('fisiologia'); }

/* ============ REALIZADO (GPS) NAS ATIVIDADES DO CALENDÁRIO ============
   Cada parte do GPS ligada a um exercício (Pós-treino → Partes do GPS × exercícios) vira o realizado da atividade:
   tempo da parte e média do grupo nas métricas. Planejado (tempo do plano) fica separado. */
S.flr = {};
async function flRealCarregar(ids) {
  ids = [...new Set(ids)].filter(id => !S.flr[id]); if (!ids.length || typeof podeLerFisio !== 'function' || !podeLerFisio()) return;
  const ss = await sb.from('fisl_sessoes').select('id,data,tipo,sessao_id,periodos,duracao_s').in('sessao_id', ids); if (ss.error) throw ss.error;
  const sids = ss.data.map(x => x.id);
  const rs = sids.length ? await flTudo(() => sb.from('fisl_gps').select('id,sessao_id,periodo,atleta_id,duracao_s,dist,ai,sprint,n_sprints,vmax,n_acel,n_desac,pl').in('sessao_id', sids).order('id')) : { data: [] };
  if (rs.error) throw rs.error;
  ids.forEach(id => { const se = ss.data.filter(x => x.sessao_id === id); S.flr[id] = { sess: se, rows: rs.data.filter(r => se.some(x => x.id === r.sessao_id)) }; });
}
function flRealCalc(calId) {
  const c = S.flr[calId]; if (!c || !c.sess.length) return null;
  const R = { ex: {}, total: 0, emEx: 0, outras: 0, n: 0 };
  for (const s of c.sess) {
    const tot = c.rows.filter(r => r.sessao_id === s.id && r.periodo === 0);
    R.total += s.duracao_s || Math.max(0, ...tot.map(r => r.duracao_s || 0)); R.n = Math.max(R.n, tot.length);
    (s.periodos || []).forEach((p, k) => {
      if (p.num === 9 || p.num === 0) return;
      const e = flExDaParte({ ...s, sessao_id: calId }, p, k), rs = c.rows.filter(r => r.sessao_id === s.id && r.periodo === p.num);
      const dur = Math.max(0, ...rs.map(r => r.duracao_s || 0)); if (!rs.length) return; if (!e) { R.outras += dur; return; }
      const o = R.ex[e.id] || (R.ex[e.id] = { dur: 0, at: {}, sug: false });
      o.dur += dur; R.emEx += dur; if (p.exercicio_id === undefined) o.sug = true;
      rs.forEach(r => { const k2 = r.atleta_id || 'x' + r.id, a = o.at[k2] || (o.at[k2] = { dur: 0, dist: 0, ai: 0, sprint: 0, n_sprints: 0, accdcc: 0, pl: 0, vmax: 0 });
        a.dur += r.duracao_s || 0; ['dist', 'ai', 'sprint', 'n_sprints', 'pl'].forEach(m => a[m] += +r[m] || 0); a.accdcc += (+r.n_acel || 0) + (+r.n_desac || 0); a.vmax = Math.max(a.vmax, +r.vmax || 0); });
    });
  }
  Object.values(R.ex).forEach(o => { const L = Object.values(o.at), md = m => L.length ? L.reduce((x, a) => x + a[m], 0) / L.length : null, min = o.dur / 60;
    o.n = L.length; o.m = { dist: md('dist'), ai: md('ai'), sprint: md('sprint'), n_sprints: md('n_sprints'), accdcc: md('accdcc'), pl: md('pl'), vmax: md('vmax') };
    o.m.mmin = min ? o.m.dist / min : null; o.m.plmin = min ? o.m.pl / min : null; });
  return R;
}
const flMinTxt = s => s == null ? '—' : `${Math.round(s / 60)}'`;
function flRealPinta(calId) {
  const R = flRealCalc(calId); if (!R || !document.getElementById('modal') || document.getElementById('modal').hidden) return;
  exDe(calId).forEach(e => { const card = document.getElementById('ex' + e.id); if (!card) return; card.querySelector('.fl-real')?.remove();
    const o = R.ex[e.id], alvo = METRICA_DIRECAO[e.direcionamento], cl = m => alvo === m ? ' class="fl-alvo"' : '';
    const plan = e.duracao_min ? `${e.duracao_min}'` : '—', real = o ? Math.round(o.dur / 60) : null, dif = o && e.duracao_min ? real - e.duracao_min : null;
    const html = o ? `<div class="fl-real"><div class="fl-real-t"><span>⏱ Planejado <b>${plan}</b></span><span>Realizado (GPS) <b>${real}'</b></span>${dif != null && dif !== 0 ? `<span class="m">${dif > 0 ? '+' : ''}${dif}' em relação ao planejado</span>` : ''}<small class="m">média do grupo · ${o.n} atletas${o.sug ? ' · ligação sugerida pela ordem' : ''}</small></div>
      <div class="fl-real-m"><span${cl('Distância')}><small>Distância</small>${flFmt(o.m.dist)} m</span><span${cl('Distância')}><small>m/min</small>${flFmt(o.m.mmin)}</span><span><small>Alta int.</small>${flFmt(o.m.ai)} m</span><span${cl('Sprint')}><small>Sprint</small>${flFmt(o.m.sprint)} m</span><span${cl('Sprint')}><small>Nº sprints</small>${flFmt(o.m.n_sprints, 1)}</span><span${cl('Acc/Dcc')}><small>Acc + Dcc</small>${flFmt(o.m.accdcc, 1)}</span><span><small>Player Load</small>${flFmt(o.m.pl)}</span><span><small>PL/min</small>${flFmt(o.m.plmin, 2)}</span><span><small>Vel. máx.</small>${flFmt(o.m.vmax, 1)} km/h</span></div></div>`
      : `<div class="fl-real fl-real-v"><span>⏱ Planejado <b>${plan}</b> · Realizado: sem parte do GPS ligada a esta atividade (Fisiologia → Pós-treino → Partes do GPS × exercícios)</span></div>`;
    (card.querySelector('.ex-aviso') || card.querySelector('.exc-top')).insertAdjacentHTML('afterend', html); });
  const pan = [...document.querySelectorAll('#modal .panel')].find(p => p.querySelector('h2')?.textContent.trim() === 'Resumo do treino');
  if (pan) { pan.querySelector('.fl-real-r')?.remove();
    pan.querySelector('.metric-grid').insertAdjacentHTML('afterend', `<div class="metric-grid fl-real-r"><div><b>${flMinTxt(R.total)}</b><span>Realizado total (GPS)</span></div><div><b>${flMinTxt(R.emEx)}</b><span>Em atividades</span></div><div><b>${flMinTxt(R.outras)}</b><span>Outras partes do GPS (ex.: aquecimento)</span></div><div><b>${flMinTxt(Math.max(0, R.total - R.emEx - R.outras))}</b><span>Pausas e transições</span></div><div><b>${R.n}</b><span>Atletas com GPS</span></div></div>`); }
}
// minutos realizados nas atividades: usados no resumo do ciclo
function flRealAplica(calId) { const R = flRealCalc(calId); exDe(calId).forEach(e => { const o = R?.ex[e.id]; e.duracao_real = o ? Math.round(o.dur / 60) : null; }); }
async function flRealGlobal() {
  if (typeof podeLerFisio !== 'function' || !podeLerFisio()) return;
  const lim = addDays(hoje(), -120), ids = S.sessoes.filter(x => x.data >= lim && x.data <= hoje() && x.tipo !== 'Folga').map(x => x.id);
  try { await flRealCarregar(ids); } catch (e) { return; }
  ids.forEach(flRealAplica);
  if (['inicio', 'calendario'].includes(S.page) && $('#modal')?.hidden !== false) ir(S.page); else if (S.page === 'calendario') flSeloSemana();
}
const _verSessaoFl = verSessao;
verSessao = function (id, foco) { _verSessaoFl(id, foco); if (S.flr[id]) flRealPinta(id); flRealCarregar([id]).then(() => { flRealAplica(id); flRealPinta(id); }).catch(() => {}); };
if (document.getElementById('main') && S.perfil) flRealGlobal();
const _shellFlr = shell;
shell = function () { _shellFlr(); setTimeout(flRealGlobal, 0); };

// selo na caixinha do dia (Calendário): ✓ Realizado · tempo total do GPS; treino que já passou sem GPS = "sem GPS" (cinza)
function flSeloSemana() {
  document.querySelectorAll('#main .week .ses[data-ses]').forEach(el => {
    const id = +el.dataset.ses, ses = S.sessoes.find(x => x.id === id), c = S.flr[id]; el.querySelector('.fl-selo')?.remove();
    if (!ses || ses.tipo === 'Folga' || !c) return;
    let html = '';
    if (c.sess.length) { const R = flRealCalc(id); html = `<span class="fl-selo ok">✓ Realizado${R && R.total ? ' · ' + flMinTxt(R.total) : ''}</span>`; }
    else if (ses.data < hoje()) html = '<span class="fl-selo sem">sem GPS</span>';
    if (html) el.insertAdjacentHTML('beforeend', `<div class="fl-selo-l">${html}</div>`);
  });
}
const _pCalendarioFlr = pCalendario;
pCalendario = function () { _pCalendarioFlr(); flSeloSemana(); };
