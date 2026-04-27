// src/pages/learn/activities/TheoryCard.tsx
import {useEffect} from 'react';
import type {TheoryCardActivity} from '@/lib/curriculum/types';

function renderMarkdown(md: string): string {
  return md
    .replace(/^# (.+)$/gm, '<h1 class="text-2xl font-bold mb-4 text-on-surface font-headline">$1</h1>')
    .replace(/^## (.+)$/gm, '<h2 class="text-xl font-semibold mb-3 text-on-surface">$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-on-surface font-semibold">$1</strong>')
    .replace(/\n\n/g, '</p><p class="text-on-surface-variant leading-relaxed mb-3">')
    .replace(/\n- /g, '</p><li class="text-on-surface-variant ml-4 list-disc">')
    .replace(/^(?!<)(.+)/gm, '<p class="text-on-surface-variant leading-relaxed mb-3">$1</p>');
}

interface Props {
  activity: TheoryCardActivity;
  onPass: () => void;
}

export default function TheoryCard({activity, onPass}: Props) {
  useEffect(() => {
    onPass();
  }, [activity]);

  return (
    <div className="max-w-lg mx-auto px-6 py-8">
      <div
        className="prose-sm"
        dangerouslySetInnerHTML={{__html: renderMarkdown(activity.markdown)}}
      />
      {activity.image && (
        <img
          src={activity.image}
          alt="Lesson illustration"
          className="mt-6 w-full rounded-xl border border-outline-variant/20"
        />
      )}
    </div>
  );
}
