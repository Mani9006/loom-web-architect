#!/usr/bin/env python3
"""
Kimi K2.5 Agent Swarm Job Finder — CLI Version
================================================
Uses kimi-cli (premium subscription) to find jobs across all roles
and saves them directly to the ResumePreps Supabase database.

Designed to run every 2-3 hours on Mac Mini via launchd.

Usage:
    python3 find-jobs.py                  # Full run (all roles)
    python3 find-jobs.py --roles "Software Engineer,Data Scientist"  # Specific roles
    python3 find-jobs.py --batch-size 15  # Custom batch size
    python3 find-jobs.py --dry-run        # Don't save to DB, just print
"""

import json
import os
import re
import subprocess
import sys
import time
import hashlib
import argparse
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

# ── Config ────────────────────────────────────────────────────────────

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://woxtbyotydxorcdhhivr.supabase.co")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

LOG_DIR = Path.home() / ".kimi-job-finder"
LOG_DIR.mkdir(exist_ok=True)
LOG_FILE = LOG_DIR / "job-finder.log"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(LOG_FILE),
        logging.StreamHandler(sys.stdout),
    ],
)
log = logging.getLogger("kimi-job-finder")

# ── All roles ─────────────────────────────────────────────────────────

ALL_ROLES = [
    # Software Engineering
    "Software Engineer", "Frontend Developer", "Backend Developer", "Full Stack Developer",
    "Mobile Developer", "iOS Developer", "Android Developer", "DevOps Engineer",
    "Cloud Engineer", "Site Reliability Engineer", "QA Engineer", "Security Engineer",
    "Platform Engineer", "Embedded Engineer", "Web Developer", "Software Architect",
    # Data & AI
    "Data Scientist", "Data Analyst", "Data Engineer", "Machine Learning Engineer",
    "AI Engineer", "ML Ops Engineer", "Analytics Engineer", "NLP Engineer",
    "Computer Vision Engineer", "Business Intelligence Analyst",
    # Product & Design
    "Product Manager", "Product Designer", "UX Designer", "UI Designer",
    "UX Researcher", "Graphic Designer",
    # Management
    "Engineering Manager", "Technical Program Manager", "Project Manager",
    "Scrum Master", "VP of Engineering",
    # Business
    "Business Analyst", "Solutions Architect", "Sales Engineer", "Technical Writer",
    "Marketing Manager", "Growth Manager", "Customer Success Manager",
    # Cybersecurity
    "Cybersecurity Analyst", "Penetration Tester", "Security Architect",
    "Information Security Manager",
    # Cloud & Infrastructure
    "Cloud Architect", "AWS Solutions Architect", "Azure Engineer",
    "Kubernetes Engineer", "Infrastructure Engineer", "Network Engineer",
    # Emerging
    "Blockchain Developer", "Robotics Engineer", "Game Developer",
    "Developer Advocate",
]

# ── URL Validation ────────────────────────────────────────────────────

GENERIC_URL_PATTERNS = [
    r"/careers/?$", r"/careers/?\?", r"/careers/search",
    r"/jobs/?$", r"/jobs/?\?", r"/jobs/search",
    r"linkedin\.com/jobs/search", r"indeed\.com/jobs\?",
    r"glassdoor\.com/Job/.*-jobs",
]

NON_US_PATTERNS = [
    r"\bindia\b", r"\bcanada\b", r"\buk\b", r"\bunited kingdom\b",
    r"\bgermany\b", r"\bfrance\b", r"\baustralia\b", r"\bsingapore\b",
    r"\bjapan\b", r"\bchina\b", r"\bbangalore\b", r"\bhyderabad\b",
    r"\bmumbai\b", r"\bdelhi\b", r"\btoronto\b", r"\blondon\b",
    r"\bberlin\b", r"\bparis\b", r"\btokyo\b",
]


def is_valid_job(job: dict) -> bool:
    """Validate a job entry."""
    title = job.get("title", "")
    company = job.get("company", "")
    desc = job.get("description", "")
    url = job.get("apply_url", "")
    location = job.get("location", "")

    if not title or len(title) < 3:
        return False
    if not company or len(company) < 2:
        return False
    if not desc or len(desc) < 30:
        return False
    if not url or not url.startswith("http"):
        return False

    # Reject generic URLs
    url_lower = url.lower()
    for pattern in GENERIC_URL_PATTERNS:
        if re.search(pattern, url_lower, re.IGNORECASE):
            return False

    # Reject non-US locations
    loc_lower = location.lower()
    for pattern in NON_US_PATTERNS:
        if re.search(pattern, loc_lower, re.IGNORECASE):
            return False

    # Reject generic companies
    comp_lower = company.lower()
    if comp_lower in ("unknown", "various", "confidential", "confidential company"):
        return False

    return True


def job_fingerprint(title: str, company: str) -> str:
    """Create a unique fingerprint for deduplication."""
    raw = f"{title.lower().strip()}-{company.lower().strip()}"
    clean = re.sub(r"[^a-z0-9-]", "", raw)
    return f"kimi-{clean}"


