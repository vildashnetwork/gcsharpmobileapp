// HTML template for the in-app PDF viewer.
// Loads PDF.js from CDN, renders each page as a canvas + selectable text layer,
// and posts window selection to React Native via ReactNativeWebView.postMessage.
export function pdfHtml(pdfUrl: string, page = 1): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=3.0" />
<style>
  * { box-sizing: border-box; }
  html, body { margin:0; padding:0; background:#F3F4F6; font-family: -apple-system, Roboto, sans-serif; -webkit-user-select: text; user-select: text; }
  #wrap { padding: 12px; }
  .page { margin: 0 auto 12px; position: relative; background: #fff; box-shadow: 0 2px 8px rgba(15,23,42,0.1); border-radius: 8px; overflow: hidden; }
  .page canvas { display:block; width:100%; height:auto; }
  .textLayer { position:absolute; left:0; top:0; right:0; bottom:0; overflow:hidden; opacity:0.2; line-height:1.0; color: transparent; }
  .textLayer > span { color: transparent; position: absolute; white-space: pre; cursor: text; transform-origin: 0% 0%; }
  ::selection { background: rgba(37,99,235,0.35); color: transparent; }
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
  <div id="popup">
    <button class="primary" id="askBtn">Ask GC AI</button>
    <button class="warn" id="videoBtn">Video</button>
    <button class="ghost" id="saveBtn">Draft</button>
  </div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
<script>
  const PDF_URL = ${JSON.stringify(pdfUrl)};
  const START_PAGE = ${page};
  const post = (msg) => window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(msg));
  pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

  let currentSelection = "";
  let currentPage = START_PAGE;
  let selectionTimer = null;

  async function render() {
    const wrap = document.getElementById("wrap");
    try {
      const pdf = await pdfjsLib.getDocument(PDF_URL).promise;
      wrap.innerHTML = "";
      post({ type: "meta", pages: pdf.numPages });
      const containerWidth = Math.min(window.innerWidth - 24, 1100);
      // Render at devicePixelRatio for crisp text/graphics on retina screens
      const outputScale = Math.max(2, window.devicePixelRatio || 2);
      for (let n = 1; n <= pdf.numPages; n++) {
        const page = await pdf.getPage(n);
        const baseViewport = page.getViewport({ scale: 1 });
        const displayScale = containerWidth / baseViewport.width;
        const viewport = page.getViewport({ scale: displayScale });
        const pageEl = document.createElement("div");
        pageEl.className = "page";
        pageEl.style.width = viewport.width + "px";
        pageEl.style.height = viewport.height + "px";
        pageEl.dataset.page = String(n);

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
        wrap.appendChild(pageEl);

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
        pageEl.addEventListener("click", () => { currentPage = n; });
      }
    } catch (e) {
      wrap.innerHTML = '<div id="err">Failed to load PDF: ' + (e.message || e) + '</div>';
      post({ type: "error", message: String(e.message || e) });
    }
  }

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

  render();
</script>
</body>
</html>`;
}
