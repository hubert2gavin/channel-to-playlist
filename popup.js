const KEY = 'ytcpState', SCAN = 'ytcpScan', MAX = 5000;
const $ = (id) => document.getElementById(id);
let scanned = null; // {channel, kind, url, videos:[{id,title}]}

async function state() { return (await chrome.storage.local.get(KEY))[KEY] || {}; }
async function patch(p) { const s = await state(); await chrome.storage.local.set({ [KEY]: Object.assign(s, p) }); }
async function activeYt() { return (await chrome.tabs.query({ active: true, currentWindow: true, url: 'https://www.youtube.com/*' }))[0]; }
async function anyYt() { return (await activeYt()) || (await chrome.tabs.query({ url: 'https://www.youtube.com/*' }))[0]; }
function showErr(msg) { $('err').textContent = msg || ''; $('err').hidden = !msg; if (msg) $('jobBody').hidden = false, $('noJob').hidden = true; }
let flash = '';
async function send(cmd, activeOnly) {
  const t = activeOnly ? await activeYt() : await anyYt();
  if (!t) { flash = activeOnly ? 'Switch to the YouTube channel tab, then open this popup again.' : 'Open youtube.com (signed in) in a tab first.'; setHint(flash); return null; }
  try { return await chrome.tabs.sendMessage(t.id, { cmd }); }
  catch (e) { flash = "Can't reach the YouTube tab. Reload it (F5) and try again."; setHint(flash); return null; }
}
function setHint(t) { $('scrollOut').textContent = t; }
function ordered() { if (!scanned) return []; const v = scanned.videos.slice(); return $('reverse').checked ? v.reverse() : v; }

function li(n, t) { const e = document.createElement('li'); const a = document.createElement('span'); a.className = 'n'; a.textContent = n; const b = document.createElement('span'); b.className = 't'; b.textContent = t || '(untitled)'; b.title = t || ''; e.append(a, b); return e; }
function renderPreview() {
  const has = !!(scanned && scanned.videos.length);
  $('empty').hidden = has; $('result').hidden = !has;
  if (scanned && !has) setHint('No videos found on this page. Open a channel\u2019s Videos, Live or Shorts tab and scroll down a little.');
  $('scan').querySelector('span').textContent = scanned ? 'Scan again' : 'Scan page';
  $('startNew').disabled = !has;
  if (!has) return;
  const v = ordered();
  $('count').textContent = v.length.toLocaleString();
  $('countLabel').textContent = (v.length === 1 ? 'video' : 'videos') + ($('reverse').checked ? ', reversed' : ', in page order') + (scanned.kind ? ` \u00b7 /${scanned.kind}` : '');
  const ol = $('preview'); ol.textContent = '';
  const idx = v.length > 6 ? [0, 1, 2, -1, v.length - 3, v.length - 2, v.length - 1] : v.map((_, i) => i);
  for (const i of idx) { if (i < 0) { const g = document.createElement('li'); g.className = 'gap'; g.textContent = '\u22ef'; ol.append(g); } else ol.append(li(i + 1, v[i].title)); }
  const over = $('result').querySelector('.warnline'); if (over) over.remove();
  if (v.length > MAX) { const p = document.createElement('p'); p.className = 'warnline'; p.textContent = `YouTube playlists hold at most ${MAX.toLocaleString()} videos; only the first ${MAX.toLocaleString()} will be added.`; ol.after(p); }
  $('startLabel').textContent = `Create playlist with ${Math.min(v.length, MAX).toLocaleString()} videos`;
}
function unfinished(s) { return s && (s.videoIds || []).length && s.status !== 'done' && (s.playlistId || s.nextIndex > 0 || s.status === 'running'); }
const LABEL = { idle: 'Ready', running: 'Adding', paused: 'Paused', done: 'Done', error: 'Stopped' };

