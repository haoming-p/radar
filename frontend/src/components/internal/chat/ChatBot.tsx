import { useState, useRef, useCallback, useEffect } from "react";
import {
  MessageSquare,
  Minus,
  X,
  Send,
  Loader2,
  BarChart3,
  Lightbulb,
  Search,
  AlertTriangle,
  Maximize2,
  Minimize2,
  History,
  ArrowLeft,
  Sparkles,
  RotateCcw,
} from "lucide-react";
import ChatMessage from "./ChatMessage";
import {
  streamChatMessage,
  ChatAction,
  HistoryMessage,
  LandscapeData,
  MapSelection,
  MapAction,
  SuggestedHotArea,
  parseMapActions,
} from "../../../scripts/chatUtils";

// ============ TYPES ============
export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  isContext?: boolean; // system-injected context message
}

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  company: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatBotProps {
  players: Array<{
    name: string;
    totalPatents: number;
  }>;
  landscape: LandscapeData;
  mapSelection?: MapSelection;
  onMapAction?: (action: MapAction) => void;
  // Allow parent to inject a context message (from AI button clicks)
  pendingContext?: {
    text: string;
    selection: MapSelection;
    section?: "keyAreas" | "hotAreas" | "currents" | "explore";
    areaData?: { label: string; patents: number; clusters: number; keywords?: string; summary?: string };
  } | null;
  onPendingContextHandled?: () => void;
  // Highlight effect
  highlightChat?: boolean;
  // Explore summary callback (name parsed from first line, summary is the rest)
  onExploreSummary?: (name: string, summary: string) => void;
  // AI-suggested hot areas pending user confirmation
  pendingSuggestions?: SuggestedHotArea[];
  onAddSuggestion?: (suggestion: SuggestedHotArea) => void;
  onDismissSuggestions?: () => void;
  // View mode
  mode?: "internal" | "client";
}

// Action buttons
const ACTION_BUTTONS: {
  id: ChatAction;
  label: string;
  icon: typeof BarChart3;
}[] = [
  { id: "competitive-position", label: "Competitive Position", icon: BarChart3 },
  { id: "compare-players", label: "Compare Players", icon: Search },
];

// Panel dimensions (defaults + constraints)
const DEFAULT_WIDTH = 440;
const DEFAULT_HEIGHT = 720;
const MIN_WIDTH = 320;
const MIN_HEIGHT = 400;
const MAX_WIDTH = 900;
const MAX_HEIGHT = 1000;

// localStorage keys (per-mode)
const STORAGE_KEY_INTERNAL = "patent-chat-conversations-v2";
const STORAGE_KEY_CLIENT = "patent-chat-conversations-client-v2";

// Load conversations from localStorage
const loadConversationsFromStorage = (storageKey: string): Record<string, Conversation[]> => {
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      const parsed = JSON.parse(stored);
      for (const company in parsed) {
        parsed[company] = parsed[company].map((conv: Conversation) => ({
          ...conv,
          createdAt: new Date(conv.createdAt),
          updatedAt: new Date(conv.updatedAt),
          messages: conv.messages.map((msg: Message) => ({
            ...msg,
            timestamp: new Date(msg.timestamp),
          })),
        }));
      }
      return parsed;
    }
  } catch (e) {
    console.warn("Failed to load chat history:", e);
  }
  return {};
};

const saveConversationsToStorage = (conversations: Record<string, Conversation[]>, storageKey: string) => {
  try {
    localStorage.setItem(storageKey, JSON.stringify(conversations));
  } catch (e) {
    console.warn("Failed to save chat history:", e);
  }
};

