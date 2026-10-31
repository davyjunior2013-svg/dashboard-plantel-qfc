/* CINQ · Programação semanal (quadro de avisos)
   Cartão no topo da Início com título, objetivo e miniatura; abre em tela cheia.
   A comissão envia a imagem ou o PDF da semana; PDF vira imagem automaticamente. */
'use strict';

S.prog = null; // programações carregadas (por segunda-feira)
const MESES = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

async function carregarProg(forcar) {
  if (S.prog && !forcar) return S.prog;
  const { data, error } = await sb.from('programacoes').select('*').order('semana');
  if (error) { console.error(error); S.prog = []; return S.prog; }
  S.prog = data || [];
  await urlsAssinadas(S.prog.flatMap(p => [p.img_path, p.arquivo_path]));
  return S.prog;
}
const progDaSemana = seg => (S.prog || []).find(p => p.semana === seg);

function progParaInicio() {
  const h = hoje(), esta = segunda(h), prox = addDays(esta, 7);
  const dow = parse(h).getDay();
  const a = progDaSemana(esta), b = progDaSemana(prox);
  // no domingo (ou se a semana atual não tem programação), mostra a próxima
  if (b && (dow === 0 || !a)) return { p: b, rot: 'Próxima semana' };
  if (a) return { p: a, rot: 'Esta semana' };
  return null;
}

function cartaoProg(info) {
  const pode = podeSessoes();
  if (!info) {
    return pode ? `<div class="panel prog vazio"><div><b>Programação da semana</b><span>Nenhuma programação enviada para esta semana ou para a próxima.</span></div><button class="btn pri sm" data-prog-enviar>Enviar programação</button></div>` : '';
  }
  const { p, rot } = info, ini = p.semana, fim = addDays(ini, 6), img = S.urls[p.img_path];
  return `<div class="panel prog">
    <div class="prog-txt">
      <div class="eyebrow">Programação · ${esc(rot)} · ${fmt(ini)} a ${fmt(fim)}</div>
      <h2>${esc(p.titulo || 'Programação da semana')}</h2>
      ${p.objetivo ? `<p><b>Objetivo da semana:</b> ${esc(p.objetivo)}</p>` : ''}
      <div class="row"><button class="btn pri sm" data-prog-abrir="${ini}">Abrir programação</button>${pode ? `<button class="btn sm" data-prog-enviar="${ini}">Trocar</button>` : ''}</div>
    </div>
    ${img ? `<img class="prog-mini" src="${esc(img)}" alt="Programação da semana" data-prog-abrir="${ini}">` : ''}
  </div>`;
}

function abrirProg(seg) {
  const p = progDaSemana(seg); if (!p) return;
  const src = S.urls[p.img_path], orig = S.urls[p.arquivo_path];
  if (!src) return toast('A imagem ainda está carregando, tente de novo.');
  let lb = document.getElementById('lightbox');
  if (!lb) { lb = document.createElement('div'); lb.id = 'lightbox'; document.body.appendChild(lb); }
  lb.className = 'prog-lb';
  lb.innerHTML = `<div class="lb-top"><b>${esc(p.titulo || 'Programação')} · ${fmt(p.semana)} a ${fmt(addDays(p.semana, 6))}</b>
    <div class="row">${orig ? `<a class="btn sm" href="${esc(orig)}" target="_blank" rel="noopener">Arquivo original ↗</a>` : ''}<button class="btn sm" data-fechar>Fechar ✕</button></div></div>
    <div class="lb-scroll"><img src="${esc(src)}" alt="Programação da semana"></div>`;
  lb.onclick = e => { if (e.target === lb || e.target.closest('[data-fechar]')) lb.remove(); };
}

