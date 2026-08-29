import { championSquareUrl, fetchChampionCatalog, type ChampionCatalogRow } from "./riot";
import { fetchArenaTiers, type MappedArenaTier } from "./arenaTiers";
import {
	backupFromTables,
	parseBackupJson,
	stringifyBackup,
	type ParseBackupResult,
	type TrackerBackup,
} from "./backup";
import { getTrackerDb, type TrackerDexie } from "./idb";

const MASTER_TARGET = 60;

const OUTBOUND_META = new Set(["ddragon_version"]);

function isOutboundMetaKey(key: string) {
	return OUTBOUND_META.has(key) || key.startsWith("arena_tiers_") || key.startsWith("lcu_");
}

export type TrackerChampion = {
	id: number;
	alias: string;
	nameEn: string;
	nameZh: string;
	hasFirst: boolean;
	masteryLevel: number;
	masteryPoints: number;
	lastPlay: number | null;
	arenaTier: string | null;
	arenaRank: number | null;
	imageUrl: string;
};

export type LiveOverlay = {
	catalog: ChampionCatalogRow[];
	ddragonVersion: string | null;
	arenaTiers: MappedArenaTier[];
	arenaTiersVersion?: string | null;
};

export async function fetchLiveOverlay(): Promise<LiveOverlay> {
	const catalog = await fetchChampionCatalog();
	let arenaTiers: MappedArenaTier[] = [];
	let arenaTiersVersion: string | null = null;
	try {
		const fetched = await fetchArenaTiers();
		arenaTiers = fetched.rows;
		arenaTiersVersion = fetched.version;
	} catch {
		arenaTiers = [];
	}
	return {
		catalog: catalog.champions,
		ddragonVersion: catalog.version,
		arenaTiers,
		arenaTiersVersion,
	};
}

export async function getMeta(key: string, db: TrackerDexie = getTrackerDb()) {
	const row = await db.meta.get(key);
	return row ? row.value : null;
}

export async function setMeta(
	key: string,
	value: string | number,
	db: TrackerDexie = getTrackerDb(),
) {
	await db.meta.put({ key, value: String(value) });
}

export async function getTrackerState(live: LiveOverlay, db: TrackerDexie = getTrackerDb()) {
	const [firstRows, masteryRows] = await Promise.all([
		db.arenaFirsts.toArray(),
		db.championMastery.toArray(),
	]);
	const firstById = new Map(firstRows.map((row) => [row.championId, row]));
	const masteryById = new Map(masteryRows.map((row) => [row.championId, row]));
	const tierById = new Map(live.arenaTiers.map((row) => [row.championId, row]));
	const mapped: TrackerChampion[] = live.catalog.map((c) => {
		const first = firstById.get(c.id);
		const mastery = masteryById.get(c.id);
		const hasFirst = Boolean(first?.hasFirst);
		const tier = tierById.get(c.id);
		return {
			id: c.id,
			alias: c.alias,
			nameEn: c.nameEn,
			nameZh: c.nameZh,
			hasFirst,
			masteryLevel: mastery?.level || 0,
			masteryPoints: mastery?.points || 0,
			lastPlay: mastery?.lastPlay == null ? null : mastery.lastPlay,
			arenaTier: tier?.tier ?? null,
			arenaRank: tier?.rank ?? null,
			imageUrl: championSquareUrl(live.ddragonVersion, c.alias),
		};
	});
	mapped.sort((a, b) => {
		const points = (b.masteryPoints || 0) - (a.masteryPoints || 0);
		if (points !== 0) return points;
		return a.nameEn.localeCompare(b.nameEn, undefined, { sensitivity: "accent" });
	});
	const [seededAt, summoner, masteryCapturedAt] = await Promise.all([
		getMeta("seeded_at", db),
		getMeta("summoner", db),
		getMeta("mastery_captured_at", db),
	]);
	const firstCount = mapped.filter((c) => c.hasFirst).length;
	return {
		champions: mapped,
		firstCount,
		target: MASTER_TARGET,
		seededAt,
		summoner,
		masteryCapturedAt,
		ddragonVersion: live.ddragonVersion,
		arenaTiersVersion: live.arenaTiersVersion ?? null,
	};
}

