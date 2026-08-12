-- Chat messages for the Discord-at-home clone.
-- Run this in the Supabase SQL editor (or via `supabase db push`).

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  room text not null default 'general',
  username text not null,
  avatar text not null default '🙂',
  content text not null check (char_length(content) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists messages_room_created_at_idx
  on public.messages (room, created_at);

alter table public.messages enable row level security;

-- No auth in this app: anyone can read and post to a room.
-- Usernames are self-reported, not verified.
create policy "public can read messages"
  on public.messages for select
  to anon
  using (true);

create policy "public can send messages"
  on public.messages for insert
  to anon
  with check (true);

-- Make INSERTs broadcast over Realtime so clients get live updates.
alter publication supabase_realtime add table public.messages;
