# Istruzioni di integrazione - Lap Recording & Live Leaderboard

1) Rimuovere "Lap Distance" dall'interfaccia:
   - Individua il componente/elemento UI che mostra "Lap Distance" (file UI del progetto).
   - Rimuovi o commenta il markup relativo e aggiorna eventuali riferimenti state/props che lo popolano.

2) Integrare LapRecorder:
   - Importa e istanzia LapRecorder nel punto d'ingresso della sessione telemetrica.
   - Chiama startLap() all'inizio di un giro e endLap() alla fine; usa recordPoint(...) per la telemetria continua.

3) Invia risultati a LeaderboardService:
   - Quando endLap() ritorna un lap con duration, chiama leaderboard.addLapResult({ driverId, lapId, duration, timestamp }).

4) Aggiungere il componente LiveLeaderboard nella UI:
   - Importa LiveLeaderboard e piazzalo dove vuoi mostrare la classifica live.

5) Futuro: AI di analisi giri
   - Usare src/ai/analyzer.ts come stub per integrazione rapida.
   - Sostituire analyzeLap con chiamate ad un servizio ML o modello on-device per suggerimenti dettagliati.

Note:
- I file aggiunti sono moduli indipendenti; adatta pattern di istanziazione (singleton/DI) al tuo architecture.
- Se vuoi, posso generare patch che toccano file UI esistenti: per farlo aggiungi i file da modificare al working set o usa `#codebase` nella richiesta.
