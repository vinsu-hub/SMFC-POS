import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Plus,
  Minus,
  Trash2,
  PhilippinePeso,
  Loader2,
  Search,
  Users,
  ShoppingBag,
  Star,
  Grid2x2,
  List as ListIcon,
  Pencil,
  X,
  Sparkles,
  HelpCircle,
  AlertTriangle,
  Percent,
  PauseCircle,
  StickyNote,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  ApiProduct,
  ApiDiscountType,
  ApiKitchenSummary,
  closeTransaction,
  createTransaction,
  fetchDiscountTypes,
  fetchKitchenSummary,
  fetchProducts,
} from '@/lib/api';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatCurrency } from '@/lib/utils';
import { getCompanyKey, type CompanyKey } from '@/lib/types';

interface OrderItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  note: string;
}

interface HeldOrder {
  id: string;
  heldAt: string;
  items: OrderItem[];
}

type AvailabilityFilter = 'all' | 'available' | 'low_stock' | 'unavailable';
type SortMode = 'popularity' | 'price' | 'name' | 'stock';
type ViewMode = 'grid' | 'list';
type OrderTypeValue = 'dine_in' | 'take_out';
type PaymentMethod = 'cash' | 'gcash' | 'card' | 'split';

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

const FAVORITES_STORAGE_KEY = 'pos-favorite-products';

