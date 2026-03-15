import {sql, type Kysely, type Migration} from 'kysely';
import {normalizeStrForMatching} from '../normalize';

export const migration_005_add_normalized_columns: Migration = {
  async up(db: Kysely<any>) {
    // Add normalized columns to chorus_charts
    await db.schema
      .alterTable('chorus_charts')
      .addColumn('artist_normalized', 'text')
      .execute();

    await db.schema
      .alterTable('chorus_charts')
      .addColumn('charter_normalized', 'text')
      .execute();

    await db.schema
      .alterTable('chorus_charts')
      .addColumn('name_normalized', 'text')
      .execute();

    // Add artist_bucket generated column to chorus_charts
    await db.schema
      .alterTable('chorus_charts')
      .addColumn('artist_bucket', 'text', col =>
        col.generatedAlwaysAs(sql`substr(artist_normalized,1,1)`),
      )
      .execute();

    // Add normalized columns to spotify_tracks
    await db.schema
      .alterTable('spotify_tracks')
      .addColumn('artist_normalized', 'text')
      .execute();

    await db.schema
      .alterTable('spotify_tracks')
      .addColumn('name_normalized', 'text')
      .execute();

    // Add artist_bucket generated column to spotify_tracks
    await db.schema
      .alterTable('spotify_tracks')
      .addColumn('artist_bucket', 'text', col =>
        col.generatedAlwaysAs(sql`substr(artist_normalized,1,1)`),
      )
      .execute();

    // JS pre-normalization for chorus_charts (uses md5 as primary key)
    const chorusRows = await db
      .selectFrom('chorus_charts')
      .select(['md5', 'artist', 'charter', 'name'])
      .execute();

    for (const row of chorusRows) {
      await db
        .updateTable('chorus_charts')
        .set({
          artist_normalized: normalizeStrForMatching(row.artist ?? ''),
          charter_normalized: normalizeStrForMatching(row.charter ?? ''),
          name_normalized: normalizeStrForMatching(row.name ?? ''),
        })
        .where('md5', '=', row.md5)
        .execute();
    }

    // JS pre-normalization for spotify_tracks (uses id as primary key)
    const trackRows = await db
      .selectFrom('spotify_tracks')
      .select(['id', 'artist', 'name'])
      .execute();

    for (const row of trackRows) {
      await db
        .updateTable('spotify_tracks')
        .set({
          artist_normalized: normalizeStrForMatching(row.artist ?? ''),
          name_normalized: normalizeStrForMatching(row.name ?? ''),
        })
        .where('id', '=', row.id)
        .execute();
    }
  },

  async down(db: Kysely<any>) {
    // Drop normalized columns from chorus_charts
    await db.schema
      .alterTable('chorus_charts')
      .dropColumn('artist_bucket')
      .execute();

    await db.schema
      .alterTable('chorus_charts')
      .dropColumn('artist_normalized')
      .execute();

    await db.schema
      .alterTable('chorus_charts')
      .dropColumn('charter_normalized')
      .execute();

    await db.schema
      .alterTable('chorus_charts')
      .dropColumn('name_normalized')
      .execute();

    // Drop normalized columns from spotify_tracks
    await db.schema
      .alterTable('spotify_tracks')
      .dropColumn('artist_bucket')
      .execute();

    await db.schema
      .alterTable('spotify_tracks')
      .dropColumn('artist_normalized')
      .execute();

    await db.schema
      .alterTable('spotify_tracks')
      .dropColumn('name_normalized')
      .execute();
  },
};
