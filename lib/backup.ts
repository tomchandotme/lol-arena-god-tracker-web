export const BACKUP_FORMAT = "arena-god-tracker-backup";
export const BACKUP_VERSION = 1;

export type ChampionRecord = {
	id: number;
	alias: string;
	nameEn: string;
	nameZh: string;
};

export type ArenaFirstRecord = {
	championId: number;
	hasFirst: boolean;
	updatedAt: string;
};

export type ChampionMasteryRecord = {
	championId: number;
	level: number;
	points: number;
	lastPlay: number | null;
	capturedAt: string;
};

export type ChampionArenaTierRecord = {
	championId: number;
	tier: string;
	rank: number | null;
	capturedAt: string;
};

export type MetaRecord = {
	key: string;
	value: string;
};

export type BackupTables = {
	champions: ChampionRecord[];
	arenaFirsts: ArenaFirstRecord[];
	championMastery: ChampionMasteryRecord[];
	championArenaTiers: ChampionArenaTierRecord[];
	meta: MetaRecord[];
};

export type TrackerBackup = {
	format: typeof BACKUP_FORMAT;
	version: number;
	exportedAt: string;
	tables: BackupTables;
};

export type BackupIssue = {
	code: string;
	message: string;
	path?: string;
};

export type ParseBackupResult =
	| { ok: true; backup: TrackerBackup; warnings: BackupIssue[] }
	| { ok: false; error: BackupIssue; issues: BackupIssue[] };

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(issues: BackupIssue[]): ParseBackupResult {
	const error = issues[0] ?? { code: "invalid_backup", message: "Invalid backup" };
	return { ok: false, error, issues };
}

