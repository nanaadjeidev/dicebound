// Icons from game-icons.net (CC BY 3.0), tinted with CSS masks so they take any colour.
const KNOWN = new Set([
  'barbarian', 'lyre', 'holy-symbol', 'oak-leaf', 'crossed-swords', 'fist', 'templar-shield', 'high-shot',
  'plain-dagger', 'fire-ray', 'warlock-hood', 'pointy-hat', 'dice-twenty-faces-twenty', 'heart-bottle',
  'skull-crossed-bones', 'dragon-head', 'visored-helm', 'dripping-sword', 'checked-shield', 'scroll-unfurled',
  'tavern-sign', 'castle', 'crowned-skull', 'crystal-ball', 'battle-axe', 'broadsword', 'burning-embers',
  'evil-book', 'fireball', 'leaf-swirl', 'lightning-tree', 'wizard-staff', 'health-potion', 'bow-arrow', 'd20',
]);

// Monster type icons are named by concept; map them to an available glyph.
const ALIASES = {
  eye: 'crystal-ball', paw: 'leaf-swirl', sun: 'holy-symbol', cog: 'checked-shield', dragon: 'dragon-head',
  flame: 'fireball', leaf: 'oak-leaf', horns: 'evil-book', mountain: 'castle', user: 'visored-helm',
  claw: 'dripping-sword', droplet: 'heart-bottle', sprout: 'leaf-swirl', skull: 'crowned-skull', bug: 'skull-crossed-bones',
};

export function iconUrl(name) {
  const key = KNOWN.has(name) ? name : ALIASES[name] ?? 'crossed-swords';
  return `/img/icons/${key}.svg`;
}

export default function GameIcon({ name, size = 20, color = 'currentColor', className = '', style }) {
  const url = iconUrl(name);
  return (
    <span
      aria-hidden="true"
      className={`game-icon ${className}`}
      style={{ width: size, height: size, backgroundColor: color, WebkitMaskImage: `url(${url})`, maskImage: `url(${url})`, ...style }}
    />
  );
}
