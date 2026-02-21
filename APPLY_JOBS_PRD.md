# Apply Jobs Feature — Product Requirements Document

**Product Manager**: Scout
**Created**: 2026-02-21
**Phase**: Phase 0 Carryover → Phase 1 Priority
**Status**: Planning (Approved for Development)

---

## Executive Summary

**Apply Jobs** enables ResumePreps users to submit job applications directly from the platform with one click, eliminating manual form-filling across multiple job boards. The MVP delivers integration with LinkedIn, Indeed, Lever, and Greenhouse (covering ~70% of tech jobs), automatic application tracking, and ATS pre-scoring before submission.

**Impact**: Transform ResumePreps from a resume builder into a complete job application platform, unlocking new revenue streams (bulk apply campaigns, LinkedIn automation). Initial target: 30%+ of active users engaging with one-click apply within 30 days of launch.

**Timeline**: 4-5 weeks (Sprint-based, ~75 engineer-hours)

---

## Problem Statement

### User Pain Points
1. **Form Abandonment**: Job application forms are repetitive and tedious. Users spend 5-10 minutes per application filling identical fields (name, email, phone, resume). This creates friction and reduces applications submitted.
2. **Resume Mismatch**: Users apply with resumes that don't match job requirements. No way to preview ATS compatibility before submitting.
3. **Lost Context**: Applications are scattered across LinkedIn, Indeed, email, etc. Users forget which jobs they've applied to, their status, and interview timelines.
4. **Competitor Parity**: ApplyPass, Teal, and Job matching tools already offer auto-apply. ResumePreps must match this to remain competitive.

### Why Now?
- ResumePreps now has: job search (Exa.ai), ATS checker (already built), resume builder, and cover letter generator
- All pieces are in place to build auto-apply (high platform leverage, low effort relative to competitor feature parity)
- User requests: 12+ requests in past 3 months for "apply from here" functionality

---

## Success Metrics

### Primary Metrics (Go/No-Go)
- **Adoption**: 30%+ of active users launch ≥1 application within 14 days of feature rollout
- **Success Rate**: 80%+ of applications submitted successfully (vs. 0% without feature)
- **ATS Score Correlation**: Applications with ATS score ≥70 have 2x higher interview rate vs. <50 (validates pre-check value)

### Secondary Metrics (Quality)
- **Application Time**: Median 45 seconds to submit one application (vs. 5-10 minutes manual)
- **Duplicate Prevention**: <0.5% duplicate applications across job boards
- **Feature Retention**: 20%+ of users return to apply jobs feature weekly (after launch)
- **Revenue**: Bulk apply campaigns generate $500+/month by week 12 (if pricing enabled)

### Engineering Metrics
- **Success Rate by Board**: LinkedIn ≥90%, Indeed ≥85%, Lever/Greenhouse ≥95%
- **Response Time**: API submission <1s, ATS pre-check <500ms
- **Availability**: 99%+ uptime for apply function (SLA: <1 incident per month)
- **Data Integrity**: Zero duplicate applications in DB, 100% migration reversibility

---

## User Stories

### Core User Flows

#### Story 1: One-Click Apply
**As a** job seeker viewing a listing in ResumePreps
**I want to** submit an application directly from the platform
**So that** I can apply to jobs 10x faster without leaving ResumePreps

**Acceptance Criteria**:
- [ ] "Apply Now" button visible on all job cards in Job Search
- [ ] Clicking button opens modal showing job + company info
- [ ] Modal includes resume dropdown (pre-selected if only 1), cover letter dropdown (with "Generate New" option)
- [ ] ATS score displayed with warning if <70
- [ ] "Submit" button successfully applies to job board + saves application in ResumePreps
- [ ] Confirmation message with link to job board

#### Story 2: View Application History
**As a** job seeker
**I want to** see all my applications in one place with status tracking
**So that** I can manage my job search and follow up strategically

**Acceptance Criteria**:
- [ ] New `/applications` page shows all submitted applications
- [ ] Table includes: Job Title, Company, Date Applied, Status, ATS Score, Actions
- [ ] Sort/filter by: Status, Date, Company, ATS Score
- [ ] Search by job title or company name
- [ ] Mobile-responsive card view
- [ ] Status badges with color coding (submitted, viewed, rejected, interview, offer)
- [ ] Top stats card: "20 Applied | 3 Interviews | 1 Offer"

