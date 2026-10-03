import type { Platform } from "@/lib/db/schema";
import type { SearchIntent } from "@/lib/ai/groq-search";

export type Location = {
  label?: string;
  address?: string;
  latitude: number;
  longitude: number;
};

export type OtpRequestResult = {
  supported: boolean;
  message: string;
  verificationContext?: unknown;
};

export type AuthResult = {
  status: "CONNECTED" | "EXPIRED" | "ERROR";
  sessionData?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  message?: string;
};

export type Restaurant = {
  id: string;
  platform: Platform;
  name: string;
  area?: string;
};

export type FoodItem = {
  id: string;
  platform: Platform;
  restaurantId: string;
  restaurantName: string;
  name: string;
  menuPrice: number;
};

export type Menu = {
  restaurantId: string;
  items: FoodItem[];
};

export type AdapterSessionContext = {
  mode: "oauth" | "mcp_token";
  accessToken: string;
  userId: string;
  markExpired?: (reason: string) => Promise<void>;
};

export type PricingRequest = {
  query: string;
  location: Location;
  restaurantId?: string;
  itemId?: string;
  intent?: SearchIntent;
  session: AdapterSessionContext;
};

export type NormalizedPrice = {
  platform: Platform;
  restaurantName: string;
  itemName: string;
  itemPrice: number;
  packagingFee: number;
  deliveryFee: number;
  platformFee: number;
  taxes: number;
  discount: number;
  finalPrice: number;
  currency: "INR";
  rawMetadata?: Record<string, unknown>;
};

export interface FoodPlatformAdapter {
  platform: Platform;
  requestOtp(phoneNumber: string): Promise<OtpRequestResult>;
  verifyOtp(phoneNumber: string, otp: string, verificationContext: unknown): Promise<AuthResult>;
  searchRestaurants(query: string, location: Location, session: AdapterSessionContext): Promise<Restaurant[]>;
  searchItems(query: string, location: Location, session: AdapterSessionContext): Promise<FoodItem[]>;
  getRestaurant(restaurantId: string, session: AdapterSessionContext): Promise<Restaurant>;
  getMenu(restaurantId: string, session: AdapterSessionContext): Promise<Menu>;
  getPricing(request: PricingRequest): Promise<NormalizedPrice[]>;
}
