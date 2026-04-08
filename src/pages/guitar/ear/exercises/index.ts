// src/pages/guitar/ear/exercises/index.ts
// Importing each file registers the exercise in the registry via registerExercise() side-effects
import './intervalRecognition';
import './perfectPitch';
import './chordRecognition';
import './scaleRecognition';
import './scaleDegrees';
import './chordProgressions';
import './intervalsInContext';
import './melodicDictation';

export {getAllExercises, getExercise} from './registry';
export type {ExerciseDescriptor, EarQuestion, EarConfig, ItemWeight} from './types';
export {DEFAULT_EAR_CONFIG} from './types';
