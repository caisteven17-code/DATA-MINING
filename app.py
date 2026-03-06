from __future__ import annotations

import html

import streamlit as st

from engine import analyze_rows, parse_csv


st.set_page_config(page_title="FastFood MBA Dashboard", layout="wide")


THEME_CSS = """
<style>
@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;700&display=swap');
:root {
  --bg: #0a0a0f;
  --surface: #111118;
  --card: #171722;
  --border: rgba(255,255,255,.09);
  --text: #f0ede8;
  --muted: #9b96ad;
  --accent: #ff4d00;
  --accent2: #ffbe00;
  --green: #00e5a0;
  --blue: #4d9fff;
  --red: #ff6b6b;
}
html, body, [class*="css"] { font-family: 'DM Sans', sans-serif; }
[data-testid="stAppViewContainer"] { background: radial-gradient(1300px 700px at 85% -20%, #1f2032 0%, var(--bg) 45%); color: var(--text); }
[data-testid="stHeader"] {
  background: rgba(10, 10, 15, 0.92) !important;
  border-bottom: 1px solid var(--border);
}
[data-testid="stToolbar"] {
  background: transparent !important;
}
[data-testid="stSidebar"] {
  background: linear-gradient(180deg, #111118 0%, #0e0e16 100%);
  border-right: 1px solid var(--border);
}
[data-testid="stSidebar"] * { color: var(--text) !important; }
[data-testid="stSidebar"] .stRadio label { font-size: .9rem; }
[data-testid="stSidebar"] .stRadio [role="radiogroup"] label[data-baseweb="radio"] {
  border: 1px solid var(--border); border-radius: 8px; padding: 6px 10px; margin-bottom: 6px;
  background: rgba(255,255,255,.02);
}
[data-testid="stSidebar"] .stButton button {
  width: 100%; background: rgba(255,107,107,.08); border: 1px solid rgba(255,107,107,.3); color: var(--red);
}
[data-testid="stFileUploaderDropzone"] {
  background: rgba(255,77,0,.06); border: 1px dashed rgba(255,77,0,.35); border-radius: 14px;
}
.stButton > button[kind="primary"] {
  background: linear-gradient(90deg, var(--accent), #ff7a00); border: none; color: #fff;
}
.block-container { padding-top: 3.4rem; }
.title-wrap { margin-bottom: .9rem; }
.title-main {
  font-family: 'Bebas Neue', sans-serif; font-size: 3.0rem; letter-spacing: 2px; line-height: .95; margin-bottom: 2px;
}
.title-main .hl { color: var(--accent); }
.title-sub { color: var(--muted); text-transform: uppercase; letter-spacing: 1.4px; font-size: .75rem; }
.kpi-card {
  background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 12px 14px;
  box-shadow: 0 8px 28px rgba(0,0,0,.2);
}
.kpi-label { color: var(--muted); font-size: .63rem; letter-spacing: 1.3px; text-transform: uppercase; }
.kpi-val { font-family: 'Bebas Neue', sans-serif; font-size: 2rem; line-height: 1; margin-top: 3px; }
.panel {
  background: var(--card); border: 1px solid var(--border); border-radius: 14px; padding: 12px; margin-top: .6rem;
}
.panel-title { font-family: 'Bebas Neue', sans-serif; font-size: 1.2rem; letter-spacing: 1.4px; }
.rank-row { margin-top: 8px; padding: 7px 8px; border-radius: 8px; background: rgba(255,255,255,.02); border: 1px solid rgba(255,255,255,.04); }
.rank-line { display: flex; justify-content: space-between; gap: 8px; font-size: .82rem; }
.rank-name { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rank-val { color: var(--accent2); font-weight: 700; }
.bar { height: 4px; background: rgba(255,255,255,.08); border-radius: 999px; margin-top: 5px; overflow: hidden; }
.bar > span { display:block; height: 100%; background: linear-gradient(90deg, var(--accent), var(--accent2)); }
[data-testid="stDataFrame"] { border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
.info-box {
  background: rgba(77,159,255,.12); border: 1px solid rgba(77,159,255,.35); border-radius: 10px; padding: 10px 12px; color: #b9d8ff;
}
.brand {
  background: rgba(255,77,0,.08); border: 1px solid rgba(255,77,0,.24); border-radius: 12px; padding: 11px 12px; margin-bottom: 10px;
}
.brand-title { font-family:'Bebas Neue', sans-serif; font-size: 1.5rem; letter-spacing: 1.2px; color: var(--accent); }
.brand-sub { color: var(--muted); font-size: .72rem; }
</style>
"""


def _init_state() -> None:
    defaults = {
        "all_rows": [],
        "uploaded_files": [],
        "data": None,
        "cart": [],
    }
    for key, value in defaults.items():
        if key not in st.session_state:
            st.session_state[key] = value


