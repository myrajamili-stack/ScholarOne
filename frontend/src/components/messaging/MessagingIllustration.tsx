function MessagingIllustration() {
  return (
    <svg className="messaging-illustration" viewBox="0 0 340 200" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="message-art-purple" x1="110" y1="20" x2="220" y2="180" gradientUnits="userSpaceOnUse">
          <stop stopColor="#B49AFF" /><stop offset="1" stopColor="#6432E7" />
        </linearGradient>
        <linearGradient id="message-art-screen" x1="220" y1="100" x2="282" y2="179" gradientUnits="userSpaceOnUse">
          <stop stopColor="#C6B4FF" /><stop offset="1" stopColor="#8672F5" />
        </linearGradient>
        <linearGradient id="message-art-envelope" x1="102" y1="135" x2="150" y2="185" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFE383" /><stop offset="1" stopColor="#FFB819" />
        </linearGradient>
        <filter id="message-art-shadow" x="-25%" y="-25%" width="160%" height="160%">
          <feDropShadow dx="0" dy="5" stdDeviation="5" floodColor="#9D7AEE" floodOpacity=".2" />
        </filter>
      </defs>
      <ellipse cx="185" cy="182" rx="151" ry="15" fill="#E9DEFF" opacity=".6" />
      <g filter="url(#message-art-shadow)">
        <path d="M143 25Q145 12 160 14L220 19Q237 21 237 37L235 61Q234 76 219 76H211L210 94L187 76L153 73Q139 71 139 56Z" fill="url(#message-art-purple)" />
        <circle cx="165" cy="44" r="6" fill="white" /><circle cx="186" cy="46" r="6" fill="white" /><circle cx="208" cy="47" r="6" fill="white" />
        <path d="M62 76L101 65Q116 62 120 77L124 92Q128 106 113 111L99 115L91 131L84 119L74 122Q59 125 55 111L51 94Q47 81 62 76Z" fill="#A98AF5" />
        <circle cx="70" cy="97" r="4.5" fill="white" /><circle cx="86" cy="92" r="4.5" fill="white" /><circle cx="103" cy="88" r="4.5" fill="white" />
        <path d="M215 82L314 75Q320 75 318 83L295 182H192Z" fill="#392077" />
        <path d="M219 88L312 81L290 173H199Z" fill="url(#message-art-screen)" />
        <path d="M220 91L265 126L305 85Z" fill="#D9CCFF" opacity=".38" />
        <path d="M199 173L259 134L290 173Z" fill="#BBA8FF" opacity=".46" />
        <path d="M138 180H295L303 187Q303 193 292 193H145Q136 191 138 180Z" fill="#6739DF" />
        <path d="M207 180H248L244 186H211Z" fill="#A98AF5" />
        <g transform="rotate(-16 127 150)">
          <rect x="87" y="124" width="81" height="57" rx="8" fill="url(#message-art-envelope)" />
          <path d="M90 128L126 156L165 128" fill="#FFE88D" />
          <path d="M90 179L116 151M166 178L138 151" stroke="#FFCC4B" strokeWidth="2" />
        </g>
      </g>
      <path d="M273 34L275 20M285 41L295 29M293 53L309 48M33 55L33 42M44 61L51 51M47 72L60 69" stroke="#FFCD3E" strokeWidth="6" strokeLinecap="round" />
      <circle cx="129" cy="104" r="3" fill="#BCA5F5" /><circle cx="251" cy="103" r="2" fill="white" opacity=".8" />
    </svg>
  );
}
export default MessagingIllustration;