function issue(code: string, message: string, path?: string): BackupIssue {
	return path ? { code, message, path } : { code, message };
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

function readString(value: unknown, path: string, issues: BackupIssue[]) {
	if (typeof value !== "string" || value.length === 0) {
		issues.push(issue("invalid_type", `Expected non-empty string at ${path}`, path));
		return "";
	}
	return value;
}

function readInt(value: unknown, path: string, issues: BackupIssue[]) {
	if (!isFiniteNumber(value) || !Number.isInteger(value)) {
		issues.push(issue("invalid_type", `Expected integer at ${path}`, path));
		return 0;
	}
	return value;
}

function parseChampions(raw: unknown, issues: BackupIssue[]) {
	if (!Array.isArray(raw)) {
		issues.push(issue("invalid_type", "tables.champions must be an array", "tables.champions"));
		return [];
	}
	const seen = new Set<number>();
	const rows: ChampionRecord[] = [];
	raw.forEach((item, index) => {
		const path = `tables.champions[${index}]`;
		if (!isRecord(item)) {
			issues.push(issue("invalid_type", `Expected object at ${path}`, path));
			return;
		}
		const id = readInt(item.id, `${path}.id`, issues);
		const alias = readString(item.alias, `${path}.alias`, issues);
		const nameEn = readString(item.nameEn, `${path}.nameEn`, issues);
		const nameZh = readString(item.nameZh, `${path}.nameZh`, issues);
		if (seen.has(id)) {
			issues.push(issue("duplicate_key", `Duplicate champion id ${id}`, `${path}.id`));
		}
		seen.add(id);
		rows.push({ id, alias, nameEn, nameZh });
	});
	return rows;
}

function parseArenaFirsts(raw: unknown, championIds: Set<number>, issues: BackupIssue[]) {
	if (!Array.isArray(raw)) {
		issues.push(issue("invalid_type", "tables.arenaFirsts must be an array", "tables.arenaFirsts"));
		return [];
	}
	const seen = new Set<number>();
	const rows: ArenaFirstRecord[] = [];
	raw.forEach((item, index) => {
		const path = `tables.arenaFirsts[${index}]`;
		if (!isRecord(item)) {
			issues.push(issue("invalid_type", `Expected object at ${path}`, path));
			return;
		}
		const championId = readInt(item.championId, `${path}.championId`, issues);
		if (typeof item.hasFirst !== "boolean") {
			issues.push(
				issue("invalid_type", `Expected boolean at ${path}.hasFirst`, `${path}.hasFirst`),
			);
		}
		const updatedAt = readString(item.updatedAt, `${path}.updatedAt`, issues);
		if (seen.has(championId)) {
			issues.push(
				issue(
					"duplicate_key",
					`Duplicate arena first for champion ${championId}`,
					`${path}.championId`,
				),
			);
		}
		seen.add(championId);
		if (championIds.size > 0 && !championIds.has(championId)) {
			issues.push(
				issue(
					"unknown_champion",
					`arenaFirsts references unknown champion ${championId}`,
					`${path}.championId`,
				),
			);
		}
		rows.push({ championId, hasFirst: item.hasFirst === true, updatedAt });
	});
	return rows;
}

function parseMastery(raw: unknown, championIds: Set<number>, issues: BackupIssue[]) {
	if (!Array.isArray(raw)) {
		issues.push(
			issue("invalid_type", "tables.championMastery must be an array", "tables.championMastery"),
		);
		return [];
	}
	const seen = new Set<number>();
	const rows: ChampionMasteryRecord[] = [];
	raw.forEach((item, index) => {
		const path = `tables.championMastery[${index}]`;
		if (!isRecord(item)) {
			issues.push(issue("invalid_type", `Expected object at ${path}`, path));
			return;
		}
		const championId = readInt(item.championId, `${path}.championId`, issues);
		const level = readInt(item.level, `${path}.level`, issues);
		const points = readInt(item.points, `${path}.points`, issues);
		let lastPlay: number | null = null;
		if (item.lastPlay !== null && item.lastPlay !== undefined) {
			if (!isFiniteNumber(item.lastPlay) || !Number.isInteger(item.lastPlay)) {
				issues.push(
					issue("invalid_type", `Expected integer or null at ${path}.lastPlay`, `${path}.lastPlay`),
				);
			} else {
				lastPlay = item.lastPlay;
			}
		}
		const capturedAt = readString(item.capturedAt, `${path}.capturedAt`, issues);
		if (seen.has(championId)) {
			issues.push(
				issue(
					"duplicate_key",
					`Duplicate mastery for champion ${championId}`,
					`${path}.championId`,
				),
			);
		}
		seen.add(championId);
		if (championIds.size > 0 && !championIds.has(championId)) {
			issues.push(
				issue(
					"unknown_champion",
					`championMastery references unknown champion ${championId}`,
					`${path}.championId`,
				),
			);
		}
		rows.push({ championId, level, points, lastPlay, capturedAt });
	});
	return rows;
}

function parseArenaTiers(raw: unknown, championIds: Set<number>, issues: BackupIssue[]) {
	if (!Array.isArray(raw)) {
		issues.push(
			issue(
				"invalid_type",
				"tables.championArenaTiers must be an array",
				"tables.championArenaTiers",
			),
		);
		return [];
	}
	const seen = new Set<number>();
	const rows: ChampionArenaTierRecord[] = [];
	raw.forEach((item, index) => {
		const path = `tables.championArenaTiers[${index}]`;
		if (!isRecord(item)) {
			issues.push(issue("invalid_type", `Expected object at ${path}`, path));
			return;
		}
		const championId = readInt(item.championId, `${path}.championId`, issues);
		const tier = readString(item.tier, `${path}.tier`, issues);
		let rank: number | null = null;
		if (item.rank !== null && item.rank !== undefined) {
			if (!isFiniteNumber(item.rank) || !Number.isInteger(item.rank)) {
				issues.push(
					issue("invalid_type", `Expected integer or null at ${path}.rank`, `${path}.rank`),
				);
			} else {
				rank = item.rank;
			}
		}
		const capturedAt = readString(item.capturedAt, `${path}.capturedAt`, issues);
		if (seen.has(championId)) {
			issues.push(
				issue(
					"duplicate_key",
					`Duplicate arena tier for champion ${championId}`,
					`${path}.championId`,
				),
			);
		}
		seen.add(championId);
		if (championIds.size > 0 && !championIds.has(championId)) {
			issues.push(
				issue(
					"unknown_champion",
					`championArenaTiers references unknown champion ${championId}`,
					`${path}.championId`,
				),
			);
		}
		rows.push({ championId, tier, rank, capturedAt });
	});
	return rows;
}

function parseMeta(raw: unknown, issues: BackupIssue[]) {
	if (!Array.isArray(raw)) {
		issues.push(issue("invalid_type", "tables.meta must be an array", "tables.meta"));
		return [];
	}
	const seen = new Set<string>();
	const rows: MetaRecord[] = [];
	raw.forEach((item, index) => {
		const path = `tables.meta[${index}]`;
		if (!isRecord(item)) {
			issues.push(issue("invalid_type", `Expected object at ${path}`, path));
			return;
		}
		const key = readString(item.key, `${path}.key`, issues);
		const value = typeof item.value === "string" ? item.value : "";
		if (typeof item.value !== "string") {
			issues.push(issue("invalid_type", `Expected string at ${path}.value`, `${path}.value`));
		}
		if (seen.has(key)) {
			issues.push(issue("duplicate_key", `Duplicate meta key ${key}`, `${path}.key`));
		}
		seen.add(key);
		rows.push({ key, value });
	});
	return rows;
}

export function emptyBackup(exportedAt = new Date().toISOString()): TrackerBackup {
	return {
		format: BACKUP_FORMAT,
		version: BACKUP_VERSION,
		exportedAt,
		tables: {
			champions: [],
			arenaFirsts: [],
			championMastery: [],
			championArenaTiers: [],
			meta: [],
		},
	};
}

export function parseBackup(input: unknown): ParseBackupResult {
	const issues: BackupIssue[] = [];
	if (!isRecord(input)) {
		return fail([issue("invalid_json", "Backup must be a JSON object")]);
	}
	if (input.format !== BACKUP_FORMAT) {
		issues.push(
			issue(
				"unknown_format",
				`Expected format ${BACKUP_FORMAT}, got ${String(input.format)}`,
				"format",
			),
		);
	}
	if (!isFiniteNumber(input.version) || !Number.isInteger(input.version)) {
		issues.push(issue("invalid_type", "version must be an integer", "version"));
	} else if (input.version !== BACKUP_VERSION) {
		issues.push(
			issue("unsupported_version", `Unsupported backup version ${input.version}`, "version"),
		);
	}
	const exportedAt = readString(input.exportedAt, "exportedAt", issues);
	if (!isRecord(input.tables)) {
		issues.push(issue("invalid_type", "tables must be an object", "tables"));
		return fail(issues);
	}
	const champions = parseChampions(input.tables.champions, issues);
	const championIds = new Set(champions.map((row) => row.id));
	const arenaFirsts = parseArenaFirsts(input.tables.arenaFirsts, championIds, issues);
	const championMastery = parseMastery(input.tables.championMastery, championIds, issues);
	const championArenaTiers = parseArenaTiers(input.tables.championArenaTiers, championIds, issues);
	const meta = parseMeta(input.tables.meta, issues);
	if (issues.length > 0) {
		return fail(issues);
	}
	return {
		ok: true,
		backup: {
			format: BACKUP_FORMAT,
			version: BACKUP_VERSION,
			exportedAt,
			tables: { champions, arenaFirsts, championMastery, championArenaTiers, meta },
		},
		warnings: [],
	};
}

export function parseBackupJson(text: string): ParseBackupResult {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		return fail([issue("invalid_json", "File is not valid JSON")]);
	}
	return parseBackup(parsed);
}

export function stringifyBackup(backup: TrackerBackup) {
	return `${JSON.stringify(backup, null, 2)}\n`;
}

export function backupFromTables(
	tables: BackupTables,
	exportedAt = new Date().toISOString(),
): TrackerBackup {
	return {
		format: BACKUP_FORMAT,
		version: BACKUP_VERSION,
		exportedAt,
		tables,
	};
}
