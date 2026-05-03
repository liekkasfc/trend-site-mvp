create table if not exists asset_leads (
  id text primary key,
  created_at text not null,
  updated_at text not null,
  site_slug text not null,
  asset_slug text not null,
  email text not null,
  role text not null,
  use_case text not null,
  source_page text,
  thank_you_path text not null,
  r2_object_key text not null,
  fallback_download_url text not null,
  delivery_token text not null unique,
  delivery_status text not null default 'issued',
  delivery_count integer not null default 0,
  delivered_at text,
  attribution_json text,
  first_touch_json text,
  last_touch_json text,
  cta_variant text,
  lifecycle_stage text not null default 'captured',
  lifecycle_updated_at text,
  owner_email text,
  followup_status text not null default 'new',
  email_delivery_status text not null default 'not_attempted',
  email_delivery_provider text,
  email_delivery_message_id text,
  email_delivered_at text,
  expires_at text,
  last_delivered_at text,
  resend_count integer not null default 0,
  delivery_policy_json text,
  turnstile_status text not null default 'skipped',
  turnstile_hostname text,
  ip_hash text,
  user_agent text,
  referer text,
  request_origin text,
  metadata_json text
);

create index if not exists idx_asset_leads_created_at on asset_leads(created_at desc);
create index if not exists idx_asset_leads_site_asset on asset_leads(site_slug, asset_slug, created_at desc);
create index if not exists idx_asset_leads_email on asset_leads(email, created_at desc);
create index if not exists idx_asset_leads_lifecycle_stage on asset_leads(lifecycle_stage, updated_at desc);
create index if not exists idx_asset_leads_followup_status on asset_leads(followup_status, updated_at desc);
create index if not exists idx_asset_leads_email_delivery_status on asset_leads(email_delivery_status, updated_at desc);

create table if not exists consult_requests (
  id text primary key,
  created_at text not null,
  updated_at text not null,
  site_slug text not null,
  email text not null,
  role text not null,
  workflow_bottleneck text not null,
  desired_outcome text not null,
  source_page text,
  attribution_json text,
  first_touch_json text,
  last_touch_json text,
  cta_variant text,
  lifecycle_stage text not null default 'captured',
  lifecycle_updated_at text,
  owner_email text,
  followup_status text not null default 'new',
  email_delivery_status text not null default 'not_attempted',
  email_delivery_provider text,
  email_delivery_message_id text,
  email_delivered_at text,
  delivery_policy_json text,
  turnstile_status text not null default 'skipped',
  turnstile_hostname text,
  ip_hash text,
  user_agent text,
  referer text,
  request_origin text,
  metadata_json text
);

create index if not exists idx_consult_requests_created_at on consult_requests(created_at desc);
create index if not exists idx_consult_requests_site on consult_requests(site_slug, created_at desc);
create index if not exists idx_consult_requests_email on consult_requests(email, created_at desc);
create index if not exists idx_consult_requests_lifecycle_stage on consult_requests(lifecycle_stage, updated_at desc);
create index if not exists idx_consult_requests_followup_status on consult_requests(followup_status, updated_at desc);
create index if not exists idx_consult_requests_email_delivery_status on consult_requests(email_delivery_status, updated_at desc);

create table if not exists lead_followups (
  id text primary key,
  created_at text not null,
  updated_at text not null,
  entity_type text not null,
  entity_id text not null,
  site_slug text not null,
  asset_slug text,
  owner_email text,
  status text not null default 'queued',
  priority text not null default 'medium',
  channel text not null default 'email',
  due_at text,
  completed_at text,
  next_action text not null,
  notes text,
  metadata_json text
);

create index if not exists idx_lead_followups_entity on lead_followups(entity_type, entity_id, created_at desc);
create index if not exists idx_lead_followups_status on lead_followups(status, due_at asc);
create index if not exists idx_lead_followups_owner on lead_followups(owner_email, status, due_at asc);

create table if not exists commercial_events (
  id text primary key,
  created_at text not null,
  updated_at text not null,
  entity_type text not null,
  entity_id text not null,
  site_slug text not null,
  asset_slug text,
  owner_email text,
  event_type text not null,
  value_usd real,
  currency text,
  note text,
  metadata_json text
);

create index if not exists idx_commercial_events_entity on commercial_events(entity_type, entity_id, created_at desc);
create index if not exists idx_commercial_events_site_asset on commercial_events(site_slug, asset_slug, created_at desc);
create index if not exists idx_commercial_events_event_type on commercial_events(event_type, created_at desc);
