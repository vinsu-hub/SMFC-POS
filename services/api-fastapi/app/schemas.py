from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field, model_validator


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
    discount_type_id: str | None = None
    is_owner_request: bool = False
    owner_request_employee_number: str | None = None
    owner_request_pin: str | None = None
    owner_request_note: str | None = None


class TransactionItemResponse(BaseModel):
    id: str
    product_id: str
    quantity: float
    unit_price: float
    held_ingredient_ids: list[str] = []


class UpdateTransactionItemRequest(BaseModel):
    quantity: float | None = None
    held_ingredient_ids: list[str] | None = None


class TransactionResponse(BaseModel):
    id: str
    branch_id: str
    employee_id: str
    status: str
    opened_at: datetime
    closed_at: datetime | None = None
    total_amount: float
    discount_type_id: str | None = None
    discount_amount: float = 0
    tax_amount: float = 0
    is_owner_request: bool = False
    owner_request_by: str | None = None
    owner_request_note: str | None = None
    voided_by: str | None = None
    voided_at: datetime | None = None
    void_reason: str | None = None
    fulfilled: bool = False
    fulfilled_at: datetime | None = None
    items: list[TransactionItemResponse]


class VoidTransactionRequest(BaseModel):
    reason: str | None = None


# --- Discounts ---

class DiscountType(BaseModel):
    id: str
    branch_id: str
    name: str
    percentage: float
    vat_exempt: bool
    active: bool
    created_at: datetime
    updated_at: datetime


class DiscountTypeCreate(BaseModel):
    branch_id: str
    name: str
    percentage: float = Field(ge=0, le=100)
    vat_exempt: bool = False


class DiscountTypeUpdate(BaseModel):
    name: str | None = None
    percentage: float | None = Field(default=None, ge=0, le=100)
    vat_exempt: bool | None = None
    active: bool | None = None


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


# --- Inventory Movements ---

MovementType = Literal["trans_in", "trans_out", "delivery", "transfer_in", "transfer_out"]


class InventoryMovementCreate(BaseModel):
    branch_id: str
    ingredient_id: str
    type: MovementType
    quantity: float
    reason: str | None = None
    reference_id: str | None = None
    employee_id: str
    unit_cost: float | None = None  # delivery: overrides ingredient's stored unit_cost


class InventoryMovementResponse(BaseModel):
    id: str
    branch_id: str
    ingredient_id: str
    type: MovementType
    quantity: float
    reason: str | None = None
    reference_id: str | None = None
    employee_id: str
    unit_cost_snapshot: float | None = None
    created_at: datetime


# --- Transfers ---

class TransferCreate(BaseModel):
    from_branch_id: str
    to_branch_id: str
    ingredient_id: str
    quantity: float
    initiated_by: str
    notes: str | None = None


class TransferResponse(BaseModel):
    id: str
    from_branch_id: str
    to_branch_id: str
    ingredient_id: str
    ingredient_name: str | None = None
    quantity: float
    status: str
    initiated_by: str
    initiated_by_name: str | None = None
    confirmed_by: str | None = None
    initiated_at: datetime
    confirmed_at: datetime | None = None
    notes: str | None = None


class TransferUpdate(BaseModel):
    status: Literal["confirmed", "rejected", "cancelled"]


# --- Branches ---

class BranchResponse(BaseModel):
    id: str
    name: str
    theme_key: str


# --- Stock Requests ---

StockRequestStatus = Literal["pending", "fulfilled", "declined", "cancelled"]


class StockRequestCreate(BaseModel):
    requesting_branch_id: str
    source_branch_id: str
    ingredient_id: str
    quantity: float
    requested_by: str
    notes: str | None = None


class StockRequestResponse(BaseModel):
    id: str
    requesting_branch_id: str
    source_branch_id: str
    ingredient_id: str
    ingredient_name: str | None = None
    quantity: float
    status: StockRequestStatus
    requested_by: str
    requested_by_name: str | None = None
    notes: str | None = None
    transfer_id: str | None = None
    created_at: datetime
    updated_at: datetime


# --- Utility ---

UtilityType = Literal["electricity", "water", "gas"]


