import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Plus, Minus, Trash2, Loader2, Search, Users, ShoppingBag, Truck, Pencil, X, AlertTriangle, Percent, PauseCircle,
  Play, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { ApiBranch, ApiDiscountType, ApiKitchenSummary, fetchBranches, fetchDiscountTypes, fetchKitchenSummary } from '@/lib/api';
import {
  BusinessDay, Availability, PosDeliveryFee, PosOrderType, PosPayment, PosProduct,
  createPosSale, fetchDeliveryFees, fetchPosMenu, fetchRequireBusinessDay, fetchTodayBusinessDay, openBusinessDay,
} from '@/lib/posApi';
import { formatCurrency } from '@/lib/utils';
import { getBranchConfig, isExecutiveLike, type CompanyKey } from '@/lib/types';

interface CartLine { id: string; name: string; price: number; quantity: number; note: string }
interface HeldCart { id: string; heldAt: string; lines: CartLine[]; orderType: PosOrderType; table: string }

type AvailabilityFilter = 'all' | Availability;
type VatMode = 'vat' | 'non_vat';

const PAGE_SIZE = 12;
const HELD_KEY = 'pos-held-carts';
const VAT_RATE = 0.12;

interface BranchPosTheme {
  pageBg: string;
  pillBg: string;
  pillActive: string;
  cardBg: string;
  cardBorder: string;
  cardHeading: string;
  primaryBtn: string;
  accentGold: string;
  accentOrange: string;
  accentRed: string;
  ticketBg: string;
  ticketBorder: string;
  ticketHeading: string;
  emptyText: string;
  loadingText: string;
  displayFont: string;
  bodyFont: string;
}

const POS_THEMES: Record<CompanyKey, BranchPosTheme> = {
  danielito: {
    pageBg: 'bg-[#F8F4EC]',
    pillBg: 'bg-white border border-[#1C4B3A]/15',
    pillActive: 'bg-[#1C4B3A] text-white border-transparent',
    cardBg: 'bg-white',
    cardBorder: 'border border-[#1C4B3A]/10',
    cardHeading: 'text-[#1A1A1A]',
    primaryBtn: 'bg-[#1C4B3A] hover:bg-[#163C2E] text-white',
    accentGold: '#D8A73D',
    accentOrange: '#E08A3C',
    accentRed: '#C24A3F',
    ticketBg: 'bg-white',
    ticketBorder: 'border-l-4 border-l-[#D8A73D]',
    ticketHeading: 'font-danielito-display font-semibold text-[#1C4B3A]',
    emptyText: 'text-[#6B6B63] font-danielito-body',
    loadingText: 'text-[#1C4B3A]',
    displayFont: 'font-danielito-display',
    bodyFont: 'font-danielito-body',
  },
  malaya: {
    pageBg: 'bg-[#EFE6D4]',
    pillBg: 'bg-white border border-[#6E8368]/20',
    pillActive: 'bg-[#6E8368] text-white border-transparent',
    cardBg: 'bg-white',
    cardBorder: 'border border-[#D9A441]/30',
    cardHeading: 'text-[#3C2E26]',
    primaryBtn: 'bg-[#6E8368] hover:bg-[#5A6B56] text-white',
    accentGold: '#D9A441',
    accentOrange: '#C98A2C',
    accentRed: '#B23A2E',
    ticketBg: 'bg-white',
    ticketBorder: 'border-l-4 border-l-[#D9A441]',
    ticketHeading: 'font-malaya-display font-medium text-[#3C2E26]',
    emptyText: 'text-[#6E8368]/60 font-malaya-body',
    loadingText: 'text-[#6E8368]',
    displayFont: 'font-malaya-display',
    bodyFont: 'font-malaya-body',
  },
  dden: {
    pageBg: 'bg-[#241726]',
    pillBg: 'bg-[#2E1B31] border border-[#8B4513]/40',
    pillActive: 'bg-[#8B4513] text-white border-transparent',
    cardBg: 'bg-[#2E1B31]',
    cardBorder: 'border border-[#8B4513]/30',
    cardHeading: 'text-[#E9E2D9]',
    primaryBtn: 'bg-[#8B4513] hover:bg-[#A0522D] text-white',
    accentGold: '#A0522D',
    accentOrange: '#C98A2C',
    accentRed: '#7A2E3B',
    ticketBg: 'bg-[#2E1B31]',
    ticketBorder: 'border-l-4 border-l-[#8B4513]',
    ticketHeading: 'font-dden-display uppercase tracking-wide text-[#E9E2D9]',
    emptyText: 'text-[#E9E2D9]/40 font-dden-body',
    loadingText: 'text-[#E9E2D9]',
    displayFont: 'font-dden-display',
    bodyFont: 'font-dden-body',
  },
  dvenue: {
    pageBg: 'bg-[#EDF2EF]',
    pillBg: 'bg-white border border-[#1B4B43]/15',
    pillActive: 'bg-[#1B4B43] text-white border-transparent',
    cardBg: 'bg-white',
    cardBorder: 'border border-[#1B4B43]/10',
    cardHeading: 'text-[#1B4B43]',
    primaryBtn: 'bg-[#1B4B43] hover:bg-[#123530] text-white',
    accentGold: '#C9A24B',
    accentOrange: '#C98A2C',
    accentRed: '#B23A2E',
    ticketBg: 'bg-white',
    ticketBorder: 'border-l-4 border-l-[#C9A24B]',
    ticketHeading: 'font-dvenue-display font-semibold text-[#1B4B43]',
    emptyText: 'text-muted-foreground font-dvenue-body',
    loadingText: 'text-[#1B4B43]',
    displayFont: 'font-dvenue-display',
    bodyFont: 'font-dvenue-body',
  },
  isabelas: {
    pageBg: 'bg-[#F5EBE4]',
    pillBg: 'bg-white border border-[#6B2E3A]/15',
    pillActive: 'bg-[#6B2E3A] text-white border-transparent',
    cardBg: 'bg-white',
    cardBorder: 'border border-[#6B2E3A]/10',
    cardHeading: 'text-[#6B2E3A]',
    primaryBtn: 'bg-[#6B2E3A] hover:bg-[#4E2029] text-white',
    accentGold: '#E8D9B5',
    accentOrange: '#C98A2C',
    accentRed: '#B23A2E',
    ticketBg: 'bg-white',
    ticketBorder: 'border-l-4 border-l-[#E8D9B5]',
    ticketHeading: 'font-isabelas-display font-semibold text-[#6B2E3A]',
    emptyText: 'text-[#6B2E3A]/50 font-isabelas-body',
    loadingText: 'text-[#6B2E3A]',
    displayFont: 'font-isabelas-display',
    bodyFont: 'font-isabelas-body',
  },
};

