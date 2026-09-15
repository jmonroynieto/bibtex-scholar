import { describe, expect, it } from 'vitest'
import { NoteCitekeyCountCache } from 'src/infra/note-citekey-cache'
import { count_citekeys_in_note } from 'src/bibtex'

describe('NoteCitekeyCountCache', () => {
	it('reuses counts across repeated calls with identical content (same render pass, many fences)', () => {
		const cache = new NoteCitekeyCountCache()
		const content = '@article{Smith2020,}\n@article{Doe2021,}'

		const first = cache.get('a.md', content)
		const second = cache.get('a.md', content)

		expect(first).toBe(second) // same Map instance — no rebuild
		expect(first).toEqual(count_citekeys_in_note(content))
	})

	it('misses and rebuilds when content changes (a real edit)', () => {
		const cache = new NoteCitekeyCountCache()
		const before = cache.get('a.md', '@article{Smith2020,}')
		const after = cache.get('a.md', '@article{Smith2020,}\n@article{Smith2020,}')

		expect(before).not.toBe(after)
		expect(before.get('smith2020')).toBe(1)
		expect(after.get('smith2020')).toBe(2)
	})

	it('keeps separate entries per path', () => {
		const cache = new NoteCitekeyCountCache()
		const a = cache.get('a.md', '@article{Smith2020,}')
		const b = cache.get('b.md', '@article{Doe2021,}')

		expect(a.has('smith2020')).toBe(true)
		expect(a.has('doe2021')).toBe(false)
		expect(b.has('doe2021')).toBe(true)
		expect(cache.size()).toBe(2)
	})

	it('remove() drops a path so the next get() rebuilds', () => {
		const cache = new NoteCitekeyCountCache()
		const content = '@article{Smith2020,}'
		const first = cache.get('a.md', content)
		cache.remove('a.md')
		const second = cache.get('a.md', content)

		expect(cache.size()).toBe(1)
		expect(first).not.toBe(second) // rebuilt, even though content is identical
		expect(first).toEqual(second)
	})

	it('retarget() moves cached counts to the new path without rebuilding', () => {
		const cache = new NoteCitekeyCountCache()
		const content = '@article{Smith2020,}'
		const before = cache.get('a.md', content)
		cache.retarget('a.md', 'b.md')

		expect(cache.size()).toBe(1)
		const after = cache.get('b.md', content)
		expect(after).toBe(before) // reused, not rebuilt
	})

	it('retarget() on an unknown path is a no-op', () => {
		const cache = new NoteCitekeyCountCache()
		cache.retarget('missing.md', 'still-missing.md')
		expect(cache.size()).toBe(0)
	})
})
