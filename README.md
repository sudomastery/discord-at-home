# Home Discord

A minimal Discord-style room: one channel, broadcaster-only screen share,
voice, and text chat. No accounts. Anyone with the invite link clicks in,
picks a name and an avatar once, and is straight in. Only whoever holds the
broadcaster link can go live; everyone else is a viewer. Capped at 10
viewers + 1 broadcaster per room.

## Stack

- **Next.js (App Router) + TypeScript + Tailwind** on Vercel
- **Supabase** (Postgres + Realtime) for chat messages, no auth
- **LiveKit Cloud** for voice and 1080p screen share (WebRTC). This piece
  can't run on Vercel or Supabase alone, they don't host a media server, so
  a WebRTC SFU is required. LiveKit Cloud's free tier comfortably covers a
  handful of hour-long sessions with 5+ viewers a month.

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a [Supabase](https://supabase.com) project, then in the SQL
   editor run `supabase/schema.sql` from this repo. That creates the
   `messages` table, opens it up for anonymous read/insert (there's no auth
   in this app), and turns on Realtime for it.

   If you have the Supabase CLI authenticated locally (`supabase login`),
   you can push schema changes to a linked project instead:
   `supabase db query --linked -f supabase/schema.sql`.

3. Create a [LiveKit Cloud](https://cloud.livekit.io) project (free tier).
   Grab the WebSocket URL and an API key/secret from project settings.

4. Copy the env template, fill in the Supabase and LiveKit credentials, and
   generate a broadcaster key:

   ```bash
   cp .env.local.example .env.local
   python3 -c "import secrets; print(secrets.token_urlsafe(24))"
   ```

   Put that generated string in `BROADCASTER_KEY`.

5. Run it:

   ```bash
   npm run dev
   ```

## How it works

- `/` is a single "Join the room" button. Clicking it is also the browser
  user-gesture that lets audio autoplay once connected.
- `/room` shows a one-time modal (`src/components/EntryGate.tsx`) asking
  for a name and an emoji avatar, saved to `localStorage`. Returning
  visitors skip straight past it.
- **Broadcaster role**: `/room?key=<BROADCASTER_KEY>` grants screen-share
  permission for that browser (remembered afterward, the URL is cleaned up
  immediately so the key doesn't linger visibly). The LiveKit access token
  route (`src/app/api/livekit-token/route.ts`) checks the key server-side
  and grants `canPublishSources` accordingly, mic + camera for everyone,
  screen share only for the broadcaster, enforced by LiveKit itself, not
  just hidden in the UI. Broadcasters get a "Go live" button and a "Copy
  broadcaster link" button (viewers only see "Copy invite link", which
  never contains the key).
- **Viewer cap**: the token route creates the LiveKit room with
  `maxParticipants: 11` (10 viewers + 1 broadcaster) the first time it's
  requested. LiveKit itself rejects joins past that, surfaced in the UI as
  a "room is full" message.
- Screen share is configured for 1080p30 (`ScreenSharePresets.h1080fps30`).
- Chat is a Supabase Realtime subscription on the `messages` table
  (`src/components/Chat.tsx`), using the name/avatar picked in the entry
  modal, no separate prompt.

## Deploying

1. **Supabase**: push `supabase/schema.sql` to your project (SQL editor or
   the CLI). Note the project URL and anon key.
2. **LiveKit Cloud**: create a project, note the URL, API key, and secret.
3. **Vercel**: import this repo, add the five environment variables from
   `.env.local.example` (including `BROADCASTER_KEY`) in the project
   settings, and deploy. No other configuration is needed, the chat API
   route and the token route both run fine as standard Vercel serverless
   functions since neither holds a long-lived connection open; the actual
   real-time media and chat delivery happen over LiveKit's and Supabase's
   own infrastructure.
4. Bookmark `https://<your-domain>/room?key=<BROADCASTER_KEY>` for
   yourself. Share the plain `https://<your-domain>/room` link with
   viewers.

## Known limitations / things to harden before wider use

- There's no auth and no moderation: anyone with the invite link can post
  chat messages. Fine for a private link shared with friends, not fine for
  anything public. The broadcaster key is the only access control that
  exists, treat it like a password.
- Everyone shares one room (`general`). Adding more rooms/channels means
  parameterizing `ROOM_NAME` in `src/app/room/page.tsx` and the `room`
  column filter in `Chat.tsx`.
- The 10-viewer cap only applies the first time a room is created; it
  won't retroactively shrink or grow a room that's already running.
- LiveKit Cloud's free tier has monthly bandwidth limits; a full 1080p
  screen share to 5 viewers for an hour uses roughly 11 GB of egress out of
  the 50 GB free allotment, fine for a handful of sessions a month, worth
  checking your plan if this becomes a regular hangout.
