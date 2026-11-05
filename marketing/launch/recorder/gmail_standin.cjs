// LOCAL FILMING ONLY. Preloaded into the local Next server (NODE_OPTIONS=--require) so the sample account's Gmail
// connection answers without a real Google account: drafts and sends are accepted and logged here, nothing leaves the machine.
const fs = require('fs');
const LOG = __dirname + '/gmail_standin.log';
const orig = globalThis.fetch;
const j = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json' } });
globalThis.fetch = async function (input, init) {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (/^https:\/\/(gmail\.googleapis\.com|www\.googleapis\.com\/calendar|oauth2\.googleapis\.com)/.test(url)) {
    const method = (init && init.method) || 'GET';
    let body = init && init.body ? String(init.body) : '';
    try { const raw = JSON.parse(body).raw || (JSON.parse(body).message || {}).raw; if (raw) body = Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'); } catch {}
    fs.appendFileSync(LOG, `--- ${new Date().toISOString()} ${method} ${url}\n${body.slice(0, 6000)}\n`);
    if (url.includes('oauth2.googleapis.com/token')) return j({ access_token: 'film-standin', expires_in: 3600 });
    if (/\/drafts$/.test(url) && method === 'POST') return j({ id: 'r-film-draft', message: { id: 'm-film-draft', threadId: 't-film' } });
    if (/\/messages\/send$/.test(url)) return j({ id: 'm-film-sent', threadId: 't-film', labelIds: ['SENT'] });
    if (/\/messages(\?|$)/.test(url)) return j({ messages: [], resultSizeEstimate: 0 });
    if (url.includes('/calendar/v3/') && method === 'GET') return j({ items: [] });
    if (url.includes('/calendar/v3/')) return j({ id: 'e-film', status: 'confirmed', htmlLink: 'https://calendar.google.com/' });
    return j({});
  }
  return orig.apply(this, arguments);
};
