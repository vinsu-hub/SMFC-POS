import { PurchaseOrder, peso } from '@/lib/procurement';

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Prints an A4 purchase order with signature lines for procurement head and finance admin. */
export function printPurchaseOrder(po: PurchaseOrder) {
  const rows = po.po_allocations
    .map((a) => `<tr><td>${esc(a.branches?.name ?? '—')}</td><td class="r">${a.quantity} ${esc(po.unit)}</td></tr>`)
    .join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(po.po_number)}</title>
<style>
  @page { size: A4; margin: 18mm; }
  body { font-family: Arial, sans-serif; color: #111; font-size: 13px; }
  h1 { margin: 0; font-size: 22px; } h2 { font-size: 14px; margin: 18px 0 6px; }
  table { width: 100%; border-collapse: collapse; } td, th { border: 1px solid #999; padding: 6px 8px; text-align: left; }
  th { background: #eee; } .r { text-align: right; } .head { display: flex; justify-content: space-between; align-items: flex-start; }
  .sign { display: flex; gap: 24px; margin-top: 56px; } .sign div { flex: 1; text-align: center; border-top: 1px solid #111; padding-top: 6px; }
  .note { margin-top: 24px; font-size: 11px; color: #444; }
</style></head><body>
<div class="head"><div><h1>PURCHASE ORDER</h1><div>Saint Michael Food Corp</div></div>
<div class="r"><b>${esc(po.po_number)}</b><br>${new Date(po.created_at).toLocaleDateString()}</div></div>
<h2>Supplier</h2>
<div><b>${esc(po.suppliers?.name ?? '—')}</b><br>${esc(po.suppliers?.location ?? '')}<br>${esc(po.suppliers?.contact_number ?? '')}</div>
<h2>Item</h2>
<table><tr><th>Item</th><th class="r">Quantity</th><th class="r">Unit price</th><th class="r">Total</th></tr>
<tr><td>${esc(po.item_name)}</td><td class="r">${po.quantity} ${esc(po.unit)}</td><td class="r">${peso(po.unit_cost)}</td><td class="r">${peso(po.total)}</td></tr></table>
<h2>Deliver / allocate to</h2>
<table><tr><th>Branch</th><th class="r">Quantity</th></tr>${rows}</table>
<div class="sign"><div>Head of Procurement<br><small>Signature over printed name / date</small></div>
<div>Finance Admin<br><small>Signature over printed name / date</small></div>
<div>Received by (Canvass Personnel)<br><small>Attach photo of supplier receipt in the system</small></div></div>
<p class="note">Canvass personnel: buy only up to the quantity and price above. Log the actual unit price and take a photo of the receipt when the goods are received.</p>
</body></html>`;
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(frame);
  const doc = frame.contentWindow!.document;
  doc.open();
  doc.write(html);
  doc.close();
  setTimeout(() => {
    frame.contentWindow!.focus();
    frame.contentWindow!.print();
    setTimeout(() => frame.remove(), 1500);
  }, 250);
}
