#!/usr/bin/env python3
"""
Kimi K2.5 Agent Swarm Job Finder — CLI Version (v2)
=====================================================
Uses kimi-cli (premium subscription) to find jobs across all roles
and saves them directly to the ResumePreps Supabase database.

Requires: Python 3.12+, kimi-cli (pip install kimi-cli)

Usage:
    python3 find-jobs.py                              # Full run (all 60+ roles)
    python3 find-jobs.py --roles "Software Engineer,Data Scientist"
    python3 find-jobs.py --batch-size 15              # Roles per Kimi call
    python3 find-jobs.py --dry-run                    # Print only, no DB save
    python3 find-jobs.py --max-batches 2              # Limit for testing
    python3 find-jobs.py --concurrent 3               # Parallel Kimi calls
    python3 find-jobs.py --status                     # Show last run summary
"""

import json
import os
import re
import subprocess
import sys
import time
import argparse
import logging
import shutil
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

# ── Config ────────────────────────────────────────────────────────────

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://woxtbyotydxorcdhhivr.supabase.co")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

LOG_DIR = Path.home() / ".kimi-job-finder"
LOG_DIR.mkdir(exist_ok=True)
LOG_FILE = LOG_DIR / "job-finder.log"
SUMMARY_FILE = LOG_DIR / "last-run.json"
ENV_FILE = LOG_DIR / ".env"

# Rotate log if > 5MB
if LOG_FILE.exists() and LOG_FILE.stat().st_size > 5_000_000:
    LOG_FILE.rename(LOG_FILE.with_suffix(".log.bak"))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(LOG_FILE),
        logging.StreamHandler(sys.stdout),
    ],
)
log = logging.getLogger("kimi-job-finder")


# ── Load .env if exists ──────────────────────────────────────────────

def load_env():
    """Load environment variables from ~/.kimi-job-finder/.env"""
    global SUPABASE_URL, SUPABASE_SERVICE_KEY
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, value = line.partition("=")
                os.environ.setdefault(key.strip(), value.strip())
    SUPABASE_URL = os.environ.get("SUPABASE_URL", SUPABASE_URL)
    SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", SUPABASE_SERVICE_KEY)


# ── All roles ─────────────────────────────────────────────────────────

ALL_ROLES = [
    # Software Engineering (18)
    "Software Engineer", "Frontend Developer", "Backend Developer",
    "Full Stack Developer", "Mobile Developer", "iOS Developer",
    "Android Developer", "DevOps Engineer", "Cloud Engineer",
    "Site Reliability Engineer", "QA Engineer", "Security Engineer",
    "Platform Engineer", "Embedded Engineer", "Web Developer",
    "Software Architect", "Systems Engineer", "Test Engineer",
    # Data & AI (11)
    "Data Scientist", "Data Analyst", "Data Engineer",
    "Machine Learning Engineer", "AI Engineer", "ML Ops Engineer",
    "Analytics Engineer", "NLP Engineer", "Computer Vision Engineer",
    "Prompt Engineer", "Business Intelligence Analyst",
    # Product & Design (7)
    "Product Manager", "Product Designer", "UX Designer", "UI Designer",
    "UX Researcher", "Graphic Designer", "Content Designer",
    # Management (6)
    "Engineering Manager", "Technical Program Manager", "Project Manager",
    "Scrum Master", "VP of Engineering", "Agile Coach",
    # Business (7)
    "Business Analyst", "Solutions Architect", "Sales Engineer",
    "Technical Writer", "Marketing Manager", "Growth Manager",
    "Customer Success Manager",
    # Cybersecurity (5)
    "Cybersecurity Analyst", "Penetration Tester", "Security Architect",
    "Information Security Manager", "SOC Analyst",
    # Cloud & Infrastructure (6)
    "Cloud Architect", "AWS Solutions Architect", "Azure Engineer",
    "Kubernetes Engineer", "Infrastructure Engineer", "Network Engineer",
    # Emerging (5)
    "Blockchain Developer", "Robotics Engineer", "Game Developer",
    "Developer Advocate", "AR/VR Developer",
]

# ── URL Validation ────────────────────────────────────────────────────

