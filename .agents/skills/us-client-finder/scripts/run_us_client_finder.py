#!/usr/bin/env python3
"""
Invoke and monitor the `us-sales-hiring-leads` Supabase Edge Function.

Authentication (zero hardcoded secrets):
  - Reads SUPABASE_ACCESS_TOKEN from env or --token-file (default: ~/Downloads/SUPABASE_ACCESS_TOKEN.txt)
  - Dynamically fetches the project's anon key via Supabase Management API (or uses SUPABASE_ANON_KEY env var)
  - Never prints tokens or API keys to stdout/stderr
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

PROJECT_REF = "uwsncuowtzydylfabikj"
EDGE_FUNCTION_URL = f"https://{PROJECT_REF}.supabase.co/functions/v1/us-sales-hiring-leads"
MGMT_API_BASE = f"https://api.supabase.com/v1/projects/{PROJECT_REF}"
DEFAULT_TOKEN_FILE = Path.home() / "Downloads" / "SUPABASE_ACCESS_TOKEN.txt"

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")


def load_access_token(token_file: Path) -> str | None:
    env_tok = os.environ.get("SUPABASE_ACCESS_TOKEN", "").strip()
    if env_tok:
        return env_tok
    if token_file.exists():
        tok = token_file.read_text(encoding="utf-8").strip()
        if tok:
            return tok
    return None


def http_json(
    url: str,
    method: str = "GET",
    headers: dict[str, str] | None = None,
    payload: Any = None,
    timeout: int = 160,
) -> tuple[int, Any]:
    req_headers = {"User-Agent": "us-client-finder-skill/1.0"}
    if headers:
        req_headers.update(headers)
    data = None
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        req_headers.setdefault("Content-Type", "application/json")
    req = urllib.request.Request(url, data=data, headers=req_headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            try:
                return resp.status, json.loads(raw) if raw else {}
            except json.JSONDecodeError:
                return resp.status, raw
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        try:
            body = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            body = raw
        return exc.code, body


def get_anon_key(access_token: str | None) -> str:
    env_anon = os.environ.get("SUPABASE_ANON_KEY", "").strip()
    if env_anon:
        return env_anon
    if not access_token:
        raise RuntimeError(
            "Missing SUPABASE_ANON_KEY and SUPABASE_ACCESS_TOKEN. "
            f"Provide SUPABASE_ANON_KEY or place SUPABASE_ACCESS_TOKEN in {DEFAULT_TOKEN_FILE}."
        )
    status, body = http_json(
        f"{MGMT_API_BASE}/api-keys",
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=30,
    )
    if status != 200 or not isinstance(body, list):
        raise RuntimeError(f"Failed to fetch project API keys (HTTP {status}).")
    for item in body:
        if item.get("name") == "anon" and item.get("api_key"):
            return str(item["api_key"])
    raise RuntimeError("No 'anon' API key found for Supabase project.")


def run_sql(access_token: str, query: str) -> list[dict[str, Any]]:
    status, body = http_json(
        f"{MGMT_API_BASE}/database/query",
        method="POST",
        headers={"Authorization": f"Bearer {access_token}"},
        payload={"query": query},
        timeout=30,
    )
    if status not in (200, 201):
        raise RuntimeError(f"Database query failed (HTTP {status}): {body}")
    return body if isinstance(body, list) else []


def get_table_summary(access_token: str) -> dict[str, Any]:
    counts = run_sql(
        access_token,
        "SELECT count(*)::int AS total, count(company_domain)::int AS with_domain, "
        "max(updated_at) AS last_updated FROM public.us_sales_hiring_leads;",
    )
    locations = run_sql(
        access_token,
        "SELECT COALESCE(job_location, '(unknown)') AS job_location, count(*)::int AS cnt "
        "FROM public.us_sales_hiring_leads GROUP BY job_location ORDER BY cnt DESC LIMIT 20;",
    )
    recent_runs = run_sql(
        access_token,
        "SELECT id, state, mode, dry_run, status, jobs_scraped, companies_discovered, "
        "leads_found, leads_saved, leads_new, apify_cost_usd, duration_seconds, started_at, completed_at "
        "FROM public.us_sales_hiring_leads_runs ORDER BY started_at DESC LIMIT 10;",
    )
    return {
        "stats": counts[0] if counts else {},
        "top_locations": locations,
        "recent_runs": recent_runs,
    }


def get_leads_since(access_token: str, since_iso: str, limit: int = 50) -> list[dict[str, Any]]:
    safe_since = since_iso.replace("'", "")
    return run_sql(
        access_token,
        f"SELECT company, poc_name, poc_role, company_domain, hiring_role, job_location, job_url, created_at, updated_at "
        f"FROM public.us_sales_hiring_leads "
        f"WHERE updated_at >= '{safe_since}'::timestamptz "
        f"ORDER BY updated_at DESC LIMIT {int(limit)};",
    )


def get_recent_leads(access_token: str, limit: int = 15) -> list[dict[str, Any]]:
    return run_sql(
        access_token,
        f"SELECT company, poc_name, poc_role, company_domain, hiring_role, job_location, job_url, updated_at "
        f"FROM public.us_sales_hiring_leads "
        f"ORDER BY updated_at DESC LIMIT {int(limit)};",
    )


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Run and monitor the US Client Finder Edge Function.")
    p.add_argument(
        "--location",
        action="append",
        dest="locations",
        help="US state, city, or 'United States'. Repeatable for multiple states.",
    )
    p.add_argument(
        "--roles",
        help="Comma-separated hiring role titles (defaults to Edge Function's 4 outbound/SDR/BDR roles).",
    )
    p.add_argument("--rows-per-role", type=int, help="LinkedIn jobs to scrape per role (1-200).")
    p.add_argument("--published-at", default="r604800", help="LinkedIn recency filter (default: r604800 = 7d).")
    p.add_argument("--min-employees", type=int, default=5, help="Minimum SMB headcount (default: 5).")
    p.add_argument("--max-employees", type=int, default=100, help="Maximum SMB headcount (default: 100).")
    p.add_argument("--max-companies", type=int, default=30, help="Max SMB companies to enrich per run (default: 30).")
    p.add_argument("--include-unknown-size", action="store_true", help="Include listings with unknown employee count.")
    p.add_argument("--mode", choices=["async", "sync"], default="async", help="Execution mode (default: async).")
    p.add_argument("--dry-run", action="store_true", help="Run discovery without upserting into Supabase.")
    p.add_argument("--wait-seconds", type=int, default=0, help="In async mode, poll DB up to N seconds for new rows.")
    p.add_argument("--poll-interval", type=int, default=20, help="Seconds between DB polls when --wait-seconds > 0.")
    p.add_argument("--status-only", action="store_true", help="Inspect current DB counts & recent leads without running Apify.")
    p.add_argument("--since", help="Show leads inserted/updated since this ISO-8601 UTC timestamp without running Apify.")
    p.add_argument("--recent", type=int, default=15, help="Number of recent rows to include with --status-only.")
    p.add_argument("--token-file", type=Path, default=DEFAULT_TOKEN_FILE, help="Path to SUPABASE_ACCESS_TOKEN file.")
    return p.parse_args()


def main() -> int:
    args = parse_args()
    access_token = load_access_token(args.token_file)

    if args.status_only:
        if not access_token:
            print(json.dumps({"ok": False, "error": "SUPABASE_ACCESS_TOKEN required for DB status queries."}, indent=2))
            return 1
        summary = get_table_summary(access_token)
        summary["recent_leads"] = get_recent_leads(access_token, limit=args.recent)
        print(json.dumps({"ok": True, **summary}, indent=2, default=str))
        return 0

    if args.since:
        if not access_token:
            print(json.dumps({"ok": False, "error": "SUPABASE_ACCESS_TOKEN required for --since queries."}, indent=2))
            return 1
        leads = get_leads_since(access_token, args.since)
        summary = get_table_summary(access_token)
        print(
            json.dumps(
                {
                    "ok": True,
                    "since": args.since,
                    "matched_count": len(leads),
                    "table_stats": summary["stats"],
                    "leads": leads,
                },
                indent=2,
                default=str,
            )
        )
        return 0

    anon_key = get_anon_key(access_token)
    started_at_utc = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    before_stats = get_table_summary(access_token)["stats"] if access_token else None

    locations = args.locations if args.locations else ["United States"]
    roles = [r.strip() for r in args.roles.split(",") if r.strip()] if args.roles else None

    invocations = []
    any_error = False

    for loc in locations:
        payload: dict[str, Any] = {
            "mode": args.mode,
            "usLocation": loc,
            "publishedAt": args.published_at,
            "minEmployees": args.min_employees,
            "maxEmployees": args.max_employees,
            "maxCompanies": args.max_companies,
            "includeUnknownSize": args.include_unknown_size,
            "dryRun": args.dry_run,
        }
        if roles:
            payload["roles"] = roles
        if args.rows_per_role is not None:
            payload["rowsPerRole"] = args.rows_per_role

        status, resp = http_json(
            EDGE_FUNCTION_URL,
            method="POST",
            headers={
                "Authorization": f"Bearer {anon_key}",
                "apikey": anon_key,
            },
            payload=payload,
            timeout=160,
        )
        if status not in (200, 202):
            any_error = True
        invocations.append(
            {
                "requested_location": loc,
                "http_status": status,
                "response": resp,
            }
        )

    result: dict[str, Any] = {
        "ok": not any_error,
        "started_at_utc": started_at_utc,
        "mode": args.mode,
        "before_stats": before_stats,
        "invocations": invocations,
    }

    if args.mode == "async" and args.wait_seconds > 0 and access_token and not any_error and not args.dry_run:
        deadline = time.time() + args.wait_seconds
        last_count = 0
        stable_polls = 0
        while time.time() < deadline:
            time.sleep(max(5, args.poll_interval))
            new_rows = get_leads_since(access_token, started_at_utc)
            if len(new_rows) > last_count:
                last_count = len(new_rows)
                stable_polls = 0
            elif last_count > 0:
                stable_polls += 1
                if stable_polls >= 3:
                    break
        result["after_stats"] = get_table_summary(access_token)["stats"]
        new_rows = get_leads_since(access_token, started_at_utc)
        result["new_or_updated_count"] = len(new_rows)
        result["new_or_updated_leads"] = new_rows
    elif args.mode == "sync" and access_token:
        result["after_stats"] = get_table_summary(access_token)["stats"]

    print(json.dumps(result, indent=2, default=str))
    return 1 if any_error else 0


if __name__ == "__main__":
    raise SystemExit(main())