#### Story 3: Update Application Status
**As a** job seeker who received interview feedback
**I want to** update my application status in ResumePreps
**So that** I can track my pipeline in one place

**Acceptance Criteria**:
- [ ] Application detail page includes status dropdown
- [ ] Clicking status opens menu: Submitted → Viewed → Rejected → Interview → Offer
- [ ] Status change saves immediately with timestamp
- [ ] Previous statuses visible in timeline
- [ ] Email notification sent when status changes to "Interview"
- [ ] Status updates are immutable (no deletion, only addition)

#### Story 4: ATS Pre-Check Before Apply
**As a** job seeker with low-match resumes
**I want to** see my ATS score before submitting
**So that** I can improve my resume or choose to apply strategically

**Acceptance Criteria**:
- [ ] ATS score (0-100) displayed in apply modal
- [ ] Color-coded: Green (≥70), Yellow (50-70), Red (<50)
- [ ] If score <50: warning "This resume may not pass ATS" with "Edit Resume" link
- [ ] Warning shows top 3 missing keywords from job description
- [ ] User can still submit despite low score (informed choice, not blocking)
- [ ] "Edit Resume" link pre-fills editor with missing keywords highlighted

#### Story 5: Bulk Apply Campaign
**As a** an active job seeker
**I want to** apply to 50 matching jobs at once with one click
**So that** I can submit my resume to many opportunities without manual effort

**Acceptance Criteria**:
- [ ] New `/campaigns/create` page with form for filters (role, location, salary, date posted)
- [ ] Preview shows matching jobs count before launch
- [ ] "Dry Run" button lists exact jobs without submitting
- [ ] "Launch" button starts bulk apply, shows progress in real-time
- [ ] User receives email when campaign completes with count + any failures
- [ ] Max 50 applications per campaign to avoid rate limiting

---

## Feature Requirements

### Milestone 0: Foundation & Database Schema (Week 1)
**Deliverables**:
- `applications` table: user_id, job_id, job_title, company, job_board (linkedin/indeed/lever/greenhouse), application_url, resume_id, cover_letter_id, ats_score, status, applied_at, updated_at
- `application_history` table: application_id, status_before, status_after, changed_at, notes
- `apply_campaigns` table: user_id, name, filters (JSON), job_count, applied_count, failed_count, started_at, completed_at
- Indexes on user_id, status, applied_at for fast queries
- Unique constraint: (user_id, job_board, job_id) to prevent duplicate applications

**Acceptance Criteria**:
- [ ] Schema reviewed by Forge
- [ ] Local migration + rollback test passes
- [ ] Foreign keys validated
- [ ] Sample queries execute <100ms
- [ ] Full schema documentation with field descriptions

---

### Milestone 1: One-Click Apply UX (Weeks 1-2)

#### 1.1: Apply Button & Modal UI (Pixel - Frontend)
**Deliverables**:
- "Apply Now" button on each job card in Job Search panel
- Modal showing: job title, company logo, resume selector, cover letter selector, ATS score, preview
- Loading/success/error states
- Mobile-responsive design (full-width on mobile)

**Acceptance Criteria**:
- [ ] Button appears on all job cards
- [ ] Button disabled if no resume selected
- [ ] Resume dropdown shows all user's resumes with labels
- [ ] Cover letter dropdown shows all cover letters + "Generate New" option
- [ ] ATS score displays with color coding
- [ ] Modal responsive on mobile (buttons 48px min, readable text)

#### 1.2: Application Submission Logic (Forge - Backend)
**Deliverables**:
- Supabase Edge Function: `POST /functions/v1/apply-to-job`
- Input validation (user owns resume, job exists, no duplicate)
- Application record creation
- Response with application_id + redirect link

**Acceptance Criteria**:
- [ ] Function accepts { job_id, resume_id, cover_letter_id }
- [ ] Prevents duplicate applications
- [ ] Returns application_id for tracking
- [ ] Execution time <1000ms
- [ ] Tested with 10 mock requests (8 success, 2 error cases)
- [ ] Specific error messages

---

### Milestone 2: Job Board Integrations (Weeks 2-3)

