"""
recommender.py
==============
Business-ready recommendation generation for Byteme fast food analytics.

This module translates raw mining outputs (itemsets + scored rules) into
actionable recommendations across five business surfaces:
  1. Homepage rankings (Most Bought, Least Bought, Most Bought Bundles)
  2. Bundle cards (top frequent multi-item combos with pricing)
  3. Frequently Bought Together (FBT) widget per item
  4. Cart cross-sell suggestions
  5. Promo ideas (bundle discounts, buy-X-get-Y, add-on prompts)

Additionally generates:
  6. Business insights (upsell, weak item recovery, menu bundling)
"""

from typing import List, Dict, Optional
from itertools import combinations


# ─── HOMEPAGE RANKINGS ────────────────────────────────────────────────────────

def build_homepage_rankings(
    itemsets: List[Dict],
    rules: List[Dict],
    price_map: Dict[str, float],
    item_freq: Dict[str, int],
    top_n: int = 15
) -> Dict:
    """
    Compute homepage ranking divisions.
    
    Most Bought Foods:
      Ranked by raw item purchase frequency (how many baskets contained item)
    
    Least Bought Foods:
      Bottom of the same frequency ranking — candidates for promotion
    
    Most Bought Bundle Foods:
      Best 2-item and 3-item combos by composite score (support × lift)

    Top / Low Food Revenues:
      Ranked by estimated revenue per item = frequency × average item price
    """
    # --- Singles: Most / Least Bought ---
    all_items = sorted(item_freq.items(), key=lambda x: -x[1])

    most_bought = [
        {
            "rank": i + 1,
            "item": item,
            "frequency": count,
            "price": price_map.get(item, 0),
            "pct_transactions": round(count / max(item_freq.values(), default=1) * 100, 1)
        }
        for i, (item, count) in enumerate(all_items[:top_n])
    ]

    least_bought = [
        {
            "rank": i + 1,
            "item": item,
            "frequency": count,
            "price": price_map.get(item, 0),
            "pct_transactions": round(count / max(item_freq.values(), default=1) * 100, 1)
        }
        for i, (item, count) in enumerate(reversed(all_items[-top_n:]))
    ]

    revenues = sorted(
        [
            {
                "item": item,
                "frequency": count,
                "price": price_map.get(item, 0),
                "revenue": round(count * price_map.get(item, 0), 2),
            }
            for item, count in all_items
        ],
        key=lambda x: -x["revenue"]
    )

    top_revenue = [
        {**r, "rank": i + 1}
        for i, r in enumerate(revenues[:top_n])
    ]

    low_revenue = [
        {**r, "rank": i + 1}
        for i, r in enumerate(reversed(revenues[-top_n:]))
    ]

    # --- Bundle ranking (2-item & 3-item itemsets) ---
    bundles_raw = [
        is_ for is_ in itemsets if 2 <= len(is_["itemset"]) <= 3
    ]

    # Build support map for lift computation
    support_map = {"|".join(sorted(is_["itemset"])): is_["support"] for is_ in itemsets}

    # Rule lookup by antecedent → consequent
    rule_map = {}
    for rule in rules:
        key = "|".join(sorted(rule["antecedents"] + rule["consequents"]))
        if key not in rule_map or rule["score"] > rule_map[key]["score"]:
            rule_map[key] = rule

    bundle_rankings = []
    for is_ in bundles_raw:
        itemset = is_["itemset"]
        key = "|".join(sorted(itemset))
        rule = rule_map.get(key)
        lift = rule["lift"] if rule else 1.0
        rank_score = is_["support"] * lift * (1 + 0.2 * (len(itemset) - 2))
        bundle_rankings.append({
            "items": itemset,
            "label": " + ".join(itemset[:2]) + (" Combo" if len(itemset) >= 3 else " Deal"),
            "support": is_["support"],
            "lift": round(lift, 4),
            "rank_score": round(rank_score, 6),
            "bundle_price": sum(price_map.get(i, 0) for i in itemset),
        })

    bundle_rankings.sort(key=lambda x: -x["rank_score"])

    return {
        "most_bought":    most_bought,
        "least_bought":   least_bought,
        "top_revenue":    top_revenue,
        "low_revenue":    low_revenue,
        "most_bought_bundles": bundle_rankings[:top_n],
    }


