import type {DrillDescriptor} from './types';
import type {DrillType} from '@/lib/local-db/fretboard';
import {noteFinderGenerator, noteFinderValidator} from './noteFinder';
import {intervalSpotterGenerator, intervalSpotterValidator} from './intervalSpotter';
import {scaleNavigatorGenerator, scaleNavigatorValidator} from './scaleNavigator';
import {chordToneFinderGenerator, chordToneFinderValidator} from './chordToneFinder';
import {octaveMapperGenerator, octaveMapperValidator} from './octaveMapper';
import {cagedShapesGenerator, cagedShapesValidator} from './cagedShapes';

export const DRILL_REGISTRY: Record<DrillType, DrillDescriptor> = {
  'note-finder': {
    type: 'note-finder',
    name: 'Note Finder',
    description: 'Locate specific notes across all six strings against a ticking clock.',
    icon: 'search',
    difficulty: 'beginner',
    generator: noteFinderGenerator,
    validator: noteFinderValidator,
  },
  'interval-spotter': {
    type: 'interval-spotter',
    name: 'Interval Spotter',
    description: 'Master the distance between notes to visualize shapes instantly.',
    icon: 'straighten',
    difficulty: 'intermediate',
    generator: intervalSpotterGenerator,
    validator: intervalSpotterValidator,
  },
  'scale-navigator': {
    type: 'scale-navigator',
    name: 'Scale Navigator',
    description: 'Fluidly traverse scale patterns up and down the entire neck.',
    icon: 'route',
    difficulty: 'intermediate',
    generator: scaleNavigatorGenerator,
    validator: scaleNavigatorValidator,
  },
  'chord-tone-finder': {
    type: 'chord-tone-finder',
    name: 'Chord Tone Finder',
    description: 'Target arpeggio tones within common progression frameworks.',
    icon: 'layers',
    difficulty: 'advanced',
    generator: chordToneFinderGenerator,
    validator: chordToneFinderValidator,
  },
  'octave-mapper': {
    type: 'octave-mapper',
    name: 'Octave Mapper',
    description: 'Connect the dots across the neck by identifying octave patterns.',
    icon: 'grid_view',
    difficulty: 'beginner',
    generator: octaveMapperGenerator,
    validator: octaveMapperValidator,
  },
  'caged-shapes': {
    type: 'caged-shapes',
    name: 'CAGED Shapes',
    description: 'Visualize chord positions using the legendary CAGED system.',
    icon: 'token',
    difficulty: 'intermediate',
    generator: cagedShapesGenerator,
    validator: cagedShapesValidator,
  },
};

export function getDrill(type: DrillType): DrillDescriptor {
  return DRILL_REGISTRY[type];
}

export function getAllDrills(): DrillDescriptor[] {
  return Object.values(DRILL_REGISTRY);
}
