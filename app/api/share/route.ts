import { NextRequest, NextResponse } from 'next/server';
import { saveSharedConfig, readSharedConfigs } from '@utils/sharedConfigStorage';
import type { SharedConfiguration } from '@config/shared';
import { notifyShareUpdate } from '@utils/websocketStore';
import { isShareableEnabledServer } from '@utils/featureFlags';

/**
 * POST /api/share - Create a new shareable link
 */
export async function POST(request: NextRequest) {
  // Check if shareable functionality is enabled
  if (!isShareableEnabledServer()) {
    return NextResponse.json(
      { error: 'Shareable functionality is disabled' },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    
    // Validate required fields
    const { venueId, floorPlanId, stage, event, guestCount, seatingMode, customName } = body;
    
    if (!venueId || !floorPlanId) {
      return NextResponse.json(
        { error: 'venueId and floorPlanId are required' },
        { status: 400 }
      );
    }

    // Generate unique ID
    const id = generateShareId();
    
    // Create shared configuration
    const config: SharedConfiguration = {
      id,
      venueId,
      floorPlanId,
      stage: stage || null,
      event: event || null,
      guestCount: guestCount || 0,
      seatingMode: seatingMode || 'auto',
      createdAt: new Date().toISOString(),
      customName: customName || undefined,
    };

    // Save to JSON file
    saveSharedConfig(config);

    // Notify real-time update (works with API routes)
    try {
      notifyShareUpdate(id);
    } catch (error) {
      console.error('[Realtime] Error notifying update:', error);
    }

    // Return the share ID and URL
    const shareUrl = `${request.headers.get('origin')}/share/${id}`;

    return NextResponse.json({
      success: true,
      id,
      shareUrl,
      config,
    });
  } catch (error) {
    console.error('Error creating shareable link:', error);
    return NextResponse.json(
      { error: 'Failed to create shareable link', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/share - Get all shared configurations (for admin/debugging)
 */
export async function GET() {
  try {
    const configs = readSharedConfigs();
    return NextResponse.json({
      success: true,
      configs: Object.values(configs),
      count: Object.keys(configs).length,
    });
  } catch (error) {
    console.error('Error fetching shared configs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch shared configurations' },
      { status: 500 }
    );
  }
}

/**
 * Generate a unique share ID
 */
function generateShareId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 8; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  // Ensure uniqueness
  const configs = readSharedConfigs();
  if (configs[id]) {
    return generateShareId();
  }
  
  return id;
}

