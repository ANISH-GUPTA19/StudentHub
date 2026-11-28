import type { PaymentOrderResult, User } from '../types/entities'
import { api } from '../api'

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => {
      open: () => void
      on: (event: string, handler: (response: { error?: { description?: string } }) => void) => void
    }
  }
}

let scriptPromise: Promise<boolean> | null = null

export function loadRazorpayScript(): Promise<boolean> {
  if (window.Razorpay) return Promise.resolve(true)
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise((resolve) => {
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.async = true
    script.onload = () => resolve(true)
    script.onerror = () => {
      scriptPromise = null
      resolve(false)
    }
    document.body.appendChild(script)
  })
  return scriptPromise
}

export interface GatewayOutcome {
  status: 'paid' | 'pending_config' | 'failed' | 'cancelled'
  paymentId: string
  gatewayPaymentId?: string | null
  message: string
  requiredEnv?: string[]
}

export async function runRazorpayFlow(
  orderResult: PaymentOrderResult,
  user: User | null,
  description: string,
): Promise<GatewayOutcome> {
  if (!orderResult.gatewayConfigured || !orderResult.keyId || !orderResult.payment.gatewayOrderId) {
    return {
      status: 'pending_config',
      paymentId: orderResult.payment.id,
      message:
        orderResult.message ||
        'Payment gateway credentials are unavailable. Order saved as Payment Pending; configure RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to process real payments.',
      requiredEnv: orderResult.requiredEnv ?? ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET'],
    }
  }

  const loaded = await loadRazorpayScript()
  if (!loaded || !window.Razorpay) {
    return {
      status: 'failed',
      paymentId: orderResult.payment.id,
      message: 'Unable to load Razorpay Checkout script. Check your network connection and retry.',
    }
  }

  return new Promise((resolve) => {
    const rzp = new window.Razorpay!({
      key: orderResult.keyId,
      amount: orderResult.amountPaise,
      currency: orderResult.currency,
      name: 'StudentHub',
      description,
      order_id: orderResult.payment.gatewayOrderId,
      prefill: {
        name: user?.name ?? '',
        email: user?.email ?? '',
        contact: user?.phone ?? '',
      },
      theme: { color: '#087F73' },
      modal: {
        ondismiss: async () => {
          await api.failPayment(orderResult.payment.id, 'Payment cancelled by user in checkout modal').catch(() => undefined)
          resolve({
            status: 'cancelled',
            paymentId: orderResult.payment.id,
            message: 'Payment was cancelled before completion. You can retry anytime.',
          })
        },
      },
      handler: async (response: {
        razorpay_order_id: string
        razorpay_payment_id: string
        razorpay_signature: string
      }) => {
        try {
          const verified = await api.verifyPayment({
            paymentId: Number(orderResult.payment.id),
            gatewayOrderId: response.razorpay_order_id,
            gatewayPaymentId: response.razorpay_payment_id,
            gatewaySignature: response.razorpay_signature,
          })
          resolve({
            status: 'paid',
            paymentId: verified.payment.id,
            gatewayPaymentId: verified.payment.gatewayPaymentId,
            message: 'Payment verified and confirmed successfully!',
          })
        } catch (err) {
          resolve({
            status: 'failed',
            paymentId: orderResult.payment.id,
            message: err instanceof Error ? err.message : 'Payment signature verification failed.',
          })
        }
      },
    })

    rzp.on('payment.failed', async (response) => {
      const reason = response.error?.description || 'Payment failed at gateway'
      await api.failPayment(orderResult.payment.id, reason).catch(() => undefined)
      resolve({
        status: 'failed',
        paymentId: orderResult.payment.id,
        message: reason,
      })
    })

    rzp.open()
  })
}
