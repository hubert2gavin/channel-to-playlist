// DOM extractor: finds loaded video tiles on a channel Videos/Streams/Shorts tab in page order.
// Pure functions taking a Document so they can be unit-tested with jsdom.
(function (root) {
  const ID_RE = /^[A-Za-z0-9_-]{11}$/;
  const ITEM_SEL = 'ytd-rich-item-renderer, ytd-grid-video-renderer, ytd-video-renderer, ytd-reel-item-renderer, yt-lockup-view-model, ytm-shorts-lockup-view-model, ytm-shorts-lockup-view-model-v2';
  const AD_SEL = 'ytd-ad-slot-renderer, ytd-in-feed-ad-layout-renderer, ytd-promoted-video-renderer, ytd-display-ad-renderer, [is-ad], .ytd-ad-slot-renderer';

  function idFromHref(href) {
    if (!href) return null;
    let u; try { u = new URL(href, 'https://www.youtube.com'); } catch (e) { return null; }
    if (!/(^|\.)youtube\.com$/.test(u.hostname)) return null;
    if (u.pathname === '/watch') { const v = u.searchParams.get('v'); return v && ID_RE.test(v) ? v : null; }
    const m = u.pathname.match(/^\/shorts\/([A-Za-z0-9_-]{11})(?:[/?#]|$)/);
    return m ? m[1] : null;
  }

  // The SPA keeps old pages in the DOM hidden; pick the visible browse page's grid.
  function findRoot(doc) {
    const pages = Array.from(doc.querySelectorAll('ytd-browse'));
    const page = pages.find(p => !p.hasAttribute('hidden')) || pages[0] || doc;
    const grids = Array.from(page.querySelectorAll('ytd-rich-grid-renderer #contents, ytd-grid-renderer #items, ytd-section-list-renderer #contents'));
    return grids.find(g => g.querySelector('a[href]')) || page.querySelector('#primary') || page;
  }

  function cleanText(t) { return (t || '').replace(/\s+/g, ' ').trim(); }
  function titleOf(item, a) {
    const el = item.querySelector('#video-title, #video-title-link, .yt-lockup-metadata-view-model__title, [class*="lockup-metadata-view-model"][class*="title"], h3 a, h3, .shortsLockupViewModelHostOutsideMetadataTitle, [class*="shortsLockupViewModelHost"][class*="Title"]');
    return cleanText((el && (el.getAttribute('title') || el.textContent)) || (a && (a.getAttribute('title') || a.getAttribute('aria-label'))) || '');
  }
  function isAd(el) { return !!(el.matches && el.matches(AD_SEL)) || !!el.querySelector(AD_SEL) || !!(el.closest && el.closest(AD_SEL)); }

  function extractVideos(doc) {
    const root = findRoot(doc);
    const seen = new Set(), out = [];
    const push = (id, title) => { if (id && !seen.has(id)) { seen.add(id); out.push({ id, title }); } };
    // Outermost item tiles only (a rich-item contains a lockup; don't double count — dedupe handles it anyway).
    const items = Array.from(root.querySelectorAll(ITEM_SEL)).filter(el => !el.parentElement || !el.parentElement.closest(ITEM_SEL));
    for (const it of items) {
      if (isAd(it)) continue;
      const a = Array.from(it.querySelectorAll('a[href]')).find(x => idFromHref(x.getAttribute('href')));
      if (a) push(idFromHref(a.getAttribute('href')), titleOf(it, a));
    }
    // Resilient fallback for unknown markup: any watch/shorts anchor in the grid, DOM order.
    if (!out.length) {
      for (const a of root.querySelectorAll('a[href*="/watch?v="], a[href^="/shorts/"], a[href*="youtube.com/shorts/"]')) {
        if (isAd(a)) continue;
        const it = a.closest(ITEM_SEL) || a.parentElement || a;
        push(idFromHref(a.getAttribute('href')), titleOf(it, a));
      }
    }
    return out;
  }

  function channelName(doc) {
    const sels = ['ytd-browse:not([hidden]) yt-page-header-view-model h1', 'ytd-browse:not([hidden]) yt-dynamic-text-view-model h1',
      'ytd-browse:not([hidden]) ytd-c4-tabbed-header-renderer #channel-name #text', 'ytd-browse:not([hidden]) #channel-header ytd-channel-name #text',
      'yt-page-header-view-model h1', '#channel-header ytd-channel-name #text', 'ytd-channel-name #text'];
    for (const s of sels) { const e = doc.querySelector(s); const t = e && cleanText(e.textContent); if (t) return t; }
    const og = doc.querySelector('meta[property="og:title"]'); if (og && cleanText(og.content)) return cleanText(og.content);
    return cleanText((doc.title || '').replace(/^\(\d+\)\s*/, '').replace(/\s*-\s*YouTube\s*$/, '')) || 'Channel playlist';
  }

  function pageKind(href) {
    const p = new URL(href, 'https://www.youtube.com').pathname;
    const m = p.match(/\/(videos|streams|shorts|featured|playlists)\/?$/);
    return m ? m[1] : null;
  }

  root.YTCPExtract = { extractVideos, channelName, idFromHref, pageKind };
  if (typeof module !== 'undefined') module.exports = root.YTCPExtract;
})(typeof window !== 'undefined' ? window : globalThis);
