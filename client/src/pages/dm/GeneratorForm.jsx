import { useState } from 'react';
import { Dices, Wand2 } from 'lucide-react';
import { SIZES, THEMES, generateDungeon, randomSeedWord } from '@shared/dungeon.js';
import { useBestiary } from '../../useBestiary.js';

const THEME_ART = {
  crypt: '/img/monsters/mummy-lord.webp', cavern: '/img/monsters/purple-worm.webp', stronghold: '/img/monsters/bandit-captain.webp',
  sewer: '/img/monsters/otyugh.webp', temple: '/img/monsters/cult-fanatic.webp', lair: '/img/monsters/young-red-dragon.webp', fey: '/img/monsters/dryad.webp',
};

/** Theme, size, party and seed in; a freshly generated dungeon out via `onGenerate`. */
export default function GeneratorForm({ initial = {}, onGenerate, busy, submitLabel = 'Forge the dungeon' }) {
  const monsters = useBestiary();
  const [theme, setTheme] = useState(initial.theme ?? 'crypt');
  const [size, setSize] = useState(initial.size ?? 'medium');
  const [level, setLevel] = useState(initial.level ?? 3);
  const [party, setParty] = useState(initial.party ?? 4);
  const [seed, setSeed] = useState(initial.seed ?? randomSeedWord());

  const submit = (e) => {
    e.preventDefault();
    onGenerate(generateDungeon({ seed: seed.trim() || randomSeedWord(), theme, size, level, party, monsters: monsters ?? [] }));
  };

  return (
    <form className="genform" onSubmit={submit}>
      <span className="field__label">Theme</span>
      <div className="genform__themes">
        {Object.entries(THEMES).map(([key, t]) => (
          <button type="button" key={key} className={`theme-card ${theme === key ? 'is-active' : ''}`} onClick={() => setTheme(key)}>
            <img src={THEME_ART[key]} alt="" loading="lazy" />
            <span><strong>{t.label}</strong><small>{t.blurb}</small></span>
          </button>
        ))}
      </div>

      <div className="genform__row">
        <div className="field">
          <span>Size</span>
          <div className="segmented segmented--lg">
            {Object.entries(SIZES).map(([key, sz]) => (
              <button type="button" key={key} className={size === key ? 'is-active' : ''} onClick={() => setSize(key)}>{sz.label}</button>
            ))}
          </div>
        </div>
        <label className="field">
          <span>Party level</span>
          <input type="number" min="1" max="20" value={level} onChange={(e) => setLevel(Number(e.target.value))} />
        </label>
        <label className="field">
          <span>Heroes</span>
          <input type="number" min="1" max="8" value={party} onChange={(e) => setParty(Number(e.target.value))} />
        </label>
        <label className="field genform__seed">
          <span>Seed</span>
          <div className="input-with-btn">
            <input value={seed} onChange={(e) => setSeed(e.target.value)} spellCheck={false} />
            <button type="button" className="icon-btn" onClick={() => setSeed(randomSeedWord())} title="New seed" aria-label="New seed"><Dices size={16} /></button>
          </div>
        </label>
      </div>
      <p className="muted small">The same seed and settings always build the same dungeon. Encounters are balanced for the party you set.</p>
      <button className="btn btn--gold btn--lg" disabled={busy || !monsters}>
        <Wand2 size={18} /> {monsters ? submitLabel : 'Opening the bestiary…'}
      </button>
    </form>
  );
}
