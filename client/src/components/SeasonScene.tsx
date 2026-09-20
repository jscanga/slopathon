import { cn } from "@/lib/utils";

/**
 * Hand-drawn seasonal art for the term cards. No images — everything is
 * inline SVG layered over a CSS gradient (see index.css: .season-fall /
 * .season-spring / .season-summer). Three academic terms only:
 *   Fall   — warm brown/amber gradient with drifting leaves
 *   Spring — green gradient with grass + flowers
 *   Summer — sunny gradient with a sun over sand dunes
 */

export type SeasonName = "Fall" | "Spring" | "Summer";

const seasonClass: Record<SeasonName, string> = {
  Fall: "season-fall",
  Spring: "season-spring",
  Summer: "season-summer",
};

/* ---------- individual art pieces ---------- */

function Leaf({
  x,
  y,
  rot,
  scale = 1,
  color,
  delay = 0,
  animate,
}: {
  x: number;
  y: number;
  rot: number;
  scale?: number;
  color: string;
  delay?: number;
  animate?: boolean;
}) {
  return (
    <g
      transform={`translate(${x} ${y}) rotate(${rot}) scale(${scale})`}
      style={animate ? { animation: `drift 6s ease-in-out ${delay}s infinite` } : undefined}
    >
      <path
        d="M0 0 C 5 -9 15 -11 22 -6 C 20 3 10 9 0 8 C -2 5 -1 2 0 0 Z"
        fill={color}
      />
      <path d="M1 6 C 6 2 13 -3 20 -5" stroke="rgba(0,0,0,0.14)" strokeWidth="1" fill="none" />
    </g>
  );
}

function Flower({
  x,
  y,
  petal,
  core,
  scale = 1,
  swayDelay = 0,
}: {
  x: number;
  y: number;
  petal: string;
  core: string;
  scale?: number;
  swayDelay?: number;
}) {
  return (
    <g transform={`translate(${x} ${y})`}>
      {/* stem */}
      <path
        d={`M0 26 C -2 14 2 6 0 0`}
        stroke="var(--spring-grass)"
        strokeWidth={2.4 * scale}
        fill="none"
        strokeLinecap="round"
      />
      <g
        transform={`scale(${scale})`}
        style={{ transformOrigin: "0px 0px", animation: `sway 5s ease-in-out ${swayDelay}s infinite` }}
      >
        {[0, 72, 144, 216, 288].map((a) => (
          <ellipse
            key={a}
            cx="0"
            cy="-7"
            rx="3.6"
            ry="6.2"
            fill={petal}
            transform={`rotate(${a})`}
          />
        ))}
        <circle cx="0" cy="0" r="3.1" fill={core} />
      </g>
    </g>
  );
}

/* ---------- per-season scenes ---------- */

function FallArt() {
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox="0 0 320 110"
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
    >
      {/* soft rolling ground */}
      <path d="M0 92 C 70 78 130 100 200 88 C 255 79 300 92 320 86 L320 110 L0 110 Z" fill="rgba(150,90,40,0.22)" />
      <path d="M0 100 C 90 90 160 108 230 98 C 280 91 305 101 320 98 L320 110 L0 110 Z" fill="rgba(130,74,30,0.30)" />
      {/* a bare branch reaching in from the top-RIGHT, clear of the title */}
      <path
        d="M324 4 C 292 10 270 4 246 20 M300 8 C 296 1 290 -1 284 -4 M270 10 C 262 5 256 7 250 3"
        stroke="rgba(110,66,30,0.45)"
        strokeWidth="2.2"
        fill="none"
        strokeLinecap="round"
      />
      {/* drifting leaves — kept to the right half so the season label stays clean */}
      <Leaf x={246} y={20} rot={20} color="var(--fall-leaf-b)" scale={1.05} animate delay={0} />
      <Leaf x={288} y={30} rot={-30} color="var(--fall-leaf-a)" scale={0.95} animate delay={1.4} />
      <Leaf x={214} y={40} rot={55} color="var(--fall-leaf-c)" scale={0.95} animate delay={0.7} />
      <Leaf x={262} y={48} rot={-14} color="var(--fall-leaf-d)" scale={0.85} animate delay={2.1} />
      <Leaf x={232} y={62} rot={95} color="var(--fall-leaf-a)" scale={0.75} animate delay={3.2} />
      <Leaf x={300} y={58} rot={-50} color="var(--fall-leaf-c)" scale={0.8} animate delay={2.6} />
      {/* leaves settled on the ground */}
      <Leaf x={120} y={92} rot={165} color="var(--fall-leaf-b)" scale={0.9} />
      <Leaf x={180} y={97} rot={200} color="var(--fall-leaf-c)" scale={0.85} />
      <Leaf x={250} y={95} rot={150} color="var(--fall-leaf-a)" scale={0.9} />
      <Leaf x={30} y={98} rot={190} color="var(--fall-leaf-d)" scale={0.8} />
    </svg>
  );
}

