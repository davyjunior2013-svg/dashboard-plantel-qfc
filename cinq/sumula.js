/* CINQ · Leitor de súmula da FNF (súmula on-line em PDF)
   Entrada: páginas com itens de texto [texto, x, y]. Saída: jogo, equipes, jogadores, gols, cartões, substituições. */
'use strict';

const SUM_SA = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const SUM_SECOES = ['Arbitragem', 'Cronologia', 'Relação de Jogadores', 'Comissão Técnica', 'Gols', 'Cartões Amarelos',
  'Cartões Vermelhos', 'Ocorrências / Observações', 'Observações Eventuais', 'Substituições'];

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

function lerSumula(paginas) {
  const L = sumLinhas(paginas), r = { alertas: [], equipes: [], gols: [], cartoes: [], subs: [] };
  let sec = '';
  const secao = {};
  L.forEach(l => {
    const h = SUM_SECOES.find(s => l.t === s);
    if (h) { sec = h; secao[sec] = []; return; }
    (secao[sec || 'Cabeçalho'] = secao[sec || 'Cabeçalho'] || []).push(l);
  });
  // cabeçalho
  (secao['Cabeçalho'] || []).forEach(l => {
    let m;
    if ((m = l.t.match(/^Jogo:\s*(\d+)$/))) r.jogo_num = +m[1];
    else if ((m = l.t.match(/^Jogo:\s*(.+?)\s+X\s+(.+)$/))) { r.mandante = m[1].trim(); r.visitante = m[2].trim(); }
    if ((m = l.t.match(/Campeonato:\s*(.+?)\s+Rodada:\s*(\d+)/))) { r.competicao = m[1].trim(); r.rodada = +m[2]; }
    if ((m = l.t.match(/Data:\s*(\d{2})\/(\d{2})\/(\d{4})(?:\s+Hor[aá]rio:\s*(\S+))?(?:\s+Est[aá]dio:\s*(.+))?/))) { r.data = `${m[3]}-${m[2]}-${m[1]}`; r.hora = m[4] || null; r.estadio = (m[5] || '').trim() || null; }
  });
  (secao['Cronologia'] || []).forEach(l => {
    let m;
    if ((m = l.t.match(/Resultado do 1º Tempo:\s*(\d+)\s*X\s*(\d+)/i))) r.ht = [+m[1], +m[2]];
    if ((m = l.t.match(/Resultado Final:\s*(\d+)\s*X\s*(\d+)/i))) r.ft = [+m[1], +m[2]];
  });
  if (!r.jogo_num || !r.mandante) throw new Error('Não parece uma súmula da federação (não achei o número do jogo e os clubes).');

  // relação de jogadores (duas colunas: mandante à esquerda, visitante à direita)
  const jog = secao['Relação de Jogadores'] || [];
  const meio = (jog[0]?.w || 595) / 2;
  const cab = jog.find(l => !/^N[ºo°]\s/.test(l.t) && !/^\d/.test(l.t));
  const nomesEq = cab ? [cab.c.filter(c => c.x < meio).map(c => c.s).join(' '), cab.c.filter(c => c.x >= meio).map(c => c.s).join(' ')] : [r.mandante, r.visitante];
  r.equipes = nomesEq.map((n, i) => ({ nome_sumula: n || (i ? r.visitante : r.mandante), jogadores: [], comissao: {} }));
  jog.forEach(l => {
    [0, 1].forEach(lado => {
      const c = l.c.filter(x => lado ? x.x >= meio : x.x < meio).map(x => x.s);
      if (!c.length || !/^\d+$/.test(c[0])) return;
      const iTR = c.findIndex(x => /^[TR](\(g\))?$/i.test(x)); if (iTR < 0) return;
      const nomes = c.slice(1, iTR);
      let [apelido, nome] = nomes.length >= 2 ? [nomes[0], nomes.slice(1).join(' ')] : sumSeparaNome(nomes[0] || '');
      const cbf = c.slice(iTR + 1).find(x => /^\d{4,}$/.test(x)) || `sem-cbf-${SUM_SA(r.equipes[lado].nome_sumula)}-${c[0]}`;
      const eq = r.equipes[lado];
      eq.jogadores.push({ numero: +c[0], apelido: sumNomeExib(apelido, nome), nome: nome.replace(/\s*\.\.\.$/, ''), cbf,
        titular: /^T/i.test(c[iTR]), goleiro: /\(g\)/i.test(c[iTR]), ordem: eq.jogadores.length + 1 });
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
  const equipeDe = s => { const n = sumNorm(s); if (!n) return -1; return nEq.findIndex(t => t.startsWith(n) || n.startsWith(t)); };
  const jogadorDe = (lado, num) => r.equipes[lado]?.jogadores.find(j => String(j.numero) === String(num));

  // gols: tempo | 1T/2T | nº | tipo | nome | equipe
  (secao['Gols'] || []).forEach(l => {
    const c = l.c.map(x => x.s); if (!/^\d{1,3}:\d{2}$/.test(c[0])) return;
    const eqTxt = l.c.filter(x => x.x >= 400).map(x => x.s).join(' ');
    const lado = equipeDe(eqTxt), tempo = /2/.test(c[1]) ? '2T' : '1T', j = jogadorDe(lado, c[2]);
    r.gols.push({ equipe: lado, tempo, minuto: parseInt(c[0], 10), numero: c[2], tipo: c[3], nome: j?.apelido || c.slice(4).filter(x => !eqTxt.includes(x)).join(' '), cbf: j?.cbf || null });
    if (lado < 0) r.alertas.push(`Gol sem equipe identificada: ${l.t}`);
  });
  // cartões: tempo | 1T/2T | nº (ou AT, T...) | nome | equipe ; linhas seguintes = motivo
  const cartoes = (lista, cor) => {
    let ult = null;
    lista.forEach(l => {
      const c = l.c.map(x => x.s);
      if (/^\d{1,3}:\d{2}$/.test(c[0])) {
        const eqTxt = l.c.filter(x => x.x >= 400).map(x => x.s).join(' ');
        const lado = equipeDe(eqTxt), tempo = /2/.test(c[1]) ? '2T' : '1T', j = /^\d+$/.test(c[2]) ? jogadorDe(lado, c[2]) : null;
        ult = { cor, equipe: lado, tempo, minuto: parseInt(c[0], 10), numero: c[2], nome: j?.apelido || c.slice(3).filter(x => !eqTxt.includes(x)).join(' '), cbf: j?.cbf || null, motivo: '' };
        r.cartoes.push(ult);
        if (lado < 0) r.alertas.push(`Cartão sem equipe identificada: ${l.t}`);
        if (/^\d+$/.test(c[2]) && !j) r.alertas.push(`Cartão para o nº ${c[2]}, que não está na relação de jogadores.`);
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
    const c = l.c.map(x => x.s); if (!/^\d{1,3}:\d{2}$/.test(c[0])) return;
    const ent = l.c.find(x => /^\d+\s*-\s*/.test(x.s) && x.x < 380), sai = l.c.find(x => /^\d+\s*-\s*/.test(x.s) && x.x >= 380);
    const eqTxt = l.c.filter(x => x !== ent && x !== sai && x.x > 100 && !/^(1T|2T|INT|\d)/.test(x.s)).map(x => x.s).join(' ');
    const lado = equipeDe(eqTxt), tempo = c[1].toUpperCase();
    const nEnt = ent?.s.match(/^(\d+)/)?.[1], nSai = sai?.s.match(/^(\d+)/)?.[1];
    const je = jogadorDe(lado, nEnt), js = jogadorDe(lado, nSai);
    r.subs.push({ equipe: lado, tempo, minuto: parseInt(c[0], 10), entrou: nEnt, saiu: nSai, cbf: je?.cbf || null, cbf2: js?.cbf || null,
      nome: je?.apelido || ent?.s.replace(/^\d+\s*-\s*/, ''), nome2: js?.apelido || sai?.s.replace(/^\d+\s*-\s*/, '') });
    if (lado < 0) r.alertas.push(`Substituição sem equipe identificada: ${l.t}`);
    else if (!je || !js) r.alertas.push(`Substituição com número fora da relação: ${l.t}`);
  });

  // minutos de cada atleta
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
  return r;
}

if (typeof module !== 'undefined') module.exports = { lerSumula, sumNomeCurto, sumMinAbs, sumMinTxt };
