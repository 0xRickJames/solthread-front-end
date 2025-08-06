import { NextRequest, NextResponse } from "next/server";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { MongoClient } from "mongodb";
import { Connection, PublicKey } from "@solana/web3.js";
import axios from "axios";

const client = new MongoClient(process.env.MONGODB_URI as string);
const db = client.db("solanaVerify");
const verifications = db.collection("verifications");

const SOLANA_RPC = process.env.SOLANA_RPC!;
const TOKEN_MINT = new PublicKey(process.env.TOKEN_MINT!);
const WEBHOOK_URL = process.env.BOT_WEBHOOK_URL!;

// Role IDs
const ROLE_ANY = process.env.ROLE_ANY!;
const ROLE_1K = process.env.ROLE_1K!;
const ROLE_10K = process.env.ROLE_10K!;
const ROLE_100K = process.env.ROLE_100K!;

async function getTokenBalance(wallet: string) {
  const conn = new Connection(SOLANA_RPC, "confirmed");
  const tokenAccounts = await conn.getParsedTokenAccountsByOwner(
    new PublicKey(wallet),
    { mint: TOKEN_MINT }
  );

  if (tokenAccounts.value.length === 0) return 0;

  return tokenAccounts.value.reduce((sum, acc) => {
    const uiAmount = acc.account.data.parsed.info.tokenAmount.uiAmount || 0;
    return sum + uiAmount;
  }, 0);
}

export async function POST(req: NextRequest) {
  const { discordId, wallet, nonce, signature } = await req.json();
  console.log(`Verification attempt for Discord ID ${discordId}`);

  if (!discordId || !wallet || !signature || !nonce) {
    return NextResponse.json(
      { success: false, message: "Missing fields" },
      { status: 400 }
    );
  }

  // Verify signature
  const sigBytes = bs58.decode(signature);
  const msgBytes = new TextEncoder().encode(nonce);

  const isValid = nacl.sign.detached.verify(
    msgBytes,
    sigBytes,
    new PublicKey(wallet).toBytes()
  );

  if (!isValid)
    return NextResponse.json(
      { success: false, message: "Invalid signature" },
      { status: 400 }
    );

  // Find existing verification
  const existing = await verifications.findOne({ discordId });

  // Initialize wallet array
  let wallets: string[] = existing?.wallets || [];

  // Add new wallet if not already stored
  if (!wallets.includes(wallet)) {
    wallets.push(wallet);
  }

  // Fetch total OMFG across all wallets
  let totalBalance = 0;
  for (const w of wallets) {
    totalBalance += await getTokenBalance(w);
  }

  console.log(
    `User ${discordId} total balance: ${totalBalance} OMFG across ${wallets.length} wallet(s)`
  );

  if (totalBalance <= 0) {
    return NextResponse.json({
      success: false,
      message: "No tokens detected in any wallet",
    });
  }

  // Determine roles (cumulative)
  const roles: string[] = [ROLE_ANY];
  if (totalBalance >= 1_000) roles.push(ROLE_1K);
  if (totalBalance >= 10_000) roles.push(ROLE_10K);
  if (totalBalance >= 100_000) roles.push(ROLE_100K);

  // Update DB
  await verifications.updateOne(
    { discordId },
    {
      $set: {
        discordId,
        wallets,
        totalBalance,
        roles,
        verifiedAt: new Date(),
      },
    },
    { upsert: true }
  );

  // Notify bot webhook
  try {
    console.log("Posting to bot webhook:", WEBHOOK_URL, roles);
    await axios.post(WEBHOOK_URL, {
      type: "assignRoles",
      discordId,
      roles,
    });
  } catch (err: any) {
    console.error("Failed to post to webhook:", err?.message || err);
  }

  return NextResponse.json({
    success: true,
    message: `Verified! Total: ${totalBalance} OMFG. Roles assigned: ${roles.join(
      ", "
    )}.`,
  });
}
