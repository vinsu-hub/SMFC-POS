"""Creates the public Supabase Storage bucket that backs product photos
shown on the POS product grid (POS Terminal / Order Queue / Kitchen
Display product cards).

Path convention: {branch_id}/{product_id}.{ext} -- the branch_id folder
segment is what the storage RLS policies (see
supabase/migrations/0039_product_images_storage.sql) key off of for writes.
Public bucket, unlike loss-photos/payroll-signatures: product photos are
rendered on every grid card and aren't sensitive, so reads skip the
signed-URL round trip entirely.

Run with: uv run python scripts/create_product_images_bucket.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.deps import get_supabase

supabase = get_supabase()

BUCKET_ID = "product-images"


def main():
    existing = [b.id for b in supabase.storage.list_buckets()]
    if BUCKET_ID in existing:
        print(f"Bucket '{BUCKET_ID}' already exists.")
        return

    supabase.storage.create_bucket(
        BUCKET_ID,
        options={
            "public": True,
            "file_size_limit": "5MB",
            "allowed_mime_types": ["image/png", "image/jpeg", "image/webp"],
        },
    )
    print(f"Created public bucket '{BUCKET_ID}' (5MB limit, image/* only).")


if __name__ == "__main__":
    main()
