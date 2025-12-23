import { NextRequest } from 'next/server';
import { websocketStore } from '@utils/websocketStore';

/**
 * GET /api/ws - Server-Sent Events endpoint for real-time updates
 * This works with Next.js API routes without needing a custom server
 */
export async function GET(request: NextRequest) {
  const shareId = request.nextUrl.searchParams.get('shareId');

  if (!shareId) {
    return new Response('shareId is required', { status: 400 });
  }

  // Create a ReadableStream for Server-Sent Events
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      let lastCheck = Date.now();

      // Send initial connection message
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'connected' })}\n\n`));

      // Check for updates every 500ms
      const interval = setInterval(() => {
        if (websocketStore.hasUpdate(shareId, lastCheck)) {
          const message = JSON.stringify({
            type: 'config-updated',
            shareId: shareId
          });
          controller.enqueue(encoder.encode(`data: ${message}\n\n`));
          lastCheck = Date.now();
          websocketStore.clearUpdate(shareId);
        }
      }, 500);

      // Cleanup on client disconnect
      request.signal.addEventListener('abort', () => {
        clearInterval(interval);
        controller.close();
      });
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

