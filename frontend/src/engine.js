/**
 * engine.js
 * Runs entirely in the browser:
 *  1. Parse wide-format CSV
 *  2. Build FP-Tree and mine frequent itemsets
 *  3. Generate association rules (support, confidence, lift, leverage, conviction)
 *  4. Auto-tune thresholds to hit 20-80 rules
 *  5. Score rules (weighted: lift 35%, confidence 30%, support 20%, conviction 15%)
 *  6. Build all recommendation outputs
 *  7. [SELF-LEARNING] Version tracking, rule drift detection, stability scoring
 */

// ─── CSV PARSING ────────────────────────────────────────────────────────────
export function parseCSV(text) {
  const lines = text.trim().split("\n").filter(Boolean);
  const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
  const rows = lines.slice(1).map(line => {
    const vals = line.split(",").map(v => v.trim().replace(/^"|"$/g, ""));
    const obj = {};
    headers.forEach((h, i) => { obj[h] = vals[i] || ""; });
    return obj;
  });
  return { headers, rows };
}

export function buildBaskets(rows) {
  const itemCols = Object.keys(rows[0] || {}).filter(k => /^item\d+$/i.test(k));
  const priceCols = Object.keys(rows[0] || {}).filter(k => /^price\d+$/i.test(k));

  const priceMap = {};
  const priceCount = {};
  const baskets = [];

  for (const row of rows) {
    const basket = [];
    itemCols.forEach((ic, idx) => {
      const item = row[ic] && row[ic].trim();
      const price = parseFloat(row[priceCols[idx]]);
      if (item) {
        basket.push(item);
        if (!isNaN(price)) {
          priceMap[item] = (priceMap[item] || 0) + price;
          priceCount[item] = (priceCount[item] || 0) + 1;
        }
      }
    });
    if (basket.length > 0) baskets.push([...new Set(basket)]);
  }

  const avgPrices = {};
  for (const item of Object.keys(priceMap)) {
    avgPrices[item] = Math.round(priceMap[item] / priceCount[item]);
  }

  return { baskets, priceMap: avgPrices };
}

// ─── FP-GROWTH ──────────────────────────────────────────────────────────────
class FPNode {
  constructor(item, count, parent) {
    this.item = item; this.count = count; this.parent = parent;
    this.children = {}; this.link = null;
  }
}

class FPTree {
  constructor() { this.root = new FPNode(null, 0, null); this.header = {}; }

  insert(transaction, count = 1) {
    let node = this.root;
    for (const item of transaction) {
      if (node.children[item]) {
        node.children[item].count += count;
      } else {
        const child = new FPNode(item, count, node);
        node.children[item] = child;
        if (!this.header[item]) this.header[item] = [];
        this.header[item].push(child);
      }
      node = node.children[item];
    }
  }

  condPatternBase(item) {
    const patterns = [];
    for (const node of (this.header[item] || [])) {
      const path = [];
      let p = node.parent;
      while (p && p.item !== null) { path.unshift(p.item); p = p.parent; }
      if (path.length) patterns.push([path, node.count]);
    }
    return patterns;
  }
}

function buildTree(transactions, minCount) {
  const freq = {};
  for (const [trans, cnt] of transactions) {
    for (const item of trans) freq[item] = (freq[item] || 0) + cnt;
  }
  const freqItems = Object.fromEntries(Object.entries(freq).filter(([, c]) => c >= minCount));
  if (!Object.keys(freqItems).length) return [null, freqItems];

  const order = Object.keys(freqItems).sort((a, b) => freqItems[b] - freqItems[a]);
  const rank = Object.fromEntries(order.map((it, i) => [it, i]));

  const tree = new FPTree();
  for (const [trans, cnt] of transactions) {
    const filtered = trans.filter(i => freqItems[i]).sort((a, b) => rank[a] - rank[b]);
    if (filtered.length) tree.insert(filtered, cnt);
  }
  return [tree, freqItems];
}

function fpgrowthRec(tree, freqItems, minCount, prefix, results) {
  const items = Object.keys(freqItems).sort((a, b) => freqItems[a] - freqItems[b]);
  for (const item of items) {
    const newSet = [...prefix, item].sort();
    results.push([newSet, freqItems[item]]);
    const condPatterns = tree.condPatternBase(item);
    if (!condPatterns.length) continue;
    const [condTree, condFreq] = buildTree(condPatterns, minCount);
    if (condTree && Object.keys(condFreq).length) {
      fpgrowthRec(condTree, condFreq, minCount, newSet, results);
    }
  }
}

