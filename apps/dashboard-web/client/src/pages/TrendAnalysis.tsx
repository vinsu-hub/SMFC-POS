import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Zap } from 'lucide-react';

export default function TrendAnalysis() {
  const { user } = useAuth();

  if (!user || user.role !== 'executive') {
    return (
      <DashboardLayout>
        <div className="p-6 text-center">
          <p className="text-destructive">Access denied. This page is for executives only.</p>
        </div>
      </DashboardLayout>
    );
  }

  // Mock seasonality data (month x product)
  const heatmapData = [
    { product: 'Cocktails', jan: 45, feb: 48, mar: 52, apr: 58, may: 65, jun: 72 },
    { product: 'Kare-Kare', jan: 38, feb: 35, mar: 32, apr: 28, may: 25, jun: 22 },
    { product: 'Sinigang na Hipon', jan: 42, feb: 44, mar: 46, apr: 48, may: 50, jun: 52 },
    { product: 'Crispy Pata', jan: 55, feb: 54, mar: 53, apr: 52, may: 51, jun: 50 },
    { product: 'Chocolate Soufflé', jan: 28, feb: 32, mar: 38, apr: 45, may: 52, jun: 58 },
  ];

  const trendingProducts = [
    {
      name: 'Cocktails',
      trend: 'rising',
      change: 34,
      suggestion: 'Push cocktails — trending up 34% into December. Create holiday specials.',
      branch: 'D\' Bar',
    },
    {
      name: 'Kare-Kare',
      trend: 'rising',
      change: 18,
      suggestion: 'Rising 18% — consider increasing prep volume for next week.',
      branch: 'Danielito\'s',
    },
    {
      name: 'Chocolate Soufflé',
      trend: 'rising',
      change: 12,
      suggestion: 'Seasonal dessert gaining traction — ensure consistent quality.',
      branch: 'Danielito\'s',
    },
    {
      name: 'Crispy Pata',
      trend: 'declining',
      change: -8,
      suggestion: 'Declining 8% — consider rotating with seasonal specials.',
      branch: 'Danielito\'s',
    },
    {
      name: 'Ensaymada',
      trend: 'declining',
      change: -5,
      suggestion: 'Slight decline — review pricing or presentation.',
      branch: 'Malaya\'s Cafe',
    },
  ];

  const getHeatmapColor = (value: number) => {
    if (value >= 60) return 'bg-success';
    if (value >= 50) return 'bg-success/60';
    if (value >= 40) return 'bg-warning/70';
    if (value >= 30) return 'bg-warning';
    return 'bg-destructive/80';
  };

  return (
    <DashboardLayout title="Trend Analysis">
      <div className="p-6 space-y-6">
        {/* Seasonality Heatmap */}
        <Card className="border-l-4 border-l-primary">
          <CardHeader>
            <CardTitle className="font-corp-display">Seasonality Heatmap (Units Sold)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="text-left p-2 font-corp-body text-sm">Product</th>
                    <th className="text-center p-2 font-corp-body text-sm">Jan</th>
                    <th className="text-center p-2 font-corp-body text-sm">Feb</th>
                    <th className="text-center p-2 font-corp-body text-sm">Mar</th>
                    <th className="text-center p-2 font-corp-body text-sm">Apr</th>
                    <th className="text-center p-2 font-corp-body text-sm">May</th>
                    <th className="text-center p-2 font-corp-body text-sm">Jun</th>
                  </tr>
                </thead>
                <tbody>
                  {heatmapData.map((row) => (
                    <tr key={row.product} className="border-t">
                      <td className="p-2 font-corp-body text-sm font-semibold">{row.product}</td>
                      {[row.jan, row.feb, row.mar, row.apr, row.may, row.jun].map((val, idx) => (
                        <td key={idx} className="text-center p-2">
                          <div
                            className={`${getHeatmapColor(val)} text-white rounded px-2 py-1 text-xs font-corp-mono font-semibold`}
                          >
                            {val}
                          </div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground mt-4 font-corp-body">
              Green = high demand, Red = low demand. Use this to plan inventory and staffing.
            </p>
          </CardContent>
        </Card>

        {/* Trending Products */}
        <div className="space-y-4">
          <h2 className="text-xl font-corp-display font-semibold text-foreground">
            Product Trends & Recommendations
          </h2>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {trendingProducts.map((product, idx) => (
              <Card
                key={idx}
                className={`border-l-4 ${
                  product.trend === 'rising' ? 'border-l-success' : 'border-l-destructive'
                }`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-corp-display font-semibold text-foreground">
                        {product.name}
                      </h3>
                      <p className="text-xs text-muted-foreground font-corp-body">{product.branch}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {product.trend === 'rising' ? (
                        <TrendingUp className="w-5 h-5 text-success" />
                      ) : (
                        <TrendingDown className="w-5 h-5 text-destructive" />
                      )}
                      <span
                        className={`font-corp-mono font-bold text-lg ${
                          product.trend === 'rising' ? 'text-success' : 'text-destructive'
                        }`}
                      >
                        {product.trend === 'rising' ? '+' : '-'}
                        {Math.abs(product.change)}%
                      </span>
                    </div>
                  </div>

                  <div className="bg-accent-soft border border-border-regular rounded-md p-3 flex gap-2">
                    <Zap className="w-4 h-4 text-accent-foreground flex-shrink-0 mt-0.5" />
                    <p className="text-sm font-corp-body text-accent-foreground">{product.suggestion}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Summary */}
        <Card className="border-l-4 border-l-primary bg-accent-soft">
          <CardContent className="p-6">
            <h3 className="font-corp-display font-semibold text-foreground mb-3">
              Key Insights
            </h3>
            <ul className="space-y-2 text-sm font-corp-body text-foreground">
              <li>✓ Cocktails are the strongest performer — up 34% YoY</li>
              <li>✓ Seasonal desserts are gaining momentum — prepare for holiday rush</li>
              <li>✓ Traditional proteins (Crispy Pata, Ensaymada) are declining — consider rotating menu</li>
              <li>✓ D' Bar is driving cocktail sales — leverage this strength across venues</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
