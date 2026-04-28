import {useMemo} from 'react';
import {Repeat, Bookmark, BookMarked} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {cn} from '@/lib/utils';
import type {PatternVocabulary} from '@/lib/patternVocabulary';

interface PatternVocabularyPanelProps {
  vocabulary: PatternVocabulary;
  onPracticePattern: (patternId: string) => void;
  onHighlightPattern: (patternId: string | null) => void;
  highlightedPatternId: string | null;
  currentPlaybackMs: number;
  /** Set of pattern labels currently tracked in repertoire. Optional. */
  trackedPatterns?: Set<string>;
  /** Toggle tracking for a pattern label + its frequency. Optional. */
  onToggleTrackPattern?: (patternLabel: string, frequency: number) => void;
}

export default function PatternVocabularyPanel({
  vocabulary,
  onPracticePattern,
  onHighlightPattern,
  highlightedPatternId,
  currentPlaybackMs,
  trackedPatterns,
  onToggleTrackPattern,
}: PatternVocabularyPanelProps) {
  // Find which pattern is currently playing
  const currentPatternId = useMemo(() => {
    for (const pattern of vocabulary.patterns) {
      for (const idx of pattern.measureIndices) {
        // We need to check the measure timing — but we only have pattern-level first occurrence timing.
        // Instead, check if the patternId is in the measureToPatternId map for the current time.
      }
    }
    // Find the pattern matching current playback position
    for (const pattern of vocabulary.patterns) {
      if (
        currentPlaybackMs >= pattern.startMs &&
        currentPlaybackMs < pattern.endMs
      ) {
        return pattern.id;
      }
    }
    return null;
  }, [vocabulary, currentPlaybackMs]);

  // Find the best coverage summary line
  const coverageSummary = useMemo(() => {
    const {coverage} = vocabulary;
    if (coverage.length === 0) return null;
    // Find where we hit >= 90% or use the last entry
    const target =
      coverage.find(c => c.percentage >= 90) || coverage[coverage.length - 1];
    return target;
  }, [vocabulary]);

  const nonRestPatterns = vocabulary.patterns.filter(p => !p.isRest);

  return (
    <div className="space-y-2">
      {/* Coverage summary */}
      {coverageSummary && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">
            Learn {coverageSummary.count} pattern
            {coverageSummary.count !== 1 ? 's' : ''} → {coverageSummary.percentage}%
            coverage
          </p>
          <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all"
              style={{width: `${coverageSummary.percentage}%`}}
            />
          </div>
        </div>
      )}

      {/* Pattern list */}
      <div className="space-y-0.5 overflow-y-auto max-h-48">
        {nonRestPatterns.map(pattern => {
          const isHighlighted = highlightedPatternId === pattern.id;
          const isCurrent = currentPatternId === pattern.id;

          return (
            <div
              key={pattern.id}
              className={cn(
                'flex items-center gap-1.5 text-xs rounded px-1.5 py-1 cursor-pointer hover:bg-accent transition-colors group',
                isHighlighted && 'bg-accent',
                isCurrent && 'bg-accent/50 font-medium',
              )}
              onClick={() =>
                onHighlightPattern(isHighlighted ? null : pattern.id)
              }>
              {/* Color dot */}
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{backgroundColor: pattern.color}}
              />

              {/* Label */}
              <span className="font-mono font-medium w-6">{pattern.label}</span>

              {/* Frequency badge */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-muted-foreground">
                    ×{pattern.frequency}
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  Measures:{' '}
                  {pattern.measureIndices.map(i => i + 1).join(', ')}
                </TooltipContent>
              </Tooltip>

              <span className="flex-1" />

              {/* Track-in-repertoire button (if the host wired it up) */}
              {onToggleTrackPattern && (() => {
                const isTracked = trackedPatterns?.has(pattern.label) ?? false;
                return (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className={cn(
                          'h-5 w-5 shrink-0 transition-colors',
                          isTracked
                            ? 'text-emerald-500 hover:text-emerald-600 opacity-100'
                            : 'opacity-0 group-hover:opacity-100',
                        )}
                        onClick={e => {
                          e.stopPropagation();
                          onToggleTrackPattern(pattern.label, pattern.frequency);
                        }}>
                        {isTracked
                          ? <BookMarked className="h-3 w-3" />
                          : <Bookmark className="h-3 w-3" />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{isTracked ? 'Stop tracking pattern' : 'Track this pattern'}</TooltipContent>
                  </Tooltip>
                );
              })()}

              {/* Loop button */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 opacity-0 group-hover:opacity-100 shrink-0"
                    onClick={e => {
                      e.stopPropagation();
                      onPracticePattern(pattern.id);
                    }}>
                    <Repeat className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Practice this pattern</TooltipContent>
              </Tooltip>
            </div>
          );
        })}
      </div>
    </div>
  );
}