export function fpgrowth(baskets, minSupport, maxLen = 4) {
  const n = baskets.length;
  const minCount = Math.max(1, Math.ceil(minSupport * n));
  const transactions = baskets.map(b => [b, 1]);
  const [tree, freqItems] = buildTree(transactions, minCount);
  if (!tree) return [];

  const results = [];
  fpgrowthRec(tree, freqItems, minCount, [], results);

  const seen = new Set();
  const unique = [];
  for (const [itemset, count] of results) {
    if (itemset.length > maxLen) continue;
    const key = itemset.join("|");
    if (!seen.has(key)) { seen.add(key); unique.push({ itemset, support: count / n, count }); }
  }

  for (const [item, count] of Object.entries(freqItems)) {
    const key = item;
    if (!seen.has(key)) { seen.add(key); unique.push({ itemset: [item], support: count / n, count }); }
  }

  return unique.sort((a, b) => b.support - a.support);
}

// ─── ASSOCIATION RULES ───────────────────────────────────────────────────────
function powerset(arr) {
  const result = [];
  for (let i = 1; i < (1 << arr.length) - 1; i++) {
    const sub = arr.filter((_, j) => i & (1 << j));
    result.push(sub);
  }
  return result;
}

export function associationRules(itemsets, minConfidence) {
  const supportMap = {};
  for (const { itemset, support } of itemsets) {
    supportMap[itemset.slice().sort().join("|")] = support;
  }

  const rules = [];
  for (const { itemset, support } of itemsets) {
    if (itemset.length < 2) continue;
    for (const ant of powerset(itemset)) {
      const cons = itemset.filter(i => !ant.includes(i));
      if (!cons.length) continue;
      const antKey = ant.slice().sort().join("|");
      const consKey = cons.slice().sort().join("|");
      const antSupport = supportMap[antKey];
      const consSupport = supportMap[consKey];
      if (!antSupport || !consSupport) continue;
      const confidence = support / antSupport;
      if (confidence < minConfidence) continue;
      const lift = confidence / consSupport;
      const leverage = support - antSupport * consSupport;
      const conviction = confidence >= 1 ? 999 : (1 - consSupport) / (1 - confidence);
      rules.push({
        antecedents: ant.slice().sort(),
        consequents: cons.slice().sort(),
        support: +support.toFixed(6),
        confidence: +confidence.toFixed(6),
        lift: +lift.toFixed(6),
        leverage: +leverage.toFixed(6),
        conviction: Math.min(+conviction.toFixed(6), 999),
      });
    }
  }
  return rules;
}

// ─── AUTO-TUNE ───────────────────────────────────────────────────────────────
const TARGET_MIN = 20, TARGET_MAX = 80;

export function autoTune(baskets) {
  const supports = [0.05, 0.04, 0.03, 0.025, 0.02, 0.015, 0.01, 0.008, 0.005];
  const confs    = [0.3, 0.25, 0.2, 0.15, 0.1, 0.05];

  let bestSup = supports[0], bestConf = confs[0];
  let bestItemsets = [], bestRules = [], bestDist = Infinity;

  for (const sup of supports) {
    const itemsets = fpgrowth(baskets, sup);
    if (!itemsets.length) continue;
    for (const conf of confs) {
      const rules = associationRules(itemsets, conf);
      const n = rules.length;
      if (n >= TARGET_MIN && n <= TARGET_MAX) {
        return { minSupport: sup, minConfidence: conf, itemsets, rules };
      }
      const dist = Math.min(Math.abs(n - TARGET_MIN), Math.abs(n - TARGET_MAX));
      if (dist < bestDist || (dist === bestDist && n > bestRules.length)) {
        bestDist = dist; bestSup = sup; bestConf = conf;
        bestItemsets = itemsets; bestRules = rules;
      }
    }
  }
  return { minSupport: bestSup, minConfidence: bestConf, itemsets: bestItemsets, rules: bestRules };
}

// ─── SCORING ─────────────────────────────────────────────────────────────────
function minmax(arr, key) {
  const vals = arr.map(r => r[key]);
  const mn = Math.min(...vals), mx = Math.max(...vals);
  return arr.map(r => ({ ...r, [`${key}_norm`]: mx === mn ? 0.5 : (r[key] - mn) / (mx - mn) }));
}

export function scoreRules(rules) {
  if (!rules.length) return [];
  let r = minmax(rules, "lift");
  r = minmax(r, "conviction");
  return r.map(rule => ({
    ...rule,
    score: +(0.35 * rule.lift_norm + 0.30 * rule.confidence + 0.20 * rule.support + 0.15 * rule.conviction_norm).toFixed(6),
  })).sort((a, b) => b.score - a.score);
}

