import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { indexedDB, IDBKeyRange } from "fake-indexeddb";
import Dexie from "dexie";

Dexie.dependencies.indexedDB = indexedDB;
Dexie.dependencies.IDBKeyRange = IDBKeyRange;
import { backupFromTables } from "./backup";
import { createTrackerDb, TRACKER_DB_NAME } from "./idb";
import {
	applyArenaFirsts,
	applyChampionMasteries,
	exportTrackerBackup,
	getMeta,
	getTrackerState,
	importTrackerBackupJson,
	replaceFromBackup,
	setChampionFirst,
	type LiveOverlay,
} from "./tracker";
import type { TrackerDexie } from "./idb";

const catalog = [
	{ id: 1, alias: "Annie", nameEn: "Annie", nameZh: "安妮" },
	{ id: 2, alias: "Olaf", nameEn: "Olaf", nameZh: "奧拉夫" },
];

function live(over: Partial<LiveOverlay> = {}): LiveOverlay {
	return {
		catalog,
		ddragonVersion: "15.1.1",
		arenaTiers: [],
		arenaTiersVersion: null,
		...over,
	};
}

const known = new Set(catalog.map((row) => row.id));

let db: TrackerDexie;
let n = 0;

beforeEach(async () => {
	n += 1;
	db = createTrackerDb(`arena-test-${n}-${Date.now()}`);
	await db.open();
});

afterEach(async () => {
	db.close();
	await Dexie.delete(db.name);
});

