import { Connection, clusterApiUrl } from '@solana/web3.js';

async function testConnection() {
  console.log('Connecting to Solana Devnet...');
  const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');
  
  try {
    const version = await connection.getVersion();
    console.log('Connected to Solana Devnet!');
    console.log('Solana Node Version:', version['solana-core']);
    
    const epochInfo = await connection.getEpochInfo();
    console.log('Current Epoch:', epochInfo.epoch);
    console.log('Current Slot:', epochInfo.slot);
    
    console.log('Connection test successful!');
  } catch (error) {
    console.error('Failed to connect to Solana Devnet:', error);
  }
}

testConnection();
