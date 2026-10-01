# QA Testing Pipeline — Phase 1 Deliverables

**Owner:** Prism (QA)
**Created:** 2026-02-21
**Status:** Active
**Related Tickets:** KAN-13, KAN-18

---

## Testing Strategy

### Quality Gates (Definition of Done)
1. ✅ TypeScript strict mode compiles (no errors)
2. ✅ ESLint passes (no warnings)
3. ✅ All unit tests pass
4. ✅ All integration tests pass
5. ✅ E2E tests pass on Chrome, Firefox, Safari
6. ✅ Mobile responsiveness verified (375px viewport)
7. ✅ Lighthouse Performance >90

### Testing Stack
- **Unit Tests:** Vitest (jsdom)
- **E2E Tests:** Playwright (Chrome, Firefox, Safari)
- **Performance:** Lighthouse CLI
- **Type Safety:** TypeScript strict mode
- **Linting:** ESLint

---

## Test Scope by Phase 1 Deliverable

### 1. Resume Editor (Core Feature)
**Files:** `src/pages/ResumeEditor.tsx`, `src/components/ResumeForm.tsx`

| Test Category | Test Case | Status |
|---|---|---|
| **Unit** | Form renders without errors | TODO |
| **Unit** | Form validation works (required fields) | TODO |
| **Unit** | Form state updates on input change | TODO |
| **Integration** | Resume data persists to state | TODO |
| **E2E** | User creates resume → sees live preview | TODO |
| **E2E** | User fills personal info → data populates | TODO |
| **Mobile** | Form layout at 375px | TODO |

### 2. PDF Export
**Files:** `src/lib/pdfExport.ts`, `src/components/ExportButton.tsx`

| Test Category | Test Case | Status |
|---|---|---|
| **Unit** | PDF generation utility works | TODO |
| **Unit** | Export handles missing data gracefully | TODO |
| **Integration** | Resume state → PDF conversion | TODO |
| **E2E** | User clicks export → PDF downloads | TODO |
| **E2E** | PDF renders correctly (Chrome, Firefox, Safari) | TODO |

### 3. Authentication (OAuth + Email)
**Files:** `src/pages/AuthPage.tsx`, `src/lib/auth.ts`

| Test Category | Test Case | Status |
|---|---|---|
| **Unit** | Auth module loads | TODO |
| **Unit** | Session storage works | TODO |
| **Integration** | Google OAuth flow mocked | TODO |
| **Integration** | Email signup validation | TODO |
| **E2E** | User signup → redirects to dashboard | TODO |
| **E2E** | User login → session persists | TODO |

### 4. AI Chat (General + ATS Modes)
**Files:** `src/pages/AIChat.tsx`, `src/lib/aiChat.ts`

| Test Category | Test Case | Status |
|---|---|---|
| **Unit** | Chat message formatting | TODO |
| **Unit** | Mode switching logic | TODO |
| **Integration** | Message history state | TODO |
| **E2E** | User starts chat → AI responds | TODO |
| **E2E** | User switches to ATS mode → context changes | TODO |

### 5. Job Search
**Files:** `src/pages/JobSearch.tsx`, `src/lib/jobAPI.ts`

| Test Category | Test Case | Status |
|---|---|---|
| **Unit** | Search query validation | TODO |
| **Integration** | Job API fetch logic | TODO |
| **Integration** | Results pagination | TODO |
| **E2E** | User searches → results display | TODO |
| **E2E** | User clicks job detail → detail page loads | TODO |

---

## Critical User Flows (E2E Priority)

These flows **must not break** — ever. Run on every release.

```
[ ] Landing page loads, nav works, CTA → /auth
[ ] Sign up with email → dashboard
[ ] Create resume project → fill personal info → see preview update
[ ] Upload PDF resume → verify auto-fill → fix errors
[ ] Generate PDF → download → open in PDF viewer → check formatting
[ ] Start AI chat (general mode) → ask question → get response
[ ] Switch to ATS mode → paste job description → get ATS score
[ ] Generate cover letter → edit → save → view in saved list
[ ] Start interview prep → answer question → get feedback
[ ] Search for jobs → see results
[ ] Job tracker → create application card → move stages
```

---

## Test Execution & Evidence

### Unit Tests
```bash
npm run test
```
**Expected Output:**
- All tests pass
- Coverage > 70%

### E2E Tests
```bash
npx playwright test --project=chromium
npx playwright test --project=firefox
npx playwright test --project=webkit
```

### Performance Check
```bash
npx lighthouse https://resumepreps.com --view
```

**Expected Baseline:**
- Lighthouse Performance: >90
- Mobile Performance: >85

---

## Regression Matrix (KAN-18)

See `QA_REGRESSION_MATRIX.md` for detailed test checklist.

---

## Bug Report Format

```markdown
**Summary**: [One line]
**Severity**: [P0/P1/P2/P3]
**Steps to Reproduce**: 1. [step] 2. [step]
**Expected**: [what should happen]
**Actual**: [what actually happens]
**Environment**: [Browser, OS, viewport]
**Screenshots/Video**: [attached]
**Assigned to**: [Forge/Pixel]
```

---

## Sign-Off Template

```
QA APPROVED FOR RELEASE

Tests Run:
- [x] Unit tests: 42/42 passed
- [x] E2E (Chrome): 11/11 passed
- [x] E2E (Firefox): 11/11 passed
- [x] E2E (Safari): 11/11 passed
- [x] Mobile (375px): responsive ✅
- [x] Lighthouse: 94/100

Blockers: None
Ready to deploy: YES

— Prism, QA | 2026-02-21 06:30 CST
```

---

## Next Steps

1. **Implement unit tests** for auth, forms, utilities
2. **Set up Playwright** for E2E testing
3. **Run regression matrix** on staging
4. **Document any failures** with evidence
5. **Post sign-off to Jira** with commit hash
