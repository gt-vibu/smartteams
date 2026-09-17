'use client';

import { Button } from '@smarteam/ui';

import React from 'react';
import { Tooltip } from '@smarteam/ui';

interface InfoTooltipProps {
  content: React.ReactNode;
  label?: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
}

export function InfoTooltip({ content, label, side = 'top', className = '' }: InfoTooltipProps) {
  return (
    <Tooltip content={content} side={side} className={className}>
      <Button
        type="button"
        variant="ghost"
        className="inline-flex items-center justify-center h-4 w-4 rounded-full text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus:outline-none cursor-help ml-1 align-middle"
        aria-label={label || 'Information'}
      >
        <svg
          className="h-3 w-3"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </Button>
    </Tooltip>
  );
}
