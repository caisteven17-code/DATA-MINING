from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from itertools import combinations
from math import ceil
from typing import Dict, Iterable, List, Optional, Sequence, Tuple


TARGET_MIN = 20
TARGET_MAX = 80


def _r(value: float, digits: int = 6) -> float:
    return float(f"{value:.{digits}f}")


def parse_csv(text: str) -> Dict[str, List[Dict[str, str]]]:
    lines = [line for line in text.strip().splitlines() if line.strip()]
    if not lines:
        return {"headers": [], "rows": []}

    headers = [h.strip().strip('"') for h in lines[0].split(",")]
    rows: List[Dict[str, str]] = []
    for line in lines[1:]:
        vals = [v.strip().strip('"') for v in line.split(",")]
        row: Dict[str, str] = {}
        for i, header in enumerate(headers):
            row[header] = vals[i] if i < len(vals) else ""
        rows.append(row)

    return {"headers": headers, "rows": rows}


def build_baskets(rows: Sequence[Dict[str, str]]) -> Dict[str, object]:
    if not rows:
        return {"baskets": [], "price_map": {}}

    keys = list(rows[0].keys())
    item_cols = [k for k in keys if k.lower().startswith("item") and k[4:].isdigit()]
    price_cols = [k for k in keys if k.lower().startswith("price") and k[5:].isdigit()]

    price_totals: Dict[str, float] = {}
    price_count: Dict[str, int] = {}
    baskets: List[List[str]] = []

    for row in rows:
        basket: List[str] = []
        for idx, item_col in enumerate(item_cols):
            item = (row.get(item_col) or "").strip()
            price_str = row.get(price_cols[idx], "") if idx < len(price_cols) else ""
            try:
                price = float(price_str)
            except (TypeError, ValueError):
                price = None

            if item:
                if item not in basket:
                    basket.append(item)
                if price is not None:
                    price_totals[item] = price_totals.get(item, 0.0) + price
                    price_count[item] = price_count.get(item, 0) + 1

        if basket:
            baskets.append(basket)

    avg_prices = {
        item: round(price_totals[item] / price_count[item])
        for item in price_totals
        if price_count[item] > 0
    }

    return {"baskets": baskets, "price_map": avg_prices}


@dataclass
class FPNode:
    item: Optional[str]
    count: int
    parent: Optional["FPNode"]

    def __post_init__(self) -> None:
        self.children: Dict[str, FPNode] = {}


class FPTree:
    def __init__(self) -> None:
        self.root = FPNode(None, 0, None)
        self.header: Dict[str, List[FPNode]] = {}

    def insert(self, transaction: Sequence[str], count: int = 1) -> None:
        node = self.root
        for item in transaction:
            if item in node.children:
                node.children[item].count += count
            else:
                child = FPNode(item, count, node)
                node.children[item] = child
                self.header.setdefault(item, []).append(child)
            node = node.children[item]

    def cond_pattern_base(self, item: str) -> List[Tuple[List[str], int]]:
        patterns: List[Tuple[List[str], int]] = []
        for node in self.header.get(item, []):
            path: List[str] = []
            parent = node.parent
            while parent is not None and parent.item is not None:
                path.insert(0, parent.item)
                parent = parent.parent
            if path:
                patterns.append((path, node.count))
        return patterns


def _build_tree(
    transactions: Iterable[Tuple[Sequence[str], int]], min_count: int
) -> Tuple[Optional[FPTree], Dict[str, int]]:
    freq: Dict[str, int] = {}
    tx = list(transactions)
    for trans, cnt in tx:
        for item in trans:
            freq[item] = freq.get(item, 0) + cnt

    freq_items = {item: c for item, c in freq.items() if c >= min_count}
    if not freq_items:
        return None, freq_items

    order = sorted(freq_items.keys(), key=lambda i: freq_items[i], reverse=True)
    rank = {item: idx for idx, item in enumerate(order)}

    tree = FPTree()
    for trans, cnt in tx:
        filtered = [i for i in trans if i in freq_items]
        filtered.sort(key=lambda i: rank[i])
        if filtered:
            tree.insert(filtered, cnt)

    return tree, freq_items


