import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary-container text-on-primary-container',
        secondary: 'border-transparent bg-surface-container-high text-on-surface-variant',
        outline: 'border-outline-variant/20 text-on-surface-variant',
        drums: 'border-transparent bg-tertiary-container/20 text-tertiary',
        guitar: 'border-transparent bg-secondary-container/20 text-secondary',
        success: 'border-transparent bg-green-900/30 text-green-400',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

function Badge({ className, variant, ...props }: React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof badgeVariants>) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
