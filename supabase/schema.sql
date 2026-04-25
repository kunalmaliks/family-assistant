-- Enable pgvector extension
create extension if not exists vector;

-- Users
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  name text,
  google_access_token text,
  google_refresh_token text,
  created_at timestamptz default now()
);

-- Emails
create table if not exists emails (
  id uuid primary key default gen_random_uuid(),
  gmail_id text unique not null,
  sender text not null,
  subject text not null,
  body text,
  date_received timestamptz not null,
  category text not null default 'Other',
  embedding vector(1536),
  has_attachment boolean default false,
  created_at timestamptz default now()
);

-- Attachments
create table if not exists attachments (
  id uuid primary key default gen_random_uuid(),
  email_id uuid references emails(id) on delete cascade,
  file_url text,
  file_name text,
  created_at timestamptz default now()
);

-- Chat history
create table if not exists chat_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  message text not null,
  role text not null check (role in ('user', 'assistant')),
  timestamp timestamptz default now()
);

-- Tasks / calendar events
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  due_date timestamptz,
  description text,
  location text,
  calendar_event_id text,
  created_by uuid references users(id),
  created_at timestamptz default now()
);

-- Category rules
create table if not exists category_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  rule_type text not null check (rule_type in ('sender', 'domain', 'keyword')),
  rule_value text not null,
  category text not null,
  created_at timestamptz default now(),
  unique (user_id, rule_type, rule_value)
);

-- Settings
create table if not exists settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade unique,
  sync_frequency text default '30min',
  lookback_period text default '30days',
  notification_preferences jsonb default '{"urgent_emails": true, "calendar_reminders": true, "daily_summary": false}',
  created_at timestamptz default now()
);

-- pgvector similarity search function
create or replace function match_emails(
  query_embedding vector(1536),
  match_count int default 5
)
returns table (
  id uuid,
  gmail_id text,
  sender text,
  subject text,
  body text,
  date_received timestamptz,
  category text,
  has_attachment boolean,
  similarity float
)
language sql stable
as $$
  select
    id,
    gmail_id,
    sender,
    subject,
    body,
    date_received,
    category,
    has_attachment,
    1 - (embedding <=> query_embedding) as similarity
  from emails
  where embedding is not null
  order by embedding <=> query_embedding
  limit match_count;
$$;

-- Indexes
create index if not exists emails_date_idx on emails(date_received desc);
create index if not exists emails_category_idx on emails(category);
create index if not exists chat_history_user_idx on chat_history(user_id, timestamp desc);
create index if not exists category_rules_user_idx on category_rules(user_id);
create index if not exists tasks_due_date_idx on tasks(due_date);

-- Row Level Security (enable for production)
-- alter table users enable row level security;
-- alter table emails enable row level security;
-- alter table chat_history enable row level security;
-- alter table tasks enable row level security;
-- alter table category_rules enable row level security;
-- alter table settings enable row level security;
