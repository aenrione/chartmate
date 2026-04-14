import {GProTabSource} from './gprotab';
import {ClassClefSource} from './classclef';
import {TheGuitarLessonSource} from './theguitarlesson';
import {ClasstabSource} from './classtab';
import {UltimateGuitarSource} from './ultimateguitar';
import {ClassicalGuitarShedSource} from './classicalguitarshed';
import {ImslpSource} from './imslp';
import {IgnitionSource} from './ignition4';
// SongsterrSource disabled — GP5 downloads require auth and search URLs returning 404
import type {TabSource} from './types';

export const TAB_SOURCES: TabSource[] = [
  GProTabSource,
  ClassClefSource,
  TheGuitarLessonSource,
  ClasstabSource,
  UltimateGuitarSource,
  ClassicalGuitarShedSource,
  ImslpSource,
  IgnitionSource,
];

const SOURCE_MAP = new Map(TAB_SOURCES.map(s => [s.sourceId, s]));

export function getSource(sourceId: string): TabSource | undefined {
  return SOURCE_MAP.get(sourceId);
}

export type {TabSource, GpSource, PdfSource, TextTabSource, TabSearchResult} from './types';
export {isGpSource, isPdfSource, isTextTabSource} from './types';
