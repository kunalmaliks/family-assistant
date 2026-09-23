# Family Assistant App

## What We Are Building

A mobile-friendly family assistant web app that connects to Gmail, uses AI to answer questions about emails, creates calendar events, and sends notifications. Built for two users (me and my spouse).

## Tech Stack

- Next.js with Tailwind CSS for the frontend
- Supabase for database (PostgreSQL + pgvector for embeddings)
- NextAuth.js for authentication with Google login
- Vercel for hosting
- shadcn/ui for UI components
- OpenAI text-embedding-3-small for embeddings

## UI Design Requirements

- Dark mode throughout with warm amber/orange accent colors (#F59E0B)
- Use shadcn/ui components throughout for consistent, polished UI
- Mobile-first design — everything optimized for phone screens
- Bottom navigation bar with icons and labels for Chat, Emails, Calendar, Settings
- Chat page should feel like a modern messaging app (similar to iMessage in dark mode)
- Smooth page transitions and loading states
- Chat bubbles: user messages on the right in amber, assistant messages on the left in dark gray
- Category filter pills that are easy to tap on mobile
- Quick action buttons displayed as horizontally scrollable chips
- Email list cards with colored category badges (School=blue, Payments=amber, Travel=purple, Events=green)
- Settings page with clean toggle switches and grouped sections
- Empty states with friendly illustrated messages
- Typography: large, readable fonts optimized for mobile
- Overall feel: like a premium family organizer app

## Page Structure

- / (Home) → redirects to /chat if logged in, /login if not
- /login → Google sign in button with dark mode design
- /chat → Main AI chat interface
- /emails → List of synced emails with category tags, rule filter pills, ability to recategorize
- /settings → Email rules table with per-rule sync, sync all button, sync frequency, lookback period
- /settings/add-rule → Add new category rule form; auto-syncs that rule in background on save
- /calendar → Monthly grid view of Google Calendar events

## Mobile Navigation

- Bottom navigation bar with 4 tabs: Chat, Emails, Calendar, Settings
- The /chat page has:
  - Horizontally scrollable quick action chips: "What's new?", "Upcoming payments?", "School updates?"
  - Standard chat input at the bottom with send button in amber

## Core Features

### 1. Gmail Integration

- Connect to Gmail API with OAuth2 (access + refresh token)
- Periodically fetch emails via Vercel Cron Jobs (configurable: 30min/1hr/2hr)
- Clean and store emails in Supabase with metadata (sender, subject, body up to 20,000 chars, date, category)
- Extract text from PDF and text attachments; store in attachments table with text_content
- Generate vector embeddings using OpenAI text-embedding-3-small (subject + body + attachment text) and store in pgvector
- Rules-only categorization — no AI auto-categorization; unmatched emails are not stored
- Gmail query optimization: per-rule syncs use Gmail `q` parameter to filter server-side

### 2. AI Chat Interface

- Mobile-friendly chat UI for two users (shared history)
- RAG: embed user message, find top 8 relevant emails via pgvector; falls back to 8 most recent
- Chat context includes both RAG email results (body + attachment text) and Google Calendar events (next 3 months)
- Claude model: claude-sonnet-4-6, max_tokens: 2048
- Calendar tool: suggest_calendar_event with title, date, time, end_date, end_time, location, description
- Tool only called for future dates (today's date injected into system prompt)
- Calendar suggestion shown as inline confirm card before adding

### 3. Email Categorization — Rules Only

- Check category_rules table (sender, domain, keyword rules)
- If match found: assign category and store email
- If no match: skip (email not stored at all)
- Categories: School, Payments, Travel, Events, Other
- User can manually recategorize emails from the Emails page

### 4. Google Calendar Integration

- Events fetched live from Google Calendar API (not stored in Supabase)
- Deleting an event in Google Calendar removes it from the app automatically
- POST /api/calendar creates events with start + end time/date
- Past date guard: rejects events where start date < today

### 5. Multi-user Support

- Two users with individual Google logins via NextAuth.js
- Login is allowlist-only — only emails that already have a `users` row can sign in; new accounts are never auto-created (see Architecture Decisions)
- Each user's emails, attachments, and category-rule matching are fully isolated by `user_id` — no shared inbox
- Chat history is per-user (was always `user_id`-scoped in practice, despite this doc previously describing it as shared)
- Google Calendar remains per-account by nature (each user's events come live from their own Google Calendar)

### 6. Sync Architecture

- Per-rule sync: Settings page has sync button per rule (uses Gmail `q` filter for that rule only)
- Sync All: syncs all rules concurrently
- Background sync on new rule add: fires and forgets, navigates to /settings?syncing=true
- Concurrent syncs allowed — unique constraint on gmail_id prevents duplicates (race condition handled gracefully)
- Cron job: reads sync_frequency and last_synced_at from settings, skips if not enough time elapsed

### 7. Settings Page

- Email Rules table with per-rule sync button (spinner) and delete (with tooltip)
- Sync All button in rules header
- Sync frequency: 30min / 1 hour / 2 hours
- Lookback period: 1 month / 3 months / 6 months
- Amber syncing banner when sync is in progress (dismissable)
- Settings saved to Supabase settings table

## Database Schema

- users — id, email, name, google_access_token, google_refresh_token
- emails — id, user_id, gmail_id (unique per user_id), sender, subject, body, date_received, category, embedding (vector), has_attachment
- attachments — id, email_id, file_url, file_name, text_content
- chat_history — id, user_id, message, role (user/assistant), timestamp
- category_rules — id, user_id, rule_type (sender/domain/keyword), rule_value, category, created_at
- settings — id, user_id, sync_frequency, lookback_period, notification_preferences, last_synced_at, created_at

Note: tasks table exists in schema but is not used. Google Calendar is the single source of truth for events.

## Email Categorization Flow

New email arrives
→ Check category_rules table (sender/domain/keyword match)
→ If match found: assign category, extract attachment text, generate embedding, insert to emails + attachments
→ If no match: skip entirely (not stored)

## Architecture Decisions

- Switchable AI provider for cheap-tier calls (lib/ai-provider.ts) — `detectCalendarEvents`, `checkCalendarDuplicate`, `generateDailyBrief`, and attachment OCR (`extractDocumentText` in lib/gmail.ts) all route through `generateText`/`generateVisionText`, which branch on `AI_PROVIDER` between Claude Haiku (default) and Gemini (model constant `GEMINI_MODEL` in lib/ai-provider.ts). Added because these 4 sites run on every synced email/attachment and were driving Claude API cost; chat stays on Claude Sonnet 4.6 always — not part of this switch. Originally pinned to `gemini-2.5-flash-lite` per user preference over the auto-updating `-latest` alias, but that model returned a hard 404 ("no longer available to new users") on live testing 2026-09-23 — switched to `gemini-3.5-flash-lite` (Google's own error message's recommended replacement). Smoke-tested end-to-end (text, vision, and the exact JSON-extraction prompt shape used by detectCalendarEvents) before shipping.
- Login is allowlist-only (limited beta) — the NextAuth `signIn` callback in `auth.ts` denies any email without an existing `users` row before ever touching the database; `getOrCreateUser` also never auto-creates. A denied sign-in redirects to `/login?error=AccessDenied` with a "limited beta" message. New users must be added manually (insert a `users` row) before they can sign in.
- Emails/attachments are fully isolated per user_id — `emails.user_id` is required and part of the `(user_id, gmail_id)` unique constraint; category-rule matching during sync is scoped to the syncing user's own rules; `match_emails` pgvector RPC takes a `filter_user_id` param. Adopted after an out-of-allowlist Google account was accidentally signed in and its Gmail sync couldn't be distinguished from real data (no per-account attribution existed).
- No AI auto-categorization — rules only; unmatched emails not stored at all
- getOrCreateUser called defensively in every API route (handles failed signIn callback)
- RLS enabled on Supabase; server-side API routes use service role key (sb_secret_... prefix) to bypass RLS
- NEXT_PUBLIC_SUPABASE_ANON_KEY = publishable key (sb_publishable_... prefix), safe for browser but subject to RLS
- SUPABASE_SERVICE_ROLE_KEY = secret key (sb_secret_... prefix), bypasses RLS — never use anon key here
- Google Calendar events fetched live (not stored in tasks table)
- Chat context: 8 RAG emails × 2000 chars body + 2000 chars attachment text + full calendar events (3 months)
- Google OAuth token refresh implemented in NextAuth JWT callback (access tokens refresh before expiry)
- Concurrent syncs allowed — unique constraint on gmail_id is the deduplication mechanism

## Environment Variables Needed

- ANTHROPIC_API_KEY
- OPENAI_API_KEY
- AI_PROVIDER (optional — "gemini" to route the 4 cheap-tier AI calls to Gemini; unset/anything else keeps Claude, the default)
- GEMINI_API_KEY (required only when AI_PROVIDER=gemini)
- GOOGLE_CLIENT_ID
- GOOGLE_CLIENT_SECRET
- SUPABASE_URL
- SUPABASE_ANON_KEY (publishable key, sb_publishable_... prefix)
- SUPABASE_SERVICE_ROLE_KEY (secret key, sb_secret_... prefix — must NOT be the anon key)
- AUTH_SECRET (NextAuth v5 — not NEXTAUTH_SECRET)
- CRON_SECRET (for Vercel cron job authorization)

## Progress Tracking

### Completed

#### Session 1 — Apr 16
- Google OAuth sign-in with Gmail + Calendar scopes (NextAuth v5)
- Rules-based email sync — domain, sender, keyword rules; unmatched emails skipped
- Gmail pagination — fetches all emails in lookback window (not capped at 100)
- AI chat with RAG via pgvector — structured markdown responses (bullets, bold, emoji headers)
- Calendar event creation from chat — Claude tool use detects dates, shows inline confirm card
- Calendar page — Google Calendar-style monthly grid, tapping a day shows events, live sync from Google Calendar
- Settings page — Email Rules table (add/delete) + Calendar months selector
- Add Rule page — /settings/add-rule with rule form
- Chat history persists across navigation — loads last 100 messages from Supabase on mount
- Chat searches both emails (pgvector RAG) and Google Calendar events for context

#### Session 2 — Apr 21–22
- **Token refresh** — Google OAuth token refresh in NextAuth JWT callback; access tokens no longer expire after 1hr
- **Attachment extraction** — PDF (pdf-parse@1.1.1 via `require("pdf-parse/lib/pdf-parse.js")`), plain text, CSV, HTML attachments; text stored in attachments.text_content; included in embeddings and chat context
- **Email body quality** — improved HTML stripping: removes `<style>`/`<script>` blocks first, then converts structural tags to newlines, then strips remaining tags; body stored up to 20,000 chars
- **Categories updated** — Vacations→Travel, 30days→1month for lookback default
- **Sync moved to Settings** — removed sync from Emails page; added per-rule sync button + Sync All in Settings
- **Per-rule Gmail optimization** — sync for a single rule uses Gmail `q` parameter (`from:@domain`, `from:email`, keyword) to filter server-side instead of fetching all messages
- **Background sync on new rule** — add-rule page fires sync as fire-and-forget, redirects to /settings?syncing=true
- **Concurrent syncs** — unique constraint on gmail_id handles race conditions; sync_in_progress flag removed
- **Rule filter on Emails page** — second row of filter pills for each rule; selecting a rule filters emails by that rule's criteria
- **Calendar end time** — suggest_calendar_event tool and POST /api/calendar now support end_date and end_time
- **Past event guard** — calendar API rejects past dates; system prompt includes today's date; tool description says future-only
- **Settings persistence** — sync_frequency and lookback_period saved to Supabase; cron job reads them and skips if not enough time elapsed
- **Supabase RLS** — RLS enabled; clarified publishable vs secret key distinction in architecture

#### Bugs Fixed (Session 2)
- pdf-parse ENOENT error → use pdf-parse@1.1.1 with `require("pdf-parse/lib/pdf-parse.js")`
- SUPABASE_SERVICE_ROLE_KEY was set to anon/publishable key → all admin client reads failed → fixed by using sb_secret_... key
- Email body truncated for HTML emails with embedded CSS → fixed with style/script block stripping in stripHtml()
- Calendar end time was same as start time → added end_date/end_time fields throughout
- Claude suggesting past events → today's date in system prompt, past date guard in API, future-only tool description

#### Session 3 — Sep 20–21
- **Login allowlist gate** — `signIn` callback and `getOrCreateUser` no longer auto-create `users` rows for unrecognized emails; denied sign-ins redirect to `/login?error=AccessDenied` with a "limited beta" message
- **Per-user data isolation** — added required `emails.user_id`, changed the unique constraint to `(user_id, gmail_id)`, scoped sync-time category-rule matching, the Emails page list/recategorize endpoints, the daily brief, and chat RAG (`match_emails` RPC + fallback) all by `user_id`
- **Incident response** — an out-of-allowlist Google account (`kunalmaliks@gmail.com`, a typo login) was signed in for ~3 days before being caught; its `users`/`settings` rows were deleted, and the above isolation work was done specifically because emails synced during that window couldn't be attributed to an account after the fact

### Next Steps

1. **Remove debug logging** — `console.log` with `logParts()` in `lib/gmail.ts` added for diagnosis; remove before deploy
2. **Push notifications** — Firebase FCM token registration on login; send notification from cron job when urgent emails detected
3. **Email body view** — tap an email card to read the full body in a modal/sheet
4. **Chat clear / new conversation** — add button to start a fresh chat without deleting history
5. **Spouse account** — test second Google login; verify shared email/chat/calendar access works correctly
6. **Deploy to Vercel** — add all env vars to Vercel dashboard, set CRON_SECRET, verify 30-min cron fires
7. **SQL migrations needed** (if not yet run):
   - `UPDATE emails SET category = 'Travel' WHERE category = 'Vacations'`
   - `ALTER TABLE settings ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ`
   - `ALTER TABLE attachments ADD COLUMN IF NOT EXISTS text_content TEXT`
