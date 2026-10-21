// HTML template for the in-app PDF viewer.
// Renders each page as a canvas + selectable text layer, and posts window
// selection to React Native via ReactNativeWebView.postMessage.
//
// OFFLINE SUPPORT: the pdf.js runtime is bundled with the app (assets/pdf/)
// and inlined into the HTML, so no CDN is needed. The PDF itself can be
// passed either as a URL (online) or as a base64 data URI (offline, from
// the on-device byte cache).
export function pdfHtml(
  pdfUrl: string,
  page = 1,
  opts: { pdfjsRuntime?: string; pdfjsWorker?: string; interactive?: boolean } = {}
): string {
  // The runtime is normally inlined by the caller (app/pdf.tsx resolves the
  // bundled assets). If it wasn't provided, fall back to the CDN so the
  // viewer still works online.
  const runtimeTag = opts.pdfjsRuntime
    ? `<script>${opts.pdfjsRuntime}</script>`
    : `<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>`;
  const workerSetup = opts.pdfjsWorker
    ? `try {
      const workerBlob = new Blob([${JSON.stringify(opts.pdfjsWorker)}], { type: "application/javascript" });
      pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(workerBlob);
    } catch (e) { pdfjsLib.GlobalWorkerOptions.workerSrc = ""; }`
    : `pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";`;
  const popupMarkup = opts.interactive === false ? "" : `
  <div id="popup">
    <button class="primary" id="askBtn">Ask GC AI</button>
    <button class="warn" id="videoBtn">Video</button>
    <button class="ghost" id="saveBtn">Draft</button>
  </div>`;
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=3.0" />
<style>
  * { box-sizing: border-box; }
  html, body {
    margin:0; padding:0; background:#F3F4F6; font-family: -apple-system, Roboto, sans-serif;
    -webkit-user-select: text; user-select: text;
    /* Suppress the NATIVE copy/cut/share menu that Android/iOS WebViews show on selection */
    -webkit-touch-callout: none;
    -webkit-tap-highlight-color: transparent;
  }
  /* Also suppress it on the selectable text layer itself */
  .textLayer, .textLayer > span {
    -webkit-touch-callout: none;
    -webkit-user-select: text; user-select: text;
    -webkit-touch-callout: none;
  }
  #wrap { padding: 12px; }
  .page { margin: 0 auto 12px; position: relative; background: #fff; box-shadow: 0 2px 8px rgba(15,23,42,0.1); border-radius: 8px; overflow: hidden; }
  .page canvas { display:block; width:100%; height:auto; }
  .textLayer {
    position:absolute; left:0; top:0; right:0; bottom:0; overflow:hidden;
    line-height:1.0; color: transparent;
    will-change: transform; /* smoother scroll/selection on low-end devices */
  }
  .textLayer > span { color: transparent; position: absolute; white-space: pre; cursor: text; transform-origin: 0% 0%; }
  /* Highlight styling for our custom (in-app) selection so it's clearly visible */
  .textLayer ::selection { background: rgba(37,99,235,0.4); color: transparent; }
  ::selection { background: rgba(37,99,235,0.4); color: transparent; }
  #load { text-align:center; padding:30px; color:#64748B; font-size:14px; }
  #err { text-align:center; padding:30px; color:#EF4444; font-size:14px; }
  #popup {
    position: fixed; z-index: 9999; display:none; flex-direction:row; gap:6px;
    background: #0A192F; color:#fff; border-radius: 12px; padding: 8px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.35);
    left: 50%; top: 12px; max-width: calc(100vw - 16px);
    transform: translateX(-50%);
  }
  #popup button {
    background: transparent; border: 0; color:#fff; padding: 6px 10px; font-weight:700; font-size:13px;
    border-radius: 8px;
    -webkit-user-select: none; user-select: none; -webkit-touch-callout: none;
  }
  #popup button.primary { background:#2563EB; }
  #popup button.warn { background:#F59E0B; color:#0A192F; }
  #popup button.ghost { background:rgba(255,255,255,0.1); }