/* ---------- envio ---------- */
function lerTextoProgramacao(items) {
  const it = items.filter(i => i.str && i.str.trim()).map(i => ({ s: i.str, x: i.transform[4], y: i.transform[5], h: i.height }));
  const maior = Math.max(0, ...it.map(i => i.h));
  const linha = y => it.filter(i => Math.abs(i.y - y) < 3).sort((a, b) => a.x - b.x).map(i => i.s).join(' ').replace(/\s*-\s*/g, '-').replace(/\s+/g, ' ').trim();
  const tit = it.find(i => i.h >= maior - 0.5);
  const lObj = it.find(i => /objetivo da semana/i.test(i.s));
  const abaixo = lObj ? it.filter(i => i.y < lObj.y - 3).sort((a, b) => b.y - a.y)[0] : null;
  const txt = it.map(i => i.s).join(' ');
  const m = semAcento(txt).match(/(\d{1,2})\s+a\s+\d{1,2}\s+de\s+([a-z]+)/);
  let seg = null;
  if (m && MESES.includes(m[2])) {
    const hj = parse(hoje()), mes = MESES.indexOf(m[2]);
    let ano = hj.getFullYear(); const d = new Date(ano, mes, +m[1], 12);
    if (d - hj > 200 * 864e5) ano--; else if (hj - d > 200 * 864e5) ano++;
    seg = segunda(ymd(new Date(ano, mes, +m[1], 12)));
  }
  return { titulo: tit ? linha(tit.y) : '', objetivo: abaixo ? linha(abaixo.y) : '', semana: seg };
}

function aparar(cv) { // corta as bordas brancas de baixo
  const ctx = cv.getContext('2d'), { width: w, height: h } = cv, d = ctx.getImageData(0, 0, w, h).data;
  let fim = h - 1;
  for (; fim > h * 0.4; fim--) { let branco = true; for (let x = 0; x < w; x += 6) { const k = (fim * w + x) * 4; if (d[k] < 245 || d[k + 1] < 245 || d[k + 2] < 245) { branco = false; break; } } if (!branco) break; }
  if (fim >= h - 10) return cv;
  const out = document.createElement('canvas'); out.width = w; out.height = Math.min(h, fim + 24);
  out.getContext('2d').drawImage(cv, 0, 0); return out;
}

async function prepararArquivo(file) {
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
    if (!window.pdfjsLib) throw new Error('O leitor de PDF não carregou. Recarregue a página.');
    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const page = await doc.getPage(1), vp1 = page.getViewport({ scale: 1 });
    const info = lerTextoProgramacao((await page.getTextContent()).items);
    const esc2 = Math.min(2.5, 2000 / vp1.width), vp = page.getViewport({ scale: esc2 }), cv = document.createElement('canvas');
    cv.width = vp.width; cv.height = vp.height;
    const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    const img = await new Promise(r => aparar(cv).toBlob(r, 'image/jpeg', 0.88));
    return { img, info };
  }
  if (!/^image\/(jpeg|png)$/.test(file.type)) throw new Error('Envie a programação em PDF, JPG ou PNG.');
  const bmp = await createImageBitmap(file), k = Math.min(1, 2000 / bmp.width);
  const cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
  const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height); ctx.drawImage(bmp, 0, 0, cv.width, cv.height);
  return { img: await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.88)), info: { titulo: '', objetivo: '', semana: null } };
}

