/**
 * Saint Michael Food Corp - Shared Types
 * Defines data models for the multi-tenant POS platform
 */

import danielitoLogo from '@/assets/logos/danielito.png';
import malayaLogo from '@/assets/logos/malaya.png';
import ddenLogo from '@/assets/logos/dden.png';
import dvenueLogo from '@/assets/logos/dvenue.png';
import isabelasLogo from '@/assets/logos/isabelas.png';

export type Branch =
  | 'danielito-agapita'
  | 'danielito-maitim'
  | 'danielito-tagaytay'
  | 'malaya-agapita'
  | 'malaya-maitim'
  | 'malaya-pitx'
  | 'malaya-jsh'
  | 'dden-agapita'
  | 'dden-maitim'
  | 'dvenue-agapita'
  | 'dvenue-maitim'
  | 'isabelas-agapita';

export type CompanyKey = 'danielito' | 'malaya' | 'dden' | 'dvenue' | 'isabelas';

export type Role = 'employee' | 'manager' | 'executive';

export interface User {
  id: string;
  branchId: string | null;
  name: string;
  email: string;
  /** null for executives, who aren't scoped to a single branch */
  branch: Branch | null;
  role: Role;
  avatar?: string;
}

export interface MenuItem {
  id: string;
  name: string;
  description?: string;
  price: number;
  category: string;
  branch: Branch;
  recipe: RecipeItem[];
  available: boolean;
}

export interface RecipeItem {
  ingredientId: string;
  ingredientName: string;
  quantity: number;
  unit: string;
}

export interface Ingredient {
  id: string;
  name: string;
  unit: string;
  branch: Branch;
  currentStock: number;
  expectedStock: number;
  reorderLevel: number;
  unitCost: number;
}

export interface Order {
  id: string;
  branch: Branch;
  items: OrderItem[];
  subtotal: number;
  tax: number;
  total: number;
  timestamp: Date;
  employeeId: string;
  status: 'pending' | 'completed' | 'cancelled';
}

export interface OrderItem {
  menuItemId: string;
  menuItemName: string;
  quantity: number;
  unitPrice: number;
  modifiers?: string[];
}

export interface Loss {
  id: string;
  branch: Branch;
  ingredientId: string;
  ingredientName: string;
  quantity: number;
  unit: string;
  reason: 'spoilage' | 'breakage' | 'comp' | 'prep_error' | 'other';
  notes?: string;
  photoUrl?: string;
  timestamp: Date;
  employeeId: string;
  status: 'pending' | 'approved' | 'rejected';
}

export interface InventoryCount {
  id: string;
  branch: Branch;
  ingredientId: string;
  ingredientName: string;
  expectedQuantity: number;
  countedQuantity: number;
  variance: number;
  variancePercent: number;
  timestamp: Date;
  employeeId: string;
  status: 'pending' | 'approved' | 'rejected';
}

export interface Shift {
  id: string;
  employeeId: string;
  branch: Branch;
  clockInTime: Date;
  clockOutTime?: Date;
  status: 'active' | 'completed';
}

export interface DailyMetrics {
  branch: Branch;
  date: Date;
  unitsSOld: number;
  revenue: number;
  cogs: number;
  losses: number;
  margin: number;
  marginPercent: number;
}

export interface BranchMetrics {
  branch: Branch;
  date: Date;
  metrics: DailyMetrics;
}

export interface NewsItem {
  id: string;
  branch: Branch;
  type: 'expiry' | 'low_stock' | 'hr' | 'general';
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
}

export interface HRFlag {
  id: string;
  employeeId: string;
  employeeName: string;
  branch: Branch;
  flagType: 'lateness' | 'absence' | 'other';
  description: string;
  timestamp: Date;
  resolved: boolean;
}

export interface TrendItem {
  menuItemId: string;
  menuItemName: string;
  category: string;
  trend: 'rising' | 'declining' | 'stable';
  percentChange: number;
  suggestion: string;
  branch: Branch;
}

export interface SyncStatus {
  status: 'synced' | 'syncing' | 'offline-queued';
  lastSyncTime?: Date;
  pendingChanges: number;
}

// Fonts/colors are functional UI wayfinding (badges, charts, borders), not
// brand color - all 5 company logos share the same deep-teal ink, so the
// logo (logoUrl) is the actual brand identity element.
export const COMPANY_THEME: Record<
  CompanyKey,
  {
    name: string;
    color: string;
    accentColor: string;
    displayFont: string;
    bodyFont: string;
    theme: 'light' | 'dark';
    logoUrl: string;
  }
