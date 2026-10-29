// ---- 画面(DOM を使うのはここだけ)
(() => {
'use strict';
/* global Log, SAMPLE_TEXT, SAMPLE_PLAN, SAMPLE_PLAN_OLD, HELP_HTML */
const $ = (s) => document.querySelector(s);
const srcEl = $('#src'), hlEl = $('#hl'), msgEl = $('#msg'), viewEl = $('#view'), canvasEl = $('#canvas'), viewKindEl = $('#viewKind'), plansEl = $('#plans'), compEl = $('#comp');
const LINE_PX = 19.5;
let last = null;          // 最後の解析の結果
let addArmed = false;     // 「追加」を押し始めたか(欄の書き込みでパネルを作り直しても取りこぼさないため)
let drawErr = '';         // 描画の内部エラー(診断欄を描き直しても消さない)
let lastOk = null;        // 最後にエラーなく解析できた結果(エラーの間は、これで描いて薄く表示する)
let fileBase = 'mylog';   // 画像を保存するときの名前のもと(拡張子なし)
let fileName = '';        // 開いている・保存したテキストのファイル名(なければ空)
let fileHandle = null;    // 上書き保存の先(Chrome・Edge のファイル操作機能。開き直すと忘れる)
let savedText = null;     // version: の比べる相手(最後に開いた・保存したファイルの中身)
let dirty = false;
let editGen = 0, docGen = 0;
let debounce = null;
let plans = [];           // 計画書の一覧(Log.loadPlan の並び。読むだけ。仕様書 5 章)
let plansOpen = true;     // 計画書の一覧を開いているか
let planNote = '';        // 計画書の一覧の下に出す知らせ
let th = { ...Log.TH_DEFAULT }; // 要確認の規則の値(仕様書 6.2 節)
let weekPick = null;      // 週のまとめで見る週(週の始まりの日。null は今週。仕様書 7.7 節)
const weekSelEl = $('#weekSel'), weekWrapEl = $('#weekWrap');

for (const v of Log.VIEWS) viewKindEl.append(new Option(v.label, v.id));
// 今日の日付(この端末の時刻。要確認の今日と、今日より後の日付の警告に使う)
const todayStr = () => { const d = new Date(), p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
const todayNum = () => Log.parseDate(todayStr());
let drawnToday = todayStr();

// ---- 色付け(設定の予約語・属性の予約語・日付・注)
const escH = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const KW = 'hours|status|progress|review|reviewed|trl|tpm|test|mop|issue|solved|ask|answered|note';
function hlLine(line) {
  let cut = line.length;
  for (let k = 0; k < line.length - 1; k++) if (line[k] === '/' && line[k + 1] === '/' && (k === 0 || line[k - 1] === ' ' || line[k - 1] === '\t')) { cut = k; break; }
  const body = line.slice(0, cut), cm = line.slice(cut);
  let h = escH(body)
    .replace(/^(version|by|week):/, '<span class="kw">$1:</span>')
    .replace(new RegExp(`(^|[ \\t])(${KW}):`, 'g'), '$1<span class="kw">$2:</span>')
    .replace(/^(-[ \t]+)(\d{4}-\d{2}-\d{2})/, '$1<span class="dt">$2</span>')
    .replace(/\b(mon|tue|wed|thu|fri|sat|sun|todo|doing|done|blocked|ok|ng)\b(?=\s*($|<span| ))/g, '<span class="nu">$1</span>');
  if (cm) h += `<span class="cm">${escH(cm)}</span>`;
  return h;
}
function updateHighlight() { hlEl.innerHTML = srcEl.value.split('\n').map(hlLine).join('\n') + '\n'; syncScroll(); }
function syncScroll() { hlEl.scrollTop = srcEl.scrollTop; hlEl.scrollLeft = srcEl.scrollLeft; }
srcEl.addEventListener('scroll', () => { syncScroll(); hideComp(); });

// ---- 解析と描画
function analyze() {
  let r;
  try { r = Log.analyze(srcEl.value, plans, { today: todayNum() }); }
  catch (e) { showInternal(`内部エラー: ${e.message}`); return; }
  last = r; lastSrc = srcEl.value;
  if (r.ok) { lastOk = r; draw(); }
  else if (canvasEl.querySelector('svg')) { viewEl.classList.add('stale'); canvasEl.querySelectorAll('.tbtns').forEach((x) => x.remove()); }
  else { canvasEl.textContent = ''; canvasEl.append(el('div', 'empty', srcEl.value.trim() ? 'エラーを直すと表が出ます(左の診断を見てください)。' : '左にマイログを書くと、ここに表が出ます。「例を読み込む」で例を、「書き方」で書き方を見られます。')); }
  renderDiagnostics(r.diags);
  if (drawErr) showInternal(drawErr);
  renderPlans();
  markSel(); buildEdit();
}
const ctxNow = () => ({ today: Log.parseDate(drawnToday), th, week: weekPick });
// 週のまとめの週の選択肢(新しい順。先頭は今週)。選んでいた週がなくなったら今週に戻す
function fillWeeks(r) {
  const isW = viewKindEl.value === 'week';
  weekWrapEl.hidden = !isW;
  if (!isW) return;
  const today = Log.parseDate(drawnToday), ws = Log.WD.indexOf(r.set.week ? r.set.week.value : 'mon'), cur = Log.weekOf(today, ws);
  const opts = Log.weekOptions(r, today);
  if (weekPick !== null && (!opts.includes(weekPick) || weekPick === cur)) weekPick = null;
  weekSelEl.textContent = '';
  for (const w of opts) weekSelEl.append(new Option(`${Log.fmtDate(w).slice(5)}〜${w === cur ? '(今週)' : ''}`, w === cur ? '' : String(w)));
  weekSelEl.value = weekPick === null ? '' : String(weekPick);
}
weekSelEl.addEventListener('change', () => { weekPick = weekSelEl.value ? +weekSelEl.value : null; if (editSel?.kind === 'rec') editSel = null; draw(); markSel(); buildEdit(); });
weekWrapEl.addEventListener('click', (e) => { if (e.target.closest('select, label')) return; editSel = null; markSel(); buildEdit(); });
function draw() {
  const r = last?.ok ? last : lastOk;
  if (!r) return;
  drawnToday = todayStr();
  fillWeeks(r);
  let o;
  try { o = Log.render(r, viewKindEl.value, ctxNow()); }
  catch (e) { drawErr = `内部エラー(描画): ${e.message}`; canvasEl.textContent = ''; canvasEl.append(el('div', 'empty', drawErr)); showInternal(drawErr); return; }
  if (drawErr) { drawErr = ''; msgEl.querySelectorAll('.err').forEach((x) => { if (x.textContent.startsWith('内部エラー(描画)')) x.remove(); }); }
  viewEl.classList.toggle('stale', r !== last);
  canvasEl.innerHTML = o.svg;
  if (r === last) addPieceButtons(o.anchors);
  markSel();
}

// ---- 図・表を 1 つずつ保存する・コピーする(プロジェクト計画の仕様書 9 章と同じ)
const PIECE_TIP = {
  copy: (n) => `「${n}」の表をタブ区切りの文字でコピーする(表計算ソフトや Word の表にそのまま貼れる)`,
  svg: (n, t) => (t ? `「${n}」の表を SVG(ベクター形式)で保存する(題は入れない)` : 'この図を SVG(ベクター形式)で保存する'),
  png: (n, t) => (t ? `「${n}」の表を PNG(2 倍の解像度)で保存する(題は入れない)` : 'この図を PNG(2 倍の解像度)で保存する'),
  pdf: (n, t) => `${t ? `「${n}」の表` : 'この図'}だけを、同じ大きさの紙で印刷する(印刷の画面で「PDF に保存」を選ぶと、余白のない PDF になる。Chrome・Edge で使う)`,
};
function addPieceButtons(anchors) {
  for (const a of anchors) {
    const isT = a.kind === 'table';
    const name = isT ? a.name : a.id;
    const box = el('span', 'tbtns');
    for (const k of isT ? ['copy', 'svg', 'png', 'pdf'] : ['svg', 'png', 'pdf']) {
      const b = el('button', null, k === 'copy' ? 'コピー' : k.toUpperCase());
      b.dataset.piece = `${isT ? 'table' : 'fig'}:${name}|${k}`;
      b.title = PIECE_TIP[k](name, isT);
      b.addEventListener('click', () => pieceAction(isT ? 'table' : 'fig', name, k, b, a.label));
      box.append(b);
    }
    for (const ev of ['pointerdown', 'mousedown', 'click', 'dblclick']) box.addEventListener(ev, (e) => e.stopPropagation());
    canvasEl.append(box);
    placeBox(box, a);
  }
}
function pieceAction(kind, ref, k, btn, title) {
  if (debounce !== null) { clearTimeout(debounce); debounce = null; analyze(); }
  if (todayStr() !== drawnToday && last?.ok) draw();
  if (!last?.ok || viewEl.classList.contains('stale')) { alert('保存できる表がありません(エラーを直してください)'); return; }
  const view = viewKindEl.value;
  const viewName = safeName(view); // ビューの識別子(ファイル名の形は 3 つのアプリで同じ。仕様書 9 章)
  let p;
  try { p = Log.pieces(last, view, ctxNow()); }
  catch (e) { showInternal(`内部エラー(描画): ${e.message}`); return; }
  const cur = [...canvasEl.querySelectorAll('.tbtns button')].find((b) => b.dataset.piece === btn.dataset.piece) ?? btn;
  if (kind === 'table') {
    const t = p.tables.find((x) => x.name === ref);
    if (!t) { alert(`「${ref}」の表は、今はありません(描き直したら表がなくなりました)`); return; }
    if (k === 'copy') { copyText(Log.tsv(t), cur); return; }
    saveImage(t.svg, `${imgBase()}_${viewName}_${safeName(t.name)}`, k);
    return;
  }
  const f = p.figs.find((x) => x.id === ref);
  if (f) saveImage(f.svg, `${imgBase()}_${viewName}_${safeName(f.id)}`, k);
}
// ボタンを題の文字に合わせる(題とボタンの文字の基準線から見た目の中心をそろえる。プロジェクト計画と同じ)
const GLYPH_MID = 0.38;
function placeBox(box, a) {
  const svg = canvasEl.querySelector('svg');
  const texts = svg ? [...svg.querySelectorAll('text')].filter((t) => t.textContent === a.label) : [];
  if (!texts.length) { box.remove(); return; }
  const near = texts.reduce((q, t) => (Math.abs(+t.getAttribute('y') - a.y) < Math.abs(+q.getAttribute('y') - a.y) ? t : q));
  const c = canvasEl.getBoundingClientRect(), sv = svg.getBoundingClientRect(), tr = near.getBoundingClientRect();
  const titleMid = sv.top - c.top + +near.getAttribute('y') - GLYPH_MID * +near.getAttribute('font-size');
  const btn = box.querySelector('button');
  const mark = document.createElement('span');
  mark.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
  btn.append(mark);
  const bb = mark.getBoundingClientRect().bottom - box.getBoundingClientRect().top;
  mark.remove();
  box.style.left = `${tr.right - c.left + 6}px`;
  box.style.top = `${titleMid + GLYPH_MID * parseFloat(getComputedStyle(btn).fontSize) - bb}px`;
}
const safeName = (s) => s.replace(/[\\/:*?"<>|\s]+/g, '_');
const imgBase = () => safeName(fileBase);
const withPage = (svg) => { const [, w, h] = /width="([\d.]+)" height="([\d.]+)"/.exec(svg); const i = svg.indexOf('>', svg.indexOf('<svg')); return `${svg.slice(0, i + 1)}<style>@page{size:${w}px ${h}px;margin:0}</style>${svg.slice(i + 1)}`; };
const uniqIds = (svg, pre) => svg.replace(/ id="([^"]+)"/g, ` id="${pre}$1"`).replace(/url\(#([^)]+)\)/g, `url(#${pre}$1)`);
function printOne(svg, base) {
  const [, w, h] = /width="([\d.]+)" height="([\d.]+)"/.exec(svg).map(Number);
  const area = $('#printArea');
  area.textContent = ''; area.classList.add('one');
  const pg = el('div', 'page'); pg.style.width = `${w}px`; pg.style.height = `${h}px`; pg.innerHTML = uniqIds(svg, 'p1-'); area.append(pg);
  let st = $('#pageOne');
  if (!st) { st = document.createElement('style'); st.id = 'pageOne'; document.head.append(st); }
  st.textContent = `@media print{@page{size:${w}px ${h}px;margin:0}}`;
  const title = document.title; document.title = base;
  try { window.print(); } finally { document.title = title; }
}
function saveImage(svg, base, kind) {
  if (kind === 'pdf') { printOne(svg, base); return; }
  if (kind === 'svg') { download(`${base}.svg`, new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n${withPage(svg)}`], { type: 'image/svg+xml' })); return; }
  const scale = 2;
  const m = /width="(\d+)" height="(\d+)"/.exec(svg);
  const w = +m[1], h = +m[2];
  const img = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  const big = () => alert('画像が大きすぎて PNG にできませんでした。SVG で保存してください');
  img.onload = () => {
    URL.revokeObjectURL(url);
    const c = document.createElement('canvas'); c.width = w * scale; c.height = h * scale;
    const g = c.getContext('2d');
    if (!g) { big(); return; }
    g.scale(scale, scale); g.drawImage(img, 0, 0);
    c.toBlob((b) => { if (b) download(`${base}.png`, b); else big(); }, 'image/png');
  };
  img.onerror = () => { URL.revokeObjectURL(url); alert('PNG の作成に失敗しました'); };
  img.src = url;
}
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

// ---- 診断(仕様書 10 章)
function renderDiagnostics(diags) {
  msgEl.textContent = '';
  const er = diags.filter((d) => d.level === 'error'), wr = diags.filter((d) => d.level === 'warn');
  const sum = el('div', er.length ? 'err' : wr.length ? 'warn' : 'ok');
  sum.textContent = er.length || wr.length ? [er.length ? `エラー ${er.length} 件` : '', wr.length ? `警告 ${wr.length} 件` : ''].filter(Boolean).join('、') : 'エラーと警告はありません。';
  msgEl.append(sum);
  const groups = new Map();
  for (const d of [...er, ...wr]) { const k = `${d.level}|${d.cat}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(d); }
  for (const [k, list] of groups) {
    const [lv, cat] = k.split('|');
    const cls = lv === 'error' ? 'err' : 'warn';
    msgEl.append(el('div', `sec ${cls}`, `${lv === 'error' ? 'エラー' : '警告'}: ${cat}(${list.length} 件)`));
    const ul = el('ul');
    for (const d of list) {
      const li = el('li', cls, `${d.line} 行: ${d.message}`);
      li.style.cursor = 'pointer';
      li.title = `${d.line} 行の該当箇所を選ぶ`;
      li.addEventListener('click', () => selectText(d.start, Math.max(d.end, d.start)));
      ul.append(li);
    }
    msgEl.append(ul);
  }
}
function showInternal(m) { msgEl.prepend(el('div', 'err', m)); }
async function copyText(text, btn) {
  let ok = true;
  try { await navigator.clipboard.writeText(text); }
  catch {
    const ta = document.createElement('textarea'); ta.value = text; document.body.append(ta); ta.select();
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
  }
  if (btn.dataset.label === undefined) btn.dataset.label = btn.textContent;
  clearTimeout(copyTimers.get(btn));
  btn.textContent = ok ? 'コピーしました' : 'コピーできませんでした';
  copyTimers.set(btn, setTimeout(() => { btn.textContent = btn.dataset.label; }, 2000));
}
const copyTimers = new WeakMap();

// ---- 画面からの編集(仕様書 11 章)。テキストが正本で、操作はすべてテキストの書き換えとして行う
const editEl = $('#edit');
let editSel = null;  // { kind: 'rec', line, act('task'・'solve'・null), key } | { kind: 'add' } | { kind: 'ai' }
const addForm = { date: null, name: '', vals: {} }; // 記録を追加する欄の中身(描き直しても残す)
const editable = () => !!(last?.ok && !viewEl.classList.contains('stale') && debounce === null);
const OPT = () => ({ today: todayNum() });
const ATTR_JA = { hours: '時間(hours)', status: '進捗(status)', progress: '進捗率(progress)', review: '確認の依頼(review)', reviewed: '確認の結果(reviewed)', trl: 'TRL(trl)', tpm: 'TPM(tpm)', test: 'テスト(test)', mop: 'MOP(mop)', issue: '問題(issue)', solved: '解決(solved)', ask: '質問(ask)', answered: '回答(answered)', note: 'メモ(note)' };
const REC_KEYS = ['hours', 'status', 'progress', 'review', 'reviewed', 'trl', 'tpm', 'test', 'mop', 'issue', 'solved', 'ask', 'answered', 'note'];
const OPTS = { status: [['', '(なし)'], ...Object.entries(Log.STATUS).map(([k, ja]) => [k, `${ja}(${k})`])], test: [['', '(なし)'], ['ok', 'ok'], ['ng', 'ng']], reviewed: [['', '(なし)'], ['ok', 'ok'], ['ng', 'ng(差し戻し)']] };
const WIDE = ['mop', 'issue', 'solved', 'answered', 'note', 'tpm'];
const NUM = ['hours', 'progress', 'trl'];
viewEl.addEventListener('click', (e) => {
  const g = e.target.closest('[data-id]');
  // 表の行のほか(何もないところ)を押したら、選択を外して編集パネルを閉じる(プロジェクト計画と同じ。仕様書 11.2 節)
  if (!g || !canvasEl.contains(g)) { editSel = null; markSel(); buildEdit(); return; }
  if (viewEl.classList.contains('stale') || !last?.ok) { editSel = { kind: 'blocked' }; markSel(); buildEdit(); return; }
  const r = g.hasAttribute('data-start') ? last.recs.find((x) => x.start === +g.getAttribute('data-start')) : null;
  // 記録のないタスクの行(これからのタスクなど)は、「今日の記録」の欄だけを出す(仕様書 7 章・11.4 節)
  if (!r && !g.hasAttribute('data-key')) return;
  editSel = { kind: 'rec', line: r ? r.line : null, sig: r ? sigOf(r.line) : undefined, act: g.getAttribute('data-act'), key: g.getAttribute('data-key') ?? r.key, name: g.getAttribute('data-name') || (r ? r.name : '') };
  markSel(); buildEdit();
  if (r) selectText(r.start, r.end);
});
// 選んでいる記録(タスクのビューから選んだときは、その記録先の最後の記録)
function target() {
  if (!editSel || editSel.kind !== 'rec' || !last?.ok) return null;
  if (editSel.act === 'task') { const rr = last.recs.filter((x) => x.key === editSel.key); return rr.length ? rr[rr.length - 1] : null; }
  const lineOf = (n) => srcEl.value.split('\n')[n - 1];
  let r = last.recs.find((x) => x.line === editSel.line) ?? null;
  // 行の文で追うのは、最後の解析が今のテキストのものであるときだけ(書き込みの途中・描き直しの待ちの間は、行の番号のまま)
  if (lastSrc === srcEl.value && editSel.sig !== undefined && (!r || lineOf(r.line) !== editSel.sig)) {
    const c = last.recs.filter((x) => lineOf(x.line) === editSel.sig);
    r = c.length ? c.reduce((a, b) => (Math.abs(b.line - editSel.line) < Math.abs(a.line - editSel.line) ? b : a)) : null;
    if (r) editSel.line = r.line;
  }
  return r;
}
const sigOf = (line) => srcEl.value.split('\n')[line - 1];
let lastSrc = null;  // 最後に解析したテキスト
function markSel() {
  // 選択の印を外す。空になった class 属性も消し、表をテキストから描いたときと同じ形に戻す
  canvasEl.querySelectorAll('.selected').forEach((x) => { x.classList.remove('selected'); if (!x.getAttribute('class')) x.removeAttribute('class'); });
  if (editSel?.kind === 'rec' && editSel.act === 'task') { canvasEl.querySelectorAll('[data-key]').forEach((g) => { if (g.getAttribute('data-key') === editSel.key) g.classList.add('selected'); }); return; }
  const r = target();
  if (r) canvasEl.querySelectorAll(`[data-start="${r.start}"]`).forEach((g) => g.classList.add('selected'));
}
function showEditError(msg) { let m = editEl.querySelector('.editerr'); if (!m) { m = el('div', 'editerr'); editEl.prepend(m); editEl.classList.add('on'); } m.textContent = msg; }
// 書き換えをテキスト欄に書き込む(変わった範囲だけを 1 回で置き換えるので、Ctrl+Z 1 回で戻せる)
function applyEdit(res) {
  if (!res) return false;
  if (res.error) { showEditError(res.error); return false; }
  if (!editable()) { showEditError('いまは画面から編集できません(テキストにエラーがあるか、描き直しの途中です)。'); return false; }
  if (res.text === srcEl.value) return false;
  const focusK = editEl.contains(document.activeElement) ? document.activeElement.dataset.k ?? null : null;
  spliceSrc(res.text);
  updateHighlight(); edited(); persist();
  clearTimeout(debounce); debounce = null;
  if (res.line && editSel?.kind === 'rec' && editSel.act !== 'task') { editSel.line = res.line; editSel.sig = res.text.split('\n')[res.line - 1]; }
  analyze(); // 待たずに解析し直して描く
  const r = res.line && last?.ok ? last.recs.find((x) => x.line === res.line) : null;
  if (r) { srcEl.setSelectionRange(r.start, r.end); scrollToOffset(r.start); }
  if (focusK) editEl.querySelector(`[data-k="${focusK}"]`)?.focus();
  return true;
}
// 欄: Enter(または欄から離れる)で書き込む。Escape で書きかけをやめる。変換中の Enter では書き込まない
function field(box, k, label, value, onCommit, o = {}) {
  const lab = el('label', null, label);
  const inp = document.createElement('input');
  inp.value = value; inp.dataset.k = k; inp.disabled = !o.can;
  if (o.cls) inp.className = o.cls;
  if (o.type) inp.type = o.type;
  if (o.list) inp.setAttribute('list', o.list);
  if (o.ph) inp.placeholder = o.ph;
  let done = false, busy = false;
  const commit = () => {
    if (done || busy || inp.value === value) return;
    busy = true; // 書き込みの途中(テキスト欄にフォーカスを移す)で change が起きても、もう一度書き込まない
    try { if (onCommit(inp.value) !== false) done = true; } finally { busy = false; }
  };
  inp.addEventListener('keydown', (e) => {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    else if (e.key === 'Escape') { inp.value = value; inp.blur(); }
  });
  if (!o.noBlur) {
    inp.addEventListener('change', commit);
    // Ctrl+S の前に書きかけを書き込む(プロジェクト計画と同じ)。書き込みを拒まれたら 'error'
    inp._commit = () => { commit(); return done || inp.value === value ? 'ok' : 'error'; };
  }
  if (o.onInput) inp.addEventListener('input', () => o.onInput(inp.value));
  lab.append(inp); box.append(lab);
  return inp;
}
function select(box, k, label, opts, value, onPick, can) {
  const lab = el('label', null, label);
  const sl = document.createElement('select');
  sl.dataset.k = k; sl.disabled = !can;
  for (const [v, t] of opts) sl.append(new Option(t, v));
  if (!opts.some(([v]) => v === value)) sl.append(new Option(value, value));
  sl.value = value;
  sl.addEventListener('change', () => { if (onPick(sl.value) === false) sl.value = value; });
  lab.append(sl); box.append(lab);
  return sl;
}
function buildEdit() {
  editEl.textContent = '';
  if (!editSel) { editEl.classList.remove('on'); return; }
  const can = editable();
  if (editSel.kind === 'add') buildAdd(can);
  else if (editSel.kind === 'ai') buildAI();
  else if (editSel.kind === 'blocked' || (editSel.kind === 'rec' && !last?.ok)) {
    // テキストにエラーがある間は、理由を出す。記録を選んでいたときは選択を残し、エラーを直すとその記録のパネルに戻る
    const head = el('div', 'row');
    const close = el('button', null, '閉じる');
    close.addEventListener('click', () => { editSel = null; buildEdit(); });
    head.append(el('span', 'kind', '画面から編集できません'), close);
    editEl.append(head);
    if (editSel.kind === 'blocked' && editable()) { editSel = null; editEl.textContent = ''; editEl.classList.remove('on'); return; }
  }
  else {
    const r = target();
    if (editSel.act === 'task') {
      // 書く名前は、今日に使う版での、一意に決まるいちばん短い修飾名(計画にない記録先なら、最後の記録の名前)
      buildToday(editSel.key, r ? r.name : editSel.name, can);
      if (r) buildRec(r, can);
    } else {
      if (!r) { editSel = null; editEl.classList.remove('on'); return; }
      if (editSel.act === 'solve') buildSolve(r, can);
      buildRec(r, can);
    }
  }
  if (!can) editEl.append(el('div', 'small', debounce !== null ? '描き直しの途中です。' : 'テキストのエラーを直すと、画面から編集できます。'));
  editEl.classList.add('on');
}
// 11.2 節: 記録の編集パネル
function buildRec(r, can) {
  const head = el('div', 'row');
  head.append(el('span', 'kind', `${Log.fmtDate(r.date)} の記録(${r.line} 行)`), el('span', 'small', `記録先: ${r.label}${r.gone ? '(計画から削除)' : r.planned === false ? '(計画にない作業)' : ''}`));
  editEl.append(head);
  const form = el('div', 'form');
  const E = Log.Edit;
  field(form, 'name', '名前', r.name, (v) => applyEdit(E.setAttrs(srcEl.value, OPT(), r.start, {}, v)), { can, cls: 'wide' });
  for (const k of REC_KEYS) {
    const v = r.at[k] ? r.at[k].text : '';
    if (OPTS[k]) select(form, k, ATTR_JA[k], OPTS[k], v, (x) => applyEdit(E.setAttrs(srcEl.value, OPT(), r.start, { [k]: x })), can);
    else field(form, k, ATTR_JA[k], v, (x) => applyEdit(E.setAttrs(srcEl.value, OPT(), r.start, { [k]: x })), { can, cls: WIDE.includes(k) ? 'wide' : NUM.includes(k) ? 'num' : null });
  }
  const btns = el('div', 'btns');
  const del = el('button', null, 'この記録を消す');
  del.disabled = !can;
  del.addEventListener('click', () => {
    const x = E.remove(srcEl.value, OPT(), r.start);
    if (x.error) { showEditError(x.error); return; }
    if (confirm(`${Log.fmtDate(r.date)} の「${r.name}」の記録(${r.line} 行)を消しますか?\n(Ctrl+Z で元に戻せます)`)) { editSel = null; applyEdit(x); }
  });
  btns.append(del);
  form.append(btns);
  editEl.append(form);
}
// 11.4 節: タスクのビューからの更新(今日の記録に書く)
function buildToday(key, written, can) {
  const name = Log.nameForWrite(last.V, todayNum(), key, written);
  const box = el('div', 'box');
  box.append(el('div', 'grp', `今日の記録(${todayStr()})― 過去の記録は変えずに、今日の記録に書きます`));
  const form = el('div', 'form');
  box.firstChild.textContent += `: ${name}`;
  // 今日の、同じ記録先の行(書いた名前によらない)。欄に出すのは、その属性を持つ最後の行の値で、変える・消すのも、その行(11.4 節)
  const today = last.recs.filter((x) => x.date === todayNum() && x.key === key);
  const holder = (k) => [...today].reverse().find((x) => x.at[k]) || null;
  const cur = (k) => { const t = holder(k); return t ? t.at[k].text : ''; };
  // 書く先と名前の決め方は計算部(Log.writeToday)
  const put = (k, v) => applyEdit(Log.writeToday(srcEl.value, OPT(), last, todayNum(), key, written, k, v));
  select(form, 't-status', ATTR_JA.status, OPTS.status, cur('status'), (v) => put('status', v), can);
  field(form, 't-progress', ATTR_JA.progress, cur('progress'), (v) => put('progress', v), { can, cls: 'num' });
  field(form, 't-hours', ATTR_JA.hours, cur('hours'), (v) => put('hours', v), { can, cls: 'num' });
  box.append(form);
  editEl.append(box);
}
// 11.5 節: 要確認の S2 から解決を記録する
function buildSolve(r, can) {
  const box = el('div', 'box');
  box.append(el('div', 'grp', `解決を記録(今日 ${todayStr()} の記録に solved: を書きます)`));
  const form = el('div', 'form');
  const inp = field(form, 's-solved', '解決の内容', '', () => false, { can, cls: 'wide', noBlur: true, ph: '例: アプリ用パスワードで通った' });
  const b = el('button', null, '記録する');
  b.disabled = !can;
  // 書く先は、今日の同じ記録先の最後の行。その行が問題(issue: か status: blocked)なら、新しい行に書く。名前は今日に使う版での名前
  // 書く先と名前の決め方は計算部(Log.writeSolved)。書いた後は「解決を記録」の欄を閉じ、書いた記録の欄だけにする(続けて押して前の解決を上書きしないように)
  const go = () => {
    const v = inp.value.trim(); if (!v) { showEditError('解決の内容を書いてください'); return; }
    if (applyEdit(Log.writeSolved(srcEl.value, OPT(), last, todayNum(), r.key, r.name, v)) && editSel?.kind === 'rec') { editSel.act = null; buildEdit(); }
  };
  b.addEventListener('click', go);
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) go(); });
  form.append(b);
  box.append(form);
  editEl.append(box);
}
// 11.3 節: 記録を追加のパネル
function buildAdd(can) {
  const head = el('div', 'row');
  head.append(el('span', 'kind', '記録を追加'), el('span', 'small', 'その日付の日付の行の下に、記録の行を追加します(日付の行がなければ追加します)'));
  const close = el('button', null, '閉じる');
  close.addEventListener('click', () => { editSel = null; buildEdit(); });
  head.append(close);
  editEl.append(head);
  const date = addForm.date ?? todayStr();
  const dnum = Log.parseDate(date);
  const cands = dnum === null ? [] : Log.nameCandidates(plans, dnum, '');
  const dl = document.createElement('datalist'); dl.id = 'addNames';
  for (const c of cands) dl.append(new Option(`${c.label}(${c.kind})`, c.insert));
  editEl.append(dl);
  if (cands.excluded?.length) editEl.append(el('div', 'small', `マイログに書けない文字(空白 + 予約語 + :)を含む名前は、候補に出しません: ${cands.excluded.join('、')}`));
  const isFunc = cands.some((c) => c.kind === '機能' && c.insert === addForm.name.trim());
  const form = el('div', 'form');
  const v = (k) => addForm.vals[k] ?? '';
  const keep = (k) => (x) => { addForm.vals[k] = x; };
  const rebuild = () => { buildEdit(); if (addArmed) { addArmed = false; editEl.querySelector('[data-k="a-add"]')?.click(); } };
  field(form, 'a-date', '日付', date, (x) => { addForm.date = x || todayStr(); rebuild(); }, { can, type: 'date' });
  field(form, 'a-name', '名前', addForm.name, (x) => {
    addForm.name = x;
    // 機能の欄の出し方が変わらないタスクの名前どうしなら、作り直さない(押しかけた「追加」のボタンを消さないため)
    if (!isFunc && !cands.some((c) => c.kind === '機能' && c.insert === x.trim())) return;
    rebuild();
    if (editSel?.kind === 'add') editEl.querySelector('[data-k="a-hours"],[data-k="a-test"]')?.focus();
  }, { can, cls: 'wide', list: 'addNames', ph: cands.length ? '計画のタスク・機能から選べます' : 'タスク名・機能名', onInput: (x) => { addForm.name = x; } });
  editEl.append(form);
  const grp = (t) => { const g = el('div', 'grp', t); editEl.append(g); const f = el('div', 'form'); editEl.append(f); return f; };
  const fT = grp('タスクの記録');
  field(fT, 'a-hours', ATTR_JA.hours, v('hours'), () => {}, { can, cls: 'num', onInput: keep('hours') });
  select(fT, 'a-status', ATTR_JA.status, OPTS.status, v('status'), (x) => { addForm.vals.status = x; }, can);
  field(fT, 'a-progress', ATTR_JA.progress, v('progress'), () => {}, { can, cls: 'num', onInput: keep('progress') });
  field(fT, 'a-review', ATTR_JA.review, v('review'), () => {}, { can, onInput: keep('review') });
  if (isFunc) {
    const fF = grp('機能の記録');
    select(fF, 'a-test', ATTR_JA.test, OPTS.test, v('test'), (x) => { addForm.vals.test = x; }, can);
    const mops = Log.mopCandidates(plans, dnum, addForm.name.trim(), '');
    select(fF, 'a-mop', ATTR_JA.mop, [['', '(なし)'], ...mops.map((m) => [m.insert, m.insert])], v('mop'), (x) => { addForm.vals.mop = x; }, can);
    field(fF, 'a-trl', ATTR_JA.trl, v('trl'), () => {}, { can, cls: 'num', onInput: keep('trl') });
    field(fF, 'a-tpm', ATTR_JA.tpm, v('tpm'), () => {}, { can, onInput: keep('tpm') });
  }
  const fN = grp('問題・質問・メモ');
  field(fN, 'a-issue', ATTR_JA.issue, v('issue'), () => {}, { can, cls: 'wide', onInput: keep('issue') });
  field(fN, 'a-ask', ATTR_JA.ask, v('ask'), () => {}, { can, onInput: keep('ask') });
  field(fN, 'a-note', ATTR_JA.note, v('note'), () => {}, { can, cls: 'wide', onInput: keep('note') });
  const btns = el('div', 'btns');
  const b = el('button', null, '追加');
  b.dataset.k = 'a-add';
  b.disabled = !can;
  // 押し始め(欄から離れる前)に印を付け、欄の書き込みでパネルを作り直したときも、作り直した後の「追加」を押す
  b.addEventListener('mousedown', () => { addArmed = true; });
  b.addEventListener('click', () => {
    addArmed = false;
    if (dnum === null) { showEditError('日付を選んでください'); return; }
    // 欄に見えている値だけを使う(機能の欄を出していないときは、機能の属性を書かない)
    const vals = {};
    for (const k of ['hours', 'status', 'progress', 'review', ...(isFunc ? ['test', 'mop', 'trl', 'tpm'] : []), 'issue', 'ask', 'note']) if (addForm.vals[k]) vals[k] = addForm.vals[k];
    if (applyEdit(Log.Edit.add(srcEl.value, OPT(), dnum, addForm.name, vals))) { addForm.vals = {}; buildEdit(); }
  });
  btns.append(b);
  fN.append(btns);
}
// 11.6 節: AI で記録のパネル。手順を示し、生成 AI に貼るプロンプトをコピーする(アプリは AI に何も送らない)
function buildAI() {
  const head = el('div', 'row');
  head.append(el('span', 'kind', 'AI で今日の記録を書く'), el('span', 'small', 'このアプリは AI に何も送信しません。次の手順で、自分で AI に貼ってください。'));
  const close = el('button', null, '閉じる');
  close.addEventListener('click', () => { editSel = null; buildEdit(); });
  head.append(close);
  editEl.append(head);
  const ol = el('ol', 'steps');
  for (const t of ['「プロンプトをコピー」を押す', '使っている生成 AI(ChatGPT・Gemini・Claude など)に貼る', 'AI の質問に答える。最後に出る記録の案を、自分で確かめる(違っていたら AI に直させる)', '正しければ、AI が出した行を左のテキストの最後に貼る']) ol.append(el('li', null, t));
  editEl.append(ol);
  const r = last?.ok ? last : null;
  const b = el('button', null, 'プロンプトをコピー');
  b.dataset.k = 'ai-copy';
  b.disabled = !r;
  let p = null;
  if (r) { try { p = Log.aiPrompt(r, { today: todayNum() }); } catch (e) { showInternal(`内部エラー(AI で記録): ${e.message}`); b.disabled = true; } }
  b.addEventListener('click', () => { if (p) copyText(p.text, b); });
  const btns = el('div', 'btns'); btns.append(b);
  editEl.append(btns);
  if (!r) editEl.append(el('div', 'small', 'テキストのエラーを直すと使えます。'));
  else if (p) editEl.append(el('div', 'map', p.map.length ? `名前の置き換え: ${p.map.map(([k, v]) => `${k} = ${v}`).join('、')}(AI が出した行を貼った後に、本当の名前に直す)` : '名前の置き換え: なし(自分の名前は「本人」として渡します)'));
}
$('#btnAI').addEventListener('click', () => { editSel = { kind: 'ai' }; markSel(); buildEdit(); });
$('#btnAdd').addEventListener('click', () => {
  editSel = { kind: 'add' };
  addForm.date = todayStr(); // 開くたびに日付は今日(仕様書 11.3 節)
  markSel(); buildEdit();
  editEl.querySelector('[data-k="a-name"]')?.focus();
});
function selectText(start, end) {
  srcEl.focus();
  srcEl.setSelectionRange(start, end);
  scrollToOffset(start);
}
function scrollToOffset(pos) {
  const line = srcEl.value.slice(0, pos).split('\n').length;
  srcEl.scrollTop = Math.max(0, (line - 4) * LINE_PX);
  syncScroll();
}

// ---- 計画書の一覧(仕様書 5 章。読むだけ。プロジェクト分析の一覧と同じ並べ方)
function renderPlans() {
  plansEl.textContent = '';
  plansEl.classList.toggle('closed', !plansOpen);
  const head = el('div', 'head');
  head.append(el('span', null, `${plansOpen ? '▾' : '▸'} 計画書(${plans.length})`));
  head.append(el('span', 'small', plans.length ? '照合に使う版は、記録の日付で選びます' : '「計画書を追加」で .plan・.plans を読むと、名前を照合します'));
  head.addEventListener('click', () => { plansOpen = !plansOpen; renderPlans(); persist(); });
  plansEl.append(head);
  const lab = Log.labels(plans);
  const ul = el('ul');
  plans.forEach((e, i) => {
    const li = el('li');
    const nm = el('span', 'nm', `${lab.get(e)} ― ${e.name}`);
    nm.title = e.name;
    li.append(nm);
    if (e.nErr) { const s = el('span', 'err', `エラー ${e.nErr} 件(${e.firstErr.line} 行: ${e.firstErr.message})。照合に使いません`); s.title = s.textContent; li.append(s); nm.style.flex = '0 1 auto'; }
    else if (e.date === null) li.append(el('span', 'warn', 'version: がないため照合に使いません'));
    else if (e.nWarn) li.append(el('span', 'warn', `警告 ${e.nWarn} 件`));
    const mv = (dir, label, tip) => { const b = el('button', null, label); b.title = tip; b.disabled = !Log.moveEntry(plans, i, dir); b.addEventListener('click', () => { const x = Log.moveEntry(plans, i, dir); if (x) { plans = x; plansChanged(); } }); li.append(b); };
    mv(-1, '▲', '同じ日付の中で前へ');
    mv(1, '▼', '同じ日付の中で後ろへ');
    const rm = el('button', null, '外す'); rm.title = '計画書の一覧から外す(ファイルは消さない)';
    rm.addEventListener('click', () => { plans = plans.filter((x) => x !== e); plansChanged(); });
    li.append(rm);
    ul.append(li);
  });
  plansEl.append(ul);
  if (planNote) plansEl.append(el('div', 'note', planNote));
}
function plansChanged() { persist(); clearTimeout(debounce); debounce = null; analyze(); }

// ---- 読み込み(仕様書 9 章): .mylog は開き、.plan・.plans は計画書の一覧に足す
// .txt はプロジェクト計画がファイル操作機能のないブラウザで保存した計画、.svg はプロジェクト計画の版 0.30 までに保存した画像(計画が入っている)
const kindOf = (name) => (/\.mylog$/i.test(name) ? 'mylog' : /\.(plan|txt)$/i.test(name) ? 'plan' : /\.plans$/i.test(name) ? 'plans' : /\.svg$/i.test(name) ? 'svg' : null);
const readText = (file) => new Promise((ok, ng) => {
  const r = new FileReader();
  r.onload = () => { try { ok(new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(r.result))); } catch { ng(new Error('UTF-8 として読めません')); } };
  r.onerror = () => ng(new Error('読めませんでした'));
  r.readAsArrayBuffer(file);
});
// items: [{ file, handle(ファイル操作機能の扱い。なければ null)、handleP(後から受け取る扱い) }]
async function openItems(items) {
  const errors = [];
  const logs = items.filter((x) => kindOf(x.file.name) === 'mylog');
  const ps = items.filter((x) => ['plan', 'plans', 'svg'].includes(kindOf(x.file.name)));
  for (const x of items) if (!kindOf(x.file.name)) errors.push(`${x.file.name} は開けません。開けるのはマイログ(.mylog)と計画書(.plan・.txt・.plans、プロジェクト計画の版 0.30 までに保存した .svg)です`);
  if (logs.length > 1) errors.push(`マイログは 1 つずつ開いてください${ps.length ? '(計画書は計画書の一覧に足しました)' : ''}`);
  if (ps.length) await addPlanFiles(ps.map((x) => x.file), errors);
  if (logs.length === 1 && okToDiscard()) {
    const { file, handle, handleP } = logs[0];
    try {
      const text = await readText(file);
      setText(text, baseOf(file.name), { name: file.name, handle, saved: text });
      const g = editGen;
      if (handleP) handleP.then((h) => { if (h?.kind === 'file' && editGen === g) fileHandle = h; }).catch(() => {});
    } catch (e) { errors.push(`${file.name}: ${e.message}`); }
  }
  if (errors.length) alert(errors.join('\n'));
}
async function addPlanFiles(files, errors) {
  const entries = [], bundles = [], notes = [];
  for (const file of files) {
    let text;
    try { text = await readText(file); } catch (e) { errors.push(`${file.name}: ${e.message}`); continue; }
    if (kindOf(file.name) === 'plan') { entries.push(Log.loadPlan(file.name, text)); continue; }
    if (kindOf(file.name) === 'svg') {
      const x = Plan.extractSource(text);
      if (!x.ok) { errors.push(`${file.name}: この SVG には計画書が入っていません(開ける .svg は、プロジェクト計画の版 0.30 までに保存したものだけです)`); continue; }
      entries.push(Log.loadPlan(`${file.name.replace(/\.svg$/i, '')}.plan`, x.text)); continue;
    }
    const x = Log.fromPlans(text);
    if (!x.ok) { errors.push(`${file.name}: ${x.error}`); continue; }
    for (const f of x.files) entries.push(Log.loadPlan(f.name, f.text));
    bundles.push(x.files);
    if (x.nLogs) notes.push(`${file.name} の中のマイログ(${x.nLogs} 件)は読みません(計画書だけを足しました)`);
  }
  const res = Log.addEntries(plans, entries);
  plans = res.list;
  // plans の中の同じ日付の版の並びに合わせる(一覧にすでにある版も)
  for (const b of bundles) plans = Log.alignOrder(plans, b);
  if (res.skipped.length) notes.push(`同じ内容のため追加しませんでした: ${res.skipped.map((s) => `${s.name}(${s.dup} と同じ)`).join('、')}`);
  planNote = notes.join('。');
  if (res.added.length) plansOpen = true;
  plansChanged();
}
const FS_OK = typeof window.showOpenFilePicker === 'function' && typeof window.showSaveFilePicker === 'function';
const PICK_OPEN = { multiple: true, types: [{ description: 'マイログ・プロジェクト計画のテキスト・plans', accept: { 'text/plain': ['.mylog', '.plan', '.txt'], 'application/json': ['.plans'], 'image/svg+xml': ['.svg'] } }] };
const PICK_PLAN = { multiple: true, types: [{ description: 'プロジェクト計画のテキスト・plans', accept: { 'text/plain': ['.plan', '.txt'], 'application/json': ['.plans'], 'image/svg+xml': ['.svg'] } }] };
const PICK_SAVE = { types: [{ description: 'マイログ', accept: { 'text/plain': ['.mylog'] } }] };
$('#btnOpen').addEventListener('click', async () => {
  if (!FS_OK) { $('#fileOpen').click(); return; }
  let hs;
  try { hs = await window.showOpenFilePicker(PICK_OPEN); } catch (e) { if (e?.name !== 'AbortError') $('#fileOpen').click(); return; }
  const items = [];
  for (const h of hs) items.push({ file: await h.getFile(), handle: h });
  openItems(items);
});
$('#fileOpen').addEventListener('change', (e) => { const fs = [...e.target.files]; e.target.value = ''; if (fs.length) openItems(fs.map((file) => ({ file, handle: null }))); });
$('#btnPlan').addEventListener('click', async () => {
  if (!FS_OK) { $('#filePlan').click(); return; }
  let hs;
  try { hs = await window.showOpenFilePicker(PICK_PLAN); } catch (e) { if (e?.name !== 'AbortError') $('#filePlan').click(); return; }
  const files = [];
  for (const h of hs) files.push(await h.getFile());
  openItems(files.map((file) => ({ file, handle: null })));
});
$('#filePlan').addEventListener('change', (e) => { const fs = [...e.target.files]; e.target.value = ''; if (fs.length) openItems(fs.map((file) => ({ file, handle: null }))); });
['dragenter', 'dragover'].forEach((ev) => window.addEventListener(ev, (e) => { e.preventDefault(); $('#drop').classList.add('on'); }));
['dragleave', 'drop'].forEach((ev) => window.addEventListener(ev, (e) => { e.preventDefault(); if (ev === 'drop' || e.relatedTarget === null) $('#drop').classList.remove('on'); }));
window.addEventListener('drop', (e) => {
  const fs = [...e.dataTransfer.files];
  if (!fs.length) return;
  // 上書きの先にするため、ファイルの扱いを受け取る(Chrome・Edge。ドロップの処理の中で呼ぶ必要がある)
  const its = [...(e.dataTransfer.items ?? [])];
  const items = fs.map((file, i) => ({ file, handle: null, handleP: kindOf(file.name) === 'mylog' && its[i] && typeof its[i].getAsFileSystemHandle === 'function' ? its[i].getAsFileSystemHandle() : null }));
  openItems(items);
});

// ---- ブラウザへの自動保持(このブラウザの localStorage だけに書く。どこにも送信しない。仕様書 9 章)
const KEY_DOC = 'mylog.sapp.jp:doc';
const warnEl = $('#warn');
const WARN = { save: '', tab: '' };
const setWarn = (kind, t) => { WARN[kind] = t; warnEl.textContent = [WARN.save, WARN.tab].filter(Boolean).join(' / '); };
function persist() {
  let ok = true;
  try { localStorage.setItem(KEY_DOC, JSON.stringify({ text: srcEl.value, base: fileBase, name: fileName, dirty, saved: savedText, plans: plans.map((e) => ({ name: e.name, text: e.text })), plansOpen, th, view: viewKindEl.value })); } catch { ok = false; }
  setWarn('save', ok ? '' : 'ブラウザへの自動保持に失敗しました。「上書き保存」か「別名で保存」でファイルに残してください');
}
function restored() { try { const d = JSON.parse(localStorage.getItem(KEY_DOC) ?? 'null'); return d && typeof d.text === 'string' ? d : null; } catch { return null; } }
window.addEventListener('storage', (e) => { if (e.key === KEY_DOC && e.newValue !== null) setWarn('tab', '別のタブでこのマイログが編集されました。このタブで続けると、そちらの内容は上書きされます'); });

// ---- テキスト欄
srcEl.addEventListener('input', (e) => {
  updateHighlight();
  edited();
  persist();
  const wasIdle = debounce === null;
  clearTimeout(debounce);
  debounce = setTimeout(() => { debounce = null; analyze(); }, 250);
  if (wasIdle && editSel) buildEdit();
  if (!applying) showComp(false); // 打つたびに候補を出し直す(当てはまらなければ閉じる)
});
srcEl.addEventListener('keydown', (e) => {
  if (compEl.classList.contains('on') && compKey(e)) return;
  if (e.key === ' ' && e.ctrlKey) { e.preventDefault(); showComp(true); return; }
  if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !e.altKey) {
    e.preventDefault();
    if (!document.execCommand('insertText', false, '  ')) { srcEl.setRangeText('  ', srcEl.selectionStart, srcEl.selectionEnd, 'end'); srcEl.dispatchEvent(new Event('input')); }
  }
});
srcEl.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== srcEl && !compEl.matches(':hover')) hideComp(); }, 100));
srcEl.addEventListener('click', hideComp);
// テキストを入れ替える(新規・開く・例・開き直したときの続き)。o: { name, handle, dirty, save, saved }
function setText(text, base, o = {}) {
  hideComp();
  editSel = null;
  addForm.date = null; addForm.name = ''; addForm.vals = {}; // 別のテキストになったら、記録を追加の欄は空に戻す(仕様書 11.3 節)
  srcEl.value = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  if (base) fileBase = base;
  editGen++; docGen++;
  fileName = o.name ?? '';
  fileHandle = o.handle ?? null;
  savedText = typeof o.saved === 'string' ? o.saved.replace(/^﻿/, '').replace(/\r\n?/g, '\n') : null;
  dirty = !!o.dirty;
  showName();
  lastOk = null;
  canvasEl.textContent = '';
  updateHighlight();
  if (o.save !== false) persist();
  analyze();
}
viewKindEl.addEventListener('change', () => { if (editSel?.kind === 'rec') editSel = null; persist(); draw(); markSel(); buildEdit(); });