#### 2.1: LinkedIn Jobs Integration (Forge - Backend)
**Deliverables**:
- Extract LinkedIn job posting ID from job search results
- Selenium-based form auto-fill (name, email, phone, resume PDF upload)
- Detect LinkedIn Easy Apply vs. Classic Apply and route appropriately
- Rate limiting with 2-5s human-like delays
- Error logging for debugging

**Acceptance Criteria**:
- [ ] Successfully applies to 9/10 test LinkedIn jobs (90% success rate)
- [ ] Submission time: 2-5 seconds per application
- [ ] Resume uploads correctly (PDF readable by LinkedIn)
- [ ] No rate limiting errors (no bot detection)
- [ ] Zero account lockouts in 50+ test applications
- [ ] Failed applications logged with specific error reason
- [ ] Graceful degradation: if auto-fill fails, show job board link for manual completion

**Risk Mitigation**: LinkedIn actively blocks bot automation
- Use residential proxies if needed
- Random delays + user-agent rotation
- Fallback to manual guidance (show job link) if detection triggered

---

#### 2.2: Indeed Jobs Integration (Forge - Backend)
**Deliverables**:
- Indeed job ID extraction
- Form parser for Indeed Quick Apply (structured fields)
- Detect "Already Applied" status
- PDF upload vs. text paste logic
- Rate limiting + retry logic

**Acceptance Criteria**:
- [ ] Successfully applies to 8.5/10 test Indeed jobs (85% success rate)
- [ ] Resume uploads correctly
- [ ] Submission time: 2-4 seconds
- [ ] Detects duplicate applications (skips if already applied)
- [ ] No rate limiting errors
- [ ] Passes 30+ test applications

**Risk Mitigation**: Indeed forms change frequently
- Weekly form parser validation script
- Quick update cycle (8h to patch)

---

#### 2.3: Lever & Greenhouse (ATS-Native) Integration (Forge - Backend)
**Deliverables**:
- Lever job posting parsing (API or form-based)
- Greenhouse job posting parsing (API or form-based)
- Structured form field mapping (name, email, phone, custom questions)
- Resume upload + applicant ID capture

**Acceptance Criteria**:
- [ ] Successfully applies to 9.5/10 Lever test jobs (95% success rate)
- [ ] Successfully applies to 9.5/10 Greenhouse test jobs (95% success rate)
- [ ] Handles custom application questions
- [ ] Captures applicant ID for tracking
- [ ] Submission time: 1-3 seconds (faster than LinkedIn/Indeed)
- [ ] Zero validation errors on required fields

---

### Milestone 3: Application Tracking & History (Week 3)

#### 3.1: Application History Page (Pixel - Frontend)
**Deliverables**:
- New page: `/applications`
- Table view (desktop): Job Title, Company, Date Applied, Status, ATS Score, Actions
- Card view (mobile): responsive layout
- Sort/filter: status, date range, company, ATS score
- Search: job title or company
- Pagination: 25 per page

**Acceptance Criteria**:
- [ ] Page loads <1s with 100+ applications
- [ ] All filter combinations work
- [ ] Search returns results within 500ms
- [ ] Mobile layout readable, buttons touch-sized
- [ ] Sort by date (newest first)
- [ ] Status badges color-coded
- [ ] Stats card at top

---

#### 3.2: Status Update & History Timeline (Pixel + Forge)
**Deliverables**:
- Status update dropdown on application detail page
- Timeline view: all status changes chronologically
- Optional note field for manual updates
- Email notification on "Interview" status

**Acceptance Criteria**:
- [ ] User can update status with dropdown
- [ ] Status change saves immediately
- [ ] Timeline displays all changes in correct order
- [ ] Email triggers on "Interview" status
- [ ] Status changes immutable (append-only)

---

### Milestone 4: ATS Pre-Check Integration (Weeks 3-4)

#### 4.1: ATS Score Calculation (Spark + Forge)
**Deliverables**:
- Edge Function to calculate ATS score for job + resume combo
- Score returned in <500ms (cached if same combo)
- Score displayed as 0-100 with label
- Top 3 missing keywords highlighted

**Acceptance Criteria**:
- [ ] ATS score calculated in <500ms (first) or <100ms (cached)
- [ ] Score range 0-100, correct labels
- [ ] Top 3 keywords relevant to job
- [ ] Pass probability aligned with score
- [ ] Score cached for 24h

