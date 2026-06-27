import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { Connection, Keypair, PublicKey, Transaction, clusterApiUrl } from '@solana/web3.js';
import { getAssociatedTokenAddressSync, createAssociatedTokenAccountInstruction, createTransferInstruction, TOKEN_PROGRAM_ID } from '@solana/spl-token';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

// 1. Initialize Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY; // In a real prod app, use Service Role Key for backend bypass of RLS
const supabase = createClient(supabaseUrl, supabaseKey);

// 2. Initialize Solana Connection & Wallet
// We connect to mainnet-beta for production.
const connection = new Connection(clusterApiUrl('mainnet-beta'), 'confirmed');

let payerWallet = null;
try {
  const secretKeyString = process.env.DEVELOPER_WALLET_SECRET;
  if (secretKeyString && secretKeyString !== '[]') {
    const secretKeyArray = JSON.parse(secretKeyString);
    payerWallet = Keypair.fromSecretKey(new Uint8Array(secretKeyArray));
    console.log(`[+] Developer Wallet loaded: ${payerWallet.publicKey.toBase58()}`);
  } else {
    console.warn('[!] DEVELOPER_WALLET_SECRET is not set in .env! Backend cannot send tokens.');
  }
} catch (err) {
  console.error('[!] Failed to load Developer Wallet:', err.message);
}

// Token State Configuration (hardcoded for the backend, or can be fetched from DB)
// For simplicity, we define it here based on what we deployed.
// You should replace these values with your actual deployed state from localStorage.
const TOKEN_CONFIG = {
  mintAddress: process.env.TOKEN_MINT_ADDRESS || "", // Needs to be added to .env
  decimals: 9,
};

// Helper: Get or Create ATA Instruction
const getOrCreateATAInstruction = async (payer, mint, owner, tx) => {
  const ata = getAssociatedTokenAddressSync(mint, owner);
  const accountInfo = await connection.getAccountInfo(ata);
  if (!accountInfo) {
    tx.add(
      createAssociatedTokenAccountInstruction(
        payer,
        ata,
        owner,
        mint
      )
    );
  }
  return ata;
};

// API Route: Claim Bounty
app.post('/api/claim-bounty', async (req, res) => {
  const { walletAddress, taskId, reward } = req.body;

  if (!walletAddress || !taskId || !reward) {
    return res.status(400).json({ error: 'Missing required parameters: walletAddress, taskId, reward' });
  }

  if (!payerWallet || !TOKEN_CONFIG.mintAddress) {
    return res.status(500).json({ error: 'Backend is not properly configured with Developer Keys or Token Mint Address.' });
  }

  try {
    // 1. Validate against Supabase
    // Check if user already claimed this task
    const { data: existingClaims, error: fetchError } = await supabase
      .from('claims')
      .select('*')
      .eq('wallet_address', walletAddress)
      .eq('task_id', taskId);

    if (fetchError) {
      console.error('Supabase error:', fetchError);
      return res.status(500).json({ error: 'Database verification failed' });
    }

    if (existingClaims && existingClaims.length > 0) {
      return res.status(403).json({ error: 'Task already claimed by this wallet.' });
    }

    // 2. Perform the Solana Transfer
    console.log(`[+] Initiating transfer of ${reward} COOKIE to ${walletAddress} for task ${taskId}...`);
    const recipientPubkey = new PublicKey(walletAddress);
    const mintPubkey = new PublicKey(TOKEN_CONFIG.mintAddress);
    
    const sourceAta = getAssociatedTokenAddressSync(mintPubkey, payerWallet.publicKey);
    const transaction = new Transaction();
    
    const destAta = await getOrCreateATAInstruction(
      payerWallet.publicKey,
      mintPubkey,
      recipientPubkey,
      transaction
    );

    const rawAmount = BigInt(Math.floor(reward * Math.pow(10, TOKEN_CONFIG.decimals)));
    
    transaction.add(
      createTransferInstruction(
        sourceAta,
        destAta,
        payerWallet.publicKey,
        rawAmount
      )
    );

    transaction.feePayer = payerWallet.publicKey;
    const latestBlock = await connection.getLatestBlockhash();
    transaction.recentBlockhash = latestBlock.blockhash;
    transaction.sign(payerWallet);
    
    const txId = await connection.sendRawTransaction(transaction.serialize());
    
    await connection.confirmTransaction({
      blockhash: latestBlock.blockhash,
      lastValidBlockHeight: latestBlock.lastValidBlockHeight,
      signature: txId
    });
    
    console.log(`[+] Transfer successful! Tx: ${txId}`);

    // 3. Log the successful claim into Supabase
    const { error: insertError } = await supabase
      .from('claims')
      .insert([
        {
          wallet_address: walletAddress,
          task_id: taskId,
          tx_id: txId
        }
      ]);

    if (insertError) {
      console.error('[!] Failed to insert claim into database:', insertError);
      // NOTE: Transfer succeeded but DB log failed. In prod, use transactions.
    }

    // 4. Return success to frontend
    res.json({
      success: true,
      txId: txId,
      message: `Successfully earned ${reward} COOKIE!`
    });

  } catch (error) {
    console.error('[!] Error processing claim:', error);
    res.status(500).json({ error: error.message });
  }
});

// API Route: Get Token State
app.get('/api/token-state', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('token_state')
      .select('*')
      .eq('id', 'cookieton')
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows
      console.error('Supabase error fetching token state:', error);
      return res.status(500).json({ error: 'Failed to fetch token state' });
    }

    if (!data) {
      return res.status(404).json({ error: 'Token not yet deployed' });
    }

    // Map DB columns back to camelCase for frontend
    res.json({
      mintAddress: data.mint_address,
      creatorAddress: data.creator_address,
      creatorTokenAccount: data.creator_token_account,
      mintTxId: data.mint_tx_id,
      totalSupply: Number(data.total_supply),
      decimals: data.decimals,
      network: data.network,
      createdAt: data.created_at,
    });
  } catch (error) {
    console.error('[!] Error fetching token state:', error);
    res.status(500).json({ error: error.message });
  }
});

// API Route: Save Token State
app.post('/api/token-state', async (req, res) => {
  const { mintAddress, creatorAddress, creatorTokenAccount, mintTxId, totalSupply, decimals, network } = req.body;

  if (!mintAddress || !creatorAddress) {
    return res.status(400).json({ error: 'Missing required fields: mintAddress, creatorAddress' });
  }

  try {
    const { error } = await supabase
      .from('token_state')
      .upsert({
        id: 'cookieton',
        mint_address: mintAddress,
        creator_address: creatorAddress,
        creator_token_account: creatorTokenAccount || '',
        mint_tx_id: mintTxId || '',
        total_supply: totalSupply || 500000,
        decimals: decimals || 9,
        network: network || 'devnet',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });

    if (error) {
      console.error('Supabase error saving token state:', error);
      return res.status(500).json({ error: 'Failed to save token state' });
    }

    // Also update the in-memory TOKEN_CONFIG so the bounty endpoint uses the new mint
    TOKEN_CONFIG.mintAddress = mintAddress;
    TOKEN_CONFIG.decimals = decimals || 9;

    console.log(`[+] Token state saved to database. Mint: ${mintAddress}`);
    res.json({ success: true, message: 'Token state saved successfully' });
  } catch (error) {
    console.error('[!] Error saving token state:', error);
    res.status(500).json({ error: error.message });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`[+] Cookieton Backend listening on port ${PORT}`);
});
