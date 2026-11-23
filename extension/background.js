// File Download for Google Classroom - background (service worker)

function buildUrl({ kind, id, authuser }) {
  const au = encodeURIComponent(authuser ?? "0");
  switch (kind) {
    case "document":      // Google ドキュメント → Word
      return `https://docs.google.com/document/d/${id}/export?format=docx&authuser=${au}`;
    case "spreadsheets":  // Google スプレッドシート → Excel
      return `https://docs.google.com/spreadsheets/d/${id}/export?format=xlsx&authuser=${au}`;
    case "presentation":  // Google スライド → PowerPoint
      return `https://docs.google.com/presentation/d/${id}/export/pptx?authuser=${au}`;
    default:              // アップロードされた PDF / docx / pptx など
      return `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t&authuser=${au}`;
  }
}

const decode = (s) =>
  s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

// 「ウイルス スキャンを実行できません」等の確認ページから、本当のダウンロード URL を組み立てる
function urlFromConfirmPage(html, baseUrl) {
  const forms = [...html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)];
  for (const [, attrs, inner] of forms) {
    const action = (attrs.match(/action="([^"]*)"/i) || [])[1];
    if (!action || !/download|\/uc\b/.test(action)) continue;
    const url = new URL(decode(action), baseUrl);
    for (const [tag] of inner.matchAll(/<input\b[^>]*>/gi)) {
      const name = (tag.match(/name="([^"]*)"/i) || [])[1];
      const value = (tag.match(/value="([^"]*)"/i) || [])[1] ?? "";
      if (name) url.searchParams.set(decode(name), decode(value));
    }
    return url.toString();
  }
  // フォームが無い形式：ページ内の download リンク（confirm/uuid 付き）を探す
  const href = (html.match(/href="([^"]*\/(?:download|uc)\?[^"]*(?:confirm|uuid)=[^"]*)"/i) || [])[1];
  return href ? new URL(decode(href), baseUrl).toString() : null;
}

// 実際にファイルが返ってくる URL を求める（HTML が返ってきたら確認ページを読み解く）
async function resolveDownloadUrl(url) {
  for (let step = 0; step < 3; step++) {
    const ctrl = new AbortController();
    const res = await fetch(url, { credentials: "include", signal: ctrl.signal });
    const type = res.headers.get("content-type") || "";
    const disp = res.headers.get("content-disposition") || "";
    if (!type.includes("text/html") || disp.includes("attachment")) {
      ctrl.abort(); // 本体は読まない（ダウンロードは chrome.downloads に任せる）
      return { url: res.url || url };
    }
    const html = await res.text();
    const next = urlFromConfirmPage(html, res.url || url);
    if (!next || next === url) return { url: null };
    url = next;
  }
  return { url: null };
}

function startDownload(url) {
  return new Promise((resolve) => {
    chrome.downloads.download({ url, conflictAction: "uniquify" }, (downloadId) => {
      if (chrome.runtime.lastError || downloadId === undefined) {
        resolve({ ok: false, error: chrome.runtime.lastError?.message || "unknown" });
      } else {
        resolve({ ok: true });
      }
    });
  });
}

async function handleDownload(msg) {
  const url = buildUrl(msg);
  if (msg.kind !== "file") return startDownload(url);

  let resolved = null;
  try {
    resolved = (await resolveDownloadUrl(url)).url;
  } catch (e) {
    resolved = null;
  }
  if (resolved) return startDownload(resolved);

  // どうしても特定できないときは、Drive で開いて手動で保存してもらう
  const au = encodeURIComponent(msg.authuser ?? "0");
  await chrome.tabs.create({ url: `https://drive.google.com/file/d/${msg.id}/view?authuser=${au}` });
  return { ok: false, error: "自動で保存できなかったため、新しいタブで開きました" };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== "cdl-download") return;
  handleDownload(msg).then(sendResponse, (e) => sendResponse({ ok: false, error: String(e) }));
  return true; // async
});
