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
  streamActionRequest,
  ChatAction,
  HistoryMessage,
} from "../../../scripts/chatUtils";

// ============ TYPES ============
export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  isStructured?: boolean;
}

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  company: string;
  createdAt: Date;
  updatedAt: Date;
}

interface ChatBotProps {
  patents: Array<{
    x: number;
    y: number;
    area_id: number;
    topic_id: number;
    title: string;
    year?: number;
  }>;
  areas: Record<string, {
    id: number;
    label: string;
    count: number;
    trend?: number;
    category?: string;
    topic_id: number;
  }>;
  players: Array<{
    name: string;
    totalPatents: number;
    trend: number;
    yearlyData: Array<{ year: number; count: number }>;
  }>;
  areasByCategory: Record<string, Array<{
    id: number;
    label: string;
    count: number;
    trend?: number;
  }>>;
}

// Action buttons
const ACTION_BUTTONS: {
  id: ChatAction;
  label: string;
  icon: typeof BarChart3;
}[] = [
  { id: "competitive-position", label: "Competitive Position", icon: BarChart3 },
  { id: "key-takeaways", label: "Key Takeaways", icon: Lightbulb },
  { id: "white-space", label: "White Space", icon: Search },
  { id: "competitor-threats", label: "Competitor Threats", icon: AlertTriangle },
];

// Panel dimensions
const PANEL_WIDTH = 440;
const PANEL_HEIGHT = 600;

// localStorage key
const STORAGE_KEY = "patent-chat-conversations";

// Load conversations from localStorage
const loadConversationsFromStorage = (): Record<string, Conversation[]> => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Convert date strings back to Date objects
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

// Save conversations to localStorage
const saveConversationsToStorage = (conversations: Record<string, Conversation[]>) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
  } catch (e) {
    console.warn("Failed to save chat history:", e);
  }
};