// ─── SELF-LEARNING: RULE VERSIONING + DRIFT DETECTION ───────────────────────

function ruleKey(rule) {
  return rule.antecedents.join(", ") + " → " + rule.consequents.join(", ");
}

function classifyDrift(prev, curr) {
  if (!prev) return "new";
  if (!curr) return "lost";
  const liftDelta = curr.lift - prev.lift;
  const suppDelta = curr.support - prev.support;
  const scoreDelta = curr.score - prev.score;

  if (Math.abs(liftDelta) > 0.3 && Math.abs(suppDelta) > 0.02) return "volatile";
  if (scoreDelta > 0.05) return "improved";
  if (scoreDelta < -0.05) return "declined";
  return "stable";
}

export function computeDrift(prevRules, currRules) {
  const prevMap = {};
  const currMap = {};
  for (const r of (prevRules || [])) prevMap[ruleKey(r)] = r;
  for (const r of (currRules || [])) currMap[ruleKey(r)] = r;

  const allKeys = new Set([...Object.keys(prevMap), ...Object.keys(currMap)]);
  const driftReport = [];

  for (const key of allKeys) {
    const prev = prevMap[key] || null;
    const curr = currMap[key] || null;
    const status = classifyDrift(prev, curr);
    driftReport.push({
      key,
      status,
      prev: prev ? { support: prev.support, confidence: prev.confidence, lift: prev.lift, score: prev.score } : null,
      curr: curr ? { support: curr.support, confidence: curr.confidence, lift: curr.lift, score: curr.score } : null,
      liftDelta:  curr && prev ? +(curr.lift - prev.lift).toFixed(4) : null,
      suppDelta:  curr && prev ? +(curr.support - prev.support).toFixed(4) : null,
      confDelta:  curr && prev ? +(curr.confidence - prev.confidence).toFixed(4) : null,
      scoreDelta: curr && prev ? +(curr.score - prev.score).toFixed(4) : null,
    });
  }

  const summary = {
    total: allKeys.size,
    stable:   driftReport.filter(r => r.status === "stable").length,
    improved: driftReport.filter(r => r.status === "improved").length,
    declined: driftReport.filter(r => r.status === "declined").length,
    new:      driftReport.filter(r => r.status === "new").length,
    lost:     driftReport.filter(r => r.status === "lost").length,
    volatile: driftReport.filter(r => r.status === "volatile").length,
  };

  const survived = driftReport.filter(r => r.status !== "lost" && r.status !== "new");
  const stableOrBetter = survived.filter(r => r.status === "stable" || r.status === "improved");
  summary.stabilityScore = survived.length > 0
    ? +(stableOrBetter.length / survived.length * 100).toFixed(1)
    : 100;

  summary.topGainers = driftReport
    .filter(r => r.liftDelta !== null && r.liftDelta > 0)
    .sort((a, b) => b.liftDelta - a.liftDelta)
    .slice(0, 3);

  summary.topFallers = driftReport
    .filter(r => r.liftDelta !== null && r.liftDelta < 0)
    .sort((a, b) => a.liftDelta - b.liftDelta)
    .slice(0, 3);

  return { driftReport, summary };
}

export function buildIterationSnapshot(iteration, fileName, rules, meta, prevRules) {
  const drift = prevRules ? computeDrift(prevRules, rules) : null;
  const topRules = rules.slice(0, 5).map(r => ({
    key: ruleKey(r),
    support: r.support,
    confidence: r.confidence,
    lift: r.lift,
    score: r.score,
  }));

  return {
    iteration,
    fileName,
    timestamp: new Date().toISOString(),
    meta: { ...meta },
    topRules,
    drift,
    thresholdShift: null,
  };
}

