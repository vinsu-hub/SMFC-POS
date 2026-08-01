from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import (
    inventory,
    inventory_movements,
    kiosk,
    transfers,
    utility,
    hr,
    loss_records,
    malaya,
    products,
    recipes,
    summary,
    transactions,
)

app = FastAPI(title="Saint Michael Food Corp API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(products.router)
app.include_router(recipes.router)
app.include_router(inventory.router)
app.include_router(inventory_movements.router)
app.include_router(transfers.router)
app.include_router(utility.router)
app.include_router(hr.router)
app.include_router(kiosk.router)
app.include_router(transactions.router)
app.include_router(loss_records.router)
app.include_router(summary.router)
app.include_router(malaya.router)


@app.get("/health")
def health():
    return {"status": "ok"}
