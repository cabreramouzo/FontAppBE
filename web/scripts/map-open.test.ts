import assert from 'node:assert/strict'
import { test } from 'node:test'
import { vistaAlAbrir } from '../src/lib/mapView.ts'

const barcelona = JSON.stringify({ lat: 41.39, lng: 2.16, zoom: 14 })
const moianes = JSON.stringify({ lat: 41.75, lng: 2.16, zoom: 13 })

test('abrir en frío usa la última vista conocida y NO el centro por defecto', () => {
  // El fallo reportado: la app abría en Madrid a zoom 5 cada mañana. La vista solo vivía
  // en sessionStorage, que muere al cerrar la app; lo tapaba la ubicación automática, que
  // en iOS no salta porque el permiso de una web caduca cada 24 h.
  const r = vistaAlAbrir(null, moianes)
  assert.deepEqual(r.vista, { lat: 41.75, lng: 2.16, zoom: 13 })
})

test('...pero eso NO desactiva la ubicación automática', () => {
  // Si contara como «venías de otro sitio», la app no volvería a ubicarte sola nunca más
  // después de la primera visita, y sin dar ningún error.
  assert.equal(vistaAlAbrir(null, moianes).veniaDeOtroSitio, false)
})

test('venir del detalle de una fuente sí la desactiva, y su vista manda', () => {
  const r = vistaAlAbrir(barcelona, moianes)
  assert.equal(r.veniaDeOtroSitio, true)
  assert.equal(r.vista?.lat, 41.39, 'la de la sesión gana a la de respaldo')
})

test('sin nada guardado, quien decide es el centro por defecto', () => {
  assert.deepEqual(vistaAlAbrir(null, null), { vista: null, veniaDeOtroSitio: false })
})

test('una vista corrupta no cuenta como sesión ni tumba el mapa', () => {
  // `{}` es JSON válido y termina en «Invalid LatLng object», que se lleva por delante la
  // pantalla entera del mapa.
  assert.deepEqual(vistaAlAbrir('{}', null), { vista: null, veniaDeOtroSitio: false })
  assert.equal(vistaAlAbrir('{}', moianes).veniaDeOtroSitio, false)
  assert.equal(vistaAlAbrir('no es json', moianes).vista?.zoom, 13)
})
