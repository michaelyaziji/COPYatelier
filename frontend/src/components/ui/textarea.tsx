import { TextareaHTMLAttributes, forwardRef } from 'react';
import { clsx } from 'clsx';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-zinc-700 mb-1.5"
          >
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={inputId}
          className={clsx(
            'w-full px-4 py-3 border rounded-xl text-sm transition-all duration-200 resize-y',
            'focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent',
            'disabled:bg-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-400',
            'placeholder:text-zinc-400',
            error ? 'border-rose-500' : 'border-zinc-200 hover:border-zinc-300',
            className
          )}
          {...props}
        />
        {error && <p className="mt-1.5 text-sm text-rose-600">{error}</p>}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';
