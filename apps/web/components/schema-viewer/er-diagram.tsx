'use client';

import React from 'react';
import { Database, ArrowRight } from 'lucide-react';

interface TableNode {
  name: string;
  columns: Array<{
    name: string;
    type: string;
    is_primary_key?: boolean;
  }>;
  x?: number;
  y?: number;
}

interface Relationship {
  from_table: string;
  from_column: string;
  to_table: string;
  to_column: string;
  type: string;
  confidence: number;
}

interface ERDiagramProps {
  tables: TableNode[];
  relationships: Relationship[];
}

export function ERDiagram({ tables, relationships }: ERDiagramProps) {
  // Simple grid layout for tables
  const cols = Math.ceil(Math.sqrt(tables.length));
  const tableWidth = 220;
  const tableGap = 40;

  const positionedTables = tables.map((table, i) => ({
    ...table,
    x: table.x ?? (i % cols) * (tableWidth + tableGap) + 20,
    y: table.y ?? Math.floor(i / cols) * 200 + 20,
  }));

  const svgWidth = Math.max(800, cols * (tableWidth + tableGap) + 40);
  const svgHeight = Math.max(400, Math.ceil(tables.length / cols) * 200 + 40);

  return (
    <div className="bg-zinc-900 rounded-lg border border-zinc-800 overflow-auto">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-800">
        <Database className="w-4 h-4 text-blue-400" />
        <span className="text-sm font-medium text-zinc-200">Entity Relationship Diagram</span>
        <span className="text-xs text-zinc-500">
          {tables.length} tables, {relationships.length} relationships
        </span>
      </div>

      <svg width={svgWidth} height={svgHeight} className="min-w-full">
        <defs>
          <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="#3b82f6" />
          </marker>
        </defs>

        {/* Relationship Lines */}
        {relationships.map((rel, i) => {
          const fromTable = positionedTables.find((t) => t.name === rel.from_table);
          const toTable = positionedTables.find((t) => t.name === rel.to_table);
          if (!fromTable || !toTable) return null;

          const x1 = (fromTable.x || 0) + tableWidth;
          const y1 = (fromTable.y || 0) + 40;
          const x2 = toTable.x || 0;
          const y2 = (toTable.y || 0) + 40;

          return (
            <g key={i}>
              <line
                x1={x1} y1={y1} x2={x2} y2={y2}
                stroke="#3b82f6"
                strokeWidth={1.5}
                strokeDasharray={rel.confidence < 0.7 ? '5,5' : undefined}
                markerEnd="url(#arrowhead)"
                opacity={rel.confidence}
              />
              <text
                x={(x1 + x2) / 2}
                y={(y1 + y2) / 2 - 8}
                fill="#71717a"
                fontSize={10}
                textAnchor="middle"
              >
                {rel.from_column} → {rel.to_column}
              </text>
            </g>
          );
        })}

        {/* Table Cards */}
        {positionedTables.map((table) => (
          <g key={table.name} transform={`translate(${table.x},${table.y})`}>
            <rect
              width={tableWidth} height={30 + table.columns.length * 22}
              rx={8} ry={8}
              fill="#18181b" stroke="#3f3f46" strokeWidth={1}
            />
            {/* Header */}
            <rect
              width={tableWidth} height={30}
              rx={8} ry={8}
              fill="#27272a"
            />
            <rect
              y={22} width={tableWidth} height={8}
              fill="#27272a"
            />
            <text x={10} y={20} fill="#e4e4e7" fontSize={12} fontWeight="bold">
              {table.name}
            </text>
            {/* Columns */}
            {table.columns.map((col, i) => (
              <g key={col.name} transform={`translate(0,${30 + i * 22})`}>
                <text x={10} y={15} fill={col.is_primary_key ? '#fbbf24' : '#a1a1aa'} fontSize={11}>
                  {col.is_primary_key ? '🔑 ' : '  '}{col.name}
                </text>
                <text x={tableWidth - 10} y={15} fill="#52525b" fontSize={10} textAnchor="end">
                  {col.type}
                </text>
              </g>
            ))}
          </g>
        ))}
      </svg>
    </div>
  );
}