GENERIC_URL_PATTERNS = [
    r"/careers/?$", r"/careers/?\?", r"/careers/search", r"/careers/home",
    r"/jobs/?$", r"/jobs/?\?", r"/jobs/search",
    r"linkedin\.com/jobs/search", r"indeed\.com/jobs\?",
    r"indeed\.com/q-", r"glassdoor\.com/Job/.*-jobs",
    r"ziprecruiter\.com/jobs/search", r"monster\.com/jobs/search",
]

NON_US_PATTERNS = [
    r"\bindia\b", r"\bcanada\b", r"\buk\b", r"\bunited kingdom\b",
    r"\bgermany\b", r"\bfrance\b", r"\baustralia\b", r"\bsingapore\b",
    r"\bjapan\b", r"\bchina\b", r"\bbangalore\b", r"\bhyderabad\b",
    r"\bmumbai\b", r"\bdelhi\b", r"\bpune\b", r"\bchennai\b",
    r"\btoronto\b", r"\bvancouver\b", r"\blondon\b", r"\bberlin\b",
    r"\bparis\b", r"\btokyo\b", r"\bsydney\b", r"\bmelbourne\b",
    r"\bdubai\b", r"\bnigeria\b", r"\bphilippines\b",
]


def is_valid_job(job: dict) -> tuple[bool, str]:
    """Validate a job entry. Returns (valid, reason)."""
    title = job.get("title", "")
    company = job.get("company", "")
    desc = job.get("description", "")
    url = job.get("apply_url", "")
    location = job.get("location", "")

    if not title or len(title) < 3:
        return False, "missing title"
    if not company or len(company) < 2:
        return False, "missing company"
    if not desc or len(desc) < 30:
        return False, "short description"
    if not url or not url.startswith("http"):
        return False, "invalid URL"

    url_lower = url.lower()
    if any(re.search(p, url_lower) for p in GENERIC_URL_PATTERNS):
        return False, "generic career page URL"

    loc_lower = location.lower()
    if any(re.search(p, loc_lower) for p in NON_US_PATTERNS):
        return False, f"non-US: {location}"

    comp_lower = company.lower()
    if comp_lower in ("unknown", "various", "confidential", "confidential company"):
        return False, "generic company"

    return True, "ok"


def job_fingerprint(title: str, company: str) -> str:
    """Create a unique fingerprint for deduplication."""
    raw = f"{title.lower().strip()}-{company.lower().strip()}"
    clean = re.sub(r"[^a-z0-9-]", "", raw)
    return f"kimi-{clean}"


def classify_role(title: str) -> str:
    """Classify a job title into a category."""
    t = title.lower()
    patterns = [
        (r"front.?end|react|vue|angular|ui developer", "Engineering"),
        (r"back.?end|server|api", "Engineering"),
        (r"full.?stack", "Engineering"),
        (r"data scien|machine learn|ml |ai eng|deep learn", "AI & ML"),
        (r"data analy|business intel|analytics", "Data & Analytics"),
        (r"data eng|etl|pipeline", "Data & Analytics"),
        (r"devops|sre|site reli|infrastructure|platform eng", "DevOps & Cloud"),
        (r"cloud|aws|azure|gcp|kubernetes", "DevOps & Cloud"),
        (r"product manage|product own", "Product"),
        (r"ux|ui|design|graphic", "Design"),
        (r"security|cyber|penetration|soc ", "Security"),
        (r"project manage|scrum|agile", "Management"),
        (r"engineer.*manager|vp.*eng|cto|director.*eng", "Leadership"),
        (r"mobile|ios|android", "Mobile"),
        (r"qa|test|quality", "QA & Testing"),
        (r"marketing|growth|seo", "Marketing"),
        (r"sales|business dev", "Sales"),
        (r"technical writ|content|documentation", "Content"),
        (r"recruit|talent", "Recruiting"),
        (r"software|developer|engineer|programmer", "Engineering"),
    ]
    for pattern, category in patterns:
        if re.search(pattern, t):
            return category
    return "Other"


def parse_salary(salary: str | None) -> tuple[int | None, int | None]:
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

