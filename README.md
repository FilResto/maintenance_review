🎯 Riepilogo Finale\
1️⃣ Avvia la blockchain locale (npx hardhat node) ➡ lascia aperto il terminale.\
2️⃣ Deploya lo smart contract (npx hardhat run scripts/deploy.js --network localhost) e copia l’indirizzo.\
3️⃣ Aggiorna server.py con l’indirizzo del contratto e l’ABI.\
4️⃣ Avvia il backend (python -m uvicorn server:app --reload).\
5️⃣ Avvia il frontend (npm start).\
6️⃣ Apri il browser su http://localhost:3000\

ora per deployare lo smart contract su sepolia npx hardhat run scripts/deploy.js --network sepolia