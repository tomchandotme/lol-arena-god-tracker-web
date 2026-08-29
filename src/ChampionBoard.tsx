import { useMemo, useState } from "react";
import { groupChampionsByArenaTier, opggArenaBuildUrl } from "../lib/arenaTiers";
import { formatLastPlay, formatPoints, searchPlaceholder, splitChampionName } from "../lib/format";
import type { TrackerChampion } from "../lib/tracker";

export default function ChampionBoard({
	champions,
	now,
	onToggle,
}: {
	champions: TrackerChampion[];
	now: number;
	onToggle: (champion: TrackerChampion) => Promise<void>;
}) {
	const [query, setQuery] = useState("");
	const [filter, setFilter] = useState<"all" | "todo" | "done">("todo");
	const [sort, setSort] = useState<"mastery" | "last" | "name">("mastery");
	const [pending, setPending] = useState(false);
	const [pendingConfirm, setPendingConfirm] = useState<TrackerChampion | null>(null);

	const visible = useMemo(() => {
		const q = query.trim().toLowerCase();
		return champions
			.filter((c) => {
				if (filter === "done" && !c.hasFirst) return false;
				if (filter === "todo" && c.hasFirst) return false;
				if (!q) return true;
				return (
					c.nameEn.toLowerCase().includes(q) ||
					c.nameZh.toLowerCase().includes(q) ||
					c.alias.toLowerCase().includes(q) ||
					String(c.id).includes(q)
				);
			})
			.sort((a, b) => {
				if (sort === "last") {
					const last = (b.lastPlay || 0) - (a.lastPlay || 0);
					if (last !== 0) return last;
				} else if (sort === "mastery") {
					const points = (b.masteryPoints || 0) - (a.masteryPoints || 0);
					if (points !== 0) return points;
				}
				return a.nameEn.localeCompare(b.nameEn);
			});
	}, [champions, filter, query, sort]);

	const classes = useMemo(() => groupChampionsByArenaTier(visible), [visible]);
	const placeholder = useMemo(() => searchPlaceholder(champions), [champions]);

	function requestToggle(champion: TrackerChampion) {
		setPendingConfirm(champion);
	}

	function cancelToggle() {
		setPendingConfirm(null);
	}

	async function confirmToggle() {
		if (!pendingConfirm) return;
		const champion = pendingConfirm;
		setPendingConfirm(null);
		setPending(true);
		try {
			await onToggle(champion);
		} finally {
			setPending(false);
		}
	}

	return (
		<div>
			<div className="toolbar">
				<input
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					placeholder={placeholder}
					className="search"
					aria-label="Search champions"
				/>
				<div className="filters">
					{(["all", "todo", "done"] as const).map((key) => (
						<button
							key={key}
							type="button"
							onClick={() => setFilter(key)}
							className={filter === key ? "on" : ""}
						>
							{key === "all" ? "All" : key === "todo" ? "Need 1st" : "Have 1st"}
						</button>
					))}
				</div>
				<label className="sort">
					<select
						value={sort}
						onChange={(e) => setSort(e.target.value as "mastery" | "last" | "name")}
						aria-label="Order in class"
					>
						<option value="mastery">Mastery</option>
						<option value="last">Last play</option>
						<option value="name">Name</option>
					</select>
				</label>
			</div>

			{visible.length === 0 ? <p className="hint">No matches.</p> : null}

			<div className="tier-sheet">
				{classes.map((group) => {
					const id = group.tier ? `tier-${group.tier}` : "tier-none";
					const letter = group.tier || "—";
					return (
						<section
							key={id}
							id={id}
							className={`tier-class${group.tier ? ` rail-${group.tier.toLowerCase()}` : " rail-none"}`}
							aria-labelledby={`${id}-mark`}
						>
							<header className="tier-mark">
								<p id={`${id}-mark`} className="tier-letter">
									{letter}
								</p>
								<p className="tier-mark-meta">{group.champions.length}</p>
							</header>
							<ul className="roster">
								{group.champions.map((c) => (
									<ChampionTile key={c.id} champion={c} now={now} onToggle={requestToggle} />
								))}
							</ul>
						</section>
					);
				})}
			</div>

			{pending ? <p className="hint">Saving…</p> : null}

			{pendingConfirm ? (
				<div
					className="confirm-scrim"
					onClick={cancelToggle}
					onKeyDown={(e) => {
						if (e.key === "Escape") cancelToggle();
					}}
				>
					<div
						className="confirm-card"
						role="dialog"
						aria-modal="true"
						aria-labelledby="confirm-title"
						onClick={(e) => e.stopPropagation()}
						onKeyDown={(e) => {
							if (e.key === "Escape") cancelToggle();
						}}
					>
						<p id="confirm-title" className="confirm-title">
							{pendingConfirm.hasFirst
								? `Clear 1st from ${pendingConfirm.nameEn}?`
								: `Mark ${pendingConfirm.nameEn} as 1st?`}
						</p>
						<p className="confirm-copy">{pendingConfirm.nameZh}</p>
						<div className="confirm-actions">
							<button type="button" onClick={cancelToggle}>
								Cancel
							</button>
							<button type="button" className="on" onClick={() => void confirmToggle()} autoFocus>
								{pendingConfirm.hasFirst ? "Clear 1st" : "Mark 1st"}
							</button>
						</div>
					</div>
				</div>
			) : null}
		</div>
	);
}

function ChampionTile({
	champion: c,
	now,
	onToggle,
}: {
	champion: TrackerChampion;
	now: number;
	onToggle: (champion: TrackerChampion) => void;
}) {
	const last = formatLastPlay(c.lastPlay, now);
	const meta = [formatPoints(c.masteryPoints), last.label].filter(Boolean).join(" · ");
	const opggUrl = opggArenaBuildUrl(c.alias);
	const { lead, rest } = splitChampionName(c.nameEn);
	return (
		<li className={`champ${c.hasFirst ? " won" : ""}`}>
			<button type="button" onClick={() => onToggle(c)} className="champ-hit">
				{c.imageUrl ? (
					<img src={c.imageUrl} alt="" width={56} height={56} />
				) : (
					<span className="champ-art-gap" aria-hidden="true" />
				)}
				<span className="champ-copy">
					<span className="champ-name" title={c.nameEn}>
						{lead}
						{rest ? (
							<>
								<wbr /> {rest}
							</>
						) : null}
					</span>
					<span className="champ-zh" title={c.nameZh}>
						{c.nameZh}
					</span>
					<span className="champ-meta" title={last.title}>
						{meta}
					</span>
				</span>
			</button>
			<span className="champ-aside">
				{c.hasFirst ? <span className="stamp">1ST</span> : null}
				{opggUrl ? (
					<a
						className="champ-opgg"
						href={opggUrl}
						target="_blank"
						rel="noopener noreferrer"
						aria-label={`${c.nameEn} Arena build on OP.GG`}
					>
						op.gg
					</a>
				) : null}
			</span>
		</li>
	);
}
