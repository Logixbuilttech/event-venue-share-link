/**
 * Feature Flags - Centralized feature toggles
 * Uses environment variables to enable/disable features
 */

/**
 * Check if shareable functionality is enabled
 * Uses NEXT_PUBLIC_ENABLE_SHAREABLE environment variable
 * Defaults to true if not set (for backward compatibility)
 */
export function isShareableEnabled(): boolean {
  // Check environment variable (must be prefixed with NEXT_PUBLIC_ for client-side access)
  const envValue = process.env.NEXT_PUBLIC_ENABLE_SHAREABLE;
  
  // If not set, default to true for backward compatibility
  if (envValue === undefined || envValue === null) {
    return true;
  }
  
  // Convert to boolean (handles 'true', '1', 'yes', etc.)
  const normalizedValue = envValue.toLowerCase().trim();
  return normalizedValue === 'true' || normalizedValue === '1' || normalizedValue === 'yes';
}

/**
 * Server-side check for shareable functionality
 * Can be used in API routes
 */
export function isShareableEnabledServer(): boolean {
  // Check both NEXT_PUBLIC_ and regular env variable
  const envValue = process.env.NEXT_PUBLIC_ENABLE_SHAREABLE || process.env.ENABLE_SHAREABLE;
  
  // If not set, default to true for backward compatibility
  if (envValue === undefined || envValue === null) {
    return true;
  }
  
  // Convert to boolean
  const normalizedValue = envValue.toLowerCase().trim();
  return normalizedValue === 'true' || normalizedValue === '1' || normalizedValue === 'yes';
}

