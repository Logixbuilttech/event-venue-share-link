'use client';

import dynamic from 'next/dynamic';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type { StageConfig } from '@config/stages';
import type { EventConfig } from '@config/events';
import { getVenueConfig } from '@config/venues';
import { useHallStore } from '@store/hallStore';
import type { SharedConfiguration } from '@config/shared';
import { useWebSocket } from '@utils/websocketManager';
import { isShareableEnabled } from '@utils/featureFlags';

const HallCanvas2D = dynamic(() => import('@components/Canvas/HallCanvas2D'), { ssr: false });
const HallCanvas3DWalk = dynamic(() => import('@components/Canvas/HallCanvas3DWalk'), { ssr: false });
// const HallCanvas3DGlobal = dynamic(() => import('@components/Canvas/HallCanvas3DGlobal'), { ssr: false });

type ViewMode = '2D' | '3D-Walk' | '3D-Global';

export default function SharePage() {
    const params = useParams();
    const router = useRouter();
    const shareId = params?.id as string;

    // Check if shareable functionality is enabled
    const shareableEnabled = isShareableEnabled();

    // Redirect if shareable functionality is disabled
    useEffect(() => {
        if (!shareableEnabled) {
            router.push('/hall');
        }
    }, [shareableEnabled, router]);

    // Don't render anything if shareable is disabled (while redirecting)
    if (!shareableEnabled) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-900 text-white">
                <div className="text-center">
                    <p className="text-lg">Shareable functionality is disabled.</p>
                    <p className="text-sm text-gray-400 mt-2">Redirecting...</p>
                </div>
            </div>
        );
    }

    const handleCopyCode = () => {
        if (shareId) {
            navigator.clipboard.writeText(shareId).then(() => {
                alert('Share code copied to clipboard!');
            }).catch(() => {
                prompt('Copy this code:', shareId);
            });
        }
    };

    const [selectedStage, setSelectedStage] = useState<StageConfig | null>(null);
    const [selectedEvent, setSelectedEvent] = useState<EventConfig | null>(null);
    const [guestCount, setGuestCount] = useState<number>(0);
    const [venueConfig, setVenueConfig] = useState<any>(null);
    const [currentFloorPlan, setCurrentFloorPlan] = useState<any>(null);
    const [viewMode, setViewMode] = useState<ViewMode>('2D');
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [seatingMode, setSeatingModeState] = useState<'auto' | 'tables-only' | 'chairs-only'>('auto');
    const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const [autoRefreshEnabled, setAutoRefreshEnabled] = useState<boolean>(true);
    const [showInfoPanel, setShowInfoPanel] = useState<boolean>(true);
    const [customName, setCustomName] = useState<string>('');
    const lastConfigHashRef = useRef<string | null>(null);
    const loadSharedConfigRef = useRef<((showLoading: boolean) => Promise<void>) | null>(null);
    const tableArrangementSetRef = useRef<string>('');
    const isInitialLoadRef = useRef<boolean>(true);
    const currentStateRef = useRef<{
        venueConfig: any;
        currentFloorPlan: any;
        selectedStage: StageConfig | null;
        selectedEvent: EventConfig | null;
        guestCount: number;
        seatingMode: 'auto' | 'tables-only' | 'chairs-only';
        customName: string;
    } | null>(null);

    const { setTableArrangement, selectTableArea, setSeatingMode } = useHallStore();

    // Load shared configuration
    const loadSharedConfig = useCallback(async (showLoading: boolean = true) => {
        if (!shareId) {
            setError('Invalid share ID');
            if (showLoading) setLoading(false);
            return;
        }

        if (showLoading) {
            setIsRefreshing(true);
        }

        try {
            const response = await fetch(`/api/share/${shareId}`);

            if (!response.ok) {
                const errorData = await response.json();
                setError(errorData.error || 'Shared configuration not found or expired');
                if (showLoading) setLoading(false);
                setIsRefreshing(false);
                return;
            }

            const data = await response.json();
            const sharedConfig: SharedConfiguration = data.config;

            // Create a hash of the config to detect changes
            const configHash = JSON.stringify({
                stage: sharedConfig.stage?.id,
                event: sharedConfig.event?.id,
                guestCount: sharedConfig.guestCount,
                seatingMode: sharedConfig.seatingMode,
                venueId: sharedConfig.venueId,
                floorPlanId: sharedConfig.floorPlanId,
            });

            // Skip update if config hasn't changed (for auto-refresh)
            // This prevents unnecessary API calls and state updates
            if (!showLoading && configHash === lastConfigHashRef.current) {
                setIsRefreshing(false);
                // Config hasn't changed, no need to update anything
                return;
            }

            // Check if config has changed (for granular updates)
            const configChanged = configHash !== lastConfigHashRef.current;
            const isInitialLoad = isInitialLoadRef.current;
            const currentState = currentStateRef.current;

            // Load venue configuration (only if venue/floor plan changed)
            let venue = currentState?.venueConfig;
            let floorPlan = currentState?.currentFloorPlan;

            if (isInitialLoad || !venue || venue.id !== sharedConfig.venueId) {
                venue = getVenueConfig(sharedConfig.venueId);
                if (!venue) {
                    setError('Venue configuration not found');
                    if (showLoading) setLoading(false);
                    setIsRefreshing(false);
                    return;
                }
            }

            if (isInitialLoad || !floorPlan || floorPlan.id !== sharedConfig.floorPlanId) {
                floorPlan = venue.floorPlans.find((plan: any) => plan.id === sharedConfig.floorPlanId)
                    || venue.floorPlans.find((plan: any) => plan.id === venue.defaultFloorPlanId);

                if (!floorPlan) {
                    setError('Floor plan not found');
                    if (showLoading) setLoading(false);
                    setIsRefreshing(false);
                    return;
                }
            }

            // Only update state if values actually changed to prevent unnecessary re-renders
            if (isInitialLoad || !currentState || !currentState.venueConfig || currentState.venueConfig.id !== sharedConfig.venueId) {
                setVenueConfig(venue);
            }
            if (isInitialLoad || !currentState || !currentState.currentFloorPlan || currentState.currentFloorPlan.id !== sharedConfig.floorPlanId) {
                setCurrentFloorPlan(floorPlan);
            }

            // Update stage only if changed
            const stageId = sharedConfig.stage?.id || null;
            const currentStageId = currentState?.selectedStage?.id || null;
            if (isInitialLoad || stageId !== currentStageId) {
                setSelectedStage(sharedConfig.stage);
            }

            // Update event only if changed
            const eventId = sharedConfig.event?.id || null;
            const currentEventId = currentState?.selectedEvent?.id || null;
            if (isInitialLoad || eventId !== currentEventId) {
                setSelectedEvent(sharedConfig.event);
            }

            // Update guest count only if changed
            if (isInitialLoad || currentState?.guestCount !== sharedConfig.guestCount) {
                setGuestCount(sharedConfig.guestCount);
            }

            // Update seating mode only if changed
            if (isInitialLoad || currentState?.seatingMode !== sharedConfig.seatingMode) {
                setSeatingModeState(sharedConfig.seatingMode);
            }

            // Update custom name only if changed
            if (isInitialLoad || currentState?.customName !== (sharedConfig.customName || '')) {
                setCustomName(sharedConfig.customName || '');
            }

            // Update ref with current state for next comparison
            currentStateRef.current = {
                venueConfig: venue,
                currentFloorPlan: floorPlan,
                selectedStage: sharedConfig.stage,
                selectedEvent: sharedConfig.event,
                guestCount: sharedConfig.guestCount,
                seatingMode: sharedConfig.seatingMode,
                customName: sharedConfig.customName || ''
            };

            // Only update lastUpdated if config actually changed to avoid unnecessary re-renders
            if (configChanged) {
                setLastUpdated(new Date());
            }
            lastConfigHashRef.current = configHash;
            isInitialLoadRef.current = false;

            // Set up table arrangement
            if (floorPlan.tableAreas && floorPlan.tableAreas.length > 0) {
                const tableArea = floorPlan.tableAreas[0];
                const updatedTableArea = {
                    ...tableArea,
                    seatingMode: sharedConfig.seatingMode
                };
                selectTableArea(updatedTableArea);
                setSeatingMode(sharedConfig.seatingMode);
            }

            if (showLoading) {
                setLoading(false);
            }
            setIsRefreshing(false);
        } catch (error) {
            console.error('Error loading shared configuration:', error);
            setError('Failed to load shared configuration');
            if (showLoading) {
                setLoading(false);
            }
            setIsRefreshing(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [shareId]); // Only depend on shareId - using refs for comparison to avoid unnecessary re-renders

    // Store the latest version of loadSharedConfig in a ref
    loadSharedConfigRef.current = loadSharedConfig;

    useEffect(() => {
        if (loadSharedConfigRef.current) {
            loadSharedConfigRef.current(true);
        }
    }, [shareId]); // Only depend on shareId

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

    // Real-time updates using WebSocket - refreshes immediately when hall page makes changes
    const handleWebSocketUpdate = useCallback(() => {
        if (autoRefreshEnabled && loadSharedConfigRef.current) {
            loadSharedConfigRef.current(false);
        }
    }, [autoRefreshEnabled]);

    // Subscribe to WebSocket updates for this shareId
    useWebSocket(autoRefreshEnabled ? shareId : null, handleWebSocketUpdate);

    // Fallback: Check if page becomes visible (in case WebSocket connection is lost)
    useEffect(() => {
        if (!autoRefreshEnabled || !shareId) {
            return;
        }

        const handleVisibilityChange = () => {
            // Only refresh when page becomes visible (user switches back to tab)
            // This ensures we have the latest data even if WebSocket missed some updates
            if (!document.hidden && loadSharedConfigRef.current) {
                loadSharedConfigRef.current(false);
            }
        };

        // Listen for visibility changes
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [autoRefreshEnabled, shareId]);

    const handleRefresh = () => {
        loadSharedConfig(false);
    };

    const toggleAutoRefresh = () => {
        setAutoRefreshEnabled(!autoRefreshEnabled);
    };

    // Set up table arrangement when guest count and floor plan are ready
    // Use a ref to track if we've already set up the arrangement to avoid re-running
    useEffect(() => {
        if (guestCount > 0 && currentFloorPlan && currentFloorPlan.tableAreas && currentFloorPlan.tableAreas.length > 0) {
            const arrangementKey = `${guestCount}-${currentFloorPlan.id}-${seatingMode}`;

            // Only set arrangement if it hasn't been set for this exact configuration
            if (tableArrangementSetRef.current !== arrangementKey) {
                const tableArea = currentFloorPlan.tableAreas[0];
                const updatedTableArea = {
                    ...tableArea,
                    seatingMode: seatingMode // Use the seating mode from shared config
                };

                // Set table arrangement
                setTableArrangement(guestCount, updatedTableArea, currentFloorPlan.doorAreas);
                tableArrangementSetRef.current = arrangementKey;
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [guestCount, currentFloorPlan, seatingMode]); // Removed setTableArrangement - it's a stable zustand function

    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center bg-gray-900 text-white">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
                    <p>Loading shared configuration...</p>
                </div>
            </div>
        );
    }

    if (error || !venueConfig || !currentFloorPlan) {
        return (
            <div className="flex h-screen items-center justify-center bg-gray-900 text-white">
                <div className="text-center">
                    <h1 className="text-2xl font-bold mb-4">Error</h1>
                    <p className="text-red-400 mb-4">{error || 'Configuration not found'}</p>
                    <button
                        onClick={() => router.push('/')}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg"
                    >
                        Go Home
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-screen relative">
            {/* Header with View Mode Controls */}
            <div className="absolute top-4 right-4 z-50 flex justify-between items-start">
                {/* View Mode Buttons and Refresh */}
                <div className="flex gap-2 items-center">
                    {/* Auto-Refresh Toggle */}
                    <button
                        onClick={toggleAutoRefresh}
                        className={`bg-gray-800 bg-opacity-90 rounded-lg shadow-lg px-3 py-2 flex items-center justify-center gap-2 transition-all duration-200 ${autoRefreshEnabled
                            ? 'hover:bg-gray-700 cursor-pointer'
                            : 'opacity-60 hover:opacity-80 cursor-pointer'
                            }`}
                        title={autoRefreshEnabled ? 'Auto-refresh enabled (click to disable)' : 'Auto-refresh disabled (click to enable)'}
                    >
                        <div className={`w-2 h-2 rounded-full ${autoRefreshEnabled ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`}></div>
                        <span className="text-xs text-white font-semibold hidden sm:inline">
                            {autoRefreshEnabled ? 'Auto' : 'Manual'}
                        </span>
                    </button>

                    {/* Manual Refresh Button */}
                    <button
                        onClick={handleRefresh}
                        disabled={isRefreshing}
                        className={`bg-gray-800 bg-opacity-90 rounded-lg shadow-lg p-2 flex items-center justify-center transition-all duration-200 ${isRefreshing
                            ? 'opacity-50 cursor-not-allowed'
                            : 'hover:bg-gray-700 cursor-pointer'
                            }`}
                        title="Refresh now to get latest updates"
                    >
                        <svg
                            className={`w-5 h-5 text-white ${isRefreshing ? 'animate-spin' : ''}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                            />
                        </svg>
                    </button>

                    {/* View Mode Buttons */}
                    <div className="bg-gray-800 bg-opacity-90 rounded-lg shadow-lg p-1 flex gap-1">
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
            </div>
            <div className="absolute top-18 right-4 z-50 flex justify-between items-start">
                {/* Venue Info Panel */}
                {showInfoPanel ? (
                    <div className="bg-gray-800 bg-opacity-90 rounded-lg shadow-lg p-4 text-white relative">
                        {/* Close Button */}
                        <button
                            onClick={() => setShowInfoPanel(false)}
                            className="cursor-pointer absolute top-2 right-2 text-gray-400 hover:text-white transition-colors"
                            title="Hide information"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>

                        <h1 className="text-xl font-semibold pr-6">{venueConfig.name}</h1>
                        <p className="text-sm text-gray-400">{venueConfig.description}</p>

                        {/* Custom Name - Editable */}
                        {/* <div className="mt-3 pt-3 border-t border-gray-700">
                            <p className="text-xs text-gray-400 mb-1">Custom Name:</p>
                            <div className="flex items-center gap-2">
                                    <p className="flex-1 text-xs text-white font-semibold">{customName || 'Unnamed'}</p>
                                </div>
                        </div> */}

                        {/* Share Code */}
                        <div className="mt-3 pt-3 border-t border-gray-700">
                            <p className="text-xs text-gray-400 mb-1">Share Code:</p>
                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    value={shareId}
                                    readOnly
                                    className="flex-1 bg-gray-700 text-white px-2 py-1 rounded text-xs font-mono"
                                    onClick={(e) => (e.target as HTMLInputElement).select()}
                                />
                                <button
                                    onClick={handleCopyCode}
                                    className="bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded text-xs transition-colors"
                                    title="Copy share code"
                                >
                                    Copy
                                </button>
                            </div>
                        </div>

                        {/* Always show all information */}
                        <div className="mt-3 space-y-1">
                            {selectedStage ? (
                                <p className="text-xs text-gray-500">Stage: {selectedStage.name}</p>
                            ) : (
                                <p className="text-xs text-gray-600">Stage: Not selected</p>
                            )}
                            {selectedEvent ? (
                                <p className="text-xs text-gray-500">Event: {selectedEvent.name}</p>
                            ) : (
                                <p className="text-xs text-gray-600">Event: Not selected</p>
                            )}
                            {guestCount > 0 ? (
                                <p className="text-xs text-gray-500">Guests: {guestCount}</p>
                            ) : (
                                <p className="text-xs text-gray-600">Guests: Not set</p>
                            )}
                            {lastUpdated && (
                                <p className="text-xs text-gray-600 mt-2 pt-2 border-t border-gray-700">
                                    Last updated: {lastUpdated.toLocaleTimeString()}
                                </p>
                            )}
                        </div>
                    </div>
                ) : (
                    <div
                        className="bg-gray-800 bg-opacity-90 rounded-lg shadow-lg p-3 text-white hover:bg-gray-700 transition-colors flex items-center gap-2"
                    >
                        <h1 className="text-xl font-semibold">{venueConfig.name}</h1>
                        <button
                            onClick={() => setShowInfoPanel(true)}
                            className="cursor-pointer"
                            title="Show information"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </button>
                    </div>
                )}
            </div>

            {/* Canvas - Full Screen */}
            {/* Use stable key to prevent remounting on updates - only remount if shareId changes */}
            <div className="flex-1 bg-gray-100 transition-all duration-300" key={shareId}>
                {viewMode === '2D' && (
                    <HallCanvas2D
                        key={`2D-${shareId}`}
                        selectedStage={selectedStage}
                        selectedEvent={selectedEvent}
                        guestCount={guestCount}
                        venueConfig={venueConfig}
                        floorPlan={currentFloorPlan}
                        onStageUpdate={() => { }} // No updates allowed in share view
                        isShareView={true}
                    />
                )}
                {viewMode === '3D-Walk' && (
                    <HallCanvas3DWalk
                        key={`3D-Walk-${shareId}`}
                        selectedStage={selectedStage}
                        selectedEvent={selectedEvent}
                        guestCount={guestCount}
                        venueConfig={venueConfig}
                        floorPlan={currentFloorPlan}
                        onStageUpdate={() => { }} // No updates allowed in share view
                    />
                )}
                {/* {viewMode === '3D-Global' && (
          <HallCanvas3DGlobal
            selectedStage={selectedStage}
            selectedEvent={selectedEvent}
            guestCount={guestCount}
            venueConfig={venueConfig}
            floorPlan={currentFloorPlan}
            onStageUpdate={() => {}} // No updates allowed in share view
          />
        )} */}
            </div>
        </div>
    );
}