# ─── BUNDLE CARDS ─────────────────────────────────────────────────────────────

def build_bundle_cards(
    itemsets: List[Dict],
    rules: List[Dict],
    price_map: Dict[str, float],
    top_n: int = 12
) -> List[Dict]:
    """
    Build detailed bundle cards for the Bundles dashboard section.
    Each card includes all five metrics + recommended bundle price.
    """
    support_map = {"|".join(sorted(is_["itemset"])): is_["support"] for is_ in itemsets}
    rule_lookup = {}
    for rule in rules:
        key = "|".join(sorted(rule["antecedents"] + rule["consequents"]))
        if key not in rule_lookup or rule["score"] > rule_lookup[key]["score"]:
            rule_lookup[key] = rule

    multi_itemsets = [is_ for is_ in itemsets if 2 <= len(is_["itemset"]) <= 4]
    cards = []

    for is_ in multi_itemsets:
        itemset = is_["itemset"]
        key = "|".join(sorted(itemset))
        rule = rule_lookup.get(key)

        # Compute best confidence direction
        best_conf, best_lift = None, None
        for size in range(1, len(itemset)):
            for ant in combinations(itemset, size):
                ant_key = "|".join(sorted(ant))
                con = [i for i in itemset if i not in ant]
                con_key = "|".join(sorted(con))
                ant_s = support_map.get(ant_key)
                con_s = support_map.get(con_key)
                if ant_s and con_s:
                    c = is_["support"] / ant_s
                    if best_conf is None or c > best_conf:
                        best_conf = c
                        best_lift = c / con_s

        confidence = round(best_conf, 4) if best_conf else round(min(is_["support"] * 1.5, 1), 4)
        lift       = round(best_lift, 4) if best_lift else (round(rule["lift"], 4) if rule else 1.0)

        size_bonus  = 1 + 0.2 * (len(itemset) - 1)
        rank_score  = is_["support"] * size_bonus * lift
        full_price  = sum(price_map.get(i, 0) for i in itemset)
        discount    = min(0.08 + rank_score * 0.5, 0.15)
        save_amount = round(full_price * discount)

        sorted_by_price = sorted(itemset, key=lambda i: -price_map.get(i, 0))
        name = " + ".join(sorted_by_price[:2]) + (" Combo" if len(itemset) >= 3 else " Deal")

        cards.append({
            "name":       name,
            "items":      itemset,
            "size":       len(itemset),
            "support":    round(is_["support"], 4),
            "confidence": confidence,
            "lift":       lift,
            "leverage":   round(rule["leverage"], 5) if rule else round(is_["support"] * 0.1, 5),
            "conviction": round(min(rule["conviction"], 10), 3) if rule else round(1 + is_["support"], 3),
            "score":      round(rule["score"], 4) if rule else round(rank_score, 4),
            "full_price":    full_price,
            "bundle_price":  full_price - save_amount,
            "save":          save_amount,
            "rank_score":    round(rank_score, 6),
        })

    cards.sort(key=lambda x: -x["rank_score"])
    return cards[:top_n]


# ─── FBT WIDGET ───────────────────────────────────────────────────────────────

