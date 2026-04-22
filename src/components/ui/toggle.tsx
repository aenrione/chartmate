import * as React from 'react';
import {cn} from '@/lib/utils';

export interface ToggleProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  pressed?: boolean;
  onPressedChange?: (pressed: boolean) => void;
  size?: 'sm' | 'default';
}

const Toggle = React.forwardRef<HTMLButtonElement, ToggleProps>(
  ({className, pressed = false, onPressedChange, size = 'default', onClick, children, ...props}, ref) => {
    function handleClick(e: React.MouseEvent<HTMLButtonElement>) {
      onPressedChange?.(!pressed);
      onClick?.(e);
    }

    return (
      <button
        ref={ref}
        type="button"
        role="button"
        aria-pressed={pressed}
        data-state={pressed ? 'on' : 'off'}
        onClick={handleClick}
        className={cn(
          'inline-flex items-center justify-center rounded-md font-medium transition-colors cursor-pointer',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-container',
          'disabled:pointer-events-none disabled:opacity-50',
          pressed
            ? 'bg-surface-container-highest text-on-surface border border-outline-variant/40'
            : 'bg-transparent text-on-surface-variant border border-transparent hover:bg-surface-container-high hover:text-on-surface',
          size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-9 px-3 text-sm',
          className,
        )}
        {...props}
      >
        {children}
      </button>
    );
  },
);

Toggle.displayName = 'Toggle';

export {Toggle};
