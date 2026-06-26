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
  const CLIENTS = [
    { id: "all", name: "Todos os clientes", color: "#7c5cff", scale: 1.0 },
    { id: "alves", name: "Alves Performance", color: "#21bfa0", scale: 0.42 },
    { id: "nova", name: "Nova Estética", color: "#f5ae39", scale: 0.27 },
    { id: "prime", name: "Prime Imóveis", color: "#3b9cf6", scale: 0.31 },
    { id: "fit", name: "FitLab Academia", color: "#b04dff", scale: 0.18 },
  ];
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

  function sparkPath(values, w, h) {
    const min = Math.min(...values), max = Math.max(...values);
    const span = max - min || 1;
    const step = w / (values.length - 1 || 1);
    return values.map((v, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)} ${(h - ((v - min) / span) * (h - 4) - 2).toFixed(1)}`).join(" ");
  }

  function renderKPIs(d) {
    const grid = $("#kpiGrid");
    grid.innerHTML = "";
    state.metrics.forEach((mId) => {
      const m = METRIC_DEFS[mId];
      if (!m) return;
      const dv = d.delta[m.key] ?? 0;
      const good = (m.deltaGood === "up" && dv >= 0) || (m.deltaGood === "down" && dv < 0);
      const arrow = dv >= 0 ? "M5 12l5-5 5 5" : "M5 8l5 5 5-5";
      const vals = m.spark(d);
      const card = el("article", "kpi");
      card.innerHTML = `
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
          <span>vs. período anterior</span>
        </div>
        <svg class="kpi__spark" viewBox="0 0 92 34" preserveAspectRatio="none" aria-hidden="true">
          <path d="${sparkPath(vals, 92, 34)}" fill="none" stroke="${m.color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0.85"/>
        </svg>`;
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
  function renderInsights(d) {
    const body = $("#aiBody");
    body.innerHTML = "";
    const best = d.campaigns[0];
    const worst = [...d.campaigns].sort((a, b) => a.roas - b.roas)[0];
    const topCh = d.channels[0];
    const insights = [
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
    insights.forEach((ins) => {
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

  function renderClientes() {
    const host = $("#view-generic");
    const cards = CLIENTS.filter((c) => c.id !== "all").map((c) => {
      const d = withDeltas(c.id, state.range);
      const initials = c.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
      return `<article class="client-card" data-goto="${c.id}" role="button" tabindex="0">
        <div class="client-card__top">
          <span class="client-card__av" style="background:linear-gradient(135deg, ${c.color}, color-mix(in srgb, ${c.color} 55%, #000))">${initials}</span>
          <div><div class="client-card__name">${c.name}</div><div class="client-card__meta">ROAS ${d.roas.toFixed(2).replace(".", ",")}x · ${state.range} dias</div></div>
        </div>
        <div class="client-card__stats">
          <div class="client-card__stat"><div class="l">Investimento</div><div class="v">${brl(d.invest)}</div></div>
          <div class="client-card__stat"><div class="l">Receita</div><div class="v">${brl(d.receita)}</div></div>
        </div>
      </article>`;
    }).join("");
    host.innerHTML = `<div style="margin-top:4px"><p style="color:var(--text-2);font-size:.9rem;margin:0 0 4px">${CLIENTS.length - 1} clientes ativos. Clique para abrir o painel.</p><div class="client-grid">${cards}</div></div>`;
    $$("[data-goto]", host).forEach((card) => {
      const go = () => { selectClient(card.dataset.goto); switchView("dashboard"); };
      card.addEventListener("click", go);
      card.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
    });
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
    if (cta) cta.addEventListener("click", () => { view === "insights" ? openDrawer() : toast("Recurso disponível no plano Pro"); });
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
    else renderEmptyView(view);
    if (view === "insights") openDrawer();
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
    menu.innerHTML = `<div class="dd-label">Métricas no painel (máx. 4)</div>` + ALL_METRICS.map((m) => {
      const on = state.metrics.includes(m.id);
      return `<label class="dd-opt"><input type="checkbox" data-metric="${m.id}" ${on ? "checked" : ""}/> ${m.label}</label>`;
    }).join("");
    $$("[data-metric]", menu).forEach((cb) => cb.addEventListener("change", () => {
      const id = cb.dataset.metric;
      if (cb.checked) {
        if (state.metrics.length >= 4) { cb.checked = false; toast("Máximo de 4 métricas"); return; }
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
    $("#aiBtn").addEventListener("click", openDrawer);
    $$("[data-close-drawer]").forEach((b) => b.addEventListener("click", closeDrawer));
    $("#themeBtn").addEventListener("click", toggleTheme);
    $("#shareBtn").addEventListener("click", () => {
      const url = location.href.split("#")[0] + "?client=" + state.clientId + "&range=" + state.range;
      (navigator.clipboard?.writeText(url) || Promise.reject()).then(() => toast("Link do painel copiado")).catch(() => toast("Link: " + url));
    });
    $("#upgradeBtn").addEventListener("click", () => toast("Redirecionando para planos…"));
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