describe("tracker indexeddb", () => {
	test("toggles arena firsts against a live catalog, not stored champions", async () => {
		await setChampionFirst(1, true, db, known);
		let state = await getTrackerState(live(), db);
		expect(state.firstCount).toBe(1);
		expect(state.champions.find((c) => c.id === 1)?.hasFirst).toBe(true);
		expect(state.champions.find((c) => c.id === 1)?.imageUrl).toContain(
			"/15.1.1/img/champion/Annie.png",
		);
		expect(await db.champions.count()).toBe(0);

		await setChampionFirst(1, false, db, known);
		state = await getTrackerState(live({ ddragonVersion: "16.16.1" }), db);
		expect(state.firstCount).toBe(0);
		expect(state.ddragonVersion).toBe("16.16.1");
		expect(state.champions.find((c) => c.id === 1)?.imageUrl).toContain("/16.16.1/");
	});

	test("applyArenaFirsts skips unknown ids and replaces previous firsts", async () => {
		await setChampionFirst(1, true, db, known);
		const result = await applyArenaFirsts([2, 99], new Date().toISOString(), db, known);
		expect(result.applied).toBe(1);
		expect(result.skipped).toBe(1);

		const state = await getTrackerState(live(), db);
		expect(state.champions.find((c) => c.id === 1)?.hasFirst).toBe(false);
		expect(state.champions.find((c) => c.id === 2)?.hasFirst).toBe(true);
	});

	test("applyChampionMasteries ignores unknown champions and sorts by points", async () => {
		await applyChampionMasteries(
			[
				{ championId: 2, level: 7, points: 90_000, lastPlay: null },
				{ championId: 1, level: 4, points: 12_000, lastPlay: 1 },
				{ championId: 999, level: 7, points: 999_999, lastPlay: null },
			],
			new Date().toISOString(),
			db,
			known,
		);

		const state = await getTrackerState(live(), db);
		expect(state.champions.map((c) => c.id)).toEqual([2, 1]);
		expect(state.champions[0]?.masteryPoints).toBe(90_000);
		expect(state.champions[0]?.lastPlay).toBeNull();
		expect(state.champions[1]?.lastPlay).toBe(1);
		expect(await getMeta("mastery_count", db)).toBe("2");
	});

	test("setChampionFirst rejects unknown ids when a catalog is provided", async () => {
		await expect(setChampionFirst(404, true, db, known)).rejects.toThrow("Unknown champion id 404");
	});

	test("live OP.GG tiers stay on firsted champs so they remain in their class", async () => {
		await setChampionFirst(1, true, db, known);
		const state = await getTrackerState(
			live({
				arenaTiers: [
					{ championId: 1, tier: "S", rank: 1 },
					{ championId: 2, tier: "B", rank: 66 },
				],
				arenaTiersVersion: "16.17",
			}),
			db,
		);
		expect(state.champions.find((c) => c.id === 1)?.hasFirst).toBe(true);
		expect(state.champions.find((c) => c.id === 1)?.arenaTier).toBe("S");
		expect(state.champions.find((c) => c.id === 2)?.arenaTier).toBe("B");
		expect(state.arenaTiersVersion).toBe("16.17");
	});

	test("import keeps user rows and ignores outbound catalog, tiers, and patch meta", async () => {
		const invalid = await importTrackerBackupJson("{", db);
		expect(invalid.ok).toBe(false);
		if (invalid.ok) return;
		expect(invalid.error.code).toBe("invalid_json");

		const backup = backupFromTables({
			champions: catalog,
			arenaFirsts: [{ championId: 2, hasFirst: true, updatedAt: "2026-08-21T00:00:00.000Z" }],
			championMastery: [
				{
					championId: 1,
					level: 4,
					points: 12_000,
					lastPlay: 1,
					capturedAt: "2026-08-21T00:00:00.000Z",
				},
			],
			championArenaTiers: [
				{ championId: 2, tier: "A", rank: 3, capturedAt: "2026-08-21T00:00:00.000Z" },
			],
			meta: [
				{ key: "summoner", value: "Player#NA1" },
				{ key: "ddragon_version", value: "1.0.0" },
				{ key: "arena_tiers_source", value: "op.gg" },
				{ key: "lcu_value", value: "51" },
			],
		});
		await replaceFromBackup(backup, db);
		expect(await db.champions.count()).toBe(0);
		expect(await db.championArenaTiers.count()).toBe(0);
		expect(await getMeta("ddragon_version", db)).toBeNull();
		expect(await getMeta("arena_tiers_source", db)).toBeNull();
		expect(await getMeta("lcu_value", db)).toBeNull();

		const exported = await exportTrackerBackup(db, backup.exportedAt);
		expect(exported.tables.champions).toEqual([]);
		expect(exported.tables.championArenaTiers).toEqual([]);
		expect(exported.tables.arenaFirsts).toEqual(backup.tables.arenaFirsts);
		expect(exported.tables.championMastery).toEqual(backup.tables.championMastery);
		expect(exported.tables.meta).toEqual([{ key: "summoner", value: "Player#NA1" }]);

		const state = await getTrackerState(live({ ddragonVersion: "16.16.1" }), db);
		expect(state.summoner).toBe("Player#NA1");
		expect(state.ddragonVersion).toBe("16.16.1");
		expect(state.champions.find((c) => c.id === 2)?.hasFirst).toBe(true);
	});
});

describe("dexie schema migration", () => {
	test("keeps rows when upgrading from v1 stores to v2 indexes", async () => {
		const name = `${TRACKER_DB_NAME}-migrate-${Date.now()}`;
		const v1 = new Dexie(name);
		v1.version(1).stores({
			champions: "id",
			arenaFirsts: "championId",
			championMastery: "championId",
			meta: "key",
		});
		await v1.open();
		await v1.table("champions").add({ id: 1, alias: "Annie", nameEn: "Annie", nameZh: "安妮" });
		await v1.table("meta").add({ key: "summoner", value: "Player#NA1" });
		v1.close();

		const v2 = createTrackerDb(name);
		await v2.open();
		expect(await v2.champions.get(1)).toEqual({
			id: 1,
			alias: "Annie",
			nameEn: "Annie",
			nameZh: "安妮",
		});
		expect(await v2.meta.get("summoner")).toEqual({ key: "summoner", value: "Player#NA1" });
		v2.close();
		await Dexie.delete(name);
	});
});
