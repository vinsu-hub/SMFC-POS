import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Minus, Trash2, DollarSign } from 'lucide-react';
import { toast } from 'sonner';

interface OrderItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  modifiers: string[];
}

export default function POSTerminal() {
  const { user } = useAuth();
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('appetizers');

  if (!user || user.role !== 'employee') {
    return (
      <DashboardLayout>
        <div className="p-6 text-center">
          <p className="text-red-600">Access denied. This page is for employees only.</p>
        </div>
      </DashboardLayout>
    );
  }

  // Branch-specific menu items
  const menuItems: Record<string, any[]> = {
    appetizers: [
      { id: '1', name: 'Amuse Bouche', price: 12, category: 'appetizers' },
      { id: '2', name: 'Oysters (3pc)', price: 18, category: 'appetizers' },
      { id: '3', name: 'Foie Gras Terrine', price: 24, category: 'appetizers' },
    ],
    mains: [
      { id: '4', name: 'Pan-Seared Halibut', price: 42, category: 'mains' },
      { id: '5', name: 'Dry-Aged Ribeye', price: 58, category: 'mains' },
      { id: '6', name: 'Duck Confit', price: 38, category: 'mains' },
    ],
    desserts: [
      { id: '7', name: 'Chocolate Soufflé', price: 16, category: 'desserts' },
      { id: '8', name: 'Crème Brûlée', price: 14, category: 'desserts' },
      { id: '9', name: 'Panna Cotta', price: 12, category: 'desserts' },
    ],
    beverages: [
      { id: '10', name: 'Espresso', price: 4, category: 'beverages' },
      { id: '11', name: 'Wine Glass', price: 14, category: 'beverages' },
      { id: '12', name: 'Cocktail', price: 16, category: 'beverages' },
    ],
  };

  const addItem = (item: any) => {
    const existing = orderItems.find((o) => o.id === item.id);
    if (existing) {
      setOrderItems(
        orderItems.map((o) =>
          o.id === item.id ? { ...o, quantity: o.quantity + 1 } : o
        )
      );
    } else {
      setOrderItems([
        ...orderItems,
        {
          id: item.id,
          name: item.name,
          price: item.price,
          quantity: 1,
          modifiers: [],
        },
      ]);
    }
  };

  const removeItem = (id: string) => {
    setOrderItems(orderItems.filter((o) => o.id !== id));
  };

  const updateQuantity = (id: string, delta: number) => {
    setOrderItems(
      orderItems
        .map((o) =>
          o.id === id ? { ...o, quantity: Math.max(1, o.quantity + delta) } : o
        )
        .filter((o) => o.quantity > 0)
    );
  };

  const subtotal = orderItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const tax = subtotal * 0.1;
  const total = subtotal + tax;

  const handleCheckout = () => {
    if (orderItems.length === 0) {
      toast.error('Add items to order');
      return;
    }
    toast.success(`Order placed: $${total.toFixed(2)}`);
    setOrderItems([]);
  };

  return (
    <DashboardLayout title="POS Terminal">
      <div className="flex h-full bg-[#F3EEE2]">
        {/* Menu Section */}
        <div className="flex-1 p-6 overflow-auto">
          <Tabs value={selectedCategory} onValueChange={setSelectedCategory}>
            <TabsList className="grid w-full grid-cols-4 mb-6 bg-[#1F2E28]">
              <TabsTrigger value="appetizers" className="text-white">
                Appetizers
              </TabsTrigger>
              <TabsTrigger value="mains" className="text-white">
                Mains
              </TabsTrigger>
              <TabsTrigger value="desserts" className="text-white">
                Desserts
              </TabsTrigger>
              <TabsTrigger value="beverages" className="text-white">
                Beverages
              </TabsTrigger>
            </TabsList>

            {Object.entries(menuItems).map(([category, items]) => (
              <TabsContent key={category} value={category} className="space-y-3">
                {items.map((item) => (
                  <Button
                    key={item.id}
                    onClick={() => addItem(item)}
                    className="w-full h-auto py-4 px-4 bg-white hover:bg-[#C9A24B] text-[#1F2E28] hover:text-white border-l-4 border-l-[#C9A24B] justify-between items-center font-danielito-display text-left"
                  >
                    <div>
                      <div className="font-semibold">{item.name}</div>
                      <div className="text-sm opacity-75">
                        {item.category === 'appetizers' && '2g matcha, 3g liquid sugar'}
                        {item.category === 'mains' && 'Pan-seared, seasonal vegetables'}
                        {item.category === 'desserts' && 'House-made, served warm'}
                        {item.category === 'beverages' && 'Premium selection'}
                      </div>
                    </div>
                    <div className="font-bold">${item.price}</div>
                  </Button>
                ))}
              </TabsContent>
            ))}
          </Tabs>
        </div>

        {/* Ticket Rail (Right Side) */}
        <div className="w-80 bg-white border-l-4 border-l-[#C9A24B] p-6 flex flex-col overflow-hidden shadow-lg">
          <h2 className="text-xl font-danielito-display font-semibold text-[#1F2E28] mb-4">
            Ticket
          </h2>

          {/* Order Items */}
          <div className="flex-1 overflow-y-auto mb-4 space-y-2">
            {orderItems.length === 0 ? (
              <p className="text-gray-400 text-center py-8 font-danielito-body">
                No items
              </p>
            ) : (
              orderItems.map((item) => (
                <Card key={item.id} className="border-l-4 border-l-[#1F2E28]">
                  <CardContent className="p-3">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="font-danielito-display font-semibold text-[#1F2E28]">
                          {item.name}
                        </p>
                        <p className="text-xs text-gray-500">${item.price}</p>
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
          <div className="border-t-2 border-t-[#1F2E28] pt-4 space-y-2">
            <div className="flex justify-between font-corp-body">
              <span>Subtotal</span>
              <span className="font-corp-mono">${subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-corp-body">
              <span>Tax (10%)</span>
              <span className="font-corp-mono">${tax.toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-danielito-display font-bold text-lg text-[#1F2E28] bg-[#C9A24B] bg-opacity-20 p-2 rounded">
              <span>Total</span>
              <span className="font-corp-mono">${total.toFixed(2)}</span>
            </div>
          </div>

          {/* Checkout Button */}
          <Button
            onClick={handleCheckout}
            className="w-full mt-4 bg-[#1F2E28] hover:bg-[#6B2E2E] text-white font-danielito-display py-6"
          >
            <DollarSign className="w-5 h-5 mr-2" />
            Complete Order
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
}