def classify_role(title: str) -> str:
    """Classify a job title into a category."""
    t = title.lower()
    if re.search(r"front.?end|react|vue|angular", t): return "Engineering"
    if re.search(r"back.?end|server|api", t): return "Engineering"
    if re.search(r"full.?stack", t): return "Engineering"
    if re.search(r"data scien|machine learn|ml |ai eng|deep learn", t): return "AI & ML"
    if re.search(r"data analy|business intel|analytics", t): return "Data & Analytics"
    if re.search(r"data eng|etl|pipeline", t): return "Data & Analytics"
    if re.search(r"devops|sre|site reli|infrastructure|platform eng", t): return "DevOps & Cloud"
    if re.search(r"cloud|aws|azure|gcp|kubernetes", t): return "DevOps & Cloud"
    if re.search(r"product manage", t): return "Product"
    if re.search(r"ux|ui|design|graphic", t): return "Design"
    if re.search(r"security|cyber|penetration|soc ", t): return "Security"
    if re.search(r"project manage|scrum|agile", t): return "Management"
    if re.search(r"mobile|ios|android", t): return "Mobile"
    if re.search(r"qa|test|quality", t): return "QA & Testing"
    if re.search(r"software|developer|engineer|programmer", t): return "Engineering"
    return "Other"


def parse_salary(salary: str) -> tuple[Optional[int], Optional[int]]:
    """Parse salary string into min/max integers."""
    if not salary:
        return None, None
    matches = re.findall(r"\$?([\d,]+)", salary)
    if not matches:
        return None, None
    nums = [int(m.replace(",", "")) for m in matches]
    if len(nums) >= 2:
        return min(nums), max(nums)
    return nums[0], nums[0]


# ── Kimi CLI Interface ───────────────────────────────────────────────

def call_kimi(prompt: str, timeout: int = 180) -> str:
    """Call kimi-cli with a prompt and return the response."""
    try:
        result = subprocess.run(
            ["kimi", "-p", prompt],
            capture_output=True,
            text=True,
            timeout=timeout,
            env={**os.environ, "PYTHONIOENCODING": "utf-8"},
        )
        if result.returncode != 0:
            log.error(f"kimi-cli error: {result.stderr[:500]}")
            return ""
        return result.stdout.strip()
    except subprocess.TimeoutExpired:
        log.error(f"kimi-cli timed out after {timeout}s")
        return ""
    except FileNotFoundError:
        log.error("kimi-cli not found! Install with: pip install kimi-cli")
        sys.exit(1)
    except Exception as e:
        log.error(f"kimi-cli exception: {e}")
        return ""


def find_jobs_batch(roles: list[str], batch_num: int) -> list[dict]:
    """Use Kimi to find jobs for a batch of roles."""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    roles_str = ", ".join(roles)

    prompt = f"""You are a job search engine. Find REAL, currently open job listings in the UNITED STATES for these roles: {roles_str}

Find 2-3 jobs per role (total {len(roles) * 2}-{len(roles) * 3} jobs). Today is {today}.

RULES:
- ONLY US jobs
- apply_url must link to the SPECIFIC job posting (NOT generic careers pages)
- Include detailed descriptions (5+ sentences)
- Different companies for variety
- Include salary when available

Return ONLY valid JSON, nothing else:
{{"jobs":[{{"title":"","company":"","location":"","description":"","apply_url":"https://...","salary":"","job_type":"Full-time","remote":false,"date_posted":"Today","source":"","experience_level":"Mid-Level"}}]}}"""

    log.info(f"  Batch {batch_num}: Searching {len(roles)} roles...")
    response = call_kimi(prompt, timeout=180)

    if not response:
        log.warning(f"  Batch {batch_num}: Empty response")
        return []

    # Extract JSON from response
    jobs = []
    try:
        # Try direct parse
        parsed = json.loads(response)
        jobs = parsed.get("jobs", [])
    except json.JSONDecodeError:
        # Try to find JSON in the response
        json_match = re.search(r"\{[\s\S]*\"jobs\"[\s\S]*\}", response)
        if json_match:
            try:
                parsed = json.loads(json_match.group(0))
                jobs = parsed.get("jobs", [])
            except json.JSONDecodeError:
                log.warning(f"  Batch {batch_num}: Failed to parse JSON response")
                # Save raw response for debugging
                debug_file = LOG_DIR / f"batch_{batch_num}_raw.txt"
                debug_file.write_text(response[:5000])

    log.info(f"  Batch {batch_num}: {len(jobs)} jobs found")
    return jobs


# ── Supabase Database ────────────────────────────────────────────────

