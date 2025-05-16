const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const pool = require("../db/index");

exports.createCheckoutSession = async (req, res) => {
  const { couponCode } = req.body;
  const businessId = req.user.businessId;

  if (!businessId) {
    return res.status(400).json({ message: "Business ID is required" });
  }

  try {
    // Create or retrieve customer
    let customer;
    const customers = await stripe.customers.list({
      email: req.user.email,
      limit: 1,
    });

    if (customers.data.length > 0) {
      customer = customers.data[0];
      await stripe.customers.update(customer.id, {
        metadata: { businessId },
      });
    } else {
      customer = await stripe.customers.create({
        email: req.user.email,
        metadata: { businessId },
      });
    }

    // Create Stripe session
    const session = await stripe.checkout.sessions.create({
      customer: customer.id,
      payment_method_types: ["card"],
      line_items: [
        {
          price: process.env.STRIPE_PRICE_ID,
          quantity: 1,
        },
      ],
      mode: "subscription",
      billing_address_collection: "required",
      success_url: `${process.env.FRONTEND_URL}/dashboard?success=true`,
      cancel_url: `${process.env.FRONTEND_URL}/dashboard/payment?canceled=true`,
      metadata: {
        business_id: businessId,
        coupon_code: couponCode || "",
      },
      allow_promotion_codes: true,
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error("Error creating checkout session:", error);
    res.status(500).json({ message: "Error creating checkout session" });
  }
};

exports.handleWebhook = async (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );

    switch (event.type) {
      case "checkout.session.completed":
        console.log("checkout.session.completed");
        await handleCheckoutSessionCompleted(event.data.object);
        break;
      case "customer.subscription.updated":
        console.log("customer.subscription.updated");
        await handleSubscriptionUpdate(event.data.object);
        break;
      case "customer.subscription.deleted":
        console.log("customer.subscription.deleted");
        await handleSubscriptionDeleted(event.data.object);
        break;
      case "invoice.payment_succeeded":
        console.log("invoice.payment_succeeded");
        await handleInvoicePaymentSucceeded(event.data.object);
        break;
    }

    res.json({ received: true });
  } catch (err) {
    console.error("Webhook Error:", err);
    res.status(400).send(`Webhook Error: ${err.message}`);
  }
};

async function handleSubscriptionDeleted(subscription) {
  try {
    console.log(`Handling deleted subscription: ${subscription.id}`);

    const customer = await stripe.customers.retrieve(subscription.customer);
    const businessId = customer.metadata.businessId;

    if (!businessId) {
      return;
    }

    await pool.query(
      `UPDATE subscriptions 
       SET status = 'cancelled',
           updated_at = CURRENT_TIMESTAMP,
           cancelled_at = COALESCE(cancelled_at, CURRENT_TIMESTAMP),
           ended_at = CURRENT_TIMESTAMP
       WHERE stripe_subscription_id = $1`,
      [subscription.id]
    );

    await pool.query(
      "UPDATE businesses SET subscription_status = 'cancelled' WHERE id = $1",
      [businessId]
    );

    console.log(
      `Successfully marked subscription as cancelled for business ${businessId}`
    );
  } catch (error) {
    console.error("Error handling deleted subscription:", error);
  }
}

