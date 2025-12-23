'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { getVenueConfig, getFloorPlan, venueConfigs } from '@config/venues';
import type { SharedConfiguration } from '@config/shared';

export default function HistoryPage() {
    const router = useRouter();
    const [history, setHistory] = useState<SharedConfiguration[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [selectedVenue, setSelectedVenue] = useState<string>('all');

    // Load history
    const loadHistory = useCallback(async () => {
        try {
            setLoading(true);
            const response = await fetch('/api/share');
            if (response.ok) {
                const data = await response.json();
                // Sort by createdAt descending (newest first)
                const sortedConfigs = (data.configs || []).sort((a: SharedConfiguration, b: SharedConfiguration) =>
                    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                );
                setHistory(sortedConfigs);
            }
        } catch (error) {
            console.error('Error loading history:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadHistory();
    }, [loadHistory]);

    const handleCopyLink = (link: string) => {
        navigator.clipboard.writeText(link).then(() => {
            alert('Link copied to clipboard!');
        }).catch(() => {
            prompt('Copy this link:', link);
        });
    };

    const handleDeleteLink = async (id: string) => {
        if (!confirm('Are you sure you want to delete this shared link?')) {
            return;
        }
        try {
            const response = await fetch(`/api/share/${id}`, {
                method: 'DELETE',
            });
            if (response.ok) {
                loadHistory();
            }
        } catch (error) {
            console.error('Error deleting link:', error);
            alert('Failed to delete link');
        }
    };

    const getFloorPlanName = (venueId: string, floorPlanId: string): string => {
        const floorPlan = getFloorPlan(venueId, floorPlanId);
        return floorPlan?.name || floorPlanId;
    };

    const getVenueName = (venueId: string): string => {
        const venue = getVenueConfig(venueId);
        return venue?.name || venueId;
    };

    // Filter and search history
    const filteredHistory = useMemo(() => {
        let filtered = history;

        // Filter by venue
        if (selectedVenue !== 'all') {
            filtered = filtered.filter(config => config.venueId === selectedVenue);
        }

        // Search by name or code
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase().trim();
            filtered = filtered.filter(config => {
                const nameMatch = config.customName?.toLowerCase().includes(query);
                const codeMatch = config.id.toLowerCase().includes(query);
                return nameMatch || codeMatch;
            });
        }

        return filtered;
    }, [history, searchQuery, selectedVenue]);

    const handleEdit = (config: SharedConfiguration) => {
        // Redirect to hall page with edit mode
        router.push(`/hall?venue=${config.venueId}&edit=${config.id}`);
    };

    return (
        <div className="min-h-screen bg-gray-900 text-white">
            {/* Header */}
            <div className="bg-gray-800 border-b border-gray-700">
                <div className="max-w-7xl mx-auto px-4 sm:px-3 lg:px-3 py-3">
                    <div className="block xl:flex lg:flex  md:flex sm:flex items-center justify-between">
                        <div>
                            <h1 className="text-3xl font-bold">Shared Links History</h1>
                            <p className="text-gray-400 mt-2">View and manage all your shared links</p>
                        </div>
                        <button
                            onClick={() => router.push('/')}
                            className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg transition-colors mt-[10px] sm:mt-0 "
                        >
                            Back to Home
                        </button>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="max-w-7xl mx-auto px-3 sm:px-3 lg:px-3 py-3">
                {/* Search and Filter */}
                <div className="mb-6 space-y-4">
                    <div className="flex flex-col sm:flex-row gap-4">
                        {/* Search Input */}
                        <div className="flex-1">
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search by name or code..."
                                className="w-full bg-gray-800 text-white px-4 py-2 rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none"
                            />
                        </div>
                        {/* Venue Filter */}
                        <div className="sm:w-64">
                            <select
                                value={selectedVenue}
                                onChange={(e) => setSelectedVenue(e.target.value)}
                                className="w-full bg-gray-800 text-white px-4 py-2 rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none"
                            >
                                <option value="all">All Venues</option>
                                {venueConfigs.map((venue) => (
                                    <option key={venue.id} value={venue.id}>
                                        {venue.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                    {/* Results count */}
                    {!loading && (
                        <p className="text-sm text-gray-400">
                            Showing {filteredHistory.length} of {history.length} link(s)
                        </p>
                    )}
                </div>

                {loading ? (
                    <div className="text-center py-12">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
                        <p className="text-gray-400">Loading history...</p>
                    </div>
                ) : filteredHistory.length === 0 ? (
                    <div className="text-center py-12">
                        <p className="text-gray-400 text-lg">
                            {history.length === 0
                                ? 'No shared links yet.'
                                : 'No links match your search criteria.'}
                        </p>
                        <p className="text-gray-500 text-sm mt-2">
                            {history.length === 0
                                ? 'Create your first shareable link to see it here.'
                                : 'Try adjusting your search or filter.'}
                        </p>
                        {history.length === 0 && (
                            <button
                                onClick={() => router.push('/')}
                                className="mt-4 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg transition-colors"
                            >
                                Go to Home
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="space-y-4">
                        {filteredHistory.map((config) => {
                            const shareUrl = `${window.location.origin}/share/${config.id}`;
                            const createdDate = new Date(config.createdAt);
                            const floorPlanName = getFloorPlanName(config.venueId, config.floorPlanId);
                            const venueName = getVenueName(config.venueId);

                            return (
                                <div key={config.id} className="bg-gray-800 rounded-lg p-6 border border-gray-700 hover:border-gray-600 transition-colors">
                                    <div className="flex items-start justify-between mb-4">
                                        <div className="block xl:flex lg:flex  md:flex sm:flex justify-between items-start w-full relative">
                                            <div className='mb-[10px] sm:mb-0'>
                                                <label> Custom Name: </label>
                                                <h3 className="text-white font-semibold text-lg">
                                                    {config.customName || `Link ${config.id}`}
                                                </h3>
                                            </div>
                                            <div className='mb-[10px] sm:mb-0'>
                                                <p className="text-gray-400">Code:</p>
                                                <p className="text-gray-300 font-mono text-sm">{config.id}</p>
                                            </div>


                                            <div className='mb-[10px] sm:mb-0'>
                                                <p className="text-gray-400">Created:</p>
                                                <p className="text-gray-300">{createdDate.toLocaleString()}</p>
                                            </div>
                                            <div className='mb-[10px] sm:mb-0'>
                                                <p className="text-gray-400">Venue:</p>
                                                <p className="text-gray-300 truncate w-[200px] h-[20px] overflow-hidden whitespace-nowrap">{venueName}</p>
                                            </div>
                                            <div className='mb-[10px] sm:mb-0'>
                                                <p className="text-gray-400">Floor Plan:</p>
                                                <p className="text-gray-300">{floorPlanName}</p>
                                            </div>
                                            {config.guestCount > 0 && (
                                                <div className='mb-[10px] sm:mb-0'>
                                                    <p className="text-gray-400">Guests:</p>
                                                    <p className="text-gray-300">{config.guestCount}</p>
                                                </div>
                                            )}

                                            {(config.stage || config.event) && (
                                                <div className="mt-3 pt-3 border-t border-gray-700">
                                                    {config.stage && (
                                                        <p className="text-xs text-gray-500">
                                                            <span className="text-gray-400">Stage:</span> {config.stage.name}
                                                        </p>
                                                    )}
                                                    {config.event && (
                                                        <p className="text-xs text-gray-500 mt-1">
                                                            <span className="text-gray-400">Event:</span> {config.event.name}
                                                        </p>
                                                    )}
                                                </div>
                                            )}
                                            <div className="flex gap-2 absolute right-0 top-0 sm:relative">
                                                <button
                                                    onClick={() => handleEdit(config)}
                                                    className="text-green-400 hover:text-green-300 transition-colors flex-shrink-0"
                                                    title="Edit in 2D Plan"
                                                >
                                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                    </svg>
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteLink(config.id)}
                                                    className="text-red-400 hover:text-red-300 transition-colors flex-shrink-0"
                                                    title="Delete link"
                                                >
                                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                    </svg>
                                                </button>
                                            </div>
                                        </div>

                                    </div>
                                    <div className="block xl:flex lg:flex  md:flex sm:flex items-center gap-2 mt-4 pt-4 border-t border-gray-700">
                                        <input
                                            type="text"
                                            value={shareUrl}
                                            readOnly
                                            className="w-full bg-gray-700 text-white px-3 py-2 rounded text-sm mb-[10px] sm:mb-0"
                                            onClick={(e) => (e.target as HTMLInputElement).select()}
                                        />
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => handleCopyLink(shareUrl)}
                                                className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-[6px] rounded transition-colors"
                                                title="Copy link"
                                            >
                                                Copy
                                            </button>
                                            <button
                                                onClick={() => {
                                                    window.open(shareUrl, '_blank');
                                                }}
                                                className="w-full bg-green-600 hover:bg-green-700 text-white px-4 py-[6px] rounded transition-colors"
                                                title="Open link"
                                            >
                                                Open
                                            </button>
                                        </div>

                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}

