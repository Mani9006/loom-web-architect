# Deployment Reliability Checklist

**Purpose:** SRE guide for safe, reliable deployments to Vercel + Supabase
**Audience:** DevOps, Infrastructure Engineers (Sentinel, Forge)
**SLOs:** 99.9% uptime, <0.1% error rate, <3s p95 latency

---

## Pre-Deployment Phase

### Environment & Version Checks
- [ ] **Node.js version** matches CI/CD environment (v20)
- [ ] **npm dependencies** are locked in `package-lock.json`
- [ ] **Environment variables** (.env, .env.local) are set correctly:
  - [ ] `VITE_SUPABASE_URL` points to correct Supabase project
  - [ ] `VITE_SUPABASE_ANON_KEY` matches Supabase anon key
  - [ ] No secrets committed in `.env` — use GitHub Secrets instead
- [ ] **Git branch** is `main` or approved release branch
- [ ] **No uncommitted changes** in working directory (`git status` clean)

### Code Quality Validation
- [ ] **TypeScript type checking** passes: `npm run type-check`
- [ ] **Linting** passes: `npm run lint`
- [ ] **Test suite** passes: `npm run test`
- [ ] **Test coverage** meets minimum threshold (if defined)
- [ ] **Build succeeds** without warnings: `npm run build`
- [ ] **Build artifacts** exist and contain expected files:
  - [ ] `dist/index.html` exists
  - [ ] `dist/assets/` contains JS bundles
  - [ ] `dist/assets/` contains CSS files
  - [ ] Build size is reasonable (<5 MB recommended)

### Security Pre-Flight
- [ ] **No hardcoded secrets** in source code:
  - [ ] No `PRIVATE_KEY=`, `API_KEY=`, `SECRET=` literals
  - [ ] All secrets use environment variables
- [ ] **Dependency audit** passes: `npm audit --audit-level=moderate`
- [ ] **No console statements** in production code (or intentional)
- [ ] **CORS headers** are configured correctly in Vercel
- [ ] **HTTPS only** enforced in deployment URL

### Deployment Readiness Validation
Run comprehensive pre-deployment checks:
```bash
bash scripts/pre-deploy-validation.sh
```

Expected output:
- All environment checks pass ✓
- All dependencies resolve ✓
- All tests pass ✓
- All builds succeed ✓
- All security checks pass ✓

---

## Deployment Phase

