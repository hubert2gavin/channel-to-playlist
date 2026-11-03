const assert = require('assert'); const { JSDOM } = require('jsdom');
const X = require('../extract.js'); const R = require('../runner.js');
const id = n => ('vid' + n).padEnd(11, '_');
const lockup = (n, t) => `<ytd-rich-item-renderer><div id="content"><yt-lockup-view-model><div><a class="yt-lockup-view-model__content-image" href="/watch?v=${id(n)}&pp=x"></a><h3 class="yt-lockup-metadata-view-model__title"><a href="/watch?v=${id(n)}">${t}</a></h3><a href="/@chan">chan</a></div></yt-lockup-view-model></div></ytd-rich-item-renderer>`;
const oldItem = (n, t) => `<ytd-rich-item-renderer><div id="content"><ytd-rich-grid-media><a id="thumbnail" href="/watch?v=${id(n)}"></a><a id="video-title-link" title="${t}" href="/watch?v=${id(n)}"><yt-formatted-string id="video-title">${t}</yt-formatted-string></a></ytd-rich-grid-media></div></ytd-rich-item-renderer>`;
const short = (n, t) => `<ytd-rich-item-renderer><ytm-shorts-lockup-view-model-v2><a href="/shorts/${id(n)}"></a><h3 class="shortsLockupViewModelHostOutsideMetadataTitle"><a href="/shorts/${id(n)}">${t}</a></h3></ytm-shorts-lockup-view-model-v2></ytd-rich-item-renderer>`;
const ad = `<ytd-rich-item-renderer><ytd-ad-slot-renderer><a href="/watch?v=ADVIDEO0000">Ad</a></ytd-ad-slot-renderer></ytd-rich-item-renderer>`;
const nonvid = `<ytd-rich-item-renderer><a href="/playlist?list=PLx">pl</a></ytd-rich-item-renderer><ytd-continuation-item-renderer></ytd-continuation-item-renderer>`;
const page = (inner, extra='') => new JSDOM(`<html><head><title>(3) Some Chan - YouTube</title><meta property="og:title" content="OG Chan"></head><body>
 <ytd-browse hidden><ytd-rich-grid-renderer><div id="contents">${lockup(99,'stale')}</div></ytd-rich-grid-renderer></ytd-browse>
 <ytd-browse>${extra}<ytd-rich-grid-renderer><div id="contents">${inner}</div></ytd-rich-grid-renderer></ytd-browse>
 <div id="sidebar"><a href="/watch?v=SIDEBAR0000">x</a></div></body></html>`).window.document;
// new lockup + old markup mixed, ad, dupe, non-video
let d = page(lockup(1,'One') + ad + oldItem(2,'Two') + nonvid + lockup(1,'One dup') + lockup(3,'Three'), '<yt-page-header-view-model><h1><span>Header Chan</span></h1></yt-page-header-view-model>');
let v = X.extractVideos(d);
assert.deepStrictEqual(v.map(x=>x.id), [id(1), id(2), id(3)]); assert.deepStrictEqual(v.map(x=>x.title), ['One','Two','Three']);
assert.strictEqual(X.channelName(d), 'Header Chan');
d = page(short(1,'S1') + short(2,'S2') + short(1,'S1'));
assert.deepStrictEqual(X.extractVideos(d).map(x=>x.id), [id(1), id(2)]); assert.strictEqual(X.extractVideos(d)[1].title, 'S2');
assert.strictEqual(X.channelName(d), 'OG Chan');
// fallback for unknown markup
d = page('<foo-tile><a href="/watch?v='+id(7)+'">A</a></foo-tile><foo-tile><a href="/shorts/'+id(8)+'">B</a></foo-tile>');
assert.deepStrictEqual(X.extractVideos(d).map(x=>x.id), [id(7), id(8)]);
d.querySelector('meta').remove(); assert.strictEqual(X.channelName(d), 'Some Chan');
assert.strictEqual(X.idFromHref('https://www.youtube.com/watch?v=abcdefghijk&t=3'), 'abcdefghijk'); assert.strictEqual(X.idFromHref('/watch?v=short'), null);
assert.strictEqual(X.pageKind('https://www.youtube.com/@h/videos?view=0&sort=da'), 'videos'); assert.strictEqual(X.pageKind('https://www.youtube.com/@h/streams'), 'streams');
console.log('extractor tests OK');
// mock job run
(async () => {
  const ids = [1,2,3,4,5].map(id); let st = { videoIds: ids, title: 'T', privacy: 'UNLISTED', delayMs: 10, skipUnavailable: true };
  const pl = []; let fail429 = 1;
  const api = async (p, b) => {
    if (p.endsWith('playlist/create')) return { status: 200, json: { playlistId: 'PL1' } };
    if (p.endsWith('edit_playlist')) { const v = b.actions[0].addedVideoId;
      if (v === id(3) && fail429-- > 0) return { status: 429, json: {} };
      if (v === id(4)) return { status: 400, json: { error: { message: 'Video unavailable' } } };
      pl.push(v); return { status: 200, json: { status: 'STATUS_SUCCEEDED' } }; }
    if (p.endsWith('/browse')) return { status: 200, json: { x: pl.map(v => ({ playlistVideoRenderer: { videoId: v } })) } };
  };
  const deps = { api, load: async () => JSON.parse(JSON.stringify(st)), save: async s => { st = JSON.parse(JSON.stringify(s)); }, sleep: async () => {}, now: () => Date.now(), random: () => 0.5 };
  // empty list guard
  const r0 = R.createRunner(Object.assign({}, deps, { load: async () => ({}), save: async s => { assert.strictEqual(s.status, 'error'); } })); await r0.start();
  const r = R.createRunner(deps);
  // pause after 2 then resume with a fresh runner (simulates reload)
  let calls = 0; const origSave = deps.save; deps.save = async s => { await origSave(s); if (s.nextIndex === 2 && calls++ === 0) r.pause(); };
  await r.start(); assert.strictEqual(st.status, 'paused'); assert.strictEqual(st.nextIndex, 2);
  deps.save = origSave; const r2 = R.createRunner(deps); await r2.start();
  assert.strictEqual(st.status, 'done'); assert.deepStrictEqual(pl, [id(1), id(2), id(3), id(5)]); assert.strictEqual(st.skipped.length, 1);
  const ver = await r2.verify(); assert.ok(ver.ok, ver.msg); console.log('job mock OK:', ver.msg);
})().catch(e => { console.error(e); process.exit(1); });
