'use client';

import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { clsx } from 'clsx';
import { ReactNode } from 'react';

interface TooltipProps {
  children: ReactNode;
  content: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  delayDuration?: number;
}

export function Tooltip({
  children,
  content,
  side = 'top',
  align = 'center',
  delayDuration = 300,
}: TooltipProps) {
  return (
    <TooltipPrimitive.Provider delayDuration={delayDuration}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={side}
            align={align}
            sideOffset={6}
            className={clsx(
              'z-50 px-3 py-2 text-xs font-medium text-white bg-zinc-900 rounded-lg shadow-lg',
              'max-w-xs leading-relaxed',
              'animate-in fade-in-0 zoom-in-95 duration-150',
              'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95'
            )}
          >
            {content}
            <TooltipPrimitive.Arrow className="fill-zinc-900" width={10} height={5} />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}

// Wrapper for use with form labels - adds info icon
interface TooltipLabelProps {
  label: string;
  tooltip: string;
  htmlFor?: string;
}

export function TooltipLabel({ label, tooltip, htmlFor }: TooltipLabelProps) {
  return (
    <div className="flex items-center gap-1.5 mb-2">
      <label htmlFor={htmlFor} className="text-sm font-medium text-zinc-700">
        {label}
      </label>
      <Tooltip content={tooltip}>
        <button
          type="button"
          className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-zinc-200 text-zinc-500 hover:bg-zinc-300 hover:text-zinc-700 transition-colors text-[10px] font-bold focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-1"
          aria-label={`Info: ${tooltip}`}
        >
          ?
        </button>
      </Tooltip>
    </div>
  );
}
