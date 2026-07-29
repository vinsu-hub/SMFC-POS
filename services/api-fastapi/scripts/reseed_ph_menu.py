"""Wipes and reseeds the menu/inventory for the three branches with a
Philippines-market catalog priced in PHP, matching Saint Michael Food Corp's
actual scope (Filipino fine dining, cafe/pastry, bar). Keeps the
organization, branches, and demo user accounts intact -- only
products/ingredients/recipe_items (and any transactions built on the old
menu) are replaced.

Run with: uv run python scripts/reseed_ph_menu.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.deps import get_supabase

supabase = get_supabase()

DANIELITO = "8373f576-b201-4ef1-893e-74198a3748cf"
MALAYA = "1972035a-c942-41f8-84af-47b4738c4855"
DBAR = "618fe59d-4f36-44c4-a92b-0599fd03e07e"


def wipe_branch_menu(branch_id):
    supabase.table("transactions").delete().eq("branch_id", branch_id).execute()
    supabase.table("products").delete().eq("branch_id", branch_id).execute()
    supabase.table("ingredients").delete().eq("branch_id", branch_id).execute()


def add_ingredient(branch_id, name, unit, stock, reorder, cost):
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


def add_product(branch_id, name, category, price, recipe):
    product = (
        supabase.table("products")
        .insert({"branch_id": branch_id, "name": name, "category": category, "price": price})
        .execute()
        .data[0]
    )
    for ingredient, qty in recipe:
        supabase.table("recipe_items").insert(
            {"product_id": product["id"], "ingredient_id": ingredient["id"], "quantity": qty}
        ).execute()
    return product


def seed_danielito():
    wipe_branch_menu(DANIELITO)

    oxtail = add_ingredient(DANIELITO, "Oxtail", "g", 15000, 1500, 0.85)
    peanut_sauce = add_ingredient(DANIELITO, "Peanut Sauce", "g", 8000, 800, 0.35)
    kangkong = add_ingredient(DANIELITO, "Kangkong", "g", 10000, 1000, 0.08)
    pork_pata = add_ingredient(DANIELITO, "Pork Pata", "g", 20000, 2000, 0.32)
    shrimp = add_ingredient(DANIELITO, "Shrimp (Hipon)", "g", 12000, 1200, 0.9)
    sampalok_mix = add_ingredient(DANIELITO, "Tamarind Mix (Sampalok)", "g", 5000, 500, 0.2)
    pork_belly = add_ingredient(DANIELITO, "Pork Belly", "g", 15000, 1500, 0.45)
    gata = add_ingredient(DANIELITO, "Coconut Milk (Gata)", "ml", 10000, 1000, 0.12)
    siling_labuyo = add_ingredient(DANIELITO, "Siling Labuyo", "g", 1000, 100, 0.5)
    eggs = add_ingredient(DANIELITO, "Eggs", "pc", 300, 30, 8.0)
    condensed_milk = add_ingredient(DANIELITO, "Condensed Milk", "ml", 6000, 600, 0.15)

    add_product(
        DANIELITO, "Kare-Kare", "mains", 650,
        [(oxtail, 280), (peanut_sauce, 150), (kangkong, 100)],
    )
    add_product(
        DANIELITO, "Crispy Pata", "mains", 850,
        [(pork_pata, 900)],
    )
    add_product(
        DANIELITO, "Sinigang na Hipon", "mains", 580,
        [(shrimp, 220), (sampalok_mix, 60), (kangkong, 80)],
    )
    add_product(
        DANIELITO, "Bicol Express", "mains", 420,
        [(pork_belly, 250), (gata, 150), (siling_labuyo, 20)],
    )
    add_product(
        DANIELITO, "Leche Flan", "desserts", 180,
        [(eggs, 4), (condensed_milk, 200)],
    )


def seed_malaya():
    wipe_branch_menu(MALAYA)

    matcha = add_ingredient(MALAYA, "Matcha", "g", 500, 50, 2.5)
    syrup = add_ingredient(MALAYA, "Liquid Sugar", "g", 2000, 200, 0.1)
    espresso_beans = add_ingredient(MALAYA, "Espresso Beans", "g", 4000, 400, 0.06)
    ube_halaya = add_ingredient(MALAYA, "Ube Halaya", "g", 3000, 300, 0.25)
    milk = add_ingredient(MALAYA, "Milk", "ml", 8000, 800, 0.07)
    calamansi_juice = add_ingredient(MALAYA, "Calamansi Juice", "ml", 3000, 300, 0.15)
    flour = add_ingredient(MALAYA, "Pastry Flour", "g", 6000, 600, 0.02)
    butter = add_ingredient(MALAYA, "Butter", "g", 3000, 300, 0.35)
    saba = add_ingredient(MALAYA, "Saba Banana", "pc", 200, 20, 4.0)
    lumpia_wrapper = add_ingredient(MALAYA, "Lumpia Wrapper", "pc", 300, 30, 3.0)
    brown_sugar = add_ingredient(MALAYA, "Brown Sugar", "g", 4000, 400, 0.05)

    add_product(MALAYA, "Matcha Latte", "drinks", 185, [(matcha, 2), (syrup, 3), (milk, 200)])
    add_product(MALAYA, "Spanish Latte", "drinks", 165, [(espresso_beans, 18), (milk, 180), (syrup, 5)])
    add_product(MALAYA, "Ube Latte", "drinks", 175, [(ube_halaya, 30), (milk, 200), (syrup, 3)])
    add_product(MALAYA, "Kalamansi Iced Tea", "drinks", 95, [(calamansi_juice, 40), (syrup, 10)])
    add_product(MALAYA, "Ensaymada", "pastries", 85, [(flour, 90), (butter, 20)])
    add_product(MALAYA, "Ube Cheese Pandesal", "pastries", 95, [(flour, 80), (ube_halaya, 25)])
    add_product(MALAYA, "Turon (2pcs)", "pastries", 75, [(saba, 2), (lumpia_wrapper, 2), (brown_sugar, 20)])


def seed_dbar():
    wipe_branch_menu(DBAR)

    white_rum = add_ingredient(DBAR, "White Rum", "ml", 6000, 600, 0.14)
    lambanog = add_ingredient(DBAR, "Lambanog", "ml", 4000, 400, 0.25)
    dalandan_juice = add_ingredient(DBAR, "Dalandan Juice", "ml", 5000, 500, 0.1)
    tanduay = add_ingredient(DBAR, "Tanduay Rum", "ml", 6000, 600, 0.13)
    calamansi_juice = add_ingredient(DBAR, "Calamansi Juice", "ml", 4000, 400, 0.15)
    triple_sec = add_ingredient(DBAR, "Triple Sec", "ml", 3000, 300, 0.3)
    mint = add_ingredient(DBAR, "Mint Leaves", "g", 1000, 100, 0.04)
    bitters = add_ingredient(DBAR, "Angostura Bitters", "ml", 500, 50, 0.3)
    san_mig = add_ingredient(DBAR, "San Miguel Beer", "bottle", 300, 30, 45.0)
    sisig_mix = add_ingredient(DBAR, "Pork Sisig Mix", "g", 10000, 1000, 0.4)

    add_product(DBAR, "Calamansi Mojito", "cocktails", 280, [(white_rum, 50), (calamansi_juice, 30), (mint, 6)])
    add_product(DBAR, "Lambanog Sour", "cocktails", 320, [(lambanog, 60), (calamansi_juice, 25)])
    add_product(DBAR, "Dalandan Margarita", "cocktails", 310, [(tanduay, 50), (dalandan_juice, 40), (triple_sec, 15)])
    add_product(DBAR, "Tanduay Old Fashioned", "cocktails", 260, [(tanduay, 60), (bitters, 4)])
    add_product(DBAR, "San Miguel (Bottle)", "beer", 95, [(san_mig, 1)])
    add_product(DBAR, "Sisig Bites", "bar chow", 220, [(sisig_mix, 200)])


def main():
    seed_danielito()
    seed_malaya()
    seed_dbar()
    print("Philippines-market menu reseed complete.")


if __name__ == "__main__":
    main()
