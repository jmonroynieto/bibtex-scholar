/**
 * Per-note citekey occurrence-count cache.
 *
 * `check_duplicate_id`'s same-file half needs to know how many times a
 * citekey appears in its note. Obsidian calls `bibtex_codeblock_processor`
 * once per ```bibtex fence with no state shared across fences — a vault
 * laid out as one entry per fence (this project's own bibliography/owned/
 * notes; see external_UPSTREAM-BIBTEX-SCHOLAR.md and a tester's field
 * report on that exact layout) rebuilds `count_citekeys_in_note` from
 * scratch on every single fence, with nothing to amortize: E9's ~1279x win
 * only applies to "one fence, many entries" (SPEED.md).
 *
 * This cache fixes the "many fences, one entry each" shape: keyed by source
 * path, self-invalidated by content equality against what produced the
 * cached counts — a real edit changes the file's text, so the next call
 * misses and rebuilds. No vault-event wiring is required for correctness;
 * `remove`/`retarget` below are just tidiness on delete/rename, not needed
 * for correctness.
 *
 * Not durable — recomputed from vault text, not part of `this.cache`.
 */

import { count_citekeys_in_note } from 'src/bibtex'

export class NoteCitekeyCountCache {
	private entries = new Map<string, { content: string, counts: Map<string, number> }>()

	/** First call for a (path, content) pair pays the real scan; repeats within the same render pass are free. */
	get(path: string, content: string): Map<string, number> {
		const cached = this.entries.get(path)
		if (cached && cached.content === content) {
			return cached.counts
		}
		const counts = count_citekeys_in_note(content)
		this.entries.set(path, { content, counts })
		return counts
	}

	/** Drop a path's cached counts (file deleted/uncached). */
	remove(path: string): void {
		this.entries.delete(path)
	}

	/** Move a path's cached counts to its new path (file renamed) — avoids an orphaned entry. */
	retarget(old_path: string, new_path: string): void {
		const entry = this.entries.get(old_path)
		if (entry) {
			this.entries.delete(old_path)
			this.entries.set(new_path, entry)
		}
	}

	/** Test/debug: number of notes currently cached. */
	size(): number {
		return this.entries.size
	}
}
