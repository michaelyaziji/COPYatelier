import { ButtonHTMLAttributes, forwardRef } from 'react';
import { clsx } from 'clsx';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg';
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled}
        className={clsx(
          'inline-flex items-center justify-center rounded-xl font-medium transition-all duration-200',
          'focus:outline-none focus:ring-2 focus:ring-offset-2',
          'disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none',
          'active:scale-[0.98]',
          {
            // Variants
            'bg-gradient-to-r from-violet-600 to-violet-500 text-white hover:from-violet-700 hover:to-violet-600 focus:ring-violet-500 shadow-lg shadow-violet-500/25 hover:shadow-xl hover:shadow-violet-500/30':
              variant === 'primary',
            'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 focus:ring-zinc-400':
              variant === 'secondary',
            'bg-gradient-to-r from-rose-600 to-rose-500 text-white hover:from-rose-700 hover:to-rose-600 focus:ring-rose-500':
              variant === 'danger',
            'bg-transparent text-zinc-600 hover:bg-zinc-100 focus:ring-zinc-400':
              variant === 'ghost',
            'bg-transparent border-2 border-violet-200 text-violet-600 hover:bg-violet-50 hover:border-violet-300 focus:ring-violet-500':
              variant === 'outline',
            // Sizes
            'px-3 py-1.5 text-sm gap-1.5': size === 'sm',
            'px-4 py-2.5 text-sm gap-2': size === 'md',
            'px-6 py-3 text-base gap-2': size === 'lg',
          },
          className
        )}
        {...props}
      />
    );
  }
);

Button.displayName = 'Button';
