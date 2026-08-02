"""Seed for demo data: org, 5 companies x their locations (12 branches total,
1 employee + 1 manager login each), plus a small real menu + recipe per
branch so the POS Terminal has something to sell and the deduction logic has
ingredients to decrement. Idempotent - safe to re-run.

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


def upsert_discount_type(branch_id, name, percentage, vat_exempt=False):
    existing = (
        supabase.table("discount_types")
        .select("*")
        .eq("branch_id", branch_id)
        .eq("name", name)
        .execute()
    )
    if existing.data:
        return existing.data[0]
    return (
        supabase.table("discount_types")
        .insert(
            {
                "branch_id": branch_id,
                "name": name,
                "percentage": percentage,
                "vat_exempt": vat_exempt,
            }
        )
        .execute()
        .data[0]
    )


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


# --- Companies -> locations (each location is its own branch/login) --------------
# theme_key drives frontend BRANCH_CONFIG lookup - must exactly match
# apps/dashboard-web/client/src/lib/types.ts's LOCATIONS keys.
COMPANIES = [
    {
        "key": "danielito",
        "name": "Danielito's Home Kitchen",
        "branch_type": "fine_dining",
        "block": 1000,
        "locations": [
            {"theme_key": "danielito-agapita", "label": "Agapita Road", "city": "Los Baños, Laguna"},
            {"theme_key": "danielito-maitim", "label": "Bgy. Maitim Bay", "city": "Laguna"},
            {"theme_key": "danielito-tagaytay", "label": "Tagaytay City", "city": "Tagaytay"},
        ],
    },
    {
        "key": "malaya",
        "name": "Malaya's Cafe",
        "branch_type": "cafe",
        "block": 2000,
        "locations": [
            {"theme_key": "malaya-agapita", "label": "Agapita", "city": "Los Baños, Laguna"},
            {"theme_key": "malaya-maitim", "label": "Brgy. Maitim Bay", "city": "Laguna"},
            {"theme_key": "malaya-pitx", "label": "2/F PITX", "city": "Parañaque"},
            {"theme_key": "malaya-jsh", "label": "JSH Bldg, Grove", "city": "Los Baños"},
        ],
    },
    {
        "key": "dden",
        "name": "The Den",
        "branch_type": "bar",
        "block": 3000,
        "locations": [
            {"theme_key": "dden-agapita", "label": "Agapita Road", "city": "Los Baños, Laguna"},
            {"theme_key": "dden-maitim", "label": "Brgy. Maitim Bay", "city": "Laguna"},
        ],
    },
    {
        "key": "dvenue",
        "name": "D'Venue Events Place",
        "branch_type": "events_venue",
        "block": 4000,
        "locations": [
            {"theme_key": "dvenue-agapita", "label": "Agapita Road", "city": "Los Baños, Laguna"},
            {"theme_key": "dvenue-maitim", "label": "Brgy. Maitim Bay", "city": "Laguna"},
        ],
    },
    {
        "key": "isabelas",
        "name": "Isabela's Signature Caterer",
        "branch_type": "catering_service",
        "block": 5000,
        "locations": [
            {"theme_key": "isabelas-agapita", "label": "Agapita Road", "city": "Los Baños, Laguna"},
        ],
    },
]

# Menu/recipe seed data per company - applied to every location of that
# company so each branch has real stock to sell in the POS demo.
MENUS = {
    "danielito": {
        "ingredients": [
            ("Oysters", "pc", 200, 20, 2.0),
            ("Halibut Fillet", "g", 5000, 500, 0.08),
            ("Dry-Aged Ribeye", "g", 8000, 800, 0.12),
            ("Dark Chocolate", "g", 3000, 300, 0.05),
        ],
        "products": [
            ("Oysters (3pc)", "appetizers", 18, [("Oysters", 3)]),
            ("Pan-Seared Halibut", "mains", 42, [("Halibut Fillet", 220)]),
            ("Dry-Aged Ribeye", "mains", 58, [("Dry-Aged Ribeye", 300)]),
            ("Chocolate Souffle", "desserts", 16, [("Dark Chocolate", 80)]),
        ],
    },
    "malaya": {
        "ingredients": [
            ("Matcha", "g", 500, 50, 2.5),
            ("Liquid Sugar", "g", 2000, 200, 0.1),
            ("Coffee Beans", "g", 3000, 300, 0.06),
            ("Pastry Flour", "g", 5000, 500, 0.02),
        ],
        "products": [
            ("Matcha Latte", "drinks", 5.5, [("Matcha", 2), ("Liquid Sugar", 3)]),
            ("Espresso", "drinks", 3.0, [("Coffee Beans", 18)]),
            ("Croissant", "pastries", 4.0, [("Pastry Flour", 90)]),
        ],
    },
    "dden": {
        "ingredients": [
            ("Whiskey", "ml", 5000, 500, 0.15),
            ("Angostura Bitters", "ml", 500, 50, 0.3),
            ("White Rum", "ml", 5000, 500, 0.12),
            ("Mint Leaves", "g", 1000, 100, 0.04),
        ],
        "products": [
            ("Old Fashioned", "cocktails", 14, [("Whiskey", 60), ("Angostura Bitters", 4)]),
            ("Mojito", "cocktails", 13, [("White Rum", 50), ("Mint Leaves", 6)]),
            ("Whiskey Neat", "spirits", 12, [("Whiskey", 45)]),
        ],
    },
    "dvenue": {
        "ingredients": [
            ("Chicken Thigh", "g", 20000, 2000, 0.06),
            ("Jasmine Rice", "g", 30000, 3000, 0.015),
            ("Mixed Vegetables", "g", 10000, 1000, 0.03),
        ],
        "products": [
            ("Chicken & Rice Tray (50pax)", "trays", 250, [("Chicken Thigh", 6000), ("Jasmine Rice", 9000)]),
            ("Vegetable Tray (50pax)", "trays", 120, [("Mixed Vegetables", 5000)]),
        ],
    },
    "isabelas": {
        "ingredients": [
            ("Chicken Thigh", "g", 20000, 2000, 0.06),
            ("Jasmine Rice", "g", 30000, 3000, 0.015),
            ("Mixed Vegetables", "g", 10000, 1000, 0.03),
        ],
        "products": [
            ("Chicken & Rice Tray (50pax)", "trays", 250, [("Chicken Thigh", 6000), ("Jasmine Rice", 9000)]),
            ("Vegetable Tray (50pax)", "trays", 120, [("Mixed Vegetables", 5000)]),
        ],
    },
}


# Breakable dishware/utensils common to every location, tracked as
# ingredients (unit "pc") purely so they're selectable in the Loss Log
# dropdown under the "Breakage" reason - not used in any recipe.
SUPPLIES = [
    ("Glass Cup", "pc", 100, 20, 15.0),
    ("Coffee Cup", "pc", 100, 20, 25.0),
    ("Straws", "pc", 500, 100, 0.5),
    ("Plates", "pc", 100, 20, 30.0),
    ("Spoon", "pc", 100, 20, 10.0),
    ("Fork", "pc", 100, 20, 10.0),
]


def seed_menu_for_branch(company_key, branch):
    menu = MENUS[company_key]
    ingredients_by_name = {}
    for name, unit, stock, reorder, cost in menu["ingredients"]:
        ingredients_by_name[name] = upsert_ingredient(branch["id"], name, unit, stock, reorder, cost)
    for name, category, price, recipe in menu["products"]:
        upsert_product(
            branch["id"],
            name,
            category,
            price,
            [(ingredients_by_name[ing_name], qty) for ing_name, qty in recipe],
        )
    for name, unit, stock, reorder, cost in SUPPLIES:
        upsert_ingredient(branch["id"], name, unit, stock, reorder, cost)
    # Senior Citizen/PWD are VAT-exempt by PH law (RA 9994/RA 10754) in
    # addition to the percentage off; Employee Discount is a plain % off.
    upsert_discount_type(branch["id"], "Employee Discount", 10, vat_exempt=False)
    upsert_discount_type(branch["id"], "Senior Citizen", 20, vat_exempt=True)
    upsert_discount_type(branch["id"], "PWD", 20, vat_exempt=True)


def main():
    org = upsert_org()

    all_branches = []  # (company_key, location, branch)
    employee_numbers = []

    for company in COMPANIES:
        for i, location in enumerate(company["locations"], start=1):
            branch = upsert_branch(
                org["id"],
                f"{company['name']} - {location['label']}",
                company["branch_type"],
                location["theme_key"],
            )
            all_branches.append((company["key"], location, branch))

            # One employee + one manager per location.
            emp_number = f"EMP-{company['block'] + i * 10 + 1}"
            mgr_number = f"EMP-{company['block'] + i * 10 + 2}"
            upsert_user(
                f"employee@{location['theme_key']}.com",
                "employee",
                branch["id"],
                f"Employee - {location['label']}",
                emp_number,
            )
            upsert_user(
                f"manager@{location['theme_key']}.com",
                "manager",
                branch["id"],
                f"Manager - {location['label']}",
                mgr_number,
            )
            employee_numbers.extend([emp_number, mgr_number])

            seed_menu_for_branch(company["key"], branch)

    upsert_user("exec@corp.com", "executive", None, "Corporate Executive", "EMP-9001")
    upsert_user("ops@corp.com", "executive", None, "Operations Executive", "EMP-9002")
    employee_numbers.extend(["EMP-9001", "EMP-9002"])

    print("Seed complete.")
    print(f"Organization: {org['id']}")
    print(f"Branches seeded: {len(all_branches)}")
    for company_key, location, branch in all_branches:
        print(f"  {company_key}: {location['theme_key']} -> {branch['id']}")
    print(f"Demo password for all accounts: {DEMO_PASSWORD}")
    print(f"Demo kiosk PIN for all accounts: {DEMO_PIN}")
    print("Kiosk employee numbers: " + ", ".join(employee_numbers))
    print(
        "\nNOTE: old 2nd-employee demo accounts from the previous 4-branch "
        "seed (e.g. rosa@danielito.com, javier@malaya.com, carmen@dden.com) "
        "are no longer created by this script. They still exist in Supabase "
        "auth/profiles if seeded before - deactivate or delete them manually "
        "to match the new 1-employee-1-manager-per-location rule."
    )


if __name__ == "__main__":
    main()
