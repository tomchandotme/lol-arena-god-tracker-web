const DDRAGON_VERSIONS = "https://ddragon.leagueoflegends.com/api/versions.json";

export type ChampionCatalogRow = {
	id: number;
	alias: string;
	nameEn: string;
	nameZh: string;
};

export type ChampionJson = {
	data: Record<string, { key: string; name: string }>;
};

export function championSquareUrl(
	version: string | null | undefined,
	alias: string | null | undefined,
) {
	if (!version || !alias) return "";
	return `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${alias}.png`;
}

export function mapChampionCatalog(
	enJson: ChampionJson,
	zhJson: ChampionJson,
): ChampionCatalogRow[] {
	const champions: ChampionCatalogRow[] = [];
	for (const [alias, enChamp] of Object.entries(enJson.data)) {
		const id = Number(enChamp.key);
		const zhChamp = zhJson.data[alias];
		champions.push({
			id,
			alias,
			nameEn: enChamp.name,
			nameZh: zhChamp ? zhChamp.name : enChamp.name,
		});
	}
	champions.sort((a, b) => a.nameEn.localeCompare(b.nameEn));
	return champions;
}

export async function fetchChampionCatalog() {
	const versionsRes = await fetch(DDRAGON_VERSIONS);
	if (!versionsRes.ok) {
		throw new Error("Failed to fetch Data Dragon versions");
	}
	const versions = (await versionsRes.json()) as string[];
	const version = versions[0];
	if (!version) {
		throw new Error("Data Dragon versions list was empty");
	}

	const [enRes, zhRes] = await Promise.all([
		fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion.json`),
		fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/zh_TW/champion.json`),
	]);
	if (!enRes.ok || !zhRes.ok) {
		throw new Error("Failed to fetch Data Dragon champion.json");
	}

	const enJson = (await enRes.json()) as ChampionJson;
	const zhJson = (await zhRes.json()) as ChampionJson;
	return { version, champions: mapChampionCatalog(enJson, zhJson) };
}
