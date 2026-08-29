import Dexie, { type EntityTable, type Transaction } from "dexie";
import type {
	ArenaFirstRecord,
	ChampionArenaTierRecord,
	ChampionMasteryRecord,
	ChampionRecord,
	MetaRecord,
} from "./backup";

export const TRACKER_DB_NAME = "arena-god-tracker";

export type TrackerDexie = Dexie & {
	champions: EntityTable<ChampionRecord, "id">;
	arenaFirsts: EntityTable<ArenaFirstRecord, "championId">;
	championMastery: EntityTable<ChampionMasteryRecord, "championId">;
	championArenaTiers: EntityTable<ChampionArenaTierRecord, "championId">;
	meta: EntityTable<MetaRecord, "key">;
};

function applyStores(db: Dexie) {
	db.version(1).stores({
		champions: "id",
		arenaFirsts: "championId",
		championMastery: "championId",
		meta: "key",
	});
	db.version(2)
		.stores({
			champions: "id, alias",
			arenaFirsts: "championId, hasFirst",
			championMastery: "championId, points, lastPlay",
			meta: "key",
		})
		.upgrade(async (tx: Transaction) => {
			await tx
				.table("champions")
				.toCollection()
				.modify((row: ChampionRecord) => {
					row.alias = row.alias ?? "";
				});
		});
	db.version(3).stores({
		champions: "id, alias",
		arenaFirsts: "championId, hasFirst",
		championMastery: "championId, points, lastPlay",
		championArenaTiers: "championId, tier, rank",
		meta: "key",
	});
}

export function createTrackerDb(name = TRACKER_DB_NAME): TrackerDexie {
	const db = new Dexie(name) as TrackerDexie;
	applyStores(db);
	return db;
}

let singleton: TrackerDexie | null = null;

export function getTrackerDb(): TrackerDexie {
	if (!singleton) {
		singleton = createTrackerDb();
	}
	return singleton;
}