// テキスト欄の変わった部分だけを、元に戻す(Ctrl+Z)の履歴に載る書き方で入れる
let applying = false;
function spliceSrc(nt) {
  const old = srcEl.value;
  let p = 0;
  while (p < old.length && p < nt.length && old[p] === nt[p]) p++;
  let q = 0;
  while (q < old.length - p && q < nt.length - p && old[old.length - 1 - q] === nt[nt.length - 1 - q]) q++;
  const hi = (c) => c >= 0xd800 && c <= 0xdbff, lo = (c) => c >= 0xdc00 && c <= 0xdfff;
  if (p > 0 && hi(old.charCodeAt(p - 1))) p--;
  if (q > 0 && lo(old.charCodeAt(old.length - q))) q--;
  const mid = nt.slice(p, nt.length - q);
  const keepTop = srcEl.scrollTop;
  applying = true;
  try {
    srcEl.focus();
    srcEl.setSelectionRange(p, old.length - q);
    const done = mid ? document.execCommand('insertText', false, mid) : document.execCommand('delete');
    if (!done || srcEl.value !== nt) srcEl.value = nt;
    srcEl.scrollTop = keepTop;
  } finally { applying = false; }
  return { p, e: old.length - q, len: mid.length };
}
// カーソルの位置に文字を入れる(元に戻す履歴に載せる)
function insertAt(s0, s1, text) {
  applying = true;
  try {
    srcEl.focus();
    srcEl.setSelectionRange(s0, s1);
    if (!document.execCommand('insertText', false, text)) { srcEl.setRangeText(text, s0, s1, 'end'); srcEl.dispatchEvent(new Event('input')); }
  } finally { applying = false; }
}

