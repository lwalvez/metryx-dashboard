/* ============================================================
   MetryxAuth — tiny Supabase Auth (GoTrue) client over fetch.
   No SDK. Session persisted in localStorage with auto-refresh.
   ============================================================ */
(function () {
  "use strict";
  var cfg = window.SUPABASE_CONFIG || {};
  var BASE = (cfg.url || "").replace(/\/+$/, "") + "/auth/v1";
  var KEY = cfg.anonKey || "";
  var STORE = "metryx-session";
  var LOGIN_PAGE = "login.html";
  var APP_PAGE = "index.html";

  function headers(token) {
    var h = { "Content-Type": "application/json", apikey: KEY };
    h.Authorization = "Bearer " + (token || KEY);
    return h;
  }

  async function api(path, body, token, method) {
    var res = await fetch(BASE + path, {
      method: method || "POST",
      headers: headers(token),
      body: body ? JSON.stringify(body) : undefined,
    });
    var data = null;
    try { data = await res.json(); } catch (_) {}
    if (!res.ok) {
      var msg = (data && (data.error_description || data.msg || data.message || data.error)) || ("Erro " + res.status);
      var err = new Error(msg);
      err.status = res.status;
      err.code = data && (data.error_code || data.code);
      throw err;
    }
    return data;
  }

  /* ---- session storage ---- */
  function saveSession(s) {
    if (!s || !s.access_token) return null;
    var sess = {
      access_token: s.access_token,
      refresh_token: s.refresh_token,
      token_type: s.token_type,
      user: s.user || null,
      expires_at: s.expires_at ? s.expires_at * 1000 : Date.now() + (s.expires_in || 3600) * 1000,
    };
    localStorage.setItem(STORE, JSON.stringify(sess));
    return sess;
  }
  function getSession() {
    try { return JSON.parse(localStorage.getItem(STORE) || "null"); } catch (_) { return null; }
  }
  function clearSession() { localStorage.removeItem(STORE); }

  /* ---- auth actions ---- */
  async function signInPassword(email, password) {
    var data = await api("/token?grant_type=password", { email: email, password: password });
    return saveSession(data);
  }

  async function signUp(email, password, redirectTo) {
    var body = { email: email, password: password };
    if (redirectTo) body.options = { email_redirect_to: redirectTo };
    var data = await api("/signup", body);
    // If email confirmation is OFF, Supabase returns a full session.
    if (data && data.access_token) return { session: saveSession(data), needsConfirm: false, user: data.user };
    return { session: null, needsConfirm: true, user: data };
  }

  async function recover(email, redirectTo) {
    return api("/recover", redirectTo ? { email: email, options: { redirect_to: redirectTo } } : { email: email });
  }

  async function refresh() {
    var s = getSession();
    if (!s || !s.refresh_token) return null;
    try {
      var data = await api("/token?grant_type=refresh_token", { refresh_token: s.refresh_token });
      return saveSession(data);
    } catch (_) { clearSession(); return null; }
  }

  async function getUser() {
    var s = getSession();
    if (!s) return null;
    try { return await api("/user", null, s.access_token, "GET"); } catch (_) { return null; }
  }

  async function signOut() {
    var s = getSession();
    if (s && s.access_token) { try { await api("/logout", {}, s.access_token); } catch (_) {} }
    clearSession();
    location.replace(LOGIN_PAGE);
  }

  // Valid (non-expired, refreshable) session or null. Refreshes if near expiry.
  async function ensureSession() {
    var s = getSession();
    if (!s || !s.access_token) return null;
    if (Date.now() > s.expires_at - 60000) return await refresh();
    return s;
  }

  // Page guard: redirect to login if not authenticated. Returns session.
  async function requireAuth() {
    var s = await ensureSession();
    if (!s) { location.replace(LOGIN_PAGE); return null; }
    return s;
  }

  // For the login page: if already signed in, bounce to the app.
  async function redirectIfAuthed() {
    var s = await ensureSession();
    if (s) { location.replace(APP_PAGE); return true; }
    return false;
  }

  window.MetryxAuth = {
    BASE: BASE, LOGIN_PAGE: LOGIN_PAGE, APP_PAGE: APP_PAGE,
    signInPassword: signInPassword, signUp: signUp, recover: recover,
    refresh: refresh, getUser: getUser, signOut: signOut,
    getSession: getSession, clearSession: clearSession,
    ensureSession: ensureSession, requireAuth: requireAuth, redirectIfAuthed: redirectIfAuthed,
  };
})();
