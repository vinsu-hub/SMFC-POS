import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Minus, Trash2, PhilippinePeso, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  ApiProduct,
  ApiDiscountType,
  closeTransaction,
  createTransaction,
  fetchDiscountTypes,
  fetchProducts,
} from '@/lib/api';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertTriangle } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { getCompanyKey, type CompanyKey } from '@/lib/types';

interface OrderItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  modifiers: string[];
}

interface BranchPosTheme {
  pageBg: string;
  tabsListBg: string;
  tabsTriggerText: string;
  itemLayout: 'list' | 'grid';
  itemClass: string;
  itemNameClass: string;
  itemPriceClass: string;
  ticketBg: string;
  ticketBorder: string;
  ticketHeading: string;
  ticketItemBorder: string;
  ticketItemName: string;
  ticketItemPrice: string;
  totalsDivider: string;
  totalsLabel: string;
  totalRowBg: string;
  totalRowText: string;
  checkoutBtn: string;
  emptyText: string;
  loadingText: string;
}

const POS_THEMES: Record<CompanyKey, BranchPosTheme> = {
  danielito: {
    pageBg: 'bg-[#F3EEE2]',
    tabsListBg: 'bg-[#1F2E28]',
    tabsTriggerText:
      'text-white hover:text-white/80 data-[state=active]:text-[#1F2E28] data-[state=active]:bg-[#C9A24B] data-[state=active]:border-b-transparent data-[state=active]:rounded-md',
    itemLayout: 'list',
    itemClass:
      'w-full h-auto py-4 px-4 bg-white hover:bg-[#C9A24B] text-[#1F2E28] border-l-4 border-l-[#C9A24B] justify-between items-center font-danielito-display text-left transition-[background-color,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97]',
    itemNameClass: 'font-semibold',
    itemPriceClass: 'font-bold',
    ticketBg: 'bg-white',
    ticketBorder: 'border-l-4 border-l-[#C9A24B]',
    ticketHeading: 'font-danielito-display font-semibold text-[#1F2E28]',
    ticketItemBorder: 'border-l-4 border-l-[#1F2E28]',
    ticketItemName: 'font-danielito-display font-semibold text-[#1F2E28]',
    ticketItemPrice: 'text-muted-foreground',
    totalsDivider: 'border-t-2 border-t-[#1F2E28]',
    totalsLabel: 'font-corp-body text-foreground',
    totalRowBg: 'bg-[#C9A24B]/20',
    totalRowText: 'font-danielito-display font-bold text-lg text-[#1F2E28]',
    checkoutBtn:
      'bg-[#1F2E28] hover:bg-[#6B2E2E] text-white font-danielito-display transition-[background-color,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97]',
    emptyText: 'text-muted-foreground font-danielito-body',
    loadingText: 'text-[#1F2E28]',
  },
  malaya: {
    pageBg: 'bg-[#EFE6D4]',
    tabsListBg: 'bg-[#6E8368]',
    tabsTriggerText:
      'text-white hover:text-white/80 data-[state=active]:text-[#3C2E26] data-[state=active]:bg-[#D9A441] data-[state=active]:border-b-transparent data-[state=active]:rounded-md',
    itemLayout: 'grid',
    itemClass:
      'h-32 w-full flex-col items-start justify-between rounded-2xl bg-white hover:bg-[#D9A441] text-[#3C2E26] border border-[#D9A441]/40 p-4 font-malaya-display text-left shadow-sm transition-[background-color,transform,box-shadow] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:-translate-y-0.5 hover:shadow-md active:scale-[0.97] active:translate-y-0',
    itemNameClass: 'font-medium text-base leading-snug',
    itemPriceClass: 'font-semibold text-lg',
    ticketBg: 'bg-white',
    ticketBorder: 'border-l-4 border-l-[#D9A441]',
    ticketHeading: 'font-malaya-display font-medium text-[#3C2E26]',
    ticketItemBorder: 'border-l-4 border-l-[#6E8368]',
    ticketItemName: 'font-malaya-display font-medium text-[#3C2E26]',
    ticketItemPrice: 'text-[#6E8368]',
    totalsDivider: 'border-t-2 border-t-[#6E8368]',
    totalsLabel: 'font-malaya-body text-[#3C2E26]',
    totalRowBg: 'bg-[#D9A441]/25',
    totalRowText: 'font-malaya-display font-semibold text-lg text-[#3C2E26]',
    checkoutBtn:
      'bg-[#6E8368] hover:bg-[#3C2E26] text-white font-malaya-display transition-[background-color,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97]',
    emptyText: 'text-[#6E8368]/60 font-malaya-body',
    loadingText: 'text-[#6E8368]',
  },
  dden: {
    pageBg: 'bg-[#241726]',
    tabsListBg: 'bg-black/40',
    tabsTriggerText:
      'text-[#E9E2D9] hover:text-[#E9E2D9]/80 data-[state=active]:text-[#241726] data-[state=active]:bg-[#8B4513] data-[state=active]:border-b-transparent data-[state=active]:rounded-md',
    itemLayout: 'list',
    itemClass:
      'w-full h-auto py-4 px-4 bg-[#2E1B31] hover:bg-[#40263F] text-[#E9E2D9] border-l-4 border-l-[#8B4513] hover:border-l-[#A0522D] justify-between items-center font-dden-display uppercase tracking-wide text-left transition-[background-color,border-color,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97]',
    itemNameClass: 'font-semibold',
    itemPriceClass: 'font-dden-body',
    ticketBg: 'bg-[#2E1B31]',
    ticketBorder: 'border-l-4 border-l-[#8B4513]',
    ticketHeading: 'font-dden-display uppercase tracking-wide text-[#E9E2D9]',
    ticketItemBorder: 'border-l-4 border-l-[#A0522D]',
    // ticketItemName renders inside the shadcn Card (bg-card resolves to a
    // near-white #EFE9DA), not the dark ticketBg - #E9E2D9 (this theme's
    // "on-dark" text color) was ~2% luminance apart from that background
    // and effectively invisible. Use a dark plum matching ticketBg instead.
    ticketItemName: 'font-dden-display text-[#2E1B31]',
    ticketItemPrice: 'font-dden-body text-[#8B4513]',
    totalsDivider: 'border-t-2 border-t-[#8B4513]',
    totalsLabel: 'font-dden-body text-[#E9E2D9]',
    totalRowBg: 'bg-[#8B4513]/25',
    totalRowText: 'font-dden-display text-lg text-[#E9E2D9]',
    checkoutBtn:
      'bg-[#8B4513] hover:bg-[#A0522D] text-white font-dden-display uppercase tracking-wide transition-[background-color,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97]',
    emptyText: 'text-[#E9E2D9]/40 font-dden-body',
    loadingText: 'text-[#E9E2D9]',
  },
  dvenue: {
    pageBg: 'bg-[#EDF2EF]',
    tabsListBg: 'bg-[#1B4B43]',
    tabsTriggerText:
      'text-white hover:text-white/80 data-[state=active]:text-[#1B4B43] data-[state=active]:bg-[#C9A24B] data-[state=active]:border-b-transparent data-[state=active]:rounded-md',
    itemLayout: 'list',
    itemClass:
      'w-full h-auto py-4 px-4 bg-white hover:bg-[#C9A24B] text-[#1B4B43] border-l-4 border-l-[#C9A24B] justify-between items-center font-dvenue-display text-left transition-[background-color,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97]',
    itemNameClass: 'font-semibold',
    itemPriceClass: 'font-semibold',
    ticketBg: 'bg-white',
    ticketBorder: 'border-l-4 border-l-[#C9A24B]',
    ticketHeading: 'font-dvenue-display font-semibold text-[#1B4B43]',
    ticketItemBorder: 'border-l-4 border-l-[#1B4B43]',
    ticketItemName: 'font-dvenue-display font-semibold text-[#1B4B43]',
    ticketItemPrice: 'text-muted-foreground',
    totalsDivider: 'border-t-2 border-t-[#1B4B43]',
    totalsLabel: 'font-dvenue-body text-foreground',
    totalRowBg: 'bg-[#C9A24B]/20',
    totalRowText: 'font-dvenue-display font-bold text-lg text-[#1B4B43]',
    checkoutBtn:
      'bg-[#1B4B43] hover:bg-[#123530] text-white font-dvenue-display transition-[background-color,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97]',
    emptyText: 'text-muted-foreground font-dvenue-body',
    loadingText: 'text-[#1B4B43]',
  },
  isabelas: {
    pageBg: 'bg-[#F5EBE4]',
    tabsListBg: 'bg-[#6B2E3A]',
    tabsTriggerText:
      'text-white hover:text-white/80 data-[state=active]:text-[#6B2E3A] data-[state=active]:bg-[#E8D9B5] data-[state=active]:border-b-transparent data-[state=active]:rounded-md',
    itemLayout: 'grid',
    itemClass:
      'h-32 w-full flex-col items-start justify-between rounded-2xl bg-white hover:bg-[#E8D9B5] text-[#6B2E3A] border border-[#E8D9B5]/60 p-4 font-isabelas-display text-left shadow-sm transition-[background-color,transform,box-shadow] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:-translate-y-0.5 hover:shadow-md active:scale-[0.97] active:translate-y-0',
    itemNameClass: 'font-medium text-base leading-snug',
    itemPriceClass: 'font-semibold text-lg',
    ticketBg: 'bg-white',
    ticketBorder: 'border-l-4 border-l-[#E8D9B5]',
    ticketHeading: 'font-isabelas-display font-semibold text-[#6B2E3A]',
    ticketItemBorder: 'border-l-4 border-l-[#6B2E3A]',
    ticketItemName: 'font-isabelas-display font-semibold text-[#6B2E3A]',
    ticketItemPrice: 'text-[#6B2E3A]/70',
    totalsDivider: 'border-t-2 border-t-[#6B2E3A]',
    totalsLabel: 'font-isabelas-body text-[#6B2E3A]',
    totalRowBg: 'bg-[#E8D9B5]/40',
    totalRowText: 'font-isabelas-display font-semibold text-lg text-[#6B2E3A]',
    checkoutBtn:
      'bg-[#6B2E3A] hover:bg-[#4E2029] text-white font-isabelas-display transition-[background-color,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97]',
    emptyText: 'text-[#6B2E3A]/50 font-isabelas-body',
    loadingText: 'text-[#6B2E3A]',
  },
};

