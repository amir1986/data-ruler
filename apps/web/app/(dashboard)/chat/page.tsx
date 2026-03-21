'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { useChatStore, type ChatMessage } from '@/stores/chat-store';
import { useLanguageStore } from '@/stores/language-store';
import {
  Sparkles,
  Send,
  Paperclip,
  Mic,
  ThumbsUp,
  RefreshCw,
  Clock,
  MessageSquare,
  Plus,
  Search,
  Filter,
  Code,
  User,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Mock conversations for demo when no messages exist
// ---------------------------------------------------------------------------
const MOCK_MESSAGES: ChatMessage[] = [
  {
    id: 'mock-1',
    role: 'user',
    content: 'What was our revenue growth in Q4 compared to Q3?',
    created_at: new Date(Date.now() - 3600000 * 2).toISOString(),
  },
  {
    id: 'mock-2',
    role: 'assistant',
    content:
      'Based on your financial dataset, Q4 revenue showed a **+18.4%** increase compared to Q3. Here are the key highlights:\n\n- Total Q4 Revenue: **$2.4M** (up from **$2.03M** in Q3)\n- Highest performing segment: Enterprise subscriptions at **+24.7%**\n- Monthly recurring revenue grew **+12.3%** quarter-over-quarter\n\nHere\'s the SQL query I used to pull these numbers:\n\n```sql\nSELECT\n  quarter,\n  SUM(revenue) AS total_revenue,\n  ROUND((SUM(revenue) - LAG(SUM(revenue)) OVER (ORDER BY quarter)) / LAG(SUM(revenue)) OVER (ORDER BY quarter) * 100, 1) AS growth_pct\nFROM financial_data\nWHERE quarter IN (\'Q3\', \'Q4\')\nGROUP BY quarter\nORDER BY quarter;\n```\n\nWould you like me to break this down by product line or region?',
    created_at: new Date(Date.now() - 3600000 * 2 + 15000).toISOString(),
  },
  {
    id: 'mock-3',
    role: 'user',
    content: 'Show me the user growth anomalies from the last 30 days.',
    created_at: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: 'mock-4',
    role: 'assistant',
    content:
      'I detected **3 anomalies** in your user growth data over the past 30 days:\n\n1. **March 5th** — Signups spiked **+340%** above the daily average (likely correlated with your Product Hunt launch)\n2. **March 12th** — Churn rate jumped to **4.2%** (vs. the **1.8%** baseline), concentrated in the free-tier segment\n3. **March 18th** — Activation rate dropped to **23%** (normally **61%**) — this coincides with the onboarding flow deployment\n\n```sql\nSELECT\n  date,\n  new_signups,\n  churn_rate,\n  activation_rate,\n  CASE WHEN ABS(new_signups - AVG(new_signups) OVER ()) > 2 * STDDEV(new_signups) OVER ()\n       THEN \'ANOMALY\' ELSE \'NORMAL\' END AS status\nFROM user_metrics\nWHERE date >= CURRENT_DATE - INTERVAL \'30 days\'\nORDER BY date;\n```\n\nI recommend investigating the March 18th activation drop — it may indicate a regression in the new onboarding flow.',
    created_at: new Date(Date.now() - 3600000 + 20000).toISOString(),
  },
];

const RECENT_INSIGHTS = [
  { id: '1', title: 'Revenue Q4 vs Q3 Analysis', timestamp: '2 hours ago' },
  { id: '2', title: 'User Growth Anomalies', timestamp: '1 hour ago' },
  { id: '3', title: 'Inventory SQL Optimization', timestamp: 'Yesterday' },
  { id: '4', title: 'Market Segment Breakdown', timestamp: 'Yesterday' },
  { id: '5', title: 'Churn Prediction Model', timestamp: '2 days ago' },
  { id: '6', title: 'Monthly KPI Dashboard', timestamp: '3 days ago' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** Highlight percentages and dollar amounts in emerald */
function highlightMetrics(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      const inner = part.slice(2, -2);
      const isMetric = /[%$+\-\d]/.test(inner);
      return (
        <span
          key={i}
          className={cn(
            'font-bold',
            isMetric ? 'text-emerald-400' : 'text-foreground'
          )}
        >
          {inner}
        </span>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

/** Parse message content into rich blocks */
function parseContent(content: string) {
  const blocks: { type: 'text' | 'sql'; content: string }[] = [];
  const codeBlockRegex = /```sql\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      blocks.push({ type: 'text', content: content.slice(lastIndex, match.index) });
    }
    blocks.push({ type: 'sql', content: match[1].trim() });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    blocks.push({ type: 'text', content: content.slice(lastIndex) });
  }

  return blocks;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SqlBlock({ code }: { code: string }) {
  return (
    <div className="my-3 rounded-lg overflow-hidden border border-border">
      <div className="flex items-center gap-2 px-4 py-2 bg-secondary/80 border-b border-border">
        <Code className="h-3 w-3 text-purple-400" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-purple-400">
          PostgreSQL Query
        </span>
      </div>
      <pre className="p-4 bg-secondary/40 overflow-x-auto text-sm leading-relaxed">
        <code className="text-muted-foreground font-mono">{code}</code>
      </pre>
    </div>
  );
}

function TextBlock({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={i} className="h-2" />;

        // Numbered list items
        const listMatch = trimmed.match(/^(\d+)\.\s+(.+)/);
        if (listMatch) {
          return (
            <div key={i} className="flex gap-2 ps-2">
              <span className="text-muted-foreground text-sm shrink-0">{listMatch[1]}.</span>
              <span className="text-sm leading-relaxed">{highlightMetrics(listMatch[2])}</span>
            </div>
          );
        }

        // Bullet items
        if (trimmed.startsWith('- ')) {
          return (
            <div key={i} className="flex gap-2 ps-2">
              <span className="text-muted-foreground text-sm shrink-0">•</span>
              <span className="text-sm leading-relaxed">{highlightMetrics(trimmed.slice(2))}</span>
            </div>
          );
        }

        return (
          <p key={i} className="text-sm leading-relaxed">
            {highlightMetrics(trimmed)}
          </p>
        );
      })}
    </div>
  );
}

function MessageBubble({
  message,
  streaming,
}: {
  message: ChatMessage;
  streaming: boolean;
}) {
  const isUser = message.role === 'user';
  const blocks = parseContent(message.content);

  return (
    <div className={cn('flex gap-3 max-w-3xl', isUser ? 'ms-auto flex-row-reverse' : '')}>
      {/* Avatar */}
      <div
        className={cn(
          'shrink-0 flex items-center justify-center rounded-full h-8 w-8',
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-purple-500/20 text-purple-400'
        )}
      >
        {isUser ? <User className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
      </div>

      {/* Content */}
      <div
        className={cn(
          'flex-1 min-w-0 rounded-xl px-4 py-3',
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-card border border-border'
        )}
      >
        {/* Streaming indicator */}
        {streaming && !message.content && (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <div className="flex gap-1">
              <span className="animate-bounce [animation-delay:-0.3s] h-1.5 w-1.5 rounded-full bg-purple-400" />
              <span className="animate-bounce [animation-delay:-0.15s] h-1.5 w-1.5 rounded-full bg-purple-400" />
              <span className="animate-bounce h-1.5 w-1.5 rounded-full bg-purple-400" />
            </div>
            <span>Thinking...</span>
          </div>
        )}

        {blocks.map((block, i) =>
          block.type === 'sql' ? (
            <SqlBlock key={i} code={block.content} />
          ) : (
            <TextBlock key={i} text={block.content} />
          )
        )}

        {/* Timestamp */}
        <div
          className={cn(
            'mt-2 text-[10px] uppercase tracking-wider',
            isUser ? 'text-primary-foreground/60' : 'text-muted-foreground'
          )}
        >
          {formatTime(message.created_at)}
        </div>

        {/* Action buttons for assistant messages */}
        {!isUser && message.content && !streaming && (
          <div className="flex items-center gap-3 mt-3 pt-3 border-t border-border">
            <button className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-emerald-400 transition-colors">
              <ThumbsUp className="h-3 w-3" />
              Helpful
            </button>
            <button className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-purple-400 transition-colors">
              <RefreshCw className="h-3 w-3" />
              Regenerate
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function ChatPage() {
  const { t } = useLanguageStore();
  const {
    messages,
    loading,
    streaming,
    sendMessage,
    clearHistory,
    fetchHistory,
  } = useChatStore();

  const [input, setInput] = useState('');
  const [selectedInsight, setSelectedInsight] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch chat history on mount
  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streaming]);

  // Determine which messages to display — real messages or mock demo
  const displayMessages = useMemo(
    () => (messages.length > 0 ? messages : MOCK_MESSAGES),
    [messages]
  );

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || streaming) return;
    setInput('');
    await sendMessage(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleNewChat = () => {
    clearHistory();
    inputRef.current?.focus();
  };

  return (
    <div className="flex h-[calc(100vh-2rem)] gap-0 overflow-hidden rounded-xl border border-border bg-background">
      {/* ----------------------------------------------------------------- */}
      {/* Left Panel — Recent Insights                                      */}
      {/* ----------------------------------------------------------------- */}
      <aside className="hidden md:flex w-[300px] shrink-0 flex-col border-e border-border bg-card">
        {/* Header */}
        <div className="p-4 border-b border-border space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-purple-400" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Recent Insights
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground transition-colors">
                <Filter className="h-3.5 w-3.5" />
              </button>
              <button className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground transition-colors">
                <Search className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <button
            onClick={handleNewChat}
            className="flex items-center justify-center gap-2 w-full py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold uppercase tracking-wider transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            New Chat
          </button>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto">
          {RECENT_INSIGHTS.map((insight) => (
            <button
              key={insight.id}
              onClick={() => setSelectedInsight(insight.id)}
              className={cn(
                'w-full text-start px-4 py-3 border-b border-border transition-colors hover:bg-secondary/60',
                selectedInsight === insight.id && 'bg-secondary'
              )}
            >
              <div className="flex items-start gap-3">
                <MessageSquare className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">
                    {insight.title}
                  </p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <Clock className="h-3 w-3 text-muted-foreground" />
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                      {insight.timestamp}
                    </span>
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Sidebar footer */}
        <div className="p-4 border-t border-border">
          <button
            onClick={() => clearHistory()}
            className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-destructive transition-colors"
          >
            {t.chat.clearHistory}
          </button>
        </div>
      </aside>

      {/* ----------------------------------------------------------------- */}
      {/* Main Chat Area                                                    */}
      {/* ----------------------------------------------------------------- */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Chat header */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-card">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center h-8 w-8 rounded-full bg-purple-500/20">
              <Sparkles className="h-4 w-4 text-purple-400" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-foreground">{t.chat.aiAssistant}</h1>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
                Online
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleNewChat}
              className="md:hidden flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-semibold uppercase tracking-wider transition-colors"
            >
              <Plus className="h-3 w-3" />
              New Chat
            </button>
          </div>
        </div>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
          {/* Welcome banner when showing mock data */}
          {messages.length === 0 && (
            <div className="text-center mb-6">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-500/10 border border-purple-500/20 mb-4">
                <Sparkles className="h-4 w-4 text-purple-400" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-purple-400">
                  {t.chat.aiAssistant}
                </span>
              </div>
              <h2 className="text-lg font-semibold text-foreground">{t.chat.askAboutData}</h2>
              <p className="text-sm text-muted-foreground mt-1">{t.chat.helpWith}</p>

              {/* Suggestion chips */}
              <div className="flex flex-wrap justify-center gap-2 mt-4">
                {[
                  t.chat.suggestSummarize,
                  t.chat.suggestTop10,
                  t.chat.suggestAnomalies,
                  t.chat.suggestChart,
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => {
                      setInput(suggestion);
                      inputRef.current?.focus();
                    }}
                    className="px-3 py-1.5 rounded-full border border-border bg-secondary/50 text-xs text-muted-foreground hover:text-foreground hover:border-purple-500/50 transition-colors"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Messages */}
          {displayMessages.map((msg, idx) => {
            // Show timestamp separator between messages with >5 min gap
            const prevMsg = idx > 0 ? displayMessages[idx - 1] : null;
            const showTimestamp =
              prevMsg &&
              new Date(msg.created_at).getTime() -
                new Date(prevMsg.created_at).getTime() >
                5 * 60 * 1000;

            const isLastAssistant =
              msg.role === 'assistant' &&
              idx === displayMessages.length - 1;

            return (
              <div key={msg.id}>
                {showTimestamp && (
                  <div className="flex items-center justify-center gap-3 my-4">
                    <div className="flex-1 h-px bg-border" />
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {formatTime(msg.created_at)}
                    </span>
                    <div className="flex-1 h-px bg-border" />
                  </div>
                )}
                <MessageBubble
                  message={msg}
                  streaming={streaming && isLastAssistant}
                />
              </div>
            );
          })}

          <div ref={messagesEndRef} />
        </div>

        {/* Input bar */}
        <div className="border-t border-border bg-card px-4 py-3">
          <div className="flex items-center gap-2 max-w-3xl mx-auto">
            <button className="p-2 rounded-lg hover:bg-secondary text-muted-foreground transition-colors">
              <Paperclip className="h-4 w-4" />
            </button>

            <div className="flex-1 relative">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask DataRuler about your metrics..."
                disabled={streaming}
                className="w-full px-4 py-2.5 rounded-lg bg-secondary border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 disabled:opacity-50 transition-colors"
              />
            </div>

            <button className="p-2 rounded-lg hover:bg-secondary text-muted-foreground transition-colors">
              <Mic className="h-4 w-4" />
            </button>

            <button
              onClick={handleSend}
              disabled={!input.trim() || streaming}
              className="p-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>

          {/* Footer text */}
          <div className="flex items-center justify-center gap-2 mt-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              AI-Powered Insights
            </span>
            <span className="text-muted-foreground text-[10px]">•</span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Verified Data Models
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
