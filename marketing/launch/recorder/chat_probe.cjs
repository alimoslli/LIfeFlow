// Sends one message to the local app's assistant as the signed-in sample user and prints what comes back.
const fs = require('fs');
const st = JSON.parse(fs.readFileSync(__dirname + '/state.json', 'utf8'));
const cookie = st.cookies.filter((c) => /localhost/.test(c.domain)).map((c) => `${c.name}=${c.value}`).join('; ');
(async () => {
  let conversationId;
  for (const message of process.argv.slice(2)) {
  console.log('>>>', message);
  const res = await fetch('http://localhost:3000/api/jarvis/chat', { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ message, conversationId }) });
  const txt = await res.text(); let text = '';
  for (const l of txt.split('\n').filter(Boolean)) { const e = JSON.parse(l); if (e.type === 'conversation') conversationId = e.id; if (e.type === 'text') text += e.delta; else if (e.type === 'tool_start') { console.log('TOOL', e.name); text = ''; } else if (e.type === 'confirmation') console.log('CONFIRM CARD:', e.summary); }
  console.log('---\n' + text);
  }
})();
