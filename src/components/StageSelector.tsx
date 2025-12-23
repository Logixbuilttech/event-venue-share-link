'use client';

import { useEffect, useState } from 'react';
import { predefinedStages, type StageConfig } from '@config/stages';
import { feetToDXFUnits, dxfUnitsToFeet, type FloorPlan } from '@config/venues';

interface StageSelectorProps {
  onStageSelect: (stage: StageConfig | null) => void;
  selectedStage: StageConfig | null;
  onStageUpdate?: (stage: StageConfig) => void;
  availableStages?: StageConfig[];
  currentFloorPlan?: FloorPlan | null;
}

export default function StageSelector({ onStageSelect, selectedStage, onStageUpdate, availableStages, currentFloorPlan }: StageSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [localStage, setLocalStage] = useState<StageConfig | null>(selectedStage);
  const [showCustomInputs, setShowCustomInputs] = useState(false);
  const [controlsExpanded, setControlsExpanded] = useState(false);
  const [customDimensions, setCustomDimensions] = useState<{ width: number | null, height: number | null }>({ width: null, height: null }); // Default in feet
  const [customDXFFile, setCustomDXFFile] = useState<File | null>(null);
  const [customFileName, setCustomFileName] = useState<string>('');
  const [fileError, setFileError] = useState<string>('');
  const [dimensionError, setDimensionError] = useState<{ width?: string, height?: string }>({
    width: '',
    height: ''
  });
  const [positionError, setPositionError] = useState<string>('');

  // Use availableStages if provided, otherwise fall back to predefinedStages
  const stages = availableStages || predefinedStages;

  // Get venue dimensions from floor plan config (defaults to 50ft x 30ft)
  const maxVenueWidthFeet = currentFloorPlan?.width || 50;
  const maxVenueHeightFeet = currentFloorPlan?.height || 30;

  const handleStageSelect = (stage: StageConfig) => {
    setShowCustomInputs(false);
    setLocalStage(stage);
    onStageSelect(stage);
    setIsOpen(false);
    setDimensionError({ width: '', height: '' });
  };

  const handleClearStage = () => {
    setLocalStage(null);
    onStageSelect(null);
    setIsOpen(false);
    setDimensionError({ width: '', height: '' });
  };

  const handleRotationChange = (rotation: number) => {
    if (localStage) {
      const updatedStage = { ...localStage, rotation };
      setLocalStage(updatedStage);
      onStageUpdate?.(updatedStage);
    }
  };

  const validateStagePosition = (x: number, y: number, width: number, height: number): boolean => {
    // Define stage area bounds
    const stageBounds = {
      minX: 700,
      maxX: 1550,
      minY: 1000,
      maxY: 2010
    };

    // Check if stage is within bounds
    const isWithinBounds =
      x - width / 2 >= stageBounds.minX &&
      x + width / 2 <= stageBounds.maxX &&
      y - height / 2 >= stageBounds.minY &&
      y + height / 2 <= stageBounds.maxY;

    if (!isWithinBounds) {
      setPositionError('Stage position is outside the allowed area');
    } else {
      setPositionError('');
    }

    return isWithinBounds;
  };

  const handlePositionChange = (field: 'x' | 'y', value: number) => {
    if (localStage) {
      // Allow negative values and handle NaN properly
      const numericValue = isNaN(value) ? 0 : value;
      const newX = field === 'x' ? numericValue : localStage.x;
      const newY = field === 'y' ? numericValue : localStage.y;

      // Get stage dimensions
      const width = localStage.width || 200; // Default width if not set
      const height = localStage.height || 100; // Default height if not set

      // Validate new position
      const isValid = validateStagePosition(newX, newY, width, height);

      const updatedStage = { ...localStage, [field]: numericValue };
      setLocalStage(updatedStage);

      // Only update if position is valid
      if (isValid) {
        onStageUpdate?.(updatedStage);
      }
    }
  };

  // Handle stage position updates from dragging
  const handleStagePositionUpdate = (newX: number, newY: number) => {
    if (localStage) {
      // Get stage dimensions
      const width = localStage.width || 200;
      const height = localStage.height || 100;

      // Validate new position
      const isValid = validateStagePosition(newX, newY, width, height);

      const updatedStage = { ...localStage, x: newX, y: newY };
      setLocalStage(updatedStage);

      // Only update if position is valid
      if (isValid) {
        onStageUpdate?.(updatedStage);
      }
    }
  };

  const handleSizeChange = (field: 'width' | 'height', value: number) => {
    if (localStage) {
      // Allow positive values only for size, handle NaN properly
      const numericValue = isNaN(value) || value <= 0 ? undefined : value;
      const updatedStage = { ...localStage, [field]: numericValue };

      // Auto-clear the other dimension when one is set to maintain aspect ratio
      if (field === 'width' && numericValue !== undefined) {
        updatedStage.height = undefined; // Clear height to auto-calculate
      } else if (field === 'height' && numericValue !== undefined) {
        updatedStage.width = undefined; // Clear width to auto-calculate
      }

      setLocalStage(updatedStage);
      onStageUpdate?.(updatedStage);
    }
  };

  const handleCustomDimensionChange = (field: 'customWidth' | 'customHeight', value: number) => {
    if (localStage && localStage.isCustom) {
      const numericValue = isNaN(value) || value <= 0 ? undefined : value;

      // Validate against venue maximum dimensions
      if (numericValue) {
        const valueInFeet = dxfUnitsToFeet(numericValue);

        if (field === 'customWidth' && valueInFeet > maxVenueWidthFeet) {
          setDimensionError({ ...dimensionError, width: `Width (${valueInFeet.toFixed(1)}ft) exceeds venue maximum of ${maxVenueWidthFeet}ft` });
          return;
        } else if (field === 'customWidth') {
          setDimensionError({ ...dimensionError, width: '' });
        }

        if (field === 'customHeight' && valueInFeet > maxVenueHeightFeet) {
          setDimensionError({ ...dimensionError, height: `Length (${valueInFeet.toFixed(1)}ft) exceeds venue maximum of ${maxVenueHeightFeet}ft` });
          return;
        } else if (field === 'customHeight') {
          setDimensionError({ ...dimensionError, height: '' });
        }
      }

      const updatedStage = { ...localStage, [field]: numericValue };
      setLocalStage(updatedStage);
      onStageUpdate?.(updatedStage);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const fileName = file.name.toLowerCase();
      const isValidDXF = fileName.endsWith('.dxf');

      if (!isValidDXF) {
        setFileError('Invalid file type. Please select a DXF file (.dxf)');
        setCustomDXFFile(null);
        setCustomFileName('');
        e.target.value = '';
        return;
      }

      // Valid DXF file
      setFileError('');
      setCustomDXFFile(file);
      setCustomFileName(file.name);
    }
  };

  const handleCustomStageCreate = () => {
    setDimensionError({ width: '', height: '' });
    // Validate dimensions are provided
    if (!customDimensions.width || !customDimensions.height) {
      setFileError('Please provide both width and height');
      return;
    }

    // Convert feet to DXF units
    const widthInDXF = feetToDXFUnits(customDimensions.width);
    const heightInDXF = feetToDXFUnits(customDimensions.height);

    // Validate against venue maximum dimensions (from floor plan config)
    if (customDimensions.width > maxVenueWidthFeet) {
      setDimensionError({ ...dimensionError, width: `Stage width (${customDimensions.width}ft) exceeds venue maximum width of ${maxVenueWidthFeet}ft` });
      return;
    } else {
      setDimensionError({ ...dimensionError, width: '' });
    }

    if (customDimensions.height > maxVenueHeightFeet) {
      setDimensionError({ ...dimensionError, height: `Stage height (${customDimensions.height}ft) exceeds venue maximum height of ${maxVenueHeightFeet}ft` });
      return;
    } else {
      setDimensionError({ ...dimensionError, height: '' });
    }

    // If no DXF file provided, create a simple stage with a placeholder fileName
    const fileName = customDXFFile ? customFileName : 'simple-stage'; // Special identifier for simple stages
    const description = customDXFFile
      ? `Custom stage ${customDimensions.width}ft x ${customDimensions.height}ft - ${customDXFFile.name}`
      : `Simple stage ${customDimensions.width}ft x ${customDimensions.height}ft`;

    const customStage: StageConfig = {
      id: `custom-stage-${Date.now()}`,
      name: customDXFFile ? 'Custom Stage' : 'Simple Stage',
      fileName: fileName,
      x: 832,
      y: 1520,
      rotation: 0,
      isCustom: true,
      isSimpleStage: !customDXFFile, // Flag to indicate this is a simple rectangle stage
      customWidth: widthInDXF, // Store in DXF units
      customHeight: heightInDXF, // Store in DXF units
      customFile: customDXFFile || undefined, // Store the file object if available
      description: description
    };

    setLocalStage(customStage);
    onStageSelect(customStage);
    setShowCustomInputs(false);
    setIsOpen(false);
  };

  const handleCustomOptionClick = () => {
    setShowCustomInputs(true);
    setIsOpen(false);
    setLocalStage(null);
    onStageSelect(null);
    // Reset custom stage inputs
    setCustomDXFFile(null);
    setCustomFileName('');
    setCustomDimensions({ width: 20, height: 10 });
    setFileError('');
  };

  const handleCancelCustomStage = () => {
    setShowCustomInputs(false);
    setCustomDXFFile(null);
    setCustomFileName('');
    setCustomDimensions({ width: 20, height: 10 });
    setFileError('');
    setDimensionError({ width: '', height: '' });
  };

  return (
    <div className="relative">
      <div className="bg-gray-800 text-white p-4">
        <h3 className="text-lg font-semibold border-b border-gray-700 pb-2 mb-4">Stage Selection</h3>

        {/* Stage Selector Dropdown */}
        <div className="relative">
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="w-full bg-gray-700 hover:bg-gray-600 rounded py-2 px-3 text-left flex items-center justify-between"
          >
            <span>
              {selectedStage ? selectedStage.name : 'Select a stage...'}
            </span>
            <span className={`transform transition-transform ${isOpen ? 'rotate-180' : ''}`}>
              ▼
            </span>
          </button>

          {isOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-gray-700 rounded shadow-lg z-50 max-h-60 overflow-y-auto">
              <button
                onClick={handleClearStage}
                className="w-full text-left py-2 px-3 hover:bg-gray-600 text-gray-300"
              >
                Clear Stage
              </button>
              <button
                onClick={handleCustomOptionClick}
                className="w-full text-left py-2 px-3 hover:bg-gray-600 text-blue-300 border-b border-gray-600"
              >
                <div className="font-medium">+ Create Custom Stage</div>
                <div className="text-sm text-gray-400">Define your own dimensions</div>
              </button>
              {stages.map((stage: StageConfig) => (
                <button
                  key={stage.id}
                  onClick={() => handleStageSelect(stage)}
                  className={`w-full text-left py-2 px-3 hover:bg-gray-600 ${selectedStage?.id === stage.id ? 'bg-gray-600' : ''
                    }`}
                >
                  <div className="font-medium">{stage.name}</div>
                  {stage.description && (
                    <div className="text-sm text-gray-400">{stage.description}</div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Custom Stage Creation Form */}
        {showCustomInputs && (
          <div className="mt-4 p-3 bg-blue-900 rounded border border-blue-700">
            <h4 className="font-semibold text-sm mb-3 text-blue-200">Create Custom Stage</h4>
            <div className="mb-3 p-2 bg-blue-800 rounded text-xs text-blue-200">
              <p className="font-semibold mb-1">📏 Venue Limits:</p>
              <p>• Maximum Width: {maxVenueWidthFeet} feet</p>
              <p>• Maximum Height: {maxVenueHeightFeet} feet</p>
            </div>

            {/* <div className="mb-3">
              <label className="block text-xs text-blue-300 mb-1">
                Select DXF File <span className="text-gray-400">(Optional)</span>
              </label>
              <input
                type="file"
                accept=".dxf,.DXF"
                onChange={handleFileChange}
                className="w-full bg-gray-600 text-white text-xs px-2 py-1 rounded file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:bg-blue-600 file:text-white hover:file:bg-blue-500 file:cursor-pointer"
              />
              {fileError ? (
                <p className="text-xs text-red-400 mt-1">{fileError}</p>
              ) : customDXFFile ? (
                <p className="text-xs text-green-300 mt-1">✓ Selected: {customDXFFile.name}</p>
              ) : (
                <p className="text-xs text-gray-400 mt-1">No file selected - will create a simple rectangle stage</p>
              )}
            </div> */}

            <div className="mb-3">
              <label className="block text-xs text-blue-300 mb-1">Stage Width (feet):</label>
              <input
                type="number"
                value={customDimensions.width !== null ? customDimensions.width : ''}
                onChange={(e) => {
                  const value = e.target.value;
                  if (e.target.value === '') {
                    setCustomDimensions(prev => ({ ...prev, width: null }));
                  } else {
                    const numValue = parseInt(value);
                    if (!isNaN(numValue) && numValue >= 0) {
                      setCustomDimensions(prev => ({ ...prev, width: numValue }));
                    }
                  }
                  setDimensionError({ ...dimensionError, width: '' });
                }}
                className="w-full bg-gray-600 text-white text-xs px-2 py-1 rounded"
                placeholder={`Enter width in feet (max ${maxVenueWidthFeet})`}
              />
              {dimensionError.width && (
                <p className="text-xs text-red-400 mt-1">{dimensionError.width}</p>
              )}
            </div>

            <div className="mb-3">
              <label className="block text-xs text-blue-300 mb-1">Stage Height (feet):</label>
              <input
                type="number"
                value={customDimensions.height !== null ? customDimensions.height : ''}
                onChange={(e) => {
                  const value = e.target.value;
                  if (e.target.value === '') {
                    setCustomDimensions(prev => ({ ...prev, height: null }));
                  } else {
                    const numValue = parseInt(value);
                    if (!isNaN(numValue) && numValue >= 0) {
                      setCustomDimensions(prev => ({ ...prev, height: numValue }));
                    }
                  }
                  setDimensionError({ ...dimensionError, height: '' });
                }}
                className="w-full bg-gray-600 text-white text-xs px-2 py-1 rounded"
                placeholder={`Enter height in feet (max ${maxVenueHeightFeet})`}
              />
              {dimensionError.height && (
                <p className="text-xs text-red-400 mt-1">{dimensionError.height}</p>
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleCustomStageCreate}
                className="flex-1 bg-blue-600 hover:bg-blue-500 text-white text-xs px-3 py-2 rounded cursor-pointer"
                title="Create stage with custom dimensions"
              >
                Create Stage
              </button>
              <button
                onClick={handleCancelCustomStage}
                className="flex-1 bg-gray-600 hover:bg-gray-500 text-white text-xs px-3 py-2 rounded"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Selected Stage Info and Controls */}
        {localStage && (localStage.isCustom || !localStage.isCustom) && ( // Allow controls for ALL stages
          <div className="mt-4 p-3 bg-gray-700 rounded">
            <button
              onClick={() => setControlsExpanded(!controlsExpanded)}
              className="flex items-center justify-between w-full font-semibold text-sm hover:text-blue-400 transition-colors cursor-pointer"
            >
              <span>Stage Controls:</span>
              <svg
                className={`w-4 h-4 transition-transform ${controlsExpanded ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {controlsExpanded && (
              <>
                <p className="text-sm text-gray-300 mb-3 mt-2">{localStage.name}</p>

                {/* Position Controls */}
                <div className="mb-3">
                  {positionError && (
                    <div className="mb-2 text-xs text-red-500 bg-red-900/30 p-2 rounded">
                      🚨 {positionError}
                    </div>
                  )}
                  <label className="block text-xs text-gray-400 mb-1">Position X:</label>
                  <input
                    type="number"
                    value={localStage.x}
                    onChange={(e) => {
                      const value = e.target.value === '' ? 0 : parseFloat(e.target.value);

                      // Calculate delta and adjust backstage depth if needed
                      if (localStage) {
                        const oldX = localStage.x;
                        const deltaX = value - oldX;
                        const deltaFeet = deltaX / 12; // Convert DXF units to feet

                        // Key off rotation to determine if X movement affects backstage depth
                        // 0 deg = Back is Left (-X). Moving Left (-X) reduces space.
                        // 180 deg = Back is Right (+X). Moving Right (+X) reduces space.
                        const rot = (localStage.rotation || 0) % 360;
                        const normRot = rot < 0 ? rot + 360 : rot;

                        let depthFactor = 0;
                        if (normRot < 45 || normRot > 315) depthFactor = 1; // Back Left: Move Right(+) -> More Space(+)
                        else if (normRot > 135 && normRot < 225) depthFactor = -1; // Back Right: Move Right(+) -> Less Space(-)

                        // Only Apply if factor is non-zero (i.e. horizontal orientation)
                        if (depthFactor !== 0) {
                          const currentDepth = localStage.backstageDepth || 0;
                          const newDepth = Math.max(0, currentDepth + (deltaFeet * depthFactor));

                          // Create updated stage with BOTH x and new depth
                          // We verify X validity inside handlePositionChange but here we do it manually to batch updates
                          // Reuse simple validation or just trust the drag/input for now (user can correct invalid inputs)
                          // Ideally we call validateStagePosition but it returns bool, doesn't clamp.

                          // Update local stage directly to avoid race conditions with handlePositionChange
                          const updatedStage = {
                            ...localStage,
                            x: value,
                            backstageDepth: Number(newDepth.toFixed(2))
                          };
                          setLocalStage(updatedStage);
                          onStageUpdate?.(updatedStage);
                          return;
                        }
                      }

                      // Fallback for other rotations or if localStage null
                      handlePositionChange('x', value);
                    }}
                    className="w-full bg-gray-600 text-white text-xs px-2 py-1 rounded"
                    step="10"
                    placeholder="0"
                  />
                </div>

                <div className="mb-3">
                  <label className="block text-xs text-gray-400 mb-1">Position Y:</label>
                  <input
                    type="number"
                    value={localStage.y}
                    onChange={(e) => {
                      const value = e.target.value === '' ? 0 : parseFloat(e.target.value);
                      handlePositionChange('y', value);
                    }}
                    className="w-full bg-gray-600 text-white text-xs px-2 py-1 rounded"
                    step="10"
                    placeholder="0"
                  />
                </div>

                {/* Size Controls */}
                {!localStage.isCustom ? (
                  <>
                    <div className="mb-3">
                      <label className="block text-xs text-gray-400 mb-1">
                        Width {localStage.height ? '(auto-calculated)' : '(sets height auto)'}:
                      </label>
                      <input
                        type="number"
                        value={localStage.width || ''}
                        onChange={(e) => {
                          const value = e.target.value === '' ? undefined : parseFloat(e.target.value);
                          handleSizeChange('width', value || 0);
                        }}
                        className="w-full bg-gray-600 text-white text-xs px-2 py-1 rounded"
                        step="10"
                        min="0"
                        placeholder="Auto"
                        disabled={!!localStage.height}
                      />
                    </div>

                    <div className="mb-3">
                      <label className="block text-xs text-gray-400 mb-1">
                        Height {localStage.width ? '(auto-calculated)' : '(sets width auto)'}:
                      </label>
                      <input
                        type="number"
                        value={localStage.height || ''}
                        onChange={(e) => {
                          const value = e.target.value === '' ? undefined : parseFloat(e.target.value);
                          handleSizeChange('height', value || 0);
                        }}
                        className="w-full bg-gray-600 text-white text-xs px-2 py-1 rounded"
                        step="10"
                        min="0"
                        placeholder="Auto"
                        disabled={!!localStage.width}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    {/* Venue Limits Info for Custom Stage */}
                    <div className="mb-3 p-2 bg-gray-600 rounded text-xs text-gray-300">
                      <p className="font-semibold mb-1">📏 Venue Limits:</p>
                      <p>• Max Width: {maxVenueWidthFeet}ft | Max Height: {maxVenueHeightFeet}ft</p>
                    </div>

                    {/* Custom Stage Dimension Controls */}
                    <div className="mb-3">
                      <label className="block text-xs text-gray-400 mb-1">Custom Width (feet):</label>
                      <input
                        type="number"
                        value={localStage.customWidth ? dxfUnitsToFeet(localStage.customWidth).toFixed(0) : ''}
                        onChange={(e) => {
                          const value = e.target.value === '' ? undefined : parseFloat(e.target.value);
                          const valueInDXF = value ? feetToDXFUnits(value) : undefined;
                          handleCustomDimensionChange('customWidth', valueInDXF || 0);
                        }}
                        className="w-full bg-gray-600 text-white text-xs px-2 py-1 rounded"
                        step="10"
                        min="0"
                        max={maxVenueWidthFeet}
                        placeholder={`Enter width in feet (max ${maxVenueWidthFeet})`}
                      />
                      {dimensionError.width && (
                        <p className="text-xs text-red-400 mt-1">{dimensionError.width}</p>
                      )}
                    </div>

                    <div className="mb-3">
                      <label className="block text-xs text-gray-400 mb-1">Custom Length (feet):</label>
                      <input
                        type="number"
                        value={localStage.customHeight ? dxfUnitsToFeet(localStage.customHeight).toFixed(0) : ''}
                        onChange={(e) => {
                          const value = e.target.value === '' ? undefined : parseFloat(e.target.value);
                          const valueInDXF = value ? feetToDXFUnits(value) : undefined;
                          handleCustomDimensionChange('customHeight', valueInDXF || 0);
                        }}
                        className="w-full bg-gray-600 text-white text-xs px-2 py-1 rounded"
                        step="10"
                        min="0"
                        max={maxVenueHeightFeet}
                        placeholder={`Enter length in feet (max ${maxVenueHeightFeet})`}
                      />
                      {dimensionError.height && (
                        <p className="text-xs text-red-400 mt-1">{dimensionError.height}</p>
                      )}
                    </div>
                  </>
                )}

                {/* Clear Size Button */}
                {(localStage.width || localStage.height) && (
                  <div className="mb-3">
                    <button
                      onClick={() => {
                        const updatedStage = { ...localStage, width: undefined, height: undefined };
                        setLocalStage(updatedStage);
                        onStageUpdate?.(updatedStage);
                      }}
                      className="w-full bg-gray-600 hover:bg-gray-500 text-white text-xs px-2 py-1 rounded"
                    >
                      Reset to Auto Size
                    </button>
                  </div>
                )}

                {/* Rotation Control */}
                <div className="mb-3">
                  <label className="block text-xs text-gray-400 mb-1">Rotation (degrees):</label>
                  <input
                    type="number"
                    value={localStage.rotation || 0}
                    onChange={(e) => handleRotationChange(parseFloat(e.target.value) || 0)}
                    className="w-full bg-gray-600 text-white text-xs px-2 py-1 rounded"
                    min="0"
                    max="360"
                    step="1"
                  />
                </div>

                {/* Backstage Space Control */}
                <div className="mb-3">
                  <label className="block text-xs text-gray-400 mb-1">Backstage Space (feet):</label>
                  <div className="flex gap-2 items-center">
                    <input
                      type="number"
                      value={localStage.backstageDepth || 0}
                      onChange={(e) => {
                        const newDepth = parseFloat(e.target.value);
                        if (isNaN(newDepth) || newDepth < 0) return;

                        if (localStage) {
                          const oldDepth = localStage.backstageDepth || 0;
                          const deltaFeet = newDepth - oldDepth;

                          const updatedStage = {
                            ...localStage,
                            backstageDepth: newDepth,
                            // Do not automatically move the stage. Let it grow relative to center.
                            x: localStage.x
                          };

                          setLocalStage(updatedStage);
                          onStageUpdate?.(updatedStage);
                        }
                      }}
                      className="w-full bg-gray-600 text-white text-xs px-2 py-1 rounded"
                      min="0"
                      step="1"
                      placeholder="0"
                    />
                    <div className={`w-4 h-4 rounded-full flex-shrink-0 ${(localStage.backstageDepth || 0) < 6 ? 'bg-red-500' :
                      (localStage.backstageDepth || 0) < 10 ? 'bg-yellow-500' :
                        'bg-green-500'
                      }`} title={
                        (localStage.backstageDepth || 0) < 6 ? 'Bare minimum (< 6ft)' :
                          (localStage.backstageDepth || 0) < 10 ? 'Standard (6-10ft)' :
                            'Comfortable (> 10ft)'
                      }></div>
                  </div>
                </div>

                <p className="text-xs text-gray-400">File: {localStage.fileName}</p>

                {/* Stage Dimensions Info */}
                <div className="mt-2 p-2 bg-gray-600 rounded text-xs">
                  <p className="text-gray-300 font-semibold mb-1">Stage Dimensions:</p>
                  {localStage.isCustom ? (
                    <>
                      <p className="text-gray-400">
                        • Width: {localStage.customWidth ? `${dxfUnitsToFeet(localStage.customWidth).toFixed(1)}ft (${localStage.customWidth}in)` : 'Not set'}
                      </p>
                      <p className="text-gray-400">
                        • Height: {localStage.customHeight ? `${dxfUnitsToFeet(localStage.customHeight).toFixed(1)}ft (${localStage.customHeight}in)` : 'Not set'}
                      </p>
                      <p className="text-gray-400">
                        • Type: Custom Stage
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-gray-400">
                        • Width: {localStage.width ? `${localStage.width} (set)` : 'Auto (from DXF)'}
                      </p>
                      <p className="text-gray-400">
                        • Height: {localStage.height ? `${localStage.height} (set)` : 'Auto (from DXF)'}
                      </p>
                      <p className="text-gray-400">
                        • Aspect Ratio: {localStage.width && !localStage.height ? 'Maintained' :
                          localStage.height && !localStage.width ? 'Maintained' :
                            localStage.width && localStage.height ? 'Custom' : 'Original'}
                      </p>
                    </>
                  )}
                </div>

                {/* Coordinate System Info */}
                <div className="mt-2 p-2 bg-gray-600 rounded text-xs">
                  <p className="text-gray-300 font-semibold mb-1">Coordinate System:</p>
                  <p className="text-gray-400">• X: Left (-) to Right (+)</p>
                  <p className="text-gray-400">• Y: Back (-) to Front (+)</p>
                  <p className="text-gray-400">• Origin (0,0) is at center</p>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
