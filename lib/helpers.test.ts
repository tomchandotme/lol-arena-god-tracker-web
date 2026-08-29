import { describe, expect, test } from "bun:test";
import { formatLastPlay, formatPoints, searchPlaceholder } from "./format";
import { championSquareUrl, mapChampionCatalog } from "./riot";
import {
	championStampLabel,
	formatArenaSeed,
	groupChampionsByArenaTier,
	letterFromOpggTier,
	mapOpggArenaTiers,
} from "./arenaTiers";

describe("riot helpers", () => {
	test("championSquareUrl needs version and alias", () => {
		expect(championSquareUrl(null, "Annie")).toBe("");
		expect(championSquareUrl("15.1.1", "Annie")).toBe(
			"https://ddragon.leagueoflegends.com/cdn/15.1.1/img/champion/Annie.png",
		);
	});

	test("mapChampionCatalog prefers zh name and sorts by english", () => {
		const rows = mapChampionCatalog(
			{
				data: {
					Zyra: { key: "143", name: "Zyra" },
					Annie: { key: "1", name: "Annie" },
				},
			},
			{
				data: {
					Annie: { key: "1", name: "安妮" },
				},
			},
		);
		expect(rows.map((r) => r.alias)).toEqual(["Annie", "Zyra"]);
		expect(rows[0]?.nameZh).toBe("安妮");
		expect(rows[1]?.nameZh).toBe("Zyra");
	});
});

describe("display format", () => {
	test("formatPoints shortens large totals", () => {
		expect(formatPoints(999)).toBe("999");
		expect(formatPoints(1500)).toBe("1.5k");
		expect(formatPoints(12_400)).toBe("12k");
	});

	test("formatLastPlay treats missing and pre-2000 as never", () => {
		expect(formatLastPlay(null).label).toBe("never");
		expect(formatLastPlay(1).label).toBe("never");
	});

	test("formatLastPlay uses relative labels", () => {
		const now = Date.UTC(2026, 7, 21, 12, 0, 0);
		expect(formatLastPlay(now - 3 * 24 * 60 * 60 * 1000, now).label).toBe("3d");
		expect(formatLastPlay(Math.floor((now - 2 * 60 * 60 * 1000) / 1000), now).label).toBe("2h");
	});

	test("formatLastPlay title is locale-stable UTC", () => {
		const now = Date.UTC(2026, 7, 21, 12, 0, 0);
		expect(formatLastPlay(Date.UTC(2026, 7, 16, 10, 0, 0), now).title).toBe(
			"16 Aug 2026 10:00 UTC",
		);
	});
});

describe("searchPlaceholder", () => {
	test("uses the shortest real en, zh, and alias from the catalog", () => {
		expect(
			searchPlaceholder([
				{ id: 1, alias: "Annie", nameEn: "Annie", nameZh: "安妮" },
				{ id: 20, alias: "Nunu", nameEn: "Nunu & Willump", nameZh: "努努和威朗普" },
				{ id: 67, alias: "Vayne", nameEn: "Vayne", nameZh: "汎" },
				{ id: 103, alias: "Ahri", nameEn: "Ahri", nameZh: "阿璃" },
				{ id: 254, alias: "Vi", nameEn: "Vi", nameZh: "菲艾" },
			]),
		).toBe("Vi, 汎, Nunu");
	});

	test("skips alias when every alias matches english", () => {
		expect(
			searchPlaceholder([
				{ id: 1, alias: "Annie", nameEn: "Annie", nameZh: "安妮" },
				{ id: 254, alias: "Vi", nameEn: "Vi", nameZh: "菲艾" },
			]),
		).toBe("Vi, 安妮");
	});

	test("falls back without invented names when the list is empty", () => {
		expect(searchPlaceholder([])).toBe("English, 中文, or alias");
	});
});

describe("op.gg arena tiers", () => {
	test("maps numeric tiers to letters and skips rip rows", () => {
		expect(letterFromOpggTier(1)).toBe("S");
		expect(letterFromOpggTier(3)).toBe("B");
		const mapped = mapOpggArenaTiers({
			meta: { version: "16.17" },
			data: [
				{ id: 1, average_stats: { tier: 3, rank: 66 } },
				{ id: 2, is_rip: true, average_stats: { tier: 1, rank: 1 } },
				{ id: 3, average_stats: null },
			],
		});
		expect(mapped.version).toBe("16.17");
		expect(mapped.rows).toEqual([{ championId: 1, tier: "B", rank: 66 }]);
	});

	test("stamp prefers 1ST over a live tier letter", () => {
		expect(championStampLabel(true, "S")).toBe("1ST");
		expect(championStampLabel(false, "A")).toBe("A");
		expect(championStampLabel(false, null)).toBe("—");
	});

	test("groups a roster into S-A-B-C-D classes", () => {
		expect(formatArenaSeed(66)).toBe("#66");
		expect(formatArenaSeed(null)).toBe("");
		const groups = groupChampionsByArenaTier([
			{ arenaTier: "B" as const, id: 2 },
			{ arenaTier: "S" as const, id: 1 },
			{ arenaTier: null, id: 9 },
		]);
		expect(groups.map((g) => g.tier)).toEqual(["S", "B", null]);
		expect(groups[0]?.champions.map((c) => c.id)).toEqual([1]);
	});
});
