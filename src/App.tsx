import { useCallback, useEffect, useState } from "react";
import ChampionBoard from "./ChampionBoard";
import {
	exportTrackerBackupText,
	fetchLiveOverlay,
	getTrackerState,
	importTrackerBackupJson,
	setChampionFirst,
	type LiveOverlay,
	type TrackerChampion,
} from "../lib/tracker";

type Ready = Awaited<ReturnType<typeof getTrackerState>>;
type LoadState =
	| { status: "loading" }
	| { status: "ready"; data: Ready; live: LiveOverlay }
	| { status: "error"; message: string };

type Banner = { kind: "ok" | "err"; text: string };

export default function App() {
	const [load, setLoad] = useState<LoadState>({ status: "loading" });
	const [banner, setBanner] = useState<Banner | null>(null);
	const [busy, setBusy] = useState(false);

	const reload = useCallback(async (live?: LiveOverlay) => {
		const overlay = live ?? (await fetchLiveOverlay());
		const data = await getTrackerState(overlay);
		setLoad({ status: "ready", data, live: overlay });
	}, []);

	useEffect(() => {
		reload().catch((err: unknown) => {
			setLoad({
				status: "error",
				message: err instanceof Error ? err.message : "Failed to load Data Dragon",
			});
		});
	}, [reload]);

	async function onToggle(champion: TrackerChampion) {
		await setChampionFirst(champion.id, !champion.hasFirst);
		const overlay = load.status === "ready" ? load.live : undefined;
		await reload(overlay);
	}

	async function onExport() {
		setBanner(null);
		try {
			const text = await exportTrackerBackupText();
			const blob = new Blob([text], { type: "application/json" });
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = "tracker-backup.json";
			a.click();
			URL.revokeObjectURL(url);
		} catch (err) {
			setBanner({ kind: "err", text: err instanceof Error ? err.message : "Export failed" });
		}
	}

	async function onImport(file: File | undefined) {
		if (!file) return;
		setBanner(null);
		setBusy(true);
		try {
			const text = await file.text();
			const result = await importTrackerBackupJson(text);
			if (!result.ok) {
				const extra = result.issues.length > 1 ? ` (${result.issues.length} issues)` : "";
				setBanner({ kind: "err", text: `${result.error.message}${extra}` });
				return;
			}
			await reload(load.status === "ready" ? load.live : undefined);
			setBanner({
				kind: "ok",
				text: `Imported ${result.backup.tables.arenaFirsts.length} 1sts`,
			});
		} catch (err) {
			setBanner({ kind: "err", text: err instanceof Error ? err.message : "Import failed" });
		} finally {
			setBusy(false);
		}
	}

	async function onRefreshLive() {
		setBanner(null);
		setBusy(true);
		try {
			const overlay = await fetchLiveOverlay();
			await reload(overlay);
			setBanner({
				kind: "ok",
				text: overlay.ddragonVersion ? `Patch ${overlay.ddragonVersion}` : "Patch refreshed",
			});
		} catch (err) {
			setBanner({
				kind: "err",
				text: err instanceof Error ? err.message : "Could not refresh patch",
			});
		} finally {
			setBusy(false);
		}
	}

	if (load.status === "loading") {
		return (
			<main className="shell">
				<p className="empty">Loading champions…</p>
			</main>
		);
	}

	if (load.status === "error") {
		return (
			<main className="shell">
				<p className="empty">{load.message}</p>
				<p className="hint">Refresh the page to try Data Dragon and OP.GG again.</p>
			</main>
		);
	}

	const { firstCount, target, champions } = load.data;
	const remaining = Math.max(0, target - firstCount);

	return (
		<main className="shell">
			<header className="mast">
				<div>
					<p className="eyebrow">臨機應變</p>
					<h1 className="display">Arena God</h1>
					<p className="lede">
						{firstCount === 0
							? "Upload JSON to restore 1sts in this browser."
							: remaining === 0
								? `${target} unique 1sts.`
								: `${remaining} to go.`}
					</p>
				</div>

				<div className="score" aria-label={`${firstCount} of ${target} 1sts`}>
					<div className="score-block">
						<p className="display score-num">
							<strong>{firstCount}</strong>
							<span>/{target}</span>
						</p>
						<div className="tally" aria-hidden="true">
							{Array.from({ length: target }, (_, i) => (
								<i key={i} className={i < firstCount ? "on" : ""} />
							))}
						</div>
					</div>
				</div>
			</header>

			{champions.length === 0 ? (
				<p className="empty">No champions from Data Dragon. Refresh patch below.</p>
			) : (
				<ChampionBoard champions={champions} now={Date.now()} onToggle={onToggle} />
			)}

			<div className="backup-bar">
				<button type="button" onClick={() => void onExport()} disabled={busy}>
					Download JSON
				</button>
				<label className={busy ? "disabled" : ""}>
					Upload JSON
					<input
						type="file"
						accept="application/json,.json"
						disabled={busy}
						onChange={(e) => {
							const file = e.target.files?.[0];
							e.target.value = "";
							void onImport(file);
						}}
					/>
				</label>
				<button type="button" onClick={() => void onRefreshLive()} disabled={busy}>
					Refresh patch
				</button>
				{banner ? <p className={`backup-msg ${banner.kind}`}>{banner.text}</p> : null}
			</div>
		</main>
	);
}
