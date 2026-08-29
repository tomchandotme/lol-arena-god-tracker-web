const MS_YEAR_2000 = Date.UTC(2000, 0, 1);
const CJK = /[\u4e00-\u9fff]/;

type ChampNames = { id: number; alias: string; nameEn: string; nameZh: string };

function shortest<T extends ChampNames>(rows: T[], key: (row: T) => string) {
	return rows.reduce((best, row) => {
		const a = key(row);
		const b = key(best);
		if (a.length !== b.length) return a.length < b.length ? row : best;
		return row.id < best.id ? row : best;
	});
}

export function searchPlaceholder(champions: ChampNames[]) {
	if (champions.length === 0) return "English, 中文, or alias";
	const en = shortest(champions, (c) => c.nameEn);
	const zhRows = champions.filter((c) => CJK.test(c.nameZh));
	const zh = shortest(zhRows.length ? zhRows : champions, (c) => c.nameZh);
	const aliasRows = champions.filter((c) => c.alias !== c.nameEn);
	const alias = aliasRows.length ? shortest(aliasRows, (c) => c.alias) : null;
	const parts = [en.nameEn];
	if (zh.nameZh !== en.nameEn) parts.push(zh.nameZh);
	if (alias && !parts.includes(alias.alias)) parts.push(alias.alias);
	return parts.join(", ");
}

export function formatPoints(n: number) {
	const points = Number(n) || 0;
	if (points >= 1_000_000) return `${(points / 1_000_000).toFixed(1)}m`;
	if (points >= 10_000) return `${Math.round(points / 1000)}k`;
	if (points >= 1000) return `${(points / 1000).toFixed(1)}k`;
	return String(points);
}

function toMs(value: number) {
	return value < 1e12 ? value * 1000 : value;
}

export function formatLastPlay(value: number | null | undefined, now = Date.now()) {
	const n = Number(value);
	if (!Number.isFinite(n) || n <= 0) {
		return { label: "never", title: "No last play on file" };
	}
	const ms = toMs(n);
	if (ms < MS_YEAR_2000) {
		return { label: "never", title: "No last play on file" };
	}
	const diff = Math.max(0, now - ms);
	const minute = 60_000;
	const hour = 60 * minute;
	const day = 24 * hour;
	const week = 7 * day;
	let label = "now";
	if (diff >= 365 * day) label = `${Math.floor(diff / (365 * day))}y`;
	else if (diff >= 30 * day) label = `${Math.floor(diff / (30 * day))}mo`;
	else if (diff >= week) label = `${Math.floor(diff / week)}w`;
	else if (diff >= day) label = `${Math.floor(diff / day)}d`;
	else if (diff >= hour) label = `${Math.floor(diff / hour)}h`;
	else if (diff >= minute) label = `${Math.floor(diff / minute)}m`;
	return { label, title: formatUtcStamp(ms) };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function pad2(n: number) {
	return String(n).padStart(2, "0");
}

function formatUtcStamp(ms: number) {
	const d = new Date(ms);
	return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())} UTC`;
}