def _fpgrowth_rec(
    tree: FPTree,
    freq_items: Dict[str, int],
    min_count: int,
    prefix: List[str],
    results: List[Tuple[List[str], int]],
) -> None:
    items = sorted(freq_items.keys(), key=lambda i: freq_items[i])
    for item in items:
        new_set = sorted(prefix + [item])
        results.append((new_set, freq_items[item]))

        cond_patterns = tree.cond_pattern_base(item)
        if not cond_patterns:
            continue

        cond_tree, cond_freq = _build_tree(cond_patterns, min_count)
        if cond_tree and cond_freq:
            _fpgrowth_rec(cond_tree, cond_freq, min_count, new_set, results)


def fpgrowth(baskets: Sequence[Sequence[str]], min_support: float, max_len: int = 4) -> List[Dict[str, object]]:
    n = len(baskets)
    if n == 0:
        return []

    min_count = max(1, ceil(min_support * n))
    transactions = [(basket, 1) for basket in baskets]
    tree, freq_items = _build_tree(transactions, min_count)
    if tree is None:
        return []

    results: List[Tuple[List[str], int]] = []
    _fpgrowth_rec(tree, freq_items, min_count, [], results)

    seen = set()
    unique: List[Dict[str, object]] = []
    for itemset, count in results:
        if len(itemset) > max_len:
            continue
        key = "|".join(itemset)
        if key in seen:
            continue
        seen.add(key)
        unique.append({"itemset": itemset, "support": count / n, "count": count})

    for item, count in freq_items.items():
        if item in seen:
            continue
        seen.add(item)
        unique.append({"itemset": [item], "support": count / n, "count": count})

    unique.sort(key=lambda x: x["support"], reverse=True)
    return unique


def _powerset(arr: Sequence[str]) -> List[List[str]]:
    out: List[List[str]] = []
    n = len(arr)
    for r in range(1, n):
        for combo in combinations(arr, r):
            out.append(list(combo))
    return out


def association_rules(itemsets: Sequence[Dict[str, object]], min_confidence: float) -> List[Dict[str, object]]:
    support_map: Dict[str, float] = {}
    for row in itemsets:
        itemset = sorted(row["itemset"])
        support_map["|".join(itemset)] = float(row["support"])

    rules: List[Dict[str, object]] = []

    for row in itemsets:
        itemset = list(row["itemset"])
        support = float(row["support"])
        if len(itemset) < 2:
            continue

        for ant in _powerset(itemset):
            ant_set = set(ant)
            cons = sorted([i for i in itemset if i not in ant_set])
            if not cons:
                continue

            ant_key = "|".join(sorted(ant))
            cons_key = "|".join(cons)
            ant_support = support_map.get(ant_key)
            cons_support = support_map.get(cons_key)
            if not ant_support or not cons_support:
                continue

            confidence = support / ant_support
            if confidence < min_confidence:
                continue

            lift = confidence / cons_support
            leverage = support - (ant_support * cons_support)
            conviction = 999.0 if confidence >= 1 else (1 - cons_support) / (1 - confidence)

            rules.append(
                {
                    "antecedents": sorted(ant),
                    "consequents": cons,
                    "support": _r(support, 6),
                    "confidence": _r(confidence, 6),
                    "lift": _r(lift, 6),
                    "leverage": _r(leverage, 6),
                    "conviction": min(_r(conviction, 6), 999.0),
                }
            )

    return rules


def auto_tune(baskets: Sequence[Sequence[str]]) -> Dict[str, object]:
    supports = [0.05, 0.04, 0.03, 0.025, 0.02, 0.015, 0.01, 0.008, 0.005]
    confs = [0.3, 0.25, 0.2, 0.15, 0.1, 0.05]

    best_sup = supports[0]
    best_conf = confs[0]
    best_itemsets: List[Dict[str, object]] = []
    best_rules: List[Dict[str, object]] = []
    best_dist = float("inf")

    for sup in supports:
        itemsets = fpgrowth(baskets, sup)
        if not itemsets:
            continue

        for conf in confs:
            rules = association_rules(itemsets, conf)
            n = len(rules)

            if TARGET_MIN <= n <= TARGET_MAX:
                return {
                    "min_support": sup,
                    "min_confidence": conf,
                    "itemsets": itemsets,
                    "rules": rules,
                }

            dist = min(abs(n - TARGET_MIN), abs(n - TARGET_MAX))
            if dist < best_dist or (dist == best_dist and n > len(best_rules)):
                best_dist = dist
                best_sup = sup
                best_conf = conf
                best_itemsets = itemsets
                best_rules = rules

    return {
        "min_support": best_sup,
        "min_confidence": best_conf,
        "itemsets": best_itemsets,
        "rules": best_rules,
    }


