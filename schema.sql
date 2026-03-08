-- ============================================================
-- Byteme MBA System - Supabase (PostgreSQL) Schema
-- Run this in Supabase SQL Editor before starting the backend.
-- ============================================================

create table if not exists iterations (
    id bigserial primary key,
    iteration_num integer not null,
    file_name text not null,
    uploaded_at timestamptz not null default now(),
    total_rows integer,
    baskets integer,
    unique_items integer,
    avg_basket_size double precision,
    date_earliest text,
    date_latest text,
    min_support double precision,
    min_confidence double precision,
    rules_count integer,
    avg_lift double precision,
    stability_score double precision,
    drift_summary jsonb
);

create table if not exists rules (
    id bigserial primary key,
    iteration_id bigint not null references iterations(id) on delete cascade,
    antecedents jsonb not null,
    consequents jsonb not null,
    support double precision,
    confidence double precision,
    lift double precision,
    leverage double precision,
    conviction double precision,
    score double precision
);

create table if not exists itemsets (
    id bigserial primary key,
    iteration_id bigint not null references iterations(id) on delete cascade,
    itemset jsonb not null,
    support double precision,
    item_count integer
);

create table if not exists recommendations (
    id bigserial primary key,
    iteration_id bigint not null references iterations(id) on delete cascade,
    rec_type text not null,
    data jsonb not null
);

create table if not exists drift_log (
    id bigserial primary key,
    from_iteration bigint references iterations(id) on delete set null,
    to_iteration bigint references iterations(id) on delete set null,
    rule_key text,
    status text,
    lift_delta double precision,
    supp_delta double precision,
    conf_delta double precision,
    score_delta double precision
);

create table if not exists price_map (
    id bigserial primary key,
    iteration_id bigint not null references iterations(id) on delete cascade,
    item text not null,
    avg_price double precision
);

create table if not exists cleaned_rows (
    id bigserial primary key,
    iteration_id bigint not null references iterations(id) on delete cascade,
    row_data jsonb not null,
    created_at timestamptz not null default now()
);

create index if not exists idx_rules_iteration_id on rules(iteration_id);
create index if not exists idx_itemsets_iteration_id on itemsets(iteration_id);
create index if not exists idx_recommendations_iteration_id on recommendations(iteration_id);
create index if not exists idx_price_map_iteration_id on price_map(iteration_id);
create index if not exists idx_drift_log_to_iteration on drift_log(to_iteration);
create index if not exists idx_cleaned_rows_iteration_id on cleaned_rows(iteration_id);

-- Optional for development when using anon key with PostgREST:
-- alter table iterations enable row level security;
-- alter table rules enable row level security;
-- alter table itemsets enable row level security;
-- alter table recommendations enable row level security;
-- alter table drift_log enable row level security;
-- alter table price_map enable row level security;
-- alter table cleaned_rows enable row level security;
-- create policy "allow all dev" on iterations for all using (true) with check (true);
-- create policy "allow all dev" on rules for all using (true) with check (true);
-- create policy "allow all dev" on itemsets for all using (true) with check (true);
-- create policy "allow all dev" on recommendations for all using (true) with check (true);
-- create policy "allow all dev" on drift_log for all using (true) with check (true);
-- create policy "allow all dev" on price_map for all using (true) with check (true);
-- create policy "allow all dev" on cleaned_rows for all using (true) with check (true);
