# index.html を組み立てる(開発用。アプリ本体には含めない)
#   python3 dev/build.py         dev/ の core.js・logcore.js・ui.js・help.html から、ルートの index.html を作る
#   python3 dev/build.py sync    プロジェクト計画のリポジトリ(隣の ../plan)の dev/core.js から dev/core.js に写し直す
#   python3 dev/build.py check   写しの dev/core.js が、プロジェクト計画の core.js と 1 バイトも違わないかを調べる
import json, pathlib, sys
d = pathlib.Path(__file__).parent      # dev/
root = d.parent                        # リポジトリのトップ(index.html を書く)
PLAN_CORE = root.parent / 'plan' / 'dev' / 'core.js'

if len(sys.argv) > 1:
    cmd = sys.argv[1]
    if not PLAN_CORE.exists():
        print(f'{PLAN_CORE} がありません(プロジェクト計画のリポジトリを ~/projects/plan に置いてください)')
        sys.exit(1 if cmd == 'check' else 0)
    if cmd == 'sync':
        (d / 'core.js').write_bytes(PLAN_CORE.read_bytes())
        print('dev/core.js を写し直しました')
    elif cmd == 'check':
        same = PLAN_CORE.read_bytes() == (d / 'core.js').read_bytes()
        print('同じです' if same else '違います(python3 dev/build.py sync で写し直してください)')
        sys.exit(0 if same else 1)
    else:
        print('使い方: python3 dev/build.py [sync|check]')
        sys.exit(1)
    sys.exit(0)