// ---- 名前の補完(仕様書 8 章)
let comp = null; // { items, i, s0, s1 }
const measure = document.createElement('canvas').getContext('2d');
function caretContext() {
  const pos = srcEl.selectionStart;
  if (pos !== srcEl.selectionEnd) return null;
  const v = srcEl.value;
  const ls = v.lastIndexOf('\n', pos - 1) + 1;
  const head = v.slice(ls, pos);
  // 日付: カーソルより上で最も近い日付の行
  const above = v.slice(0, ls).split('\n');
  let date = null;
  for (let k = above.length - 1; k >= 0; k--) { const m = /^-[ \t]+(\d{4}-\d{2}-\d{2})/.exec(above[k]); if (m) { date = Log.parseDate(m[1]); break; } }
  if (date === null) return null;
  const KWS = `(^|[ \\t])(${KW}):`;
  const mItem = /^([ \t]+-[ \t]+)(.*)$/.exec(head);
  if (!mItem) return null;
  const rest = mItem[2];
  const mm = new RegExp(`(?:^|[ \\t])mop:[ \\t]*((?:(?!(?:^|[ \\t])(?:${KW}):).)*)$`).exec(rest);
  if (mm) {
    const nameM = new RegExp(KWS).exec(rest);
    const name = rest.slice(0, nameM ? nameM.index : rest.length).trim();
    return { kind: 'mop', date, name, part: mm[1], s0: pos - mm[1].length, s1: pos };
  }
  if (new RegExp(KWS).test(rest)) return null; // 属性を書き始めたら名前の補完はしない
  const lead = rest.length - rest.trimStart().length;
  return { kind: 'name', date, part: rest.trimStart(), s0: ls + mItem[1].length + lead, s1: pos };
}
function showComp(force) {
  if (!plans.some((e) => e.usable)) { hideComp(); return; }
  const c = caretContext();
  if (!c || (!force && c.kind === 'name' && !c.part)) { hideComp(); return; }
  const items = (c.kind === 'name' ? Log.nameCandidates(plans, c.date, c.part) : Log.mopCandidates(plans, c.date, c.name, c.part)).slice(0, 50);
  if (!items.length || (items.length === 1 && items[0].insert === c.part)) { hideComp(); return; }
  comp = { items, i: 0, s0: c.s0, s1: c.s1, kind: c.kind };
  compEl.textContent = '';
  items.forEach((it, k) => {
    const d = el('div', k === 0 ? 'cur' : null);
    d.append(el('span', null, it.label));
    d.append(el('span', 'k', it.kind));
    d.addEventListener('mousedown', (e) => { e.preventDefault(); comp.i = k; acceptComp(); });
    compEl.append(d);
  });
  // カーソルの位置に出す
  const v = srcEl.value, pos = srcEl.selectionStart;
  const ls = v.lastIndexOf('\n', pos - 1) + 1;
  const line = v.slice(0, ls).split('\n').length - 1;
  measure.font = getComputedStyle(srcEl).font;
  const x = 10 + measure.measureText(v.slice(ls, pos).replace(/\t/g, '    ')).width - srcEl.scrollLeft;
  const y = 10 + (line + 1) * LINE_PX - srcEl.scrollTop;
  compEl.style.left = `${Math.max(4, Math.min(x, srcEl.clientWidth - 230))}px`;
  compEl.style.top = `${y + 2}px`;
  compEl.classList.add('on');
}
function hideComp() { comp = null; compEl.classList.remove('on'); }
function compKey(e) {
  if (!comp) return false;
  if (e.isComposing || e.keyCode === 229) return false;
  const n = comp.items.length;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    comp.i = (comp.i + (e.key === 'ArrowDown' ? 1 : n - 1)) % n;
    [...compEl.children].forEach((d, k) => d.classList.toggle('cur', k === comp.i));
    compEl.children[comp.i].scrollIntoView({ block: 'nearest' });
    return true;
  }
  if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); acceptComp(); return true; }
  if (e.key === 'Escape') { e.preventDefault(); hideComp(); return true; }
  return false;
}
function acceptComp() {
  const c = comp;
  if (!c) return;
  hideComp();
  const it = c.items[c.i];
  insertAt(c.s0, c.s1, c.kind === 'name' ? `${it.insert} ` : it.insert);
}

