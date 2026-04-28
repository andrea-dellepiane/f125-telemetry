import React, { useEffect, useState } from 'react';
import { LeaderboardService } from '../services/LeaderboardService';

const leaderboard = new LeaderboardService(); // in app reale, usare singleton/DI

export const LiveLeaderboard: React.FC = () => {
	const [board, setBoard] = useState(leaderboard.getBoard());

	useEffect(() => {
		const unsub = leaderboard.subscribe(setBoard);
		return () => unsub();
	}, []);

	return (
		<div className="live-leaderboard">
			<h3>Live Leaderboard</h3>
			<ol>
				{board.map((r, idx) => (
					<li key={r.lapId}>
						<span>{r.driverId ?? 'Driver'}</span>
						<span style={{ marginLeft: 8 }}>{(r.duration/1000).toFixed(3)}s</span>
					</li>
				))}
			</ol>
		</div>
	);
};
