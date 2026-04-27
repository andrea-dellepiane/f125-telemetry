// LeaderboardService: mantiene top N per sessione, può essere adattato per backend real-time.

type LapResult = {
	driverId?: string;
	lapId: string;
	duration: number; // ms
	timestamp: number;
};

export class LeaderboardService {
	private results: LapResult[] = [];
	private subscribers: ((board: LapResult[]) => void)[] = [];
	private maxEntries = 20;

	addLapResult(r: LapResult) {
		this.results.push(r);
		this.results.sort((a,b) => a.duration - b.duration);
		if (this.results.length > this.maxEntries) this.results.length = this.maxEntries;
		this.emit();
	}

	getBoard() {
		return this.results.slice();
	}

	subscribe(cb: (board: LapResult[]) => void) {
		this.subscribers.push(cb);
		cb(this.getBoard()); // immediate snapshot
		return () => {
			this.subscribers = this.subscribers.filter(s => s !== cb);
		};
	}

	private emit() {
		const snapshot = this.getBoard();
		this.subscribers.forEach(s => s(snapshot));
	}
}
