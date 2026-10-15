# Meal Planner (PWA)

A mobile-first app for planning a household's weekly meals from your own dishes. It suggests new ideas that learn from what you cook and rate, estimates nutrition with AI, and turns the plan into a merged shopping list you can send to iOS Reminders.

<!-- Add screenshots here, e.g. ![Plan screen](docs/plan.png) -->

## Features
- **Weekly planner:** generates 1–4 weeks of meals from your dishes, respecting preferences, prep-time limits and recent history. Lock the entries you like, swap others from a ranked list.
- **Learns your taste:** cooked, skipped and swapped-out dishes plus 1–5 star ratings feed an affinity score that shapes future plans and AI suggestions.
- **AI assist:** suggests new dishes, parses a pasted recipe into structured fields, and estimates serving size, calories and macros per serving. The AI key stays server-side.
- **Shopping list:** merges ingredients across the planned range, groups them by category, lets you tick what you already have, and exports via Copy / Share (one reminder per line).
- **Households:** a partner joins with an invite code, and changes sync live between phones.
- **Private by design:** sign-in with an emailed one-time code, restricted to an email allowlist so only invited people can use the app or spend AI credits.
- **Installable PWA** with a mobile-first UI.

## Tech stack
React 19, TypeScript, Vite, Tailwind CSS 4, TanStack Query, React Router, Zod, vite-plugin-pwa, Vitest, oxlint.
Backend: Supabase (Postgres with row-level security, Auth, Realtime, Edge Functions on Deno) and the DeepSeek API.

## Project layout
- `src/routes/`: screens (Today, Plan, Dishes, Shop, Settings, sign-in)
- `src/lib/planner.ts`, `shopping.ts`: plan generation and shopping-list logic, with unit tests
- `supabase/migrations/`: schema, RLS policies, nutrition columns and the email allowlist
- `supabase/functions/ai/`: edge function that calls the LLM

## Setup
1. **Supabase project.** Create one, then run the files in `supabase/migrations/` in order (`0001` to `0004`) in the SQL editor, or use `supabase db push`.
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
6. **Run locally.** `npm install && npm run dev`, then open http://localhost:5173. Add the localhost URL to Authentication → URL Configuration.
7. **Deploy.** Import the repo into Vercel and set the two `VITE_` environment variables. Set the Supabase Site URL to the deployed address. On iPhone, open it in Safari and choose Share → Add to Home Screen.
8. **First use.** The first user creates a household. The partner joins with the invite code shown in Settings.

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
- Only the public anon key is used in the frontend. Keep your DeepSeek key and any service-role key out of the repo and the client.
