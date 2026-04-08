import {useState, useEffect, useCallback, useRef} from 'react';
import {convertFileSrc} from '@tauri-apps/api/core';
import {pdfjsLib} from '@/lib/pdf/pdfjs-init';
import type {PDFDocumentProxy, PDFPageProxy} from 'pdfjs-dist';

export type ScrollMode = 'continuous' | 'single';

export type PdfViewerState = {
  totalPages: number;
  currentPage: number;
  zoom: number;
  scrollMode: ScrollMode;
  autoScrollSpeed: number;
  isAutoScrolling: boolean;
  isLoading: boolean;
  error: string | null;
};

type PdfViewerActions = {
  goToPage: (page: number) => void;
  setZoom: (zoom: number) => void;
  setScrollMode: (mode: ScrollMode) => void;
  setAutoScrollSpeed: (speed: number) => void;
  toggleAutoScroll: () => void;
  halfPageAdvance: () => void;
  getPage: (pageNum: number) => Promise<PDFPageProxy | null>;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
};

export type PdfViewerHandle = PdfViewerState & PdfViewerActions;

export function usePdfViewer(absolutePath: string | null): PdfViewerHandle {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [totalPages, setTotalPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoomState] = useState(1.0);
  const [scrollMode, setScrollModeState] = useState<ScrollMode>('continuous');
  const [autoScrollSpeed, setAutoScrollSpeedState] = useState(0);
  const [isAutoScrolling, setIsAutoScrolling] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const autoScrollRafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!absolutePath) {
      setDoc(null);
      setTotalPages(0);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const load = async () => {
      try {
        const url = convertFileSrc(absolutePath);
        const loadingTask = pdfjsLib.getDocument(url);
        const loaded = await loadingTask.promise;
        if (cancelled) {
          loaded.destroy();
          return;
        }
        setDoc(loaded);
        setTotalPages(loaded.numPages);
        setCurrentPage(1);
        setIsLoading(false);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load PDF');
        setIsLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [absolutePath]);

  useEffect(() => {
    return () => {
      doc?.destroy();
    };
  }, [doc]);

  useEffect(() => {
    if (!isAutoScrolling || autoScrollSpeed === 0) {
      if (autoScrollRafRef.current !== null) {
        cancelAnimationFrame(autoScrollRafRef.current);
        autoScrollRafRef.current = null;
      }
      return;
    }

    let lastTime: number | null = null;

    const tick = (timestamp: number) => {
      if (lastTime !== null) {
        const delta = timestamp - lastTime;
        const pixels = (autoScrollSpeed * delta) / 1000;
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop += pixels;
        }
      }
      lastTime = timestamp;
      autoScrollRafRef.current = requestAnimationFrame(tick);
    };

    autoScrollRafRef.current = requestAnimationFrame(tick);
    return () => {
      if (autoScrollRafRef.current !== null) {
        cancelAnimationFrame(autoScrollRafRef.current);
      }
    };
  }, [isAutoScrolling, autoScrollSpeed]);

  const goToPage = useCallback(
    (page: number) => {
      setCurrentPage(Math.max(1, Math.min(totalPages, page)));
    },
    [totalPages],
  );

  const setZoom = useCallback((z: number) => {
    setZoomState(Math.max(0.5, Math.min(3.0, z)));
  }, []);

  const setScrollMode = useCallback((mode: ScrollMode) => {
    setScrollModeState(mode);
  }, []);

  const setAutoScrollSpeed = useCallback((speed: number) => {
    setAutoScrollSpeedState(Math.max(0, speed));
  }, []);

  const toggleAutoScroll = useCallback(() => {
    setIsAutoScrolling(prev => !prev);
  }, []);

  const halfPageAdvance = useCallback(() => {
    if (!scrollContainerRef.current) return;
    scrollContainerRef.current.scrollTop += scrollContainerRef.current.clientHeight / 2;
  }, []);

  const getPage = useCallback(
    async (pageNum: number): Promise<PDFPageProxy | null> => {
      if (!doc) return null;
      try {
        return await doc.getPage(pageNum);
      } catch {
        return null;
      }
    },
    [doc],
  );

  return {
    totalPages,
    currentPage,
    zoom,
    scrollMode,
    autoScrollSpeed,
    isAutoScrolling,
    isLoading,
    error,
    goToPage,
    setZoom,
    setScrollMode,
    setAutoScrollSpeed,
    toggleAutoScroll,
    halfPageAdvance,
    getPage,
    scrollContainerRef,
  };
}
