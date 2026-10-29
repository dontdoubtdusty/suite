// Cloud sync: keeps this app's data the same on every device you sign in on.
// The same file is used by every Big app: Big Minty (budget), Big Saucy (cooking), Big Skinny (diet), Big Tidy (reminders) and Big Shiny (cleaning). Edit it in one, copy it to all the others.
//
// How it works
// - Each person signs in with their own email + password (Firebase Auth). Every account has its own, separate data.
// - The whole app state is stored as one document: users/{uid}/apps/{app} in Firestore, gzipped.
// - localStorage is still the working copy, so the app works offline exactly as before.
// - After each save the app calls CloudSync.saved(text); a moment later the new copy is uploaded.
// - Newest save wins: every copy carries the time it was last changed ("at"). When two copies differ, the newer one
//   replaces the older one, on this device or in the cloud.
// - The first time an account meets data on a new device, you're asked which copy to keep; the other is kept on this
//   device so it can be restored from Settings.
// - If another device runs a newer version of the app (with data this one can't read), this device stops syncing until
//   it updates, so an old copy of the app can never overwrite newer data.
(function () {
  // Paste the firebaseConfig from Firebase console → Project settings → Your apps. These values are public by design;
  // the Firestore security rules are what keep each person's data private.
  const CONFIG = {
    apiKey: 'AIzaSyB-qolJOepAn64lFq56Qv4ZwddZBOnbMCo',
    authDomain: 'big-juicy-apps.firebaseapp.com',
    projectId: 'big-juicy-apps',
    storageBucket: 'big-juicy-apps.firebasestorage.app',
    messagingSenderId: '691629121069',
    appId: '1:691629121069:web:77c59965c13d6a211022a4'
  };
  const SDK = 'https://www.gstatic.com/firebasejs/12.19.0/';
  const ON = 'cloudsync:on';   // shared by all three apps (same site), so signing in on one wakes sync in the others

  let o = null;          // options from the app (see init)
  let M = {};            // what this device knows: {uid, at, hash, dirty} — saved in localStorage under <key>:cloud
  let fb = null;         // Promise of the loaded Firebase modules
  let F = null, auth = null, db = null, ref = null;
  let user = null, known = false;   // known: Firebase has told us whether someone is signed in
  let status = '', err = '';        // '', 'syncing', 'ok', 'offline', 'error', 'newer'
  let unsub = null, timer = 0, pushing = false, again = false, applying = false, busy = false, msg = '';

  const ls = {
    get: k => { try { return localStorage.getItem(k) } catch (e) { return null } },
    set: (k, v) => { try { localStorage.setItem(k, v); return true } catch (e) { return false } },
    del: k => { try { localStorage.removeItem(k) } catch (e) {} }
  };
  const metaKey = () => o.key + ':cloud', stashKey = () => o.key + ':replaced';
  const saveM = () => ls.set(metaKey(), JSON.stringify(M));
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  // A quick fingerprint of the saved text, so re-saving unchanged data doesn't count as a change
  const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) } return (h >>> 0).toString(36) + ':' + s.length };
  const device = () => { const u = navigator.userAgent; return /iPhone/.test(u) ? 'iPhone' : /iPad/.test(u) ? 'iPad' : /Android/.test(u) ? 'Android' : /Mac/.test(u) ? 'Mac' : /Windows/.test(u) ? 'Windows PC' : /CrOS/.test(u) ? 'Chromebook' : /Linux/.test(u) ? 'Linux' : 'another device' };
  const when = t => { const d = new Date(t), n = new Date(), time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    return d.toDateString() == n.toDateString() ? 'today at ' + time : d.toLocaleDateString([], { month: 'short', day: 'numeric', year: d.getFullYear() == n.getFullYear() ? undefined : 'numeric' }) + ' at ' + time };
  const draw = () => { try { o.render() } catch (e) {} };

  // ---- gzip, so even a big recipe collection fits in one document (limit 1 MB) ----
  const canZip = typeof CompressionStream == 'function' && typeof DecompressionStream == 'function';
  async function pack(txt) {
    if (!canZip) { if (txt.length > 1e6) throw { code: 'too-big' }; return { json: txt } }
    const s = new Blob([txt]).stream().pipeThrough(new CompressionStream('gzip'));
    const u = new Uint8Array(await new Response(s).arrayBuffer());
    if (u.length > 1e6) throw { code: 'too-big' };
    return { gz: F.Bytes.fromUint8Array(u) };
  }
  async function unpack(r) {
    if (r.gz) return new Response(new Blob([r.gz.toUint8Array()]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
    return r.json;
  }

  // ---- Loading Firebase (only once someone has signed in, or taps Sign in) ----
  function start() {
    if (fb) return fb;
    fb = Promise.all([import(SDK + 'firebase-app.js'), import(SDK + 'firebase-auth.js'), import(SDK + 'firebase-firestore.js')])
      .then(([A, B, FS]) => {
        F = FS;
        const app = A.getApps().length ? A.getApp() : A.initializeApp(CONFIG);
        auth = B.getAuth(app); db = FS.getFirestore(app);
        B.onAuthStateChanged(auth, onUser);
        return B;
      })
      .catch(e => { fb = null; status = 'offline'; err = ''; draw(); throw e });
    return fb;
  }

  function onUser(u) {
    if (unsub) { unsub(); unsub = null }
    user = u; known = true; clearTimeout(timer);
    try { o.onUser && o.onUser(!!u) } catch (e) {}
    if (!u) { ls.del(ON); status = ''; draw(); return }
    ls.set(ON, '1'); status = 'syncing'; draw();
    ref = F.doc(db, 'users', u.uid, 'apps', o.app);
    unsub = F.onSnapshot(ref, s => { if (!s.metadata.hasPendingWrites) onRemote(s).catch(fail) }, fail);
  }

  // A copy arrived from the cloud (on sign-in, on opening the app, or when another device saves)
  async function onRemote(s) {
    if (!user) return;
    const r = s.exists() ? s.data() : null;
    if (r && r.v > o.version()) { status = 'newer'; draw(); return }

    if (M.uid !== user.uid) {   // the first time this account syncs this app on this device
      if (!r) { M = { ...M, uid: user.uid, at: M.at || Date.now(), dirty: true }; saveM(); return push() }
      const mine = ls.get(o.key);
      if (mine == null) return applyRemote(r);   // nothing was ever saved on this device, so there's nothing to choose between
      const take = confirm(`This account already has ${o.name} data, last saved ${when(r.at)} on ${r.dev || 'another device'}.\n\n` +
        `OK: load that data onto this device.\nCancel: keep this device's data and upload it instead.\n\n` +
        `Either way, the copy you don't pick is kept on this device and can be restored from Settings.`);
      if (take) { stash('this device', mine); await applyRemote(r) }
      else { stash('the cloud', await unpack(r)); M = { ...M, uid: user.uid, at: Date.now(), dirty: true }; saveM(); await push() }
      return;
    }
    if (r && r.at > (M.at || 0)) return applyRemote(r);   // newest save wins
    if (!r || M.dirty || r.at < M.at) return push();
    status = 'ok'; draw();
  }

  async function applyRemote(r) {
    let obj;
    try { obj = JSON.parse(await unpack(r)) } catch (e) { status = 'error'; err = 'The copy in the cloud couldn’t be read.'; draw(); return }
    applying = true;
    try { o.apply(obj) } catch (e) { applying = false; status = 'error'; err = 'The copy in the cloud couldn’t be loaded.'; draw(); return }
    applying = false;
    M = { uid: user.uid, at: r.at, hash: hash(ls.get(o.key) || ''), dirty: false }; saveM();
    status = 'ok'; draw();
  }

  // Upload this device's copy, unless the cloud has a newer one (then that one comes down instead)
  async function push() {
    clearTimeout(timer);
    if (!user || !ref || status == 'newer') return;
    if (pushing) { again = true; return }
    if (!navigator.onLine) { status = 'offline'; draw(); return }
    const txt = ls.get(o.key); if (txt == null) { status = 'ok'; draw(); return }   // nothing saved yet; the first save uploads
    pushing = true; status = 'syncing'; draw();
    const at = M.at || Date.now(), v = o.version();
    try {
      const data = await pack(txt);
      const res = await F.runTransaction(db, async t => {
        const s = await t.get(ref), r = s.exists() ? s.data() : null;
        if (r && r.v > v) return 'newer';
        if (r && r.at > at) return r;
        t.set(ref, { ...data, at, v, dev: device(), ts: F.serverTimestamp() });
        return 'ok';
      });
      if (res == 'ok') { if (M.at === at) M.dirty = false; M.uid = user.uid; saveM(); status = 'ok' }
      else if (res == 'newer') status = 'newer';
      else await applyRemote(res);
    } catch (e) { fail(e) }
    pushing = false; draw();
    if (again) { again = false; push() }
  }

  function fail(e) {
    const c = e && e.code || '';
    if (/unavailable|network|deadline/.test(c) || !navigator.onLine) { status = 'offline'; err = '' }
    else if (c == 'too-big') { status = 'error'; err = 'Your data is too big to sync (over 1 MB, even compressed).' }
    else if (/permission/.test(c)) { status = 'error'; err = 'The sync service refused this account. Check the Firestore rules.' }
    else { status = 'error'; err = 'Sync failed' + (c ? ' (' + c + ')' : '') + '. It will try again next time something changes.' }
    draw();
  }

  // The copy that lost at first sign-in, kept so it can be put back
  function stash(from, txt) { if (txt) ls.set(stashKey(), JSON.stringify({ from, when: Date.now(), txt })) }
  function getStash() { try { return JSON.parse(ls.get(stashKey())) } catch (e) { return null } }

  // ---- Account form and buttons ----
  const authMsg = c => ({
    'auth/invalid-credential': 'That email and password don’t match an account.', 'auth/wrong-password': 'That email and password don’t match an account.',
    'auth/user-not-found': 'That email and password don’t match an account.', 'auth/invalid-email': 'That doesn’t look like an email address.',
    'auth/missing-email': 'Enter your email first.', 'auth/email-already-in-use': 'There’s already an account with that email. Sign in instead.',
    'auth/weak-password': 'Use a password of at least 6 characters.', 'auth/missing-password': 'Enter a password.',
    'auth/too-many-requests': 'Too many tries. Wait a few minutes and try again.', 'auth/network-request-failed': 'No connection. Try again when you’re online.'
  })[c] || 'Something went wrong' + (c ? ' (' + c + ')' : '') + '.';

  async function act(a) {
    const f = document.querySelector('[data-cs-form]'), email = f ? f.email.value.trim() : '', pw = f ? f.pw.value : '';
    if (a == 'now') { if (user && ref) { status = 'syncing'; draw(); try { onRemote(await F.getDocFromServer(ref)).catch(fail) } catch (e) { fail(e) } } return }
    if (a == 'restore') {
      const s = getStash(); if (!s || !confirm(`Replace what’s on this device now with the copy from ${s.from} (${when(s.when)})?`)) return;
      try { o.apply(JSON.parse(s.txt)); ls.del(stashKey()); draw() } catch (e) { alert('That copy couldn’t be loaded.') }
      return;
    }
    if (a == 'drop') { if (confirm('Delete the spare copy? This can’t be undone.')) { ls.del(stashKey()); draw() } return }
    if (busy) return;
    busy = true; msg = ''; draw();
    try {
      const B = await start();
      if (a == 'in') await B.signInWithEmailAndPassword(auth, email, pw);
      else if (a == 'up') await B.createUserWithEmailAndPassword(auth, email, pw);
      else if (a == 'reset') { if (!email) throw { code: 'auth/missing-email' }; await B.sendPasswordResetEmail(auth, email); msg = 'If there’s an account for that email, a reset link is on its way.' }
      else if (a == 'out') { if (confirm('Sign out? Your data stays on this device; it just stops syncing.')) await B.signOut(auth) }
    } catch (e) { msg = e && e.code ? authMsg(e.code) : 'Couldn’t reach the sync service. Check your connection.' }
    busy = false; draw();
  }
  document.addEventListener('submit', e => { if (e.target.matches('[data-cs-form]')) { e.preventDefault(); act('in') } });
  document.addEventListener('click', e => { const b = e.target.closest('[data-cs]'); if (b) { e.preventDefault(); act(b.dataset.cs) } });

  function statusText() {
    if (!known) return 'Connecting…';
    if (status == 'syncing') return 'Syncing…';
    if (status == 'offline') return 'Offline. Changes are saved here and will upload when you’re back online.';
    if (status == 'newer') return 'Another device has a newer version of this app. Close and reopen this app to update it, then syncing will resume.';
    if (status == 'error') return err;
    if (status == 'ok') return 'Up to date' + (M.at ? ' · last change ' + when(M.at) : '') + '.';
    return '';
  }

  const style = document.createElement('style');
  style.textContent = '.cs-f{display:flex;flex-direction:column;gap:8px;margin-top:8px}.cs-f input{width:100%;box-sizing:border-box}.cs-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:8px}.cs-row>button:not(.cs-link){flex:1}.cs-link{background:none!important;border:0!important;box-shadow:none!important;padding:4px 0!important;color:inherit!important;text-decoration:underline;font:inherit;font-weight:600;cursor:pointer;opacity:.8}.cs-msg{margin:4px 0 0;font-weight:700}';
  document.head.appendChild(style);

  window.CloudSync = {
    // opts: {app, name, key, version(), apply(obj), render(), card(body), btn, btn2, what, onUser(signedIn)}
    init(opts) {
      o = opts;
      try { M = JSON.parse(ls.get(metaKey())) || {} } catch (e) { M = {} }
      if (!CONFIG.apiKey) return;
      if (ls.get(ON)) start().catch(() => {}); else known = true;
      addEventListener('online', () => { if (user && (M.dirty || status == 'offline')) push() });
      document.addEventListener('visibilitychange', () => { if (document.hidden && user && M.dirty) push() });
    },
    // Whether someone is signed in, and whether Firebase is still finding out
    signedIn() { return !!user },
    pending() { return !known },
    // Public copies that anyone with the link can read, at shared/{id}: {...data, uid, at}.
    // Only the signed-in owner can write or delete them (see the Firestore rules in the README).
    pub: {
      async get(id) { await start(); const s = await F.getDoc(F.doc(db, 'shared', id)); return s.exists() ? s.data() : null },
      async put(id, data) { if (!user) throw { code: 'signed-out' }; await F.setDoc(F.doc(db, 'shared', id), { ...data, uid: user.uid, at: Date.now() }) },
      async del(id) { if (!user) throw { code: 'signed-out' }; await F.deleteDoc(F.doc(db, 'shared', id)) }
    },
    // Small documents of the signed-in person's own, at users/{uid}/{path} (for example 'photos/abc'): {d, at}
    mine: {
      async get(path) { if (!user) throw { code: 'signed-out' }; const s = await F.getDoc(F.doc(db, 'users', user.uid, ...path.split('/'))); return s.exists() ? s.data() : null },
      async put(path, data) { if (!user) throw { code: 'signed-out' }; await F.setDoc(F.doc(db, 'users', user.uid, ...path.split('/')), { ...data, at: Date.now() }) },
      async del(path) { if (!user) throw { code: 'signed-out' }; await F.deleteDoc(F.doc(db, 'users', user.uid, ...path.split('/'))) }
    },
    // Call after every successful write of the app's data to localStorage, with the text that was written
    saved(txt) {
      if (!o || applying || typeof txt != 'string') return;
      const h = hash(txt); if (h === M.hash) return;
      M.hash = h; M.at = Date.now(); M.dirty = true; saveM();
      if (user) { clearTimeout(timer); timer = setTimeout(push, 1500) }
    },
    // The Settings card (empty until the Firebase config above is filled in)
    view() {
      if (!o || !CONFIG.apiKey) return '';
      const b1 = esc(o.btn || ''), b2 = esc(o.btn2 || o.btn || ''), s = getStash();
      const spare = s ? `<p class="mu">A spare copy from ${esc(s.from)} was kept when you first signed in (${esc(when(s.when))}).</p><div class="cs-row"><button type="button" class="${b2}" data-cs="restore">Restore it</button><button type="button" class="cs-link" data-cs="drop">Delete it</button></div>` : '';
      const note = msg ? `<p class="mu cs-msg">${esc(msg)}</p>` : '';
      let body;
      if (user) body = `<p class="mu" style="margin:0">Signed in as <b>${esc(user.email || '')}</b></p><p class="mu cs-msg" role="status">${esc(statusText())}</p>${note}
        <div class="cs-row"><button type="button" class="${b2}" data-cs="now">Sync now</button><button type="button" class="${b2}" data-cs="out"${busy ? ' disabled' : ''}>Sign out</button></div>${spare}`;
      else if (!known) body = `<p class="mu" role="status">Connecting…</p>`;
      else body = `<p class="mu" style="margin:0">Sign in to keep ${esc(o.what || 'your data')} the same on every device. Each account has its own separate data, so friends can make their own.</p>
        <form class="cs-f" data-cs-form novalidate><input type="email" name="email" autocomplete="username" placeholder="Email" aria-label="Email"><input type="password" name="pw" autocomplete="current-password" placeholder="Password (6+ characters)" aria-label="Password">${note}
        <div class="cs-row" style="margin-top:0"><button type="submit" class="${b1}"${busy ? ' disabled' : ''}>Sign in</button><button type="button" class="${b2}" data-cs="up"${busy ? ' disabled' : ''}>Create account</button></div>
        <div class="cs-row" style="margin-top:0"><button type="button" class="cs-link" data-cs="reset">Forgot password?</button></div></form>${spare}`;
      return o.card(body);
    }
  };
})();
