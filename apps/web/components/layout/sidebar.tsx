"use client"

import * as React from "react"
import {
  Files,
  LayoutDashboard,
  StickyNote,
  FileText,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Moon,
  Sun,
  Ruler,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Separator } from "@/components/ui/separator"
import { LanguageSwitcher } from "@/components/language-switcher"
import { useLanguageStore } from "@/stores/language-store"

interface NavItem {
  labelKey: 'files' | 'dashboards' | 'notes' | 'reports' | 'settings'
  icon: React.ElementType
  href: string
}

const navItems: NavItem[] = [
  { labelKey: "files", icon: Files, href: "/files" },
  { labelKey: "dashboards", icon: LayoutDashboard, href: "/dashboards" },
  { labelKey: "notes", icon: StickyNote, href: "/notes" },
  { labelKey: "reports", icon: FileText, href: "/reports" },
  { labelKey: "settings", icon: Settings, href: "/settings" },
]

interface SidebarProps {
  collapsed?: boolean
  onCollapsedChange?: (collapsed: boolean) => void
  activePath?: string
  user?: {
    name: string
    email: string
    avatarUrl?: string
  }
  onNavigate?: (href: string) => void
  onLogout?: () => void
}

export function Sidebar({
  collapsed = false,
  onCollapsedChange,
  activePath = "/files",
  user = { name: "User", email: "user@example.com" },
  onNavigate,
  onLogout,
}: SidebarProps) {
  const { t, isRtl: isRtlDir } = useLanguageStore()
  const [isDark, setIsDark] = React.useState(false)

  React.useEffect(() => {
    const isDarkMode = document.documentElement.classList.contains("dark")
    setIsDark(isDarkMode)
  }, [])

  const toggleTheme = () => {
    const next = !isDark
    setIsDark(next)
    document.documentElement.classList.toggle("dark", next)
  }

  const initials = user.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          "flex h-full flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-all duration-300",
          collapsed ? "w-16" : "w-60"
        )}
      >
        {/* Logo */}
        <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-4">
          <Ruler className="h-6 w-6 shrink-0 text-electric" />
          {!collapsed && (
            <span className="text-lg font-semibold tracking-tight">
              DataRuler
            </span>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 p-2">
          {navItems.map((item) => {
            const isActive = activePath === item.href
            const label = t.nav[item.labelKey]
            const button = (
              <Button
                key={item.href}
                variant="ghost"
                className={cn(
                  "w-full justify-start gap-3",
                  collapsed && "justify-center px-0",
                  isActive &&
                    "bg-accent text-accent-foreground font-medium"
                )}
                onClick={() => onNavigate?.(item.href)}
              >
                <item.icon className="h-5 w-5 shrink-0" />
                {!collapsed && <span>{label}</span>}
              </Button>
            )

            if (collapsed) {
              return (
                <Tooltip key={item.href}>
                  <TooltipTrigger asChild>{button}</TooltipTrigger>
                  <TooltipContent side={isRtlDir ? "left" : "right"}>{label}</TooltipContent>
                </Tooltip>
              )
            }

            return button
          })}
        </nav>

        <Separator />

        {/* Language switcher */}
        <div className="p-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <LanguageSwitcher collapsed={collapsed} />
              </div>
            </TooltipTrigger>
            {collapsed && (
              <TooltipContent side={isRtlDir ? "left" : "right"}>
                {t.settings.language}
              </TooltipContent>
            )}
          </Tooltip>
        </div>

        {/* Theme toggle */}
        <div className="p-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                className={cn(
                  "w-full justify-start gap-3",
                  collapsed && "justify-center px-0"
                )}
                onClick={toggleTheme}
              >
                {isDark ? (
                  <Sun className="h-5 w-5 shrink-0" />
                ) : (
                  <Moon className="h-5 w-5 shrink-0" />
                )}
                {!collapsed && (
                  <span>{isDark ? t.nav.lightMode : t.nav.darkMode}</span>
                )}
              </Button>
            </TooltipTrigger>
            {collapsed && (
              <TooltipContent side={isRtlDir ? "left" : "right"}>
                {isDark ? t.nav.lightMode : t.nav.darkMode}
              </TooltipContent>
            )}
          </Tooltip>
        </div>

        {/* Collapse toggle */}
        <div className="p-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="w-full"
                onClick={() => onCollapsedChange?.(!collapsed)}
              >
                {collapsed ? (
                  isRtlDir ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />
                ) : (
                  isRtlDir ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            {collapsed && (
              <TooltipContent side={isRtlDir ? "left" : "right"}>
                {t.nav.expandSidebar}
              </TooltipContent>
            )}
          </Tooltip>
        </div>

        {/* User section */}
        <div className="border-t border-sidebar-border p-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className={cn(
                  "w-full justify-start gap-3 h-auto py-2",
                  collapsed && "justify-center px-0"
                )}
              >
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarImage src={user.avatarUrl} alt={user.name} />
                  <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                </Avatar>
                {!collapsed && (
                  <div className="flex flex-col items-start text-left">
                    <span className="text-sm font-medium">{user.name}</span>
                    <span className="text-xs text-muted-foreground truncate max-w-[140px]">
                      {user.email}
                    </span>
                  </div>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              side={collapsed ? (isRtlDir ? "left" : "right") : "top"}
              align="start"
              className="w-56"
            >
              <div className="px-2 py-1.5">
                <p className="text-sm font-medium">{user.name}</p>
                <p className="text-xs text-muted-foreground">{user.email}</p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onLogout}>
                <LogOut className="me-2 h-4 w-4" />
                {t.nav.logOut}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>
    </TooltipProvider>
  )
}