function enviarProg(semPadrao) {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'application/pdf,image/jpeg,image/png';
  inp.onchange = async () => {
    const file = inp.files[0]; if (!file) return;
    modal('<h2>Lendo a programação…</h2><p class="m">Preparando a imagem.</p>');
    let prep;
    try { prep = await prepararArquivo(file); } catch (e) { fechar(); return toast(erroAmigavel(e), true); }
    const { img, info } = prep, url = URL.createObjectURL(img);
    const h = hoje(), sugerida = info.semana || semPadrao || (parse(h).getDay() >= 4 || parse(h).getDay() === 0 ? addDays(segunda(h), 7) : segunda(h));
    const ja = progDaSemana(sugerida);
    modal(`<h2>Enviar programação da semana</h2>
      <form id="fprog">
        <div class="g2">
          <label class="f"><span>Semana (segunda-feira) *</span><input class="in" type="date" name="semana" value="${esc(sugerida)}" required></label>
          <label class="f"><span>Título</span><input class="in" name="titulo" value="${esc(info.titulo || ja?.titulo || '')}" placeholder="Ex.: Semana 2 · Pré-temporada"></label>
        </div>
        <label class="f"><span>Objetivo da semana</span><input class="in" name="objetivo" value="${esc(info.objetivo || ja?.objetivo || '')}"></label>
        ${info.titulo || info.objetivo ? '<div class="note">Título, objetivo e semana foram lidos do PDF. Confira antes de salvar.</div>' : ''}
        ${ja ? '<div class="note">Já existe uma programação para essa semana. Ao salvar, ela será substituída.</div>' : ''}
        <img src="${url}" alt="" style="width:100%;border:1px solid var(--line);border-radius:10px;margin-bottom:10px">
        <div class="mfoot"><span></span><div class="row"><button type="button" class="btn" id="pcanc">Cancelar</button><button class="btn pri" type="submit">Salvar programação</button></div></div>
      </form>`, true);
    $('#pcanc').onclick = () => { URL.revokeObjectURL(url); fechar(); };
    $('#fprog').onsubmit = async ev => {
      ev.preventDefault();
      const f = formData(ev.target), seg = segunda(f.semana), b = ev.target.querySelector('[type=submit]');
      b.disabled = true; b.textContent = 'Enviando…';
      try {
        const base = `programacao/${seg}_${Date.now()}`, ext = (file.name.match(/\.(pdf|jpe?g|png)$/i) || ['', 'jpg'])[1].toLowerCase();
        const u1 = await sb.storage.from('planos').upload(base + '.jpg', img, { contentType: 'image/jpeg' }); if (u1.error) throw u1.error;
        const u2 = await sb.storage.from('planos').upload(base + '_original.' + ext, file, { contentType: file.type || 'application/pdf' }); if (u2.error) throw u2.error;
        const antigo = progDaSemana(seg);
        const { error } = await sb.from('programacoes').upsert({ semana: seg, titulo: nul(f.titulo), objetivo: nul(f.objetivo), img_path: base + '.jpg', arquivo_path: base + '_original.' + ext });
        if (error) throw error;
        if (antigo) sb.storage.from('planos').remove([antigo.img_path, antigo.arquivo_path].filter(Boolean));
        URL.revokeObjectURL(url); fechar(); toast('Programação salva.');
        await carregarProg(true); ir(S.page);
      } catch (e) { b.disabled = false; b.textContent = 'Salvar programação'; toast(erroAmigavel(e), true); }
    };
  };
  inp.click();
}

function ligarProg(root) {
  root.querySelectorAll('[data-prog-abrir]').forEach(el => el.onclick = () => abrirProg(el.dataset.progAbrir));
  root.querySelectorAll('[data-prog-enviar]').forEach(el => el.onclick = () => enviarProg(el.dataset.progEnviar || null));
}

/* ---------- encaixe nas telas ---------- */
const _pInicioProg = pInicio;
pInicio = function () {
  _pInicioProg();
  const pintar = () => {
    if (S.page !== 'inicio') return;
    document.querySelector('#main .prog')?.remove();
    const html = cartaoProg(progParaInicio()); if (!html) return;
    const box = document.createElement('div'); box.innerHTML = html;
    const el = box.firstElementChild, topo = document.querySelector('#main .top');
    topo ? topo.after(el) : $('#main').prepend(el);
    ligarProg(el);
  };
  if (S.prog) pintar(); else carregarProg().then(pintar);
};

const _pCalendarioProg = pCalendario;
pCalendario = function () {
  _pCalendarioProg();
  const pintar = () => {
    if (S.page !== 'calendario') return;
    const bar = document.querySelector('#main .weekbar'); if (!bar) return;
    bar.querySelector('.prog-bt')?.remove();
    const p = progDaSemana(S.semana), span = document.createElement('span'); span.className = 'row prog-bt';
    span.innerHTML = (p ? `<button class="btn sm pri" data-prog-abrir="${S.semana}">Programação da semana</button>` : '') +
      (podeSessoes() ? `<button class="btn sm" data-prog-enviar="${S.semana}">${p ? 'Trocar programação' : 'Enviar programação'}</button>` : '');
    bar.appendChild(span); ligarProg(span);
  };
  if (S.prog) pintar(); else carregarProg().then(pintar);
};

if (document.getElementById('main') && S.perfil) ir(S.page);