def _minmax(rules: Sequence[Dict[str, object]], key: str) -> List[Dict[str, object]]:
    vals = [float(r[key]) for r in rules]
    mn, mx = min(vals), max(vals)

    out: List[Dict[str, object]] = []
    for rule in rules:
        rr = dict(rule)
        rr[f"{key}_norm"] = 0.5 if mx == mn else (float(rule[key]) - mn) / (mx - mn)
        out.append(rr)
    return out


def score_rules(rules: Sequence[Dict[str, object]]) -> List[Dict[str, object]]:
    if not rules:
        return []

    scored = _minmax(rules, "lift")
    scored = _minmax(scored, "conviction")

    out: List[Dict[str, object]] = []
    for rule in scored:
        score = 0.35 * rule["lift_norm"] + 0.30 * float(rule["confidence"]) + 0.20 * float(rule["support"]) + 0.15 * rule["conviction_norm"]
        rr = dict(rule)
        rr["score"] = _r(score, 6)
        out.append(rr)

    out.sort(key=lambda r: r["score"], reverse=True)
    return out


def rule_key(rule: Dict[str, object]) -> str:
    return f"{', '.join(rule['antecedents'])} -> {', '.join(rule['consequents'])}"


def _classify_drift(prev: Optional[Dict[str, object]], curr: Optional[Dict[str, object]]) -> str:
    if prev is None:
        return "new"
    if curr is None:
        return "lost"

    lift_delta = float(curr["lift"]) - float(prev["lift"])
    supp_delta = float(curr["support"]) - float(prev["support"])
    score_delta = float(curr["score"]) - float(prev["score"])

    if abs(lift_delta) > 0.3 and abs(supp_delta) > 0.02:
        return "volatile"
    if score_delta > 0.05:
        return "improved"
    if score_delta < -0.05:
        return "declined"
    return "stable"


def compute_drift(prev_rules: Sequence[Dict[str, object]], curr_rules: Sequence[Dict[str, object]]) -> Dict[str, object]:
    prev_map = {rule_key(r): r for r in (prev_rules or [])}
    curr_map = {rule_key(r): r for r in (curr_rules or [])}

    all_keys = set(prev_map.keys()) | set(curr_map.keys())
    drift_report: List[Dict[str, object]] = []

    for key in all_keys:
        prev = prev_map.get(key)
        curr = curr_map.get(key)
        status = _classify_drift(prev, curr)

        drift_report.append(
            {
                "key": key,
                "status": status,
                "prev": None
                if prev is None
                else {
                    "support": prev["support"],
                    "confidence": prev["confidence"],
                    "lift": prev["lift"],
                    "score": prev["score"],
                },
                "curr": None
                if curr is None
                else {
                    "support": curr["support"],
                    "confidence": curr["confidence"],
                    "lift": curr["lift"],
                    "score": curr["score"],
                },
                "lift_delta": None if prev is None or curr is None else _r(float(curr["lift"]) - float(prev["lift"]), 4),
                "supp_delta": None if prev is None or curr is None else _r(float(curr["support"]) - float(prev["support"]), 4),
                "conf_delta": None if prev is None or curr is None else _r(float(curr["confidence"]) - float(prev["confidence"]), 4),
                "score_delta": None if prev is None or curr is None else _r(float(curr["score"]) - float(prev["score"]), 4),
            }
        )

    summary = {
        "total": len(all_keys),
        "stable": len([r for r in drift_report if r["status"] == "stable"]),
        "improved": len([r for r in drift_report if r["status"] == "improved"]),
        "declined": len([r for r in drift_report if r["status"] == "declined"]),
        "new": len([r for r in drift_report if r["status"] == "new"]),
        "lost": len([r for r in drift_report if r["status"] == "lost"]),
        "volatile": len([r for r in drift_report if r["status"] == "volatile"]),
    }

    survived = [r for r in drift_report if r["status"] not in {"new", "lost"}]
    stable_or_better = [r for r in survived if r["status"] in {"stable", "improved"}]
    summary["stability_score"] = _r((len(stable_or_better) / len(survived) * 100), 1) if survived else 100.0

    summary["top_gainers"] = sorted(
        [r for r in drift_report if r["lift_delta"] is not None and r["lift_delta"] > 0],
        key=lambda x: x["lift_delta"],
        reverse=True,
    )[:3]
    summary["top_fallers"] = sorted(
        [r for r in drift_report if r["lift_delta"] is not None and r["lift_delta"] < 0],
        key=lambda x: x["lift_delta"],
    )[:3]

    return {"drift_report": drift_report, "summary": summary}


