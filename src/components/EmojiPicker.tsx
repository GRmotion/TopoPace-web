import { useState, useEffect, useRef } from 'react';

// [emoji, searchKeywords]
const EMOJI_DATA: [string, string][] = [
  // Smileys
  ['😀','happy smile grinning'],
  ['😂','laugh crying joy funny'],
  ['🥰','love hearts smiling'],
  ['😍','heart eyes love'],
  ['🤩','star eyes amazed excited'],
  ['😎','cool sunglasses'],
  ['🤔','thinking curious'],
  ['😭','crying sob tears'],
  ['😤','huff angry snort'],
  ['🤯','mind blown exploding'],
  ['😴','sleeping tired zzz'],
  ['🤢','sick nausea green'],
  ['🤮','vomit sick puking'],
  ['😷','mask sick ill'],
  ['🤒','sick thermometer'],
  ['🤕','injured bandage hurt'],
  ['😵','dizzy unconscious'],
  ['😈','devil evil'],
  ['👿','angry devil evil'],
  ['💩','poop shit'],
  ['💀','skull death dead'],
  ['☠️','skull crossbones death'],
  ['👻','ghost boo scary'],
  ['😱','scream horror scared'],
  ['🥵','hot sweating overheated'],
  ['🥶','cold freezing'],
  ['🤠','cowboy hat'],
  ['🥳','party celebration birthday'],
  ['🫠','melting face hot'],
  ['🤧','sneezing sick cold'],
  // People
  ['💪','muscle strong flex arm'],
  ['🦵','leg kick running'],
  ['🦶','foot sole running'],
  ['👟','shoe sneaker running footwear'],
  ['🥾','hiking boot shoe mountain'],
  ['🧤','gloves cold winter'],
  ['🧢','cap hat baseball'],
  ['⛑️','helmet hard hat safety'],
  ['🪖','helmet military safety'],
  ['🎽','shirt jersey sports running'],
  ['🏃','running person sprint'],
  ['🚶','walking person stroll trail'],
  ['🧗','climbing person rock wall'],
  ['🏋️','lifting weights strong gym'],
  ['🤸','gymnastics cartwheel'],
  ['🧘','yoga meditation zen'],
  ['🚵','mountain biking cyclist'],
  ['🚴','cycling biking person'],
  ['⛷️','skiing snow slope'],
  ['🏂','snowboard snow'],
  ['🏊','swimming pool water'],
  ['🏄','surfing waves ocean'],
  ['💃','dancing woman'],
  ['🕺','dancing man'],
  ['🏇','horse racing jockey'],
  // Weather
  ['☀️','sun sunny clear bright warm'],
  ['🌤️','partly cloudy sun'],
  ['⛅','partly cloudy overcast'],
  ['☁️','cloud overcast grey'],
  ['🌦️','rain sun partly rainy'],
  ['🌧️','rain rainy cloud wet'],
  ['⛈️','storm thunder rain lightning'],
  ['🌩️','lightning bolt storm electric'],
  ['🌨️','snow flake winter'],
  ['❄️','snowflake cold ice winter'],
  ['☃️','snowman winter snow'],
  ['🌬️','wind blowing air'],
  ['💨','wind gust air'],
  ['💧','water drop rain hydration'],
  ['💦','water drops sweat splash'],
  ['☔','umbrella rain wet'],
  ['⚡','lightning electric energy'],
  ['🌊','wave ocean sea water'],
  ['🌀','cyclone spiral storm tornado'],
  ['🌈','rainbow colorful weather'],
  ['🌁','fog mist foggy'],
  ['🔥','fire flame hot'],
  ['🌙','moon night crescent'],
  ['⭐','star yellow bright'],
  ['🌟','glowing star sparkle'],
  ['🌠','shooting star meteor'],
  ['🌌','milky way galaxy stars night'],
  // Nature & Places
  ['🌋','volcano mountain eruption'],
  ['⛰️','mountain peak summit'],
  ['🏔️','mountain snow peak summit'],
  ['🗻','mount fuji mountain japan'],
  ['🏕️','camping campfire tent'],
  ['🏖️','beach sand ocean summer'],
  ['🏜️','desert dry hot sand'],
  ['🏝️','island tropical beach'],
  ['🏞️','national park nature scenic'],
  ['🌅','sunrise dawn horizon'],
  ['🌄','sunrise mountains'],
  ['🌃','night city stars'],
  ['🌉','bridge night city lights'],
  ['🌾','wheat grain field'],
  ['🍀','four leaf clover luck'],
  ['☘️','shamrock clover green'],
  ['🍃','leaves green nature'],
  ['🍂','fallen leaf autumn orange'],
  ['🍁','maple leaf autumn red'],
  ['🍄','mushroom red spot'],
  ['🌵','cactus desert dry'],
  ['🎄','christmas tree pine holiday'],
  ['🌲','evergreen tree pine forest'],
  ['🌳','deciduous tree nature green'],
  ['🌴','palm tree tropical beach'],
  ['🌾','wheat grain stalk'],
  // Animals
  ['🐶','dog puppy canine'],
  ['🐺','wolf howl moon wild'],
  ['🦊','fox orange clever'],
  ['🐻','bear grizzly'],
  ['🦁','lion king mane roar'],
  ['🐯','tiger stripes wild'],
  ['🐸','frog green hop'],
  ['🐧','penguin cold arctic'],
  ['🦅','eagle bird flight majestic'],
  ['🦉','owl wise night'],
  ['🦋','butterfly flying insect colorful'],
  ['🐝','bee honey buzzing insect'],
  ['🐛','caterpillar worm bug'],
  ['🐢','turtle slow shell'],
  ['🐍','snake slither reptile'],
  ['🦎','lizard reptile green'],
  ['🐙','octopus tentacles sea'],
  ['🐠','tropical fish colorful'],
  ['🐬','dolphin smart ocean'],
  ['🐳','whale big ocean blue'],
  ['🦈','shark fish danger ocean'],
  ['🐺','wolf forest mountain'],
  ['🦔','hedgehog spiky animal'],
  ['🦝','raccoon trash animal'],
  // Food & Drink
  ['🍎','apple red fruit'],
  ['🍌','banana yellow fruit energy'],
  ['🍊','orange fruit citrus'],
  ['🍋','lemon yellow sour fruit'],
  ['🍇','grapes purple fruit'],
  ['🍓','strawberry red berry'],
  ['🫐','blueberry blue berry'],
  ['🍉','watermelon summer fruit'],
  ['🍑','peach fruit'],
  ['🥑','avocado green healthy fat'],
  ['🥕','carrot orange vegetable'],
  ['🥜','peanuts nuts protein energy'],
  ['🍫','chocolate bar candy sweet'],
  ['🍬','candy sweet sugar'],
  ['🍭','lollipop candy sugar'],
  ['🍯','honey jar sweet energy'],
  ['🍕','pizza cheese italian'],
  ['🍔','burger hamburger fast food'],
  ['🌮','taco mexican food'],
  ['🥗','salad green healthy'],
  ['🍜','noodles ramen bowl'],
  ['🧃','juice drink box'],
  ['🥤','drink cup straw'],
  ['🧋','boba tea drink'],
  ['☕','coffee hot espresso'],
  ['🍵','tea hot green cup'],
  ['💊','pill medicine supplement vitamin'],
  ['🧉','mate tea yerba drink'],
  ['🧊','ice cube cold frozen'],
  ['🍺','beer mug drink'],
  ['🍷','wine red drink'],
  ['🍫','chocolate energy gel sweet'],
  // Travel
  ['🗺️','map world travel route'],
  ['🧭','compass direction navigate'],
  ['✈️','airplane flight travel'],
  ['🚀','rocket space fast launch'],
  ['🚗','car drive vehicle'],
  ['🚲','bicycle bike cycling'],
  ['🛴','scooter kick ride'],
  ['🚁','helicopter rotor fly'],
  ['⛵','sailboat ocean wind'],
  ['🚢','ship ocean cruise'],
  ['🏠','house home'],
  ['⛺','tent camping outdoors'],
  ['🌐','globe earth world travel'],
  ['🗼','tower eiffel paris'],
  ['🏯','castle japanese fort'],
  ['🏰','castle european medieval'],
  // Activities & Sport
  ['🎿','ski snow slope slalom'],
  ['🥇','gold medal first place win'],
  ['🥈','silver medal second place'],
  ['🥉','bronze medal third place'],
  ['🏆','trophy cup winner champion'],
  ['🏅','medal sports winner'],
  ['🎯','target bullseye dart aim'],
  ['🎮','game controller video gaming'],
  ['🎲','dice game random chance'],
  ['🎉','party popper celebration'],
  ['🎊','confetti celebration party'],
  ['🎈','balloon party celebration'],
  ['🎁','gift box present'],
  ['🏁','checkered flag finish race end'],
  ['🚩','red flag warning marker'],
  ['🏳️','white flag surrender peace'],
  // Objects
  ['⌚','watch time clock wrist'],
  ['📱','phone smartphone mobile'],
  ['💻','laptop computer screen'],
  ['📷','camera photo picture'],
  ['🎧','headphones music audio'],
  ['💡','bulb light idea'],
  ['🔦','flashlight torch light trail'],
  ['🕯️','candle flame light'],
  ['🔋','battery power charge'],
  ['⏱️','stopwatch timer time'],
  ['⏰','alarm clock time wake'],
  ['⌛','hourglass time sand'],
  ['⏳','hourglass sand time running'],
  ['🌡️','thermometer temperature cold hot'],
  ['⚖️','scales balance weight'],
  ['🔧','wrench tool fix repair'],
  ['⚙️','gear settings cog'],
  ['🔑','key lock open'],
  ['🔗','link chain connect'],
  ['🧲','magnet attract metal'],
  ['🪜','ladder climb steps'],
  ['🧰','toolbox tools fix'],
  ['💊','pill medicine drug supplement'],
  ['🩹','bandage wound hurt injured'],
  ['🩺','stethoscope doctor medical'],
  ['🧬','dna genetics science'],
  ['🧪','test tube lab science'],
  ['🎒','backpack bag school hike trail'],
  ['🧳','luggage suitcase travel'],
  ['🌂','umbrella rain'],
  // Symbols
  ['❤️','heart love red'],
  ['🧡','heart orange love'],
  ['💛','heart yellow love'],
  ['💚','heart green love'],
  ['💙','heart blue love'],
  ['💜','heart purple love'],
  ['🖤','heart black love'],
  ['💔','broken heart sad'],
  ['❣️','heart exclamation love'],
  ['💕','two hearts love'],
  ['💯','hundred percent perfect score'],
  ['✅','check mark green done'],
  ['❌','cross red no cancel'],
  ['⚠️','warning caution danger alert'],
  ['❓','question mark unknown'],
  ['❗','exclamation mark important alert'],
  ['🆘','sos emergency help'],
  ['♻️','recycle green environment'],
  ['♾️','infinity forever loop'],
  ['🔴','red circle dot'],
  ['🟠','orange circle dot'],
  ['🟡','yellow circle dot'],
  ['🟢','green circle dot'],
  ['🔵','blue circle dot'],
  ['🟣','purple circle dot'],
  ['⚫','black circle dark'],
  ['⚪','white circle light'],
  ['🔺','red triangle up'],
  ['🔻','red triangle down'],
  ['🔊','loud speaker volume sound'],
  ['🔔','bell notification alert'],
  ['💬','speech bubble comment talk'],
  ['💭','thought bubble thinking'],
];