async function render() {
  const s = await state(), total = (s.videoIds || []).length, st = total ? (s.status || 'idle') : 'idle', n = s.nextIndex || 0;
  $('pill').dataset.state = st; $('pill').textContent = total ? `${LABEL[st] || st}${st === 'running' || st === 'paused' ? ` ${Math.floor(n / total * 100)}%` : ''}` : 'Idle';
  document.querySelector('.job').dataset.state = st;
  $('noJob').hidden = !!total; $('jobBody').hidden = !total;
  if (total) {
    $('jobTitle').textContent = s.title || 'Untitled playlist';
    $('fill').style.transform = 'scaleX(' + (n / total) + ')';
    $('meter').setAttribute('aria-valuemax', total); $('meter').setAttribute('aria-valuenow', n);
    $('progress').textContent = `${n.toLocaleString()} / ${total.toLocaleString()}` + ((s.skipped || []).length ? ` \u00b7 ${s.skipped.length} skipped` : '');
    let eta = '';
    if (st === 'running' && s.addedThisRun > 2 && s.runStartedAt) { const m = Math.round((Date.now() - s.runStartedAt) / s.addedThisRun * (total - n) / 60000); eta = `about ${m >= 60 ? Math.floor(m / 60) + 'h ' : ''}${m % 60}m left`; }
    else if (st === 'done') eta = 'Finished'; else if (st === 'paused') eta = 'Paused \u2014 press Resume';
    $('eta').textContent = eta;
    $('resume').disabled = st === 'running' || st === 'done'; $('pause').disabled = st !== 'running';
    $('resume').querySelector('svg').nextSibling.textContent = n > 0 || s.playlistId ? 'Resume' : 'Start';
    showErr(s.error);
    $('verifyOut').hidden = !s.verify; if (s.verify) { $('verifyOut').textContent = s.verify.msg; $('verifyOut').dataset.ok = !!s.verify.ok; }
    $('log').textContent = (s.log || []).join('\n') + ((s.skipped || []).length ? '\n\nSkipped:\n' + s.skipped.map(x => `#${x.n} ${x.id} \u2014 ${x.msg || ''}`).join('\n') : '') || 'Nothing yet.';
  }
  $('startNew').classList.toggle('demoted', !!unfinished(s));
  $('link').hidden = !s.playlistId; if (s.playlistId) $('link').href = 'https://www.youtube.com/playlist?list=' + encodeURIComponent(s.playlistId);
  const sc = (await chrome.storage.local.get('ytcpScroll')).ytcpScroll;
  const scrolling = !!(sc && sc.running);
  $('scroll').hidden = scrolling; $('stopScroll').hidden = !scrolling;
  if (scrolling) setHint(`Loading\u2026 ${sc.count} videos so far`);
  else if (sc && sc.count >= 0 && sc.done) setHint(`Finished loading: ${sc.count} videos. Press Scan again to refresh the list.`);
  else if (flash) setHint(flash);
}

async function startJob() {
  const ids = ordered().map(x => x.id).slice(0, MAX);
  await send('pause');
  await chrome.storage.local.set({ [KEY]: { videoIds: ids, title: $('title').value.trim() || scanned.channel, privacy: $('privacy').value,
    delayMs: Math.max(300, +$('delay').value || 1500), skipUnavailable: $('skip').checked, sourceUrl: scanned.url,
    nextIndex: 0, playlistId: null, status: 'idle', skipped: [], log: [], verify: null, error: null } });
  $('confirmBox').hidden = true;
  await send('start'); render();
}

(async () => {
  const s = await state();
  $('delay').value = s.delayMs || 1500; $('skip').checked = s.skipUnavailable !== false;
  scanned = (await chrome.storage.local.get(SCAN))[SCAN] || null;
  if (scanned) { $('title').value = scanned.channel || ''; $('title').dataset.auto = '1'; }
  renderPreview();
  $('reverse').onchange = renderPreview;
  $('scan').onclick = async () => {
    flash = ''; setHint(''); chrome.storage.local.remove('ytcpScroll'); $('scan').setAttribute('aria-busy', 'true');
    const r = await send('scan', true); $('scan').removeAttribute('aria-busy'); if (!r) return;
    scanned = r; chrome.storage.local.set({ [SCAN]: r });
    if (!$('title').value || $('title').dataset.auto === '1') { $('title').value = r.channel; $('title').dataset.auto = '1'; }
    renderPreview();
  };
  $('title').oninput = () => { $('title').dataset.auto = '0'; };
  $('scroll').onclick = () => { flash = ''; send('scroll', true); };
  $('stopScroll').onclick = () => send('stopScroll', true);
  $('startNew').onclick = async () => {
    const cur = await state();
    if (unfinished(cur)) { $('confirmText').textContent = `\u201c${cur.title}\u201d is unfinished (${cur.nextIndex}/${cur.videoIds.length}). Starting a new job discards its progress; the playlist stays on YouTube.`; $('confirmBox').hidden = false; $('confirmNo').focus(); return; }
    startJob();
  };
  $('confirmYes').onclick = startJob;
  $('confirmNo').onclick = () => { $('confirmBox').hidden = true; $('resume').focus(); };
  $('delay').onchange = () => patch({ delayMs: Math.max(300, +$('delay').value || 1500) });
  $('skip').onchange = () => patch({ skipUnavailable: $('skip').checked });
  $('resume').onclick = async () => { await patch({ error: null }); await send('start'); render(); };
  $('pause').onclick = () => send('pause');
  $('verify').onclick = async () => { $('verifyOut').hidden = false; $('verifyOut').textContent = 'Checking the playlist\u2026'; delete $('verifyOut').dataset.ok; const r = await send('verify'); if (r) { $('verifyOut').textContent = r.msg; $('verifyOut').dataset.ok = !!r.ok; } };
  $('reset').onclick = () => { $('resetBox').hidden = false; $('resetNo').focus(); };
  $('resetNo').onclick = () => { $('resetBox').hidden = true; };
  $('resetYes').onclick = async () => { await send('pause'); await chrome.storage.local.remove(KEY); $('resetBox').hidden = true; render(); };
  render(); setInterval(render, 1000);
})();
