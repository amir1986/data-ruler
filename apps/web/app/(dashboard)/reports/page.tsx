'use client';

import {
  FileText,
  BarChart3,
  Calendar,
  GitCompare,
  Zap,
  Clock,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const reportTemplates = [
  {
    title: 'Executive Summary',
    description:
      'High-level overview of data quality metrics, key insights, and actionable recommendations for stakeholders.',
    icon: FileText,
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
  },
  {
    title: 'Data Deep-Dive',
    description:
      'Comprehensive analysis of dataset structure, distributions, anomalies, and detailed profiling results.',
    icon: BarChart3,
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/10',
  },
  {
    title: 'Monthly Report',
    description:
      'Periodic summary of data ingestion, quality trends, processing activity, and month-over-month changes.',
    icon: Calendar,
    color: 'text-green-400',
    bgColor: 'bg-green-500/10',
  },
  {
    title: 'Comparison Report',
    description:
      'Side-by-side comparison of multiple datasets or time periods, highlighting differences and correlations.',
    icon: GitCompare,
    color: 'text-orange-400',
    bgColor: 'bg-orange-500/10',
  },
  {
    title: 'Quick Brief',
    description:
      'Auto-generated one-page summary of a single dataset with key statistics and AI-powered insights.',
    icon: Zap,
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-500/10',
  },
];

export default function ReportsPage() {
  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-zinc-800 px-6 py-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-white">Reports</h1>
          <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">
            <Clock className="h-3 w-3 mr-1" />
            Coming Soon
          </Badge>
        </div>
        <p className="text-sm text-zinc-400 mt-1">
          Generate professional reports from your data analysis
        </p>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {/* Coming soon banner */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-8 text-center mb-8">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-500/10 mx-auto mb-4">
            <FileText className="h-8 w-8 text-blue-400" />
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">
            Reports are coming soon
          </h2>
          <p className="text-zinc-400 max-w-md mx-auto">
            We are building powerful report generation capabilities. Soon you will be able
            to create beautiful, AI-powered reports from your data with just a few
            clicks.
          </p>
        </div>

        {/* Template previews */}
        <h3 className="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-4">
          Report Templates
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {reportTemplates.map((template) => (
            <div
              key={template.title}
              className="group rounded-xl border border-zinc-800 bg-zinc-900 p-5 hover:border-zinc-700 transition-colors cursor-default opacity-75"
            >
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-lg ${template.bgColor} mb-4`}
              >
                <template.icon className={`h-5 w-5 ${template.color}`} />
              </div>
              <h3 className="text-base font-semibold text-white mb-2">
                {template.title}
              </h3>
              <p className="text-sm text-zinc-400 leading-relaxed">
                {template.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