function loadHeld(): HeldCart[] {
  try { return JSON.parse(localStorage.getItem(HELD_KEY) || '[]') as HeldCart[]; } catch { return []; }
}

export default function POSTerminal() {
  const { user } = useAuth();
  const companyWide = isExecutiveLike(user?.role);
  const canUse = !!user && (user.role === 'employee' || user.role === 'manager' || companyWide);

  const [branches, setBranches] = useState<ApiBranch[]>([]);
  const [pickedBranch, setPickedBranch] = useState<string>('');
  const branchId = companyWide ? pickedBranch : user?.branchId ?? '';
  const branchThemeKey = companyWide ? branches.find((b) => b.id === pickedBranch)?.theme_key : user?.branch;
  const theme = POS_THEMES[getBranchConfig(branchThemeKey).companyKey as CompanyKey];

  const [products, setProducts] = useState<PosProduct[]>([]);
  const [loadingMenu, setLoadingMenu] = useState(false);
  const [category, setCategory] = useState('All');
  const [availability, setAvailability] = useState<AvailabilityFilter>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);

  const [discountTypes, setDiscountTypes] = useState<ApiDiscountType[]>([]);
  const [discountId, setDiscountId] = useState<string | null>(null);
  const [kitchen, setKitchen] = useState<ApiKitchenSummary | null>(null);

  const [cart, setCart] = useState<CartLine[]>([]);
  const [orderType, setOrderType] = useState<PosOrderType>('dine_in');
  const [table, setTable] = useState('');
  const [guests, setGuests] = useState(2);
  const [vatMode, setVatMode] = useState<VatMode>('vat');
  const [payment, setPayment] = useState<PosPayment | null>(null);
  const [cardType, setCardType] = useState<'debit' | 'credit'>('debit');
  const [charging, setCharging] = useState(false);
  const [held, setHeld] = useState<HeldCart[]>(loadHeld);

  const [fees, setFees] = useState<PosDeliveryFee[]>([]);
  const [dName, setDName] = useState('');
  const [dPhone, setDPhone] = useState('');
  const [dAddress, setDAddress] = useState('');
  const [dLandmark, setDLandmark] = useState('');
  const [dBarangay, setDBarangay] = useState('');

  const [noteId, setNoteId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [editOpen, setEditOpen] = useState(false);

  const [ownerOpen, setOwnerOpen] = useState(false);
  const [ownerForm, setOwnerForm] = useState({ employeeNumber: '', pin: '', note: '' });
  const [owner, setOwner] = useState<typeof ownerForm | null>(null);

  const [requireDay, setRequireDay] = useState(false);
  const [day, setDay] = useState<BusinessDay | null>(null);
  const [dayOpen, setDayOpen] = useState(false);
  const [dayForm, setDayForm] = useState({ employeeNumber: '', pin: '' });
  const [dayBusy, setDayBusy] = useState(false);

  useEffect(() => {
    if (!companyWide) return;
    fetchBranches().then((b) => { setBranches(b); setPickedBranch((cur) => cur || b[0]?.id || ''); }).catch(() => toast.error('Could not load branches'));
  }, [companyWide]);

  useEffect(() => {
    if (!canUse) return;
    fetchDeliveryFees().then(setFees).catch(() => { /* delivery stays selectable without fee readout */ });
    fetchRequireBusinessDay().then(setRequireDay).catch(() => {});
  }, [canUse]);

  const refreshDay = useCallback(() => {
    if (companyWide) return;
    fetchTodayBusinessDay().then(setDay).catch(() => setDay(null));
  }, [companyWide]);
  useEffect(() => { if (canUse) refreshDay(); }, [canUse, refreshDay]);

  const loadMenu = useCallback(() => {
    if (!branchId) return;
    setLoadingMenu(true);
    fetchPosMenu(branchId)
      .then(setProducts)
      .catch((e: Error) => toast.error(e.message || 'Could not load the menu.'))
      .finally(() => setLoadingMenu(false));
    fetchDiscountTypes(branchId, true).then(setDiscountTypes).catch(() => setDiscountTypes([]));
    fetchKitchenSummary(branchId).then(setKitchen).catch(() => setKitchen(null));
  }, [branchId]);
  useEffect(() => {
    setCart([]); setDiscountId(null); setCategory('All'); setPage(0);
    loadMenu();
  }, [loadMenu]);

  useEffect(() => { try { localStorage.setItem(HELD_KEY, JSON.stringify(held)); } catch { /* ignore */ } }, [held]);

  const categories = useMemo(() => ['All', ...Array.from(new Set(products.map((p) => p.category))).sort()], [products]);
  const counts = useMemo(() => ({
    all: products.length,
    available: products.filter((p) => p.availability === 'available').length,
    low_stock: products.filter((p) => p.availability === 'low_stock').length,
    unavailable: products.filter((p) => p.availability === 'unavailable').length,
  }), [products]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) =>
      (category === 'All' || p.category === category) &&
      (availability === 'all' || p.availability === availability) &&
      (!q || p.name.toLowerCase().includes(q)));
  }, [products, category, availability, search]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  useEffect(() => { setPage(0); }, [category, availability, search]);

  const discount = discountTypes.find((d) => d.id === discountId) ?? null;
  const subtotal = cart.reduce((n, l) => n + l.price * l.quantity, 0);
  const discountAmount = discount ? Math.round(subtotal * discount.percentage) / 100 : 0;
  const net = subtotal - discountAmount;
  const vatExempt = vatMode === 'non_vat' || !!discount?.vat_exempt;
  const tax = vatExempt ? 0 : Math.round(net * VAT_RATE * 100) / 100;
  const deliveryFee = orderType === 'delivery' ? fees.find((f) => f.barangay === dBarangay)?.fee ?? 0 : 0;
  const total = net + tax + deliveryFee;

  const dayLocked = requireDay && !companyWide && !!day && !day.is_open;

  const addItem = (p: PosProduct) => {
    if (p.availability === 'unavailable') return;
    setCart((c) => c.some((l) => l.id === p.id)
      ? c.map((l) => (l.id === p.id ? { ...l, quantity: l.quantity + 1 } : l))
      : [...c, { id: p.id, name: p.name, price: p.price, quantity: 1, note: '' }]);
  };
  const changeQty = (id: string, d: number) => setCart((c) => c.map((l) => (l.id === id ? { ...l, quantity: l.quantity + d } : l)).filter((l) => l.quantity > 0));
  const removeLine = (id: string) => setCart((c) => c.filter((l) => l.id !== id));

  const clearOrder = useCallback(() => {
    setCart([]); setDiscountId(null); setOwner(null); setTable(''); setPayment(null); setVatMode('vat');
    setDName(''); setDPhone(''); setDAddress(''); setDLandmark(''); setDBarangay('');
  }, []);

  const holdOrder = useCallback(() => {
    if (cart.length === 0) return void toast.error('Nothing to hold — the order is empty');
    setHeld((h) => [...h, { id: crypto.randomUUID(), heldAt: new Date().toISOString(), lines: cart, orderType, table }]);
    clearOrder();
    toast.success('Order held');
  }, [cart, orderType, table, clearOrder]);

  const resumeHeld = (h: HeldCart) => {
    setCart(h.lines); setOrderType(h.orderType); setTable(h.table);
    setHeld((all) => all.filter((x) => x.id !== h.id));
  };

  // F3 discount, F4 hold, Esc clear (ignored while typing in a field or a dialog is open)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F3') { e.preventDefault(); document.getElementById('discount-chip-row')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      else if (e.key === 'F4') { e.preventDefault(); holdOrder(); }
      else if (e.key === 'Escape' && !document.querySelector('[role="dialog"]') && cart.length > 0) clearOrder();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [holdOrder, clearOrder, cart.length]);

  if (!canUse) {
    return (
      <DashboardLayout title="POS Terminal">
        <p className="p-6 text-center text-destructive">Access denied. The POS is for branch staff and executive/finance accounts.</p>
      </DashboardLayout>
    );
  }

  const blockers: string[] = [];
  if (!branchId) blockers.push('Pick a branch');
  if (dayLocked) blockers.push('Start the business day');
  if (cart.length === 0) blockers.push('Add items');
  if (orderType === 'dine_in' && !table.trim()) blockers.push('Enter a table number');
  if (orderType === 'delivery') {
    if (!dName.trim() || !dPhone.trim() || !dAddress.trim()) blockers.push('Enter delivery customer details');
    if (!dBarangay) blockers.push('Pick a barangay');
  }
  if (!payment) blockers.push('Choose a payment method');

  const charge = async () => {
    if (blockers.length > 0 || !payment) return void toast.error(blockers[0]);
    setCharging(true);
    try {
      const sale = await createPosSale({
        branch_id: companyWide ? branchId : undefined,
        order_type: orderType,
        items: cart.map((l) => ({ product_id: l.id, quantity: l.quantity, note: l.note || undefined })),
        discount_type_id: discountId,
        force_vat_exempt: vatMode === 'non_vat',
        table_number: orderType === 'dine_in' ? table.trim() : null,
        guest_count: orderType === 'dine_in' ? guests : null,
        payment_method: payment,
        card_type: cardType,
        is_owner_request: !!owner,
        owner_request_employee_number: owner?.employeeNumber,
        owner_request_pin: owner?.pin,
        owner_request_note: owner?.note || undefined,
        delivery: orderType === 'delivery'
          ? { customer_name: dName.trim(), customer_phone: dPhone.trim(), address: dAddress.trim(), landmark: dLandmark.trim() || null, barangay: dBarangay }
          : null,
      });
      toast.success(`Order ${sale.order_number ?? ''} charged: ${formatCurrency(sale.total_amount + sale.tax_amount + sale.delivery_fee)}`);
      clearOrder();
      loadMenu();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Order failed to save. Try again.');
    } finally {
      setCharging(false);
    }
  };

  const submitDay = async () => {
    if (!dayForm.employeeNumber || !dayForm.pin) return void toast.error('Enter your employee number and PIN');
    setDayBusy(true);
    try {
      setDay(await openBusinessDay(dayForm.employeeNumber, dayForm.pin));
      setDayOpen(false);
      setDayForm({ employeeNumber: '', pin: '' });
      toast.success('Business day started');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not start the business day');
    } finally {
      setDayBusy(false);
    }
  };

  const orderTypes: { v: PosOrderType; label: string; Icon: typeof Users }[] = [
    { v: 'dine_in', label: 'Dine In', Icon: Users },
    { v: 'takeout', label: 'Takeout', Icon: ShoppingBag },
    { v: 'delivery', label: 'Delivery', Icon: Truck },
  ];
  const chip = 'shrink-0 px-3 py-1.5 rounded-full text-sm border transition-colors';

  return (
    <DashboardLayout title="POS Terminal">
      <div className={`flex flex-col lg:flex-row h-full ${theme.pageBg}`}>
        {/* Menu side */}
        <div className="flex-1 min-w-0 p-3 sm:p-4 lg:p-6 overflow-auto space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {companyWide && (
              <Select value={pickedBranch} onValueChange={setPickedBranch}>
                <SelectTrigger className="w-56 h-9" aria-label="Branch"><SelectValue placeholder="Select branch" /></SelectTrigger>
                <SelectContent className="max-h-72">{branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
              </Select>
            )}
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search menu items" className={`pl-9 ${theme.bodyFont}`} />
            </div>
            {!companyWide && requireDay && day && !day.is_open && (
              <Button data-pos-business-day size="sm" className="gap-2" onClick={() => setDayOpen(true)}>
                <Play className="w-4 h-4" /> Start Business Day
              </Button>
            )}
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1">
            {categories.map((c) => (
              <button key={c} type="button" onClick={() => setCategory(c)}
                className={`${chip} ${theme.bodyFont} ${category === c ? theme.pillActive : `${theme.pillBg} ${theme.cardHeading}`}`}>{c}</button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {([['all', 'All'], ['available', 'Available'], ['low_stock', 'Low Stock'], ['unavailable', 'Unavailable']] as const).map(([f, label]) => (
              <button key={f} type="button" onClick={() => setAvailability(f)}
                className={`px-3 py-1 rounded-full text-xs border ${availability === f ? 'bg-primary text-primary-foreground border-transparent' : 'bg-card text-muted-foreground border-border-regular'}`}>
                {label} ({counts[f]})
              </button>
            ))}
          </div>

          {loadingMenu ? (
            <div className={`flex items-center justify-center py-16 ${theme.loadingText}`}><Loader2 className="w-6 h-6 mr-2 animate-spin" />Loading menu...</div>
          ) : visible.length === 0 ? (
            <p className={`text-center py-16 ${theme.emptyText}`}>{branchId ? 'No items match this view.' : 'Select a branch to load its menu.'}</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3" data-testid="pos-menu">
              {visible.map((p) => {
                const out = p.availability === 'unavailable';
                return (
                  <button key={p.id} type="button" disabled={out} onClick={() => addItem(p)} data-testid="pos-item"
                    className={`text-left rounded-lg p-3 min-h-[92px] flex flex-col justify-between ${theme.cardBg} ${theme.cardBorder} ${out ? 'opacity-60 cursor-not-allowed' : 'hover:shadow-md active:scale-[0.98] transition'}`}>
                    <p className={`text-sm font-semibold leading-snug ${theme.cardHeading} ${theme.displayFont}`}>{p.name}</p>
                    <div className="flex items-center justify-between gap-1 mt-2">
                      <span className="text-sm font-corp-mono">{formatCurrency(p.price)}</span>
                      {p.availability === 'low_stock' && <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded text-white" style={{ backgroundColor: theme.accentOrange }}>Low</span>}
                      {out && <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded text-white" style={{ backgroundColor: theme.accentRed }}>Out</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {pageCount > 1 && (
            <div className="flex items-center justify-center gap-3 text-sm">
              <Button size="icon-sm" variant="outline" disabled={safePage === 0} onClick={() => setPage(safePage - 1)} aria-label="Previous page"><ChevronLeft className="w-4 h-4" /></Button>
              <span>Page {safePage + 1} of {pageCount}</span>
              <Button size="icon-sm" variant="outline" disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)} aria-label="Next page"><ChevronRight className="w-4 h-4" /></Button>
            </div>
          )}
        </div>

        {/* Current order */}
        <div className={`w-full lg:w-[400px] shrink-0 ${theme.ticketBg} ${theme.ticketBorder} p-4 flex flex-col shadow-lg lg:overflow-y-auto`}>
          <div className="flex items-center justify-between mb-3">
            <h2 className={`text-xl ${theme.ticketHeading}`}>Current Order</h2>
            <div className="flex items-center gap-1.5">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5"><PauseCircle className="w-3.5 h-3.5" />Held ({held.length})</Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 space-y-1">
                  {held.length === 0 && <p className="text-sm text-muted-foreground">No held orders.</p>}
                  {held.map((h) => (
                    <button key={h.id} onClick={() => resumeHeld(h)} className="w-full text-left text-sm p-2 rounded hover:bg-accent">
                      {h.lines.length} item{h.lines.length === 1 ? '' : 's'}{h.table ? ` · Table ${h.table}` : ''} · {new Date(h.heldAt).toLocaleTimeString()}
                    </button>
                  ))}
                </PopoverContent>
              </Popover>
              <Button variant="outline" size="sm" disabled={cart.length === 0} onClick={() => setEditOpen(true)}>Edit Order</Button>
            </div>
          </div>

          <div className="grid grid-cols-3 rounded-md overflow-hidden border border-border-regular mb-3">
            {orderTypes.map(({ v, label, Icon }) => (
              <button key={v} type="button" onClick={() => setOrderType(v)}
                className={`flex items-center justify-center gap-1.5 py-2 text-sm ${theme.bodyFont} ${orderType === v ? theme.primaryBtn : 'bg-card text-foreground'}`}>
                <Icon className="w-4 h-4" />{label}
              </button>
            ))}
          </div>

          {orderType === 'dine_in' && (
            <div className="flex items-center gap-2 mb-3">
              <Input value={table} onChange={(e) => setTable(e.target.value)} placeholder="Table #" inputMode="numeric" aria-label="Table number" className="w-28 h-9" />
              <div className="flex items-center gap-1 ml-auto text-sm">
                <Button size="icon-sm" variant="outline" onClick={() => setGuests((g) => Math.max(1, g - 1))} aria-label="Fewer guests"><Minus className="w-3 h-3" /></Button>
                <span className="w-6 text-center">{guests}</span>
                <Button size="icon-sm" variant="outline" onClick={() => setGuests((g) => g + 1)} aria-label="More guests"><Plus className="w-3 h-3" /></Button>
                <span className="text-xs text-muted-foreground">Guests</span>
              </div>
            </div>
          )}

          {orderType === 'delivery' && (
            <div className="space-y-2 mb-3">
              <div className="grid grid-cols-2 gap-2">
                <Input value={dName} onChange={(e) => setDName(e.target.value)} placeholder="Customer name" />
                <Input value={dPhone} onChange={(e) => setDPhone(e.target.value)} placeholder="Phone" inputMode="tel" />
              </div>
              <Input value={dAddress} onChange={(e) => setDAddress(e.target.value)} placeholder="Address" />
              <Input value={dLandmark} onChange={(e) => setDLandmark(e.target.value)} placeholder="Landmark (optional)" />
              <Select value={dBarangay} onValueChange={setDBarangay}>
                <SelectTrigger><SelectValue placeholder={fees.length ? 'Barangay' : 'No delivery zones configured'} /></SelectTrigger>
                <SelectContent className="max-h-64">{fees.map((f) => <SelectItem key={f.barangay} value={f.barangay}>{f.barangay} ({f.zone}) · {formatCurrency(f.fee)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}

          <div className="flex-1 min-h-[120px] max-h-[34vh] lg:max-h-none overflow-y-auto space-y-2 mb-3">
            {cart.length === 0 ? <p className={`text-center py-8 ${theme.emptyText}`}>No items</p> : cart.map((l, i) => (
              <div key={l.id} className="rounded-md border border-border-regular border-l-4 p-2.5" style={{ borderLeftColor: theme.accentGold }} data-testid="cart-line">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className={`text-sm font-semibold ${theme.cardHeading}`}>{i + 1}. {l.name}</p>
                    <p className="text-xs text-muted-foreground">{formatCurrency(l.price)}</p>
                    {l.note && <span className="inline-block mt-1 text-xs bg-accent-soft text-accent-foreground rounded-full px-2 py-0.5">{l.note}</span>}
                  </div>
                  <div className="flex items-center shrink-0">
                    <button onClick={() => { setNoteId(l.id); setNoteDraft(l.note); }} title="Add note" aria-label="Add note" className="p-1.5"><Pencil className="w-3.5 h-3.5 text-muted-foreground" /></button>
                    <button onClick={() => removeLine(l.id)} aria-label="Remove item" className="p-1.5 text-destructive"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-1.5">
                  <Button variant="outline" size="icon-sm" onClick={() => changeQty(l.id, -1)} aria-label="Decrease"><Minus className="w-3 h-3" /></Button>
                  <span className="w-7 text-center font-corp-mono">{l.quantity}</span>
                  <Button variant="outline" size="icon-sm" onClick={() => changeQty(l.id, 1)} aria-label="Increase"><Plus className="w-3 h-3" /></Button>
                  <span className="ml-auto font-corp-mono text-sm">{formatCurrency(l.price * l.quantity)}</span>
                </div>
              </div>
            ))}
          </div>

          {discountTypes.length > 0 && (
            <div id="discount-chip-row" className="flex flex-wrap gap-1.5 mb-3">
              {discountTypes.map((d) => (
                <Button key={d.id} type="button" size="sm" variant={discountId === d.id ? 'default' : 'outline'}
                  onClick={() => setDiscountId((c) => (c === d.id ? null : d.id))} className="text-xs">{d.name} ({d.percentage}%)</Button>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 mb-2">
            <div className="grid grid-cols-2 rounded-md overflow-hidden border border-border-regular text-xs">
              {(['vat', 'non_vat'] as VatMode[]).map((m) => (
                <button key={m} type="button" onClick={() => setVatMode(m)} className={`py-1.5 ${vatMode === m ? theme.primaryBtn : 'bg-card'}`}>{m === 'vat' ? 'VAT' : 'Non-VAT'}</button>
              ))}
            </div>
            <Button type="button" size="sm" variant={owner ? 'default' : 'outline'} className="gap-1.5 text-xs"
              onClick={() => { setOwnerForm({ employeeNumber: '', pin: '', note: '' }); setOwnerOpen(true); }}>
              <AlertTriangle className="w-3.5 h-3.5" />{owner ? "Owner's Request ✓" : "Owner's Request"}
            </Button>
          </div>

          <div className="border-t-2 border-border-regular pt-3 space-y-1.5 text-sm">
            <div className="flex justify-between"><span>Subtotal</span><span className="font-corp-mono">{formatCurrency(subtotal)}</span></div>
            {discount && <div className="flex justify-between text-destructive"><span>{discount.name} (-{discount.percentage}%)</span><span className="font-corp-mono">-{formatCurrency(discountAmount)}</span></div>}
            <div className="flex justify-between"><span>VAT (12%){vatExempt ? ' — exempt' : ''}</span><span className="font-corp-mono">{formatCurrency(tax)}</span></div>
            {orderType === 'delivery' && <div className="flex justify-between"><span>Delivery fee</span><span className="font-corp-mono">{formatCurrency(deliveryFee)}</span></div>}
            <div className="flex justify-between p-2 rounded font-bold text-lg" style={{ backgroundColor: `${theme.accentGold}33` }}>
              <span>Total</span><span className="font-corp-mono" data-testid="pos-total">{formatCurrency(total)}</span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-1.5 mt-3" role="group" aria-label="Payment method">
            {(['cash', 'gcash', 'card'] as PosPayment[]).map((m) => (
              <button key={m} type="button" onClick={() => setPayment(m)}
                className={`text-sm py-2 rounded border capitalize ${payment === m ? `${theme.primaryBtn} border-transparent` : 'bg-card border-border-regular text-foreground'}`}>{m === 'gcash' ? 'GCash' : m}</button>
            ))}
          </div>
          {payment === 'card' && (
            <div className="grid grid-cols-2 gap-1.5 mt-1.5">
              {(['debit', 'credit'] as const).map((t) => (
                <button key={t} type="button" onClick={() => setCardType(t)} className={`text-xs py-1.5 rounded border capitalize ${cardType === t ? `${theme.primaryBtn} border-transparent` : 'bg-card border-border-regular'}`}>{t}</button>
              ))}
            </div>
          )}

          <div className="flex gap-2 mt-3">
            <Button variant="outline" size="sm" className="gap-1.5 flex-1" onClick={() => document.getElementById('discount-chip-row')?.scrollIntoView({ behavior: 'smooth' })}>
              <Percent className="w-3.5 h-3.5" />Discount <kbd className="text-[10px] text-muted-foreground">F3</kbd>
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 flex-1" onClick={holdOrder}>
              <PauseCircle className="w-3.5 h-3.5" />Hold <kbd className="text-[10px] text-muted-foreground">F4</kbd>
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 flex-1 text-destructive" onClick={clearOrder} disabled={cart.length === 0}>
              <X className="w-3.5 h-3.5" />Clear <kbd className="text-[10px] text-muted-foreground">Esc</kbd>
            </Button>
          </div>

          <Button onClick={charge} disabled={charging} className={`w-full mt-3 py-6 text-base ${theme.primaryBtn}`} data-testid="pos-charge">
            {charging ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : null}
            {charging ? 'Charging…' : blockers.length > 0 ? `${blockers[0]}` : `Charge ${formatCurrency(total)}`}
          </Button>
          {dayLocked && <p className="text-xs text-center text-muted-foreground mt-2">Press "Start Business Day" to unlock the POS.</p>}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 px-4 py-2 border-t border-border-regular bg-card text-xs text-muted-foreground">
        <span>Kitchen: {kitchen ? `${kitchen.queued_count} queued, ${kitchen.preparing_count} preparing` : '—'}</span>
        <span>Low stock alerts: {counts.low_stock + counts.unavailable}</span>
        <span>Pending orders: {kitchen ? kitchen.queued_count + kitchen.preparing_count + kitchen.ready_count : '—'}</span>
      </div>

      {/* Item note */}
      <Dialog open={!!noteId} onOpenChange={(o) => !o && setNoteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Item Note</DialogTitle><DialogDescription>e.g. "No rice", "Extra sauce" — shown to the kitchen.</DialogDescription></DialogHeader>
          <Input value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} placeholder="Add a note..." autoFocus />
          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setNoteId(null)}>Cancel</Button>
            <Button className="flex-1" onClick={() => { setCart((c) => c.map((l) => (l.id === noteId ? { ...l, note: noteDraft.trim() } : l))); setNoteId(null); }}>Save</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit order: quick review of all lines and notes */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Order</DialogTitle><DialogDescription>Adjust quantities and kitchen notes before charging.</DialogDescription></DialogHeader>
          <div className="space-y-3">
            {cart.map((l) => (
              <div key={l.id} className="space-y-1.5 border-b border-border-regular pb-2">
                <div className="flex items-center gap-2">
                  <span className="flex-1 text-sm font-medium">{l.name}</span>
                  <Button variant="outline" size="icon-sm" onClick={() => changeQty(l.id, -1)} aria-label="Decrease"><Minus className="w-3 h-3" /></Button>
                  <span className="w-6 text-center font-corp-mono">{l.quantity}</span>
                  <Button variant="outline" size="icon-sm" onClick={() => changeQty(l.id, 1)} aria-label="Increase"><Plus className="w-3 h-3" /></Button>
                </div>
                <Input value={l.note} onChange={(e) => setCart((c) => c.map((x) => (x.id === l.id ? { ...x, note: e.target.value } : x)))} placeholder="Note for the kitchen" className="h-8 text-sm" />
              </div>
            ))}
            {cart.length === 0 && <p className="text-sm text-muted-foreground">The order is empty.</p>}
          </div>
          <Button onClick={() => setEditOpen(false)}>Done</Button>
        </DialogContent>
      </Dialog>

      {/* Owner's request */}
      <Dialog open={ownerOpen} onOpenChange={setOwnerOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5" />Owner's Request</DialogTitle>
            <DialogDescription>Logged as personal consumption and excluded from sales revenue. Confirm with your own employee number and PIN.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input value={ownerForm.employeeNumber} onChange={(e) => setOwnerForm({ ...ownerForm, employeeNumber: e.target.value })} placeholder="Employee number" className="font-corp-mono" />
            <Input type="password" value={ownerForm.pin} onChange={(e) => setOwnerForm({ ...ownerForm, pin: e.target.value })} placeholder="PIN" className="font-corp-mono" />
            <Input value={ownerForm.note} onChange={(e) => setOwnerForm({ ...ownerForm, note: e.target.value })} placeholder="Occasion / notes (optional)" />
            <div className="flex gap-3 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setOwnerOpen(false)}>Cancel</Button>
              <Button className="flex-1" onClick={() => {
                if (!ownerForm.employeeNumber || !ownerForm.pin) return void toast.error('Enter your employee number and PIN');
                setOwner({ ...ownerForm }); setOwnerOpen(false);
              }}>Confirm</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Start business day */}
      <Dialog open={dayOpen} onOpenChange={setDayOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Start Business Day</DialogTitle><DialogDescription>Confirm with your employee number and PIN. Confirm today's menu availability first.</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <Input value={dayForm.employeeNumber} onChange={(e) => setDayForm({ ...dayForm, employeeNumber: e.target.value })} placeholder="Employee number" className="font-corp-mono" />
            <Input type="password" value={dayForm.pin} onChange={(e) => setDayForm({ ...dayForm, pin: e.target.value })} placeholder="PIN" className="font-corp-mono" />
            <Button className="w-full" onClick={submitDay} disabled={dayBusy}>{dayBusy ? 'Starting…' : 'Start day'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
