/* ============================================================
   Metryx Dashboard — vanilla JS, no dependencies.
   Deterministic mock data keyed by (client, range) so KPIs,
   charts, funnel, channels and table all stay consistent.
   ============================================================ */
(() => {
  "use strict";

  /* ---------- helpers ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // pt-BR formatters
  const nf = new Intl.NumberFormat("pt-BR");
  const cf = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  const cf2 = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });
  const brl = (v) => cf.format(Math.round(v));
  const compact = (v) => {
    if (v >= 1e6) return (v / 1e6).toFixed(1).replace(".", ",") + " mi";
    if (v >= 1e3) return (v / 1e3).toFixed(1).replace(".", ",") + " mil";
    return nf.format(Math.round(v));
  };

  // mulberry32 seeded PRNG → deterministic data
  const seedFrom = (str) => { let h = 1779033703 ^ str.length; for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); } return h >>> 0; };
  const rng = (seed) => { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

  /* ---------- domain config ---------- */
  const ALL_CLIENT = { id: "all", name: "Todos os clientes", color: "#7c5cff", scale: 1.0 };
  const DEFAULT_CLIENTS = [
    { id: "alves", name: "Alves Performance", color: "#21bfa0", scale: 0.42 },
    { id: "nova", name: "Nova Estética", color: "#f5ae39", scale: 0.27 },
    { id: "prime", name: "Prime Imóveis", color: "#3b9cf6", scale: 0.31 },
    { id: "fit", name: "FitLab Academia", color: "#b04dff", scale: 0.18 },
  ];
  const CLIENT_COLORS = ["#7c5cff", "#21bfa0", "#f5ae39", "#3b9cf6", "#b04dff", "#f1564f", "#e068d8", "#0bc18d"];

  // CLIENTS keeps a stable array identity (mutated in place) so every
  // closure that captured it stays valid. The "all" entry is fixed.
  function loadUserClients() {
    try {
      const s = JSON.parse(localStorage.getItem("metryx-clients") || "null");
      if (Array.isArray(s) && s.length) {
        return s.filter((c) => c && c.id && c.id !== "all" && c.name)
                .map((c) => ({ id: c.id, name: c.name, color: c.color || "#7c5cff", scale: typeof c.scale === "number" ? c.scale : 0.25 }));
      }
    } catch (_) {}
    return DEFAULT_CLIENTS.map((c) => ({ ...c }));
  }
  const CLIENTS = [ALL_CLIENT, ...loadUserClients()];
  function saveClients() { localStorage.setItem("metryx-clients", JSON.stringify(CLIENTS.slice(1))); }

  function makeClientId(name) {
    let base = (name || "cliente").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24) || "cliente";
    let id = base, n = 2;
    while (CLIENTS.some((c) => c.id === id)) id = base + "-" + n++;
    return id;
  }
  function genScale(id) { const r = rng(seedFrom("scale:" + id))(); return +(0.14 + r * 0.34).toFixed(3); } // 0.14–0.48

  function addClient(name, color) {
    const id = makeClientId(name);
    const c = { id, name: name.trim().slice(0, 40), color: color || CLIENT_COLORS[CLIENTS.length % CLIENT_COLORS.length], scale: genScale(id) };
    CLIENTS.push(c); saveClients(); return c;
  }
  function updateClient(id, name, color) {
    const c = CLIENTS.find((x) => x.id === id);
    if (!c || id === "all") return;
    if (name && name.trim()) c.name = name.trim().slice(0, 40);
    if (color) c.color = color;
    saveClients();
  }
  function deleteClient(id) {
    const i = CLIENTS.findIndex((c) => c.id === id);
    if (i < 1) return; // never the "all" entry
    CLIENTS.splice(i, 1); saveClients();
    if (state.clientId === id) selectClient("all");
  }
  const CHANNELS = [
    { id: "meta", name: "Meta Ads", color: "#3b9cf6", w: 0.40 },
    { id: "google", name: "Google Ads", color: "#21bfa0", w: 0.31 },
    { id: "tiktok", name: "TikTok Ads", color: "#b04dff", w: 0.16 },
    { id: "linkedin", name: "LinkedIn", color: "#f5ae39", w: 0.08 },
    { id: "outros", name: "Outros", color: "#717a8c", w: 0.05 },
  ];
  const CAMPAIGNS = ["Black Week - Conversão", "Remarketing Dinâmico", "Leads Topo de Funil", "Lookalike 2%", "Branding Vídeo", "Pesquisa Marca"];
  const ALL_METRICS = [
    { id: "invest", label: "Investimento" },
    { id: "receita", label: "Receita" },
    { id: "roas", label: "ROAS" },
    { id: "cpl", label: "CPL" },
    { id: "cpa", label: "CPA" },
    { id: "ctr", label: "CTR" },
    { id: "leads", label: "Leads" },
    { id: "ticket", label: "Ticket médio" },
  ];

  /* ---------- state ---------- */
  const state = {
    view: "dashboard",
    clientId: "all",
    range: 7,
    theme: localStorage.getItem("metryx-theme") || "dark",
    series: { receita: true, invest: true },
    metrics: JSON.parse(localStorage.getItem("metryx-metrics") || "null") || ["invest", "receita", "roas", "cpl"],
    miniChart: localStorage.getItem("metryx-minichart") !== "0", // showMiniChart, default on
  };

  /* ============================================================
     DATA GENERATION
     ============================================================ */
  function buildData(clientId, range, offsetDays = 0) {
    const client = CLIENTS.find((c) => c.id === clientId) || CLIENTS[0];
    const rand = rng(seedFrom(clientId + ":" + range + ":" + offsetDays));
    const days = range;
    const base = 620 * client.scale * (range / 7); // daily invest baseline grows mildly with window
    const series = [];
    const today = new Date();
    let trend = 0.85;
    for (let i = 0; i < days; i++) {
      trend += (rand() - 0.42) * 0.06;
      trend = clamp(trend, 0.55, 1.5);
      const weekday = new Date(today - (offsetDays + (days - 1 - i)) * 86400000).getDay();
      const wkBoost = weekday === 0 || weekday === 6 ? 0.82 : 1.05; // weekends softer
      const invest = base * trend * wkBoost * (0.9 + rand() * 0.25);
      const roasDay = 4.4 + rand() * 2.6; // 4.4 - 7.0
      const receita = invest * roasDay;
      const d = new Date(today - (offsetDays + (days - 1 - i)) * 86400000);
      series.push({ date: d, invest, receita });
    }
    const invest = series.reduce((s, p) => s + p.invest, 0);
    const receita = series.reduce((s, p) => s + p.receita, 0);
    const roas = receita / invest;

    // funnel
    const impressoes = invest * (33 + rand() * 8); // impressions per R$
    const ctr = 0.014 + rand() * 0.008; // 1.4 - 2.2%
    const cliques = impressoes * ctr;
    const convLead = 0.07 + rand() * 0.025; // click→lead
    const leads = cliques * convLead;
    const cpl = invest / leads;
    const cpa = cpl * (3.2 + rand() * 1.4);
    const ticket = receita / (leads * (0.22 + rand() * 0.05)); // avg ticket per sale

    // channels split (slightly perturbed per client)
    const channels = CHANNELS.map((ch) => {
      const w = ch.w * (0.85 + rand() * 0.3);
      return { ...ch, value: invest * w };
    });
    const chTotal = channels.reduce((s, c) => s + c.value, 0);
    channels.forEach((c) => (c.share = c.value / chTotal));
    channels.sort((a, b) => b.value - a.value);

    // campaigns
    const campaigns = CAMPAIGNS.map((name, i) => {
      const inv = invest * (0.07 + rand() * 0.16);
      const r = 3.0 + rand() * 4.2;
      return { name, color: CHANNELS[i % CHANNELS.length].color, invest: inv, receita: inv * r, roas: r };
    }).sort((a, b) => b.roas - a.roas).slice(0, 5);

    return { client, series, invest, receita, roas, impressoes, cliques, leads, ctr, convLead, cpl, cpa, ticket, channels, campaigns };
  }

  function withDeltas(clientId, range) {
    const cur = buildData(clientId, range, 0);
    const prev = buildData(clientId, range, range);
    const pct = (a, b) => (b === 0 ? 0 : ((a - b) / b) * 100);
    cur.delta = {
      invest: pct(cur.invest, prev.invest),
      receita: pct(cur.receita, prev.receita),
      roas: pct(cur.roas, prev.roas),
      cpl: pct(cur.cpl, prev.cpl),
      cpa: pct(cur.cpa, prev.cpa),
      ctr: pct(cur.ctr, prev.ctr),
      leads: pct(cur.leads, prev.leads),
      ticket: pct(cur.ticket, prev.ticket),
    };
    return cur;
  }

  /* ============================================================
     RENDER: KPI cards
     ============================================================ */
  const METRIC_DEFS = {
    invest: { label: "Investimento", fmt: (d) => brl(d.invest), color: "var(--c-invest)", deltaGood: "up", key: "invest", spark: (d) => d.series.map((p) => p.invest) },
    receita: { label: "Receita", fmt: (d) => brl(d.receita), color: "var(--c-receita)", deltaGood: "up", key: "receita", spark: (d) => d.series.map((p) => p.receita) },
    roas: { label: "ROAS", fmt: (d) => d.roas.toFixed(2).replace(".", ",") + "x", color: "var(--brand)", deltaGood: "up", key: "roas", spark: (d) => d.series.map((p) => p.receita / p.invest) },
    cpl: { label: "CPL", fmt: (d) => cf2.format(d.cpl), color: "var(--c-blue)", deltaGood: "down", key: "cpl", spark: (d) => d.series.map((p) => p.invest).reverse() },
    cpa: { label: "CPA", fmt: (d) => cf2.format(d.cpa), color: "#e068d8", deltaGood: "down", key: "cpa", spark: (d) => d.series.map((p) => p.invest) },
    ctr: { label: "CTR", fmt: (d) => (d.ctr * 100).toFixed(2).replace(".", ",") + "%", color: "#3b9cf6", deltaGood: "up", key: "ctr", spark: (d) => d.series.map((p) => p.receita / p.invest) },
    leads: { label: "Leads", fmt: (d) => nf.format(Math.round(d.leads)), color: "#21bfa0", deltaGood: "up", key: "leads", spark: (d) => d.series.map((p) => p.invest) },
    ticket: { label: "Ticket médio", fmt: (d) => brl(d.ticket), color: "#f5ae39", deltaGood: "up", key: "ticket", spark: (d) => d.series.map((p) => p.receita) },
  };

  // Geometry for the mini chart: line path + area path (filled to baseline).
  // viewBox is 0..w x 0..h; stroke kept constant via vector-effect at render.
  function sparkGeo(values, w, h, pad) {
    pad = pad == null ? 4 : pad;
    const min = Math.min(...values), max = Math.max(...values), span = (max - min) || 1;
    const step = w / (values.length - 1 || 1);
    const pts = values.map((v, i) => [i * step, h - pad - ((v - min) / span) * (h - pad * 2)]);
    const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(" ");
    const area = `${line} L${w.toFixed(2)} ${h} L0 ${h} Z`;
    return { line, area, last: pts[pts.length - 1] };
  }

  function renderKPIs(d) {
    const grid = $("#kpiGrid");
    grid.innerHTML = "";
    const showChart = state.miniChart;
    grid.classList.toggle("kpi-grid--nochart", !showChart);
    state.metrics.forEach((mId) => {
      const m = METRIC_DEFS[mId];
      if (!m) return;
      const dv = d.delta[m.key] ?? 0;
      const good = (m.deltaGood === "up" && dv >= 0) || (m.deltaGood === "down" && dv < 0);
      const arrow = dv >= 0 ? "M5 12l5-5 5 5" : "M5 8l5 5 5-5";
      const card = el("article", "kpi" + (showChart ? "" : " kpi--nochart"));

      let chart = "";
      if (showChart) {
        const W = 100, H = 46;
        const g = sparkGeo(m.spark(d), W, H, 5);
        const gid = "kg-" + mId;
        chart = `
        <div class="kpi__chart">
          <svg class="kpi__spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
            <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="${m.color}" stop-opacity="0.32"/>
              <stop offset="100%" stop-color="${m.color}" stop-opacity="0"/>
            </linearGradient></defs>
            <path d="${g.area}" fill="url(#${gid})"/>
            <path d="${g.line}" fill="none" stroke="${m.color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
          </svg>
        </div>`;
      }

      card.innerHTML = `
        <div class="kpi__body">
          <div class="kpi__top">
            <span class="kpi__label">${m.label}</span>
            <span class="kpi__ico" style="background:color-mix(in srgb, ${m.color} 16%, transparent); color:${m.color}">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none"><path d="M4 18 10 12l3 3 7-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </span>
          </div>
          <div class="kpi__val">${m.fmt(d)}</div>
          <div class="kpi__foot">
            <span class="delta ${good ? "delta--up" : "delta--down"}">
              <svg viewBox="0 0 20 20" width="13" height="13" fill="none"><path d="${arrow}" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
              ${Math.abs(dv).toFixed(1).replace(".", ",")}%
            </span>
            <span class="kpi__cmp">vs. período anterior</span>
          </div>
        </div>${chart}`;
      grid.appendChild(card);
    });
  }

  /* ============================================================
     RENDER: Combo chart (bars = investimento, line+area = receita)
     ============================================================ */
  const SVGNS = "http://www.w3.org/2000/svg";
  function svgEl(tag, attrs) { const n = document.createElementNS(SVGNS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); return n; }

  function renderCombo(d) {
    const host = $("#comboChart");
    host.innerHTML = "";
    const W = host.clientWidth || 640, H = host.clientHeight || 300;
    const pad = { t: 14, r: 12, b: 26, l: 46 };
    const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
    const pts = d.series;
    const showInv = state.series.invest, showRec = state.series.receita;

    let maxV = 0;
    pts.forEach((p) => { if (showInv) maxV = Math.max(maxV, p.invest); if (showRec) maxV = Math.max(maxV, p.receita); });
    maxV = maxV || 1;
    // nice ceil
    const niceMax = (() => { const pow = Math.pow(10, Math.floor(Math.log10(maxV))); return Math.ceil(maxV / pow) * pow; })();

    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Gráfico de receita e investimento" });
    // gradient defs
    const defs = svgEl("defs", {});
    defs.innerHTML = `<linearGradient id="recGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="var(--c-receita)" stop-opacity="0.28"/>
        <stop offset="100%" stop-color="var(--c-receita)" stop-opacity="0"/></linearGradient>
      <linearGradient id="invGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="var(--c-invest)" stop-opacity="1"/>
        <stop offset="100%" stop-color="var(--c-invest)" stop-opacity="0.55"/></linearGradient>`;
    svg.appendChild(defs);

    const yToPx = (v) => pad.t + ih - (v / niceMax) * ih;
    // gridlines + y labels
    const ticks = 4;
    for (let i = 0; i <= ticks; i++) {
      const v = (niceMax / ticks) * i;
      const y = yToPx(v);
      svg.appendChild(svgEl("line", { class: "grid-line", x1: pad.l, y1: y, x2: W - pad.r, y2: y }));
      const tx = svgEl("text", { class: "axis-text", x: pad.l - 8, y: y + 4, "text-anchor": "end" });
      tx.textContent = v >= 1000 ? (v / 1000).toFixed(0) + "k" : Math.round(v);
      svg.appendChild(tx);
    }

    const n = pts.length;
    const slot = iw / n;
    const barW = Math.max(5, Math.min(34, slot * (n > 30 ? 0.7 : 0.46)));

    // bars (investimento)
    if (showInv) {
      pts.forEach((p, i) => {
        const x = pad.l + slot * i + slot / 2 - barW / 2;
        const y = yToPx(p.invest);
        const rect = svgEl("rect", { class: "bar", x: x.toFixed(1), y: y.toFixed(1), width: barW.toFixed(1), height: Math.max(0, pad.t + ih - y).toFixed(1), rx: Math.min(5, barW / 2), fill: "url(#invGrad)" });
        if (!reduceMotion) {
          rect.style.transformOrigin = `${(x + barW / 2).toFixed(1)}px ${(pad.t + ih)}px`;
          rect.animate([{ transform: "scaleY(0)" }, { transform: "scaleY(1)" }], { duration: 520, delay: i * (n > 30 ? 4 : 18), easing: "cubic-bezier(.2,.7,.2,1)", fill: "backwards" });
        }
        svg.appendChild(rect);
      });
    }

    // area + line (receita)
    if (showRec) {
      const linePts = pts.map((p, i) => [pad.l + slot * i + slot / 2, yToPx(p.receita)]);
      const dLine = linePts.map((pt, i) => `${i ? "L" : "M"}${pt[0].toFixed(1)} ${pt[1].toFixed(1)}`).join(" ");
      const dArea = `${dLine} L${linePts[linePts.length - 1][0].toFixed(1)} ${pad.t + ih} L${linePts[0][0].toFixed(1)} ${pad.t + ih} Z`;
      svg.appendChild(svgEl("path", { class: "area-path", d: dArea }));
      const line = svgEl("path", { class: "line-path", d: dLine });
      svg.appendChild(line);
      if (!reduceMotion) {
        const len = line.getTotalLength ? 2000 : 2000;
        line.style.strokeDasharray = len; line.style.strokeDashoffset = len;
        line.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: 900, easing: "ease-out", fill: "forwards" });
      }
      linePts.forEach(([x, y]) => svg.appendChild(svgEl("circle", { cx: x.toFixed(1), cy: y.toFixed(1), r: n > 30 ? 0 : 3, fill: "var(--surface)", stroke: "var(--c-receita)", "stroke-width": 2 })));
    }

    // x labels (skip to avoid crowding)
    const skip = Math.ceil(n / 7);
    pts.forEach((p, i) => {
      if (i % skip !== 0 && i !== n - 1) return;
      const x = pad.l + slot * i + slot / 2;
      const tx = svgEl("text", { class: "axis-text", x: x.toFixed(1), y: H - 8, "text-anchor": "middle" });
      tx.textContent = p.date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
      svg.appendChild(tx);
    });

    // hover guide
    const guide = svgEl("line", { class: "hover-guide", x1: 0, y1: pad.t, x2: 0, y2: pad.t + ih });
    svg.appendChild(guide);
    host.appendChild(svg);

    // tooltip
    const tip = el("div", "chart-tip");
    host.appendChild(tip);
    const onMove = (ev) => {
      const rect = host.getBoundingClientRect();
      const px = (ev.touches ? ev.touches[0].clientX : ev.clientX) - rect.left;
      const idx = clamp(Math.round((px - pad.l - slot / 2) / slot), 0, n - 1);
      const p = pts[idx];
      const cx = pad.l + slot * idx + slot / 2;
      guide.setAttribute("x1", cx); guide.setAttribute("x2", cx); guide.style.opacity = ".7";
      tip.classList.add("is-on");
      tip.style.left = (cx / W) * rect.width + "px";
      tip.style.top = pad.t + 6 + "px";
      tip.innerHTML = `<div class="t-date">${p.date.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" })}</div>
        ${showRec ? `<div class="t-row"><i style="background:var(--c-receita)"></i>Receita <b>${brl(p.receita)}</b></div>` : ""}
        ${showInv ? `<div class="t-row"><i style="background:var(--c-invest)"></i>Investimento <b>${brl(p.invest)}</b></div>` : ""}
        <div class="t-row" style="color:var(--text-3)"><i style="background:var(--brand)"></i>ROAS <b>${(p.receita / p.invest).toFixed(2).replace(".", ",")}x</b></div>`;
    };
    const onLeave = () => { tip.classList.remove("is-on"); guide.style.opacity = "0"; };
    host.addEventListener("mousemove", onMove);
    host.addEventListener("mouseleave", onLeave);
    host.addEventListener("touchstart", onMove, { passive: true });
    host.addEventListener("touchmove", onMove, { passive: true });
    $("#rvSub").textContent = `Diário · ${state.range}d · pico ${brl(maxV)}`;
  }

  /* ============================================================
     RENDER: Funnel
     ============================================================ */
  function renderFunnel(d) {
    const host = $("#funnel");
    host.innerHTML = "";
    const steps = [
      { name: "Impressões", val: d.impressoes, color: "#3b9cf6", conv: null },
      { name: "Cliques", val: d.cliques, color: "#7c5cff", conv: d.ctr },
      { name: "Leads", val: d.leads, color: "#21bfa0", conv: d.convLead },
    ];
    const max = steps[0].val;
    steps.forEach((s, i) => {
      const step = el("div", "fn-step");
      step.innerHTML = `
        <div class="fn-step__head">
          <span class="fn-step__name"><span class="dot" style="background:${s.color}"></span>${s.name}</span>
          <span class="fn-step__val">${compact(s.val)}</span>
        </div>
        <div class="fn-bar"><span style="background:linear-gradient(90deg, ${s.color}, color-mix(in srgb, ${s.color} 55%, transparent))"></span></div>
        ${s.conv != null ? `<div class="fn-conv">Conversão da etapa anterior: <b>${(s.conv * 100).toFixed(1).replace(".", ",")}%</b></div>` : `<div class="fn-conv">Total de leads no período: <b style="color:var(--text)">${nf.format(Math.round(d.leads))}</b></div>`}`;
      host.appendChild(step);
      const bar = $(".fn-bar span", step);
      const pctW = clamp((s.val / max) * 100, 6, 100);
      requestAnimationFrame(() => (bar.style.width = pctW + "%"));
    });
  }

  /* ============================================================
     RENDER: Channels
     ============================================================ */
  function renderChannels(d) {
    const host = $("#channels");
    host.innerHTML = "";
    const max = Math.max(...d.channels.map((c) => c.value));
    d.channels.forEach((c) => {
      const row = el("div", "ch-row");
      row.innerHTML = `
        <span class="ch-name"><span class="ch-dot" style="background:${c.color}"></span>${c.name}</span>
        <span class="ch-track"><span style="background:${c.color}"></span></span>
        <span class="ch-val">${brl(c.value)}<small>${(c.share * 100).toFixed(0)}%</small></span>`;
      host.appendChild(row);
      const bar = $(".ch-track span", row);
      requestAnimationFrame(() => (bar.style.width = clamp((c.value / max) * 100, 4, 100) + "%"));
    });
  }

  /* ============================================================
     RENDER: Campaign table
     ============================================================ */
  function renderTable(d) {
    const tb = $("#campaignTable tbody");
    tb.innerHTML = "";
    d.campaigns.forEach((c) => {
      const cls = c.roas >= 5 ? "good" : c.roas >= 3.5 ? "mid" : "bad";
      const tr = el("tr");
      tr.innerHTML = `
        <td><div class="camp"><span class="tag" style="background:${c.color}"></span>${c.name}</div></td>
        <td class="num">${brl(c.invest)}</td>
        <td class="num">${brl(c.receita)}</td>
        <td class="num"><span class="roas-badge ${cls}">${c.roas.toFixed(2).replace(".", ",")}x</span></td>`;
      tb.appendChild(tr);
    });
  }

  /* ============================================================
     AI insights (derived from current data)
     ============================================================ */
  function computeInsights(d) {
    const best = d.campaigns[0];
    const worst = [...d.campaigns].sort((a, b) => a.roas - b.roas)[0];
    const topCh = d.channels[0];
    return [
      {
        kind: "good", chip: "Oportunidade", chipCls: "chip-good", t: "Escale a campanha de melhor ROAS",
        b: `<b>${best.name}</b> está com ROAS de <b>${best.roas.toFixed(2).replace(".", ",")}x</b>. Realocar ~15% do orçamento de campanhas de baixo retorno pode aumentar a receita em até <b>${brl(best.receita * 0.15)}</b> no período.`,
      },
      {
        kind: "warn", chip: "Atenção", chipCls: "chip-warn", t: "Campanha drenando orçamento",
        b: `<b>${worst.name}</b> tem ROAS de apenas <b>${worst.roas.toFixed(2).replace(".", ",")}x</b>, abaixo da meta de 3x. Revise criativos e segmentação ou pause para economizar <b>${brl(worst.invest)}</b>.`,
      },
      {
        kind: "info", chip: "Mix de canais", chipCls: "chip-info", t: "Concentração em " + topCh.name,
        b: `<b>${topCh.name}</b> concentra <b>${(topCh.share * 100).toFixed(0)}%</b> do investimento. Testar verbas em canais secundários reduz dependência e pode revelar novo público de baixo CPL.`,
      },
      {
        kind: "good", chip: "Tendência", chipCls: "chip-good", t: "Receita acelerando",
        b: `Receita cresceu <b>${d.delta.receita.toFixed(1).replace(".", ",")}%</b> vs. período anterior, enquanto o CPL ${d.delta.cpl < 0 ? "caiu" : "subiu"} <b>${Math.abs(d.delta.cpl).toFixed(1).replace(".", ",")}%</b>. ${d.delta.cpl < 0 ? "Eficiência melhorando — bom momento para escalar." : "Acompanhe o CPL para manter a margem."}`,
      },
    ];
  }

  function renderInsights(d) {
    const body = $("#aiBody");
    body.innerHTML = "";
    computeInsights(d).forEach((ins) => {
      const card = el("div", "insight is-" + ins.kind);
      card.innerHTML = `<div class="insight__t">${ins.t}<span class="insight__chip ${ins.chipCls}">${ins.chip}</span></div><div class="insight__b">${ins.b}</div>`;
      body.appendChild(card);
    });
  }

  /* ============================================================
     SECONDARY VIEWS
     ============================================================ */
  const VIEW_META = {
    dashboard: { title: "Visão geral" },
    planilha: { title: "Planilha" },
    integracoes: { title: "Integrações" },
    relatorios: { title: "Relatórios" },
    insights: { title: "Insights IA" },
    alertas: { title: "Alertas" },
    clientes: { title: "Clientes" },
    config: { title: "Configurações" },
  };

  const clientInitials = (name) => (name || "?").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  /* ---------- client add/edit modal ---------- */
  let clientModal = null;
  function ensureClientModal() {
    if (clientModal) return clientModal;
    const wrap = el("div", "modal");
    wrap.id = "clientModal";
    wrap.setAttribute("aria-hidden", "true");
    wrap.innerHTML = `
      <div class="modal__scrim" data-close></div>
      <div class="modal__card" role="dialog" aria-modal="true" aria-labelledby="cmTitle">
        <header class="modal__head">
          <h2 id="cmTitle" class="card__title">Novo cliente</h2>
          <button class="icon-btn" data-close aria-label="Fechar">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          </button>
        </header>
        <form class="modal__body" id="clientForm" novalidate>
          <div class="m-field">
            <label for="cmName">Nome do cliente</label>
            <input id="cmName" type="text" maxlength="40" autocomplete="off" placeholder="Ex: Alves Performance" />
            <p class="m-err" id="cmErr" aria-live="polite"></p>
          </div>
          <div class="m-field">
            <label>Cor de identificação</label>
            <div class="swatches" id="cmSwatches" role="radiogroup" aria-label="Cor"></div>
          </div>
          <div class="modal__foot">
            <button type="button" class="btn btn--ghost" data-close>Cancelar</button>
            <button type="submit" class="btn btn--brand" id="cmSave">Salvar</button>
          </div>
        </form>
      </div>`;
    document.body.appendChild(wrap);

    const sw = $("#cmSwatches", wrap);
    sw.innerHTML = CLIENT_COLORS.map((c) => `<button type="button" class="swatch" role="radio" aria-checked="false" data-color="${c}" style="--sw:${c}" aria-label="Cor ${c}"></button>`).join("");
    sw.addEventListener("click", (e) => {
      const b = e.target.closest(".swatch");
      if (!b) return;
      $$(".swatch", sw).forEach((s) => { s.classList.remove("is-sel"); s.setAttribute("aria-checked", "false"); });
      b.classList.add("is-sel"); b.setAttribute("aria-checked", "true");
      clientModal.color = b.dataset.color;
    });

    wrap.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) closeClientModal(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && wrap.classList.contains("is-open")) closeClientModal(); });
    $("#clientForm", wrap).addEventListener("submit", onClientSubmit);

    clientModal = { wrap, name: $("#cmName", wrap), err: $("#cmErr", wrap), title: $("#cmTitle", wrap), swatches: sw, mode: "add", id: null, color: CLIENT_COLORS[0] };
    return clientModal;
  }
  function selectModalColor(color) {
    const m = clientModal;
    m.color = color;
    $$(".swatch", m.swatches).forEach((s) => {
      const on = s.dataset.color === color;
      s.classList.toggle("is-sel", on); s.setAttribute("aria-checked", on ? "true" : "false");
    });
  }
  function openClientModal(mode, client) {
    const m = ensureClientModal();
    m.mode = mode;
    m.id = client ? client.id : null;
    m.title.textContent = mode === "edit" ? "Renomear cliente" : "Novo cliente";
    m.name.value = client ? client.name : "";
    m.err.textContent = "";
    m.name.closest(".m-field").classList.remove("has-error");
    selectModalColor(client ? client.color : CLIENT_COLORS[CLIENTS.length % CLIENT_COLORS.length]);
    m.wrap.classList.add("is-open");
    m.wrap.setAttribute("aria-hidden", "false");
    setTimeout(() => m.name.focus(), 30);
  }
  function closeClientModal() {
    if (!clientModal) return;
    clientModal.wrap.classList.remove("is-open");
    clientModal.wrap.setAttribute("aria-hidden", "true");
  }
  function onClientSubmit(e) {
    e.preventDefault();
    const m = clientModal;
    const name = m.name.value.trim();
    const field = m.name.closest(".m-field");
    if (!name) { field.classList.add("has-error"); m.err.textContent = "Informe o nome do cliente."; m.name.focus(); return; }
    const dup = CLIENTS.some((c) => c.id !== m.id && c.name.toLowerCase() === name.toLowerCase());
    if (dup) { field.classList.add("has-error"); m.err.textContent = "Já existe um cliente com esse nome."; m.name.focus(); return; }

    if (m.mode === "edit") {
      updateClient(m.id, name, m.color);
      if (state.clientId === m.id) selectClient(m.id); // refresh topbar labels
      toast("Cliente atualizado");
    } else {
      addClient(name, m.color);
      toast("Cliente adicionado");
    }
    buildClientMenu();
    renderClientes();
    closeClientModal();
  }

  function renderClientes() {
    const host = $("#view-generic");
    const list = CLIENTS.filter((c) => c.id !== "all");
    const cards = list.map((c) => {
      const d = withDeltas(c.id, state.range);
      return `<article class="client-card" data-goto="${c.id}" role="button" tabindex="0" aria-label="Abrir ${c.name}">
        <div class="client-card__actions">
          <button class="cc-act" data-edit="${c.id}" aria-label="Renomear ${c.name}" title="Renomear">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none"><path d="M4 20h4L18.5 9.5a2 2 0 0 0 0-2.8l-1.2-1.2a2 2 0 0 0-2.8 0L4 16v4Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="m13.5 6.5 4 4" stroke="currentColor" stroke-width="1.8"/></svg>
          </button>
          <button class="cc-act cc-act--danger" data-del="${c.id}" aria-label="Remover ${c.name}" title="Remover">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none"><path d="M5 7h14M10 7V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>
        <div class="client-card__top">
          <span class="client-card__av" style="background:linear-gradient(135deg, ${c.color}, color-mix(in srgb, ${c.color} 55%, #000))">${clientInitials(c.name)}</span>
          <div><div class="client-card__name">${c.name}</div><div class="client-card__meta">ROAS ${d.roas.toFixed(2).replace(".", ",")}x · ${state.range} dias</div></div>
        </div>
        <div class="client-card__stats">
          <div class="client-card__stat"><div class="l">Investimento</div><div class="v">${brl(d.invest)}</div></div>
          <div class="client-card__stat"><div class="l">Receita</div><div class="v">${brl(d.receita)}</div></div>
        </div>
      </article>`;
    }).join("");
    const addCard = `<button class="client-add" id="addClientCard">
        <span class="client-add__ico"><svg viewBox="0 0 24 24" width="22" height="22" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span>
        Adicionar cliente
      </button>`;
    host.innerHTML = `
      <div class="clientes">
        <div class="clientes__head">
          <p class="clientes__count">${list.length} cliente${list.length === 1 ? "" : "s"} ativo${list.length === 1 ? "" : "s"}. Clique num card para abrir o painel.</p>
          <button class="btn btn--brand" id="addClientBtn">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
            Adicionar cliente
          </button>
        </div>
        <div class="client-grid">${cards}${addCard}</div>
      </div>`;

    $$("[data-goto]", host).forEach((card) => {
      const go = () => { selectClient(card.dataset.goto); switchView("dashboard"); };
      card.addEventListener("click", (e) => { if (e.target.closest(".cc-act")) return; go(); });
      card.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
    });
    $$("[data-edit]", host).forEach((b) => b.addEventListener("click", (e) => {
      e.stopPropagation();
      openClientModal("edit", CLIENTS.find((c) => c.id === b.dataset.edit));
    }));
    $$("[data-del]", host).forEach((b) => b.addEventListener("click", (e) => {
      e.stopPropagation();
      const c = CLIENTS.find((x) => x.id === b.dataset.del);
      if (!c) return;
      if (confirm(`Remover o cliente "${c.name}"? Esta ação não pode ser desfeita.`)) {
        deleteClient(c.id);
        buildClientMenu();
        renderClientes();
        toast("Cliente removido");
      }
    }));
    $("#addClientBtn").addEventListener("click", () => openClientModal("add"));
    $("#addClientCard").addEventListener("click", () => openClientModal("add"));
  }

  /* ============================================================
     RELATÓRIOS — functional report builder + PDF/PNG export
     ============================================================ */
  const REPORT_METRICS = ["invest", "receita", "roas", "cpl", "leads", "ticket"];
  const reportCfg = { clientId: state.clientId, range: state.range, title: "Relatório de performance" };

  function loadReports() { try { return JSON.parse(localStorage.getItem("metryx-reports") || "[]"); } catch (_) { return []; } }
  function saveReports(list) { localStorage.setItem("metryx-reports", JSON.stringify(list)); }

  function repKpi(d, id) {
    const m = METRIC_DEFS[id]; if (!m) return "";
    const dv = d.delta[m.key] ?? 0;
    const good = (m.deltaGood === "up" && dv >= 0) || (m.deltaGood === "down" && dv < 0);
    const arrow = dv >= 0 ? "M5 12l5-5 5 5" : "M5 8l5 5 5-5";
    return `<div class="report-kpi" style="--mc:${m.color}">
      <div class="report-kpi__l">${m.label}</div>
      <div class="report-kpi__v">${m.fmt(d)}</div>
      <div class="report-kpi__d ${good ? "is-up" : "is-down"}">
        <svg viewBox="0 0 20 20" width="12" height="12" fill="none"><path d="${arrow}" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
        ${Math.abs(dv).toFixed(1).replace(".", ",")}% vs. anterior
      </div>
    </div>`;
  }

  function reportHTML(cfg) {
    const d = withDeltas(cfg.clientId, cfg.range);
    const client = (CLIENTS.find((c) => c.id === cfg.clientId) || CLIENTS[0]).name;
    const now = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
    const kpis = REPORT_METRICS.map((id) => repKpi(d, id)).join("");

    const fSteps = [
      { name: "Impressões", val: d.impressoes, color: "#3b9cf6", conv: null },
      { name: "Cliques", val: d.cliques, color: "#7c5cff", conv: d.ctr },
      { name: "Leads", val: d.leads, color: "#21bfa0", conv: d.convLead },
    ];
    const fMax = fSteps[0].val;
    const funnel = fSteps.map((s) => `
      <div class="rep-fn">
        <div class="rep-fn__head"><span><span class="rep-dot" style="background:${s.color}"></span>${s.name}</span><b>${compact(s.val)}</b></div>
        <div class="rep-fn__bar"><span style="width:${clamp((s.val / fMax) * 100, 6, 100)}%;background:${s.color}"></span></div>
        ${s.conv != null ? `<div class="rep-fn__c">Conversão: ${(s.conv * 100).toFixed(1).replace(".", ",")}%</div>` : ""}
      </div>`).join("");

    const chMax = Math.max(...d.channels.map((c) => c.value));
    const channels = d.channels.map((c) => `
      <div class="rep-ch">
        <span class="rep-ch__n"><span class="rep-dot" style="background:${c.color}"></span>${c.name}</span>
        <span class="rep-ch__t"><span style="width:${clamp((c.value / chMax) * 100, 4, 100)}%;background:${c.color}"></span></span>
        <span class="rep-ch__v">${brl(c.value)} <small>${(c.share * 100).toFixed(0)}%</small></span>
      </div>`).join("");

    const camps = d.campaigns.map((c) => {
      const cls = c.roas >= 5 ? "good" : c.roas >= 3.5 ? "mid" : "bad";
      return `<tr><td><span class="tag" style="background:${c.color}"></span>${c.name}</td><td class="num">${brl(c.invest)}</td><td class="num">${brl(c.receita)}</td><td class="num"><span class="roas-badge ${cls}">${c.roas.toFixed(2).replace(".", ",")}x</span></td></tr>`;
    }).join("");

    const ins = computeInsights(d).slice(0, 3).map((i) => `<li class="rep-ins is-${i.kind}"><strong>${i.t}.</strong> ${i.b}</li>`).join("");

    return `
      <div class="report" id="reportArea">
        <header class="report__head">
          <div class="report__brand">
            <span class="brand-mark" style="background:#7c5cff"><svg viewBox="0 0 24 24" width="18" height="18" fill="none"><path d="M3 17 9 11l4 4 8-8" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M21 7v5M21 7h-5" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
            <div>
              <div class="report__title">${cfg.title || "Relatório de performance"}</div>
              <div class="report__meta">${client} · últimos ${cfg.range} dias</div>
            </div>
          </div>
          <div class="report__date">Gerado em<br><b>${now}</b></div>
        </header>

        <div class="report__kpis">${kpis}</div>

        <div class="report__cols">
          <section class="report__sec">
            <h3 class="report__h">Funil de conversão</h3>
            ${funnel}
          </section>
          <section class="report__sec">
            <h3 class="report__h">Investimento por canal</h3>
            ${channels}
          </section>
        </div>

        <section class="report__sec">
          <h3 class="report__h">Campanhas (top ${d.campaigns.length})</h3>
          <table class="data-table report__table"><thead><tr><th>Campanha</th><th class="num">Invest.</th><th class="num">Receita</th><th class="num">ROAS</th></tr></thead><tbody>${camps}</tbody></table>
        </section>

        <section class="report__sec">
          <h3 class="report__h">Resumo executivo</h3>
          <ul class="rep-ins-list">${ins}</ul>
        </section>

        <footer class="report__foot">Metryx · Relatório gerado automaticamente · ${now}</footer>
      </div>`;
  }

  function generateReport() {
    const host = $("#reportPreview");
    if (host) host.innerHTML = reportHTML(reportCfg);
  }

  async function exportReportPNG() {
    const area = $("#reportArea");
    if (!area) return;
    if (typeof window.html2canvas !== "function") { toast("Captura indisponível", false); return; }
    const bg = toRGB((getComputedStyle(document.documentElement).getPropertyValue("--bg") || "#0a0d14").trim());
    const frame = el("div", "export-frame");
    frame.style.width = Math.max(760, area.scrollWidth) + "px";
    frame.style.background = bg;
    frame.appendChild(area.cloneNode(true));
    document.body.appendChild(frame);
    normalizeForCapture(frame);
    try {
      const canvas = await window.html2canvas(frame, { backgroundColor: bg, scale: 2, logging: false });
      await new Promise((res) => canvas.toBlob((blob) => {
        if (!blob) { toast("Falha ao gerar PNG", false); return res(); }
        const url = URL.createObjectURL(blob);
        const a = el("a"); a.href = url; a.download = `relatorio-${reportCfg.clientId}-${reportCfg.range}d.png`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        toast("Relatório PNG baixado"); res();
      }, "image/png"));
    } catch (e) { console.error("exportReportPNG:", e); toast("Falha ao gerar PNG", false); }
    finally { frame.remove(); }
  }

  function exportReportPDF() {
    document.body.classList.add("printing");
    const after = () => { document.body.classList.remove("printing"); window.removeEventListener("afterprint", after); };
    window.addEventListener("afterprint", after);
    setTimeout(() => window.print(), 60);
    setTimeout(after, 1500); // fallback if afterprint never fires
  }

  function persistCurrentReport() {
    const list = loadReports();
    const client = (CLIENTS.find((c) => c.id === reportCfg.clientId) || CLIENTS[0]).name;
    list.unshift({ id: "r" + Date.now(), title: reportCfg.title || "Relatório", clientId: reportCfg.clientId, clientName: client, range: reportCfg.range, date: new Date().toISOString() });
    saveReports(list.slice(0, 30));
    renderSavedReports();
    toast("Relatório salvo");
  }

  function renderSavedReports() {
    const host = $("#repSaved");
    if (!host) return;
    const list = loadReports();
    if (!list.length) { host.innerHTML = `<p class="rep-empty">Nenhum relatório salvo ainda. Gere e clique em <b>Salvar</b>.</p>`; return; }
    host.innerHTML = list.map((r) => {
      const dt = new Date(r.date).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
      return `<div class="rep-item" data-open="${r.id}" role="button" tabindex="0">
        <div class="rep-item__ico"><svg viewBox="0 0 24 24" width="18" height="18" fill="none"><path d="M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M14 3v5h5" stroke="currentColor" stroke-width="1.7"/></svg></div>
        <div class="rep-item__txt"><div class="rep-item__t">${r.title}</div><div class="rep-item__m">${r.clientName} · ${r.range} dias · ${dt}</div></div>
        <button class="cc-act cc-act--danger" data-del="${r.id}" aria-label="Excluir" title="Excluir"><svg viewBox="0 0 24 24" width="15" height="15" fill="none"><path d="M5 7h14M10 7V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
      </div>`;
    }).join("");
    $$("[data-open]", host).forEach((it) => {
      const open = () => {
        const r = loadReports().find((x) => x.id === it.dataset.open);
        if (!r) return;
        reportCfg.clientId = r.clientId; reportCfg.range = r.range; reportCfg.title = r.title;
        syncReportControls();
        generateReport();
        $("#reportPreview").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
      };
      it.addEventListener("click", (e) => { if (e.target.closest("[data-del]")) return; open(); });
      it.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
    });
    $$("[data-del]", host).forEach((b) => b.addEventListener("click", (e) => {
      e.stopPropagation();
      saveReports(loadReports().filter((x) => x.id !== b.dataset.del));
      renderSavedReports();
      toast("Relatório excluído");
    }));
  }

  function syncReportControls() {
    const t = $("#repTitle"); if (t) t.value = reportCfg.title;
    const sel = $("#repClient"); if (sel) sel.value = reportCfg.clientId;
    $$("#repRange .seg").forEach((s) => s.classList.toggle("is-active", +s.dataset.range === reportCfg.range));
  }

  function renderRelatorios() {
    const host = $("#view-generic");
    host.innerHTML = `
      <div class="rep">
        <div class="panel rep-controls">
          <div class="rep-ctl">
            <label for="repTitle">Título</label>
            <input id="repTitle" type="text" maxlength="60" value="${reportCfg.title}" placeholder="Relatório de performance" />
          </div>
          <div class="rep-ctl">
            <label for="repClient">Cliente</label>
            <select id="repClient" class="rep-select">${CLIENTS.map((c) => `<option value="${c.id}" ${c.id === reportCfg.clientId ? "selected" : ""}>${c.name}</option>`).join("")}</select>
          </div>
          <div class="rep-ctl">
            <label>Período</label>
            <div class="segmented" id="repRange">
              <button class="seg ${reportCfg.range === 7 ? "is-active" : ""}" data-range="7">7 dias</button>
              <button class="seg ${reportCfg.range === 30 ? "is-active" : ""}" data-range="30">30 dias</button>
              <button class="seg ${reportCfg.range === 90 ? "is-active" : ""}" data-range="90">90 dias</button>
            </div>
          </div>
          <button class="btn btn--brand" id="repGen">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none"><path d="M5 12h14M12 5v14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
            Gerar relatório
          </button>
        </div>

        <div class="rep-actions">
          <button class="btn btn--ghost" id="repPdf"><svg viewBox="0 0 24 24" width="16" height="16" fill="none"><path d="M6 9V3h9l3 3v3M6 18v3h12v-3M4 9h16v9H4z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg> Baixar PDF</button>
          <button class="btn btn--ghost" id="repPng"><svg viewBox="0 0 24 24" width="16" height="16" fill="none"><rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.7"/><path d="m3 16 5-4 4 3 3-3 6 5" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><circle cx="8.5" cy="9" r="1.5" fill="currentColor"/></svg> Baixar PNG</button>
          <button class="btn btn--ghost" id="repShare"><svg viewBox="0 0 24 24" width="16" height="16" fill="none"><path d="M8.7 10.7 15.3 7M8.7 13.3l6.6 3.7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="6" cy="12" r="2.4" stroke="currentColor" stroke-width="1.8"/><circle cx="18" cy="6" r="2.4" stroke="currentColor" stroke-width="1.8"/><circle cx="18" cy="18" r="2.4" stroke="currentColor" stroke-width="1.8"/></svg> Compartilhar</button>
          <button class="btn btn--brand" id="repSave" style="margin-left:auto"><svg viewBox="0 0 24 24" width="16" height="16" fill="none"><path d="M5 4h11l3 3v13H5z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M8 4v5h7M8 20v-6h8v6" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg> Salvar relatório</button>
        </div>

        <div id="reportPreview" class="rep-preview"></div>

        <section class="rep-saved-wrap">
          <h3 class="report__h" style="margin:6px 0 12px">Relatórios salvos</h3>
          <div id="repSaved" class="rep-saved"></div>
        </section>
      </div>`;

    generateReport();
    renderSavedReports();

    $("#repTitle").addEventListener("input", (e) => { reportCfg.title = e.target.value; generateReport(); });
    $("#repClient").addEventListener("change", (e) => { reportCfg.clientId = e.target.value; generateReport(); });
    $$("#repRange .seg").forEach((s) => s.addEventListener("click", () => {
      reportCfg.range = +s.dataset.range; syncReportControls(); generateReport();
    }));
    $("#repGen").addEventListener("click", () => { generateReport(); toast("Relatório gerado"); });
    $("#repPdf").addEventListener("click", exportReportPDF);
    $("#repPng").addEventListener("click", exportReportPNG);
    $("#repSave").addEventListener("click", persistCurrentReport);
    $("#repShare").addEventListener("click", () => {
      const url = location.href.split("#")[0].split("?")[0] + "?client=" + reportCfg.clientId + "&range=" + reportCfg.range;
      (navigator.clipboard?.writeText(url) || Promise.reject()).then(() => toast("Link do relatório copiado")).catch(() => toast("Link: " + url));
    });
  }

  /* ============================================================
     PLANILHA — editable media-plan spreadsheet (per client)
     ============================================================ */
  const SHEET_CHANNELS = CHANNELS.map((c) => c.name);
  let sheet = [];
  let sheetClientId = state.clientId === "all" ? (CLIENTS[1] ? CLIENTS[1].id : "all") : state.clientId;
  let sheetSaveTimer = null;

  const sheetKey = (id) => "metryx-sheet:" + id;
  function loadSheet(clientId) {
    try { const s = JSON.parse(localStorage.getItem(sheetKey(clientId)) || "null"); if (Array.isArray(s)) return s; } catch (_) {}
    const d = withDeltas(clientId, 30); // seed from this client's campaigns
    return d.campaigns.map((c, i) => ({
      campanha: c.name,
      canal: CHANNELS[i % CHANNELS.length].name,
      invest: Math.round(c.invest),
      receita: Math.round(c.receita),
      leads: Math.max(1, Math.round(c.invest / d.cpl)),
    }));
  }
  function saveSheet() {
    clearTimeout(sheetSaveTimer);
    sheetSaveTimer = setTimeout(() => localStorage.setItem(sheetKey(sheetClientId), JSON.stringify(sheet)), 350);
  }
  const num = (v) => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
  function roasClass(r) { return r >= 5 ? "good" : r >= 3.5 ? "mid" : "bad"; }

  function sheetTotals() {
    return sheet.reduce((t, r) => { t.invest += num(r.invest); t.receita += num(r.receita); t.leads += num(r.leads); return t; }, { invest: 0, receita: 0, leads: 0 });
  }

  function rowHTML(r, i) {
    const inv = num(r.invest), rec = num(r.receita), lds = num(r.leads);
    const roas = inv > 0 ? rec / inv : 0;
    const cpl = lds > 0 ? inv / lds : 0;
    return `<tr data-row="${i}">
      <td class="pl-c-name"><input type="text" data-f="campanha" value="${(r.campanha || "").replace(/"/g, "&quot;")}" placeholder="Nome da campanha" /></td>
      <td><select data-f="canal">${SHEET_CHANNELS.map((c) => `<option ${c === r.canal ? "selected" : ""}>${c}</option>`).join("")}</select></td>
      <td><input type="number" data-f="invest" min="0" step="1" value="${inv}" /></td>
      <td><input type="number" data-f="receita" min="0" step="1" value="${rec}" /></td>
      <td><input type="number" data-f="leads" min="0" step="1" value="${lds}" /></td>
      <td class="num"><span class="roas-badge ${roasClass(roas)} pl-roas">${roas.toFixed(2).replace(".", ",")}x</span></td>
      <td class="num pl-cpl">${cpl > 0 ? cf2.format(cpl) : "—"}</td>
      <td class="pl-del"><button class="cc-act cc-act--danger" data-del-row="${i}" aria-label="Excluir linha" title="Excluir"><svg viewBox="0 0 24 24" width="15" height="15" fill="none"><path d="M5 7h14M10 7V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button></td>
    </tr>`;
  }

  function totalsHTML() {
    const t = sheetTotals();
    const roas = t.invest > 0 ? t.receita / t.invest : 0;
    const cpl = t.leads > 0 ? t.invest / t.leads : 0;
    return `<tr class="pl-totals">
      <td>Total · ${sheet.length} linha${sheet.length === 1 ? "" : "s"}</td><td></td>
      <td class="pl-t-invest">${brl(t.invest)}</td>
      <td class="pl-t-receita">${brl(t.receita)}</td>
      <td class="pl-t-leads">${nf.format(t.leads)}</td>
      <td class="num"><span class="roas-badge ${roasClass(roas)} pl-t-roas">${roas.toFixed(2).replace(".", ",")}x</span></td>
      <td class="num pl-t-cpl">${cpl > 0 ? cf2.format(cpl) : "—"}</td>
      <td></td>
    </tr>`;
  }

  function renderSheetBody() {
    const tb = $("#plBody");
    if (!tb) return;
    tb.innerHTML = sheet.map((r, i) => rowHTML(r, i)).join("") || `<tr class="pl-empty-row"><td colspan="8">Nenhuma linha. Clique em <b>+ Linha</b> ou importe um CSV.</td></tr>`;
    $("#plFoot").innerHTML = sheet.length ? totalsHTML() : "";
  }

  function recalcRow(tr) {
    const i = +tr.dataset.row;
    const r = sheet[i]; if (!r) return;
    const inv = num(r.invest), rec = num(r.receita), lds = num(r.leads);
    const roas = inv > 0 ? rec / inv : 0, cpl = lds > 0 ? inv / lds : 0;
    const rb = $(".pl-roas", tr); rb.textContent = roas.toFixed(2).replace(".", ",") + "x"; rb.className = "roas-badge " + roasClass(roas) + " pl-roas";
    $(".pl-cpl", tr).textContent = cpl > 0 ? cf2.format(cpl) : "—";
  }
  function recalcTotals() { $("#plFoot").innerHTML = sheet.length ? totalsHTML() : ""; }

  function exportSheetCSV() {
    const head = ["Campanha", "Canal", "Investimento", "Receita", "Leads"];
    const esc = (v) => { v = String(v ?? ""); return /[",;\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    const lines = [head.join(",")].concat(sheet.map((r) => [r.campanha, r.canal, num(r.invest), num(r.receita), num(r.leads)].map(esc).join(",")));
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = el("a"); a.href = url; a.download = `planilha-${sheetClientId}.csv`; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("CSV exportado");
  }

  function parseCSV(text) {
    const rows = []; let row = [], cur = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
      else if (ch === '"') q = true;
      else if (ch === "," || ch === ";") { row.push(cur); cur = ""; }
      else if (ch === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
      else if (ch !== "\r") cur += ch;
    }
    if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
    return rows.filter((r) => r.some((c) => c.trim() !== ""));
  }
  function importSheetCSV(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        let rows = parseCSV(String(reader.result));
        if (!rows.length) { toast("CSV vazio", false); return; }
        const first = rows[0].map((c) => c.trim().toLowerCase());
        if (first.some((c) => /campanha|investimento|canal/.test(c))) rows = rows.slice(1); // drop header
        sheet = rows.map((r) => ({
          campanha: (r[0] || "Campanha").trim(),
          canal: SHEET_CHANNELS.includes((r[1] || "").trim()) ? (r[1] || "").trim() : SHEET_CHANNELS[0],
          invest: num((r[2] || "").replace(/[^\d.,-]/g, "").replace(".", "").replace(",", ".")),
          receita: num((r[3] || "").replace(/[^\d.,-]/g, "").replace(".", "").replace(",", ".")),
          leads: Math.round(num((r[4] || "").replace(/[^\d.-]/g, ""))),
        }));
        saveSheet(); renderSheetBody();
        toast(`${sheet.length} linhas importadas`);
      } catch (e) { console.error(e); toast("Falha ao importar CSV", false); }
    };
    reader.readAsText(file);
  }

  function renderPlanilha() {
    if (state.clientId !== "all") sheetClientId = state.clientId;
    if (!CLIENTS.some((c) => c.id === sheetClientId)) sheetClientId = CLIENTS[1] ? CLIENTS[1].id : "all";
    sheet = loadSheet(sheetClientId);
    const host = $("#view-generic");
    host.innerHTML = `
      <div class="pl">
        <div class="panel pl-toolbar">
          <div class="rep-ctl">
            <label for="plClient">Cliente</label>
            <select id="plClient" class="rep-select">${CLIENTS.filter((c) => c.id !== "all").map((c) => `<option value="${c.id}" ${c.id === sheetClientId ? "selected" : ""}>${c.name}</option>`).join("")}</select>
          </div>
          <div class="pl-toolbar__actions">
            <button class="btn btn--ghost" id="plImport"><svg viewBox="0 0 24 24" width="16" height="16" fill="none"><path d="M12 4v10m0 0 4-4m-4 4-4-4M5 19h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg> Importar CSV</button>
            <button class="btn btn--ghost" id="plExport"><svg viewBox="0 0 24 24" width="16" height="16" fill="none"><path d="M12 20V10m0 0 4 4m-4-4-4 4M5 5h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg> Exportar CSV</button>
            <button class="btn btn--brand" id="plAdd"><svg viewBox="0 0 24 24" width="16" height="16" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg> Linha</button>
            <input type="file" id="plFile" accept=".csv,text/csv" hidden />
          </div>
        </div>

        <div class="panel pl-sheet">
          <div class="table-wrap">
            <table class="data-table pl-table">
              <thead><tr>
                <th>Campanha</th><th>Canal</th><th>Investimento</th><th>Receita</th><th>Leads</th>
                <th class="num">ROAS</th><th class="num">CPL</th><th></th>
              </tr></thead>
              <tbody id="plBody"></tbody>
              <tfoot id="plFoot"></tfoot>
            </table>
          </div>
          <p class="pl-hint">Edite as células diretamente. ROAS e CPL são calculados automaticamente. Tudo salvo no navegador por cliente.</p>
        </div>
      </div>`;

    renderSheetBody();

    const body = $("#plBody");
    body.addEventListener("input", (e) => {
      const inp = e.target.closest("[data-f]"); if (!inp) return;
      const tr = inp.closest("tr"); const i = +tr.dataset.row; const f = inp.dataset.f;
      sheet[i][f] = inp.type === "number" ? num(inp.value) : inp.value;
      if (f === "invest" || f === "receita" || f === "leads") { recalcRow(tr); recalcTotals(); }
      saveSheet();
    });
    body.addEventListener("change", (e) => { if (e.target.matches("select[data-f]")) saveSheet(); });
    body.addEventListener("click", (e) => {
      const del = e.target.closest("[data-del-row]"); if (!del) return;
      sheet.splice(+del.dataset.delRow, 1); saveSheet(); renderSheetBody();
    });

    $("#plClient").addEventListener("change", (e) => {
      sheetClientId = e.target.value; sheet = loadSheet(sheetClientId); renderSheetBody();
    });
    $("#plAdd").addEventListener("click", () => {
      sheet.push({ campanha: "", canal: SHEET_CHANNELS[0], invest: 0, receita: 0, leads: 0 });
      saveSheet(); renderSheetBody();
      const last = $("#plBody tr:last-child input[data-f=campanha]"); if (last) last.focus();
    });
    $("#plExport").addEventListener("click", exportSheetCSV);
    $("#plImport").addEventListener("click", () => $("#plFile").click());
    $("#plFile").addEventListener("change", (e) => { if (e.target.files[0]) importSheetCSV(e.target.files[0]); e.target.value = ""; });
  }

  /* ============================================================
     INSIGHTS IA — analysis engine + assistant (heuristic, on-data)
     ============================================================ */
  function perfScore(d) {
    let s = 0;
    s += clamp(d.roas / 6, 0, 1) * 50;                       // ROAS (6x → full)
    s += clamp((d.delta.receita + 20) / 40, 0, 1) * 30;      // receita trend (-20..+20%)
    s += clamp((-d.delta.cpl + 20) / 40, 0, 1) * 20;         // CPL trend (down = good)
    s = Math.round(clamp(s, 0, 100));
    const label = s >= 75 ? "Excelente" : s >= 55 ? "Saudável" : s >= 40 ? "Requer atenção" : "Crítico";
    const color = s >= 75 ? "#21bfa0" : s >= 55 ? "#3b9cf6" : s >= 40 ? "#f5ae39" : "#f1564f";
    return { score: s, label, color };
  }

  function analyze(d) {
    const out = computeInsights(d).slice(); // base 4
    // funnel leak — which stage is weakest vs benchmark
    if (d.ctr < 0.016) {
      out.push({ kind: "warn", chip: "Funil", chipCls: "chip-warn", t: "CTR abaixo do esperado",
        b: `CTR de <b>${(d.ctr * 100).toFixed(2).replace(".", ",")}%</b> (alvo ~1,8%). Os criativos não estão atraindo cliques — teste novas variações de anúncio e chamadas.` });
    }
    if (d.convLead < 0.08) {
      out.push({ kind: "warn", chip: "Funil", chipCls: "chip-warn", t: "Conversão clique→lead baixa",
        b: `Apenas <b>${(d.convLead * 100).toFixed(1).replace(".", ",")}%</b> dos cliques viram lead. Gargalo na landing page — revise oferta, formulário e velocidade.` });
    } else {
      out.push({ kind: "good", chip: "Funil", chipCls: "chip-good", t: "Conversão de leads saudável",
        b: `<b>${(d.convLead * 100).toFixed(1).replace(".", ",")}%</b> dos cliques viram lead, acima da média. Landing page convertendo bem.` });
    }
    // CPL standing
    out.push({ kind: d.delta.cpl < 0 ? "good" : "info", chip: "Eficiência", chipCls: "chip-info", t: "Custo por lead",
      b: `CPL atual <b>${cf2.format(d.cpl)}</b>, ${d.delta.cpl < 0 ? "abaixo" : "acima"} do período anterior (${d.delta.cpl >= 0 ? "+" : ""}${d.delta.cpl.toFixed(1).replace(".", ",")}%). ${d.delta.cpl < 0 ? "Eficiência ganhando — escale com segurança." : "Otimize segmentação para conter o CPL."}` });
    return out;
  }

  function aiAnswer(q, d) {
    q = (q || "").toLowerCase();
    const best = d.campaigns[0], worst = [...d.campaigns].sort((a, b) => a.roas - b.roas)[0], top = d.channels[0];
    const pct = (v) => (v >= 0 ? "+" : "") + v.toFixed(1).replace(".", ",") + "%";
    if (/roas|retorno/.test(q)) return `ROAS do período: <b>${d.roas.toFixed(2).replace(".", ",")}x</b> (${pct(d.delta.roas)} vs. anterior). Cada R$1 investido retorna <b>${d.roas.toFixed(2).replace(".", ",")}</b> em receita. ${d.roas >= 4 ? "Acima do saudável (4x)." : "Abaixo de 4x — revise campanhas de baixo retorno."}`;
    if (/cpl|custo por lead|custo/.test(q)) return `CPL atual: <b>${cf2.format(d.cpl)}</b> (${pct(d.delta.cpl)}). ${d.delta.cpl < 0 ? "Caindo — boa eficiência." : "Subindo — foque em segmentação e criativos."} Para reduzir, comece pausando <b>${worst.name}</b> (ROAS ${worst.roas.toFixed(2).replace(".", ",")}x).`;
    if (/receita|faturamento/.test(q)) return `Receita: <b>${brl(d.receita)}</b> (${pct(d.delta.receita)} vs. anterior), sobre <b>${brl(d.invest)}</b> de investimento.`;
    if (/invest|gasto|orçamento/.test(q)) return `Investimento: <b>${brl(d.invest)}</b> (${pct(d.delta.invest)}). Maior canal: <b>${top.name}</b> com ${(top.share * 100).toFixed(0)}%.`;
    if (/escal|aumentar|melhor campanha|crescer/.test(q)) return `Escale <b>${best.name}</b> — melhor ROAS (<b>${best.roas.toFixed(2).replace(".", ",")}x</b>). Realocar ~15% do orçamento das piores campanhas pode somar até <b>${brl(best.receita * 0.15)}</b> em receita.`;
    if (/pior|pausar|cortar|reduzir/.test(q)) return `Pior campanha: <b>${worst.name}</b> (ROAS ${worst.roas.toFixed(2).replace(".", ",")}x). Pausar libera <b>${brl(worst.invest)}</b> para realocação.`;
    if (/canal|canais|meta|google|tiktok/.test(q)) return `Top canal: <b>${top.name}</b> (${(top.share * 100).toFixed(0)}% do investimento, ${brl(top.value)}). Diversificar reduz dependência e pode achar público de CPL menor.`;
    if (/lead/.test(q)) return `Leads no período: <b>${nf.format(Math.round(d.leads))}</b>. Conversão clique→lead: <b>${(d.convLead * 100).toFixed(1).replace(".", ",")}%</b>. CPL: <b>${cf2.format(d.cpl)}</b>.`;
    if (/resumo|geral|como.*(vai|está)|panorama/.test(q)) { const ps = perfScore(d); return `Score de performance: <b>${ps.score}/100</b> (${ps.label}). ROAS <b>${d.roas.toFixed(2).replace(".", ",")}x</b>, receita ${pct(d.delta.receita)}, CPL ${pct(d.delta.cpl)}. Destaque: <b>${best.name}</b>. Atenção: <b>${worst.name}</b>.`; }
    return `Posso analisar ROAS, CPL, receita, investimento, canais, leads e campanhas deste período. Ex: "qual campanha escalar?", "como reduzir o CPL?", "resumo do período".`;
  }

  const AI_SUGGEST = ["Resumo do período", "Como está meu ROAS?", "Qual campanha escalar?", "Onde reduzir o CPL?", "Qual o melhor canal?"];

  function renderInsightsView() {
    const d = withDeltas(state.clientId, state.range);
    const ps = perfScore(d);
    const client = (CLIENTS.find((c) => c.id === state.clientId) || CLIENTS[0]).name;
    const cards = analyze(d).map((i) => `
      <article class="ai-card is-${i.kind}">
        <div class="ai-card__t">${i.t}<span class="insight__chip ${i.chipCls}">${i.chip}</span></div>
        <div class="ai-card__b">${i.b}</div>
      </article>`).join("");

    const host = $("#view-generic");
    host.innerHTML = `
      <div class="ai">
        <div class="ai-top">
          <div class="panel ai-score" style="--sc:${ps.color}">
            <div class="ai-score__ring" style="background:conic-gradient(${ps.color} ${ps.score * 3.6}deg, var(--surface-3) 0)">
              <div class="ai-score__inner"><span class="ai-score__num">${ps.score}</span><span class="ai-score__den">/100</span></div>
            </div>
            <div class="ai-score__txt">
              <div class="ai-score__label" style="color:${ps.color}">${ps.label}</div>
              <div class="ai-score__sub">Score de performance · ${client} · ${state.range} dias</div>
              <div class="ai-chips">
                <span class="ai-chip"><b>${d.roas.toFixed(2).replace(".", ",")}x</b> ROAS</span>
                <span class="ai-chip"><b>${cf2.format(d.cpl)}</b> CPL</span>
                <span class="ai-chip ${d.delta.receita >= 0 ? "up" : "down"}"><b>${(d.delta.receita >= 0 ? "+" : "") + d.delta.receita.toFixed(1).replace(".", ",")}%</b> receita</span>
              </div>
            </div>
          </div>

          <div class="panel ai-ask">
            <div class="ai-ask__head"><span class="spark">✦</span> Pergunte à IA sobre este período</div>
            <form class="ai-ask__form" id="aiAskForm">
              <input id="aiAskInput" type="text" placeholder="Ex: qual campanha devo escalar?" autocomplete="off" />
              <button class="btn btn--brand" type="submit" aria-label="Perguntar">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none"><path d="M5 12h14m0 0-6-6m6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </button>
            </form>
            <div class="ai-suggest" id="aiSuggest">${AI_SUGGEST.map((s) => `<button class="ai-sg" type="button">${s}</button>`).join("")}</div>
            <div class="ai-answer" id="aiAnswer" hidden></div>
          </div>
        </div>

        <h3 class="report__h" style="margin:8px 0 2px">Insights e recomendações</h3>
        <div class="ai-grid">${cards}</div>
      </div>`;

    const ans = $("#aiAnswer");
    const ask = (q) => {
      $("#aiAskInput").value = q;
      ans.hidden = false;
      ans.innerHTML = `<div class="ai-answer__q">${q}</div><div class="ai-answer__a">${aiAnswer(q, d)}</div>`;
      ans.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "nearest" });
    };
    $("#aiAskForm").addEventListener("submit", (e) => { e.preventDefault(); const q = $("#aiAskInput").value.trim(); if (q) ask(q); });
    $$("#aiSuggest .ai-sg").forEach((b) => b.addEventListener("click", () => ask(b.textContent)));
  }

  function renderEmptyView(view) {
    const host = $("#view-generic");
    const copy = {
      planilha: ["Sua planilha de mídia", "Importe ou conecte sua planilha para sincronizar investimento e resultados automaticamente com o dashboard."],
      integracoes: ["Conecte suas fontes", "Integre Meta Ads, Google Ads, TikTok e GA4 para puxar métricas em tempo real, sem trabalho manual."],
      relatorios: ["Relatórios automáticos", "Gere relatórios white-label em PDF e agende o envio para seus clientes toda semana."],
      insights: ["Insights de IA", "A IA analisa suas campanhas e sugere onde escalar, pausar e otimizar. Abra o painel lateral para ver os insights do período atual."],
      alertas: ["Alertas inteligentes", "Receba avisos quando o CPL subir, o ROAS cair ou o orçamento estiver perto do limite."],
      config: ["Configurações", "Gerencie equipe, marca, integrações e preferências de notificação da sua conta Metryx."],
    }[view] || ["Em breve", "Esta seção está em construção."];
    host.innerHTML = `<div class="panel"><div class="empty">
      <div class="empty__ico"><svg viewBox="0 0 24 24" width="28" height="28" fill="none"><path d="M12 3v18M3 12h18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></div>
      <h3>${copy[0]}</h3><p>${copy[1]}</p>
      <button class="btn btn--brand" id="emptyCta">${view === "insights" ? "Abrir insights" : "Começar"}</button>
    </div></div>`;
    const cta = $("#emptyCta");
    if (cta) cta.addEventListener("click", () => { view === "insights" ? openDrawer() : toast("Recurso liberado · em construção"); });
  }

  /* ============================================================
     ORCHESTRATION
     ============================================================ */
  let current = null;
  function renderDashboard() {
    const d = withDeltas(state.clientId, state.range);
    current = d;
    renderKPIs(d);
    renderCombo(d);
    renderFunnel(d);
    renderChannels(d);
    renderTable(d);
    renderInsights(d);
  }

  function switchView(view) {
    state.view = view;
    $$(".nav__item").forEach((n) => n.classList.toggle("is-active", n.dataset.view === view));
    $("#viewTitle").textContent = VIEW_META[view]?.title || "Metryx";
    const isDash = view === "dashboard";
    $("#view-dashboard").classList.toggle("is-active", isDash);
    const generic = $("#view-generic");
    generic.classList.toggle("is-active", !isDash);
    if (isDash) renderDashboard();
    else if (view === "clientes") renderClientes();
    else if (view === "relatorios") renderRelatorios();
    else if (view === "planilha") renderPlanilha();
    else if (view === "insights") renderInsightsView();
    else renderEmptyView(view);
    closeNav();
    $("#main").scrollTo?.({ top: 0 });
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
  }

  function selectClient(id) {
    state.clientId = id;
    const c = CLIENTS.find((x) => x.id === id) || CLIENTS[0];
    $("#clientLabel").textContent = c.name;
    $("#subClient").textContent = c.name;
    buildClientMenu();
    if (state.view === "dashboard") renderDashboard();
  }

  function setRange(r) {
    state.range = r;
    $$("#rangeSeg .seg").forEach((s) => s.classList.toggle("is-active", +s.dataset.range === r));
    $("#subRange").textContent = "últimos " + r + " dias";
    if (state.view === "dashboard") renderDashboard();
    else if (state.view === "clientes") renderClientes();
  }

  /* ---------- dropdowns ---------- */
  function buildClientMenu() {
    const menu = $("#clientMenu");
    menu.innerHTML = `<div class="dd-label">Conta</div>` + CLIENTS.map((c) =>
      `<button class="dd-opt ${c.id === state.clientId ? "is-sel" : ""}" data-client="${c.id}">
        <span class="dot" style="background:${c.color}"></span>${c.name}
        <svg class="check" viewBox="0 0 24 24" width="16" height="16" fill="none"><path d="m5 12 4 4L19 7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>`).join("");
    $$("[data-client]", menu).forEach((b) => b.addEventListener("click", () => { selectClient(b.dataset.client); closeDropdowns(); }));
  }

  function buildMetricsMenu() {
    const menu = $("#metricsMenu");
    menu.innerHTML =
      `<label class="dd-toggle">
        <span>Mini gráfico nos cards</span>
        <span class="switch"><input type="checkbox" id="miniToggle" ${state.miniChart ? "checked" : ""}/><span class="switch__track"><span class="switch__thumb"></span></span></span>
      </label>
      <div class="dd-sep"></div>
      <div class="dd-label">Métricas no painel (máx. 8)</div>` + ALL_METRICS.map((m) => {
        const on = state.metrics.includes(m.id);
        return `<label class="dd-opt"><input type="checkbox" data-metric="${m.id}" ${on ? "checked" : ""}/> ${m.label}</label>`;
      }).join("");

    $("#miniToggle", menu).addEventListener("change", (e) => {
      state.miniChart = e.target.checked;
      localStorage.setItem("metryx-minichart", state.miniChart ? "1" : "0");
      if (state.view === "dashboard") renderKPIs(current);
    });

    $$("[data-metric]", menu).forEach((cb) => cb.addEventListener("change", () => {
      const id = cb.dataset.metric;
      if (cb.checked) {
        if (state.metrics.length >= 8) { cb.checked = false; toast("Máximo de 8 métricas"); return; }
        state.metrics.push(id);
      } else {
        if (state.metrics.length <= 1) { cb.checked = true; return; }
        state.metrics = state.metrics.filter((x) => x !== id);
      }
      localStorage.setItem("metryx-metrics", JSON.stringify(state.metrics));
      $("#metricCount").textContent = state.metrics.length;
      if (state.view === "dashboard") renderKPIs(current);
    }));
  }

  function closeDropdowns() { $$(".dropdown.is-open").forEach((d) => { d.classList.remove("is-open"); $(".dropdown__trigger", d)?.setAttribute("aria-expanded", "false"); }); }

  /* ---------- drawer ---------- */
  function openDrawer() { const dr = $("#aiDrawer"); if (current) renderInsights(current); dr.classList.add("is-open"); dr.setAttribute("aria-hidden", "false"); }
  function closeDrawer() { const dr = $("#aiDrawer"); dr.classList.remove("is-open"); dr.setAttribute("aria-hidden", "true"); }

  /* ---------- mobile nav ---------- */
  function openNav() { $("#app").classList.add("nav-open"); $("#scrim").hidden = false; }
  function closeNav() { $("#app").classList.remove("nav-open"); $("#scrim").hidden = true; }

  /* ---------- theme ---------- */
  function applyTheme() {
    document.documentElement.classList.toggle("dark", state.theme === "dark");
    document.documentElement.classList.toggle("light", state.theme === "light");
    document.documentElement.style.colorScheme = state.theme;
  }
  function toggleTheme() {
    state.theme = state.theme === "dark" ? "light" : "dark";
    localStorage.setItem("metryx-theme", state.theme);
    applyTheme();
    if (state.view === "dashboard" && current) renderCombo(current); // recolor svg
  }

  /* ---------- capture metrics (PNG screenshot) ---------- */
  // html2canvas 1.4.1 only understands hex / rgb / rgba. Chrome resolves
  // color-mix() to a modern color(srgb …) value, which html2canvas rejects.
  // Normalize every computed color to rgb via a 2D context, then bake it
  // inline across the whole capture frame so nothing unsupported remains.
  const _cctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  function toRGB(v) {
    if (!v || v === "none" || v === "transparent" || v.includes("gradient")) return v;
    // Read back actual pixels — canvas fillStyle round-trips color(srgb …)
    // unchanged, so sample the rendered pixel to force rgba() output.
    try {
      _cctx.clearRect(0, 0, 1, 1);
      _cctx.fillStyle = v;
      _cctx.fillRect(0, 0, 1, 1);
      const d = _cctx.getImageData(0, 0, 1, 1).data;
      return `rgba(${d[0]}, ${d[1]}, ${d[2]}, ${(d[3] / 255).toFixed(3)})`;
    } catch (_) { return v; }
  }
  function normalizeForCapture(root) {
    const nodes = [root, ...root.querySelectorAll("*")];
    nodes.forEach((node) => {
      const cs = getComputedStyle(node);
      const s = node.style;
      const bgImg = cs.backgroundImage;
      s.background = "";
      s.backgroundColor = toRGB(cs.backgroundColor);
      s.backgroundImage = bgImg.includes("color-mix") || bgImg.includes("color(") ? "none" : bgImg;
      s.color = toRGB(cs.color);
      s.borderColor = toRGB(cs.borderColor);
      s.boxShadow = cs.boxShadow.includes("color-mix") || cs.boxShadow.includes("color(") ? "none" : cs.boxShadow;
      if (node.namespaceURI === SVGNS) {
        if (node.getAttribute("stroke")) node.setAttribute("stroke", toRGB(cs.stroke !== "none" ? cs.stroke : cs.color));
        const fa = node.getAttribute("fill");
        if (fa && fa !== "none") node.setAttribute("fill", toRGB(cs.fill !== "none" ? cs.fill : cs.color));
      }
    });
  }

  async function captureMetrics(btn) {
    if (typeof window.html2canvas !== "function") { toast("Captura indisponível", false); return; }
    const grid = $("#kpiGrid");
    if (!grid || !grid.children.length) { toast("Nada para capturar", false); return; }

    const rootCss = getComputedStyle(document.documentElement);
    const bg = toRGB((rootCss.getPropertyValue("--bg") || "#0a0d14").trim());
    const client = (CLIENTS.find((c) => c.id === state.clientId) || CLIENTS[0]).name;
    const now = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });

    // build a polished offscreen frame: brand header + metrics + footer
    const frame = el("div", "export-frame");
    frame.style.width = Math.max(720, grid.scrollWidth) + "px";
    frame.style.padding = "28px";
    frame.style.background = bg;
    frame.innerHTML = `
      <div class="export-head">
        <div class="export-brand">
          <span class="brand-mark" aria-hidden="true" style="background:#7c5cff">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none"><path d="M3 17 9 11l4 4 8-8" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M21 7v5M21 7h-5" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </span>Metryx
        </div>
        <div class="export-meta"><b>${client}</b>últimos ${state.range} dias · ${now}</div>
      </div>`;
    frame.appendChild(grid.cloneNode(true));
    frame.insertAdjacentHTML("beforeend", `<div class="export-foot">Gerado em metryx-app · ${now}</div>`);
    document.body.appendChild(frame);
    normalizeForCapture(frame);

    btn.classList.add("is-busy");
    try {
      const canvas = await window.html2canvas(frame, { backgroundColor: bg, scale: 2, logging: false, useCORS: true });
      await new Promise((res) => canvas.toBlob((blob) => {
        if (!blob) { toast("Falha ao gerar print", false); return res(); }
        const url = URL.createObjectURL(blob);
        const a = el("a");
        a.href = url;
        a.download = `metryx-metricas-${state.clientId}-${state.range}d.png`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        toast("Print das métricas baixado");
        res();
      }, "image/png"));
    } catch (e) {
      console.error("captureMetrics:", e);
      toast("Falha ao gerar print", false);
    } finally {
      frame.remove();
      btn.classList.remove("is-busy");
    }
  }

  /* ---------- toast ---------- */
  let toastTimer;
  function toast(msg, ok = true) {
    const t = $("#toast");
    t.innerHTML = (ok ? `<svg class="ok" viewBox="0 0 24 24" width="16" height="16" fill="none"><path d="m5 12 4 4L19 7" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>` : "") + `<span>${msg}</span>`;
    t.classList.add("is-on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("is-on"), 3200);
  }

  /* ============================================================
     EVENTS
     ============================================================ */
  function bind() {
    // nav
    $$(".nav__item").forEach((n) => n.addEventListener("click", (e) => { e.preventDefault(); switchView(n.dataset.view); }));
    // range
    $$("#rangeSeg .seg").forEach((s) => s.addEventListener("click", () => setRange(+s.dataset.range)));
    // dropdown triggers
    $$(".dropdown__trigger").forEach((trg) => trg.addEventListener("click", (e) => {
      e.stopPropagation();
      const dd = trg.closest(".dropdown");
      const open = dd.classList.contains("is-open");
      closeDropdowns();
      if (!open) { dd.classList.add("is-open"); trg.setAttribute("aria-expanded", "true"); }
    }));
    document.addEventListener("click", closeDropdowns);
    $("#clientMenu").addEventListener("click", (e) => e.stopPropagation());
    $("#metricsMenu").addEventListener("click", (e) => e.stopPropagation());

    // legend toggles
    $$("#rvLegend .legend__item").forEach((b) => b.addEventListener("click", () => {
      const key = b.dataset.series === "invest" ? "invest" : "receita";
      // keep at least one on
      if (state.series[key] && Object.values(state.series).filter(Boolean).length === 1) return;
      state.series[key] = !state.series[key];
      b.classList.toggle("is-on", state.series[key]);
      renderCombo(current);
    }));

    // buttons
    $("#shotBtn").addEventListener("click", (e) => captureMetrics(e.currentTarget));
    $("#aiBtn").addEventListener("click", openDrawer);
    $$("[data-close-drawer]").forEach((b) => b.addEventListener("click", closeDrawer));
    $("#themeBtn").addEventListener("click", toggleTheme);
    $("#shareBtn").addEventListener("click", () => {
      const url = location.href.split("#")[0] + "?client=" + state.clientId + "&range=" + state.range;
      (navigator.clipboard?.writeText(url) || Promise.reject()).then(() => toast("Link do painel copiado")).catch(() => toast("Link: " + url));
    });
    $("#upgradeBtn").addEventListener("click", () => toast("Plano Pro ativo · acesso completo"));
    $("#menuBtn").addEventListener("click", openNav);
    $("#sidebarClose").addEventListener("click", closeNav);
    $("#scrim").addEventListener("click", closeNav);

    // keyboard
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { closeDrawer(); closeNav(); closeDropdowns(); }
    });

    // responsive redraw
    let rT;
    window.addEventListener("resize", () => { clearTimeout(rT); rT = setTimeout(() => { if (state.view === "dashboard" && current) renderCombo(current); }, 160); });
  }

  /* ---------- deep-link ---------- */
  function readURL() {
    const q = new URLSearchParams(location.search);
    const c = q.get("client"); const r = +q.get("range");
    if (c && CLIENTS.some((x) => x.id === c)) state.clientId = c;
    if ([7, 30, 90].includes(r)) state.range = r;
  }

  /* ---------- init ---------- */
  function init() {
    readURL();
    applyTheme();
    buildClientMenu();
    buildMetricsMenu();
    $("#metricCount").textContent = state.metrics.length;
    bind();
    // sync controls to state
    selectClient(state.clientId);
    setRange(state.range);
    renderDashboard();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
