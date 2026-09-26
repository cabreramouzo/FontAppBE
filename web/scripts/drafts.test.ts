import assert from 'node:assert/strict'
import { test } from 'node:test'
import { clearDraft, draftKey, DRAFT_TTL_MS, loadDraft, saveDraft, syncDraft, type DraftStorage } from '../src/lib/drafts.ts'

function memory(): DraftStorage & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v) }, removeItem: (k) => { data.delete(k) } }
}

test('a saved draft comes back', () => {
  const s = memory()
  saveDraft('k', { name: 'Font de la Vall' }, 1000, s)
  assert.deepEqual(loadDraft('k', 2000, s), { name: 'Font de la Vall' })
})

test('drafts are per account: another user on the same phone does not see it', () => {
  assert.notEqual(draftKey('ana', 'new-font'), draftKey('bea', 'new-font'))
  assert.equal(draftKey(null, 'new-font'), 'draft:anonymous:new-font')
})

test('a draft older than seven days is dropped', () => {
  const s = memory()
  saveDraft('k', { body: 'viejo' }, 0, s)
  assert.equal(loadDraft('k', DRAFT_TTL_MS + 1, s), null)
  assert.equal(s.data.size, 0, 'and removed from storage')
})

test('emptying the form forgets the draft; filling it saves it', () => {
  const s = memory()
  syncDraft('k', { body: 'algo' }, false, 0, s)
  assert.ok(s.data.has('k'))
  syncDraft('k', { body: '' }, true, 0, s)
  assert.ok(!s.data.has('k'))
})

test('broken storage contents never throw', () => {
  const s = memory()
  s.data.set('k', '{not json')
  assert.equal(loadDraft('k', 0, s), null)
  clearDraft('missing', s)
})
