#!/usr/bin/env python3
"""
Import Kimi Web Session Excel Results → Supabase
==================================================
Takes the Excel/CSV file that Kimi's 100-agent web session produces
and imports it directly into the ResumePreps Supabase database.

This saves credits by reusing web session results instead of running
kimi-cli again.

Usage:
    python3 import-excel.py jobs.xlsx
    python3 import-excel.py jobs.csv
    python3 import-excel.py jobs.xlsx --dry-run    # Preview only
"""

import csv
import json
import os
import re
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

# ── Config ────────────────────────────────────────────────────────────

ENV_FILE = Path.home() / ".kimi-job-finder" / ".env"
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://woxtbyotydxorcdhhivr.supabase.co")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")


def load_env():
    """Load environment from .env file."""
    global SUPABASE_URL, SUPABASE_SERVICE_KEY
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, value = line.partition("=")
                os.environ.setdefault(key.strip(), value.strip())
    SUPABASE_URL = os.environ.get("SUPABASE_URL", SUPABASE_URL)
    SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", SUPABASE_SERVICE_KEY)


# ── URL Validation ────────────────────────────────────────────────────

GENERIC_URL_PATTERNS = [
    r"/careers/?$", r"/careers/?\?", r"/careers/search", r"/careers/home",
    r"/jobs/?$", r"/jobs/?\?", r"/jobs/search",
    r"linkedin\.com/jobs/search", r"indeed\.com/jobs\?",
]

NON_US_PATTERNS = [
    r"\bindia\b", r"\bcanada\b", r"\buk\b", r"\bunited kingdom\b",
    r"\bgermany\b", r"\bfrance\b", r"\baustralia\b", r"\bsingapore\b",
    r"\bjapan\b", r"\bchina\b", r"\bbangalore\b", r"\bhyderabad\b",
    r"\bmumbai\b", r"\bdelhi\b", r"\bpune\b", r"\bchennai\b",
    r"\btoronto\b", r"\bvancouver\b", r"\blondon\b", r"\bberlin\b",
]


def is_valid_job(job: dict) -> tuple:
    title = job.get("title", "")
    company = job.get("company", "")
    url = job.get("apply_url", "")
    location = job.get("location", "")

    if not title or len(title) < 3:
        return False, "missing title"
    if not company or len(company) < 2:
        return False, "missing company"
    if not url or not url.startswith("http"):
        return False, "invalid URL"

    url_lower = url.lower()
    if any(re.search(p, url_lower) for p in GENERIC_URL_PATTERNS):
        return False, "generic career page URL"

    loc_lower = location.lower()
    if any(re.search(p, loc_lower) for p in NON_US_PATTERNS):
        return False, f"non-US: {location}"

    return True, "ok"


def job_fingerprint(title: str, company: str) -> str:
    raw = f"{title.lower().strip()}-{company.lower().strip()}"
    clean = re.sub(r"[^a-z0-9-]", "", raw)
    return f"kimi-{clean}"


def classify_role(title: str) -> str:
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
        (r"mobile|ios|android", "Mobile"),
        (r"qa|test|quality", "QA & Testing"),
        (r"software|developer|engineer|programmer", "Engineering"),
    ]
    for pattern, category in patterns:
        if re.search(pattern, t):
            return category
    return "Other"


def parse_salary(salary) -> tuple:
    if not salary:
        return None, None
    salary = str(salary)
    matches = re.findall(r"\$?([\d,]+)", salary)
    if not matches:
        return None, None
    nums = [int(m.replace(",", "")) for m in matches]
    if len(nums) >= 2:
        return min(nums), max(nums)
    return nums[0], nums[0]


# ── File Parsing ──────────────────────────────────────────────────────

