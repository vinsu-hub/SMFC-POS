import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertTriangle, Package, Users, Info } from 'lucide-react';

export default function Newsfeed() {
  const { user } = useAuth();
  const [selectedFilter, setSelectedFilter] = useState('all');

  // Mock newsfeed items
  const allItems = [
    {
      id: '1',
      branch: 'dbar',
      branchName: 'D\' Bar',
      branchColor: '#B5651D',
      type: 'expiry',
      title: 'Ingredient Expiry Alert',
      message: 'Premium vodka expires tomorrow. Recommend featuring in cocktail specials.',
      timestamp: new Date(Date.now() - 30 * 60 * 1000),
      icon: AlertTriangle,
    },
    {
      id: '2',
      branch: 'malaya',
      branchName: 'Malaya\'s Cafe',
      branchColor: '#6E8368',
      type: 'low_stock',
      title: 'Low Stock Alert',
      message: 'Matcha powder at 15% capacity. Reorder recommended for weekend rush.',
      timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
      icon: Package,
    },
    {
      id: '3',
      branch: 'danielito',
      branchName: 'Danielito\'s Home Kitchen',
      branchColor: '#1F2E28',
      type: 'hr',
      title: 'Staff Update',
      message: 'Chef Marcus will be training new sous chef this weekend. Plan accordingly.',
      timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000),
      icon: Users,
    },
    {
      id: '4',
      branch: 'dbar',
      branchName: 'D\' Bar',
      branchColor: '#B5651D',
      type: 'general',
      title: 'Inventory Count Complete',
      message: 'Daily inventory count completed. Variance: 2.3%. All items accounted for.',
      timestamp: new Date(Date.now() - 6 * 60 * 60 * 1000),
      icon: Info,
    },
    {
      id: '5',
      branch: 'malaya',
      branchName: 'Malaya\'s Cafe',
      branchColor: '#6E8368',
      type: 'expiry',
      title: 'Dairy Expiry',
      message: 'Cream expires in 2 days. Use in desserts or promotional items.',
      timestamp: new Date(Date.now() - 8 * 60 * 60 * 1000),
      icon: AlertTriangle,
    },
    {
      id: '6',
      branch: 'danielito',
      branchName: 'Danielito\'s Home Kitchen',
      branchColor: '#1F2E28',
      type: 'low_stock',
      title: 'Produce Delivery',
      message: 'Fresh produce delivery arrived. Check quality and store accordingly.',
      timestamp: new Date(Date.now() - 10 * 60 * 60 * 1000),
      icon: Package,
    },
  ];

  // Filter items based on user role and selected filter
  const filteredItems = allItems.filter((item) => {
    // Managers see only their branch
    if (user?.role === 'manager' && item.branch !== user.branch) {
      return false;
    }
    // Employees see only their branch
    if (user?.role === 'employee' && item.branch !== user.branch) {
      return false;
    }
    // Filter by type
    if (selectedFilter !== 'all' && item.type !== selectedFilter) {
      return false;
    }
    return true;
  });

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'expiry':
        return 'bg-red-100 text-red-800';
      case 'low_stock':
        return 'bg-yellow-100 text-yellow-800';
      case 'hr':
        return 'bg-blue-100 text-blue-800';
      case 'general':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'expiry':
        return 'Expiry';
      case 'low_stock':
        return 'Low Stock';
      case 'hr':
        return 'HR';
      case 'general':
        return 'General';
      default:
        return 'Other';
    }
  };

  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  return (
    <DashboardLayout title="Newsfeed">
      <div className="p-6 space-y-6">
        {/* Filter Tabs */}
        <Tabs value={selectedFilter} onValueChange={setSelectedFilter}>
          <TabsList className="grid w-full grid-cols-5 bg-gray-100">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="expiry">Expiry</TabsTrigger>
            <TabsTrigger value="low_stock">Low Stock</TabsTrigger>
            <TabsTrigger value="hr">HR</TabsTrigger>
            <TabsTrigger value="general">General</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Newsfeed Items */}
        <div className="space-y-3">
          {filteredItems.length === 0 ? (
            <Card className="border-l-4 border-l-gray-300">
              <CardContent className="p-8 text-center">
                <Info className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-600 font-corp-body">No items in this category</p>
              </CardContent>
            </Card>
          ) : (
            filteredItems.map((item) => {
              const Icon = item.icon;
              return (
                <Card
                  key={item.id}
                  className="border-l-4 hover:shadow-md transition-shadow"
                  style={{ borderLeftColor: item.branchColor }}
                >
                  <CardContent className="p-4">
                    <div className="flex gap-4">
                      <div className="flex-shrink-0">
                        <div
                          className="w-10 h-10 rounded-lg flex items-center justify-center text-white"
                          style={{ backgroundColor: item.branchColor }}
                        >
                          <Icon className="w-5 h-5" />
                        </div>
                      </div>

                      <div className="flex-1">
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div>
                            <h3 className="font-corp-display font-semibold text-gray-900">
                              {item.title}
                            </h3>
                            <p className="text-xs text-gray-500 font-corp-body">
                              {item.branchName}
                            </p>
                          </div>
                          <Badge className={`text-xs ${getTypeColor(item.type)}`}>
                            {getTypeLabel(item.type)}
                          </Badge>
                        </div>

                        <p className="text-sm font-corp-body text-gray-700 mb-2">
                          {item.message}
                        </p>

                        <p className="text-xs text-gray-500 font-corp-body">
                          {formatTime(item.timestamp)}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
