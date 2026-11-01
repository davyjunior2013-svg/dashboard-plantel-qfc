/* CINQ · Leitor de súmula da FNF (súmula on-line em PDF)
   Entrada: páginas com itens de texto [texto, x, y]. Saída: jogo, equipes, jogadores, gols, cartões, substituições. */
'use strict';

const SUM_SA = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const SUM_SECOES = ['Arbitragem', 'Cronologia', 'Relação de Jogadores', 'Comissão Técnica', 'Gols', 'Cartões Amarelos',
  'Cartões Vermelhos', 'Ocorrências / Observações', 'Observações Eventuais', 'Substituições'];

// título de seção, tolerando pequenas variações de leitura por imagem
function sumSecaoDe(l) {
  if (SUM_SECOES.includes(l.t)) return l.t;
  if (l.c.length > 2 || /\.\s*$/.test(l.t) || l.t === l.t.toUpperCase()) return null;
  const n = SUM_SA(l.t).toLowerCase().replace(/[^a-z]/g, '');
  if (n.length > 28) return null;
  if (/relacao.*jogador/.test(n)) return 'Relação de Jogadores';
  if (/^comissaotec/.test(n)) return 'Comissão Técnica';
  if (/^gols?$/.test(n)) return 'Gols';
  if (/^cartoesamarel/.test(n)) return 'Cartões Amarelos';
  if (/^cartoesvermelh/.test(n)) return 'Cartões Vermelhos';
  if (/^substitui/.test(n)) return 'Substituições';
  if (/^arbitragem$/.test(n)) return 'Arbitragem';
  if (/^cronologia$/.test(n)) return 'Cronologia';
  if (/^ocorrencias/.test(n)) return 'Ocorrências / Observações';
  if (/^observacoeseventuais/.test(n)) return 'Observações Eventuais';
  return null;
}

function sumLinhas(paginas) {
  const out = [];
  paginas.forEach((p, pi) => {
    const rows = [];
    p.items.forEach(([s, x, y]) => {
      s = String(s).trim(); if (!s) return;
      let r = rows.find(r => Math.abs(r.y - y) <= 2);
      if (!r) { r = { y, c: [] }; rows.push(r); }
      r.c.push({ s, x });
    });
    rows.sort((a, b) => b.y - a.y).forEach(r => { r.c.sort((a, b) => a.x - b.x); r.p = pi; r.w = p.w || 595; r.t = r.c.map(c => c.s).join(' '); out.push(r); });
  });
  return out.filter(r => !/Publica[cç][aã]o da S[uú]mula|^\*+ ?PREVIEW/i.test(r.t));
}

// "Matheus Alves Matheus Alves da Sil ..." → ["Matheus Alves", "Matheus Alves da Sil ..."]
function sumSeparaNome(s) {
  const w = s.split(/\s+/);
  for (let i = 1; i < w.length; i++) if (SUM_SA(w[i]).toLowerCase() === SUM_SA(w[0]).toLowerCase()) return [w.slice(0, i).join(' '), w.slice(i).join(' ')];
  return [s, s];
}
// nome para exibir: apelido; se veio cortado ("Wellington ..."), completa com o nome
function sumNomeExib(apelido, nome) {
  const a = apelido.replace(/\s*\.\.\.$/, '').trim(), n = String(nome || '').replace(/\s*\.\.\.$/, '').trim();
  if (!/\.\.\.$/.test(apelido)) return a;
  const wa = a.split(/\s+/), wn = n.split(/\s+/);
  if (wn[0] && SUM_SA(wn[0]).toLowerCase() === SUM_SA(wa[0]).toLowerCase()) return wn.slice(0, Math.max(2, wa.length)).join(' ');
  return a;
}
const sumNorm = s => SUM_SA(s).toLowerCase().replace(/\.\.\.$/, '').replace(/[\s\-\/]+rn\s*$/, '').replace(/[^a-z0-9]/g, '');