---

#### 4.2: UX Decision Flow (Pixel - Frontend)
**Deliverables**:
- ATS score displayed prominently in apply modal
- Score <50: red warning, suggest "Improve Resume"
- Score 50-70: yellow warning, allow submit
- Score >70: green, allow submit
- "Improve Resume" link highlights missing keywords

**Acceptance Criteria**:
- [ ] ATS score displays in modal
- [ ] Color-coded warnings (red <50, yellow 50-70, green >70)
- [ ] "Edit Resume" link works
- [ ] User can bypass warning
- [ ] Analytics track submission rate by score bucket

---

### Milestone 5: Bulk Apply Campaigns (Week 4)

#### 5.1: Campaign Builder UI (Pixel - Frontend)
**Deliverables**:
- New page: `/campaigns/create`
- Form with filters: resume, cover letter, role keywords, location, salary, date posted
- Preview: "Found 47 matching jobs. You'll apply to all."
- Dry run button (preview without submitting)
- Launch button (starts campaign)
- Time estimate display

**Acceptance Criteria**:
- [ ] Form accepts all filter types
- [ ] Preview count matches job search query
- [ ] Dry run lists exact jobs
- [ ] Launch button disabled during processing
- [ ] Mobile-friendly

---

#### 5.2: Background Bulk Apply Processing (Forge - Backend)
**Deliverables**:
- Background job queue (n8n or Supabase Cron)
- Bulk apply workflow: iterate jobs with 2-10s delays
- Real-time progress tracking
- Failure handling + retry logic
- Completion email with results

**Acceptance Criteria**:
- [ ] Processes 50 jobs in ~2-3 minutes
- [ ] Real-time progress visible
- [ ] Failed jobs retried next day (max 3 retries)
- [ ] Completion email within 1 minute
- [ ] Max 50 jobs/campaign/day (rate limiting)

---

## Dependencies & Blockers

### Hard Dependencies
1. **Milestone 0** blocks all other milestones (database schema)
2. **Milestone 1** blocks Milestone 2 (one-click flow must exist before job board integrations)
3. **Milestone 2** blocks Milestone 5 (job board integrations must work for bulk apply)

### External Dependencies
- LinkedIn Job Board API (requires partnership, may not be available → fallback to web scraping)
- Indeed API (available, public docs)
- Lever API (available, public docs)
- Greenhouse API (available, public docs)
- Selenium WebDriver (already in stack) for browser automation

### Known Blockers (to resolve pre-implementation)
- LinkedIn API access: Confirm partnership status with LinkedIn. If unavailable, commit to web scraping with proxy rotation.
- Job board rate limits: Document all rate limits + implement queuing accordingly.
- GDPR compliance: Confirm data retention policy for application history.

---

## Out of Scope (Phase 1)

- ❌ Glassdoor integration (low volume, difficult API access)
- ❌ Government job boards (low user demand, complex forms)
- ❌ Phone-screen automation (risk of abuse, low ROI)
- ❌ Salary negotiation tracking (separate feature, phase 2)
- ❌ LinkedIn messaging via ResumePreps (privacy concerns, phase 2+)

---

## Technical Architecture

### Backend Stack
- **Supabase Edge Functions** (Deno) for API endpoints
- **PostgreSQL** for data persistence
- **Selenium WebDriver** on separate server for browser automation (LinkedIn, Indeed)
- **n8n** or **Supabase Cron** for background job queue (bulk apply)
- **Mailgun or Sendgrid** for email notifications

### Frontend Stack
- **React + TypeScript** (existing ResumePreps)
- **Vite** for build
- **TailwindCSS** for styling

### Infrastructure
- Applications deployed on Vercel (frontend) + Supabase (backend)
- Selenium server on separate instance (or containerized)
- Email service via Mailgun/Sendgrid
- Background jobs via n8n (already in use)

---

## Roadmap & Phasing

### MVP (Milestones 0-3): Weeks 1-3
- Basic one-click apply to LinkedIn + Indeed
- Application tracking dashboard
- Status management

**Go-Live Criteria**:
- LinkedIn + Indeed success rate ≥80% (24+ of 30 test)
- All application tracking features working
- Zero duplicate applications in test data
- 50 beta testers with <5% failure rate