// ---- 設定(要確認の規則の値。仕様書 6.2 節)
const SET_ROWS = [['S1', '記録の途絶', '日'], ['S2', '問題の長期化', '日'], ['S5', '終了予定日の超過', '日'], ['S7', '計画にない作業', '%'], ['S8', '進捗の停止', '日']];
$('#btnSet').addEventListener('click', () => {
  const d = $('#dlgSet');
  d.innerHTML = '<h2>要確認の規則の値</h2><p class="small">値はこのブラウザに残し、マイログのファイルには書きません。</p>';
  const tb = el('table');
  tb.innerHTML = '<tr><th>番号</th><th>兆候</th><th>値</th></tr>';
  for (const [k, name, unit] of SET_ROWS) {
    const tr = el('tr');
    tr.append(el('td', null, k), el('td', null, name));
    const td = el('td');
    const inp = document.createElement('input');
    inp.type = 'number'; inp.min = k === 'S7' ? '1' : '0'; inp.max = k === 'S7' ? '100' : '3650'; inp.step = '1'; inp.value = th[k];
    inp.addEventListener('change', () => {
      const v = Math.round(Number(inp.value));
      if (!Number.isFinite(v) || v < +inp.min || v > +inp.max) { inp.value = th[k]; return; }
      th = { ...th, [k]: v }; persist(); draw();
    });
    td.append(inp, document.createTextNode(` ${unit}`));
    tr.append(td);
    tb.append(tr);
  }
  d.append(tb);
  const rb = el('button', null, '既定の値に戻す');
  rb.style.marginTop = '10px';
  rb.addEventListener('click', () => { th = { ...Log.TH_DEFAULT }; persist(); draw(); d.close(); });
  d.append(rb);
  d.showModal();
});