export async function applyChampionMasteries(
	rows: { championId: number; level: number; points: number; lastPlay: number | null }[],
	now = new Date().toISOString(),
	db: TrackerDexie = getTrackerDb(),
	knownIds?: Set<number>,
) {
	const accepted = knownIds ? rows.filter((row) => knownIds.has(row.championId)) : rows;
	await db.transaction("rw", db.championMastery, db.meta, async () => {
		await db.championMastery.clear();
		if (accepted.length > 0) {
			await db.championMastery.bulkAdd(
				accepted.map((row) => ({
					championId: row.championId,
					level: row.level,
					points: row.points,
					lastPlay: row.lastPlay,
					capturedAt: now,
				})),
			);
		}
		await db.meta.put({ key: "mastery_captured_at", value: now });
		await db.meta.put({ key: "mastery_count", value: String(accepted.length) });
		await db.meta.put({ key: "mastery_source", value: "import" });
	});
	return { applied: accepted.length, capturedAt: now, source: "import" as const };
}

export async function setChampionFirst(
	championId: number,
	hasFirst: boolean,
	db: TrackerDexie = getTrackerDb(),
	knownIds?: Set<number>,
) {
	if (knownIds && !knownIds.has(championId)) {
		throw new Error(`Unknown champion id ${championId}`);
	}
	const now = new Date().toISOString();
	await db.arenaFirsts.put({ championId, hasFirst, updatedAt: now });
}

export async function applyArenaFirsts(
	completedIds: number[],
	now = new Date().toISOString(),
	db: TrackerDexie = getTrackerDb(),
	knownIds?: Set<number>,
) {
	let applied = 0;
	let skipped = 0;
	await db.transaction("rw", db.arenaFirsts, async () => {
		const existing = await db.arenaFirsts.toArray();
		for (const row of existing) {
			await db.arenaFirsts.put({ ...row, hasFirst: false, updatedAt: now });
		}
		for (const id of completedIds) {
			if (knownIds && !knownIds.has(id)) {
				skipped += 1;
				continue;
			}
			await db.arenaFirsts.put({ championId: id, hasFirst: true, updatedAt: now });
			applied += 1;
		}
	});
	return { applied, skipped };
}

export async function exportTrackerBackup(
	db: TrackerDexie = getTrackerDb(),
	exportedAt = new Date().toISOString(),
): Promise<TrackerBackup> {
	const [arenaFirsts, championMastery, meta] = await Promise.all([
		db.arenaFirsts.toArray(),
		db.championMastery.toArray(),
		db.meta.toArray(),
	]);
	arenaFirsts.sort((a, b) => a.championId - b.championId);
	championMastery.sort((a, b) => a.championId - b.championId);
	const userMeta = meta
		.filter((row) => !isOutboundMetaKey(row.key))
		.sort((a, b) => a.key.localeCompare(b.key));
	return backupFromTables(
		{
			champions: [],
			arenaFirsts,
			championMastery,
			championArenaTiers: [],
			meta: userMeta,
		},
		exportedAt,
	);
}

export async function replaceFromBackup(backup: TrackerBackup, db: TrackerDexie = getTrackerDb()) {
	const userMeta = backup.tables.meta.filter((row) => !isOutboundMetaKey(row.key));
	await db.transaction("rw", [db.arenaFirsts, db.championMastery, db.meta], async () => {
		await db.arenaFirsts.clear();
		await db.championMastery.clear();
		await db.meta.clear();
		if (backup.tables.arenaFirsts.length > 0) {
			await db.arenaFirsts.bulkAdd(backup.tables.arenaFirsts);
		}
		if (backup.tables.championMastery.length > 0) {
			await db.championMastery.bulkAdd(backup.tables.championMastery);
		}
		if (userMeta.length > 0) {
			await db.meta.bulkAdd(userMeta);
		}
	});
}

export async function importTrackerBackupJson(
	text: string,
	db: TrackerDexie = getTrackerDb(),
): Promise<ParseBackupResult> {
	const parsed = parseBackupJson(text);
	if (!parsed.ok) return parsed;
	await replaceFromBackup(parsed.backup, db);
	return parsed;
}

export async function exportTrackerBackupText(db: TrackerDexie = getTrackerDb()) {
	return stringifyBackup(await exportTrackerBackup(db));
}
