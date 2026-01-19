
import { FoodItem, UserStats, UserProfile, Category, CommunityPost, MealPlan, AppScale, TempUnit, DistUnit, AppTheme } from '../types';

const STORAGE_KEY = 'fridgesmart_inventory_v1';
const STATS_KEY = 'fridgesmart_stats_v1';
const USER_KEY = 'fridgesmart_user_v1';
const THEME_KEY = 'fridgesmart_theme_v1';
const MEAL_PLAN_KEY = 'fridgesmart_mealplan_v1';

export const safeStorage = {
  getItem: (key: string): string | null => localStorage.getItem(key),
  setItem: (key: string, value: string): void => localStorage.setItem(key, value),
  removeItem: (key: string): void => localStorage.removeItem(key)
};

export const getTheme = (): AppTheme => (safeStorage.getItem(THEME_KEY) as AppTheme) || 'light';
export const setTheme = (theme: AppTheme): void => safeStorage.setItem(THEME_KEY, theme);

export const getUserProfile = (): UserProfile | null => {
  const data = safeStorage.getItem(USER_KEY);
  return data ? JSON.parse(data) : null;
};

export const saveUserProfile = (data: { name: string, email: string, country: string, language: string, tempUnit: TempUnit, distUnit: DistUnit }): UserProfile => {
  const existing = getUserProfile();
  const profile: UserProfile = {
    ...data,
    joinedDate: existing?.joinedDate || new Date().toISOString(),
    isGamified: existing ? existing.isGamified : false,
    appScale: existing ? existing.appScale : 'medium',
    highContrast: existing ? existing.highContrast : false,
    theme: existing ? existing.theme : 'light',
    hasSeenOnboarding: existing ? existing.hasSeenOnboarding : false
  };
  safeStorage.setItem(USER_KEY, JSON.stringify(profile));
  return profile;
};

export const updateProfile = (updates: Partial<UserProfile>): UserProfile | null => {
  const existing = getUserProfile();
  if (!existing) return null;
  const updated = { ...existing, ...updates };
  safeStorage.setItem(USER_KEY, JSON.stringify(updated));
  if (updates.theme) setTheme(updates.theme);
  return updated;
};

export const clearUserProfile = (): void => {
  [USER_KEY, STORAGE_KEY, STATS_KEY, MEAL_PLAN_KEY, THEME_KEY].forEach(k => safeStorage.removeItem(k));
};

export const getInventory = (): FoodItem[] => {
  const data = safeStorage.getItem(STORAGE_KEY);
  return data ? JSON.parse(data) : [];
};

export const addFoodItem = (item: FoodItem): FoodItem[] => {
  const current = getInventory();
  const updated = [item, ...current];
  safeStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  return updated;
};

export const updateFoodItem = (updatedItem: FoodItem): FoodItem[] => {
  const current = getInventory();
  const updated = current.map(item => item.id === updatedItem.id ? updatedItem : item);
  safeStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  return updated;
};

export const removeFoodItem = (id: string): FoodItem[] => {
  const current = getInventory();
  const updated = current.filter(item => item.id !== id);
  safeStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  return updated;
};

const CATEGORIES: Category[] = ['Produce', 'Dairy', 'Meat', 'Beverage', 'Grains', 'Canned', 'Snacks', 'Other'];

export const getStats = (): UserStats => {
  const data = safeStorage.getItem(STATS_KEY);
  const emptyByCategory = CATEGORIES.reduce((acc, cat) => ({ ...acc, [cat]: 0 }), {} as Record<Category, number>);
  const defaults: UserStats = { 
    rescued: 0, wasted: 0, composted: 0, moldDetected: 0,
    wasteByCategory: { ...emptyByCategory },
    rescuedByCategory: { ...emptyByCategory },
    moneySaved: 0, co2Saved: 0, streakDays: 0, 
    lastActivityDate: new Date().toISOString(), recipesCooked: 0, itemsPosted: 0, xp: 0, level: 1, 
    unlockedBadges: []
  };
  if (!data) return defaults;
  const parsed = JSON.parse(data);
  return { ...defaults, ...parsed };
};

export const updateStatsForAction = (item: FoodItem, action: 'consumed' | 'tossed' | 'composted'): UserStats => {
  const current = getStats();
  const quantity = item.quantity || 1;
  const unitPrice = item.estimatedPrice || 5.0;
  const totalValue = unitPrice * quantity;
  
  // CO2 multiplier based on category (rough estimate in kg per dollar)
  const co2Multipliers: Record<Category, number> = {
    Meat: 2.0, Dairy: 1.2, Produce: 0.5, Beverage: 0.3, Grains: 0.4, Canned: 0.3, Snacks: 0.4, Other: 0.5
  };
  const co2Weight = totalValue * (co2Multipliers[item.category] || 0.5);

  if (action === 'consumed') {
    current.rescued += 1;
    current.rescuedByCategory[item.category] = (current.rescuedByCategory[item.category] || 0) + 1;
    current.moneySaved += totalValue;
    current.co2Saved += co2Weight;
    current.xp += 50 * quantity;
    current.streakDays += 1;
  } else if (action === 'composted') {
    current.composted += 1;
    current.moneySaved += totalValue * 0.2; // Composting saves some value (soil nutrients)
    current.co2Saved += co2Weight * 0.7; // Composting is better than landfill
    current.xp += 30 * quantity;
    current.streakDays += 1;
  } else {
    current.wasted += 1;
    current.wasteByCategory[item.category] = (current.wasteByCategory[item.category] || 0) + 1;
    current.co2Saved -= co2Weight;
    current.streakDays = 0;
    current.xp = Math.max(0, current.xp - 20 * quantity);
  }

  if (item.mouldDetected) {
    current.moldDetected += 1;
    current.xp += 10; // Extra XP for detecting biohazards early
  }

  current.level = Math.floor(current.xp / 300) + 1;
  current.lastActivityDate = new Date().toISOString();
  safeStorage.setItem(STATS_KEY, JSON.stringify(current));
  return current;
};

export const getCommunityPosts = (): CommunityPost[] => [];
export const getMealPlan = (): MealPlan | null => {
  const data = safeStorage.getItem(MEAL_PLAN_KEY);
  return data ? JSON.parse(data) : null;
};
export const saveMealPlan = (plan: MealPlan): void => {
  safeStorage.setItem(MEAL_PLAN_KEY, JSON.stringify(plan));
};
