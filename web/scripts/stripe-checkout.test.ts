import assert from 'node:assert/strict'
import test from 'node:test'
import { onRequestGet, onRequestPost } from '../functions/stripe/checkout.ts'

const env = {
  STRIPE_SECRET_KEY: 'sk_test_example',
  STRIPE_ONE_TIME_PRICE_ID: 'price_once',
  STRIPE_MONTHLY_PRICE_ID: 'price_monthly',
}

function request(body: unknown) {
  return new Request('https://www.fontapp.net/stripe/checkout', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

test('creates a subscription Checkout Session with the allowlisted monthly price', async () => {
  const originalFetch = globalThis.fetch
  let stripeRequest: Request | undefined
  globalThis.fetch = async (input, init) => {
    stripeRequest = new Request(input, init)
    return Response.json({ url: 'https://checkout.stripe.com/c/pay/test' })
  }

  try {
    const response = await onRequestPost({ request: request({ kind: 'monthly' }), env })
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { url: 'https://checkout.stripe.com/c/pay/test' })
    assert.equal(stripeRequest?.headers.get('authorization'), 'Bearer sk_test_example')
    const form = new URLSearchParams(await stripeRequest?.text())
    assert.equal(form.get('mode'), 'subscription')
    assert.equal(form.get('line_items[0][price]'), 'price_monthly')
    assert.equal(form.get('success_url'), 'https://fontapp.net/support?stripe=success')
    // Sin esto, Stripe rechaza la sesión entera en cualquier cuenta cuyo producto no lleve
    // un `tax_code` elegible, que es como nacen todas. Comprobado contra la API real: la
    // misma llamada da 400 con Managed Payments y una URL de checkout sin él.
    assert.equal(form.get('managed_payments[enabled]'), 'false')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('rejects donation kinds instead of accepting client-selected prices', async () => {
  const response = await onRequestPost({ request: request({ kind: 'custom', price: 'price_attacker' }), env })
  assert.equal(response.status, 400)
  assert.deepEqual(await response.json(), { error: 'invalid_donation_kind' })
})

test('accepts a restricted key, which is the one this endpoint should be given', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => Response.json({ url: 'https://checkout.stripe.com/c/pay/test' })
  try {
    const response = await onRequestPost({
      request: request({ kind: 'once' }),
      env: { ...env, STRIPE_SECRET_KEY: 'rk_test_example' },
    })
    assert.equal(response.status, 200)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('rejects the publishable key, which is the easy one to paste by mistake', async () => {
  const response = await onRequestPost({
    request: request({ kind: 'once' }),
    env: { ...env, STRIPE_SECRET_KEY: 'pk_test_example' },
  })
  assert.equal(response.status, 503)
  assert.deepEqual(await response.json(), { error: 'stripe_not_configured' })
})

test('fails closed when the Stripe secret is absent', async () => {
  const response = await onRequestPost({ request: request({ kind: 'once' }), env: {} })
  assert.equal(response.status, 503)
  assert.deepEqual(await response.json(), { error: 'stripe_not_configured' })
})

test('GET tells the page which donations this environment can actually take', async () => {
  const response = await onRequestGet({ env })
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { once: true, monthly: true })
})

test('GET reports nothing available when the keys are missing, so no button is drawn', async () => {
  // Éste es el estado real que rompió producción: función desplegada, claves sin poner.
  const response = await onRequestGet({ env: {} })
  assert.deepEqual(await response.json(), { once: false, monthly: false })
})

test('GET reports each kind separately: a missing monthly price hides only that button', async () => {
  const response = await onRequestGet({ env: { ...env, STRIPE_MONTHLY_PRICE_ID: '' } })
  assert.deepEqual(await response.json(), { once: true, monthly: false })
})

test('GET is not cached by the browser, so enabling the button is seen on the next load', async () => {
  // Con `max-age=300` a secas, quien pasó por /support con la cuenta sin configurar
  // seguía sin botón cinco minutos después de configurarla. El borde sí puede cachear.
  const cc = (await onRequestGet({ env })).headers.get('cache-control') ?? ''
  assert.match(cc, /max-age=0/)
  assert.match(cc, /s-maxage=\d+/)
})

test('GET never leaks anything about the key beyond whether it works', async () => {
  const body = await (await onRequestGet({ env })).text()
  assert.ok(!body.includes('sk_'), 'la respuesta no puede contener la clave ni su prefijo')
  assert.deepEqual(Object.keys(JSON.parse(body)).sort(), ['monthly', 'once'])
})

test('a bad kind is a client error, not a configuration one', async () => {
  // Se validaba la configuración primero, así que un kind inventado se llevaba un 503 y
  // parecía que el servidor estaba mal puesto.
  const response = await onRequestPost({ request: request({ kind: 'nope' }), env: {} })
  assert.equal(response.status, 400)
})

test('a non-JSON reply from Stripe is an error response, not a crash', async () => {
  // Sin esto la excepción sube y Pages contesta con su propia página en texto plano, así
  // que el cliente no recibe ni nuestro JSON ni ninguna pista. Pasó en producción.
  const originalFetch = globalThis.fetch
  const originalError = console.error
  globalThis.fetch = async () => new Response('<html>gateway error</html>', { status: 502 })
  console.error = () => {}
  try {
    const response = await onRequestPost({ request: request({ kind: 'once' }), env })
    // 503 y no 502: Cloudflare tira el cuerpo de los 502 y el cliente no recibe el
    // código. Comprobado en producción, ver el comentario de UPSTREAM_FAILED.
    assert.equal(response.status, 503)
    assert.deepEqual(await response.json(), { error: 'checkout_creation_failed' })
  } finally {
    globalThis.fetch = originalFetch
    console.error = originalError
  }
})

test('the Stripe error is logged server-side, never returned to the caller', async () => {
  const originalFetch = globalThis.fetch
  const originalError = console.error
  const logged: unknown[] = []
  globalThis.fetch = async () => Response.json(
    { error: { type: 'invalid_request_error', message: 'No such price: price_once' } },
    { status: 400 },
  )
  console.error = (...args: unknown[]) => { logged.push(args) }
  try {
    const response = await onRequestPost({ request: request({ kind: 'once' }), env })
    const body = await response.text()
    assert.ok(!body.includes('No such price'), 'el motivo no puede viajar al cliente')
    assert.equal(JSON.stringify(logged).includes('No such price'), true, 'pero sí al registro')
  } finally {
    globalThis.fetch = originalFetch
    console.error = originalError
  }
})

test('Stripe failures never answer 502, whose body Cloudflare replaces at the edge', async () => {
  const originalFetch = globalThis.fetch
  const originalError = console.error
  console.error = () => {}
  try {
    for (const reply of [
      async () => { throw new Error('network') },
      async () => Response.json({ error: { message: 'nope' } }, { status: 400 }),
    ]) {
      globalThis.fetch = reply as typeof fetch
      const response = await onRequestPost({ request: request({ kind: 'once' }), env })
      assert.notEqual(response.status, 502, 'un 502 pierde el cuerpo en el borde')
      assert.notEqual(response.status, 504, 'y un 504 igual')
      assert.ok(typeof (await response.json() as { error?: string }).error === 'string')
    }
  } finally {
    globalThis.fetch = originalFetch
    console.error = originalError
  }
})