export default function POSTerminal() {
  const { user } = useAuth();
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [products, setProducts] = useState<ApiProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [checkingOut, setCheckingOut] = useState(false);
  const [discountTypes, setDiscountTypes] = useState<ApiDiscountType[]>([]);
  const [selectedDiscountId, setSelectedDiscountId] = useState<string | null>(null);

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
      .then((data) => {
        setProducts(data);
        if (data.length > 0) setSelectedCategory(data[0].category);
      })
      .catch(() => toast.error('Could not load the menu. Check your connection.'))
      .finally(() => setLoadingProducts(false));
    fetchDiscountTypes(user.branchId, true)
      .then(setDiscountTypes)
      .catch(() => {
        /* discounts are optional — POS still works without them */
      });
  }, [user?.branchId]);

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

  const categories = Array.from(new Set(products.map((p) => p.category)));
  const productsByCategory: Record<string, ApiProduct[]> = {};
  for (const product of products) {
    (productsByCategory[product.category] ??= []).push(product);
  }

  const addItem = (product: ApiProduct) => {
    const existing = orderItems.find((o) => o.id === product.id);
    if (existing) {
      setOrderItems(
        orderItems.map((o) => (o.id === product.id ? { ...o, quantity: o.quantity + 1 } : o))
      );
    } else {
      setOrderItems([
        ...orderItems,
        { id: product.id, name: product.name, price: product.price, quantity: 1, modifiers: [] },
      ]);
    }
  };

  const removeItem = (id: string) => {
    setOrderItems(orderItems.filter((o) => o.id !== id));
  };

  const updateQuantity = (id: string, delta: number) => {
    setOrderItems(
      orderItems
        .map((o) => (o.id === id ? { ...o, quantity: Math.max(1, o.quantity + delta) } : o))
        .filter((o) => o.quantity > 0)
    );
  };

  const selectedDiscount = discountTypes.find((d) => d.id === selectedDiscountId) ?? null;
  const subtotal = orderItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const discountAmount = selectedDiscount ? subtotal * (selectedDiscount.percentage / 100) : 0;
  const discountedSubtotal = subtotal - discountAmount;
  // Client-side preview only — the backend recomputes this authoritatively
  // from discount_type_id, never trusts a client-sent amount.
  const tax = selectedDiscount?.vat_exempt ? 0 : discountedSubtotal * 0.12;
  const total = discountedSubtotal + tax;

  const toggleDiscount = (id: string) => {
    setSelectedDiscountId((current) => (current === id ? null : id));
  };

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
    toast.success('Order will be logged as an Owner\'s Request under your ID');
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

    setCheckingOut(true);
    try {
      const transaction = await createTransaction(
        user.branchId,
        user.id,
        orderItems.map((item) => ({ product_id: item.id, quantity: item.quantity })),
        {
          discount_type_id: selectedDiscountId,
          is_owner_request: !!ownerRequestConfirmed,
          owner_request_employee_number: ownerRequestConfirmed?.employeeNumber,
          owner_request_pin: ownerRequestConfirmed?.pin,
          owner_request_note: ownerRequestConfirmed?.note || undefined,
        }
      );
      await closeTransaction(transaction.id);
      toast.success(`Order placed: ${formatCurrency(transaction.total_amount)}`);
      setOrderItems([]);
      setSelectedDiscountId(null);
      setOwnerRequestConfirmed(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Order failed to save. Try again.');
      console.error(error);
    } finally {
      setCheckingOut(false);
    }
  };

  return (
    <DashboardLayout title="POS Terminal">
      <div className={`flex flex-col md:flex-row h-full ${theme.pageBg}`}>
        {/* Menu Section */}
        <div className="flex-1 p-4 md:p-6 overflow-auto">
          {loadingProducts ? (
            <div className={`flex items-center justify-center h-full ${theme.loadingText}`}>
              <Loader2 className="w-6 h-6 mr-2 animate-spin" />
              Loading menu...
            </div>
          ) : products.length === 0 ? (
            <p className={`text-center py-16 ${theme.emptyText}`}>
              No menu items set up for this branch yet.
            </p>
          ) : (
            <Tabs value={selectedCategory} onValueChange={setSelectedCategory}>
              <TabsList
                className={`mb-6 h-auto gap-1 rounded-lg border-0 p-1 ${theme.tabsListBg}`}
                style={{ display: 'grid', gridTemplateColumns: `repeat(${categories.length}, 1fr)` }}
              >
                {categories.map((category) => (
                  <TabsTrigger
                    key={category}
                    value={category}
                    className={`${theme.tabsTriggerText} capitalize`}
                  >
                    {category}
                  </TabsTrigger>
                ))}
              </TabsList>

              {categories.map((category) => (
                <TabsContent key={category} value={category}>
                  <div
                    className={
                      theme.itemLayout === 'grid'
                        ? 'grid grid-cols-2 sm:grid-cols-3 gap-4'
                        : 'space-y-3'
                    }
                  >
                    {productsByCategory[category].map((product) => (
                      <Button
                        key={product.id}
                        onClick={() => addItem(product)}
                        className={theme.itemClass}
                      >
                        <div className={theme.itemNameClass}>{product.name}</div>
                        <div className={theme.itemPriceClass}>{formatCurrency(product.price)}</div>
                      </Button>
                    ))}
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          )}
        </div>

        {/* Ticket Rail (Right Side on desktop, stacked below on mobile) */}
        <div
          className={`w-full md:w-80 shrink-0 max-h-[60vh] md:max-h-none ${theme.ticketBg} ${theme.ticketBorder} p-4 md:p-6 flex flex-col overflow-hidden shadow-lg`}
        >
          <h2 className={`text-xl mb-4 ${theme.ticketHeading}`}>Ticket</h2>

          {/* Order Items */}
          <div className="flex-1 overflow-y-auto mb-4 space-y-2">
            {orderItems.length === 0 ? (
              <p className={`text-center py-8 ${theme.emptyText}`}>No items</p>
            ) : (
              orderItems.map((item) => (
                <Card key={item.id} className={theme.ticketItemBorder}>
                  <CardContent className="p-3">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className={theme.ticketItemName}>{item.name}</p>
                        <p className={`text-xs ${theme.ticketItemPrice}`}>
                          {formatCurrency(item.price)}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeItem(item.id)}
                        className="text-destructive hover:text-destructive/80"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => updateQuantity(item.id, -1)}
                      >
                        <Minus className="w-3 h-3" />
                      </Button>
                      <span className="w-8 text-center font-corp-mono">{item.quantity}</span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => updateQuantity(item.id, 1)}
                      >
                        <Plus className="w-3 h-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>

          {/* Discount Buttons */}
          {discountTypes.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
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

          {/* Owner's Request */}
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

          {/* Totals */}
          <div className={`${theme.totalsDivider} pt-4 space-y-2`}>
            <div className={`flex justify-between ${theme.totalsLabel}`}>
              <span>Subtotal</span>
              <span className="font-corp-mono">{formatCurrency(subtotal)}</span>
            </div>
            {selectedDiscount && (
              <div className={`flex justify-between ${theme.totalsLabel}`}>
                <span>{selectedDiscount.name} (-{selectedDiscount.percentage}%)</span>
                <span className="font-corp-mono">-{formatCurrency(discountAmount)}</span>
              </div>
            )}
            <div className={`flex justify-between ${theme.totalsLabel}`}>
              <span>VAT (12%){selectedDiscount?.vat_exempt ? ' — exempt' : ''}</span>
              <span className="font-corp-mono">{formatCurrency(tax)}</span>
            </div>
            <div className={`flex justify-between p-2 rounded ${theme.totalRowBg} ${theme.totalRowText}`}>
              <span>Total</span>
              <span className="font-corp-mono">{formatCurrency(total)}</span>
            </div>
          </div>

          {/* Checkout Button */}
          <Button
            onClick={handleCheckout}
            disabled={checkingOut}
            className={`w-full mt-4 py-6 ${theme.checkoutBtn}`}
          >
            {checkingOut ? (
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            ) : (
              <PhilippinePeso className="w-5 h-5 mr-2" />
            )}
            Complete Order
          </Button>
        </div>
      </div>

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
