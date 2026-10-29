// マイログの計算部の検査(Node)。node test/logcore_test.cjs で実行する
'use strict';
const fs = require('fs');
const path = require('path');
const L = require('../dev/logcore.js');
let n = 0, ng = 0;
const ok = (cond, msg) => { n++; if (!cond) { ng++; console.log(`NG  ${msg}`); } };
const D = L.parseDate;
const errs = (t, o) => L.parse(t, o).diags.filter((d) => d.level === 'error').map((d) => d.message);
const warns = (a) => a.diags.filter((d) => d.level === 'warn').map((d) => d.message);
const plan = L.loadPlan('sample.plan', fs.readFileSync(path.join(__dirname, 'sample.plan'), 'utf8'));
const sample = fs.readFileSync(path.join(__dirname, 'sample.mylog'), 'utf8');
const planOld = L.loadPlan('sample_old.plan', fs.readFileSync(path.join(__dirname, 'sample_old.plan'), 'utf8'));

// ---- 3 章 構文
ok(L.parse(sample).ok, '例は構文エラーがない');
ok(errs('- 2026-04-01\n  - a hours: 1').some((m) => m.includes('by:')), 'by: がなければエラー');
ok(errs('by: a\nby: b').some((m) => m.includes('2 回')), 'by: を 2 回書いたらエラー');
ok(errs('by: a\nweek: wedn').length === 1, 'week: の値の誤りはエラー');
ok(errs('by: a\nversion: 2026-01-01').some((m) => m.includes('1 行目')), '2 行目の version: はエラー');
ok(L.misplacedVersion('by: a\n  version: 2026-01-01') === 2, '字下げした version: の行の番号');
ok(errs('version: 2026-01-01\nby: a').length === 0, '1 行目の version: は書ける');
ok(errs('by: a\n# 見出し').some((m) => m.includes('見出し')), '見出しはエラー');
ok(errs('by: a\n1. 項目').some((m) => m.includes('番号付き')), '番号付きのリストはエラー');
ok(errs('by: a\n* 項目').length === 1 && errs('by: a\n+ 項目').length === 1, '* と + のリストはエラー');
ok(errs('by: a\n```').length === 1, 'コードブロックはエラー');
ok(errs('by: a\n説明の文').some((m) => m.includes('説明の文')), '説明の文はエラー');
ok(errs('by: a\n  - a hours: 1').some((m) => m.includes('日付の行')), '日付の行より前の記録の行はエラー');
ok(errs('by: a\n- 2026-02-30').some((m) => m.includes('実在')), '実在しない日付はエラー');
ok(errs('by: a\n- 2026-02-01 hours: 1').some((m) => m.includes('note:')), '日付の行には note: だけ');
ok(errs('by: a\n- 2026-02-01\n　- a hours: 1').some((m) => m.includes('全角')), '全角の空白の字下げはエラー');
ok(errs('by: a\n- 2026-02-01\n  -　a hours: 1').some((m) => m.includes('全角')), '「-」の後の全角の空白はエラー');
ok(errs('by: a\n- 2026-02-01\n  - a hours: 1 trl: 2').some((m) => m.includes('同じ行に書けません')), 'タスクと機能の属性の混在はエラー');
ok(errs('by: a\n- 2026-02-01\n  - a test: ok').some((m) => m.includes('mop:')), 'test: だけはエラー');
ok(errs('by: a\n- 2026-02-01\n  - a mop: x').some((m) => m.includes('test:')), 'mop: だけはエラー');
ok(errs('by: a\n- 2026-02-01\n  - a help: 先生').some((m) => m.includes('help: は使えません') && m.includes('ask:')), 'help: はエラーで、ask: を使うよう示す');
ok(errs('by: a\nteam: 班').some((m) => m.includes('「team:」は設定の行ではありません')), 'team: は設定の行ではない');
ok(!('S10' in L.SIG_NAME) && L.analyze('by: a\n- 2026-02-01\n  - a note: x', [], {}).team === undefined, 'チームの記録のための処理(S10・team)はない');
ok(errs('by: a\n- 2026-02-01\n  - a hours: 1.234').length === 1 && errs('by: a\n- 2026-02-01\n  - a hours: 25').length === 1 && errs('by: a\n- 2026-02-01\n  - a hours: 0').length === 1, 'hours: は 0 より大きく 24 以下、小数 2 桁まで');
ok(errs('by: a\n- 2026-02-01\n  - a progress: 101').length === 1 && errs('by: a\n- 2026-02-01\n  - a progress: 50%').length === 1, 'progress: は 0〜100 の整数');
ok(errs('by: a\n- 2026-02-01\n  - a status: wip').length === 1, 'status: の値の誤りはエラー');
ok(errs('by: a\n- 2026-02-01\n  - a hours: 1 hours: 2').some((m) => m.includes('2 回')), '同じ属性を 2 回はエラー');
ok(errs('by: a\n- 2026-02-01\n  - a,b hours: 1').length === 1, '名前の「,」はエラー');
ok(errs('by: a\n- 2026-02-01\n  - **a** hours: 1').length === 1, '太字はエラー');
// ** と __ は、名前と名前を書く値ではエラー、自由に書く文の値(note:・issue: など)では書ける(仕様書 3.10 節)
ok(errs('by: a\n- 2026-02-01\n  - t hours: 1 note: __init__.py を直す\n  - t issue: 2**10 が溢れる\n  - t solved: __main__ を直した\n  - f tpm: 2**3 ms').length === 0, '自由に書く文の値の ** と __ はエラーにしない');
ok(errs('by: a\n- 2026-02-01\n  - t review: __b__').length === 1, '名前を書く値の __ はエラー');
ok(errs('by: a\n- 2026-02-01\n  - a issue:').some((m) => m.includes('値がありません')), '空の値はエラー');
ok(errs('by: a\n- 2026-02-01\n  - a note: https://example.jp/x // 注').length === 0, '空白の後の // だけが注(URL は書ける)');
{
  const p = L.parse('by: a\n- 2026-02-01\n    - x hours: 1\n  - y hours: 2\n        - z hours: 3');
  ok(p.ok && p.recs.length === 3 && p.recs.every((r) => r.day === p.days[0]), '記録の行は字下げの深さによらず直前の日付の行の記録');
}
{
  const w = L.parse('by: a\n- 2026-02-03\n- 2026-02-01\n- 2026-02-03\n- 2026-03-01', { today: D('2026-02-10') }).diags.filter((d) => d.level === 'warn').map((d) => d.message);
  ok(w.some((m) => m.includes('より前の日付')) && w.some((m) => m.includes('同じ日付')) && w.some((m) => m.includes('今日')), '日付の逆順・同じ日付・今日より後は警告');
}
{
  const w = L.parse('by: a\n- 2026-02-01\n  - x hours: 20\n  - y hours: 5\n  - z status: done progress: 50\n  - w progress: 100 status: doing\n  - v').diags.map((d) => d.message);
  ok(w.some((m) => m.includes('24 時間')) && w.some((m) => m.includes('status: done なのに')) && w.some((m) => m.includes('progress: 100 なのに')) && w.some((m) => m.includes('属性のない')), '時間の合計・状態と進捗率の食い違い・属性のない行は警告');
}

// ---- version:
ok(L.setVersion('by: a', '2026-01-02') === 'version: 2026-01-02\nby: a', 'version: がなければ 1 行目に足す');
ok(L.setVersion('version: 2026-01-01\nby: a', '2026-01-02') === 'version: 2026-01-02\nby: a', 'version: の日付を替える');
ok(L.stripVersion('version: 2026-01-01\nby: a') === L.stripVersion('version: 2026-09-09\nby: a'), 'version: の日付だけを除いて比べる');
ok(L.byName('by: 青木\n') === '青木', '保存の名前の候補は by: の名前');

// ---- 3.7 節 記録先・5.4 節 照合する版
{
  const a = L.analyze(sample, [plan], { today: D('2026-05-06') });
  ok(a.ok && warns(a).length === 0, '例は計画と照合して警告が出ない');
  ok(a.recs[0].key === 'WBS:設計フェーズ::基本設計::カレンダデザイン', '記録先は対応名');
  ok(a.recs.find((r) => r.name === '登録確認メール').key === 'FBS:通知::登録確認メール', '機能の属性は FBS を探す');
}
{
  const t = 'by: 青木\n- 2026-04-24\n  - 通知 note: x\n  - 実装フェーズ::画面実装::カレンダー画面の実装 hours: 1\n  - 画面実装::カレンダー画面の実装 hours: 1\n  - 存在しない hours: 1\n  - 登録確認メール test: ok mop: 違う文\n  - 実装フェーズ status: done\n  - カレンダデザイン review: 誰か';
  const a = L.analyze(t, [plan]);
  const w = warns(a);
  ok(a.recs[0].key === 'FBS:通知', '中立の属性だけなら WBS になければ FBS を探す');
  ok(a.recs[1].key === a.recs[2].key, '修飾名は祖先の並びの末尾と一致すればよい');
  ok(a.recs[3].planned === false && w.some((m) => m.includes('「存在しない」が計画')), '計画にない名前は警告');
  ok(w.some((m) => m.includes('MOP の文が')), 'MOP の文の不一致は警告');
  ok(w.some((m) => m.includes('タスク(WBS の末端)ではない')) && a.recs[5].val.status === undefined, '途中の要素の status: は警告して無視');
  ok(w.some((m) => m.includes('「誰か」が計画')), 'review: の相手が members: にいなければ警告');
}
{
  // 曖昧な名前: 同じ名前の子が 2 つある計画
  const pl = L.loadPlan('x.plan', 'version: 2026-01-01\nstart: 2026-01-01\nmembers:\n- a\nWBS: r\n- A\n  - t days: 1 by: a\n- B\n  - t days: 1 by: a');
  const a = L.analyze('by: a\n- 2026-01-02\n  - t hours: 1\n  - B::t hours: 1', [pl]);
  ok(warns(a).some((m) => m.includes('2 つあり')) && a.recs[0].planned === false && a.recs[1].key === 'WBS:B::t', '曖昧な名前は警告し、修飾名で決まる');
}
{
  // 名前が変わったとき: 古い記録は古い版、新しい記録は新しい版で照合する
  const v1 = L.loadPlan('v1.plan', 'version: 2026-01-01\nstart: 2026-01-01\nmembers:\n- a\nWBS: r\n- 旧名 days: 1 by: a');
  const v2 = L.loadPlan('v2.plan', 'version: 2026-01-10\nstart: 2026-01-01\nmembers:\n- a\nWBS: r\n- 新名 days: 1 by: a');
  const list = L.addEntries([], [v2, v1]).list;
  ok(list[0] === v1, '計画の一覧は版の日付の順');
  const a = L.analyze('by: a\n- 2025-12-30\n  - 旧名 hours: 1\n- 2026-01-05\n  - 旧名 hours: 1\n- 2026-01-10\n  - 新名 hours: 1', list);
  ok(warns(a).length === 0 && a.recs[0].ver === v1 && a.recs[1].ver === v1 && a.recs[2].ver === v2, '記録の日付で照合する版を選ぶ(その日付以前の版がなければ最初の版)');
  ok(a.latest === v2 && a.recs[0].key !== a.recs[2].key, '名前が変わった記録先は別の記録先');
  const nov = L.loadPlan('n.plan', 'start: 2026-01-01\nmembers:\n- a\nWBS: r\n- x days: 1 by: a');
  const a2 = L.analyze('by: a\n- 2026-01-05\n  - x hours: 1', [nov]);
  ok(warns(a2).some((m) => m.includes('照合に使える版')) && a2.recs[0].planned === null, 'version: のない版は照合に使わない');
  const same = L.addEntries(list, [L.loadPlan('copy.plan', v1.text)]);
  ok(same.skipped.length === 1 && same.list.length === 2, '同じテキストの版は足さない');
  const dup = L.loadPlan('v1b.plan', `${v1.text}\n// 注`);
  const l3 = L.addEntries(list, [dup]).list;
  const lab = L.labels(l3);
  ok(lab.get(l3[1]) === '2026-01-01 版 (2)' && L.moveEntry(l3, 1, -1) && !L.moveEntry(l3, 1, 1), '同じ日付の版の名前と、同じ日付の中だけの並べ替え');
  ok(L.fromPlans(JSON.stringify({ format: 'projalysis-plans', files: [{ name: 'a.plan', text: 'x' }] })).ok && !L.fromPlans('{"format":"x","files":[]}').ok, 'plans の読み込み');
}

