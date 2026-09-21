# Demo runbook

All accounts use password `demo1234`. Pick them from the Login dropdown (auto-fills).

## Before the demo (owner actions)
1. Deploy, API first: `cd services/api-fastapi && vercel deploy --prod --yes`, then `cd apps/dashboard-web && vercel deploy --prod --yes`.
2. (Optional) Add `GROQ_API_KEY` to the `smfc-api` Vercel project, then redeploy the API. Only Malaya chat needs it.
3. Replace the placeholder rows in `delivery_fees` with real barangays/fees.
4. Rotate the DB password and secret key after the demo.

## Suggested flow
1. **Cashier** `employee@danielito-agapita.com` -> POS: text cards, Dine In (table), Takeout, Delivery (pick barangay, fee shows), discount chip, VAT/Non-VAT, payment method, Hold (F4) / Held / Edit Order, Charge.
2. **Head office** `finance@corp.com` -> POS branch picker; Finance page tabs (PO History filters, CSV, detail); open Command Center, Logistics, HR, Utility Log to show all-access.
3. **Procurement** `procurement@corp.com` -> ticket, compile, canvass (`canvass@corp.com`), PO, signatures (procurement + finance), receiving with receipt photo.
4. **Logistics** `logistics@corp.com` -> transfer dispatch/confirm.
5. **Executive** -> Command Center live orders and menu costing margins.
6. **Kiosk** https://staff-clock-five.vercel.app -> staff time in/out; then HR Attendance.

## Known limits
- Trend Analysis and HR Flags show sample data.
- Delivery zones are demo placeholders.
- Preview URL (behind Vercel login): https://smfc-74ukfx19y-varix1.vercel.app
