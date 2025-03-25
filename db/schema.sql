CREATE TABLE businesses (
    id SERIAL PRIMARY KEY,
    business_name VARCHAR(255) NOT NULL,
    owner_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(20) NOT NULL,
    address TEXT NOT NULL,
    google_review_link TEXT,
    referral_code VARCHAR(50),
    password VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE subscriptions (
    id SERIAL PRIMARY KEY,
    business_id INTEGER REFERENCES businesses(id),
    payment_method VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE reviews (
    id SERIAL PRIMARY KEY,
    business_id INTEGER REFERENCES businesses(id),
    customer_name VARCHAR(255),
    rating INTEGER NOT NULL,
    comment TEXT,
    reply TEXT,
    replied_at TIMESTAMP WITH TIME ZONE,
    source VARCHAR(50) DEFAULT 'direct',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS qr_codes (
    id SERIAL PRIMARY KEY,
    business_id INTEGER REFERENCES businesses(id),
    type VARCHAR(50) NOT NULL,
    url TEXT NOT NULL,
    scans INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(business_id, type)
);

ALTER TABLE businesses ADD COLUMN password VARCHAR(255);

UPDATE businesses 
SET password = '$2b$10$defaultpasswordhash' 
WHERE password IS NULL;

ALTER TABLE businesses ALTER COLUMN password SET NOT NULL; 

ALTER TABLE businesses ADD COLUMN onboarding_completed BOOLEAN DEFAULT false;