// ---- 4 章・6 章 兆候(基準日を固定して)
const pl2 = L.loadPlan('p.plan', 'version: 2026-01-01\nstart: 2026-01-01\nmembers:\n- a\n- b\nWBS: r\n- t1 days: 2 by: a\n- t2 days: 1 by: a review: b after: t1\n- t3 days: 5 by: b');
const sig = (text, today, th) => { const a = L.analyze(text, [pl2], { today }); return L.signals([{ who: a.who, recs: a.recs }], { L: a.latest, today, th, ws: 1, me: a.who }); };
const codes = (s) => s.map((x) => x.code).join(',');
{
  const t = 'by: a\n- 2026-01-01\n  - t1 hours: 3 status: doing progress: 30\n- 2026-01-02\n  - t1 hours: 3 progress: 30 issue: 詰まった\n- 2026-01-03\n  - t1 hours: 3 progress: 30';
  const s = sig(t, D('2026-01-20'));
  ok(['S1', 'S2', 'S4', 'S5', 'S8'].every((c) => codes(s).includes(c)), `途絶え・未解決・日数超過・予定超過・進捗停止が出る(${codes(s)})`);
  ok(!sig(t, D('2026-01-08')).some((x) => x.code === 'S1') && sig(t, D('2026-01-10')).some((x) => x.code === 'S1'), 'S1 は最後の記録から 7 日で出る');
  ok(!sig(t, D('2026-01-08')).some((x) => x.code === 'S2') && sig(t, D('2026-01-09')).some((x) => x.code === 'S2'), 'S2 は問題の日から 7 日で出る');
  ok(!sig(`${t}\n- 2026-01-04\n  - t1 solved: 直した`, D('2026-01-20')).some((x) => x.code === 'S2'), 'S2 は solved: で閉じる');
  ok(sig(t, D('2026-01-20'), { S8: 30 }).every((x) => x.code !== 'S8'), '規則の値を変えられる');
}
{
  const t = 'by: a\n- 2026-01-01\n  - t1 status: blocked\n- 2026-01-02\n  - t1 status: doing\n- 2026-01-03\n  - t1 status: done\n- 2026-01-04\n  - t1 status: doing\n  - 打ち合わせ hours: 3\n  - t1 hours: 1';
  const s = sig(t, D('2026-01-05'));
  ok(codes(s).includes('S6') && codes(s).includes('S7') && !codes(s).includes('S2'), `手戻り・計画外が出て、別の状態で閉じた blocked は出ない(${codes(s)})`);
  ok(!sig('by: a\n- 2026-01-04\n  - 打ち合わせ hours: 1\n  - t1 hours: 1.01', D('2026-01-05')).some((x) => x.code === 'S7') && sig('by: a\n- 2026-01-04\n  - 打ち合わせ hours: 1\n  - t1 hours: 1', D('2026-01-05')).some((x) => x.code === 'S7'), 'S7 は 50 % 以上で出て、未満なら出ない');
}
{
  ok(sig('by: a\n- 2026-01-03\n  - t2 status: done', D('2026-01-04')).some((x) => x.code === 'S9'), 'S9 確認の依頼なしに完了');
  ok(!sig('by: a\n- 2026-01-03\n  - t2 review: b\n  - t2 status: done', D('2026-01-04')).some((x) => x.code === 'S9'), 'S9 同じ日の前の行の依頼なら出ない');
  ok(!sig('by: a\n- 2026-01-01\n  - t1 hours: 1', D('2026-01-03')).some((x) => x.code === 'S5' && x.label === 't3'), 'マイログでは自分の担当のタスクだけを見る');
}
{
  const s = sig('by: a\n- 2026-01-01\n  - t1 issue: x', D('2026-01-20'));
  const key = (xs) => JSON.stringify(xs.map((x) => [x.code, x.who, x.label, x.text, x.date]));
  ok(key(sig('by: a\n- 2026-01-01\n  - t1 issue: x', D('2026-01-20'), {})) === key(s), '兆候は決定的(番号・人・記録先・内容・日付まで同じ)');
  const nop = L.analyze('by: a\n- 2026-01-01\n  - t1 issue: x', [], {});
  ok(L.signals([{ who: nop.who, recs: nop.recs }], { L: null, today: D('2026-01-20'), ws: 1, me: 'a' }).every((x) => !L.NEED_PLAN.includes(x.code)), '計画がなければ計画の要る兆候は判定しない');
}
// 依頼の突き合わせ(プロジェクト分析で使う)
{
  const A = L.analyze('by: a\n- 2026-01-01\n  - t1 review: b\n  - t1 ask: b', [pl2]), B = L.analyze('by: b\n- 2026-01-01\n  - t1 reviewed: ok', [pl2]);
  const q = L.requests([{ who: 'a', recs: A.recs }, { who: 'b', recs: B.recs }], null, true);
  ok(q.length === 2 && q.find((x) => x.kind === 'review').reply && !q.find((x) => x.kind === 'ask').reply, '同じ日の返事は対応、種類が違えば対応しない');
}

// ---- 描画: 同じテキストと計画の一覧から同じ SVG(基準日を固定して)
{
  const a1 = L.analyze(sample, [plan], { today: D('2026-05-06') }), a2 = L.analyze(sample, [plan], { today: D('2026-05-06') });
  for (const v of L.VIEWS) ok(L.render(a1, v.id, { today: D('2026-05-06') }).svg === L.render(a2, v.id, { today: D('2026-05-06') }).svg, `ビュー ${v.id} は決定的`);
  const p = L.pieces(a1, 'hours', { today: D('2026-05-06') });
  ok(p.tables.length === 1 && p.figs.length === 2 && p.figs[1].id === 'calendar' && !/data-/.test(p.tables[0].svg), '表と図を 1 つずつ取り出せ、画面の印は入らない(作業時間の図は週ごとの合計時間と記録のカレンダー)');
  ok(L.tsv(p.tables[0]).split('\n')[0] === '記録先\t04-22〜\t04-29〜\t合計時間', 'コピーの 1 行目は見出し');
  ok(L.printMy(a1, { today: D('2026-05-06') }).length >= 4, '印刷のページ');
  const long = `by: 青木\n${Array.from({ length: 80 }, (_, i) => `- ${L.fmtDate(D('2026-04-23') + i)}\n  - カレンダデザイン hours: 1 issue: 問題 ${i}`).join('\n')}`;
  const al = L.analyze(long, [plan], { today: D('2026-08-01') });
  ok(L.printPages([{ t: 'h2', label: '要確認' }, ...[]]).length === 1 && L.printMy(al, { today: D('2026-08-01') }).length > 4, '長い表は行で区切ってページを分ける');
}

// ---- 11 章 画面からの編集
{
  const E = L.Edit, O = {};
  const t0 = 'by: a\n\n- 2026-01-01\n    - t1 hours: 1 status: doing // 注\n    - t2 hours: 2\n- 2026-01-03\n  - t1 hours: 1\n';
  const p0 = L.parse(t0);
  const r1 = p0.recs[0];
  let x = E.setAttrs(t0, O, r1.start, { status: 'done', progress: '100' });
  ok(!x.error && x.text.includes('    - t1 hours: 1 status: done progress: 100 // 注') && x.line === 4, `属性を書き換え・足し、字下げと注を残す(${x.error ?? ''})`);
  x = E.setAttrs(t0, O, r1.start, { hours: '' });
  ok(!x.error && x.text.includes('    - t1 status: doing // 注'), '空にした属性は消す');
  x = E.setAttrs(t0, O, r1.start, {}, 't9');
  ok(!x.error && x.text.includes('- t9 hours: 1') && x.text.includes('- t1 hours: 1\n'), '名前を変えても、ほかの記録の名前は変えない');
  ok(E.setAttrs(t0, O, r1.start, { status: 'wip' }).error?.includes('エラー'), 'エラーになる書き換えは拒む');
  ok(E.setAttrs(t0, O, r1.start, { trl: '2' }).error?.includes('エラー'), 'タスクと機能の属性の混在になる書き換えは拒む');
  ok(E.setAttrs(t0, O, r1.start, { note: 'x hours: 3' }).error !== undefined, '値に「空白 + 予約語 + :」を書くと拒む');
  ok(E.setAttrs(t0, O, r1.start, { note: 'a // b' }).error !== undefined, '値に「空白 + //」を書くと拒む');
  x = E.remove(t0, O, p0.recs[1].start);
  ok(!x.error && !x.text.includes('t2') && x.text.includes('- 2026-01-01\n'), '記録の行を消す');
  x = E.remove(t0, O, p0.recs[2].start);
  ok(!x.error && x.text.includes('- 2026-01-03\n') && !x.text.includes('  - t1 hours: 1\n\n'), '記録がなくなっても日付の行は残す');
  x = E.add(t0, O, D('2026-01-01'), 't3', { hours: '1.5', issue: '困った' });
  ok(!x.error && x.text.includes('    - t2 hours: 2\n    - t3 hours: 1.5 issue: 困った\n- 2026-01-03') && x.line === 6, `同じ日付の記録の最後に、同じ字下げで足す(${x.error ?? ''})`);
  x = E.add(t0, O, D('2026-01-02'), 't3', { hours: '1' });
  ok(!x.error && x.text.includes('  - t2 hours: 2\n- 2026-01-02\n  - t3 hours: 1\n- 2026-01-03') && L.parse(x.text).diags.length === 0, '日付の行がなければ、日付の並びが崩れない場所に足す');
  x = E.add(t0, O, D('2026-02-01'), 't3', { hours: '1' });
  ok(!x.error && x.text.endsWith('  - t1 hours: 1\n\n- 2026-02-01\n  - t3 hours: 1\n'), '後ろの日付はテキストの最後に足す');
  x = E.add('by: a', O, D('2026-02-01'), 't3', { hours: '1' });
  ok(!x.error && x.text === 'by: a\n\n- 2026-02-01\n  - t3 hours: 1\n', '日付の行がないテキストにも足せる');
  ok(E.add(t0, O, D('2026-01-01'), 't3', {}).error !== undefined && E.add(t0, O, D('2026-01-01'), '', { hours: '1' }).error !== undefined, '属性か名前がなければ足さない');
  // 画面の「今日の記録」「解決を記録」の書き方(writeToday・writeSolved。旧 Edit.upsert の置き換え)
  const a0 = L.analyze(t0, [], O);
  x = L.writeToday(t0, O, a0, D('2026-01-03'), 'X:t1', 't1', 'status', 'done');
  ok(!x.error && x.text.includes('  - t1 hours: 1 status: done\n') && L.parse(x.text).recs.length === 3, '今日の記録: 今日の同じ記録先の行があれば、その行に書く');
  x = L.writeToday(t0, O, a0, D('2026-01-03'), 'X:t2', 't2', 'hours', '2');
  ok(!x.error && x.text.includes('  - t1 hours: 1\n  - t2 hours: 2\n') && L.parse(x.text).recs.length === 4, '今日の記録: 今日の行がなければ足す');
  ok(L.writeToday(t0, O, a0, D('2026-01-03'), 'X:t2', 't2', 'hours', '').error !== undefined, '今日の記録: ない属性を空にすると、消すものがないと知らせる');
  x = L.writeSolved(t0, O, a0, D('2026-01-03'), 'X:t2', 't2', '直した');
  ok(!x.error && x.text.includes('  - t1 hours: 1\n  - t2 solved: 直した\n') && L.parse(x.text).recs.length === 4, '解決を記録: 今日の行がなければ足す');
  ok(E.setAttrs('by: a\n# x', O, 0, {}).error !== undefined, 'テキストにエラーがあれば編集しない');
}

// ---- 7 章 担当のタスク(概要・タスク・ガントチャート)
{
  const a = L.analyze(sample, [plan], {});
  const cnt = (today) => { const o = L.render(a, 'mytasks', { today: D(today) }).svg; return L.CATS.map((c) => (new RegExp(`${c.label}\\((\\d+) 件\\)`).exec(o) || [])[1]).join(','); };
  ok(cnt('2026-04-27') === '2,0,1,0,2,3', `区分: 2026-04-27(${cnt('2026-04-27')})`);
  ok(cnt('2026-04-29') === '1,1,1,1,1,3', `区分: 例の基準日 2026-04-29 では 6 つの区分がすべて埋まる(${cnt('2026-04-29')})`);
  ok(cnt('2026-05-06') === '0,4,1,0,0,3', `区分: 終了予定日を過ぎたものは状態によらず遅延、終わりの来ていない問題発生は問題発生(${cnt('2026-05-06')})`);
  // 例の日付をずらしても(読み込んだ日を今日とする)、同じ表が出て診断も出ない(仕様書 8 章)
  for (const today of ['2026-10-28', '2027-02-01']) {
    const dlt = D(today) - D(L.EXAMPLE_TODAY);
    const pl = L.loadPlan('sample.plan', L.shiftExample(plan.text, dlt));
    const plo = L.loadPlan('sample_old.plan', L.shiftExample(planOld.text, dlt));
    const ax = L.analyze(L.shiftExample(sample, dlt), L.sortList([plo, pl]), { today: D(today) });
    const o = L.render(ax, 'mytasks', { today: D(today) }).svg;
    const c = L.CATS.map((k) => (new RegExp(`${k.label}\\((\\d+) 件\\)`).exec(o) || [])[1]).join(',');
    const sm = L.render(ax, 'summary', { today: D(today) }).svg;
    const tx = { today: D(today) };
    const filled = (v, names) => { const an = L.render(ax, v, tx).anchors.map((x) => x.name || x.id); return names.every((k) => an.includes(k)); };
    ok(filled('summary', ['今週の予定', '計画の変更']) && filled('week', ['この週の作業時間', 'この週の報告', 'この週の問題と解決', 'この週の依頼と返事', 'この週のメモ', 'この週のテスト・TRL・TPM']) && filled('hours', ['calendar']) && filled('tests', ['担当するテスト項目']), `例を ${today} に読み込んでも、6 つの機能の表がすべて埋まる`);
    ok(pl.usable && ax.diags.length === 0 && c === '1,1,1,1,1,3' && ['未解決の問題', 'S4 日数の超過', 'S5 終了予定日の超過', '出した依頼', 'ng(', 'タスクの区分'].every((k) => sm.includes(k)), `例を ${today} に読み込んでも、すべての区分と表が埋まる(${c})`);
  }
  const order = L.CATS.map((c) => c.id).join(',');
  ok(order === 'doing,late,blocked,overstart,future,done', '表の並び: 実行中、対応が要る 3 つ、まだ先、完了');
  const sv = L.render(a, 'mytasks', { today: D('2026-05-06') }).svg;
  ok(sv.includes('記録なし') && /遅延<\/text>/.test(sv) && sv.includes('担当外の記録'), '記録のないタスク・遅延の列・担当外の記録');
  ok(/data-key="WBS:テストフェーズ::結合テスト::通知用APIとデータベースの接続テスト" data-name="通知用APIとデータベースの接続テスト"/.test(sv), '記録のないタスクの行は、一意に決まる名前を持つ');
  const sm = L.render(a, 'summary', { today: D('2026-05-06') }).svg;
  ok(sm.includes('タスクの区分') && !sm.includes('遅延のタスク') && /2\.2\.3\(8 日\)/.test(sm) && sm.includes('未解決の問題') && sm.includes('要確認(2026-05-06)') && sm.includes('S2 問題の長期化'), '概要は区分ごとの件数の 1 つの表(遅延は日数を添える)・未解決の問題・要確認');
  ok(L.render(a, 'gantt', { today: D('2026-05-06') }).svg.includes('<circle'), 'ガントチャートに記録した日の点');
  const np = L.analyze(sample, [], {});
  ok(L.render(np, 'summary', { today: D('2026-05-06') }).svg.includes('計画書を追加すると') && L.render(np, 'mytasks', { today: D('2026-05-06') }).svg.includes('記録先ごとのまとめ'), '計画がないときの表示');
  const b = L.analyze('by: b\n- 2026-01-03\n  - t2 reviewed: ok', [pl2], {});
  const bs = L.render(b, 'mytasks', { today: D('2026-01-05') }).svg;
  ok(bs.includes('確認するタスク(1 件)') && bs.includes('ok(2026-01-03)'), '確認するタスクと自分の確認の結果');
}

// ---- マイページの機能(今週の予定・計画の変更・記録した日数・記録のカレンダー・担当するテスト項目・週のまとめ)
{
  const T = D('2026-04-29'), tx = { today: T };
  const a = L.analyze(sample, L.sortList([planOld, plan]), tx);
  ok(planOld.usable && a.V.length === 2 && warns(a).length === 0, '例の前の版も照合に使え、警告が出ない');
  ok(planOld.text === 'version: 2026-04-15\n' + fs.readFileSync(path.join(__dirname, 'sample.plan'), 'utf8').replace(/^version: .*\n/, '').replace(' review: 青木', '').replace(/(カレンダー画面テスト|ユーザ登録APIとデータベースの接続テスト|予定入力画面と予定登録APIの接続テスト)( for: [^\n]*?) by: 青木/g, '$1$2 by: 上田'), '例の前の版は、例の計画から 3 つの担当と確認者を戻したもの');
  // 今週の予定(7.2 節): 週の始まりは week: wed。予定の期間が今週にかかる担当のタスク
  const my = (x) => L.render(x, 'mytasks', tx);
  const wp = L.weekPlan({ tasks: [{ s: D('2026-04-27'), e: D('2026-04-29') }, { s: D('2026-05-05'), e: D('2026-05-09') }, { s: D('2026-05-06'), e: D('2026-05-07') }, { s: D('2026-04-20'), e: D('2026-04-28') }] }, T, 3);
  ok(L.fmtDate(wp.w0) === '2026-04-29' && wp.list.length === 2 && L.fmtDate(wp.list[0].a) === '2026-04-29' && L.fmtDate(wp.list[1].b) === '2026-05-05', '今週の予定: 今週にかかる日だけを数え、週の外は入れない');
  const sm = L.render(a, 'summary', tx).svg;
  ok(sm.includes('今週の予定(04-29〜05-05)') && sm.includes('04-30〜05-01'), '概要に今週の予定');
  // 計画の変更(7.2 節)
  const pc = L.planChanges(a);
  ok(pc && pc.rows.map((r) => r.kind).join(',') === '作成者の追加,作成者の追加,作成者の追加,日程の変更,確認者の追加', `計画の変更: 例の 2 版(${pc && pc.rows.map((r) => r.kind).join(',')})`);
  ok(pc.rows[0].label === 'テストフェーズ::単体テスト::カレンダー画面テスト' && pc.rows[0].text === '作成者: 上田 → 青木' && pc.rows[3].text === '04-29〜04-30 → 05-02〜05-03' && pc.rows[4].text === '確認者: (なし) → 青木', '計画の変更の内容(担当が増えて日程がずれたタスクも出す)');
  ok(sm.includes('計画の変更(2026-04-15 版 → 2026-04-22 版)'), '概要に計画の変更(比べた 2 版の名前)');
  ok(L.planChanges(L.analyze(sample, [plan], tx)) === null && L.render(L.analyze(sample, [plan], tx), 'summary', tx).svg.includes('比べられません'), '版が 1 つなら計画の変更は比べられない');
  // 版の日付は開始日以前にする(実行前のタスクを版の日付より前に置かない規則と切り離して、担当・確認の変更だけを見る)
  const q1 = L.loadPlan('q1.plan', 'version: 2026-01-01\nstart: 2026-01-05\nmembers:\n- a\n- b\nWBS: r\n- t1 days: 2 by: a\n- t2 days: 1 by: a review: b\n- t3 days: 1 by: b review: a');
  const q2 = L.loadPlan('q2.plan', 'version: 2026-01-04\nstart: 2026-01-05\nmembers:\n- a\n- b\nWBS: r\n- t1 days: 2 by: a\n- t3 days: 1 by: b\n- t4 days: 1 by: a, b');
  const qa = L.analyze('by: a\n- 2026-01-09\n  - t1 hours: 1', L.sortList([q1, q2]), {});
  ok(L.planChanges(qa).rows.map((r) => `${r.kind}:${r.label}:${r.text}`).join('|') === '作成者の追加:t4:計画に追加(01-07、1 日)|作成者の削除:t2:計画から削除|確認者の削除:t3:確認者: a → (なし)', '計画の変更: 追加・削除・確認者から外れた(変わらないタスクは出さない)');
  const qb = L.analyze('by: b\n- 2026-01-09\n  - t3 hours: 1', L.sortList([q1, q2]), {});
  ok(L.planChanges(qb).rows.map((r) => r.kind).join(',') === '作成者の追加,確認者の削除', '計画の変更: 別の人から見た同じ 2 版');
  // 記録した日数(7.3 節): 時間を書いた日の数
  const mv = my(a).svg;
  ok(mv.includes('作業日数') && /data-name="通知用APIの実装"[\s\S]*?>4<\/text>/.test(mv), '作業日数: 通知用APIの実装は 4 日(時間を書いた日。時間のない記録の日は数えない)');
  // 記録のカレンダー(7.5 節)
  const recs = L.allRecs([{ who: a.who, recs: a.recs }]);
  const cal = L.calendar(recs, T, 3);
  ok(!cal.error && cal.h === 20 + 2 * 38 + 2 && />5<\/text>/.test(cal.frag) && cal.frag.includes('stroke-width="2"'), '記録のカレンダー: 2 週・04-28 は 4 + 1 = 5 時間・基準日に枠');
  ok(L.calendar(L.allRecs([{ who: 'x', recs: L.analyze('by: x\n- 2026-01-01\n  - a note: n', [], {}).recs }]), D('2026-01-01'), 1).frag.includes('>記録</text>'), '記録のカレンダー: 時間のない記録の日は「記録」');
  ok(/長すぎる/.test(L.calendar(L.allRecs([{ who: 'x', recs: L.analyze('by: x\n- 2020-01-01\n  - a hours: 1', [], {}).recs }]), D('2026-01-01'), 1).error), '記録のカレンダー: 156 週を超えたら描かない');
  // 担当するテスト項目(7.6 節)
  const ts = L.render(a, 'tests', tx);
  const tt = L.pieces(a, 'tests', tx).tables.find((x) => x.name === '担当するテスト項目');
  const rows = tt ? L.tsv(tt).split('\n').filter((r) => r) : [];
  ok(rows.length === 8 && rows.some((r) => r.startsWith('通知::登録確認メール\t予定の登録から 1 分以内にメールが届く\t\tok(2026-04-29)')) && rows.some((r) => r.startsWith('予定管理::日時の設定\t開始と終了の日時を 1 分単位で登録できる\t✓\t未実施')), `担当するテスト項目: 7 つの MOP・計画の確認済み・最後のテスト(${rows.length})`);
  ok(ts.anchors[0].name === '担当するテスト項目', '担当するテスト項目はテストのビューの先頭');
  // 週のまとめ(7.7 節)
  const wo = L.weekOptions(a, T);
  ok(wo.map(L.fmtDate).join(',') === '2026-04-29,2026-04-22', '週のまとめ: 選べる週は新しい順');
  ok(L.weekOptions(a, D('2026-05-20')).length === 5, '週のまとめ: 今週まで選べる(記録のない週も)');
  const w1 = L.render(a, 'week', tx).svg, w0 = L.render(a, 'week', { today: T, week: D('2026-04-22') }).svg;
  ok(w1.includes('週のまとめ(2026-04-29〜2026-05-05)') && w1.includes('合計時間 4 時間') && w1.includes('週の始まりは月曜に合わせた'), '週のまとめ: 既定は今週');
  ok(w0.includes('週のまとめ(2026-04-22〜2026-04-28)') && w0.includes('記録日数 6 日、合計時間 24 時間') && w0.includes('予定登録APIの仕様が決まらず') && w0.includes('井上'), '週のまとめ: 前の週を選ぶ');
  ok(L.render(L.analyze('by: x\n- 2026-01-01\n  - a note: n', [], {}), 'week', { today: D('2026-03-01') }).svg.split('>なし<').length - 1 === 6, '週のまとめ: 記録のない週は「なし」(6 つの表)');
  // 印刷にも週のまとめ(今週)が入る
  ok(L.printMy(a, tx).length > 0, '印刷はすべてのビュー');
}

// ---- AI で記録(11.6 節)
{
  const T = D('2026-04-29');
  const a = L.analyze(sample, L.sortList([planOld, plan]), { today: T });
  const p = L.aiPrompt(a, { today: T });
  ok(!/青木|井上|上田/.test(p.text) && JSON.stringify(p.map) === '[["メンバーA","井上"]]', `AI で記録: 例のプロンプトに人の名前が入らない(${JSON.stringify(p.map)})`);
  ok(p.text.includes('ask: メンバーA') && p.text.includes('作成者 メンバーA') && p.text.includes('- 本人: 本人'), 'AI で記録: 依頼の相手・作成者は伏せた名前、自分は「本人」');
  ok(['## 進め方', '## 書き方', '### 担当のタスク(完了以外)', '### 確認するタスク', '### 担当するテスト項目', '### 未解決の問題', '### 書ける名前', '### 最近の記録', '### 今日すでに書いた記録'].every((k) => p.text.includes(k)), 'AI で記録: 手順・書き方・状況の節がそろう');
  ok(p.text.includes('この内容で正しいですか') && p.text.includes('推測で埋めない'), 'AI で記録: 本人に確かめさせ、推測で埋めない指示');
  ok(p.text.includes('日付の行は出さず') && !p.text.includes('カレンダデザイン(予定'), 'AI で記録: 今日の日付の行があれば記録の行だけを出させる。完了したタスクは状況に入れない');
  ok((p.text.match(/^- 2026-04-2[678]$/gm) || []).length === 3 && !p.text.includes('- 2026-04-25\n'), 'AI で記録: 記録のある最後の 3 日(今日を除く)');
  const p2 = L.aiPrompt(L.analyze(sample, L.sortList([planOld, plan]), { today: D('2026-04-30') }), { today: D('2026-04-30') });
  ok(p2.text.includes('1 行目に日付の行「- 2026-04-30」') && !p2.text.includes('今日すでに書いた記録') && p2.text.includes('- 2026-04-29\n'), 'AI で記録: 今日の記録がなければ日付の行から出させる');
  ok(L.aiPrompt(L.analyze(sample, [], {}), { today: T }).text.includes('計画が読み込まれていない'), 'AI で記録: 計画がなくても作れる');
  ok(L.aiPrompt(a, { today: T }).text === p.text, 'AI で記録: 同じ入力から同じプロンプト');
  const m = L.maskNames('上田太郎と上田、次に井上。自分は青木。上田太郎', '青木', ['上田', '上田太郎', '井上', '山本']);
  ok(m.text === 'メンバーAとメンバーB、次にメンバーC。自分は本人。メンバーA' && m.map.length === 3, `名前を伏せる: 長い名前を先に置き換え、番号は最初に出た順。出ない名前は対応に入れない(${m.text})`);
  ok(L.memberLabel(0) === 'メンバーA' && L.memberLabel(25) === 'メンバーZ' && L.memberLabel(26) === 'メンバーAA', 'メンバーの記号は A〜Z の後 AA');
  const o = L.aiPrompt(L.analyze('by: x\n- 2026-01-01\n  - t1 hours: 1 ask: zz note: 山田さんに聞いた', [], {}), { today: D('2026-01-02') });
  ok(o.text.includes('ask: メンバーA') && o.text.includes('山田さん'), '名前を伏せる: 記録の相手の名前は伏せる。members: にも相手にもない名前は伏せられない(限界)');
}

