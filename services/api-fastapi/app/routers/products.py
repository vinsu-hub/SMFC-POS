from collections import defaultdict

from fastapi import APIRouter, Depends, Query

from app.auth import CurrentUser, get_current_user, require_branch_access
from app.deps import get_supabase
from app.schemas import Product

router = APIRouter(tags=["products"])

PRODUCT_IMAGES_BUCKET = "product-images"


def _compute_product_availability(supabase, branch_id: str, product_ids: list[str]) -> dict[str, str]:
    """Per-product availability, cross-referencing recipe_items against
    current ingredient stock -- "unavailable" if any required ingredient
    can't cover one more unit, "low_stock" if any required ingredient is at
    or under its reorder threshold, else "available". Nothing else in the
    backend computes this per-product (malaya.py's inventory_analysis flags
    low-stock ingredients, not the products that depend on them).
    """
    if not product_ids:
        return {}

    recipe_result = (
        supabase.table("recipe_items")
        .select("product_id, ingredient_id, quantity")
        .in_("product_id", product_ids)
        .execute()
    )
    recipe_rows = recipe_result.data
    if not recipe_rows:
        return {pid: "available" for pid in product_ids}

    ingredient_ids = {r["ingredient_id"] for r in recipe_rows}
    ingredients_result = (
        supabase.table("ingredients")
        .select("id, current_stock, reorder_threshold")
        .in_("id", list(ingredient_ids))
        .execute()
    )
    stock_by_ingredient = {i["id"]: i for i in ingredients_result.data}

    recipes_by_product: dict[str, list[dict]] = defaultdict(list)
    for r in recipe_rows:
        recipes_by_product[r["product_id"]].append(r)

    availability: dict[str, str] = {}
    for pid in product_ids:
        recipe = recipes_by_product.get(pid)
        if not recipe:
            availability[pid] = "available"
            continue

        status = "available"
        for item in recipe:
            ingredient = stock_by_ingredient.get(item["ingredient_id"])
            if not ingredient:
                continue
            current_stock = float(ingredient["current_stock"])
            needed = float(item["quantity"])
            reorder_threshold = float(ingredient["reorder_threshold"])
            if current_stock < needed:
                status = "unavailable"
                break
            if current_stock <= reorder_threshold:
                status = "low_stock"
        availability[pid] = status

    return availability


@router.get("/products", response_model=list[Product])
def list_products(
    branch_id: str = Query(...),
    active_only: bool = True,
    user: CurrentUser = Depends(get_current_user),
):
    require_branch_access(user, branch_id)
    supabase = get_supabase()
    query = supabase.table("products").select("*").eq("branch_id", branch_id)
    if active_only:
        query = query.eq("active", True)
    result = query.execute()
    products = result.data

    product_ids = [p["id"] for p in products]
    availability = _compute_product_availability(supabase, branch_id, product_ids)

    for p in products:
        p["availability"] = availability.get(p["id"], "available")
        if p.get("image_path"):
            p["image_url"] = supabase.storage.from_(PRODUCT_IMAGES_BUCKET).get_public_url(p["image_path"])
        else:
            p["image_url"] = None

    return products
