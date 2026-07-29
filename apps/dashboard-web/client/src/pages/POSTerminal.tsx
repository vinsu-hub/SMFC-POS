import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Minus, Trash2, DollarSign, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { ApiProduct, closeTransaction, createTransaction, fetchProducts } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import type { Branch } from '@/lib/types';

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

const POS_THEMES: Record<Branch, BranchPosTheme> = {
  danielito: {
    pageBg: 'bg-[#F3EEE2]',
    tabsListBg: 'bg-[#1F2E28]',
    tabsTriggerText: 'text-white data-[state=active]:text-[#1F2E28]',
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
    ticketItemPrice: 'text-gray-500',
    totalsDivider: 'border-t-2 border-t-[#1F2E28]',
    totalsLabel: 'font-corp-body text-gray-700',
    totalRowBg: 'bg-[#C9A24B]/20',
    totalRowText: 'font-danielito-display font-bold text-lg text-[#1F2E28]',
    checkoutBtn:
      'bg-[#1F2E28] hover:bg-[#6B2E2E] text-white font-danielito-display transition-[background-color,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97]',
    emptyText: 'text-gray-400 font-danielito-body',
    loadingText: 'text-[#1F2E28]',
  },
  malaya: {
    pageBg: 'bg-[#EFE6D4]',
    tabsListBg: 'bg-[#6E8368]',
    tabsTriggerText: 'text-white data-[state=active]:text-[#3C2E26]',
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
  dbar: {
    pageBg: 'bg-[#241726]',
    tabsListBg: 'bg-black/40',
    tabsTriggerText: 'text-[#E9E2D9] data-[state=active]:text-[#241726]',
    itemLayout: 'list',
    itemClass:
      'w-full h-auto py-4 px-4 bg-[#2E1B31] hover:bg-[#40263F] text-[#E9E2D9] border-l-4 border-l-[#B5651D] hover:border-l-[#D97C2E] justify-between items-center font-dbar-display uppercase tracking-wide text-left transition-[background-color,border-color,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97]',
    itemNameClass: 'font-semibold',
    itemPriceClass: 'font-dbar-mono',
    ticketBg: 'bg-[#2E1B31]',
    ticketBorder: 'border-l-4 border-l-[#B5651D]',
    ticketHeading: 'font-dbar-display uppercase tracking-wide text-[#E9E2D9]',
    ticketItemBorder: 'border-l-4 border-l-[#7A2E3B]',
    ticketItemName: 'font-dbar-display text-[#E9E2D9]',
    ticketItemPrice: 'font-dbar-mono text-[#B5651D]',
    totalsDivider: 'border-t-2 border-t-[#B5651D]',
    totalsLabel: 'font-dbar-mono text-[#E9E2D9]',
    totalRowBg: 'bg-[#B5651D]/25',
    totalRowText: 'font-dbar-display text-lg text-[#E9E2D9]',
    checkoutBtn:
      'bg-[#B5651D] hover:bg-[#7A2E3B] text-white font-dbar-display uppercase tracking-wide transition-[background-color,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97]',
    emptyText: 'text-[#E9E2D9]/40 font-dbar-mono',
    loadingText: 'text-[#E9E2D9]',
  },
};

export default function POSTerminal() {
  const { user } = useAuth();
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [products, setProducts] = useState<ApiProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [checkingOut, setCheckingOut] = useState(false);

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
  }, [user?.branchId]);

  if (!user || user.role !== 'employee' || !user.branch) {
    return (
      <DashboardLayout>
        <div className="p-6 text-center">
          <p className="text-red-600">Access denied. This page is for employees only.</p>
        </div>
      </DashboardLayout>
    );
  }

  const theme = POS_THEMES[user.branch];

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

  const subtotal = orderItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const tax = subtotal * 0.12;
  const total = subtotal + tax;

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
        orderItems.map((item) => ({ product_id: item.id, quantity: item.quantity }))
      );
      await closeTransaction(transaction.id);
      toast.success(`Order placed: ${formatCurrency(transaction.total_amount)}`);
      setOrderItems([]);
    } catch (error) {
      toast.error('Order failed to save. Try again.');
      console.error(error);
    } finally {
      setCheckingOut(false);
    }
  };

  return (
    <DashboardLayout title="POS Terminal">
      <div className={`flex h-full ${theme.pageBg}`}>
        {/* Menu Section */}
        <div className="flex-1 p-6 overflow-auto">
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
                className={`mb-6 ${theme.tabsListBg}`}
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

        {/* Ticket Rail (Right Side) */}
        <div
          className={`w-80 ${theme.ticketBg} ${theme.ticketBorder} p-6 flex flex-col overflow-hidden shadow-lg`}
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
                        className="text-red-500 hover:text-red-700"
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

          {/* Totals */}
          <div className={`${theme.totalsDivider} pt-4 space-y-2`}>
            <div className={`flex justify-between ${theme.totalsLabel}`}>
              <span>Subtotal</span>
              <span className="font-corp-mono">{formatCurrency(subtotal)}</span>
            </div>
            <div className={`flex justify-between ${theme.totalsLabel}`}>
              <span>VAT (12%)</span>
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
              <DollarSign className="w-5 h-5 mr-2" />
            )}
            Complete Order
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
}
