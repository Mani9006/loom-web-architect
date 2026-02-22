# Growth Experiment Fabric — ResumePreps

> **Initiative:** `growth-experiment-fabric`
> **Owner:** Growth Engineering
> **Horizon:** 30-day sprint (Weeks 1-4)
> **Success metrics:** activation uplift, paid-conversion uplift, D7/D30 retention delta

---

## 1. Top 10 Funnel Hypotheses

Hypotheses are ordered by funnel stage (Acquisition → Activation → Paid Conversion).
Each includes a measurable prediction and primary metric.

| # | Stage | Hypothesis | Prediction | Primary Metric |
|---|-------|-----------|------------|----------------|
| **H1** | Acquisition | Replacing the primary CTA from "Get Started Free" → "Get Your Free ATS Score" will increase landing-page sign-up click-through. | +15% CTR on sign-up button | `signup_click_rate` |
| **H2** | Acquisition | Adding three testimonials with specific ATS score improvements ("Went from 42 → 91") above the fold will reduce landing-page bounce. | −10% bounce rate | `landing_bounce_rate` |
| **H3** | Acquisition | A "Resume score in 30 seconds" animated demo GIF on the landing hero will increase time-on-page and sign-ups for anonymous visitors. | +8% sign-up rate from organic | `signup_rate_organic` |
| **H4** | Activation | Showing an ATS score **immediately** after the first resume upload (without requiring a job description) increases the percentage of users who complete onboarding. | +20pp onboarding completion | `onboarding_complete_rate` |
| **H5** | Activation | Adding a visual 4-step progress bar ("Upload → Score → Improve → Apply") to the onboarding modal increases step-completion rate. | +12pp completion rate | `onboarding_complete_rate` |
| **H6** | Activation | A single in-app tooltip on the Cover Letter feature (shown on first Dashboard visit after onboarding) increases Cover Letter creation within 7 days. | +25% D7 cover-letter creation | `d7_cover_letter_rate` |
| **H7** | Activation | Sending a 24 h re-engagement email to users who signed up but did not complete onboarding will increase D2 activation. | +8pp D2 reactivation | `d2_reactivation_rate` |
| **H8** | Paid Conversion | Showing AI "fix suggestions" for ATS scores below 70% only to paid users (contextual gate) will increase upgrade clicks vs. a generic "Go Premium" CTA. | +30% upgrade modal open rate | `upgrade_click_rate` |
| **H9** | Paid Conversion | Surfacing an annual billing option with "Save 30%" prominently in the upgrade modal (vs. defaulting to monthly) will increase annual plan selection and reduce churn. | +15pp annual-plan take rate | `annual_plan_select_rate` |
| **H10** | Retention | A weekly digest email summarising "X jobs applied, Y cover letters drafted, ATS score trend" increases D7 and D30 active users. | +10% WAU, +6% MAU | `d7_active_rate`, `d30_active_rate` |

---

## 2. Experiment Backlog (RICE-Lite Scoring)

**Score = (Impact × Confidence%) / Effort**

| ID | Hypothesis | Impact (1-5) | Effort (1-5) | Confidence | Score | Owner | Status |
|----|-----------|:---:|:---:|:---:|:---:|-------|--------|
| `landing-cta-v1` | H1 – CTA copy change | 4 | 1 | 80% | 320 | Growth Eng | 🟢 Running |
| `onboarding-progress-bar-v1` | H5 – Progress bar | 4 | 1 | 75% | 300 | Product | 🟢 Running |
| `ats-score-gate-v1` | H8 – ATS fix gate | 5 | 2 | 70% | 175 | Growth Eng | 🔵 Draft |
| `upgrade-modal-annual-v1` | H9 – Annual billing nudge | 5 | 1 | 65% | 325 | Revenue | 🔵 Draft |
| `social-proof-landing-v1` | H2 – Social proof | 3 | 2 | 70% | 105 | Marketing | 🔵 Draft |
| `instant-ats-upload-v1` | H4 – Instant ATS on upload | 5 | 3 | 65% | 108 | Product | 📋 Backlog |
| `cover-letter-tooltip-v1` | H6 – CL discovery tooltip | 3 | 1 | 70% | 210 | Product | 📋 Backlog |
| `reengagement-email-24h-v1` | H7 – 24h re-engagement email | 4 | 2 | 60% | 120 | Growth | 📋 Backlog |
| `hero-demo-gif-v1` | H3 – Demo GIF on hero | 3 | 2 | 55% | 82.5 | Design | 📋 Backlog |
| `weekly-digest-email-v1` | H10 – Weekly digest | 4 | 3 | 60% | 80 | Growth | 📋 Backlog |