async function handleCheckoutSessionCompleted(session) {
  try {
    const businessId = session.metadata.business_id;
    const customerId = session.customer;
    const subscriptionId = session.subscription;

    console.log("businessId in session", businessId);

    const subscription = await stripe.subscriptions.retrieve(subscriptionId);

    const amount = subscription.items.data[0].price.unit_amount;

    const currentPeriodEnd = new Date(subscription.current_period_end * 1000);

    let cardLast4 = null;
    let cardBrand = null;

    if (subscription.default_payment_method) {
      const paymentMethod = await stripe.paymentMethods.retrieve(
        subscription.default_payment_method
      );

      if (paymentMethod.type === "card" && paymentMethod.card) {
        cardLast4 = paymentMethod.card.last4;
        cardBrand = paymentMethod.card.brand;
      }
    } else if (subscription.default_source) {
      const customer = await stripe.customers.retrieve(customerId, {
        expand: ["default_source"],
      });

      if (
        customer.default_source &&
        customer.default_source.object === "card"
      ) {
        cardLast4 = customer.default_source.last4;
        cardBrand = customer.default_source.brand;
      }
    }

    // Create or update subscription
    const subscriptionResult = await pool.query(
      `INSERT INTO subscriptions (
        business_id,
        stripe_customer_id,
        stripe_subscription_id,
        status,
        amount,
        payment_method,
        current_period_end,
        card_last4,
        card_brand
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (business_id) 
      DO UPDATE SET
        stripe_customer_id = $2,
        stripe_subscription_id = $3,
        status = $4,
        amount = $5,
        payment_method = $6,
        current_period_end = $7,
        card_last4 = $8,
        card_brand = $9,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *`,
      [
        businessId,
        customerId,
        subscriptionId,
        "active",
        amount,
        "card",
        currentPeriodEnd,
        cardLast4,
        cardBrand,
      ]
    );

    console.log("Subscription update result:", subscriptionResult.rows[0]);

    // Update business subscription status
    const businessResult = await pool.query(
      "UPDATE businesses SET subscription_status = $1 WHERE id = $2 RETURNING *",
      ["active", businessId]
    );

    console.log("Business update result:", businessResult.rows[0]);
  } catch (error) {
    console.error("Error handling checkout session:", error);
  }
}

async function handleSubscriptionUpdate(subscription) {
  try {
    const customer = await stripe.customers.retrieve(subscription.customer);
    const businessId = customer.metadata.businessId;

    if (!businessId) {
      console.error("No businessId found for customer:", subscription.customer);
      return;
    }

    let status = subscription.status;

    if (
      subscription.cancel_at_period_end === true &&
      subscription.status === "active"
    ) {
      status = "cancelling";
      console.log(
        `Subscription ${subscription.id} is now set to cancel at period end`
      );
    }

    console.log(
      `Updating subscription status to ${status} for business ${businessId}`
    );

    // Update subscription status
    await pool.query(
      `UPDATE subscriptions 
       SET status = $1,
           updated_at = CURRENT_TIMESTAMP,
           cancel_at_period_end = $2,
           cancelled_at = CASE WHEN $2 = true AND cancelled_at IS NULL THEN CURRENT_TIMESTAMP ELSE cancelled_at END
       WHERE stripe_subscription_id = $3`,
      [status, subscription.cancel_at_period_end, subscription.id]
    );

    // Update business subscription status
    await pool.query(
      "UPDATE businesses SET subscription_status = $1 WHERE id = $2",
      [status, businessId]
    );

    // Update user subscription status if needed
    if (status === "cancelling") {
      await pool.query(
        "UPDATE businesses SET subscription_status = 'cancelling' WHERE business_id = $1",
        [businessId]
      );
    }
  } catch (error) {
    console.error("Error updating subscription:", error);
  }
}

async function handleInvoicePaymentSucceeded(invoice) {
  try {
    const customer = await stripe.customers.retrieve(invoice.customer);
    const businessId = customer.metadata.businessId;

    if (!businessId) {
      console.error("No businessId found for customer:", invoice.customer);
      return;
    }

    // Update subscription status
    await pool.query(
      `UPDATE subscriptions 
       SET status = 'active',
           updated_at = CURRENT_TIMESTAMP
       WHERE stripe_subscription_id = $1`,
      [invoice.subscription]
    );

    // Update business subscription status
    await pool.query(
      "UPDATE businesses SET subscription_status = $1 WHERE id = $2",
      ["active", businessId]
    );
  } catch (error) {
    console.error("Error processing invoice payment:", error);
  }
}