export default function POSTerminal() {
  const { user } = useAuth();
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [products, setProducts] = useState<ApiProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [availabilityFilter, setAvailabilityFilter] = useState<AvailabilityFilter>('all');
  const [sortMode, setSortMode] = useState<SortMode>('popularity');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [checkingOut, setCheckingOut] = useState(false);
  const [discountTypes, setDiscountTypes] = useState<ApiDiscountType[]>([]);
  const [selectedDiscountId, setSelectedDiscountId] = useState<string | null>(null);
  const [kitchenSummary, setKitchenSummary] = useState<ApiKitchenSummary | null>(null);

  const [orderType, setOrderType] = useState<OrderTypeValue>('dine_in');
  const [tableNumber, setTableNumber] = useState('');
  const [guestCount, setGuestCount] = useState(2);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');

  const [favorites, setFavorites] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(FAVORITES_STORAGE_KEY);
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
      return new Set();
    }
  });
  const [heldOrders, setHeldOrders] = useState<HeldOrder[]>([]);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');

  const [ownerRequestOpen, setOwnerRequestOpen] = useState(false);
  const [ownerRequestForm, setOwnerRequestForm] = useState({ employeeNumber: '', pin: '', note: '' });
  const [ownerRequestConfirmed, setOwnerRequestConfirmed] = useState<{
    employeeNumber: string;
    pin: string;
    note: string;
  } | null>(null);

  useEffect(() => {
    if (!user?.branchId) return;
    setLoadingProducts(true);
    fetchProducts(user.branchId)
      .then(setProducts)
      .catch(() => toast.error('Could not load the menu. Check your connection.'))
      .finally(() => setLoadingProducts(false));
    fetchDiscountTypes(user.branchId, true)
      .then(setDiscountTypes)
      .catch(() => {
        /* discounts are optional — POS still works without them */
      });
    fetchKitchenSummary(user.branchId).then(setKitchenSummary).catch(() => {});
  }, [user?.branchId]);

  // Quick-action keyboard shortcuts: F3 discount, F4 hold, F5 note, Esc clear.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'F3') {
        e.preventDefault();
        document.getElementById('discount-chip-row')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else if (e.key === 'F4') {
        e.preventDefault();
        handleHoldOrder();
      } else if (e.key === 'F5') {
        e.preventDefault();
        if (orderItems.length > 0) startEditingNote(orderItems[orderItems.length - 1].id);
      } else if (e.key === 'Escape') {
        if (orderItems.length > 0) handleClearOrder();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderItems]);

  // All useMemo calls must run on every render regardless of the
  // employee-only early return below -- Rules of Hooks requires the same
  // hooks in the same order every render, so these stay above that guard.
  const categories = useMemo(() => Array.from(new Set(products.map((p) => p.category))).sort(), [products]);

  const availabilityCounts = useMemo(
    () => ({
      all: products.length,
      available: products.filter((p) => p.availability === 'available').length,
      low_stock: products.filter((p) => p.availability === 'low_stock').length,
      unavailable: products.filter((p) => p.availability === 'unavailable').length,
    }),
    [products]
  );

  const visibleProducts = useMemo(() => {
    let list = products;
    if (selectedCategory === 'Favorites') list = list.filter((p) => favorites.has(p.id));
    else if (selectedCategory !== 'All' && selectedCategory !== 'Popular') {
      list = list.filter((p) => p.category === selectedCategory);
    }
    if (availabilityFilter !== 'all') list = list.filter((p) => p.availability === availabilityFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q));
    }
    const sorted = [...list];
    if (sortMode === 'price') sorted.sort((a, b) => a.price - b.price);
    else if (sortMode === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name));
    // 'stock' and 'popularity' fall back to the server's natural order —
    // no per-product stock or sales-frequency ranking exists yet to sort
    // by; a real "Popularity" driver is a reasonable v2 addition once
    // order-frequency data is aggregated somewhere.
    return sorted;
  }, [products, selectedCategory, availabilityFilter, searchQuery, sortMode, favorites]);

  const upsellItems = useMemo(() => {
    const inCartIds = new Set(orderItems.map((i) => i.id));
    return products
      .filter((p) => !inCartIds.has(p.id) && p.availability !== 'unavailable' && (p.category === 'Sides' || p.category === 'Drinks' || p.category === 'Desserts'))
      .slice(0, 6);
  }, [products, orderItems]);

  if (!user || user.role !== 'employee' || !user.branch) {
    return (
      <DashboardLayout>
        <div className="p-6 text-center">
          <p className="text-destructive">Access denied. This page is for employees only.</p>
        </div>
      </DashboardLayout>
    );
  }

  const theme = POS_THEMES[getCompanyKey(user.branch)];

  const toggleFavorite = (productId: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(Array.from(next)));
      return next;
    });
  };

  const addItem = (product: ApiProduct) => {
    if (product.availability === 'unavailable') return;
    const existing = orderItems.find((o) => o.id === product.id);
    if (existing) {
      setOrderItems(orderItems.map((o) => (o.id === product.id ? { ...o, quantity: o.quantity + 1 } : o)));
    } else {
      setOrderItems([...orderItems, { id: product.id, name: product.name, price: product.price, quantity: 1, note: '' }]);
    }
  };

  const removeItem = (id: string) => setOrderItems(orderItems.filter((o) => o.id !== id));

  const updateQuantity = (id: string, delta: number) => {
    setOrderItems(
      orderItems.map((o) => (o.id === id ? { ...o, quantity: Math.max(1, o.quantity + delta) } : o)).filter((o) => o.quantity > 0)
    );
  };

  const startEditingNote = (id: string) => {
    setEditingNoteId(id);
    setNoteDraft(orderItems.find((o) => o.id === id)?.note ?? '');
  };

  const saveNote = () => {
    if (!editingNoteId) return;
    setOrderItems(orderItems.map((o) => (o.id === editingNoteId ? { ...o, note: noteDraft.trim() } : o)));
    setEditingNoteId(null);
    setNoteDraft('');
  };

  const handleHoldOrder = () => {
    if (orderItems.length === 0) {
      toast.error('Nothing to hold — cart is empty');
      return;
    }
    setHeldOrders((prev) => [...prev, { id: crypto.randomUUID(), heldAt: new Date().toISOString(), items: orderItems }]);
    setOrderItems([]);
    toast.success('Order held — resume it anytime before this shift ends');
  };

  const resumeHeldOrder = (held: HeldOrder) => {
    setOrderItems(held.items);
    setHeldOrders((prev) => prev.filter((h) => h.id !== held.id));
  };

  const handleClearOrder = () => {
    setOrderItems([]);
    setSelectedDiscountId(null);
    setOwnerRequestConfirmed(null);
  };

  const selectedDiscount = discountTypes.find((d) => d.id === selectedDiscountId) ?? null;
  const subtotal = orderItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const discountAmount = selectedDiscount ? subtotal * (selectedDiscount.percentage / 100) : 0;
  const discountedSubtotal = subtotal - discountAmount;
  // Client-side preview only — the backend recomputes this authoritatively
  // from discount_type_id, never trusts a client-sent amount.
  const tax = selectedDiscount?.vat_exempt ? 0 : discountedSubtotal * 0.12;
  const total = discountedSubtotal + tax;

  const toggleDiscount = (id: string) => setSelectedDiscountId((current) => (current === id ? null : id));

  const handleOpenOwnerRequest = () => {
    setOwnerRequestForm({ employeeNumber: '', pin: '', note: '' });
    setOwnerRequestOpen(true);
  };

  const handleConfirmOwnerRequest = () => {
    if (!ownerRequestForm.employeeNumber || !ownerRequestForm.pin) {
      toast.error('Enter your employee number and PIN');
      return;
    }
    setOwnerRequestConfirmed({ ...ownerRequestForm });
    setOwnerRequestOpen(false);
    toast.success("Order will be logged as an Owner's Request under your ID");
  };

  const handleCheckout = async () => {
    if (orderItems.length === 0) {
      toast.error('Add items to order');
      return;
    }
    if (!user.branchId) {
      toast.error('No branch assigned to this account');
      return;
    }
    if (orderType === 'dine_in' && !tableNumber.trim()) {
      toast.error('Enter a table number for a dine-in order');
      return;
    }

    setCheckingOut(true);
    try {
      const transaction = await createTransaction(
        user.branchId,
        user.id,
        orderItems.map((item) => ({ product_id: item.id, quantity: item.quantity, note: item.note || undefined })),
        {
          discount_type_id: selectedDiscountId,
          is_owner_request: !!ownerRequestConfirmed,
          owner_request_employee_number: ownerRequestConfirmed?.employeeNumber,
          owner_request_pin: ownerRequestConfirmed?.pin,
          owner_request_note: ownerRequestConfirmed?.note || undefined,
          order_type: orderType,
          table_number: orderType === 'dine_in' ? tableNumber.trim() : null,
          guest_count: orderType === 'dine_in' ? guestCount : null,
        }
      );
      await closeTransaction(transaction.id);
      toast.success(`Order placed: ${formatCurrency(transaction.total_amount)}`);
      setOrderItems([]);
      setSelectedDiscountId(null);
      setOwnerRequestConfirmed(null);
      setTableNumber('');
      fetchKitchenSummary(user.branchId!).then(setKitchenSummary).catch(() => {});
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Order failed to save. Try again.');
      console.error(error);
    } finally {
      setCheckingOut(false);
    }
  };

  const pillCategories = ['Favorites', 'Popular', ...categories, 'All'];

  return (
    <DashboardLayout title="POS Terminal">
      <div className={`flex flex-col md:flex-row h-full ${theme.pageBg}`}>
        {/* Main content */}
        <div className="flex-1 p-4 md:p-6 overflow-auto space-y-4">
          {/* Search + Order Type */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search menu item or SKU..."
                className={`pl-9 ${theme.bodyFont}`}
              />
            </div>
            <div className="flex rounded-md overflow-hidden border border-border-regular shrink-0">
              <button
                type="button"
                onClick={() => setOrderType('dine_in')}
                className={`flex items-center gap-1.5 px-4 py-2 text-sm ${theme.bodyFont} ${
                  orderType === 'dine_in' ? theme.primaryBtn : 'bg-card text-foreground'
                }`}
              >
                <Users className="w-4 h-4" /> Dine In
              </button>
              <button
                type="button"
                onClick={() => setOrderType('take_out')}
                className={`flex items-center gap-1.5 px-4 py-2 text-sm ${theme.bodyFont} ${
                  orderType === 'take_out' ? theme.primaryBtn : 'bg-card text-foreground'
                }`}
              >
                <ShoppingBag className="w-4 h-4" /> Takeout
              </button>
            </div>
          </div>

          {/* Category pills */}
          <div className="flex gap-2 overflow-x-auto pb-1">
            {pillCategories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`shrink-0 px-4 py-1.5 rounded-full text-sm ${theme.bodyFont} transition-colors ${
                  selectedCategory === cat ? theme.pillActive : `${theme.pillBg} ${theme.cardHeading}`
                }`}
              >
                {cat === 'Favorites' && <Star className="inline w-3.5 h-3.5 mr-1 -mt-0.5" />}
                {cat}
              </button>
            ))}
          </div>

          {/* Availability tabs + sort/view */}
          <div className="flex flex-wrap items-center gap-2">
            {(['all', 'available', 'low_stock', 'unavailable'] as AvailabilityFilter[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setAvailabilityFilter(f)}
                className={`px-3 py-1 rounded-full text-xs font-corp-body border ${
                  availabilityFilter === f
                    ? 'bg-primary text-primary-foreground border-transparent'
                    : 'bg-card text-muted-foreground border-border-regular'
                }`}
              >
                {f === 'all' ? 'All' : f === 'available' ? 'Available' : f === 'low_stock' ? 'Low Stock' : 'Unavailable'} (
                {availabilityCounts[f]})
              </button>
            ))}
            <div className="ml-auto flex items-center gap-2">
              <Select value={sortMode} onValueChange={(v) => setSortMode(v as SortMode)}>
                <SelectTrigger className="w-40 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="popularity">Sort: Popularity</SelectItem>
                  <SelectItem value="price">Sort: Price</SelectItem>
                  <SelectItem value="name">Sort: Name</SelectItem>
                  <SelectItem value="stock">Sort: Stock</SelectItem>
                </SelectContent>
              </Select>
              <Button size="icon-sm" variant={viewMode === 'grid' ? 'default' : 'outline'} onClick={() => setViewMode('grid')}>
                <Grid2x2 className="w-4 h-4" />
              </Button>
              <Button size="icon-sm" variant={viewMode === 'list' ? 'default' : 'outline'} onClick={() => setViewMode('list')}>
                <ListIcon className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Product grid */}
          {loadingProducts ? (
            <div className={`flex items-center justify-center py-16 ${theme.loadingText}`}>
              <Loader2 className="w-6 h-6 mr-2 animate-spin" />
              Loading menu...
            </div>
          ) : visibleProducts.length === 0 ? (
            <p className={`text-center py-16 ${theme.emptyText}`}>No items match this view.</p>
          ) : (
            <div className={viewMode === 'grid' ? 'grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4' : 'space-y-2'}>
              {visibleProducts.map((product) => {
                const unavailable = product.availability === 'unavailable';
                return (
                  <Card
                    key={product.id}
                    className={`${theme.cardBg} ${theme.cardBorder} overflow-hidden relative ${unavailable ? 'opacity-70' : ''} ${
                      viewMode === 'list' ? 'flex flex-row items-center' : ''
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleFavorite(product.id)}
                      className="absolute top-2 right-2 z-10 bg-white/90 rounded-full p-1 shadow-sm"
                      aria-label="Toggle favorite"
                    >
                      <Star className={`w-4 h-4 ${favorites.has(product.id) ? 'fill-yellow-400 text-yellow-500' : 'text-muted-foreground'}`} />
                    </button>
                    {product.availability === 'low_stock' && (
                      <span
                        className="absolute top-2 left-2 z-10 text-[10px] font-bold uppercase px-2 py-0.5 rounded text-white"
                        style={{ backgroundColor: theme.accentOrange }}
                      >
                        Low Stock
                      </span>
                    )}
                    {unavailable && (
                      <span
                        className="absolute top-2 left-2 z-10 text-[10px] font-bold uppercase px-2 py-0.5 rounded text-white"
                        style={{ backgroundColor: theme.accentRed }}
                      >
                        Unavailable
                      </span>
                    )}
                    <div className={viewMode === 'grid' ? 'aspect-square w-full bg-muted' : 'w-20 h-20 shrink-0 bg-muted'}>
                      {product.image_url ? (
                        <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">No photo</div>
                      )}
                    </div>
                    <CardContent className={viewMode === 'grid' ? 'p-3 space-y-1' : 'p-3 flex-1 flex items-center justify-between'}>
                      <div>
                        <p className={`text-sm font-semibold ${theme.cardHeading} ${theme.displayFont}`}>{product.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {product.needs_pricing ? 'Needs pricing' : formatCurrency(product.price)}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        disabled={unavailable}
                        onClick={() => addItem(product)}
                        className={viewMode === 'grid' ? 'w-full mt-1' : ''}
                      >
                        <Plus className="w-3.5 h-3.5 mr-1" /> Add
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Upsell rail */}
          {upsellItems.length > 0 && (
            <div>
              <p className={`text-sm font-semibold mb-2 ${theme.cardHeading} ${theme.displayFont}`}>You might also like</p>
              <div className="flex gap-3 overflow-x-auto pb-1">
                {upsellItems.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => addItem(p)}
                    className={`shrink-0 w-32 rounded-lg p-2 text-left ${theme.cardBg} ${theme.cardBorder}`}
                  >
                    <p className={`text-xs font-medium truncate ${theme.cardHeading}`}>{p.name}</p>
                    <p className="text-xs text-muted-foreground">{formatCurrency(p.price)}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Quick actions */}
          <div className="flex flex-wrap gap-2 pt-2 border-t border-border-regular">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => document.getElementById('discount-chip-row')?.scrollIntoView({ behavior: 'smooth' })}>
              <Percent className="w-3.5 h-3.5" /> Discount <kbd className="text-[10px] text-muted-foreground ml-1">F3</kbd>
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handleHoldOrder}>
              <PauseCircle className="w-3.5 h-3.5" /> Hold Order <kbd className="text-[10px] text-muted-foreground ml-1">F4</kbd>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => orderItems.length > 0 && startEditingNote(orderItems[orderItems.length - 1].id)}
              disabled={orderItems.length === 0}
            >
              <StickyNote className="w-3.5 h-3.5" /> Notes <kbd className="text-[10px] text-muted-foreground ml-1">F5</kbd>
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 text-destructive" onClick={handleClearOrder} disabled={orderItems.length === 0}>
              <X className="w-3.5 h-3.5" /> Clear <kbd className="text-[10px] text-muted-foreground ml-1">Esc</kbd>
            </Button>
            {heldOrders.length > 0 && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5 ml-auto">
                    <PauseCircle className="w-3.5 h-3.5" /> {heldOrders.length} Held Order{heldOrders.length === 1 ? '' : 's'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 space-y-2">
                  {heldOrders.map((h) => (
                    <button
                      key={h.id}
                      onClick={() => resumeHeldOrder(h)}
                      className="w-full text-left text-sm p-2 rounded hover:bg-accent"
                    >
                      {h.items.length} item{h.items.length === 1 ? '' : 's'} — held {new Date(h.heldAt).toLocaleTimeString()}
                    </button>
                  ))}
                </PopoverContent>
              </Popover>
            )}
          </div>
        </div>

        {/* Order Panel */}
        <div className={`w-full md:w-96 shrink-0 max-h-[70vh] md:max-h-none ${theme.ticketBg} ${theme.ticketBorder} p-4 md:p-6 flex flex-col overflow-hidden shadow-lg`}>
          <div className="flex items-center justify-between mb-3">
            <h2 className={`text-xl ${theme.ticketHeading}`}>Current Order</h2>
            {orderType === 'dine_in' && (
              <Input
                value={tableNumber}
                onChange={(e) => setTableNumber(e.target.value)}
                placeholder="Table #"
                className="w-24 h-8 text-sm text-right"
              />
            )}
          </div>
          {orderType === 'dine_in' ? (
            <div className="flex items-center gap-2 mb-4 text-sm text-muted-foreground">
              <Users className="w-3.5 h-3.5" /> Dine In
              <div className="flex items-center gap-1 ml-auto">
                <Button size="icon-sm" variant="outline" onClick={() => setGuestCount((g) => Math.max(1, g - 1))}>
                  <Minus className="w-3 h-3" />
                </Button>
                <span className="w-6 text-center">{guestCount}</span>
                <Button size="icon-sm" variant="outline" onClick={() => setGuestCount((g) => g + 1)}>
                  <Plus className="w-3 h-3" />
                </Button>
                <span className="text-xs">Guests</span>
              </div>
            </div>
          ) : (
            <p className="flex items-center gap-2 mb-4 text-sm text-muted-foreground">
              <ShoppingBag className="w-3.5 h-3.5" /> Takeout
            </p>
          )}

          <div className="flex-1 overflow-y-auto mb-4 space-y-2">
            {orderItems.length === 0 ? (
              <p className={`text-center py-8 ${theme.emptyText}`}>No items</p>
            ) : (
              orderItems.map((item, index) => (
                <Card key={item.id} className="border-l-4" style={{ borderLeftColor: theme.accentGold }}>
                  <CardContent className="p-3">
                    <div className="flex justify-between items-start mb-1">
                      <div className="flex items-start gap-2">
                        <span className="w-5 h-5 rounded-full bg-muted text-xs flex items-center justify-center shrink-0 mt-0.5">
                          {index + 1}
                        </span>
                        <div>
                          <p className={`font-semibold ${theme.cardHeading}`}>{item.name}</p>
                          <p className="text-xs text-muted-foreground">{formatCurrency(item.price)}</p>
                          {item.note && (
                            <div className="flex items-center gap-1 mt-1">
                              <span className="text-xs bg-accent-soft text-accent-foreground rounded-full px-2 py-0.5">{item.note}</span>
                              <button onClick={() => startEditingNote(item.id)}>
                                <Pencil className="w-3 h-3 text-muted-foreground" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {!item.note && (
                          <button onClick={() => startEditingNote(item.id)} title="Add note">
                            <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                          </button>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => removeItem(item.id)} className="text-destructive hover:text-destructive/80">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => updateQuantity(item.id, -1)}>
                        <Minus className="w-3 h-3" />
                      </Button>
                      <span className="w-8 text-center font-corp-mono">{item.quantity}</span>
                      <Button variant="outline" size="sm" onClick={() => updateQuantity(item.id, 1)}>
                        <Plus className="w-3 h-3" />
                      </Button>
                      <span className="ml-auto font-corp-mono text-sm">{formatCurrency(item.price * item.quantity)}</span>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>

          {discountTypes.length > 0 && (
            <div id="discount-chip-row" className="flex flex-wrap gap-2 mb-3">
              {discountTypes.map((d) => (
                <Button
                  key={d.id}
                  type="button"
                  size="sm"
                  variant={selectedDiscountId === d.id ? 'default' : 'outline'}
                  onClick={() => toggleDiscount(d.id)}
                  className="font-corp-body text-xs"
                >
                  {d.name} ({d.percentage}%)
                </Button>
              ))}
            </div>
          )}

          <Button
            type="button"
            size="sm"
            variant={ownerRequestConfirmed ? 'default' : 'outline'}
            onClick={handleOpenOwnerRequest}
            className="w-full mb-3 gap-2 font-corp-body text-xs"
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            {ownerRequestConfirmed ? "Owner's Request — confirmed" : "Owner's Request"}
          </Button>

          <div className="border-t-2 border-border-regular pt-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span>Subtotal</span>
              <span className="font-corp-mono">{formatCurrency(subtotal)}</span>
            </div>
            {selectedDiscount && (
              <div className="flex justify-between text-sm text-destructive">
                <span>
                  {selectedDiscount.name} (-{selectedDiscount.percentage}%)
                </span>
                <span className="font-corp-mono">-{formatCurrency(discountAmount)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span>VAT (12%){selectedDiscount?.vat_exempt ? ' — exempt' : ''}</span>
              <span className="font-corp-mono">{formatCurrency(tax)}</span>
            </div>
            <div className="flex justify-between p-2 rounded font-bold text-lg" style={{ backgroundColor: `${theme.accentGold}33` }}>
              <span>Total</span>
              <span className="font-corp-mono">{formatCurrency(total)}</span>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-1.5 mt-3">
            {(['cash', 'gcash', 'card', 'split'] as PaymentMethod[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setPaymentMethod(m)}
                className={`text-xs py-1.5 rounded border capitalize ${
                  paymentMethod === m ? theme.primaryBtn + ' border-transparent' : 'bg-card border-border-regular text-foreground'
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          <Button onClick={handleCheckout} disabled={checkingOut} className={`w-full mt-4 py-6 ${theme.primaryBtn}`}>
            {checkingOut ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <PhilippinePeso className="w-5 h-5 mr-2" />}
            Complete Order
          </Button>
        </div>
      </div>

      {/* Status Bar */}
      <div className="flex flex-wrap items-center gap-4 px-4 py-2 border-t border-border-regular bg-card text-xs text-muted-foreground">
        <span>
          Kitchen: {kitchenSummary ? `${kitchenSummary.queued_count} queued, ${kitchenSummary.preparing_count} preparing` : '—'}
        </span>
        <span>Low Stock Alerts: {availabilityCounts.low_stock + availabilityCounts.unavailable}</span>
        <span>
          Pending Orders:{' '}
          {kitchenSummary ? kitchenSummary.queued_count + kitchenSummary.preparing_count + kitchenSummary.ready_count : '—'}
        </span>
        <Popover>
          <PopoverTrigger asChild>
            <button className="ml-auto flex items-center gap-1.5 text-primary">
              <HelpCircle className="w-3.5 h-3.5" /> Need Help?
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-72 text-sm space-y-2">
            <p className="font-semibold flex items-center gap-1.5">
              <Sparkles className="w-4 h-4" /> Quick Help
            </p>
            <p>F3 discount · F4 hold order · F5 add note · Esc clear order.</p>
            <p>Ask your manager for anything Malaya AI would normally answer — Malaya isn't available on employee accounts.</p>
          </PopoverContent>
        </Popover>
      </div>

      {/* Note editing dialog */}
      <Dialog open={!!editingNoteId} onOpenChange={(open) => !open && setEditingNoteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-corp-display">Item Note</DialogTitle>
            <DialogDescription>e.g. "No Rice", "Extra Sauce" — visible to kitchen staff, no effect on inventory.</DialogDescription>
          </DialogHeader>
          <Input value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} placeholder="Add a note..." autoFocus />
          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setEditingNoteId(null)}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={saveNote}>
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Owner's Request Dialog */}
      <Dialog open={ownerRequestOpen} onOpenChange={setOwnerRequestOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-corp-display flex items-center gap-2 text-warning">
              <AlertTriangle className="w-5 h-5" />
              Owner's Request Warning
            </DialogTitle>
            <DialogDescription className="font-corp-body">
              This order will be logged as the owner's personal consumption. It will be
              excluded from sales revenue. Enter your own employee number and PIN to confirm —
              if this is a fraudulent access, it will be traced back to you.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground font-corp-body">Employee Number</label>
              <Input
                value={ownerRequestForm.employeeNumber}
                onChange={(e) => setOwnerRequestForm({ ...ownerRequestForm, employeeNumber: e.target.value })}
                placeholder="EMP-XXXX-XXXX"
                className="font-corp-body font-corp-mono"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground font-corp-body">PIN</label>
              <Input
                type="password"
                value={ownerRequestForm.pin}
                onChange={(e) => setOwnerRequestForm({ ...ownerRequestForm, pin: e.target.value })}
                placeholder="****"
                className="font-corp-body font-corp-mono"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground font-corp-body">Occasion / Notes (optional)</label>
              <Input
                value={ownerRequestForm.note}
                onChange={(e) => setOwnerRequestForm({ ...ownerRequestForm, note: e.target.value })}
                placeholder="Optional context for this order"
                className="font-corp-body"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setOwnerRequestOpen(false)} className="flex-1">
                Cancel
              </Button>
              <Button type="button" onClick={handleConfirmOwnerRequest} className="flex-1">
                Confirm
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