def build_fbt(rules: List[Dict], price_map: Dict[str, float], top_n: int = 5) -> Dict:
    """
    Build a "Frequently Bought Together" map: item → [list of recommended items].
    Used for product page widgets.
    """
    fbt: Dict[str, Dict[str, Dict]] = {}

    for rule in rules:
        for ant_item in rule["antecedents"]:
            if ant_item not in fbt:
                fbt[ant_item] = {}
            for con_item in rule["consequents"]:
                existing = fbt[ant_item].get(con_item)
                if not existing or rule["score"] > existing["score"]:
                    fbt[ant_item][con_item] = {
                        "item":       con_item,
                        "lift":       rule["lift"],
                        "confidence": rule["confidence"],
                        "score":      rule["score"],
                        "price":      price_map.get(con_item, 0),
                    }

    return {
        item: sorted(recs.values(), key=lambda x: -x["score"])[:top_n]
        for item, recs in fbt.items()
    }


# ─── CART CROSS-SELL ──────────────────────────────────────────────────────────

def build_cart_crosssell(
    rules: List[Dict],
    price_map: Dict[str, float],
    top_n: int = 5
) -> Dict:
    """
    Same as FBT but oriented for cart context: 'You have X → also buy Y'.
    Returns the same per-item mapping (reuses FBT logic with cart framing).
    """
    return build_fbt(rules, price_map, top_n)


# ─── PROMO GENERATOR ──────────────────────────────────────────────────────────

_ADD_ON_KW = ["fries", "drink", "sauce", "coffee", "soda", "cola", "juice",
              "water", "sundae", "pie", "soup", "tea", "coleslaw", "milkshake"]
_MAIN_KW   = ["burger", "chicken", "fish", "rice", "sandwich", "wrap",
              "steak", "meal", "nuggets"]


def build_promos(
    bundle_cards: List[Dict],
    itemsets: List[Dict],
    price_map: Dict[str, float]
) -> List[Dict]:
    """
    Generate actionable promo suggestions:
      - Bundle Discount (2-item combos)
      - Buy 2 Get 1 (3-item combos)
      - Add-On Prompt (upsell side items with main items)
      - Happy Hour (drive traffic on slow-selling items)
      - Volume Driver (push cheapest popular items)
    """
    promos = []
    seen   = set()

    for bundle in bundle_cards[:10]:
        items = bundle["items"]
        size  = bundle["size"]
        price = bundle["full_price"]
        save  = bundle["save"]
        score = bundle["score"]

        # Bundle Discount promo
        if size == 2 and save > 0:
            headline = f"Buy {items[0]} + {items[1]}"
            if headline not in seen:
                seen.add(headline)
                promos.append({
                    "type":     "bundle",
                    "label":    "Bundle Discount",
                    "headline": headline,
                    "detail":   f"Save ₱{save} — bundle price ₱{price - save} instead of ₱{price}.",
                    "save":     save,
                    "tag":      "High-lift combo",
                    "score":    score,
                })

        # Buy 2 Get 1
        if size == 3:
            cheapest = min(items, key=lambda i: price_map.get(i, 0))
            others   = [i for i in items if i != cheapest]
            headline = f"Buy 2 Get 1: {others[0]} + {others[1]}"
            if headline not in seen:
                seen.add(headline)
                promos.append({
                    "type":     "buy2get1",
                    "label":    "Buy 2 Get 1",
                    "headline": headline,
                    "detail":   f"Get {cheapest} FREE (worth ₱{price_map.get(cheapest, 0)}) when you buy the other items.",
                    "save":     price_map.get(cheapest, 0),
                    "tag":      "3-item strong set",
                    "score":    score,
                })

        # Add-On Prompt
        for item in items:
            lower = item.lower()
            if any(kw in lower for kw in _MAIN_KW):
                for kw in _ADD_ON_KW:
                    if kw not in lower:
                        addon = next(
                            (k for k in price_map if kw in k.lower() and k not in items), None
                        )
                        if addon:
                            headline = f"Add {addon} to your order"
                            if headline not in seen:
                                seen.add(headline)
                                promos.append({
                                    "type":     "addon",
                                    "label":    "Add-On Prompt",
                                    "headline": headline,
                                    "detail":   f"Pairs perfectly with {item}! Only ₱{price_map[addon]}.",
                                    "save":     0,
                                    "tag":      "Upsell opportunity",
                                    "score":    score * 0.8,
                                })
                        break
                break

    # Happy Hour promo for slow-selling drinks
    drinks = [k for k in price_map if any(kw in k.lower() for kw in _ADD_ON_KW)][:3]
    if drinks:
        headline = f"Happy Hour: {drinks[0]} 20% Off"
        if headline not in seen:
            seen.add(headline)
            promos.append({
                "type":     "happy-hour",
                "label":    "Happy Hour",
                "headline": headline,
                "detail":   f"Boost slow hours with a limited-time discount on {drinks[0]}.",
                "save":     0,
                "tag":      "Traffic booster",
                "score":    0.05,
            })

    # Volume Driver for cheap items
    cheap = sorted([k for k in price_map if price_map[k] > 0], key=lambda k: price_map[k])[:2]
    if len(cheap) >= 1:
        headline = f"Buy 2 {cheap[0]}, Get 1 Free"
        if headline not in seen:
            seen.add(headline)
            promos.append({
                "type":     "buy2get1",
                "label":    "Volume Driver",
                "headline": headline,
                "detail":   "Popular low-cost item — great for increasing average basket size!",
                "save":     price_map.get(cheap[0], 0),
                "tag":      "Volume driver",
                "score":    0.04,
            })

    return sorted(promos, key=lambda x: -x["score"])[:12]


