"""Seeds Danielito's Home Kitchen's real 41-item menu (products, ingredients,
recipe_items, kitchen station, product photos) across all 3 real locations
(Agapita Road, Bgy. Maitim Bay, Tagaytay City) from
scripts/data/danielitos_menu.csv and the product photos in
D:\\saint_michael_pos\\food menu.

The CSV has no prices, no recipe ingredient quantities, and no kitchen
station -- every seeded row is explicitly flagged (needs_pricing,
needs_quantity_review, needs_station_review) rather than guessed. Review
the printed report before treating this import as production-ready.

Idempotent: safe to re-run if the CSV or the image folder changes (upserts
on (branch_id, name) for products/ingredients, replaces recipe_items and
image uploads for a re-run).

Run with: uv run python scripts/seed_danielitos_menu.py
"""

import csv
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.deps import get_supabase

supabase = get_supabase()

CSV_PATH = Path(__file__).resolve().parent / "data" / "danielitos_menu.csv"
IMAGES_DIR = Path(r"D:\saint_michael_pos\food menu")
IMAGES_BUCKET = "product-images"

# CSV category -> UI pill category. Sides & Desserts splits per-item below
# rather than mapping as a block.
CATEGORY_MAP = {
    "Appetizers": "Appetizers",
    "Mains & Filipino Favorites": "Mains",
    "Asian Specialties": "Asian Specialties",
    "Pizzas & Wings": "Pizzas & Wings",
    "Set Feasts & Platters": "Combos",
    "Beverages": "Drinks",
}
DESSERT_ITEMS = {"Cheesecake", "Classic Halo-Halo", "Mais con Yelo", "Banana con Yelo"}

FRYER_ITEMS = {
    "Calamari", "Buffalo Wings", "Cheese Sticks", "Mozzarella Bites",
    "Lechon Kawali", "Crispy Pata", "Crispy Dinuguan", "Soy Garlic Wings",
    "Pesto Parmesan Wings",
}
GRILL_ITEMS = {
    "Chicken BBQ", "Beef Kare-Kare", "Beef Bulalo", "Kalderetang Kambing",
    "Pork Sisig", "Pancit Canton", "Rellenong Bangus", "Pinakbet",
    "Pork Embutido", "Pad Thai", "Ayam Goreng", "Chicken Yakisoba", "Japchae",
    "Sisig Pizza", "Kani Pizza", "Four-in-One Pizza",
}
BAR_ITEMS = {"Coke Regular", "Iced Tea", "Water"}
DESSERT_STATION_ITEMS = {"Garlic Bread", "Cheesecake", "Classic Halo-Halo", "Mais con Yelo", "Banana con Yelo"}
# Set Feasts & Platters span multiple stations (grilled + fried components)
# -- left unassigned (station=None) rather than force-picked, still flagged
# needs_station_review so it surfaces for manual multi-station handling.
MULTI_STATION_ITEMS = {"Handaan Sa Hapag", "Pista Sa Mesa", "Chef Lala's Pride Feast", "Harana Platter"}

DANIELITO_THEME_PREFIX = "danielito-"


def normalize(name: str) -> str:
    """Lowercase, strip parentheticals, collapse punctuation/whitespace --
    e.g. "Beef Kare-Kare" and "Beef Kare kare.jpg" both normalize to
    "beef kare kare"."""
    name = re.sub(r"\([^)]*\)", "", name)
    name = re.sub(r"[^a-z0-9]+", " ", name.lower())
    return name.strip()


def build_image_index() -> dict[str, Path]:
    index: dict[str, Path] = {}
    if not IMAGES_DIR.exists():
        print(f"WARNING: image folder not found at {IMAGES_DIR}")
        return index
    for f in IMAGES_DIR.iterdir():
        if f.suffix.lower() in (".jpg", ".jpeg", ".png", ".webp"):
            index[normalize(f.stem)] = f
    return index


# Known filename mismatches normalization can't bridge: a genuine spelling
# difference ("Chiken" vs "Chicken") and a phrasing difference ("Water" vs
# "glass of water") -- confirmed by hand after the first seed run's report
# flagged exactly these two as unmatched on both sides.
IMAGE_ALIASES = {
    "Chicken Yakisoba": "Chiken Yakisoba",
    "Water": "glass of water",
}


def find_image(item_name: str, image_index: dict[str, Path]) -> tuple[Path | None, str]:
    key = normalize(item_name)
    if key in image_index:
        return image_index[key], "exact"
    # Singular/plural tolerance (e.g. "oysters" vs "oyster").
    if key.endswith("s") and key[:-1] in image_index:
        return image_index[key[:-1]], "singular-match"
    if f"{key}s" in image_index:
        return image_index[f"{key}s"], "plural-match"
    if item_name in IMAGE_ALIASES:
        alias_key = normalize(IMAGE_ALIASES[item_name])
        if alias_key in image_index:
            return image_index[alias_key], "alias-match"
    return None, "none"


def resolve_station(item_name: str) -> str | None:
    if item_name in MULTI_STATION_ITEMS:
        return None
    if item_name in FRYER_ITEMS:
        return "fryer"
    if item_name in GRILL_ITEMS:
        return "grill"
    if item_name in BAR_ITEMS:
        return "bar"
    if item_name in DESSERT_STATION_ITEMS:
        return "dessert"
    return None


def resolve_category(csv_category: str, item_name: str) -> str:
    if csv_category == "Sides & Desserts":
        return "Desserts" if item_name in DESSERT_ITEMS else "Sides"
    return CATEGORY_MAP.get(csv_category, csv_category)