core = (d / 'core.js').read_text()
logcore = (d / 'logcore.js').read_text()
ui = (d / 'ui.js').read_text()
help_html = (d / 'help.html').read_text()
sample = (root / 'test' / 'sample.mylog').read_text()
sample_plan = (root / 'test' / 'sample.plan').read_text()
sample_plan_old = (root / 'test' / 'sample_old.plan').read_text()
head = '''<!DOCTYPE html>
<!--
  マイログ — プロジェクトの実行中に、日々の作業・問題・依頼・テストをテキストで記録し、計画書(.plan)と照合して問題の兆候を示す単一 HTML ツール
  https://mylog.sapp.jp

  MIT License
  Copyright (c) 2026 Kouta Sekine

  Permission is hereby granted, free of charge, to any person obtaining a copy
  of this software and associated documentation files (the "Software"), to deal
  in the Software without restriction, including without limitation the rights
  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
  copies of the Software, and to permit persons to whom the Software is
  furnished to do so, subject to the following conditions:

  The above copyright notice and this permission notice shall be included in all
  copies or substantial portions of the Software.

  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
  SOFTWARE.

  このファイルは外部ライブラリを使わず、データをどこにも送信しません。ネットワークなしで動きます。
-->
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>マイログ</title>
<style>
/* 配色・字体・ボタンの形・ダイアログ・ドラッグ・アンド・ドロップの表示・フッターは、プロジェクト計画(plan.sapp.jp)と同じ */
:root{
  --bg:#f4f4f2; --panel:#fff; --line:#d8d8d4; --text:#222; --accent:#8b1a2b; --err:#b00020; --sel:#fff3c4; --warn:#8a5a00;
}
*{box-sizing:border-box}
html,body{height:100%;margin:0}
body{font-family:"Segoe UI","Hiragino Sans","Noto Sans JP","Yu Gothic UI",sans-serif;font-size:14px;color:var(--text);background:var(--bg);display:flex;flex-direction:column;overflow:hidden}
header{display:flex;align-items:center;gap:4px;padding:6px 10px;background:var(--panel);border-bottom:1px solid var(--line);flex-wrap:wrap}
header h1{font-size:16px;margin:0 6px 0 0;font-weight:600}
header .sp{flex:1}
header button{padding:4px 8px}
button,select,label.btn{font:inherit;padding:4px 10px;border:1px solid #bbb;border-radius:4px;background:#fafafa;cursor:pointer;color:var(--text)}
button:hover,label.btn:hover{background:#f0f0ee}
select{max-width:28em}
main{flex:1;display:flex;min-height:0}
#left{width:42%;min-width:260px;display:flex;flex-direction:column;border-right:1px solid var(--line);background:var(--panel)}
#splitter{width:6px;cursor:col-resize;background:var(--line)}
#right{flex:1;display:flex;flex-direction:column;min-width:0}
#editor{flex:1;position:relative;min-height:0}
textarea#src,#hl{position:absolute;inset:0;margin:0;border:0;padding:10px;font:13px/1.5 Consolas,"Courier New",monospace;tab-size:4;white-space:pre;overflow:auto;box-sizing:border-box;word-break:normal;overflow-wrap:normal}
textarea#src{resize:none;outline:none;background:transparent;color:transparent;caret-color:#222;z-index:1}
textarea#src::selection{background:rgba(139,26,43,.25);color:transparent}
#hl{pointer-events:none;color:#222;background:#fff;z-index:0}
#hl .kw{color:#8b1a2b;font-weight:600}#hl .nu{color:#1d4ed8}#hl .cm{color:#888}#hl .dt{color:#1d4ed8;font-weight:600}
#comp{position:absolute;z-index:3;background:#fff;border:1px solid #999;border-radius:4px;box-shadow:0 2px 8px rgba(0,0,0,.15);max-height:220px;overflow:auto;min-width:220px;max-width:520px;display:none;font-size:13px}
#comp.on{display:block}
#comp div{padding:3px 8px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#comp div.cur{background:var(--sel)}
#comp .k{color:#888;font-size:11px;margin-left:8px}
#msg{padding:6px 10px;border-top:1px solid var(--line);font-size:13px;min-height:2.6em;max-height:10em;overflow:auto;background:#fcfcfa}
#msg .err{color:var(--err)}
#msg .ok{color:#2a6b2a}
#msg .warn{color:var(--warn)}
#msg .sec{font-weight:600;margin-top:4px}
#msg ul{margin:2px 0 4px;padding-left:1.4em}
#plans{border-top:1px solid var(--line);font-size:13px;background:#fcfcfa;max-height:30%;overflow:auto}
#plans .head{display:flex;align-items:center;gap:8px;padding:5px 10px;cursor:pointer;font-weight:600;user-select:none}
#plans .head .small{font-weight:400}
#plans ul{list-style:none;margin:0;padding:0 10px 6px}
#plans li{display:flex;align-items:center;gap:6px;padding:3px 0;border-top:1px solid #eee}
#plans li .nm{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#plans li .err{color:var(--err)}
#plans li .warn{color:var(--warn)}
#plans li button{font-size:11px;padding:0 6px}
#plans .note{padding:0 10px 6px;color:#666}
#plans.closed ul,#plans.closed .note{display:none}
#view{flex:1;overflow:auto;background:#fff;position:relative}
#weekWrap{padding:6px 12px;border-bottom:1px solid #ddd;background:#fafaf8}
#weekWrap[hidden]{display:none}
#canvas{position:relative}
#canvas .tbtns{position:absolute;display:flex;gap:4px;z-index:2;white-space:nowrap;width:max-content}
#canvas .tbtns button{font-size:11px;line-height:1.2;padding:1px 7px;border-radius:3px;white-space:nowrap;flex:none}
#view svg{display:block}
#view.stale svg{opacity:.45}
#view [data-id]{cursor:pointer}
#view .selected rect{stroke:var(--accent);stroke-width:2}
#view .empty{padding:16px;color:#666}
#edit{border-top:1px solid var(--line);background:var(--panel);padding:8px 10px;display:none;max-height:48%;overflow:auto}
#edit.on{display:block}
#edit .row{display:flex;gap:6px 14px;flex-wrap:wrap;align-items:center;margin-bottom:6px}
#edit .form{display:flex;gap:6px 12px;flex-wrap:wrap;align-items:flex-end;margin-bottom:8px}
#edit ol.steps{margin:4px 0 8px 1.4em;padding:0;font-size:13px;line-height:1.6}
#edit .map{font-size:13px;margin-top:6px}
#edit .grp{font-size:12px;font-weight:600;color:#444;margin:6px 0 4px}
#edit label{display:flex;flex-direction:column;font-size:12px;color:#555;gap:2px}
#edit input,#edit select{font:13px Consolas,"Courier New","Hiragino Sans","Noto Sans JP",monospace;padding:3px 6px;border:1px solid #bbb;border-radius:3px;width:11em}
#edit input.wide{width:22em}
#edit input.num{width:6em}
#edit select{width:12em}
#edit select[data-k$="mop"]{width:24em}
#edit .btns{display:flex;gap:6px;align-items:center}
#edit .editerr{color:var(--err);margin-bottom:6px}
#edit .kind{font-weight:600}
#edit .box{border:1px solid var(--line);border-radius:4px;padding:6px 8px;margin-bottom:8px;background:#fcfcfa}
dialog{border:1px solid #999;border-radius:6px;padding:16px 20px;max-width:760px;font-size:14px}
dialog h2{font-size:16px;margin:12px 0 8px}
dialog h2:first-child{margin-top:0}
dialog pre{background:#f6f6f2;padding:8px;overflow:auto;font-size:12px;margin:0}
dialog table{border-collapse:collapse;font-size:13px}
dialog td,dialog th{border:1px solid #ccc;padding:3px 8px;text-align:left;vertical-align:top}
dialog th,dialog td:nth-child(-n+2){white-space:nowrap}
dialog code{background:#f6f6f2;padding:0 3px}
#dlgSet input{width:5em;font:inherit;padding:2px 4px}
#dlgSet td:nth-child(2){white-space:normal}
#drop{position:absolute;inset:0;background:rgba(139,26,43,.08);border:3px dashed var(--accent);display:none;align-items:center;justify-content:center;font-size:20px;color:var(--accent);pointer-events:none;text-align:center}
#drop.on{display:flex}
.small{font-size:12px;color:#666}
#warn{color:var(--err);font-size:12px}
.fname{font-size:13px;color:#444;max-width:18em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.stat{font-size:12px;color:#2a6b2a}
button:disabled{opacity:.5;cursor:default}
footer{font-size:11px;color:#777;padding:3px 10px;border-top:1px solid var(--line);background:var(--panel)}
footer a{color:#777}
/* 印刷 / PDF: ビューを縦向きのページに。ページの余白は 0(ブラウザが日時・題名などを書く場所をなくすため)。図の周りの空きはページの内側に取る */
#printArea{display:none}
@media print{
  @page{size:portrait;margin:0}
  html,body{height:auto;overflow:visible;display:block;background:#fff}
  body>*:not(#printArea){display:none!important}
  #printArea{display:block}
  #printArea .page{break-after:page;page-break-after:always;display:flex;align-items:flex-start;justify-content:center;box-sizing:border-box;height:calc(100vh - 1px);padding:10mm;overflow:hidden}
  #printArea .page:last-child{break-after:auto;page-break-after:auto}
  #printArea svg{max-width:100%;max-height:100%;width:auto;height:auto}
  #printArea.one .page{padding:0;display:block;break-after:auto;page-break-after:auto}
  #printArea.one svg{display:block;max-width:none;max-height:none}
}
</style>
</head>
<body>
<header>
  <h1>マイログ</h1>
  <button id="btnNew">新規</button>
  <button id="btnOpen" title="マイログ(.mylog)を開く。計画書(.plan・.txt・.plans・.svg)を選んだときは、計画書の一覧に足す">開く</button><input type="file" id="fileOpen" accept=".mylog,.plan,.txt,.plans,.svg" multiple style="display:none">
  <button id="btnSave" title="開いているファイルに上書き保存(Ctrl+S。まだファイルがないときは保存先を選ぶ)">上書き保存</button>
  <button id="btnSaveAs" title="保存先とファイル名を選んでマイログ(.mylog)を保存">別名で保存</button>
  <button id="btnPrint" title="ビューをすべて印刷する(印刷の画面で「PDF に保存」を選ぶと PDF になる)">印刷 / PDF</button>
  <span id="fileName" class="fname"></span>
  <span id="stat" class="stat" role="status"></span>
  <label>ビュー <select id="viewKind"></select></label>
  <span id="warn" role="status"></span>
  <span class="sp"></span>
  <button id="btnAdd" title="日付と名前を選んで、記録の行を追加する(テキストに書き込む)">記録を追加</button>
  <button id="btnAI" title="生成 AI に質問してもらいながら今日の記録を書く手順を出す(このアプリは AI に何も送らない)">AI で記録</button>
  <button id="btnPlan" title="計画書(.plan・.txt・.plans・.svg)を計画書の一覧に追加する。計画書は読むだけで、書き換えない">計画書を追加</button><input type="file" id="filePlan" accept=".plan,.txt,.plans,.svg" multiple style="display:none">
  <button id="btnSet" title="要確認の規則の値(日数など)を変える">設定</button>
  <button id="btnSample">例を読み込む</button>
  <button id="btnHelp">書き方</button>
</header>
<main>
  <div id="left">
    <div id="editor"><pre id="hl" aria-hidden="true"></pre><textarea id="src" spellcheck="false" placeholder="ここにマイログを書くと、右に表が出ます。「例を読み込む」で例を、「書き方」で書き方を見られます。"></textarea><div id="comp" role="listbox"></div></div>
    <div id="msg"></div>
    <div id="plans"></div>
  </div>
  <div id="splitter"></div>
  <div id="right">
    <div id="weekWrap" hidden><label>週のまとめで見る週 <select id="weekSel"></select></label></div>
    <div id="view"><div id="canvas"></div><div id="drop">ファイルを置くと開きます<br>(マイログ .mylog は開き、計画書 .plan / .txt / .plans / .svg は計画書の一覧に足します)</div></div>
    <div id="edit"></div>
  </div>
</main>
<footer>マイログ — データはどこにも送信されません。MIT License, Copyright (c) 2026 Kouta Sekine. <a href="https://sapp.jp" target="_blank" rel="noopener">S Apps</a></footer>

<dialog id="dlgHelp"></dialog>
<dialog id="dlgSet"></dialog>
<div id="printArea"></div>
<script>
'''
js_consts = ('const SAMPLE_TEXT = ' + json.dumps(sample, ensure_ascii=False) + ';\nconst SAMPLE_PLAN_OLD = ' + json.dumps(sample_plan_old, ensure_ascii=False) + ';\nconst SAMPLE_PLAN = ' + json.dumps(sample_plan, ensure_ascii=False)
             + ';\nconst HELP_HTML = ' + json.dumps(help_html, ensure_ascii=False) + ';\n')
body = core + '\n' + logcore + '\n' + js_consts + ui
assert '</script' not in body.replace('<\\/script', '')
out = head + body + '</script>\n</body>\n</html>\n'
(root / 'index.html').write_text(out)
print('index.html', len(out.encode()), 'bytes')
