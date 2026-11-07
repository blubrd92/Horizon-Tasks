// Horizon backend: a Google Apps Script web app.
//
// This is the only server Horizon has, and the only code that will ever hold
// the Anthropic API key. Slice 3a builds the gate: who may call, and how often.
// Behind the gate, the only action so far is "ping", which does nothing but
// say you got through. Slices 3b (screenshots) and 3c (quick add) add the
// actions that call Claude, behind the same gate.
//
// Paste this whole file into the Apps Script editor, replacing Code.gs.
// It contains no value that belongs to one particular copy of Horizon. Those
// live in Script Properties (Project Settings > Script Properties), so anyone
// running their own copy pastes this file unchanged:
//
//   FIREBASE_PROJECT_ID   required. The same as config.js > firebase.projectId.
//   FIREBASE_WEB_API_KEY  required. The same as config.js > firebase.apiKey.
//                         (Not a secret: it names your project, it opens nothing.)
//   ANTHROPIC_API_KEY     required from 3b on. From the Claude Console. The one
//                         real secret: it lives here and nowhere else.
//   DAILY_LIMIT           optional. Calls per person per day. Default 100.
//                         0 switches the AI features off for everyone.
//   TIME_ZONE             optional. Where the day ends, like America/Los_Angeles.
//                         Default: this project's time zone (Project Settings).
//
// The site talks to this script with a POST whose body is JSON sent as plain
// text, so the browser needs no "preflight" check, which Apps Script can't
// answer. Every answer is JSON: { ok: true, ... } or
// { ok: false, error: "<code>", message: "<a sentence>" }. PLAN.md, "Slice 3a",
// explains each check and each refusal.
//
// From the editor, run checkSetup() to test every Script Property.

var MODEL = 'claude-haiku-5-5';
var ANTHROPIC_VERSION = '2026-10-21';
var DEFAULT_DAILY_LIMIT = 100;
var MAX_TOKEN_LENGTH = 4000; // Firebase ID tokens are about 1,000 characters.

// The actions the gate can lead to. 3b and 3c add theirs here.
var ACTIONS = {
  ping: function (caller) {
    return { ok: true, action: 'ping', uid: caller.uid, email: caller.email, usage: caller.usage };
  },
};

// What each refusal says. The site (3b) can show these sentences as they are.
var REFUSALS = {
  'bad-request': "Horizon's backend didn't understand that request.",
  'not-set-up': "Horizon's backend isn't set up yet. Run checkSetup in the Apps Script editor.",
  'no-token': 'Sign in to Horizon first.',
  'bad-token': "Your sign-in couldn't be confirmed. Sign out and back in, then try again.",
  'not-approved': "This Horizon is private, and your account isn't on its approved list.",
  'over-limit': "You've used today's AI requests. They start again at midnight.",
  busy: "Horizon's backend is busy. Try again in a moment.",
  unavailable: "Horizon's backend couldn't reach Google just now. Try again in a moment.",
};

// ---------------------------------------------------------------------------
// The web app's two doors.

// Opening the web app's address in a browser tab lands here. It says only
// that the script is running.
function doGet() {
  return json_({ ok: true, service: 'Horizon backend', note: 'Running. Horizon talks to it with POST requests.' });
}

// Every request from the site lands here.
function doPost(e) {
  var result;
  try {
    result = handle_(e);
  } catch (err) {
    console.error('Unexpected error: ' + (err && err.stack ? err.stack : err));
    result = refuse_('unavailable');
  }
  return json_(result);
}

// ---------------------------------------------------------------------------
// The gate. Each step either refuses or hands on to the next. When in doubt,
// the answer is no.