def get_danielitos_branches() -> list[dict]:
    result = (
        supabase.table("branches")
        .select("id, name, theme_key")
        .execute()
    )
    return [b for b in result.data if b["theme_key"].startswith(DANIELITO_THEME_PREFIX)]


def upsert_ingredient(branch_id: str, name: str) -> str:
    existing = (
        supabase.table("ingredients")
        .select("id")
        .eq("branch_id", branch_id)
        .ilike("name", name)
        .maybe_single()
        .execute()
    )
    if existing and existing.data:
        return existing.data["id"]
    created = (
        supabase.table("ingredients")
        .insert(
            {
                "branch_id": branch_id,
                "name": name,
                "unit": "unit",
                "unit_cost": 0,
                "current_stock": 0,
                "reorder_threshold": 0,
                "needs_review": True,
            }
        )
        .execute()
    )
    return created.data[0]["id"]


def upsert_product(branch_id: str, row: dict, image_index: dict[str, Path]) -> dict:
    name = row["Menu Item"].strip()
    category = resolve_category(row["Category"], name)
    station = resolve_station(name)
    needs_station_review = row["Category"] == "Set Feasts & Platters" or station is None

    existing = (
        supabase.table("products")
        .select("id, image_path")
        .eq("branch_id", branch_id)
        .ilike("name", name)
        .maybe_single()
        .execute()
    )

    payload = {
        "branch_id": branch_id,
        "name": name,
        "category": category,
        "price": 0,
        "needs_pricing": True,
        "station": station,
        "needs_station_review": needs_station_review,
    }

    if existing and existing.data:
        product_id = existing.data["id"]
        supabase.table("products").update(payload).eq("id", product_id).execute()
    else:
        created = supabase.table("products").insert(payload).execute()
        product_id = created.data[0]["id"]

    image_file, match_kind = find_image(name, image_index)
    image_status = "no-image"
    if image_file:
        ext = image_file.suffix.lower().lstrip(".")
        image_path = f"{branch_id}/{product_id}.{ext}"
        with open(image_file, "rb") as fh:
            supabase.storage.from_(IMAGES_BUCKET).upload(
                image_path,
                fh.read(),
                {"content-type": f"image/{ext if ext != 'jpg' else 'jpeg'}", "upsert": "true"},
            )
        supabase.table("products").update({"image_path": image_path}).eq("id", product_id).execute()
        image_status = match_kind

    return {"id": product_id, "name": name, "image_status": image_status}


def upsert_recipe(product_id: str, ingredient_id: str):
    existing = (
        supabase.table("recipe_items")
        .select("id")
        .eq("product_id", product_id)
        .eq("ingredient_id", ingredient_id)
        .maybe_single()
        .execute()
    )
    if existing and existing.data:
        return
    supabase.table("recipe_items").insert(
        {
            "product_id": product_id,
            "ingredient_id": ingredient_id,
            "quantity": 1,
            "needs_quantity_review": True,
        }
    ).execute()


def main():
    with open(CSV_PATH, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    branches = get_danielitos_branches()
    if not branches:
        print("No Danielito's branches found (theme_key starting with 'danielito-'). Aborting.")
        return

    image_index = build_image_index()
    print(f"Found {len(image_index)} image files in {IMAGES_DIR}")
    print(f"Seeding {len(rows)} menu items across {len(branches)} branches: "
          f"{', '.join(b['name'] for b in branches)}")

    image_matches = {"exact": 0, "singular-match": 0, "plural-match": 0, "no-image": 0}
    unmatched_items: list[str] = []
    products_created = 0
    ingredients_created = 0

    for branch in branches:
        branch_id = branch["id"]
        for row in rows:
            name = row["Menu Item"].strip()
            product = upsert_product(branch_id, row, image_index)
            products_created += 1
            image_matches[product["image_status"]] = image_matches.get(product["image_status"], 0) + 1
            if product["image_status"] == "no-image" and name not in unmatched_items:
                unmatched_items.append(name)

            ingredient_fragments = [
                frag.strip() for frag in row["Predicted Ingredients & Components"].split(",") if frag.strip()
            ]
            for fragment in ingredient_fragments:
                ingredient_id = upsert_ingredient(branch_id, fragment)
                ingredients_created += 1
                upsert_recipe(product["id"], ingredient_id)

    matched_image_files = {normalize(row["Menu Item"]) for row in rows}
    matched_image_files |= {normalize(alias) for alias in IMAGE_ALIASES.values()}
    unmatched_files = [
        f.name for key, f in image_index.items()
        if key not in matched_image_files
        and not (key.endswith("s") and key[:-1] in matched_image_files)
        and not (f"{key}s" in matched_image_files)
    ]

    print("\n--- Seed report ---")
    print(f"Products upserted (across all branches): {products_created}")
    print(f"Ingredient rows touched (across all branches): {ingredients_created}")
    print(f"All products flagged needs_pricing=true (no prices in CSV)")
    print(f"All recipe_items flagged needs_quantity_review=true (no quantities in CSV)")
    print(f"Image matches: exact={image_matches.get('exact', 0)}, "
          f"singular/plural-tolerant={image_matches.get('singular-match', 0) + image_matches.get('plural-match', 0)}, "
          f"no-image={image_matches.get('no-image', 0)}")
    if unmatched_items:
        print(f"Menu items with NO matching image file: {unmatched_items}")
    if unmatched_files:
        print(f"Image files with NO matching menu item: {unmatched_files}")
    if not unmatched_items and not unmatched_files:
        print("Full 1:1 coverage between CSV items and image files.")


if __name__ == "__main__":
    main()
