/* CINQ · Leitura de súmula impressa (PDF sem texto, só desenho)
   Renderiza cada página, acha a grade das tabelas (linhas cinza e faixas verdes) e lê célula por célula com OCR.
   Devolve as páginas no mesmo formato da súmula nativa ([texto, x, y] em pontos), para o mesmo leitor (lerSumula). */
'use strict';

const OCR_K = 4; // escala de renderização (≈ 288 dpi)
const OCR_CDN = {
  js: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js',
  worker: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js',
  core: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1',
  lang: 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/por@1.0.0/4.0.0_best_int'
};
let _ocrW = null, _ocrPsm = null;

function ocrScript(src) {
  return new Promise((ok, err) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => err(new Error('Não foi possível carregar o leitor de imagem. Verifique a internet e tente de novo.')); document.head.appendChild(s); });
}
async function ocrWorker() {
  if (_ocrW) return _ocrW;
  if (!window.Tesseract) await ocrScript(OCR_CDN.js);
  _ocrW = await Tesseract.createWorker('por', 1, { workerPath: OCR_CDN.worker, corePath: OCR_CDN.core, langPath: OCR_CDN.lang });
  return _ocrW;
}
async function ocrLer(canvas, psm, lista) {
  const w = await ocrWorker(), chave = psm + '|' + (lista || '');
  if (_ocrPsm !== chave) { await w.setParameters({ tessedit_pageseg_mode: psm, preserve_interword_spaces: '1', tessedit_char_whitelist: lista || '' }); _ocrPsm = chave; }
  const { data } = await w.recognize(canvas);
  return data;
}

// agrupa índices consecutivos em faixas {a, b}
function ocrAgrupar(lista) {
  const out = [];
  lista.forEach(v => { const u = out[out.length - 1]; if (u && v - u.b <= 1) u.b = v; else out.push({ a: v, b: v }); });
  return out;
}