def find_kimi_binary() -> str:
    """Find the kimi CLI binary path."""
    # Check standard locations
    kimi = shutil.which("kimi")
    if kimi:
        return kimi
    # Check common Python bin locations
    for path in [
        Path.home() / ".local" / "bin" / "kimi",
        Path.home() / "Library" / "Python" / "3.12" / "bin" / "kimi",
        Path.home() / "Library" / "Python" / "3.13" / "bin" / "kimi",
        Path("/opt/homebrew/bin/kimi"),
        Path("/usr/local/bin/kimi"),
    ]:
        if path.exists():
            return str(path)
    return "kimi"  # Fallback — will fail if not on PATH


def call_kimi(prompt: str, timeout: int = 240, retries: int = 2) -> str:
    """Call kimi-cli with a prompt and return the response. Retries on failure."""
    kimi_bin = find_kimi_binary()

    for attempt in range(retries + 1):
        try:
            result = subprocess.run(
                [kimi_bin, "-p", prompt],
                capture_output=True,
                text=True,
                timeout=timeout,
                env={**os.environ, "PYTHONIOENCODING": "utf-8"},
            )
            if result.returncode != 0:
                stderr = result.stderr[:500] if result.stderr else "no stderr"
                if attempt < retries:
                    log.warning(f"kimi-cli failed (attempt {attempt + 1}): {stderr}")
                    time.sleep(5)
                    continue
                log.error(f"kimi-cli error after {retries + 1} attempts: {stderr}")
                return ""
            output = result.stdout.strip()
            if output:
                return output
            if attempt < retries:
                log.warning(f"Empty response (attempt {attempt + 1}), retrying...")
                time.sleep(5)
                continue
            return ""
        except subprocess.TimeoutExpired:
            log.warning(f"kimi-cli timed out ({timeout}s, attempt {attempt + 1})")
            if attempt < retries:
                time.sleep(5)
                continue
            return ""
        except FileNotFoundError:
            log.error(f"kimi-cli not found at '{kimi_bin}'!")
            log.error("Install with: pip3 install kimi-cli")
            sys.exit(1)
        except Exception as e:
            log.error(f"kimi-cli exception: {e}")
            if attempt < retries:
                time.sleep(5)
                continue
            return ""
    return ""


def extract_jobs_json(response: str) -> list[dict]:
    """Extract job JSON from a Kimi response, handling various formats."""
    if not response:
        return []

    # Strategy 1: Direct JSON parse
    try:
        parsed = json.loads(response)
        if isinstance(parsed, dict) and "jobs" in parsed:
            return parsed["jobs"]
        if isinstance(parsed, list):
            return parsed
    except json.JSONDecodeError:
        pass

    # Strategy 2: Find JSON object with "jobs" key
    match = re.search(r'\{[^{}]*"jobs"\s*:\s*\[[\s\S]*?\]\s*\}', response)
    if match:
        try:
            parsed = json.loads(match.group(0))
            return parsed.get("jobs", [])
        except json.JSONDecodeError:
            pass

    # Strategy 3: Find the largest JSON-looking block
    matches = re.findall(r'\{[\s\S]*?\}', response)
    for m in sorted(matches, key=len, reverse=True):
        try:
            parsed = json.loads(m)
            if isinstance(parsed, dict) and "jobs" in parsed:
                return parsed["jobs"]
        except json.JSONDecodeError:
            continue

    # Strategy 4: Strip markdown code blocks
    cleaned = re.sub(r'```(?:json)?\s*', '', response)
    cleaned = re.sub(r'```\s*', '', cleaned).strip()
    try:
        parsed = json.loads(cleaned)
        if isinstance(parsed, dict) and "jobs" in parsed:
            return parsed["jobs"]
    except json.JSONDecodeError:
        pass

    return []