def build_iteration_snapshot(
    iteration: int,
    file_name: str,
    rules: Sequence[Dict[str, object]],
    meta: Dict[str, object],
    prev_rules: Optional[Sequence[Dict[str, object]]] = None,
) -> Dict[str, object]:
    drift = compute_drift(prev_rules, rules) if prev_rules else None
    top_rules = [
        {
            "key": rule_key(r),
            "support": r["support"],
            "confidence": r["confidence"],
            "lift": r["lift"],
            "score": r["score"],
        }
        for r in list(rules)[:5]
    ]

    return {
        "iteration": iteration,
        "file_name": file_name,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "meta": dict(meta),
        "top_rules": top_rules,
        "drift": drift,
        "threshold_shift": None,
    }


def build_bundles(
    itemsets: Sequence[Dict[str, object]],
    rules: Sequence[Dict[str, object]],
    price_map: Dict[str, int],
    top_n: int = 12,
) -> List[Dict[str, object]]:
    multi = [x for x in itemsets if 2 <= len(x["itemset"]) <= 4]

    rules_by_item: Dict[str, List[Dict[str, object]]] = {}
    for rule in rules:
        for item in list(rule["antecedents"]) + list(rule["consequents"]):
            rules_by_item.setdefault(item, []).append(rule)

    support_map = {
        "|".join(sorted(row["itemset"])): float(row["support"])
        for row in itemsets
    }

    def best_rule_for_itemset(itemset: Sequence[str]) -> Optional[Dict[str, object]]:
        i_set = set(itemset)
        seen = set()
        candidates: List[Dict[str, object]] = []
        for item in itemset:
            for rule in rules_by_item.get(item, []):
                marker = id(rule)
                if marker not in seen:
                    seen.add(marker)
                    candidates.append(rule)

        best = None
        for rule in candidates:
            all_items = list(rule["antecedents"]) + list(rule["consequents"])
            if len(all_items) >= 2 and all(it in i_set for it in all_items):
                if best is None or float(rule["score"]) > float(best["score"]):
                    best = rule
        return best

    bundles: List[Dict[str, object]] = []

    for row in multi:
        itemset = list(row["itemset"])
        support = float(row["support"])
        rule = best_rule_for_itemset(itemset)

        best_conf = None
        best_cons_support = None
        for item in itemset:
            ant_support = support_map.get(item)
            if ant_support:
                conf = support / ant_support
                if best_conf is None or conf > best_conf:
                    best_conf = conf
                    cons_key = "|".join(sorted([i for i in itemset if i != item]))
                    best_cons_support = support_map.get(cons_key)

        real_confidence = _r(best_conf, 4) if best_conf is not None else _r(min(support * 1.5, 1), 4)
        real_lift = (
            _r(best_conf / best_cons_support, 4)
            if best_conf is not None and best_cons_support
            else (_r(float(rule["lift"]), 4) if rule else _r(1 + support * 2, 4))
        )

        size_bonus = 1 + 0.2 * (len(itemset) - 1)
        rank_score = support * size_bonus * real_lift
        price = int(sum(price_map.get(i, 0) for i in itemset))
        discount_pct = min(0.08 + rank_score * 0.5, 0.15)
        save = round(price * discount_pct)

        sorted_items = sorted(itemset, key=lambda i: price_map.get(i, 0), reverse=True)
        name = " + ".join(sorted_items[:2]) + (" Combo" if len(itemset) >= 3 else " Deal")

        bundles.append(
            {
                "name": name,
                "items": itemset,
                "support": _r(support, 4),
                "confidence": real_confidence,
                "lift": _r(real_lift, 4),
                "leverage": _r(float(rule["leverage"]), 5) if rule else _r(support * 0.1, 5),
                "conviction": _r(min(float(rule["conviction"]), 10), 3) if rule else _r(1 + support, 3),
                "score": _r(float(rule["score"]), 4) if rule else _r(rank_score, 4),
                "price": price,
                "save": save,
                "size": len(itemset),
                "rank_score": rank_score,
            }
        )

    bundles.sort(key=lambda b: b["rank_score"], reverse=True)
    return bundles[:top_n]