function handle_(e) {
  // 1. Read the request.
  var body = parseJson_(e && e.postData ? e.postData.contents : null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) return refuse_('bad-request');
  if (typeof body.action !== 'string' || !Object.prototype.hasOwnProperty.call(ACTIONS, body.action)) {
    return refuse_('bad-request');
  }

  // 2. The Script Properties the gate needs.
  var props = PropertiesService.getScriptProperties().getProperties();
  var settings = readSettings_(props);
  if (settings.problems.length) {
    console.warn('Not set up: ' + settings.problems.join('; '));
    return refuse_('not-set-up', { problems: settings.problems });
  }

  // 3. A token at all.
  var idToken = body.idToken;
  if (typeof idToken !== 'string' || !idToken) return refuse_('no-token');

  // 4. A cheap first look at the token, before spending a call to Google.
  // Nothing here is trusted yet; it only throws out what can't possibly pass.
  var claims = readClaims_(idToken);
  if (!claims) return refuse_('bad-token');
  if (claims.aud !== settings.projectId) return refuse_('bad-token');
  if (claims.iss !== 'https://securetoken.google.com/' + settings.projectId) return refuse_('bad-token');
  if (typeof claims.exp !== 'number' || claims.exp * 1000 <= Date.now()) return refuse_('bad-token');
  if (typeof claims.sub !== 'string' || !claims.sub) return refuse_('bad-token');

  // 5. Firebase confirms the token is genuine and current.
  var account = lookUpAccount_(idToken, settings.firebaseKey);
  if (account.refusal) return account.refusal;
  var user = account.user;
  if (user.localId !== claims.sub || user.disabled) return refuse_('bad-token');

  // 6. A verified email, the same requirement firestore.rules makes.
  if (!user.email || user.emailVerified !== true) return refuse_('not-approved', null, user.localId);

  // 7. On the approved list: the same question the site asks at sign-in.
  var listed = isOnAllowlist_(idToken, user.email, settings.projectId);
  if (listed !== true) return listed;

  // 8. Under today's limit. Only calls that got this far are counted.
  var counted = countCall_(user.localId, settings);
  if (counted.refusal) return counted.refusal;

  var caller = { uid: user.localId, email: user.email, usage: counted.usage };
  console.info(body.action + ' by ' + caller.uid + ' (' + counted.usage.used + ' of ' + counted.usage.limit + ' today)');
  return ACTIONS[body.action](caller, body, props);
}

// Reads and checks the Script Properties. Returns the values the gate uses and
// a list of problems (empty when everything is in order).
function readSettings_(props) {
  var problems = [];
  var projectId = (props.FIREBASE_PROJECT_ID || '').trim();
  var firebaseKey = (props.FIREBASE_WEB_API_KEY || '').trim();
  if (!projectId) problems.push('FIREBASE_PROJECT_ID is missing');
  if (!firebaseKey) problems.push('FIREBASE_WEB_API_KEY is missing');

  var limit = DEFAULT_DAILY_LIMIT;
  var rawLimit = (props.DAILY_LIMIT || '').trim();
  if (rawLimit) {
    if (/^\d{1,6}$/.test(rawLimit)) limit = Number(rawLimit);
    else problems.push('DAILY_LIMIT must be a whole number, like 100');
  }

  var timeZone = (props.TIME_ZONE || '').trim() || Session.getScriptTimeZone();
  return { projectId: projectId, firebaseKey: firebaseKey, limit: limit, timeZone: timeZone, problems: problems };
}

// The middle part of a token, decoded. Returns null if it isn't shaped like a
// token at all. This does not check the signature: Firebase does that next.
function readClaims_(idToken) {
  if (idToken.length > MAX_TOKEN_LENGTH) return null;
  var parts = idToken.split('.');
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return null;
  var middle = parts[1];
  while (middle.length % 4) middle += '=';
  try {
    var text = Utilities.newBlob(Utilities.base64DecodeWebSafe(middle)).getDataAsString();
    var claims = JSON.parse(text);
    return claims && typeof claims === 'object' ? claims : null;
  } catch (err) {
    return null;
  }
}

