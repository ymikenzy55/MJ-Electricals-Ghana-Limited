/** Flat "analyst reviewing a dashboard" illustration for the sign in and sign up pages. */
export default function AuthIllustration({ className = "" }: { className?: string }) {
  const navy = "#1E3A8A";
  const dark = "#3B4B54";
  const blue = "#2653C6";
  return (
    <svg viewBox="0 0 560 470" className={className} role="img" aria-label="A person reviewing charts on a large screen" xmlns="http://www.w3.org/2000/svg">
      {/* floor */}
      <ellipse cx="290" cy="392" rx="255" ry="66" fill="#EEEFF2" />
      <ellipse cx="420" cy="384" rx="46" ry="14" fill="#E2E3E8" />

      {/* back monitor */}
      <g transform="matrix(1 -0.36 0 1 0 0)">
        <rect x="70" y="150" width="270" height="250" rx="14" fill={dark} />
        <rect x="86" y="166" width="238" height="218" rx="6" fill="#BFCDEE" />
      </g>
      <path d="M150 322 L235 292 L235 322 L150 352 Z" fill="#455A64" opacity=".0" />
      <path d="M186 372 h90 l14 16 h-118 z" fill="#465A65" />

      {/* front window */}
      <g transform="matrix(1 -0.36 0 1 0 0)">
        <rect x="118" y="196" width="300" height="240" rx="8" fill="#F7F7F9" />
        <path d="M118 204 a8 8 0 0 1 8 -8 h284 a8 8 0 0 1 8 8 v22 h-300 z" fill={navy} />
        <circle cx="386" cy="211" r="4" fill="#fff" /><circle cx="399" cy="211" r="4" fill="#fff" /><circle cx="412" cy="211" r="4" fill="#fff" />
        {/* sidebar */}
        <rect x="118" y="226" width="62" height="210" fill="#F1F2F6" />
        <rect x="126" y="236" width="46" height="9" rx="4" fill="#C9D4EE" />
        {[262, 280, 298, 316, 334].map((y) => (<g key={y}><rect x="128" y={y} width="7" height="7" rx="1.5" fill="#5A6B78" /><rect x="142" y={y + 1} width="28" height="5" rx="2.5" fill="#D8DAE0" /></g>))}
        {[358, 370, 382, 394, 406].map((y) => (<rect key={y} x="130" y={y} width="38" height="4" rx="2" fill="#DCDDE3" />))}
        {/* KPI chips */}
        <rect x="190" y="236" width="104" height="30" rx="6" fill="#ECECF0" />
        <circle cx="206" cy="251" r="9" fill="#fff" stroke={blue} strokeWidth="2.5" />
        <rect x="222" y="245" width="52" height="5" rx="2.5" fill="#55636D" />
        <rect x="300" y="236" width="104" height="30" rx="6" fill="#ECECF0" />
        <circle cx="316" cy="251" r="9" fill="#fff" stroke={blue} strokeWidth="2.5" />
        <rect x="332" y="245" width="52" height="5" rx="2.5" fill="#55636D" />
        {/* main chart card */}
        <rect x="190" y="276" width="214" height="152" rx="8" fill="#FBFBFC" stroke="#E4E5EA" />
        <polyline points="204,388 220,366 234,372 250,346 266,352 284,326 300,338 318,312 336,320 356,296 376,302 392,286" fill="none" stroke={blue} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
        <polyline points="204,398 222,378 240,382 258,360 276,366 294,344 312,350 330,330 348,336 366,316 384,320 392,306" fill="none" stroke="#5B7BD8" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {[[220, 366], [250, 346], [284, 326], [318, 312], [356, 296], [392, 286]].map(([x, y]) => (<circle key={x} cx={x} cy={y} r="3" fill={navy} />))}
        {/* mini stats */}
        <text x="204" y="418" fontSize="11" fill="#39424A" fontFamily="system-ui,sans-serif">633</text>
        <text x="262" y="418" fontSize="11" fill="#39424A" fontFamily="system-ui,sans-serif">627</text>
        <text x="322" y="418" fontSize="11" fill="#39424A" fontFamily="system-ui,sans-serif">93</text>
        {/* pies */}
        <circle cx="356" cy="356" r="15" fill="#CFD8F2" /><path d="M356 356 L356 341 A15 15 0 1 1 341 356 Z" fill={blue} />
        <circle cx="388" cy="352" r="12" fill="#CFD8F2" /><path d="M388 352 L388 340 A12 12 0 1 1 376 352 Z" fill={navy} />
      </g>

      {/* magnifier */}
      <g>
        <path d="M290 398 L340 360" stroke={blue} strokeWidth="14" strokeLinecap="round" />
        <ellipse cx="260" cy="410" rx="62" ry="27" fill="none" stroke="#2C58C9" strokeWidth="13" />
        <ellipse cx="260" cy="410" rx="49" ry="19" fill="#F1F4FB" opacity=".75" />
        <ellipse cx="260" cy="418" rx="62" ry="27" fill="none" stroke="#1F3F9A" strokeWidth="6" opacity=".55" />
      </g>

      {/* plant */}
      <g>
        <path d="M478 372 C462 340 470 306 492 292 C506 318 500 350 478 372 Z" fill="#2A56C8" />
        <path d="M484 372 C490 344 512 326 534 328 C528 352 508 368 484 372 Z" fill="#3B6AD8" />
        <path d="M478 372 L496 304" stroke="#F3F5FB" strokeWidth="2" />
      </g>

      {/* person */}
      <g>
        <ellipse cx="410" cy="386" rx="34" ry="9" fill="#DADBE0" />
        <path d="M388 232 c-8 -4 -10 -14 -6 -21 c-6 -6 -4 -18 6 -22 c2 -10 16 -14 24 -8 c10 -2 20 6 18 16 c8 6 6 20 -4 24 c-2 8 -12 10 -20 6 z" fill="#1F2429" />
        <rect x="396" y="212" width="26" height="30" rx="12" fill="#7A4B2E" />
        <rect x="398" y="216" width="8" height="5" rx="2" fill="none" stroke="#111" strokeWidth="1.4" />
        <path d="M392 246 h44 l14 24 v70 h-72 v-70 z" fill="#4A5A63" />
        <path d="M392 246 l-30 26 l6 12 l32 -20 z" fill="#3E4D56" />
        <rect x="336" y="256" width="52" height="34" rx="3" fill="#EFF1F6" stroke="#3E4D56" strokeWidth="3" transform="rotate(-24 362 272)" />
        <rect x="350" y="248" width="14" height="8" rx="3" fill={blue} transform="rotate(-24 362 272)" />
        <rect x="392" y="338" width="30" height="46" rx="4" fill="#33434B" />
        <rect x="424" y="338" width="30" height="46" rx="4" fill="#3A4A53" />
        <path d="M388 384 h34 v10 h-42 z" fill="#1E262A" /><path d="M424 384 h34 v10 h-42 z" fill="#1E262A" />
        <path d="M362 268 c-10 4 -14 16 -8 24" fill="none" stroke="#7A4B2E" strokeWidth="8" strokeLinecap="round" />
      </g>
    </svg>
  );
}