// ---- レビューで見つかった誤りの検査(版 0.13)
{
  const pq = L.loadPlan('q.plan', 'version: 2026-04-01\nstart: 2026-04-01\nmembers:\n- 青木\n- 井上\nWBS: r\n- 親\n  - 子 days: 2 by: 青木 review: 井上');
  const an = (t, d) => L.analyze(t, [pq], { today: D(d) });
  const sig = (a, d) => L.signals([{ who: a.who, recs: a.recs }], { L: a.latest, today: D(d), me: a.who }).map((x) => x.code);
  // 解決を記録: issue: や blocked のある今日の行には足さず、新しい行にして閉じる(11.5 節)
  for (const [t0, what] of [['  - 子 hours: 1 issue: 動かない', 'issue'], ['  - 子 status: blocked', 'blocked']]) {
    const t = `by: 青木\n- 2026-04-03\n${t0}\n`;
    const e = L.writeSolved(t, { today: D('2026-04-03') }, an(t, '2026-04-03'), D('2026-04-03'), 'WBS:親::子', '子', '直した');
    const a = an(e.text, '2026-04-12');
    ok(e.text === `${t}  - 子 solved: 直した\n` && !L.render(a, 'summary', { today: D('2026-04-12') }).svg.includes('問題発生(status: blocked)') && !L.render(a, 'summary', { today: D('2026-04-12') }).svg.includes('動かない') && !sig(a, '2026-04-12').includes('S2'), `解決を記録: ${what} の行には足さず新しい行にし、問題が閉じる`);
  }
  { const t = 'by: 青木\n- 2026-04-03\n  - 子 hours: 1\n'; ok(L.writeSolved(t, {}, an(t, '2026-04-03'), D('2026-04-03'), 'WBS:親::子', '子', 'x').text === 'by: 青木\n- 2026-04-03\n  - 子 hours: 1 solved: x\n', '解決を記録: 問題のない行には今までどおり足す'); }
  // 別の行の blocked は、同じ記録先に未解決の issue: があっても消えない。同じ行の 2 つは 1 件
  const b = an('by: 青木\n- 2026-04-01\n  - 子 status: blocked\n- 2026-04-08\n  - 子 issue: 別の問題\n', '2026-04-10');
  const bs = L.render(b, 'summary', { today: D('2026-04-10') }).svg;
  ok(sig(b, '2026-04-10').includes('S2') && bs.includes('問題発生(status: blocked)') && bs.includes('別の問題'), '別の行の blocked は issue: に隠れない(表と S2)');
  const b2 = an('by: 青木\n- 2026-04-01\n  - 子 status: blocked issue: 動かない\n', '2026-04-10');
  ok(!L.render(b2, 'summary', { today: D('2026-04-10') }).svg.includes('問題発生(status: blocked)') && sig(b2, '2026-04-10').filter((x) => x === 'S2').length === 1, '同じ行の blocked と issue: は 1 件');
  // S9: 同じ日なら行の順によらず、確認の依頼があれば出さない
  ok(!sig(an('by: 青木\n- 2026-04-02\n  - 子 status: done progress: 100\n  - 子 review: 井上\n', '2026-04-03'), '2026-04-03').includes('S9') && sig(an('by: 青木\n- 2026-04-02\n  - 子 status: done progress: 100\n- 2026-04-03\n  - 子 review: 井上\n', '2026-04-03'), '2026-04-03').includes('S9'), 'S9: 同じ日の review: は後ろの行でも数え、後の日の review: は数えない');
  // U+2028・U+2029 のある行で止まらない
  for (const ch of [' ', ' ']) {
    let thrown = null; try { L.parse(`by: 青木\n- 2026-04-01\n  - 子 note: a${ch}b\n`); L.parse(`by: 青${ch}木\n`); } catch (e) { thrown = e; }
    ok(!thrown, `U+${ch.charCodeAt(0).toString(16).toUpperCase()} のある行でも解析が止まらない`);
  }
  // AI で記録: 書ける名前はいちばん短い修飾名、最近の記録は日付の順、決まった文は伏せない
  const pp = L.loadPlan('pp.plan', 'version: 2026-04-01\nstart: 2026-04-01\nmembers:\n- 青木\n- テスト\nWBS: P\n- 親\n  - 子 days: 2 by: 青木 review: テスト');
  const ap = L.aiPrompt(L.analyze('by: 青木\n- 2026-04-05\n  - 親::子 hours: 1 status: doing\n- 2026-04-01\n  - 親::子 hours: 1\n- 2026-04-05\n  - 親::子 note: 二つ目\n- 2026-04-02\n  - 親::子 hours: 1\n- 2026-04-04\n  - 親::子 hours: 1\n', [pp], {}), { today: D('2026-04-06') });
  ok(ap.text.includes('- タスク: 子') && ap.text.includes('- 子(予定'), 'AI で記録: 書ける名前・担当のタスクはいちばん短い修飾名');
  const rec = ap.text.slice(ap.text.indexOf('### 最近の記録'));
  ok((rec.match(/^- 2026-04-0\d$/gm) || []).join(',') === '- 2026-04-02,- 2026-04-04,- 2026-04-05,- 2026-04-05' && rec.includes('二つ目') && !rec.includes('- 2026-04-01'), 'AI で記録: 最近の記録は日付の順で最後の 3 日(同じ日付の行は両方)');
  ok(ap.text.includes('テストをしたか') && ap.text.includes('### 担当するテスト項目') && !ap.text.includes('メンバーA項目') && JSON.stringify(ap.map) === '[]', 'AI で記録: 名前と同じ言葉(テスト)でも、決まった指示の文は置き換えない');
  const m2 = L.maskNames('井上太郎さんと青木', '青木', ['井上', '井上太郎']);
  ok(m2.text === 'メンバーAさんと本人' && JSON.stringify(m2.map) === '[["メンバーA","井上太郎"]]', '名前を伏せる: 長い名前の中にしか出ない短い名前は、対応に入れない');
  // ガントチャート: 番号は省略しない
  const g = L.render(L.analyze(sample, L.sortList([planOld, plan]), {}), 'gantt', { today: D('2026-04-29') }).svg;
  ok(/>2\.1\.1 …/.test(g) && /<title>2\.1\.1 実装フェーズ::画面実装::カレンダー画面の実装<\/title>/.test(g), 'ガントチャート: 名前を省いても番号は残し、全文を title に出す');
  // 折り返し: 英数字のつながりの途中で切らない
  ok(L.layout([{ t: 'p', text: `${'あ'.repeat(60)} 2026-10-28、えんじ` }]).svg.includes(' 2026-10-28、えんじ<'), '折り返し: 日付の途中で改行しない');
}

// ---- 始めた日・確認待ち・この週のメモ(版 0.15)
{
  const pq = L.loadPlan('q.plan', 'version: 2026-04-01\nstart: 2026-04-06\nmembers:\n- 青木\n- 井上\nWBS: r\n- 子 days: 3 by: 青木');
  const my = (t, d) => L.pieces(L.analyze(t, [pq], {}), 'mytasks', { today: D(d) }).tables.map((x) => L.tsv(x)).join('\n');
  // 始めた日: メモだけの記録は数えず、hours: か実行中などの報告の早い方
  const t1 = my('by: 青木\n- 2026-04-02\n  - 子 note: 下調べ\n- 2026-04-03\n  - 子 hours: 1\n- 2026-04-04\n  - 子 status: doing\n', '2026-04-05');
  ok(/\t04-06〜04-08\t04-03\t/.test(t1), '始めた日: メモだけの日は数えず、最初に hours: を書いた日(前倒しが見える)');
  const t2 = my('by: 青木\n- 2026-04-07\n  - 子 status: doing\n- 2026-04-08\n  - 子 hours: 1\n', '2026-04-08');
  ok(/\t04-06〜04-08\t04-07\t/.test(t2), '始めた日: 実行中の報告の方が早ければ、その日');
  ok(/\t04-06〜04-08\t―\t/.test(my('by: 青木\n- 2026-04-02\n  - 子 note: 下調べ\n', '2026-04-05')), '始めた日: まだ始めていなければ「―」');
  // 確認待ち: 最後の review: が最後の状態の報告と同じか後で、完了していない
  ok(my('by: 青木\n- 2026-04-07\n  - 子 status: doing review: 井上\n', '2026-04-07').includes('実行中(確認待ち)'), '確認待ち: 同じ行の review:');
  ok(my('by: 青木\n- 2026-04-07\n  - 子 status: doing\n  - 子 review: 井上\n', '2026-04-07').includes('実行中(確認待ち)'), '確認待ち: 状態の報告より後の review:');
  ok(!my('by: 青木\n- 2026-04-07\n  - 子 review: 井上\n- 2026-04-08\n  - 子 status: doing note: 差し戻しを直す\n', '2026-04-08').includes('確認待ち'), '確認待ち: 依頼の後に状態を報告したら終わる');
  ok(!my('by: 青木\n- 2026-04-07\n  - 子 review: 井上\n  - 子 status: done progress: 100\n', '2026-04-08').includes('確認待ち'), '確認待ち: 完了と報告したら終わる');
  // この週のメモ: 日付の行の note: も入れ、テキストの順に並べる
  const w = L.pieces(L.analyze('by: 青木\nweek: mon\n- 2026-04-06 note: 講義の日\n  - 子 hours: 1 note: 資料を読んだ\n- 2026-04-13\n  - 子 note: 次の週\n', [pq], {}), 'week', { today: D('2026-04-08') }).tables.find((x) => x.name === 'この週のメモ');
  ok(w && L.tsv(w).split('\n').filter((x) => x).join('|') === '日付\t記録先\tメモ|2026-04-06\t(日付の行)\t講義の日|2026-04-06\t子\t資料を読んだ', 'この週のメモ: 日付の行のメモも入れ、ほかの週のメモは入れない');
  // 例では、確認待ちのタスクと、この週のメモが出る
  const ax = L.analyze(sample, L.sortList([planOld, plan]), {});
  ok(L.render(ax, 'mytasks', { today: D('2026-04-29') }).svg.includes('実行中(確認待ち)') && L.pieces(ax, 'week', { today: D('2026-04-29'), week: D('2026-04-22') }).tables.some((x) => x.name === 'この週のメモ'), '例: 確認待ちのタスクと、この週のメモが出る');
}

// ---- 例の日付をずらしても、週の区切りが同じ(8 章)。ずらす日数が 7 の倍数でないときも、week: の曜日をずらして週の中身を保つ
{
  const T0 = D(L.EXAMPLE_TODAY);
  const strip = (t) => t.replace(/\d{4}-\d{2}-\d{2}|\d{2}-\d{2}|\d{1,2}\/\d{1,2}/g, '#');
  const weekTables = (txt, pls, td) => { const a = L.analyze(txt, pls, { today: td }); return ['week', 'hours'].map((v) => L.pieces(a, v, { today: td }).tables.map((t) => strip(L.tsv(t))).join('\n')).join('\n'); };
  const base = weekTables(sample, L.sortList([planOld, plan]), T0);
  for (const td of ['2026-10-28', '2026-10-30', '2027-02-01', '2027-03-07']) {
    const d = D(td) - T0;
    const got = weekTables(L.shiftExample(sample, d), L.sortList([L.loadPlan('o', L.shiftExample(planOld.text, d)), L.loadPlan('n', L.shiftExample(plan.text, d))]), D(td));
    ok(got === base, `例を ${td} に読み込んでも、週のまとめと週ごとの作業時間の中身が同じ(ずらす日数 ${d}、7 で割った余り ${d % 7})`);
  }
  ok(L.shiftExample('version: 2026-04-29\nby: a\nweek: wed\n', 1) === 'version: 2026-04-30\nby: a\nweek: thu\n' && L.shiftExample('by: a\nweek: sat\n', -7) === 'by: a\nweek: sat\n' && L.shiftExample('by: a\n', 3) === 'by: a\n', '例をずらすと week: の曜日も同じ日数だけずらす(7 の倍数なら同じ。week: がなければ書き足さない)');
}

