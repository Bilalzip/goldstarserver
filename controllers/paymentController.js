const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const pool = require('../db/index');

exports.createCheckoutSession = async (req, res) => {
  const { couponCode } = req.body;
  const businessId = req.user.id;

  console.log('=== Creating Checkout Session ===');
  console.log('Request details:', {
    businessId,
    couponCode,
    userEmail: req.user.email
  });

  try {
    // If coupon code is provided, validate it
    let coupon = null;
    if (couponCode) {
      console.log('Validating coupon code:', couponCode);
      const couponResult = await pool.query(
        'SELECT * FROM coupons WHERE code = $1 AND is_active = true',
        [couponCode]
      );
      
      if (couponResult.rows.length > 0) {
        coupon = couponResult.rows[0];
        console.log('Coupon found:', coupon);
      } else {
        console.log('Coupon not found or inactive');
      }
    }

    // Create or retrieve customer
    let customer;
    try {
      // Try to find existing customer
      const customers = await stripe.customers.list({
        email: req.user.email,
        limit: 1
      });

      if (customers.data.length > 0) {
        customer = customers.data[0];
        console.log('Found existing customer:', customer.id);
        
        // Always update customer metadata with businessId
        customer = await stripe.customers.update(customer.id, {
          metadata: { businessId }
        });
        console.log('Updated customer metadata with businessId:', customer.metadata);
      } else {
        // Create new customer with businessId in metadata
        customer = await stripe.customers.create({
          email: req.user.email,
          metadata: { businessId }
        });
        console.log('Created new customer with businessId:', customer.id, customer.metadata);
      }
    } catch (error) {
      console.error('Error handling customer:', error);
      throw error;
    }
    
    // Create Stripe session with or without coupon
    console.log('Creating Stripe checkout session...');
    const session = await stripe.checkout.sessions.create({
      customer: customer.id,
      payment_method_types: ['card'],
      line_items: [{
        price: process.env.STRIPE_PRICE_ID,
        quantity: 1,
      }],
      mode: 'subscription',
      billing_address_collection: 'required',
      success_url: `${process.env.FRONTEND_URL}/dashboard?success=true`,
      cancel_url: `${process.env.FRONTEND_URL}/dashboard/payment?canceled=true`,
      metadata: {
        business_id: businessId,
        coupon_code: couponCode || ''
      }
    });

    console.log('Stripe session created successfully:', {
      sessionId: session.id,
      url: session.url,
      metadata: session.metadata,
      customerId: customer.id
    });
    
    res.json({ url: session.url });
  } catch (error) {
    console.error('Error creating checkout session:', {
      error: error.message,
      stack: error.stack,
      businessId
    });
    res.status(500).json({ 
      message: 'Error creating checkout session',
      error: error.message 
    });
  }
};

