// ═══════════════════════════════════════════════════
// FIREBASE ASETUKSET — Korvaa nämä omilla arvoillasi!
// Katso OHJEET.md kohta 2.
// ═══════════════════════════════════════════════════

import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, onValue, remove } from "firebase/database";

const firebaseConfig = {
  apiKey: "KORVAA_TÄMÄ",
  authDomain: "KORVAA_TÄMÄ.firebaseapp.com",
  databaseURL: "https://KORVAA_TÄMÄ-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "KORVAA_TÄMÄ",
  storageBucket: "KORVAA_TÄMÄ.appspot.com",
  messagingSenderId: "KORVAA_TÄMÄ",
  appId: "KORVAA_TÄMÄ",
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
