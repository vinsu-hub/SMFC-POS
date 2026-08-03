"""Creates the private Supabase Storage bucket that backs the HR approving
signatory's e-signature image printed on payslips (PayrollSettings ->
Payslip Layout tab).

Single global image (bucket has one object at a time) -- the storage RLS
policies (see supabase/migrations/0031_payroll_signatures_storage.sql)
restrict writes to executives.

Run with: uv run python scripts/create_payroll_signatures_bucket.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.deps import get_supabase

supabase = get_supabase()

BUCKET_ID = "payroll-signatures"


def main():
    existing = [b.id for b in supabase.storage.list_buckets()]
    if BUCKET_ID in existing:
        print(f"Bucket '{BUCKET_ID}' already exists.")
        return

    supabase.storage.create_bucket(
        BUCKET_ID,
        options={
            "public": False,
            "file_size_limit": "2MB",
            "allowed_mime_types": ["image/png", "image/jpeg", "image/webp"],
        },
    )
    print(f"Created private bucket '{BUCKET_ID}' (2MB limit, image/* only).")


if __name__ == "__main__":
    main()