def find_jobs_batch(roles: list[str], batch_num: int) -> list[dict]:
    """Use Kimi to find jobs for a batch of roles."""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    roles_str = ", ".join(roles)

    prompt = (
        f"You are a job search engine. Find REAL, currently open job listings in the "
        f"UNITED STATES for these roles: {roles_str}\n\n"
        f"Find 2-3 REAL jobs per role ({len(roles) * 2}-{len(roles) * 3} total). "
        f"Today is {today}.\n\n"
        f"RULES:\n"
        f"- ONLY US-based jobs\n"
        f"- apply_url MUST link to the SPECIFIC job posting page (NOT a generic "
        f"careers page like company.com/careers, NOT a search page like "
        f"linkedin.com/jobs/search). The URL should open the individual job listing.\n"
        f"- Good URLs: greenhouse.io/company/jobs/12345, linkedin.com/jobs/view/123, "
        f"lever.co/company/abc-def\n"
        f"- Include detailed descriptions (5+ sentences from the actual posting)\n"
        f"- Each job from a different company\n"
        f"- Include salary when available (USD)\n"
        f"- date_posted: use relative dates (Today, 1 day ago, 2 days ago, etc.)\n"
        f"- experience_level: one of Internship, Entry-Level, Mid-Level, Senior, Executive\n\n"
        f'Return ONLY valid JSON:\n'
        f'{{"jobs":[{{"title":"...","company":"...","location":"...","description":"...",'
        f'"apply_url":"https://...","salary":"...","job_type":"Full-time","remote":false,'
        f'"date_posted":"Today","source":"Company Careers","experience_level":"Mid-Level"}}]}}'
    )

    log.info(f"  Batch {batch_num}: Searching {len(roles)} roles: {roles_str[:80]}...")
    start = time.time()
    response = call_kimi(prompt, timeout=240)
    elapsed = round(time.time() - start)

    if not response:
        log.warning(f"  Batch {batch_num}: Empty response after {elapsed}s")
        return []

    jobs = extract_jobs_json(response)

    if not jobs:
        # Save raw response for debugging
        debug_file = LOG_DIR / f"batch_{batch_num}_debug.txt"
        debug_file.write_text(response[:10000])
        log.warning(f"  Batch {batch_num}: No jobs parsed from response ({elapsed}s). "
                     f"Raw saved to {debug_file.name}")
        return []

    log.info(f"  Batch {batch_num}: {len(jobs)} jobs found in {elapsed}s")
    return jobs


# ── Supabase Database ────────────────────────────────────────────────

def supabase_post(table: str, rows: list[dict]) -> tuple[bool, str]:
    """POST rows to a Supabase table. Returns (success, error_message)."""
    if not SUPABASE_SERVICE_KEY:
        return False, "SUPABASE_SERVICE_ROLE_KEY not set"

    headers = {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates",
    }

    try:
        req = Request(
            f"{SUPABASE_URL}/rest/v1/{table}",
            data=json.dumps(rows).encode("utf-8"),
            headers=headers,
            method="POST",
        )
        with urlopen(req, timeout=30) as resp:
            if resp.status in (200, 201):
                return True, ""
            body = resp.read().decode()
            return False, f"HTTP {resp.status}: {body[:200]}"
    except HTTPError as e:
        body = e.read().decode()[:200] if hasattr(e, 'read') else ""
        return False, f"HTTP {e.code}: {body}"
    except URLError as e:
        return False, f"URL error: {e.reason}"
    except Exception as e:
        return False, str(e)


def save_to_supabase(jobs: list[dict]) -> dict:
    """Save validated jobs to Supabase. Returns stats dict."""
    stats = {"jobs_saved": 0, "cached_saved": 0, "errors": []}

    if not SUPABASE_SERVICE_KEY:
        stats["errors"].append("SUPABASE_SERVICE_ROLE_KEY not set!")
        log.error("SUPABASE_SERVICE_ROLE_KEY not set! Cannot save to database.")
        log.error("Set it in ~/.kimi-job-finder/.env or as an environment variable.")
        return stats

    BATCH = 25
    for i in range(0, len(jobs), BATCH):
        batch = jobs[i:i + BATCH]
        ts = int(time.time())

        # ── Save to jobs table ──
        job_rows = []
        for j in batch:
            sal_min, sal_max = parse_salary(j.get("salary"))
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
                "external_id": f"{fp}-{ts}",
            })

        ok, err = supabase_post("jobs", job_rows)
        if ok:
            stats["jobs_saved"] += len(batch)
        else:
            stats["errors"].append(f"jobs: {err}")
            log.error(f"Jobs insert failed: {err}")

        # ── Save to cached_jobs table ──
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

        ok, err = supabase_post("cached_jobs", cached_rows)
        if ok:
            stats["cached_saved"] += len(batch)
        else:
            log.warning(f"Cached jobs insert: {err}")

    return stats


# ── Interactive Setup ─────────────────────────────────────────────────