def _fmt_int(v: int) -> str:
    return f"{v:,}"


def _render_page_title(title: str, highlight: str, subtitle: str) -> None:
    st.markdown(
        f"""
<div class='title-wrap'>
  <div class='title-main'>{html.escape(title)} <span class='hl'>{html.escape(highlight)}</span></div>
  <div class='title-sub'>{html.escape(subtitle)}</div>
</div>
""",
        unsafe_allow_html=True,
    )


def _render_kpi(label: str, value: str, color: str) -> None:
    st.markdown(
        f"""
<div class='kpi-card'>
  <div class='kpi-label'>{html.escape(label)}</div>
  <div class='kpi-val' style='color:{color}'>{html.escape(value)}</div>
</div>
""",
        unsafe_allow_html=True,
    )


def _render_rank_panel(title: str, rows: list[dict], value_key: str, max_value: float) -> None:
    chunks = [f"<div class='panel'><div class='panel-title'>{html.escape(title)}</div>"]
    for i, row in enumerate(rows, start=1):
        name = html.escape(str(row.get("item", row.get("name", "-"))))
        val = float(row.get(value_key, 0.0))
        width = 0 if max_value <= 0 else min(100.0, (val / max_value) * 100.0)
        chunks.append(
            """
<div class='rank-row'>
  <div class='rank-line'>
    <div class='rank-name'>#{idx} {name}</div>
    <div class='rank-val'>{value}</div>
  </div>
  <div class='bar'><span style='width:{width:.2f}%'></span></div>
</div>
""".format(idx=i, name=name, value=f"{val:.3f}", width=width)
        )
    chunks.append("</div>")
    st.markdown("".join(chunks), unsafe_allow_html=True)


def _require_data() -> bool:
    if st.session_state["data"] is None:
        st.markdown("<div class='info-box'>Upload at least one CSV file first.</div>", unsafe_allow_html=True)
        return False
    return True


def show_upload() -> None:
    _render_page_title("UPLOAD", "DATA", "CSV ingestion and merge")
    st.write("Expected wide-format columns like `item1,item2,...` and `price1,price2,...`.")

    files = st.file_uploader("Choose CSV files", type=["csv"], accept_multiple_files=True)
    merged_rows = []
    previews: list[dict] = []

    if files:
        for f in files:
            text = f.read().decode("utf-8", errors="replace")
            parsed = parse_csv(text)
            rows = parsed["rows"]
            merged_rows.extend(rows)
            previews.append({"name": f.name, "rows": rows[:5], "total": len(rows)})

        for preview in previews:
            st.markdown(f"**{preview['name']}** · {preview['total']} rows")
            if preview["rows"]:
                st.dataframe(preview["rows"], use_container_width=True, height=180)

        if st.button("Analyze / Merge", type="primary"):
            st.session_state["all_rows"].extend(merged_rows)
            for f in files:
                rows = parse_csv(f.getvalue().decode("utf-8", errors="replace"))["rows"]
                st.session_state["uploaded_files"].append({"name": f.name, "rows": len(rows)})
            st.session_state["data"] = analyze_rows(st.session_state["all_rows"])
            st.success("Analysis complete.")

    if st.session_state["uploaded_files"]:
        st.markdown("### Loaded Files")
        st.dataframe(st.session_state["uploaded_files"], use_container_width=True)


def show_dashboard() -> None:
    if not _require_data():
        return

    data = st.session_state["data"]
    meta = data["meta"]
    homepage = data["homepage"]
    bundles = data["bundles"]
    promos = data["promos"]

    _render_page_title("PRODUCT", "RANKINGS", f"Based on {_fmt_int(meta['transactions'])} transactions · FP-Growth")

    c1, c2, c3, c4 = st.columns(4)
    with c1:
        _render_kpi("Transactions", _fmt_int(meta["transactions"]), "var(--accent)")
    with c2:
        _render_kpi("Products", str(meta["items"]), "var(--accent2)")
    with c3:
        _render_kpi("Rules", str(meta["rules"]), "var(--green)")
    with c4:
        _render_kpi("Avg Lift", str(meta["avg_lift"]), "var(--blue)")

    top = sorted(homepage, key=lambda x: x["pop"], reverse=True)[:7]
    least = sorted(homepage, key=lambda x: x["pop"])[:7]
    combos = sorted(bundles, key=lambda x: x["support"], reverse=True)[:7]

    cols = st.columns(3)
    with cols[0]:
        _render_rank_panel("MOST BOUGHT", top, "pop", max([x["pop"] for x in top], default=1.0))
    with cols[1]:
        _render_rank_panel("LEAST BOUGHT", least, "pop", max([x["pop"] for x in least], default=1.0))
    with cols[2]:
        _render_rank_panel("TOP COMBOS", combos, "support", max([x["support"] for x in combos], default=1.0))

    c5, c6 = st.columns(2)
    with c5:
        st.markdown("### Bundle Recommendations")
        st.dataframe(bundles[:10], use_container_width=True, height=340)
    with c6:
        st.markdown("### Promo Suggestions")
        st.dataframe(promos[:10], use_container_width=True, height=340)


