# Crew dashboard

Read-only race dashboard for the crew-station iPad (iPad Air 2, Safari 15.6, portrait).
Live at https://indrekraag.github.io/byu/ once GitHub Pages is enabled for this repo.

- **Laps**: official raceresult.com timing feed for bib 15, checked once a minute.
  Plan band from `src/data/raceConfig.ts`. Returns are calculated as yard start + lap.
- **Intake**: for now, import `backyard-race-headquarters.json` (Laura's app → Race HQ →
  "Export lists and crew records"). Live sync via the dashboard owner's own Supabase is next.

Started as a cut-down clone of Laura's app. Her repo is not a remote here and never gets
pushed to.

```
npm ci && npm test && npm run build    # deploy: push to main (GitHub Actions → Pages)
```

iPad: Settings → Display & Brightness → Auto-Lock → Never (Safari 15 has no screen wake lock).
