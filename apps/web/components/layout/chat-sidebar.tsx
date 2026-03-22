"use client"

import * as React from "react"
import {
  MessageSquare,
  Send,
  X,
  Sparkles,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useLanguageStore } from "@/stores/language-store"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"

export interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: Date
}

interface ChatSidebarProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  messages?: ChatMessage[]
  context?: string
  onSendMessage?: (message: string) => void
  isLoading?: boolean
}

export function ChatSidebar({
  open = false,
  onOpenChange,
  messages = [],
  context = "Global",
  onSendMessage,
  isLoading = false,
}: ChatSidebarProps) {
  const { t } = useLanguageStore()
  const [input, setInput] = React.useState("")
  const messagesEndRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const handleSend = () => {
    if (!input.trim()) return
    onSendMessage?.(input.trim())
    setInput("")
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  if (!open) return null

  return (
    <aside className="flex h-full w-full sm:w-80 flex-col border-s bg-background fixed inset-y-0 end-0 z-40 sm:static sm:z-auto">
      {/* Header */}
      <div className="flex h-14 items-center justify-between border-b px-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-electric" />
          <span className="font-semibold text-sm">{t.chat.aiAssistant}</span>
          <Badge variant="secondary" className="text-xs">
            {context}
          </Badge>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => onOpenChange?.(false)}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <MessageSquare className="h-10 w-10 text-muted-foreground/50 mb-3" />
            <p className="text-sm text-muted-foreground">
              {context && context !== "Global"
                ? `Ask anything about "${context}"`
                : t.chat.askAboutData}
            </p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              {t.chat.helpWith}
            </p>
            {context && context !== "Global" && (
              <div className="flex flex-col gap-1.5 mt-4 w-full px-2">
                {[
                  `Summarize ${context}`,
                  `What are the key insights in ${context}?`,
                  `Any anomalies in ${context}?`,
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    className="text-xs text-start px-3 py-2 rounded-md bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => {
                      onSendMessage?.(suggestion)
                    }}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "flex gap-3",
                  message.role === "user" && "flex-row-reverse"
                )}
              >
                <Avatar className="h-7 w-7 shrink-0">
                  <AvatarFallback className="text-xs">
                    {message.role === "user" ? "U" : "AI"}
                  </AvatarFallback>
                </Avatar>
                <div
                  className={cn(
                    "rounded-lg px-3 py-2 text-sm max-w-[85%]",
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  )}
                >
                  {message.content}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex gap-3">
                <Avatar className="h-7 w-7 shrink-0">
                  <AvatarFallback className="text-xs">AI</AvatarFallback>
                </Avatar>
                <div className="rounded-lg bg-muted px-3 py-2">
                  <div className="flex space-x-1">
                    <div className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/40 [animation-delay:-0.3s]" />
                    <div className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/40 [animation-delay:-0.15s]" />
                    <div className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/40" />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </ScrollArea>

      <Separator />

      {/* Input area */}
      <div className="p-4">
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t.chat.inputPlaceholder}
            className="text-sm"
            disabled={isLoading}
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </aside>
  )
}