### Owner Model

| Role | Responsibility |
|------|---------------|
| **Growth Eng** | Instrumentation, variant logic, migration PRs |
| **Product** | Feature flag integration in UI components |
| **Revenue** | Pricing page, upgrade modal, billing logic |
| **Marketing** | Landing copy, email templates, social proof assets |
| **Design** | Visual assets (GIFs, illustrations, modal layouts) |
| **Data** | Statistical analysis, `experiment-report.mjs` dashboards |

---

## 3. Instrumentation Plan

### 3a. Database Layer (Supabase)

Schema defined in `supabase/migrations/20260222_growth_experiment_fabric.sql`.

| Table | Purpose |
|-------|---------|
| `experiments` | Experiment definitions, status, traffic split |
| `experiment_assignments` | Per-user variant bucket (upserted deterministically) |
| `experiment_events` | Raw funnel events tied to (experiment, variant, user) |

**Key events to instrument:**

| Event name | Trigger location | Stage |
|------------|-----------------|-------|
| `signup_click` | Landing page CTA | Acquisition |
| `signup` | Auth success callback | Acquisition |
| `onboarding_step_N` | `OnboardingModal.tsx` each step | Activation |
| `onboarding_complete` | `OnboardingModal.tsx` final step | Activation |
| `resume_uploaded` | Resume builder | Activation |
| `ats_score_viewed` | ATS Checker page | Activation |
| `cover_letter_created` | Cover Letter page | Activation |
| `upgrade_click` | Any upgrade prompt | Paid Conversion |
| `paid_convert` | Stripe webhook → Supabase fn | Paid Conversion |
| `d7_session` | Auth login, day 7 from signup | Retention |

### 3b. Client-Side Layer (React)

**`src/lib/experiment-tracker.ts`** provides:
- `assignVariant(userId, experiment)` – pure deterministic hash, no network call
- `persistAssignment(userId, experimentId, variant)` – fire-and-forget Supabase upsert
- `trackExperimentEvent(options)` – writes to `experiment_events` + Vercel Analytics

**`src/hooks/use-experiment.ts`** provides:
```tsx
const { variant, loading, track } = useExperiment("landing-cta-v1");
// variant: "control" | "treatment"
// track("signup_click");        ← fires to Supabase + Vercel Analytics
```

### 3c. Vercel Analytics

All experiment events are mirrored to Vercel Analytics via `window.va("event", …)` using the naming convention `exp:{experimentId}:{eventName}`.

This enables Vercel's built-in funnel and segment reports without additional tooling.

**Required setup:** Ensure `@vercel/analytics` `<Analytics />` component is mounted in `src/main.tsx` or `src/App.tsx`.

### 3d. Statistical Validation

Run `node scripts/experiment-report.mjs --days 14` to generate a Markdown report that includes:
- Per-variant enrollment count, activation rate, conversion rate
- Two-proportion z-test p-value (significance threshold: p < 0.05)
- Relative lift in conversion rate
- Wilson score lower bound (used for conservative ranking)

**Minimum detectable effect (MDE) & sample size:**

| Metric | Baseline | MDE | Required N (per variant, 80% power, α=0.05) |
|--------|----------|-----|----------------------------------------------|
| Signup rate | 4% | +1pp | ~3,000 visitors |
| Onboarding completion | 35% | +7pp | ~430 enrolled users |
| Upgrade click rate | 8% | +2.5pp | ~1,600 enrolled users |
| Paid conversion | 3% | +1pp | ~4,000 enrolled users |

---

## 4. 30-Day Sprint Plan

### Week 1 — Instrumentation Foundation (Days 1–7)

**Goal:** Ship schema, tracker, and first two running experiments live.

**KPI Targets (end of Week 1):**
- ≥ 100 unique users assigned to each running experiment variant
- Zero instrumentation errors in Supabase logs
- `experiment-report.mjs` outputs without errors

**Tasks:**
- [x] `supabase/migrations/20260222_growth_experiment_fabric.sql` – deploy schema
- [x] `src/lib/experiment-tracker.ts` – deterministic hash + event tracking
- [x] `src/hooks/use-experiment.ts` – React hook
- [x] `scripts/experiment-report.mjs` – reporting CLI
- [ ] Integrate `useExperiment("landing-cta-v1")` in `src/pages/Landing.tsx`
- [ ] Integrate `useExperiment("onboarding-progress-bar-v1")` in `src/components/OnboardingModal.tsx`
- [ ] Add `track("signup_click")` / `track("signup")` to auth flow
- [ ] Add `track("onboarding_complete")` to `OnboardingModal.tsx`
- [ ] Validate assignments in Supabase dashboard

