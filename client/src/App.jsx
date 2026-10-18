import { Suspense, lazy } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { GuestProvider, useGuest } from './guest.jsx';
import { ToastProvider } from './components/Toasts.jsx';
import { DiceProvider } from './components/DiceTray.jsx';
import GameIcon from './components/GameIcon.jsx';
import Nav from './components/Nav.jsx';
import Tavern from './pages/Tavern.jsx';
import Heroes from './pages/Heroes.jsx';
import CharacterSheet from './pages/CharacterSheet.jsx';
import Bestiary from './pages/Bestiary.jsx';
import MonsterSheet from './pages/MonsterSheet.jsx';
import Table from './pages/table/Table.jsx';

// three.js is heavy; only the forge needs it.
const DiceForge = lazy(() => import('./pages/DiceForge.jsx'));
const Sanctum = lazy(() => import('./pages/dm/Sanctum.jsx'));
const Campaign = lazy(() => import('./pages/dm/Campaign.jsx'));
const Dungeon = lazy(() => import('./pages/dm/Dungeon.jsx'));
const loading = <div className="page"><div className="is-loading" /></div>;

function Shell() {
  const { guest, error, retry } = useGuest();
  const { pathname } = useLocation();
  if (!guest) {
    return (
      <div className="splash">
        <GameIcon name="dice-twenty-faces-twenty" size={72} className={error ? '' : 'splash__spin'} />
        <h1>Dicebound</h1>
        {error ? (
          <>
            <p>{error}</p>
            <button className="btn btn--gold" onClick={retry}>Try again</button>
          </>
        ) : <p>Lighting the hearth…</p>}
      </div>
    );
  }
  const inTable = pathname.startsWith('/table/') || pathname.startsWith('/dm/dungeons/');
  return (
    <div className={`app ${inTable ? 'app--table' : ''}`}>
      <Nav />
      <main className="app__main">
        <Routes>
          <Route path="/" element={<Tavern />} />
          <Route path="/heroes" element={<Heroes />} />
          <Route path="/heroes/:id" element={<CharacterSheet />} />
          <Route path="/bestiary" element={<Bestiary />} />
          <Route path="/bestiary/:id" element={<MonsterSheet />} />
          <Route path="/dice" element={<Suspense fallback={loading}><DiceForge /></Suspense>} />
          <Route path="/dm" element={<Suspense fallback={loading}><Sanctum /></Suspense>} />
          <Route path="/dm/campaigns/:id" element={<Suspense fallback={loading}><Campaign /></Suspense>} />
          <Route path="/dm/dungeons/:id" element={<Suspense fallback={loading}><Dungeon /></Suspense>} />
          <Route path="/table/:code" element={<Table />} />
          <Route path="*" element={<div className="page"><h1 className="page__title">Lost in the dungeon</h1><p className="muted">That path leads nowhere.</p></div>} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <GuestProvider>
        <DiceProvider>
          <Shell />
        </DiceProvider>
      </GuestProvider>
    </ToastProvider>
  );
}
