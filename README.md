# 🍔 Byteme — Self-Learning Market Basket Analysis System
> *"isang kagat, busog agad!"*

A complete, production-grade **Market Basket Analysis (MBA)** system for Byteme fast food. Built with **Python** as the core engine, **FastAPI** as the backend, and **React (Vite)** as the dashboard frontend. Uses **FP-Growth** for mining and includes **self-learning drift detection** across multiple CSV upload iterations.

---

## 📁 Project Structure

```
byteme/
├── backend/
│   ├── main.py                     ← FastAPI app entry point
│   ├── api/
│   │   └── pipeline.py             ← Pipeline orchestrator
│   ├── core/
│   │   ├── preprocessor.py         ← CSV parsing & basket building
│   │   ├── mining_engine.py        ← FP-Growth + auto-threshold tuning
│   │   ├── scoring_engine.py       ← Rule scoring + drift detection
│   │   └── recommender.py          ← Business recommendation generation
│   ├── db/
│   │   └── database.py             ← Supabase storage layer
│   └── utils/
├── frontend/
│   ├── src/
│   │   ├── App.jsx                 ← Complete React dashboard
│   │   ├── main.jsx                ← React entry point
│   │   ├── api.js                  ← HTTP client for backend
│   │   └── engine.js               ← Browser-side FP-Growth (offline mode)
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
├── data/
├── uploads/                        ← Saved CSV uploads
├── logs/                           ← Application logs
├── schema.sql                      ← Database schema reference
├── requirements.txt
└── README.md  (this file)
```

---

## ⚙️ Tech Stack

| Layer        | Technology                     | Role                                  |
|--------------|-------------------------------|---------------------------------------|
| Core Engine  | **Python 3.10+**              | FP-Growth, scoring, recommendations   |
| Backend      | **FastAPI + Uvicorn**         | REST API, file upload, data serving   |
| Database     | **Supabase (PostgreSQL)**       | Versioned iteration/rule storage      |
| Frontend     | **React 18 + Vite**           | Interactive analytics dashboard       |
| Browser Mode | **engine.js (FP-Growth JS)**  | Offline fallback — runs in browser    |

---

## 🚀 How to Run

### 1. Clone / extract the project

```bash
cd byteme/
```

### 2. Install Python dependencies

```bash
pip install -r requirements.txt
```

### 3. Create Supabase tables

Run `schema.sql` in your Supabase project's SQL Editor.

### 4. Configure environment variables

Set these variables before starting the backend:

```bash
SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
SUPABASE_KEY=YOUR_SUPABASE_ANON_OR_SERVICE_ROLE_KEY
# or:
# SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY
```

### 5. Start the Python backend

```bash
uvicorn backend.main:app --reload --port 8000
```

The API will be available at `http://localhost:8000`  
API docs (Swagger UI) at `http://localhost:8000/docs`

### 6. Start the React frontend

```bash
cd frontend/
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

### 7. Upload your CSV

- Navigate to **Upload Data** in the sidebar
- Drop your wide-format CSV file
- The system runs the full pipeline automatically
- Upload more CSVs to trigger new iterations and see drift detection

---

## 📊 Self-Learning Iterations

The system demonstrates **3+ real self-learning iterations**:

| Iteration | What happens |
|-----------|--------------|
| **1st upload** | Baseline — mines patterns, generates all recommendations |
| **2nd upload** | Retrains on combined data; computes drift vs. iteration 1 |
| **3rd upload** | Retrains again; stability scores, gainers/fallers tracked |

Each iteration is stored in Supabase and visible in **Iteration History**.

---

## 🧠 Intelligent Mechanisms

### 1. Auto-Threshold Tuning
Instead of fixed `min_support` / `min_confidence`, the system searches a grid and auto-selects thresholds that produce **20–80 high-quality rules**. This means the system adapts to different dataset sizes automatically.

### 2. Multi-Metric Rule Scoring
Each rule gets a composite score:
```
score = 0.35 × lift_norm + 0.30 × confidence + 0.20 × support + 0.15 × conviction_norm
```
This balances statistical strength (lift), reliability (confidence), frequency (support), and directionality (conviction).

### 3. Drift Detection & Classification
Between iterations, every rule is classified as:
- **new** — emerged in this iteration
- **lost** — disappeared from this iteration
- **stable** — minor change (< ±0.05 score delta)
- **improved** — score increased > 0.05
- **declined** — score decreased > 0.05
- **volatile** — lift shifted > 0.3 AND support shifted > 0.02

### 4. Stability Scoring
```
stability_score = (stable + improved rules) / (survived rules) × 100
```
High stability means your patterns are consistent and reliable for business decisions.

### 5. Rule Versioning
All rules, itemsets, thresholds, and recommendation outputs are stored per iteration in Supabase. You can query any past iteration.

---

## ⛏️ Why FP-Growth Over Apriori?

### Apriori's Problem
Apriori uses **generate-and-test**: it creates all candidate itemsets of size `k`, scans the entire database to count them, prunes non-frequent ones, then repeats for `k+1`. This creates **O(2ⁿ)** candidates and requires **multiple database scans**.

### FP-Growth's Advantage
FP-Growth builds a **compact prefix tree (FP-Tree)** in just **2 database scans**, then mines all patterns recursively via **conditional pattern-base projection** — no candidate generation needed.

| Factor         | Apriori         | FP-Growth (chosen)    |
|---------------|-----------------|----------------------|
| DB Scans       | O(n_items)      | **2 (constant)**     |
| Candidate sets | O(2ⁿ)           | **None**             |
| Speed          | Slow on dense   | **10-100× faster**   |
| Memory         | Large candidate set | **Compact FP-Tree** |
| Dense baskets  | Gets worse      | **Gets better**      |

### Why it fits this dataset
Fast food baskets are **dense** (3–6 items per transaction) and the vocabulary is **small** (~25–30 menu items). These are exactly the conditions where FP-Growth's shared-prefix compression is most effective.

---

## 🌐 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | System health check |
| POST | `/api/upload` | Upload CSV + run full pipeline |
| GET | `/api/dashboard` | Latest iteration full output |
| GET | `/api/iterations` | All iteration history |
| GET | `/api/iterations/{id}` | Specific iteration details |
| GET | `/api/rules` | Latest scored association rules |
| GET | `/api/recommendations/homepage` | Most/least bought + bundles |
| GET | `/api/recommendations/bundles` | Bundle cards with metrics |
| GET | `/api/recommendations/fbt?item=X` | FBT for specific item |
| GET | `/api/recommendations/crosssell?item=X` | Cart cross-sell |
| GET | `/api/recommendations/promos` | Promo suggestions |
| GET | `/api/recommendations/insights` | Business insights |

Full Swagger UI: `http://localhost:8000/docs`

