
# Product-first redesign (Linear / Vercel language)

You picked "Product-first" and "all of them." That means retiring the noir & gold editorial system (big ghost numerals, indexed sections, magazine typography) and moving to a denser, calmer product UI: neutral surfaces, one restrained accent, tight components, keyboard-first layouts, motion only as feedback.

Nothing is deployed until you say so. `.env`, Supabase, edge functions, routing and queries are not touched.

## 1. New design system (foundation)

Rewrite `src/index.css` tokens and font imports.

- Type: Inter (UI) + JetBrains Mono (numerals, IDs). Drop Urbanist/Epilogue.
- Sizes, only 6: 12 / 13 / 14 / 15 / 17 / 22. Weights 400 / 500 / 600.
- Palette:
  - Dark (default): bg `#0A0A0A`, surface `#111113`, surface-2 `#161618`, hairline `#232326`, ink `#EDEDED`, ink-2 `#A1A1A6`, ink-3 `#6B6B70`.
  - Light: bg `#FFFFFF`, surface `#FAFAFA`, hairline `#E6E6E8`, ink `#0A0A0A`, ink-2 `#4B4B52`.
  - Accent: single indigo `#6366F1`, hover `#4F46E5`, wash `#6366F1/8`.
  - Status: success `#10B981`, warn `#F59E0B`, danger `#EF4444` (used for state, never decoration).
- Radius: 6px controls, 10px surfaces, 999 pills. Border 1px hairline everywhere.
- Shadow: only `shadow-sm` on floating menus / drawers. No card shadows.
- Motion: 120–180ms ease-out. No page-load flourishes.
- Retire the ghost numeral / indexed section pattern site-wide.

## 2. Shared shell + primitives

- `AppLayout` sidebar: 240px, icon+label rows, groups (Work / Agent / Account), active item = 2px accent bar + subtle surface. Command bar (⌘K) trigger in top-right.
- `PageHeader`: small crumb, 22/28 title, one-line description, right-aligned primary action. Kill `TerminalText`.
- New primitives: `Toolbar`, `SegmentedTabs`, `DataRow`, `Stat`, `Kbd`, `Drawer`, `EmptyState`, `StatusBadge`. All hairline, no card chrome.

## 3. Home — mission control, not magazine

Three zones, top to bottom:

```text
┌─ Today ──────────────────────────────────────────────┐
│ Next action row · resume-of-the-day · agent status   │
├─ Pipeline ───────────────────────────────────────────┤
│ Applied · Interviewing · Offer · Saved  (compact)    │
│ 7-day activity sparkline                             │
├─ Recent ─────────────────────────────────────────────┤
│ Applications table (5 rows) · Inbox (5 rows)         │
└──────────────────────────────────────────────────────┘
```

- Kill the 01 / 02 / 03 indexed sections and giant ghost numerals.
- Priority Action becomes a single hairline row with a clear verb + `⏎` hint.
- Pipeline: 4 stats inline (label + tabular number + delta), not a ledger column.
- No hero, no fold. Density comparable to Linear's inbox.

## 4. Matches + Job Search — one screen, split view

- Left: filters as compact chips in a toolbar (Location, Remote, Type, Salary, Posted). Overflow into a `More` popover.
- Center: single bordered list. Row = title · company · location · match band (Strong / Good / Possible) as primary, %+keywords secondary, actions on the right (always visible, not hover-only).
- Right: sticky detail drawer at ≥1280px, modal on smaller. Contains full JD, match evidence, "Tailor with AI", "Save", "Auto-apply".
- Sort + saved-searches live in a top segmented control. Search input owns the top-left with `⌘F`.

## 5. Agent + Applications — the auto-apply loop

- **Agent page** becomes a control panel:
  - Row 1: agent status (Idle / Running / Paused) + big toggle.
  - Row 2: rules (roles, locations, salary floor, exclude keywords) edited inline, no modal.
  - Row 3: today's plan (queued jobs, applied, needs-review) as three tabs of a single list.
- **Applications** unifies the Kanban and list. Default = list with status column. Kanban is one segmented-tab away. Each row expands into a drawer with timeline (Saved → Tailored → Applied → Reply → Interview → Offer/Reject), attached resume version, and inbox thread if linked.
- Live status uses named steps ("Tailoring resume", "Submitting form"), not fake percentages, in a bottom-right toast with `role="status"`.

## 6. Resume Builder + ATS — one workspace

- Two-pane layout: left = form (accordion of sections), right = live resume preview. Sticky top toolbar with `Tailor to job`, `Score`, `Export`, `Version`.
- Tailoring animation: the changed lines get a 2px accent bar in the left margin, the inserted keywords get an accent wash + underline for 800ms then fade to normal. Deletions are muted grey with strikethrough. No red, no diff gutters, no monospace.
- ATS score panel: a single number + band ("Strong", "Good", "Weak") + top 3 concrete fixes. No dial, no gauge. Numbers are `tabular-nums`.
- Keyword chips below the score: matched vs missing, click to jump the cursor to that line in the editor.

## 7. Auth / Pricing / Profile / Inbox pass

- Pricing: convert current editorial column into a compact 3-column table, hairlines only, single indigo highlight on the recommended plan, feature list with check icons.
- Profile: single form column, section headings, hairline separators, no cards.
- Inbox: mail-app layout, list on the left (sender · subject · snippet · time), reading pane on the right, keyboard navigation (`j`/`k`).
- Auth pages: centered 360px form, hairline card, one accent button.

## 8. Order of work (all in one direction, one page at a time)

1. Tokens + shell + primitives.
2. Home.
3. Matches / Job Search.
4. Applications + Agent.
5. Resume Builder + ATS.
6. Inbox + Profile + Pricing + Auth pass.

I'll pause after Home for you to sanity-check the new language before I roll it across the rest.

## Technical notes

- Files to edit: `src/index.css`, `tailwind.config.ts`, `src/hooks/use-theme.ts`, `src/components/AppLayout.tsx`, `src/components/PageHeader.tsx`, new `src/components/ui/data-row.tsx`, `stat.tsx`, `toolbar.tsx`, `segmented-tabs.tsx`, `kbd.tsx`, `empty-state.tsx`, then pages: `HomePage.tsx`, `MatchesPage.tsx`, `JobSearchPage.tsx`, `ApplicationsBoardPage.tsx`, `AgentPage.tsx`, `ResumeBuilder*`, `ATSCheckerPage.tsx`, `InboxPage.tsx`, `Profile.tsx`, `PricingPage.tsx`, `Login/Signup` pages.
- Zero changes to: `.env`, `src/integrations/supabase/**`, edge functions, migrations, routing, data hooks, business logic. Pre-existing TS errors in Supabase-typed files stay untouched per your rule.
- Em dash policy preserved. `tabular-nums` on all numerics. WCAG 2.2 AA contrast on the new palette (verified against `#0A0A0A` base).
- No deploy. You'll review page by page.