### Pre-Flight Approval
- [ ] **Deployment window approved** (not during business hours if critical)
- [ ] **Stakeholder notification** sent (Slack #deployments)
- [ ] **QA sign-off** obtained (if required)
- [ ] **Rollback plan** communicated to team
- [ ] **On-call engineer** is available for 60 minutes post-deploy

### Vercel Deployment
- [ ] **GitHub Actions CI/CD** completes successfully:
  - [ ] Validation job passes
  - [ ] Test job passes
  - [ ] Build job passes
  - [ ] Security job passes
- [ ] **Vercel deployment** initiated via `amondnet/vercel-action@v25`
  - [ ] Uses `--prod` flag for production
  - [ ] Correct Vercel token & project ID configured
- [ ] **Deployment URL** is correct and accessible
- [ ] **Deployment logs** show no errors

### Supabase Verification
- [ ] **Database migrations** are up-to-date (if any):
  ```bash
  supabase db push
  ```
- [ ] **Edge Functions** are deployed:
  ```bash
  supabase functions deploy --project-ref woxtbyotydxorcdhhivr
  ```
- [ ] **Edge Function logs** show no errors:
  ```bash
  supabase functions logs --project-ref woxtbyotydxorcdhhivr
  ```
- [ ] **Database connection pool** is healthy:
  - [ ] No connection errors
  - [ ] No active locks

---

## Post-Deployment Phase (First 30 minutes)

### Immediate Health Verification
Run post-deployment validation:
```bash
bash scripts/post-deploy-validation.sh <deployment-url>
```

Expected checks:
- [ ] ✓ Vercel connectivity verified
- [ ] ✓ HTTP status 200
- [ ] ✓ Response time < 3s
- [ ] ✓ HTML structure valid
- [ ] ✓ JavaScript bundles loaded
- [ ] ✓ CSS resources loaded
- [ ] ✓ Security headers present
- [ ] ✓ Supabase database reachable
- [ ] ✓ Supabase Auth system healthy
- [ ] ✓ Supabase Storage accessible
- [ ] ✓ Edge Functions deployed

### Error Rate Monitoring
- [ ] **No 5xx errors** in Vercel logs (first 60s post-deploy)
- [ ] **Edge Function error rate < 0.1%**
- [ ] **Database query times** are normal
- [ ] **User reports** — no sudden complaints in Slack

### Feature Verification
- [ ] **Critical user flows** work end-to-end:
  - [ ] User login (OAuth + email)
  - [ ] Resume upload (Supabase Storage)
  - [ ] PDF generation (Edge Function)
  - [ ] Navigation between pages
- [ ] **No console errors** in browser DevTools
- [ ] **No security warnings** in browser console
- [ ] **Analytics events** are firing correctly

### Performance Baseline
- [ ] **Vercel response times** stable (p95 < 3s)
- [ ] **Lighthouse score** maintained or improved
- [ ] **Edge Function latency** acceptable
- [ ] **No unusual memory usage** in Supabase

---

## Ongoing Monitoring (Next 24 hours)

### SLO Compliance
- [ ] **Uptime SLO** maintained: 99.9%
- [ ] **Error rate SLO** maintained: < 0.1%
- [ ] **Latency SLO** maintained: p95 < 3s
- [ ] **No alerts** from monitoring system (Sentry, DataDog, etc.)

### User Feedback
- [ ] **No user-reported issues** in #alerts or #support
- [ ] **Deployment rollout successful** in all regions (Vercel)
- [ ] **No regressed features** from previous release

---

## Rollback Decision Tree

### When to Rollback Immediately (P0)

| Symptom | Action | Rollback |
|---------|--------|----------|
| **App unreachable (HTTP 5xx)** | Ping Vercel status page | ✓ YES |
| **Auth broken (login fails for all)** | Check Supabase Auth logs | ✓ YES |
| **Data loss detected** | Stop deployment, contact DBA | ✓ YES |
| **Security vulnerability exposed** | Implement hotfix immediately | ✓ YES |

### When to Investigate First (P1)

| Symptom | Investigation | Rollback? |
|---------|---|----------|
| **High error rate but app works** | Check error logs, pattern analysis | Maybe |
| **Specific feature broken** | Hotfix available? | Maybe |
| **Slow response times** | DB connection pool? Cache? | No |
| **Minor visual regression** | Can be fixed in next release | No |

### Executing a Rollback

```bash
# 1. Revert Vercel to previous deployment
vercel rollback --prod

# 2. Revert Supabase Edge Functions (if needed)
supabase functions deploy --project-ref woxtbyotydxorcdhhivr [function-name]

# 3. Verify rollback successful
bash scripts/post-deploy-validation.sh <deployment-url>

# 4. Post incident review to #alerts
```

---

## Escalation Contacts

| Issue | Contact | Channel |
|-------|---------|---------|
| **Vercel deployment failure** | Pixel (Frontend) | #deployments |
| **Supabase Edge Function error** | Forge (Backend) | #backend |
| **Database issue** | Sentinel (SRE/Infra) | #alerts |
| **Production outage (P0)** | Atlas (CEO) | #ceo-reports |

---

## Post-Deployment Artifacts

Store these in GitHub Actions artifacts for audit trail:

1. **validation-report.json** — Pre-deployment validation results
2. **deployment-log.txt** — Vercel deployment output
3. **post-deploy-validation-report.json** — Post-deployment health check results
4. **health-check-report.json** — Continuous monitoring report

Access reports in GitHub Actions → Workflow Run → Artifacts

---

## Verification Commands

### Quick Health Check (1 minute)
```bash
# Vercel deployment live?
curl -I https://resumepreps.com

# Response time
curl -o /dev/null -s -w "%{time_total}s\n" https://resumepreps.com

# Supabase database alive?
curl -H "apikey: $SUPABASE_ANON_KEY" \
  https://woxtbyotydxorcdhhivr.supabase.co/rest/v1/profiles?select=count
```

### Full Health Check (5 minutes)
```bash
bash scripts/post-deploy-validation.sh resumepreps.com

# Or with strict mode for detailed checks
bash scripts/post-deploy-validation.sh resumepreps.com --strict
```

### Comprehensive Deployment Report (10 minutes)
```bash
# Run all validation checks
bash scripts/pre-deploy-validation.sh      # Pre-deploy
bash scripts/post-deploy-validation.sh     # Post-deploy
bash scripts/rollback-readiness.sh         # Rollback capability
```

---

## Common Deployment Issues & Solutions

### Issue: Vercel Build Timeout
**Symptom:** GitHub Actions hangs during Vercel deployment
**Solution:**
```bash
# Check Vercel build logs directly
vercel logs --prod

# If stuck, cancel and retry
vercel redeploy --prod
```

### Issue: Supabase Connection Errors
**Symptom:** Application can't connect to database
**Solution:**
```bash
# Verify connection string
echo $VITE_SUPABASE_URL

# Check database connection pool
supabase db usage --project-ref woxtbyotydxorcdhhivr

# Restart if needed
supabase db restart --project-ref woxtbyotydxorcdhhivr
```

### Issue: Edge Function 500 Error
**Symptom:** POST requests to edge function fail
**Solution:**
```bash
# Check logs
supabase functions logs --project-ref woxtbyotydxorcdhhivr generatePDF

# Redeploy function
supabase functions deploy generatePDF --project-ref woxtbyotydxorcdhhivr
```

### Issue: High Latency (> 3s)
**Symptom:** Vercel responses slow
**Solution:**
```bash
# Check Vercel analytics
vercel analytics

# Suspect: database query slow
# Solution: Check database performance or add caching

# Suspect: large JS bundle
# Solution: Run npm run build && du -sh dist/
```

---

## SRE Notes (Sentinel)

**Your responsibilities during deployment:**

1. **Pre-deployment (30 min before):**
   - Verify OpenClaw gateway + proxy running
   - Verify Docker PostgreSQL + Redis healthy
   - Monitor #deployments for approval

2. **During deployment (15 min):**
   - Watch GitHub Actions logs
   - Monitor Vercel build progress
   - Be ready to rollback

3. **Post-deployment (60 min):**
   - Run post-deploy validation script
   - Monitor #alerts for anomalies
   - Document any issues in MEMORY.md

4. **Incident response (if P0):**
   - Activate rollback immediately
   - Notify Atlas in #ceo-reports
   - Run incident postmortem

**Golden Rule:** If unsure, rollback. Data integrity > feature velocity.

---

## Version History

| Date | Author | Changes |
|------|--------|---------|
| 2026-02-21 | Sentinel | Initial creation for KAN-17 |

---

## Related Documents

- [Rollback Procedures](./scripts/rollback-readiness.sh)
- [Health Check Script](./scripts/health-check.sh)
- [Pre-Deploy Validation](./scripts/pre-deploy-validation.sh)
- [CI/CD Pipeline](../.github/workflows/ci.yml)
- [SRE Runbook](../SOUL.md)
