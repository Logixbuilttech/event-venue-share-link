import fs from 'fs';
import path from 'path';
import type { SharedConfiguration } from '@config/shared';

const DATA_DIR = path.join(process.cwd(), 'data');
const CONFIG_FILE = path.join(DATA_DIR, 'shared-configs.json');

/**
 * Ensure data directory exists
 */
function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

/**
 * Read all shared configurations from JSON file
 */
export function readSharedConfigs(): Record<string, SharedConfiguration> {
  ensureDataDir();
  
  if (!fs.existsSync(CONFIG_FILE)) {
    // Create empty file if it doesn't exist
    fs.writeFileSync(CONFIG_FILE, JSON.stringify({}, null, 2));
    return {};
  }

  try {
    const fileContent = fs.readFileSync(CONFIG_FILE, 'utf-8');
    return JSON.parse(fileContent);
  } catch (error) {
    console.error('Error reading shared configs:', error);
    return {};
  }
}

/**
 * Write shared configurations to JSON file
 */
export function writeSharedConfigs(configs: Record<string, SharedConfiguration>): void {
  ensureDataDir();
  
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(configs, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error writing shared configs:', error);
    throw error;
  }
}

/**
 * Save a shared configuration to JSON file
 */
export function saveSharedConfig(config: SharedConfiguration): void {
  const configs = readSharedConfigs();
  configs[config.id] = config;
  writeSharedConfigs(configs);
}

/**
 * Update an existing shared configuration
 */
export function updateSharedConfig(id: string, updates: Partial<Omit<SharedConfiguration, 'id' | 'createdAt'>>): SharedConfiguration | null {
  const configs = readSharedConfigs();
  
  if (!configs[id]) {
    return null;
  }

  // Update the configuration while preserving id and createdAt
  configs[id] = {
    ...configs[id],
    ...updates,
    id, // Ensure ID doesn't change
    createdAt: configs[id].createdAt, // Preserve original creation date
  };

  writeSharedConfigs(configs);
  return configs[id];
}

/**
 * Load a shared configuration by ID
 */
export function loadSharedConfig(id: string): SharedConfiguration | null {
  const configs = readSharedConfigs();
  return configs[id] || null;
}

/**
 * Delete a shared configuration
 */
export function deleteSharedConfig(id: string): boolean {
  const configs = readSharedConfigs();
  if (configs[id]) {
    delete configs[id];
    writeSharedConfigs(configs);
    return true;
  }
  return false;
}

/**
 * Get all shared configurations
 */
export function getAllSharedConfigs(): SharedConfiguration[] {
  const configs = readSharedConfigs();
  return Object.values(configs);
}

