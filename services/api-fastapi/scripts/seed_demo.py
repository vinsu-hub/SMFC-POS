"""One-time seed for Phase 1 demo data: org, 3 branches, the 11 demo accounts
already referenced by the frontend's Login screen (password: demo123), and a
small real menu + recipe per branch so the POS Terminal has something to sell
and the deduction logic has ingredients to decrement.

Run with: uv run python scripts/seed_demo.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import bcrypt

from app.deps import get_supabase

DEMO_PASSWORD = "demo1234"
DEMO_PIN = "1234"

supabase = get_supabase()
_DEMO_PIN_HASH = bcrypt.hashpw(DEMO_PIN.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def upsert_org():
    existing = (
        supabase.table("organizations")
        .select("*")
        .eq("name", "Saint Michael Food Corp")
        .execute()
    )
    if existing.data:
        return existing.data[0]
    return (
        supabase.table("organizations")
        .insert({"name": "Saint Michael Food Corp"})
        .execute()
        .data[0]
    )


def upsert_branch(org_id, name, type_, theme_key):
    existing = supabase.table("branches").select("*").eq("theme_key", theme_key).execute()
    if existing.data:
        return existing.data[0]
    return (
        supabase.table("branches")
        .insert({"organization_id": org_id, "name": name, "type": type_, "theme_key": theme_key})
        .execute()
        .data[0]
    )


def upsert_user(email, role, branch_id, full_name, employee_number):
    existing_profiles = supabase.table("profiles").select("*").execute().data
    users_page = supabase.auth.admin.list_users()
    existing_user = next((u for u in users_page if u.email == email), None)

    if existing_user:
        user_id = existing_user.id
    else:
        created = supabase.auth.admin.create_user(
            {"email": email, "password": DEMO_PASSWORD, "email_confirm": True}
        )
        user_id = created.user.id

    existing_profile = next((p for p in existing_profiles if p["id"] == user_id), None)
    if not existing_profile:
        supabase.table("profiles").insert(
            {
                "id": user_id,
                "branch_id": branch_id,
                "role": role,
                "full_name": full_name,
                "employee_number": employee_number,
                "kiosk_pin_hash": _DEMO_PIN_HASH,
            }
        ).execute()
    elif not existing_profile.get("employee_number") or not existing_profile.get("kiosk_pin_hash"):
        # Backfill kiosk credentials for profiles seeded before employee_number/kiosk_pin_hash existed.
        supabase.table("profiles").update(
            {"employee_number": employee_number, "kiosk_pin_hash": _DEMO_PIN_HASH}
        ).eq("id", user_id).execute()

    return user_id


def upsert_ingredient(branch_id, name, unit, stock, reorder, cost):
    existing = (
        supabase.table("ingredients")
        .select("*")
        .eq("branch_id", branch_id)
        .eq("name", name)
        .execute()
    )
    if existing.data:
        return existing.data[0]
    return (
        supabase.table("ingredients")
        .insert(
            {
                "branch_id": branch_id,
                "name": name,
                "unit": unit,
                "unit_cost": cost,
                "current_stock": stock,
                "reorder_threshold": reorder,
            }
        )
        .execute()
        .data[0]
    )


def upsert_product(branch_id, name, category, price, recipe):
    existing = (
        supabase.table("products")
        .select("*")
        .eq("branch_id", branch_id)
        .eq("name", name)
        .execute()
    )
    if existing.data:
        product = existing.data[0]
    else:
        product = (
            supabase.table("products")
            .insert({"branch_id": branch_id, "name": name, "category": category, "price": price})
            .execute()
            .data[0]
        )

    existing_recipe = (
        supabase.table("recipe_items").select("*").eq("product_id", product["id"]).execute()
    )
    if not existing_recipe.data:
        for ingredient, qty in recipe:
            supabase.table("recipe_items").insert(
                {"product_id": product["id"], "ingredient_id": ingredient["id"], "quantity": qty}
            ).execute()

    return product


def main():
    org = upsert_org()

    danielito = upsert_branch(org["id"], "Danielito's Home Kitchen", "fine_dining", "danielito")
    malaya = upsert_branch(org["id"], "Malaya's Cafe", "cafe", "malaya")
    dden = upsert_branch(org["id"], "D'Den", "bar", "dden")
    catering = upsert_branch(org["id"], "Saint Michael Food Corp Catering", "catering", "catering")

    demo_accounts = [
        # email, role, branch, full_name, employee_number (kiosk login, PIN is DEMO_PIN for all)
        ("marco@danielito.com", "employee", danielito["id"], "Marco", "EMP-1001"),
        ("rosa@danielito.com", "employee", danielito["id"], "Rosa", "EMP-1002"),
        ("luis@danielito.com", "manager", danielito["id"], "Chef Luis", "EMP-1003"),
        ("ana@malaya.com", "employee", malaya["id"], "Ana", "EMP-2001"),
        ("javier@malaya.com", "employee", malaya["id"], "Javier", "EMP-2002"),
        ("sofia@malaya.com", "manager", malaya["id"], "Sofia", "EMP-2003"),
        ("diego@dden.com", "employee", dden["id"], "Diego", "EMP-3001"),
        ("carmen@dden.com", "employee", dden["id"], "Carmen", "EMP-3002"),
        ("victor@dden.com", "manager", dden["id"], "Victor", "EMP-3003"),
        ("liza@catering.com", "employee", catering["id"], "Liza", "EMP-4001"),
        ("ramon@catering.com", "manager", catering["id"], "Ramon", "EMP-4002"),
        ("exec@corp.com", "executive", None, "Corporate Executive", "EMP-9001"),
        ("ops@corp.com", "executive", None, "Operations Executive", "EMP-9002"),
    ]
    for email, role, branch_id, full_name, employee_number in demo_accounts:
        upsert_user(email, role, branch_id, full_name, employee_number)

    # --- Danielito's Home Kitchen -------------------------------------------------
    oysters = upsert_ingredient(danielito["id"], "Oysters", "pc", 200, 20, 2.0)
    halibut = upsert_ingredient(danielito["id"], "Halibut Fillet", "g", 5000, 500, 0.08)
    ribeye = upsert_ingredient(danielito["id"], "Dry-Aged Ribeye", "g", 8000, 800, 0.12)
    cocoa = upsert_ingredient(danielito["id"], "Dark Chocolate", "g", 3000, 300, 0.05)

    upsert_product(danielito["id"], "Oysters (3pc)", "appetizers", 18, [(oysters, 3)])
    upsert_product(danielito["id"], "Pan-Seared Halibut", "mains", 42, [(halibut, 220)])
    upsert_product(danielito["id"], "Dry-Aged Ribeye", "mains", 58, [(ribeye, 300)])
    upsert_product(danielito["id"], "Chocolate Souffle", "desserts", 16, [(cocoa, 80)])

    # --- Malaya's Cafe ----------------------------------------------------------
    matcha = upsert_ingredient(malaya["id"], "Matcha", "g", 500, 50, 2.5)
    syrup = upsert_ingredient(malaya["id"], "Liquid Sugar", "g", 2000, 200, 0.1)
    coffee_beans = upsert_ingredient(malaya["id"], "Coffee Beans", "g", 3000, 300, 0.06)
    flour = upsert_ingredient(malaya["id"], "Pastry Flour", "g", 5000, 500, 0.02)

    upsert_product(malaya["id"], "Matcha Latte", "drinks", 5.5, [(matcha, 2), (syrup, 3)])
    upsert_product(malaya["id"], "Espresso", "drinks", 3.0, [(coffee_beans, 18)])
    upsert_product(malaya["id"], "Croissant", "pastries", 4.0, [(flour, 90)])

    # --- D'Den --------------------------------------------------------------------
    whiskey = upsert_ingredient(dden["id"], "Whiskey", "ml", 5000, 500, 0.15)
    bitters = upsert_ingredient(dden["id"], "Angostura Bitters", "ml", 500, 50, 0.3)
    rum = upsert_ingredient(dden["id"], "White Rum", "ml", 5000, 500, 0.12)
    mint = upsert_ingredient(dden["id"], "Mint Leaves", "g", 1000, 100, 0.04)

    upsert_product(dden["id"], "Old Fashioned", "cocktails", 14, [(whiskey, 60), (bitters, 4)])
    upsert_product(dden["id"], "Mojito", "cocktails", 13, [(rum, 50), (mint, 6)])
    upsert_product(dden["id"], "Whiskey Neat", "spirits", 12, [(whiskey, 45)])

    # --- Catering -------------------------------------------------------------------
    chicken = upsert_ingredient(catering["id"], "Chicken Thigh", "g", 20000, 2000, 0.06)
    rice = upsert_ingredient(catering["id"], "Jasmine Rice", "g", 30000, 3000, 0.015)
    veg_tray = upsert_ingredient(catering["id"], "Mixed Vegetables", "g", 10000, 1000, 0.03)

    upsert_product(catering["id"], "Chicken & Rice Tray (50pax)", "trays", 250, [(chicken, 6000), (rice, 9000)])
    upsert_product(catering["id"], "Vegetable Tray (50pax)", "trays", 120, [(veg_tray, 5000)])

    print("Seed complete.")
    print(f"Organization: {org['id']}")
    print(f"Branches: danielito={danielito['id']} malaya={malaya['id']} dden={dden['id']} catering={catering['id']}")
    print(f"Demo password for all accounts: {DEMO_PASSWORD}")
    print(f"Demo kiosk PIN for all accounts: {DEMO_PIN}")
    print("Kiosk employee numbers: " + ", ".join(f"{n}={e}" for e, _, _, _, n in demo_accounts))


if __name__ == "__main__":
    main()