// ---- 2 回目のレビューで見つかった誤りの検査(版 0.17)
{
  const v1 = L.loadPlan('v1.plan', 'version: 2026-01-01\nstart: 2026-01-01\nmembers:\n- a\n- b\nWBS: r\n- 子 days: 2 by: a\n- t1 days: 3 by: a review: b');
  const v2 = L.loadPlan('v2.plan', 'version: 2026-01-10\nstart: 2026-01-01\nmembers:\n- a\n- b\nWBS: r\n- 子 days: 2 by: a\n- 別\n  - 子 days: 1 by: b\n- t1 by: a review: b\n  - t1a days: 1');
  const V = L.sortList([v1, v2]);
  // M1: 書いたままの名前が、計画の変更で一意でなくなっても、同じ名前の solved: で閉じる。画面から書く名前は、今日の版で一意な名前
  const a1 = L.analyze('by: a\n- 2026-01-05\n  - 子 issue: 詰まった\n- 2026-01-12\n  - 子 solved: 直した\n', V, {});
  ok(L.openIssues(L.groupByKey(a1.recs)).length === 0, 'M1: 名前が一意でなくなった後でも、同じ名前の solved: で問題が閉じる');
  const k = a1.recs[0].key, nm = L.nameForWrite(a1.V, D('2026-01-12'), k, '子');
  const a2 = L.analyze(`by: a\n- 2026-01-05\n  - 子 issue: 詰まった\n- 2026-01-12\n  - ${nm} solved: 直した\n`, V, {});
  ok(nm !== '子' && a2.recs[1].key === k && a2.recs[1].planned !== false && L.openIssues(L.groupByKey(a2.recs)).length === 0, `M1: 画面から書く名前(${nm})は今日の版で同じ記録先になり、その solved: で閉じる`);
  ok(L.nameForWrite(a1.V, D('2026-01-12'), 'WBS:ない', 'x') === 'x' && L.nameForWrite([], D('2026-01-12'), k, 'y') === 'y', 'M1: 計画にない記録先や、計画がなければ、書いたままの名前');
  // T6: 同じ日の別の人の solved: は、一覧の順によらず閉じる。同じマイログでは、前の行の solved: では閉じない
  const r1 = L.analyze('by: a\n- 2026-01-05\n  - 子 issue: 詰まった\n', [v1], {}).recs.map((r) => ({ ...r, fi: 1 }));
  const r2 = L.analyze('by: b\n- 2026-01-05\n  - 子 solved: 手伝った\n', [v1], {}).recs.map((r) => ({ ...r, fi: 0 }));
  ok(L.openProblems([...r2, ...r1].sort(L.cmp)).length === 0 && L.openProblems([...r1.map((r) => ({ ...r, fi: 0 })), ...r2.map((r) => ({ ...r, fi: 1 }))].sort(L.cmp)).length === 0, 'T6: 同じ日の別の人の solved: は、一覧の順によらず閉じる');
  ok(L.openProblems(L.analyze('by: a\n- 2026-01-05\n  - 子 solved: 先\n  - 子 issue: 後\n', [v1], {}).recs).length === 1, 'T6: 同じマイログの前の行の solved: では閉じない');
  ok(L.openProblems(L.analyze('by: a\n- 2026-01-05\n  - 子 status: blocked\n- 2026-01-06\n  - 子 solved: 直した\n- 2026-01-07\n  - 子 status: blocked\n', [v1], {}).recs).map((x) => `${x.kind}:${L.fmtDate(x.r.date)}`).join() === 'blocked:2026-01-07', 'blocked: solved: の後に問題発生に戻ったら、その日から');
  // M4: 子を足して途中の要素になったタスクは「計画から削除」としない
  const pc = L.planChanges(L.analyze('by: a\n- 2026-01-12\n  - 子 hours: 1\n', V, {}));
  ok(!pc.rows.some((r) => r.text === '計画から削除' && r.label.endsWith('t1')) && pc.rows.some((r) => r.kind === '作成者の追加' && r.label.endsWith('t1a')), `M4: 途中の要素になったタスクは削除としない(${pc.rows.map((r) => `${r.kind}:${r.label}:${r.text}`).join('|')})`);
  // M5: help: は、日付の行や名前のない行でも ask: を示す
  ok(errs('by: a\n- 2026-02-01 help: 先生').some((m) => m.includes('ask:')) && errs('by: a\n- 2026-02-01\n  - help: 先生').some((m) => m.includes('ask:')), 'M5: 日付の行・名前のない行の help: でも ask: を使うよう示す');
  // M6: 日付の行だけの週も選べる
  ok(L.weekOptions(L.analyze('by: a\nweek: mon\n- 2026-01-05 note: 休み\n- 2026-01-19\n  - 子 hours: 1\n', [v1], {}), D('2026-01-19')).length === 3, 'M6: メモだけの日付の行の週も、週のまとめで選べる');
  // M2: 伏せるのは中身の値だけ。見出しや決まった語は、同じ行にあっても伏せない
  const pm = L.loadPlan('m.plan', 'version: 2026-01-01\nstart: 2026-01-01\nmembers:\n- a\n- 予定\nWBS: r\n- 子 days: 2 by: a review: 予定');
  const ap = L.aiPrompt(L.analyze('by: a\n- 2026-01-02\n  - 子 hours: 1 review: 予定\n', [pm], {}), { today: D('2026-01-03') });
  ok(ap.text.includes('- 子(予定 01-01〜') && ap.text.includes('review: メンバーA') && !ap.text.includes('review: 予定') && !ap.text.includes('メンバーA 01-01'), `M2: 決まった語「予定」は伏せず、記録の中の名前は伏せる`);
  // T3: S8・S9 の人は計画の担当者(報告したのが別の人でも)
  const sb = L.analyze('by: b\n- 2026-01-02\n  - t1 progress: 30\n- 2026-01-03\n  - t1 progress: 30\n  - 子 status: done progress: 100\n', [v1], {});
  const s3 = L.signals([{ who: 'b', recs: sb.recs }], { L: sb.latest, today: D('2026-01-20'), members: ['a', 'b'] });
  ok(s3.filter((x) => x.code === 'S8' || x.code === 'S9').every((x) => x.who === 'a') && s3.some((x) => x.code === 'S8'), `T3: S8・S9 の人は計画の担当者(${s3.filter((x) => ['S8', 'S9'].includes(x.code)).map((x) => `${x.code}:${x.who}`).join()})`);
  // T10: 「A → B」は依頼した人で、メンバーの順に並べる。相手のマイログにエラーがあるときは、その旨
  const qa = L.analyze('by: a\n- 2026-01-02\n  - 子 ask: b\n', [v1], {}), qb = L.analyze('by: b\n- 2026-01-02\n  - t1 ask: a\n', [v1], {});
  const ctx = { L: v1, today: D('2026-01-20'), members: ['a', 'b'] };
  ctx.requests = L.requests([{ who: 'b', recs: qb.recs }, { who: 'a', recs: qa.recs }], D('2026-01-20'));
  const s10 = L.signals([{ who: 'b', recs: qb.recs }, { who: 'a', recs: qa.recs }], { ...ctx, hasLog: ['a', 'b'], errLog: ['b'] }).filter((x) => x.code === 'S3');
  ok(s10.map((x) => x.who).join('|') === 'a → b|b → a' && s10[0].text.includes('エラーがあり'), `T10: S3 は依頼した人のメンバーの順。相手のマイログのエラーを知らせる(${s10.map((x) => x.who + x.text).join('|')})`);
}

