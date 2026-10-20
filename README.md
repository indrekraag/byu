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

## Between races (offline since 2026-10-20)

After Heavy Metal Ultra 2026 the site was taken offline; all code and data are kept.

- GitHub Pages is **switched off** for this repo and the "Deploy to GitHub Pages" workflow is **disabled**.
- The race data stays in Supabase (crew login only) and in the `byu-backup` repo.

To bring it back for the next race:

1. Update `src/data/raceConfig.ts` (date, start time, bib, plan bands).
2. Repo Settings → Pages → Source: **GitHub Actions**.
3. `gh workflow enable "Deploy to GitHub Pages" -R indrekraag/byu`, then push (or run the workflow) to deploy.
4. Clear or archive the previous race's rows in Supabase before the new start.