def show_bundles() -> None:
    if not _require_data():
        return
    meta = st.session_state["data"]["meta"]
    _render_page_title("RECOMMENDED", "BUNDLES", f"Mined from {_fmt_int(meta['transactions'])} transactions")
    st.dataframe(st.session_state["data"]["bundles"], use_container_width=True)


def show_fbt() -> None:
    if not _require_data():
        return

    _render_page_title("BOUGHT", "TOGETHER", "Association rules by base product")
    fbt = st.session_state["data"]["fbt"]
    items = sorted(list(fbt.keys()))
    if not items:
        st.warning("No bought-together results found.")
        return

    selected = st.selectbox("Base item", items)
    st.dataframe(fbt.get(selected, []), use_container_width=True)


def show_cart() -> None:
    if not _require_data():
        return

    _render_page_title("CART", "CROSS-SELL", "Rule-based suggestions from your mined data")
    data = st.session_state["data"]
    price_map = data["price_map"]
    all_items = sorted(price_map.keys())

    cart = st.multiselect("Select up to 3 cart items", all_items, default=st.session_state["cart"], max_selections=3)
    st.session_state["cart"] = cart

    total = sum(price_map.get(i, 0) for i in cart)
    _render_kpi("Cart Total", f"P{total}", "var(--accent2)")

    if cart:
        base = cart[0]
        suggestions = [r for r in data["fbt"].get(base, []) if r["item"] not in cart]
        st.markdown(f"### Suggestions for `{base}`")
        st.dataframe(suggestions, use_container_width=True)
    else:
        st.markdown("<div class='info-box'>Add cart items to see suggestions.</div>", unsafe_allow_html=True)


def show_promos() -> None:
    if not _require_data():
        return

    _render_page_title("PROMO", "RECOMMENDATIONS", "Auto-generated from transaction patterns")
    promos = st.session_state["data"]["promos"]
    kind = st.selectbox("Filter", ["all", "bundle", "buy2get1", "addon", "happy-hour"], index=0)
    filtered = promos if kind == "all" else [p for p in promos if p["type"] == kind]
    st.dataframe(filtered, use_container_width=True)


def show_summary() -> None:
    if not _require_data():
        return

    data = st.session_state["data"]
    meta = data["meta"]

    _render_page_title("DATA", "SUMMARY", "Model output and threshold configuration")
    c1, c2, c3, c4 = st.columns(4)
    with c1:
        _render_kpi("Transactions", _fmt_int(meta["transactions"]), "var(--accent)")
    with c2:
        _render_kpi("Unique Items", str(meta["items"]), "var(--accent2)")
    with c3:
        _render_kpi("Rules", str(meta["rules"]), "var(--green)")
    with c4:
        _render_kpi("Avg Lift", str(meta["avg_lift"]), "var(--blue)")

    st.markdown("### Thresholds")
    st.json({"min_support": meta["min_support"], "min_confidence": meta["min_confidence"]})


_init_state()
st.markdown(THEME_CSS, unsafe_allow_html=True)

with st.sidebar:
    st.markdown(
        """
<div class='brand'>
  <div class='brand-title'>ByteMe</div>
  <div class='brand-sub'>isang kagat, busog agad</div>
</div>
""",
        unsafe_allow_html=True,
    )

    page = st.radio(
        "Pages",
        [
            "Dashboard",
            "Bundles",
            "Bought Together",
            "Cart Cross-Sell",
            "Promos",
            "Summary",
            "Upload",
        ],
        index=0,
        label_visibility="collapsed",
    )

    if st.session_state["data"] is not None:
        st.markdown("---")
        st.caption(f"{len(st.session_state['uploaded_files'])} file(s) loaded")
        st.caption(f"{_fmt_int(len(st.session_state['all_rows']))} total rows")
        if st.button("Clear All Data", use_container_width=True):
            st.session_state["all_rows"] = []
            st.session_state["uploaded_files"] = []
            st.session_state["data"] = None
            st.session_state["cart"] = []
            st.rerun()

if page == "Dashboard":
    show_dashboard()
elif page == "Bundles":
    show_bundles()
elif page == "Bought Together":
    show_fbt()
elif page == "Cart Cross-Sell":
    show_cart()
elif page == "Promos":
    show_promos()
elif page == "Summary":
    show_summary()
else:
    show_upload()
