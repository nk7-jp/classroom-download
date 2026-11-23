// Classroom ワンクリック保存 - content script（classroom.google.com）
(() => {
  "use strict";

  // ---------- ユーティリティ ----------
  const ID_RE = "([A-Za-z0-9_-]{20,})";
  const PATTERNS = [
    { kind: "file",         re: new RegExp(`drive\\.google\\.com/(?:a/[^/]+/)?file/d/${ID_RE}`) },
    { kind: "file",         re: new RegExp(`drive\\.google\\.com/(?:open|uc)\\?(?:[^"'\\s]*&)?id=${ID_RE}`) },
    { kind: "document",     re: new RegExp(`docs\\.google\\.com/document/d/${ID_RE}`) },
    { kind: "spreadsheets", re: new RegExp(`docs\\.google\\.com/spreadsheets/d/${ID_RE}`) },
    { kind: "presentation", re: new RegExp(`docs\\.google\\.com/presentation/d/${ID_RE}`) },
  ];
  const LINK_SELECTOR = [
    'a[href*="drive.google.com/file/d/"]',
    'a[href*="drive.google.com/open?"]',
    'a[href*="docs.google.com/document/d/"]',
    'a[href*="docs.google.com/spreadsheets/d/"]',
    'a[href*="docs.google.com/presentation/d/"]',
  ].join(",");

  function parseTarget(str) {
    if (!str) return null;
    for (const p of PATTERNS) {
      const m = str.match(p.re);
      if (m) return { kind: p.kind, id: m[1] };
    }
    return null;
  }

  function getAuthuser(href) {
    const m = location.pathname.match(/\/u\/(\d+)\//);
    if (m) return m[1];
    const m2 = (href || "").match(/[?&]authuser=([^&#]+)/);
    return m2 ? decodeURIComponent(m2[1]) : "0";
  }

  const norm = (s) => (s || "").replace(/\s+/g, " ").trim();

  let toastTimer;
  function toast(text) {
    let el = document.getElementById("cdl-toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "cdl-toast";
      document.documentElement.appendChild(el);
    }
    el.textContent = text;
    el.classList.add("cdl-show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("cdl-show"), 2500);
  }

  function download(target, href) {
    if (!target) {
      toast("ファイルを特定できませんでした");
      return;
    }
    chrome.runtime.sendMessage(
      { type: "cdl-download", kind: target.kind, id: target.id, authuser: getAuthuser(href) },
      (res) => {
        if (chrome.runtime.lastError || !res?.ok) {
          toast("ダウンロードに失敗しました: " + (res?.error || chrome.runtime.lastError?.message || ""));
        } else {
          toast("ダウンロードを開始しました");
        }
      }
    );
  }

  function makeBtn(className, label, title) {
    const b = document.createElement("button");
    b.type = "button";
    if (className) b.className = className;
    b.textContent = label;
    b.title = title;
    for (const ev of ["mousedown", "mouseup", "pointerdown", "pointerup", "keydown"]) {
      b.addEventListener(ev, (e) => e.stopPropagation(), true);
    }
    return b;
  }

  // ページ内の添付ファイル一覧 { target, href, title, el }
  function getAttachments() {
    const list = [];
    for (const a of document.querySelectorAll(LINK_SELECTOR)) {
      const target = parseTarget(a.href);
      if (!target) continue;
      list.push({
        target,
        href: a.href,
        title: norm(a.getAttribute("title") || a.innerText),
        aria: norm(a.getAttribute("aria-label")),
        el: a,
      });
    }
    return list;
  }

  // ---------- オーバーレイ層（Classroom の DOM に手を入れない） ----------
  // Classroom は描画し直すたびに子要素を消すので、ボタンは body 直下の別レイヤーに置き、
  // 添付ファイルの位置に合わせて表示する。
  const layer = document.createElement("div");
  layer.id = "cdl-layer";
  const inlineBtns = new Map(); // id -> button

  const floatBtn = makeBtn("", "⬇ ダウンロード", "表示中のファイルをダウンロード");
  floatBtn.id = "cdl-float-btn";

  function ensureLayer() {
    if (!layer.isConnected) document.documentElement.appendChild(layer);
    if (!floatBtn.isConnected) document.documentElement.appendChild(floatBtn);
  }

  // ---------- プレビュー（Drive ビューア）の検出 ----------
  let lastClicked = null;     // 最後にクリックされた添付
  let viewerInfo = null;      // iframe 内スクリプトからの情報 { names, ids, at }

  document.addEventListener("click", (e) => {
    if (e.target.closest?.("#cdl-layer, #cdl-float-btn")) return;
    const a = e.target.closest?.(LINK_SELECTOR);
    if (a) {
      const t = parseTarget(a.href);
      if (t) lastClicked = { target: t, href: a.href };
    }
  }, true);

  window.addEventListener("message", (e) => {
    if (e.origin !== "https://drive.google.com") return;
    const d = e.data;
    if (!d || !d.cdlViewer) return;
    viewerInfo = { names: (d.names || []).map(norm), ids: new Set(d.ids || []) };
    refresh();
  });

  function findViewerFrame() {
    for (const f of document.querySelectorAll("iframe")) {
      const src = f.getAttribute("src") || "";
      if (!/drive\.google\.com\/(viewer|file)/.test(src)) continue;
      if (f.offsetWidth > 300 && f.offsetHeight > 300) return f;
    }
    return null;
  }

  // 表示中ファイルを特定：① ファイル名一致 → ② ID 一致（1件だけ） → ③ 最後にクリックした添付
  function currentViewerTarget(atts) {
    if (viewerInfo) {
      for (const at of atts) {
        if (!at.title) continue;
        if (viewerInfo.names.some((n) => n === at.title || n.includes(at.title) || (at.title.includes(n) && n.length > 5))) return at;
      }
      const hits = atts.filter((at) => viewerInfo.ids.has(at.target.id));
      if (new Set(hits.map((h) => h.target.id)).size === 1) return hits[0];
    }
    if (lastClicked) return { target: lastClicked.target, href: lastClicked.href };
    if (atts.length === 1) return atts[0];
    return null;
  }

  let floatTarget = null;
  floatBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    download(floatTarget?.target, floatTarget?.href);
  }, true);

  // ---------- 描画更新 ----------
  function update() {
    ensureLayer();
    const atts = getAttachments();
    const viewer = findViewerFrame();

    // プレビュー画面のボタン
    if (viewer) {
      floatTarget = currentViewerTarget(atts);
      floatBtn.classList.add("cdl-show");
      floatBtn.classList.toggle("cdl-unknown", !floatTarget);
    } else {
      floatBtn.classList.remove("cdl-show");
      viewerInfo = null;
    }

    // 添付ファイル横のボタン（プレビュー中は隠す）
    const seen = new Set();
    for (const at of atts) {
      const id = at.target.id;
      if (seen.has(id)) continue;
      const r = at.el.getBoundingClientRect();
      if (r.width < 20 || r.height < 10) continue;
      seen.add(id);
      let b = inlineBtns.get(id);
      if (!b) {
        b = makeBtn("cdl-inline-btn", "⬇", "このファイルをダウンロード");
        b.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          const cur = b._cdl;
          download(cur.target, cur.href);
        }, true);
        inlineBtns.set(id, b);
        layer.appendChild(b);
      }
      b._cdl = at;
      const size = 30;
      b.style.left = `${Math.round(r.right - size - 8)}px`;
      b.style.top = `${Math.round(r.top + (r.height - size) / 2)}px`;
      const offscreen = r.bottom < 0 || r.top > window.innerHeight;
      b.style.display = viewer || offscreen ? "none" : "flex";
    }
    for (const [id, b] of inlineBtns) {
      if (!seen.has(id)) {
        b.remove();
        inlineBtns.delete(id);
      }
    }
  }

  let scheduled = false;
  function refresh() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      update();
    });
  }

  new MutationObserver(refresh).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("scroll", refresh, { capture: true, passive: true });
  window.addEventListener("resize", refresh, { passive: true });
  setInterval(refresh, 700);
  refresh();
})();
