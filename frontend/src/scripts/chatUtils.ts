/**
 * Chat API utilities for Patent Analysis Chatbot
 * Supports streaming responses via Server-Sent Events (SSE)
 */

import { API_BASE_URL as BASE_URL } from "../config";

// API configuration
const API_BASE_URL = `${BASE_URL}/api/demo`;

// Action types
export type ChatAction =
  | "competitive-position"
  | "key-takeaways"
  | "white-space"
  | "competitor-threats";

// Message type for history
export interface HistoryMessage {
  role: "user" | "assistant";
  content: string;
}

// Request type
export interface ChatRequest {
  message: string;
  company: string;
  action?: ChatAction;
  history?: HistoryMessage[];
}

// Action button configuration
export const CHAT_ACTIONS: {
  id: ChatAction;
  label: string;
  description: string;
}[] = [
  {
    id: "competitive-position",
    label: "Competitive Position",
    description: "Analyze company's market position",
  },
  {
    id: "key-takeaways",
    label: "Key Takeaways",
    description: "Overview of patent landscape",
  },
  {
    id: "white-space",
    label: "White Space",
    description: "Identify opportunities",
  },
  {
    id: "competitor-threats",
    label: "Competitor Threats",
    description: "Analyze competitive threats",
  },
];

/**
 * Stream a chat response from the API
 * 
 * @param request - The chat request
 * @param onChunk - Callback for each text chunk received
 * @param onDone - Callback when streaming is complete
 * @param onError - Callback for errors
 */
export async function streamChatMessage(
  request: ChatRequest,
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (error: string) => void
): Promise<void> {
  try {
    const response = await fetch(`${API_BASE_URL}/chat/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: request.message,
        company: request.company,
        action: request.action || null,
        history: request.history || [],
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || `HTTP error: ${response.status}`);
    }

    if (!response.body) {
      throw new Error("No response body");
    }

    // Read the stream
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      
      if (done) {
        break;
      }

      // Decode chunk and add to buffer
      buffer += decoder.decode(value, { stream: true });

      // Process complete SSE messages
      const lines = buffer.split("\n");
      buffer = lines.pop() || ""; // Keep incomplete line in buffer

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const jsonStr = line.slice(6); // Remove "data: " prefix
          
          if (!jsonStr.trim()) continue;

          try {
            const data = JSON.parse(jsonStr);
            
            if (data.error) {
              onError(data.error);
              return;
            }
            
            if (data.done) {
              onDone();
              return;
            }
            
            if (data.content) {
              onChunk(data.content);
            }
          } catch (e) {
            // Skip invalid JSON
            console.warn("Invalid SSE JSON:", jsonStr);
          }
        }
      }
    }

    // Call done if we exit the loop without explicit done signal
    onDone();

  } catch (error) {
    onError(error instanceof Error ? error.message : "Failed to connect to API");
  }
}

/**
 * Stream an action button request
 */
export function streamActionRequest(
  action: ChatAction,
  company: string,
  history: HistoryMessage[],
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (error: string) => void
): void {
  const actionConfig = CHAT_ACTIONS.find((a) => a.id === action);
  const message = actionConfig ? actionConfig.label : action;

  streamChatMessage(
    { message, company, action, history },
    onChunk,
    onDone,
    onError
  );
}

/**
 * Check if the chat API is healthy
 */
export async function checkChatHealth(): Promise<{
  status: string;
  model: string;
  data_exists: boolean;
}> {
  try {
    const response = await fetch(`${API_BASE_URL}/chat/health`);
    if (!response.ok) {
      throw new Error(`Health check failed: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    throw new Error("Chat API is not available");
  }
}