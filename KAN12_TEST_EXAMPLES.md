# KAN-12: Apply Jobs Feature - Test Examples

## Database Schema (Milestone 0)
### Deployment
```bash
# Deploy migration locally
supabase migration up

# Verify tables created
supabase db execute "SELECT tablename FROM pg_tables WHERE schemaname = 'public'"
```

Expected tables:
- `public.applications` - Individual job applications
- `public.application_history` - Status change audit trail
- `public.apply_campaigns` - Batch application campaigns

### Rollback
```bash
supabase migration down
```

---

## Edge Function (Milestone 1.2)

### Endpoint
```
POST /functions/v1/apply-to-job
```

### Authentication
Requires valid JWT token in Authorization header (extracted from Supabase JWT):
```
Authorization: Bearer <SUPABASE_JWT_TOKEN>
```

### Request Schema
```json
{
  "job_id": "string (required)",
  "job_title": "string (required)",
  "company": "string (required)",
  "job_board": "string (required, e.g., 'linkedin', 'indeed', 'glassdoor')",
  "application_url": "string (optional)",
  "resume_id": "string (required, UUID of user_documents record)",
  "cover_letter_id": "string (optional, UUID of user_documents record)",
  "ats_score": "number (optional)"
}
```

### Response Schema - Success (201)
```json
{
  "success": true,
  "application_id": "uuid-string",
  "message": "Application submitted for <job_title> at <company>"
}
```

### Response Schema - Error
```json
{
  "success": false,
  "message": "Specific error message"
}
```

---

## Test Scenarios

### Setup: Create Test User, Resume, and Job

#### 1. Create Test User (via Supabase Auth)
```bash
# Assuming you have a test user created in Supabase Auth
# Get their JWT token (usually available from client after login)
TEST_USER_ID="<user-uuid>"
JWT_TOKEN="<your-jwt-token>"
```

#### 2. Create Resume Document
```bash
curl -X POST "https://<project>.supabase.co/rest/v1/user_documents" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "'$TEST_USER_ID'",
    "file_name": "resume.pdf",
    "file_type": "pdf",
    "category": "resume",
    "extracted_text": "Senior Software Engineer with 5 years of experience"
  }'
```

Response (note the `id`):
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "user_id": "...",
  "file_name": "resume.pdf",
  "category": "resume"
}
```

#### 3. Create Cover Letter Document (Optional)
```bash
curl -X POST "https://<project>.supabase.co/rest/v1/user_documents" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "'$TEST_USER_ID'",
    "file_name": "cover_letter.pdf",
    "file_type": "pdf",
    "category": "cover_letter",
    "extracted_text": "I am interested in the Senior Software Engineer position..."
  }'
```

Response (note the `id`):
```json
{
  "id": "660e8400-e29b-41d4-a716-446655440111",
  "user_id": "...",
  "file_name": "cover_letter.pdf",
  "category": "cover_letter"
}
```

---

### SUCCESS TEST SCENARIOS

#### Success Test 1: Basic Application (Resume Only)
```bash
RESUME_ID="550e8400-e29b-41d4-a716-446655440000"

curl -X POST "https://<project>.supabase.co/functions/v1/apply-to-job" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "job_id": "job_123",
    "job_title": "Senior Software Engineer",
    "company": "Google",
    "job_board": "linkedin",
    "application_url": "https://linkedin.com/jobs/view/123",
    "resume_id": "'$RESUME_ID'"
  }'
```

**Expected Response (201):**
```json
{
  "success": true,
  "application_id": "770e8400-e29b-41d4-a716-446655440222",
  "message": "Application submitted for Senior Software Engineer at Google"
}
```

#### Success Test 2: Application with Cover Letter
```bash
COVER_LETTER_ID="660e8400-e29b-41d4-a716-446655440111"

curl -X POST "https://<project>.supabase.co/functions/v1/apply-to-job" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "job_id": "job_456",
    "job_title": "Product Manager",
    "company": "Microsoft",
    "job_board": "indeed",
    "resume_id": "'$RESUME_ID'",
    "cover_letter_id": "'$COVER_LETTER_ID'"
  }'
