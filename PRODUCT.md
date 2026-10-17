# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
The crew (Indrek, plus any helper) of a backyard-ultra runner, Laura Komp. Two jobs, two devices:
- **Crew station iPad:** an always-on wall display at the crew station, read from a few steps away between pit stops. It shows the race's progression at a glance. Only the crew looks at it; the runner does not.
- **Crew phone:** logging what the runner actually ate and drank, and when she came back in, in seconds, often one-handed and tired, at any hour of a race that runs through the night.

## Product Purpose
Show how the race is going over time: lap time per yard against the pace plan, and carbs and fluid per yard and cumulatively against the fuelling plan. That way the crew can spot a slowing trend or a fuelling gap early. Success means a glance answers "is she on plan, and has she eaten enough", and logging never gets in the way of crewing.

## Positioning
A crew instrument built for one runner's backyard ultra: the official timing feed, her own pace ladder and her own fuelling rules on one screen. It is not a generic fitness dashboard.

## Operating Context
- Backyard ultra format: a 6.7056 km loop started every hour on the hour; it continues until one runner remains. Yard = hour/loop number. Rest = time left in the hour after her return.
- Used indoors or under cover, **through the night**; the screen must not dazzle a dark crew station.
- Lap times come live from the official raceresult.com feed (bib 15, polled once a minute). Intake is logged on the crew phone and synced through the crew's own Supabase project (crew login, sign-ups disabled).
- The earlier data came from Laura's own app (laurakomp/byu-plan) by JSON export. Her app and repo are never written to.

## Capabilities and Constraints
- iPad Air 2, **Safari 15.6**, portrait, home-screen app, no touch during normal use. Build target safari15; no CSS or JS newer than Safari 15 (no Tailwind v4, no oklch/color-mix/@property).
- Two pages with a horizontal swipe: dashboard and logging.
- Unknown carbs stay unknown and are marked, never guessed or counted as zero. Missing entries do not mean zero intake.
- Hosted on GitHub Pages (public repo) at /byu/.
- **Reused at future races**, so race-specific facts (date, start time, bib, plan bands) belong in config, not in the design.

## Brand Commitments
None. The previous dark default look was rejected as "too AI made".

## Evidence on Hand
Real race data: official laps and imported intake for yards 1–4 of Heavy Metal Ultra 2026 (17 Oct). Plan values come from Laura's app: lap bands of 48–50 min for yards 1–20, 50–53 for yards 21–30 and ≤56 from yard 31; carbs 50–60 g per hour; fluid 350–500 ml per hour by day and 250–400 ml by night. No testimonials or other claims exist.

## Product Principles
1. A glance from a few steps away must answer the question; anything that needs reading up close is secondary.
2. Logging is a few taps that survive bad signal; it never loses an entry.
3. Honest data: show what was logged and mark what is unknown.
4. Calm at night: nothing glaring, nothing that flashes for attention unless something is actually wrong.

## Accessibility & Inclusion
Readable at distance by tired people in low light. Identity is never carried by colour alone, and contrast must hold on an old iPad panel.