### Phase 1B (Milestones 4-5): Weeks 4-5
- ATS pre-check integration
- Bulk apply campaigns

### Phase 2 (Post-MVP)
- Recruiter outreach + follow-up automation
- Email tracking + response detection
- Advanced filters (company ratings, salary, culture fit)

---

## Competitive Positioning

| Feature | ResumePreps | ApplyPass | Teal | Rezi |
|---------|------------|-----------|------|------|
| One-Click Apply | ✅ MVP | ✅ | ✅ | ❌ |
| Job Board Integrations | LinkedIn, Indeed, Lever, GH | LinkedIn, Indeed, GH | LinkedIn, Indeed, GH, Ashby | Remote boards only |
| ATS Pre-Check | ✅ (built into ResumePreps) | ❌ | ⚠️ Generic | ✅ |
| Application History | ✅ | ✅ | ✅ | Limited |
| Bulk Apply | ✅ Phase 1B | ✅ | ❌ | ❌ |
| Resume Builder | ✅ | ⚠️ Basic | ❌ | ✅ |
| Cover Letter Gen | ✅ | ❌ | ✅ | ❌ |
| Interview Prep | ✅ (voice sim) | ❌ | ❌ | ❌ |

**Differentiation**: ResumePreps is the ONLY platform combining ATS-checked resumes + one-click apply + interview prep in one platform. This is our competitive moat.

---

## Rollout Plan

### Week 1: Closed Beta (30 power users)
- Test one-click apply with LinkedIn + Indeed only
- Gather feedback on UX, error handling, success rate
- Monitor for duplicate applications, bot detection

### Week 2: Extended Beta (500 users)
- Roll out to 500 ResumePreps users in US
- Track adoption, feature usage, feedback
- Prepare public launch documentation

### Week 3: Public Launch
- Full rollout to all ResumePreps users
- Announce in product, blog, email
- Monitor support tickets + error logs

### Week 4: Iterate on Feedback
- Fix bugs, UX improvements based on beta feedback
- Prepare Bulk Apply for launch

### Week 5: Bulk Apply Beta
- Roll out Milestone 5 to beta users
- Validate at scale (100+ campaigns)

---

## Success Metrics (30-Day Review)

### User Adoption
- Target: 30%+ of active users launch ≥1 application
- Actual (target): _____

### Feature Engagement
- Target: 20%+ of users return weekly
- Actual: _____

### Application Quality
- Target: 80%+ successful submissions
- Actual: _____

### User Feedback (NPS)
- Target: NPS ≥50 (from "Would you recommend Apply Jobs?" survey)
- Actual: _____

### Support Tickets
- Target: <5 critical bugs reported in first week
- Actual: _____

---

## Resources & Assignments

| Role | Owner | Sprint 1 | Sprint 2 | Sprint 3 | Sprint 4 | Total |
|------|-------|----------|----------|----------|----------|-------|
| **Backend** | Forge | 11h (M0+1) | 22h (M2.1+2.2) | 14h (M2.3+3) | 12h (M4+5) | 59h |
| **Frontend** | Pixel | 6h (M1.1) | 6h (M3.1) | 5h (M3.2+4.2) | 8h (M5.1) | 25h |
| **Resume Intel** | Spark | — | — | 1h (M4.1) | — | 1h |
| **Product** | Scout | 2h (kickoff) | 1h (sync) | 1h (sync) | 1h (launch) | 5h |

---

## Review & Approval

- [ ] Product Manager (Scout): Review & Approve
- [ ] Engineering Lead (Forge): Technical Feasibility
- [ ] Design Lead (Pixel): UX Sign-Off
- [ ] CEO (Atlas): Budget & Timeline Approval

---

**Document Status**: DRAFT → READY FOR ENGINEERING KICKOFF

**Next Steps**:
1. ✅ Milestone breakdown created (APPLY_JOBS_MILESTONE_BREAKDOWN.md)
2. ✅ PRD created (this document)
3. ⏳ Forge technical review + feasibility sign-off
4. ⏳ Pixel UX design + component spec
5. ⏳ Engineering kickoff (Sprint Planning)
6. ⏳ Begin Milestone 0 implementation
