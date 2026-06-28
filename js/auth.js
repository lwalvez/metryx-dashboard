/* ============================================================
   Login / signup / password-reset page logic.
   ============================================================ */
(() => {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const auth = window.MetryxAuth;

  const root = $(".auth");
  const tabs = $("#authTabs");
  const form = $("#authForm");
  const emailEl = $("#email");
  const pwEl = $("#password");
  const pwField = $("#pwField");
  const submitBtn = $("#submitBtn");
  const btnLabel = submitBtn.querySelector(".btn__label");
  const alertBox = $("#authAlert");
  const titleEl = $("#authTitle");
  const subEl = $("#authSub");
  const altEl = $("#authAlt");
  const pwHint = $("#pwHint");

  let mode = "signin"; // signin | signup | forgot
  let busy = false;

  $("#yr").textContent = new Date().getFullYear();

  if (!auth || !window.SUPABASE_CONFIG || !window.SUPABASE_CONFIG.url) {
    showAlert("error", "Configuração do Supabase ausente. Verifique js/supabase-config.js.");
  }

  const COPY = {
    signin: { title: "Bem-vindo de volta", sub: "Entre para acessar seu painel.", btn: "Entrar", alt: 'Novo na Metryx? <button type="button" class="link" data-goto="signup">Criar uma conta</button>' },
    signup: { title: "Crie sua conta", sub: "Comece a acompanhar seus resultados.", btn: "Criar conta", alt: 'Já tem conta? <button type="button" class="link" data-goto="signin">Entrar</button>' },
    forgot: { title: "Recuperar senha", sub: "Enviaremos um link de redefinição para seu e-mail.", btn: "Enviar link", alt: '<button type="button" class="link" data-goto="signin">Voltar para o login</button>' },
  };

  function setMode(m) {
    mode = m;
    root.dataset.mode = m;
    tabs.dataset.mode = (m === "signup" ? "signup" : "signin");
    document.querySelectorAll(".auth__tab").forEach((t) => {
      const on = t.dataset.mode === m;
      t.classList.toggle("is-active", on);
      t.setAttribute("aria-selected", on ? "true" : "false");
    });
    titleEl.textContent = COPY[m].title;
    subEl.textContent = COPY[m].sub;
    btnLabel.textContent = COPY[m].btn;
    altEl.innerHTML = COPY[m].alt;
    pwEl.setAttribute("autocomplete", m === "signin" ? "current-password" : "new-password");
    pwHint.hidden = m !== "signup";
    clearErrors();
    hideAlert();
  }

  /* ---- validation ---- */
  function setFieldError(field, errEl, msg) {
    field.classList.toggle("has-error", !!msg);
    errEl.textContent = msg || "";
  }
  function clearErrors() {
    setFieldError($("#email").closest(".field"), $("#emailErr"), "");
    setFieldError(pwField, $("#passwordErr"), "");
  }
  function validEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }

  function validate() {
    let ok = true;
    const emailField = emailEl.closest(".field");
    if (!emailEl.value.trim()) { setFieldError(emailField, $("#emailErr"), "Informe seu e-mail."); ok = false; }
    else if (!validEmail(emailEl.value.trim())) { setFieldError(emailField, $("#emailErr"), "E-mail inválido."); ok = false; }
    else setFieldError(emailField, $("#emailErr"), "");

    if (mode !== "forgot") {
      if (!pwEl.value) { setFieldError(pwField, $("#passwordErr"), "Informe sua senha."); ok = false; }
      else if (pwEl.value.length < 6) { setFieldError(pwField, $("#passwordErr"), "Mínimo de 6 caracteres."); ok = false; }
      else setFieldError(pwField, $("#passwordErr"), "");
    }
    if (!ok) { const bad = root.querySelector(".field.has-error input"); if (bad) bad.focus(); }
    return ok;
  }

  /* ---- alert / loading ---- */
  function showAlert(kind, msg) {
    alertBox.hidden = false;
    alertBox.className = "auth__alert is-" + (kind === "error" ? "error" : "success");
    alertBox.innerHTML = (kind === "error"
      ? '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" style="flex:0 0 auto"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/><path d="M12 7v6M12 16.5v.5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>'
      : '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" style="flex:0 0 auto"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/><path d="m8 12 3 3 5-6" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>')
      + "<span>" + msg + "</span>";
  }
  function hideAlert() { alertBox.hidden = true; }
  function setBusy(on) {
    busy = on;
    submitBtn.disabled = on;
    submitBtn.classList.toggle("is-loading", on);
  }
  function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("is-on"); setTimeout(() => t.classList.remove("is-on"), 3200); }

  /* ---- friendly error mapping ---- */
  function friendly(err) {
    const m = (err && err.message || "").toLowerCase();
    if (m.includes("invalid login")) return "E-mail ou senha incorretos.";
    if (m.includes("email not confirmed")) return "Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada.";
    if (m.includes("user already registered") || m.includes("already been registered")) return "Este e-mail já tem conta. Tente entrar.";
    if (m.includes("password should be") || m.includes("weak")) return "Senha muito fraca. Use ao menos 6 caracteres.";
    if (m.includes("rate limit") || m.includes("too many")) return "Muitas tentativas. Aguarde um momento e tente novamente.";
    if (m.includes("failed to fetch") || m.includes("networkerror")) return "Falha de conexão. Verifique sua internet.";
    return (err && err.message) || "Algo deu errado. Tente novamente.";
  }

  /* ---- submit ---- */
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (busy) return;
    hideAlert();
    if (!validate()) return;
    const email = emailEl.value.trim();
    const pw = pwEl.value;
    setBusy(true);
    try {
      if (mode === "signin") {
        await auth.signInPassword(email, pw);
        toast("Login efetuado. Redirecionando…");
        location.replace(auth.APP_PAGE);
      } else if (mode === "signup") {
        const res = await auth.signUp(email, pw, location.origin + location.pathname.replace(/login\.html$/, "index.html"));
        if (res.needsConfirm) {
          showAlert("success", "Conta criada! Enviamos um link de confirmação para <b>" + email + "</b>. Confirme para acessar o painel.");
          setMode("signin");
          subEl.textContent = "Confirme seu e-mail e depois entre.";
        } else {
          toast("Conta criada. Redirecionando…");
          location.replace(auth.APP_PAGE);
        }
      } else {
        await auth.recover(email, location.origin + location.pathname);
        showAlert("success", "Se existir uma conta para <b>" + email + "</b>, enviamos um link de redefinição.");
        setMode("signin");
      }
    } catch (err) {
      showAlert("error", friendly(err));
    } finally {
      setBusy(false);
    }
  });

  /* ---- mode controls ---- */
  tabs.addEventListener("click", (e) => { const t = e.target.closest(".auth__tab"); if (t) setMode(t.dataset.mode); });
  document.addEventListener("click", (e) => { const g = e.target.closest("[data-goto]"); if (g) { e.preventDefault(); setMode(g.dataset.goto); } });
  $("#forgotBtn").addEventListener("click", () => setMode("forgot"));

  /* ---- password toggle ---- */
  $("#pwToggle").addEventListener("click", () => {
    const t = $("#pwToggle");
    const show = pwEl.type === "password";
    pwEl.type = show ? "text" : "password";
    t.classList.toggle("is-on", show);
    t.setAttribute("aria-pressed", show ? "true" : "false");
    t.setAttribute("aria-label", show ? "Ocultar senha" : "Mostrar senha");
    pwEl.focus();
  });

  /* ---- clear field error on input ---- */
  [emailEl, pwEl].forEach((inp) => inp.addEventListener("input", () => {
    const f = inp.closest(".field");
    if (f.classList.contains("has-error")) { f.classList.remove("has-error"); f.querySelector(".field__err").textContent = ""; }
  }));

  setMode("signin");
  emailEl.focus();

  // PWA: register service worker (ignored on file://).
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }
})();
