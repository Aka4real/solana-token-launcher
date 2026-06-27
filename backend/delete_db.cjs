require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function clearDatabase() {
  console.log("Clearing Devnet data from Supabase...");

  // 1. Delete token state
  const { error: err1 } = await supabase
    .from('token_state')
    .delete()
    .eq('id', 'cookieton');

  if (err1) {
    console.error("Error deleting token_state:", err1);
  } else {
    console.log("✅ Successfully deleted 'cookieton' from token_state.");
  }

  // 2. Delete all claims
  const { error: err2 } = await supabase
    .from('claims')
    .delete()
    .neq('wallet_address', 'dummy_value_to_delete_all'); // using neq to delete all rows

  if (err2) {
    console.error("Error deleting claims:", err2);
  } else {
    console.log("✅ Successfully cleared all previous devnet claims.");
  }
}

clearDatabase();