```

**Expected Response (201):**
```json
{
  "success": true,
  "application_id": "880e8400-e29b-41d4-a716-446655440333",
  "message": "Application submitted for Product Manager at Microsoft"
}
```

#### Success Test 3: Application with ATS Score
```bash
curl -X POST "https://<project>.supabase.co/functions/v1/apply-to-job" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "job_id": "job_789",
    "job_title": "Data Scientist",
    "company": "Netflix",
    "job_board": "glassdoor",
    "resume_id": "'$RESUME_ID'",
    "ats_score": 87
  }'
```

**Expected Response (201):**
```json
{
  "success": true,
  "application_id": "990e8400-e29b-41d4-a716-446655440444",
  "message": "Application submitted for Data Scientist at Netflix"
}
```

#### Success Test 4: Multiple Applications to Different Jobs
```bash
curl -X POST "https://<project>.supabase.co/functions/v1/apply-to-job" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "job_id": "job_apple_001",
    "job_title": "Hardware Engineer",
    "company": "Apple",
    "job_board": "linkedin",
    "resume_id": "'$RESUME_ID'"
  }'
```

**Expected Response (201):**
```json
{
  "success": true,
  "application_id": "aa0e8400-e29b-41d4-a716-446655440555",
  "message": "Application submitted for Hardware Engineer at Apple"
}
```

#### Success Test 5: Application with All Optional Fields
```bash
curl -X POST "https://<project>.supabase.co/functions/v1/apply-to-job" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "job_id": "job_amazon_002",
    "job_title": "Cloud Architect",
    "company": "Amazon",
    "job_board": "linkedin",
    "application_url": "https://amazon.jobs/en/jobs/123456",
    "resume_id": "'$RESUME_ID'",
    "cover_letter_id": "'$COVER_LETTER_ID'",
    "ats_score": 92
  }'
```

**Expected Response (201):**
```json
{
  "success": true,
  "application_id": "bb0e8400-e29b-41d4-a716-446655440666",
  "message": "Application submitted for Cloud Architect at Amazon"
}
```

---

### ERROR TEST SCENARIOS

#### Error Test 1: Missing Authorization Header
```bash
curl -X POST "https://<project>.supabase.co/functions/v1/apply-to-job" \
  -H "Content-Type: application/json" \
  -d '{
    "job_id": "job_123",
    "job_title": "Engineer",
    "company": "Google",
    "job_board": "linkedin",
    "resume_id": "'$RESUME_ID'"
  }'
```

**Expected Response (401):**
```json
{
  "success": false,
  "message": "Unauthorized: Invalid or missing authentication token"
}
```

#### Error Test 2: Missing Required Field (job_id)
```bash
curl -X POST "https://<project>.supabase.co/functions/v1/apply-to-job" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "job_title": "Engineer",
    "company": "Google",
    "job_board": "linkedin",
    "resume_id": "'$RESUME_ID'"
  }'
```

**Expected Response (400):**
```json
{
  "success": false,
  "message": "job_id is required and must be a string"
}
```

#### Error Test 3: Missing Resume ID
```bash
curl -X POST "https://<project>.supabase.co/functions/v1/apply-to-job" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "job_id": "job_123",
    "job_title": "Engineer",
    "company": "Google",
    "job_board": "linkedin"
  }'
```

**Expected Response (400):**
```json
{
  "success": false,
  "message": "resume_id is required and must be a string (UUID)"
}
```

#### Error Test 4: Resume Not Found / Not Owned by User
```bash
INVALID_RESUME_ID="00000000-0000-0000-0000-000000000000"

curl -X POST "https://<project>.supabase.co/functions/v1/apply-to-job" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "job_id": "job_123",
    "job_title": "Engineer",
    "company": "Google",
    "job_board": "linkedin",
    "resume_id": "'$INVALID_RESUME_ID'"
  }'
```

**Expected Response (404):**
```json
{
  "success": false,
  "message": "Resume not found or access denied"
}
```

#### Error Test 5: Duplicate Application (Same Job Board + Job ID)
```bash
# First application succeeds
curl -X POST "https://<project>.supabase.co/functions/v1/apply-to-job" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "job_id": "duplicate_job_123",
    "job_title": "Engineer",
    "company": "Facebook",
    "job_board": "linkedin",
    "resume_id": "'$RESUME_ID'"
  }'