// Asks the Firebase Auth REST API whose token this is. Firebase checks the
// signature and the expiry; a forged or expired token gets INVALID_ID_TOKEN.
// Returns { user } or { refusal }.
function lookUpAccount_(idToken, firebaseKey) {
  var res = UrlFetchApp.fetch(
    'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + encodeURIComponent(firebaseKey),
    {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ idToken: idToken }),
      muteHttpExceptions: true,
    }
  );
  var status = res.getResponseCode();
  var answer = parseJson_(res.getContentText());

  if (status === 200) {
    var user = answer && answer.users && answer.users[0];
    if (user && typeof user.localId === 'string') return { user: user };
    console.warn('Firebase lookup: 200 with no account in it');
    return { refusal: refuse_('bad-token') };
  }

  var reason = answer && answer.error && typeof answer.error.message === 'string' ? answer.error.message : '';
  if (/^(INVALID_ID_TOKEN|TOKEN_EXPIRED|USER_NOT_FOUND|USER_DISABLED|MISSING_ID_TOKEN|CREDENTIAL_TOO_OLD_LOGIN_AGAIN)/.test(reason)) {
    return { refusal: refuse_('bad-token') };
  }
  // Anything else is Firebase or the key, not the caller: an API key that
  // isn't valid, a website restriction on it, Google being down.
  console.error('Firebase lookup failed: HTTP ' + status + ' ' + (reason || 'no reason given') + '. Run checkSetup.');
  return { refusal: refuse_('unavailable') };
}

// Asks Firestore for allowlist/{email}, using the caller's own token, so
// firestore.rules decide exactly as they do for the site: a person may read
// only their own entry. Returns true, or a refusal.
function isOnAllowlist_(idToken, email, projectId) {
  var url = 'https://firestore.googleapis.com/v1/projects/' + encodeURIComponent(projectId) +
    '/databases/(default)/documents/allowlist/' + encodeURIComponent(email);
  var res = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: { Authorization: 'Bearer ' + idToken },
    muteHttpExceptions: true,
  });
  var status = res.getResponseCode();
  if (status === 200) return true;
  // 404: no such entry. 403: the rules said no (or, if FIREBASE_PROJECT_ID
  // were wrong, Google did; checkSetup tells those apart).
  if (status === 404 || status === 403) return refuse_('not-approved');
  if (status === 401) return refuse_('bad-token');
  console.error('Firestore allowlist check failed: HTTP ' + status);
  return refuse_('unavailable');
}