exports.handleWebhook = async (req, res) => {
  console.log('=== Webhook Received ===');
  console.log('Webhook headers:', {
    'stripe-signature': req.headers['stripe-signature']
  });
  console.log('Webhook body:', req.body);

  const sig = req.headers['stripe-signature'];
  let event;
  
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
    
    console.log('Webhook verified successfully:', {
      eventType: event.type,
      eventId: event.id
    });

    // Handle different event types
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(event.data.object);
        break;
      
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionUpdate(event.data.object);
        break;
      
      case 'invoice.payment_succeeded':
        await handleInvoicePaymentSucceeded(event.data.object);
        break;
    }

    res.json({ received: true });
  } catch (err) {
    console.error('Webhook Error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
};

async function handleCheckoutSessionCompleted(session) {
  const businessId = session.metadata.businessId;
  console.log('Processing checkout session for business:', businessId);

  try {
    // First check if subscription exists
    console.log('Checking for existing subscription...');
    const existingSubscription = await pool.query(
      'SELECT * FROM subscriptions WHERE business_id = $1',
      [businessId]
    );

    console.log('Existing subscription check result:', {
      exists: existingSubscription.rows.length > 0,
      subscription: existingSubscription.rows[0]
    });

    let query;
    let values;

    if (existingSubscription.rows.length === 0) {
      console.log('Creating new subscription...');
      query = `
        INSERT INTO subscriptions (
          business_id,
          stripe_subscription_id,
          stripe_customer_id,
          status,
          amount,
          payment_method
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `;
      values = [
        businessId, 
        session.subscription, 
        session.customer, 
        'active', 
        399,
        'card'
      ];
    } else {
      console.log('Updating existing subscription...');
      query = `
        UPDATE subscriptions 
        SET stripe_subscription_id = $2,
            stripe_customer_id = $3,
            status = $4,
            amount = $5,
            payment_method = $6,
            updated_at = CURRENT_TIMESTAMP
        WHERE business_id = $1
        RETURNING *
      `;
      values = [
        businessId, 
        session.subscription, 
        session.customer, 
        'active', 
        399,
        'card'
      ];
    }

    console.log('Executing database query:', {
      query: query,
      values: values
    });

    const result = await pool.query(query, values);
    console.log('Database operation result:', {
      success: true,
      affectedRows: result.rowCount,
      subscription: result.rows[0]
    });

    // Handle referral logic here...
    await handleReferral(businessId);
  } catch (error) {
    console.error('Error processing checkout session:', {
      error: error.message,
      stack: error.stack,
      businessId
    });
  }
}

async function handleSubscriptionUpdate(subscription) {
  console.log('Processing subscription update:', {
    subscriptionId: subscription.id,
    status: subscription.status,
    customerId: subscription.customer
  });

  try {
    // First get the business_id from the customer metadata
    const customer = await stripe.customers.retrieve(subscription.customer);
    const businessId = customer.metadata.businessId;

    if (!businessId) {
      console.error('No businessId found in customer metadata:', {
        customerId: subscription.customer,
        metadata: customer.metadata
      });
      return;
    }

    console.log('Found businessId from customer metadata:', businessId);

    const result = await pool.query(
      `UPDATE subscriptions 
       SET status = $1,
           business_id = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE stripe_subscription_id = $3
       RETURNING *`,
      [subscription.status, businessId, subscription.id]
    );

    console.log('Subscription update result:', {
      success: true,
      affectedRows: result.rowCount,
      subscription: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating subscription:', {
      error: error.message,
      stack: error.stack,
      subscriptionId: subscription.id
    });
  }
}

async function handleInvoicePaymentSucceeded(invoice) {
  console.log('Processing successful invoice payment:', {
    invoiceId: invoice.id,
    subscriptionId: invoice.subscription,
    customerId: invoice.customer
  });

  try {
    // Get the customer to find business_id
    const customer = await stripe.customers.retrieve(invoice.customer);
    const businessId = customer.metadata.businessId;

    if (!businessId) {
      console.error('No businessId found in customer metadata:', {
        customerId: invoice.customer,
        metadata: customer.metadata
      });
      return;
    }

    console.log('Found businessId from customer metadata:', businessId);

    const result = await pool.query(
      `UPDATE subscriptions 
       SET status = 'active',
           business_id = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE stripe_subscription_id = $1
       RETURNING *`,
      [invoice.subscription, businessId]
    );

    console.log('Invoice payment processing result:', {
      success: true,
      affectedRows: result.rowCount,
      subscription: result.rows[0]
    });
  } catch (error) {
    console.error('Error processing invoice payment:', {
      error: error.message,
      stack: error.stack,
      invoiceId: invoice.id
    });
  }
}

async function handleReferral(businessId) {
  console.log('Checking for referral...');
  
  const referralResult = await pool.query(
    `SELECT r.referrer_id, b.business_name as referrer_name
     FROM referrals r
     JOIN businesses b ON b.id = r.referrer_id
     WHERE r.referred_business_id = $1`,
    [businessId]
  );

  console.log('Referral query result:', referralResult.rows[0]);

  if (referralResult.rows[0]?.referrer_id) {
    const referrerId = referralResult.rows[0].referrer_id;
    const referrerName = referralResult.rows[0].referrer_name;
    const commissionAmount = 100;

    console.log('Found referral:', {
      referrerId,
      referrerName,
      commissionAmount,
      referredBusinessId: businessId
    });

    try {
      await pool.query('BEGIN');

      // Check if earning already exists
      const existingEarning = await pool.query(
        `SELECT id FROM referral_earnings 
         WHERE seller_id = $1 AND business_id = $2`,
        [referrerId, businessId]
      );
      
      if (existingEarning.rows.length === 0) {
        console.log('Creating new referral earning...');
        
        const earningResult = await pool.query(
          `INSERT INTO referral_earnings (
            seller_id,
            business_id,
            amount,
            status,
            created_at
          ) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
          RETURNING *`,
          [referrerId, businessId, commissionAmount, 'pending']
        );

        console.log('Created referral earning:', earningResult.rows[0]);

        const updateResult = await pool.query(
          `UPDATE businesses 
           SET total_referral_earnings = COALESCE(total_referral_earnings, 0) + $1
           WHERE id = $2
           RETURNING id, total_referral_earnings`,
          [commissionAmount, referrerId]
        );

        console.log('Updated referrer total earnings:', updateResult.rows[0]);
      } else {
        console.log('Referral earning already exists for this business');
      }

      await pool.query('COMMIT');
      console.log('Referral transaction committed successfully');
    } catch (error) {
      await pool.query('ROLLBACK');
      console.error('Error processing referral:', {
        error: error.message,
        stack: error.stack,
        referrerId,
        businessId
      });
    }
  } else {
    console.log('No referral found for business:', businessId);
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
    
    res.json({ message: 'Trial started successfully' });
  } catch (error) {
    console.error('Error starting trial:', error);
    res.status(500).json({ message: 'Failed to start trial' });
  }
};

exports.getSubscriptionStatus = async (req, res) => {
  try {
    const businessId = req.user.businessId;
    
    const result = await pool.query(
      `SELECT 
        s.status as subscription_status,
        s.stripe_subscription_id,
        s.current_period_end as subscription_ends_at,
        b.trial_reviews_remaining,
        b.total_referral_earnings
       FROM businesses b
       LEFT JOIN subscriptions s ON s.business_id = b.id
       WHERE b.id = $1`,
      [businessId]
    );

    const data = result.rows[0];
    
    res.json({
      status: data.subscription_status || 'trial',
      isSubscribed: data.subscription_status === 'active',
      trialReviewsLeft: data.trial_reviews_remaining || 0,
      subscriptionEndsAt: data.subscription_ends_at,
      totalReferralEarnings: data.total_referral_earnings || 0
    });
  } catch (error) {
    console.error('Error fetching subscription status:', error);
    res.status(500).json({ message: 'Failed to fetch subscription status' });
  }
};

exports.cancelSubscription = async (req, res) => {
  try {
    const businessId = req.user.businessId;
    
    // Get Stripe subscription ID
    const result = await pool.query(
      'SELECT stripe_subscription_id FROM subscriptions WHERE business_id = $1 AND status = $2',
      [businessId, 'active']
    );

    if (!result.rows[0]?.stripe_subscription_id) {
      return res.status(404).json({ message: 'No active subscription found' });
    }

    // Cancel subscription in Stripe at period end
    await stripe.subscriptions.update(result.rows[0].stripe_subscription_id, {
      cancel_at_period_end: true
    });

    // Update local database
    await pool.query(
      `UPDATE subscriptions 
       SET status = 'cancelling',
           cancelled_at = CURRENT_TIMESTAMP
       WHERE business_id = $1`,
      [businessId]
    );

    res.json({ message: 'Subscription cancelled successfully' });
  } catch (error) {
    console.error('Error cancelling subscription:', error);
    res.status(500).json({ message: 'Failed to cancel subscription' });
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

    if (data.subscription_status === 'active') {
      return next(); // Subscribed users have unlimited reviews
    }

    if (data.trial_reviews_remaining <= 0) {
      return res.status(403).json({
        message: 'Free trial limit reached. Please upgrade to continue collecting reviews.'
      });
    }

    // Decrement trial reviews
    await pool.query(
      'UPDATE businesses SET trial_reviews_remaining = trial_reviews_remaining - 1 WHERE id = $1',
      [businessId]
    );

    next();
  } catch (error) {
    console.error('Error checking review limit:', error);
    res.status(500).json({ message: 'Failed to check review limit' });
  }
};

// Add this new function to handle payment method updates
exports.createUpdateSession = async (req, res) => {
  try {
    const businessId = req.user.businessId;
    
    // Get the subscription details
    const result = await pool.query(
      'SELECT stripe_subscription_id, stripe_customer_id FROM subscriptions WHERE business_id = $1',
      [businessId]
    );

    if (!result.rows[0]?.stripe_customer_id) {
      return res.status(404).json({ message: 'No active subscription found' });
    }

    // Create Stripe billing portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: result.rows[0].stripe_customer_id,
      return_url: `${process.env.FRONTEND_URL}/dashboard/settings`,
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error('Error creating update session:', error);
    res.status(500).json({ message: 'Failed to create update session' });
  }
}; 