import { NextRequest } from 'next/server';
import { getAuthenticatedUser, errorResponse } from '@/lib/api-utils';
import { getDb } from '@/lib/db';
import crypto from 'crypto';

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return errorResponse('Unauthorized', 401);
    }

    const body = await req.json();
    const { message, contextFileId, contextDashboardId, contextId, locale } = body;

    if (!message || typeof message !== 'string') {
      return errorResponse('Message is required', 400);
    }

    const db = getDb();

    // Save user message
    const userMsgId = crypto.randomUUID().replace(/-/g, '');
    db.prepare(
      `INSERT INTO chat_messages (id, user_id, role, content, context_file_id, context_dashboard_id)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(userMsgId, user.id, 'user', message, contextFileId || null, contextDashboardId || null);

    // Get conversation history for context
    const history = db.prepare(
      `SELECT role, content FROM chat_messages
       WHERE user_id = ? ORDER BY created_at DESC LIMIT 20`
    ).all(user.id) as { role: string; content: string }[];

    // Forward to AI service and stream response
    const aiResponse = await fetch(`${AI_SERVICE_URL}/api/chat/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        user_id: user.id,
        context_file_id: contextFileId || null,
        context_dashboard_id: contextDashboardId || null,
        context_id: contextId || null,
        locale: locale || 'en',
        conversation_history: history.reverse(),
      }),
    });

    if (!aiResponse.ok || !aiResponse.body) {
      // Save error as assistant message
      const errorMsgId = crypto.randomUUID().replace(/-/g, '');
      const errorContent = 'Sorry, I was unable to process your request. Please try again.';
      db.prepare(
        `INSERT INTO chat_messages (id, user_id, role, content, context_file_id, context_dashboard_id)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(errorMsgId, user.id, 'assistant', errorContent, contextFileId || null, contextDashboardId || null);

      return errorResponse('AI service unavailable', 502);
    }

    const reader = aiResponse.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';

    const stream = new ReadableStream({
      async start(controller) {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });

            // Parse SSE lines from AI service to extract content for saving
            const lines = chunk.split('\n');
            for (const line of lines) {
              if (line.startsWith('data: ') && line.slice(6) !== '[DONE]') {
                try {
                  const parsed = JSON.parse(line.slice(6));
                  if (parsed.content) fullContent += parsed.content;
                } catch { /* skip non-JSON */ }
              }
            }

            // Pass through the AI service SSE data directly (preserves context_id, intent)
            controller.enqueue(new TextEncoder().encode(chunk));
          }

          // Save assistant response
          const assistantMsgId = crypto.randomUUID().replace(/-/g, '');
          db.prepare(
            `INSERT INTO chat_messages (id, user_id, role, content, context_file_id, context_dashboard_id)
             VALUES (?, ?, ?, ?, ?, ?)`
          ).run(assistantMsgId, user.id, 'assistant', fullContent, contextFileId || null, contextDashboardId || null);

          controller.close();
        } catch (err) {
          console.error('Stream error:', err);
          controller.error(err);
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Chat message error:', error);
    return errorResponse('Internal server error', 500);
  }
}