# ─── BUSINESS INSIGHTS ────────────────────────────────────────────────────────

def build_business_insights(
    most_bought: List[Dict],
    least_bought: List[Dict],
    bundle_cards: List[Dict],
    rules: List[Dict],
    price_map: Dict[str, float],
) -> List[Dict]:
    """
    Generate plain-language business insights for the owner/admin.
    Categories: upsell, weak-item-recovery, menu-bundling, pricing-aware.
    """
    insights = []

    # Upsell: high-lift rules
    top_rules = sorted(rules, key=lambda r: -r["lift"])[:5]
    for rule in top_rules:
        ant = ", ".join(rule["antecedents"])
        con = ", ".join(rule["consequents"])
        insights.append({
            "category": "upsell",
            "icon":     "📈",
            "title":    f"Upsell {con} with {ant}",
            "body":     (
                f"Customers buying {ant} buy {con} {round(rule['confidence']*100)}% of the time "
                f"(lift = {rule['lift']:.2f}×). Train staff to suggest this pairing."
            ),
            "priority": "high" if rule["lift"] > 2 else "medium",
        })

    # Weak item recovery
    for item_data in least_bought[:5]:
        item = item_data["item"]
        price = price_map.get(item, 0)
        insights.append({
            "category": "weak-item-recovery",
            "icon":     "⚠️",
            "title":    f"Boost sales of {item}",
            "body":     (
                f"{item} appears in only {item_data['frequency']} transactions. "
                f"Consider bundling with a popular item or offering a limited-time discount."
            ),
            "priority": "medium",
        })

    # Menu bundling
    for card in bundle_cards[:5]:
        insights.append({
            "category": "menu-bundling",
            "icon":     "🍔",
            "title":    f"Add '{card['name']}' to the combo menu",
            "body":     (
                f"This {card['size']}-item combo appears in {round(card['support']*100, 1)}% of "
                f"transactions with lift {card['lift']}×. Formalizing it as a named combo could "
                f"increase ticket size by ₱{card['save']} per transaction."
            ),
            "priority": "high" if card["lift"] > 1.5 else "medium",
        })

    # Top item revenue potential
    if most_bought:
        top = most_bought[0]
        revenue_est = top["frequency"] * price_map.get(top["item"], 0)
        insights.append({
            "category": "pricing-aware",
            "icon":     "💰",
            "title":    f"{top['item']} is your revenue anchor",
            "body":     (
                f"Your best-selling item drives an estimated ₱{revenue_est:,.0f} in sales across "
                f"recorded transactions. Protect its availability and consider featuring it prominently."
            ),
            "priority": "high",
        })

    return insights
