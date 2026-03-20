'use client';

import React, { useState, useEffect } from 'react';
import {
  Database, Table2, ChevronRight, ChevronDown, Eye, Key, Hash,
  Type, Calendar, ToggleLeft,
} from 'lucide-react';
import { useLanguageStore } from '@/stores/language-store';

interface Column {
  name: string;
  type: string;
  is_primary_key?: boolean;
  is_nullable?: boolean;
}

interface TableInfo {
  name: string;
  row_count: number;
  columns: Column[];
}

interface DatabaseBrowserProps {
  fileId: string;
  fileName: string;
  tables?: TableInfo[];
}

const TYPE_ICONS: Record<string, React.ElementType> = {
  integer: Hash,
  real: Hash,
  float: Hash,
  numeric: Hash,
  text: Type,
  varchar: Type,
  char: Type,
  date: Calendar,
  datetime: Calendar,
  timestamp: Calendar,
  boolean: ToggleLeft,
  blob: Database,
};

function getTypeIcon(type: string): React.ElementType {
  const lower = type.toLowerCase();
  for (const [key, icon] of Object.entries(TYPE_ICONS)) {
    if (lower.includes(key)) return icon;
  }
  return Type;
}

export function DatabaseBrowser({ fileId, fileName, tables: initialTables }: DatabaseBrowserProps) {
  const { t } = useLanguageStore();
  const [tables, setTables] = useState<TableInfo[]>(initialTables || []);
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<Record<string, unknown>[] | null>(null);
  const [loading, setLoading] = useState(!initialTables);

  useEffect(() => {
    if (!initialTables) {
      fetchTables();
    }
  }, [fileId]);

  const fetchTables = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/files/${fileId}/tables`);
      if (res.ok) {
        const data = await res.json();
        setTables(data.tables || []);
      }
    } finally {
      setLoading(false);
    }
  };

  const toggleTable = (name: string) => {
    const next = new Set(expandedTables);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    setExpandedTables(next);
  };

  const previewTable = async (tableName: string) => {
    setSelectedTable(tableName);
    try {
      const res = await fetch(`/api/files/${fileId}/tables/${tableName}/preview`);
      if (res.ok) {
        const data = await res.json();
        setPreviewData(data.rows || []);
      }
    } catch {
      setPreviewData([]);
    }
  };

  if (loading) {
    return (
      <div className="p-4 space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-8 bg-zinc-800/50 rounded animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-800">
        <Database className="w-4 h-4 text-blue-400" />
        <span className="text-sm font-medium text-zinc-200 truncate">{fileName}</span>
        <span className="text-xs text-zinc-500">{tables.length} {t.database.tables}</span>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Table Tree */}
        <div className="w-64 border-e border-zinc-800 overflow-y-auto">
          {tables.map((table) => (
            <div key={table.name}>
              <button
                onClick={() => toggleTable(table.name)}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-zinc-800/50 transition"
              >
                {expandedTables.has(table.name) ? (
                  <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-zinc-500" />
                )}
                <Table2 className="w-3.5 h-3.5 text-zinc-400" />
                <span className="text-zinc-300 truncate flex-1 text-start">{table.name}</span>
                <span className="text-xs text-zinc-600">{table.row_count}</span>
              </button>

              {expandedTables.has(table.name) && (
                <div className="ms-8 border-s border-zinc-800">
                  {table.columns.map((col) => {
                    const ColIcon = getTypeIcon(col.type);
                    return (
                      <div key={col.name} className="flex items-center gap-2 px-3 py-1 text-xs">
                        {col.is_primary_key ? (
                          <Key className="w-3 h-3 text-yellow-500" />
                        ) : (
                          <ColIcon className="w-3 h-3 text-zinc-600" />
                        )}
                        <span className="text-zinc-400 truncate">{col.name}</span>
                        <span className="text-zinc-600 ms-auto">{col.type}</span>
                      </div>
                    );
                  })}
                  <button
                    onClick={() => previewTable(table.name)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-blue-400 hover:text-blue-300 transition"
                  >
                    <Eye className="w-3 h-3" /> {t.database.previewData}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Preview Panel */}
        <div className="flex-1 overflow-auto">
          {selectedTable && previewData ? (
            <div>
              <div className="px-4 py-2 border-b border-zinc-800 text-sm font-medium text-zinc-300">
                {selectedTable} - {t.database.preview}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-zinc-900">
                    <tr>
                      {previewData.length > 0 &&
                        Object.keys(previewData[0]).map((key) => (
                          <th key={key} className="text-start px-3 py-2 text-zinc-400 font-medium border-b border-zinc-800">
                            {key}
                          </th>
                        ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.map((row, i) => (
                      <tr key={i} className="hover:bg-zinc-800/30">
                        {Object.values(row).map((val, j) => (
                          <td key={j} className="px-3 py-1.5 text-zinc-400 border-b border-zinc-800/50 whitespace-nowrap">
                            {String(val ?? 'NULL')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-zinc-600 text-sm">
              {t.database.selectTable}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
