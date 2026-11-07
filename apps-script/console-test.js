// Horizon backend test, slice 3a. The site never loads this file: it's text
// to paste into the browser's console, so the backend can be tested before
// the site uses it.
//
// 1. Put your web app's address (it ends in /exec) between the quotes below.
// 2. Open the live Horizon site in Chrome and sign in.
// 3. Open the console: View > Developer > JavaScript Console (Cmd+Option+J on
//    a Mac, Ctrl+Shift+J on Windows). The first time, Chrome asks you to
//    type "allow pasting" before it accepts a paste.
// 4. Paste all of this and press Enter. A table shows each check.
//
// Running it from the site's own page matters: it makes the same
// cross-origin request the site will make in 3b.
//
// Each run counts 1 call against today's limit (only the first check gets
// through the gate). After the table, horizonLimitTest(5) sends 5 pings in a
// row and shows the count rising, then the refusal once the limit is reached.

(async () => {
  const SCRIPT_URL = 'PASTE_YOUR_WEB_APP_URL_HERE';

  if (!SCRIPT_URL.startsWith('https://script.google.com/')) {
    console.warn('Put your web app address in SCRIPT_URL first.');
    return;
  }
  const { getAuth } = await import('https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js');
  const user = getAuth().currentUser;
  if (!user) {
    console.warn('Sign in to Horizon in this tab first, then paste this again.');
    return;
  }

  // The request the site will send: POST, the body labeled plain text so the
  // browser skips the preflight check, no cookies.
  async function call(body) {
    const res = await fetch(SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
      credentials: 'omit',
      redirect: 'follow',
    });
    return res.json();
  }

  const token = await user.getIdToken();
  // The same token with one character of its signature changed: the claims
  // inside still look right, so only Firebase's signature check can catch it.
  const sig = token.slice(token.lastIndexOf('.') + 1);
  const mid = Math.floor(sig.length / 2);
  const tampered = token.slice(0, token.length - sig.length) +
    sig.slice(0, mid) + (sig[mid] === 'A' ? 'B' : 'A') + sig.slice(mid + 1);

  const checks = [
    ['Your real sign-in', { action: 'ping', idToken: token }, 'ok'],
    ['No token', { action: 'ping' }, 'no-token'],
    ['Junk instead of a token', { action: 'ping', idToken: 'not-a-token' }, 'bad-token'],
    ['Your token with its signature altered', { action: 'ping', idToken: tampered }, 'bad-token'],
    ['An action that does not exist', { action: 'launch', idToken: token }, 'bad-request'],
    ['A body that is not JSON', 'hello', 'bad-request'],
  ];

  const rows = [];
  let usage = null;
  for (const [name, body, expected] of checks) {
    let got;
    try {
      const answer = await call(body);
      got = answer.ok ? 'ok' : answer.error;
      if (answer.ok) usage = answer.usage;
    } catch (err) {
      got = 'request failed: ' + err.message;
    }
    rows.push({ check: name, expected, got, result: got === expected ? 'PASS' : 'FAIL' });
  }
  console.table(rows);
  if (usage) {
    console.log(`Today (${usage.day}, ${usage.timeZone}): ${usage.used} of ${usage.limit} calls used.`);
  }

  window.horizonLimitTest = async (n = 5) => {
    for (let i = 1; i <= n; i += 1) {
      const answer = await call({ action: 'ping', idToken: await user.getIdToken() });
      console.log(answer.ok
        ? `${i}. got through: ${answer.usage.used} of ${answer.usage.limit} used today`
        : `${i}. refused: ${answer.error} (${answer.message})`);
    }
  };
  console.log('To test the limit: horizonLimitTest(5)');
})();
