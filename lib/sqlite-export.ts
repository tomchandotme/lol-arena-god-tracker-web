import { Database } from "bun:sqlite";
import {
	backupFromTables,
	type ArenaFirstRecord,
	type ChampionArenaTierRecord,
	type ChampionMasteryRecord,
	type ChampionRecord,
	type MetaRecord,
	type TrackerBackup,
} from "./backup";

const REQUIRED_TABLES = ["champions", "arena_firsts", "meta", "champion_mastery"] as const;

function tableExists(db: Database, name: string) {
	const row = db
		.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
		.get(name) as { name: string } | null;
	return Boolean(row);
}

export function exportSqliteFile(
	dbPath: string,
	exportedAt = new Date().toISOString(),
): TrackerBackup {
	const db = new Database(dbPath, { readonly: true });
	try {
		const missing = REQUIRED_TABLES.filter((name) => !tableExists(db, name));
		if (missing.length > 0) {
			throw new Error(`SQLite is missing tables: ${missing.join(", ")}`);
		}

		const champions = db
			.query(`SELECT id, alias, name_en AS nameEn, name_zh AS nameZh FROM champions ORDER BY id`)
			.all() as ChampionRecord[];

		const arenaFirsts = (
			db
				.query(
					`SELECT champion_id AS championId, has_first AS hasFirst, updated_at AS updatedAt
           FROM arena_firsts ORDER BY champion_id`,
				)
				.all() as { championId: number; hasFirst: number; updatedAt: string }[]
		).map((row): ArenaFirstRecord => ({
			championId: row.championId,
			hasFirst: Boolean(row.hasFirst),
			updatedAt: row.updatedAt,
		}));

		const championMastery = (
			db
				.query(
					`SELECT champion_id AS championId, level, points, last_play AS lastPlay, captured_at AS capturedAt
           FROM champion_mastery ORDER BY champion_id`,
				)
				.all() as {
				championId: number;
				level: number;
				points: number;
				lastPlay: number | null;
				capturedAt: string;
			}[]
		).map((row): ChampionMasteryRecord => ({
			championId: row.championId,
			level: row.level,
			points: row.points,
			lastPlay: row.lastPlay == null ? null : row.lastPlay,
			capturedAt: row.capturedAt,
		}));

		let championArenaTiers: ChampionArenaTierRecord[] = [];
		if (tableExists(db, "champion_arena_tiers")) {
			championArenaTiers = (
				db
					.query(
						`SELECT champion_id AS championId, tier, rank, captured_at AS capturedAt
             FROM champion_arena_tiers ORDER BY champion_id`,
					)
					.all() as {
					championId: number;
					tier: string;
					rank: number | null;
					capturedAt: string;
				}[]
			).map((row): ChampionArenaTierRecord => ({
				championId: row.championId,
				tier: row.tier,
				rank: row.rank == null ? null : row.rank,
				capturedAt: row.capturedAt,
			}));
		}

		const extraTables = db
			.query(
				`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
			)
			.all() as { name: string }[];
		const known = new Set([...REQUIRED_TABLES, "champion_arena_tiers"]);
		const unknown = extraTables.map((row) => row.name).filter((name) => !known.has(name));
		if (unknown.length > 0) {
			throw new Error(`SQLite has unexported tables: ${unknown.join(", ")}`);
		}

		const meta = db.query(`SELECT key, value FROM meta ORDER BY key`).all() as MetaRecord[];

		return backupFromTables(
			{ champions, arenaFirsts, championMastery, championArenaTiers, meta },
			exportedAt,
		);
	} finally {
		db.close();
	}
}

export function sqliteRowCounts(backup: TrackerBackup) {
	return {
		champions: backup.tables.champions.length,
		arenaFirsts: backup.tables.arenaFirsts.length,
		championMastery: backup.tables.championMastery.length,
		championArenaTiers: backup.tables.championArenaTiers.length,
		meta: backup.tables.meta.length,
	};
}