const CATEGORIES = [
  { id: 'popular', label: '⭐', name: 'Popular', emojis: ['😀','😂','🥰','😎','🤔','😭','🤯','😱','🥵','🥶','💩','💀','💪','🏃','🧗','🥾','☀️','❄️','🔥','💧','🌊','⚡','🌈','🏔️','⛰️','🗺️','🧭','💊','🩹','🎒','⏱️','🏆','🥇','⚠️','❤️','💔','✅','❌','💯'] },
  { id: 'smileys', label: '😀', name: 'Smileys', emojis: ['😀','😂','🥰','😍','🤩','😎','🤔','😭','😤','🤯','😴','🤢','🤮','😷','🤒','🤕','😵','😈','👿','💩','💀','☠️','👻','😱','🥵','🥶','🤠','🥳','🫠','🤧'] },
  { id: 'people', label: '🏃', name: 'People & Sport', emojis: ['💪','🦵','🦶','👟','🥾','🧤','🧢','⛑️','🪖','🎽','🏃','🚶','🧗','🏋️','🤸','🧘','🚵','🚴','⛷️','🏂','🏊','🏄','💃','🕺','🏇'] },
  { id: 'weather', label: '🌤️', name: 'Weather', emojis: ['☀️','🌤️','⛅','☁️','🌦️','🌧️','⛈️','🌩️','🌨️','❄️','☃️','🌬️','💨','💧','💦','☔','⚡','🌊','🌀','🌈','🌁','🔥','🌙','⭐','🌟','🌠','🌌'] },
  { id: 'nature', label: '🌿', name: 'Nature', emojis: ['🌋','⛰️','🏔️','🗻','🏕️','🏖️','🏜️','🏝️','🏞️','🌅','🌄','🌃','🌉','🌾','🍀','☘️','🍃','🍂','🍁','🍄','🌵','🌲','🌳','🌴','🐶','🐺','🦊','🐻','🦁','🐯','🐸','🐧','🦅','🦉','🦋','🐝','🐢','🐍','🦎','🐙','🐬','🐳','🦈','🦔','🦝'] },
  { id: 'food', label: '🍎', name: 'Food & Drink', emojis: ['🍎','🍌','🍊','🍋','🍇','🍓','🫐','🍉','🍑','🥑','🥕','🥜','🍫','🍬','🍭','🍯','🍕','🍔','🌮','🥗','🍜','🧃','🥤','🧋','☕','🍵','💊','🧉','🧊','💧','🍺','🍷'] },
  { id: 'travel', label: '✈️', name: 'Travel', emojis: ['🗺️','🧭','✈️','🚀','🚗','🚲','🛴','🚁','⛵','🚢','🏠','⛺','🌐','🗼','🏯','🏰'] },
  { id: 'activities', label: '⚽', name: 'Activities', emojis: ['🎿','🥇','🥈','🥉','🏆','🏅','🎯','🎮','🎲','🎉','🎊','🎈','🎁','🏁','🚩','🏳️'] },
  { id: 'objects', label: '💡', name: 'Objects', emojis: ['⌚','📱','💻','📷','🎧','💡','🔦','🕯️','🔋','⏱️','⏰','⌛','⏳','🌡️','⚖️','🔧','⚙️','🔑','🔗','🧲','🪜','🧰','💊','🩹','🩺','🧬','🧪','🎒','🧳','🌂'] },
  { id: 'symbols', label: '❤️', name: 'Symbols', emojis: ['❤️','🧡','💛','💚','💙','💜','🖤','💔','❣️','💕','💯','✅','❌','⚠️','❓','❗','🆘','♻️','♾️','🔴','🟠','🟡','🟢','🔵','🟣','⚫','⚪','🔺','🔻','🔊','🔔','💬','💭'] },
];