---

## 📋 CSV Format

The system accepts wide-format CSVs with this structure:

```
transaction_id, datetime, item1, price1, item2, price2, ..., item10, price10
T000001, 2026-01-15 19:25:11, Crispy Fried Chicken, 99.0, Apple Pie, 55.0, , , ...
```

- Blank `item/price` columns are automatically skipped
- Basket sizes can vary (1–10 items)
- Prices are used for bundle pricing and promo generation
- System adapts to any number of item columns (not limited to 10)

---

## 🎓 For Your Academic Presentation

When explaining this system in class:

1. **Mining**: "We use FP-Growth which builds a compressed prefix tree in 2 database scans, versus Apriori which generates candidates and scans repeatedly."

2. **Self-learning**: "Each time new data is uploaded, the system retrains, compares rule changes (drift detection), and updates all recommendations automatically."

3. **Scoring**: "Rules aren't just sorted by support — we use a weighted composite score combining lift, confidence, support, and conviction to find business-valuable rules."

4. **Storage**: "Every iteration is versioned in Supabase/PostgreSQL so we can compare patterns over time and track business trends."

5. **Business output**: "The system generates homepage rankings, bundle deals, FBT widgets, cross-sell prompts, promo ideas, and plain-language insights — not just raw numbers."

---

## 📐 Pipeline Architecture

```
CSV Upload
    │
    ▼
┌─────────────────────────────────┐
│ PREPROCESSING (preprocessor.py) │
│  • Validate columns             │
│  • Clean item names             │
│  • Build basket list            │
│  • Extract price map            │
└─────────────┬───────────────────┘
              │
              ▼
┌─────────────────────────────────┐
│ MINING ENGINE (mining_engine.py)│
│  • Auto-tune min_sup / min_conf │ ◄── Self-learning mechanism #1
│  • FP-Growth → frequent itemsets│
│  • Generate association rules   │
└─────────────┬───────────────────┘
              │
              ▼
┌─────────────────────────────────┐
│ SCORING ENGINE (scoring_engine) │
│  • Composite score per rule     │ ◄── Self-learning mechanism #2
│  • Drift detection vs prior     │ ◄── Self-learning mechanism #3
│  • Stability scoring            │
└─────────────┬───────────────────┘
              │
              ▼
┌─────────────────────────────────┐
│ RECOMMENDER (recommender.py)    │
│  • Homepage rankings            │
│  • Bundle cards                 │
│  • FBT / Cross-sell             │
│  • Promo generator              │
│  • Business insights            │
└─────────────┬───────────────────┘
              │
              ▼
┌─────────────────────────────────┐
│ STORAGE (database.py / Supabase)  │
│  • Iteration versioning         │ ◄── Self-learning mechanism #4
│  • Rule history                 │
│  • Recommendation caching       │
│  • Drift log                    │
└─────────────┬───────────────────┘
              │
              ▼
┌─────────────────────────────────┐
│ REACT DASHBOARD (App.jsx)       │
│  • Homepage Rankings (3 panels) │
│  • Iteration History + Drift    │
│  • Bundles + Rules + FBT        │
│  • Promos + Insights            │
│  • Dual-mode: Python + Browser  │
└─────────────────────────────────┘
```

---

## 👥 User Roles

| Role | Main Features |
|------|--------------|
| **Owner / Admin** | Iteration History, Business Insights, Promo Generator, Data Summary |
| **Staff / Cashier** | Cart Cross-Sell suggestions, Frequently Bought Together |
| **Customer** | Homepage Rankings drive the menu display |


