'use client';

import * as SelectPrimitive from '@radix-ui/react-select';
import { ChevronDown, Check } from 'lucide-react';
import { clsx } from 'clsx';

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  label?: string;
  placeholder?: string;
  className?: string;
}

export function Select({
  value,
  onValueChange,
  options,
  label,
  placeholder = 'Select...',
  className,
}: SelectProps) {
  return (
    <div className={clsx('w-full', className)}>
      {label && (
        <label className="block text-sm font-medium text-zinc-700 mb-1.5">
          {label}
        </label>
      )}
      <SelectPrimitive.Root value={value} onValueChange={onValueChange}>
        <SelectPrimitive.Trigger
          className={clsx(
            'w-full flex items-center justify-between px-4 py-2.5',
            'border border-zinc-200 rounded-xl bg-white text-sm',
            'hover:border-zinc-300 transition-all duration-200',
            'focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent',
            'text-left text-zinc-900'
          )}
        >
          <SelectPrimitive.Value placeholder={placeholder} />
          <SelectPrimitive.Icon>
            <ChevronDown className="h-4 w-4 text-zinc-400" />
          </SelectPrimitive.Icon>
        </SelectPrimitive.Trigger>

        <SelectPrimitive.Portal>
          <SelectPrimitive.Content
            className={clsx(
              'bg-white rounded-xl shadow-xl border border-zinc-100',
              'max-h-60 overflow-y-auto z-50'
            )}
            position="popper"
            sideOffset={4}
          >
            <SelectPrimitive.Viewport className="p-1.5">
              {options.map((option) => (
                <SelectPrimitive.Item
                  key={option.value}
                  value={option.value}
                  className={clsx(
                    'flex items-center px-3 py-2 rounded-lg cursor-pointer text-sm',
                    'outline-none select-none',
                    'data-[highlighted]:bg-violet-50',
                    'data-[state=checked]:text-violet-600 data-[state=checked]:font-medium'
                  )}
                >
                  <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                  <SelectPrimitive.ItemIndicator className="ml-auto">
                    <Check className="h-4 w-4 text-violet-600" />
                  </SelectPrimitive.ItemIndicator>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.Viewport>
          </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
      </SelectPrimitive.Root>
    </div>
  );
}