def build_fbt(rules: Sequence[Dict[str, object]], price_map: Dict[str, int], top_n: int = 5) -> Dict[str, List[Dict[str, object]]]:
    fbt_map: Dict[str, Dict[str, Dict[str, object]]] = {}

    for rule in rules:
        for ant_item in rule["antecedents"]:
            fbt_map.setdefault(ant_item, {})
            for cons_item in rule["consequents"]:
                existing = fbt_map[ant_item].get(cons_item)
                if existing is None or float(rule["score"]) > float(existing["score"]):
                    fbt_map[ant_item][cons_item] = {
                        "item": cons_item,
                        "lift": float(rule["lift"]),
                        "conf": float(rule["confidence"]),
                        "score": float(rule["score"]),
                        "price": int(price_map.get(cons_item, 0)),
                    }

    result: Dict[str, List[Dict[str, object]]] = {}
    for item, recs in fbt_map.items():
        result[item] = sorted(recs.values(), key=lambda x: x["score"], reverse=True)[:top_n]
    return result


def build_homepage(
    itemsets: Sequence[Dict[str, object]],
    rules: Sequence[Dict[str, object]],
    price_map: Dict[str, int],
    top_n: int = 15,
) -> List[Dict[str, object]]:
    singles = [x for x in itemsets if len(x["itemset"]) == 1]
    pop_map = {x["itemset"][0]: float(x["support"]) for x in singles}

    cs_map: Dict[str, float] = {}
    for rule in rules:
        for item in list(rule["antecedents"]) + list(rule["consequents"]):
            cs_map[item] = cs_map.get(item, 0.0) + float(rule["score"])

    items = list(pop_map.keys())
    if not items:
        return []

    pop_vals = [pop_map.get(i, 0.0) for i in items]
    cs_vals = [cs_map.get(i, 0.0) for i in items]

    def norm(vals: Sequence[float]) -> List[float]:
        mn, mx = min(vals), max(vals)
        if mx == mn:
            return [0.5 for _ in vals]
        return [(v - mn) / (mx - mn) for v in vals]

    pop_norm = norm(pop_vals)
    cs_norm = norm(cs_vals)

    out = []
    for i, item in enumerate(items):
        out.append(
            {
                "item": item,
                "score": _r(0.5 * pop_norm[i] + 0.5 * cs_norm[i], 4),
                "pop": _r(pop_vals[i], 4),
                "cs": _r(cs_vals[i], 4),
                "price": int(price_map.get(item, 0)),
            }
        )

    out.sort(key=lambda x: x["score"], reverse=True)
    return out[:top_n]


