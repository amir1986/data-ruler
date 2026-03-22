"use client"

import * as React from "react"
import { MessageSquare, Search, Bell, Zap } from "lucide-react"
import { Sidebar } from "@/components/layout/sidebar"
import { useChatStore } from "@/stores/chat-store"
import { useFileStore } from "@/stores/file-store"
import { ChatSidebar, type ChatMessage } from "@/components/layout/chat-sidebar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
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
  MessageSquare as MessageSquareNav,
} from "lucide-react"
import { useLanguageStore } from "@/stores/language-store"

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
  const [commandOpen, setCommandOpen] = React.useState(false)
  const [activeTab, setActiveTab] = React.useState<'overview' | 'activity'>('overview')
  const { t } = useLanguageStore()
  const { messages: chatStoreMessages, streaming, sendMessage: storeSendMessage, isOpen: chatOpen, setOpen: setChatOpen, contextFileId } = useChatStore()
  const { files } = useFileStore()
  const contextFile = files.find((f) => f.id === contextFileId)
  const chatMessages = chatStoreMessages.map(m => ({
    id: m.id,
    role: m.role as "user" | "assistant",
    content: m.content,
    timestamp: new Date(m.created_at),
  }))
  const chatLoading = streaming

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
    storeSendMessage(content)
  }

  const commandNavItems = [
    { label: t.nav.files, icon: Files, href: "/files" },
    { label: t.nav.dashboards, icon: LayoutDashboard, href: "/dashboards" },
    { label: t.nav.notes, icon: StickyNote, href: "/notes" },
    { label: t.nav.reports, icon: FileText, href: "/reports" },
    { label: t.nav.chat, icon: MessageSquareNav, href: "/chat" },
    { label: t.nav.settings, icon: Settings, href: "/settings" },
  ]

  const initials = user?.name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "U"

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

      {/* Main content area with top bar */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top navigation bar */}
        <header className="flex h-12 items-center justify-between border-b border-border px-4">
          {/* Left: App name + tabs */}
          <div className="flex items-center gap-6">
            <span className="text-sm font-bold tracking-tight text-white">
              {t.appName}
            </span>

            {/* Search */}
            <div className="relative hidden md:block">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder={t.nav.searchPlaceholder}
                className="ps-9 h-8 w-56 bg-secondary border-border text-sm placeholder:text-muted-foreground"
                onClick={() => setCommandOpen(true)}
                readOnly
              />
            </div>

            {/* Tabs */}
            <nav className="flex items-center gap-4">
              <button
                onClick={() => setActiveTab('overview')}
                className={`text-xs font-semibold uppercase tracking-wider pb-0.5 transition-colors ${
                  activeTab === 'overview'
                    ? 'text-white border-b-2 border-white'
                    : 'text-muted-foreground hover:text-white'
                }`}
              >
                {t.nav.overview}
              </button>
              <button
                onClick={() => setActiveTab('activity')}
                className={`text-xs font-semibold uppercase tracking-wider pb-0.5 transition-colors ${
                  activeTab === 'activity'
                    ? 'text-white border-b-2 border-white'
                    : 'text-muted-foreground hover:text-white'
                }`}
              >
                {t.nav.activity}
              </button>
            </nav>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-muted-foreground/70 select-all" title="Build version">
              {process.env.NEXT_PUBLIC_BUILD_VERSION || 'dev'}
            </span>
            <button className="p-1.5 rounded-md text-muted-foreground hover:text-white transition-colors">
              <Bell className="h-4 w-4" />
            </button>
            <button className="p-1.5 rounded-md text-muted-foreground hover:text-white transition-colors">
              <Zap className="h-4 w-4" />
            </button>
            <Avatar className="h-7 w-7 ms-1">
              <AvatarImage src={user?.avatarUrl} alt={user?.name} />
              <AvatarFallback className="text-[10px] bg-secondary text-muted-foreground">
                {initials}
              </AvatarFallback>
            </Avatar>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>

      {/* Chat toggle button (floating) */}
      {!chatOpen && (
        <Button
          size="icon"
          className="fixed bottom-6 right-6 z-40 h-12 w-12 rounded-full shadow-lg bg-primary hover:bg-primary/90"
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
        context={contextFile ? contextFile.original_name : undefined}
      />

      {/* Command palette */}
      <CommandDialog open={commandOpen} onOpenChange={setCommandOpen}>
        <CommandInput placeholder={t.command.placeholder} />
        <CommandList>
          <CommandEmpty>{t.command.noResults}</CommandEmpty>
          <CommandGroup heading={t.command.navigation}>
            {commandNavItems.map((item) => (
              <CommandItem
                key={item.href}
                onSelect={() => {
                  onNavigate?.(item.href)
                  setCommandOpen(false)
                }}
              >
                <item.icon className="me-2 h-4 w-4" />
                <span>{item.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading={t.command.actions}>
            <CommandItem
              onSelect={() => {
                setChatOpen(true)
                setCommandOpen(false)
              }}
            >
              <MessageSquare className="me-2 h-4 w-4" />
              <span>{t.chat.openAiAssistant}</span>
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