def save_to_supabase(jobs: list[dict]) -> int:
    """Save validated jobs to Supabase using REST API."""
    if not SUPABASE_SERVICE_KEY:
        log.error("SUPABASE_SERVICE_ROLE_KEY not set! Cannot save to database.")
        return 0

    saved = 0
    headers = {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates",
    }

    # Save to jobs table in batches
    BATCH = 25
    for i in range(0, len(jobs), BATCH):
        batch = jobs[i:i + BATCH]

        job_rows = []
        for j in batch:
            sal_min, sal_max = parse_salary(j.get("salary", ""))
            fp = job_fingerprint(j["title"], j["company"])
            job_rows.append({
                "title": j["title"],
                "company": j["company"],
                "location": j.get("location", ""),
                "description": j.get("description", ""),
                "apply_url": j["apply_url"],
                "source": f"kimi-{j.get('source', 'ai')}".lower()[:50],
                "date_posted": datetime.now(timezone.utc).isoformat(),
                "salary_min": sal_min,
                "salary_max": sal_max,
                "job_type": j.get("job_type"),
                "remote": j.get("remote", False),
                "external_id": f"{fp}-{int(time.time())}",
            })

        try:
            import urllib.request
            req = urllib.request.Request(
                f"{SUPABASE_URL}/rest/v1/jobs",
                data=json.dumps(job_rows).encode("utf-8"),
                headers=headers,
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=30) as resp:
                if resp.status in (200, 201):
                    saved += len(batch)
                else:
                    log.error(f"Jobs insert failed: {resp.status}")
        except Exception as e:
            log.error(f"Jobs insert error: {e}")

        # Also save to cached_jobs
        cached_rows = []
        for j in batch:
            fp = job_fingerprint(j["title"], j["company"])
            cached_rows.append({
                "title": j["title"],
                "company": j["company"],
                "location": j.get("location", ""),
                "description": j.get("description", ""),
                "apply_url": j["apply_url"],
                "salary": j.get("salary"),
                "job_type": j.get("job_type"),
                "remote": j.get("remote", False),
                "date_posted": j.get("date_posted", "Today"),
                "source": f"Kimi {j.get('source', 'AI Search')}",
                "role_category": classify_role(j["title"]),
                "experience_level": j.get("experience_level", "Mid-Level"),
                "job_fingerprint": fp,
                "expires_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
            })

        try:
            req2 = urllib.request.Request(
                f"{SUPABASE_URL}/rest/v1/cached_jobs",
                data=json.dumps(cached_rows).encode("utf-8"),
                headers=headers,
                method="POST",
            )
            urllib.request.urlopen(req2, timeout=30)
        except Exception as e:
            log.warning(f"Cached jobs insert: {e}")

    return saved


# ── Main ──────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Kimi K2.5 Agent Swarm Job Finder")
    parser.add_argument("--roles", type=str, help="Comma-separated roles to search")
    parser.add_argument("--batch-size", type=int, default=10, help="Roles per Kimi call (default: 10)")
    parser.add_argument("--dry-run", action="store_true", help="Don't save to DB, just print results")
    parser.add_argument("--max-batches", type=int, default=0, help="Limit number of batches (0=all)")
    args = parser.parse_args()

    start_time = time.time()
    log.info("=" * 60)
    log.info(f"Kimi Job Finder starting at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    # Determine roles
    if args.roles:
        roles = [r.strip() for r in args.roles.split(",") if r.strip()]
    else:
        roles = ALL_ROLES.copy()

    log.info(f"Searching {len(roles)} roles with batch size {args.batch_size}")

    # Split into batches
    batches = []
    for i in range(0, len(roles), args.batch_size):
        batches.append(roles[i:i + args.batch_size])

    if args.max_batches > 0:
        batches = batches[:args.max_batches]
        log.info(f"Limited to {len(batches)} batches")

    # Process batches
    all_jobs = []
    for i, batch in enumerate(batches):
        jobs = find_jobs_batch(batch, i + 1)
        all_jobs.extend(jobs)
        # Small delay between batches to be nice to Kimi
        if i < len(batches) - 1:
            time.sleep(3)

    log.info(f"Total raw jobs: {len(all_jobs)}")

    # Validate and deduplicate
    seen = set()
    valid_jobs = []
    for job in all_jobs:
        if not is_valid_job(job):
            continue
        fp = job_fingerprint(job["title"], job["company"])
        if fp in seen:
            continue
        seen.add(fp)
        valid_jobs.append(job)

    log.info(f"After validation: {len(valid_jobs)} unique valid jobs")

    if args.dry_run:
        log.info("DRY RUN — not saving to database")
        for j in valid_jobs[:10]:
            log.info(f"  {j['title']} @ {j['company']} ({j.get('location', 'N/A')})")
            log.info(f"    URL: {j.get('apply_url', 'N/A')}")
        if len(valid_jobs) > 10:
            log.info(f"  ... and {len(valid_jobs) - 10} more")
    else:
        saved = save_to_supabase(valid_jobs)
        log.info(f"Saved to database: {saved} jobs")

    elapsed = round(time.time() - start_time)
    log.info(f"Complete in {elapsed}s — {len(valid_jobs)} jobs found")
    log.info("=" * 60)

    # Write summary for monitoring
    summary = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "roles_searched": len(roles),
        "raw_jobs": len(all_jobs),
        "valid_jobs": len(valid_jobs),
        "elapsed_seconds": elapsed,
    }
    summary_file = LOG_DIR / "last-run.json"
    summary_file.write_text(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
