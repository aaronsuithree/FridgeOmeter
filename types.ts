
export type StorageLocation = 'Fridge' | 'Freezer' | 'Pantry';
export type AppScale = 'small' | 'medium' | 'large';
export type TempUnit = 'Celsius' | 'Fahrenheit';
export type DistUnit = 'km' | 'miles';
export type AppTheme = 'light' | 'dark';

export type Category = 
  | 'Produce' 
  | 'Dairy' 
  | 'Meat' 
  | 'Beverage' 
  | 'Grains' 
  | 'Canned' 
  | 'Snacks' 
  | 'Other';

export interface FoodItem {
  id: string;
  name: string;
  category: Category;
  expiryDate: string;
  quantity: number;
  unit: string;
  storageLocation: StorageLocation;
  addedDate: string;
  imageUrl?: string;
  notes?: string;
  storageTip?: string;
  brandInfo?: string;
  mouldDetected?: boolean;
  calories?: number;
  estimatedPrice?: number; // Realistic unit price found via Search
}

export interface UserProfile {
  name: string;
  email: string;
  country: string;
  language: string;
  tempUnit: TempUnit;
  distUnit: DistUnit;
  joinedDate: string;
  avatar?: string; 
  isGamified: boolean;
  appScale: AppScale;
  highContrast: boolean;
  theme: AppTheme;
  hasSeenOnboarding: boolean;
}

export interface UserStats {
  rescued: number;
  wasted: number;
  composted: number;
  moldDetected: number;
  wasteByCategory: Record<Category, number>;
  rescuedByCategory: Record<Category, number>;
  moneySaved: number;
  co2Saved: number;
  streakDays: number;
  lastActivityDate: string;
  recipesCooked: number;
  itemsPosted: number;
  xp: number; 
  level: number;
  unlockedBadges: string[];
}

export interface CommunityPost {
  id: string;
  author: string;
  itemName: string;
  description: string;
  category: Category;
  expiryDate: string;
  postedDate: string;
  status: 'available' | 'claimed';
  distance: string;
}

export interface PlaceResult {
  title: string;
  address: string;
  uri: string;
  distance?: string;
  travelTime?: string;
  fastestRoute?: string;
}

export interface SearchResponse {
  insights: string[];
  places: PlaceResult[];
}

export type ViewType = 
  | 'welcome' 
  | 'home' 
  | 'inventory' 
  | 'community' 
  | 'add' 
  | 'mealplan' 
  | 'chat' 
  | 'scanner' 
  | 'graphs'
  | 'recipes'
  | 'profile';

export interface Recipe {
  id: string;
  title: string;
  description: string;
  ingredients: string[];
  steps: string[];
  prepTime: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  caloriesPerServing: number;
}

export interface MealSuggestion {
  day: string;
  breakfast: string;
  lunch: string;
  dinner: string;
  ingredientsUsed: string[];
}

export interface MealPlan {
  id: string;
  startDate: string;
  suggestions: MealSuggestion[];
}

export interface ScanResult {
  name: string;
  expiryDate: string;
  category: Category;
  storageLocation: StorageLocation;
  quantity: number;
  unit: string;
  confidence: number;
  brandInfo?: string;
  mouldDetected: boolean;
  calories?: number;
  estimatedPrice?: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
}
