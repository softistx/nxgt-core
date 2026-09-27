#!/usr/bin/env bun
/**
 * SessionEnd: delete this session's record. SessionEnd hooks share a
 * 1.5-second budget that a plugin's `timeout` cannot raise, so this does one
 * thing. If it is cut short, the record lapses on its own: its process is gone,
 * and it stops counting after the stale window.
 */

import { runHook } from '../lib/hook';
import { crewHome, remove } from '../lib/store';

await runHook(async (input) => {
	remove(crewHome(process.env), input.session_id);
	return undefined;
});
