'use client';

import { useState } from 'react';
import { predefinedEvents, type EventConfig } from '@config/events';

interface EventSelectorProps {
  onEventSelect: (event: EventConfig | null) => void;
  selectedEvent: EventConfig | null;
}

export default function EventSelector({ onEventSelect, selectedEvent }: EventSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [objectsExpanded, setObjectsExpanded] = useState(false);

  const handleEventSelect = (event: EventConfig) => {
    onEventSelect(event);
    setIsOpen(false);
  };

  const handleClearEvent = () => {
    onEventSelect(null);
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <div className="bg-gray-800 text-white p-4 border-b border-gray-700">
        <h3 className="text-lg font-semibold border-b border-gray-700 pb-2 mb-4">Event Selection</h3>
        
        {/* Event Selector Dropdown */}
        <div className="relative">
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="w-full bg-gray-700 hover:bg-gray-600 rounded py-2 px-3 text-left flex items-center justify-between"
          >
            <span>
              {selectedEvent ? selectedEvent.name : 'Select an event...'}
            </span>
            <span className={`transform transition-transform ${isOpen ? 'rotate-180' : ''}`}>
              ▼
            </span>
          </button>

          {isOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-gray-700 rounded shadow-lg z-50 max-h-60 overflow-y-auto">
              <button
                onClick={handleClearEvent}
                className="w-full text-left py-2 px-3 hover:bg-gray-600 text-gray-300"
              >
                Clear Event
              </button>
              {predefinedEvents.map((event: EventConfig) => (
                <button
                  key={event.id}
                  onClick={() => handleEventSelect(event)}
                  className={`w-full text-left py-2 px-3 hover:bg-gray-600 ${
                    selectedEvent?.id === event.id ? 'bg-gray-600' : ''
                  }`}
                >
                  <div className="font-medium">{event.name}</div>
                  {event.description && (
                    <div className="text-sm text-gray-400">{event.description}</div>
                  )}
                  <div className="text-xs text-gray-500 mt-1">
                    {event.objects.length} object{event.objects.length !== 1 ? 's' : ''}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Selected Event Info */}
        {selectedEvent && (
          <div className="mt-4 p-3 bg-gray-700 rounded">
            <button
              onClick={() => setObjectsExpanded(!objectsExpanded)}
              className="flex items-center justify-between w-full font-semibold text-sm hover:text-blue-400 transition-colors cursor-pointer"
            >
              <span>Event Objects:</span>
              <svg
                className={`w-4 h-4 transition-transform ${objectsExpanded ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {objectsExpanded && (
              <div className="space-y-2 mt-2">
                {selectedEvent.objects.map((obj) => (
                  <div key={obj.id} className="text-xs bg-gray-600 p-2 rounded">
                    <p className="font-medium text-white">{obj.name}</p>
                    <p className="text-gray-400">Position: ({obj.x}, {obj.y})</p>
                    <p className="text-gray-400">File: {obj.fileName}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

