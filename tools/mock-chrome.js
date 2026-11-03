// Screenshot harness only (not shipped in the zip): fakes chrome.* with a preset state picked by ?state=
(function () {
  const titles = ['How I edit every video (2016)', 'First vlog from the new studio', 'Unboxing the camera that started it all', 'Studio tour, part 2', 'Answering your questions live', 'The one with the broken tripod', 'A very long title that keeps going to check how the preview list truncates gracefully', 'Year in review', 'Last upload before the break'];
  const videos = Array.from({ length: 412 }, (_, i) => ({ id: ('v' + i).padEnd(11, 'x'), title: titles[i % titles.length] }));
  const scan = { channel: 'Northwind Workshop', kind: 'videos', url: 'https://www.youtube.com/@northwind/videos', videos };
  const ids = videos.map(v => v.id), now = Date.now();
  const log = ['2026-11-02T20:10:01Z created playlist PLmock123', '2026-11-02T20:14:40Z skipped #87 vXXXXXXXXXX: Video unavailable'];
  const S = {
    idle: {},
    scanned: { ytcpScan: scan },
    running: { ytcpScan: scan, ytcpState: { videoIds: ids, title: 'Northwind Workshop', status: 'running', nextIndex: 173, playlistId: 'PLmock123', addedThisRun: 170, runStartedAt: now - 170 * 1700, skipped: [{ n: 87, id: 'vXXXXXXXXXX', msg: 'Video unavailable' }], log } },
    done: { ytcpScan: scan, ytcpState: { videoIds: ids, title: 'Northwind Workshop', status: 'done', nextIndex: 412, playlistId: 'PLmock123', skipped: [], log, verify: { ok: true, msg: 'OK: 412 videos in exact order' } } },
    error: { ytcpScan: scan, ytcpState: { videoIds: ids, title: 'Northwind Workshop', status: 'error', nextIndex: 268, playlistId: 'PLmock123', skipped: [], log,
      error: 'Stopped at #269 (v268xxxxxxx) [retry]: HTTP 429 - possibly a daily limit; press Resume later (e.g. tomorrow).' } },
  };
  const store = JSON.parse(JSON.stringify(S[new URLSearchParams(location.search).get('state') || 'idle']));
  window.chrome = {
    storage: { local: {
      get: async (k) => (k in store ? { [k]: store[k] } : {}),
      set: async (o) => Object.assign(store, o), remove: async (k) => { delete store[k]; } } },
    tabs: { query: async () => [{ id: 1 }], sendMessage: async (_id, m) => (m.cmd === 'scan' ? scan : { ok: true }) },
  };
})();