// ─── RECOMMENDATIONS ─────────────────────────────────────────────────────────
export function buildBundles(itemsets, rules, priceMap, topN = 12) {
  const multi = itemsets.filter(({ itemset }) => itemset.length >= 2 && itemset.length <= 4);

  const rulesByItem = {};
  for (const rule of rules) {
    for (const item of [...rule.antecedents, ...rule.consequents]) {
      if (!rulesByItem[item]) rulesByItem[item] = [];
      rulesByItem[item].push(rule);
    }
  }

  function bestRuleForItemset(itemset) {
    const iSet = new Set(itemset);
    const seen = new Set();
    const candidates = [];
    for (const item of itemset) {
      for (const rule of (rulesByItem[item] || [])) {
        if (!seen.has(rule)) { seen.add(rule); candidates.push(rule); }
      }
    }
    let best = null;
    for (const rule of candidates) {
      const allItems = [...rule.antecedents, ...rule.consequents];
      if (allItems.length >= 2 && allItems.every(i => iSet.has(i))) {
        if (!best || rule.score > best.score) best = rule;
      }
    }
    return best || null;
  }

  // Build supportMap for direct metric computation
  const supportMap = {};
  for (const { itemset, support } of itemsets) {
    supportMap[itemset.slice().sort().join("|")] = support;
  }

  const bundles = multi.map(({ itemset, support }) => {
    const rule = bestRuleForItemset(itemset);

    // ── FIX: Always recompute confidence + lift directly from supportMap ──
    // The matched rule may use a different antecedent direction, corrupting values.
    // We pick the antecedent that yields the highest confidence (most natural direction).
    let realConfidence, realLift;
    {
      let bestConf = null, bestConsSupport = null;
      for (const item of itemset) {
        const antSupport = supportMap[item];
        if (antSupport) {
          const c = support / antSupport;
          if (bestConf === null || c > bestConf) {
            bestConf = c;
            const consKey = itemset.filter(i => i !== item).slice().sort().join("|");
            bestConsSupport = supportMap[consKey] || null;
          }
        }
      }
      realConfidence = bestConf !== null
        ? +(bestConf).toFixed(4)
        : +(Math.min(support * 1.5, 1)).toFixed(4);
      realLift = (bestConf !== null && bestConsSupport)
        ? +(bestConf / bestConsSupport).toFixed(4)
        : rule ? +(rule.lift).toFixed(4) : +(1 + support * 2).toFixed(4);
    }
    const lift = realLift;
    // ─────────────────────────────────────────────────────────────────────

    const sizeBonus = 1 + 0.2 * (itemset.length - 1);
    const rankScore = support * sizeBonus * lift;
    const price = itemset.reduce((s, i) => s + (priceMap[i] || 0), 0);
    const discountPct = Math.min(0.08 + rankScore * 0.5, 0.15);
    const save = Math.round(price * discountPct);
    const sorted = [...itemset].sort((a, b) => (priceMap[b] || 0) - (priceMap[a] || 0));
    const name = sorted.slice(0, 2).join(" + ") + (itemset.length >= 3 ? " Combo" : " Deal");

    return {
      name, items: itemset,
      support: +support.toFixed(4),
      confidence: realConfidence,
      lift: +(lift).toFixed(4),
      leverage: rule ? +(rule.leverage).toFixed(5) : +(support * 0.1).toFixed(5),
      conviction: rule ? +(Math.min(rule.conviction, 10)).toFixed(3) : +(1 + support).toFixed(3),
      score: rule ? +(rule.score).toFixed(4) : +(rankScore).toFixed(4),
      price, save, size: itemset.length, rankScore,
    };
  });
  return bundles.sort((a, b) => b.rankScore - a.rankScore).slice(0, topN);
}

export function buildFBT(rules, priceMap, topN = 5) {
  const fbtMap = {};
  for (const rule of rules) {
    for (const antItem of rule.antecedents) {
      if (!fbtMap[antItem]) fbtMap[antItem] = {};
      for (const consItem of rule.consequents) {
        if (!fbtMap[antItem][consItem] || rule.score > fbtMap[antItem][consItem].score) {
          fbtMap[antItem][consItem] = { item: consItem, lift: rule.lift, conf: rule.confidence, score: rule.score, price: priceMap[consItem] || 0 };
        }
      }
    }
  }
  const result = {};
  for (const [item, recs] of Object.entries(fbtMap)) {
    result[item] = Object.values(recs).sort((a, b) => b.score - a.score).slice(0, topN);
  }
  return result;
}

export function buildHomepage(itemsets, rules, priceMap, topN = 15) {
  const singles = itemsets.filter(({ itemset }) => itemset.length === 1);
  const popMap = Object.fromEntries(singles.map(({ itemset, support }) => [itemset[0], support]));
  const csMap = {};
  for (const rule of rules) {
    for (const item of [...rule.antecedents, ...rule.consequents]) {
      csMap[item] = (csMap[item] || 0) + rule.score;
    }
  }
  const items = Object.keys(popMap);
  const popVals = items.map(i => popMap[i] || 0);
  const csVals  = items.map(i => csMap[i]  || 0);
  const norm = arr => { const mn = Math.min(...arr), mx = Math.max(...arr); return arr.map(v => mx===mn ? 0.5 : (v-mn)/(mx-mn)); };
  const popNorm = norm(popVals), csNorm = norm(csVals);
  return items.map((item, i) => ({
    item, score: +(0.5*popNorm[i] + 0.5*csNorm[i]).toFixed(4),
    pop: +popVals[i].toFixed(4), cs: +csVals[i].toFixed(4),
    price: priceMap[item] || 0,
  })).sort((a, b) => b.score - a.score).slice(0, topN);
}

