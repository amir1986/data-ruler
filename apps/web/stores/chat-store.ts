'use client';

import { create } from 'zustand';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  context_file_id?: string;
  context_dashboard_id?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

interface ChatState {
  messages: ChatMessage[];
  isOpen: boolean;
  loading: boolean;
  streaming: boolean;
  contextFileId: string | null;
  contextDashboardId: string | null;

  setOpen: (open: boolean) => void;
  toggleOpen: () => void;
  setContextFile: (id: string | null) => void;
  setContextDashboard: (id: string | null) => void;
  addMessage: (msg: ChatMessage) => void;
  updateLastMessage: (content: string) => void;

  fetchHistory: () => Promise<void>;
  sendMessage: (content: string) => Promise<void>;
  clearHistory: () => Promise<void>;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  isOpen: false,
  loading: false,
  streaming: false,
  contextFileId: null,
  contextDashboardId: null,

  setOpen: (isOpen) => set({ isOpen }),
  toggleOpen: () => set((s) => ({ isOpen: !s.isOpen })),
  setContextFile: (contextFileId) => set({ contextFileId }),
  setContextDashboard: (contextDashboardId) => set({ contextDashboardId }),
  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  updateLastMessage: (content) =>
    set((s) => {
      const msgs = [...s.messages];
      if (msgs.length > 0) {
        msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], content };
      }
      return { messages: msgs };
    }),

  fetchHistory: async () => {
    set({ loading: true });
    try {
      const res = await fetch('/api/chat/history');
      if (res.ok) {
        const data = await res.json();
        set({ messages: data.messages, loading: false });
      }
    } catch {
      set({ loading: false });
    }
  },

  sendMessage: async (content) => {
    const { contextFileId, contextDashboardId } = get();

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      context_file_id: contextFileId || undefined,
      context_dashboard_id: contextDashboardId || undefined,
      created_at: new Date().toISOString(),
    };
    get().addMessage(userMsg);

    const assistantMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      created_at: new Date().toISOString(),
    };
    get().addMessage(assistantMsg);
    set({ streaming: true });

    try {
      const res = await fetch('/api/chat/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: content,
          contextFileId,
          contextDashboardId,
        }),
      });

      if (!res.ok) {
        get().updateLastMessage('Sorry, an error occurred. Please try again.');
        set({ streaming: false });
        return;
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') break;
              try {
                const parsed = JSON.parse(data);
                if (parsed.content) {
                  accumulated += parsed.content;
                  get().updateLastMessage(accumulated);
                }
              } catch {
                // Skip non-JSON lines
              }
            }
          }
        }
      }
    } catch {
      get().updateLastMessage('Connection error. Please check your network and try again.');
    } finally {
      set({ streaming: false });
    }
  },

  clearHistory: async () => {
    await fetch('/api/chat/history', { method: 'DELETE' });
    set({ messages: [] });
  },
}));
