# Meal Planner (PWA)

A mobile-first app for planning a household's weekly meals from your own dishes. It suggests new ideas that learn from what you cook and rate, estimates nutrition with AI, and turns the plan into a shared shopping list and a cooking view, so it can replace a notes and reminders app for a household.

<!-- Add screenshots here, e.g. ![Plan screen](docs/plan.png) -->

## Features
- **Weekly planner:** generates 1–4 weeks of meals from your dishes, starting on any date you pick, and respects preferences, prep-time limits and recent history.
- **Easy to rearrange:** change any meal from a searchable list, swap two meals (even on different days), swap whole days, or clear a slot. "Keep" protects meals you like when you regenerate.
- **Learns your taste:** cooked, skipped and swapped-out dishes plus 1–5 star ratings feed an affinity score that shapes future plans and AI suggestions.
- **AI assist:** suggests new dishes, parses a pasted recipe into structured fields, and estimates serving size, calories and macros per serving. The AI key stays server-side.
- **Cooking view:** large, readable recipe with a servings scaler, tickable ingredients and steps, personal notes per dish, and the screen kept awake.
- **Shopping list:** merges ingredients across the planned dates (use the arrows or custom dates), plus your own items with optional quantity and unit ("2 kg rice"). Quick-add chips remember what you buy often, ticked items move to "In basket", and the list shows who added or got each item. Export via Copy / Share.
- **Households:** a partner joins with an invite code, members are listed in Settings, and changes sync live between phones.
- **Installable and offline-friendly PWA:** add it to the home screen; the shopping list keeps working without signal and syncs when you are back online.
- **Push notifications:** a daily "today's meals" reminder at a time you choose, and a Friday/Saturday nudge when next week isn't planned or shopped for yet. Each person opts in on their own phone.
- **Dark mode** (Auto / Light / Dark) and an in-app **Help** page that explains every feature.
- **Private by design:** sign-in with an emailed one-time code, restricted to an email allowlist so only invited people can use the app or spend AI credits.

## Tech stack
React 19, TypeScript, Vite, Tailwind CSS 4, TanStack Query (with persisted cache), React Router, Zod, vite-plugin-pwa, Vitest, oxlint.
Backend: Supabase (Postgres with row-level security, Auth, Realtime, Edge Functions on Deno) and the DeepSeek API.

## Project layout
- `src/routes/`: screens (Today, Plan, Dishes, Cook, Shop, Settings, Help, sign-in)
- `src/lib/outbox.ts`: offline write queue for the shopping list; `theme.ts`: light/dark theme
- `src/lib/planner.ts`, `shopping.ts`: plan generation and shopping-list logic, with unit tests
- `supabase/migrations/`: schema, RLS policies, nutrition columns, the email allowlist, custom shopping items, dish notes, staples, quantities and push subscriptions
- `supabase/functions/ai/`: edge function that calls the LLM
- `supabase/functions/notify/`: edge function that sends push reminders (run on a schedule)
- `public/push-sw.js`: push and notification-click handlers, loaded into the service worker

## Setup
1. **Supabase project.** Create one, then run the files in `supabase/migrations/` in order (`0001` to `0008`) in the SQL editor, or use `supabase db push`.
2. **Email codes.** In Authentication → Emails → Templates, edit the *Magic Link* and *Confirm signup* templates to contain `{{ .Token }}` (for example "Your code is: {{ .Token }}"). For production, configure custom SMTP under Authentication → SMTP, since the built-in sender is heavily rate-limited.
3. **Allowlist.** Only these emails can sign up or use the app:
   ```sql
   insert into allowed_emails values ('you@example.com'), ('partner@example.com'); -- lowercase
   ```
   Once everyone has signed in, you can also turn off *Allow new users to sign up* in Authentication → Sign In / Providers.
4. **Environment.** `cp .env.example .env` and fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (the public anon/publishable key from Project Settings → API).
5. **AI function.** The LLM key is stored as a Supabase secret and never reaches the browser:
   ```
   supabase link --project-ref <your-project-ref>
   supabase secrets set DEEPSEEK_API_KEY=...
   supabase functions deploy ai
   ```
6. **Push notifications (optional).** Generate a key pair with `npx web-push generate-vapid-keys`, then:
   ```
   supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:you@example.com CRON_SECRET=<any long random string>
   supabase functions deploy notify
   ```
   Put the **public** key in `.env` (and in Vercel) as `VITE_VAPID_PUBLIC_KEY`. Then enable the `pg_cron` and `pg_net` extensions (Database → Extensions) and schedule the function every 15 minutes in the SQL editor:
   ```sql
   select cron.schedule('meal-reminders', '*/15 * * * *', $$
     select net.http_post(
       url := 'https://<project-ref>.supabase.co/functions/v1/notify',
       headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer <anon key>', 'x-cron-secret', '<CRON_SECRET>'),
       body := '{}'::jsonb
     )
   $$);
   ```
   Each person then turns notifications on under Settings → Notifications. On iPhone this only works from the installed Home Screen app (iOS 16.4+).
7. **Run locally.** `npm install && npm run dev`, then open http://localhost:5173. Add the localhost URL to Authentication → URL Configuration.
8. **Deploy.** Import the repo into Vercel and set the `VITE_` environment variables. Set the Supabase Site URL to the deployed address. It must be served over HTTPS for installing and offline mode to work. On iPhone, open it in Safari and choose Share → Add to Home Screen (Android: menu → Install app).
9. **First use.** The first user creates a household. The partner joins with the invite code shown in Settings. The in-app Help page (Settings → How to use the app) walks through everything.

## Scripts
| Command | Description |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Type-check and build for production |
| `npm test` | Run unit tests |
| `npm run lint` | Lint with oxlint |
| `npm run preview` | Preview the production build |

## Security notes
- Row-level security limits every table to members of the user's household.
- Sign-up and data access are gated by the `allowed_emails` table, and the AI function rejects anyone who is not an allowed household member.
- Offline data (cached dishes, plans and lists) is stored in the browser's localStorage on each phone; sign out on shared devices.
- The `notify` function only runs for the scheduler (shared secret) or a signed-in user sending a test to their own devices. Keep the VAPID private key out of the repo and the client.
- Only the public anon key is used in the frontend. Keep your DeepSeek key and any service-role key out of the repo and the client.
