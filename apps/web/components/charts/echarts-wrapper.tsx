'use client';

import React, { useRef, useEffect } from 'react';
import * as echarts from 'echarts';

interface EChartsWrapperProps {
  option: echarts.EChartsOption;
  className?: string;
  height?: string | number;
  onChartClick?: (params: unknown) => void;
  theme?: 'dark' | 'light';
}

export function EChartsWrapper({
  option,
  className = '',
  height = 400,
  onChartClick,
  theme = 'dark',
}: EChartsWrapperProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!chartRef.current) return;

    chartInstance.current = echarts.init(chartRef.current, theme === 'dark' ? 'dark' : undefined);

    const handleResize = () => {
      chartInstance.current?.resize();
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chartInstance.current?.dispose();
    };
  }, [theme]);

  useEffect(() => {
    if (chartInstance.current) {
      chartInstance.current.setOption(option, true);
    }
  }, [option]);

  useEffect(() => {
    if (chartInstance.current && onChartClick) {
      chartInstance.current.on('click', onChartClick);
      return () => {
        chartInstance.current?.off('click');
      };
    }
  }, [onChartClick]);

  return (
    <div
      ref={chartRef}
      className={className}
      style={{ height: typeof height === 'number' ? `${height}px` : height, width: '100%' }}
    />
  );
}
