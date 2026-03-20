"use client"

import * as React from "react"
import { MessageSquare } from "lucide-react"
import { cn } from "@/lib/utils"
import { Sidebar } from "@/components/layout/sidebar"
import { ChatSidebar, type ChatMessage } from "@/components/layout/chat-sidebar"
import { Button } from "@/components/ui/button"
import { Toaster } from "@/components/ui/toast"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import {
  Files,
  LayoutDashboard,
  StickyNote,
  FileText,
  Settings,
} from "lucide-react"

interface AppShellProps {
  children: React.ReactNode
  activePath?: string
  user?: {
    name: string
    email: string
    avatarUrl?: string
  }
  onNavigate?: (href: string) => void
  onLogout?: () => void
}

export function AppShell({
  children,
  activePath = "/files",
  user,
  onNavigate,
  onLogout,
}: AppShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false)
  const [chatOpen, setChatOpen] = React.useState(false)
  const [commandOpen, setCommandOpen] = React.useState(false)
  const [chatMessages, setChatMessages] = React.useState<ChatMessage[]>([])
  const [chatLoading, setChatLoading] = React.useState(false)

  // Command palette shortcut (Cmd+K / Ctrl+K)
  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setCommandOpen((prev) => !prev)
      }
    }

    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [])

  const handleSendMessage = (content: string) => {
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content,
      timestamp: new Date(),
    }
    setChatMessages((prev) => [...prev, userMessage])
    setChatLoading(true)

    // Placeholder: simulate assistant response
    setTimeout(() => {
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content:
          "I'm the AI assistant. This is a placeholder response. Connect me to your backend to get real answers about your data.",
        timestamp: new Date(),
      }
      setChatMessages((prev) => [...prev, assistantMessage])
      setChatLoading(false)
    }, 1500)
  }

  const commandNavItems = [
    { label: "Files", icon: Files, href: "/files" },
    { label: "Dashboards", icon: LayoutDashboard, href: "/dashboards" },
    { label: "Notes", icon: StickyNote, href: "/notes" },
    { label: "Reports", icon: FileText, href: "/reports" },
    { label: "Settings", icon: Settings, href: "/settings" },
  ]

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      {/* Left sidebar */}
      <Sidebar
        collapsed={sidebarCollapsed}
        onCollapsedChange={setSidebarCollapsed}
        activePath={activePath}
        user={user}
        onNavigate={(href) => {
          onNavigate?.(href)
          setCommandOpen(false)
        }}
        onLogout={onLogout}
      />

      {/* Main content area */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>

      {/* Chat toggle button (floating) */}
      {!chatOpen && (
        <Button
          size="icon"
          className="fixed bottom-6 right-6 z-40 h-12 w-12 rounded-full shadow-lg"
          onClick={() => setChatOpen(true)}
        >
          <MessageSquare className="h-5 w-5" />
        </Button>
      )}

      {/* Right chat sidebar */}
      <ChatSidebar
        open={chatOpen}
        onOpenChange={setChatOpen}
        messages={chatMessages}
        onSendMessage={handleSendMessage}
        isLoading={chatLoading}
      />

      {/* Command palette */}
      <CommandDialog open={commandOpen} onOpenChange={setCommandOpen}>
        <CommandInput placeholder="Type a command or search..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="Navigation">
            {commandNavItems.map((item) => (
              <CommandItem
                key={item.href}
                onSelect={() => {
                  onNavigate?.(item.href)
                  setCommandOpen(false)
                }}
              >
                <item.icon className="mr-2 h-4 w-4" />
                <span>{item.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Actions">
            <CommandItem
              onSelect={() => {
                setChatOpen(true)
                setCommandOpen(false)
              }}
            >
              <MessageSquare className="mr-2 h-4 w-4" />
              <span>Open AI Assistant</span>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>

      {/* Toast container */}
      <Toaster
        position="bottom-right"
        toastOptions={{
          className: "bg-background text-foreground border",
        }}
      />
    </div>
  )
}
