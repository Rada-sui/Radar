-- Shared database helpers for normalized Radar writes.

create or replace function radar_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists radar_tokens_updated_at on radar_tokens;
create trigger radar_tokens_updated_at
before update on radar_tokens
for each row execute function radar_set_updated_at();
