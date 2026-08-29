#!/usr/bin/env bun
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { stringifyBackup } from "../lib/backup";
import { exportSqliteFile, sqliteRowCounts } from "../lib/sqlite-export";

const DEFAULT_DB = path.join(process.cwd(), "data", "tracker.sqlite");
const DEFAULT_OUT = path.join(process.cwd(), "data", "tracker-backup.json");

function main() {
	const dbPath = process.env.TRACKER_DB_PATH || DEFAULT_DB;
	const outPath = process.env.TRACKER_BACKUP_PATH || DEFAULT_OUT;
	const backup = exportSqliteFile(dbPath);
	mkdirSync(path.dirname(outPath), { recursive: true });
	writeFileSync(outPath, stringifyBackup(backup));
	const counts = sqliteRowCounts(backup);
	console.log(`Wrote ${outPath}`);
	console.log(
		`champions=${counts.champions} arenaFirsts=${counts.arenaFirsts} championMastery=${counts.championMastery} meta=${counts.meta}`,
	);
}

main();