> = {
  danielito: {
    name: "Danielito's Home Kitchen",
    color: '#1F2E28',
    accentColor: '#C9A24B',
    displayFont: 'font-danielito-display',
    bodyFont: 'font-danielito-body',
    theme: 'light',
    logoUrl: danielitoLogo,
  },
  malaya: {
    name: "Malaya's Cafe",
    color: '#6E8368',
    accentColor: '#D9A441',
    displayFont: 'font-malaya-display',
    bodyFont: 'font-malaya-body',
    theme: 'light',
    logoUrl: malayaLogo,
  },
  dden: {
    name: 'The Den',
    color: '#8B4513', // Saddle Brown for den atmosphere
    accentColor: '#D4A574', // Warm sand accent
    displayFont: 'font-dden-display',
    bodyFont: 'font-dden-body',
    theme: 'dark',
    logoUrl: ddenLogo,
  },
  dvenue: {
    name: "D'Venue Events Place",
    color: '#1B4B43', // Deep teal, formal/events feel
    accentColor: '#C9A24B',
    displayFont: 'font-dvenue-display',
    bodyFont: 'font-dvenue-body',
    theme: 'light',
    logoUrl: dvenueLogo,
  },
  isabelas: {
    name: "Isabela's Signature Caterer",
    color: '#6B2E3A', // Warm burgundy, signature catering feel
    accentColor: '#E8D9B5',
    displayFont: 'font-isabelas-display',
    bodyFont: 'font-isabelas-body',
    theme: 'light',
    logoUrl: isabelasLogo,
  },
};

export const LOCATIONS: Array<{
  themeKey: Branch;
  companyKey: CompanyKey;
  locationLabel: string;
  city: string;
}> = [
  { themeKey: 'danielito-agapita', companyKey: 'danielito', locationLabel: 'Agapita Road', city: 'Los Baños, Laguna' },
  { themeKey: 'danielito-maitim', companyKey: 'danielito', locationLabel: 'Bgy. Maitim Bay', city: 'Laguna' },
  { themeKey: 'danielito-tagaytay', companyKey: 'danielito', locationLabel: 'Tagaytay City', city: 'Tagaytay' },
  { themeKey: 'malaya-agapita', companyKey: 'malaya', locationLabel: 'Agapita', city: 'Los Baños, Laguna' },
  { themeKey: 'malaya-maitim', companyKey: 'malaya', locationLabel: 'Brgy. Maitim Bay', city: 'Laguna' },
  { themeKey: 'malaya-pitx', companyKey: 'malaya', locationLabel: '2/F PITX', city: 'Parañaque' },
  { themeKey: 'malaya-jsh', companyKey: 'malaya', locationLabel: 'JSH Bldg, Grove', city: 'Los Baños' },
  { themeKey: 'dden-agapita', companyKey: 'dden', locationLabel: 'Agapita Road', city: 'Los Baños, Laguna' },
  { themeKey: 'dden-maitim', companyKey: 'dden', locationLabel: 'Brgy. Maitim Bay', city: 'Laguna' },
  { themeKey: 'dvenue-agapita', companyKey: 'dvenue', locationLabel: 'Agapita Road', city: 'Los Baños, Laguna' },
  { themeKey: 'dvenue-maitim', companyKey: 'dvenue', locationLabel: 'Brgy. Maitim Bay', city: 'Laguna' },
  { themeKey: 'isabelas-agapita', companyKey: 'isabelas', locationLabel: 'Agapita Road', city: 'Los Baños, Laguna' },
];

export const BRANCH_CONFIG: Record<
  Branch,
  {
    name: string;
    city: string;
    companyKey: CompanyKey;
    color: string;
    accentColor: string;
    displayFont: string;
    bodyFont: string;
    theme: 'light' | 'dark';
    logoUrl: string;
  }
> = Object.fromEntries(
  LOCATIONS.map((loc) => {
    const company = COMPANY_THEME[loc.companyKey];
    return [
      loc.themeKey,
      {
        ...company,
        name: `${company.name} - ${loc.locationLabel}`,
        city: loc.city,
        companyKey: loc.companyKey,
      },
    ];
  })
) as Record<Branch, (typeof COMPANY_THEME)[CompanyKey] & { name: string; city: string; companyKey: CompanyKey }>;

export function getCompanyKey(branch: Branch): CompanyKey {
  return BRANCH_CONFIG[branch].companyKey;
}

export const LOSS_REASONS = [
  { value: 'spoilage', label: 'Spoilage' },
  { value: 'breakage', label: 'Breakage' },
  { value: 'comp', label: 'Complimentary' },
  { value: 'prep_error', label: 'Prep Error' },
  { value: 'other', label: 'Other' },
];
