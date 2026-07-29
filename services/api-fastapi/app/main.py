from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import inventory, products, recipes, transactions

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
app.include_router(transactions.router)


@app.get("/health")
def health():
    return {"status": "ok"}
