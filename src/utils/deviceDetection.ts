/**
 * Device detection utility
 * Detects mobile devices and tablets
 */

export interface DeviceInfo {
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  deviceType: 'mobile' | 'tablet' | 'desktop';
}

/**
 * Detect if the current device is a mobile device
 * Mobile devices are phones (not tablets)
 */
export function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;

  const userAgent = window.navigator.userAgent.toLowerCase();
  const width = window.innerWidth;

  // Check for mobile user agents (excluding tablets)
  const mobileRegex = /android.*mobile|iphone|ipod|blackberry|iemobile|opera mini/i;
  const isMobileUA = mobileRegex.test(userAgent);

  // Check screen width (mobile typically < 768px)
  // But also check if it's not a tablet (tablets are usually >= 768px)
  const isMobileWidth = width < 768;

  // Mobile is true if it matches mobile UA AND is small width
  // OR if it's a very small screen regardless of UA
  return (isMobileUA && isMobileWidth) || (width < 480);
}

/**
 * Detect if the current device is a tablet
 */
export function isTabletDevice(): boolean {
  if (typeof window === 'undefined') return false;

  const userAgent = window.navigator.userAgent.toLowerCase();
  const width = window.innerWidth;

  // Check for tablet user agents
  const tabletRegex = /ipad|android(?!.*mobile)|tablet|playbook|silk/i;
  const isTabletUA = tabletRegex.test(userAgent);

  // Check screen width (tablets typically 768px - 1024px)
  const isTabletWidth = width >= 768 && width < 1024;

  // Tablet is true if it matches tablet UA OR is in tablet width range
  return isTabletUA || (isTabletWidth && !isMobileDevice());
}

/**
 * Get comprehensive device information
 */
export function getDeviceInfo(): DeviceInfo {
  const mobile = isMobileDevice();
  const tablet = isTabletDevice();
  const desktop = !mobile && !tablet;

  let deviceType: 'mobile' | 'tablet' | 'desktop' = 'desktop';
  if (mobile) deviceType = 'mobile';
  else if (tablet) deviceType = 'tablet';

  return {
    isMobile: mobile,
    isTablet: tablet,
    isDesktop: desktop,
    deviceType
  };
}

/**
 * Check if device has limited memory (for 3D model loading)
 * This helps determine if we should use lower quality models
 */
export function hasLimitedMemory(): boolean {
  if (typeof window === 'undefined') return false;

  // Check if device is mobile or tablet (they typically have less memory)
  const deviceInfo = getDeviceInfo();
  
  // Also check for known low-memory devices
  const userAgent = window.navigator.userAgent.toLowerCase();
  const isLowMemoryDevice = /android.*[1-4]\.|iphone.*os_[1-9]_/i.test(userAgent);

  return deviceInfo.isMobile || deviceInfo.isTablet || isLowMemoryDevice;
}

