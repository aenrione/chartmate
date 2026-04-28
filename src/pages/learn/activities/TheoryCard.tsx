import {useEffect} from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type {TheoryCardActivity} from '@/lib/curriculum/types';

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
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({children}) => (
            <h1 className="text-2xl font-bold mb-4 text-on-surface font-headline">{children}</h1>
          ),
          h2: ({children}) => (
            <h2 className="text-xl font-semibold mb-3 mt-6 text-on-surface">{children}</h2>
          ),
          h3: ({children}) => (
            <h3 className="text-base font-semibold mb-2 mt-5 text-on-surface">{children}</h3>
          ),
          p: ({children}) => (
            <p className="text-on-surface-variant leading-relaxed mb-3">{children}</p>
          ),
          strong: ({children}) => (
            <strong className="text-on-surface font-semibold">{children}</strong>
          ),
          em: ({children}) => (
            <em className="italic text-on-surface-variant">{children}</em>
          ),
          ul: ({children}) => (
            <ul className="list-disc pl-5 mb-3 space-y-1 text-on-surface-variant">{children}</ul>
          ),
          ol: ({children}) => (
            <ol className="list-decimal pl-5 mb-3 space-y-1 text-on-surface-variant">{children}</ol>
          ),
          li: ({children}) => (
            <li className="leading-relaxed">{children}</li>
          ),
          table: ({children}) => (
            <div className="overflow-x-auto mb-4">
              <table className="w-full text-sm border-collapse">{children}</table>
            </div>
          ),
          thead: ({children}) => (
            <thead className="border-b border-outline-variant/40">{children}</thead>
          ),
          tbody: ({children}) => <tbody>{children}</tbody>,
          tr: ({children}) => (
            <tr className="border-b border-outline-variant/20">{children}</tr>
          ),
          th: ({children}) => (
            <th className="text-left px-3 py-2 font-semibold text-on-surface text-xs uppercase tracking-wide">
              {children}
            </th>
          ),
          td: ({children}) => (
            <td className="px-3 py-2 text-on-surface-variant">{children}</td>
          ),
          blockquote: ({children}) => (
            <blockquote className="border-l-4 border-primary/40 pl-4 italic text-on-surface-variant mb-3">
              {children}
            </blockquote>
          ),
          code: ({children}) => (
            <code className="bg-surface-container px-1.5 py-0.5 rounded text-xs font-mono text-on-surface">
              {children}
            </code>
          ),
          hr: () => <hr className="border-outline-variant/30 my-4" />,
        }}
      >
        {activity.markdown}
      </ReactMarkdown>

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
