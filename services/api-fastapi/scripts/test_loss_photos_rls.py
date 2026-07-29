"""Exercises the loss-photos storage RLS policies as real signed-in users
(not the service-role key, which would bypass RLS entirely). Verifies:
  - Ana (Malaya employee) can upload to and read her own branch's folder
  - Marco (Danielito employee) is denied reading Malaya's folder
  - An executive can read across branches

Run with: uv run python scripts/test_loss_photos_rls.py
"""

import io
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from supabase import create_client

SUPABASE_URL = "https://autaunyrcqdbhprfdhfh.supabase.co"
PUBLISHABLE_KEY = "sb_publishable_gHJB65KBYSfKQSjSUeEm4g_igMaJd4R"

MALAYA_BRANCH_ID = "1972035a-c942-41f8-84af-47b4738c4855"
DANIELITO_BRANCH_ID = "8373f576-b201-4ef1-893e-74198a3748cf"

TEST_IMAGE_BYTES = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\xcf\xc0"
    b"\x00\x00\x03\x01\x01\x00\x18\xdd\x8d\xb0\x00\x00\x00\x00IEND\xaeB`\x82"
)


def signed_in_client(email, password):
    client = create_client(SUPABASE_URL, PUBLISHABLE_KEY)
    client.auth.sign_in_with_password({"email": email, "password": password})
    return client


def main():
    ana = signed_in_client("ana@malaya.com", "demo1234")
    path = f"{MALAYA_BRANCH_ID}/rls-test.png"

    ana.storage.from_("loss-photos").upload(
        path, TEST_IMAGE_BYTES, {"content-type": "image/png", "upsert": "true"}
    )
    print("Ana upload to her own branch: OK")

    signed_url = ana.storage.from_("loss-photos").create_signed_url(path, 60)
    print("Ana can read her own branch's photo:", "OK" if signed_url.get("signedURL") else "FAILED")

    marco = signed_in_client("marco@danielito.com", "demo1234")
    try:
        marco.storage.from_("loss-photos").create_signed_url(path, 60)
        print("Marco reading Malaya's photo: NOT BLOCKED (BAD)")
    except Exception as e:
        print("Marco reading Malaya's photo blocked as expected:", str(e)[:100])

    exec_user = signed_in_client("exec@corp.com", "demo1234")
    exec_signed_url = exec_user.storage.from_("loss-photos").create_signed_url(path, 60)
    print(
        "Executive can read across branches:",
        "OK" if exec_signed_url.get("signedURL") else "FAILED",
    )


if __name__ == "__main__":
    main()
