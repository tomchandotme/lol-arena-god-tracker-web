import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	BACKUP_FORMAT,
	BACKUP_VERSION,
	backupFromTables,
	emptyBackup,
	parseBackup,
	parseBackupJson,
	stringifyBackup,
} from "./backup";
import { exportSqliteFile, sqliteRowCounts } from "./sqlite-export";

const tables = {
	champions: [
		{ id: 1, alias: "Annie", nameEn: "Annie", nameZh: "安妮" },
		{ id: 2, alias: "Olaf", nameEn: "Olaf", nameZh: "奧拉夫" },
	],
	arenaFirsts: [{ championId: 1, hasFirst: true, updatedAt: "2026-08-21T00:00:00.000Z" }],
	championMastery: [
		{
			championId: 2,
			level: 7,
			points: 90_000,
			lastPlay: null,
			capturedAt: "2026-08-21T00:00:00.000Z",
		},
	],
	championArenaTiers: [
		{ championId: 1, tier: "B", rank: 66, capturedAt: "2026-08-21T00:00:00.000Z" },
	],
	meta: [
		{ key: "ddragon_version", value: "15.1.1" },
		{ key: "summoner", value: "Player#NA1" },
	],
};

describe("backup parse", () => {
	test("round-trips a complete dump", () => {
		const backup = backupFromTables(tables, "2026-08-21T12:00:00.000Z");
		const parsed = parseBackupJson(stringifyBackup(backup));
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;
		expect(parsed.backup.format).toBe(BACKUP_FORMAT);
		expect(parsed.backup.version).toBe(BACKUP_VERSION);
		expect(parsed.backup.tables).toEqual(tables);
	});

	test("rejects unknown format and orphan foreign keys", () => {
		const badFormat = parseBackup({ ...emptyBackup(), format: "nope" });
		expect(badFormat.ok).toBe(false);
		if (badFormat.ok) return;
		expect(badFormat.error.code).toBe("unknown_format");

		const orphan = parseBackup(
			backupFromTables({
				...tables,
				arenaFirsts: [{ championId: 99, hasFirst: true, updatedAt: "2026-08-21T00:00:00.000Z" }],
			}),
		);
		expect(orphan.ok).toBe(false);
		if (orphan.ok) return;
		expect(orphan.error.code).toBe("unknown_champion");
	});

	test("rejects invalid JSON text", () => {
		const parsed = parseBackupJson("{");
		expect(parsed.ok).toBe(false);
		if (parsed.ok) return;
		expect(parsed.error.code).toBe("invalid_json");
	});

	test("allows firsts without a catalog snapshot", () => {
		const parsed = parseBackup(
			backupFromTables({
				champions: [],
				arenaFirsts: [{ championId: 1, hasFirst: true, updatedAt: "2026-08-21T00:00:00.000Z" }],
				championMastery: [],
				championArenaTiers: [],
				meta: [{ key: "summoner", value: "Player#NA1" }],
			}),
		);
		expect(parsed.ok).toBe(true);
	});
});

describe("sqlite export", () => {
	test("dumps every row from all four tables", () => {
		const dir = mkdtempSync(join(tmpdir(), "arena-sqlite-export-"));
		const path = join(dir, "tracker.sqlite");
		const db = new Database(path, { create: true });
		db.exec(`
      CREATE TABLE champions (
        id INTEGER PRIMARY KEY,
        alias TEXT NOT NULL,
        name_en TEXT NOT NULL,
        name_zh TEXT NOT NULL
      );
      CREATE TABLE arena_firsts (
        champion_id INTEGER PRIMARY KEY,
        has_first INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE champion_mastery (
        champion_id INTEGER PRIMARY KEY,
        level INTEGER NOT NULL DEFAULT 0,
        points INTEGER NOT NULL DEFAULT 0,
        last_play INTEGER,
        captured_at TEXT NOT NULL
      );
      CREATE TABLE champion_arena_tiers (
        champion_id INTEGER PRIMARY KEY,
        tier TEXT NOT NULL,
        rank INTEGER,
        captured_at TEXT NOT NULL
      );
    `);
		db.exec(`
      INSERT INTO champions (id, alias, name_en, name_zh) VALUES
        (1, 'Annie', 'Annie', '安妮'),
        (2, 'Olaf', 'Olaf', '奧拉夫');
      INSERT INTO arena_firsts (champion_id, has_first, updated_at)
        VALUES (1, 1, '2026-08-21T00:00:00.000Z');
      INSERT INTO champion_mastery (champion_id, level, points, last_play, captured_at)
        VALUES (2, 7, 90000, NULL, '2026-08-21T00:00:00.000Z');
      INSERT INTO champion_arena_tiers (champion_id, tier, rank, captured_at)
        VALUES (1, 'B', 66, '2026-08-21T00:00:00.000Z');
      INSERT INTO meta (key, value) VALUES
        ('ddragon_version', '15.1.1'),
        ('summoner', 'Player#NA1');
    `);
		db.close();

		const backup = exportSqliteFile(path, "2026-08-29T00:00:00.000Z");
		expect(sqliteRowCounts(backup)).toEqual({
			champions: 2,
			arenaFirsts: 1,
			championMastery: 1,
			championArenaTiers: 1,
			meta: 2,
		});
		expect(backup.tables.champions.map((row) => row.id)).toEqual([1, 2]);
		expect(backup.tables.arenaFirsts[0]).toEqual({
			championId: 1,
			hasFirst: true,
			updatedAt: "2026-08-21T00:00:00.000Z",
		});
		expect(backup.tables.championMastery[0]?.lastPlay).toBeNull();
		expect(backup.tables.championArenaTiers[0]).toEqual({
			championId: 1,
			tier: "B",
			rank: 66,
			capturedAt: "2026-08-21T00:00:00.000Z",
		});
		expect(parseBackup(backup).ok).toBe(true);
	});

	test("fails when a required table is missing", () => {
		const dir = mkdtempSync(join(tmpdir(), "arena-sqlite-missing-"));
		const path = join(dir, "tracker.sqlite");
		writeFileSync(path, "");
		const db = new Database(path);
		db.exec(
			"CREATE TABLE champions (id INTEGER PRIMARY KEY, alias TEXT, name_en TEXT, name_zh TEXT)",
		);
		db.close();
		expect(() => exportSqliteFile(path)).toThrow("missing tables");
	});
});
