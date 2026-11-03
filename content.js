// Isolated-world content script: scans the DOM, owns the job loop and chrome.storage; talks to page.js via postMessage.
// Persists across YouTube SPA navigation (scans happen on demand when the popup asks).
(function () {
  if (window.__ytcpContent) return; window.__ytcpContent = true;
  const KEY = 'ytcpState';
  let seq = 0; const pending = new Map();
  window.addEventListener('message', (ev) => {
    if (ev.source !== window || !ev.data || ev.data.ytcp !== 'res') return;
    const p = pending.get(ev.data.id); if (p) { pending.delete(ev.data.id); p(ev.data); }
  });
  function api(path, body) {
    return new Promise((resolve) => {
      const id = 'ytcp' + (++seq) + '_' + Math.random().toString(36).slice(2);
      const t = setTimeout(() => { pending.delete(id); resolve({ status: 0, error: 'timeout' }); }, 60000);
      pending.set(id, (d) => { clearTimeout(t); resolve(d); });
      window.postMessage({ ytcp: 'req', id, path, body }, location.origin);
    });
  }
  const deps = {
    api,
    load: async () => (await chrome.storage.local.get(KEY))[KEY] || {},
    save: async (s) => chrome.storage.local.set({ [KEY]: s }),
    sleep: (ms) => new Promise(r => setTimeout(r, ms)),
    now: () => Date.now(), random: Math.random,
  };
  const runner = YTCPRunner.createRunner(deps);
  deps.load().then(s => { if (s.status === 'running' && Date.now() - (s.heartbeat || 0) > 60000) deps.save(Object.assign(s, { status: 'paused' })); });

  function scan() {
    const vids = YTCPExtract.extractVideos(document);
    return { ok: true, url: location.href, kind: YTCPExtract.pageKind(location.href), channel: YTCPExtract.channelName(document), videos: vids };
  }
  // Auto-scroll: scroll to bottom until the count stops growing for ~4 rounds.
  let scrolling = false, scrollStop = false;
  async function autoScroll() {
    if (scrolling) return; scrolling = true; scrollStop = false;
    let last = -1, still = 0;
    try {
      while (!scrollStop && still < 4) {
        window.scrollTo(0, document.documentElement.scrollHeight);
        await deps.sleep(1500);
        const n = YTCPExtract.extractVideos(document).length;
        if (n === last) still++; else { still = 0; last = n; }
        chrome.storage.local.set({ ytcpScroll: { running: true, count: n } });
      }
    } finally { scrolling = false; chrome.storage.local.set({ ytcpScroll: { running: false, done: true, count: last } }); }
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    (async () => {
      const r = runner;
      if (msg.cmd === 'scan') sendResponse(scan());
      else if (msg.cmd === 'scroll') { autoScroll(); sendResponse({ ok: true }); }
      else if (msg.cmd === 'stopScroll') { scrollStop = true; sendResponse({ ok: true }); }
      else if (msg.cmd === 'start') { r.start(); sendResponse({ ok: true }); }
      else if (msg.cmd === 'pause') { r.pause(); sendResponse({ ok: true }); }
      else if (msg.cmd === 'verify') { sendResponse(await r.verify()); }
      else if (msg.cmd === 'ping') { sendResponse({ ok: true, running: r.isRunning() }); }
    })();
    return true;
  });
})();
