# Salkku Tracker — Asennusohjeet

Tämä ohje vie sinut nollasta toimivaan sivuun. Kesto: ~20 min.

---

## 1. Luo GitHub-tili ja repo

1. Mene https://github.com ja luo tili (jos ei jo ole)
2. Klikkaa **"New repository"** (vihreä nappi)
3. Nimi: `salkku-tracker`
4. Valitse **Public**
5. **ÄLÄ** ruksaa "Add a README file"
6. Klikkaa **Create repository**

### Lataa koodi GitHubiin

Asenna Git koneellesi (https://git-scm.com) jos ei ole jo.

Avaa terminaali/komentokehote tässä kansiossa ja aja:

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/SINUN-KÄYTTÄJÄ/salkku-tracker.git
git push -u origin main
```

Korvaa `SINUN-KÄYTTÄJÄ` omalla GitHub-käyttäjänimellä.

---

## 2. Luo Firebase-projekti (ilmainen)

1. Mene https://console.firebase.google.com
2. Klikkaa **"Create a project"**
3. Projektin nimi: `salkku-tracker` (tai mikä tahansa)
4. Google Analytics: voit laittaa pois päältä (ei tarvita)
5. Klikkaa **Create project**

### Luo Realtime Database

1. Vasemmasta valikosta: **Build → Realtime Database**
2. Klikkaa **Create Database**
3. Valitse sijainti: **europe-west1 (Belgium)**
4. Valitse **Start in test mode** (muutetaan myöhemmin)
5. Klikkaa **Enable**

### Hae Firebase-asetukset

1. Projektin etusivulla klikkaa **⚙️ (ratas)** → **Project settings**
2. Scrollaa alas kohtaan **"Your apps"**
3. Klikkaa **Web-nappi** `</>`
4. Anna nimi: `salkku` ja klikkaa **Register app**
5. Kopioi `firebaseConfig`-objekti:

```js
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "salkku-tracker-xxxxx.firebaseapp.com",
  databaseURL: "https://salkku-tracker-xxxxx-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "salkku-tracker-xxxxx",
  storageBucket: "salkku-tracker-xxxxx.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};
```

6. Avaa tiedosto `src/firebase.js` ja korvaa `KORVAA_TÄMÄ`-arvot omillasi

### Päivitä tietokannan säännöt

Firebase-konsolissa → Realtime Database → **Rules**-välilehti.

Korvaa säännöt näillä:

```json
{
  "rules": {
    "trades": {
      "$userId": {
        ".read": true,
        ".write": true
      }
    }
  }
}
```

Klikkaa **Publish**.

> Huom: Nämä säännöt sallivat kaikki luku/kirjoitusoperaatiot.
> PIN-suojaus on vain käyttöliittymätasolla.
> Tämä riittää hyvin kahdelle käyttäjälle, mutta jos haluat tiukemman suojauksen,
> voit lisätä Firebase Authenticationin myöhemmin.

---

## 3. Testaa paikallisesti

```bash
npm install
npm run dev
```

Avaa http://localhost:5173 selaimessa. Jos näet kirjautumisruudun, kaikki toimii!

---

## 4. Julkaise Verceliin (ilmainen)

1. Mene https://vercel.com ja luo tili **GitHub-tilillä**
2. Klikkaa **"Add New..." → "Project"**
3. Valitse `salkku-tracker` repo listalta
4. Framework: **Vite** (tunnistaa automaattisesti)
5. Klikkaa **Deploy**
6. Odota ~1 min → sivusi on osoitteessa `salkku-tracker.vercel.app`!

Joka kerta kun pushaat GitHubiin uuden commitin, Vercel päivittää sivun automaattisesti.

---

## 5. Käyttö

- Avaa sivu selaimessa (sinä ja veli)
- Kirjaudu PIN-koodilla
  - Simo: `1111`
  - Veli: `2222`
- Syötä kauppoja, ne näkyvät molemmille reaaliajassa!
- Vaihda PIN-koodit tiedostosta `src/App.jsx` → `USERS`-taulukko

---

## Muokkaus

| Mitä               | Missä                        |
|---------------------|------------------------------|
| Käyttäjänimet & PIN | `src/App.jsx` → `USERS`     |
| Firebase-asetukset  | `src/firebase.js`            |
| Ulkoasu & värit     | `src/App.jsx` → `S`-objekti |
| CSS & fontit        | `src/index.css`              |

---

## Vianetsintä

**"Permission denied" Firebase-virhe:**
→ Tarkista Realtime Database → Rules (kohta 2)

**Tyhjä sivu:**
→ Tarkista selaimen konsoli (F12) virheistä
→ Varmista että firebase.js config on oikein

**Vercel build fail:**
→ Tarkista että `npm run build` toimii lokaalisti ensin

---

## Valinnainen: Oma domain

Jos haluat osoitteen tyyliin `salkku.fi`:

1. Osta domain (esim. Namecheap ~10€/v)
2. Vercel → Project → Settings → Domains
3. Lisää domain ja seuraa DNS-ohjeita

