import * as React from 'react';

import { cn } from '@/lib/utils';

function Empty({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('w-full max-w-md rounded-2xl border border-dashed border-outline-variant/20 bg-surface-container-low p-8 text-center', className)} {...props} />;
}

function EmptyHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col items-center gap-3', className)} {...props} />;
}

function EmptyMedia({ className, variant = 'default', ...props }: React.HTMLAttributes<HTMLDivElement> & { variant?: 'default' | 'icon' }) {
  return (
    <div
      className={cn(
        'flex items-center justify-center rounded-full bg-surface-container text-on-surface-variant',
        variant === 'icon' ? 'h-12 w-12' : 'h-16 w-16',
        className,
      )}
      {...props}
    />
  );
}

function EmptyTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('font-headline text-lg font-semibold', className)} {...props} />;
}

function EmptyDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm text-on-surface-variant', className)} {...props} />;
}

function EmptyContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mt-6 flex justify-center', className)} {...props} />;
}

export { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle };
