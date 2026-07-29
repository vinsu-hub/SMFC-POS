"""Creates the private Supabase Storage bucket that will back loss/defect
photo uploads (Log Loss/Defect screen, docs/backend-execution-plan.md §3).

Path convention: {branch_id}/{uuid}.{ext} -- the branch_id folder segment is
what the storage RLS policies (see supabase/migrations/0003_loss_photos_storage.sql)
key off of to scope access.

Run with: uv run python scripts/create_loss_photos_bucket.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.deps import get_supabase

supabase = get_supabase()

BUCKET_ID = "loss-photos"


def main():
    existing = [b.id for b in supabase.storage.list_buckets()]
    if BUCKET_ID in existing:
        print(f"Bucket '{BUCKET_ID}' already exists.")
        return

    supabase.storage.create_bucket(
        BUCKET_ID,
        options={
            "public": False,
            "file_size_limit": "5MB",
            "allowed_mime_types": ["image/png", "image/jpeg", "image/webp", "image/heic"],
        },
    )
    print(f"Created private bucket '{BUCKET_ID}' (5MB limit, image/* only).")


if __name__ == "__main__":
    main()