def interactive_setup():
    """Run first-time setup to configure the service key."""
    print("\n╔══════════════════════════════════════════╗")
    print("║  Kimi Job Finder — First Time Setup      ║")
    print("╚══════════════════════════════════════════╝\n")

    current_key = SUPABASE_SERVICE_KEY
    if current_key:
        masked = current_key[:10] + "..." + current_key[-4:]
        print(f"Current key: {masked}")
        resp = input("Update key? (y/N): ").strip().lower()
        if resp != "y":
            print("Keeping existing key.")
            return
    else:
        print("No Supabase service role key found.")
        print("Find it at: https://supabase.com/dashboard/project/woxtbyotydxorcdhhivr/settings/api")
        print("(Look for 'service_role' — the SECRET key, not the anon key)\n")

    key = input("Paste your Supabase service role key: ").strip()
    if not key:
        print("No key entered. Exiting setup.")
        return

    # Save to .env
    env_content = f"# Kimi Job Finder Config\nSUPABASE_URL={SUPABASE_URL}\nSUPABASE_SERVICE_ROLE_KEY={key}\n"
    ENV_FILE.write_text(env_content)
    ENV_FILE.chmod(0o600)
    print(f"\n✓ Key saved to {ENV_FILE}")
    print("  Run again to start finding jobs!\n")


def show_status():
    """Show last run summary."""
    if not SUMMARY_FILE.exists():
        print("No runs yet. Run the finder first!")
        return

    summary = json.loads(SUMMARY_FILE.read_text())
    ts = summary.get("timestamp", "unknown")
    print(f"\n  Last run: {ts}")
    print(f"  Roles searched: {summary.get('roles_searched', 0)}")
    print(f"  Raw jobs found: {summary.get('raw_jobs', 0)}")
    print(f"  Valid unique jobs: {summary.get('valid_jobs', 0)}")
    print(f"  Saved to DB: {summary.get('saved_to_db', 0)}")
    print(f"  Duration: {summary.get('elapsed_seconds', 0)}s")
    if summary.get("errors"):
        print(f"  Errors: {len(summary['errors'])}")
    print(f"\n  Logs: {LOG_FILE}")
    print(f"  Config: {ENV_FILE}\n")