def read_csv(filepath: str) -> list:
    """Read a CSV file and return list of dicts."""
    jobs = []
    with open(filepath, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            jobs.append(normalize_row(row))
    return jobs


def read_excel(filepath: str) -> list:
    """Read an Excel file using openpyxl and return list of dicts."""
    try:
        import openpyxl
    except ImportError:
        print("ERROR: openpyxl not installed. Install with: pip3 install openpyxl")
        print("  Or convert your Excel file to CSV first and use that instead.")
        sys.exit(1)

    wb = openpyxl.load_workbook(filepath, read_only=True, data_only=True)
    jobs = []
    for sheet in wb.sheetnames:
        ws = wb[sheet]
        rows = list(ws.iter_rows(values_only=True))
        if not rows:
            continue
        # First row = headers
        headers = [str(h).strip().lower() if h else f"col{i}" for i, h in enumerate(rows[0])]
        for row in rows[1:]:
            if not any(row):
                continue
            d = {}
            for i, val in enumerate(row):
                if i < len(headers):
                    d[headers[i]] = str(val).strip() if val else ""
            jobs.append(normalize_row(d))
    return jobs


def normalize_row(row: dict) -> dict:
    """Map various column name formats to our standard fields."""
    # Common column name mappings from Kimi output
    mappings = {
        "title": ["title", "job title", "role", "role name", "position", "job_title", "jobtitle"],
        "company": ["company", "company name", "organization", "employer", "company_name", "companyname"],
        "location": ["location", "job location", "city", "place", "work location", "job_location"],
        "description": ["description", "job description", "details", "summary", "desc", "job_description"],
        "apply_url": ["apply_url", "apply url", "link", "job link", "url", "application link",
                       "job_link", "apply link", "application_link", "apply_link", "joblink"],
        "salary": ["salary", "pay", "compensation", "salary range", "salary_range"],
        "job_type": ["job_type", "job type", "type", "employment type", "employment_type"],
        "remote": ["remote", "work type", "work_type", "work location", "remote/onsite",
                    "work_location", "workplace"],
        "date_posted": ["date_posted", "date posted", "posted date", "posted", "posting date",
                        "posted_date", "date"],
        "source": ["source", "found on", "platform", "job board"],
        "experience_level": ["experience_level", "experience level", "experience", "level",
                              "seniority", "experience_level"],
    }

    normalized = {}
    row_lower = {k.lower().strip(): v for k, v in row.items()}

    for field, aliases in mappings.items():
        for alias in aliases:
            if alias in row_lower and row_lower[alias]:
                normalized[field] = row_lower[alias]
                break

    # Handle remote field - convert to boolean
    remote_val = str(normalized.get("remote", "")).lower()
    normalized["remote"] = any(w in remote_val for w in ["remote", "yes", "true", "wfh"])

    return normalized


# ── Supabase ──────────────────────────────────────────────────────────

def supabase_post(table: str, rows: list) -> tuple:
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


# ── Main ──────────────────────────────────────────────────────────────

def main():
    if len(sys.argv) < 2:
        print("Usage: python3 import-excel.py <file.xlsx or file.csv> [--dry-run]")
        print("\nImports Kimi web session job results into ResumePreps database.")
        print("Supports .xlsx, .xls, and .csv files.")
        sys.exit(1)

    filepath = sys.argv[1]
    dry_run = "--dry-run" in sys.argv

    if not os.path.exists(filepath):
        print(f"ERROR: File not found: {filepath}")
        sys.exit(1)

    load_env()

    if not dry_run and not SUPABASE_SERVICE_KEY:
        print("ERROR: No Supabase service role key configured!")
        print("Run: python3 find-jobs.py --setup")
        sys.exit(1)

    # Read file
    ext = os.path.splitext(filepath)[1].lower()
    print(f"\n▸ Reading {filepath}...")

    if ext == ".csv":
        raw_jobs = read_csv(filepath)
    elif ext in (".xlsx", ".xls"):
        raw_jobs = read_excel(filepath)
    else:
        print(f"ERROR: Unsupported file type: {ext}")
        print("  Supported: .xlsx, .xls, .csv")
        sys.exit(1)

    print(f"  Found {len(raw_jobs)} rows")

    # Validate
    valid_jobs = []
    seen = set()
    rejections = {}

    for job in raw_jobs:
        ok, reason = is_valid_job(job)
        if not ok:
            rejections[reason] = rejections.get(reason, 0) + 1
            continue
        fp = job_fingerprint(job["title"], job["company"])
        if fp in seen:
            rejections["duplicate"] = rejections.get("duplicate", 0) + 1
            continue
        seen.add(fp)
        valid_jobs.append(job)

    print(f"  Valid unique jobs: {len(valid_jobs)}")
    if rejections:
        print(f"  Rejected: {json.dumps(rejections)}")

    if not valid_jobs:
        print("\nNo valid jobs to import!")
        sys.exit(0)

    # Preview
    print(f"\n▸ Preview (first 10):")
    for j in valid_jobs[:10]:
        print(f"  • {j.get('title', '?')} @ {j.get('company', '?')} — {j.get('location', '?')}")
        if j.get("apply_url"):
            print(f"    {j['apply_url'][:80]}")

    if len(valid_jobs) > 10:
        print(f"  ... and {len(valid_jobs) - 10} more")

    if dry_run:
        print(f"\n── DRY RUN ── Would import {len(valid_jobs)} jobs")
        return

    # Import to Supabase
    print(f"\n▸ Importing {len(valid_jobs)} jobs to Supabase...")
    ts = int(time.time())
    saved_jobs = 0
    saved_cached = 0
    errors = []

    BATCH = 25
    for i in range(0, len(valid_jobs), BATCH):
        batch = valid_jobs[i:i + BATCH]

        # jobs table
        job_rows = []
        for j in batch:
            sal_min, sal_max = parse_salary(j.get("salary"))
            fp = job_fingerprint(j["title"], j["company"])
            job_rows.append({
                "title": j["title"],
                "company": j["company"],
                "location": j.get("location", ""),
                "description": j.get("description", ""),
                "apply_url": j.get("apply_url", ""),
                "source": j.get("source", "Kimi AI Search"),
                "date_posted": datetime.now(timezone.utc).isoformat(),
                "salary_min": sal_min,
                "salary_max": sal_max,
                "job_type": j.get("job_type"),
                "remote": j.get("remote", False),
                "external_id": f"{fp}-{ts}",
            })

        ok, err = supabase_post("jobs", job_rows)
        if ok:
            saved_jobs += len(batch)
            print(f"  ✓ Batch {i // BATCH + 1}: {len(batch)} jobs saved")
        else:
            errors.append(err)
            print(f"  ✗ Batch {i // BATCH + 1}: {err}")

        # cached_jobs table
        cached_rows = []
        for j in batch:
            fp = job_fingerprint(j["title"], j["company"])
            cached_rows.append({
                "title": j["title"],
                "company": j["company"],
                "location": j.get("location", ""),
                "description": j.get("description", ""),
                "apply_url": j.get("apply_url", ""),
                "salary": j.get("salary"),
                "job_type": j.get("job_type"),
                "remote": j.get("remote", False),
                "date_posted": j.get("date_posted", "Today"),
                "source": j.get("source", "Kimi AI Search"),
                "role_category": classify_role(j["title"]),
                "experience_level": j.get("experience_level", "Mid-Level"),
                "job_fingerprint": fp,
                "expires_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
            })

        ok, err = supabase_post("cached_jobs", cached_rows)
        if ok:
            saved_cached += len(batch)
        # Silently continue if cached fails

    print(f"\n╔══════════════════════════════════════════╗")
    print(f"║  Import Complete                         ║")
    print(f"╠══════════════════════════════════════════╣")
    print(f"║  Jobs saved: {saved_jobs:>4}                       ║")
    print(f"║  Cached:     {saved_cached:>4}                       ║")
    if errors:
        print(f"║  Errors:     {len(errors):>4}                       ║")
    print(f"╚══════════════════════════════════════════╝")


if __name__ == "__main__":
    main()
