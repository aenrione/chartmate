import * as React from 'react';

import { cn } from '@/lib/utils';

function Empty({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('w-full max-w-md rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center', className)} {...props} />;
}

function EmptyHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col items-center gap-3', className)} {...props} />;
}

function EmptyMedia({ className, variant = 'default', ...props }: React.HTMLAttributes<HTMLDivElement> & { variant?: 'default' | 'icon' }) {
  return (
    <div
      className={cn(
        'flex items-center justify-center rounded-full bg-white text-slate-700',
        variant === 'icon' ? 'h-12 w-12 border border-slate-200' : 'h-16 w-16',
        className,
      )}
      {...props}
    />
  );
}

function EmptyTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-lg font-semibold', className)} {...props} />;
}

function EmptyDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm text-slate-500', className)} {...props} />;
}

function EmptyContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mt-6 flex justify-center', className)} {...props} />;
}

export { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle };
