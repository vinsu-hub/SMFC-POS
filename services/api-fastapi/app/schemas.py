from datetime import datetime
from typing import Literal

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


LossReason = Literal["spoilage", "breakage", "comp", "prep_error"]


class CreateLossRecordRequest(BaseModel):
    branch_id: str
    employee_id: str
    ingredient_id: str
    product_id: str | None = None
    reason: LossReason
    quantity: float
    photo_url: str | None = None


class LossRecordResponse(BaseModel):
    id: str
    branch_id: str
    ingredient_id: str
    product_id: str | None = None
    employee_id: str
    reason: LossReason
    quantity: float
    cost_impact: float
    photo_url: str | None = None
    created_at: datetime


class HourlyRevenuePoint(BaseModel):
    hour: int
    revenue: float


class BranchSummary(BaseModel):
    branch_id: str
    branch_name: str
    revenue: float
    cogs: float
    losses: float
    margin: float
    margin_percent: float
    hourly_revenue: list[HourlyRevenuePoint]


class OrganizationSummary(BaseModel):
    organization_id: str
    branches: list[BranchSummary]
    total_revenue: float
    total_cogs: float
    total_losses: float
    total_margin: float
    total_margin_percent: float
    hourly_revenue: list[HourlyRevenuePoint]


class MalayaQueryRequest(BaseModel):
    question: str


class MalayaChartPoint(BaseModel):
    label: str
    value: float


class MalayaChartSeries(BaseModel):
    name: str
    data: list[MalayaChartPoint]


class MalayaChartSpec(BaseModel):
    type: Literal["bar", "line"]
    title: str
    series: list[MalayaChartSeries]


class MalayaQueryResponse(BaseModel):
    answer: str
    chart: MalayaChartSpec | None = None
