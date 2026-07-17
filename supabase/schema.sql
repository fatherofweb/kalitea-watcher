create table if not exists runs (
  run_id bigserial primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  sources_ok int,
  sources_failed int,
  offers_count int
);

create table if not exists offers (
  id bigserial primary key,
  run_id bigint references runs(run_id),
  source text not null,
  villa text not null,
  villa_key text not null,
  unit_type text not null,
  date_from date not null,
  date_to date not null,
  nights int not null,
  price_per_person int not null,
  ppp_per_night numeric not null,
  transport_type text not null,
  is_package boolean not null default false,
  url text,
  scraped_at timestamptz not null default now()
);

create table if not exists offer_state (
  dedup_key text primary key,
  source text,
  last_price int not null,
  last_seen_at timestamptz not null default now(),
  first_seen_at timestamptz not null default now()
);

create table if not exists alert_state (
  dedup_key text primary key,
  last_alerted_price int not null,
  last_alerted_at timestamptz not null default now()
);

create table if not exists source_health (
  source text primary key,
  consecutive_failures int not null default 0,
  last_ok_at timestamptz,
  last_error text,
  last_failure_type text
);

create table if not exists meta (
  key text primary key,
  value text
); -- npr. last_heartbeat_date
