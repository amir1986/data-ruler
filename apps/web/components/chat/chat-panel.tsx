'use client';

import React, { useRef, useEffect, useState } from 'react';
import {
  MessageSquare, X, Send, Loader2, Trash2, FileText,
} from 'lucide-react';
import { useChatStore, type ChatMessage } from '@/stores/chat-store';
import { useFileStore } from '@/stores/file-store';
import { useLanguageStore } from '@/stores/language-store';

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  const { t } = useLanguageStore();

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`
          max-w-[85%] rounded-xl px-4 py-2.5 text-sm
          ${isUser
            ? 'bg-blue-600 text-white rounded-br-sm'
            : 'bg-zinc-800 text-zinc-200 rounded-bl-sm'
          }
        `}
      >
        {message.context_file_id && (
          <div className="flex items-center gap-1.5 mb-1.5 opacity-70">
            <FileText className="w-3 h-3" />
            <span className="text-xs">{t.chat.fileContextActive}</span>
          </div>
        )}
        <div className="whitespace-pre-wrap break-words leading-relaxed">
          {message.content || (
            <span className="flex items-center gap-2 text-zinc-400">
              <Loader2 className="w-3 h-3 animate-spin" /> {t.chat.thinking}
            </span>
          )}
        </div>
        <div className="text-[10px] opacity-50 mt-1">
          {new Date(message.created_at).toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
}

export function ChatPanel() {
  const {
    messages, isOpen, streaming, contextFileId,
    setOpen, sendMessage, fetchHistory, clearHistory, setContextFile,
  } = useChatStore();
  const { files } = useFileStore();
  const { t } = useLanguageStore();
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const contextFile = files.find((f) => f.id === contextFileId);

  useEffect(() => {
    if (isOpen) {
      fetchHistory();
    }
  }, [isOpen, fetchHistory]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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

  if (!isOpen) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 end-6 w-14 h-14 bg-blue-600 hover:bg-blue-500 rounded-full flex items-center justify-center shadow-lg shadow-blue-500/20 transition z-50"
      >
        <MessageSquare className="w-6 h-6 text-white" />
      </button>
    );
  }

  const suggestions = [
    t.chat.suggestSummarize,
    t.chat.suggestTop10,
    t.chat.suggestAnomalies,
    t.chat.suggestChart,
  ];

  return (
    <div className="w-96 h-full flex flex-col bg-zinc-950 border-s border-zinc-800">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-blue-400" />
          <span className="font-medium text-zinc-200 text-sm">{t.chat.aiAssistant}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={clearHistory}
            className="p-1.5 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition"
            title={t.chat.clearHistory}
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setOpen(false)}
            className="p-1.5 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Context Badge */}
      {contextFile && (
        <div className="flex items-center gap-2 px-4 py-2 bg-blue-500/10 border-b border-zinc-800">
          <FileText className="w-3.5 h-3.5 text-blue-400" />
          <span className="text-xs text-blue-300 truncate flex-1">
            {t.chat.context}: {contextFile.original_name}
          </span>
          <button
            onClick={() => setContextFile(null)}
            className="text-blue-400 hover:text-blue-300"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-12">
            <MessageSquare className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
            <p className="text-zinc-500 text-sm">{t.chat.askAnything}</p>
            <div className="mt-4 space-y-2">
              {suggestions.map((q) => (
                <button
                  key={q}
                  onClick={() => {
                    setInput(q);
                    inputRef.current?.focus();
                  }}
                  className="block w-full text-start text-xs text-zinc-500 hover:text-zinc-300 px-3 py-2 rounded-lg hover:bg-zinc-800/50 transition"
                >
                  &quot;{q}&quot;
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-zinc-800">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t.chat.inputPlaceholder}
            rows={1}
            className="flex-1 resize-none bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition max-h-32"
            style={{ minHeight: '40px' }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || streaming}
            className="p-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-white transition"
          >
            {streaming ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
