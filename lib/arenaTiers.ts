export const OPGG_ARENA_CHAMPIONS = "https://lol-api-champion.op.gg/api/global/champions/arena";

export function opggArenaBuildUrl(alias: string | null | undefined) {
	const slug = String(alias || "")
		.trim()
		.toLowerCase();
	if (!slug) return "";
	return `https://op.gg/lol/modes/arena/${encodeURIComponent(slug)}/build`;
}

export const ARENA_TIER_LETTERS = ["S", "A", "B", "C", "D"] as const;
export type ArenaTierLetter = (typeof ARENA_TIER_LETTERS)[number];

export type MappedArenaTier = {
	championId: number;
	tier: ArenaTierLetter;
	rank: number | null;
};

export type OpggArenaChampionRow = {
	id?: number;
	is_rip?: boolean;
	average_stats?: {
		tier?: number | null;
		rank?: number | null;
		tier_data?: { tier?: number | null; rank?: number | null } | null;
	} | null;
};

export type OpggArenaPayload = {
	data?: OpggArenaChampionRow[] | null;
	meta?: { version?: string | null; cached_at?: string | null } | null;
};

export function letterFromOpggTier(value: unknown): ArenaTierLetter | null {
	const n = Number(value);
	if (!Number.isInteger(n) || n < 1 || n > ARENA_TIER_LETTERS.length) return null;
	return ARENA_TIER_LETTERS[n - 1] ?? null;
}

export function mapOpggArenaTiers(payload: unknown): {
	version: string | null;
	rows: MappedArenaTier[];
} {
	const body = payload as OpggArenaPayload;
	const rows: MappedArenaTier[] = [];
	for (const row of body.data || []) {
		if (row.is_rip) continue;
		const id = Number(row.id);
		if (!Number.isInteger(id) || id <= 0) continue;
		const stats = row.average_stats;
		if (!stats) continue;
		const tierNum = stats.tier ?? stats.tier_data?.tier;
		const tier = letterFromOpggTier(tierNum);
		if (!tier) continue;
		const rankRaw = stats.rank ?? stats.tier_data?.rank;
		const rank = Number.isInteger(Number(rankRaw)) ? Number(rankRaw) : null;
		rows.push({ championId: id, tier, rank });
	}
	return { version: body.meta?.version || null, rows };
}

export async function fetchArenaTiers(url = OPGG_ARENA_CHAMPIONS) {
	const res = await fetch(url);
	if (!res.ok) {
		throw new Error(`OP.GG arena tiers HTTP ${res.status}`);
	}
	return mapOpggArenaTiers(await res.json());
}

export function championStampLabel(hasFirst: boolean, arenaTier: string | null | undefined) {
	if (hasFirst) return "1ST";
	if (arenaTier) return arenaTier;
	return "—";
}

export function formatArenaSeed(rank: number | null | undefined) {
	const n = Number(rank);
	if (!Number.isFinite(n) || n <= 0) return "";
	return `#${Math.round(n)}`;
}

export function groupChampionsByArenaTier<T extends { arenaTier: string | null }>(rows: T[]) {
	const buckets = new Map<string, T[]>();
	for (const letter of ARENA_TIER_LETTERS) buckets.set(letter, []);
	buckets.set("", []);
	for (const row of rows) {
		const key = ARENA_TIER_LETTERS.includes(row.arenaTier as ArenaTierLetter)
			? (row.arenaTier as string)
			: "";
		buckets.get(key)?.push(row);
	}
	return [...buckets.entries()]
		.filter(([, list]) => list.length > 0)
		.map(([tier, list]) => ({
			tier: tier || null,
			champions: list,
		}));
}
