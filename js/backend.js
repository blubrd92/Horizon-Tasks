// Talks to the Apps Script backend (apps-script/Code.gs), the only place the
// Anthropic key lives. See PLAN.md, "Slice 3a" question 1 for why the
// request looks the way it does, and "Slice 3b" question 2 for what each
// answer means.
//
// The request is a "simple" one, so the browser needs no preflight check,
// which Apps Script can't answer: a POST, the body labeled plain text (it
// is JSON), no custom headers, no cookies. The sign-in token rides in the
// body, never in the address.

import { config } from '../config.js';

const TIME_LIMIT = 90 * 1000; // milliseconds to wait for an answer

// Answers the site makes up itself, when the backend never answered.
const LOCAL = {
  'no-backend': "Horizon's AI features need the Apps Script backend, and config.js has no address for it.",
  unreachable: "Couldn't reach Horizon's backend. Check your connection, then try again.",
  timeout: "Horizon's backend took too long to answer. Try again in a moment.",
  'no-token': 'Sign in to Horizon first.',
};

// Refusals where trying again later could work. The rest need something
// changed first (a setting, a sign-in, a different image, tomorrow).
const RETRYABLE = new Set(['busy', 'unavailable', 'ai-unavailable', 'ai-failed', 'unreachable', 'timeout']);

export function canRetry(code) {
  return RETRYABLE.has(code);
}

export function backendAddress() {
  const url = config.appsScriptUrl;
  return typeof url === 'string' && url.startsWith('https://script.google.com/') ? url : null;
}

// Sends `body` (with the sign-in token added) and returns the answer:
// { ok: true, ... } or { ok: false, error, message }. Never throws.
// getToken(fresh) returns the ID token. A "bad-token" answer gets one more
// try with a brand-new token: an hour-old token is the usual cause.
// The answer also carries `sentBytes`, the size of what was sent.
export async function callBackend(body, getToken) {
  const url = backendAddress();
  if (!url) return local('no-backend');
  let token = await getToken(false).catch(() => null);
  if (!token) return local('no-token');
  let answer = await send(url, { ...body, idToken: token });
  if (!answer.ok && answer.error === 'bad-token') {
    token = await getToken(true).catch(() => null);
    if (!token) return local('no-token');
    answer = await send(url, { ...body, idToken: token });
  }
  return answer;
}

async function send(url, body) {
  const text = JSON.stringify(body);
  const timer = new AbortController();
  const stop = setTimeout(() => timer.abort(), TIME_LIMIT);
  let answer;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: text,
      credentials: 'omit',
      redirect: 'follow',
      signal: timer.signal,
    });
    const raw = await res.text();
    try {
      answer = JSON.parse(raw);
    } catch {
      // A Google error page instead of JSON: a deployment problem, or Google
      // having a bad moment. The first bit of it goes to the console.
      console.warn('Horizon backend answered something that is not JSON:', raw.slice(0, 300));
      answer = null;
    }
    if (!answer || typeof answer !== 'object' || typeof answer.ok !== 'boolean') answer = local('unreachable');
  } catch (err) {
    if (err && err.name === 'AbortError') {
      answer = local('timeout');
    } else {
      console.warn('Horizon backend could not be reached:', err);
      answer = local('unreachable');
    }
  } finally {
    clearTimeout(stop);
  }
  if (!answer.ok && typeof answer.message !== 'string') answer.message = LOCAL.unreachable;
  answer.sentBytes = text.length;
  return answer;
}

// The middle of the console's cost line, for every AI request: what was
// sent, Haiku's tokens, and the cost at Haiku 5.5's prices (Anthropic's
// pricing page, 2026-11-08: $0.10 and $0.50 per million tokens).
const PRICE_IN = 0.1 / 1e6;
const PRICE_OUT = 0.5 / 1e6;
export function costLine(answer) {
  const tokens = answer.tokens || {};
  const input = Number(tokens.input) || 0;
  const output = Number(tokens.output) || 0;
  const cost = input * PRICE_IN + output * PRICE_OUT;
  const usage = answer.usage ? ` ${answer.usage.used} of ${answer.usage.limit} AI requests used today.` : '';
  return (
    `${Math.round((answer.sentBytes || 0) / 1024)} KB sent, ` +
    `${input.toLocaleString()} tokens in, ${output.toLocaleString()} out, about $${cost.toFixed(4)}.${usage}`
  );
}

function local(code) {
  return { ok: false, error: code, message: LOCAL[code] };
}
