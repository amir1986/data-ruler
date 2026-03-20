'use client';

import React from 'react';
import { EChartsWrapper } from './echarts-wrapper';
import type { EChartsOption } from 'echarts';

const COLORS = [
  '#3b82f6', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b',
  '#ef4444', '#ec4899', '#6366f1', '#14b8a6', '#f97316',
];

interface ChartData {
  labels?: string[];
  values?: number[];
  series?: Array<{
    name: string;
    data: number[];
  }>;
  columns?: string[];
  rows?: Record<string, unknown>[];
}

interface ChartFactoryProps {
  type: string;
  data: ChartData;
  title?: string;
  height?: number;
  onFilter?: (params: unknown) => void;
}

function buildBarChart(data: ChartData, title?: string): EChartsOption {
  return {
    backgroundColor: 'transparent',
    title: title ? { text: title, textStyle: { color: '#e4e4e7', fontSize: 14 } } : undefined,
    tooltip: { trigger: 'axis' },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: {
      type: 'category',
      data: data.labels || [],
      axisLabel: { color: '#a1a1aa' },
      axisLine: { lineStyle: { color: '#3f3f46' } },
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: '#a1a1aa' },
      splitLine: { lineStyle: { color: '#27272a' } },
    },
    series: data.series
      ? data.series.map((s, i) => ({
          name: s.name,
          type: 'bar' as const,
          data: s.data,
          itemStyle: { color: COLORS[i % COLORS.length] },
        }))
      : [
          {
            type: 'bar' as const,
            data: data.values || [],
            itemStyle: {
              color: COLORS[0],
              borderRadius: [4, 4, 0, 0],
            },
          },
        ],
  };
}

function buildLineChart(data: ChartData, title?: string): EChartsOption {
  return {
    backgroundColor: 'transparent',
    title: title ? { text: title, textStyle: { color: '#e4e4e7', fontSize: 14 } } : undefined,
    tooltip: { trigger: 'axis' },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: {
      type: 'category',
      data: data.labels || [],
      axisLabel: { color: '#a1a1aa' },
      axisLine: { lineStyle: { color: '#3f3f46' } },
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: '#a1a1aa' },
      splitLine: { lineStyle: { color: '#27272a' } },
    },
    series: data.series
      ? data.series.map((s, i) => ({
          name: s.name,
          type: 'line' as const,
          data: s.data,
          smooth: true,
          lineStyle: { color: COLORS[i % COLORS.length] },
          itemStyle: { color: COLORS[i % COLORS.length] },
        }))
      : [
          {
            type: 'line' as const,
            data: data.values || [],
            smooth: true,
            areaStyle: { color: 'rgba(59,130,246,0.1)' },
            lineStyle: { color: COLORS[0] },
            itemStyle: { color: COLORS[0] },
          },
        ],
  };
}

function buildPieChart(data: ChartData, title?: string): EChartsOption {
  const pieData = (data.labels || []).map((label, i) => ({
    name: label,
    value: data.values?.[i] || 0,
  }));
  return {
    backgroundColor: 'transparent',
    title: title ? { text: title, textStyle: { color: '#e4e4e7', fontSize: 14 } } : undefined,
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    series: [
      {
        type: 'pie',
        radius: ['40%', '70%'],
        data: pieData,
        label: { color: '#a1a1aa' },
        itemStyle: {
          borderColor: '#18181b',
          borderWidth: 2,
        },
        color: COLORS,
      },
    ],
  };
}

function buildScatterChart(data: ChartData, title?: string): EChartsOption {
  return {
    backgroundColor: 'transparent',
    title: title ? { text: title, textStyle: { color: '#e4e4e7', fontSize: 14 } } : undefined,
    tooltip: { trigger: 'item' },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: {
      type: 'value',
      axisLabel: { color: '#a1a1aa' },
      splitLine: { lineStyle: { color: '#27272a' } },
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: '#a1a1aa' },
      splitLine: { lineStyle: { color: '#27272a' } },
    },
    series: [
      {
        type: 'scatter',
        data: data.values || [],
        itemStyle: { color: COLORS[0] },
      },
    ],
  };
}

function buildHeatmapChart(data: ChartData, title?: string): EChartsOption {
  return {
    backgroundColor: 'transparent',
    title: title ? { text: title, textStyle: { color: '#e4e4e7', fontSize: 14 } } : undefined,
    tooltip: { position: 'top' },
    grid: { left: '3%', right: '4%', bottom: '10%', containLabel: true },
    xAxis: {
      type: 'category',
      data: data.labels || [],
      axisLabel: { color: '#a1a1aa' },
    },
    yAxis: {
      type: 'category',
      data: data.columns || [],
      axisLabel: { color: '#a1a1aa' },
    },
    visualMap: {
      min: 0,
      max: 1,
      calculable: true,
      orient: 'horizontal',
      left: 'center',
      bottom: '0%',
      inRange: { color: ['#18181b', '#3b82f6'] },
      textStyle: { color: '#a1a1aa' },
    },
    series: [
      {
        type: 'heatmap' as const,
        data: (data.values || []) as any,
        emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.5)' } },
      },
    ],
  };
}

const CHART_BUILDERS: Record<string, (data: ChartData, title?: string) => EChartsOption> = {
  bar: buildBarChart,
  line: buildLineChart,
  pie: buildPieChart,
  scatter: buildScatterChart,
  heatmap: buildHeatmapChart,
};

export function ChartFactory({ type, data, title, height = 350, onFilter }: ChartFactoryProps) {
  const builder = CHART_BUILDERS[type] || buildBarChart;
  const option = builder(data, title);

  return <EChartsWrapper option={option} height={height} onChartClick={onFilter} />;
}