function sumNomeCurto(s) {
  let n = String(s).replace(/\s*[\/-]\s*[A-Z]{2}\s*$/, '');
  n = n.replace(/\bSociedade An[oô]nima do Futebol\b/gi, '').replace(/\b(Futebol Clube|Esporte Clube|Sport Clube|Atl[eé]tico Clube|Clube)\b/gi, '')
    .replace(/\b(F|E|S|A)\.\s?(C|A)\.(\s?F\.)?/gi, '').replace(/\bS\/?A\b/gi, '').replace(/[.\s]+$/, '').replace(/\s+/g, ' ').trim();
  return (n || s).toUpperCase();
}

// minuto da súmula → minuto corrido do jogo (0-90)
function sumMinAbs(tempo, mm) {
  const m = parseInt(mm, 10) || 0, t = String(tempo).toUpperCase();
  if (t === 'INT') return 45;
  if (t === '2T' || t === '2') return Math.min(90, 45 + m);
  return Math.min(45, m);
}
function sumMinTxt(tempo, mm) {
  const m = parseInt(mm, 10) || 0, t = String(tempo).toUpperCase();
  if (t === 'INT') return 'Intervalo';
  if (t === '2T' || t === '2') return m > 45 ? `90+${m - 45}'` : `${45 + m}'`;
  return m > 45 ? `45+${m - 45}'` : `${m}'`;
}

// minuto na súmula: "06:00", "45+3", "45:00+3", "+3", "+03:00" (acréscimo); devolve minuto do tempo (48 = 45+3) e onde termina
function sumTempo(c) {
  const a = String(c[0] || '').replace(/\s+/g, ''), b = String(c[1] || '').replace(/\s+/g, '');
  let m;
  if ((m = a.match(/^(\d{1,3})(?::\d{2})?\+(\d{1,2})(?::\d{2})?$/))) return { minuto: +m[1] + +m[2], k: 1 };
  if ((m = a.match(/^\+(\d{1,2})(?::\d{2})?$/))) { let n = +m[1]; if (n > 20) n = Math.floor(n / 10); return { minuto: 45 + n, k: 1 }; } // acréscimo > 20 = leitura com dígito a mais
  if ((m = a.match(/^(\d{1,3}):\d{2}$/))) {
    const x = b.match(/^\+(\d{1,2})(?::\d{2})?$/);
    return x ? { minuto: +m[1] + +x[1], k: 2 } : { minuto: +m[1], k: 1 };
  }
  return null;
}

// nome do arquivo da federação: "ABC_3_x_1_QFC_Semifinal_Volta.pdf" → placar, fase, rodada
function sumInfoArquivo(nome) {
  const t = SUM_SA(String(nome || '').replace(/\.pdf$/i, '').replace(/[_\-]+/g, ' ')).toLowerCase();
  const pl = t.match(/(\d{1,2})\s*x\s*(\d{1,2})/), rd = t.match(/(\d{1,2})\s*[ªaº]?\s*rodada|rodada\s*(\d{1,2})/);
  const fase = /quartas/.test(t) ? 'Quartas de final' : /semi/.test(t) ? 'Semifinal' : /\bfinal\b/.test(t) ? 'Final' : /rodada/.test(t) ? '1ª fase' : null;
  return { placar: pl ? [+pl[1], +pl[2]] : null, fase, rodada: rd ? +(rd[1] || rd[2]) : null, volta: /\bvolta\b/.test(t), ida: /\bida\b/.test(t) };
}

