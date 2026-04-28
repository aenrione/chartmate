import {Migration} from 'kysely';
import {InitialMigration} from './001_initial';
import {migration_002_chorus_charts} from './002_chorus_charts';
import {migration_003_local_charts} from './003_local_charts';
import {migration_004_local_charts_normalized} from './004_local_charts_normalized';
import {migration_005_add_normalized_columns} from './005_add_normalized_columns';
import {migration_006_add_normalized_indexes} from './006_add_normalized_indexes';
import {migration_007_add_track_chart_matches} from './007_add_track_chart_matches';
import {migration_008_add_spotify_history} from './008_add_spotify_history';
import {migration_009_saved_charts} from './009_saved_charts';
import {migration_010_setlists} from './010_setlists';
import {migration_011_youtube} from './011_youtube';
import {migration_012_playbook} from './012_playbook';
import {migration_013_tab_compositions} from './013_tab_compositions';
import {migration_014_fretboard_iq} from './014_fretboard_iq';
import {migration_015_saved_charts_downloaded} from './015_saved_charts_downloaded';
import {migration_016_fill_trainer} from './016_fill_trainer';
import {migration_017_saved_chart_tab_url} from './017_saved_chart_tab_url';
import {migration_018_pdf_library} from './018_pdf_library';
import {migration_019_song_sections_pdf} from './019_song_sections_pdf';
import {migration_020_tab_compositions_saved} from './020_tab_compositions_saved';
import {migration_021_ear_training} from './021_ear_training';
import {migration_022_repertoire_iq} from './022_repertoire_iq';
import {migration_023_repertoire_typed_refs} from './023_repertoire_typed_refs';
import {migration_024_tab_compositions_preview_image} from './024_tab_compositions_preview_image';
import {migration_025_tab_compositions_youtube_url} from './025_tab_compositions_youtube_url';
import {migration_026_spotify_history_v2} from './026_spotify_history_v2';
import {migration_027_explorer_saves} from './027_explorer_saves';
import {migration_028_setlist_item_types} from './028_setlist_item_types';
import {migration_029_setlist_item_indexes} from './029_setlist_item_indexes';
import {migration_030_webdav_sync} from './030_webdav_sync';
import {migration_031_playbook_setlist_cascade} from './031_playbook_setlist_cascade';
import {migration_032_stem_associations} from './032_stem_associations';
import {migration_033_learn_tables} from './033_learn_tables';
import {migration_034_learn_gamification} from './034_learn_gamification';
import {migration_035_learn_schema_fixes} from './035_learn_schema_fixes';
import {migration_036_practice_programs} from './036_practice_programs';
import {migration_037_xp_ledger_generic} from './037_xp_ledger_generic';
import {migration_038_lesson_stars_and_levels} from './038_lesson_stars_and_levels';
import {migration_039_achievements_missions_plan} from './039_achievements_missions_plan';
import {migration_040_progression_integrity_triggers} from './040_progression_integrity_triggers';
import {migration_041_active_time_tracking} from './041_active_time_tracking';
import {migration_042_theory_srs} from './042_theory_srs';
import {migration_043_fretboard_anki_cards} from './043_fretboard_anki_cards';
import {migration_044_purge_theory_items} from './044_purge_theory_items';

export const migrations: Record<string, Migration> = {
  '001_initial': InitialMigration,
  '002_chorus_charts': migration_002_chorus_charts,
  '003_local_charts': migration_003_local_charts,
  '004_local_charts_normalized': migration_004_local_charts_normalized,
  '005_add_normalized_columns': migration_005_add_normalized_columns,
  '006_add_normalized_indexes': migration_006_add_normalized_indexes,
  '007_add_track_chart_matches': migration_007_add_track_chart_matches,
  '008_add_spotify_history': migration_008_add_spotify_history,
  '009_saved_charts': migration_009_saved_charts,
  '010_setlists': migration_010_setlists,
  '011_youtube': migration_011_youtube,
  '012_playbook': migration_012_playbook,
  '013_tab_compositions': migration_013_tab_compositions,
  '014_fretboard_iq': migration_014_fretboard_iq,
  '015_saved_charts_downloaded': migration_015_saved_charts_downloaded,
  '016_fill_trainer': migration_016_fill_trainer,
  '017_saved_chart_tab_url': migration_017_saved_chart_tab_url,
  '018_pdf_library': migration_018_pdf_library,
  '019_song_sections_pdf': migration_019_song_sections_pdf,
  '020_tab_compositions_saved': migration_020_tab_compositions_saved,
  '021_ear_training': migration_021_ear_training,
  '022_repertoire_iq': migration_022_repertoire_iq,
  '023_repertoire_typed_refs': migration_023_repertoire_typed_refs,
  '024_tab_compositions_preview_image': migration_024_tab_compositions_preview_image,
  '025_tab_compositions_youtube_url': migration_025_tab_compositions_youtube_url,
  '026_spotify_history_v2': migration_026_spotify_history_v2,
  '027_explorer_saves': migration_027_explorer_saves,
  '028_setlist_item_types': migration_028_setlist_item_types,
  '029_setlist_item_indexes': migration_029_setlist_item_indexes,
  '030_webdav_sync': migration_030_webdav_sync,
  '031_playbook_setlist_cascade': migration_031_playbook_setlist_cascade,
  '032_stem_associations': migration_032_stem_associations,
  '033_learn_tables': migration_033_learn_tables,
  '034_learn_gamification': migration_034_learn_gamification,
  '035_learn_schema_fixes': migration_035_learn_schema_fixes,
  '036_practice_programs': migration_036_practice_programs,
  '037_xp_ledger_generic': migration_037_xp_ledger_generic,
  '038_lesson_stars_and_levels': migration_038_lesson_stars_and_levels,
  '039_achievements_missions_plan': migration_039_achievements_missions_plan,
  '040_progression_integrity_triggers': migration_040_progression_integrity_triggers,
  '041_active_time_tracking': migration_041_active_time_tracking,
  '042_theory_srs': migration_042_theory_srs,
  '043_fretboard_anki_cards': migration_043_fretboard_anki_cards,
  '044_purge_theory_items': migration_044_purge_theory_items,
};
