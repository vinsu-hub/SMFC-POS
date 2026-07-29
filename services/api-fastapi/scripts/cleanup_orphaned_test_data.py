import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.deps import get_supabase

supabase = get_supabase()

ORPHAN_BRANCH_ID = "5acf9484-d0f2-436d-b17a-32d7124cfacd"
ORPHAN_ORG_ID = "9afb32eb-f986-4064-9255-c5bcfc31bf93"
ORPHAN_USER_ID = "374708f7-877b-4e11-87af-3b3aa746a4cb"

supabase.table("transactions").delete().eq("branch_id", ORPHAN_BRANCH_ID).execute()
supabase.table("branches").delete().eq("id", ORPHAN_BRANCH_ID).execute()
supabase.table("organizations").delete().eq("id", ORPHAN_ORG_ID).execute()
supabase.auth.admin.delete_user(ORPHAN_USER_ID)

print("Orphaned test data removed.")
