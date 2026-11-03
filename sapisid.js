// SAPISIDHASH helpers used by page.js (also loadable in Node).
(function (root) {
  async function sha1Hex(str) {
    const buf = await root.crypto.subtle.digest('SHA-1', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  // Legacy form: SHA1("<ts> <SAPISID> <origin>") -> "<ts>_<hex>"
  // Newer form (seen 2025): SHA1("<datasyncUserId> <ts> <SAPISID> <origin>") -> "<ts>_<hex>_u"
  async function sapisidHash(sapisid, origin, ts, userId) {
    if (userId) return `${ts}_${await sha1Hex([userId, ts, sapisid, origin].join(' '))}_u`;
    return `${ts}_${await sha1Hex(`${ts} ${sapisid} ${origin}`)}`;
  }
  async function buildAuthHeader(cookies, origin, ts, userId) {
    const parts = [];
    const sap = cookies['SAPISID'] || cookies['__Secure-3PAPISID'];
    if (!sap) return null;
    parts.push('SAPISIDHASH ' + await sapisidHash(sap, origin, ts, userId));
    if (cookies['__Secure-1PAPISID']) parts.push('SAPISID1PHASH ' + await sapisidHash(cookies['__Secure-1PAPISID'], origin, ts, userId));
    if (cookies['__Secure-3PAPISID']) parts.push('SAPISID3PHASH ' + await sapisidHash(cookies['__Secure-3PAPISID'], origin, ts, userId));
    return parts.join(' ');
  }
  function parseCookies(s) {
    const o = {};
    (s || '').split(';').forEach(p => { const i = p.indexOf('='); if (i > 0) o[p.slice(0, i).trim()] = p.slice(i + 1).trim(); });
    return o;
  }
  root.YTCPAuth = { sha1Hex, sapisidHash, buildAuthHeader, parseCookies };
})(typeof window !== 'undefined' ? window : globalThis);
