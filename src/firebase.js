// ═══════════════════════════════════════════════════
// FIREBASE ASETUKSET — Korvaa nämä omilla arvoillasi!
// Katso OHJEET.md kohta 2.
// ═══════════════════════════════════════════════════

import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, onValue, remove } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyDHU9uMdrPazcOpqudvEAOCaTVxSmgOuMQ",
  authDomain: "salkku-tracker.firebaseapp.com",
  databaseURL: "https://salkku-tracker-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "salkku-tracker",
  storageBucket: "salkku-tracker.firebasestorage.app",
  messagingSenderId: "918484652812",
  appId: "1:918484652812:web:5eca5154b72e6ed710af29",
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// ── API ──

export function writeTrade(userId, trade) {
  return set(ref(db, `trades/${userId}/${trade.id}`), trade);
}

export function deleteTrade(userId, tradeId) {
  return remove(ref(db, `trades/${userId}/${tradeId}`));
}

export function subscribeTrades(callback) {
  const tradesRef = ref(db, "trades");
  return onValue(tradesRef, (snapshot) => {
    const data = snapshot.val();
    const allTrades = [];
    if (data) {
      Object.entries(data).forEach(([userId, userTrades]) => {
        if (userTrades) {
          Object.values(userTrades).forEach((trade) => {
            allTrades.push({ ...trade, userId });
          });
        }
      });
    }
    callback(allTrades);
  });
}
