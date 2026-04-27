import {useState, useCallback, useEffect} from 'react';
import type React from 'react';
import {AlphaTabApi, model} from '@coderline/alphatab';
import {detectPatterns, type DetectedPattern} from '@/lib/tab-editor/patternDetector';
import {
  setBarSection,
  removeBarSection,
  getSections,
  type TabSection,
} from '@/lib/tab-editor/scoreOperations';
import {PATTERN_COLORS} from '@/pages/tab-editor/patternColors';
import type {SectionLabel, PatternOverlay} from '@/pages/tab-editor/TabEditorCanvas';

type Score = InstanceType<typeof model.Score>;

export interface UseSectionPatternsParams {
  scoreRef: React.RefObject<Score | null>;
  apiRef: React.RefObject<AlphaTabApi | null>;
  canvasScrollRef: React.RefObject<HTMLDivElement | null>;
  totalBars: number;
  onStartPlaybackAtBar: (startBar: number) => void;
  onJumpToBar: (barIndex: number) => void;
  // Mutation primitives needed by add/remove section
  handleBeforeMutation: () => void;
  reRender: () => void;
}

export function useSectionPatterns(params: UseSectionPatternsParams) {
  const {
    scoreRef,
    apiRef,
    canvasScrollRef,
    handleBeforeMutation,
    reRender,
  } = params;

  const [sectionLabels, setSectionLabels] = useState<SectionLabel[]>([]);
  const [detectedPatterns, setDetectedPatterns] = useState<DetectedPattern[]>([]);
  const [practiceRange, setPracticeRange] = useState<{startBar: number; endBar: number} | null>(null);
  const [showPatternColors, setShowPatternColors] = useState(false);
  const [patternOverlays, setPatternOverlays] = useState<PatternOverlay[]>([]);

  const computeSectionLabels = useCallback(() => {
    const api = apiRef.current;
    const score = scoreRef.current;
    if (!api || !score) return;
    const bounds = api.boundsLookup;
    if (!bounds) return;
    const labels: SectionLabel[] = [];
    for (const system of bounds.staffSystems) {
      for (const barBounds of system.bars) {
        const masterBar = score.masterBars[barBounds.index];
        if (!masterBar?.isSectionStart || !masterBar.section?.text) continue;
        const text = masterBar.section.marker
          ? `[${masterBar.section.marker}] ${masterBar.section.text}`
          : masterBar.section.text;
        labels.push({
          text,
          x: barBounds.visualBounds.x,
          y: barBounds.visualBounds.y,
        });
      }
    }
    setSectionLabels(labels);
  }, [apiRef, scoreRef]);

  const computePatternOverlays = useCallback(() => {
    if (!showPatternColors || detectedPatterns.length === 0) {
      setPatternOverlays([]);
      return;
    }
    const api = apiRef.current;
    if (!api?.boundsLookup) return;

    const barPatternMap = new Map<number, {color: string; label: string; barLength: number}>();
    const instanceStartSet = new Set<number>();
    for (let pi = 0; pi < detectedPatterns.length; pi++) {
      const p = detectedPatterns[pi];
      const color = p.unique ? '#6b7280' : PATTERN_COLORS[pi % PATTERN_COLORS.length];
      for (const start of p.instances) {
        instanceStartSet.add(start);
        for (let b = start; b < start + p.barLength; b++) {
          const existing = barPatternMap.get(b);
          if (!existing || existing.barLength < p.barLength) {
            barPatternMap.set(b, {color, label: p.label, barLength: p.barLength});
          }
        }
      }
    }

    const overlays: PatternOverlay[] = [];
    for (const system of api.boundsLookup.staffSystems) {
      for (const barBounds of system.bars) {
        const info = barPatternMap.get(barBounds.index);
        if (!info) continue;
        const {x, y, w, h} = barBounds.visualBounds;
        overlays.push({x, y, w, h, color: info.color, label: instanceStartSet.has(barBounds.index) ? info.label : ''});
      }
    }
    setPatternOverlays(overlays);
  }, [showPatternColors, detectedPatterns, apiRef]);

  // Recompute overlays whenever visibility or detected patterns change
  useEffect(() => {
    computePatternOverlays();
  }, [computePatternOverlays]);

  const handleAddSection = useCallback((startBar: number, name: string) => {
    const score = scoreRef.current;
    if (!score) return;
    handleBeforeMutation();
    setBarSection(score, startBar, name);
    reRender();
  }, [scoreRef, handleBeforeMutation, reRender]);

  const handleRemoveSection = useCallback((startBar: number) => {
    const score = scoreRef.current;
    if (!score) return;
    handleBeforeMutation();
    removeBarSection(score, startBar);
    reRender();
  }, [scoreRef, handleBeforeMutation, reRender]);

  const handleDetectPatterns = useCallback(() => {
    const score = scoreRef.current;
    if (!score) return;
    setDetectedPatterns(detectPatterns(score));
  }, [scoreRef]);

  const handlePracticeRange = useCallback((startBar: number, endBar: number) => {
    setPracticeRange({startBar, endBar});
    params.onStartPlaybackAtBar(startBar);
  }, [params.onStartPlaybackAtBar]);

  const handleJumpToBar = useCallback((barIndex: number) => {
    params.onJumpToBar(barIndex);
    // scroll the canvas to show the bar
    const score = scoreRef.current;
    const api = apiRef.current;
    const container = canvasScrollRef.current;
    if (!score || !api || !container) return;
    // find the bar's visual position and scroll to it
    const barBounds = api.boundsLookup?.staffSystems
      .flatMap(s => s.bars)
      .find(b => b.index === barIndex);
    if (!barBounds) return;
    const y = barBounds.visualBounds.y;
    container.scrollTo({top: Math.max(0, y - container.clientHeight / 3), behavior: 'smooth'});
  }, [params.onJumpToBar, scoreRef, apiRef, canvasScrollRef]);

  const handleTogglePatternColors = useCallback(() => {
    setShowPatternColors(v => !v);
  }, []);

  const getSectionsFromScore = useCallback((): TabSection[] => {
    const score = scoreRef.current;
    if (!score) return [];
    return getSections(score);
  }, [scoreRef]);

  return {
    sectionLabels,
    setSectionLabels,
    detectedPatterns,
    setDetectedPatterns,
    practiceRange,
    setPracticeRange,
    showPatternColors,
    patternOverlays,
    setPatternOverlays,
    computeSectionLabels,
    computePatternOverlays,
    handleAddSection,
    handleRemoveSection,
    handleDetectPatterns,
    handlePracticeRange,
    handleJumpToBar,
    handleTogglePatternColors,
    getSectionsFromScore,
  };
}
