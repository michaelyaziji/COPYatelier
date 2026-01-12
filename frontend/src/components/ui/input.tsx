import { InputHTMLAttributes, forwardRef } from 'react';
import { clsx } from 'clsx';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-zinc-700 mb-2"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={clsx(
            'w-full px-4 py-3 border-2 rounded-xl text-sm bg-zinc-50 transition-all duration-200',
            'focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent focus:bg-white',
            'disabled:bg-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-400',
            'placeholder:text-zinc-400',
            error ? 'border-rose-500' : 'border-zinc-200 hover:border-violet-300 hover:bg-white',
            className
          )}
          {...props}
        />
        {error && <p className="mt-1.5 text-sm text-rose-600">{error}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';