// ---- 保存(仕様書 9 章。プロジェクト計画と同じ作り)
function download(name, blob) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }
let statT = null, saving = false;
function setStat(t) { const e = $('#stat'); e.textContent = t; clearTimeout(statT); if (t) statT = setTimeout(() => { e.textContent = ''; }, 4000); }
function showName() { const e = $('#fileName'); e.textContent = `${fileName || '(名前なし)'}${dirty ? ' *' : ''}`; e.title = dirty ? '保存していない変更があります' : ''; }
function edited() { editGen++; if (!dirty) { dirty = true; showName(); } }
function setDirty(v) { dirty = v; showName(); persist(); }
const okToDiscard = () => !dirty || srcEl.value.trim() === '' || confirm('保存していない変更があります。破棄して続けますか?');
const stamp = () => { const d = new Date(); return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`; };
const baseOf = (name) => name.replace(/\.[^.]*$/, '') || 'mylog';
// 名前の候補: by: の名前.mylog(by: がないかエラーのときは、今のファイル名、なければ mylog.mylog)
const suggested = () => { const b = Log.byName(srcEl.value); return b ? `${b}.mylog` : fileName || 'mylog.mylog'; };
function downloadText(name, text) { download(name, new Blob([text], { type: 'text/plain;charset=utf-8' })); }
async function writeTo(h, text) { const w = await h.createWritable(); await w.write(text); await w.close(); }
function setSaving(v) { saving = v; $('#btnSave').disabled = v; $('#btnSaveAs').disabled = v; }
function blockedByVersion() {
  const ln = Log.misplacedVersion(srcEl.value);
  if (ln === null) return false;
  setStat(`version: が正しくない場所にあります(${ln} 行目)。version: は 1 行目にだけ書けます。直してから保存してください`);
  const lines = srcEl.value.split('\n');
  const a = lines.slice(0, ln - 1).reduce((x, l) => x + l.length + 1, 0);
  srcEl.focus(); srcEl.setSelectionRange(a, a + lines[ln - 1].length); scrollToOffset(a);
  return true;
}
function unchanged() {
  if (savedText === null) return false;
  const cur = srcEl.value;
  if (cur === savedText) { setStat('変更がないので、保存しませんでした'); if (dirty) setDirty(false); return true; }
  if (Log.stripVersion(cur) === Log.stripVersion(savedText)) { setStat('version: の日付のほかに変更がないので、保存しませんでした'); return true; }
  return false;
}
function stamped(cur) {
  if (savedText !== null && Log.stripVersion(cur) === Log.stripVersion(savedText)) return { text: cur, date: null };
  const date = todayStr();
  return { text: Log.setVersion(cur, date), date };
}
function putVersion(nt) {
  const cur = srcEl.value;
  if (nt === cur) return;
  const act = document.activeElement, s0 = srcEl.selectionStart, s1 = srcEl.selectionEnd, top = srcEl.scrollTop;
  const lines0 = cur.split('\n').length;
  const c = spliceSrc(nt);
  const map = (x) => (c.e - c.p === c.len || x < c.p ? x : x >= c.e ? x + c.len - (c.e - c.p) : c.p + c.len);
  srcEl.setSelectionRange(map(s0), map(s1));
  srcEl.scrollTop = top + (top > 0 ? (nt.split('\n').length - lines0) * LINE_PX : 0);
  updateHighlight();
  clearTimeout(debounce); debounce = null;
  analyze();
  if (act === srcEl) return;
  if (act && act !== document.body && act.isConnected && typeof act.focus === 'function') act.focus(); else srcEl.blur();
}
function whenFree(fn) { const d = document.querySelector('dialog[open]'); if (d) d.addEventListener('close', () => whenFree(fn), { once: true }); else fn(); }
function afterWrite(gen, dg, st, msg) {
  if (docGen !== dg) { setStat(`${msg}(保存中に別の内容を開いたので、いま開いている内容は保存していません)`); return; }
  savedText = st.text;
  if (editGen === gen) { setDirty(false); setStat(msg); whenFree(() => { if (docGen === dg) { putVersion(st.text); setDirty(false); } }); return; }
  if (st.date) whenFree(() => { if (docGen === dg && Log.parse(srcEl.value).set.version) { putVersion(Log.setVersion(srcEl.value, st.date)); persist(); } });
  persist();
  setStat(`${msg}。保存中に変わった内容はまだ保存されていません`);
}
let picking = false;
async function saveAs() { if (saving || picking) return; picking = true; try { await saveAs1(); } finally { picking = false; } }
async function saveAs1() {
  if (debounce !== null) { clearTimeout(debounce); debounce = null; analyze(); }
  if (blockedByVersion()) return;
  let why = '';
  if (FS_OK) {
    let h;
    try { h = await window.showSaveFilePicker({ suggestedName: suggested(), ...PICK_SAVE }); }
    catch (e) { if (e?.name === 'AbortError') return; h = null; }
    if (h) {
      if (blockedByVersion()) return;
      const gen = editGen, dg = docGen, st = stamped(srcEl.value);
      setSaving(true);
      try {
        await writeTo(h, st.text);
        if (docGen === dg) { fileHandle = h; fileName = h.name; fileBase = baseOf(h.name); showName(); persist(); }
        afterWrite(gen, dg, st, `${h.name} に保存しました(${stamp()})`);
        return;
      } catch { why = '保存先に書き込めなかったので、ダウンロードで保存しました'; }
      finally { setSaving(false); }
    } else why = '保存先を選べなかったので、ダウンロードで保存しました';
  }
  let name = prompt('ファイル名', suggested());
  if (name === null) { if (why) setStat('保存を取りやめました'); return; }
  name = name.trim() || suggested();
  if (!/\.mylog$/i.test(name)) name += '.mylog';
  if (blockedByVersion()) return;
  const st = stamped(srcEl.value);
  downloadText(name, st.text);
  fileName = name; fileBase = baseOf(name); fileHandle = null;
  afterWrite(editGen, docGen, st, '');
  setStat(why);
}
async function save() {
  if (saving || picking) return;
  if (blockedByVersion()) return;
  if (FS_OK && fileHandle) {
    if (unchanged()) return;
    const gen = editGen, dg = docGen, st = stamped(srcEl.value), h = fileHandle;
    setSaving(true);
    try { await writeTo(h, st.text); afterWrite(gen, dg, st, `${h.name} に上書き保存しました(${stamp()})`); }
    catch (e) { setStat(e?.name === 'AbortError' ? '上書き保存を取りやめました' : '上書きできませんでした。「別名で保存」を使ってください'); }
    finally { setSaving(false); }
    return;
  }
  if (FS_OK || !fileName) { saveAs(); return; }
  if (unchanged()) return;
  const st = stamped(srcEl.value);
  downloadText(fileName, st.text);
  afterWrite(editGen, docGen, st, '');
  setStat('');
}
$('#btnSave').addEventListener('click', save);
$('#btnSaveAs').addEventListener('click', saveAs);
window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 's') {
    e.preventDefault();
    if (e.repeat) return;
    // 編集パネルの書きかけの欄があれば、先に書き込む(上書き保存のボタンを押したときと同じ)。拒まれたら保存しない
    const a = document.activeElement;
    if (a && editEl.contains(a) && typeof a._commit === 'function' && a._commit() === 'error') return;
    save();
  }
});

// ---- 印刷 / PDF: ビューをすべて、縦向きのページに(長い表は行で区切る)
function buildPrint() {
  const area = $('#printArea');
  area.textContent = ''; area.classList.remove('one');
  { const st = $('#pageOne'); if (st) st.textContent = ''; }
  if (debounce !== null) { clearTimeout(debounce); debounce = null; analyze(); }
  if (!last?.ok) return 0;
  let pages;
  try { pages = Log.printMy(last, { today: todayNum(), th }); } catch (e) { showInternal(`内部エラー(印刷): ${e.message}`); return 0; }
  pages.forEach((svg, i) => { const page = el('div', 'page'); page.innerHTML = uniqIds(svg, `p${i + 1}-`); area.append(page); });
  return pages.length;
}
$('#btnPrint').addEventListener('click', () => {
  if (!last?.ok && debounce === null) { alert('テキストにエラーがあるので印刷できません。エラーを直してから印刷してください'); return; }
  if (!buildPrint()) { alert('印刷できる表がありません(エラーを直してください)'); return; }
  window.print();
});
window.addEventListener('afterprint', () => { const a = $('#printArea'); a.textContent = ''; a.classList.remove('one'); const st = $('#pageOne'); if (st) st.textContent = ''; });

// ---- 上の帯のボタン
$('#btnNew').addEventListener('click', () => { if (okToDiscard()) setText('', 'mylog'); });
$('#btnSample').addEventListener('click', () => {
  if (!okToDiscard()) return;
  // 例のマイログを開き、計画書の一覧を例の計画に入れ替える。例の日付は、今日がプロジェクトの途中になるようにずらす(仕様書 8 章)
  if (plans.length && !confirm('計画書の一覧も、例の計画書に入れ替えます(計画書のファイルは消えません。「計画書を追加」で、もう一度追加できます)。よろしいですか?')) return;
  const d = todayNum() - Log.parseDate(Log.EXAMPLE_TODAY);
  plans = Log.sortList([Log.loadPlan('sample_old.plan', Log.shiftExample(SAMPLE_PLAN_OLD, d)), Log.loadPlan('sample.plan', Log.shiftExample(SAMPLE_PLAN, d))]); planNote = ''; plansOpen = true;
  setText(Log.shiftExample(SAMPLE_TEXT, d), 'sample');
});
$('#btnHelp').addEventListener('click', () => { const d = $('#dlgHelp'); d.innerHTML = HELP_HTML; d.showModal(); });
document.querySelectorAll('dialog').forEach((d) => d.addEventListener('click', (e) => { const r = d.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) d.close(); }));

// ---- 分割バー
(() => {
  const sp = $('#splitter'), left = $('#left');
  let drag = false;
  sp.addEventListener('mousedown', () => { drag = true; document.body.style.userSelect = 'none'; });
  window.addEventListener('mouseup', () => { drag = false; document.body.style.userSelect = ''; });
  window.addEventListener('mousemove', (e) => { if (drag) left.style.width = `${Math.max(200, Math.min(window.innerWidth - 200, e.clientX))}px`; });
})();

// 日付が変わったら解析し直して描き直す(要確認の今日と、今日より後の日付の警告のため)
setInterval(() => { if (todayStr() === drawnToday || debounce !== null || applying) return; analyze(); }, 60000);

// 開いたときは、前に編集していた内容を続ける(なければ空)。上書きの先は覚えていないので、次の上書き保存では保存先を尋ねる
{
  const d = restored();
  if (d) {
    if (Array.isArray(d.plans)) plans = Log.sortList(d.plans.filter((f) => f && typeof f.name === 'string' && typeof f.text === 'string').map((f) => Log.loadPlan(f.name, f.text)));
    if (typeof d.plansOpen === 'boolean') plansOpen = d.plansOpen;
    if (d.th && typeof d.th === 'object') for (const k of Object.keys(Log.TH_DEFAULT)) if (Number.isFinite(d.th[k])) th[k] = d.th[k];
    if (Log.VIEWS.some((v) => v.id === d.view)) viewKindEl.value = d.view;
  }
  setText(d ? d.text : '', d && typeof d.base === 'string' && d.base ? d.base : 'mylog', { name: d && typeof d.name === 'string' ? d.name : '', dirty: !!d?.dirty, saved: d && typeof d.saved === 'string' ? d.saved : null, save: false });
}
})();
