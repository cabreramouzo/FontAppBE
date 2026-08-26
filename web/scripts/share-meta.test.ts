import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { test } from 'node:test'
import { SHARE_META, shareCard, shareLang } from '../functions/_meta.ts'

test('cada idioma compartible tiene metadatos y una tarjeta real', () => {
  for (const lang of Object.keys(SHARE_META)) {
    const card = shareCard(lang as keyof typeof SHARE_META)
    assert.equal(card, `og-card-${lang}.jpg`, lang)
    assert.ok(existsSync(new URL(`../public/${card}`, import.meta.url)), card)
  }
})

test('los enlaces italianos conservan el italiano para el scraper', () => {
  assert.equal(shareLang(new Request('https://fontapp.net/?lang=it')), 'it')
  assert.equal(SHARE_META.it.locale, 'it_IT')
})
