import React, { useState, useEffect } from 'react';
import { 
  Connection, 
  Keypair, 
  PublicKey, 
  Transaction, 
  clusterApiUrl, 
  LAMPORTS_PER_SOL 
} from '@solana/web3.js';
import { 
  getAssociatedTokenAddressSync, 
  createAssociatedTokenAccountInstruction, 
  createMintToInstruction, 
  createBurnInstruction, 
  createTransferInstruction,
  getAccount,
  TOKEN_PROGRAM_ID
} from '@solana/spl-token';
import { 
  Coins, 
  Flame, 
  Send, 
  ExternalLink, 
  Wallet, 
  Terminal, 
  RefreshCw, 
  Copy, 
  Check, 
  FileText, 
  AlertCircle, 
  CheckCircle,
  Gift,
  Star,
  Clock,
  Twitter,
  MessageCircle,
  HelpCircle,
  Image,
  X,
  Target
} from 'lucide-react';
import confetti from 'canvas-confetti';

export default function App() {
  // Token state
  const [config, setConfig] = useState({
    name: 'cookieton',
    symbol: 'COOKIE',
    decimals: 9,
    totalSupply: 500000,
    description: 'A delicious, freshly baked token on Solana, cooked up by Antigravity and the Chef.',
    network: 'devnet'
  });
  const [tokenState, setTokenState] = useState(null);
  const [payerWallet, setPayerWallet] = useState(null); // Keypair

  // Balances
  const [solBalance, setSolBalance] = useState(0);
  const [tokenBalance, setTokenBalance] = useState(0);

  // Forms
  const [transferRecipient, setTransferRecipient] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [burnAmount, setBurnAmount] = useState('');
  const [earnRecipient, setEarnRecipient] = useState('');

  // Earn Tasks
  const [bountyTasks, setBountyTasks] = useState([
    { id: 'daily_check', title: 'Daily Oven Check', description: 'Check the oven daily to earn free cookies! Claimable once every 24 hours.', reward: 1, completed: false, verifying: false, actionLabel: 'Check Oven', icon: 'clock', type: 'daily' },
    { id: 'join_discord', title: 'Join the Bakery (Discord)', description: 'Join our Discord community server and become part of the Bakery crew.', reward: 5, completed: false, verifying: false, actionLabel: 'Join Discord', icon: 'discord', type: 'link', url: 'https://discord.gg/cookieton' },
    { id: 'bake_tweet', title: 'Bake a Tweet', description: 'Tweet about Cookieton with #BakeSomeCookies and tag @CookietonWeb3.', reward: 5, completed: false, verifying: false, actionLabel: 'Tweet Now', icon: 'twitter', type: 'link', url: 'https://twitter.com/intent/tweet?text=I%27m%20baking%20some%20%24COOKIE%20on%20Solana!%20%23BakeSomeCookies%20%40CookietonWeb3' },
    { id: 'secret_quiz', title: 'The Secret Recipe Quiz', description: 'Prove you know Cookieton by answering 3 questions correctly. No second chances!', reward: 15, completed: false, verifying: false, actionLabel: 'Take Quiz', icon: 'quiz', type: 'quiz' },
    { id: 'meme_baker', title: 'Meme Baker', description: 'Create a Cookieton meme, post it on X, and submit the link below for review.', reward: 20, completed: false, verifying: false, actionLabel: 'Submit Meme', icon: 'meme', type: 'meme' },
  ]);

  // Quiz state
  const [showQuizModal, setShowQuizModal] = useState(false);
  const [quizAnswers, setQuizAnswers] = useState({});
  const [quizError, setQuizError] = useState('');

  // Meme state
  const [memeLink, setMemeLink] = useState('');

  // Daily timer state
  const [dailyCooldown, setDailyCooldown] = useState('');
  const [dailyAvailable, setDailyAvailable] = useState(true);

  // UI state
  const [activeTab, setActiveTab] = useState('dashboard');
  const [logs, setLogs] = useState([]);
  const [copiedText, setCopiedText] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [notification, setNotification] = useState(null);

  // Connection
  const connection = new Connection(
    config.network === 'mainnet' 
      ? 'https://api.mainnet-beta.solana.com' 
      : clusterApiUrl('devnet'), 
    'confirmed'
  );

  const addLog = (message, type = 'info') => {
    setLogs(prev => [{
      id: Date.now() + Math.random(),
      message,
      type,
      time: new Date().toLocaleTimeString()
    }, ...prev]);
  };

  const showNotification = (message, type = 'info') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 5000);
  };

  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text);
    setCopiedText(text);
    showNotification(`${label} copied to clipboard!`, 'success');
    setTimeout(() => setCopiedText(null), 2000);
  };

  // 1. Initial Load of Config, State, Wallet
  useEffect(() => {
    async function loadInitialData() {
      addLog('Initializing Cookieton dashboard...');
      
      // Load config.json
      try {
        const configRes = await fetch('/config.json');
        if (configRes.ok) {
          const configData = await configRes.json();
          setConfig(configData);
          addLog(`Loaded config: ${configData.name} (${configData.symbol})`, 'success');
        }
      } catch (err) {
        addLog('Failed to fetch config.json. Using default values.', 'warning');
      }

      // Load keypair.json
      try {
        const keypairRes = await fetch('/keypair.json');
        if (keypairRes.ok) {
          const keypairData = await keypairRes.json();
          const wallet = Keypair.fromSecretKey(new Uint8Array(keypairData));
          setPayerWallet(wallet);
          addLog(`Loaded developer wallet: ${wallet.publicKey.toBase58().substring(0, 8)}...`, 'success');
        } else {
          // Check localStorage
          const savedKey = localStorage.getItem('cookieton_dev_key');
          if (savedKey) {
            const secret = new Uint8Array(JSON.parse(savedKey));
            const wallet = Keypair.fromSecretKey(secret);
            setPayerWallet(wallet);
            addLog(`Loaded generated wallet from storage: ${wallet.publicKey.toBase58().substring(0, 8)}...`, 'success');
          } else {
            addLog('No developer keypair found. You can generate one below.', 'info');
          }
        }
      } catch (err) {
        addLog('Error checking developer keypair. Ready to create new.', 'info');
      }

      // Load token state from Backend (Supabase)
      try {
        const stateRes = await fetch('http://localhost:3001/api/token-state');
        if (stateRes.ok) {
          const stateData = await stateRes.json();
          setTokenState(stateData);
          addLog(`Token loaded from database! Mint: ${stateData.mintAddress.substring(0, 8)}...`, 'success');
        } else {
          // Fallback: Check localStorage
          const savedState = localStorage.getItem('cookieton_state');
          if (savedState) {
            const stateData = JSON.parse(savedState);
            setTokenState(stateData);
            addLog(`Loaded token from local storage: ${stateData.mintAddress.substring(0, 8)}...`, 'success');
          } else {
            addLog('Token not yet deployed. Ready to deploy!', 'info');
          }
        }
      } catch (err) {
        // Fallback: Check localStorage if backend is down
        const savedState = localStorage.getItem('cookieton_state');
        if (savedState) {
          const stateData = JSON.parse(savedState);
          setTokenState(stateData);
          addLog(`Loaded token from local storage (backend offline): ${stateData.mintAddress.substring(0, 8)}...`, 'warning');
        } else {
          addLog('Token not yet deployed. Ready to deploy!', 'info');
        }
      }
    }

    loadInitialData();
  }, []);

  // 2. Fetch Balances
  const fetchBalances = async () => {
    if (!payerWallet) return;
    setIsLoading(true);
    addLog('Refreshing balances...');
    try {
      // SOL Balance
      const balance = await connection.getBalance(payerWallet.publicKey);
      setSolBalance(balance / LAMPORTS_PER_SOL);

      // Token Balance
      if (tokenState) {
        const mintPubkey = new PublicKey(tokenState.mintAddress);
        const ata = getAssociatedTokenAddressSync(mintPubkey, payerWallet.publicKey);
        
        try {
          const accountInfo = await getAccount(connection, ata);
          const balance = Number(accountInfo.amount) / Math.pow(10, tokenState.decimals);
          setTokenBalance(balance);
          addLog(`Refreshed balances. SOL: ${(balance / LAMPORTS_PER_SOL).toFixed(4)}, COOKIE: ${balance}`, 'success');
        } catch (err) {
          setTokenBalance(0);
          addLog('Token account not yet created or empty.', 'warning');
        }
      }
      showNotification('Balances refreshed!', 'success');
    } catch (err) {
      console.error(err);
      addLog('Error fetching balances: ' + err.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (payerWallet) {
      fetchBalances();
    }
  }, [payerWallet, tokenState]);

  // 3. Generate Wallet
  const generateWallet = () => {
    const newWallet = Keypair.generate();
    setPayerWallet(newWallet);
    localStorage.setItem('cookieton_dev_key', JSON.stringify(Array.from(newWallet.secretKey)));
    addLog(`Generated new developer wallet: ${newWallet.publicKey.toBase58()}`, 'success');
    showNotification('New developer wallet generated locally!', 'success');
  };

  // 4. Request Airdrop
  const requestAirdrop = async () => {
    if (!payerWallet) return;
    setIsLoading(true);
    addLog('Requesting 2 SOL Devnet airdrop...');
    try {
      const signature = await connection.requestAirdrop(
        payerWallet.publicKey,
        2 * LAMPORTS_PER_SOL
      );
      addLog('Airdrop transaction submitted. Confirming...', 'info');
      
      const latestBlock = await connection.getLatestBlockhash();
      await connection.confirmTransaction({
        blockhash: latestBlock.blockhash,
        lastValidBlockHeight: latestBlock.lastValidBlockHeight,
        signature
      });

      addLog('Airdrop confirmed!', 'success');
      fetchBalances();
    } catch (err) {
      console.error(err);
      addLog('Airdrop failed: ' + err.message, 'error');
      showNotification('Airdrop rate-limited. Try again later or fund manually.', 'error');
    } finally {
      setIsLoading(false);
    }
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
      addLog(`Added create Associated Token Account instruction for ${owner.toBase58().substring(0, 8)}...`, 'info');
    }
    return ata;
  };

  // 5. Burn Tokens
  const handleBurn = async (e) => {
    e.preventDefault();
    if (!payerWallet || !tokenState || !burnAmount) return;
    setIsLoading(true);
    addLog(`Initiating burn of ${burnAmount} COOKIE...`, 'info');

    try {
      const mintPubkey = new PublicKey(tokenState.mintAddress);
      const ata = getAssociatedTokenAddressSync(mintPubkey, payerWallet.publicKey);
      
      const rawAmount = BigInt(Math.floor(Number(burnAmount) * Math.pow(10, tokenState.decimals)));
      
      const transaction = new Transaction().add(
        createBurnInstruction(
          ata,
          mintPubkey,
          payerWallet.publicKey,
          rawAmount
        )
      );

      transaction.feePayer = payerWallet.publicKey;
      const latestBlock = await connection.getLatestBlockhash();
      transaction.recentBlockhash = latestBlock.blockhash;

      transaction.sign(payerWallet);
      const txId = await connection.sendRawTransaction(transaction.serialize());
      addLog(`Burn transaction sent: ${txId.substring(0, 8)}... Confirming...`, 'info');

      await connection.confirmTransaction({
        blockhash: latestBlock.blockhash,
        lastValidBlockHeight: latestBlock.lastValidBlockHeight,
        signature: txId
      });

      addLog(`Burn successful! ${burnAmount} COOKIE destroyed forever.`, 'success');
      showNotification(`Burned ${burnAmount} COOKIE successfully!`, 'success');
      
      // Update tokenState supply locally to show updated supply
      const updatedState = {
        ...tokenState,
        totalSupply: tokenState.totalSupply - Number(burnAmount)
      };
      setTokenState(updatedState);
      localStorage.setItem('cookieton_state', JSON.stringify(updatedState));

      setBurnAmount('');
      fetchBalances();
    } catch (err) {
      console.error(err);
      addLog('Burn failed: ' + err.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // 6. Transfer Tokens
  const handleTransfer = async (e) => {
    e.preventDefault();
    if (!payerWallet || !tokenState || !transferRecipient || !transferAmount) return;
    setIsLoading(true);
    
    addLog(`Preparing transfer of ${transferAmount} COOKIE to ${transferRecipient.substring(0, 8)}...`, 'info');

    try {
      const mintPubkey = new PublicKey(tokenState.mintAddress);
      const recipientPubkey = new PublicKey(transferRecipient);
      
      const sourceAta = getAssociatedTokenAddressSync(mintPubkey, payerWallet.publicKey);
      
      const transaction = new Transaction();
      
      // Resolve/Create recipient ATA
      const destAta = await getOrCreateATAInstruction(
        payerWallet.publicKey,
        mintPubkey,
        recipientPubkey,
        transaction
      );

      const rawAmount = BigInt(Math.floor(Number(transferAmount) * Math.pow(10, tokenState.decimals)));
      
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
      addLog(`Transfer transaction sent: ${txId.substring(0, 8)}... Confirming...`, 'info');

      await connection.confirmTransaction({
        blockhash: latestBlock.blockhash,
        lastValidBlockHeight: latestBlock.lastValidBlockHeight,
        signature: txId
      });

      addLog(`Transfer of ${transferAmount} COOKIE complete! Tx: ${txId.substring(0, 16)}...`, 'success');
      showNotification(`Transferred ${transferAmount} COOKIE successfully!`, 'success');
      setTransferAmount('');
      setTransferRecipient('');
      fetchBalances();
    } catch (err) {
      console.error(err);
      addLog('Transfer failed: ' + err.message, 'error');
      showNotification('Transfer failed: check public key formatting.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // 8. Claim Bounty Reward (Via Backend)
  const handleClaimReward = async (task) => {
    if (!earnRecipient) {
      showNotification('Please enter your wallet address first.', 'error');
      return;
    }
    
    // Set verifying state
    setBountyTasks(prev => prev.map(t => t.id === task.id ? { ...t, verifying: true } : t));
    addLog(`Sending claim request to backend for task: ${task.title}...`, 'info');
    
    try {
      const response = await fetch('http://localhost:3001/api/claim-bounty', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          walletAddress: earnRecipient,
          taskId: task.id,
          reward: task.reward
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Backend request failed');
      }

      addLog(`Reward sent via Backend! Tx: ${data.txId.substring(0, 16)}...`, 'success');
      showNotification(`Earned ${task.reward} COOKIE! 🍪`, 'success');
      
      // Mark as completed
      setBountyTasks(prev => prev.map(t => t.id === task.id ? { ...t, verifying: false, completed: true } : t));
      
      // Fire confetti!
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#f59e0b', '#3b82f6', '#10b981']
      });

      // If daily task, save the timestamp to localStorage
      if (task.type === 'daily') {
        localStorage.setItem('cookieton_daily_last', Date.now().toString());
        setDailyAvailable(false);
      }

      if (payerWallet) {
        fetchBalances();
      }
      
    } catch (err) {
      console.error(err);
      addLog(`Failed to send reward: ${err.message}`, 'error');
      showNotification(err.message, 'error');
      setBountyTasks(prev => prev.map(t => t.id === task.id ? { ...t, verifying: false } : t));
    }
  };

  // 9. Handle Link-based tasks (Discord, Twitter)
  const handleLinkTask = (task) => {
    if (!earnRecipient) {
      showNotification('Please enter your wallet address first.', 'error');
      return;
    }
    // Open the link in a new tab
    window.open(task.url, '_blank');
    // After a short delay, trigger the claim
    setTimeout(() => handleClaimReward(task), 3000);
  };

  // 10. Handle Quiz submission
  const QUIZ_QUESTIONS = [
    { q: 'What is the maximum total supply of Cookieton?', options: ['1,000,000', '500,000', '100,000', '10,000,000'], correct: 1 },
    { q: 'Which blockchain is Cookieton built on?', options: ['Ethereum', 'Bitcoin', 'Solana', 'Polygon'], correct: 2 },
    { q: 'What happens when the Mint Authority is revoked?', options: ['More tokens can be created', 'The supply is permanently capped', 'Tokens are burned', 'Nothing changes'], correct: 1 },
  ];

  const handleQuizSubmit = () => {
    const allCorrect = QUIZ_QUESTIONS.every((question, index) => {
      return quizAnswers[index] === question.correct;
    });
    if (allCorrect) {
      setQuizError('');
      setShowQuizModal(false);
      const quizTask = bountyTasks.find(t => t.id === 'secret_quiz');
      if (quizTask) handleClaimReward(quizTask);
    } else {
      setQuizError('Incorrect answers! Study the Cookieton docs and try again. 🍪');
      // Briefly set an error state to trigger CSS shake
      setTimeout(() => setQuizError(''), 2000); 
    }
  };

  // 11. Handle Meme submission
  const handleMemeSubmit = () => {
    if (!memeLink || !memeLink.startsWith('http')) {
      showNotification('Please enter a valid URL to your meme post.', 'error');
      return;
    }
    const memeTask = bountyTasks.find(t => t.id === 'meme_baker');
    if (memeTask) handleClaimReward(memeTask);
  };

  // 12. Daily Timer Logic
  useEffect(() => {
    const checkDaily = () => {
      const lastClaim = localStorage.getItem('cookieton_daily_last');
      if (!lastClaim) {
        setDailyAvailable(true);
        setDailyCooldown('');
        return;
      }
      const elapsed = Date.now() - parseInt(lastClaim, 10);
      const cooldownMs = 24 * 60 * 60 * 1000; // 24 hours
      if (elapsed >= cooldownMs) {
        setDailyAvailable(true);
        setDailyCooldown('');
      } else {
        setDailyAvailable(false);
        const remaining = cooldownMs - elapsed;
        const hours = Math.floor(remaining / (1000 * 60 * 60));
        const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((remaining % (1000 * 60)) / 1000);
        setDailyCooldown(`${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`);
      }
    };
    checkDaily();
    const interval = setInterval(checkDaily, 1000);
    return () => clearInterval(interval);
  }, []);

  // 7. Deploy Token from Dashboard (Fallback if they don't run script)
  const deployTokenFromDashboard = async () => {
    if (!payerWallet) return;
    setIsLoading(true);
    addLog('Starting browser token deployment wizard...', 'info');

    try {
      // Create Mint account
      const mintKeypair = Keypair.generate();
      addLog(`Generated mint address key: ${mintKeypair.publicKey.toBase58().substring(0, 8)}...`, 'info');

      const mintRent = await connection.getMinimumBalanceForRentExemption(82); // Mint account size is 82 bytes
      
      // We will perform SPL Token initialization manually using SystemProgram and Token instructions
      // to create a clean atomic transaction.
      // Wait, standard spl-token createMint does this:
      // 1. Create account with system program (rent exemption, space=82, programOwner=TokenProgram)
      // 2. Initialize mint instruction
      const { SystemProgram } = await import('@solana/web3.js');
      const { createInitializeMintInstruction } = await import('@solana/spl-token');

      const transaction = new Transaction().add(
        SystemProgram.createAccount({
          fromPubkey: payerWallet.publicKey,
          newAccountPubkey: mintKeypair.publicKey,
          space: 82,
          lamports: mintRent,
          programId: TOKEN_PROGRAM_ID,
        }),
        createInitializeMintInstruction(
          mintKeypair.publicKey,
          config.decimals,
          payerWallet.publicKey,
          payerWallet.publicKey // freeze authority
        )
      );

      // Create owner ATA
      const ownerAta = getAssociatedTokenAddressSync(mintKeypair.publicKey, payerWallet.publicKey);
      transaction.add(
        createAssociatedTokenAccountInstruction(
          payerWallet.publicKey,
          ownerAta,
          payerWallet.publicKey,
          mintKeypair.publicKey
        )
      );

      // Mint initial supply
      const rawAmount = BigInt(config.totalSupply) * BigInt(10 ** config.decimals);
      transaction.add(
        createMintToInstruction(
          mintKeypair.publicKey,
          ownerAta,
          payerWallet.publicKey,
          rawAmount
        )
      );

      // Revoke mint authority to make capped supply
      const { createSetAuthorityInstruction, AuthorityType } = await import('@solana/spl-token');
      transaction.add(
        createSetAuthorityInstruction(
          mintKeypair.publicKey,
          payerWallet.publicKey,
          AuthorityType.MintTokens,
          null
        )
      );

      transaction.feePayer = payerWallet.publicKey;
      const latestBlock = await connection.getLatestBlockhash();
      transaction.recentBlockhash = latestBlock.blockhash;

      transaction.sign(payerWallet, mintKeypair);
      
      addLog('Submitting creation transaction to network...', 'info');
      const txId = await connection.sendRawTransaction(transaction.serialize());
      addLog(`Creation Tx: ${txId.substring(0, 12)}... Confirming...`, 'info');

      await connection.confirmTransaction({
        blockhash: latestBlock.blockhash,
        lastValidBlockHeight: latestBlock.lastValidBlockHeight,
        signature: txId
      });

      const deployedState = {
        mintAddress: mintKeypair.publicKey.toBase58(),
        creatorAddress: payerWallet.publicKey.toBase58(),
        creatorTokenAccount: ownerAta.toBase58(),
        mintTxId: txId,
        totalSupply: config.totalSupply,
        decimals: config.decimals,
        network: config.network,
        createdAt: new Date().toISOString()
      };

      setTokenState(deployedState);
      localStorage.setItem('cookieton_state', JSON.stringify(deployedState));
      
      // Save token state to backend (Supabase) for persistence
      try {
        await fetch('http://localhost:3001/api/token-state', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(deployedState)
        });
        addLog('Token state saved to database for persistence!', 'success');
      } catch (dbErr) {
        addLog('Warning: Could not save to database. State saved locally only.', 'warning');
      }
      
      addLog(`Token cookieton successfully launched! Mint: ${deployedState.mintAddress}`, 'success');
      showNotification('cookieton is live on Devnet!', 'success');
    } catch (err) {
      console.error(err);
      addLog('Deployment failed: ' + err.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="dashboard-container">
      {/* Toast Notification */}
      {notification && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          zIndex: 1000,
        }} className={`alert ${notification.type === 'success' ? 'alert-success' : notification.type === 'error' ? 'alert-error' : 'alert-info'}`}>
          {notification.type === 'success' && <CheckCircle size={18} />}
          {notification.type === 'error' && <AlertCircle size={18} />}
          <span>{notification.message}</span>
        </div>
      )}

      {/* Mainnet Warning Banner */}
      {config.network === 'mainnet' && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.15)',
          border: '1px solid var(--error-color)',
          color: '#fff',
          padding: '12px 20px',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
          fontWeight: 'bold',
          letterSpacing: '1px'
        }}>
          <AlertCircle size={20} color="var(--error-color)" />
          CAUTION: YOU ARE ON MAINNET. ALL TRANSACTIONS COST REAL SOL.
        </div>
      )}

      {/* Header */}
      <header className="header glass-panel">
        <div className="header-title-container">
          <img src="/cookie_logo.png" alt="Cookieton Logo" className="logo-spinning" onerror="this.style.display='none'" />
          <div>
            <h1 className="glow-text-gold" style={{ fontSize: '2.2rem', lineHeight: '1.2' }}>cookieton</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Symbol: <strong>{config.symbol}</strong> | Freshly Baked DeFi</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <span className="badge badge-devnet">
            <Coins size={14} />
            {config.network}
          </span>
          {tokenState && (
            <span className="badge badge-revoked">
              <CheckCircle size={14} />
              Supply Capped
            </span>
          )}
          <button 
            className="btn btn-secondary" 
            style={{ padding: '8px 16px', fontSize: '0.9rem' }}
            onClick={fetchBalances}
            disabled={isLoading || !payerWallet}
          >
            <RefreshCw size={14} className={isLoading ? 'logo-spinning' : ''} />
            Refresh
          </button>
        </div>
      </header>

      {/* Main Grid */}
      <div className="grid-cols-2">
        {/* Left Side: Token Metrics & Creator Wallet */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Card 1: Token Mint Details */}
          <div className="glass-panel">
            <h2 style={{ marginBottom: '20px', borderBottom: '1px solid var(--panel-border)', paddingBottom: '10px' }}>
              Token Metrics
            </h2>
            {tokenState ? (
              <div>
                <div className="info-row">
                  <span className="info-label">Mint Address</span>
                  <span 
                    className="info-value copyable" 
                    onClick={() => copyToClipboard(tokenState.mintAddress, 'Mint Address')}
                  >
                    {tokenState.mintAddress}
                  </span>
                </div>
                <div className="info-row">
                  <span className="info-label">Total Supply</span>
                  <span className="info-value glow-text-gold">
                    {tokenState.totalSupply.toLocaleString()} {config.symbol}
                  </span>
                </div>
                <div className="info-row">
                  <span className="info-label">Decimals</span>
                  <span className="info-value">{tokenState.decimals}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Explorer</span>
                  <span className="info-value">
                    <a 
                      href={`https://explorer.solana.com/address/${tokenState.mintAddress}?cluster=${config.network}`} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="feed-link"
                    >
                      View on Solana Explorer <ExternalLink size={12} />
                    </a>
                  </span>
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <AlertCircle size={40} style={{ color: 'var(--accent-gold)', marginBottom: '12px' }} />
                <h3 style={{ marginBottom: '8px' }}>Token Not Yet Deployed</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '20px' }}>
                  Deploy the token using the terminal command or launch it instantly from the developer wallet panel.
                </p>
                {payerWallet && solBalance > 0.05 ? (
                  <button className="btn" onClick={deployTokenFromDashboard} disabled={isLoading}>
                    Launch Token Mint
                  </button>
                ) : (
                  <p style={{ color: 'var(--error-color)', fontSize: '0.85rem' }}>
                    *Requires developer wallet with at least 0.05 SOL to deploy.
                  </p>
                )}
              </div>
            )}
          </div>

        </div>

        {/* Right Side: Token Interaction Panel & Logs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Card 3: Actions (Transfer / Burn) */}
          <div className="glass-panel" style={{ flex: 1 }}>
            <div className="tab-headers">
              <button 
                className={`tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
                onClick={() => setActiveTab('dashboard')}
              >
                <Send size={16} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                Transfer
              </button>
              <button 
                className={`tab-btn ${activeTab === 'terminal' ? 'active' : ''}`}
                onClick={() => setActiveTab('terminal')}
              >
                <Flame size={16} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                Burn
              </button>
              <button 
                className={`tab-btn ${activeTab === 'earn' ? 'active' : ''}`}
                onClick={() => setActiveTab('earn')}
              >
                <Gift size={16} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                Earn
              </button>
            </div>

            <div style={{ marginTop: '24px' }}>
              {activeTab === 'dashboard' && (
                <form onSubmit={handleTransfer} className="actions-layout">
                  <div className="form-group">
                    <label className="form-label">Recipient Public Key</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      placeholder="e.g., GxH...9aB"
                      value={transferRecipient}
                      onChange={e => setTransferRecipient(e.target.value)}
                      required 
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Amount (COOKIE)</label>
                    <input 
                      type="number" 
                      step="any"
                      min="0.000000001"
                      className="form-input" 
                      placeholder="0.0"
                      value={transferAmount}
                      onChange={e => setTransferAmount(e.target.value)}
                      required 
                    />
                  </div>
                  <button 
                    type="submit" 
                    className="btn" 
                    disabled={isLoading || !tokenState || tokenBalance < Number(transferAmount) || Number(transferAmount) <= 0}
                  >
                    <Send size={16} /> Send COOKIE
                  </button>
                </form>
              )}

              {activeTab === 'terminal' && (
                <form onSubmit={handleBurn} className="actions-layout">
                  <div style={{ background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.15)', padding: '16px', borderRadius: '8px', marginBottom: '10px' }}>
                    <h4 style={{ color: 'var(--error-color)', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                      <AlertCircle size={16} /> Danger Zone
                    </h4>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                      Burning tokens will permanently destroy them from your wallet, reducing the circulating supply. This action is irreversible.
                    </p>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Amount to Burn</label>
                    <input 
                      type="number" 
                      step="any"
                      min="0.000000001"
                      className="form-input" 
                      placeholder="0.0"
                      value={burnAmount}
                      onChange={e => setBurnAmount(e.target.value)}
                      required 
                    />
                  </div>
                  <button 
                    type="submit" 
                    className="btn btn-danger" 
                    disabled={isLoading || !tokenState || tokenBalance < Number(burnAmount) || Number(burnAmount) <= 0}
                  >
                    <Flame size={16} /> Burn Tokens
                  </button>
                </form>
              )}

              {activeTab === 'earn' && (
                <div className="actions-layout">
                  <div style={{ background: 'rgba(56, 189, 248, 0.05)', border: '1px solid rgba(56, 189, 248, 0.15)', padding: '16px', borderRadius: '8px', marginBottom: '10px' }}>
                    <h4 style={{ color: 'var(--accent-gold)', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                      <Gift size={16} /> Earn Free COOKIE
                    </h4>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '12px' }}>
                      Complete the tasks below to earn free COOKIE directly to your wallet! Total per user: up to 46 COOKIE.
                    </p>
                    
                    {/* Progress Tracker */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px', fontSize: '0.85rem' }}>
                      <span style={{ color: 'var(--text-primary)', fontWeight: '600' }}><Target size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} /> Your Progress</span>
                      <span style={{ color: 'var(--accent-gold)' }}>{bountyTasks.filter(t => t.completed).length} / {bountyTasks.length} Completed</span>
                    </div>
                    <div style={{ width: '100%', height: '6px', background: 'rgba(0,0,0,0.4)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ 
                        width: `${(bountyTasks.filter(t => t.completed).length / bountyTasks.length) * 100}%`, 
                        height: '100%', 
                        background: 'linear-gradient(90deg, var(--accent-gold), #fcd34d)',
                        transition: 'width 0.5s ease-out'
                      }}></div>
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Your Wallet Address (to receive rewards)</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      placeholder="e.g., GxH...9aB"
                      value={earnRecipient}
                      onChange={e => setEarnRecipient(e.target.value)}
                      required 
                    />
                  </div>
                  
                  <div className="bounty-list">
                    {[...bountyTasks].sort((a, b) => (a.completed === b.completed ? 0 : a.completed ? 1 : -1)).map(task => (
                      <div key={task.id} className={`bounty-item ${task.completed ? 'completed' : ''}`}>
                        <div className="bounty-info">
                          <div className="bounty-icon">
                            {task.icon === 'clock' && <Clock size={20} />}
                            {task.icon === 'discord' && <MessageCircle size={20} />}
                            {task.icon === 'twitter' && <Twitter size={20} />}
                            {task.icon === 'quiz' && <HelpCircle size={20} />}
                            {task.icon === 'meme' && <Image size={20} />}
                          </div>
                          <div>
                            <h4>{task.title}</h4>
                            <p className="bounty-desc">{task.description}</p>
                            <span className="bounty-reward">+{task.reward} COOKIE 🍪</span>
                          </div>
                        </div>

                        {/* Meme: show input field */}
                        {task.type === 'meme' && !task.completed && (
                          <div className="bounty-meme-input">
                            <input 
                              type="text" 
                              className="form-input" 
                              placeholder="https://x.com/your_meme_post"
                              value={memeLink}
                              onChange={e => setMemeLink(e.target.value)}
                              style={{ fontSize: '0.8rem', padding: '8px 12px' }}
                            />
                          </div>
                        )}

                        {/* Daily: show countdown timer */}
                        {task.type === 'daily' && !dailyAvailable && !task.completed && dailyCooldown && (
                          <div className="bounty-cooldown">
                            <Clock size={14} />
                            <span>Next claim in <strong>{dailyCooldown}</strong></span>
                          </div>
                        )}

                        <button 
                          className={`btn bounty-btn ${task.type === 'daily' && dailyAvailable && !task.completed ? 'btn-pulse' : ''}`}
                          onClick={() => {
                            if (task.type === 'link') handleLinkTask(task);
                            else if (task.type === 'quiz') setShowQuizModal(true);
                            else if (task.type === 'meme') handleMemeSubmit();
                            else handleClaimReward(task);
                          }}
                          disabled={
                            task.completed || 
                            task.verifying || 
                            !earnRecipient ||
                            (task.type === 'daily' && !dailyAvailable)
                          }
                          style={task.completed ? { background: 'var(--success-color)', borderColor: 'var(--success-color)', color: '#000' } : {}}
                        >
                          {task.verifying ? (
                            <RefreshCw size={16} className="logo-spinning" />
                          ) : task.completed ? (
                            <><Check size={16} style={{ marginRight: '4px', verticalAlign: 'middle' }} /> Claimed</>
                          ) : (
                            task.actionLabel
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Quiz Modal */}
              {showQuizModal && (
                <div className="modal-overlay" onClick={() => setShowQuizModal(false)}>
                  <div className={`modal-content glass-panel ${quizError ? 'shake' : ''}`} onClick={e => e.stopPropagation()}>
                    <div className="modal-header">
                      <h3><HelpCircle size={20} style={{ verticalAlign: 'middle', marginRight: '8px' }} />The Secret Recipe Quiz</h3>
                      <button className="modal-close" onClick={() => setShowQuizModal(false)}><X size={20} /></button>
                    </div>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '20px' }}>
                      Answer all 3 questions correctly to earn <strong style={{ color: 'var(--accent-gold)' }}>15 COOKIE 🍪</strong>
                    </p>
                    {QUIZ_QUESTIONS.map((question, qIndex) => (
                      <div key={qIndex} className="quiz-question">
                        <h4 className="quiz-q-title">Q{qIndex + 1}. {question.q}</h4>
                        <div className="quiz-options">
                          {question.options.map((option, oIndex) => (
                            <label 
                              key={oIndex} 
                              className={`quiz-option ${quizAnswers[qIndex] === oIndex ? 'selected' : ''}`}
                            >
                              <input 
                                type="radio" 
                                name={`quiz-${qIndex}`} 
                                checked={quizAnswers[qIndex] === oIndex}
                                onChange={() => setQuizAnswers(prev => ({ ...prev, [qIndex]: oIndex }))}
                              />
                              <span>{option}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                    {quizError && (
                      <div className="alert alert-error" style={{ marginTop: '12px' }}>
                        <AlertCircle size={16} /> {quizError}
                      </div>
                    )}
                    <button 
                      className="btn" 
                      onClick={handleQuizSubmit}
                      disabled={Object.keys(quizAnswers).length < 3}
                      style={{ width: '100%', marginTop: '16px' }}
                    >
                      Submit Answers
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Card 4: Terminal Logs */}
          <div className="glass-panel" style={{ height: '300px', display: 'flex', flexDirection: 'column' }}>
            <h2 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Terminal size={18} style={{ color: 'var(--accent-gold)' }} />
              Console Logs
            </h2>
            <div className="feed-list" style={{ flex: 1, border: '1px solid var(--panel-border)', borderRadius: '8px', padding: '12px', background: 'rgba(0,0,0,0.4)', fontFamily: 'monospace' }}>
              {logs.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', textAlign: 'center', marginTop: '20px' }}>
                  No logs recorded. Initialize or refresh to start.
                </div>
              ) : (
                logs.map(log => (
                  <div 
                    key={log.id} 
                    style={{ 
                      fontSize: '0.85rem', 
                      lineHeight: '1.4', 
                      marginBottom: '8px',
                      color: log.type === 'success' ? 'var(--success-color)' : log.type === 'error' ? 'var(--error-color)' : log.type === 'warning' ? 'var(--accent-gold)' : 'var(--text-primary)'
                    }}
                  >
                    <span style={{ color: 'var(--text-muted)' }}>[{log.time}]</span> {log.message}
                  </div>
                ))
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
