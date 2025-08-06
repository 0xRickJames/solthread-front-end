"use client";

import { useState, useEffect } from "react";
import bs58 from "bs58";
import axios from "axios";
import { PublicKey } from "@solana/web3.js";

type WalletProvider = "phantom" | "solflare" | "backpack";

interface ProviderState {
  type: WalletProvider;
  adapter: any;
}

export default function VerifyPage() {
  const [wallet, setWallet] = useState<string | null>(null);
  const [provider, setProvider] = useState<ProviderState | null>(null);
  const [nonce, setNonce] = useState("");
  const [discordId, setDiscordId] = useState("");

  const [toasts, setToasts] = useState<
    { id: number; message: string; type: "success" | "error" | "info" }[]
  >([]);
  const [modal, setModal] = useState<{
    show: boolean;
    message: string;
    type: "success" | "error";
  }>({
    show: false,
    message: "",
    type: "success",
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setDiscordId(params.get("discordId") || "");
    setNonce(Math.random().toString(36).substring(2));
  }, []);

  function showToast(message: string, type: "success" | "error" | "info") {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }

  function showModal(message: string, type: "success" | "error") {
    setModal({ show: true, message, type });
  }

  function selectProvider(type: WalletProvider) {
    const w = window as any;

    if (type === "phantom" && w.phantom?.solana?.isPhantom) {
      setProvider({ type, adapter: w.phantom.solana });
      showToast("Phantom wallet selected.", "info");
    } else if (type === "solflare" && w.solflare?.isSolflare) {
      setProvider({ type, adapter: w.solflare });
      showToast("Solflare wallet selected.", "info");
    } else if (type === "backpack" && w.backpack?.solana?.isBackpack) {
      setProvider({ type, adapter: w.backpack.solana });
      showToast("Backpack wallet selected.", "info");
    } else {
      showToast(`${type} wallet not found!`, "error");
    }
  }

  async function connectWallet() {
    if (!provider) return;

    try {
      let publicKey: string | null = null;

      if (provider.type === "phantom") {
        const resp = await provider.adapter.connect();
        publicKey = resp.publicKey.toBase58();
      } else if (provider.type === "solflare") {
        await provider.adapter.connect();
        publicKey = provider.adapter.publicKey.toBase58();
      } else if (provider.type === "backpack") {
        const resp = await provider.adapter.connect();
        // Backpack returns Uint8Array
        publicKey = new PublicKey(resp.publicKey).toBase58();
      }

      if (!publicKey) throw new Error("No public key found");

      setWallet(publicKey);
      showToast(`Wallet connected: ${publicKey.slice(0, 6)}...`, "success");
    } catch (err) {
      console.error(err);
      showToast("Failed to connect wallet.", "error");
    }
  }

  async function verifyWallet() {
    if (!wallet || !provider) return;
    showToast("Signing message and verifying...", "info");

    try {
      const message = new TextEncoder().encode(nonce);

      const rawSig = await provider.adapter.signMessage(
        provider.type === "backpack" ? message : message,
        provider.type === "backpack" ? undefined : "utf8"
      );

      // Normalize signature to Uint8Array
      const signatureBytes =
        rawSig instanceof Uint8Array
          ? rawSig
          : rawSig.signature instanceof Uint8Array
          ? rawSig.signature
          : (() => {
              throw new Error("Unknown signature format from wallet");
            })();

      const res = await axios.post("/api/verify", {
        discordId,
        wallet,
        nonce,
        signature: bs58.encode(signatureBytes),
      });

      console.log("Verify API Response:", res.data);

      if (res.data.success) {
        showModal(
          res.data.message || "✅ Verification successful! Roles assigned.",
          "success"
        );
      } else {
        showModal(
          res.data.message || "❌ Verification failed. No roles assigned.",
          "error"
        );
      }
    } catch (err) {
      console.error(err);
      showModal("Verification failed. Check console.", "error");
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-6">
      <h1 className="text-3xl font-bold mb-2">Verify Your Wallet</h1>
      <h1 className="text-3xl font-bold mb-2">For OmniPair Discord</h1>
      <p className="mb-6 text-gray-400">
        Discord ID: {discordId || "Not provided"}
      </p>

      {!provider && (
        <div className="flex flex-wrap gap-4 justify-center">
          <button
            onClick={() => selectProvider("phantom")}
            className="px-6 py-3 bg-purple-600 rounded-xl font-semibold hover:scale-105 hover:bg-purple-500 transition-transform"
          >
            Connect Phantom
          </button>
          <button
            onClick={() => selectProvider("solflare")}
            className="px-6 py-3 bg-orange-500 rounded-xl font-semibold hover:scale-105 hover:bg-orange-400 transition-transform"
          >
            Connect Solflare
          </button>
          <button
            onClick={() => selectProvider("backpack")}
            className="px-6 py-3 bg-yellow-500 rounded-xl font-semibold hover:scale-105 hover:bg-yellow-400 transition-transform"
          >
            Connect Backpack
          </button>
        </div>
      )}

      {provider && !wallet && (
        <button
          onClick={connectWallet}
          className="mt-6 px-8 py-3 bg-blue-600 rounded-xl font-semibold hover:scale-105 hover:bg-blue-500 transition-transform"
        >
          Connect Wallet
        </button>
      )}

      {wallet && (
        <button
          onClick={verifyWallet}
          className="mt-6 px-8 py-3 bg-green-600 rounded-xl font-semibold hover:scale-105 hover:bg-green-500 transition-transform"
        >
          Verify Wallet
        </button>
      )}

      {/* Toasts */}
      <div className="fixed bottom-5 right-5 space-y-2 z-50">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`px-4 py-2 rounded-lg shadow-md text-white animate-slide-in
            ${
              toast.type === "success"
                ? "bg-green-600"
                : toast.type === "error"
                ? "bg-red-600"
                : "bg-blue-600"
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>

      {/* Modal */}
      {modal.show && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
          <div
            className={`p-8 rounded-xl shadow-lg max-w-md text-center transition-transform scale-100
            ${modal.type === "success" ? "bg-green-700" : "bg-red-700"}`}
          >
            <h2 className="text-xl font-bold mb-4">
              {modal.type === "success" ? "Success!" : "Error!"}
            </h2>
            <p className="mb-6">{modal.message}</p>
            <button
              onClick={() => setModal({ ...modal, show: false })}
              className="px-6 py-2 bg-gray-900 rounded-md font-semibold hover:scale-105 transition-transform"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
