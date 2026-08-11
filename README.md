# Capacity Tracker

A strength-training progress tracker: log sessions against a rotating program, get
weight/rep suggestions based on your last session, and see PRs, volume trends and
full history. Single-page app (`index.html` + `app.js`), no build step, backed by
Supabase for auth + storage.

## Setup

1. **Create a Supabase project** at [supabase.com](https://supabase.com) (free tier is fine).
2. **Run the schema** — open the SQL Editor in your new project and paste in the
   contents of [`setup.sql`](setup.sql), then run it. This creates the tables
   (`profiles`, `program_days`, `program_exercises`, `sessions`, `session_entries`,
   `session_sets`) with row-level security so each account only ever sees its own data.
3. **Get your API keys** — in the Supabase dashboard, go to
   **Project Settings → API** and copy the **Project URL** and the **anon public** key.
4. **Plug them into the app** — open `index.html` and replace the two placeholders
   near the bottom of `<head>`:
   ```js
   const SUPABASE_URL = 'YOUR_SUPABASE_URL';
   const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';
   ```
5. **Turn off public signups (optional but recommended for a single-user app)** —
   in **Authentication → Settings**, you can disable "Allow new users to sign up"
   after you've created your own account, so nobody else can register.
6. **Open `index.html`** in a browser (or serve the folder with any static file
   server) and create your account on the sign-up screen. On first sign-in the app
   seeds a default 3-day program — edit it any time from the **Settings** tab.

## Access control

Every table is scoped with Postgres row-level security to `auth.uid()`, so even
with the public anon key exposed in the client, each signed-in user can only ever
read or write their own rows. Since this is meant for a single account, the
simplest way to lock it down further is step 5 above (disable public signups) —
your account is the only one that will ever exist.

## Project structure

- `index.html` — markup, styles, Supabase config
- `app.js` — all app logic (auth, data loading, rendering, session flow)
- `setup.sql` — Supabase schema + RLS policies (fresh installs)
- `migrations/` — one-off schema changes for an already-running install; run
  each file once in the Supabase SQL Editor, in order, if it doesn't already
  match `setup.sql`

## Notes

- The default program (3 days × 5 exercises) is just a starting point — add, edit,
  reorder, or delete days/exercises from **Settings**. Deleting a day or exercise
  keeps your already-logged history intact (it's snapshotted per session).
- "Week" numbers are calendar weeks since your first logged session, not literal
  program weeks — this stays meaningful even if you skip a week or edit your program.
- Suggested weight/reps for each exercise are based on your most recent logged
  session for that exercise (add a rep until you hit the top of the rep range,
  then add weight and drop back to the bottom).
- Missed logging a session, or forgot a set? From **History**, use **+ Log a
  past session** to backfill an old workout (pick the day and date, fill in
  sets), or open any existing session and tap **Edit session** to add/remove
  sets, change weights/reps/RPE, fix the date, or add a note after the fact.
- **Profile tab** — weight, height, and age, plus a picker for a few
  pre-built program templates (Full Body, Push/Pull/Legs, Upper/Lower).
  Switching templates replaces your current program's days and exercises;
  logged history is kept (it's snapshotted per session), but progress
  suggestions for a lift start fresh if it isn't in the new template under
  the same tracked exercise. Needs a connection to switch (it's a
  structural change, not something that can be queued offline).
- **Works with no signal.** The app caches your program and history on the
  device after each successful load, so opening it offline still works off
  the last-known data. Anything you log while offline (or if a save fails
  for any reason) is saved to the device immediately and queued — it syncs
  to Supabase automatically the moment you're back online, or via a "Retry
  now" button if a sync attempt fails. A banner at the top of the app shows
  offline/pending-sync status; unsynced sessions show a "NOT SYNCED" tag in
  History until they've synced (at which point editing/deleting them opens
  up as normal).