interface Props {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

export default function EmojiPicker({ onSelect, onClose }: Props) {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('popular');
  const pickerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  useEffect(() => {
    function onDocDown(e: MouseEvent) {
      if (!pickerRef.current?.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', onDocDown, true);
    return () => document.removeEventListener('mousedown', onDocDown, true);
  }, [onClose]);

  const searchTrimmed = search.trim().toLowerCase();
  const displayedEmojis = searchTrimmed
    ? EMOJI_DATA
        .filter(([, kw]) => searchTrimmed.split(/\s+/).some(w => kw.includes(w)))
        .map(([e]) => e)
    : (CATEGORIES.find(c => c.id === activeCategory)?.emojis ?? []);

  return (
    <div
      ref={pickerRef}
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        boxShadow: '0 4px 20px rgba(0,0,0,.55)',
        width: 264,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        userSelect: 'none',
      }}
      onMouseDown={e => e.stopPropagation()}
    >
      {/* Search */}
      <div style={{ padding: '8px 8px 4px' }}>
        <input
          ref={searchRef}
          type="text"
          placeholder="Search…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            width: '100%', background: 'var(--bg-elevated)',
            border: '1px solid var(--border)', borderRadius: 6,
            padding: '5px 8px', fontSize: 12, color: 'var(--text)',
            outline: 'none', boxSizing: 'border-box',
          }}
          onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}
        />
      </div>

      {/* Category tabs */}
      {!searchTrimmed && (
        <div style={{
          display: 'flex', overflowX: 'auto', padding: '0 4px 4px',
          gap: 0, scrollbarWidth: 'none',
        }}>
          {CATEGORIES.map(cat => (
            <button key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              title={cat.name}
              style={{
                background: activeCategory === cat.id ? 'var(--bg-elevated)' : 'transparent',
                border: 'none', borderRadius: 6, padding: '3px 5px',
                fontSize: 15, cursor: 'pointer', flexShrink: 0,
                opacity: activeCategory === cat.id ? 1 : 0.45,
                transition: 'opacity 100ms',
              }}
            >{cat.label}</button>
          ))}
        </div>
      )}

      {/* Category name */}
      {!searchTrimmed && (
        <div style={{ fontSize: 10, color: 'var(--text-hint)', padding: '0 8px 3px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {CATEGORIES.find(c => c.id === activeCategory)?.name}
        </div>
      )}

      {/* Emoji grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(8, 1fr)',
        gap: 1,
        padding: '2px 4px 6px',
        maxHeight: 196,
        overflowY: 'auto',
      }}>
        {displayedEmojis.map((emoji, i) => (
          <button
            key={`${emoji}-${i}`}
            onClick={() => onSelect(emoji)}
            style={{
              background: 'none', border: 'none',
              padding: '3px 0', fontSize: 20, cursor: 'pointer',
              borderRadius: 5, lineHeight: 1.15, textAlign: 'center',
            }}
            title={emoji}
          >{emoji}</button>
        ))}
        {displayedEmojis.length === 0 && (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '20px 0', fontSize: 12, color: 'var(--text-hint)' }}>
            No results for "{search}"
          </div>
        )}
      </div>
    </div>
  );
}
