import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { mockIPC } from '../../app/node_modules/@tauri-apps/api/mocks.js';
import BotLikenessPanel from '../../app/src/components/BotLikenessPanel';
import { ShotXgPanel } from '../../app/src/components/XgPanels';
import type { ReplayAnalysis } from '../../app/src/types';

declare global { interface Window { modelCalls: { command: string; id: unknown }[] } }
window.modelCalls = [];
mockIPC((command, args) => {
  const id = (args as { replayId?: string } | undefined)?.replayId;
  window.modelCalls.push({ command, id });
  if (command === 'xg_replay_shots') return { status: 'available', shots: [{ time: 12, player_id: id === 'A' ? 'old' : 'new', xg: id === 'A' ? 0.73 : 0.12, goal: false }] };
  if (command === 'bot_likeness') return { detector_version: 'botlike-1', calibrated: false, players: [{ player_id: id === 'A' ? 'old' : 'new', name: id === 'A' ? 'Player from A' : 'Player from B', status: 'ok', index: id === 'A' ? 91 : 12, sample_count: 1200, signals: [], confounders: [], builtin_bot_flag: false }] };
  if (command === 'bot_labels') return { labels: [] };
  throw Error(`Unexpected local mock command ${command}`);
});
function Harness() {
  const [id, setId] = useState('A');
  const replay = { summary: { id, mode: '2v2' }, players: [{ id: id === 'A' ? 'old' : 'new', name: `Player from ${id}` }] } as unknown as ReplayAnalysis;
  return <><h1>Replay {id}</h1><button onClick={() => setId('B')}>Switch replay prop to B</button><BotLikenessPanel replay={replay} /><ShotXgPanel replay={replay} /></>;
}
createRoot(document.getElementById('root')!).render(<Harness />);
