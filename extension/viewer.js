// Classroom ワンクリック保存 - Drive ビューア（iframe 内）用
// 表示中ファイルの名前と、ページ内に現れる ID 候補を親（Classroom）へ知らせる
(() => {
  "use strict";
  if (window.top === window) return; // 単独で開かれた場合は何もしない

  const EXT_RE = /\.(pdf|docx?|xlsx?|pptx?|txt|csv|zip|png|jpe?g|gif|heic|mp4|mov|mp3|m4a)$/i;
  let lastSig = "";
  let sameCount = 0;

  function collect() {
    const names = new Set();
    const t = (document.title || "").replace(/\s*-\s*Google\s*\S*$/, "").trim();
    if (t) names.add(t);
    // ヘッダーなどに表示されているファイル名らしきテキスト
    for (const el of document.querySelectorAll("[title], [aria-label], div, span")) {
      if (el.children.length > 0) continue;
      for (const s of [el.textContent, el.getAttribute("title"), el.getAttribute("aria-label")]) {
        const v = (s || "").trim();
        if (v && v.length < 200 && EXT_RE.test(v)) names.add(v);
      }
      if (names.size > 20) break;
    }
    const ids = new Set();
    const html = document.documentElement.innerHTML;
    for (const m of html.matchAll(/[A-Za-z0-9_-]{25,60}/g)) {
      ids.add(m[0]);
      if (ids.size > 3000) break;
    }
    return { names: [...names], ids: [...ids] };
  }

  function tick() {
    const data = collect();
    const sig = data.names.join("|") + "#" + data.ids.length;
    if (sig === lastSig && ++sameCount % 5 !== 0) return;
    lastSig = sig;
    try {
      window.top.postMessage({ cdlViewer: true, ...data }, "https://classroom.google.com");
    } catch (_) {}
  }

  setInterval(tick, 800);
  tick();
})();
