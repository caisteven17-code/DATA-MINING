"""
preprocessor.py
===============
Data ingestion and cleaning pipeline for Byteme transaction CSV files.

Expected CSV format:
  transaction_id, datetime,
  item1, price1, item2, price2, ..., item10, price10

The pipeline:
  1. Validate column structure
  2. Clean and normalize item names (strip whitespace, title-case)
  3. Parse prices and compute per-item average prices
  4. Build basket representation (list of unique items per transaction)
  5. Filter out empty / malformed rows
  6. Return structured data ready for mining
"""

import csv
import io
import re
from collections import defaultdict
from datetime import datetime
from typing import List, Dict, Tuple, Optional
import logging

logger = logging.getLogger("byteme.preprocessor")


# ─── VALIDATION ──────────────────────────────────────────────────────────────

REQUIRED_COLS = {"transaction_id", "datetime"}


def validate_headers(headers: List[str]) -> Tuple[bool, str]:
    """Check that the CSV has the expected wide-format structure."""
    headers_lower = {h.lower().strip() for h in headers}

    missing = REQUIRED_COLS - headers_lower
    if missing:
        return False, f"Missing required columns: {missing}"

    # Expect at least item1
    item_cols  = [h for h in headers if re.match(r'^item\d+$',  h.strip(), re.IGNORECASE)]
    price_cols = [h for h in headers if re.match(r'^price\d+$', h.strip(), re.IGNORECASE)]

    if not item_cols:
        return False, "No item columns found (expected item1, item2, ...)"
    
    # Allow CSVs without price columns (for market basket analysis without pricing)
    if price_cols and len(item_cols) != len(price_cols):
        return False, f"Mismatch: {len(item_cols)} item cols vs {len(price_cols)} price cols"

    return True, "OK"


# ─── PARSING ──────────────────────────────────────────────────────────────────

def _clean_item_name(name: str) -> str:
    """Normalize item name: strip whitespace, collapse internal spaces."""
    if not name:
        return ""
    cleaned = re.sub(r'\s+', ' ', name.strip())
    return cleaned  # preserve original casing (menu items have mixed case)


def _parse_price(value: str) -> Optional[float]:
    """Parse a price string to float, return None on failure."""
    try:
        price = float(value.strip())
        return price if price >= 0 else None
    except (ValueError, AttributeError):
        return None


def _is_effectively_empty_row(row: Dict) -> bool:
    """Treat rows with only blank values as empty noise rows."""
    for v in row.values():
        if (v or "").strip():
            return False
    return True


def parse_csv_to_rows(csv_text: str) -> Tuple[bool, str, List[Dict]]:
    """
    Parse raw CSV text into a list of row dicts.
    Returns (success, message, rows).
    """
    try:
        reader = csv.DictReader(io.StringIO(csv_text.strip()))
        headers = reader.fieldnames or []
        ok, msg = validate_headers(list(headers))
        if not ok:
            return False, msg, []

        rows = [dict(row) for row in reader]
        rows = [row for row in rows if not _is_effectively_empty_row(row)]
        if not rows:
            return False, "CSV has no data rows.", []

        return True, f"Parsed {len(rows)} rows.", rows
    except Exception as e:
        logger.error(f"CSV parsing error: {e}")
        return False, f"CSV parsing error: {e}", []