export default function ChatBot({
  patents,
  players,
}: ChatBotProps) {
  // ============ STATE ============
  const [isOpen, setIsOpen] = useState(true);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  
  // Position & dragging
  const [position, setPosition] = useState<{ x: number; y: number }>({ x: -1, y: -1 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  
  // Messages & streaming
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  
  // Company & conversations
  const [selectedCompany, setSelectedCompany] = useState<string>("The Boeing Company");
  const [conversations, setConversations] = useState<Record<string, Conversation[]>>(() => loadConversationsFromStorage());
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // ============ INITIALIZE POSITION ============
  useEffect(() => {
    if (position.x === -1 && containerRef.current?.parentElement) {
      const parent = containerRef.current.parentElement;
      const parentRect = parent.getBoundingClientRect();
      setPosition({
        x: parentRect.width - PANEL_WIDTH - 20,
        y: parentRect.height - PANEL_HEIGHT - 20,
      });
    }
  }, [position.x]);

  // ============ DRAG HANDLERS ============
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if (!panelRef.current || isFullscreen) return;
    e.preventDefault();
    const rect = panelRef.current.getBoundingClientRect();
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
    setIsDragging(true);
  }, [isFullscreen]);

  const handleDrag = useCallback((e: MouseEvent) => {
    if (!isDragging || !containerRef.current?.parentElement) return;
    const parent = containerRef.current.parentElement;
    const parentRect = parent.getBoundingClientRect();
    
    let newX = e.clientX - parentRect.left - dragOffset.x;
    let newY = e.clientY - parentRect.top - dragOffset.y;
    
    // Constrain to parent
    newX = Math.max(0, Math.min(newX, parentRect.width - PANEL_WIDTH));
    newY = Math.max(0, Math.min(newY, parentRect.height - PANEL_HEIGHT));
    
    setPosition({ x: newX, y: newY });
  }, [isDragging, dragOffset]);

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

  // ============ AUTO-SCROLL ============
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  // ============ SAVE TO LOCALSTORAGE ============
  useEffect(() => {
    saveConversationsToStorage(conversations);
  }, [conversations]);

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
    
    setConversations(prev => ({
      ...prev,
      [selectedCompany]: [newConv, ...(prev[selectedCompany] || [])],
    }));
    setCurrentConversationId(newConv.id);
    setMessages([]);
    setShowHistory(false);
  }, [selectedCompany]);

  const loadConversation = useCallback((conv: Conversation) => {
    setCurrentConversationId(conv.id);
    setMessages(conv.messages);
    setShowHistory(false);
  }, []);

  // Start a new chat (clear current, keep history)
  const startNewChat = useCallback(() => {
    setMessages([]);
    setCurrentConversationId(null);
    setStreamingContent("");
  }, []);

  const updateCurrentConversation = useCallback((newMessages: Message[]) => {
    if (!currentConversationId) return;
    
    setConversations(prev => {
      const companyConvs = prev[selectedCompany] || [];
      return {
        ...prev,
        [selectedCompany]: companyConvs.map(conv => {
          if (conv.id === currentConversationId) {
            // Update title from first user message if still "New Chat"
            let title = conv.title;
            if (title === "New Chat" && newMessages.length > 0) {
              const firstUserMsg = newMessages.find(m => m.role === "user");
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

  // Save messages to conversation when they change
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
    return messages.map(m => ({
      role: m.role,
      content: m.content,
    }));
  }, [messages]);

  // ============ STREAMING HANDLER ============
  const handleStreamingMessage = useCallback(async (
    userContent: string,
    action?: ChatAction
  ) => {
    // Ensure we have a conversation
    if (!currentConversationId) {
      createNewConversation();
    }

    // Add user message
    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: userContent,
      timestamp: new Date(),
    };
    
    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);
    setStreamingContent("");

    const history = buildHistoryForAPI();

    // Stream the response
    streamChatMessage(
      {
        message: userContent,
        company: selectedCompany,
        action,
        history,
      },
      // onChunk
      (chunk) => {
        setStreamingContent(prev => prev + chunk);
      },
      // onDone
      () => {
        setStreamingContent(prev => {
          // Create assistant message from accumulated content
          const assistantMessage: Message = {
            id: `assistant-${Date.now()}`,
            role: "assistant",
            content: prev,
            timestamp: new Date(),
          };
          setMessages(msgs => [...msgs, assistantMessage]);
          return "";
        });
        setIsLoading(false);
      },
      // onError
      (error) => {
        const errorMessage: Message = {
          id: `error-${Date.now()}`,
          role: "assistant",
          content: `Error: ${error}. Make sure the backend server is running on http://localhost:8001`,
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, errorMessage]);
        setIsLoading(false);
        setStreamingContent("");
      }
    );
  }, [currentConversationId, createNewConversation, selectedCompany, buildHistoryForAPI]);

  // ============ SEND MESSAGE ============
  const handleSendMessage = useCallback(() => {
    if (!inputValue.trim() || isLoading) return;
    handleStreamingMessage(inputValue.trim());
    setInputValue("");
  }, [inputValue, isLoading, handleStreamingMessage]);

  // ============ ACTION BUTTON ============
  const handleActionButton = useCallback((actionId: ChatAction) => {
    if (isLoading) return;
    const actionConfig = ACTION_BUTTONS.find(a => a.id === actionId);
    const message = actionConfig ? actionConfig.label : actionId;
    handleStreamingMessage(message, actionId);
  }, [isLoading, handleStreamingMessage]);

  // ============ KEY HANDLER ============
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // ============ RENDER: CLOSED STATE ============
  if (!isOpen) {
    return (
      <div
        ref={containerRef}
        className="absolute z-50 bottom-5 right-5"
        data-html2canvas-ignore="true"
      >
        <button
          onClick={() => setIsOpen(true)}
          className="w-12 h-12 bg-white hover:bg-gray-50 text-gray-700 rounded-full shadow-lg border border-gray-200 flex items-center justify-center transition-all hover:shadow-xl"
        >
          <MessageSquare className="w-5 h-5" />
        </button>
      </div>
    );
  }

  // ============ RENDER: MINIMIZED STATE ============
  if (isMinimized) {
    return (
      <div
        ref={containerRef}
        className="absolute z-50 bottom-5 right-5"
        data-html2canvas-ignore="true"
      >
        <button
          onClick={() => setIsMinimized(false)}
          className="w-12 h-12 bg-white hover:bg-gray-50 text-gray-700 rounded-full shadow-lg border border-gray-200 flex items-center justify-center transition-all hover:shadow-xl"
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
        width: PANEL_WIDTH, 
        height: PANEL_HEIGHT,
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
        {/* History Header - Draggable */}
        <div 
          className={`flex items-center gap-3 px-4 py-3 border-b ${!isFullscreen ? 'cursor-move' : ''}`}
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

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto">
          {companyConvs.length === 0 ? (
            <div className="p-4 text-center text-gray-500 text-sm">
              No chat history yet
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {companyConvs.map(conv => (
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
        className={`flex items-center justify-between px-4 py-3 border-b ${!isFullscreen ? 'cursor-move' : ''}`}
        onMouseDown={handleDragStart}
      >
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-teal-600" />
          <span className="font-medium text-gray-800">AI Assistant</span>
        </div>
        <div className="flex items-center gap-1">
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

      {/* Company Selector + New Chat + History */}
      <div className="px-4 py-2 border-b flex items-center gap-2">
        <span className="text-sm text-gray-500 flex-shrink-0">Analyzing:</span>
        <select
          value={selectedCompany}
          onChange={(e) => handleCompanyChange(e.target.value)}
          className="flex-1 min-w-0 text-sm font-medium bg-white border rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500 truncate"
        >
          {players.slice(0, 20).map((player) => (
            <option key={player.name} value={player.name}>
              {player.name}
            </option>
          ))}
        </select>
        <button
          onClick={startNewChat}
          className="flex-shrink-0 p-2 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200"
          title="New chat"
        >
          <RotateCcw className="w-4 h-4 text-gray-600" />
        </button>
        <button
          onClick={() => setShowHistory(true)}
          className="flex-shrink-0 p-2 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200"
          title="Chat history"
        >
          <History className="w-4 h-4 text-gray-600" />
        </button>
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
              Click a button above or ask any question about the{" "}
              <span className="text-gray-700 font-medium">
                {patents.length.toLocaleString()} patents
              </span>{" "}
              in this dataset.
            </p>
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <ChatMessage key={msg.id} message={msg} />
            ))}
            
            {/* Streaming content */}
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
            
            {/* Thinking indicator */}
            {isLoading && !streamingContent && (
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center">
                  <Loader2 className="w-4 h-4 text-gray-600 animate-spin" />
                </div>
                <span className="text-sm text-gray-500">Thinking...</span>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input Area */}
      <div className="p-3 border-t">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about patents, competitors..."
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
        className="bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden h-full"
      >
        {showHistory ? renderHistoryView() : renderChatView()}
      </div>
    </div>
  );
}