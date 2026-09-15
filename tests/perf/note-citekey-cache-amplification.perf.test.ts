/**
 * E10 — "many separate single-entry ```bibtex fences" shape: the gap left
 * open by E9 and confirmed independently by a tester's field report against
 * this project's own bibliography/owned/<year>.md files (one entry per
 * fence, for deep-linking + lazy rendering). E9's count-map fix amortizes
 * across entries *within one fence*; it does nothing for entries spread
 * across separate fences, since Obsidian gives each fence its own
 * `bibtex_codeblock_processor` call with no shared state.
 *
 * `NoteCitekeyCountCache` (src/infra/note-citekey-cache.ts) fixes that shape
 * specifically: keyed by path, reused across fences as long as the note's
 * text hasn't changed between calls (which it hasn't, mid-render-pass).
 *
 * Run: `npm run test:perf`
 */

import { describe, expect, it } from 'vitest'
import { count_citekeys_in_note } from 'src/bibtex'
import { NoteCitekeyCountCache } from 'src/infra/note-citekey-cache'
import { bench, format_row, type BenchSample } from './bench'

function build_note_text(n: number): string {
	let s = ''
	for (let i = 0; i < n; i++) {
		s += `@article{k${i},\n  title={Entry ${i}},\n  year={2020},\n}\n`
	}
	return s
}

const N = 1_843 // this project's own 2019.md-scale owned-papers note

describe('E10 note-scoped citekey-count cache: N separate single-entry fences, one note', () => {
	const note = build_note_text(N)

	it('rebuild-per-fence (no cache, current gap) vs NoteCitekeyCountCache (one real scan, reused)', () => {
		// No cache: what bibtex_codeblock_processor did before this fix — every
		// fence's call rebuilds the whole-note count map from scratch.
		const no_cache = bench(
			() => {
				let total_ids = 0
				for (let i = 0; i < N; i++) {
					total_ids += count_citekeys_in_note(note).size
				}
				return total_ids
			},
			{ runs: 1, warmup: 0 },
		)

		// Cached: one call per fence, same (path, content) every time within
		// this render pass — matches production wiring in bibtex_codeblock_processor.
		const cached = bench(
			() => {
				const cache = new NoteCitekeyCountCache()
				let total_ids = 0
				for (let i = 0; i < N; i++) {
					total_ids += cache.get('owned/2019.md', note).size
				}
				return total_ids
			},
			{ runs: 3, warmup: 1 },
		)

		// eslint-disable-next-line no-console
		console.log(
			`\n### E10 note-scoped citekey-count cache (N=${N} fences, one entry each, one note)\n` +
				'| Experiment | No cache (rebuild/fence) | NoteCitekeyCountCache | Speedup |\n' +
				'|---|---|---|---|\n' +
				format_row(
					'N fence renders in one note',
					{ label: 'no-cache', ms: no_cache.ms, work: no_cache.work } as BenchSample,
					{ label: 'cached', ms: cached.ms, work: cached.work } as BenchSample,
				) +
				'\n',
		)

		expect(no_cache.work).toBe(N * N) // N fences × N ids counted each time
		expect(cached.work).toBe(N * N) // same observable result (size read N times)
		// First fence pays the real scan; the remaining N-1 are a Map lookup +
		// string-equality check — should collapse a quadratic-shaped cost to
		// effectively one scan's worth of work.
		expect(cached.ms).toBeLessThan(no_cache.ms * 0.1)
	}, 30_000)

	it('correctness: cached path agrees with a fresh scan on every fence', () => {
		const cache = new NoteCitekeyCountCache()
		const fresh = count_citekeys_in_note(note)
		for (let i = 0; i < N; i += 400) {
			const counts = cache.get('owned/2019.md', note)
			expect(counts.get(`k${i}`)).toBe(fresh.get(`k${i}`))
		}
	})
})
