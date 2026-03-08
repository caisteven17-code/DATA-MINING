/**
 * App.jsx — Byteme Market Basket Analysis Dashboard
 * 
 * DUAL-MODE OPERATION:
 *   - Backend mode: uploads CSV to Python FastAPI, gets ML results
 *   - Browser mode: uses engine.js (FP-Growth in JS) for offline use
 * 
 * The UI matches the existing fastfood-ui design system exactly,
 * with added: Iteration History, Drift Detection, Business Insights.
 */

import { useState, useCallback, useEffect } from "react";
import { analyzeRows, parseCSV, buildIterationSnapshot, computeDrift } from "./engine.js";
import { uploadCSV, api } from "./api.js";
import appLogo from "./components/logo.png";

// ── Global Styles ─────────────────────────────────────────────────────────────
const style = `
  @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;1,400&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg: #0a0a0f; --surface: #111118; --card: #16161f; --card2: #1c1c28;
    --border: rgba(255,255,255,0.07); --border2: rgba(255,255,255,0.12);
    --accent: #ff4d00; --accent2: #ffbe00;
    --green: #00e5a0; --blue: #4d9fff; --red: #ff6b6b; --purple: #b97fff;
    --text: #f0ede8; --muted: #6b6878; --muted2: #9994a8;
    --font-display: 'Bebas Neue', sans-serif; --font-body: 'DM Sans', sans-serif;
    --sidebar: 228px;
  }
  body { background: var(--bg); color: var(--text); font-family: var(--font-body); }
  .app { display: flex; min-height: 100vh; }
  input[type="file"] { display: none; }
  @keyframes fadeUp { from { opacity:0; transform:translateY(14px); } to { opacity:1; transform:translateY(0); } }
  .fu { animation: fadeUp .38s ease forwards; }

  .sidebar {
    width: var(--sidebar); min-height: 100vh; background: var(--surface);
    border-right: 1px solid var(--border); display: flex; flex-direction: column;
    position: fixed; top:0; left:0; bottom:0; z-index:10; overflow-y:auto;
  }
  .logo-wrap { padding: 16px 16px 14px; border-bottom: 1px solid var(--border); display:flex; align-items:center; gap:10px; }
  .logo-box { width:38px; height:38px; background:var(--accent); border-radius:8px; display:flex; align-items:center; justify-content:center; font-family:var(--font-display); font-size:1rem; letter-spacing:1px; color:#fff; flex-shrink:0; }
  .logo-img { width:38px; height:38px; object-fit:contain; border-radius:8px; flex-shrink:0; }
  .logo-title { font-family:var(--font-display); font-size:1.35rem; letter-spacing:2px; color:var(--accent); line-height:1; }
  .logo-slogan { font-size:0.56rem; color:var(--muted); letter-spacing:0.5px; margin-top:2px; font-style:italic; }
  .nav-section { font-size:0.54rem; color:var(--muted); text-transform:uppercase; letter-spacing:2.5px; padding:14px 16px 4px; }
  .nav-item { display:flex; align-items:center; gap:8px; padding:8px 16px; font-size:0.79rem; font-weight:500; color:var(--muted); cursor:pointer; border-left:2px solid transparent; transition:all 0.13s; }
  .nav-item:hover { color:var(--text); background:rgba(255,255,255,0.03); }
  .nav-item.active { color:var(--accent); border-left-color:var(--accent); background:rgba(255,77,0,0.06); }
  .nav-badge { margin-left:auto; font-size:0.52rem; padding:1px 5px; border-radius:99px; font-weight:700; }
  .sidebar-footer { margin-top:auto; padding:12px 16px; border-top:1px solid var(--border); }
  .sf-label { font-size:0.58rem; color:var(--muted); text-transform:uppercase; letter-spacing:2px; margin-bottom:5px; }
  .sf-info { font-size:0.73rem; color:var(--text); margin-bottom:8px; }
  .sf-clear { width:100%; padding:6px 10px; background:rgba(255,107,107,.08); border:1px solid rgba(255,107,107,.2); color:var(--red); border-radius:6px; font-size:0.7rem; cursor:pointer; font-family:var(--font-body); font-weight:600; transition:all .13s; }
  .sf-clear:hover { background:rgba(255,107,107,.15); }
  .mode-badge { display:flex; align-items:center; gap:4px; padding:4px 8px; border-radius:6px; font-size:0.6rem; font-weight:600; margin-bottom:8px; }
  .mode-badge.backend { background:rgba(0,229,160,.08); color:var(--green); border:1px solid rgba(0,229,160,.2); }
  .mode-badge.browser { background:rgba(255,190,0,.08); color:var(--accent2); border:1px solid rgba(255,190,0,.2); }

  .main { margin-left:var(--sidebar); flex:1; padding:28px 32px; }
  .page-header { margin-bottom:22px; }
  .page-title { font-family:var(--font-display); font-size:2.4rem; letter-spacing:2px; line-height:1; }
  .page-title span { color:var(--accent); }
  .page-sub { font-size:0.68rem; color:var(--muted); margin-top:3px; letter-spacing:1px; text-transform:uppercase; }

  .empty-state { display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:70vh; gap:16px; text-align:center; }
  .empty-icon { font-size:4rem; opacity:0.15; }
  .empty-title { font-family:var(--font-display); font-size:2rem; letter-spacing:3px; color:var(--muted); }
  .empty-sub { font-size:0.8rem; color:var(--muted); opacity:0.7; max-width:300px; line-height:1.7; }
  .empty-cta { margin-top:4px; padding:11px 26px; background:var(--accent); color:#fff; border:none; border-radius:8px; font-family:var(--font-body); font-size:0.83rem; font-weight:600; cursor:pointer; letter-spacing:.5px; transition:opacity .15s; }
  .empty-cta:hover { opacity:.85; }

  .kpi-strip { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; margin-bottom:20px; }
  .kpi { background:var(--card); border:1px solid var(--border); border-radius:10px; padding:13px 15px; position:relative; overflow:hidden; }
  .kpi::after { content:''; position:absolute; bottom:0; left:0; right:0; height:2px; }
  .kpi.k-orange::after { background:linear-gradient(90deg,var(--accent),transparent); }
  .kpi.k-yellow::after { background:linear-gradient(90deg,var(--accent2),transparent); }
  .kpi.k-green::after  { background:linear-gradient(90deg,var(--green),transparent); }
  .kpi.k-blue::after   { background:linear-gradient(90deg,var(--blue),transparent); }
  .kpi-lbl { font-size:0.57rem; color:var(--muted); text-transform:uppercase; letter-spacing:2px; margin-bottom:5px; }
  .kpi-val { font-family:var(--font-display); font-size:1.9rem; letter-spacing:1px; line-height:1; }

  .ranking-grid { display:grid; grid-template-columns:1fr 1fr 1fr; gap:14px; margin-bottom:20px; }
  .rank-panel { background:var(--card); border:1px solid var(--border); border-radius:14px; overflow:hidden; }
  .rp-head { padding:13px 15px 11px; border-bottom:1px solid var(--border); display:flex; align-items:center; gap:10px; }
  .rp-icon { width:30px; height:30px; border-radius:7px; display:flex; align-items:center; justify-content:center; font-size:0.95rem; flex-shrink:0; }
  .rp-icon.hot   { background:rgba(255,77,0,.14); }
  .rp-icon.cold  { background:rgba(255,107,107,.11); }
  .rp-icon.combo { background:rgba(0,229,160,.09); }
  .rp-title { font-family:var(--font-display); font-size:0.9rem; letter-spacing:1.5px; line-height:1.1; }
  .rp-subtitle { font-size:0.58rem; color:var(--muted); margin-top:2px; }
  .rp-body { padding:6px 0; }
  .rank-row { display:flex; align-items:center; gap:10px; padding:6px 15px; transition:background .12s; cursor:default; }
  .rank-row:hover { background:rgba(255,255,255,.022); }
  .rank-num { font-family:var(--font-display); font-size:1.05rem; letter-spacing:1px; width:20px; text-align:center; flex-shrink:0; }
  .rn-hot   { color:var(--accent); }
  .rn-cold  { color:var(--red); }
  .rn-combo { color:var(--green); }
  .rank-info { flex:1; min-width:0; }
  .rank-name { font-size:0.78rem; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .rank-name-combo {
    white-space:normal;
    overflow:visible;
    text-overflow:clip;
    line-height:1.25;
    display:-webkit-box;
    -webkit-line-clamp:2;
    -webkit-box-orient:vertical;
  }
  .bar-track { height:2px; background:rgba(255,255,255,.05); border-radius:99px; overflow:hidden; margin-top:4px; }
  .bar-fill  { height:100%; border-radius:99px; }
  .rank-tags { display:flex; gap:3px; margin-top:3px; }
  .rtag { font-size:0.57rem; padding:1px 5px; border-radius:99px; font-weight:500; }
  .rtag-orange { background:rgba(255,77,0,.11); color:var(--accent); border:1px solid rgba(255,77,0,.18); }
  .rtag-red    { background:rgba(255,107,107,.09); color:var(--red); border:1px solid rgba(255,107,107,.18); }
  .rtag-green  { background:rgba(0,229,160,.09); color:var(--green); border:1px solid rgba(0,229,160,.18); }
  .rtag-yellow { background:rgba(255,190,0,.09); color:var(--accent2); border:1px solid rgba(255,190,0,.18); }
  .rank-right { text-align:right; flex-shrink:0; }
  .rank-score { font-family:var(--font-display); font-size:0.95rem; letter-spacing:.5px; }
  .rank-price { font-size:0.6rem; color:var(--muted); margin-top:1px; }

  .panel { background:var(--card); border:1px solid var(--border); border-radius:14px; overflow:hidden; }
  .panel-head { padding:13px 15px 11px; border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; }
  .ph-left { display:flex; align-items:center; gap:9px; }
  .ph-icon { width:28px; height:28px; border-radius:6px; display:flex; align-items:center; justify-content:center; font-size:0.85rem; }
  .ph-title { font-family:var(--font-display); font-size:0.87rem; letter-spacing:1.5px; }
  .ph-sub { font-size:0.57rem; color:var(--muted); margin-top:1px; }
  .ph-count { font-size:0.63rem; color:var(--muted); background:rgba(255,255,255,.04); border:1px solid var(--border); border-radius:4px; padding:2px 7px; }
  .panel-body { padding:6px 0; max-height:360px; overflow-y:auto; }
  .panel-body::-webkit-scrollbar { width:3px; }
  .panel-body::-webkit-scrollbar-thumb { background:rgba(255,255,255,.08); border-radius:99px; }

  .bundle-row { display:flex; align-items:center; gap:10px; padding:7px 15px; transition:background .12s; }
  .bundle-row:hover { background:rgba(255,255,255,.022); }
  .br-info { flex:1; min-width:0; }
  .br-name { font-size:0.78rem; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .br-tags { display:flex; gap:4px; margin-top:3px; }
  .br-right { text-align:right; flex-shrink:0; }
  .br-price { font-family:var(--font-display); font-size:0.95rem; }
  .br-save  { font-size:0.6rem; color:var(--green); margin-top:1px; }

  .rule-row { padding:9px 15px; border-bottom:1px solid var(--border); transition:background .12s; }
  .rule-row:last-child { border-bottom:none; }
  .rule-row:hover { background:rgba(255,255,255,.022); }
  .rule-flow { display:flex; align-items:center; gap:6px; margin-bottom:5px; }
  .rule-item { font-size:0.75rem; font-weight:600; padding:2px 7px; background:rgba(255,255,255,.04); border-radius:4px; }
  .rule-arrow { color:var(--accent); font-size:0.8rem; }
  .rule-metrics { display:flex; gap:10px; flex-wrap:wrap; }
  .rm { font-size:0.62rem; color:var(--muted); }
  .rm span { color:var(--text); font-weight:600; }

  /* Drift badges */
  .drift-badge { display:inline-flex; align-items:center; gap:3px; padding:1px 6px; border-radius:99px; font-size:0.58rem; font-weight:700; text-transform:uppercase; letter-spacing:.5px; }
  .db-new      { background:rgba(77,159,255,.12); color:var(--blue); border:1px solid rgba(77,159,255,.2); }
  .db-lost     { background:rgba(255,107,107,.12); color:var(--red); border:1px solid rgba(255,107,107,.2); }
  .db-stable   { background:rgba(255,255,255,.06); color:var(--muted); border:1px solid var(--border); }
  .db-improved { background:rgba(0,229,160,.1); color:var(--green); border:1px solid rgba(0,229,160,.2); }
  .db-declined { background:rgba(255,190,0,.1); color:var(--accent2); border:1px solid rgba(255,190,0,.2); }
  .db-volatile { background:rgba(185,127,255,.12); color:var(--purple); border:1px solid rgba(185,127,255,.2); }

  /* Iteration history */
  .iter-card { background:var(--card); border:1px solid var(--border); border-radius:12px; padding:14px 16px; margin-bottom:10px; }
  .iter-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; }
  .iter-num { font-family:var(--font-display); font-size:1.2rem; color:var(--accent); letter-spacing:1px; }
  .iter-file { font-size:0.72rem; color:var(--muted2); }
  .iter-time { font-size:0.62rem; color:var(--muted); }
  .iter-stats { display:flex; gap:16px; flex-wrap:wrap; }
  .is-stat { font-size:0.65rem; color:var(--muted); }
  .is-stat strong { color:var(--text); font-weight:600; }

  /* Insights */
  .insight-card { background:var(--card); border:1px solid var(--border); border-radius:12px; padding:14px 16px; margin-bottom:10px; display:flex; gap:12px; }
  .insight-icon { font-size:1.4rem; flex-shrink:0; }
  .insight-body { flex:1; }
  .insight-cat { font-size:0.55rem; text-transform:uppercase; letter-spacing:2px; color:var(--muted); margin-bottom:4px; }
  .insight-title { font-size:0.82rem; font-weight:600; margin-bottom:4px; }
  .insight-text { font-size:0.72rem; color:var(--muted2); line-height:1.55; }
  .insight-priority { font-size:0.55rem; padding:1px 6px; border-radius:99px; font-weight:700; margin-left:6px; }
  .ip-high { background:rgba(255,77,0,.12); color:var(--accent); }
  .ip-medium { background:rgba(255,190,0,.1); color:var(--accent2); }

  /* Upload zone */
  .upload-zone { border:2px dashed var(--border2); border-radius:16px; padding:48px; text-align:center; cursor:pointer; transition:all .2s; }
  .upload-zone:hover, .upload-zone.drag { border-color:var(--accent); background:rgba(255,77,0,.04); }
  .upload-icon { font-size:2.5rem; margin-bottom:12px; }
  .upload-title { font-family:var(--font-display); font-size:1.4rem; letter-spacing:2px; margin-bottom:6px; }
  .upload-sub { font-size:0.75rem; color:var(--muted); max-width:340px; margin:0 auto 16px; line-height:1.6; }
  .upload-btn { padding:10px 24px; background:var(--accent); color:#fff; border:none; border-radius:8px; font-family:var(--font-body); font-size:0.82rem; font-weight:600; cursor:pointer; }
  .processing { display:flex; flex-direction:column; align-items:center; gap:10px; padding:32px; }
  .spinner { width:36px; height:36px; border:3px solid var(--border); border-top-color:var(--accent); border-radius:50%; animation:spin .7s linear infinite; }
  @keyframes spin { to { transform:rotate(360deg); } }
  .uploaded-file { display:flex; align-items:center; justify-content:space-between; padding:10px 14px; background:rgba(0,229,160,.05); border:1px solid rgba(0,229,160,.15); border-radius:8px; margin-top:10px; }
  .uf-name { font-size:0.76rem; font-weight:600; }
  .uf-rows { font-size:0.63rem; color:var(--green); }

  /* FBT / Cart search */
  .item-search { width:100%; padding:8px 12px; background:var(--card2); border:1px solid var(--border2); border-radius:8px; color:var(--text); font-family:var(--font-body); font-size:0.78rem; margin-bottom:12px; outline:none; }
  .item-search:focus { border-color:var(--accent); }
  .fbt-item-btn { display:inline-block; padding:4px 10px; border:1px solid var(--border2); border-radius:6px; font-size:0.72rem; cursor:pointer; margin:3px; color:var(--muted2); background:var(--card2); transition:all .12s; }
  .fbt-item-btn:hover, .fbt-item-btn.sel { background:var(--accent); color:#fff; border-color:var(--accent); }
  .fbt-rec-row { display:flex; align-items:center; justify-content:space-between; padding:8px 14px; border-bottom:1px solid var(--border); }
  .fbt-rec-row:last-child { border-bottom:none; }
  .fbt-item-name { font-size:0.78rem; font-weight:600; }
  .fbt-metrics { font-size:0.62rem; color:var(--muted); }
  .fbt-price { font-family:var(--font-display); font-size:0.9rem; color:var(--accent2); }

  /* Promo cards */
  .promo-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
  .promo-card { background:var(--card); border:1px solid var(--border); border-radius:12px; padding:16px; }
  .promo-label { display:inline-block; border-radius:4px; padding:2px 7px; font-size:0.57rem; font-weight:600; text-transform:uppercase; letter-spacing:1px; margin-bottom:7px; }
  .promo-headline { font-family:var(--font-display); font-size:0.94rem; letter-spacing:1px; margin-bottom:4px; }
  .promo-detail { font-size:0.72rem; color:var(--muted); line-height:1.5; }
  .promo-save { font-family:var(--font-display); font-size:1.55rem; color:var(--green); margin-top:8px; }

  .filter-row { display:flex; gap:6px; flex-wrap:wrap; margin-bottom:16px; }
  .filter-btn { padding:5px 13px; border-radius:99px; font-size:0.72rem; font-family:var(--font-body); cursor:pointer; transition:all .13s; font-weight:500; }
  .price-list-wrap { background:var(--card); border:1px solid var(--border); border-radius:12px; overflow:hidden; }
  .price-list-table { width:100%; border-collapse:collapse; }
  .price-list-table th, .price-list-table td { padding:10px 14px; font-size:0.74rem; border-bottom:1px solid var(--border); }
  .price-list-table th { text-align:left; color:var(--muted); text-transform:uppercase; letter-spacing:1px; font-size:0.62rem; }
  .price-list-table tr:last-child td { border-bottom:none; }
  .price-item { font-weight:600; }
  .price-value { font-family:var(--font-display); font-size:0.96rem; color:var(--accent2); letter-spacing:.5px; }
`;

// ── Helper Components ──────────────────────────────────────────────────────────

function Empty({ onUpload }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">🍔</div>
      <div className="empty-title">NO DATA LOADED</div>
      <div className="empty-sub">Upload a transaction CSV to generate market basket analysis, rankings, and recommendations.</div>
      <button className="empty-cta" onClick={onUpload}>Upload CSV →</button>
    </div>
  );
}

function DriftBadge({ status }) {
  if (!status) return null;
  const cls = { new:"db-new", lost:"db-lost", stable:"db-stable", improved:"db-improved", declined:"db-declined", volatile:"db-volatile" }[status] || "db-stable";
  const icon = { new:"✦", lost:"✕", stable:"●", improved:"↑", declined:"↓", volatile:"⚡" }[status] || "●";
  return <span className={`drift-badge ${cls}`}>{icon} {status}</span>;
}

// ── Dashboard Page ─────────────────────────────────────────────────────────────
function DashboardPage({ data, onUpload }) {
  if (!data) return <Empty onUpload={onUpload} />;
  const meta = data.meta || data.iteration || {};
  const recommendations = data.recommendations || {};
  const hp = recommendations?.homepage || data.homepage || {};
  const mostBought   = hp.most_bought   || hp.mostBought   || [];
  const leastBought  = hp.least_bought  || hp.leastBought  || [];
  const topRevenueRaw = hp.top_revenue || hp.topRevenue || [];
  const lowRevenueRaw = hp.low_revenue || hp.lowRevenue || [];
  const comboBought  = hp.most_bought_bundles || hp.mostBoughtBundles || [];
  const totalTxns = Number(meta?.baskets ?? meta?.transactions ?? 0);
  const minSup = meta?.min_support ?? meta?.minSupport;
  const minConf = meta?.min_confidence ?? meta?.minConfidence;
  const thresholdsText =
    (minSup !== undefined && minSup !== null && minConf !== undefined && minConf !== null)
      ? `${Number(minSup).toFixed(3)} / ${Number(minConf).toFixed(3)}`
      : "—";

  const maxHot  = mostBought[0]?.frequency  || mostBought[0]?.pop   || 1;
  const maxCold = leastBought[0]?.frequency || leastBought[0]?.pop  || 1;
  const maxCombo = comboBought[0]?.rank_score || comboBought[0]?.rankScore || comboBought[0]?.support || 1;

  const getItemName = (item) => item.item || item.name || "—";
  const getItemFreq = (item) => {
    const rawFreq = Number(item.frequency);
    if (Number.isFinite(rawFreq)) return rawFreq;
    const pop = Number(item.pop) || 0;
    return totalTxns > 0 ? Math.round(pop * totalTxns) : 0;
  };
  const getItemPrice = (item) => Number(item.price || 0);
  const getRevenue = (item) => {
    const rawRevenue = Number(item.revenue);
    if (Number.isFinite(rawRevenue)) return rawRevenue;
    return getItemFreq(item) * getItemPrice(item);
  };

  const revenueFallback = (() => {
    const merged = [...mostBought, ...leastBought];
    const byItem = new Map();
    for (const it of merged) {
      const key = getItemName(it).toLowerCase();
      if (!key) continue;
      const revenue = getRevenue(it);
      const prev = byItem.get(key);
      if (!prev || revenue > prev.revenue) {
        byItem.set(key, {
          item: getItemName(it),
          frequency: getItemFreq(it),
          price: getItemPrice(it),
          revenue,
        });
      }
    }
    return [...byItem.values()].sort((a, b) => b.revenue - a.revenue);
  })();

  const topRevenue = (topRevenueRaw.length ? topRevenueRaw : revenueFallback).slice(0, 10);
  const lowRevenue = (lowRevenueRaw.length ? lowRevenueRaw : [...revenueFallback].reverse()).slice(0, 10);
  const maxTopRevenue = topRevenue[0]?.revenue || getRevenue(topRevenue[0] || {}) || 1;
  const maxLowRevenue = lowRevenue[0]?.revenue || getRevenue(lowRevenue[0] || {}) || 1;

  return (
    <>
      <div className="page-header fu" style={{opacity:0}}>
        <div className="page-title">HOMEPAGE <span>RANKINGS</span></div>
        <div className="page-sub">Data-driven rankings from uploaded transaction data</div>
      </div>

      <div className="kpi-strip fu" style={{opacity:0, animationDelay:".05s"}}>
        {[
          ["Transactions", (meta?.baskets || meta?.transactions || 0).toLocaleString(), "k-orange"],
          ["Unique Items",  meta?.unique_items || meta?.items || 0, "k-yellow"],
          ["Rules Mined",   meta?.rules_count  || meta?.rules || 0, "k-green"],
          ["Avg Lift",      Number(meta?.avg_lift || meta?.avgLift || 0).toFixed(2), "k-blue"],
          ["MinSup / MinConf", thresholdsText, "k-blue"],
        ].map(([lbl, val, cls]) => (
          <div key={lbl} className={`kpi ${cls}`}>
            <div className="kpi-lbl">{lbl}</div>
            <div className="kpi-val">{val}</div>
          </div>
        ))}
      </div>

      <div className="ranking-grid fu" style={{opacity:0, animationDelay:".1s"}}>
        {/* Most Bought */}
        <div className="rank-panel">
          <div className="rp-head">
            <div className="rp-icon hot">🔥</div>
            <div><div className="rp-title">MOST BOUGHT FOODS</div><div className="rp-subtitle">Highest purchase frequency</div></div>
          </div>
          <div className="rp-body">
            {mostBought.slice(0,10).map((item, i) => {
              const rawFreq = Number(item.frequency);
              const freq = Number.isFinite(rawFreq)
                ? rawFreq
                : Math.round((Number(item.pop) || 0) * totalTxns);
              const name = item.item || item.name || "—";
              const pct  = Math.round((freq / maxHot) * 100);
              const freqPct = totalTxns > 0
                ? Math.round((freq / totalTxns) * 100)
                : Math.round(Number(item.pct_transactions) || (Number(item.pop) || 0) * 100);
              return (
                <div key={i} className="rank-row">
                  <div className={`rank-num rn-hot`}>{i+1}</div>
                  <div className="rank-info">
                    <div className="rank-name">{name}</div>
                    <div className="bar-track"><div className="bar-fill" style={{width:`${pct}%`, background:"var(--accent)"}} /></div>
                    <div className="rank-tags">
                      <span className="rtag rtag-orange">{freqPct}% frequency</span>
                      <span className="rtag rtag-yellow">₱{item.price||0}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Least Bought */}
        <div className="rank-panel">
          <div className="rp-head">
            <div className="rp-icon cold">🧊</div>
            <div><div className="rp-title">LEAST BOUGHT FOODS</div><div className="rp-subtitle">Needs promotion or review</div></div>
          </div>
          <div className="rp-body">
            {leastBought.slice(0,10).map((item, i) => {
              const rawFreq = Number(item.frequency);
              const freq = Number.isFinite(rawFreq)
                ? rawFreq
                : Math.round((Number(item.pop) || 0) * totalTxns);
              const name = item.item || item.name || "—";
              const pct  = Math.round((freq / maxCold) * 100);
              const freqPct = totalTxns > 0
                ? Math.round((freq / totalTxns) * 100)
                : Math.round(Number(item.pct_transactions) || (Number(item.pop) || 0) * 100);
              return (
                <div key={i} className="rank-row">
                  <div className={`rank-num rn-cold`}>{i+1}</div>
                  <div className="rank-info">
                    <div className="rank-name">{name}</div>
                    <div className="bar-track"><div className="bar-fill" style={{width:`${pct}%`, background:"var(--red)"}} /></div>
                    <div className="rank-tags">
                      <span className="rtag rtag-red">{freqPct}% frequency</span>
                      <span className="rtag rtag-yellow">₱{item.price||0}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Recommended Bundles */}
        <div className="rank-panel">
          <div className="rp-head">
            <div className="rp-icon combo">🏆</div>
            <div><div className="rp-title">RECOMMENDED BUNDLES</div><div className="rp-subtitle">Strongest 2–3 item combos</div></div>
          </div>
          <div className="rp-body">
            {comboBought.slice(0,10).map((b, i) => {
              const score = b.rank_score || b.rankScore || b.support || 0;
              const pct   = Math.round((score / maxCombo) * 100);
              const label = b.label || (b.items || []).join(" + ");
              return (
                <div key={i} className="rank-row">
                  <div className={`rank-num rn-combo`}>{i+1}</div>
                  <div className="rank-info">
                    <div className="rank-name rank-name-combo">{label}</div>
                    <div className="bar-track"><div className="bar-fill" style={{width:`${pct}%`, background:"var(--green)"}} /></div>
                    <div className="rank-tags">
                      <span className="rtag rtag-green">{Math.round((b.support||0)*100)}% sup</span>
                      <span className="rtag rtag-yellow">lift {(b.lift||1).toFixed(2)}×</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Top Revenue Foods */}
        <div className="rank-panel">
          <div className="rp-head">
            <div className="rp-icon combo">💰</div>
            <div><div className="rp-title">TOP FOOD REVENUES</div><div className="rp-subtitle">Highest estimated sales value</div></div>
          </div>
          <div className="rp-body">
            {topRevenue.map((item, i) => {
              const revenue = getRevenue(item);
              const name = getItemName(item);
              const pct = Math.round((revenue / maxTopRevenue) * 100);
              return (
                <div key={i} className="rank-row">
                  <div className={`rank-num rn-combo`}>{i+1}</div>
                  <div className="rank-info">
                    <div className="rank-name">{name}</div>
                    <div className="bar-track"><div className="bar-fill" style={{width:`${pct}%`, background:"var(--green)"}} /></div>
                    <div className="rank-tags">
                      <span className="rtag rtag-green">₱{Math.round(revenue).toLocaleString()} revenue</span>
                      <span className="rtag rtag-yellow">{getItemFreq(item)} sold</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Low Revenue Foods */}
        <div className="rank-panel">
          <div className="rp-head">
            <div className="rp-icon cold">📉</div>
            <div><div className="rp-title">LOW FOOD REVENUES</div><div className="rp-subtitle">Lowest estimated sales value</div></div>
          </div>
          <div className="rp-body">
            {lowRevenue.map((item, i) => {
              const revenue = getRevenue(item);
              const name = getItemName(item);
              const pct = Math.round((revenue / maxLowRevenue) * 100);
              return (
                <div key={i} className="rank-row">
                  <div className={`rank-num rn-cold`}>{i+1}</div>
                  <div className="rank-info">
                    <div className="rank-name">{name}</div>
                    <div className="bar-track"><div className="bar-fill" style={{width:`${pct}%`, background:"var(--red)"}} /></div>
                    <div className="rank-tags">
                      <span className="rtag rtag-red">₱{Math.round(revenue).toLocaleString()} revenue</span>
                      <span className="rtag rtag-yellow">{getItemFreq(item)} sold</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}

// ── Bundles Page ───────────────────────────────────────────────────────────────
function BundlesPage({ data, onUpload }) {
  if (!data) return <Empty onUpload={onUpload} />;
  const [filter, setFilter] = useState("all");
  const bundles = data.recommendations?.bundles || data.bundles || [];
  const rules = data.rules || [];
  const hp = data.recommendations?.homepage || data.homepage || {};
  const mostBought = hp.most_bought || hp.mostBought || [];
  const leastBought = hp.least_bought || hp.leastBought || [];
  const priceMap = data.price_map || data.priceMap || {};

  const normalize = (s) => String(s || "").trim().toLowerCase();
  const categoryRules = [
    ["beverage", ["drink", "soda", "cola", "tea", "coffee", "water", "juice", "shake", "float"]],
    ["side", ["fries", "potato", "rice", "onion ring", "coleslaw"]],
    ["dessert", ["pie", "sundae", "dessert", "ice cream"]],
    ["sauce", ["sauce", "gravy", "dip"]],
  ];
  const getCategory = (item) => {
    const name = normalize(item);
    for (const [cat, terms] of categoryRules) {
      if (terms.some((t) => name.includes(t))) return cat;
    }
    return "main";
  };
  const filterComplementaryAddons = (baseItems, addItems) => {
    const baseNorm = new Set((baseItems || []).map(normalize));
    const baseCats = new Set((baseItems || []).map(getCategory));
    return (addItems || []).filter((item) => {
      const n = normalize(item);
      if (baseNorm.has(n)) return false; // never suggest exact duplicate
      const cat = getCategory(item);
      // avoid same-category add-ons (e.g., Iced Tea -> Soft Drink)
      if (baseCats.has(cat) && cat !== "main") return false;
      return true;
    });
  };
  const addonKeywords = ["drink", "soda", "cola", "tea", "coffee", "water", "fries", "pie", "sauce", "dessert", "ice cream", "float", "shake"];
  const sumPrice = (items) => (items || []).reduce((sum, item) => sum + Number(priceMap[item] || 0), 0);
  const findMatchingBundleDeal = (baseItems, addItems) => {
    const target = new Set([...(baseItems || []), ...(addItems || [])].map(normalize));
    let best = null;
    for (const b of bundles) {
      const items = (b.items || []).map(normalize);
      const itemSet = new Set(items);
      let containsAll = true;
      for (const t of target) {
        if (!itemSet.has(t)) { containsAll = false; break; }
      }
      if (!containsAll) continue;
      if (!best || Number(b.score || b.rank_score || 0) > Number(best.score || best.rank_score || 0)) {
        best = b;
      }
    }
    return best;
  };

  const mostSet = new Set(mostBought.map((x) => normalize(x.item || x.name)).filter(Boolean));
  const leastSet = new Set(leastBought.map((x) => normalize(x.item || x.name)).filter(Boolean));

  // Build recommendation cards from rules so one base bundle can have multiple add-on suggestions.
  const recMap = new Map();
  for (const r of rules) {
    const baseItems = (r.antecedents || []).filter(Boolean);
    const rawAddItems = (r.consequents || []).filter(Boolean);
    const addItems = filterComplementaryAddons(baseItems, rawAddItems);
    if (baseItems.length === 0 || addItems.length === 0) continue;

    const baseNorm = baseItems.map(normalize);
    const anchorMost = baseNorm.find((i) => mostSet.has(i));
    const anchorLeast = baseNorm.find((i) => leastSet.has(i));
    let segment = null;
    let anchor = null;
    if (anchorMost) { segment = "most"; anchor = anchorMost; }
    else if (anchorLeast) { segment = "least"; anchor = anchorLeast; }
    else continue;

    // Keep recommendations practical: prioritize add-on style consequents.
    const hasAddonLike = addItems.some((item) => addonKeywords.some((kw) => normalize(item).includes(kw)));
    if (!hasAddonLike && baseItems.length === 1 && addItems.length === 1) continue;

    const key = `${segment}|${baseNorm.sort().join("|")}=>${addItems.map(normalize).sort().join("|")}`;
    const score = Number(r.score || 0);
    const existing = recMap.get(key);
    if (existing && existing.score >= score) continue;

    const addonPrice = sumPrice(addItems);
    const matchedDeal = findMatchingBundleDeal(baseItems, addItems);
    const save = Number((matchedDeal?.save ?? ((matchedDeal?.full_price || 0) - (matchedDeal?.bundle_price || 0))) || 0);
    const impactType = save > 0 ? "save" : (addonPrice > 0 ? "cost" : "neutral");
    const impactAmount = save > 0 ? save : addonPrice;
    const impactText = save > 0
      ? `Save ₱${save.toFixed(0)}`
      : (addonPrice > 0 ? `Add +₱${addonPrice.toFixed(0)}` : "No price change");

    recMap.set(key, {
      segment,
      anchor,
      baseItems,
      addItems,
      support: Number(r.support || 0),
      confidence: Number(r.confidence || 0),
      lift: Number(r.lift || 0),
      score,
      addonPrice,
      impactType,
      impactAmount,
      impactText,
      bundlePrice: Number(matchedDeal?.bundle_price || 0),
    });
  }

  let recommended = [...recMap.values()].sort((a, b) => (b.score - a.score) || (b.lift - a.lift));

  // Fallback to bundle cards if rule-based recommendations are unavailable.
  if (recommended.length === 0) {
    recommended = bundles
      .map((b) => {
        const items = b.items || [];
        const norms = items.map(normalize);
        const hasMost = norms.some((i) => mostSet.has(i));
        const hasLeast = norms.some((i) => leastSet.has(i));
        if (!hasMost && !hasLeast) return null;
        const segment = hasMost ? "most" : "least";
        const baseItems = items.slice(0, Math.max(1, items.length - 1));
        const addItems = filterComplementaryAddons(
          baseItems,
          items.slice(Math.max(1, items.length - 1))
        );
        if (addItems.length === 0) return null;
        return {
          segment,
          anchor: normalize(baseItems[0]),
          baseItems,
          addItems,
          support: Number(b.support || 0),
          confidence: Number(b.confidence || 0),
          lift: Number(b.lift || 0),
          score: Number(b.score || b.rank_score || 0),
          addonPrice: sumPrice(addItems),
          impactType: Number(b.save || 0) > 0 ? "save" : (sumPrice(addItems) > 0 ? "cost" : "neutral"),
          impactAmount: Number(b.save || 0) > 0 ? Number(b.save || 0) : sumPrice(addItems),
          impactText: Number(b.save || 0) > 0
            ? `Save ₱${Number(b.save || 0).toFixed(0)}`
            : (sumPrice(addItems) > 0 ? `Add +₱${sumPrice(addItems).toFixed(0)}` : "No price change"),
          bundlePrice: Number(b.bundle_price || 0),
        };
      })
      .filter(Boolean)
      .sort((a, b) => (b.score - a.score) || (b.lift - a.lift));
  }

  const filtered = filter === "all" ? recommended : recommended.filter((r) => r.segment === filter);
  const filters = [
    ["all", "All Recommended"],
    ["most", "Most Bought Foods"],
    ["least", "Least Bought Foods"],
  ];

  return (
    <>
      <div className="page-header"><div className="page-title">RECOMMENDED <span>BUNDLES</span></div><div className="page-sub">Suggested add-ons based on co-purchase rules</div></div>
      <div className="panel fu" style={{opacity:0}}>
        <div className="panel-head">
          <div className="ph-left">
            <div className="ph-icon" style={{background:"rgba(255,190,0,.11)"}}>🏆</div>
            <div><div className="ph-title">RECOMMENDED BUNDLE CARDS</div><div className="ph-sub">If customers buy X, suggest Y and more</div></div>
          </div>
          <div className="ph-count">{filtered.length} recommendations</div>
        </div>
        <div className="filter-row" style={{padding:"10px 14px 0"}}>
          {filters.map(([key, label]) => (
            <button key={key} className="filter-btn" onClick={()=>setFilter(key)} style={{
              border:"1px solid",
              borderColor: filter===key ? "var(--accent)" : "var(--border)",
              background:  filter===key ? "var(--accent)" : "var(--card)",
              color:       filter===key ? "#fff" : "var(--muted)",
            }}>{label}</button>
          ))}
        </div>
        <div className="panel-body" style={{maxHeight:"none"}}>
          {filtered.length === 0 && (
            <div style={{padding:"14px", fontSize:"0.75rem", color:"var(--muted)"}}>
              No bundle recommendations found for this filter yet.
            </div>
          )}
          {filtered.map((b, i) => (
            <div key={i} className="bundle-row">
              <div style={{fontFamily:"var(--font-display)", fontSize:"1.2rem", color:"var(--accent)", width:28, flexShrink:0}}>{i+1}</div>
              <div className="br-info">
                <div className="br-name">If customer buys {b.baseItems.join(" + ")}, suggest {b.addItems.join(" + ")}</div>
                <div className="br-tags">
                  {(b.baseItems||[]).map(item => <span key={`base-${item}`} className="rtag rtag-yellow">{item}</span>)}
                  {(b.addItems||[]).map(item => <span key={`add-${item}`} className="rtag rtag-green">+ {item}</span>)}
                  <span className={`rtag ${b.segment==="most" ? "rtag-orange" : "rtag-red"}`}>
                    {b.segment==="most" ? "Most Bought" : "Least Bought"}
                  </span>
                  <span className={`rtag ${b.impactType==="save" ? "rtag-green" : (b.impactType==="cost" ? "rtag-red" : "rtag-yellow")}`}>
                    {b.impactText}
                  </span>
                </div>
                <div className="rule-metrics" style={{marginTop:4}}>
                  <span className="rm">sup <span>{(+(b.support||0)).toFixed(3)}</span></span>
                  <span className="rm">conf <span>{(+(b.confidence||0)).toFixed(3)}</span></span>
                  <span className="rm">lift <span>{(+(b.lift||0)).toFixed(3)}</span></span>
                  <span className="rm">score <span style={{color:"var(--green)"}}>{(+(b.score||0)).toFixed(4)}</span></span>
                </div>
              </div>
              <div className="br-right">
                <div className="br-price">₱{(+(b.impactAmount||0)).toFixed(0)}</div>
                <div className="br-save">{b.impactType==="save" ? "YOU SAVE" : (b.impactType==="cost" ? "ADDITIONAL COST" : "PRICE IMPACT")}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// ── Association Rules Page ─────────────────────────────────────────────────────
function RulesPage({ data, onUpload }) {
  if (!data) return <Empty onUpload={onUpload} />;
  const rules = data.rules || [];
  return (
    <>
      <div className="page-header"><div className="page-title">ASSOCIATION <span>RULES</span></div><div className="page-sub">Scored and ranked by composite metric</div></div>
      <div className="panel fu" style={{opacity:0}}>
        <div className="panel-head">
          <div className="ph-left">
            <div className="ph-icon" style={{background:"rgba(185,127,255,.11)"}}>⚡</div>
            <div><div className="ph-title">ALL RULES</div><div className="ph-sub">Lift · Confidence · Support · Conviction</div></div>
          </div>
          <div className="ph-count">{rules.length} rules</div>
        </div>
        <div className="panel-body" style={{maxHeight:"none"}}>
          {rules.map((r, i) => (
            <div key={i} className="rule-row">
              <div className="rule-flow">
                {(r.antecedents||[]).map(a => <span key={a} className="rule-item">{a}</span>)}
                <span className="rule-arrow">→</span>
                {(r.consequents||[]).map(c => <span key={c} className="rule-item" style={{background:"rgba(255,77,0,.08)",color:"var(--accent)"}}>{c}</span>)}
                <span style={{marginLeft:"auto"}}><span className="rtag rtag-green" style={{fontSize:"0.6rem"}}>score {(+(r.score||0)).toFixed(3)}</span></span>
              </div>
              <div className="rule-metrics">
                <span className="rm">sup <span>{(+(r.support||0)).toFixed(4)}</span></span>
                <span className="rm">conf <span>{(+(r.confidence||0)).toFixed(4)}</span></span>
                <span className="rm">lift <span>{(+(r.lift||0)).toFixed(4)}</span></span>
                <span className="rm">lev <span>{(+(r.leverage||0)).toFixed(5)}</span></span>
                <span className="rm">conv <span>{(+(r.conviction||0)).toFixed(4)}</span></span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// ── FBT Page ───────────────────────────────────────────────────────────────────
function FBTPage({ data, onUpload }) {
  const [selected, setSelected] = useState(null);
  if (!data) return <Empty onUpload={onUpload} />;
  const fbt = data.recommendations?.fbt || data.fbt || {};
  const items = Object.keys(fbt).sort();
  const recs = selected ? (fbt[selected] || []) : [];
  return (
    <>
      <div className="page-header"><div className="page-title">FREQUENTLY <span>BOUGHT TOGETHER</span></div><div className="page-sub">Select an item to see co-purchase recommendations</div></div>
      <div className="panel fu" style={{opacity:0}}>
        <div className="panel-head">
          <div className="ph-left"><div className="ph-icon" style={{background:"rgba(77,159,255,.11)"}}>🛒</div><div><div className="ph-title">ITEM SELECTOR</div></div></div>
          <div className="ph-count">{items.length} items</div>
        </div>
        <div style={{padding:"10px 14px"}}>
          {items.map(item => (
            <span key={item} className={`fbt-item-btn ${selected===item?"sel":""}`} onClick={()=>setSelected(item)}>{item}</span>
          ))}
        </div>
      </div>
      {selected && (
        <div className="panel fu" style={{opacity:0, marginTop:14}}>
          <div className="panel-head">
            <div className="ph-left"><div className="ph-icon" style={{background:"rgba(0,229,160,.09)"}}>✦</div><div><div className="ph-title">BOUGHT WITH: {selected.toUpperCase()}</div></div></div>
          </div>
          <div className="panel-body">
            {recs.map((rec, i) => (
              <div key={i} className="fbt-rec-row">
                <div><div className="fbt-item-name">{rec.item}</div><div className="fbt-metrics">lift {(+(rec.lift||0)).toFixed(3)} · conf {(+(rec.confidence||rec.conf||0)).toFixed(3)} · score {(+(rec.score||0)).toFixed(4)}</div></div>
                <div className="fbt-price">₱{rec.price||0}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// ── Cart Cross-Sell Page ───────────────────────────────────────────────────────
function CartPage({ data, onUpload }) {
  const [cartItem, setCartItem] = useState("");
  const [selected, setSelected] = useState(null);
  if (!data) return <Empty onUpload={onUpload} />;
  const cs = data.recommendations?.crosssell || data.fbt || {};
  const items = Object.keys(cs).sort();
  const filtered = items.filter(i => i.toLowerCase().includes(cartItem.toLowerCase()));
  const recs = selected ? (cs[selected] || []) : [];
  return (
    <>
      <div className="page-header"><div className="page-title">CART <span>CROSS-SELL</span></div><div className="page-sub">Suggestions when item is added to cart</div></div>
      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:14}}>
        <div className="panel fu" style={{opacity:0}}>
          <div className="panel-head"><div className="ph-left"><div className="ph-icon" style={{background:"rgba(255,77,0,.11)"}}>🛍️</div><div><div className="ph-title">SELECT CART ITEM</div></div></div></div>
          <div style={{padding:"10px 14px"}}>
            <input className="item-search" placeholder="Search items..." value={cartItem} onChange={e=>setCartItem(e.target.value)} />
            {filtered.map(item => (
              <span key={item} className={`fbt-item-btn ${selected===item?"sel":""}`} onClick={()=>setSelected(item)}>{item}</span>
            ))}
          </div>
        </div>
        <div className="panel fu" style={{opacity:0, animationDelay:".08s"}}>
          <div className="panel-head"><div className="ph-left"><div className="ph-icon" style={{background:"rgba(0,229,160,.09)"}}>💡</div><div><div className="ph-title">{selected ? `"ALSO BUY WITH ${selected.toUpperCase()}"` : "SELECT AN ITEM"}</div></div></div></div>
          <div className="panel-body">
            {recs.length === 0 && <div style={{padding:"20px 14px", fontSize:"0.75rem", color:"var(--muted)"}}>Select a cart item to see cross-sell suggestions.</div>}
            {recs.map((rec, i) => (
              <div key={i} className="fbt-rec-row">
                <div><div className="fbt-item-name">{rec.item}</div><div className="fbt-metrics">lift {(+(rec.lift||0)).toFixed(3)} · conf {(+(rec.confidence||rec.conf||0)).toFixed(3)}</div></div>
                <div className="fbt-price">₱{rec.price||0}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

// ── Promos Page ────────────────────────────────────────────────────────────────
function PromosPage({ data, onUpload }) {
  const [filter, setFilter] = useState("all");
  if (!data) return <Empty onUpload={onUpload} />;
  const promos = data.recommendations?.promos || data.promos || [];
  const filters = [["all","All"],["bundle","Bundle"],["buy2get1","Buy 2 Get 1"],["addon","Add-On"],["happy-hour","Happy Hour"]];
  const filtered = filter === "all" ? promos : promos.filter(p => p.type === filter);
  const bg  = { bundle:"rgba(255,190,0,.09)", buy2get1:"rgba(0,229,160,.09)", addon:"rgba(77,159,255,.09)", "happy-hour":"rgba(185,127,255,.09)" };
  const clr = { bundle:"var(--accent2)", buy2get1:"var(--green)", addon:"var(--blue)", "happy-hour":"var(--purple)" };
  return (
    <>
      <div className="page-header"><div className="page-title">PROMO <span>RECOMMENDATIONS</span></div><div className="page-sub">Bundle discounts, buy-X-get-Y, upsell prompts</div></div>
      <div className="filter-row">
        {filters.map(([key, label]) => (
          <button key={key} className="filter-btn" onClick={()=>setFilter(key)} style={{
            borderColor: filter===key ? "var(--accent)" : "var(--border)",
            background:  filter===key ? "var(--accent)" : "var(--card)",
            color:       filter===key ? "#fff" : "var(--muted)",
            border: "1px solid",
          }}>{label}</button>
        ))}
      </div>
      <div className="promo-grid">
        {filtered.map((p, i) => (
          <div key={i} className="promo-card fu" style={{opacity:0, animationDelay:`${i*.06}s`}}>
            <div className="promo-label" style={{background:bg[p.type]||"rgba(255,255,255,.04)", color:clr[p.type]||"var(--muted)"}}>{p.label}</div>
            <div className="promo-headline">{p.headline}</div>
            <div className="promo-detail">{p.detail}</div>
            {(p.save||0) > 0 && <div className="promo-save">SAVE ₱{p.save}</div>}
          </div>
        ))}
      </div>
    </>
  );
}

// ── Insights Page ──────────────────────────────────────────────────────────────
function InsightsPage({ data, onUpload }) {
  if (!data) return <Empty onUpload={onUpload} />;
  const insights = data.recommendations?.insights || data.insights || [];
  return (
    <>
      <div className="page-header"><div className="page-title">BUSINESS <span>INSIGHTS</span></div><div className="page-sub">Actionable recommendations for owner and staff</div></div>
      {insights.map((ins, i) => (
        <div key={i} className="insight-card fu" style={{opacity:0, animationDelay:`${i*.06}s`}}>
          <div className="insight-icon">{ins.icon}</div>
          <div className="insight-body">
            <div className="insight-cat">{ins.category}
              <span className={`insight-priority ${ins.priority==="high"?"ip-high":"ip-medium"}`}>{ins.priority}</span>
            </div>
            <div className="insight-title">{ins.title}</div>
            <div className="insight-text">{ins.body}</div>
          </div>
        </div>
      ))}
      {insights.length === 0 && <div style={{color:"var(--muted)", fontSize:"0.78rem"}}>No insights available yet.</div>}
    </>
  );
}

// ── Iteration History Page ─────────────────────────────────────────────────────
function HistoryPage({ iterations }) {
  return (
    <>
      <div className="page-header"><div className="page-title">ITERATION <span>HISTORY</span></div><div className="page-sub">Self-learning: each upload generates a new iteration</div></div>
      {iterations.length === 0 && <div style={{color:"var(--muted)", fontSize:"0.78rem"}}>No iterations recorded yet. Upload a CSV to begin.</div>}
      {iterations.map((it, i) => (
        <div key={i} className={`iter-card fu`} style={{opacity:0, animationDelay:`${i*.05}s`}}>
          <div className="iter-header">
            <div>
              <span className="iter-num">Iteration {it.iteration_num || it.iteration || i+1}</span>
              <span style={{marginLeft:10, fontSize:"0.72rem", color:"var(--muted2)"}}>{it.file_name || it.fileName}</span>
            </div>
            <div className="iter-time">{it.uploaded_at ? new Date(it.uploaded_at).toLocaleString() : it.timestamp}</div>
          </div>
          <div className="iter-stats">
            <span className="is-stat">Baskets: <strong>{it.baskets || it.meta?.baskets || "—"}</strong></span>
            <span className="is-stat">Rules: <strong>{it.rules_count || it.meta?.rules || "—"}</strong></span>
            <span className="is-stat">Avg Lift: <strong>{it.avg_lift || it.meta?.avgLift || "—"}</strong></span>
            <span className="is-stat">MinSup: <strong>{it.min_support || it.meta?.minSupport || "—"}</strong></span>
            {(it.stability_score != null) && <span className="is-stat">Stability: <strong style={{color:"var(--green)"}}>{it.stability_score || it.drift?.summary?.stabilityScore}%</strong></span>}
          </div>
          {/* Drift summary if available */}
          {(it.drift_summary || it.drift) && (() => {
            const ds = it.drift_summary || it.drift?.summary || {};
            return (
              <div style={{marginTop:8, display:"flex", gap:8, flexWrap:"wrap"}}>
                {ds.new      > 0 && <DriftBadge status="new" />}
                {ds.improved > 0 && <DriftBadge status="improved" />}
                {ds.stable   > 0 && <DriftBadge status="stable" />}
                {ds.declined > 0 && <DriftBadge status="declined" />}
                {ds.volatile > 0 && <DriftBadge status="volatile" />}
                {ds.lost     > 0 && <DriftBadge status="lost" />}
                <span style={{fontSize:"0.62rem", color:"var(--muted)", marginLeft:4}}>
                  {ds.new||0} new · {ds.lost||0} lost · {ds.improved||0} improved
                </span>
              </div>
            );
          })()}
        </div>
      ))}
    </>
  );
}

// ── Upload Page ────────────────────────────────────────────────────────────────
function UploadPage({ onAnalyze, uploadedFiles, onClearAll, hasData, backendAvailable }) {
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = { current: null };

  const handleFile = useCallback(async (file) => {
    if (!file || !file.name.endsWith(".csv")) {
      setError("Please upload a valid .csv file.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const text = await file.text();
      if (backendAvailable) {
        // Python backend mode
        const result = await uploadCSV(file);
        if (result.success) {
          onAnalyze(result.data, file.name, true);
        } else {
          setError(result.message || "Analysis failed.");
        }
      } else {
        // Browser-only mode (engine.js)
        const { rows } = parseCSV(text);
        onAnalyze(rows, file.name, false);
      }
    } catch (e) {
      setError(String(e.message || e));
    }
    setLoading(false);
  }, [backendAvailable, onAnalyze]);

  return (
    <>
      <div className="page-header"><div className="page-title">UPLOAD <span>DATA</span></div><div className="page-sub">Upload transaction CSV to run analysis</div></div>
      <div style={{maxWidth:540, margin:"0 auto"}}>
        <input type="file" accept=".csv" id="file-input" onChange={e=>handleFile(e.target.files[0])} ref={r=>fileRef.current=r} />
        {loading ? (
          <div className="processing">
            <div className="spinner" />
            <div style={{fontSize:"0.78rem", color:"var(--muted)"}}>
              {backendAvailable ? "Running Python FP-Growth pipeline…" : "Running browser FP-Growth…"}
            </div>
          </div>
        ) : (
          <div
            className={`upload-zone${dragging?" drag":""}`}
            onDragOver={e=>{e.preventDefault();setDragging(true);}}
            onDragLeave={()=>setDragging(false)}
            onDrop={e=>{e.preventDefault();setDragging(false);handleFile(e.dataTransfer.files[0]);}}
            onClick={()=>document.getElementById("file-input").click()}
          >
            <div className="upload-icon">📂</div>
            <div className="upload-title">DROP CSV HERE</div>
            <div className="upload-sub">
              Wide-format: transaction_id, datetime, item1, price1, ..., item10, price10<br/>
              {backendAvailable ? "🟢 Backend connected — Python FP-Growth will run" : "🟡 Browser mode — engine.js FP-Growth"}
            </div>
            <button
              className="upload-btn"
              onClick={e => {
                e.stopPropagation();
                document.getElementById("file-input")?.click();
              }}
            >
              Browse File
            </button>
          </div>
        )}
        {error && <div style={{marginTop:12, padding:"10px 14px", background:"rgba(255,107,107,.08)", border:"1px solid rgba(255,107,107,.2)", borderRadius:8, fontSize:"0.74rem", color:"var(--red)"}}>{error}</div>}
        {uploadedFiles.map((f, i) => (
          <div key={i} className="uploaded-file" style={{animationDelay:`${i*.05}s`}}>
            <div><div className="uf-name">✓ {f.name}</div><div style={{fontSize:"0.62rem", color:"var(--muted)", marginTop:2}}>Iteration {i+1}</div></div>
            <div className="uf-rows">{(f.rows||0).toLocaleString()} rows</div>
          </div>
        ))}
        {hasData && <button className="sf-clear" style={{marginTop:16, width:"100%"}} onClick={onClearAll}>🗑 Clear All Data & Start Over</button>}
      </div>
    </>
  );
}

// ── Data Summary Page ──────────────────────────────────────────────────────────
function SummaryPage({ data, onUpload }) {
  if (!data) return <Empty onUpload={onUpload} />;
  const { meta } = data;
  return (
    <>
      <div className="page-header"><div className="page-title">DATA <span>SUMMARY</span></div><div className="page-sub">Analysis results from uploaded CSV</div></div>
      <div className="fu" style={{opacity:0, display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:11, marginBottom:18}}>
        {[
          ["Transactions", (meta?.baskets||meta?.transactions||0).toLocaleString(), "var(--accent)"],
          ["Unique Items",  meta?.unique_items||meta?.items||0, "var(--accent2)"],
          ["Rules Mined",  meta?.rules_count||meta?.rules||0, "var(--green)"],
          ["Avg Lift",     meta?.avg_lift||meta?.avgLift||0, "var(--blue)"],
        ].map(([l,v,c]) => (
          <div key={l} style={{background:"var(--card)", border:"1px solid var(--border)", borderRadius:10, padding:"12px 14px"}}>
            <div style={{fontSize:"0.57rem", color:"var(--muted)", textTransform:"uppercase", letterSpacing:"2px", marginBottom:4}}>{l}</div>
            <div style={{fontFamily:"var(--font-display)", fontSize:"1.75rem", color:c}}>{v}</div>
          </div>
        ))}
      </div>
      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:11}}>
        {[
          ["🟡 Thresholds", [
            `min_support: ${meta?.min_support||meta?.minSupport||"—"}`,
            `min_confidence: ${meta?.min_confidence||meta?.minConfidence||"—"}`,
            "Auto-tuned to 20–80 rules"
          ]],
          ["🟢 Algorithm", [
            "FP-Growth (Python native)",
            "Two database scans only",
            "10-100× faster than Apriori"
          ]],
          ["📌 Scoring", [
            "Lift (norm): 35%",
            "Confidence: 30%",
            "Support: 20% · Conviction: 15%"
          ]],
        ].map(([title, rules]) => (
          <div key={title} style={{background:"var(--card)", border:"1px solid var(--border)", borderRadius:11, padding:13}}>
            <div style={{fontSize:"0.59rem", textTransform:"uppercase", letterSpacing:"2px", marginBottom:8, fontWeight:600, color:"var(--accent2)"}}>{title}</div>
            {rules.map((r,i)=><div key={i} style={{fontSize:"0.71rem", color:"var(--muted)", padding:"4px 0", borderBottom:i<rules.length-1?"1px solid var(--border)":"none", lineHeight:1.4}}>{r}</div>)}
          </div>
        ))}
      </div>
    </>
  );
}

// ── Nav Config ─────────────────────────────────────────────────────────────────
function PriceListPage({ data, onUpload }) {
  if (!data) return <Empty onUpload={onUpload} />;
  const priceMap = data.price_map || data.priceMap || {};
  const prices = Object.entries(priceMap)
    .map(([item, price]) => ({ item, price: Number(price || 0) }))
    .sort((a, b) => a.item.localeCompare(b.item));

  return (
    <>
      <div className="page-header">
        <div className="page-title">PRICE <span>LIST</span></div>
        <div className="page-sub">Average item prices from uploaded CSV data</div>
      </div>
      <div className="panel fu" style={{opacity:0, marginBottom:12}}>
        <div className="panel-head">
          <div className="ph-left">
            <div className="ph-icon" style={{background:"rgba(255,190,0,.11)"}}>💵</div>
            <div><div className="ph-title">ITEM PRICES</div><div className="ph-sub">Computed from all uploaded rows</div></div>
          </div>
          <div className="ph-count">{prices.length} items</div>
        </div>
      </div>
      <div className="price-list-wrap fu" style={{opacity:0, animationDelay:".05s"}}>
        {prices.length === 0 ? (
          <div style={{padding:"14px", fontSize:"0.75rem", color:"var(--muted)"}}>
            No prices found in uploaded data.
          </div>
        ) : (
          <table className="price-list-table">
            <thead>
              <tr>
                <th style={{width:"80px"}}>#</th>
                <th>Item</th>
                <th style={{textAlign:"right"}}>Average Price</th>
              </tr>
            </thead>
            <tbody>
              {prices.map((row, idx) => (
                <tr key={`${row.item}-${idx}`}>
                  <td>{idx + 1}</td>
                  <td className="price-item">{row.item}</td>
                  <td className="price-value" style={{textAlign:"right"}}>₱{row.price.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

const NAV = [
  { section: "Overview",   items: [{ key:"dashboard", icon:"🏠", label:"Homepage Ranking" }] },
  { section: "Analytics",  items: [
    { key:"bundles", icon:"🏆", label:"Recommended Bundles" },
    { key:"rules",   icon:"⚡", label:"Association Rules" },
    { key:"fbt",     icon:"🛒", label:"Bought Together" },
    { key:"cart",    icon:"🛍️", label:"Cart Cross-Sell" },
  ]},
  { section: "Intelligence", items: [
    { key:"history",  icon:"🔄", label:"Iteration History" },
    { key:"insights", icon:"💡", label:"Business Insights" },
  ]},
  { section: "Decisions",  items: [
    { key:"promos",  icon:"🎯", label:"Promo Recommendations" },
  ]},
  { section: "Pricing", items: [
    { key:"prices", icon:"$", label:"Price List" },
  ]},  { section: "Settings",   items: [{ key:"upload", icon:"📂", label:"Upload Data" }] },
];

// ── Root App ───────────────────────────────────────────────────────────────────
export default function App() {
  const [page, setPage]     = useState("dashboard");
  const [data, setData]     = useState(null);
  const [allRows, setAllRows]   = useState([]);  // for browser mode
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [iterations, setIterations] = useState([]);
  const [backendAvailable, setBackendAvailable] = useState(false);

  // Check if Python backend is reachable
  useEffect(() => {
    api.health()
      .then(() => setBackendAvailable(true))
      .catch(() => setBackendAvailable(false));
  }, []);

  // Rehydrate UI state from backend on page refresh.
  useEffect(() => {
    if (!backendAvailable) return;

    Promise.all([api.dashboard(), api.iterations()])
      .then(([dash, hist]) => {
        if (dash?.has_data && dash?.data) {
          setData(dash.data);
        } else {
          setData(null);
        }

        const iters = hist?.iterations || [];
        setIterations(iters);

        const files = [...iters]
          .sort((a, b) => (a.iteration_num || 0) - (b.iteration_num || 0))
          .map((it) => ({
            name: it.file_name || "uploaded.csv",
            rows: it.baskets || 0,
          }));
        setUploadedFiles(files);
      })
      .catch((e) => {
        console.error("Failed to rehydrate app state:", e);
      });
  }, [backendAvailable]);

  const handleAnalyze = useCallback((payload, fileName, fromBackend) => {
    if (fromBackend) {
      // Backend returned full structured result
      setData(payload);
      setIterations(prev => [...prev, {
        iteration_num: prev.length + 1,
        file_name: fileName,
        uploaded_at: new Date().toISOString(),
        baskets: payload.meta?.baskets,
        rules_count: payload.meta?.rules_count,
        avg_lift: payload.meta?.avg_lift,
        min_support: payload.meta?.min_support,
        drift_summary: payload.drift?.summary || null,
      }]);
      setUploadedFiles(prev => [...prev, { name: fileName, rows: payload.meta?.baskets || 0 }]);
    } else {
      // Browser mode: payload is raw CSV rows
      const newRows = payload;
      const merged = [...allRows, ...newRows];
      setAllRows(merged);
      const result = analyzeRows(merged);

      // Build iteration snapshot (browser-side self-learning)
      const prevIter = iterations[iterations.length - 1];
      const snapshot = buildIterationSnapshot(
        iterations.length + 1, fileName, result.rules, result.meta,
        prevIter ? prevIter._rules : null
      );

      setIterations(prev => [...prev, { ...snapshot, _rules: result.rules }]);
      setUploadedFiles(prev => [...prev, { name: fileName, rows: newRows.length }]);
      
      // Wrap browser result to match backend shape
      setData({
        meta: { ...result.meta, baskets: result.meta.transactions, rules_count: result.meta.rules },
        rules: result.rules,
        price_map: result.priceMap,
        recommendations: {
          homepage: {
            most_bought: (result.homepage || []).slice(0, 15).map((h, i) => ({
              rank: i + 1,
              item: h.item,
              frequency: Math.round(h.pop * result.meta.transactions),
              price: h.price,
            })),
            least_bought: (result.homepage || []).slice(-10).reverse().map((h, i) => ({
              rank: i + 1,
              item: h.item,
              frequency: Math.round(h.pop * result.meta.transactions),
              price: h.price,
            })),
            top_revenue: (result.homepage || [])
              .map((h) => ({
                item: h.item,
                frequency: Math.round((h.pop || 0) * result.meta.transactions),
                price: Number(h.price || 0),
                revenue: Math.round(((h.pop || 0) * result.meta.transactions * Number(h.price || 0)) * 100) / 100,
              }))
              .sort((a, b) => b.revenue - a.revenue)
              .slice(0, 15)
              .map((h, i) => ({ ...h, rank: i + 1 })),
            low_revenue: (result.homepage || [])
              .map((h) => ({
                item: h.item,
                frequency: Math.round((h.pop || 0) * result.meta.transactions),
                price: Number(h.price || 0),
                revenue: Math.round(((h.pop || 0) * result.meta.transactions * Number(h.price || 0)) * 100) / 100,
              }))
              .sort((a, b) => a.revenue - b.revenue)
              .slice(0, 15)
              .map((h, i) => ({ ...h, rank: i + 1 })),
            most_bought_bundles: (result.bundles || []).slice(0, 15).map(b => ({
              items: b.items,
              label: b.name,
              support: b.support,
              lift: b.lift,
              rank_score: b.rankScore || b.score,
            })),
          },
          bundles: result.bundles || [],
          fbt: result.fbt || {},
          crosssell: result.fbt || {},
          promos: result.promos || [],
          insights: [],
        },
      });
    }
    setPage("dashboard");
  }, [allRows, iterations]);

  const handleClearAll = async () => {
    if (backendAvailable) {
      try {
        await api.reset();
      } catch (e) {
        console.error("Failed to reset backend state:", e);
      }
    }
    setAllRows([]); setUploadedFiles([]); setData(null);
    setIterations([]); setPage("dashboard");
  };

  const pages = {
    dashboard: <DashboardPage data={data} onUpload={()=>setPage("upload")} />,
    bundles:   <BundlesPage   data={data} onUpload={()=>setPage("upload")} />,
    rules:     <RulesPage     data={data} onUpload={()=>setPage("upload")} />,
    fbt:       <FBTPage       data={data} onUpload={()=>setPage("upload")} />,
    cart:      <CartPage      data={data} onUpload={()=>setPage("upload")} />,
    history:   <HistoryPage   iterations={iterations} />,
    insights:  <InsightsPage  data={data} onUpload={()=>setPage("upload")} />,
    promos:    <PromosPage    data={data} onUpload={()=>setPage("upload")} />,
    summary:   <SummaryPage   data={data} onUpload={()=>setPage("upload")} />,
    prices:    <PriceListPage data={data} onUpload={()=>setPage("upload")} />,
    upload:    <UploadPage
                  onAnalyze={handleAnalyze}
                  uploadedFiles={uploadedFiles}
                  onClearAll={handleClearAll}
                  hasData={!!data}
                  backendAvailable={backendAvailable}
               />,
  };

  return (
    <>
      <style>{style}</style>
      <div className="app">
        <div className="sidebar">
          <div className="logo-wrap">
            <img className="logo-img" src={appLogo} alt="ByteMe logo" />
            <div>
              <div className="logo-title">ByteMe</div>
              <div className="logo-slogan">isang kagat, busog agad!</div>
            </div>
          </div>
          {NAV.map(section => (
            <div key={section.section}>
              <div className="nav-section">{section.section}</div>
              {section.items.map(item => (
                <div
                  key={item.key}
                  className={`nav-item ${page===item.key?"active":""}`}
                  onClick={()=>setPage(item.key)}
                >
                  <span>{item.icon}</span>{item.label}
                  {item.key==="upload" && !data && <span className="nav-badge" style={{background:"var(--accent)",color:"#fff"}}>!</span>}
                  {item.key==="upload" && data && <span className="nav-badge" style={{background:"var(--green)",color:"#000"}}>{uploadedFiles.length}</span>}
                  {item.key==="history" && iterations.length > 0 && <span className="nav-badge" style={{background:"var(--purple)",color:"#fff"}}>{iterations.length}</span>}
                </div>
              ))}
            </div>
          ))}
          {data && (
            <div className="sidebar-footer">
              <div className={`mode-badge ${backendAvailable?"backend":"browser"}`}>
                {backendAvailable ? "🟢 Python Backend" : "🟡 Browser Mode"}
              </div>
              <div className="sf-label">Loaded Data</div>
              <div className="sf-info">{uploadedFiles.length} file{uploadedFiles.length!==1?"s":""} · {uploadedFiles.reduce((s,f)=>s+(f.rows||0),0).toLocaleString()} rows</div>
              <button className="sf-clear" onClick={handleClearAll}>🗑 Clear All Data</button>
            </div>
          )}
        </div>
        <div className="main">{pages[page]}</div>
      </div>
    </>
  );
}
