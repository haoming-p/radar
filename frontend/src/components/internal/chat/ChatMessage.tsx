import { User, Bot } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Message } from "./ChatBot";

interface ChatMessageProps {
  message: Message;
}

export default function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === "user";

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      {/* Avatar - only show for assistant */}
      {!isUser && (
        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center">
          <Bot className="w-4 h-4 text-gray-600" />
        </div>
      )}

      {/* Message Content */}
      <div
        className={`max-w-[85%] ${
          isUser
            ? "bg-gray-100 text-gray-800 px-4 py-2 rounded-2xl rounded-br-md"
            : "text-gray-800"
        }`}
      >
        {isUser ? (
          // User message - simple text
          <p className="text-sm">{message.content}</p>
        ) : (
          // Assistant message - render markdown
          <div className="prose prose-sm max-w-none text-gray-800">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                // Customize heading styles (no heavy headers)
                h1: ({ children }) => (
                  <p className="font-semibold text-base mt-3 mb-2">{children}</p>
                ),
                h2: ({ children }) => (
                  <p className="font-semibold text-base mt-3 mb-2">{children}</p>
                ),
                h3: ({ children }) => (
                  <p className="font-semibold text-sm mt-2 mb-1">{children}</p>
                ),
                // Paragraphs
                p: ({ children }) => (
                  <p className="text-sm mb-2 leading-relaxed">{children}</p>
                ),
                // Lists
                ul: ({ children }) => (
                  <ul className="text-sm list-disc pl-4 mb-2 space-y-1">{children}</ul>
                ),
                ol: ({ children }) => (
                  <ol className="text-sm list-decimal pl-4 mb-2 space-y-1">{children}</ol>
                ),
                li: ({ children }) => (
                  <li className="text-sm leading-relaxed">{children}</li>
                ),
                // Bold
                strong: ({ children }) => (
                  <strong className="font-semibold text-gray-900">{children}</strong>
                ),
                // Code
                code: ({ children, className }) => {
                  const isInline = !className;
                  return isInline ? (
                    <code className="bg-gray-100 px-1 py-0.5 rounded text-xs font-mono">
                      {children}
                    </code>
                  ) : (
                    <code className="block bg-gray-100 p-2 rounded text-xs font-mono overflow-x-auto">
                      {children}
                    </code>
                  );
                },
                // Links
                a: ({ href, children }) => (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-teal-600 hover:underline"
                  >
                    {children}
                  </a>
                ),
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        )}

        {/* Timestamp - subtle */}
        <p className="text-xs text-gray-400 mt-1">
          {message.timestamp.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>
    </div>
  );
}