def build_baskets(rows: List[Dict]) -> Dict:
    """
    Transform wide-format rows into basket format.
    
    Returns:
      baskets:    List[List[str]] - one list of items per transaction
      price_map:  Dict[str, float] - average price per item across all transactions
      item_freq:  Dict[str, int]   - how many transactions contain each item
      meta:       Dict             - summary statistics
      skipped:    int              - count of empty/invalid rows dropped
    """
    # Discover item/price column pairs
    all_keys  = list(rows[0].keys()) if rows else []
    item_cols  = sorted([k for k in all_keys if re.match(r'^item\d+$',  k, re.IGNORECASE)],
                        key=lambda k: int(re.search(r'\d+', k).group()))
    price_cols = sorted([k for k in all_keys if re.match(r'^price\d+$', k, re.IGNORECASE)],
                        key=lambda k: int(re.search(r'\d+', k).group()))

    price_totals: Dict[str, float] = defaultdict(float)
    price_counts: Dict[str, int]   = defaultdict(int)
    item_freq:    Dict[str, int]   = defaultdict(int)
    baskets: List[List[str]] = []
    skipped = 0
    dates: List[datetime] = []

    for row in rows:
        # Parse transaction date
        try:
            dt_str = row.get("datetime", "").strip()
            if dt_str:
                dates.append(datetime.fromisoformat(dt_str))
        except ValueError:
            pass

        basket = []
        if price_cols:
            # CSV has prices
            for ic, pc in zip(item_cols, price_cols):
                item  = _clean_item_name(row.get(ic, ""))
                price = _parse_price(row.get(pc, ""))

                if not item:
                    continue  # blank slot — normal for short baskets

                basket.append(item)
                if price is not None:
                    price_totals[item] += price
                    price_counts[item] += 1
        else:
            # CSV without prices (market basket only)
            for ic in item_cols:
                item = _clean_item_name(row.get(ic, ""))
                if item:
                    basket.append(item)
                    # No price data available
                    if item not in price_totals:
                        price_totals[item] = 0.0
                        price_counts[item] = 0

        # Deduplicate within basket
        unique_basket = list(dict.fromkeys(basket))

        if not unique_basket:
            skipped += 1
            continue

        baskets.append(unique_basket)
        for item in unique_basket:
            item_freq[item] += 1

    # Average prices (skip items with no price data)
    price_map = {
        item: round(price_totals[item] / price_counts[item], 2) if price_counts[item] > 0 else 0.0
        for item in price_totals
    }

    meta = {
        "total_rows":   len(rows),
        "baskets":      len(baskets),
        "skipped":      skipped,
        "unique_items": len(item_freq),
        "avg_basket_size": (
            round(sum(len(b) for b in baskets) / len(baskets), 2) if baskets else 0
        ),
        "date_range": {
            "earliest": min(dates).isoformat() if dates else None,
            "latest":   max(dates).isoformat() if dates else None,
        },
    }

    return {
        "baskets":   baskets,
        "price_map": price_map,
        "item_freq": dict(item_freq),
        "meta":      meta,
        "skipped":   skipped,
    }


def clean_rows_for_storage(rows: List[Dict]) -> List[Dict]:
    """
    Normalize parsed rows into canonical wide-format records for durable storage.
    Output shape remains compatible with build_baskets().
    """
    if not rows:
        return []

    all_keys = list(rows[0].keys())
    item_cols = sorted(
        [k for k in all_keys if re.match(r"^item\d+$", k, re.IGNORECASE)],
        key=lambda k: int(re.search(r"\d+", k).group()),
    )
    price_cols = sorted(
        [k for k in all_keys if re.match(r"^price\d+$", k, re.IGNORECASE)],
        key=lambda k: int(re.search(r"\d+", k).group()),
    )
    has_prices = bool(price_cols)

    cleaned_rows: List[Dict] = []
    for row in rows:
        cleaned_items = []
        cleaned_prices = []

        if has_prices:
            for ic, pc in zip(item_cols, price_cols):
                item = _clean_item_name(row.get(ic, ""))
                if not item:
                    continue
                price = _parse_price(row.get(pc, ""))
                cleaned_items.append(item)
                cleaned_prices.append(price)
        else:
            for ic in item_cols:
                item = _clean_item_name(row.get(ic, ""))
                if item:
                    cleaned_items.append(item)

        unique_items = list(dict.fromkeys(cleaned_items))
        if not unique_items:
            continue

        canonical = {
            "transaction_id": (row.get("transaction_id") or "").strip(),
            "datetime": (row.get("datetime") or "").strip(),
        }

        if has_prices:
            unique_with_price = {}
            for item, price in zip(cleaned_items, cleaned_prices):
                if item not in unique_with_price:
                    unique_with_price[item] = price
            for i, item in enumerate(unique_items, start=1):
                canonical[f"item{i}"] = item
                price = unique_with_price.get(item)
                canonical[f"price{i}"] = f"{price}" if price is not None else ""
        else:
            for i, item in enumerate(unique_items, start=1):
                canonical[f"item{i}"] = item

        cleaned_rows.append(canonical)

    return cleaned_rows