// ---- 夜のバグ探しで見つかった誤りの検査(版 0.22)
{
  // M1: 前の版で途中の要素だったものが、最新の版でタスクになっても、計画の変更の比較・概要・印刷が例外を投げない
  const A = L.loadPlan('a.plan', 'version: 2026-01-01\nstart: 2026-01-05\nmembers:\n- a\n- b\nWBS: r\n- t by: a\n  - t1 days: 1\n  - t2 days: 1\n- u days: 1 by: b');
  const B = L.loadPlan('b.plan', 'version: 2026-01-08\nstart: 2026-01-05\nmembers:\n- a\n- b\nWBS: r\n- t days: 2 by: a\n- u days: 1 by: b');
  const a = L.analyze('by: a\n- 2026-01-09\n  - t hours: 1', L.sortList([A, B]), {});
  let thrown = '';
  try { L.planChanges(a); L.render(a, 'summary', { today: D('2026-01-09') }); L.printMy(a, { today: D('2026-01-09') }); } catch (e) { thrown = e.message; }
  ok(thrown === '', `途中の要素 → タスクの変更で、比較・概要・印刷が例外を投げない(${thrown})`);
  const B2 = L.loadPlan('b2.plan', A.text.replace('2026-01-01', '2026-01-08')), A2 = L.loadPlan('a2.plan', B.text.replace('2026-01-08', '2026-01-01'));
  thrown = '';
  try { L.planChanges(L.analyze('by: a\n- 2026-01-09\n  - t1 hours: 1', L.sortList([A2, B2]), {})); } catch (e) { thrown = e.message; }
  ok(thrown === '', `タスク → 途中の要素の変更でも例外を投げない(${thrown})`);
}
{
  // M2・M3: 同じ記録先に、別の人の同じ日の報告がある(プロジェクト分析で 2 つのマイログを読み込むとき)
  const v1 = L.loadPlan('v1.plan', 'version: 2026-01-01\nstart: 2026-01-01\nmembers:\n- a\n- b\nWBS: r\n- 子 days: 2 by: a');
  const an = (t) => L.analyze(t, [v1], {});
  const run = (xs, today) => {
    const logs = xs.map((x) => ({ who: x.who, recs: x.recs }));
    const recs = L.allRecs(logs, D(today));
    const t = L.taskInfo(v1, L.groupByKey(recs), D(today), v1.r.tasks[0], null);
    return { open: L.openProblems(recs).map((x) => x.kind).join(','), s2: L.signals(logs, { L: v1, today: D(today), members: ['a', 'b'] }).filter((x) => x.code === 'S2').length, status: t.status };
  };
  const A = an('by: a\n- 2026-01-05\n  - 子 status: blocked\n'), Bs = an('by: b\n- 2026-01-05\n  - 子 solved: 手伝った\n');
  const r1 = run([A, Bs], '2026-01-20'), r2 = run([Bs, A], '2026-01-20');
  ok(r1.open === '' && r2.open === '', `ある人の blocked と別の人の同じ日の solved: で計算が終わり、どちらの順でも閉じる(${r1.open}|${r2.open})`);
  const Bd = an('by: b\n- 2026-01-05\n  - 子 status: doing\n');
  const d1 = run([A, Bd], '2026-01-20'), d2 = run([Bd, A], '2026-01-20');
  ok(JSON.stringify(d1) === JSON.stringify(d2), `同じ日の別の人の状態の報告は、一覧の順によらない(${JSON.stringify(d1)} / ${JSON.stringify(d2)})`);
  ok(d1.status === 'blocked' && d1.open === 'blocked' && d1.s2 === 1, `同じタスクの別の人の報告は、人ごとの最後の報告でまとめる。1 人でも問題発生なら問題発生(${JSON.stringify(d1)})`);
  // 同じ人の同じ日では、テキストの順で後の報告(blocked の後の doing で閉じる)
  const A3 = an('by: a\n- 2026-01-05\n  - 子 status: blocked\n  - 子 status: doing\n');
  ok(run([A3], '2026-01-20').open === '', '同じ人の同じ日の blocked の後の別の状態で閉じる');
  // blocked は、後の日の別の状態の報告で閉じる
  ok(run([an('by: a\n- 2026-01-05\n  - 子 status: blocked\n- 2026-01-06\n  - 子 status: doing\n')], '2026-01-20').open === '', 'blocked は後の日の別の状態で閉じる');
  ok(run([an('by: a\n- 2026-01-05\n  - 子 status: blocked\n- 2026-01-06\n  - 子 status: blocked\n')], '2026-01-20').open === 'blocked', 'blocked が続けば開いたまま');
}
{
  // M4・M15: 画面の書き方(writeSolved・writeToday)は、FBS の機能を同じ名前の WBS の要素と取り違えず、問題を閉じる
  const pl = L.loadPlan('p.plan', 'version: 2026-01-01\nstart: 2026-01-01\nmembers:\n- a\nFBS: アプリ\n- 通知\n  - ログイン mop: 1 秒で入れる\nWBS: r\n- ログイン days: 2 by: a');
  const t = 'by: a\n- 2026-01-02\n  - 通知::ログイン trl: 1 issue: 入れない\n', T = D('2026-01-03');
  const a = L.analyze(t, [pl], { today: T });
  const k = a.recs[0].key;
  ok(L.nameForWrite(a.V, T, k, 'x') === '通知::ログイン', `FBS の機能の書く名前は、WBS の同じ名前と区別できる修飾名(${L.nameForWrite(a.V, T, k, 'x')})`);
  const e = L.writeSolved(t, { today: T }, a, T, k, a.recs[0].name, '直した');
  const a2 = L.analyze(e.text, [pl], { today: T });
  ok(!e.error && a2.recs[1].key === k && L.openIssues(L.groupByKey(a2.recs)).length === 0, `FBS の機能の問題を「解決を記録」すると閉じる(${e.error ?? a2.recs[1]?.key})`);
  // 書き込んだ名前が別の記録先を指すときは書かない(計画にない名前として書くと、記録先が変わるため)
  const t2 = 'by: a\n- 2026-01-02\n  - ログイン hours: 1\n';
  const b = L.analyze(t2, [pl], { today: T });
  const e2 = L.writeToday(t2, { today: T }, b, T, k, 'ログイン', 'trl', '2');
  ok(!e2.error && L.analyze(e2.text, [pl], { today: T }).recs[1].key === k, '今日の記録: 書く名前は記録先から決める(WBS の同じ名前の要素に書かない)');
  const e3 = L.writeToday(t2, { today: T }, b, T, k, '通知::ログイン', 'trl', '2');
  ok(!e3.error && L.analyze(e3.text, [pl], { today: T }).recs[1].key === k, '今日の記録: 今日の行がない記録先にも、同じ記録先の名前で足す');
}
{
  // M17: 信号の境い目の日(規則の値の日数ちょうどで出る。1 日前は出ない)
  const pq = L.loadPlan('q.plan', 'version: 2026-04-01\nstart: 2026-04-01\nmembers:\n- 青木\nWBS: r\n- 子 days: 2 by: 青木\n- 孫 days: 30 by: 青木');
  const sigs = (t, d) => { const a = L.analyze(t, [pq], { today: D(d) }); return L.signals([{ who: a.who, recs: a.recs }], { L: a.latest, today: D(d), me: a.who }); };
  const has = (t, d, c) => sigs(t, d).filter((x) => x.code === c);
  const t1 = 'by: 青木\n- 2026-04-03\n  - 孫 hours: 1\n';
  ok(has(t1, '2026-04-09', 'S1').length === 0 && has(t1, '2026-04-10', 'S1').length === 1, 'S1: 最後の記録から 7 日で出る。6 日では出ない');
  const end = L.endOf(pq, pq.r.tasks.find((x) => x.name === '子'));
  const t5 = 'by: 青木\n- 2026-04-01\n  - 子 hours: 1\n';
  const s5 = (d) => has(t5, L.fmtDate(d), 'S5').filter((x) => x.label === '子');
  ok(s5(end).length === 0 && s5(end + 1).length === 1 && s5(end + 1)[0].text.includes('から 1 日超過'), `S5: 終了予定日の翌日(1 日超過)に出る。終了予定日の当日は出ない(${L.fmtDate(end)})`);
  const t8 = 'by: 青木\n- 2026-04-01\n  - 孫 progress: 50\n- 2026-04-20\n  - 孫 hours: 1\n';
  ok(has(t8, '2026-04-14', 'S8').length === 0 && has(t8, '2026-04-15', 'S8').length === 1, 'S8: 同じ進捗率のまま 14 日で出る。13 日では出ない');
  const t4 = (n) => `by: 青木\n${Array.from({ length: n }, (_, i) => `- ${L.fmtDate(D('2026-04-01') + i)}\n  - 子 hours: 1`).join('\n')}\n`;
  ok(has(t4(2), '2026-04-03', 'S4').length === 0 && has(t4(3), '2026-04-04', 'S4').length === 1, 'S4: 作業した日数が計画の日数を超えたら出る(同じ日数では出ない)');
  const t8b = 'by: 青木\n- 2026-04-01\n  - 孫 progress: 100\n- 2026-04-20\n  - 孫 hours: 1\n';
  ok(has(t8b, '2026-04-20', 'S8').length === 0, 'S8: 進捗率 100 % のままなら出さない(完了の報告がなくても)');
  // 同じ日付の日付の行が 2 つあるときは、最後の日付の行の記録の最後に足す(11.3 節)
  const t2d = 'by: 青木\n- 2026-04-01\n  - 孫 hours: 1\n- 2026-04-01\n  - 孫 hours: 2\n';
  const xa = L.Edit.add(t2d, {}, D('2026-04-01'), '孫', { hours: '3' });
  ok(!xa.error && xa.text === `${t2d}  - 孫 hours: 3\n`, `同じ日付の日付の行が 2 つあれば、最後の方に足す(${xa.error ?? ''})`);
}

// ---- 5.6 節 版をまたいだ記録先の対応(移動はたどり、名前の変更はたどらない)
{
  // 開始日は版の日付以降にする(実行前のタスクを版の日付より前に置かない規則と切り離す)
  const P1 = 'version: 2026-03-02\nstart: 2026-03-16\nmembers:\n- 青木\n- 井上\nWBS: r\n- 実装\n  - 画面 days: 3 by: 青木\n  - 部品 days: 3 by: 青木\n- 試験 days: 2 by: 井上';
  const P2 = 'version: 2026-03-09\nstart: 2026-03-16\nmembers:\n- 青木\n- 井上\nWBS: r\n- 開発\n  - 画面 days: 3 by: 青木\n- 実装\n  - 部品改 days: 3 by: 青木\n- 試験 days: 2 by: 井上\n- 調査 days: 1 by: 青木';
  const v1 = L.loadPlan('v1.plan', P1), v2 = L.loadPlan('v2.plan', P2);
  const t = 'by: 青木\n- 2026-03-03\n  - 画面 hours: 2 status: doing progress: 40\n  - 部品 hours: 1 progress: 30 issue: 動かない\n  - 調査 hours: 2\n  - 試験 ask: 井上\n';
  const a = L.analyze(t, [v1, v2], { today: D('2026-03-25') });
  const k = (n) => a.recs.find((r) => r.name === n).key;
  ok(k('画面') === 'WBS:開発::画面' && k('部品') === 'WBS:実装::部品' && k('調査') === 'WBS:調査', `移動はたどり、名前の変更はたどらず、計画にない名前は後の版の同じ名前の要素にする(${k('画面')}・${k('部品')}・${k('調査')})`);
  ok(a.recs.find((r) => r.name === '調査').planned === true && !warns(a).some((m) => m.includes('「調査」が計画')), '計画にない作業だった記録: 最新の版で決まる名前なら診断を出さず、集計では計画の要素');
  const sg = L.signals([{ who: a.who, recs: a.recs }], { L: a.latest, today: D('2026-03-25'), me: a.who });
  ok(sg.some((x) => x.code === 'S8' && x.label === '開発::画面') && !sg.some((x) => x.code === 'S8' && x.label.includes('部品')), 'S8 は今の版のタスクだけ(名前の変更の前の記録先には出さない)');
  const pc = L.planChanges(a);
  ok(pc.rows.some((x) => x.kind === '移動' && x.label === '開発::画面' && x.text === '親: 実装 → 開発') && !pc.rows.some((x) => x.label.endsWith('画面') && x.kind !== '移動'), `計画の変更: 移動は 1 行(${JSON.stringify(pc.rows)})`);
  ok(pc.rows.some((x) => x.kind === '作成者の削除' && x.label === '実装::部品') && pc.rows.some((x) => x.kind === '作成者の追加' && x.label === '実装::部品改'), '計画の変更: 名前の変更は削除と追加');
  // 解決の記録: 名前を変えた前の記録先には、書いたままの名前で足して閉じる。移動した記録先には今の名前で足す
  const T = D('2026-03-25');
  const e1 = L.writeSolved(t, { today: T }, a, T, k('部品'), '部品', '直した');
  const a1 = L.analyze(e1.text ?? t, [v1, v2], { today: T });
  ok(!e1.error && e1.text.endsWith('  - 部品 solved: 直した\n') && L.openProblems(a1.recs).length === 0, `名前を変えた前の記録先の問題も、解決を記録できて閉じる(${e1.error ?? ''})`);
  const e2 = L.writeToday(t, { today: T }, a, T, k('画面'), '画面', 'status', 'done');
  const a2 = e2.error ? null : L.analyze(e2.text, [v1, v2], { today: T });
  ok(a2 && a2.recs[a2.recs.length - 1].key === 'WBS:開発::画面' && a2.recs[a2.recs.length - 1].ver === v2, `移動した記録先の今日の記録は、今の版の名前で足し、同じ記録先になる(${(e2.text ?? e2.error).slice(-30)})`);
  // 依頼: 同じ記録先か同じ名前の返事で対応する(移動をまたいでも)
  const b = L.analyze('by: 井上\n- 2026-03-10\n  - 試験 answered: 答えた\n', [v1, v2], { today: T });
  ok(L.requests([{ who: a.who, recs: a.recs }, { who: b.who, recs: b.recs }], T, true).every((q) => q.reply), '依頼は、同じ記録先の返事で対応する');
  // 寄せる先を替えても、記録した日の照合から寄せ直す
  L.remap(a.recs, a.V, v1);
  ok(k('画面') === 'WBS:実装::画面' && k('調査') === 'X:調査', '寄せる先を前の版にすると、その版の記録先に戻る');
  L.remap(a.recs, a.V, v2);
  ok(k('画面') === 'WBS:開発::画面', '寄せ直せる');
  // 同じ名前が 2 つ以上あると移動にしない
  const v3 = L.loadPlan('v3.plan', P2.replace('2026-03-09', '2026-03-16').replace('- 試験 days: 2 by: 井上', '- 試験 days: 2 by: 井上\n  - 画面 days: 1 by: 井上').replace('- 開発\n  - 画面 days: 3 by: 青木\n', '- 開発2\n  - 画面 days: 3 by: 青木\n'));
  const a3 = L.analyze(t, [v1, v2, v3], { today: D('2026-03-25') });
  ok(a3.recs.find((r) => r.name === '画面').key === 'WBS:実装::画面', `同じ名前が 2 つ以上あると、移動としてたどらず、記録した日の版の記録先のまま(${a3.recs.find((r) => r.name === '画面').key})`);
}

// ---- 4.2 節 status: を書かずに progress: を書いた行は、進捗率から状態を決める
{
  const pl = L.loadPlan('s.plan', 'version: 2026-03-02\nstart: 2026-03-02\nmembers:\n- 青木\nWBS: r\n- A days: 5 by: 青木\n- B days: 5 by: 青木\n- C days: 5 by: 青木');
  const a = L.analyze('by: 青木\n- 2026-03-03\n  - A hours: 2 progress: 30\n  - B progress: 100\n  - C status: todo progress: 20\n', [pl], { today: D('2026-03-04') });
  const st = (n) => L.stateOf(L.groupByKey(a.recs), pl, `WBS:${n}`).status;
  ok(st('A') === 'doing' && st('B') === 'done' && st('C') === 'todo', `progress: だけの行は、100 なら完了、100 未満なら実行中。status: を書いた行はそのまま(${st('A')}・${st('B')}・${st('C')})`);
  const b = L.analyze('by: 青木\n- 2026-03-03\n  - A status: blocked\n- 2026-03-04\n  - A progress: 40\n', [pl], { today: D('2026-03-20') });
  ok(L.openProblems(b.recs).length === 0, 'blocked の後の progress: だけの行(実行中)で、問題発生は閉じる');
}

