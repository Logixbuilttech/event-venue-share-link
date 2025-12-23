import { NextRequest, NextResponse } from 'next/server';
import { loadSharedConfig, deleteSharedConfig, updateSharedConfig } from '@utils/sharedConfigStorage';
import { notifyShareUpdate } from '@utils/websocketStore';
import { isShareableEnabledServer } from '@utils/featureFlags';

/**
 * GET /api/share/[id] - Get a shared configuration by ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Check if shareable functionality is enabled
  if (!isShareableEnabledServer()) {
    return NextResponse.json(
      { error: 'Shareable functionality is disabled' },
      { status: 403 }
    );
  }

  try {
    const { id } = await params;
    
    if (!id) {
      return NextResponse.json(
        { error: 'Share ID is required' },
        { status: 400 }
      );
    }

    const config = loadSharedConfig(id);
    
    if (!config) {
      return NextResponse.json(
        { error: 'Shared configuration not found' },
        { status: 404 }
      );
    }

    // Check expiration if set
    if (config.expiresAt) {
      const now = new Date();
      const expiresAt = new Date(config.expiresAt);
      if (now > expiresAt) {
        // Auto-delete expired config
        deleteSharedConfig(id);
        return NextResponse.json(
          { error: 'Shared configuration has expired' },
          { status: 410 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      config,
    });
  } catch (error) {
    console.error('Error fetching shared config:', error);
    return NextResponse.json(
      { error: 'Failed to fetch shared configuration' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/share/[id] - Update an existing shared configuration
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Check if shareable functionality is enabled
  if (!isShareableEnabledServer()) {
    return NextResponse.json(
      { error: 'Shareable functionality is disabled' },
      { status: 403 }
    );
  }

  try {
    const { id } = await params;
    
    if (!id) {
      return NextResponse.json(
        { error: 'Share ID is required' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { venueId, floorPlanId, stage, event, guestCount, seatingMode, customName } = body;

    // Check if config exists
    const existingConfig = loadSharedConfig(id);
    if (!existingConfig) {
      return NextResponse.json(
        { error: 'Shared configuration not found' },
        { status: 404 }
      );
    }

    // Update the configuration
    const updatedConfig = updateSharedConfig(id, {
      venueId: venueId || existingConfig.venueId,
      floorPlanId: floorPlanId || existingConfig.floorPlanId,
      stage: stage !== undefined ? stage : existingConfig.stage,
      event: event !== undefined ? event : existingConfig.event,
      guestCount: guestCount !== undefined ? guestCount : existingConfig.guestCount,
      seatingMode: seatingMode || existingConfig.seatingMode,
      customName: customName !== undefined ? customName : existingConfig.customName,
    });

    if (!updatedConfig) {
      return NextResponse.json(
        { error: 'Failed to update shared configuration' },
        { status: 500 }
      );
    }

    // Notify real-time update (works with API routes)
    try {
      notifyShareUpdate(id);
    } catch (error) {
      console.error('[Realtime] Error notifying update:', error);
    }

    return NextResponse.json({
      success: true,
      config: updatedConfig,
      message: 'Shared configuration updated successfully',
    });
  } catch (error) {
    console.error('Error updating shared config:', error);
    return NextResponse.json(
      { error: 'Failed to update shared configuration', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/share/[id] - Delete a shared configuration
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    if (!id) {
      return NextResponse.json(
        { error: 'Share ID is required' },
        { status: 400 }
      );
    }

    const deleted = deleteSharedConfig(id);
    
    if (!deleted) {
      return NextResponse.json(
        { error: 'Shared configuration not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Shared configuration deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting shared config:', error);
    return NextResponse.json(
      { error: 'Failed to delete shared configuration' },
      { status: 500 }
    );
  }
}

