/**
 * Public surface for the progression system. Practice surfaces import from here only.
 */

export {recordEvent, recordEventSafely, mondayOfWeek} from './engine';
export type {ProgressEvent, ProgressionResult, Instrument, Surface} from './events';
export type {Achievement, AchievementTier} from './achievements';
export type {MissionTemplate, MissionIntensity} from './missions';
export {ACHIEVEMENT_CATALOG} from './achievements';
export {MISSION_CATALOG, findMissionTemplate, ensureWeekMissions, pickMissionsForWeek} from './missions';
export {getOrGenerateDailyPlan, regenerateDailyPlan} from './daily-plan';
export type {DailyPlan, DailyPlanItem, DailyPlanKind} from './daily-plan';