// ---- 5.4 節 版の日付と同じ日付の記録・7.2 節 計画の変更の比べる相手(同じ日付に版が 3 つ)
{
  const base = (d, body) => L.loadPlan(`${d}.plan`, `version: ${d}\nstart: 2026-03-02\nmembers:\n- 青木\n- 井上\nWBS: r\n${body}`);
  const v1 = base('2026-03-02', '- 登録 days: 3 by: 青木\n- 検索 days: 2 by: 井上');
  const v2a = base('2026-03-09', '- 登録の画面 days: 3 by: 青木\n- 検索 days: 2 by: 井上');
  const v2b = base('2026-03-09', '- 登録画面 days: 3 by: 青木\n- 検索 days: 2 by: 青木');
  const v2c = base('2026-03-09', '- 登録画面 days: 3 by: 青木\n- 検索 days: 2 by: 青木 note: 誤字を直した');
  const t = 'by: 青木\n- 2026-03-09\n  - 登録 hours: 1\n  - 登録の画面 hours: 1\n  - 登録画面 hours: 1\n  - 未定 hours: 1\n- 2026-03-10\n  - 登録 hours: 1\n';
  const a = L.analyze(t, [v1, v2a, v2b, v2c], { today: D('2026-03-10') });
  const w = warns(a).filter((m) => m.includes('計画'));
  const r = a.recs;
  ok(r[0].ver === v1 && r[1].ver === v2a && r[2].ver === v2c && r[3].ver === v2c && r[4].ver === v2c, '版の日付と同じ日付の記録: 一番下の版、同じ日付の上の版、前の日付の最後の版の順に探す');
  ok(w.length === 2 && w.some((m) => m.includes('「未定」')) && w.some((m) => m.includes('「登録」') && m.includes('2026-03-09 版 (3)')), `どの版でも見つからない名前と、版の日付より後の日付の前の名前だけを警告する(${w.join(' / ')})`);
  const pc = L.planChanges(a);
  ok(pc.A === v1 && pc.B === v2c && pc.rows.some((x) => x.kind === '作成者の追加' && x.label === '検索'), `計画の変更: 同じ日付に 3 回保存しても、前の日付の最後の版と比べる(${pc.A.name} → ${pc.B.name})`);
}

// ---- 版 0.28: 補完の候補・plans のマイログ・同じ日付の版の並び・今日より後の版
{
  const pl = L.loadPlan('a.plan', 'version: 2026-03-02\nstart: 2026-03-02\nmembers:\n- 青木\nWBS: r\n- 親\n  - 負荷 test: 準備 days: 1 by: 青木\n  - 普通 days: 1 by: 青木\nFBS: f\n- 通知\n  - メール mop: 1 分 hours: 以内\n  - 画面 mop: 速い');
  const c = L.nameCandidates([pl], D('2026-03-03'), '');
  ok(c.map((x) => x.insert).join(',') === '普通,通知,メール,画面' && c.excluded.join() === '親::負荷 test: 準備', `補完の候補: タスクと機能だけ。予約語を含む名前は外して知らせる(${c.map((x) => x.insert)} / ${c.excluded})`);
  ok(L.mopCandidates([pl], D('2026-03-03'), 'メール', '').length === 0 && L.mopCandidates([pl], D('2026-03-03'), '画面', '').length === 1, 'MOP の候補: 予約語を含む文は外す');
  const fp = L.fromPlans(JSON.stringify({ format: 'projalysis-plans', files: [{ name: 'a.plan', text: 'x' }], logs: [{ name: 'b.mylog', text: 'by: b' }] }));
  ok(fp.ok && fp.files.length === 1 && fp.nLogs === 1 && !fp.logs, 'plans のマイログは読まず、件数だけ返す');
  const mk = (n, extra) => L.loadPlan(n, `version: 2026-03-09\nstart: 2026-03-02\nmembers:\n- 青木\nWBS: r\n- t days: 1 by: 青木${extra}`);
  const x = mk('x.plan', ''), y = mk('y.plan', ' note: y'), z = mk('z.plan', ' note: z'), o = L.loadPlan('o.plan', 'version: 2026-03-02\nstart: 2026-03-02\nmembers:\n- 青木\nWBS: r\n- t days: 1 by: 青木');
  const al = L.alignOrder([o, x, y, z], [{ name: 'z', text: z.text }, { name: 'x', text: x.text }]);
  ok(al.map((e) => e.name).join() === 'o.plan,z.plan,y.plan,x.plan', `plans を足したら、同じ日付の版の並びを plans に合わせる(${al.map((e) => e.name)})`);
  const fut = L.loadPlan('f.plan', 'version: 2026-03-20\nstart: 2026-03-02\nmembers:\n- 青木\nWBS: r\n- 先 days: 1 by: 青木');
  const af = L.analyze('by: 青木\n- 2026-03-03\n  - t hours: 1\n', [o, fut], { today: D('2026-03-10') });
  ok(af.latest === o && warns(af).some((m) => m.includes('今日より後の日付の版')) && !L.analyze('by: 青木\n', [o, fut], { today: D('2026-03-10'), team: true }).diags.some((d) => d.message.includes('今日より後')), '今日より後の日付の版は最新の版にせず、知らせる(プロジェクト分析では知らせない)');
}

// ---- 版 0.28: 低の項目(M10〜M23)
{
  const pl = L.loadPlan('s.plan', 'version: 2026-01-01\nstart: 2026-01-01\nmembers:\n- a\nWBS: r\n- t1 days: 3 by: a\n- t2 days: 3 by: a');
  const T = D('2026-01-10'), ctx = { today: T };
  const a = L.analyze('by: a\n- 2026-01-08\n  - t1 issue: 古い問題\n- 2026-01-12\n  - t2 issue: 未来の問題\n', [pl], ctx);
  const sm = L.render(a, 'summary', ctx).svg;
  ok(sm.includes('古い問題') && !sm.includes('未来の問題'), '今日より後の日付の記録は、未解決の問題に数えない');
  const b = L.analyze('by: a\n- 2026-01-07\n  - t1 hours: 1 note: x\n- 2026-01-06\n  - t1 hours: 1 note: y\n- 2026-01-07\n  - t2 hours: 1 note: z\n', [pl], ctx);
  const wk = L.pieces(b, 'week', { today: T, week: D('2026-01-05') }).tables.find((x) => x.name === 'この週のメモ');
  ok(wk && wk.rows.map((r) => r[2]).join('') === 'yxz', `週のまとめの表は日付の順、同じ日付はテキストの順(${wk && wk.rows.map((r) => r[2])})`);
  const g = L.analyze('by: a\n- 2023-01-05\n  - 誰か note: 古いメモ\n- 2026-01-02\n  - t1 hours: 1\n', [pl], ctx);
  ok(!L.render(g, 'gantt', ctx).svg.includes('長すぎる'), 'ガントチャートの期間に、担当外の古い記録は入れない');
  const p2 = L.loadPlan('f.plan', 'version: 2026-01-01\nstart: 2026-02-01\nmembers:\n- a\nWBS: r\n- t days: 1 by: a');
  const f = L.analyze('by: a\n', [p2], ctx);
  ok(!L.signals([{ who: 'a', recs: f.recs }], { L: f.latest, today: T, me: 'a' }).some((x) => x.code === 'S1'), 'プロジェクトの開始日より前は S1 を出さない');
  const c = L.analyze('by: a\n- 2026-01-08\n  - t1 hours: 1 note: 縦\u000bタブ\n', [pl], ctx);
  ok(!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(L.render(c, 'week', ctx).svg), '制御文字は SVG に書かない');
  const e = L.analyze('by: a\n- 2026-01-08\n  - z note: x\n', [L.loadPlan('e.plan', 'version: 2026-01-01\nstart: 2026-01-01\nWBS: r\n- t days: 1 by: b')], ctx);
  ok(L.render(e, 'summary', ctx).svg.includes('照合に使える版(') && !L.render(e, 'summary', ctx).svg.includes('計画書を追加すると'), '照合に使える版がないときは、そう知らせる');
  ok(warns(L.analyze('by: a\n- 2026-01-08\n  - z note: x\n', [pl], ctx)).some((m) => m.includes('WBS にも FBS にもありません')), '照合の警告の文(WBS にも FBS にも)');
}

// ---- 結合テスト(2 回目)の指摘
{
  // J2: 版の日付と同じ日に、そのタスクを分けた版を保存しても、その日の旧名の status: は前の版で照合する(5.4 節)
  const v1 = L.loadPlan('v1.plan', 'version: 2026-10-10\nstart: 2026-10-05\nmembers:\n- 上田\nWBS: R\n- 結合テスト days: 4 by: 上田\n');
  const v2 = L.loadPlan('v2.plan', 'version: 2026-10-16\nstart: 2026-10-05\nmembers:\n- 上田\nWBS: R\n- 結合テスト\n  - 画面 days: 2 by: 上田\n  - API days: 2 by: 上田\n');
  const a = L.analyze('by: 上田\n- 2026-10-15\n  - 結合テスト status: blocked\n- 2026-10-16\n  - 結合テスト status: doing progress: 60\n', [v1, v2], { today: D('2026-10-17') });
  const r = a.recs[1];
  ok(r.ver === v1 && r.val.status === 'doing' && r.val.progress === 60 && !warns(a).some((m) => m.includes('無視')), `分けた日の旧名の status: を前の版で照合する(${r.ver && r.ver.name} ${JSON.stringify(r.val)})`);
  ok(L.openProblems(L.allRecs([{ who: '上田', recs: a.recs }], D('2026-10-17'))).length === 0, '分けた日の実行中の報告で、問題発生の続きが閉じる');
}
{
  // J3: 作成者を交代したら、今の作成者の報告だけでまとめる(4.2 節)。今の作成者が報告していなければ全員
  const v = L.loadPlan('v.plan', 'version: 2026-10-01\nstart: 2026-10-01\nmembers:\n- 青木\n- 江藤\nWBS: R\n- リリース準備 days: 2 by: 江藤\n');
  const an = (t) => L.analyze(t, [v], {});
  const Ao = an('by: 青木\n- 2026-10-05\n  - リリース準備 status: doing progress: 50\n'), Eo = an('by: 江藤\n- 2026-10-08\n  - リリース準備 status: done progress: 100\n');
  const info = (xs) => { const recs = L.allRecs(xs.map((x) => ({ who: x.who, recs: x.recs })), D('2026-10-20')); return L.taskInfo(v, L.groupByKey(recs), D('2026-10-20'), v.r.tasks[0], null); };
  const i1 = info([Ao, Eo]), i2 = info([Ao]);
  ok(i1.status === 'done' && i1.pg.val.progress === 100 && !i1.late, `外れた作成者の古い報告はまとめに入れない(${i1.status} ${i1.pg.val.progress})`);
  ok(i2.status === 'doing', `今の作成者が報告していなければ、報告した人でまとめる(${i2.status})`);
  const sig = L.signals([Ao, Eo].map((x) => ({ who: x.who, recs: x.recs })), { L: v, today: D('2026-10-20'), members: ['青木', '江藤'] }).map((x) => x.code);
  ok(!sig.includes('S4') && !sig.includes('S5') && !sig.includes('S8'), `作成者の交代で S4・S5・S8 が出ない(${sig})`);
}
{
  // J6: 計画から消した記録先は「(計画から削除)」。計画に足した後に消した作業も同じ(5.6 節)
  const v1 = L.loadPlan('v1.plan', 'version: 2026-10-01\nstart: 2026-10-01\nmembers:\n- 青木\nWBS: R\n- 調査 days: 1 by: 青木\n- 実装 days: 2 by: 青木\n');
  const v2 = L.loadPlan('v2.plan', 'version: 2026-10-08\nstart: 2026-10-01\nmembers:\n- 青木\nWBS: R\n- 実装 days: 2 by: 青木\n- 試作 days: 1 by: 青木\n');
  const v3 = L.loadPlan('v3.plan', 'version: 2026-10-15\nstart: 2026-10-01\nmembers:\n- 青木\nWBS: R\n- 実装 days: 2 by: 青木\n');
  const a = L.analyze('by: 青木\n- 2026-10-02\n  - 調査 hours: 1\n  - 試作 hours: 2\n  - 雑務 hours: 1\n- 2026-10-09\n  - 試作 hours: 1\n', [v1, v2, v3], { today: D('2026-10-20') });
  const dk = (n) => L.dispKey([a.recs.find((r) => r.name === n)], a.latest);
  const ks = a.recs.filter((r) => r.name === '試作').map((r) => r.key);
  ok(ks.length === 2 && ks[0] === ks[1], `計画に足した後に消した作業は、計画にあったときの記録と 1 行にまとめる(${ks})`);
  ok(warns(a).some((m) => m.includes('「試作」') && m.includes('この日の版にない名前です')), '診断は「この日の版にない名前です」');
  ok(dk('調査') === '調査(計画から削除)' && dk('試作') === '試作(計画から削除)' && dk('雑務') === '雑務(計画にない作業)', `計画から削除の印(${dk('調査')}・${dk('試作')}・${dk('雑務')})`);
}
{
  // J7: 作成者自身は S9 の確認者に数えない(受け継いだ review:)
  const v = L.loadPlan('v.plan', 'version: 2026-10-01\nstart: 2026-10-01\nmembers:\n- 青木\n- 井上\nWBS: R\n- 結合テスト review: 青木\n  - 確認 days: 1 by: 青木\n  - 試験 days: 1 by: 井上\n');
  const sg = (t) => { const x = L.analyze(t, [v], {}); return L.signals([{ who: x.who, recs: x.recs }], { L: v, today: D('2026-10-10'), members: ['青木', '井上'] }).filter((s) => s.code === 'S9').map((s) => s.label); };
  ok(sg('by: 青木\n- 2026-10-02\n  - 確認 status: done\n').length === 0, 'S9: 作成者だけが確認者なら出ない');
  ok(sg('by: 井上\n- 2026-10-02\n  - 試験 status: done\n').length === 1, 'S9: 作成者以外の確認者がいれば出る');
}
{
  // B2: 1 日だけのタスクの予定の期間は「MM-DD」。B5: by: の値の誤りでは、必須のエラーを重ねない
  const v = L.loadPlan('v.plan', 'version: 2026-10-01\nstart: 2026-10-05\nmembers:\n- 青木\nWBS: R\n- 調査 days: 1 by: 青木\n');
  const svg = L.render(L.analyze('by: 青木\n- 2026-10-05\n  - 調査 hours: 1\n', [v], { today: D('2026-10-06') }), 'mytasks', { today: D('2026-10-06') }).svg;
  ok(svg.includes('>10-05<') && !svg.includes('10-05〜10-05'), '1 日だけの予定の期間は「MM-DD」');
  ok(errs('by: **青木**\n').length === 1 && errs('by:\n').length === 1, `by: の誤りは 1 件(${errs('by: **青木**\n')})`);
  // B4: 折り返しで「。」などを行頭に置かない
  const ls = L.wrap('あいうえおかきくけこ。さしす', 10 * 13, 13);
  ok(ls.every((x) => !/^[。、]/.test(x)) && ls.join('') === 'あいうえおかきくけこ。さしす', `行頭禁則(${ls.join('|')})`);
}

