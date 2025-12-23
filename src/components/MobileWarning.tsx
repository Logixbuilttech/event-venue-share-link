'use client';

import { useEffect, useState } from 'react';
import { getDeviceInfo } from '@utils/deviceDetection';

interface MobileWarningProps {
  onDismiss?: () => void;
}

export default function MobileWarning({ onDismiss }: MobileWarningProps) {
  const [deviceInfo, setDeviceInfo] = useState<ReturnType<typeof getDeviceInfo> | null>(null);
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    setDeviceInfo(getDeviceInfo());
  }, []);

  if (!deviceInfo?.isMobile || !isVisible) {
    return null;
  }

  const handleDismiss = () => {
    setIsVisible(false);
    if (onDismiss) {
      onDismiss();
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-90 z-[9999] flex items-center justify-center p-4">
      <div className="bg-gray-800 rounded-lg shadow-2xl max-w-md w-full p-6 text-white">
        <div className="flex items-center justify-center mb-4">
          <div className="text-6xl">📱</div>
        </div>
        
        <h2 className="text-2xl font-bold text-center mb-4">
          Mobile Device Detected
        </h2>
        
        <div className="space-y-4 mb-6">
          <p className="text-gray-300 text-center">
            This 3D venue visualization requires more processing power and memory than mobile devices typically provide.
          </p>
          
          <div className="bg-yellow-900/30 border border-yellow-700 rounded-lg p-4">
            <p className="text-yellow-200 font-semibold mb-2">⚠️ Recommended Devices:</p>
            <ul className="text-yellow-100 text-sm space-y-1">
              <li>• Tablet (iPad, Android Tablet)</li>
              <li>• Desktop Computer</li>
              <li>• Laptop</li>
            </ul>
          </div>
          
          <p className="text-gray-400 text-sm text-center">
            For the best experience, please use a tablet or computer with a larger screen and more memory.
          </p>
        </div>
        
        <div className="flex gap-3">
          <button
            onClick={handleDismiss}
            className="flex-1 bg-gray-700 hover:bg-gray-600 text-white px-4 py-3 rounded-lg font-semibold transition-colors"
          >
            I Understand, Continue Anyway
          </button>
        </div>
        
        <p className="text-xs text-gray-500 text-center mt-4">
          Note: The application may run slowly or encounter errors on mobile devices.
        </p>
      </div>
    </div>
  );
}

