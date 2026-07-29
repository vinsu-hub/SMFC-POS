import os
import uuid

import pytest
from fastapi.testclient import TestClient
from supabase import create_client

from app.deps import get_supabase
from app.main import app


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def matcha_latte_scenario():
    """Seeds one branch with a Matcha Latte recipe (2g matcha, 3g liquid sugar)
    and a real Supabase Auth user to act as the selling employee.

    Yields the seeded ids, then tears everything down afterward.
    """
    supabase = get_supabase()
    suffix = uuid.uuid4().hex[:8]

    org = (
        supabase.table("organizations")
        .insert({"name": f"Test Org {suffix}"})
        .execute()
        .data[0]
    )
    branch = (
        supabase.table("branches")
        .insert(
            {
                "organization_id": org["id"],
                "name": f"Test Cafe {suffix}",
                "type": "cafe",
                "theme_key": f"test-{suffix}",
            }
        )
        .execute()
        .data[0]
    )

    email = f"test-{suffix}@saintmichael.test"
    password = "Test1234!!"
    auth_user = supabase.auth.admin.create_user(
        {"email": email, "password": password, "email_confirm": True}
    )
    employee_id = auth_user.user.id

    # Use a throwaway client for sign-in so we don't mutate the shared
    # service-role client's auth state (its table() calls must keep using
    # the service-role key, not this test user's session).
    signin_client = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SECRET_KEY"])
    session = signin_client.auth.sign_in_with_password({"email": email, "password": password})
    access_token = session.session.access_token
    supabase.table("profiles").insert(
        {
            "id": employee_id,
            "branch_id": branch["id"],
            "role": "employee",
            "full_name": "Test Barista",
        }
    ).execute()

    matcha = (
        supabase.table("ingredients")
        .insert(
            {
                "branch_id": branch["id"],
                "name": "Matcha",
                "unit": "g",
                "unit_cost": 2.5,
                "current_stock": 100,
                "reorder_threshold": 10,
            }
        )
        .execute()
        .data[0]
    )
    syrup = (
        supabase.table("ingredients")
        .insert(
            {
                "branch_id": branch["id"],
                "name": "Liquid Sugar",
                "unit": "g",
                "unit_cost": 0.1,
                "current_stock": 100,
                "reorder_threshold": 10,
            }
        )
        .execute()
        .data[0]
    )

    product = (
        supabase.table("products")
        .insert(
            {
                "branch_id": branch["id"],
                "name": "Matcha Latte",
                "category": "drinks",
                "price": 150,
                "active": True,
            }
        )
        .execute()
        .data[0]
    )

    supabase.table("recipe_items").insert(
        [
            {"product_id": product["id"], "ingredient_id": matcha["id"], "quantity": 2},
            {"product_id": product["id"], "ingredient_id": syrup["id"], "quantity": 3},
        ]
    ).execute()

    yield {
        "branch_id": branch["id"],
        "employee_id": employee_id,
        "access_token": access_token,
        "product_id": product["id"],
        "matcha_id": matcha["id"],
        "syrup_id": syrup["id"],
    }

    supabase.table("transactions").delete().eq("branch_id", branch["id"]).execute()
    supabase.table("branches").delete().eq("id", branch["id"]).execute()
    supabase.table("organizations").delete().eq("id", org["id"]).execute()
    supabase.auth.admin.delete_user(employee_id)
