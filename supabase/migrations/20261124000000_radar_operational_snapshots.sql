-- Operational snapshots produced by Radar's application layer.
-- Provider payloads remain normalized or stored as a report snapshot; secrets
-- and raw provider credentials are never persisted.

create table if not exists radar_report_snapshots (
  report_key text primary key,
  report_date date not null,
  report jsonb not null,
  source text not null default 'radar',
  generated_at timestamptz not null default now()
);

alter table radar_leaderboard_snapshots
  add column if not exists rank integer,
  add column if not exists score integer,
  add column if not exists tier text,
  add column if not exists recent_realized_pnl_usd numeric(30, 12),
  add column if not exists period_hours integer,
  add column if not exists recent_hours integer,
  add column if not exists partial boolean not null default false;

create index if not exists radar_report_date_idx
  on radar_report_snapshots (report_date desc, generated_at desc);
create index if not exists radar_leaderboard_snapshot_rank_idx
  on radar_leaderboard_snapshots (period_end desc, rank asc nulls last);