// Counts one call for this person today, unless they're already at the limit.
// One Script Property per person: usage:<user ID> = {"day":"2026-11-07","count":12}.
// A count from an earlier day simply doesn't match today, so nothing has to
// run at midnight. The lock makes two calls at the same moment count as two.
function countCall_(uid, settings) {
  var day = Utilities.formatDate(new Date(), settings.timeZone, 'yyyy-MM-dd');
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { refusal: refuse_('busy', null, uid) };
  try {
    var store = PropertiesService.getScriptProperties();
    var key = 'usage:' + uid;
    var saved = parseJson_(store.getProperty(key));
    var used = saved && saved.day === day && typeof saved.count === 'number' ? saved.count : 0;
    if (used >= settings.limit) {
      return { refusal: refuse_('over-limit', { used: used, limit: settings.limit, day: day }, uid) };
    }
    store.setProperty(key, JSON.stringify({ day: day, count: used + 1 }));
    return { usage: { used: used + 1, limit: settings.limit, day: day, timeZone: settings.timeZone } };
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// Small helpers.

function refuse_(code, extra, uid) {
  console.info('Refused: ' + code + (uid ? ' (' + uid + ')' : ''));
  var result = { ok: false, error: code, message: REFUSALS[code] };
  if (extra) {
    for (var name in extra) result[name] = extra[name];
  }
  return result;
}

function parseJson_(text) {
  if (typeof text !== 'string' || !text) return null;
  try {
    return JSON.parse(text);
  } catch (err) {
    return null;
  }
}

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}

// ---------------------------------------------------------------------------
// Run this from the editor (choose checkSetup beside the Run button, then Run).
// It checks every Script Property and prints what it finds in the Execution
// log. It never prints a key.

function checkSetup() {
  var props = PropertiesService.getScriptProperties().getProperties();
  var settings = readSettings_(props);
  var lines = [];
  var good = true;
  function say(isOk, text) {
    lines.push((isOk ? 'OK    ' : 'FIX   ') + text);
    if (!isOk) good = false;
  }

  settings.problems.forEach(function (problem) { say(false, problem); });

  // Firebase web API key: a deliberately fake token should get INVALID_ID_TOKEN.
  if (settings.firebaseKey) {
    var res = UrlFetchApp.fetch(
      'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + encodeURIComponent(settings.firebaseKey),
      { method: 'post', contentType: 'application/json', payload: JSON.stringify({ idToken: 'not.a.token' }), muteHttpExceptions: true }
    );
    var answer = parseJson_(res.getContentText());
    var reason = answer && answer.error ? String(answer.error.message || '') : '';
    if (/^INVALID_ID_TOKEN/.test(reason)) {
      say(true, 'FIREBASE_WEB_API_KEY works: Firebase checked a fake token and turned it down.');
    } else if (/referer|referrer/i.test(reason)) {
      say(false, 'FIREBASE_WEB_API_KEY has a website restriction, so Firebase refuses the script. See PLAN.md, Slice 3a setup, step C. (' + reason + ')');
    } else if (/API key not valid|API_KEY_INVALID/i.test(reason)) {
      say(false, 'FIREBASE_WEB_API_KEY is not a valid key. Copy apiKey from config.js again.');
    } else {
      say(false, 'Firebase answered something unexpected: HTTP ' + res.getResponseCode() + ' ' + reason);
    }
  }

  // Firestore project: with no sign-in at all, the rules should refuse.
  if (settings.projectId) {
    var fs = UrlFetchApp.fetch(
      'https://firestore.googleapis.com/v1/projects/' + encodeURIComponent(settings.projectId) +
        '/databases/(default)/documents/allowlist/checksetup%40example.com',
      { method: 'get', muteHttpExceptions: true }
    );
    // Google answers 403 both when the rules say no and when there is no such
    // project; only the rules' refusal says "Missing or insufficient permissions."
    var fsAnswer = parseJson_(fs.getContentText());
    var fsReason = fsAnswer && fsAnswer.error ? String(fsAnswer.error.message || '') : '';
    if (fs.getResponseCode() === 403 && /^Missing or insufficient permissions/.test(fsReason)) {
      say(true, 'FIREBASE_PROJECT_ID finds your Firestore database, and its rules turn away a stranger.');
    } else if (fs.getResponseCode() === 403 || fs.getResponseCode() === 404) {
      say(false, 'FIREBASE_PROJECT_ID: no Firestore database found for "' + settings.projectId + '". Copy projectId from config.js again.');
    } else if (fs.getResponseCode() === 200) {
      say(false, 'Firestore let a stranger read the approved list. Publish firestore.rules again.');
    } else {
      say(false, 'Firestore answered something unexpected: HTTP ' + fs.getResponseCode());
    }
  }

  // Anthropic key and model: asking about the model costs nothing.
  var anthropicKey = (props.ANTHROPIC_API_KEY || '').trim();
  if (!anthropicKey) {
    say(false, 'ANTHROPIC_API_KEY is missing (needed from slice 3b on).');
  } else {
    var an = UrlFetchApp.fetch('https://api.anthropic.com/v1/models/' + MODEL, {
      method: 'get',
      headers: { 'x-api-key': anthropicKey, 'anthropic-version': ANTHROPIC_VERSION },
      muteHttpExceptions: true,
    });
    var code = an.getResponseCode();
    if (code === 200) say(true, 'ANTHROPIC_API_KEY works, and ' + MODEL + ' is available to it.');
    else if (code === 401) say(false, 'ANTHROPIC_API_KEY was turned down by Anthropic. Make a new key and paste it again.');
    else if (code === 403) say(false, 'ANTHROPIC_API_KEY is not allowed to use ' + MODEL + '. Check the key\'s workspace in the Claude Console.');
    else if (code === 404) say(false, MODEL + ' was not found. The model name in Code.gs may be out of date.');
    else say(false, 'Anthropic answered something unexpected: HTTP ' + code);
  }

  say(true, 'Daily limit: ' + settings.limit + ' calls per person' + (settings.limit === 0 ? ' (0: the AI features are off).' : '.'));
  say(true, 'The day ends at midnight in ' + settings.timeZone + ', where it is now ' +
    Utilities.formatDate(new Date(), settings.timeZone, "EEE d MMM yyyy, h:mm a") +
    '. If that time is wrong, the time zone is misspelled (unknown zones quietly become GMT).');

  lines.push(good ? 'Everything checks out.' : 'Fix the lines marked FIX, then run checkSetup again.');
  console.log(lines.join('\n'));
}
