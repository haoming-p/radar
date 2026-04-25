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
  | "compare-players"
  | "key-takeaways"
  | "white-space"
  | "competitor-threats";

// Message type for history
export interface HistoryMessage {
  role: "user" | "assistant";
  content: string;
}

// Map selection context
export interface MapSelection {
  tab?: string | null;
  activeZone?: {
    id: number;
    label: string;
    keywords?: string;
    summary?: string;
    clusterCount: number;
    patentCount: number;
    trend?: number;
  } | null;
  activeHotArea?: {
    id: number;
    label: string;
    keywords?: string;
    summary?: string;
    clusterCount: number;
    patentCount: number;
  } | null;
  exploreSelection?: {
    clusterCount: number;
    patentCount: number;
    topKeywords: string[];
    clusterDetails?: { id: number; label: string; count: number }[];
  } | null;
  selectedPlayers?: {
    name: string;
    totalPatents: number;
    topAreas: { label: string }[];
  }[] | null;
  selectedYear?: number | null;
}

// Landscape background knowledge
export interface LandscapeData {
  totalPatents: number;
  totalClusters: number;
  zones: {
    id: number;
    label: string;
    keywords?: string;
    summary?: string;
    clusterCount: number;
    patentCount: number;
    trend: number;
  }[];
  hotAreas: {
    id: number;
    label: string;
    keywords?: string;
    summary?: string;
    clusterCount: number;
    patentCount: number;
  }[];
  players: {
    name: string;
    totalPatents: number;
    topAreas: { label: string }[];
  }[];
  clusters?: {
    id: number;
    label: string;
    count: number;
    keywords?: string;
    zoneId?: number;
  }[];
}

// Suggested hot area from AI
export interface SuggestedHotArea {
  name: string;
  description: string;
  clusterIds: number[];
  keywords: string;
}

// Map action from AI response
export interface MapAction {
  type: "highlightZone" | "highlightHotArea" | "highlightPlayer" | "filterClusters" | "updateZones" | "suggestHotAreas";
  zoneId?: number;
  hotAreaId?: number;
  playerName?: string;
  keywords?: string[];
  targetAreas?: number;
  areas?: SuggestedHotArea[];
}

// Request type
export interface ChatRequest {
  message: string;
  company: string;
  action?: ChatAction;
  history?: HistoryMessage[];
  landscape?: LandscapeData;
  mapSelection?: MapSelection;
  mode?: "internal" | "client";
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
 * Parse map actions from AI response text.
 * Looks for ```map-action {...} ``` blocks.
 * Returns the clean text (without action blocks) and parsed actions.
 */
export function parseMapActions(text: string): { cleanText: string; actions: MapAction[] } {
  const actions: MapAction[] = [];
  const cleanText = text.replace(/```map-action\s*\n?([\s\S]*?)```/g, (_match, jsonStr) => {
    try {
      const action = JSON.parse(jsonStr.trim());
      if (action.type) actions.push(action);
    } catch {
      // skip invalid JSON
    }
    return "";
  }).trim();
  return { cleanText, actions };
}

/**
 * Stream a chat response from the API
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
        landscape: request.landscape || null,
        mapSelection: request.mapSelection || null,
        mode: request.mode || "internal",
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
  onError: (error: string) => void,
  landscape?: LandscapeData,
  mapSelection?: MapSelection
): void {
  const actionConfig = CHAT_ACTIONS.find((a) => a.id === action);
  const message = actionConfig ? actionConfig.label : action;

  streamChatMessage(
    { message, company, action, history, landscape, mapSelection },
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

/**
 * Regenerate territory zones with a new target number of areas.
 * Returns new areas and cluster-to-area mapping.
 */
export async function regenerateZones(targetAreas: number): Promise<{
  areas: Record<string, any>;
  cluster_area_map: Record<string, number>;
}> {
  const response = await fetch(`${API_BASE_URL}/zones/regenerate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ target_areas: targetAreas }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || `Zone regeneration failed: ${response.status}`);
  }
  return response.json();
}
