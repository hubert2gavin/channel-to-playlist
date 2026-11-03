// Job runner: create playlist once, add videos one by one with backoff, resume, verify. Video list comes from state.videoIds (scanned).
// Pure job logic with injected dependencies so it can be unit-tested in Node.
// deps: api(path, body) -> {status, json, error}; load() -> state; save(state); sleep(ms); now(); random()
(function (root) {
  const DEFAULTS = { playlistId: null, nextIndex: 0, status: 'idle', error: null, skipped: [], title: '', videoIds: [],
    privacy: 'UNLISTED', delayMs: 1500, skipUnavailable: true, addedThisRun: 0, runStartedAt: null, heartbeat: 0, verify: null, log: [] };

  function errText(r) {
    if (r.error) return r.error;
    const j = r.json || {};
    return (j.error && (j.error.message || j.error.status)) || (j.actions && JSON.stringify(j.actions).slice(0, 300)) || ('HTTP ' + r.status + ' ' + JSON.stringify(j).slice(0, 300));
  }
  function classify(r) {
    if (r.status >= 200 && r.status < 300 && r.json && r.json.status === 'STATUS_SUCCEEDED') return 'ok';
    if (r.status === 0 || r.status === 429 || r.status >= 500) return 'retry';
    const t = errText(r).toLowerCase();
    if (/quota|rate|too many|try again later/.test(t)) return 'retry';
    if (r.status === 401 || r.status === 403 || /sign in|unauthenticated|login/.test(t)) return 'auth';
    if (r.status === 400 || r.status === 404 || (r.json && r.json.status === 'STATUS_FAILED') || /unavailable|not found|invalid/.test(t)) return 'video';
    return 'hard';
  }

  function findPlaylistId(j) { return j && (j.playlistId || (j.playlist && j.playlist.playlistId)); }

  function createRunner(deps) {
    let videos = [];
    let stopFlag = false, running = false;
    const log = async (s, msg) => { s.log = (s.log || []).concat(new Date(deps.now()).toISOString() + ' ' + msg).slice(-30); };

    async function withBackoff(s, fn) {
      for (let attempt = 0; ; attempt++) {
        const r = await fn(); const c = classify(r);
        if (c !== 'retry' || attempt >= 6) return { r, c };
        const wait = Math.min(300000, 2000 * Math.pow(2, attempt)) * (1 + deps.random() * 0.3);
        await log(s, `retry in ${Math.round(wait / 1000)}s: ${errText(r)}`); await deps.save(s);
        await deps.sleep(wait); if (stopFlag) return { r, c: 'paused' };
      }
    }

    async function ensurePlaylist(s) {
      if (s.playlistId) return true;
      const body = { title: s.title, privacyStatus: s.privacy, videoIds: [] };
      let { r } = await withBackoff(s, () => deps.api('/youtubei/v1/playlist/create', body));
      let pid = findPlaylistId(r.json);
      if (!pid) { // some sources create with the first video included; fall back to that
        ({ r } = await withBackoff(s, () => deps.api('/youtubei/v1/playlist/create', Object.assign({}, body, { videoIds: [videos[0]] }))));
        pid = findPlaylistId(r.json);
        if (pid) { s.playlistId = pid; s.nextIndex = 1; await log(s, 'created playlist (with first video) ' + pid); await deps.save(s); return true; }
        s.status = 'error'; s.error = 'Playlist create failed: ' + errText(r); await deps.save(s); return false;
      }
      s.playlistId = pid; await log(s, 'created playlist ' + pid); await deps.save(s); return true;
    }

    async function start() {
      if (running) return; running = true; stopFlag = false;
      const s = Object.assign({}, DEFAULTS, await deps.load()); videos = s.videoIds || [];
      if (!videos.length) { s.status = 'error'; s.error = 'No scanned video list - Scan the channel page first.'; await deps.save(s); running = false; return; }
      s.status = 'running'; s.error = null; s.addedThisRun = 0; s.runStartedAt = deps.now(); s.heartbeat = deps.now(); await deps.save(s);
      try {
        if (!(await ensurePlaylist(s))) return;
        while (s.nextIndex < videos.length) {
          if (stopFlag) { s.status = 'paused'; await deps.save(s); return; }
          const vid = videos[s.nextIndex];
          const { r, c } = await withBackoff(s, () => deps.api('/youtubei/v1/browse/edit_playlist',
            { playlistId: s.playlistId, actions: [{ action: 'ACTION_ADD_VIDEO', addedVideoId: vid }] }));
          if (c === 'paused') { s.status = 'paused'; await deps.save(s); return; }
          if (c === 'ok') { s.nextIndex++; s.addedThisRun++; }
          else if (c === 'video' && s.skipUnavailable) { s.skipped = s.skipped.concat({ n: s.nextIndex + 1, id: vid, msg: errText(r) }); s.nextIndex++; await log(s, `skipped #${s.nextIndex} ${vid}: ${errText(r)}`); }
          else { s.status = 'error'; s.error = `Stopped at #${s.nextIndex + 1} (${vid}) [${c}]: ${errText(r)}` + (c === 'retry' ? ' - possibly a daily limit; press Resume later (e.g. tomorrow).' : ''); await deps.save(s); return; }
          s.heartbeat = deps.now(); await deps.save(s);
          if (s.nextIndex < videos.length) await deps.sleep(s.delayMs * (0.8 + deps.random() * 0.6));
        }
        s.status = 'done'; await log(s, 'all videos processed'); await deps.save(s);
      } finally { running = false; }
    }

    function pause() { stopFlag = true; }

    async function verify() {
      const s = Object.assign({}, DEFAULTS, await deps.load()); videos = s.videoIds || [];
      if (!s.playlistId) return { ok: false, msg: 'No playlist yet' };
      const got = []; let body = { browseId: 'VL' + s.playlistId }; let pages = 0;
      while (body && pages < 200) {
        pages++;
        const { r, c } = await withBackoff(s, () => deps.api('/youtubei/v1/browse', body));
        if (r.status !== 200 || !r.json) return { ok: false, msg: 'browse failed: ' + errText(r) };
        let token = null;
        (function walk(o) {
          if (!o || typeof o !== 'object') return;
          if (Array.isArray(o)) return o.forEach(walk);
          if (o.playlistVideoRenderer && o.playlistVideoRenderer.videoId) got.push(o.playlistVideoRenderer.videoId);
          if (o.continuationItemRenderer) { const ce = o.continuationItemRenderer.continuationEndpoint; const t = ce && ce.continuationCommand && ce.continuationCommand.token; if (t) token = t; }
          for (const k in o) if (k !== 'playlistVideoRenderer') walk(o[k]);
        })(r.json);
        body = token ? { continuation: token } : null;
        if (body) await deps.sleep(500);
      }
      const skippedIds = new Set((s.skipped || []).map(x => x.id));
      const expected = videos.slice(0, s.nextIndex).filter(v => !skippedIds.has(v));
      let firstMismatch = -1;
      for (let i = 0; i < Math.max(expected.length, got.length); i++) if (expected[i] !== got[i]) { firstMismatch = i; break; }
      const res = { ok: firstMismatch === -1, expected: expected.length, got: got.length, firstMismatch,
        msg: firstMismatch === -1 ? `OK: ${got.length} videos in exact order` : `Mismatch at position ${firstMismatch + 1}: expected ${expected[firstMismatch]} got ${got[firstMismatch]} (expected ${expected.length}, playlist has ${got.length}; note YouTube hides unavailable/private videos from the list)` };
      s.verify = res; await deps.save(s); return res;
    }

    return { start, pause, verify, isRunning: () => running };
  }

  root.YTCPRunner = { createRunner, classify, DEFAULTS };
  if (typeof module !== 'undefined') module.exports = root.YTCPRunner;
})(typeof window !== 'undefined' ? window : globalThis);