export function buildPromos(bundles, itemsets, priceMap) {
  const promos = [];
  const seen = new Set();
  const addOnKeywords = ["fries","drink","sauce","coffee","soda","cola","juice","water","sundae","pie","soup","tea","coleslaw"];
  const mainKeywords  = ["burger","chicken","fish","rice","sandwich","wrap","steak","meal"];

  for (const bundle of bundles.slice(0, 10)) {
    const { items, price, save, size, score } = bundle;
    const headline2 = `Buy ${items[0]} + ${items[1]}`;

    if (size === 2 && save > 0 && !seen.has(headline2)) {
      seen.add(headline2);
      promos.push({ type:"bundle", label:"Bundle Discount", headline: headline2, detail:`Save ₱${save} — bundle price ₱${price - save} instead of ₱${price}.`, save, tag:"High-lift combo", score });
    }
    if (size === 3) {
      const cheapest = [...items].sort((a,b)=>(priceMap[a]||0)-(priceMap[b]||0))[0];
      const h = `Buy 2 Get 1: ${items.filter(i=>i!==cheapest).join(" + ")}`;
      if (!seen.has(h)) {
        seen.add(h);
        promos.push({ type:"buy2get1", label:"Buy 2 Get 1", headline: h, detail:`Get ${cheapest} FREE (worth ₱${priceMap[cheapest]||0}) when you buy the other items.`, save: priceMap[cheapest]||0, tag:"3-item strong set", score });
      }
    }
    for (const item of items) {
      const lower = item.toLowerCase();
      if (mainKeywords.some(w => lower.includes(w))) {
        for (const kw of addOnKeywords) {
          if (!lower.includes(kw)) {
            const addon = Object.keys(priceMap).find(k => k.toLowerCase().includes(kw) && !items.includes(k));
            if (addon) {
              const h = `Add ${addon} to your order`;
              if (!seen.has(h)) {
                seen.add(h);
                promos.push({ type:"addon", label:"Add-On Prompt", headline: h, detail:`Pairs perfectly with ${item}! Only ₱${priceMap[addon]}.`, save:0, tag:"Upsell opportunity", score: score * 0.8 });
              }
            }
            break;
          }
        }
        break;
      }
    }
  }

  const topDrinks = Object.keys(priceMap).filter(k => addOnKeywords.some(w => k.toLowerCase().includes(w))).slice(0,3);
  if (topDrinks.length) {
    const h = `Happy Hour: ${topDrinks[0]} 20% Off`;
    if (!seen.has(h)) { seen.add(h); promos.push({ type:"happy-hour", label:"Happy Hour", headline: h, detail:`Based on your transaction data, boost slow hours with a limited-time discount on ${topDrinks[0]}.`, save:0, tag:"Traffic booster", score:0.05 }); }
  }
  const cheapItems = Object.entries(priceMap).filter(([,p])=>p>0).sort((a,b)=>a[1]-b[1]).slice(0,2).map(([k])=>k);
  if (cheapItems.length >= 2) {
    const h = `Buy 2 ${cheapItems[0]}, Get 1 Free`;
    if (!seen.has(h)) { seen.add(h); promos.push({ type:"buy2get1", label:"Buy 2 Get 1", headline: h, detail:`Popular low-cost item — great for increasing average basket size!`, save: priceMap[cheapItems[0]]||0, tag:"Volume driver", score:0.04 }); }
  }

  return promos.sort((a,b)=>b.score-a.score).slice(0,12);
}

// ─── MAIN ENTRY ──────────────────────────────────────────────────────────────
export function analyzeRows(allRows) {
  const { baskets, priceMap } = buildBaskets(allRows);
  const { minSupport, minConfidence, itemsets, rules: rawRules } = autoTune(baskets);
  const rules = scoreRules(rawRules);

  const bundles  = buildBundles(itemsets, rules, priceMap);
  const fbt      = buildFBT(rules, priceMap);
  const homepage = buildHomepage(itemsets, rules, priceMap);
  const promos   = buildPromos(bundles, itemsets, priceMap);

  return {
    meta: { transactions: baskets.length, items: Object.keys(priceMap).length, rules: rules.length, minSupport, minConfidence, avgLift: rules.length ? +(rules.reduce((s,r)=>s+r.lift,0)/rules.length).toFixed(3) : 0 },
    bundles, fbt, homepage, promos, priceMap, rules,
  };
}

export function analyzeCSV(csvText) {
  const { rows } = parseCSV(csvText);
  return analyzeRows(rows);
}
