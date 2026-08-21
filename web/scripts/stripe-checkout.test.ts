import assert from 'node:assert/strict'
import test from 'node:test'
import { onRequestPost } from '../functions/stripe/checkout.ts'

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
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('rejects donation kinds instead of accepting client-selected prices', async () => {
  const response = await onRequestPost({ request: request({ kind: 'custom', price: 'price_attacker' }), env })
  assert.equal(response.status, 400)
  assert.deepEqual(await response.json(), { error: 'invalid_donation_kind' })
})

test('fails closed when the Stripe secret is absent', async () => {
  const response = await onRequestPost({ request: request({ kind: 'once' }), env: {} })
  assert.equal(response.status, 503)
  assert.deepEqual(await response.json(), { error: 'stripe_not_configured' })
})