# ── Main ──────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Kimi K2.5 Agent Swarm Job Finder — finds US tech jobs and saves to Supabase",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python3 find-jobs.py                    # Full run, all 65 roles
  python3 find-jobs.py --dry-run          # Test without saving to DB
  python3 find-jobs.py --roles "Software Engineer,Data Scientist"
  python3 find-jobs.py --batch-size 8 --concurrent 2
  python3 find-jobs.py --setup            # Configure Supabase key
  python3 find-jobs.py --status           # Show last run summary
        """,
    )
    parser.add_argument("--roles", type=str, help="Comma-separated roles to search")
    parser.add_argument("--batch-size", type=int, default=10,
                        help="Number of roles per Kimi call (default: 10)")
    parser.add_argument("--concurrent", type=int, default=2,
                        help="Max parallel Kimi calls (default: 2)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Don't save to database, just print results")
    parser.add_argument("--max-batches", type=int, default=0,
                        help="Limit batches for testing (0 = all)")
    parser.add_argument("--setup", action="store_true",
                        help="Run interactive setup (configure Supabase key)")
    parser.add_argument("--status", action="store_true",
                        help="Show last run summary")
    args = parser.parse_args()

    # Load .env first
    load_env()

    if args.status:
        show_status()
        return

    if args.setup:
        interactive_setup()
        return

    # Check kimi-cli availability
    kimi_bin = find_kimi_binary()
    try:
        subprocess.run([kimi_bin, "--version"], capture_output=True, timeout=10)
    except (FileNotFoundError, subprocess.TimeoutExpired):
        log.error(f"kimi-cli not found or not responding!")
        log.error("Install with: pip3 install kimi-cli")
        log.error("Then login with: kimi login")
        sys.exit(1)

    # Check Supabase key (unless dry run)
    if not args.dry_run and not SUPABASE_SERVICE_KEY:
        log.warning("No Supabase service role key configured!")
        log.warning("Run: python3 find-jobs.py --setup")
        log.warning("Continuing in dry-run mode...\n")
        args.dry_run = True

    start_time = time.time()
    log.info("=" * 60)
    log.info("Kimi K2.5 Agent Swarm Job Finder v2")
    log.info(f"Started at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    # Determine roles
    if args.roles:
        roles = [r.strip() for r in args.roles.split(",") if r.strip()]
    else:
        roles = ALL_ROLES.copy()

    log.info(f"Roles: {len(roles)} | Batch size: {args.batch_size} | "
             f"Concurrent: {args.concurrent}")

    # Split into batches
    batches = [roles[i:i + args.batch_size]
               for i in range(0, len(roles), args.batch_size)]

    if args.max_batches > 0:
        batches = batches[:args.max_batches]

    log.info(f"Processing {len(batches)} batches...")

    # Process batches with concurrency
    all_jobs: list[dict] = []
    failed_batches = 0

    if args.concurrent > 1 and len(batches) > 1:
        # Parallel execution
        with ThreadPoolExecutor(max_workers=args.concurrent) as pool:
            futures = {
                pool.submit(find_jobs_batch, batch, i + 1): i
                for i, batch in enumerate(batches)
            }
            for future in as_completed(futures):
                batch_idx = futures[future]
                try:
                    jobs = future.result()
                    all_jobs.extend(jobs)
                except Exception as e:
                    log.error(f"Batch {batch_idx + 1} failed: {e}")
                    failed_batches += 1
    else:
        # Sequential execution
        for i, batch in enumerate(batches):
            try:
                jobs = find_jobs_batch(batch, i + 1)
                all_jobs.extend(jobs)
            except Exception as e:
                log.error(f"Batch {i + 1} failed: {e}")
                failed_batches += 1
            # Delay between sequential batches
            if i < len(batches) - 1:
                time.sleep(3)

    log.info(f"\nTotal raw jobs: {len(all_jobs)}")
    if failed_batches:
        log.warning(f"Failed batches: {failed_batches}/{len(batches)}")

    # Validate and deduplicate
    seen: set[str] = set()
    valid_jobs: list[dict] = []
    rejection_reasons: dict[str, int] = {}

    for job in all_jobs:
        ok, reason = is_valid_job(job)
        if not ok:
            rejection_reasons[reason] = rejection_reasons.get(reason, 0) + 1
            continue
        fp = job_fingerprint(job["title"], job["company"])
        if fp in seen:
            rejection_reasons["duplicate"] = rejection_reasons.get("duplicate", 0) + 1
            continue
        seen.add(fp)
        valid_jobs.append(job)

    log.info(f"Valid unique jobs: {len(valid_jobs)}")
    if rejection_reasons:
        log.info(f"Rejections: {json.dumps(rejection_reasons)}")

    # Save or print
    save_stats = {"saved_to_db": 0}
    if args.dry_run:
        log.info("\n── DRY RUN ── (not saving to database)")
        for j in valid_jobs[:20]:
            log.info(f"  ✓ {j['title']} @ {j['company']} — {j.get('location', 'N/A')}")
            log.info(f"    {j.get('apply_url', 'N/A')}")
        if len(valid_jobs) > 20:
            log.info(f"  ... and {len(valid_jobs) - 20} more")
    else:
        log.info("Saving to Supabase...")
        db_stats = save_to_supabase(valid_jobs)
        save_stats["saved_to_db"] = db_stats["jobs_saved"]
        log.info(f"Saved: {db_stats['jobs_saved']} to jobs, "
                 f"{db_stats['cached_saved']} to cached_jobs")
        if db_stats["errors"]:
            for err in db_stats["errors"][:5]:
                log.error(f"  DB error: {err}")

    elapsed = round(time.time() - start_time)
    log.info(f"\nComplete in {elapsed}s")
    log.info("=" * 60)

    # Write summary
    summary = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "roles_searched": len(roles),
        "batches": len(batches),
        "failed_batches": failed_batches,
        "raw_jobs": len(all_jobs),
        "valid_jobs": len(valid_jobs),
        "rejections": rejection_reasons,
        "saved_to_db": save_stats["saved_to_db"],
        "elapsed_seconds": elapsed,
        "dry_run": args.dry_run,
    }
    SUMMARY_FILE.write_text(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
