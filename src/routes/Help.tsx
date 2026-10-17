import { Link } from 'react-router-dom'
import { Card, H1 } from '../components/ui'

type Section = { icon: string; title: string; intro: string; points: string[] }

const SECTIONS: Section[] = [
  {
    icon: '🚀', title: 'Getting started',
    intro: 'The quickest way to a plan and a shopping list.',
    points: [
      'Add a few dishes on the Dishes tab (7 or more gives varied plans).',
      'Open Plan, pick a start date and tap “Generate plan”.',
      'Open Shop for the list, and tick things off as you go.',
      'Open Settings to set meals per day, allergies and dislikes, and to invite your partner with the code.',
    ],
  },
  {
    icon: '🏠', title: 'Today',
    intro: 'What’s for dinner, and a quick way to log how it went.',
    points: [
      'Shows today’s meals. Tap one (“Cook →”) to open the cooking view.',
      '“How did these go?” appears for past meals: rate 1–5 stars, or mark Cooked or Skipped. Ratings teach the planner what you like.',
    ],
  },
  {
    icon: '📅', title: 'Plan',
    intro: 'Generate and adjust your meal plan for any dates.',
    points: [
      'Start date: pick any day with the date field; ← and → move by a week. Choose 1–4 weeks to generate.',
      '✨ Generate plan fills empty slots using your dishes, preferences, past ratings and recent meals (so you don’t repeat).',
      'Tap a dish name to change it: search your dishes, or clear the slot. Dishes that clash with your preferences are marked but still pickable.',
      '⇅ on a meal: swap it with a meal on any day (tap “Swap here”), or move it to an empty slot.',
      '⇅ Swap day (in a day’s header): swap all meals between two days.',
      'Keep / 🔒 Kept: a kept meal stays put when you press Generate again; everything else is re-planned. Manual changes always work.',
      '✎ edits the dish (ingredients, instructions, notes). ✕ removes the meal from the slot.',
    ],
  },
  {
    icon: '🍲', title: 'Dishes',
    intro: 'Your recipe collection.',
    points: [
      '+ Add dish: type it in, or open “Paste a recipe” and let AI fill in the ingredients and steps.',
      '✨ Estimate with AI fills in nutrition per serving (rough estimates).',
      'Ideas tab → “Suggest new ideas” asks AI for new dishes based on your taste. Keep the ones you like; Dismiss the rest.',
      '🍳 opens the cooking view. Search by name. Archiving a dish hides it from plans without deleting it.',
      'Our notes: personal tweaks (“less salt”, “double the sauce”) shown while you cook.',
    ],
  },
  {
    icon: '👩‍🍳', title: 'Cooking view',
    intro: 'A big, readable recipe for use at the stove.',
    points: [
      'Servings − / + rescales every ingredient amount.',
      'Tick ingredients as you gather them and tap steps as you finish them (kept on this phone; “Reset ticks” clears them).',
      'The screen stays on while you cook. Your notes show at the top.',
      'Write the method one step per line on the dish page.',
    ],
  },
  {
    icon: '🛒', title: 'Shopping list',
    intro: 'Meals from the plan plus anything else you need to buy.',
    points: [
      'Meal ingredients are added up automatically for the dates shown (use ← → or “Custom dates”).',
      'Add your own items in the box at the top. Optional amount and unit, or type “2 kg rice”.',
      'Quick add: items you’ve added before come back as chips. In Edit, ☆ pins a favourite and ✕ forgets one.',
      'Tick items as you shop; they move to “In basket”. “Clear ticked items I added” tidies up your own items.',
      'You’ll see “added by” and “got by” when your partner did it. Changes sync live between your phones.',
      '“Export remaining items” copies or shares what’s left as plain text.',
    ],
  },
  {
    icon: '📲', title: 'Install & offline',
    intro: 'Use it like a normal app, even in the supermarket.',
    points: [
      'iPhone: open the site in Safari → Share → Add to Home Screen. Android: menu → Install app.',
      'The shopping list works without signal: ticks and new items are saved on the phone and sync when you’re back online (a banner shows the status).',
      'Other edits (plans, dishes) need a connection, but you can still read them offline.',
    ],
  },
  {
    icon: '🔔', title: 'Notifications',
    intro: 'Gentle reminders, on each person’s own phone.',
    points: [
      'Settings → Notifications → “Turn on notifications on this device”. Each phone turns them on separately.',
      'iPhone: add the app to your Home Screen first, then open it from there (Apple only allows notifications for installed apps).',
      'Today’s meals: a reminder at the time you choose with what’s planned.',
      'Plan & shop: on Friday and Saturday evening, a nudge if next week has no meals yet, or is planned but the shopping list hasn’t been started.',
      '“Send a test” checks that it works. Turn them off any time.',
    ],
  },
  {
    icon: '⚙️', title: 'Settings',
    intro: 'Make the planner fit your household.',
    points: [
      'Appearance: Auto follows your phone, or force Light or Dark.',
      'Meals per day: choose breakfast, lunch and dinner for each weekday.',
      'Preferences: allergies, dislikes, diets, favourite cuisines, weeknight time limit and how many new ideas per week. “Notes for the AI” is free text.',
      'Invite code: your partner enters it when they sign in to share everything.',
    ],
  },
]

export default function Help() {
  return (
    <div className="space-y-4">
      <div>
        <Link to="/settings" className="text-sm text-green-700">← Settings</Link>
        <H1>How to use the app</H1>
      </div>
      <div className="space-y-3">
        {SECTIONS.map((s, i) => (
          <Card key={s.title} className="overflow-hidden p-0">
            <details open={i === 0} className="group">
              <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 p-4 [&::-webkit-details-marker]:hidden">
                <span className="text-2xl" aria-hidden>{s.icon}</span>
                <span className="flex-1">
                  <span className="block font-semibold">{s.title}</span>
                  <span className="block text-sm text-slate-500">{s.intro}</span>
                </span>
                <span className="text-slate-400 transition group-open:rotate-90">›</span>
              </summary>
              <ul className="space-y-2 border-t border-slate-100 px-4 py-3 text-[15px] text-slate-700">
                {s.points.map((p) => (
                  <li key={p} className="flex gap-2"><span className="text-green-600">•</span><span>{p}</span></li>
                ))}
              </ul>
            </details>
          </Card>
        ))}
      </div>
    </div>
  )
}
