// src/pages/guitar/ear/exercises/registry.ts
import type {ExerciseDescriptor, EarExerciseType} from './types';

// Populated in Wave 2 as exercises are added. Registry is typed here so
// imports compile throughout Wave 2 tasks.
const REGISTRY: Partial<Record<EarExerciseType, ExerciseDescriptor>> = {};

export function registerExercise(descriptor: ExerciseDescriptor): void {
  REGISTRY[descriptor.type] = descriptor;
}

export function getExercise(type: EarExerciseType): ExerciseDescriptor {
  const d = REGISTRY[type];
  if (!d) throw new Error(`Exercise '${type}' not registered`);
  return d;
}

export function getAllExercises(): ExerciseDescriptor[] {
  return Object.values(REGISTRY) as ExerciseDescriptor[];
}
