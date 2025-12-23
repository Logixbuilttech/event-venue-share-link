'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { venueConfigs } from '@config/venues';
import { isShareableEnabled } from '@utils/featureFlags';

export default function HomePage() {
  const router = useRouter();
  const [selectedVenue, setSelectedVenue] = useState<string | null>(null);

  // Check if shareable functionality is enabled
  const shareableEnabled = isShareableEnabled();

  const handleVenueSelect = (venueId: string) => {
    setSelectedVenue(venueId);
    router.push(`/hall?venue=${venueId}`);
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-3 lg:px-3 py-3">
          <div className="block xl:flex lg:flex  md:flex sm:flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">Event Venue Setup</h1>
              <p className="text-gray-400 mt-2">Select a venue to start planning your event</p>
            </div>
            {/* {
              shareableEnabled && (
                <button
                  onClick={() => router.push('/history')}
                  className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg transition-colors flex items-center gap-2 mt-[10px] sm:mt-0 "
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  View History
                </button>
              )
            } */}
          </div>
        </div>
      </div>

      {/* Venue Selection */}
      <div className="max-w-7xl mx-auto px-4 sm:px-3 lg:px-3 py-3">
        <div className="text-center mb-12">
          <h2 className="text-2xl font-semibold mb-4">Choose Your Venue</h2>
          <p className="text-gray-400">Select from our available venues to begin setting up your event</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {venueConfigs.map((venue) => (
            <div
              key={venue.id}
              className="bg-gray-800 rounded-lg p-6 hover:bg-gray-700 transition-colors hover:border-gray-600 border border-[#adadad]  "
            >
              <div className="text-center">
                <div className="w-16 h-16 bg-blue-600 border border-[#ffffff] rounded-full mx-auto mb-4 flex items-center justify-center">
                  <span className="text-2xl font-bold">{venue.name.charAt(0)}</span>
                </div>
                <h3 className="text-xl font-semibold mb-2">{venue.name}</h3>
                <p className="text-gray-400 text-sm mb-4">{venue.description}</p>

                <div className="text-xs text-gray-500 space-y-1 flex items-start justify-between border-t border-gray-700 pt-2 ">
                  <p className='mb-0'>Floor Plans: {venue.floorPlans.length}</p>
                  <p className='mb-0'>Default: {venue.floorPlans.find(p => p.id === venue.defaultFloorPlanId)?.name}</p>
                </div>

                <button onClick={() => handleVenueSelect(venue.id)} className="mt-4 w-full bg-green-600 hover:bg-green-700 cursor-pointer text-white py-2 px-4 rounded transition-colors">
                  Select Venue
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}