> ✅ Items marked [x] are code artifacts shipped in this PR.
> Items marked [ ] are follow-on integration tasks for Week 1 of the sprint.

**Validation:** Run `node scripts/experiment-report.mjs --days 7` and confirm non-zero enrollments.

---

### Week 2 — Activation Experiments (Days 8–14)

**Goal:** Launch H4 (instant ATS) and H6 (cover letter tooltip); measure activation delta.

**KPI Targets (end of Week 2):**
- Onboarding completion rate: baseline measured (target ≥ 35%)
- Cover letter D7 creation rate: baseline measured
- `landing-cta-v1` statistical trend visible (even if not yet significant)

**Tasks:**
- [ ] Instrument `ats-score-gate-v1`: deploy experiment, gate AI suggestions in `ATSCheckerPage.tsx`
- [ ] Instrument `instant-ats-upload-v1`: show score immediately on resume upload
- [ ] Add `cover-letter-tooltip-v1`: tooltip on `Dashboard.tsx` after onboarding
- [ ] Add `track("resume_uploaded")` and `track("ats_score_viewed")` events
- [ ] Add `track("cover_letter_created")` event in `CoverLetterPage.tsx`
- [ ] Review Week 1 experiment data; flag any assignment skew

**Validation:** Activation rate (onboarding_complete / signup) ≥ 30% in treatment arm.

---

### Week 3 — Monetisation Experiments (Days 15–21)

**Goal:** Launch upgrade-modal and ATS gate experiments; drive paid conversion signal.

**KPI Targets (end of Week 3):**
- Upgrade click rate: baseline ≥ 5%
- `onboarding-progress-bar-v1`: reach significance or call (n ≥ 430/variant)
- At least 1 experiment declared winner or loser

**Tasks:**
- [ ] Deploy `upgrade-modal-annual-v1` in upgrade modal component
- [ ] Add `track("upgrade_click")` and `track("paid_convert")` events
- [ ] Set up Stripe webhook → Supabase function to fire `paid_convert` event
- [ ] Review `landing-cta-v1` results; ship winner if significant
- [ ] Start `social-proof-landing-v1` if design assets ready

**Validation:** Conv rate (paid_convert / signup) ≥ 2%; any treatment arm showing ≥ +20% relative lift is escalated for early decision.

---

### Week 4 — Retention & Iteration (Days 22–30)

**Goal:** Ship retention loop (H10 digest email), review all experiment results, declare winners.

**KPI Targets (end of Week 4):**
- D7 active rate: +5pp vs. pre-sprint baseline
- D30 retention: measured and trending positive
- ≥ 2 experiments concluded with shipping decision
- Growth experiment playbook updated with learnings

**Tasks:**
- [ ] Build `weekly-digest-email-v1`: Supabase Edge Function sending weekly summary email
- [ ] Add `d7_session` event tracking on login for users whose signup was 7 days ago
- [ ] Run final `experiment-report.mjs --days 30` for all experiments
- [ ] Document winning variants in this file under "Concluded Experiments"
- [ ] Open follow-up tickets for next 30-day sprint based on learnings

**Validation:** Statistical significance (p < 0.05) declared for at least 2 experiments; decisions logged.

---

## 5. KPI Dashboard Reference

| KPI | Formula | Instrument | Target (30 days) |
|-----|---------|------------|-----------------|
| Sign-up rate | `signup / landing_visit` | Vercel Analytics | +10% vs. baseline |
| Onboarding completion | `onboarding_complete / signup` | `experiment_events` | ≥ 40% |
| D7 activation | `d7_session / signup` | `experiment_events` | ≥ 25% |
| Upgrade click rate | `upgrade_click / signup` | `experiment_events` | ≥ 8% |
| Paid conversion | `paid_convert / signup` | `experiment_events` | ≥ 3% |
| D30 retention | `d30_session / signup` | `experiment_events` | ≥ 15% |

---

## 6. Concluded Experiments

*(To be filled in at end of sprint)*

| Experiment | Winner | Lift | p-value | Shipped? |
|-----------|--------|------|---------|---------|
| — | — | — | — | — |
