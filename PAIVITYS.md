# Salkku Tracker — Reaaliaikaiset hinnat (päivitysohje)

Tämä päivitys lisää reaaliaikaiset osakehinnat Yahoo Financesta.

---

## Mitä uutta?

- **Reaaliaikainen hinta** jokaiselle positiolle
- **Tuotto euroissa ja prosenteissa** per positio ja koko salkku
- **Päivän muutos** per osake
- **Automaattinen päivitys** 2 min välein + manuaalinen ↻ nappi
- **Tuki kaikille pörsseille** (US, Helsinki, Toronto, Tukholma jne.)

---

## Asennusohjeet

### 1. Kopioi uudet tiedostot projektiin

Kopioi nämä tiedostot `salkku-tracker`-kansioosi:

| Tiedosto         | Minne                     |
|------------------|---------------------------|
| `api/prices.js`  | `api/prices.js` (uusi kansio!) |
| `App.jsx`        | `src/App.jsx` (korvaa vanha) |
| `vercel.json`    | `vercel.json` (projektin juureen) |

### 2. Muokkaa ticker-karttaa (tarvittaessa)

Avaa `src/App.jsx` ja etsi `TICKER_MAP`:

```js
const TICKER_MAP = {
  "SOSI1": "SOSI1.HE",   // Helsinki
  "LGO": "LGO.TO",        // Toronto
  // Lisää tähän:
  // "NOKIA": "NOKIA.HE",
  // "SAMPO": "SAMPO.HE",
};
```

Lisää sinne osakkeet jotka eivät ole US-pörssissä.
Yahoo Finance -symbolit per pörssi:

| Pörssi       | Pääte  | Esimerkki     |
|--------------|--------|---------------|
| Helsinki     | `.HE`  | `NOKIA.HE`   |
| Toronto      | `.TO`  | `LGO.TO`     |
| Tukholma     | `.ST`  | `VOLV-B.ST`  |
| Frankfurt    | `.F`   | `BMW.F`      |
| Lontoo       | `.L`   | `HSBA.L`     |
| US (NYSE/NASDAQ) | ei päätettä | `IREN` |

### 3. Pushaa GitHubiin

```bash
git add .
git commit -m "Add live prices"
git push
```

Vercel deployttaa automaattisesti. Valmis!

---

## Vianetsintä

**Hinnat eivät lataudu:**
- Tarkista selain-konsoli (F12) virheilmoitukset
- Varmista että `api/prices.js` on projektin juuressa (ei src-kansiossa)
- Varmista että `vercel.json` on projektin juuressa

**Ticker ei löydy:**
- Tarkista Yahoo Financesta oikea symboli: https://finance.yahoo.com
- Lisää TICKER_MAP:iin jos ei US-osake

