import type { StageConfig } from './stages';
import type { EventConfig } from './events';

export interface SharedConfiguration {
  id: string;
  venueId: string;
  floorPlanId: string;
  stage: StageConfig | null;
  event: EventConfig | null;
  guestCount: number;
  seatingMode: 'auto' | 'tables-only' | 'chairs-only';
  createdAt: string;
  expiresAt?: string; // Optional expiration date
  customName?: string; // Optional custom name for the shared link
}

// In-memory storage for shared configurations
// In a real app, this would be stored in a database
const sharedConfigs: Map<string, SharedConfiguration> = new Map();

/**
 * Save a shared configuration and return a shareable ID
 */
export function saveSharedConfiguration(config: Omit<SharedConfiguration, 'id' | 'createdAt'>): string {
  const id = generateShareId();
  const fullConfig: SharedConfiguration = {
    ...config,
    id,
    createdAt: new Date().toISOString(),
  };
  
  sharedConfigs.set(id, fullConfig);
  
  // Optional: Set expiration (e.g., 30 days from now)
  // const expiresAt = new Date();
  // expiresAt.setDate(expiresAt.getDate() + 30);
  // fullConfig.expiresAt = expiresAt.toISOString();
  
  return id;
}

/**
 * Load a shared configuration by ID
 */
export function loadSharedConfiguration(id: string): SharedConfiguration | null {
  const config = sharedConfigs.get(id);
  
  if (!config) {
    return null;
  }
  
  // Check expiration if set
  if (config.expiresAt) {
    const now = new Date();
    const expiresAt = new Date(config.expiresAt);
    if (now > expiresAt) {
      sharedConfigs.delete(id);
      return null;
    }
  }
  
  return config;
}

/**
 * Delete a shared configuration
 */
export function deleteSharedConfiguration(id: string): boolean {
  return sharedConfigs.delete(id);
}

/**
 * Generate a unique share ID
 */
function generateShareId(): string {
  // Generate a short, URL-friendly ID
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 8; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  // Ensure uniqueness
  if (sharedConfigs.has(id)) {
    return generateShareId();
  }
  
  return id;
}

/**
 * Get all shared configurations (for admin/debugging purposes)
 */
export function getAllSharedConfigurations(): SharedConfiguration[] {
  return Array.from(sharedConfigs.values());
}

