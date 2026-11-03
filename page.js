// Runs in the youtube.com MAIN world: has access to ytcfg and document.cookie.
// Receives request messages from content.js (isolated world) and performs InnerTube calls.
(function () {
  if (window.__ytcpPageBridge) return; window.__ytcpPageBridge = true;
  const ORIGIN = 'https://www.youtube.com';
  let authMode = null; // 'u' (datasync-prefixed) or 'legacy'; learned on first success

  function cfg(k) { try { return window.ytcfg && (window.ytcfg.get ? window.ytcfg.get(k) : window.ytcfg.data_[k]); } catch (e) { return undefined; } }

  async function call(path, body, mode) {
    const key = cfg('INNERTUBE_API_KEY');
    const context = cfg('INNERTUBE_CONTEXT');
    if (!context) throw new Error('ytcfg INNERTUBE_CONTEXT not found - reload the YouTube tab');
    const cookies = YTCPAuth.parseCookies(document.cookie);
    const ts = Math.floor(Date.now() / 1000);
    const ds = cfg('DATASYNC_ID');
    const userId = mode === 'u' && ds ? String(ds).split('||')[0] : null;
    const auth = await YTCPAuth.buildAuthHeader(cookies, ORIGIN, ts, userId || null);
    if (!auth) throw new Error('SAPISID cookie not readable - are you signed in to YouTube?');
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': auth,
      'X-Origin': ORIGIN,
      'X-Goog-AuthUser': String(cfg('SESSION_INDEX') ?? '0'),
      'X-Youtube-Client-Name': String(cfg('INNERTUBE_CONTEXT_CLIENT_NAME') ?? '1'),
      'X-Youtube-Client-Version': String(cfg('INNERTUBE_CLIENT_VERSION') || (context.client && context.client.clientVersion) || ''),
    };
    const vd = (context.client && context.client.visitorData) || cfg('VISITOR_DATA');
    if (vd) headers['X-Goog-Visitor-Id'] = vd;
    const pageId = cfg('DELEGATED_SESSION_ID');
    if (pageId) headers['X-Goog-PageId'] = pageId;
    const url = path + '?prettyPrint=false' + (key ? '&key=' + encodeURIComponent(key) : '');
    const res = await fetch(url, { method: 'POST', credentials: 'include', headers, body: JSON.stringify(Object.assign({ context }, body)) });
    let json = null; try { json = await res.json(); } catch (e) {}
    return { status: res.status, json };
  }

  async function request(path, body) {
    const modes = authMode ? [authMode] : (cfg('DATASYNC_ID') ? ['u', 'legacy'] : ['legacy']);
    let last;
    for (const m of modes) {
      last = await call(path, body, m);
      if (last.status !== 401 && last.status !== 403) { authMode = m; return last; }
    }
    return last;
  }

  window.addEventListener('message', async (ev) => {
    if (ev.source !== window || !ev.data || ev.data.ytcp !== "req") return;
    const { id, path, body } = ev.data;
    try { const r = await request(path, body); window.postMessage({ ytcp: "res", id, status: r.status, json: r.json }, ORIGIN); }
    catch (e) { window.postMessage({ ytcp: "res", id, status: 0, error: String(e && e.message || e) }, ORIGIN); }
  });
})();