def build_promos(
    bundles: Sequence[Dict[str, object]],
    itemsets: Sequence[Dict[str, object]],
    price_map: Dict[str, int],
) -> List[Dict[str, object]]:
    promos: List[Dict[str, object]] = []
    seen = set()

    add_on_keywords = [
        "fries", "drink", "sauce", "coffee", "soda", "cola", "juice", "water", "sundae", "pie", "soup", "tea", "coleslaw"
    ]
    main_keywords = ["burger", "chicken", "fish", "rice", "sandwich", "wrap", "steak", "meal"]

    for bundle in list(bundles)[:10]:
        items = list(bundle["items"])
        price = int(bundle["price"])
        save = int(bundle["save"])
        size = int(bundle["size"])
        score = float(bundle["score"])

        headline2 = f"Buy {items[0]} + {items[1]}"
        if size == 2 and save > 0 and headline2 not in seen:
            seen.add(headline2)
            promos.append(
                {
                    "type": "bundle",
                    "label": "Bundle Discount",
                    "headline": headline2,
                    "detail": f"Save P{save} - bundle price P{price - save} instead of P{price}.",
                    "save": save,
                    "tag": "High-lift combo",
                    "score": score,
                }
            )

        if size == 3:
            cheapest = sorted(items, key=lambda x: price_map.get(x, 0))[0]
            non_cheapest = [i for i in items if i != cheapest]
            h = f"Buy 2 Get 1: {' + '.join(non_cheapest)}"
            if h not in seen:
                seen.add(h)
                promos.append(
                    {
                        "type": "buy2get1",
                        "label": "Buy 2 Get 1",
                        "headline": h,
                        "detail": f"Get {cheapest} FREE (worth P{price_map.get(cheapest, 0)}) when you buy the other items.",
                        "save": int(price_map.get(cheapest, 0)),
                        "tag": "3-item strong set",
                        "score": score,
                    }
                )

        for item in items:
            lower_item = item.lower()
            if any(w in lower_item for w in main_keywords):
                addon = None
                for kw in add_on_keywords:
                    if kw not in lower_item:
                        addon = next(
                            (
                                k
                                for k in price_map.keys()
                                if kw in k.lower() and k not in items
                            ),
                            None,
                        )
                        if addon:
                            break

                if addon:
                    h = f"Add {addon} to your order"
                    if h not in seen:
                        seen.add(h)
                        promos.append(
                            {
                                "type": "addon",
                                "label": "Add-On Prompt",
                                "headline": h,
                                "detail": f"Pairs perfectly with {item}! Only P{price_map.get(addon, 0)}.",
                                "save": 0,
                                "tag": "Upsell opportunity",
                                "score": score * 0.8,
                            }
                        )
                break

    top_drinks = [k for k in price_map.keys() if any(w in k.lower() for w in add_on_keywords)][:3]
    if top_drinks:
        h = f"Happy Hour: {top_drinks[0]} 20% Off"
        if h not in seen:
            seen.add(h)
            promos.append(
                {
                    "type": "happy-hour",
                    "label": "Happy Hour",
                    "headline": h,
                    "detail": f"Based on your transaction data, boost slow hours with a limited-time discount on {top_drinks[0]}.",
                    "save": 0,
                    "tag": "Traffic booster",
                    "score": 0.05,
                }
            )

    cheap_items = [
        k
        for k, _ in sorted(
            [(k, p) for k, p in price_map.items() if p > 0],
            key=lambda x: x[1],
        )[:2]
    ]
    if len(cheap_items) >= 2:
        h = f"Buy 2 {cheap_items[0]}, Get 1 Free"
        if h not in seen:
            seen.add(h)
            promos.append(
                {
                    "type": "buy2get1",
                    "label": "Buy 2 Get 1",
                    "headline": h,
                    "detail": "Popular low-cost item - great for increasing average basket size!",
                    "save": int(price_map.get(cheap_items[0], 0)),
                    "tag": "Volume driver",
                    "score": 0.04,
                }
            )

    promos.sort(key=lambda p: p["score"], reverse=True)
    return promos[:12]


def analyze_rows(all_rows: Sequence[Dict[str, str]]) -> Dict[str, object]:
    basket_result = build_baskets(all_rows)
    baskets = basket_result["baskets"]
    price_map = basket_result["price_map"]

    tuned = auto_tune(baskets)
    min_support = tuned["min_support"]
    min_confidence = tuned["min_confidence"]
    itemsets = tuned["itemsets"]
    raw_rules = tuned["rules"]

    rules = score_rules(raw_rules)
    bundles = build_bundles(itemsets, rules, price_map)
    fbt = build_fbt(rules, price_map)
    homepage = build_homepage(itemsets, rules, price_map)
    promos = build_promos(bundles, itemsets, price_map)

    avg_lift = _r(sum(float(r["lift"]) for r in rules) / len(rules), 3) if rules else 0.0

    return {
        "meta": {
            "transactions": len(baskets),
            "items": len(price_map.keys()),
            "rules": len(rules),
            "min_support": min_support,
            "min_confidence": min_confidence,
            "avg_lift": avg_lift,
        },
        "bundles": bundles,
        "fbt": fbt,
        "homepage": homepage,
        "promos": promos,
        "price_map": price_map,
        "rules": rules,
    }


def analyze_csv(csv_text: str) -> Dict[str, object]:
    rows = parse_csv(csv_text)["rows"]
    return analyze_rows(rows)