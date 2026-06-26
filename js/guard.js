/* ============================================================
   Dashboard auth guard — runs before app.js renders anything.
   Validates the session (refreshing if needed), fills the user
   menu, and wires logout. The inline <head> guard already blocks
   the obvious "no session" case; this adds refresh + identity.
   ============================================================ */
(() => {
  "use strict";
  const auth = window.MetryxAuth;
  const $ = (s) => document.querySelector(s);

  function initials(email, name) {
    if (name && name.trim()) return name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
    if (email) return email.slice(0, 2).toUpperCase();
    return "U";
  }

  function fillUser(user) {
    if (!user) return;
    const email = user.email || "";
    const meta = user.user_metadata || {};
    const name = meta.full_name || meta.name || (email ? email.split("@")[0] : "Usuário");
    const av = $("#avatarBtn");
    if (av) { av.textContent = initials(email, meta.full_name || meta.name); av.title = email || name; }
    const n = $("#ddName"); if (n) n.textContent = name;
    const m = $("#ddMail"); if (m) m.textContent = email || "—";
  }

  function wire() {
    const userMenu = $("#userMenu");
    if (userMenu) userMenu.addEventListener("click", (e) => e.stopPropagation());

    const logout = $("#logoutBtn");
    if (logout) logout.addEventListener("click", async () => {
      logout.disabled = true;
      logout.textContent = "Saindo…";
      await auth.signOut(); // clears session + redirects to login
    });

    const settings = $("#settingsBtn");
    if (settings) settings.addEventListener("click", () => {
      const nav = document.querySelector('.nav__item[data-view="config"]');
      if (nav) nav.click();
    });
  }

  async function start() {
    if (!auth) { location.replace("login.html"); return; }
    const session = await auth.requireAuth(); // redirects if invalid
    if (!session) return;
    wire();
    // identity: prefer session.user, fall back to a /user fetch
    if (session.user) fillUser(session.user);
    else { const u = await auth.getUser(); if (u) fillUser(u); }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