# Second application with SAME job_id + job_board FAILS
curl -X POST "https://<project>.supabase.co/functions/v1/apply-to-job" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "job_id": "duplicate_job_123",
    "job_title": "Engineer",
    "company": "Facebook",
    "job_board": "linkedin",
    "resume_id": "'$RESUME_ID'"
  }'
```

**Expected Response (409):**
```json
{
  "success": false,
  "message": "Already applied to this job with status: pending"
}
```

---

## Verification Queries

### View All Applications for a User
```sql
SELECT id, job_id, job_title, company, status, applied_at
FROM public.applications
WHERE user_id = '<user-id>'
ORDER BY applied_at DESC;
```

### View Application History
```sql
SELECT a.job_title, a.company, h.status_before, h.status_after, h.changed_at
FROM public.application_history h
JOIN public.applications a ON h.application_id = a.id
WHERE a.user_id = '<user-id>'
ORDER BY h.changed_at DESC;
```

### Verify Unique Constraint
```sql
-- Should return 1 row (first application still exists)
SELECT COUNT(*) as duplicate_count
FROM public.applications
WHERE user_id = '<user-id>'
  AND job_board = 'linkedin'
  AND job_id = 'duplicate_job_123';
```

---

## Performance Testing

### Execution Time Benchmark
All operations should complete in **< 1000ms** (1 second):

1. JWT token extraction: ~1-2ms
2. Input validation: ~2-5ms
3. Resume verification: ~50-100ms
4. Duplicate check: ~50-100ms
5. Application creation: ~50-100ms
6. **Total: 150-310ms** (well under limit)

### Load Testing Example
```bash
# Test 10 concurrent applications
for i in {1..10}; do
  curl -X POST "https://<project>.supabase.co/functions/v1/apply-to-job" \
    -H "Authorization: Bearer $JWT_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "job_id": "job_'$i'",
      "job_title": "Engineer",
      "company": "Company '$i'",
      "job_board": "linkedin",
      "resume_id": "'$RESUME_ID'"
    }' &
done
wait
```

---

## Type Safety Verification

### TypeScript Checks
```bash
# Run TypeScript compiler in the functions directory
cd supabase/functions/apply-to-job
deno check index.ts
```

### Expected Result
- No `any` types in public APIs
- All input types validated at runtime
- All database queries type-safe (Supabase client types)

---

## Database Rollback Testing

### Test Rollback
```bash
# Migrate up (apply schema)
supabase migration up

# Verify tables exist
supabase db execute "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('applications', 'application_history', 'apply_campaigns')"
# Expected: 3

# Rollback migration
supabase migration down

# Verify tables removed
supabase db execute "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('applications', 'application_history', 'apply_campaigns')"
# Expected: 0
```

---

## Comprehensive Checklist

- [x] Migration runs cleanly with `supabase migration up`
- [x] Rollback works (migrate down removes all objects)
- [x] Edge Function accepts valid input
- [x] Edge Function returns application_id on success
- [x] Prevents duplicate applications (UNIQUE constraint + query check)
- [x] Returns specific error messages:
  - [x] "Unauthorized: Invalid or missing authentication token" (401)
  - [x] "job_id is required and must be a string" (400)
  - [x] "Resume not found or access denied" (404)
  - [x] "Already applied to this job with status: pending" (409)
  - [x] Generic "Internal server error" (500)
- [x] Type-safe (no `any` types)
- [x] All functions execute in < 1s
- [x] Comprehensive logging for debugging
- [x] CORS headers included
- [x] Idempotent (safe to call multiple times)

---

## Debugging

### View Function Logs
```bash
supabase functions list
supabase functions logs apply-to-job --tail
```

### Common Issues

**Issue: "Resume not found"**
- Verify resume_id is correct UUID
- Verify resume belongs to authenticated user
- Verify category is 'resume' (case-sensitive)

**Issue: "Already applied to this job"**
- This is expected behavior - prevents duplicate applications
- Check with: `SELECT * FROM applications WHERE user_id = '<id>' AND job_board = 'X' AND job_id = 'Y'`

**Issue: "Invalid authentication token"**
- Ensure JWT token is passed in Authorization header
- Token format: `Authorization: Bearer <JWT_TOKEN>`
- Verify token is valid and not expired

---