// recorte binarizado (texto preto em fundo branco); branco=true lê texto branco (faixas verdes)
function ocrRecorte(m, W, x0, y0, x1, y1, branco, zoom = 1) {
  const ehTxt = i => branco ? (m.gray[i] > 200 && !m.verde[i]) : (m.gray[i] < 150 && !m.verde[i]);
  let bx0 = x1, by0 = y1, bx1 = -1, by1 = -1, n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (ehTxt(y * W + x)) { n++; if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y; }
  if (n < 12) return null;
  const pad = 12, cw = bx1 - bx0 + 1 + pad * 2, ch = by1 - by0 + 1 + pad * 2;
  const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
  const ctx = cv.getContext('2d'), img = ctx.createImageData(cw, ch), d = img.data;
  d.fill(255);
  // mantém o cinza (bordas suavizadas ajudam o OCR); fundo, verde e linhas viram branco
  for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) {
    const i = y * W + x; if (m.verde[i] === 2 && !branco) continue;
    let v = branco ? 255 - m.gray[i] : m.gray[i];
    if (!branco && m.verde[i]) v = 255;
    if (v > 235) continue;
    const p = ((y - by0 + pad) * cw + (x - bx0 + pad)) * 4; d[p] = d[p + 1] = d[p + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  if (zoom === 1) return { cv, altura: by1 - by0 + 1 };
  const z = document.createElement('canvas'); z.width = cw * zoom; z.height = ch * zoom;
  const zc = z.getContext('2d'); zc.imageSmoothingEnabled = true; zc.drawImage(cv, 0, 0, z.width, z.height);
  return { cv: z, altura: by1 - by0 + 1 };
}

const ocrLimpa = t => String(t || '').replace(/[|¦\[\]{}_]/g, ' ').replace(/\s+/g, ' ').trim();

// palavras soltas (topo da página) → células, juntando palavras próximas
function ocrPalavrasEmItens(words, Hpt) {
  const w = words.filter(p => p.text.trim()).map(p => ({ s: ocrLimpa(p.text), x0: p.bbox.x0 / OCR_K, x1: p.bbox.x1 / OCR_K, y: Hpt - ((p.bbox.y0 + p.bbox.y1) / 2) / OCR_K })).filter(p => p.s);
  const linhas = [];
  w.sort((a, b) => b.y - a.y || a.x0 - b.x0).forEach(p => { let l = linhas.find(l => Math.abs(l.y - p.y) <= 3.5); if (!l) { l = { y: p.y, ps: [] }; linhas.push(l); } l.ps.push(p); });
  const itens = [];
  linhas.forEach(l => {
    l.ps.sort((a, b) => a.x0 - b.x0); let cel = null;
    l.ps.forEach(p => { if (cel && p.x0 - cel.x1 < 6) { cel.s += ' ' + p.s; cel.x1 = p.x1; } else { cel = { s: p.s, x0: p.x0, x1: p.x1 }; itens.push([cel, Math.round(l.y)]); } });
  });
  return itens.map(([c, y]) => [c.s, Math.round(c.x0), y]);
}

async function ocrPagina(page, ehPrimeira, prog) {
  const vp = page.getViewport({ scale: OCR_K });
  const cv = document.createElement('canvas'); cv.width = Math.ceil(vp.width); cv.height = Math.ceil(vp.height);
  const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  const W = cv.width, H = cv.height, Hpt = H / OCR_K, d = ctx.getImageData(0, 0, W, H).data;
  const m = { gray: new Uint8Array(W * H), verde: new Uint8Array(W * H) };
  for (let i = 0, p = 0; i < W * H; i++, p += 4) {
    const r = d[p], g = d[p + 1], b = d[p + 2];
    m.gray[i] = (r * 299 + g * 587 + b * 114) / 1000;
    m.verde[i] = (g - r > 40 && g - b > 40) ? (g < 190 ? 2 : 1) : 0;
  }
  // linhas horizontais (traço cinza longo) e faixas verdes (títulos)
  const hl = [], fv = [];
  for (let y = 0; y < H; y++) {
    let best = 0, cur = 0, nv = 0; const o = y * W;
    for (let x = 0; x < W; x++) {
      const i = o + x;
      if (m.verde[i] === 2) nv++;
      if (m.gray[i] < 190 && !m.verde[i]) { if (++cur > best) best = cur; } else cur = 0;
    }
    if (best > W * 0.2) hl.push(y);
    if (nv > W * 0.35) fv.push(y);
  }
  const linhasH = ocrAgrupar(hl).map(f => (f.a + f.b) / 2), faixas = ocrAgrupar(fv).filter(f => f.b - f.a > 4 * OCR_K);
  const limites = [...new Set([...linhasH, ...faixas.flatMap(f => [f.a - 1, f.b + 1])].map(Math.round))].sort((a, b) => a - b);
  const itens = [];
  // tarefas: faixas verdes (títulos) e células das tabelas
  const tarefas = [];
  faixas.forEach(f => {
    const ym = Math.round((f.a + f.b) / 2) * W; let xa = 0, xb = W - 1;
    while (xa < W && m.verde[ym + xa] !== 2) xa++;
    while (xb > 0 && m.verde[ym + xb] !== 2) xb--;
    if (xb - xa > 20) tarefas.push({ x0: xa + 4, y0: f.a + 2, x1: xb - 4, y1: f.b - 1, branco: true, yc: (f.a + f.b) / 2, x: xa, titulo: true });
  });
  for (let k = 0; k + 1 < limites.length; k++) {
    const y0 = limites[k] + 2, y1 = limites[k + 1] - 2, h = y1 - y0;
    if (h < 5 * OCR_K || h > 90 * OCR_K) continue;
    if (faixas.some(f => y0 >= f.a - 2 && y1 <= f.b + 2)) continue;
    // separadores verticais da faixa
    const sep = [];
    for (let x = 0; x < W; x++) {
      let n = 0;
      for (let y = y0; y < y1; y++) { const i = y * W + x; if (m.gray[i] < 190 && !m.verde[i]) n++; }
      if (n >= h * 0.9) sep.push(x);
    }
    const bordas = [0, ...ocrAgrupar(sep).map(f => (f.a + f.b) / 2), W];
    for (let c = 0; c + 1 < bordas.length; c++) {
      const x0 = Math.round(bordas[c]) + 3, x1 = Math.round(bordas[c + 1]) - 3;
      if (x1 - x0 < 4) continue;
      tarefas.push({ x0, y0, x1, y1, branco: false, yc: (y0 + y1) / 2, x: x0 });
    }
  }
  let feitas = 0;
  for (const t of tarefas) {
    const estreita = !t.branco && (t.x1 - t.x0) < 32 * OCR_K;
    const rc = ocrRecorte(m, W, t.x0, t.y0, t.x1, t.y1, t.branco, estreita ? 2 : 1);
    feitas++;
    if (prog && feitas % 8 === 0) prog(feitas / tarefas.length);
    if (!rc) continue;
    // células estreitas (nº, T/R, 1T/2T, minuto): só os caracteres possíveis, ampliadas
    let txt = ocrLimpa((await ocrLer(rc.cv, estreita ? '7' : rc.altura > 16 * OCR_K ? '6' : '7')).text.replace(/\n+/g, ' '));
    // célula estreita com leitura estranha: segunda tentativa só com números/sinais de tempo
    if (estreita && txt && !/^(\d{1,3}|[TR]\s*(\([gq9]\))?|[12]T|INT|[PA]|\+?\d{1,2}(:\d{2})?|\d{1,3}:\d{2})$/i.test(txt)) {
      const t2 = ocrLimpa((await ocrLer(rc.cv, '8', '0123456789:+')).text);
      if (/^\+?\d{1,3}(:\d{2})?$/.test(t2)) txt = t2;
    }
    if (txt) itens.push([txt, Math.round(t.x / OCR_K) + 3, Math.round(Hpt - t.yc / OCR_K)]);
  }
  // topo da página 1 (número do jogo fica fora das tabelas)
  if (ehPrimeira && limites.length) {
    const yTopo = Math.max(0, limites[0] - 2);
    if (yTopo > 10 * OCR_K) {
      const top = document.createElement('canvas'); top.width = W; top.height = yTopo;
      top.getContext('2d').drawImage(cv, 0, 0, W, yTopo, 0, 0, W, yTopo);
      const data = await ocrLer(top, '11');
      itens.push(...ocrPalavrasEmItens(data.words || [], Hpt));
    }
  }
  return { w: vp.width / OCR_K, items: itens };
}

// doc = documento do pdf.js já aberto
async function lerSumulaImagem(doc, prog) {
  await ocrWorker();
  const pags = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    pags.push(await ocrPagina(page, p === 1, f => prog && prog((p - 1 + f) / doc.numPages)));
  }
  return pags;
}
