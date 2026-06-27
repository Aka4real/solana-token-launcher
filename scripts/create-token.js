import {
  Connection,
  Keypair,
  clusterApiUrl,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  setAuthority,
  AuthorityType,
} from '@solana/spl-token';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths
const configPath = path.join(__dirname, '..', 'public', 'config.json');
const keypairPath = path.join(__dirname, '..', 'public', 'keypair.json');
const statePath = path.join(__dirname, '..', 'public', 'token-state.json');

async function main() {
  console.log('--- Cookieton Token Creator ---');

  // 1. Load config
  if (!fs.existsSync(configPath)) {
    console.error('Error: config.json not found. Please create it first.');
    process.exit(1);
  }
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  console.log(`Loaded Config: ${config.name} (${config.symbol})`);
  console.log(`Target Supply: ${config.totalSupply.toLocaleString()} tokens`);
  console.log(`Target Decimals: ${config.decimals}`);
  console.log(`Network: ${config.network}`);

  // 2. Load or Generate Keypair
  let payer;
  if (fs.existsSync(keypairPath)) {
    console.log('Loading existing keypair from keypair.json...');
    const secretKeyString = fs.readFileSync(keypairPath, 'utf8');
    const secretKey = Uint8Array.from(JSON.parse(secretKeyString));
    payer = Keypair.fromSecretKey(secretKey);
  } else {
    console.log('Generating new developer keypair...');
    payer = Keypair.generate();
    fs.writeFileSync(keypairPath, JSON.stringify(Array.from(payer.secretKey)));
    console.log(`New keypair generated and saved to keypair.json.`);
  }
  console.log(`Payer Public Key: ${payer.publicKey.toBase58()}`);

  // 3. Connect to Cluster
  const networkUrl = config.network === 'mainnet' 
    ? 'https://api.mainnet-beta.solana.com' 
    : clusterApiUrl('devnet');
  const connection = new Connection(networkUrl, 'confirmed');
  console.log(`Connected to Solana ${config.network} cluster.`);

  // 4. Airdrop SOL if on Devnet
  if (config.network === 'devnet') {
    const balance = await connection.getBalance(payer.publicKey);
    console.log(`Current Balance: ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);

    if (balance < 0.05 * LAMPORTS_PER_SOL) {
      console.log('Balance is low. Attempting to request airdrop...');
      let airdropSuccess = false;
      
      // Try different amounts as smaller amounts are more likely to succeed
      for (const amount of [1.0, 0.5, 0.1]) {
        try {
          console.log(`Requesting ${amount} SOL airdrop...`);
          const airdropSignature = await connection.requestAirdrop(
            payer.publicKey,
            amount * LAMPORTS_PER_SOL
          );
          
          // Wait for confirmation
          const latestBlockHash = await connection.getLatestBlockhash();
          await connection.confirmTransaction({
            blockhash: latestBlockHash.blockhash,
            lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
            signature: airdropSignature,
          });
          
          const newBalance = await connection.getBalance(payer.publicKey);
          console.log(`Airdrop successful! New Balance: ${(newBalance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
          airdropSuccess = true;
          break;
        } catch (err) {
          console.warn(`Airdrop request for ${amount} SOL failed due to rate limits or RPC traffic.`);
        }
      }

      if (!airdropSuccess) {
        console.warn('Standard faucet airdrop requests failed (public RPC node is congested).');
        console.warn('Please manually fund this developer account to proceed:');
        console.warn(`Public Key: ${payer.publicKey.toBase58()}`);
        console.warn('You can copy this address and use a web faucet like:');
        console.warn('  - https://faucet.solana.com/');
        console.warn('  - https://solfaucet.com/');
      }
    }
  }

  // Double check balance
  const finalBalance = await connection.getBalance(payer.publicKey);
  if (finalBalance === 0) {
    console.error('Insufficient funds to create a token. Please fund your public key first:', payer.publicKey.toBase58());
    process.exit(1);
  }

  // 5. Create the Mint
  console.log('Creating new token mint...');
  const mint = await createMint(
    connection,
    payer,             // Payer
    payer.publicKey,   // Mint authority
    payer.publicKey,   // Freeze authority (optional, set to payer)
    config.decimals    // Decimals
  );
  console.log(`Token Mint Address: ${mint.toBase58()}`);

  // 6. Create Associated Token Account
  console.log('Creating Associated Token Account (ATA) for the creator...');
  const tokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    mint,
    payer.publicKey
  );
  console.log(`Creator ATA: ${tokenAccount.address.toBase58()}`);

  // 7. Mint initial supply
  const mintAmount = BigInt(config.totalSupply) * BigInt(10 ** config.decimals);
  console.log(`Minting ${config.totalSupply.toLocaleString()} ${config.symbol} to creator's ATA...`);
  const mintTxId = await mintTo(
    connection,
    payer,
    mint,
    tokenAccount.address,
    payer,
    mintAmount
  );
  console.log(`Mint Transaction ID: ${mintTxId}`);

  // 8. Revoke Mint Authority to enforce Capped Supply
  console.log('Revoking mint authority to enforce capped supply...');
  const revokeTxId = await setAuthority(
    connection,
    payer,
    mint,
    payer,
    AuthorityType.MintTokens,
    null // Setting authority to null disables minting permanently
  );
  console.log(`Revoke Mint Authority Transaction ID: ${revokeTxId}`);

  // 9. Save State
  const tokenState = {
    mintAddress: mint.toBase58(),
    creatorAddress: payer.publicKey.toBase58(),
    creatorTokenAccount: tokenAccount.address.toBase58(),
    mintTxId,
    revokeTxId,
    totalSupply: config.totalSupply,
    decimals: config.decimals,
    network: config.network,
    createdAt: new Date().toISOString()
  };

  fs.writeFileSync(statePath, JSON.stringify(tokenState, null, 2));
  console.log('Token state saved to token-state.json');
  console.log('\n--- SUCCESS! ---');
  console.log(`Token Mint: https://explorer.solana.com/address/${mint.toBase58()}?cluster=${config.network}`);
  console.log(`Creator ATA: https://explorer.solana.com/address/${tokenAccount.address.toBase58()}?cluster=${config.network}`);
}

main().catch((err) => {
  console.error('Error during token creation:', err);
});