class UtilityLogCreate(BaseModel):
    branch_id: str
    utility_type: UtilityType
    business_date: date
    reading_start: float | None = None
    reading_end: float | None = None
    quantity: float | None = None
    unit_label: str | None = None
    days_covered: int | None = Field(None, ge=1, le=7)
    unit_cost: float
    recorded_by: str

    @model_validator(mode="after")
    def _validate_type_fields(self):
        if self.utility_type == "gas":
            if self.quantity is None or self.days_covered is None:
                raise ValueError("gas logs require quantity and days_covered")
        elif self.reading_start is None:
            raise ValueError(f"{self.utility_type} logs require reading_start")
        return self


class UtilityLogResponse(BaseModel):
    id: str
    branch_id: str
    utility_type: UtilityType
    business_date: date
    reading_start: float | None = None
    reading_end: float | None = None
    quantity: float | None = None
    unit_label: str | None = None
    days_covered: int | None = None
    unit_cost: float
    recorded_by: str
    created_at: datetime
    updated_at: datetime


class UtilitySummary(BaseModel):
    branch_id: str
    branch_name: str
    period_start: str | None = None
    period_end: str | None = None
    electricity: dict
    water: dict
    gas: dict
    total_cost: float


# --- HR / Attendance / Payroll ---

class ClockInRequest(BaseModel):
    employee_id: str
    branch_id: str


class ClockOutRequest(BaseModel):
    employee_id: str


class AttendanceLogResponse(BaseModel):
    id: str
    employee_id: str
    branch_id: str
    kiosk_id: str | None = None
    clock_in: datetime
    clock_out: datetime | None = None
    date: date
    hours_worked: float | None = None
    status: Literal["working", "on_break", "completed"]
    auto_closed: bool = False
    created_at: datetime
    updated_at: datetime


class AttendanceBreakResponse(BaseModel):
    id: str
    attendance_log_id: str
    break_start: datetime
    break_end: datetime | None = None


class EmployeeResponse(BaseModel):
    id: str
    full_name: str
    email: str
    role: str
    branch_id: str
    pay_rate: float
    position: str | None = None
    payroll_schedule: str


class EmployeeUpdate(BaseModel):
    pay_rate: float | None = None
    position: str | None = None
    payroll_schedule: str | None = None


class EmployeeCreate(BaseModel):
    branch_id: str
    full_name: str
    role: Literal["employee", "manager"]
    position: str | None = None
    pay_rate: float | None = None


class EmployeeCreatedResponse(EmployeeResponse):
    email: str
    default_password: str
    default_pin: str


class PayrollRow(BaseModel):
    employee_id: str
    employee_name: str
    position: str
    branch_id: str
    hours_worked: float
    pay_rate: float
    total_pay: float
    period_start: str
    period_end: str


class PayrollSummary(BaseModel):
    branch_id: str
    period_start: str
    period_end: str
    rows: list[PayrollRow]
    total_hours: float
    total_pay: float
    employee_count: int


class PayrollGenerateRequest(BaseModel):
    branch_id: str
    period_start: date
    period_end: date


# --- Staff Clock kiosk (PIN-based, no Supabase session) ---

class KioskVerifyRequest(BaseModel):
    employee_number: str
    pin: str
    kiosk_id: str


class KioskVerifyResponse(BaseModel):
    id: str
    full_name: str
    photo_url: str | None = None
    position: str | None = None
    branch_id: str
    today_status: Literal["not_started", "working", "on_break", "completed"]
    attendance_log_id: str | None = None


class KioskClockInRequest(BaseModel):
    employee_id: str
    kiosk_id: str


class KioskBreakRequest(BaseModel):
    attendance_log_id: str


class KioskClockOutRequest(BaseModel):
    attendance_log_id: str


class SetPinRequest(BaseModel):
    pin: str = Field(min_length=4, max_length=8, pattern=r"^\d+$")


class PayrollItemResponse(BaseModel):
    id: str
    payroll_record_id: str
    employee_id: str
    employee_name: str
    position: str | None = None
    hours_worked: float
    pay_rate: float
    total_pay: float


class PayrollRecordResponse(BaseModel):
    id: str
    branch_id: str
    period_start: date
    period_end: date
    total_hours: float
    total_pay: float
    employee_count: int
    generated_by: str
    created_at: datetime
    items: list[PayrollItemResponse] = []


# --- Existing summary models ---

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
