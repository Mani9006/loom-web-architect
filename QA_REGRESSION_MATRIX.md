# QA Regression Matrix — Phase 1 Hardening Sprint

**Owner:** Prism (QA)
**Created:** 2026-02-21
**Related Ticket:** KAN-18
**Test Date:** 2026-02-21
**Environment:** Staging

---

## Testing Coverage: Auth | Routes | AI Flows | Build

### Execution Status

| Test Area | Total Cases | Passed | Failed | Skipped | Pass Rate |
|-----------|------------|--------|--------|---------|-----------|
| **Authentication** | 8 | - | - | - | - |
| **Route Integrity** | 7 | - | - | - | - |
| **AI Chat Flows** | 6 | - | - | - | - |
| **Build Artifacts** | 5 | - | - | - | - |
| **Cross-Browser** | 11 | - | - | - | - |
| **Mobile (375px)** | 5 | - | - | - | - |
| **TOTAL** | **42** | - | - | - | - |

---

## 1. AUTHENTICATION (8 test cases)

### Auth-001: Email Signup
```
[ ] User navigates to /auth
[ ] Signup form renders with email + password fields
[ ] User enters valid email + password
[ ] User clicks "Sign Up"
[ ] New account created (verify in DB)
[ ] User redirected to /dashboard
[ ] Session token stored in localStorage
[ ] Dashboard shows user name
```
**Browser:** Chrome | **Viewport:** Desktop 1920x1080
**Result:** ⬜ PENDING | **Notes:** -

### Auth-002: Email Login
```
[ ] User navigates to /auth
[ ] Login form renders
[ ] User enters registered email + password
[ ] User clicks "Login"
[ ] Session created
[ ] User redirected to /dashboard
[ ] Previous session cleared if exists
[ ] Logout button visible in dashboard
```
**Browser:** Chrome | **Viewport:** Desktop 1920x1080
**Result:** ⬜ PENDING | **Notes:** -

### Auth-003: Google OAuth
```
[ ] Google login button renders
[ ] User clicks "Sign in with Google"
[ ] Google consent screen appears (mock)
[ ] User grants permissions
[ ] Redirected to /dashboard
[ ] User email and avatar populated
[ ] Session token in localStorage
```
**Browser:** Chrome | **Viewport:** Desktop 1920x1080
**Result:** ⬜ PENDING | **Notes:** -

### Auth-004: Session Persistence
```
[ ] User logs in
[ ] User refreshes page
[ ] Session still valid
[ ] Dashboard loads without re-login
[ ] User data cached correctly
```
**Browser:** Chrome | **Viewport:** Desktop 1920x1080
**Result:** ⬜ PENDING | **Notes:** -

### Auth-005: Logout
```
[ ] User logged in on dashboard
[ ] User clicks logout button
[ ] Redirected to landing page
[ ] Session token removed from localStorage
[ ] Cannot access /dashboard (redirect to /auth)
```
**Browser:** Chrome | **Viewport:** Desktop 1920x1080
**Result:** ⬜ PENDING | **Notes:** -

### Auth-006: Invalid Credentials
```
[ ] User enters wrong password
[ ] Error message displays: "Invalid email or password"
[ ] User remains on /auth page
[ ] Form not cleared (UX best practice)
```
**Browser:** Chrome | **Viewport:** Desktop 1920x1080
**Result:** ⬜ PENDING | **Notes:** -

### Auth-007: Password Reset
```
[ ] User clicks "Forgot password?"
[ ] Reset form renders
[ ] User enters email
[ ] "Check your email" message displays
[ ] Password reset link in email works (mock)
[ ] User can set new password
[ ] Can login with new password
```
**Browser:** Chrome | **Viewport:** Desktop 1920x1080
**Result:** ⬜ PENDING | **Notes:** -

### Auth-008: Token Expiration
```
[ ] Session token expires after configured timeout
[ ] User redirected to /auth
[ ] Error message: "Session expired. Please login again."
[ ] New login creates fresh token
```
**Browser:** Chrome | **Viewport:** Desktop 1920x1080
**Result:** ⬜ PENDING | **Notes:** -

---

## 2. ROUTE INTEGRITY (7 test cases)

### Routes-001: Landing Page Load
```
[ ] Navigate to /
[ ] Page loads without errors
[ ] Navigation bar renders
[ ] CTA buttons visible
[ ] Links to /auth, /about, /features work
```
**Browser:** Chrome | **Viewport:** Desktop 1920x1080
**Result:** ⬜ PENDING | **Notes:** -

