from datetime import datetime

from pydantic import BaseModel


class Product(BaseModel):
    id: str
    branch_id: str
    name: str
    category: str
    price: float
    active: bool


class Ingredient(BaseModel):
    id: str
    branch_id: str
    name: str
    unit: str
    unit_cost: float
    current_stock: float
    reorder_threshold: float
    expiry_date: str | None = None


class InventoryCountRequest(BaseModel):
    counted_stock: float


class TransactionItemRequest(BaseModel):
    product_id: str
    quantity: float


class CreateTransactionRequest(BaseModel):
    branch_id: str
    employee_id: str
    items: list[TransactionItemRequest]


class TransactionItemResponse(BaseModel):
    id: str
    product_id: str
    quantity: float
    unit_price: float


class TransactionResponse(BaseModel):
    id: str
    branch_id: str
    employee_id: str
    status: str
    opened_at: datetime
    closed_at: datetime | None = None
    total_amount: float
    items: list[TransactionItemResponse]
