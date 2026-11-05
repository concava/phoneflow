import Stripe from "stripe"

import { env } from "@/lib/env"

// Billing only runs on cloud, but this module also loads on self-hosted, and the
// SDK throws on an empty key. A cloud deployment without a key still fails at boot.
export const stripe = new Stripe(
  env.STRIPE_SECRET_KEY || (env.IS_CLOUD ? "" : "stripe_not_configured")
)