### Routes-002: Auth Page Load
```
[ ] Navigate to /auth
[ ] Auth form renders
[ ] No console errors
[ ] Signup and login tabs/modes available
```
**Browser:** Chrome | **Viewport:** Desktop 1920x1080
**Result:** ⬜ PENDING | **Notes:** -

### Routes-003: Dashboard Access (Protected)
```
[ ] Unauthenticated user navigates to /dashboard
[ ] Redirected to /auth
[ ] No sensitive data exposed
```
**Browser:** Chrome | **Viewport:** Desktop 1920x1080
**Result:** ⬜ PENDING | **Notes:** -

### Routes-004: Resume Editor Load
```
[ ] Authenticated user navigates to /resume/:id
[ ] Resume editor page loads
[ ] Previous resume data populated (if exists)
[ ] Editor components render
```
**Browser:** Chrome | **Viewport:** Desktop 1920x1080
**Result:** ⬜ PENDING | **Notes:** -

### Routes-005: AI Chat Page Load
```
[ ] Navigate to /ai-chat
[ ] Chat interface renders
[ ] Message history loads
[ ] Mode selector visible (General / ATS)
```
**Browser:** Chrome | **Viewport:** Desktop 1920x1080
**Result:** ⬜ PENDING | **Notes:** -

### Routes-006: Job Search Page Load
```
[ ] Navigate to /jobs
[ ] Search form renders
[ ] Search results empty initially
[ ] No errors on page load
```
**Browser:** Chrome | **Viewport:** Desktop 1920x1080
**Result:** ⬜ PENDING | **Notes:** -

### Routes-007: 404 Handling
```
[ ] Navigate to /nonexistent
[ ] 404 page displays
[ ] "Go Home" link works
[ ] No console errors
```
**Browser:** Chrome | **Viewport:** Desktop 1920x1080
**Result:** ⬜ PENDING | **Notes:** -

---

## 3. AI CHAT FLOWS (6 test cases)

### AI-001: Start Chat (General Mode)
```
[ ] User navigates to /ai-chat
[ ] Chat interface ready
[ ] Input field visible and focused
[ ] User types a question
[ ] User clicks send (or presses Enter)
[ ] AI response appears in chat
[ ] Response formatted correctly
```
**Browser:** Chrome | **Viewport:** Desktop 1920x1080
**Result:** ⬜ PENDING | **Notes:** -

### AI-002: Mode Switching (ATS Mode)
```
[ ] Chat in general mode
[ ] User clicks mode selector
[ ] ATS mode option available
[ ] User selects ATS mode
[ ] Mode indicator changes
[ ] Chat context changes (system prompt updated)
```
**Browser:** Chrome | **Viewport:** Desktop 1920x1080
**Result:** ⬜ PENDING | **Notes:** -

### AI-003: ATS Resume Scoring
```
[ ] User in ATS mode
[ ] User pastes job description
[ ] User uploads/pastes resume
[ ] User clicks "Score"
[ ] ATS match score displays (e.g., 78%)
[ ] Keyword matches highlighted
[ ] Missing keywords listed
```
**Browser:** Chrome | **Viewport:** Desktop 1920x1080
**Result:** ⬜ PENDING | **Notes:** -

### AI-004: Message History
```
[ ] User sends multiple messages
[ ] All messages visible in chat
[ ] Message order correct
[ ] Previous responses still visible
[ ] User can scroll up to see history
```
**Browser:** Chrome | **Viewport:** Desktop 1920x1080
**Result:** ⬜ PENDING | **Notes:** -

### AI-005: Context Preservation
```
[ ] User asks follow-up question
[ ] AI remembers previous context
[ ] AI provides coherent response
[ ] Conversation flows naturally
```
**Browser:** Chrome | **Viewport:** Desktop 1920x1080
**Result:** ⬜ PENDING | **Notes:** -

### AI-006: Error Handling
```
[ ] AI service temporarily down
[ ] Error message displays: "Unable to process. Try again."
[ ] User can retry
[ ] Chat doesn't crash
```
**Browser:** Chrome | **Viewport:** Desktop 1920x1080
**Result:** ⬜ PENDING | **Notes:** -

---

## 4. BUILD ARTIFACTS (5 test cases)

### Build-001: TypeScript Compilation
```
[ ] Run: npm run type-check
[ ] No TypeScript errors
[ ] No warnings (strict mode)
```
**Result:** ⬜ PENDING | **Notes:** -

### Build-002: ESLint Linting
```
[ ] Run: npm run lint
[ ] No ESLint errors
[ ] No warnings
[ ] Code style consistent
```
**Result:** ⬜ PENDING | **Notes:** -