function SpringArt() {
  const blades = [];
  for (let i = 0; i < 26; i++) {
    const bx = 6 + i * 12.4;
    const h = 12 + ((i * 7) % 10);
    const lean = (i % 3) - 1;
    blades.push(
      <path
        key={i}
        d={`M${bx} 110 C ${bx + lean} ${110 - h / 2} ${bx + lean * 2} ${110 - h} ${bx + lean * 3} ${110 - h}`}
        stroke="var(--spring-grass)"
        strokeWidth="2.4"
        fill="none"
        strokeLinecap="round"
        opacity={0.9}
      />
    );
  }
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox="0 0 320 110"
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
    >
      {/* meadow mounds */}
      <path d="M0 94 C 80 82 150 100 220 90 C 275 82 305 94 320 90 L320 110 L0 110 Z" fill="rgba(90,160,70,0.22)" />
      {blades}
      {/* flowers rising from the grass */}
      <Flower x={54} y={80} petal="var(--spring-flower-a)" core="var(--spring-flower-core)" scale={1.15} swayDelay={0} />
      <Flower x={128} y={84} petal="var(--spring-flower-c)" core="var(--spring-flower-core)" scale={1.0} swayDelay={0.8} />
      <Flower x={196} y={80} petal="var(--spring-flower-b)" core="#e79a2e" scale={1.2} swayDelay={0.4} />
      <Flower x={264} y={84} petal="var(--spring-flower-a)" core="var(--spring-flower-core)" scale={1.0} swayDelay={1.2} />
      {/* drifting petals */}
      <circle cx="230" cy="30" r="2.2" fill="var(--spring-flower-c)" opacity="0.9" style={{ animation: "float-y 4s ease-in-out 0.5s infinite" }} />
      <circle cx="90" cy="24" r="1.8" fill="var(--spring-flower-a)" opacity="0.85" style={{ animation: "float-y 5s ease-in-out 1.5s infinite" }} />
      {/* a fluttering butterfly */}
      <g style={{ animation: "flutter 7s ease-in-out infinite" }}>
        <g transform="translate(150 34)">
          <line x1="0" y1="-4" x2="0" y2="4" stroke="#6b4a2b" strokeWidth="1.4" />
          <g style={{ transformOrigin: "0px 0px", animation: "wing 0.28s ease-in-out infinite" }}>
            <ellipse cx="-4" cy="-2" rx="4" ry="3" fill="#f2a4c3" />
            <ellipse cx="-3.5" cy="3" rx="3.2" ry="2.4" fill="#f4b9d0" />
            <ellipse cx="4" cy="-2" rx="4" ry="3" fill="#f2a4c3" />
            <ellipse cx="3.5" cy="3" rx="3.2" ry="2.4" fill="#f4b9d0" />
          </g>
        </g>
      </g>
    </svg>
  );
}

function SummerArt() {
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox="0 0 320 110"
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
    >
      {/* sun with slow-spinning rays, top-right */}
      <g transform="translate(258 26)">
        <g style={{ transformOrigin: "0px 0px", animation: "spin-slow 40s linear infinite" }}>
          {Array.from({ length: 12 }).map((_, i) => (
            <line
              key={i}
              x1="0"
              y1="-22"
              x2="0"
              y2="-30"
              stroke="var(--summer-sun)"
              strokeWidth="2.4"
              strokeLinecap="round"
              transform={`rotate(${i * 30})`}
              opacity="0.85"
            />
          ))}
        </g>
        <circle r="15" fill="var(--summer-sun-core)" style={{ transformOrigin: "0px 0px", animation: "twinkle 3s ease-in-out infinite" }} />
        <circle r="15" fill="none" stroke="var(--summer-sun)" strokeWidth="2.5" />
      </g>
      {/* a drifting cloud */}
      <g style={{ animation: "float-y 6s ease-in-out infinite" }}>
        <g transform="translate(70 26)" fill="rgba(255,255,255,0.85)">
          <ellipse cx="0" cy="0" rx="12" ry="7" />
          <ellipse cx="10" cy="2" rx="9" ry="6" />
          <ellipse cx="-10" cy="3" rx="8" ry="5" />
        </g>
      </g>
      {/* two little gulls */}
      <g stroke="rgba(120,90,50,0.55)" strokeWidth="1.6" fill="none" strokeLinecap="round">
        <path d="M120 40 q 4 -4 8 0 q 4 -4 8 0" style={{ animation: "float-y 5s ease-in-out 0.4s infinite" }} />
        <path d="M150 52 q 3 -3 6 0 q 3 -3 6 0" style={{ animation: "float-y 6s ease-in-out 1.3s infinite" }} />
      </g>
      {/* distant calm sea line */}
      <path d="M0 78 C 60 74 120 80 180 76 C 240 72 290 78 320 75 L320 88 L0 88 Z" fill="rgba(127,208,212,0.35)" />
      {/* sand dunes in beige */}
      <path d="M0 90 C 70 80 130 96 200 88 C 255 82 300 92 320 88 L320 110 L0 110 Z" fill="var(--summer-sand)" />
      <path d="M0 100 C 90 92 160 104 240 98 C 285 95 305 101 320 100 L320 110 L0 110 Z" fill="rgba(196,168,110,0.7)" />
      {/* a couple of shells / pebbles on the sand */}
      <circle cx="70" cy="101" r="2.4" fill="rgba(255,255,255,0.7)" />
      <circle cx="150" cy="104" r="2" fill="rgba(179,121,42,0.5)" />
      <circle cx="118" cy="100" r="1.6" fill="rgba(255,255,255,0.6)" />
    </svg>
  );
}

const artFor: Record<SeasonName, () => JSX.Element> = {
  Fall: FallArt,
  Spring: SpringArt,
  Summer: SummerArt,
};

/**
 * The gradient + art band. Renders `children` (header content) above the
 * art so labels sit on the scene.
 */
export default function SeasonScene({
  season,
  className,
  children,
}: {
  season: SeasonName;
  className?: string;
  children?: React.ReactNode;
}) {
  const Art = artFor[season];
  return (
    <div className={cn("season-scene", seasonClass[season], className)}>
      <div className="pointer-events-none absolute inset-0 origin-bottom transition-transform duration-700 ease-out group-hover:scale-[1.06]">
        <Art />
      </div>
      {/* subtle top scrim so the season label stays legible over the art */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[5] h-14 bg-gradient-to-b from-white/40 to-transparent" />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