exports.startTrial = async (req, res) => {
  try {
    const businessId = req.user.businessId;

    await pool.query(
      `UPDATE businesses 
       SET trial_reviews_remaining = 10,
           trial_started_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [businessId]
    );

    res.json({ message: "Trial started successfully" });
  } catch (error) {
    console.error("Error starting trial:", error);
    res.status(500).json({ message: "Failed to start trial" });
  }
};

exports.getSubscriptionStatus = async (req, res) => {
  try {
    const businessId = req.user.businessId;
    console.log(`Fetching subscription status for business: ${businessId}`);

    const result = await pool.query(
      `SELECT 
        s.status as subscription_status,
        s.stripe_subscription_id,
        s.current_period_end as subscription_ends_at,
        s.card_last4,
        s.card_brand,
        b.trial_reviews_remaining,
        b.total_referral_earnings
       FROM businesses b
       LEFT JOIN subscriptions s ON s.business_id = b.id
       WHERE b.id = $1`,
      [businessId]
    );

    if (result.rows.length === 0) {
      console.error(`No business found with ID: ${businessId}`);
      return res.status(404).json({ message: "Business not found" });
    }

    const data = result.rows[0];
    console.log(`Retrieved subscription data:`, data);

    res.json({
      status: data.subscription_status || "trial",
      isSubscribed: data.subscription_status === "active",
      trialReviewsLeft: data.trial_reviews_remaining || 0,
      trialEndsAt: data.trial_started_at
        ? new Date(
            new Date(data.trial_started_at).getTime() + 14 * 24 * 60 * 60 * 1000
          ).toISOString()
        : null,
      subscriptionEndsAt: data.subscription_ends_at,
      totalReferralEarnings: data.total_referral_earnings || 0,
      paymentMethod: {
        cardLast4: data.card_last4 || null,
        cardBrand: data.card_brand || null,
        displayName:
          data.card_brand && data.card_last4
            ? `${
                data.card_brand.charAt(0).toUpperCase() +
                data.card_brand.slice(1)
              } ending in ${data.card_last4}`
            : null,
      },
    });
  } catch (error) {
    console.error("Error fetching subscription status:", error);
    res.status(500).json({ message: "Failed to fetch subscription status" });
  }
};

exports.cancelSubscription = async (req, res) => {
  try {
    const businessId = req.user.businessId;
    console.log(`Processing direct cancellation for business: ${businessId}`);

    // Get Stripe subscription ID without filtering by status
    const result = await pool.query(
      "SELECT stripe_subscription_id FROM subscriptions WHERE business_id = $1",
      [businessId]
    );

    if (!result.rows[0]?.stripe_subscription_id) {
      console.error(`No subscription ID found for business ${businessId}`);
      return res.status(404).json({
        message:
          "No active subscription found. Please contact support if you believe this is an error.",
      });
    }

    const subscriptionId = result.rows[0].stripe_subscription_id;
    console.log(`Cancelling Stripe subscription: ${subscriptionId}`);

    // Cancel subscription in Stripe at period end
    await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    });

    // Update local database
    await pool.query(
      `UPDATE subscriptions 
       SET status = 'cancelling',
           cancelled_at = CURRENT_TIMESTAMP
       WHERE business_id = $1`,
      [businessId]
    );

    // Update business and user subscription status
    await pool.query(
      "UPDATE businesses SET subscription_status = 'cancelling' WHERE id = $1",
      [businessId]
    );

    console.log(
      `Successfully cancelled subscription for business ${businessId}`
    );
    res.json({ message: "Subscription cancelled successfully" });
  } catch (error) {
    console.error("Error cancelling subscription:", error);
    res.status(500).json({
      message: `Failed to cancel subscription: ${error.message}`,
    });
  }
};

/**
 * Middleware to check if user has active subscription access
 * This allows both "active" and "cancelling" subscriptions
 */
exports.checkSubscriptionAccess = async (req, res, next) => {
  try {
    const businessId = req.user.businessId;

    // Get subscription status and trial info
    const result = await pool.query(
      `SELECT 
        b.subscription_status,
        b.trial_reviews_remaining,
        b.trial_started_at,
        s.current_period_end
       FROM businesses b
       LEFT JOIN subscriptions s ON s.business_id = b.id
       WHERE b.id = $1`,
      [businessId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Business not found" });
    }

    const data = result.rows[0];
    const now = new Date();

    // CASE 1: Active subscription OR cancelling but still in paid period
    if (
      data.subscription_status === "active" ||
      (data.subscription_status === "cancelling" &&
        data.current_period_end &&
        new Date(data.current_period_end) > now)
    ) {
      // User has full access - paid subscription is active
      return next();
    }

    // CASE 2: Trial period access
    if (
      data.subscription_status === "trial" &&
      data.trial_reviews_remaining > 0
    ) {
      // User has trial access
      return next();
    }

    // CASE 3: Subscription fully ended or trial ended
    return res.status(403).json({
      message:
        "Your subscription has ended. Please renew your subscription to continue using premium features.",
      subscriptionEnded: true,
    });
  } catch (error) {
    console.error("Error checking subscription access:", error);
    res.status(500).json({ message: "Failed to check subscription access" });
  }
};

// Add this middleware to check review limits
exports.checkReviewLimit = async (req, res, next) => {
  try {
    const businessId = req.user.businessId;

    const result = await pool.query(
      `SELECT 
        s.status as subscription_status,
        b.trial_reviews_remaining
       FROM businesses b
       LEFT JOIN subscriptions s ON s.business_id = b.id
       WHERE b.id = $1`,
      [businessId]
    );

    const data = result.rows[0];

    if (
      data.subscription_status === "active" ||
      data.subscription_status === "cancelling"
    ) {
      return next(); // Subscribed users have unlimited reviews
    }

    if (data.trial_reviews_remaining <= 0) {
      return res.status(403).json({
        message:
          "Free trial limit reached. Please upgrade to continue collecting reviews.",
        subscriptionEnded: true,
      });
    }

    // Decrement trial reviews
    await pool.query(
      "UPDATE businesses SET trial_reviews_remaining = trial_reviews_remaining - 1 WHERE id = $1",
      [businessId]
    );

    next();
  } catch (error) {
    console.error("Error checking review limit:", error);
    res.status(500).json({ message: "Failed to check review limit" });
  }
};

// Improved createUpdateSession function
exports.createUpdateSession = async (req, res) => {
  try {
    const businessId = req.user.businessId;
    console.log(`Creating Stripe portal session for business: ${businessId}`);

    // Get customer ID without filtering by status
    const result = await pool.query(
      "SELECT stripe_subscription_id, stripe_customer_id FROM subscriptions WHERE business_id = $1",
      [businessId]
    );

    if (!result.rows[0]?.stripe_customer_id) {
      console.error(`No customer ID found for business ${businessId}`);

      // Do a more comprehensive check to see what's in the database
      const allSubs = await pool.query(
        "SELECT * FROM subscriptions WHERE business_id = $1",
        [businessId]
      );
      console.log("All subscription records:", allSubs.rows);

      return res.status(404).json({
        message:
          "No subscription found. Please contact support if you believe this is an error.",
      });
    }

    const customerId = result.rows[0].stripe_customer_id;
    console.log(`Creating portal session for customer: ${customerId}`);

    // Create Stripe billing portal session with configuration
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${process.env.FRONTEND_URL}/dashboard/settings?tab=subscription`,
      configuration: process.env.STRIPE_PORTAL_CONFIG_ID || undefined,
    });

    console.log(`Created Stripe portal session successfully: ${session.id}`);
    res.json({ url: session.url });
  } catch (error) {
    console.error("Error details:", error);
    res
      .status(500)
      .json({ message: `Failed to access Stripe portal: ${error.message}` });
  }
};