// ---- 修正漏れの点検で足した検査
{
  // J1: 最新の版で完了のタスクは「日程の変更」に出さない
  const a1 = L.loadPlan('a.plan', 'version: 2026-10-01\nstart: 2026-10-01\nmembers:\n- 青木\nWBS: R\n- 設計 days: 2 by: 青木\n- 実装 days: 3 by: 青木 after: 設計\n');
  const b1 = L.loadPlan('b.plan', 'version: 2026-10-08\nstart: 2026-10-01\nmembers:\n- 青木\nWBS: R\n- 設計 days: 2 by: 青木 status: done\n- 実装 days: 4 by: 青木 after: 設計\n');
  const rows = L.planChanges(L.analyze('by: 青木\n- 2026-10-09\n  - 実装 hours: 1\n', [a1, b1], { today: D('2026-10-09') })).rows.map((r) => `${r.kind}:${r.label}`);
  ok(!rows.includes('日程の変更:設計') && rows.includes('日程の変更:実装'), `完了のタスクは日程の変更に出さない(${rows})`);
}
{
  // J2: その版に名前がなく、前の版で途中の要素に決まるときは、前の版で照合する(status: は無視)
  const v1 = L.loadPlan('v1.plan', 'version: 2026-10-10\nstart: 2026-10-05\nmembers:\n- 上田\nWBS: R\n- 結合テスト\n  - 画面 days: 2 by: 上田\n');
  const v2 = L.loadPlan('v2.plan', 'version: 2026-10-16\nstart: 2026-10-05\nmembers:\n- 上田\nWBS: R\n- 画面 days: 2 by: 上田\n');
  const a = L.analyze('by: 上田\n- 2026-10-16\n  - 結合テスト status: doing\n', [v1, v2], { today: D('2026-10-17') });
  ok(a.recs[0].ver === v1 && a.recs[0].val.status === undefined && warns(a).some((m) => m.includes('無視')), `0 件のときは前の版の途中の要素で照合する(${a.recs[0].ver && a.recs[0].ver.name})`);
}
{
  // J3: 作成者が一度でも報告していれば、外れた人の報告は日ごとのまとめにも使わない(手戻り・問題の続き)
  const v = L.loadPlan('v.plan', 'version: 2026-10-01\nstart: 2026-10-01\nmembers:\n- 青木\n- 江藤\nWBS: R\n- 準備 days: 9 by: 江藤\n');
  const an = (t) => L.analyze(t, [v], {});
  const logs = (...xs) => xs.map((x) => ({ who: x.who, recs: x.recs }));
  const A = an('by: 青木\n- 2026-10-03\n  - 準備 status: done\n- 2026-10-04\n  - 準備 status: blocked\n'), E = an('by: 江藤\n- 2026-10-06\n  - 準備 status: doing\n');
  const sig = L.signals(logs(A, E), { L: v, today: D('2026-10-20'), members: ['青木', '江藤'] }).map((x) => x.code);
  ok(!sig.includes('S6') && !sig.includes('S2'), `外れた人の完了・問題発生で、手戻りや問題の続きが出ない(${sig})`);
  ok(L.openProblems(L.allRecs(logs(A, E), D('2026-10-20')), v).length === 0, '外れた人の blocked は、作成者が報告していれば問題の続きにしない');
}
{
  // J4: 依頼した相手が 2 人のうち 1 人だけが返事をした間は確認待ち
  const v = L.loadPlan('v.plan', 'version: 2026-10-01\nstart: 2026-10-01\nmembers:\n- 青木\n- 井上\n- 上田\nWBS: R\n- 画面 days: 9 by: 青木\n');
  const an = (t) => L.analyze(t, [v], {});
  const info = (xs) => { const recs = L.allRecs(xs.map((x) => ({ who: x.who, recs: x.recs })), D('2026-10-10')); return L.taskInfo(v, L.groupByKey(recs), D('2026-10-10'), v.r.tasks[0], null).rvw; };
  const A = an('by: 青木\n- 2026-10-03\n  - 画面 status: doing review: 井上, 上田\n'), I = an('by: 井上\n- 2026-10-04\n  - 画面 reviewed: ok\n'), U = an('by: 上田\n- 2026-10-05\n  - 画面 reviewed: ng\n');
  ok(info([A]) && info([A, I]) && !info([A, I, U]), '確認待ちは、依頼した全員の返事がそろうまで続く');
}
{
  // J6: 寄せる先の版で名前が 2 つ以上なら、計画から削除にしない(曖昧な名前のまま)
  const v1 = L.loadPlan('v1.plan', 'version: 2026-10-01\nstart: 2026-10-01\nmembers:\n- 青木\nWBS: R\n- 実装 days: 2 by: 青木\n');
  const v2 = L.loadPlan('v2.plan', 'version: 2026-10-08\nstart: 2026-10-01\nmembers:\n- 青木\nWBS: R\n- 実装 days: 2 by: 青木\n- 試作 days: 1 by: 青木\n');
  const v3 = L.loadPlan('v3.plan', 'version: 2026-10-15\nstart: 2026-10-01\nmembers:\n- 青木\nWBS: R\n- A\n  - 試作 days: 1 by: 青木\n- B\n  - 試作 days: 1 by: 青木\n');
  const a = L.analyze('by: 青木\n- 2026-10-02\n  - 試作 hours: 2\n', [v1, v2, v3], { today: D('2026-10-20') });
  const r = a.recs[0];
  ok(!r.gone && r.key === 'X:試作' && L.dispKey([r], a.latest) === '試作(計画にない作業)', `寄せる先で曖昧な名前は計画から削除にしない(${r.key} ${L.dispKey([r], a.latest)})`);
}
{
  // J8・B2: AI 向けの文
  const v = L.loadPlan('v.plan', 'version: 2026-10-01\nstart: 2026-10-05\nmembers:\n- 青木\nWBS: R\n- 調査 days: 1 by: 青木\n- 実装 days: 3 by: 青木 after: 調査\n');
  const p = L.aiPrompt(L.analyze('by: 青木\n- 2026-10-05\n  - 調査 hours: 1\n', [v], { today: D('2026-10-05') }), { today: D('2026-10-05') }).text;
  ok(p.includes('今の進捗 ') && !p.includes('今の状態 ') && p.includes('** と __ は') && /予定 10-05、/.test(p), 'AI 向けの文: 今の進捗、** と __ の決まり、1 日だけの予定は MM-DD');
  // B4: 行頭禁則の文字が続いても行頭に置かない
  const ls = L.wrap('あいう)。え', 4 * 13, 13);
  ok(ls.every((x) => !/^[)。、」]/.test(x)) && ls.join('') === 'あいう)。え', `続く行頭禁則(${ls.join('|')})`);
}

{
  // 結合テスト(3 回目): 消した後に初めて書いた記録は、計画にない作業のまま(反映候補に出る)
  const v1 = L.loadPlan('v1.plan', 'version: 2026-10-01\nstart: 2026-10-01\nmembers:\n- 青木\nWBS: R\n- 実装 days: 2 by: 青木\n- N days: 1 by: 青木\n');
  const v2 = L.loadPlan('v2.plan', 'version: 2026-10-08\nstart: 2026-10-01\nmembers:\n- 青木\nWBS: R\n- 実装 days: 2 by: 青木\n');
  const a = L.analyze('by: 青木\n- 2026-10-10\n  - N hours: 3\n', [v1, v2], { today: D('2026-10-20') });
  ok(!a.recs[0].gone && L.dispKey(a.recs, a.latest) === 'N(計画にない作業)', `消した後に初めて書いた記録は計画にない作業(${L.dispKey(a.recs, a.latest)})`);
  // S6 の人と飛び先は、まとめに使った作成者の記録
  const v = L.loadPlan('v.plan', 'version: 2026-10-01\nstart: 2026-10-01\nmembers:\n- 青木\n- 上田\nWBS: R\n- F days: 9 by: 青木\n');
  const an = (t) => L.analyze(t, [v], {});
  const A = an('by: 青木\n- 2026-10-02\n  - F status: done\n- 2026-10-05\n  - F status: doing\n'), U = an('by: 上田\n- 2026-10-05\n  - F status: blocked\n');
  const s6 = L.signals([A, U].map((x) => ({ who: x.who, recs: x.recs })), { L: v, today: D('2026-10-06'), members: ['青木', '上田'] }).filter((x) => x.code === 'S6');
  ok(s6.length === 1 && s6[0].who === '青木' && s6[0].rec.who === '青木', `S6 の人と飛び先は作成者の記録(${s6.map((x) => x.who)})`);
  // S8 の飛び先も作成者の記録
  const A8 = an('by: 青木\n- 2026-10-02\n  - F progress: 40\n'), U8 = an('by: 上田\n- 2026-10-04\n  - F progress: 70\n');
  const s8 = L.signals([A8, U8].map((x) => ({ who: x.who, recs: x.recs })), { L: v, today: D('2026-10-20'), members: ['青木', '上田'] }).filter((x) => x.code === 'S8');
  ok(s8.length === 1 && s8[0].rec.who === '青木' && /40 %/.test(s8[0].text), `S8 の飛び先は作成者の記録(${s8.map((x) => `${x.rec.who} ${x.text}`)})`);
}

{
  // 5.6 節: 版をまたいだ記録先の対応が、プロジェクト分析の計画書分析の対応づけと同じ(隣に ../projalysis があるときだけ。12 章)
  const pj = path.join(__dirname, '../../projalysis/dev/diff.js');
  if (!fs.existsSync(pj)) console.log('省略: ../projalysis がないので、計画書分析の対応づけとの比べは行いません');
  else {
    const core = fs.readFileSync(path.join(__dirname, '../dev/core.js'), 'utf8'), diff = fs.readFileSync(pj, 'utf8');
    const Dx = new Function('module', 'require', `${core}; ${diff}; return Projalysis;`)(undefined, undefined);
    const P1 = 'version: 2026-03-02\nstart: 2026-03-02\nmembers:\n- 青木\n- 井上\nWBS: r\n- 実装\n  - 画面 days: 3 by: 青木\n  - 部品 days: 3 by: 青木\n- 試験 days: 2 by: 井上\nFBS: f\n- 通知\n  - メール';
    const P2 = 'version: 2026-03-09\nstart: 2026-03-02\nmembers:\n- 青木\n- 井上\nWBS: r2\n- 開発\n  - 画面 days: 3 by: 青木\n- 実装\n  - 部品改 days: 3 by: 青木\n- 試験 days: 2 by: 井上\n  - 画面 days: 1 by: 井上\nFBS: f\n- 連絡\n  - メール';
    const pairs = [[planOld, plan], [L.loadPlan('p1.plan', P1), L.loadPlan('p2.plan', P2)]];
    const bad = [];
    for (const [a, b] of pairs) for (const sec of ['WBS', 'FBS']) {
      const want = [...Dx.match(a.r, b.r, sec).map].map(([x, y]) => `${L.keyOf(x)}>${L.keyOf(y)}`).sort();
      const got = [...L.verMap(a, b)].filter(([x]) => x.startsWith(`${sec}:`)).map(([x, y]) => `${x}>${y}`).sort();
      if (JSON.stringify(want) !== JSON.stringify(got)) bad.push(`${a.name}→${b.name} ${sec}`);
    }
    ok(!bad.length, `版をまたいだ記録先の対応が、計画書分析の対応づけと同じ(${bad.join('、')})`);
  }
}

console.log(`${n} 件中 ${ng} 件失敗`);
process.exit(ng ? 1 : 0);
