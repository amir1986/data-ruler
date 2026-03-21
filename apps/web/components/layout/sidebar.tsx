"use client"

import * as React from "react"
import {
  Files,
  LayoutDashboard,
  StickyNote,
  FileText,
  Settings,
  Upload,
  HelpCircle,
  UserCircle,
  Ruler,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
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

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          "flex h-full flex-col bg-sidebar text-sidebar-foreground transition-all duration-300",
          collapsed ? "w-16" : "w-56"
        )}
      >
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-5 py-5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/20">
            <Ruler className="h-4 w-4 text-primary" />
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="text-sm font-bold tracking-tight text-white">
                {t.appName}
              </span>
              <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                {t.nav.aiDataManagement}
              </span>
            </div>
          )}
        </div>

        {/* Upload Data button */}
        {!collapsed ? (
          <div className="px-3 mb-2">
            <Button
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-medium gap-2"
              onClick={() => onNavigate?.("/files")}
            >
              <Upload className="h-4 w-4" />
              {t.nav.uploadData}
            </Button>
          </div>
        ) : (
          <div className="px-2 mb-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
                  onClick={() => onNavigate?.("/files")}
                >
                  <Upload className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side={isRtlDir ? "left" : "right"}>
                {t.nav.uploadData}
              </TooltipContent>
            </Tooltip>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 space-y-0.5 px-3 pt-2">
          {navItems.map((item) => {
            const isActive = activePath === item.href
            const label = t.nav[item.labelKey]
            const button = (
              <button
                key={item.href}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  collapsed && "justify-center px-0",
                  isActive
                    ? "bg-secondary text-white"
                    : "text-muted-foreground hover:bg-secondary/50 hover:text-white"
                )}
                onClick={() => onNavigate?.(item.href)}
              >
                <item.icon className="h-[18px] w-[18px] shrink-0" />
                {!collapsed && <span>{label}</span>}
              </button>
            )

            if (collapsed) {
              return (
                <Tooltip key={item.href}>
                  <TooltipTrigger asChild>{button}</TooltipTrigger>
                  <TooltipContent side={isRtlDir ? "left" : "right"}>{label}</TooltipContent>
                </Tooltip>
              )
            }

            return <React.Fragment key={item.href}>{button}</React.Fragment>
          })}
        </nav>

        {/* Bottom links */}
        <div className="px-3 pb-4 space-y-0.5">
          {/* Support */}
          {collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className="flex w-full items-center justify-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-secondary/50 hover:text-white transition-colors"
                >
                  <HelpCircle className="h-[18px] w-[18px] shrink-0" />
                </button>
              </TooltipTrigger>
              <TooltipContent side={isRtlDir ? "left" : "right"}>
                {t.nav.support}
              </TooltipContent>
            </Tooltip>
          ) : (
            <button
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-secondary/50 hover:text-white transition-colors"
            >
              <HelpCircle className="h-[18px] w-[18px] shrink-0" />
              <span>{t.nav.support}</span>
            </button>
          )}

          {/* Account */}
          {collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className="flex w-full items-center justify-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-secondary/50 hover:text-white transition-colors"
                  onClick={onLogout}
                >
                  <UserCircle className="h-[18px] w-[18px] shrink-0" />
                </button>
              </TooltipTrigger>
              <TooltipContent side={isRtlDir ? "left" : "right"}>
                {t.nav.account}
              </TooltipContent>
            </Tooltip>
          ) : (
            <button
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-secondary/50 hover:text-white transition-colors"
              onClick={onLogout}
            >
              <UserCircle className="h-[18px] w-[18px] shrink-0" />
              <span>{t.nav.account}</span>
            </button>
          )}
        </div>
      </aside>
    </TooltipProvider>
  )
}
