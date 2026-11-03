import {useState} from 'react';
import {Download, Loader2} from 'lucide-react';
import {toast} from 'sonner';
import {Button} from '@/components/ui/button';
import {cn} from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {deliverChartFolders, type DeliveryMode} from '@/lib/chart-export/deliver';
import type {ChartFolder} from '@/lib/chart-export/chartFolder';

export interface ExportChartsButtonProps {
  /**
   * Builds the folders to write. Called on click rather than on render so a
   * page listing ninety-six lessons does not chart all of them to show a
   * button.
   */
  build: () => ChartFolder[] | Promise<ChartFolder[]>;
  /** Pass an empty string for an icon-only button. */
  label?: string;
  /** Tooltip for the icon-only form. */
  title?: string;
  defaultFileName?: string;
  variant?: 'default' | 'outline' | 'ghost' | 'secondary';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  className?: string;
  disabled?: boolean;
}

export default function ExportChartsButton({
  build,
  label = 'Export to Clone Hero',
  defaultFileName = 'chartmate-charts.zip',
  variant = 'outline',
  size = 'sm',
  className,
  disabled,
  title,
}: ExportChartsButtonProps) {
  const [busy, setBusy] = useState(false);

  async function run(mode: DeliveryMode) {
    setBusy(true);
    try {
      const folders = await build();
      const result = await deliverChartFolders(folders, mode, defaultFileName);
      if (!result) return; // the user closed the picker

      const errors = folders.flatMap(f =>
        f.issues.filter(i => i.severity === 'error'),
      );
      const silent = folders.filter(f => f.audioIsSilent).length;

      const notes: string[] = [];
      if (silent > 0) {
        notes.push(
          silent === folders.length
            ? 'Stems are silent — play along to your own kit.'
            : `${silent} of them have a silent stem.`,
        );
      }
      const remarks = folders.flatMap(f => f.notes);
      if (remarks.length > 0) {
        notes.push(remarks.length === 1 ? remarks[0] : `${remarks.length} charts simplified — see the console.`);
        for (const remark of remarks) console.warn('chart export:', remark);
      }
      if (errors.length > 0) {
        notes.push(`${errors.length} chart problem${errors.length === 1 ? '' : 's'} — see the console.`);
        for (const issue of errors) console.error('chart export:', issue.message);
      }

      toast.success(
        `Exported ${result.folders} chart${result.folders === 1 ? '' : 's'}`,
        {description: [result.path, ...notes].join(' · ')},
      );
    } catch (error) {
      console.error(error);
      toast.error('Export failed', {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={variant}
          size={size}
          className={className}
          disabled={disabled || busy}
          title={title}
        >
          {busy
            ? <Loader2 className={cn('h-4 w-4 animate-spin', label && 'mr-2')} />
            : <Download className={cn('h-4 w-4', label && 'mr-2')} />}
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Clone Hero / YARG</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => run('folders')}>
          Into a folder…
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => run('zip')}>
          As a single .zip…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
