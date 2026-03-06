import { useState, useCallback } from "react";
import { analyzeRows, parseCSV } from "./engine.js";

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
    --sidebar: 220px;
  }
  body { background: var(--bg); color: var(--text); font-family: var(--font-body); }
  .app { display: flex; min-height: 100vh; }
  input[type="file"] { display: none; }

  .sidebar {
    width: var(--sidebar); min-height: 100vh; background: var(--surface);
    border-right: 1px solid var(--border); display: flex; flex-direction: column;
    position: fixed; top:0; left:0; bottom:0; z-index:10; overflow-y:auto;
  }
  .logo-wrap { padding: 16px 16px 14px; border-bottom: 1px solid var(--border); display:flex; align-items:center; gap:10px; }
  .logo-img { width:38px; height:38px; object-fit:contain; border-radius:8px; }
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

  .main { margin-left:var(--sidebar); flex:1; padding:28px 32px; }

  .empty-state { display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:70vh; gap:16px; text-align:center; }
  .empty-icon { font-size:4rem; opacity:0.15; }
  .empty-title { font-family:var(--font-display); font-size:2rem; letter-spacing:3px; color:var(--muted); }
  .empty-sub { font-size:0.8rem; color:var(--muted); opacity:0.7; max-width:300px; line-height:1.7; }
  .empty-cta { margin-top:4px; padding:11px 26px; background:var(--accent); color:#fff; border:none; border-radius:8px; font-family:var(--font-body); font-size:0.83rem; font-weight:600; cursor:pointer; letter-spacing:.5px; transition:opacity .15s; }
  .empty-cta:hover { opacity:.85; }

  .dash-header { display:flex; align-items:flex-end; justify-content:space-between; margin-bottom:22px; }
  .dash-title { font-family:var(--font-display); font-size:2.4rem; letter-spacing:2px; line-height:1; }
  .dash-title span { color:var(--accent); }
  .dash-sub { font-size:0.68rem; color:var(--muted); margin-top:3px; letter-spacing:1px; text-transform:uppercase; }
  .dash-meta { display:flex; gap:20px; align-items:center; }
  .dm-val { font-family:var(--font-display); font-size:1.5rem; letter-spacing:1px; line-height:1; text-align:right; }
  .dm-lbl { font-size:0.55rem; color:var(--muted); text-transform:uppercase; letter-spacing:1.5px; margin-top:2px; text-align:right; }

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
  .rank-divider { height:1px; background:var(--border); margin:3px 15px; }

  .bottom-row { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
  .panel { background:var(--card); border:1px solid var(--border); border-radius:14px; overflow:hidden; }
  .panel-head { padding:13px 15px 11px; border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; }
  .ph-left { display:flex; align-items:center; gap:9px; }
  .ph-icon { width:28px; height:28px; border-radius:6px; display:flex; align-items:center; justify-content:center; font-size:0.85rem; }
  .ph-icon.bundle { background:rgba(255,190,0,.11); }
  .ph-icon.promo  { background:rgba(77,159,255,.11); }
  .ph-title { font-family:var(--font-display); font-size:0.87rem; letter-spacing:1.5px; }
  .ph-sub { font-size:0.57rem; color:var(--muted); margin-top:1px; }
  .ph-count { font-size:0.63rem; color:var(--muted); background:rgba(255,255,255,.04); border:1px solid var(--border); border-radius:4px; padding:2px 7px; }
  .panel-body { padding:6px 0; max-height:300px; overflow-y:auto; }
  .panel-body::-webkit-scrollbar { width:3px; }
  .panel-body::-webkit-scrollbar-thumb { background:rgba(255,255,255,.08); border-radius:99px; }

  .bundle-row { display:flex; align-items:center; gap:10px; padding:7px 15px; transition:background .12s; }
  .bundle-row:hover { background:rgba(255,255,255,.022); }
  .br-info { flex:1; min-width:0; }
  .br-name { font-size:0.78rem; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .br-items { font-size:0.61rem; color:var(--muted); margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .br-right { text-align:right; flex-shrink:0; }
  .br-price { font-family:var(--font-display); font-size:0.97rem; color:var(--accent2); letter-spacing:.5px; }
  .br-save  { font-size:0.59rem; color:var(--green); margin-top:1px; }
  .br-save.none { color:var(--muted); }

  .promo-row { display:flex; align-items:flex-start; gap:9px; padding:7px 15px; transition:background .12s; }
  .promo-row:hover { background:rgba(255,255,255,.022); }
  .promo-dot { width:5px; height:5px; border-radius:50%; margin-top:6px; flex-shrink:0; }
  .pd-bundle { background:var(--accent); }
  .pd-buy2get1 { background:var(--green); }
  .pd-addon { background:var(--blue); }
  .pd-happy-hour { background:var(--accent2); }
  .pr-info { flex:1; min-width:0; }
  .pr-badge { display:inline-block; font-size:0.54rem; text-transform:uppercase; letter-spacing:1px; font-weight:700; padding:1px 5px; border-radius:3px; margin-bottom:2px; }
  .pr-name { font-size:0.77rem; font-weight:600; line-height:1.3; }
  .pr-save { font-size:0.66rem; color:var(--green); font-weight:600; margin-top:2px; }

  .upload-wrap { max-width:600px; margin:0 auto; padding-top:8px; }
  .format-note { background:rgba(255,190,0,.05); border:1px solid rgba(255,190,0,.12); border-radius:9px; padding:11px 14px; margin-bottom:14px; }
  .fn-title { font-size:0.63rem; color:var(--accent2); text-transform:uppercase; letter-spacing:1.5px; margin-bottom:4px; font-weight:600; }
  .fn-text { font-size:0.73rem; color:var(--muted); line-height:1.6; }
  .fn-text code { background:rgba(255,255,255,.07); padding:1px 5px; border-radius:3px; color:var(--text); font-size:0.68rem; }
  .drop-zone { border:2px dashed rgba(255,77,0,.28); border-radius:16px; padding:44px 32px; text-align:center; background:rgba(255,77,0,.022); cursor:pointer; transition:all .18s; margin-bottom:14px; }
  .drop-zone:hover, .drop-zone.drag { border-color:var(--accent); background:rgba(255,77,0,.055); }
  .dz-icon { font-size:2.4rem; margin-bottom:9px; }
  .dz-title { font-family:var(--font-display); font-size:1.25rem; letter-spacing:1px; margin-bottom:4px; }
  .dz-sub { font-size:0.74rem; color:var(--muted); line-height:1.6; }
  .dz-btn { display:inline-block; margin-top:12px; padding:8px 22px; background:var(--accent); color:#fff; border:none; border-radius:7px; font-family:var(--font-body); font-size:0.79rem; font-weight:600; cursor:pointer; }
  .file-card { background:var(--card); border:1px solid var(--border); border-radius:11px; padding:15px 18px; margin-bottom:13px; }
  .fc-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; }
  .fc-name { font-weight:600; font-size:0.86rem; }
  .fc-meta { font-size:0.67rem; color:var(--muted); margin-top:2px; }
  .fc-rm { background:none; border:1px solid var(--border); color:var(--muted); border-radius:5px; padding:3px 8px; font-size:0.67rem; cursor:pointer; transition:all .13s; }
  .fc-rm:hover { border-color:var(--red); color:var(--red); }
  .prev-table { width:100%; border-collapse:collapse; font-size:0.7rem; }
  .prev-table th { text-align:left; padding:4px 7px; color:var(--muted); font-size:0.57rem; text-transform:uppercase; letter-spacing:1px; border-bottom:1px solid var(--border); }
  .prev-table td { padding:5px 7px; border-bottom:1px solid rgba(255,255,255,.03); }
  .prev-table tr:last-child td { border-bottom:none; }
  .analyze-btn { width:100%; padding:12px; background:var(--accent); color:#fff; border:none; border-radius:9px; font-family:var(--font-body); font-size:0.87rem; font-weight:700; cursor:pointer; text-transform:uppercase; letter-spacing:1px; transition:opacity .15s; }
  .analyze-btn:hover:not(:disabled) { opacity:.87; }
  .analyze-btn:disabled { opacity:.33; cursor:not-allowed; }
  .analyzing-bar { height:3px; background:rgba(255,77,0,.11); border-radius:99px; margin-top:10px; overflow:hidden; }
  .analyzing-fill { height:100%; background:linear-gradient(90deg,var(--accent),var(--accent2)); border-radius:99px; animation:slide 1.4s ease-in-out infinite; }
  @keyframes slide { 0%{width:0%;margin-left:0} 50%{width:80%;margin-left:10%} 100%{width:0%;margin-left:100%} }
  .success-banner { background:rgba(0,229,160,.05); border:1px solid rgba(0,229,160,.16); border-radius:8px; padding:9px 13px; margin-top:10px; font-size:0.75rem; color:var(--green); }
  .files-loaded { background:rgba(0,229,160,.04); border:1px solid rgba(0,229,160,.13); border-radius:10px; padding:12px 15px; margin-bottom:14px; }
  .fl-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:7px; }
  .fl-title { font-size:0.62rem; color:var(--green); text-transform:uppercase; letter-spacing:1.5px; font-weight:600; }
  .fl-clear { background:rgba(255,107,107,.07); border:1px solid rgba(255,107,107,.18); color:var(--red); border-radius:4px; padding:2px 8px; font-size:0.63rem; cursor:pointer; font-family:var(--font-body); }
  .fl-row { display:flex; justify-content:space-between; padding:4px 0; border-bottom:1px solid rgba(255,255,255,.04); font-size:0.74rem; }
  .fl-row:last-child { border-bottom:none; }

  .page-header { margin-bottom:20px; }
  .page-title { font-family:var(--font-display); font-size:2.3rem; letter-spacing:2px; line-height:1; }
  .page-title span { color:var(--accent); }
  .page-sub { font-size:0.67rem; color:var(--muted); margin-top:3px; letter-spacing:1px; text-transform:uppercase; }

  @keyframes fadeUp { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
  .fu { animation:fadeUp .3s ease forwards; }
`;

function Empty({ onUpload }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">📂</div>
      <div className="empty-title">Walang Data Pa</div>
      <div className="empty-sub">Upload your CSV transaction file to see your product rankings and insights.</div>
      <button className="empty-cta" onClick={onUpload}>Upload CSV File</button>
    </div>
  );
}

// ── DASHBOARD ─────────────────────────────────────────────────────────────────
function DashboardPage({ data, onUpload }) {
  if (!data) return <Empty onUpload={onUpload} />;

  const { homepage, bundles, promos, meta } = data;

  const mostBought  = [...homepage].sort((a, b) => b.pop - a.pop).slice(0, 7);
  const leastBought = [...homepage].sort((a, b) => a.pop - b.pop).slice(0, 7);
  const combos      = [...bundles].sort((a, b) => b.support - a.support).slice(0, 7);
  const maxPop      = mostBought[0]?.pop || 1;
  const maxCombo    = combos[0]?.support || 1;

  const promoBg   = { bundle:"rgba(255,77,0,.13)", buy2get1:"rgba(0,229,160,.09)", addon:"rgba(77,159,255,.09)", "happy-hour":"rgba(255,190,0,.09)" };
  const promoClr  = { bundle:"var(--accent)", buy2get1:"var(--green)", addon:"var(--blue)", "happy-hour":"var(--accent2)" };

  return (
    <>
      <div className="dash-header fu" style={{ opacity:0 }}>
        <div>
          <div className="dash-title">PRODUCT <span>RANKINGS</span></div>
          <div className="dash-sub">Based on {meta.transactions.toLocaleString()} transactions · FP-Growth analysis</div>
        </div>
        <div className="dash-meta">
          <div><div className="dm-val" style={{ color:"var(--accent)" }}>{meta.items}</div><div className="dm-lbl">Products</div></div>
          <div><div className="dm-val" style={{ color:"var(--accent2)" }}>{meta.rules}</div><div className="dm-lbl">Rules</div></div>
          <div><div className="dm-val" style={{ color:"var(--green)" }}>{meta.avgLift}</div><div className="dm-lbl">Avg Lift</div></div>
        </div>
      </div>

      <div className="kpi-strip fu" style={{ opacity:0, animationDelay:"0.06s" }}>
        <div className="kpi k-orange"><div className="kpi-lbl">Total Transactions</div><div className="kpi-val" style={{ color:"var(--accent)" }}>{meta.transactions.toLocaleString()}</div></div>
        <div className="kpi k-yellow"><div className="kpi-lbl">Unique Products</div><div className="kpi-val" style={{ color:"var(--accent2)" }}>{meta.items}</div></div>
        <div className="kpi k-green"><div className="kpi-lbl">Bundle Deals Found</div><div className="kpi-val" style={{ color:"var(--green)" }}>{bundles.length}</div></div>
        <div className="kpi k-blue"><div className="kpi-lbl">Promo Suggestions</div><div className="kpi-val" style={{ color:"var(--blue)" }}>{promos.length}</div></div>
      </div>

      {/* Three ranking columns */}
      <div className="ranking-grid fu" style={{ opacity:0, animationDelay:"0.11s" }}>

        {/* Most Bought */}
        <div className="rank-panel">
          <div className="rp-head">
            <div className="rp-icon hot">🔥</div>
            <div><div className="rp-title">MOST BOUGHT</div><div className="rp-subtitle">Highest order frequency</div></div>
          </div>
          <div className="rp-body">
            {mostBought.map((h, i) => (
              <div key={h.item}>
                {i > 0 && <div className="rank-divider" />}
                <div className="rank-row">
                  <div className="rank-num rn-hot">#{i+1}</div>
                  <div className="rank-info">
                    <div className="rank-name">{h.item}</div>
                    <div className="bar-track"><div className="bar-fill" style={{ width:`${(h.pop/maxPop)*100}%`, background:"linear-gradient(90deg,var(--accent),var(--accent2))" }} /></div>
                    <div className="rank-tags">
                      <span className="rtag rtag-orange">{(h.pop*100).toFixed(1)}%</span>
                      <span className="rtag rtag-yellow">₱{h.price}</span>
                    </div>
                  </div>
                  <div className="rank-right">
                    <div className="rank-score" style={{ color:"var(--accent)" }}>{(h.pop*100).toFixed(1)}%</div>
                    <div className="rank-price">of orders</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Least Bought */}
        <div className="rank-panel">
          <div className="rp-head">
            <div className="rp-icon cold">❄️</div>
            <div><div className="rp-title">LEAST BOUGHT</div><div className="rp-subtitle">Needs attention or promo</div></div>
          </div>
          <div className="rp-body">
            {leastBought.map((h, i) => (
              <div key={h.item}>
                {i > 0 && <div className="rank-divider" />}
                <div className="rank-row">
                  <div className="rank-num rn-cold">#{i+1}</div>
                  <div className="rank-info">
                    <div className="rank-name">{h.item}</div>
                    <div className="bar-track"><div className="bar-fill" style={{ width:`${(h.pop/maxPop)*100}%`, background:"linear-gradient(90deg,var(--red),rgba(255,107,107,.35))" }} /></div>
                    <div className="rank-tags">
                      <span className="rtag rtag-red">{(h.pop*100).toFixed(1)}%</span>
                      <span className="rtag rtag-yellow">₱{h.price}</span>
                    </div>
                  </div>
                  <div className="rank-right">
                    <div className="rank-score" style={{ color:"var(--red)" }}>{(h.pop*100).toFixed(1)}%</div>
                    <div className="rank-price">of orders</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top Combos */}
        <div className="rank-panel">
          <div className="rp-head">
            <div className="rp-icon combo">🤝</div>
            <div><div className="rp-title">TOP COMBOS</div><div className="rp-subtitle">Most bought 2+ items together</div></div>
          </div>
          <div className="rp-body">
            {combos.length === 0
              ? <div style={{ padding:"18px 15px", color:"var(--muted)", fontSize:"0.74rem" }}>Not enough multi-item data found.</div>
              : combos.map((b, i) => (
                <div key={b.name}>
                  {i > 0 && <div className="rank-divider" />}
                  <div className="rank-row">
                    <div className="rank-num rn-combo">#{i+1}</div>
                    <div className="rank-info">
                      <div className="rank-name">{b.items.slice(0,2)} {b.items.slice(0,2).join(" + ")}{b.items.length>2?` +${b.items.length-2}`:""}</div>
                      <div className="bar-track"><div className="bar-fill" style={{ width:`${(b.support/maxCombo)*100}%`, background:"linear-gradient(90deg,var(--green),rgba(0,229,160,.3))" }} /></div>
                      <div className="rank-tags">
                        <span className="rtag rtag-green">{(b.support*100).toFixed(1)}%</span>
                        <span className="rtag rtag-green">lift {b.lift.toFixed(2)}</span>
                      </div>
                    </div>
                    <div className="rank-right">
                      <div className="rank-score" style={{ color:"var(--green)" }}>{(b.support*100).toFixed(1)}%</div>
                      <div className="rank-price">co-occur</div>
                    </div>
                  </div>
                </div>
              ))
            }
          </div>
        </div>
      </div>

      {/* Bottom row */}
      <div className="bottom-row fu" style={{ opacity:0, animationDelay:"0.17s" }}>
        <div className="panel">
          <div className="panel-head">
            <div className="ph-left">
              <div className="ph-icon bundle">🏆</div>
              <div><div className="ph-title">TOP BUNDLES</div><div className="ph-sub">Recommended combo deals</div></div>
            </div>
            <div className="ph-count">{bundles.length} bundles</div>
          </div>
          <div className="panel-body">
            {bundles.slice(0,8).map((b) => (
              <div key={b.name} className="bundle-row">
                <div className="br-info">
                  <div className="br-name">{b.name}</div>
                  <div className="br-items">{b.items.join(" · ")}</div>
                </div>
                <div className="br-right">
                  <div className="br-price">₱{b.price - b.save}</div>
                  {b.save > 0 ? <div className="br-save">save ₱{b.save}</div> : <div className="br-save none">—</div>}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <div className="ph-left">
              <div className="ph-icon promo">🎯</div>
              <div><div className="ph-title">PROMO RECOMMENDATIONS</div><div className="ph-sub">Auto-generated from patterns</div></div>
            </div>
            <div className="ph-count">{promos.length} promos</div>
          </div>
          <div className="panel-body">
            {promos.slice(0,8).map((p, i) => (
              <div key={i} className="promo-row">
                <div className={`promo-dot pd-${p.type}`} />
                <div className="pr-info">
                  <div className="pr-badge" style={{ background:promoBg[p.type]||"rgba(255,255,255,.04)", color:promoClr[p.type]||"var(--muted)" }}>{p.label}</div>
                  <div className="pr-name">{p.headline}</div>
                  {p.save > 0 && <div className="pr-save">Save ₱{p.save}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

// ── Upload Page ───────────────────────────────────────────────────────────────
function UploadPage({ onAnalyze, hasData, uploadedFiles = [], onClearAll }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [drag, setDrag] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState("");

  const handleFile = (f) => {
    setError("");
    if (!f) return;
    if (!f.name.endsWith(".csv")) { setError("Please upload a .csv file."); return; }
    setFile(f);
    const reader = new FileReader();
    reader.onload = (e) => {
      const lines = e.target.result.split("\n").filter(Boolean);
      const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
      const rows = lines.slice(1, 6).map(l => l.split(",").map(c => c.trim().replace(/^"|"$/g, "")));
      setPreview({ headers, rows, total: lines.length - 1, raw: e.target.result });
    };
    reader.readAsText(f);
  };

  const handleDrop = useCallback((e) => { e.preventDefault(); setDrag(false); handleFile(e.dataTransfer.files[0]); }, []);

  const handleAnalyze = () => {
    if (!preview?.raw) return;
    setAnalyzing(true);
    setError("");
    setTimeout(() => {
      try {
        const { rows } = parseCSV(preview.raw);
        setAnalyzing(false);
        setFile(null);
        setPreview(null);
        onAnalyze(rows, file.name);
      } catch (err) {
        setAnalyzing(false);
        setError("Failed to analyze: " + err.message);
      }
    }, 100);
  };

  return (
    <>
      <div className="page-header">
        <div className="page-title">UPLOAD <span>DATA</span></div>
        <div className="page-sub">Each upload merges into the existing dataset</div>
      </div>
      <div className="upload-wrap">
        {uploadedFiles.length > 0 && (
          <div className="files-loaded">
            <div className="fl-head">
              <div className="fl-title">✅ Loaded Files ({uploadedFiles.length})</div>
              <button className="fl-clear" onClick={onClearAll}>🗑 Clear All</button>
            </div>
            {uploadedFiles.map((f, i) => (
              <div key={i} className="fl-row">
                <span>📄 {f.name}</span>
                <span style={{ color:"var(--muted)" }}>{f.rows.toLocaleString()} rows</span>
              </div>
            ))}
          </div>
        )}

        <div className="format-note">
          <div className="fn-title">📋 Expected CSV Format</div>
          <div className="fn-text">Columns: <code>transaction_id</code>, <code>datetime</code>, <code>item1</code>, <code>price1</code>, <code>item2</code>, <code>price2</code> ... up to <code>item10</code>, <code>price10</code><br />Item columns can be empty for short baskets. Prices in ₱ (PHP).</div>
        </div>

        {!file ? (
          <div className={`drop-zone ${drag ? "drag" : ""}`} onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={handleDrop} onClick={() => document.getElementById("csv-inp").click()}>
            <div className="dz-icon">📁</div>
            <div className="dz-title">{hasData ? "Add Another CSV" : "Drop CSV File Here"}</div>
            <div className="dz-sub">{hasData ? "New data will be merged with existing dataset" : "or click to browse your files"}<br />Supports .csv format only</div>
            <button className="dz-btn" onClick={e => { e.stopPropagation(); document.getElementById("csv-inp").click(); }}>{hasData ? "Browse & Merge" : "Browse File"}</button>
            <input type="file" id="csv-inp" accept=".csv" onChange={e => handleFile(e.target.files[0])} />
          </div>
        ) : (
          <div className="file-card">
            <div className="fc-header">
              <div><div className="fc-name">📄 {file.name}</div><div className="fc-meta">{preview?.total?.toLocaleString()} transactions · {(file.size / 1024).toFixed(1)} KB</div></div>
              <button className="fc-rm" onClick={() => { setFile(null); setPreview(null); setError(""); }}>✕ Remove</button>
            </div>
            {preview && (
              <div style={{ overflowX:"auto" }}>
                <table className="prev-table">
                  <thead><tr>{preview.headers.slice(0,8).map(h => <th key={h}>{h}</th>)}</tr></thead>
                  <tbody>{preview.rows.map((row,i) => <tr key={i}>{row.slice(0,8).map((c,j) => <td key={j}>{c||"—"}</td>)}</tr>)}</tbody>
                </table>
                <div style={{ fontSize:"0.65rem", color:"var(--muted)", marginTop:5 }}>Showing first 5 of {preview.total?.toLocaleString()} rows · {preview.headers.length} columns</div>
              </div>
            )}
          </div>
        )}

        {error && <div style={{ background:"rgba(255,107,107,.07)", border:"1px solid rgba(255,107,107,.2)", borderRadius:8, padding:"9px 12px", marginBottom:10, fontSize:"0.75rem", color:"var(--red)" }}>⚠️ {error}</div>}

        <button className="analyze-btn" disabled={!file || analyzing} onClick={handleAnalyze}>
          {analyzing ? "⏳ Merging & re-running FP-Growth..." : hasData ? "➕ Merge & Re-Analyze" : "🚀 Analyze & Generate Insights"}
        </button>
        {analyzing && <div className="analyzing-bar"><div className="analyzing-fill" /></div>}
        {hasData && !analyzing && !file && <div className="success-banner">✅ {uploadedFiles.length} file{uploadedFiles.length!==1?"s":""} loaded. Upload more to merge into the analysis.</div>}
      </div>
    </>
  );
}

// ── Other pages ───────────────────────────────────────────────────────────────
function BundlesPage({ data, onUpload }) {
  if (!data) return <Empty onUpload={onUpload} />;
  const { bundles, meta } = data;
  return (
    <>
      <div className="page-header"><div className="page-title">RECOMMENDED <span>BUNDLES</span></div><div className="page-sub">Mined from {meta.transactions.toLocaleString()} transactions via FP-Growth</div></div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:13 }}>
        {bundles.map((b, i) => (
          <div key={b.name} className="fu" style={{ animationDelay:`${i*.06}s`, opacity:0, background:"var(--card)", border:"1px solid var(--border)", borderRadius:13, padding:16, position:"relative", overflow:"hidden" }}>
            <div style={{ position:"absolute", top:0, left:0, right:0, height:2, background:"linear-gradient(90deg,var(--accent),var(--accent2))" }} />
            <div style={{ fontFamily:"var(--font-display)", fontSize:"1rem", letterSpacing:1, marginBottom:8 }}>{b.name}</div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginBottom:10 }}>
              {b.items.map(it => <span key={it} style={{ background:"rgba(255,77,0,.1)", color:"var(--accent)", border:"1px solid rgba(255,77,0,.2)", borderRadius:20, padding:"2px 8px", fontSize:"0.65rem" }}>{it}</span>)}
            </div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
              <div style={{ fontFamily:"var(--font-display)", fontSize:"1.3rem" }}>₱{b.price - b.save}</div>
              {b.save > 0 && <div style={{ background:"rgba(0,229,160,.1)", color:"var(--green)", border:"1px solid rgba(0,229,160,.2)", borderRadius:6, padding:"2px 8px", fontSize:"0.69rem", fontWeight:600 }}>SAVE ₱{b.save}</div>}
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:4 }}>
              {[["Support",b.support.toFixed(4)],["Confidence",b.confidence.toFixed(3)],["Lift",b.lift.toFixed(3)]].map(([l,v])=>(
                <div key={l} style={{ background:"rgba(255,255,255,.03)", border:"1px solid var(--border)", borderRadius:5, padding:"4px 6px" }}>
                  <div style={{ fontSize:"0.51rem", color:"var(--muted)", textTransform:"uppercase", letterSpacing:1 }}>{l}</div>
                  <div style={{ fontSize:"0.79rem", fontWeight:600, color:"var(--accent2)", marginTop:1 }}>{v}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function FBTPage({ data, onUpload }) {
  const fbt = data?.fbt || {};
  const items = Object.keys(fbt);
  const [sel, setSel] = useState(items[0] || "");
  if (!data) return <Empty onUpload={onUpload} />;
  const results = fbt[sel] || [];
  return (
    <>
      <div className="page-header"><div className="page-title">FREQUENTLY <span>BOUGHT TOGETHER</span></div><div className="page-sub">Based on association rules from your CSV</div></div>
      <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:16 }}>
        {items.map(it => <div key={it} onClick={()=>setSel(it)} style={{ padding:"5px 12px", borderRadius:99, border:"1px solid", borderColor:sel===it?"var(--accent)":"var(--border)", background:sel===it?"var(--accent)":"var(--card)", color:sel===it?"#fff":"var(--muted)", fontSize:"0.75rem", cursor:"pointer", transition:"all .13s" }}>{it}</div>)}
      </div>
      {results.map((r,i)=>(
        <div key={r.item} className="fu" style={{ animationDelay:`${i*.08}s`, opacity:0, display:"flex", alignItems:"center", gap:11, background:"var(--card)", border:"1px solid var(--border)", borderRadius:10, padding:"11px 14px", marginBottom:6 }}>
          <div style={{ fontSize:"1.25rem" }}></div>
          <div style={{ flex:1 }}><div style={{ fontWeight:600, fontSize:"0.86rem" }}>{r.item}</div><div style={{ fontSize:"0.7rem", color:"var(--muted)", marginTop:1 }}>₱{r.price}</div></div>
          <div style={{ display:"flex", gap:5 }}>
            <div style={{ background:"rgba(255,255,255,.04)", border:"1px solid var(--border)", borderRadius:5, padding:"3px 8px", fontSize:"0.66rem", color:"var(--accent2)" }}>Lift {r.lift.toFixed(2)}</div>
            <div style={{ background:"rgba(255,255,255,.04)", border:"1px solid var(--border)", borderRadius:5, padding:"3px 8px", fontSize:"0.66rem", color:"var(--accent2)" }}>Conf {r.conf.toFixed(2)}</div>
          </div>
        </div>
      ))}
    </>
  );
}

function CartPage({ data, onUpload }) {
  const [cart, setCart] = useState([]);
  const [addItem, setAddItem] = useState("");
  if (!data) return <Empty onUpload={onUpload} />;
  const { priceMap, fbt } = data;
  const allItems = Object.keys(priceMap);
  const available = allItems.filter(i => !cart.includes(i));
  const suggestions = cart.length > 0 ? (fbt[cart[0]]||[]).filter(r => !cart.includes(r.item)) : [];
  return (
    <>
      <div className="page-header"><div className="page-title">CART <span>CROSS-SELL</span></div><div className="page-sub">Real rule-based suggestions from your transaction data</div></div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:22 }}>
        <div>
          <div style={{ fontSize:"0.61rem", color:"var(--muted)", textTransform:"uppercase", letterSpacing:"2px", marginBottom:9 }}>Your Cart ({cart.length} items)</div>
          {cart.length === 0 && <div style={{ color:"var(--muted)", fontSize:"0.78rem", padding:"12px 0" }}>No items yet.</div>}
          {cart.map(item=>(
            <div key={item} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", background:"var(--card)", border:"1px solid var(--border)", borderRadius:9, padding:"9px 12px", marginBottom:5 }}>
              <span style={{ fontSize:"0.84rem" }}>{item}</span>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <span style={{ color:"var(--accent2)", fontWeight:600, fontSize:"0.78rem" }}>₱{priceMap[item]||0}</span>
                <button onClick={()=>setCart(c=>c.filter(i=>i!==item))} style={{ background:"none", border:"none", color:"var(--muted)", cursor:"pointer", fontSize:"0.84rem" }}>✕</button>
              </div>
            </div>
          ))}
          {cart.length < 3 && (
            <div style={{ display:"flex", gap:6, marginTop:6 }}>
              <select value={addItem} onChange={e=>setAddItem(e.target.value)} style={{ flex:1, background:"var(--card)", border:"1px solid var(--border)", borderRadius:7, padding:"7px 9px", color:"var(--text)", fontFamily:"var(--font-body)", fontSize:"0.76rem" }}>
                <option value="">+ Add item...</option>
                {available.map(i=><option key={i} value={i}>{i}</option>)}
              </select>
              <button onClick={()=>{if(addItem){setCart(c=>[...c,addItem]);setAddItem("");}}} style={{ background:"var(--accent)", border:"none", borderRadius:7, padding:"7px 12px", color:"#fff", cursor:"pointer", fontWeight:600, fontSize:"0.78rem" }}>Add</button>
            </div>
          )}
          <div style={{ marginTop:10, padding:"10px 12px", background:"rgba(255,190,0,.04)", border:"1px solid rgba(255,190,0,.12)", borderRadius:9 }}>
            <div style={{ fontSize:"0.57rem", color:"var(--muted)", textTransform:"uppercase", letterSpacing:"2px", marginBottom:2 }}>Cart Total</div>
            <div style={{ fontFamily:"var(--font-display)", fontSize:"1.5rem", color:"var(--accent2)" }}>₱{cart.reduce((s,i)=>s+(priceMap[i]||0),0)}</div>
          </div>
        </div>
        <div>
          <div style={{ fontSize:"0.61rem", color:"var(--muted)", textTransform:"uppercase", letterSpacing:"2px", marginBottom:9 }}>You might also want</div>
          {suggestions.length === 0 ? <div style={{ color:"var(--muted)", fontSize:"0.78rem", padding:"12px 0" }}>Add items to see suggestions.</div>
            : suggestions.map((s,i)=>(
              <div key={s.item} className="fu" style={{ animationDelay:`${i*.08}s`, opacity:0, background:"var(--card)", border:"1px solid var(--border)", borderRadius:10, padding:"11px 12px", marginBottom:6 }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}><div style={{ fontWeight:600, fontSize:"0.85rem" }}>{s.item}</div><div style={{ color:"var(--accent2)", fontWeight:700, fontSize:"0.83rem" }}>₱{s.price}</div></div>
                <div style={{ fontSize:"0.66rem", color:"var(--muted)" }}>Often bought with {cart[0]}</div>
                <span style={{ display:"inline-block", background:"rgba(0,229,160,.07)", color:"var(--green)", border:"1px solid rgba(0,229,160,.16)", borderRadius:4, padding:"2px 6px", fontSize:"0.61rem", marginTop:4 }}>Lift {s.lift.toFixed(2)} · Conf {s.conf.toFixed(2)}</span>
              </div>
            ))}
        </div>
      </div>
    </>
  );
}

function PromosPage({ data, onUpload }) {
  const [filter, setFilter] = useState("all");
  if (!data) return <Empty onUpload={onUpload} />;
  const { promos } = data;
  const filtered = filter==="all" ? promos : promos.filter(p=>p.type===filter);
  const promoBg  = { bundle:"rgba(255,77,0,.13)", buy2get1:"rgba(0,229,160,.09)", addon:"rgba(77,159,255,.09)", "happy-hour":"rgba(255,190,0,.09)" };
  const promoClr = { bundle:"var(--accent)", buy2get1:"var(--green)", addon:"var(--blue)", "happy-hour":"var(--accent2)" };
  return (
    <>
      <div className="page-header"><div className="page-title">PROMO <span>RECOMMENDATIONS</span></div><div className="page-sub">Auto-generated from your real transaction patterns</div></div>
      <div style={{ display:"flex", gap:6, marginBottom:16, flexWrap:"wrap" }}>
        {[["all","All"],["bundle","💰 Bundle"],["buy2get1","🎉 Buy 2 Get 1"],["addon","➕ Add-Ons"],["happy-hour","⏰ Happy Hour"]].map(([key,label])=>(
          <button key={key} onClick={()=>setFilter(key)} style={{ padding:"5px 13px", borderRadius:99, border:"1px solid", borderColor:filter===key?"var(--accent)":"var(--border)", background:filter===key?"var(--accent)":"var(--card)", color:filter===key?"#fff":"var(--muted)", fontSize:"0.72rem", fontFamily:"var(--font-body)", cursor:"pointer", transition:"all .13s", fontWeight:500 }}>{label}</button>
        ))}
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:12 }}>
        {filtered.map((p,i)=>(
          <div key={i} className="fu" style={{ animationDelay:`${i*.07}s`, opacity:0, background:"var(--card)", border:"1px solid var(--border)", borderRadius:12, padding:16 }}>
            <div style={{ display:"inline-block", borderRadius:4, padding:"2px 7px", fontSize:"0.57rem", fontWeight:600, textTransform:"uppercase", letterSpacing:1, marginBottom:7, background:promoBg[p.type]||"rgba(255,255,255,.04)", color:promoClr[p.type]||"var(--muted)" }}>{p.label}</div>
            <div style={{ fontFamily:"var(--font-display)", fontSize:"0.94rem", letterSpacing:1, marginBottom:4 }}>{p.headline}</div>
            <div style={{ fontSize:"0.72rem", color:"var(--muted)", lineHeight:1.5 }}>{p.detail}</div>
            {p.save > 0 && <div style={{ fontFamily:"var(--font-display)", fontSize:"1.55rem", color:"var(--green)", marginTop:8 }}>SAVE ₱{p.save}</div>}
          </div>
        ))}
      </div>
    </>
  );
}

function SummaryPage({ data, onUpload }) {
  if (!data) return <Empty onUpload={onUpload} />;
  const { meta } = data;
  return (
    <>
      <div className="page-header"><div className="page-title">DATA <span>SUMMARY</span></div><div className="page-sub">Analysis results from your uploaded CSV</div></div>
      <div className="fu" style={{ opacity:0, display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:11, marginBottom:18 }}>
        {[["Transactions",meta.transactions.toLocaleString(),"var(--accent)"],["Unique Items",meta.items,"var(--accent2)"],["Rules Mined",meta.rules,"var(--green)"],["Avg Lift",meta.avgLift,"var(--blue)"]].map(([l,v,c])=>(
          <div key={l} style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:10, padding:"12px 14px" }}>
            <div style={{ fontSize:"0.57rem", color:"var(--muted)", textTransform:"uppercase", letterSpacing:"2px", marginBottom:4 }}>{l}</div>
            <div style={{ fontFamily:"var(--font-display)", fontSize:"1.75rem", color:c }}>{v}</div>
          </div>
        ))}
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:11 }}>
        {[["🟡 Thresholds",["min_support: "+meta.minSupport,"min_confidence: "+meta.minConfidence,"Auto-tuned to 20–80 rules"]],["🟢 Algorithm",["FP-Growth (browser-native)","No external server needed","Runs entirely from your CSV"]],["📌 Scoring",["Lift (norm): 35%","Confidence: 30%","Support: 20% · Conviction: 15%"]]].map(([title,rules])=>(
          <div key={title} style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:11, padding:13 }}>
            <div style={{ fontSize:"0.59rem", textTransform:"uppercase", letterSpacing:"2px", marginBottom:8, fontWeight:600, color:"var(--accent2)" }}>{title}</div>
            {rules.map((r,i)=><div key={i} style={{ fontSize:"0.71rem", color:"var(--muted)", padding:"4px 0", borderBottom:i<rules.length-1?"1px solid var(--border)":"none", lineHeight:1.4 }}>{r}</div>)}
          </div>
        ))}
      </div>
    </>
  );
}

// ── Nav ───────────────────────────────────────────────────────────────────────
const NAV = [
  { section: "Overview",   items: [{ key:"dashboard", icon:"🏠", label:"Homepage Ranking" }] },
  { section: "Analytics",  items: [{ key:"bundles", icon:"🏆", label:"Bundles" }, { key:"fbt", icon:"🛒", label:"Bought Together" }, { key:"cart", icon:"🛍️", label:"Cart Cross-Sell" }] },
  { section: "Decisions",  items: [{ key:"promos", icon:"🎯", label:"Promo Recommendations" }, { key:"summary", icon:"📊", label:"Data Summary" }] },
  { section: "Settings",   items: [{ key:"upload", icon:"📂", label:"Upload Data" }] },
];

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [page, setPage] = useState("dashboard");
  const [data, setData] = useState(null);
  const [allRows, setAllRows] = useState([]);
  const [uploadedFiles, setUploadedFiles] = useState([]);

  const handleAnalyze = (newRows, fileName) => {
    const merged = [...allRows, ...newRows];
    setAllRows(merged);
    setUploadedFiles(prev => [...prev, { name: fileName, rows: newRows.length }]);
    setData(analyzeRows(merged));
    setPage("dashboard");
  };

  const handleClearAll = () => {
    setAllRows([]); setUploadedFiles([]); setData(null); setPage("dashboard");
  };

  const props = { data, onUpload: () => setPage("upload") };

  const pages = {
    dashboard: <DashboardPage {...props} />,
    bundles:   <BundlesPage   {...props} />,
    fbt:       <FBTPage       {...props} />,
    cart:      <CartPage      {...props} />,
    promos:    <PromosPage    {...props} />,
    summary:   <SummaryPage   {...props} />,
    upload:    <UploadPage onAnalyze={handleAnalyze} uploadedFiles={uploadedFiles} onClearAll={handleClearAll} hasData={!!data} />,
  };

  return (
    <>
      <style>{style}</style>
      <div className="app">
        <div className="sidebar">
          <div className="logo-wrap">
            <img src="/logo.png" alt="ByteMe" className="logo-img" />
            <div><div className="logo-title">ByteMe</div><div className="logo-slogan">isang kagat, busog agad</div></div>
          </div>
          {NAV.map(s => (
            <div key={s.section}>
              <div className="nav-section">{s.section}</div>
              {s.items.map(it => (
                <div key={it.key} className={`nav-item ${page===it.key?"active":""}`} onClick={()=>setPage(it.key)}>
                  <span>{it.icon}</span>{it.label}
                  {it.key==="upload" && !data && <span className="nav-badge" style={{ background:"var(--accent)", color:"#fff" }}>!</span>}
                  {it.key==="upload" && data  && <span className="nav-badge" style={{ background:"var(--green)", color:"#000" }}>{uploadedFiles.length}</span>}
                </div>
              ))}
            </div>
          ))}
          {data && (
            <div className="sidebar-footer">
              <div className="sf-label">Loaded Data</div>
              <div className="sf-info">{uploadedFiles.length} file{uploadedFiles.length!==1?"s":""} · {allRows.length.toLocaleString()} rows</div>
              <button className="sf-clear" onClick={handleClearAll}>🗑 Clear All Data</button>
            </div>
          )}
        </div>
        <div className="main">{pages[page]}</div>
      </div>
    </>
  );
}