</style>
</head>
<body>
  <div id="wrap"><div id="load">Loading PDF…</div></div>
${popupMarkup}
${runtimeTag}
<script>
  const PDF_URL = ${JSON.stringify(pdfUrl)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")};
  const START_PAGE = ${page};
  const INTERACTIVE = ${opts.interactive !== false};
  const post = (msg) => window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(msg));
  ${workerSetup}

  let currentSelection = "";
  let currentPage = START_PAGE;
  let selectionTimer = null;

  // === BLOCK the native copy/cut/share action bar ===
  // Android WebView (and iOS) triggers the native text-selection toolbar
  // (Copy / Cut / Share / Web Search) whenever a long-press selection ends.
  // Intercepting "contextmenu" prevents that toolbar from appearing, while
  // keeping DOM selection fully functional for our custom popup.
  document.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    e.stopPropagation();
    return false;
  }, true);

  // Belt & suspenders for older WebViews that ignore contextmenu prevention:
  // if the native menu still pops, clear the selection so the menu loses its target.
  document.addEventListener("touchend", () => {
    // no-op; selectionchange drives our custom popup. Kept hookable for testing.
  }, { passive: true });

  // Track which page is currently in view (for page attribution of selections)
  function updateCurrentPage() {
    const pages = document.querySelectorAll(".page");
    let best = currentPage;
    let bestVisible = -1;
    pages.forEach((el) => {
      const r = el.getBoundingClientRect();
      const visible = Math.max(0, Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0));
      if (visible > bestVisible) { bestVisible = visible; best = Number(el.dataset.page) || best; }
    });
    if (bestVisible > 0) currentPage = best;
  }
  window.addEventListener("scroll", updateCurrentPage, { passive: true });

  async function render() {
    const wrap = document.getElementById("wrap");
    try {
      const pdf = await pdfjsLib.getDocument(PDF_URL).promise;
      wrap.innerHTML = "";
      post({ type: "meta", pages: pdf.numPages });
      const containerWidth = Math.min(window.innerWidth - 24, 1100);
      // Render at devicePixelRatio for crisp text/graphics (capped for performance)
      const outputScale = Math.min(2, Math.max(1.5, window.devicePixelRatio || 1.5));

      // === OPTIMIZED RENDERING: build placeholders for ALL pages up-front, but
      // only render canvas + text layer for pages that scroll into view
      // (lazy rendering). This keeps long papers responsive and selection snappy.
      const renderPage = async (n, pageEl) => {
        const page = await pdf.getPage(n);
        const baseViewport = page.getViewport({ scale: 1 });
        const displayScale = containerWidth / baseViewport.width;
        const viewport = page.getViewport({ scale: displayScale });
        // Correct the placeholder size (some pages have different dimensions)
        pageEl.style.width = viewport.width + "px";
        pageEl.style.height = viewport.height + "px";

        const canvas = document.createElement("canvas");
        // internal resolution = display * DPR for sharpness
        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = viewport.width + "px";
        canvas.style.height = viewport.height + "px";
        const ctx = canvas.getContext("2d");
        pageEl.appendChild(canvas);

        const textLayer = document.createElement("div");
        textLayer.className = "textLayer";
        textLayer.style.width = viewport.width + "px";
        textLayer.style.height = viewport.height + "px";
        pageEl.appendChild(textLayer);

        const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null;
        await page.render({
          canvasContext: ctx,
          viewport,
          transform,
          intent: "display",
        }).promise;

        const textContent = await page.getTextContent();
        pdfjsLib.renderTextLayer({
          textContent, container: textLayer, viewport, textDivs: []
        });
        pageEl.dataset.rendered = "1";
      };

      // Lazily render pages as they approach the viewport (rootMargin gives
      // a head start so pages are ready before the user reaches them).
      const io = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !entry.target.dataset.rendered) {
            const n = Number(entry.target.dataset.page);
            const el = entry.target;
            io.unobserve(el);
            renderPage(n, el).catch((err) => console.warn("page render failed", err));
          }
        });
      }, { rootMargin: "600px 0px" });

      // Use the first page's dimensions to size all placeholders cheaply
      // (avoids calling getPage() for every page up-front, which is slow for
      // large PDFs). Real dimensions are applied lazily during renderPage().
      const firstPageProxy = await pdf.getPage(1);
      const proxyBase = firstPageProxy.getViewport({ scale: 1 });
      const proxyViewport = firstPageProxy.getViewport({ scale: containerWidth / proxyBase.width });
      for (let n = 1; n <= pdf.numPages; n++) {
        const pageEl = document.createElement("div");
        pageEl.className = "page";
        pageEl.style.width = proxyViewport.width + "px";
        pageEl.style.height = proxyViewport.height + "px";
        pageEl.dataset.page = String(n);
        pageEl.addEventListener("click", () => { currentPage = n; });
        wrap.appendChild(pageEl);
        io.observe(pageEl);
      }
      // Immediately render the first couple of pages so the viewer isn't blank.
      const firstPageEl = wrap.querySelector('[data-page="' + START_PAGE + '"]');
      if (firstPageEl) {
        io.unobserve(firstPageEl);
        renderPage(START_PAGE, firstPageEl).catch((err) => console.warn("page render failed", err));
      }
      const nextEl = wrap.querySelector('[data-page="' + (START_PAGE + 1) + '"]');
      if (nextEl) {
        io.unobserve(nextEl);
        renderPage(START_PAGE + 1, nextEl).catch((err) => console.warn("page render failed", err));
      }
    } catch (e) {
      wrap.innerHTML = '<div id="err">Failed to load PDF: ' + (e.message || e) + '</div>';
      post({ type: "error", message: String(e.message || e) });
    }
  }

  if (INTERACTIVE) {
    function hidePopup() {
      if (selectionTimer) clearTimeout(selectionTimer);
      document.getElementById("popup").style.display = "none";
      currentSelection = "";
    }

    function showPopupAt(text, x, y) {
      currentSelection = text;
      const p = document.getElementById("popup");
      p.style.display = "flex";
      const halfWidth = p.offsetWidth / 2;
      const horizontalPadding = 8;
      const safeX = Math.max(
        halfWidth + horizontalPadding,
        Math.min(window.innerWidth - halfWidth - horizontalPadding, x)
      );
      const aboveY = y - p.offsetHeight - horizontalPadding;
      const belowY = y + horizontalPadding;
      const safeY = aboveY >= horizontalPadding ? aboveY : belowY;
      p.style.left = safeX + "px";
      p.style.top = safeY + "px";
    }

    document.addEventListener("selectionchange", () => {
      const sel = window.getSelection();
      const text = sel && sel.toString().trim();
      if (!text || text.length < 3) { hidePopup(); return; }
      try {
        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top;
        hidePopup();
        selectionTimer = setTimeout(() => {
          const latestSelection = window.getSelection();
          if (latestSelection && latestSelection.toString().trim() === text) {
            showPopupAt(text, x, y);
          }
        }, 350);
      } catch (e) { hidePopup(); }
    });

    document.getElementById("askBtn").addEventListener("click", (e) => {
      e.stopPropagation();
      post({ type: "ask", text: currentSelection, page: currentPage });
      hidePopup();
      window.getSelection && window.getSelection().removeAllRanges();
    });
    document.getElementById("videoBtn").addEventListener("click", (e) => {
      e.stopPropagation();
      post({ type: "video", text: currentSelection, page: currentPage });
      hidePopup();
      window.getSelection && window.getSelection().removeAllRanges();
    });
    document.getElementById("saveBtn").addEventListener("click", (e) => {
      e.stopPropagation();
      post({ type: "draft", text: currentSelection, page: currentPage });
      hidePopup();
      window.getSelection && window.getSelection().removeAllRanges();
    });
  }

  render();
</script>
</body>
</html>`;
}
