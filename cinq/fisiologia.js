/* CINQ · Fisiologia (versão de teste para validar com o fisiologista)
   Pós-treino: importa o CSV de sessão do Catapult (OpenField), liga os nomes ao elenco e monta o relatório no padrão
   do Departamento de Saúde e Performance (mesmas métricas do PDF dele) + % da velocidade máxima individual, partes por atleta,
   comparação com o histórico do próprio atleta e destaques. Prontidão: CMJ colado do relatório do software do salto,
   leitura do software (referência ± SWC) e leitura CINQ (limite = maior entre SWC e o ruído do salto), semáforo do dia com DM
   e carga do dia anterior. Carga: semana por atleta. */
'use strict';

S.fl = { ok: false, sess: [], gps: [], cmj: [], vinc: [], cfg: {}, aba: 'pos', sel: null, semana: null, dataP: null };
const FL_ABAS = [['pos', 'Pós-treino'], ['prontidao', 'Prontidão'], ['carga', 'Carga da semana']];
const podeFisl = () => isAdmin() || ['fisico', 'analise'].includes(S.perfil?.funcao);
const flN = v => v == null || v === '' || isNaN(v) ? null : Number(v);
const flFmt = (v, d = 0) => v == null ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const flDur = s => { if (s == null) return '—'; const m = Math.floor(s / 60), r = Math.round(s % 60); return r ? `${m}min${String(r).padStart(2, '0')}s` : `${m} min`; };
const flHms = t => { const p = String(t || '').split(':').map(Number); return p.length === 3 && p.every(x => !isNaN(x)) ? p[0] * 3600 + p[1] * 60 + p[2] : null; };
const flTitulo = t => t && t === t.toUpperCase() ? t.toLowerCase().replace(/(^|\s)(\S)/g, (m, e, c) => e + c.toUpperCase()).replace(/\b(Da|De|Do|Dos|Das)\b/g, w => w.toLowerCase()) : t;
const flNomeAt = r => (r.atleta_id && S.atletas.find(a => a.id === r.atleta_id)?.nome) || flTitulo(r.nome_origem);
const flPos = r => (r.atleta_id && S.atletas.find(a => a.id === r.atleta_id)?.posicao) || r.posicao || '';

/* ============ dados ============ */
async function carregarFl(forcar) {
  if (S.fl.ok && !forcar) return;
  const [s, g, c, v, cf] = await Promise.all([sb.from('fisl_sessoes').select('*').order('data').order('hora'), sb.from('fisl_gps').select('*'),
    sb.from('fisl_cmj').select('*').order('data'), sb.from('fisl_vinculos').select('*'), sb.from('fisl_config').select('*')]);
  for (const r of [s, g, c, v, cf]) if (r.error) throw r.error;
  S.fl.sess = s.data; S.fl.gps = g.data; S.fl.cmj = c.data; S.fl.vinc = v.data; S.fl.cfg = Object.fromEntries(cf.data.map(x => [x.chave, x.valor])); S.fl.ok = true;
}
const flSessao = id => S.fl.sess.find(s => s.id === id);
const flTotais = sid => S.fl.gps.filter(g => g.sessao_id === sid && g.periodo === 0);
// velocidade máxima de referência: maior registrada (troca pelo teste de velocidade quando existir)
const flVref = id => { const v = S.fl.gps.filter(g => g.atleta_id === id && g.periodo === 0).map(g => +g.vmax || 0); return v.length >= 3 ? Math.max(...v) : null; }; // só com 3+ sessões (ou o teste, quando houver)

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
  n_desac: ['n° desaceleracoes', 'nº desaceleracoes', 'n desaceleracoes'], hsd: ['high speed distance'], dur: ['average duration (session)', 'total duration'] };