export default function ChatBot({
  players,
  landscape,
  mapSelection,
  onMapAction,
  pendingContext,
  onPendingContextHandled,
  highlightChat,
  onExploreSummary,
  pendingSuggestions = [],
  onAddSuggestion,
  onDismissSuggestions,
  mode = "internal",
}: ChatBotProps) {
  // ============ STATE ============
  const [isOpen, setIsOpen] = useState(mode === "client");
  const [isMinimized, setIsMinimized] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Position & dragging
  const [position, setPosition] = useState<{ x: number; y: number }>({ x: -1, y: -1 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Resizing
  const [panelSize, setPanelSize] = useState<{ w: number; h: number }>({ w: DEFAULT_WIDTH, h: DEFAULT_HEIGHT });
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartRef = useRef<{ mouseX: number; mouseY: number; w: number; h: number } | null>(null);

  // Messages & streaming
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");

  // Company & conversations
  const [selectedCompany, setSelectedCompany] = useState<string>(players[0]?.name || "The Boeing Company");
  const storageKey = mode === "client" ? STORAGE_KEY_CLIENT : STORAGE_KEY_INTERNAL;
  const [conversations, setConversations] = useState<Record<string, Conversation[]>>(() => loadConversationsFromStorage(storageKey));
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);

  // Current map selection ref (always up to date for sending with messages)
  const mapSelectionRef = useRef(mapSelection);
  useEffect(() => { mapSelectionRef.current = mapSelection; }, [mapSelection]);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-trigger action ref (for explore summarize)
  const pendingAutoActionRef = useRef<string | null>(null);

  // Quick action context from "Ask AI" buttons
  const [quickContext, setQuickContext] = useState<{
    text: string;
    section: string;
    areaData: { label: string; patents: number; clusters: number; keywords?: string; summary?: string };
  } | null>(null);

  // Quick actions per section
  const QUICK_ACTIONS_AREA = [
    { id: "rewrite", label: "Rewrite", icon: RotateCcw },
    { id: "explain", label: "Explain", icon: Lightbulb },
    { id: "trending", label: "Trending", icon: BarChart3 },
  ];
  const QUICK_ACTIONS_CURRENTS = [
    { id: "explain", label: "Explain", icon: Lightbulb },
    { id: "whos-here", label: "Who's here?", icon: Search },
  ];
  const QUICK_ACTIONS_EXPLORE = [
    { id: "summarize", label: "Summarize", icon: Sparkles },
    { id: "explain", label: "Explain", icon: Lightbulb },
  ];

  // ============ CLIENT MODE: PROACTIVE MESSAGES ============
  const welcomeSentRef = useRef(false);
  const lastProactiveZoneRef = useRef<number | null>(null);

  // Welcome message on mount (client mode)
  useEffect(() => {
    if (mode !== "client" || welcomeSentRef.current || !landscape.zones?.length) return;
    welcomeSentRef.current = true;

    const zoneList = landscape.zones
      .sort((a, b) => b.patentCount - a.patentCount)
      .map((z) => `- **${z.label}** — ${z.patentCount.toLocaleString()} patents, ${z.clusterCount} clusters`)
      .join("\n");

    const welcomeMsg: Message = {
      id: `welcome-${Date.now()}`,
      role: "assistant",
      content: `Welcome! I've analyzed your patent landscape — **${landscape.totalPatents.toLocaleString()} patents** organized into **${landscape.zones.length} territory zones**.\n\nHere's what I found:\n\n${zoneList}\n\nClick on any zone to explore it, or ask me to reorganize — for example, *"I want 5 zones instead"*.`,
      timestamp: new Date(),
    };
    setMessages([welcomeMsg]);
  }, [mode, landscape]);

  // Proactive message when zone is clicked (client mode)
  useEffect(() => {
    if (mode !== "client" || !mapSelection?.activeZone) return;
    const zone = mapSelection.activeZone;
    if (lastProactiveZoneRef.current === zone.id) return;
    lastProactiveZoneRef.current = zone.id;

    const proactiveMsg: Message = {
      id: `zone-intro-${zone.id}-${Date.now()}`,
      role: "assistant",
      content: `You're looking at **${zone.label}** — ${zone.patentCount.toLocaleString()} patents across ${zone.clusterCount} clusters.\n\n${zone.summary || ""}\n\nAsk me anything about this zone! For example:\n- *"Who are the top players here?"*\n- *"What's trending?"*\n- *"How does this compare to other zones?"*`,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, proactiveMsg]);
  }, [mode, mapSelection?.activeZone?.id]);

  // ============ HANDLE PENDING CONTEXT (from AI buttons) ============
  useEffect(() => {
    if (pendingContext) {
      setIsOpen(true);
      setIsMinimized(false);

      if (pendingContext.section === "keyAreas" || pendingContext.section === "hotAreas" || pendingContext.section === "currents" || pendingContext.section === "explore") {
        // Prefill input + show quick actions (don't send yet)
        setInputValue(pendingContext.text);
        const qc = pendingContext.areaData ? {
          text: pendingContext.text,
          section: pendingContext.section,
          areaData: pendingContext.areaData,
        } : null;
        setQuickContext(qc);

        // For explore: auto-trigger "summarize" action
        if (pendingContext.section === "explore" && qc) {
          pendingAutoActionRef.current = "summarize";
        }
      } else {
        // Other sections: old behavior — add as context message
        const contextMsg: Message = {
          id: `ctx-${Date.now()}`,
          role: "user",
          content: pendingContext.text,
          timestamp: new Date(),
          isContext: true,
        };
        setMessages((prev) => [...prev, contextMsg]);

        if (!currentConversationId) {
          const newConv: Conversation = {
            id: `conv-${Date.now()}`,
            title: pendingContext.text.slice(0, 30) + "...",
            messages: [],
            company: selectedCompany,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          setConversations((prev) => ({
            ...prev,
            [selectedCompany]: [newConv, ...(prev[selectedCompany] || [])],
          }));
          setCurrentConversationId(newConv.id);
        }
      }

      onPendingContextHandled?.();
    }
  }, [pendingContext]);

  // ============ INITIALIZE POSITION ============
  // Don't eagerly compute — use CSS right/bottom anchoring (position stays -1,-1 until dragged)

  // ============ DRAG HANDLERS ============
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if (!panelRef.current || !containerRef.current?.parentElement || isFullscreen) return;
    e.preventDefault();
    const rect = panelRef.current.getBoundingClientRect();
    // If first drag, switch from CSS anchoring to absolute positioning
    if (position.x < 0) {
      const parent = containerRef.current.parentElement;
      const parentRect = parent.getBoundingClientRect();
      setPosition({
        x: rect.left - parentRect.left,
        y: rect.top - parentRect.top,
      });
    }
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
    setIsDragging(true);
  }, [isFullscreen, position.x]);

  const handleDrag = useCallback((e: MouseEvent) => {
    if (!isDragging || !containerRef.current?.parentElement) return;
    const parent = containerRef.current.parentElement;
    const parentRect = parent.getBoundingClientRect();

    let newX = e.clientX - parentRect.left - dragOffset.x;
    let newY = e.clientY - parentRect.top - dragOffset.y;

    newX = Math.max(0, Math.min(newX, parentRect.width - panelSize.w));
    newY = Math.max(0, Math.min(newY, parentRect.height - panelSize.h));

    setPosition({ x: newX, y: newY });
  }, [isDragging, dragOffset, panelSize]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener("mousemove", handleDrag);
      window.addEventListener("mouseup", handleDragEnd);
    }
    return () => {
      window.removeEventListener("mousemove", handleDrag);
      window.removeEventListener("mouseup", handleDragEnd);
    };
  }, [isDragging, handleDrag, handleDragEnd]);

  // ============ RESIZE HANDLERS ============
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // If panel is still CSS-anchored, convert to absolute first
    if (position.x < 0 && panelRef.current && containerRef.current?.parentElement) {
      const rect = panelRef.current.getBoundingClientRect();
      const parentRect = containerRef.current.parentElement.getBoundingClientRect();
      setPosition({ x: rect.left - parentRect.left, y: rect.top - parentRect.top });
    }
    resizeStartRef.current = { mouseX: e.clientX, mouseY: e.clientY, w: panelSize.w, h: panelSize.h };
    setIsResizing(true);
  }, [position.x, panelSize]);

  const handleResize = useCallback((e: MouseEvent) => {
    if (!isResizing || !resizeStartRef.current) return;
    const { mouseX, mouseY, w, h } = resizeStartRef.current;
    const newW = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, w + (e.clientX - mouseX)));
    const newH = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, h + (e.clientY - mouseY)));
    setPanelSize({ w: newW, h: newH });
  }, [isResizing]);

  const handleResizeEnd = useCallback(() => {
    setIsResizing(false);
    resizeStartRef.current = null;
  }, []);

  useEffect(() => {
    if (isResizing) {
      window.addEventListener("mousemove", handleResize);
      window.addEventListener("mouseup", handleResizeEnd);
    }
    return () => {
      window.removeEventListener("mousemove", handleResize);
      window.removeEventListener("mouseup", handleResizeEnd);
    };
  }, [isResizing, handleResize, handleResizeEnd]);

  // ============ AUTO-SCROLL ============
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  // ============ SAVE TO LOCALSTORAGE ============
  useEffect(() => {
    saveConversationsToStorage(conversations, storageKey);
  }, [conversations, storageKey]);

  // ============ CONVERSATION HELPERS ============
  const getCompanyConversations = useCallback(() => {
    return conversations[selectedCompany] || [];
  }, [conversations, selectedCompany]);

  const createNewConversation = useCallback(() => {
    const newConv: Conversation = {
      id: `conv-${Date.now()}`,
      title: "New Chat",
      messages: [],
      company: selectedCompany,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    setConversations((prev) => ({
      ...prev,
      [selectedCompany]: [newConv, ...(prev[selectedCompany] || [])],
    }));
    setCurrentConversationId(newConv.id);
    setMessages([]);
    setShowHistory(false);
    return newConv.id;
  }, [selectedCompany]);

  const loadConversation = useCallback((conv: Conversation) => {
    setCurrentConversationId(conv.id);
    setMessages(conv.messages);
    setShowHistory(false);
  }, []);

  const startNewChat = useCallback(() => {
    setMessages([]);
    setCurrentConversationId(null);
    setStreamingContent("");
  }, []);

  const updateCurrentConversation = useCallback((newMessages: Message[]) => {
    if (!currentConversationId) return;

    setConversations((prev) => {
      const companyConvs = prev[selectedCompany] || [];
      return {
        ...prev,
        [selectedCompany]: companyConvs.map((conv) => {
          if (conv.id === currentConversationId) {
            let title = conv.title;
            if (title === "New Chat" && newMessages.length > 0) {
              const firstUserMsg = newMessages.find((m) => m.role === "user");
              if (firstUserMsg) {
                title = firstUserMsg.content.slice(0, 30) + (firstUserMsg.content.length > 30 ? "..." : "");
              }
            }
            return { ...conv, messages: newMessages, title, updatedAt: new Date() };
          }
          return conv;
        }),
      };
    });
  }, [currentConversationId, selectedCompany]);

  useEffect(() => {
    if (messages.length > 0 && currentConversationId) {
      updateCurrentConversation(messages);
    }
  }, [messages, currentConversationId, updateCurrentConversation]);

  // ============ COMPANY CHANGE ============
  const handleCompanyChange = useCallback((company: string) => {
    setSelectedCompany(company);
    setMessages([]);
    setCurrentConversationId(null);
    setShowHistory(false);
  }, []);

  // ============ BUILD HISTORY FOR API ============
  const buildHistoryForAPI = useCallback((): HistoryMessage[] => {
    return messages
      .filter((m) => !m.isContext) // skip context markers from history sent to API
      .map((m) => ({ role: m.role, content: m.content }));
  }, [messages]);

  // ============ STREAMING HANDLER ============
  const handleStreamingMessage = useCallback(async (
    userContent: string,
    action?: ChatAction,
    displayContent?: string, // Short text shown in chat bubble (hides full prompt)
    onComplete?: (responseText: string) => void,
  ) => {
    // Clear any pending hot area suggestions when user sends a new message
    onDismissSuggestions?.();

    let convId = currentConversationId;
    if (!convId) {
      convId = createNewConversation();
    }

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: displayContent || userContent,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);
    setStreamingContent("");

    const history = buildHistoryForAPI();

    streamChatMessage(
      {
        message: userContent,
        company: selectedCompany,
        action,
        history,
        landscape,
        mapSelection: mapSelectionRef.current || undefined,
        mode,
      },
      (chunk) => {
        setStreamingContent((prev) => prev + chunk);
      },
      () => {
        setStreamingContent((prev) => {
          // Parse map actions from response
          const { cleanText, actions } = parseMapActions(prev);
          if (actions.length > 0 && onMapAction) {
            actions.forEach((a) => onMapAction(a));
          }
          const assistantMessage: Message = {
            id: `assistant-${Date.now()}`,
            role: "assistant",
            content: cleanText,
            timestamp: new Date(),
          };
          setMessages((msgs) => [...msgs, assistantMessage]);
          onComplete?.(cleanText);
          return "";
        });
        setIsLoading(false);
      },
      (error) => {
        const errorMessage: Message = {
          id: `error-${Date.now()}`,
          role: "assistant",
          content: `Error: ${error}. Make sure the backend server is running.`,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, errorMessage]);
        setIsLoading(false);
        setStreamingContent("");
      }
    );
  }, [currentConversationId, createNewConversation, selectedCompany, buildHistoryForAPI, landscape, onMapAction]);

  // ============ SEND MESSAGE ============
  const handleSendMessage = useCallback(() => {
    if (!inputValue.trim() || isLoading) return;
    handleStreamingMessage(inputValue.trim());
    setInputValue("");
    setQuickContext(null);
  }, [inputValue, isLoading, handleStreamingMessage]);

  // ============ QUICK ACTION ============
  const handleQuickAction = useCallback((actionId: string) => {
    if (!quickContext || isLoading) return;
    const { areaData, section } = quickContext;

    let prompt = "";
    let onComplete: ((text: string) => void) | undefined;

    if (section === "explore") {
      // Explore area actions
      const context = `Selected area: ${areaData.patents} patents, ${areaData.clusters} clusters\nTop keywords: ${areaData.keywords || "N/A"}`;
      if (actionId === "summarize") {
        prompt = `${context}\n\nFirst line MUST be: NAME: <short area name, 2-5 words, like "Power Management Systems" or "Battery Thermal Control">\nThen write a concise summary (2-3 sentences) describing what this technology area covers. Focus on the key themes based on the keywords and patent concentration. Be specific about the technologies, not generic.`;
        onComplete = (text: string) => {
          // Parse "NAME: <name>" from first line
          const lines = text.split("\n");
          const firstLine = lines[0]?.trim() || "";
          const nameMatch = firstLine.match(/^NAME:\s*(.+)/i);
          const name = nameMatch ? nameMatch[1].replace(/\*\*/g, "").trim() : "Selected Area";
          const summary = nameMatch ? lines.slice(1).join("\n").trim() : text;
          onExploreSummary?.(name, summary);
        };
      } else if (actionId === "explain") {
        prompt = `${context}\n\nExplain what this technology area is about in plain language. What technologies are involved, why do they cluster together, and what is the significance?`;
      }
    } else if (section === "currents") {
      // Convergence region actions
      const context = `Convergence region: "${areaData.label}" (${areaData.patents} patents, ${areaData.clusters} clusters)\nZones involved: ${areaData.keywords || "N/A"}\nDescription: ${areaData.summary || "N/A"}`;
      if (actionId === "explain") {
        prompt = `${context}\n\nExplain this convergence in plain language. Why are these technology zones producing similar patents? What does this mean practically for companies and researchers?`;
      } else if (actionId === "whos-here") {
        prompt = `${context}\n\nBased on the player data you have, which companies are most likely active in this convergence zone? Look at players whose top areas overlap with the zones involved (${areaData.keywords}). List the key players and explain their positioning.`;
      }
    } else {
      // Territory Zone / Hot Map actions
      const sectionLabel = section === "keyAreas" ? "Territory Zone" : "Hot Map";
      const context = `${sectionLabel}: "${areaData.label}" (${areaData.patents} patents, ${areaData.clusters} clusters)`;
      if (actionId === "rewrite") {
        prompt = `${context}\n\nCurrent title: "${areaData.label}"\nCurrent description: "${areaData.summary || "N/A"}"\nCurrent keywords: ${areaData.keywords || "N/A"}\n\nPlease suggest alternative versions of the title, description, and keywords for this area. Provide 2-3 options for each.`;
      } else if (actionId === "explain") {
        prompt = `${context}\nKeywords: ${areaData.keywords || "N/A"}\nDescription: ${areaData.summary || "N/A"}\n\nExplain what this technology area is about in plain language. What technologies are involved, why do they cluster together, and what is the significance of this area?`;
      } else if (actionId === "trending") {
        prompt = `${context}\nKeywords: ${areaData.keywords || "N/A"}\n\nAnalyze the growth trends in this area. Is this technology area growing or declining? What might be driving the trend? What should stakeholders pay attention to?`;
      }
    }

    const allActions = [...QUICK_ACTIONS_AREA, ...QUICK_ACTIONS_CURRENTS, ...QUICK_ACTIONS_EXPLORE];
    const actionLabel = allActions.find((a) => a.id === actionId)?.label || actionId;
    const displayMsg = `${actionLabel}: ${areaData.label || "selected area"}`;
    handleStreamingMessage(prompt, undefined, displayMsg, onComplete);
    setInputValue("");
    setQuickContext(null);
  }, [quickContext, isLoading, handleStreamingMessage, onExploreSummary]);

  // Auto-trigger pending action (e.g., explore "summarize")
  useEffect(() => {
    if (pendingAutoActionRef.current && quickContext && !isLoading) {
      const actionId = pendingAutoActionRef.current;
      pendingAutoActionRef.current = null;
      setTimeout(() => handleQuickAction(actionId), 50);
    }
  }, [quickContext, isLoading, handleQuickAction]);

  // ============ COMPARE PLAYERS SELECTION ============
  const [compareMode, setCompareMode] = useState(false);
  const [compareSelected, setCompareSelected] = useState<Set<string>>(new Set());
  const [showAllPlayers, setShowAllPlayers] = useState(false);

  // Competitive position: company selection mode
  const [competitiveMode, setCompetitiveMode] = useState(false);

  const handleCompareSubmit = useCallback(() => {
    if (compareSelected.size === 0 || isLoading) return;
    const names = [...compareSelected];
    const displayMsg = `Compare: ${names.join(", ")}`;
    const prompt = `Compare these specific players: ${names.join(", ")}`;
    handleStreamingMessage(prompt, "compare-players", displayMsg);
    setCompareMode(false);
    setCompareSelected(new Set());
    setShowAllPlayers(false);
  }, [compareSelected, isLoading, handleStreamingMessage]);

  const handleCompetitiveSubmit = useCallback(() => {
    if (isLoading) return;
    const displayMsg = `Competitive Position: ${selectedCompany}`;
    const prompt = `Analyze competitive position for ${selectedCompany}`;
    handleStreamingMessage(prompt, "competitive-position", displayMsg);
    setCompetitiveMode(false);
  }, [isLoading, selectedCompany, handleStreamingMessage]);

  // ============ ACTION BUTTON ============
  const handleActionButton = useCallback((actionId: ChatAction) => {
    if (isLoading) return;
    if (actionId === "compare-players") {
      setCompareMode(true);
      setCompetitiveMode(false);
      const top4 = players.slice(0, 4).map((p) => p.name);
      setCompareSelected(new Set(top4));
      return;
    }
    if (actionId === "competitive-position") {
      setCompetitiveMode(true);
      setCompareMode(false);
      return;
    }
    const actionConfig = ACTION_BUTTONS.find((a) => a.id === actionId);
    const message = actionConfig ? actionConfig.label : actionId;
    handleStreamingMessage(message, actionId);
  }, [isLoading, handleStreamingMessage, players]);

  // ============ KEY HANDLER ============
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // ============ RENDER: CLOSED / MINIMIZED ============
  if (!isOpen || isMinimized) {
    return (
      <div
        ref={containerRef}
        className="absolute z-50 bottom-5 right-5"
        data-html2canvas-ignore="true"
      >
        <button
          onClick={() => { setIsOpen(true); setIsMinimized(false); }}
          className={`w-12 h-12 bg-white hover:bg-gray-50 text-gray-700 rounded-full shadow-lg border flex items-center justify-center transition-all hover:shadow-xl ${
            highlightChat ? "border-teal-400 ring-2 ring-teal-300 ring-opacity-60" : "border-gray-200"
          }`}
        >
          <MessageSquare className="w-5 h-5" />
        </button>
      </div>
    );
  }

  // ============ PANEL STYLES ============
  const panelClasses = isFullscreen
    ? "fixed inset-4 z-50"
    : "absolute z-50";

  const panelStyle = isFullscreen
    ? {}
    : {
        width: panelSize.w,
        height: panelSize.h,
        maxHeight: 'calc(100% - 20px)',
        left: position.x >= 0 ? position.x : undefined,
        top: position.y >= 0 ? position.y : undefined,
        right: position.x < 0 ? 20 : undefined,
        bottom: position.y < 0 ? 20 : undefined,
      };

  // ============ RENDER: HISTORY VIEW ============
  const renderHistoryView = () => {
    const companyConvs = getCompanyConversations();

    return (
      <div className="flex flex-col h-full">
        <div
          className={`flex items-center gap-3 px-4 py-3 border-b ${!isFullscreen ? "cursor-move" : ""}`}
          onMouseDown={handleDragStart}
        >
          <button
            onClick={() => setShowHistory(false)}
            className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <span className="font-medium text-gray-800">Chat History</span>
        </div>

        <div className="flex-1 overflow-y-auto">
          {companyConvs.length === 0 ? (
            <div className="p-4 text-center text-gray-500 text-sm">
              No chat history yet
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {companyConvs.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => loadConversation(conv)}
                  className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                    conv.id === currentConversationId
                      ? "bg-teal-50 text-teal-700"
                      : "hover:bg-gray-50 text-gray-700"
                  }`}
                >
                  <p className="text-sm font-medium truncate">{conv.title}</p>
                  <p className="text-xs text-gray-400">
                    {conv.updatedAt.toLocaleDateString()}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  // ============ RENDER: MAIN CHAT VIEW ============
  const renderChatView = () => (
    <div className="flex flex-col h-full">
      {/* Header - Draggable */}
      <div
        className={`flex items-center justify-between px-4 py-3 border-b ${!isFullscreen ? "cursor-move" : ""}`}
        onMouseDown={handleDragStart}
      >
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-teal-600" />
          <span className="font-medium text-gray-800">VALUENEX AI</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowHistory(true)}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
            title="Chat history"
          >
            <History className="w-4 h-4 text-gray-600" />
          </button>
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
            title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? (
              <Minimize2 className="w-4 h-4 text-gray-600" />
            ) : (
              <Maximize2 className="w-4 h-4 text-gray-600" />
            )}
          </button>
          <button
            onClick={() => setIsMinimized(true)}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
            title="Minimize"
          >
            <Minus className="w-4 h-4 text-gray-600" />
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
            title="Close"
          >
            <X className="w-4 h-4 text-gray-600" />
          </button>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="px-3 py-2 border-b">
        <div className="grid grid-cols-2 gap-2">
          {ACTION_BUTTONS.map((btn) => {
            const Icon = btn.icon;
            return (
              <button
                key={btn.id}
                onClick={() => handleActionButton(btn.id)}
                disabled={isLoading}
                className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 bg-gray-50 hover:bg-teal-50 hover:text-teal-700 rounded-lg border border-gray-200 hover:border-teal-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span className="font-medium truncate">{btn.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && !streamingContent ? (
          <div className="text-center py-8">
            <MessageSquare className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">
              {mode === "client"
                ? "I'm ready to help you explore this patent landscape."
                : <><span className="text-gray-700 font-medium">{landscape.totalPatents.toLocaleString()} patents</span> across <span className="text-gray-700 font-medium">{landscape.zones?.length ?? 0} sectors</span>. Try different sections in the sidebar — each gives me different context to help you analyze.</>
              }
            </p>
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <ChatMessage key={msg.id} message={msg} />
            ))}

            {streamingContent && (
              <ChatMessage
                message={{
                  id: "streaming",
                  role: "assistant",
                  content: streamingContent,
                  timestamp: new Date(),
                }}
              />
            )}

            {isLoading && !streamingContent && (
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center">
                  <Loader2 className="w-4 h-4 text-gray-600 animate-spin" />
                </div>
                <span className="text-sm text-gray-500">Thinking...</span>
              </div>
            )}

            {/* AI-suggested hot areas — "Add to map" buttons */}
            {pendingSuggestions.length > 0 && (
              <div className="ml-10 space-y-2 mb-2">
                {pendingSuggestions.map((suggestion, i) => {
                  // Estimate patent count from landscape cluster data
                  const patentCount = landscape.clusters
                    ? suggestion.clusterIds.reduce((sum, cid) => {
                        const cl = landscape.clusters!.find((c) => c.id === cid);
                        return sum + (cl?.count ?? 0);
                      }, 0)
                    : 0;
                  return (
                  <div key={i} className="flex items-center gap-2 p-2 rounded-lg border border-amber-200 bg-amber-50/50">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-gray-800">{suggestion.name}</div>
                      <div className="text-[10px] text-gray-500">
                        {suggestion.clusterIds.length} clusters{patentCount > 0 ? ` · ${patentCount.toLocaleString()} patents` : ""}
                      </div>
                    </div>
                    <button
                      onClick={() => onAddSuggestion?.(suggestion)}
                      className="px-2.5 py-1 text-[11px] font-medium rounded-md bg-amber-500 text-white hover:bg-amber-600 transition-colors flex-shrink-0"
                    >
                      Add to map
                    </button>
                  </div>
                  );
                })}
                <button
                  onClick={() => onDismissSuggestions?.()}
                  className="text-[10px] text-gray-400 hover:text-gray-600 transition-colors"
                >
                  Dismiss
                </button>
              </div>
            )}

            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input Area */}
      <div className="p-3 border-t">
        {/* Quick action chips — context-dependent */}
        {quickContext && !compareMode && (
          <div className="flex items-center gap-1.5 mb-2 flex-wrap">
            {(quickContext.section === "explore" ? QUICK_ACTIONS_EXPLORE : quickContext.section === "currents" ? QUICK_ACTIONS_CURRENTS : QUICK_ACTIONS_AREA).map((action) => (
              <button
                key={action.id}
                onClick={() => handleQuickAction(action.id)}
                disabled={isLoading}
                className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-full border border-gray-200 bg-white text-gray-600 hover:bg-teal-50 hover:border-teal-300 hover:text-teal-700 transition-colors disabled:opacity-50"
              >
                <action.icon size={11} />
                {action.label}
              </button>
            ))}
          </div>
        )}

        {/* Compare Players selection mode */}
        {competitiveMode && (
          <div className="mb-2">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-medium text-gray-500">Select company to analyze:</span>
              <button
                onClick={() => setCompetitiveMode(false)}
                className="text-[10px] text-gray-400 hover:text-gray-600"
              >
                Cancel
              </button>
            </div>
            <select
              value={selectedCompany}
              onChange={(e) => handleCompanyChange(e.target.value)}
              className="w-full text-sm font-medium bg-white border rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500 mb-2"
            >
              {players.slice(0, 20).map((player) => (
                <option key={player.name} value={player.name}>
                  {player.name} ({player.totalPatents} patents)
                </option>
              ))}
            </select>
            <button
              onClick={handleCompetitiveSubmit}
              disabled={isLoading}
              className="w-full py-1.5 text-[11px] font-medium rounded-full bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Analyze {selectedCompany.length > 25 ? selectedCompany.slice(0, 25) + "..." : selectedCompany}
            </button>
          </div>
        )}

        {compareMode && (
          <div className="mb-2">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-medium text-gray-500">Select players to compare:</span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setShowAllPlayers((v) => !v)}
                  className="text-[10px] text-teal-600 hover:text-teal-700"
                >
                  {showAllPlayers ? "Show less" : `Show all ${players.length}`}
                </button>
                <button
                  onClick={() => { setCompareMode(false); setCompareSelected(new Set()); }}
                  className="text-[10px] text-gray-400 hover:text-gray-600"
                >
                  Cancel
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-1 mb-2">
              {(showAllPlayers ? players : players.slice(0, 8)).map((p) => {
                const isSelected = compareSelected.has(p.name);
                return (
                  <button
                    key={p.name}
                    onClick={() => setCompareSelected((prev) => {
                      const next = new Set(prev);
                      if (next.has(p.name)) next.delete(p.name); else next.add(p.name);
                      return next;
                    })}
                    className={`px-2 py-0.5 text-[10px] rounded-full border transition-colors ${
                      isSelected
                        ? "bg-teal-50 border-teal-400 text-teal-700 font-medium"
                        : "bg-white border-gray-200 text-gray-500 hover:border-gray-300"
                    }`}
                  >
                    {p.name.length > 20 ? p.name.slice(0, 20) + "..." : p.name} ({p.totalPatents})
                  </button>
                );
              })}
            </div>
            <button
              onClick={handleCompareSubmit}
              disabled={compareSelected.size < 2 || isLoading}
              className="w-full py-1.5 text-[11px] font-medium rounded-full bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Compare {compareSelected.size} players
            </button>
          </div>
        )}

        {!compareMode && !competitiveMode && (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => { setInputValue(e.target.value); if (!e.target.value.trim()) setQuickContext(null); }}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything..."
            className="flex-1 px-4 py-2 text-sm border rounded-full focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            disabled={isLoading}
          />
          <button
            onClick={handleSendMessage}
            disabled={!inputValue.trim() || isLoading}
            className="p-2 bg-gray-900 text-white rounded-full hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        )}
      </div>
    </div>
  );

  // ============ RENDER: OPEN STATE ============
  return (
    <div
      ref={containerRef}
      className={panelClasses}
      style={panelStyle}
      data-html2canvas-ignore="true"
    >
      <div
        ref={panelRef}
        className={`bg-white rounded-2xl shadow-2xl border flex flex-col overflow-hidden h-full relative ${
          highlightChat ? "border-teal-400 ring-2 ring-teal-300 ring-opacity-60" : "border-gray-200"
        }`}
      >
        {showHistory ? renderHistoryView() : renderChatView()}

        {/* Resize handle — bottom-right corner */}
        {!isFullscreen && (
          <div
            onMouseDown={handleResizeStart}
            className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize z-10"
            style={{ touchAction: "none" }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" className="text-gray-300 hover:text-gray-500 transition-colors">
              <path d="M14 14L8 14M14 14L14 8M14 14L6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
            </svg>
          </div>
        )}
      </div>
    </div>
  );
}
