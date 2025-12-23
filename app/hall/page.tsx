'use client';

import dynamic from 'next/dynamic';
import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import StageSelector from '@components/StageSelector';
import EventSelector from '@components/EventSelector';
import type { StageConfig } from '@config/stages';
import type { EventConfig } from '@config/events';
import { getVenueConfig } from '@config/venues';
import { useHallStore } from '@store/hallStore';
import { useRouter } from 'next/navigation';
import MobileWarning from '@components/MobileWarning';
import { getDeviceInfo } from '@utils/deviceDetection';
import { useGLTF } from '@react-three/drei';
import { isShareableEnabled } from '@utils/featureFlags';

const HallCanvas2D = dynamic(() => import('@components/Canvas/HallCanvas2D'), { ssr: false });
const HallCanvas3DWalk = dynamic(() => import('@components/Canvas/HallCanvas3DWalk'), { ssr: false });
const HallCanvas3DGlobal = dynamic(() => import('@components/Canvas/HallCanvas3DGlobal'), { ssr: false });

type ViewMode = '2D' | '3D-Walk' | '3D-Global';

export default function HallPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const venueId = searchParams.get('venue') || 'infinity-ballroom';
  const editShareId = searchParams.get('edit');

  const [selectedStage, setSelectedStage] = useState<StageConfig | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<EventConfig | null>(null);
  const [guestCount, setGuestCount] = useState<number | null>(null);
  const [venueConfig, setVenueConfig] = useState<any>(null);
  const [currentFloorPlan, setCurrentFloorPlan] = useState<any>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('2D');
  const [showSidebar, setShowSidebar] = useState<boolean>(true);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [shareId, setShareId] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState<boolean>(false);
  const [customName, setCustomName] = useState<string>('');
  const [isEditMode, setIsEditMode] = useState<boolean>(false);
  const [loadingSharedConfig, setLoadingSharedConfig] = useState<boolean>(false);
  const [isAutoSaving, setIsAutoSaving] = useState<boolean>(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [showMobileWarning, setShowMobileWarning] = useState<boolean>(false);
  const [mobileWarningDismissed, setMobileWarningDismissed] = useState<boolean>(false);
  const [linkCopied, setLinkCopied] = useState<boolean>(false);

  // Check if shareable functionality is enabled
  const shareableEnabled = isShareableEnabled();

  // Get selected table area, seating mode setter, and manual controls from store
  const { selectedTableArea, setSeatingMode, manualTableCount, manualChairCount, setManualTableCount, setManualChairCount, getTableStats } = useHallStore();
  const { totalGuests } = getTableStats(guestCount ?? 0);

  // Check for mobile device and show warning for 3D views
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const deviceInfo = getDeviceInfo();
      // Show warning only for mobile devices (not tablets) and only in 3D views
      if (deviceInfo.isMobile && (viewMode === '3D-Walk' || viewMode === '3D-Global') && !mobileWarningDismissed) {
        setShowMobileWarning(true);
      } else {
        setShowMobileWarning(false);
      }
    }
  }, [viewMode, mobileWarningDismissed]);

  // Load venue configuration
  useEffect(() => {
    const venue = getVenueConfig(venueId);
    if (venue) {
      setVenueConfig(venue);
      const floorPlan = venue.floorPlans.find(plan => plan.id === venue.defaultFloorPlanId);
      setCurrentFloorPlan(floorPlan);
    }
  }, [venueId]);

  // Preload floor plan GLB model as early as possible - caches it for instant loading in 3D views
  useEffect(() => {
    if (currentFloorPlan?.glbFileName) {
      try {
        useGLTF.preload(`/${currentFloorPlan.glbFileName}`);
        console.log(`[Preload] Floor plan GLB cached early: ${currentFloorPlan.glbFileName}`);
      } catch (error) {
        // Silently handle blob URL errors during preload
        if (error instanceof Error && error.message.includes('blob:')) {
          console.warn(`⚠️ Skipped preload for floor plan with blob URL textures`);
        } else {
          console.error('Error preloading floor plan model:', error);
        }
      }
    }
  }, [currentFloorPlan?.glbFileName]);

  // Load shared configuration if in edit mode (only if shareable is enabled)
  useEffect(() => {
    const loadSharedConfigForEdit = async () => {
      if (!shareableEnabled || !editShareId) {
        return;
      }

      if (editShareId) {
        setIsEditMode(true);
        setLoadingSharedConfig(true);
        try {
          const response = await fetch(`/api/share/${editShareId}`);
          if (response.ok) {
            const data = await response.json();
            const sharedConfig = data.config;

            // Set share ID
            setShareId(sharedConfig.id);
            setShareLink(`${window.location.origin}/share/${sharedConfig.id}`);

            // Set custom name
            setCustomName(sharedConfig.customName || '');

            // Load venue and floor plan
            const venue = getVenueConfig(sharedConfig.venueId);
            let floorPlan = null;
            if (venue) {
              setVenueConfig(venue);
              floorPlan = venue.floorPlans.find(plan => plan.id === sharedConfig.floorPlanId)
                || venue.floorPlans.find(plan => plan.id === venue.defaultFloorPlanId);
              setCurrentFloorPlan(floorPlan);

              // Update URL to include venue
              if (venue.id !== venueId) {
                router.replace(`/hall?venue=${venue.id}&edit=${editShareId}`, { scroll: false });
              }
            }

            // Set stage, event, and guest count
            if (sharedConfig.stage) {
              setSelectedStage(sharedConfig.stage);
            }
            if (sharedConfig.event) {
              setSelectedEvent(sharedConfig.event);
            }
            if (sharedConfig.guestCount) {
              setGuestCount(sharedConfig.guestCount);
            }

            // Set seating mode
            if (sharedConfig.seatingMode && floorPlan?.tableAreas?.[0]) {
              setSeatingMode(sharedConfig.seatingMode);
            }
          } else {
            alert('Failed to load shared configuration');
            router.push('/history');
          }
        } catch (error) {
          console.error('Error loading shared config:', error);
          alert('Failed to load shared configuration');
          router.push('/history');
        } finally {
          setLoadingSharedConfig(false);
        }
      } else {
        setIsEditMode(false);
      }
    };

    loadSharedConfigForEdit();
  }, [editShareId, router]);

  // Prevent browser zoom with Ctrl + (+) and Ctrl + (-)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Check for Ctrl + (+) or Ctrl + (-) or Ctrl + (=)
      // Handles both regular and numpad keys
      if (event.ctrlKey && (
        event.key === '+' ||
        event.key === '-' ||
        event.key === '=' ||
        event.code === 'Equal' ||
        event.code === 'NumpadAdd' ||
        event.code === 'NumpadSubtract' ||
        event.code === 'Minus'
      )) {
        event.preventDefault();
        event.stopPropagation();
        return false;
      }
    };

    const handleWheel = (event: WheelEvent) => {
      // Prevent browser zoom with Ctrl + mouse wheel
      if (event.ctrlKey) {
        event.preventDefault();
        event.stopPropagation();
        return false;
      }
    };

    window.addEventListener('keydown', handleKeyDown, { passive: false });
    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('wheel', handleWheel);
    };
  }, []);

  const handleStageSelect = (stage: StageConfig | null) => {
    setSelectedStage(stage);
  };

  const handleStageUpdate = (updatedStage: StageConfig) => {
    setSelectedStage(updatedStage);
  };

  const handleEventSelect = (event: EventConfig | null) => {
    setSelectedEvent(event);
  };


  // Function to update or create shareable link
  const updateShareableLink = useCallback(async (isNew: boolean = false) => {
    // Check if shareable functionality is enabled
    if (!shareableEnabled) {
      console.warn('Shareable functionality is disabled');
      return;
    }

    // if (!selectedStage && !selectedEvent && guestCount === 0) {
    //   return;
    // }

    if (isUpdating) return; // Prevent multiple simultaneous updates
    setIsUpdating(true);

    try {
      const configData = {
        venueId,
        floorPlanId: currentFloorPlan?.id || venueConfig?.defaultFloorPlanId,
        stage: selectedStage,
        event: selectedEvent,
        guestCount,
        seatingMode: selectedTableArea?.seatingMode || 'auto',
        customName: customName.trim() || undefined,
      };

      let response;
      if (shareId && !isNew) {
        // Update existing link
        response = await fetch(`/api/share/${shareId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(configData),
        });
      } else {
        // Create new link
        response = await fetch('/api/share', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(configData),
        });
      }

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update shareable link');
      }

      const data = await response.json();
      const newShareId = data.id || shareId;

      const shareUrl = `${window.location.origin}/share/${newShareId}`;

      setShareId(newShareId);
      setShareLink(shareUrl);
      setIsEditMode(true);

      if (isNew) {
        // Copy to clipboard only when creating new link
        navigator.clipboard.writeText(shareUrl).then(() => {
          alert('Shareable link copied to clipboard!');
        }).catch(() => {
          // Fallback if clipboard API fails
          prompt('Copy this link:', shareUrl);
        });
      }
    } catch (error) {
      console.error('Error updating shareable link:', error);
      // Don't show alert for auto-updates, only for manual creation
      if (isNew) {
        alert(`Failed to create shareable link: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    } finally {
      setIsUpdating(false);
    }
  }, [shareableEnabled, selectedStage, selectedEvent, guestCount, selectedTableArea?.seatingMode, shareId, venueId, currentFloorPlan, venueConfig, isUpdating, customName]);

  const handleCreateShareableLink = async () => {
    if (!customName.trim()) {
      alert('Please enter a name for the shareable link.');
      return;
    }
    await updateShareableLink(true);
  };

  const handleUpdateShareableLink = async () => {
    if (!selectedStage && !selectedEvent && guestCount === 0) {
      alert('Please select stage, event, and set guest count before updating.');
      return;
    }
    if (!customName.trim()) {
      alert('Please enter a name for the shareable link.');
      return;
    }
    if (!shareId) {
      alert('No share ID found. Cannot update.');
      return;
    }
    await updateShareableLink(false);
    alert('Shareable link updated successfully!');
  };

  const handleShowHistory = () => {
    router.push('/history');
  };


  // Auto-update shareable link when configuration changes
  useEffect(() => {
    if (shareId) {
      // Debounce updates to avoid too many API calls
      const timeoutId = setTimeout(async () => {
        if (isEditMode) {
          // Show auto-save indicator in edit mode
          setIsAutoSaving(true);
        }
        await updateShareableLink(false);
        if (isEditMode) {
          setIsAutoSaving(false);
          setLastSaved(new Date());
        }
      }, 2000); // Wait 2 seconds after last change for auto-save

      return () => clearTimeout(timeoutId);
    }
  }, [selectedStage, selectedEvent, guestCount, selectedTableArea?.seatingMode, customName, isEditMode, shareId]);

  // Check if shareable link can be created
  const canCreateShareLink = selectedStage || selectedEvent || (guestCount && guestCount > 0);

  // Show loading state when loading shared config
  if (loadingSharedConfig) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-900 text-white">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p>Loading shared configuration...</p>
        </div>
      </div>
    );
  }

  if (!venueConfig || !currentFloorPlan) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-900 text-white">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p>Loading venue configuration...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen relative">
      {/* Mobile Warning - Show for mobile devices in 3D views */}
      {showMobileWarning && (
        <MobileWarning
          onDismiss={() => {
            setShowMobileWarning(false);
            setMobileWarningDismissed(true);
          }}
        />
      )}

      {/* View Mode & Play Controls - Top Right */}
      <div className="absolute top-4 right-4 z-50 flex gap-2">
        {
          viewMode === '2D' && (
            < button
              onClick={() => setShowSidebar(!showSidebar)}
              className="bg-green-600 hover:bg-green-700 cursor-pointer text-white px-4 py-2 rounded-lg shadow-lg transition-all duration-200 flex items-center gap-2"
              title={showSidebar ? 'Hide Sidebar' : 'Show Sidebar'}
            >
              {showSidebar ? (
                <>
                  <span className="text-sm font-semibold">Full Screen</span>
                </>
              ) : (
                <>
                  <span className="text-sm font-semibold">Edit Mode</span>
                </>
              )}
            </button>
          )
        }

        {/* View Mode Buttons */}
        <div className="bg-gray-800 rounded-lg shadow-lg p-1 flex gap-1">
          <button
            onClick={() => setViewMode('2D')}
            className={`px-4 py-2 rounded-md text-sm font-semibold transition-all duration-200 ${viewMode === '2D'
              ? 'bg-blue-600 text-white shadow-md'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
          >
            2D
          </button>
          <button
            onClick={() => setViewMode('3D-Walk')}
            className={`px-4 py-2 rounded-md text-sm font-semibold transition-all duration-200 ${viewMode === '3D-Walk'
              ? 'bg-blue-600 text-white shadow-md'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
          >
            3D Walk
          </button>
          {/* <button
            onClick={() => setViewMode('3D-Global')}
            className={`px-4 py-2 rounded-md text-sm font-semibold transition-all duration-200 ${viewMode === '3D-Global'
              ? 'bg-blue-600 text-white shadow-md'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
          >
            3D Global
          </button> */}
        </div>
      </div>

      {/* Controls Sidebar */}
      {
        viewMode === '2D' && (
          <div
            className={`w-80 bg-gray-800 text-white overflow-y-auto transition-all duration-300 ${(viewMode !== '2D' || !showSidebar) ? 'd-none' : 'absolute z-[9] h-screen'
              }`}
          >
            {/* Venue Info */}
            <div className="p-4 border-b border-gray-700">
              <h2 className="text-xl font-semibold">
                <button type='button' onClick={() => router.push(`/`)} className="text-white hover:text-gray-400">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" id="back-button">
                    <g>
                      <path d="M20 0H4a4 4 0 0 0-4 4v16a4 4 0 0 0 4 4h16a4 4 0 0 0 4-4V4a4 4 0 0 0-4-4Zm-4.29 17.54a1 1 0 0 1 0 1.42 1 1 0 0 1-1.42 0l-6.36-6.37a.87.87 0 0 1-.22-.35 1 1 0 0 1 0-.73 1 1 0 0 1 .22-.35l6.36-6.37a1 1 0 1 1 1.42 1.42L10 11.88Z"></path>
                    </g>
                  </svg>
                </button>
                {venueConfig.name}
              </h2>
              <p className="text-sm text-gray-400 mt-1">{venueConfig.description}</p>
              <p className="text-xs text-gray-500 mt-2">Floor Plan: {currentFloorPlan.name}</p>
            </div>

            {/* Event Selector */}
            <EventSelector
              onEventSelect={handleEventSelect}
              selectedEvent={selectedEvent}
            />

            {/* Stage Selector */}
            <StageSelector
              onStageSelect={handleStageSelect}
              selectedStage={selectedStage}
              onStageUpdate={handleStageUpdate}
              availableStages={currentFloorPlan.stages}
              currentFloorPlan={currentFloorPlan}
            />

            {/* Table Controls */}
            <div className="p-4 border-t border-gray-700">
              <h3 className="text-lg font-semibold border-b border-gray-700 pb-2 mb-4">Table Setup</h3>

              <div className="mb-4">
                <label className="block text-sm text-gray-300 mb-2">Total Guests:</label>
                <input
                  type="number"
                  value={guestCount !== null && guestCount !== undefined ? guestCount : ''}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === '') {
                      setGuestCount(null);
                    } else {
                      const numValue = parseInt(value);
                      if (!isNaN(numValue) && numValue >= 0) {
                        setGuestCount(numValue);
                      }
                    }
                  }}
                  className="w-full bg-gray-700 text-white px-3 py-2 rounded"
                  min="0"
                />
              </div>
              <div className="text-gray-400 mb-2">
                {guestCount !== null && guestCount !== undefined && guestCount > totalGuests && (
                  <p className="text-red-400 text-xs">
                    🚨 Guest count ({guestCount}) exceeds total seating capacity ({totalGuests}).
                  </p>
                )}
              </div>
              {/* Seating Mode Selection */}
              <div className="mb-4">
                <label className="block text-sm text-gray-300 mb-2">Seating Mode:</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => {
                      setSeatingMode('auto');
                    }}
                    className={`px-3 py-2 rounded text-xs ${(selectedTableArea?.seatingMode || 'auto') === 'auto'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                  >
                    🤖 Smart Mix
                  </button>
                  <button
                    onClick={() => {
                      setSeatingMode('tables-only');
                    }}
                    className={`px-3 py-2 rounded text-xs ${selectedTableArea?.seatingMode === 'tables-only'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                  >
                    🪑 Tables Only
                  </button>
                  <button
                    onClick={() => {
                      setSeatingMode('chairs-only');
                    }}
                    className={`px-3 py-2 rounded text-xs ${selectedTableArea?.seatingMode === 'chairs-only'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                  >
                    💺 Chairs Only
                  </button>
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  {(selectedTableArea?.seatingMode || 'auto') === 'auto' && '🤖 Smart: Max tables + single chairs to match exact guest count'}
                  {selectedTableArea?.seatingMode === 'tables-only' && '🪑 Only round tables with chairs (up to max capacity)'}
                  {selectedTableArea?.seatingMode === 'chairs-only' && '💺 Only single chairs arranged in rows'}
                </p>
              </div>

              <div className="text-sm text-gray-400">
                <p>Seating will be automatically calculated based on guest count and mode.</p>
              </div>

              {/* Shareable Link Section */}
              {
                shareableEnabled && (
                  <div className="mt-6 pt-6 border-t border-gray-700">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold border-b border-gray-700 pb-2 flex-1">Share</h3>
                      {isEditMode && (
                        <div className="flex items-center gap-2">
                          {isAutoSaving && (
                            <div className="flex items-center gap-1 text-xs text-gray-400">
                              <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-gray-400"></div>
                              <span>Saving...</span>
                            </div>
                          )}
                          {!isAutoSaving && lastSaved && (
                            <div className="text-xs text-gray-500">
                              Saved {lastSaved.toLocaleTimeString()}
                            </div>
                          )}
                          <span className="bg-green-600 text-white px-3 py-1 rounded text-xs font-semibold">
                            Edit Mode
                          </span>
                        </div>
                      )}
                    </div>
                    <div>
                      {/* Custom Name Input */}
                      <div className="mb-3">
                        <label className="block text-sm text-gray-300 mb-2">Name <span className="text-red-400">*</span>:</label>
                        <input
                          type="text"
                          value={customName}
                          onChange={(e) => setCustomName(e.target.value)}
                          placeholder="e.g., Wedding Setup, Conference 2024"
                          className="w-full bg-gray-700 text-white px-3 py-2 rounded text-sm"
                          maxLength={50}
                          required
                        />
                      </div>
                      {!isEditMode && (
                        <button
                          onClick={handleCreateShareableLink}
                          className="w-full bg-purple-600 hover:bg-purple-700 text-white px-4 py-3 rounded-lg shadow-lg transition-all duration-200 flex items-center justify-center gap-2 font-semibold"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                          </svg>
                          Create Shareable Link
                        </button>
                      )}
                      {shareLink && (
                        <div className="mt-3 p-3 bg-gray-700 rounded-lg">
                          <p className="text-xs text-gray-400 mb-2">Shareable link:</p>
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={shareLink}
                              readOnly
                              className="flex-1 bg-gray-800 text-white px-2 py-1 rounded text-xs"
                              onClick={(e) => (e.target as HTMLInputElement).select()}
                            />
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(shareLink).then(() => {
                                  setLinkCopied(true);
                                  // Reset to copy icon after 2 seconds
                                  setTimeout(() => {
                                    setLinkCopied(false);
                                  }, 2000);
                                }).catch(() => {
                                  // Fallback if clipboard API fails
                                  prompt('Copy this link:', shareLink);
                                });
                              }}
                              className="bg-gray-600 hover:bg-gray-500 text-white p-2 rounded transition-colors cursor-pointer flex-shrink-0"
                              title={linkCopied ? "Link copied!" : "Copy link to clipboard"}
                            >
                              {linkCopied ? (
                                <svg
                                  className="w-4 h-4"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M5 13l4 4L19 7"
                                  />
                                </svg>
                              ) : (
                                <svg
                                  className="w-4 h-4"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                                  />
                                </svg>
                              )}
                            </button>
                          </div>
                        </div>
                      )}
                      {/* History Button */}
                      <button
                        onClick={handleShowHistory}
                        className="w-full mt-3 bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg transition-all duration-200 flex items-center justify-center gap-2 text-sm"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        View History
                      </button>
                    </div>
                  </div>
                )
              }
            </div>
          </div>
        )
      }

      {/* Canvas */}
      <div className={`flex-1 bg-gray-100 transition-all duration-300 ${showSidebar ? '' : 'w-full'}`}>
        {viewMode === '2D' && (
          <HallCanvas2D
            selectedStage={selectedStage}
            selectedEvent={selectedEvent}
            guestCount={guestCount || 0}
            venueConfig={venueConfig}
            floorPlan={currentFloorPlan}
            onStageUpdate={handleStageUpdate}
          />
        )}
        {viewMode === '3D-Walk' && (
          <HallCanvas3DWalk
            selectedStage={selectedStage}
            selectedEvent={selectedEvent}
            guestCount={guestCount || 0}
            venueConfig={venueConfig}
            floorPlan={currentFloorPlan}
            onStageUpdate={handleStageUpdate}
          />
        )}
        {viewMode === '3D-Global' && (
          <HallCanvas3DGlobal
            selectedStage={selectedStage}
            selectedEvent={selectedEvent}
            guestCount={guestCount || 0}
            venueConfig={venueConfig}
            floorPlan={currentFloorPlan}
            onStageUpdate={handleStageUpdate}
          />
        )}
      </div>
    </div >
  );
}