### Build-003: Build Success
```
[ ] Run: npm run build
[ ] Build completes without errors
[ ] dist/ folder created
[ ] All assets bundled
```
**Result:** ⬜ PENDING | **Notes:** -

### Build-004: Production Build Size
```
[ ] Bundle size reasonable (<500KB gzipped)
[ ] No dead code in bundle
[ ] Tree shaking working
```
**Result:** ⬜ PENDING | **Notes:** -

### Build-005: Source Maps
```
[ ] Development source maps generated
[ ] Production source maps available (for debugging)
```
**Result:** ⬜ PENDING | **Notes:** -

---

## 5. CROSS-BROWSER (11 test cases)

### Chrome Desktop
```
[ ] Auth-001: Email Signup
[ ] Routes-001: Landing Page
[ ] AI-001: Start Chat
[ ] Resume editor renders
[ ] PDF export works
```
**Browser:** Chrome | **Result:** ⬜ PENDING

### Firefox Desktop
```
[ ] Auth-001: Email Signup
[ ] Routes-001: Landing Page
[ ] AI-001: Start Chat
[ ] Resume editor renders
[ ] PDF export works
```
**Browser:** Firefox | **Result:** ⬜ PENDING

### Safari Desktop
```
[ ] Auth-001: Email Signup
[ ] Routes-001: Landing Page
[ ] AI-001: Start Chat
[ ] Resume editor renders
[ ] PDF export works
```
**Browser:** Safari | **Result:** ⬜ PENDING

### Edge (Smoke Test)
```
[ ] Landing page loads
[ ] Auth page accessible
```
**Browser:** Edge | **Result:** ⬜ PENDING

---

## 6. MOBILE RESPONSIVENESS (5 test cases)

### Mobile-001: Layout at 375px
```
[ ] Landing page responsive
[ ] Navigation collapsible on mobile
[ ] Forms stack vertically
[ ] No horizontal scroll
[ ] Text readable without zoom
```
**Viewport:** 375x667 (iPhone SE) | **Result:** ⬜ PENDING

### Mobile-002: Touch Interactions
```
[ ] Buttons easily clickable (>48px touch targets)
[ ] Form fields have proper spacing
[ ] Modals don't overflow viewport
```
**Viewport:** 375x667 | **Result:** ⬜ PENDING

### Mobile-003: Auth on Mobile
```
[ ] Signup form fits viewport
[ ] Keyboard doesn't cover input
[ ] Submit button accessible
```
**Viewport:** 375x667 | **Result:** ⬜ PENDING

### Mobile-004: Resume Editor on Mobile
```
[ ] Form fields readable
[ ] Preview panel scrollable
[ ] Font sizes appropriate
```
**Viewport:** 375x667 | **Result:** ⬜ PENDING

### Mobile-005: AI Chat on Mobile
```
[ ] Chat input at bottom (not hidden by keyboard)
[ ] Messages scrollable
[ ] Send button accessible
```
**Viewport:** 375x667 | **Result:** ⬜ PENDING

---

## Test Execution Commands

```bash
# Unit tests
npm run test

# E2E tests (Playwright)
npx playwright test --project=chromium
npx playwright test --project=firefox
npx playwright test --project=webkit

# Type checking
npm run type-check

# Linting
npm run lint

# Build
npm run build

# Performance
npx lighthouse https://staging.resumepreps.com --view
```

---

## Sign-Off (After Execution)

```
REGRESSION TEST RESULTS — KAN-18

Total Test Cases: 42
Passed: __
Failed: __
Skipped: __
Pass Rate: __%

Critical Flows: ✅ / ❌
Blockers: None / [List]

Approved by: Prism
Date: 2026-02-21
Time: [HH:MM CST]
Commit Hash: [git rev-parse --short HEAD]

Ready for Production: YES / NO
```

---

## Failure Investigation Template

```markdown
**Test Case:** [Name]
**Severity:** [P0/P1/P2]
**Browser:** [Chrome/Firefox/Safari]
**Viewport:** [Desktop/Mobile]

**Steps to Reproduce:**
1.
2.
3.

**Expected:**
[What should happen]

**Actual:**
[What happened instead]

**Error Log:**
[Console error, if any]

**Screenshot:**
[Attached]

**Next Steps:**
- [ ] Report to @forge or @pixel
- [ ] Create bug ticket
- [ ] Block deployment until fixed
```

---

## Notes

- **KAN-13 Status:** QA pipeline infrastructure set up ✅
- **KAN-18 Status:** Regression matrix defined, ready for execution
- **Next Phase:** Execute all tests on staging before production release
- **Delivery Date:** 2026-02-21
