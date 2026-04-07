import {Loader2} from 'lucide-react';

export default function Loading({message}: {message?: string}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      {message && (
        <p className="text-sm text-on-surface-variant">{message}</p>
      )}
    </div>
  );
}