// minutos de cada atleta e alertas de consistência; aposEdicao = depois de correção manual na conferência
function sumRecalcular(r, aposEdicao) {
  const jogadorDe = (lado, num) => r.equipes[lado]?.jogadores.find(j => String(j.numero) === String(num));
  if (aposEdicao) {
    r.alertas = [];
    [...r.gols, ...r.cartoes].forEach(ev => { const j = jogadorDe(ev.equipe, ev.numero); ev.cbf = j?.cbf || null; if (j) ev.nome = j.apelido; });
    r.subs.forEach(sb => { const je = jogadorDe(sb.equipe, sb.entrou), js = jogadorDe(sb.equipe, sb.saiu); sb.cbf = je?.cbf || null; sb.cbf2 = js?.cbf || null; sb.nome = je?.apelido || `nº ${sb.entrou}`; sb.nome2 = js?.apelido || `nº ${sb.saiu}`; });
    r.subs.forEach(sb => { if (!jogadorDe(sb.equipe, sb.entrou) || !jogadorDe(sb.equipe, sb.saiu)) r.alertas.push(`Substituição com número fora da relação: ${sumMinTxt(sb.tempo, sb.minuto)} ${sb.entrou} ↔ ${sb.saiu}`); });
    [...r.gols, ...r.cartoes].forEach(ev => { if (/^\d+$/.test(String(ev.numero)) && !jogadorDe(ev.equipe, ev.numero)) r.alertas.push(`Nº ${ev.numero} (${ev.cor ? 'cartão' : 'gol'}) não está na relação de jogadores.`); });
  } else r.alertas = r.alertas.filter(a => !/titulares na súmula|gol\(s\) listados/.test(a));
  r.equipes.forEach((e, lado) => {
    e.jogadores.forEach(j => { j.entrou = j.titular ? 0 : null; j.saiu = j.titular ? 90 : null; });
    r.subs.filter(s => s.equipe === lado).sort((a, b) => sumMinAbs(a.tempo, a.minuto) - sumMinAbs(b.tempo, b.minuto)).forEach(s => {
      const m = sumMinAbs(s.tempo, s.minuto), je = jogadorDe(lado, s.entrou), js = jogadorDe(lado, s.saiu);
      if (js && js.entrou != null) js.saiu = m;
      if (je) { je.entrou = m; je.saiu = 90; }
    });
    r.cartoes.filter(c => c.equipe === lado && c.cor === 'vermelho').forEach(c => { const j = jogadorDe(lado, c.numero); if (j && j.entrou != null) j.saiu = Math.min(j.saiu ?? 90, sumMinAbs(c.tempo, c.minuto)); });
    e.jogadores.forEach(j => { j.minutos = j.entrou != null ? Math.max(0, (j.saiu ?? 90) - j.entrou) : 0; });
    const tit = e.jogadores.filter(j => j.titular).length;
    if (tit !== 11) r.alertas.push(`${e.nome_sumula}: ${tit} titulares na súmula (esperado 11).`);
  });
  if (r.ft) [0, 1].forEach(lado => {
    const g = r.gols.filter(x => (x.tipo === 'CT' ? x.equipe !== lado : x.equipe === lado)).length;
    if (g !== r.ft[lado]) r.alertas.push(`${r.equipes[lado].nome_sumula}: ${g} gol(s) listados, placar diz ${r.ft[lado]}.`);
  });
}

function lerSumula(paginas) {
  const L = sumLinhas(paginas), r = { alertas: [], equipes: [], gols: [], cartoes: [], subs: [] };
  let sec = '';
  const secao = {};
  L.forEach(l => {
    const h = sumSecaoDe(l);
    if (h) { sec = h; secao[sec] = []; return; }
    (secao[sec || 'Cabeçalho'] = secao[sec || 'Cabeçalho'] || []).push(l);
  });
  // cabeçalho
  (secao['Cabeçalho'] || []).forEach(l => {
    let m;
    if (!r.jogo_num && (m = l.t.match(/Jogo:\s*(\d{1,4})(?:\s|$)/))) r.jogo_num = +m[1];
    else if ((m = l.t.match(/^Jogo:\s*(.+?)\s+X\s+(.+)$/))) { r.mandante = m[1].trim(); r.visitante = m[2].trim(); }
    if ((m = l.t.match(/Campeonato:\s*(.+?)\s+Rodada:\s*(\d+)/))) { r.competicao = m[1].trim(); r.rodada = +m[2]; }
    if ((m = l.t.match(/Data:\s*(\d{2})\/(\d{2})\/(\d{4})(?:\s+Hor[aá]rio:\s*(\S+))?(?:\s+Est[aá]dio:\s*(.+))?/))) { r.data = `${m[3]}-${m[2]}-${m[1]}`; r.hora = m[4] || null; r.estadio = (m[5] || '').trim() || null; }
  });
  (secao['Cronologia'] || []).forEach(l => {
    let m; l = { ...l, t: l.t.replace(/X\s*[Oo]\b/g, 'X 0').replace(/\b[Oo]\s*X/g, '0 X') };
    if ((m = l.t.match(/Resultado do 1\S*\s*Tempo:?\s*(\d+)\s*X\s*(\d+)/i))) r.ht = [+m[1], +m[2]];
    if ((m = l.t.match(/Resultado Final:?\s*(\d+)\s*X\s*(\d+)/i))) r.ft = [+m[1], +m[2]];
  });
  if (!r.jogo_num || !r.mandante) throw new Error('Não parece uma súmula da federação (não achei o número do jogo e os clubes).');

  // relação de jogadores (duas colunas: mandante à esquerda, visitante à direita)
  const jog = secao['Relação de Jogadores'] || [];
  const meio = (jog[0]?.w || 595) / 2;
  const cab = jog.find(l => !/Apelido|Nome Completo/i.test(l.t) && !/^\d/.test(l.t));
  const nomesEq = cab ? [cab.c.filter(c => c.x < meio).map(c => c.s).join(' '), cab.c.filter(c => c.x >= meio).map(c => c.s).join(' ')] : [r.mandante, r.visitante];
  r.equipes = nomesEq.map((n, i) => ({ nome_sumula: n || (i ? r.visitante : r.mandante), jogadores: [], comissao: {} }));
  // leitura por imagem pode trocar caracteres no nº (7 → /, 2 → Z...) ou na coluna T/R (T → 1, I, 7)
  const SUM_DIG = { '/': '7', '?': '7', 'T': '7', 'Z': '2', 'z': '2', 'I': '1', 'l': '1', '|': '1', 'i': '1', 'O': '0', 'o': '0', 'Q': '0', 'D': '0', 'S': '5', 's': '5', 'B': '8', 'g': '9', 'q': '9', 'A': '4', 'G': '6', 'b': '6' };
  const numDe = t => { const v = String(t || '').replace(/[\s.,'"`´]/g, ''); if (!v || v.length > 3) return null; const d = [...v].map(ch => /\d/.test(ch) ? ch : SUM_DIG[ch]).join(''); return /^\d{1,3}$/.test(d) && d.length === v.length ? d : null; };
  const ehCbf = x => /^[\d\s\/.,]{5,}$/.test(x) && x.replace(/\D/g, '').length >= 4;
  jog.forEach(l => {
    [0, 1].forEach(lado => {
      let c = l.c.filter(x => lado ? x.x >= meio : x.x < meio).map(x => x.s);
      if (!c.length || /Apelido|Nome Completo/i.test(c.join(' '))) return;
      let iTR = c.findIndex((x, k) => k > 0 && /^[TR]\s*(\(?[gq9]\)?)?$/i.test(x));
      const iCbf = c.findIndex((x, k) => k > 0 && ehCbf(x));
      // sem T/R reconhecido: usa a célula curta antes da coluna da CBF
      if (iTR < 0 && iCbf > 1) { const k = [iCbf - 2, iCbf - 1].find(k => k > 0 && c[k].length <= 5 && /^[T1Il7|fRrKk]/.test(c[k])); if (k != null) { iTR = k; c = c.slice(); c[k] = (/^[RrKk]/.test(c[k]) ? 'R' : 'T') + (/[gq9]/i.test(c[k].slice(1)) ? '(g)' : ''); } }
      // célula T/R em branco: a súmula lista os titulares primeiro, então completa pela ordem
      let trDeduzido = false;
      if (iTR < 0 && iCbf > 1 && (numDe(c[0]) != null || /^[A-Za-zÀ-ú]/.test(c[0]))) {
        const eqv = r.equipes[lado].jogadores, ult = eqv[eqv.length - 1], nTit = eqv.filter(j => j.titular).length;
        const tit = (!ult || ult.titular) && nTit < 11;
        let k = iCbf; if (k - 1 > 1 && c[k - 1].length <= 3) k--;
        c = [...c.slice(0, k), tit ? 'T' : 'R', ...c.slice(k)]; iTR = k; trDeduzido = true;
      }
      if (iTR < 0) return;
      let numero = numDe(c[0]);
      if (numero == null) {
        // nº ilegível ou célula vazia: mantém o atleta se a linha tem nome e CBF (o nº vem dos eventos ou da correção manual)
        if (iCbf < 0) return;
        if (/^[A-Za-zÀ-ú]/.test(c[0]) && c[0].length > 3) c = ['', ...c], iTR++;
      }
      const nomes = c.slice(1, iTR);
      let [apelido, nome] = nomes.length >= 2 ? [nomes[0], nomes.slice(1).join(' ')] : sumSeparaNome(nomes[0] || '');
      const cbf = c.slice(iTR + 1).map(x => /^[\d\s\/.,]{5,}$/.test(x) ? x.replace(/\D/g, '') : x).find(x => /^\d{4,}$/.test(x)) || `sem-cbf-${SUM_SA(r.equipes[lado].nome_sumula)}-${c[0]}`;
      const eq = r.equipes[lado];
      if (trDeduzido) r.alertas.push(`${eq.nome_sumula}: titular/reserva de ${sumNomeExib(apelido, nome)} não foi lido; considerado ${/^T/.test(c[iTR]) ? 'titular' : 'reserva'} pela ordem da súmula — confira.`);
      if (numero == null) r.alertas.push(`${eq.nome_sumula}: nº de ${sumNomeExib(apelido, nome)} não foi lido na súmula — confira em "Corrigir dados".`);
      eq.jogadores.push({ numero: numero == null ? null : +numero, apelido: sumNomeExib(apelido, nome), nome: nome.replace(/\s*\.\.\.$/, ''), cbf,
        titular: /^T/i.test(c[iTR]), goleiro: /[gq9]/i.test(c[iTR]), ordem: eq.jogadores.length + 1 });
    });
  });
  // comissão técnica
  (secao['Comissão Técnica'] || []).forEach(l => {
    [0, 1].forEach(lado => {
      const c = l.c.filter(x => lado ? x.x >= meio : x.x < meio).map(x => x.s);
      const k = c.findIndex(x => /:$/.test(x)); if (k < 0) return;
      const fun = c[k].replace(/:$/, '').trim(), nome = c.slice(k + 1).join(' ').trim();
      if (nome) r.equipes[lado].comissao[fun] = nome;
    });
  });
  r.equipes.forEach(e => { e.tecnico = e.comissao['Técnico'] || null; });

  const nEq = r.equipes.map(e => sumNorm(e.nome_sumula));
  const equipeDe = s => {
    const n = sumNorm(s); if (!n) return -1;
    let i = nEq.findIndex(t => t.startsWith(n) || n.startsWith(t));
    if (i < 0) i = nEq.findIndex(t => n.endsWith(t) || n.includes(t) || (n.length >= 5 && t.includes(n)));
    if (i < 0 && / - /.test(s)) i = equipeDe(s.split(' - ').pop());
    return i;
  };
  const jogadorDe = (lado, num) => r.equipes[lado]?.jogadores.find(j => String(j.numero) === String(num));

  // gols e cartões: tempo | 1T/2T | nº | (tipo) | nome | equipe — a equipe pode vir em coluna própria ou colada no nome ("Nome - Clube")
  const lerLinhaEvento = (l, comTipo) => {
    const tm = sumTempo(l.c.map(x => x.s)); if (!tm) return null;
    const c = l.c.map(x => x.s); let k = tm.k;
    let tempo = '1T';
    if (/^(1|2)T?$|^INT$/i.test(c[k] || '')) { tempo = /2/.test(c[k]) ? '2T' : /INT/i.test(c[k]) ? 'INT' : '1T'; k++; }
    else if (/^2[7TI1]{1,2}$|^1?[TI]{1,2}$|^1[1I]$/i.test(c[k] || '')) { tempo = /^2/.test(c[k]) ? '2T' : '1T'; k++; } // leitura por imagem: "271" = 2T, "TT" = 1T
    const numero = c[k++] || '';
    let tipo = null;
    if (comTipo && /^[A-Z]{2,3}$/.test(c[k] || '')) tipo = c[k++];
    const resto = l.c.slice(k);
    let eqTxt = resto.filter(x => x.x >= 400).map(x => x.s).join(' ');
    let nomeTxt = resto.filter(x => x.x < 400).map(x => x.s).join(' ');
    if (!eqTxt && / - /.test(nomeTxt)) { const p = nomeTxt.split(' - '); eqTxt = p.pop(); nomeTxt = p.join(' - '); }
    let lado = equipeDe(eqTxt);
    if (lado < 0) lado = equipeDe(nomeTxt);
    return { tempo, minuto: tm.minuto, numero, tipo, lado, nomeTxt: nomeTxt.trim() };
  };
  (secao['Gols'] || []).forEach(l => {
    const e = lerLinhaEvento(l, true); if (!e) return;
    const j = jogadorDe(e.lado, e.numero);
    r.gols.push({ equipe: e.lado, tempo: e.tempo, minuto: e.minuto, numero: e.numero, tipo: e.tipo || 'NR', nome: j?.apelido || e.nomeTxt, nomeCompleto: e.nomeTxt, cbf: j?.cbf || null });
    if (e.lado < 0) r.alertas.push(`Gol sem equipe identificada: ${l.t}`);
  });
  const cartoes = (lista, cor) => {
    let ult = null;
    lista.forEach(l => {
      const e = lerLinhaEvento(l, false);
      if (e) {
        const j = /^\d+$/.test(e.numero) ? jogadorDe(e.lado, e.numero) : null;
        ult = { cor, equipe: e.lado, tempo: e.tempo, minuto: e.minuto, numero: e.numero, nome: j?.apelido || e.nomeTxt, nomeCompleto: e.nomeTxt, cbf: j?.cbf || null, motivo: '' };
        r.cartoes.push(ult);
        if (e.lado < 0) r.alertas.push(`Cartão sem equipe identificada: ${l.t}`);
        else if (/^\d+$/.test(e.numero) && !j) r.alertas.push(`Cartão para o nº ${e.numero}, que não está na relação de jogadores.`);
      } else if (ult && !/^Tempo\b/.test(l.t) && !/N[AÃ]O HOUVE/i.test(l.t)) {
        ult.motivo = (ult.motivo + ' ' + l.t.replace(/^Motivo:\s*/i, '')).trim();
      }
    });
  };
  cartoes(secao['Cartões Amarelos'] || [], 'amarelo');
  cartoes(secao['Cartões Vermelhos'] || [], 'vermelho');
  r.cartoes.forEach(c => { if (c.cor === 'vermelho' && /segundo cart[aã]o amarelo|2[ºo°] cart[aã]o amarelo/i.test(SUM_SA(c.motivo))) c.segundo_amarelo = true; });
  // substituições: tempo | 1T/2T/INT | equipe | "21 - Nome" | "17 - Nome"
  (secao['Substituições'] || []).forEach(l => {
    const c = l.c.map(x => x.s); const tm = sumTempo(c); if (!tm) return;
    const ent = l.c.find(x => /^\d+\s*-\s*/.test(x.s) && x.x < 380), sai = l.c.find(x => /^\d+\s*-\s*/.test(x.s) && x.x >= 380);
    const eqTxt = l.c.filter(x => x !== ent && x !== sai && x.x > 100 && !/^(1T|2T|INT|\d)/.test(x.s)).map(x => x.s).join(' ');
    const tk = (c[tm.k] || '').toUpperCase(), lado = equipeDe(eqTxt), tempo = /^INT/.test(tk) ? 'INT' : /^2/.test(tk) ? '2T' : '1T';
    const nEnt = ent?.s.match(/^(\d+)/)?.[1], nSai = sai?.s.match(/^(\d+)/)?.[1];
    const je = jogadorDe(lado, nEnt), js = jogadorDe(lado, nSai);
    r.subs.push({ equipe: lado, tempo, minuto: tm.minuto, entrou: nEnt, saiu: nSai, cbf: je?.cbf || null, cbf2: js?.cbf || null,
      nome: je?.apelido || ent?.s.replace(/^\d+\s*-\s*/, ''), nome2: js?.apelido || sai?.s.replace(/^\d+\s*-\s*/, ''),
      nomeCompleto1: ent?.s.replace(/^\d+\s*-\s*/, ''), nomeCompleto2: sai?.s.replace(/^\d+\s*-\s*/, '') });
    if (lado < 0) r.alertas.push(`Substituição sem equipe identificada: ${l.t}`);
    else if (!je || !js) r.alertas.push(`Substituição com número fora da relação: ${l.t}`);
  });

  // conferência cruzada por nome: se o nº de um evento não está na relação (leitura por imagem), procura o atleta pelo nome
  const chaveNome = t => SUM_SA(String(t || '')).toLowerCase().replace(/\.\.\.$/, '').replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
  const porNome = (lado, nome) => {
    const k = chaveNome(nome); if (lado < 0 || k.length < 5) return null;
    const c = r.equipes[lado].jogadores.filter(j => { const n = chaveNome(j.nome); return n.length >= 5 && (k.startsWith(n) || n.startsWith(k)); });
    return c.length === 1 ? c[0] : null;
  };
  const corrigeNum = (lado, num, nome) => {
    if (jogadorDe(lado, num)) return;
    const j = porNome(lado, nome); if (!j) return;
    if (r.equipes[lado].jogadores.some(x => x !== j && String(x.numero) === String(num))) return;
    if (j.numero == null) { r.alertas = r.alertas.filter(a => !a.includes(`nº de ${j.apelido} não foi lido`)); r.alertas.push(`${r.equipes[lado].nome_sumula}: nº de ${j.apelido} não foi lido na relação; usado o ${num}, conferido pelo nome nos lances.`); }
    else r.alertas.push(`${r.equipes[lado].nome_sumula}: nº de ${j.apelido} corrigido de ${j.numero} para ${num} (conferido pelo nome).`);
    j.numero = +num;
  };
  r.subs.forEach(sb => {
    corrigeNum(sb.equipe, sb.entrou, sb.nomeCompleto1); corrigeNum(sb.equipe, sb.saiu, sb.nomeCompleto2);
    const je = jogadorDe(sb.equipe, sb.entrou), js = jogadorDe(sb.equipe, sb.saiu);
    if (je) { sb.cbf = je.cbf; sb.nome = je.apelido; } if (js) { sb.cbf2 = js.cbf; sb.nome2 = js.apelido; }
  });
  r.cartoes.forEach(c => { if (/^\d+$/.test(c.numero) && c.equipe >= 0) { corrigeNum(c.equipe, c.numero, c.nomeCompleto); const j = jogadorDe(c.equipe, c.numero); if (j) { c.cbf = j.cbf; c.nome = j.apelido; } } });
  r.gols.forEach(g => { if (g.equipe >= 0) { corrigeNum(g.equipe, g.numero, g.nomeCompleto); const j = jogadorDe(g.equipe, g.numero); if (j) { g.cbf = j.cbf; g.nome = j.apelido; } } });
  // alertas de número fora da relação, depois da conferência
  r.alertas = r.alertas.filter(a => !/fora da relação|não está na relação/.test(a));
  r.subs.forEach(sb => { if (sb.equipe >= 0 && (!jogadorDe(sb.equipe, sb.entrou) || !jogadorDe(sb.equipe, sb.saiu))) r.alertas.push(`Substituição com número fora da relação: ${sb.tempo} ${sb.minuto}' ${sb.entrou} ↔ ${sb.saiu}`); });
  r.cartoes.forEach(c => { if (/^\d+$/.test(c.numero) && c.equipe >= 0 && !jogadorDe(c.equipe, c.numero)) r.alertas.push(`Cartão para o nº ${c.numero}, que não está na relação de jogadores.`); });

  sumRecalcular(r);
  return r;
}

if (typeof module !== 'undefined') module.exports = { lerSumula, sumRecalcular, sumNomeCurto, sumMinAbs, sumMinTxt, sumTempo, sumInfoArquivo };
