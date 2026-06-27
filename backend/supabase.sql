-- Run this in the Supabase SQL Editor to create the claims table

CREATE TABLE public.claims (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    wallet_address TEXT NOT NULL,
    task_id TEXT NOT NULL,
    tx_id TEXT,
    claimed_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    UNIQUE(wallet_address, task_id)
);

-- Enable Row Level Security (RLS) but allow the backend to bypass it using the Service Role or Anon Key
ALTER TABLE public.claims ENABLE ROW LEVEL SECURITY;

-- Allow anonymous read access (optional, if you want frontend to see leaderboards)
CREATE POLICY "Allow anonymous select" ON public.claims FOR SELECT USING (true);

-- Allow anonymous insert (for our simple tutorial since we are using anon key in backend right now)
CREATE POLICY "Allow anonymous insert" ON public.claims FOR INSERT WITH CHECK (true);

-- ============================================================
-- Token State Table: Persists the deployed token configuration
-- so the dashboard loads instantly without re-deploying.
-- ============================================================
CREATE TABLE public.token_state (
    id TEXT PRIMARY KEY DEFAULT 'cookieton',
    mint_address TEXT NOT NULL,
    creator_address TEXT NOT NULL,
    creator_token_account TEXT NOT NULL,
    mint_tx_id TEXT,
    total_supply BIGINT NOT NULL DEFAULT 500000,
    decimals INTEGER NOT NULL DEFAULT 9,
    network TEXT NOT NULL DEFAULT 'devnet',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE public.token_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anonymous select token_state" ON public.token_state FOR SELECT USING (true);
CREATE POLICY "Allow anonymous insert token_state" ON public.token_state FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anonymous update token_state" ON public.token_state FOR UPDATE USING (true);
