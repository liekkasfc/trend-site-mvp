# Worker D1 Migration

- Generated at: 2026-05-03T08:39:55.084Z
- Dry run: no

## Supporting tables
- lead_followups
- commercial_events

## Tables
- asset_leads: added 0 column(s)
- consult_requests: added 0 column(s)

## Indexes
- create index if not exists idx_asset_leads_lifecycle_stage on asset_leads(lifecycle_stage, updated_at desc)
- create index if not exists idx_asset_leads_followup_status on asset_leads(followup_status, updated_at desc)
- create index if not exists idx_asset_leads_email_delivery_status on asset_leads(email_delivery_status, updated_at desc)
- create index if not exists idx_consult_requests_lifecycle_stage on consult_requests(lifecycle_stage, updated_at desc)
- create index if not exists idx_consult_requests_followup_status on consult_requests(followup_status, updated_at desc)
- create index if not exists idx_consult_requests_email_delivery_status on consult_requests(email_delivery_status, updated_at desc)
- create index if not exists idx_lead_followups_entity on lead_followups(entity_type, entity_id, created_at desc)
- create index if not exists idx_lead_followups_status on lead_followups(status, due_at asc)
- create index if not exists idx_lead_followups_owner on lead_followups(owner_email, status, due_at asc)
- create index if not exists idx_commercial_events_entity on commercial_events(entity_type, entity_id, created_at desc)
- create index if not exists idx_commercial_events_site_asset on commercial_events(site_slug, asset_slug, created_at desc)
- create index if not exists idx_commercial_events_event_type on commercial_events(event_type, created_at desc)

- Total added columns: 0