function lerCatapult(txt) {
  const linhas = txt.replace(/^﻿/, '').split(/\r?\n/);
  const meta = {}; let i = 0;
  for (; i < linhas.length; i++) { const c = flCsvLinha(linhas[i]); if (fNorm(c[0]) === 'player name') break;
    const m = linhas[i].match(/^"?([^:,"]+):"?,(.*)$/); if (m) meta[fNorm(m[1])] = m[2].replace(/^"|"$/g, '').trim(); }
  if (i >= linhas.length) throw new Error('Não encontrei a tabela de atletas (coluna “Player Name”). O arquivo é o relatório de sessão do OpenField em CSV?');
  const cab = flCsvLinha(linhas[i]).map(fNorm), idx = k => { for (const n of FL_COLS[k]) { const j = cab.indexOf(n); if (j >= 0) return j; } return -1; };
  const cabOrig = flCsvLinha(linhas[i]);
  const iN = cab.indexOf('player name'), iP = cab.indexOf('period name'), iPn = cab.indexOf('period number');
  const rows = [];
  for (let k = i + 1; k < linhas.length; k++) {
    if (!linhas[k].trim()) continue; const c = flCsvLinha(linhas[k]); if (!c[iN]) continue;
    const g = j => j >= 0 ? c[j] : null, n = key => flN(String(g(idx(key)) ?? '').replace(',', '.'));
    const pn = iPn >= 0 ? +c[iPn] || 0 : 0, pnome = iP >= 0 ? c[iP] : 'Session';
    const bruto = {}; cab.forEach((h, j) => { if (h && c[j] !== '' && c[j] != null) bruto[cabOrig[j]] = c[j]; });
    rows.push({ nome_origem: c[iN].replace(/\s+/g, ' ').trim(), periodo: fNorm(pnome) === 'session' ? 0 : pn, periodo_nome: pnome, duracao_s: flHms(g(idx('dur'))),
      dist: n('dist'), mmin: n('mmin'), ai: n('ai'), sprint: n('sprint'), n_sprints: n('n_sprints'), vmax: n('vmax'), acel_m: n('acel_m'), n_acel: n('n_acel'),
      desac_m: n('desac_m'), n_desac: n('n_desac'), pl: n('pl'), hsd: n('hsd'), bruto });
  }
  if (!rows.length) throw new Error('O arquivo não tem linhas de atletas.');
  const dm = (meta.date || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  const data = dm ? `${dm[3]}-${dm[2].padStart(2, '0')}-${dm[1].padStart(2, '0')}` : null;
  // sem linha "Session": soma as partes
  const nomes = [...new Set(rows.map(r => r.nome_origem))];
  nomes.forEach(nm => { if (rows.some(r => r.nome_origem === nm && r.periodo === 0)) return;
    const ps = rows.filter(r => r.nome_origem === nm), soma = k => ps.reduce((t, r) => t + (r[k] || 0), 0), dur = soma('duracao_s');
    rows.push({ nome_origem: nm, periodo: 0, periodo_nome: 'Session', duracao_s: dur, dist: soma('dist'), mmin: dur ? soma('dist') / (dur / 60) : null, ai: soma('ai'), sprint: soma('sprint'),
      n_sprints: soma('n_sprints'), vmax: Math.max(...ps.map(r => r.vmax || 0)), acel_m: soma('acel_m'), n_acel: soma('n_acel'), desac_m: soma('desac_m'), n_desac: soma('n_desac'), pl: soma('pl'), hsd: soma('hsd'), bruto: {} }); });
  const periodos = [...new Map(rows.filter(r => r.periodo > 0).map(r => [r.periodo, { num: r.periodo, nome: r.periodo_nome }])).values()].sort((a, b) => a.num - b.num);
  return { data, hora: meta['start time'] || null, duracao_s: flN(meta.duration), periodos, rows, nomes };
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
  inp.onchange = async () => { for (const f of inp.files) { try { await importarCatapult(f); } catch (e) { toast(`${f.name}: ${e.message || erroAmigavel(e)}`, true); } } };
  inp.click();
}
async function importarCatapult(f) {
  if (/\.xlsx?$/i.test(f.name)) throw new Error('Envie o CSV como sai do OpenField (não o arquivo salvo no Excel).');
  const r = lerCatapult(await f.text()); if (!r.data) throw new Error('Não achei a data da sessão no cabeçalho do arquivo.');
  await new Promise((ok, err) => {
    const sess = S.sessoes.filter(s => s.data === r.data);
    modal(`<h2>Importar sessão do GPS</h2><p><b>${esc(fmtLong(r.data))}</b>${r.hora ? ' · início ' + esc(r.hora.slice(0, 5)) : ''} · ${r.nomes.length} atletas · ${r.periodos.length} parte${r.periodos.length === 1 ? '' : 's'}${r.duracao_s ? ' · ' + flDur(r.duracao_s) : ''}</p>
      <div class="g3"><label class="f"><span>Tipo</span><select class="in" id="flit">${opts(['Treino', 'Jogo', 'Teste'], /jogo/i.test(f.name) ? 'Jogo' : 'Treino')}</select></label>
        <label class="f"><span>Treino do calendário</span><select class="in" id="flis">${opts(sess.map(s => [s.id, `${s.turno || ''} ${s.tipo || ''} ${s.titulo || ''}`.trim()]), sess[0]?.id ?? '', 'nenhum')}</select></label>
        <label class="f"><span>Título (opcional)</span><input class="in" id="flitt" placeholder="ex.: Treino tático"></label></div>
      <p class="m">${r.periodos.map(p => esc(p.nome)).join(' · ')}</p>
      <div class="mfoot"><span class="m">${esc(f.name)}</span><div class="row"><button class="btn" id="flic">Cancelar</button><button class="btn pri" id="flio">Continuar</button></div></div>`, true);
    $('#flic').onclick = () => { fechar(); ok(); };
    $('#flio').onclick = () => {
      const extra = { tipo: $('#flit').value, sessao_id: $('#flis').value ? +$('#flis').value : null, titulo: $('#flitt').value.trim() || null };
      conferirNomes(r.nomes, 'Atletas do GPS', async mapa => {
        try {
          const { data: s, error } = await sb.from('fisl_sessoes').upsert({ data: r.data, hora: r.hora, duracao_s: r.duracao_s, periodos: r.periodos, arquivo_nome: f.name, ...extra }, { onConflict: 'data,hora' }).select().single();
          if (error) throw error;
          const del = await sb.from('fisl_gps').delete().eq('sessao_id', s.id); if (del.error) throw del.error;
          const linhas = r.rows.map(x => { const y = { ...x, sessao_id: s.id, atleta_id: mapa[x.nome_origem] ?? null }; delete y.periodo_nome; return y; });
          const ins = await sb.from('fisl_gps').insert(linhas).select(); if (ins.error) throw ins.error;
          S.fl.sess = S.fl.sess.filter(x => x.id !== s.id).concat(s).sort((a, b) => (a.data + (a.hora || '')).localeCompare(b.data + (b.hora || '')));
          S.fl.gps = S.fl.gps.filter(x => x.sessao_id !== s.id).concat(ins.data);
          S.fl.sel = s.id; S.fl.aba = 'pos'; fechar(); toast(`Sessão de ${dataBR(r.data)} importada: ${r.nomes.length} atletas.`); pFisiologia(); ok();
        } catch (e) { $('#flvs').disabled = false; toast(erroAmigavel(e), true); }
      });
    };
  });
}

/* ============ PÓS-TREINO ============ */
const FL_MET = [['dist', 'Distância total', 'm', 0], ['mmin', 'Distância relativa', 'm/min', 0], ['ai', 'Alta intensidade', 'm', 0], ['sprint', 'Sprint', 'm', 0],
  ['n_sprints', 'Nº sprints', '', 0], ['vmax', 'Vel. máxima', 'km/h', 2], ['acel_m', 'Dist. aceleração', 'm', 0], ['n_acel', 'Nº acelerações', '', 0], ['desac_m', 'Dist. desaceleração', 'm', 0], ['n_desac', 'Nº desacelerações', '', 0]];
const flMedia = (arr, k) => { const v = arr.map(r => r[k]).filter(x => x != null).map(Number); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
// histórico do atleta: média das sessões anteriores do mesmo tipo (mínimo 3)
function flHist(r, s) {
  if (!r.atleta_id) return null;
  const ant = S.fl.gps.filter(g => g.atleta_id === r.atleta_id && g.periodo === 0 && g.sessao_id !== s.id).filter(g => { const x = flSessao(g.sessao_id); return x && x.tipo === s.tipo && x.data < s.data; });
  if (ant.length < 3) return null;
  return Object.fromEntries(['dist', 'mmin', 'ai', 'sprint'].map(k => [k, flMedia(ant, k)]));
}
const flSeta = (v, ref) => { if (v == null || !ref) return ''; const d = Math.round((v - ref) / ref * 100); return Math.abs(d) < 10 ? '' : `<small class="fl-d ${d > 0 ? 'up' : 'dn'}">${d > 0 ? '+' : ''}${d}%</small>`; };
function flDados(s) {
  const tot = flTotais(s.id).sort((a, b) => flNomeAt(a).localeCompare(flNomeAt(b), 'pt'));
  const durMax = Math.max(0, ...tot.map(r => r.duracao_s || 0));
  const per = s.periodos.map(p => { const rs = S.fl.gps.filter(g => g.sessao_id === s.id && g.periodo === p.num); return { ...p, rs, dur: Math.max(0, ...rs.map(r => r.duracao_s || 0)) || null, dist: flMedia(rs, 'dist'), mmin: flMedia(rs, 'mmin'), ai: flMedia(rs, 'ai') }; });
  const maior = k => tot.reduce((m, r) => (r[k] ?? -1) > (m?.[k] ?? -1) ? r : m, null);
  const dest = [];
  tot.forEach(r => { if (durMax && r.duracao_s < durMax * 0.9) dest.push(['Tempo menor', r, `${flDur(r.duracao_s)} de ${flDur(durMax)}: saiu antes ou o aparelho parou de gravar`]);
    const vr = flVref(r.atleta_id); if (r.atleta_id && vr && r.vmax >= vr * 0.9) dest.push(['Perto da vel. máxima', r, `${flFmt(r.vmax, 1)} km/h = ${Math.round(r.vmax / vr * 100)}% da maior registrada`]);
    const h = flHist(r, s); if (h) ['dist', 'ai', 'sprint'].forEach(k => { if (h[k] && r[k] != null && Math.abs(r[k] - h[k]) / h[k] >= 0.3) dest.push([r[k] > h[k] ? 'Acima do habitual' : 'Abaixo do habitual', r, `${FL_MET.find(m => m[0] === k)[1]}: ${flFmt(r[k])} m (média dele ${flFmt(h[k])} m)`]); });
    if (r.atleta_id && typeof situacao === 'function' && S.dm?.ok) { const st = situacao(r.atleta_id); if (st.sit !== 'Liberado') dest.push(['DM', r, `está em ${st.sit} (${st.lesao.etapa})`]);
      const lib = S.dm.lesoes.find(l => l.atleta_id === r.atleta_id && l.data_retorno && l.data_retorno <= s.data && diasEntre(l.data_retorno, s.data) <= 14);
      if (lib) dest.push(['Recém-liberado', r, `liberado em ${fmt(lib.data_retorno)} (${tituloLesao(lib)})`]); } });
  return { tot, per, durMax, maior, dest, med: Object.fromEntries(FL_MET.map(m => [m[0], flMedia(tot, m[0])])) };
}
const flBarras = (tot, k, d = 0, suf = '', cor = '') => { const mx = Math.max(1, ...tot.map(r => +r[k] || 0));
  return tot.map(r => `<div class="bar fl-bar${cor}"><span>${esc(flNomeAt(r))}</span><div><i style="width:${(+r[k] || 0) / mx * 100}%"></i></div><b>${k === 'duracao_s' ? flDur(r[k]) : flFmt(r[k], d) + suf}</b></div>`).join(''); };
function flTabela(s, D, pdf) {
  return `<table class="tb fl-tab"><thead><tr><th>Atleta</th><th>Duração</th><th>Total (m)</th><th>m/min</th><th>Alta int. (m)</th><th>Sprint (m)</th><th>Nº spr.</th><th>Vmáx</th><th>% vmáx</th><th>Dist. acel.</th><th>Nº acel.</th><th>Dist. desac.</th><th>Nº desac.</th></tr></thead><tbody>
    ${D.tot.map(r => { const h = pdf ? null : flHist(r, s), vr = flVref(r.atleta_id);
      return `<tr${pdf ? '' : ` data-flat="${esc(r.nome_origem)}" class="dm-tr"`}><td><b>${esc(flNomeAt(r))}</b>${r.atleta_id ? '' : ' <small class="m">fora do elenco</small>'}</td><td${D.durMax && r.duracao_s < D.durMax * 0.9 ? ' class="fl-curto"' : ''}>${flDur(r.duracao_s)}</td>
      <td>${flFmt(r.dist)}${flSeta(r.dist, h?.dist)}</td><td>${flFmt(r.mmin)}${flSeta(r.mmin, h?.mmin)}</td><td>${flFmt(r.ai)}${flSeta(r.ai, h?.ai)}</td><td>${flFmt(r.sprint)}${flSeta(r.sprint, h?.sprint)}</td><td>${flFmt(r.n_sprints)}</td>
      <td>${flFmt(r.vmax, 2)}</td><td${vr ? '' : ' title="aparece a partir de 3 sessões do atleta ou com o teste de velocidade"'}>${vr ? Math.round(r.vmax / vr * 100) + '%' : '—'}</td><td>${flFmt(r.acel_m)}</td><td>${flFmt(r.n_acel)}</td><td>${flFmt(r.desac_m)}</td><td>${flFmt(r.n_desac)}</td></tr>`; }).join('')}
  </tbody></table>`;
}
function pPosTreino() {
  const pode = podeFisl(), sess = [...S.fl.sess].sort((a, b) => (b.data + (b.hora || '')).localeCompare(a.data + (a.hora || '')));
  const s = flSessao(S.fl.sel) || sess[0];
  $('#main').innerHTML = topo('Fisiologia', 'Pós-treino', 'Relatório da sessão a partir do CSV do Catapult (OpenField), no padrão do Departamento de Saúde e Performance.',
    `${s ? '<button class="btn" id="flpdf">Baixar PDF</button>' : ''}${pode ? '<button class="btn pri" id="flimp">+ Importar sessão (CSV)</button>' : ''}`) + flTabs('pos') + (!s ? `<div class="panel empty">Nenhuma sessão importada ainda.${pode ? ' Use “+ Importar sessão (CSV)” com o arquivo exportado do OpenField.' : ''}</div>` : (() => {
    const D = flDados(s), m = D.med, kpi = (l, v, sub = 'média') => `<div class="card"><div class="l">${l}</div><div class="v">${v}</div><div class="s">${sub}</div></div>`;
    const cal = s.sessao_id && S.sessoes.find(x => x.id === s.sessao_id);
    return `<div class="dm-dia"><select class="in" id="flsel">${sess.map(x => `<option value="${x.id}"${x.id === s.id ? ' selected' : ''}>${dataBR(x.data)} · ${esc(x.tipo)}${x.titulo ? ' · ' + esc(x.titulo) : ''}${x.hora ? ' · ' + esc(x.hora.slice(0, 5)) : ''}</option>`).join('')}</select>
      <b>${esc(fmtLong(s.data))}</b><span class="m">${flDur(s.duracao_s)} · ${D.tot.length} atletas${cal ? ` · calendário: ${esc([cal.tipo, cal.titulo].filter(Boolean).join(' · '))}` : ''}</span>${pode ? '<button class="btn sm" id="flrm">Excluir sessão</button>' : ''}</div>
    <h3 class="dc-bloco">Visão da sessão <small>média do grupo</small></h3>
    <div class="cards fs-kpis fl-kpis">${kpi('Distância total', flFmt(m.dist, 1) + ' m')}${kpi('Distância relativa', flFmt(m.mmin, 1) + ' m/min')}${kpi('Alta intensidade', flFmt(m.ai, 1) + ' m')}${kpi('Sprint', flFmt(m.sprint, 1) + ' m', `média · ${flFmt(m.n_sprints, 1)} sprints`)}
      ${kpi('Acelerações', flFmt(m.n_acel, 1), `média · ${flFmt(m.acel_m, 1)} m`)}${kpi('Desacelerações', flFmt(m.n_desac, 1), `média · ${flFmt(m.desac_m, 1)} m`)}${kpi('Vel. máxima', flFmt(m.vmax, 1) + ' km/h', 'média do grupo')}${kpi('Maior distância', flFmt(D.maior('dist')?.dist) + ' m', esc(flNomeAt(D.maior('dist') || {})))}</div>
    ${D.per.length ? `<h3 class="dc-bloco">Distribuição por parte</h3><div class="fl-per">${D.per.map(p => `<div class="panel"><b>${esc(p.nome)}</b><div class="fl-per-v"><span><small>Duração</small>${flDur(p.dur)}</span><span><small>Distância</small>${flFmt(p.dist)} m</span><span><small>m/min</small>${flFmt(p.mmin)}</span><span><small>Alta int.</small>${flFmt(p.ai)} m</span></div></div>`).join('')}</div>` : ''}
    <div class="panel"><h2>Indicadores individuais <small class="m">clique no atleta para ver cada parte · setas = diferença de 10% ou mais da média dele (a partir de 3 sessões)</small></h2><div class="tablewrap">${flTabela(s, D)}</div>
      <p class="m fl-nota">% vmáx = em relação à maior velocidade já registrada do atleta no CINQ (aparece a partir de 3 sessões). Quando houver o teste de velocidade máxima, passa a usar o teste.</p></div>
    ${D.dest.length ? `<div class="panel"><h2>Destaques <small class="m">o sistema sinaliza, o fisiologista decide</small></h2><div class="dc-al">${D.dest.map(([t, r, x]) => `<div class="dc-ali n-${/Tempo|DM|Recém/.test(t) ? 'al' : 'at'}"><span class="dc-tp">${esc(t)}</span><b>${esc(flNomeAt(r))}</b><span class="m">${esc(x)}</span></div>`).join('')}</div></div>` : ''}
    <div class="grid2"><div class="panel"><h2>Distância total (m)</h2><div class="fs-bars">${flBarras(D.tot, 'dist')}</div></div><div class="panel"><h2>Distância relativa (m/min)</h2><div class="fs-bars">${flBarras(D.tot, 'mmin')}</div></div>
      <div class="panel"><h2>Alta intensidade (m)</h2><div class="fs-bars">${flBarras(D.tot, 'ai')}</div></div><div class="panel"><h2>Velocidade máxima (km/h)</h2><div class="fs-bars">${flBarras(D.tot, 'vmax', 2)}</div></div>
      <div class="panel"><h2>Sprint (m)</h2><div class="fs-bars">${flBarras(D.tot, 'sprint')}</div></div><div class="panel"><h2>Acelerações / desacelerações (nº)</h2><div class="fs-bars">${flBarras(D.tot, 'n_acel', 0, '', ' fl-am')}</div><h4 class="dm-h4">Desacelerações</h4><div class="fs-bars">${flBarras(D.tot, 'n_desac', 0, '', ' fl-am')}</div></div></div>`;
  })());
  ligarFlTabs();
  if ($('#flimp')) $('#flimp').onclick = escolherCatapult;
  if (!s) return;
  $('#flsel').onchange = e => { S.fl.sel = +e.target.value; pPosTreino(); };
  $('#flpdf').onclick = () => imprimirFl(relPosHTML(s), `Relatorio_Treino_QFC_${s.data}`);
  document.querySelectorAll('[data-flat]').forEach(tr => tr.onclick = () => flPartesAtleta(s, tr.dataset.flat));
  if ($('#flrm')) $('#flrm').onclick = async () => { if (!confirm(`Excluir a sessão de ${dataBR(s.data)} e todos os dados do GPS dela?`)) return;
    const { error } = await sb.from('fisl_sessoes').delete().eq('id', s.id); if (error) return toast(erroAmigavel(error), true);
    S.fl.sess = S.fl.sess.filter(x => x.id !== s.id); S.fl.gps = S.fl.gps.filter(x => x.sessao_id !== s.id); S.fl.sel = null; toast('Sessão excluída.'); pPosTreino(); };
}
function flPartesAtleta(s, nome) {
  const rs = S.fl.gps.filter(g => g.sessao_id === s.id && g.nome_origem === nome).sort((a, b) => (a.periodo || 99) - (b.periodo || 99));
  const tot = rs.find(r => r.periodo === 0), nomeP = n => n === 0 ? 'Sessão' : s.periodos.find(p => p.num === n)?.nome || 'Parte ' + n;
  modal(`<h2>${esc(flNomeAt(tot || rs[0]))} · ${dataBR(s.data)}</h2><div class="tablewrap"><table class="tb"><thead><tr><th>Parte</th><th>Duração</th><th>Distância</th><th>m/min</th><th>Alta int.</th><th>Sprint</th><th>Vmáx</th><th>Acel.</th><th>Desac.</th></tr></thead><tbody>
    ${[...rs.filter(r => r.periodo > 0), tot].filter(Boolean).map(r => `<tr${r.periodo === 0 ? ' class="fl-totrow"' : ''}><td><b>${esc(nomeP(r.periodo))}</b></td><td>${flDur(r.duracao_s)}</td><td>${flFmt(r.dist)} m</td><td>${flFmt(r.mmin)}</td><td>${flFmt(r.ai)} m</td><td>${flFmt(r.sprint)} m</td><td>${flFmt(r.vmax, 2)}</td><td>${flFmt(r.n_acel)}</td><td>${flFmt(r.n_desac)}</td></tr>`).join('')}
    </tbody></table></div><div class="mfoot"><span></span><button class="btn" id="flpf">Fechar</button></div>`, true);
  $('#flpf').onclick = fechar;
}

/* ============ PRONTIDÃO (CMJ) ============ */
const flRuido = () => +(S.fl.cfg.prontidao?.ruido_pct ?? 3);
function flLeitura(c) {
  if (c.ref == null) return { sw: '', cq: 'sem referência', cor: 'nd', d: null };
  const d = c.cmj - c.ref, swc = +c.swc || 0, lim = Math.max(swc, c.ref * flRuido() / 100);
  const sw = d < -swc ? 'Abaixo da faixa' : d > swc ? 'Acima da faixa' : 'Dentro da faixa';
  const cq = d < -lim ? 'Queda além do ruído' : d < -swc ? 'Queda pequena (dentro do ruído)' : d > lim ? 'Melhor que o habitual' : 'Normal';
  return { sw, cq, cor: d < -lim ? 'al' : d < -swc ? 'at' : 'ok', d, lim, pct: d / c.ref * 100 };
}
function flSemaforo(c, data) {
  const L = flLeitura(c), m = [];
  let cor = L.cor === 'al' ? 'vm' : L.cor === 'at' ? 'am' : 'vd';
  if (L.cor === 'al') m.push('CMJ em queda além do ruído');
  if (L.cor === 'at') m.push('queda pequena no CMJ');
  if (c.atleta_id && typeof situacao === 'function' && S.dm?.ok) {
    const st = situacao(c.atleta_id); if (st.sit !== 'Liberado') { m.push(`${st.sit} (${st.lesao.etapa})`); cor = 'vm'; }
    const lib = S.dm.lesoes.find(l => l.atleta_id === c.atleta_id && l.data_retorno && l.data_retorno <= data && diasEntre(l.data_retorno, data) <= 14);
    if (lib) { m.push(`recém-liberado (${fmt(lib.data_retorno)})`); if (cor === 'vd') cor = 'am'; }
  }
  if (c.atleta_id) { // carga do dia anterior acima do habitual
    const ont = S.fl.sess.filter(s => s.data < data && diasEntre(s.data, data) <= 1).map(s => S.fl.gps.find(g => g.sessao_id === s.id && g.atleta_id === c.atleta_id && g.periodo === 0)).filter(Boolean)[0];
    const hist = S.fl.gps.filter(g => g.atleta_id === c.atleta_id && g.periodo === 0), med = flMedia(hist, 'dist');
    if (ont && hist.length >= 4 && med && ont.dist > med * 1.2) { m.push(`carga alta ontem (${flFmt(ont.dist)} m, média ${flFmt(med)} m)`); if (cor === 'vd') cor = 'am'; }
  }
  return { cor, motivos: m, L };
}
function pProntidao() {
  const pode = podeFisl(), datas = [...new Set(S.fl.cmj.map(c => c.data))].sort().reverse();
  const d = S.fl.dataP && datas.includes(S.fl.dataP) ? S.fl.dataP : datas[0];
  const cs = S.fl.cmj.filter(c => c.data === d).sort((a, b) => flNomeAt(a).localeCompare(flNomeAt(b), 'pt'));
  const linhas = cs.map(c => ({ c, s: flSemaforo(c, d) })), n = k => linhas.filter(x => x.s.cor === k).length;
  const ant = c => S.fl.cmj.filter(x => x.nome_origem === c.nome_origem && x.data < d).sort((a, b) => b.data.localeCompare(a.data))[0];
  $('#main').innerHTML = topo('Fisiologia', 'Prontidão', 'CMJ antes do treino. O semáforo junta o salto, a situação no DM e a carga do dia anterior: o sistema sinaliza, o fisiologista decide.',
    `${d ? '<button class="btn" id="flcpdf">Baixar PDF</button>' : ''}${pode ? '<button class="btn" id="flcfg">Ruído do salto</button><button class="btn pri" id="flcmj">+ Lançar CMJ</button>' : ''}`) + flTabs('prontidao') + (!d ? `<div class="panel empty">Nenhum CMJ lançado ainda.${pode ? ' Use “+ Lançar CMJ” e cole a tabela do relatório do software do salto.' : ''}</div>` : `
    <div class="dm-dia"><select class="in" id="fldt">${datas.map(x => `<option value="${x}"${x === d ? ' selected' : ''}>${dataBR(x)}</option>`).join('')}</select><b>${esc(fmtLong(d))}</b></div>
    <div class="cards fs-kpis"><div class="card"><div class="l">Avaliados</div><div class="v">${cs.length}</div><div class="s">${cs.filter(c => c.atleta_id).length} do elenco</div></div>
      <div class="card fl-c-vd"><div class="l">Verde</div><div class="v">${n('vd')}</div><div class="s">treino normal</div></div>
      <div class="card fl-c-am"><div class="l">Amarelo</div><div class="v">${n('am')}</div><div class="s">atenção</div></div>
      <div class="card fl-c-vm"><div class="l">Vermelho</div><div class="v">${n('vm')}</div><div class="s">conversar antes do treino</div></div></div>
    <div class="panel"><h2>Resultados individuais <small class="m">clique no atleta para ver a evolução</small></h2><div class="tablewrap"><table class="tb fl-tab"><thead><tr><th></th><th>Atleta</th><th>Posição</th><th>CMJ (cm)</th><th>Ref. (cm)</th><th>Δ (cm)</th><th>Δ (%)</th><th>SWC</th><th>Leitura do software</th><th>Leitura CINQ</th><th>Anterior</th><th>Motivos</th></tr></thead><tbody>
      ${linhas.map(({ c, s }) => { const a = ant(c), L = s.L;
        return `<tr data-flc="${esc(c.nome_origem)}" class="dm-tr"><td><i class="fl-sem fl-${s.cor}"></i></td><td><b>${esc(flNomeAt(c))}</b>${c.atleta_id ? '' : ' <small class="m">fora do elenco</small>'}</td><td>${esc(flPos(c))}</td><td><b>${flFmt(c.cmj, 2)}</b></td><td>${flFmt(c.ref, 2)}</td>
        <td class="${L.cor === 'al' ? 'fl-neg' : ''}">${L.d == null ? '—' : (L.d > 0 ? '+' : '') + flFmt(L.d, 2)}</td><td>${L.d == null ? '—' : (L.pct > 0 ? '+' : '') + flFmt(L.pct, 1)}</td><td>${flFmt(c.swc, 2)}</td>
        <td class="m">${esc(L.sw)}</td><td><b class="fl-l-${L.cor}">${esc(L.cq)}</b></td><td>${a ? `${flFmt(a.cmj, 2)} <small class="m">${fmt(a.data)}</small>` : '—'}</td><td class="m sm">${esc(s.motivos.join(' · '))}</td></tr>`; }).join('')}
    </tbody></table></div>
    <p class="m fl-nota">Leitura do software = referência ± SWC. Leitura CINQ: uma queda só conta como queda quando passa do <b>maior entre o SWC e o ruído do salto (${flFmt(flRuido(), 1)}% da referência)</b>, porque a variação natural entre um salto e outro costuma ser maior que o SWC. Parâmetro de teste, a definir com o fisiologista.</p></div>`);
  ligarFlTabs();
  if (pode) { $('#flcmj').onclick = () => formCMJ(d || hoje()); $('#flcfg').onclick = flCfgRuido; }
  if (!d) return;
  $('#fldt').onchange = e => { S.fl.dataP = e.target.value; pProntidao(); };
  $('#flcpdf').onclick = () => imprimirFl(relCmjHTML(d), `Relatorio_CMJ_QFC_${d}`);
  document.querySelectorAll('[data-flc]').forEach(tr => tr.onclick = () => flEvolucaoCMJ(tr.dataset.flc));
}
function flCfgRuido() {
  modal(`<h2>Ruído do salto</h2><p class="m">Variação natural entre um salto e outro, em % da referência. Quedas menores que isso (ou que o SWC, o que for maior) não são tratadas como queda real. Literatura: CMJ costuma ficar entre 2% e 5%.</p>
    <label class="f"><span>Ruído (%)</span><input class="in" type="number" step="0.5" min="0" max="15" id="flrp" value="${flRuido()}"></label>
    <div class="mfoot"><span></span><div class="row"><button class="btn" id="flrc">Cancelar</button><button class="btn pri" id="flrs">Salvar</button></div></div>`);
  $('#flrc').onclick = fechar;
  $('#flrs').onclick = async () => { const v = +$('#flrp').value; if (!(v >= 0 && v <= 15)) return toast('Use um valor entre 0 e 15.', true);
    const { error } = await sb.from('fisl_config').upsert({ chave: 'prontidao', valor: { ruido_pct: v } }, { onConflict: 'chave' }); if (error) return toast(erroAmigavel(error), true);
    S.fl.cfg.prontidao = { ruido_pct: v }; fechar(); pProntidao(); };
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
function formCMJ(d) {
  modal(`<h2>Lançar CMJ</h2>
    <label class="f"><span>Data</span><input type="date" class="in" id="flcd" value="${d}"></label>
    <label class="f"><span>Cole a tabela do relatório (Atleta, Posição, CMJ, Ref., Δ cm, Δ %, SWC) — uma linha por atleta</span><textarea class="in fl-cola" id="flct" rows="9" placeholder="Antonio Villa	Meia	42,65	40,33	+2,32	+5,75	0,44"></textarea></label>
    <div id="flcprev" class="m"></div>
    <div class="mfoot"><span class="m">Lançar de novo a mesma data substitui os valores do atleta.</span><div class="row"><button class="btn" id="flcc">Cancelar</button><button class="btn pri" id="flcs">Continuar</button></div></div>`, true);
  const prev = () => { const r = lerTabelaCMJ($('#flct').value); $('#flcprev').innerHTML = r.length ? `${r.length} atleta${r.length > 1 ? 's' : ''}: ${r.map(x => `${esc(x.nome_origem)} ${flFmt(x.cmj, 2)}`).join(' · ')}` : ''; return r; };
  $('#flct').oninput = prev; $('#flcc').onclick = fechar;
  $('#flcs').onclick = () => {
    const data = $('#flcd').value, r = prev(); if (!data) return toast('Informe a data.', true); if (!r.length) return toast('Não reconheci nenhuma linha. Confira se tem o nome e o CMJ.', true);
    conferirNomes(r.map(x => x.nome_origem), 'Atletas do CMJ', async mapa => {
      const rows = r.map(x => ({ ...x, data, atleta_id: mapa[x.nome_origem] ?? null }));
      const { data: ins, error } = await sb.from('fisl_cmj').upsert(rows, { onConflict: 'data,nome_origem' }).select();
      if (error) { $('#flvs').disabled = false; return toast(erroAmigavel(error), true); }
      S.fl.cmj = S.fl.cmj.filter(c => !(c.data === data && rows.some(x => x.nome_origem === c.nome_origem))).concat(ins);
      S.fl.dataP = data; S.fl.aba = 'prontidao'; fechar(); toast(`CMJ de ${dataBR(data)}: ${ins.length} atletas.`); pFisiologia();
    }, Object.fromEntries(r.map(x => [x.nome_origem, x.posicao])));
  };
}
function flEvolucaoCMJ(nome) {
  const cs = S.fl.cmj.filter(c => c.nome_origem === nome).sort((a, b) => a.data.localeCompare(b.data)); if (!cs.length) return;
  const W = 620, H = 220, pl = 40, pr = 16, pt = 14, pb = 28, vals = cs.flatMap(c => [c.cmj, c.ref].filter(v => v != null).map(Number));
  const mn = Math.floor(Math.min(...vals) - 2), mx = Math.ceil(Math.max(...vals) + 2), x = i => cs.length === 1 ? (pl + W - pr) / 2 : pl + i * (W - pl - pr) / (cs.length - 1), y = v => pt + (mx - v) * (H - pt - pb) / (mx - mn);
  const banda = cs.filter(c => c.ref != null).map((c, i) => ({ i: cs.indexOf(c), lo: c.ref - Math.max(+c.swc || 0, c.ref * flRuido() / 100), hi: c.ref + Math.max(+c.swc || 0, c.ref * flRuido() / 100), ref: c.ref }));
  const svg = `<svg viewBox="0 0 ${W} ${H}" class="dc-svg">${[mn, Math.round((mn + mx) / 2), mx].map(v => `<line x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}" class="dc-g"/><text x="${pl - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`).join('')}
    ${banda.length > 1 ? `<polygon class="fl-banda" points="${banda.map(b => `${x(b.i)},${y(b.hi)}`).join(' ')} ${banda.slice().reverse().map(b => `${x(b.i)},${y(b.lo)}`).join(' ')}"/><polyline class="fl-ref" points="${banda.map(b => `${x(b.i)},${y(b.ref)}`).join(' ')}"/>` : ''}
    <polyline points="${cs.map((c, i) => `${x(i)},${y(c.cmj)}`).join(' ')}" class="dc-l"/>${cs.map((c, i) => `<circle cx="${x(i)}" cy="${y(c.cmj)}" r="4" class="dc-p"><title>${fmt(c.data)}: ${flFmt(c.cmj, 2)} cm</title></circle><text x="${x(i)}" y="${H - 8}" text-anchor="middle">${fmt(c.data)}</text>`).join('')}</svg>`;
  modal(`<h2>${esc(flNomeAt(cs[0]))} · evolução do CMJ</h2>${svg}<p class="m">Linha verde: CMJ. Faixa cinza: referência ± limite usado na leitura CINQ.</p>
    <div class="tablewrap"><table class="tb"><thead><tr><th>Data</th><th>CMJ</th><th>Ref.</th><th>Leitura CINQ</th></tr></thead><tbody>${cs.slice().reverse().map(c => `<tr><td>${dataBR(c.data)}</td><td>${flFmt(c.cmj, 2)}</td><td>${flFmt(c.ref, 2)}</td><td>${esc(flLeitura(c).cq)}</td></tr>`).join('')}</tbody></table></div>
    <div class="mfoot"><span></span><button class="btn" id="flef">Fechar</button></div>`, true);
  $('#flef').onclick = fechar;
}

/* ============ CARGA DA SEMANA ============ */
function pCargaFl() {
  const ini = S.fl.semana || (S.fl.semana = segunda(hoje())), fim = addDays(ini, 6);
  const ss = S.fl.sess.filter(s => s.data >= ini && s.data <= fim), ids = new Set(ss.map(s => s.id));
  const rs = S.fl.gps.filter(g => ids.has(g.sessao_id) && g.periodo === 0);
  const nomes = [...new Set(rs.map(r => r.nome_origem))];
  const lin = nomes.map(nm => { const x = rs.filter(r => r.nome_origem === nm), soma = k => x.reduce((t, r) => t + (+r[k] || 0), 0);
    const aid = x[0].atleta_id, ult = aid ? S.fl.sess.filter(s => s.data <= fim).sort((a, b) => b.data.localeCompare(a.data)).find(s => S.fl.gps.some(g => g.sessao_id === s.id && g.atleta_id === aid && g.periodo === 0 && (g.n_sprints || 0) > 0)) : null;
    return { r: x[0], n: x.length, min: soma('duracao_s') / 60, dist: soma('dist'), ai: soma('ai'), sprint: soma('sprint'), ns: soma('n_sprints'), vmax: Math.max(...x.map(r => +r.vmax || 0)), ad: soma('n_acel') + soma('n_desac'), ult }; })
    .sort((a, b) => b.dist - a.dist);
  const dias = [...Array(7)].map((_, k) => addDays(ini, k)), porDia = dias.map(d => { const sd = S.fl.sess.filter(s => s.data === d).map(s => s.id); const x = S.fl.gps.filter(g => sd.includes(g.sessao_id) && g.periodo === 0); return { d, v: flMedia(x, 'dist'), t: S.fl.sess.find(s => s.data === d)?.tipo }; });
  const mx = Math.max(1, ...porDia.map(p => p.v || 0));
  $('#main').innerHTML = topo('Fisiologia', 'Carga da semana', 'Soma das sessões do GPS por atleta na semana.', '') + flTabs('carga') + `
    <div class="dm-dia"><button class="btn sm" id="flsa">◀</button><b>Semana de ${fmt(ini)} a ${fmt(fim)}</b><button class="btn sm" id="flsp">▶</button>${ini !== segunda(hoje()) ? '<button class="btn sm" id="flsh">Esta semana</button>' : ''}<span class="m">${ss.length} sessão${ss.length === 1 ? '' : 'ões'}</span></div>
    <div class="panel"><h2>Distância média do grupo por dia</h2><div class="dc-cols fl-cols">${porDia.map(p => `<div class="dc-col"><div class="dc-stk" style="height:${(p.v || 0) / mx * 100}%"><i class="${p.t === 'Jogo' ? 'f-t' : 'f-p'}" style="flex:1"></i></div><b>${p.v ? flFmt(p.v) : ''}</b><span>${parse(p.d).toLocaleDateString('pt-BR', { weekday: 'short' }).slice(0, 3)} ${fmt(p.d).slice(0, 2)}</span></div>`).join('')}</div></div>
    <div class="panel"><h2>Por atleta</h2>${lin.length ? `<div class="tablewrap"><table class="tb fl-tab"><thead><tr><th>Atleta</th><th>Sessões</th><th>Minutos</th><th>Distância (m)</th><th>Alta int. (m)</th><th>Sprint (m)</th><th>Nº spr.</th><th>Vmáx sem.</th><th>Acel+desac</th><th>Último sprint</th></tr></thead><tbody>
      ${lin.map(x => `<tr><td><b>${esc(flNomeAt(x.r))}</b></td><td>${x.n}</td><td>${flFmt(x.min)}</td><td>${flFmt(x.dist)}</td><td>${flFmt(x.ai)}</td><td>${flFmt(x.sprint)}</td><td>${flFmt(x.ns)}</td><td>${flFmt(x.vmax, 1)}</td><td>${flFmt(x.ad)}</td><td>${x.ult ? `${fmt(x.ult.data)} <small class="m">(${(n => n === 1 ? '1 dia' : n + ' dias')(diasEntre(x.ult.data, fim < hoje() ? fim : hoje()))})</small>` : '—'}</td></tr>`).join('')}
    </tbody></table></div>` : '<p class="empty">Nenhuma sessão nesta semana.</p>'}
    <p class="m fl-nota">Relação carga recente × crônica, monotonia e minutos de exposição para o DM entram quando houver algumas semanas de dados.</p></div>`;
  ligarFlTabs();
  const irS = n => { S.fl.semana = n; pCargaFl(); };
  $('#flsa').onclick = () => irS(addDays(ini, -7)); $('#flsp').onclick = () => irS(addDays(ini, 7)); if ($('#flsh')) $('#flsh').onclick = () => irS(segunda(hoje()));
}

/* ============ PDF no padrão do Departamento de Saúde e Performance ============ */
const flCab = (tit, data, sub) => `<div class="flp-cab"><img src="${LOGO}" alt=""><div><small>QFC | DEPARTAMENTO DE SAÚDE E PERFORMANCE</small><h1>${esc(tit)}</h1></div><div class="flp-dt"><b>${parse(data).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/\./g, '').toUpperCase()}</b><span>${esc(sub)}</span></div></div>`;
function relPosHTML(s) {
  const D = flDados(s), m = D.med, sub = `${flDur(s.duracao_s)} | ${D.tot.length} atletas`, card = (l, v) => `<div class="flp-k"><small>${l}</small><b>${v}</b></div>`;
  const bl = (t, k, d = 0, cor = '') => `<div class="flp-box"><h4>${t}</h4>${flBarras(D.tot, k, d, '', cor)}</div>`;
  return `<section class="flp-pg">${flCab('RELATÓRIO DE TREINO', s.data, sub)}<h3>VISÃO DA SESSÃO <small>média do grupo</small></h3>
      <div class="flp-ks">${card('Distância total', flFmt(m.dist, 1) + ' m')}${card('Distância relativa', flFmt(m.mmin, 1) + ' m/min')}${card('Alta intensidade', flFmt(m.ai, 1) + ' m')}${card('Sprint', `${flFmt(m.sprint, 1)} m · ${flFmt(m.n_sprints, 1)}`)}
        ${card('Acelerações', `${flFmt(m.acel_m, 1)} m · ${flFmt(m.n_acel, 1)}`)}${card('Desacelerações', `${flFmt(m.desac_m, 1)} m · ${flFmt(m.n_desac, 1)}`)}</div>
      ${D.per.length ? `<h3>DISTRIBUIÇÃO POR PERÍODO</h3><div class="flp-ks">${D.per.map(p => card(p.nome, `${flDur(p.dur)} · ${flFmt(p.dist)} m · ${flFmt(p.mmin)} m/min`)).join('')}</div>` : ''}
      ${D.dest.length ? `<h3>DESTAQUES</h3><ul class="flp-dest">${D.dest.map(([t, r, x]) => `<li><b>${esc(flNomeAt(r))}</b> · ${esc(t)}: ${esc(x)}</li>`).join('')}</ul>` : ''}</section>
    <section class="flp-pg">${flCab('INDICADORES INDIVIDUAIS', s.data, sub)}${flTabela(s, D, true)}
      <h3>MAIORES VALORES OBSERVADOS</h3><div class="flp-ks">${[['dist', 'Distância total', ' m', 0], ['ai', 'Alta intensidade', ' m', 0], ['vmax', 'Vmáx.', ' km/h', 2], ['acel_m', 'Dist. aceleração', ' m', 0]].map(([k, l, u, d]) => { const r = D.maior(k); return card(l, r ? `${esc(flNomeAt(r))} · ${flFmt(r[k], d)}${u}` : '—'); }).join('')}</div></section>
    <section class="flp-pg">${flCab('DURAÇÃO E DISTÂNCIAS', s.data, sub)}<div class="flp-g2">${bl('Duração individual', 'duracao_s')}${bl('Distância total (m)', 'dist')}${bl('Distância relativa (m/min)', 'mmin')}${bl('Alta intensidade (m)', 'ai')}</div></section>
    <section class="flp-pg">${flCab('VELOCIDADE, SPRINT E ACELERAÇÕES', s.data, sub)}<div class="flp-g2">${bl('Velocidade máxima (km/h)', 'vmax', 2)}${bl('Distância de sprint (m)', 'sprint')}${bl('Número de acelerações', 'n_acel', 0, ' fl-am')}${bl('Número de desacelerações', 'n_desac', 0, ' fl-am')}</div></section>`;
}
function relCmjHTML(d) {
  const cs = S.fl.cmj.filter(c => c.data === d).sort((a, b) => flNomeAt(a).localeCompare(flNomeAt(b), 'pt')), L = cs.map(c => ({ c, s: flSemaforo(c, d) })), n = k => L.filter(x => x.s.cor === k).length;
  return `<section class="flp-pg">${flCab('RELATÓRIO DE PRONTIDÃO | CMJ', d, `${cs.length} atletas`)}
    <div class="flp-ks">${[['Avaliados', cs.length], ['Verde', n('vd')], ['Amarelo', n('am')], ['Vermelho', n('vm')]].map(([l, v]) => `<div class="flp-k"><small>${l}</small><b>${v}</b></div>`).join('')}</div>
    <table class="tb fl-tab"><thead><tr><th></th><th>Atleta</th><th>Posição</th><th>CMJ (cm)</th><th>Ref. (cm)</th><th>Δ (cm)</th><th>Δ (%)</th><th>SWC</th><th>Leitura CINQ</th><th>Motivos</th></tr></thead><tbody>
    ${L.map(({ c, s }) => `<tr><td><i class="fl-sem fl-${s.cor}"></i></td><td><b>${esc(flNomeAt(c))}</b></td><td>${esc(flPos(c))}</td><td><b>${flFmt(c.cmj, 2)}</b></td><td>${flFmt(c.ref, 2)}</td><td>${s.L.d == null ? '—' : (s.L.d > 0 ? '+' : '') + flFmt(s.L.d, 2)}</td><td>${s.L.d == null ? '—' : (s.L.pct > 0 ? '+' : '') + flFmt(s.L.pct, 1)}</td><td>${flFmt(c.swc, 2)}</td><td>${esc(s.L.cq)}</td><td>${esc(s.motivos.join(' · '))}</td></tr>`).join('')}
    </tbody></table><p class="flp-nota">Leitura CINQ: queda só conta quando passa do maior entre o SWC e o ruído do salto (${flFmt(flRuido(), 1)}% da referência). O semáforo junta o salto, a situação no DM e a carga do dia anterior; a decisão é do fisiologista.</p></section>`;
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

/* ============ abas e encaixe no sistema ============ */
const flTabs = ab => `<div class="ind-tabs fs-tabs">${FL_ABAS.map(([k, l]) => `<button data-flaba="${k}" class="${k === ab ? 'on' : ''}">${l}</button>`).join('')}<span class="fl-teste">versão de teste</span></div>`;
const ligarFlTabs = () => document.querySelectorAll('[data-flaba]').forEach(b => b.onclick = () => { S.fl.aba = b.dataset.flaba; pFisiologia(); window.scrollTo(0, 0); });
async function pFisiologia() {
  $('#main').innerHTML = topo('Fisiologia', FL_ABAS.find(a => a[0] === S.fl.aba)?.[1] || '', '') + flTabs(S.fl.aba) + '<div class="panel empty">Carregando…</div>';
  try { await carregarFl(); if (typeof carregarDM === 'function') await carregarDM().catch(() => {}); } catch (e) { $('#main .panel').innerHTML = esc(erroAmigavel(e)); return; }
  ({ pos: pPosTreino, prontidao: pProntidao, carga: pCargaFl }[S.fl.aba] || pPosTreino)();
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
