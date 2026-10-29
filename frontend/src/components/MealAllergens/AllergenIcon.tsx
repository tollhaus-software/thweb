import React from 'react';

interface AllergenIconProps {
  allergenKey: string;
  size?: number;
  className?: string;
}

/**
 * 1. Glutenhaltiges Getreide: Full-color golden wheat sheaf with ear and awns
 */
const WheatIllustration: React.FC<{ size: number; className?: string }> = ({ size, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
    {/* Stem */}
    <path d="M12 22V5" stroke="#92400e" strokeWidth="1.5" strokeLinecap="round" />
    {/* Top grain */}
    <path d="M12 2C10.8 3.2 10.8 4.8 12 6C13.2 4.8 13.2 3.2 12 2Z" fill="#fbbf24" stroke="#d97706" strokeWidth="0.75" />
    <path d="M12 2V0.8" stroke="#d97706" strokeWidth="1" strokeLinecap="round" />
    {/* Upper pair */}
    <path d="M12 5C10 4 8.5 5.5 10 7.5C11.2 7 11.8 6 12 5Z" fill="#f59e0b" stroke="#b45309" strokeWidth="0.75" />
    <path d="M8.5 4.5L7 3" stroke="#b45309" strokeWidth="1" strokeLinecap="round" />
    <path d="M12 5C14 4 15.5 5.5 14 7.5C12.8 7 12.2 6 12 5Z" fill="#fbbf24" stroke="#d97706" strokeWidth="0.75" />
    <path d="M15.5 4.5L17 3" stroke="#d97706" strokeWidth="1" strokeLinecap="round" />
    {/* Mid pair */}
    <path d="M12 8C9.8 7 8 8.8 9.8 11C11 10.2 11.8 9.2 12 8Z" fill="#f59e0b" stroke="#b45309" strokeWidth="0.75" />
    <path d="M8 7.5L6 6" stroke="#b45309" strokeWidth="1" strokeLinecap="round" />
    <path d="M12 8C14.2 7 16 8.8 14.2 11C13 10.2 12.2 9.2 12 8Z" fill="#fbbf24" stroke="#d97706" strokeWidth="0.75" />
    <path d="M16 7.5L18 6" stroke="#d97706" strokeWidth="1" strokeLinecap="round" />
    {/* Lower pair */}
    <path d="M12 11.5C10 10.5 8.5 12.5 10.2 14.5C11.2 13.8 11.8 12.8 12 11.5Z" fill="#d97706" stroke="#92400e" strokeWidth="0.75" />
    <path d="M8.5 11L7 9.5" stroke="#92400e" strokeWidth="1" strokeLinecap="round" />
    <path d="M12 11.5C14 10.5 15.5 12.5 13.8 14.5C12.8 13.8 12.2 12.8 12 11.5Z" fill="#f59e0b" stroke="#b45309" strokeWidth="0.75" />
    <path d="M15.5 11L17 9.5" stroke="#b45309" strokeWidth="1" strokeLinecap="round" />
  </svg>
);

/**
 * 2. Eier: Egg with sunny golden-orange yolk
 */
const EggIllustration: React.FC<{ size: number; className?: string }> = ({ size, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
    {/* Egg white / shell silhouette */}
    <path
      d="M12 2C7.5 2 4 6.8 4 12.8C4 17.5 7.6 21.5 12 21.5C16.4 21.5 20 17.5 20 12.8C20 6.8 16.5 2 12 2Z"
      fill="#fffbeb"
      stroke="#f59e0b"
      strokeWidth="1.5"
    />
    {/* Egg yolk center */}
    <circle cx="12" cy="14" r="5" fill="#f59e0b" stroke="#d97706" strokeWidth="1" />
    <circle cx="12" cy="14" r="4.2" fill="#fbbf24" />
    {/* Yolk light reflection */}
    <circle cx="10.5" cy="12.5" r="1.3" fill="#ffffff" fillOpacity="0.85" />
  </svg>
);

/**
 * 3. Milch/Laktose: Classic glass milk bottle with blue cap and label
 */
const MilkIllustration: React.FC<{ size: number; className?: string }> = ({ size, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
    {/* Bottle body */}
    <path
      d="M9 7L7 9.5V20C7 21.1 7.9 22 9 22H15C16.1 22 17 21.1 17 20V9.5L15 7V4H9V7Z"
      fill="#f0f9ff"
      stroke="#0284c7"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
    {/* White milk content */}
    <path d="M7.5 12V20C7.5 20.8 8.2 21.5 9 21.5H15C15.8 21.5 16.5 20.8 16.5 20V12C14.5 11.2 12.5 12.5 10 11.5C8.8 11 8 11.5 7.5 12Z" fill="#ffffff" />
    {/* Blue label strip */}
    <rect x="7" y="14" width="10" height="4" fill="#38bdf8" fillOpacity="0.8" />
    <path d="M10 16H14" stroke="#ffffff" strokeWidth="1.2" strokeLinecap="round" />
    {/* Cap */}
    <rect x="8.5" y="2" width="7" height="2.5" rx="1" fill="#0284c7" />
  </svg>
);

/**
 * 4. Sellerie: Crisp celery stalks with leafy green tops
 */
const CeleryIllustration: React.FC<{ size: number; className?: string }> = ({ size, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
    {/* Left Stalk */}
    <path d="M8 21.5C7.2 21.5 6.5 20.8 6.5 20L7.5 10C7.8 7 9 5 10 3" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" />
    {/* Center Stalk */}
    <path d="M12 22V8C12 6 12 4 12 2" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" />
    {/* Right Stalk */}
    <path d="M16 21.5C16.8 21.5 17.5 20.8 17.5 20L16.5 10C16.2 7 15 5 14 3" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" />
    {/* Leaves on top */}
    <path d="M12 2C10 1 8.5 2.5 10 4C11.5 5 12 3 12 2Z" fill="#4ade80" stroke="#15803d" strokeWidth="0.8" />
    <path d="M12 2C14 1 15.5 2.5 14 4C12.5 5 12 3 12 2Z" fill="#4ade80" stroke="#15803d" strokeWidth="0.8" />
    <path d="M9 5C7.5 4 6.5 5.5 8 7C9.5 7.5 9.5 6 9 5Z" fill="#22c55e" stroke="#15803d" strokeWidth="0.8" />
    <path d="M15 5C16.5 4 17.5 5.5 16 7C14.5 7.5 14.5 6 15 5Z" fill="#22c55e" stroke="#15803d" strokeWidth="0.8" />
    {/* Bottom stalk tie band */}
    <rect x="7" y="17" width="10" height="2.5" rx="1.2" fill="#15803d" />
  </svg>
);

/**
 * 5. Sesamsamen: Warm golden toasted sesame seeds
 */
const SesameIllustration: React.FC<{ size: number; className?: string }> = ({ size, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
    {/* Top seed */}
    <path
      d="M12 2.5C10 6 8.8 8.2 8.8 10C8.8 11.8 10.2 13.2 12 13.2C13.8 13.2 15.2 11.8 15.2 10C15.2 8.2 14 6 12 2.5Z"
      fill="#f59e0b"
      stroke="#b45309"
      strokeWidth="1.2"
    />
    <path d="M11 6.5C10.5 8 10.5 9.5 11 11" stroke="#fef3c7" strokeWidth="0.8" strokeLinecap="round" />
    {/* Bottom Left seed */}
    <path
      d="M6 11.5C4.2 14.5 3.5 16.5 3.5 18C3.5 19.5 4.7 20.8 6.2 20.8C7.8 20.8 9 19.5 9 18C9 16.5 7.8 14.5 6 11.5Z"
      fill="#d97706"
      stroke="#92400e"
      strokeWidth="1.2"
    />
    {/* Bottom Right seed */}
    <path
      d="M18 11.5C16.2 14.5 15 16.5 15 18C15 19.5 16.2 20.8 17.8 20.8C19.3 20.8 20.5 19.5 20.5 18C20.5 16.5 19.8 14.5 18 11.5Z"
      fill="#f59e0b"
      stroke="#b45309"
      strokeWidth="1.2"
    />
  </svg>
);

/**
 * 6. Lupine: Tall flower spike with purple and violet blossoms
 */
const LupinIllustration: React.FC<{ size: number; className?: string }> = ({ size, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
    {/* Stem */}
    <path d="M12 22V5" stroke="#16a34a" strokeWidth="1.8" strokeLinecap="round" />
    {/* Flower petals along spike */}
    <path d="M12 2C10.8 3 10.8 4.5 12 5C13.2 4.5 13.2 3 12 2Z" fill="#c084fc" stroke="#7e22ce" strokeWidth="0.8" />
    <path d="M10 5.5C8 6 8 8 10 8.5C11.5 8.5 11.8 7 12 6C11 5.5 10.5 5.5 10 5.5Z" fill="#a855f7" stroke="#7e22ce" strokeWidth="0.8" />
    <path d="M14 5.5C16 6 16 8 14 8.5C12.5 8.5 12.2 7 12 6C13 5.5 13.5 5.5 14 5.5Z" fill="#c084fc" stroke="#7e22ce" strokeWidth="0.8" />
    <path d="M9.5 9C7 9.8 7.2 12.2 9.8 12.5C11.5 12.5 11.8 10.5 12 9.5C11 9 10 9 9.5 9Z" fill="#9333ea" stroke="#6b21a8" strokeWidth="0.8" />
    <path d="M14.5 9C17 9.8 16.8 12.2 14.2 12.5C12.5 12.5 12.2 10.5 12 9.5C13 9 14 9 14.5 9Z" fill="#a855f7" stroke="#7e22ce" strokeWidth="0.8" />
    <path d="M9 13C6 14 6.5 16.5 9.5 16.8C11.5 16.8 11.8 14.8 12 13.8C11 13 10 13 9 13Z" fill="#9333ea" stroke="#581c87" strokeWidth="0.8" />
    <path d="M15 13C18 14 17.5 16.5 14.5 16.8C12.5 16.8 12.2 14.8 12 13.8C13 13 14 13 15 13Z" fill="#9333ea" stroke="#581c87" strokeWidth="0.8" />
  </svg>
);

/**
 * 7. Krebstiere: Vivid coral-red cooked shrimp / prawn
 */
const ShrimpIllustration: React.FC<{ size: number; className?: string }> = ({ size, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
    {/* Curved body segments */}
    <path
      d="M19 11C20.5 8.5 19.5 5 16 3.5C13 2.2 9 3 7.5 6C6 9 6.5 12.5 9 15C11.5 17.5 15 18 17.5 16C19.5 14.5 18 12.5 16.5 13.5C14.5 15 12 14 10.5 12.5C9 11 9 8.5 10.5 7C12 5.5 15 5.5 16.5 7C17.5 8 18 9.5 19 11Z"
      fill="#ea580c"
      stroke="#c2410c"
      strokeWidth="1.2"
      strokeLinejoin="round"
    />
    {/* Body shell ribs */}
    <path d="M12 4.5C11 6.5 11 8.5 12 10.5" stroke="#fed7aa" strokeWidth="1" strokeLinecap="round" />
    <path d="M15 5C14 7 14 9 15 11" stroke="#fed7aa" strokeWidth="1" strokeLinecap="round" />
    {/* Tail fan */}
    <path d="M17.5 16L21 18.5C21.5 17 21 15 20.5 14.5L17.5 16Z" fill="#f97316" stroke="#c2410c" strokeWidth="1" />
    <path d="M17 16.5L19 20C18 20.5 16.5 19.8 16 19L17 16.5Z" fill="#ea580c" stroke="#c2410c" strokeWidth="1" />
    {/* Eye */}
    <circle cx="8" cy="6" r="1" fill="#1c1917" />
    {/* Antenna */}
    <path d="M7 5C5 4 3 4.5 2 6" stroke="#f97316" strokeWidth="1" strokeLinecap="round" />
  </svg>
);

/**
 * 8. Fisch: Ocean blue fish with silvery belly and fins
 */
const FishIllustration: React.FC<{ size: number; className?: string }> = ({ size, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
    {/* Fish body */}
    <path
      d="M2 12C5 8 10 7 15 8.5C18 9.5 20 11.5 22 12C20 12.5 18 14.5 15 15.5C10 17 5 16 2 12Z"
      fill="#0284c7"
      stroke="#0369a1"
      strokeWidth="1.2"
    />
    {/* Silvery belly */}
    <path
      d="M3.5 12C6 14.5 10 15.5 15 14.5C17.5 14 19 12.8 20.5 12C18 12.2 16.5 13 14 13.5C9.5 14.2 6 13.5 3.5 12Z"
      fill="#bae6fd"
    />
    {/* Tail fin */}
    <path d="M3 12L0.5 8C1.5 10 1.5 14 0.5 16L3 12Z" fill="#0369a1" stroke="#0284c7" strokeWidth="1" />
    {/* Dorsal fin */}
    <path d="M9 7.8C10 5.5 12.5 5.5 13.5 8" fill="#38bdf8" stroke="#0284c7" strokeWidth="1" />
    {/* Eye */}
    <circle cx="18" cy="11" r="1.3" fill="#ffffff" />
    <circle cx="18.3" cy="11" r="0.75" fill="#0f172a" />
    {/* Gill line */}
    <path d="M15 10C14.5 11 14.5 13 15 14" stroke="#0369a1" strokeWidth="1" strokeLinecap="round" />
  </svg>
);

/**
 * 9. Sojabohnen: Fresh green edamame pod with visible round beans
 */
const SoyIllustration: React.FC<{ size: number; className?: string }> = ({ size, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
    {/* Pod background */}
    <path
      d="M3 18C4 16 6 16.5 7.5 17C10.5 18 14 17 17.5 14.5C20.5 12 21.5 8.5 22 5C19 6 15.5 7.5 12.5 10C9.5 12.5 6.5 14 3 18Z"
      fill="#4d7c0f"
      stroke="#365314"
      strokeWidth="1.2"
    />
    {/* Three plump beans */}
    <circle cx="7.5" cy="15.5" r="2.3" fill="#84cc16" stroke="#4d7c0f" strokeWidth="0.8" />
    <circle cx="12" cy="12" r="2.5" fill="#a3e635" stroke="#4d7c0f" strokeWidth="0.8" />
    <circle cx="16.5" cy="8.5" r="2.3" fill="#84cc16" stroke="#4d7c0f" strokeWidth="0.8" />
    {/* Pod stem */}
    <path d="M22 5C22.8 4 23.5 3.5 24 3" stroke="#365314" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

/**
 * 10. Schalenfrüchte: Tree nut / hazelnut with brown shell and textured cap
 */
const TreeNutIllustration: React.FC<{ size: number; className?: string }> = ({ size, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
    {/* Nut body */}
    <path
      d="M5.5 10C5.5 16 10 21 12 22C14 21 18.5 16 18.5 10C18.5 8.5 18 8 17 8H7C6 8 5.5 8.5 5.5 10Z"
      fill="#b45309"
      stroke="#78350f"
      strokeWidth="1.5"
    />
    {/* Nut highlight */}
    <path d="M8 11C8 14 9.5 17.5 10.5 19" stroke="#f59e0b" strokeWidth="1" strokeLinecap="round" />
    {/* Nut cap */}
    <path
      d="M4.5 9C4.5 5 7.5 3 12 3C16.5 3 19.5 5 19.5 9C19.5 9.8 17 9.5 12 9.5C7 9.5 4.5 9.8 4.5 9Z"
      fill="#78350f"
      stroke="#451a03"
      strokeWidth="1.2"
    />
    {/* Cap texture crosshatch */}
    <path d="M8 4L11 9M12 3.5L15 9M16 4L18 8.5" stroke="#92400e" strokeWidth="0.8" />
    {/* Little stem */}
    <path d="M12 3V1.2" stroke="#451a03" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

/**
 * 11. Senf: Yellow mustard condiment jar with red lid and label
 */
const MustardIllustration: React.FC<{ size: number; className?: string }> = ({ size, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
    {/* Jar body */}
    <path
      d="M7 8H17L18 19C18 20.5 16.8 21.5 15.5 21.5H8.5C7.2 21.5 6 20.5 6 19L7 8Z"
      fill="#fde047"
      stroke="#ca8a04"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
    {/* Mustard contents highlight */}
    <path d="M8.5 11C8 14 8 17 8.5 19.5" stroke="#fef08a" strokeWidth="1" strokeLinecap="round" />
    {/* Red label */}
    <rect x="7.5" y="12.5" width="9" height="5" rx="1" fill="#dc2626" />
    <path d="M9.5 15H14.5" stroke="#ffffff" strokeWidth="1.2" strokeLinecap="round" />
    {/* Jar neck & lid */}
    <rect x="8" y="5.5" width="8" height="2.5" fill="#fef08a" stroke="#ca8a04" strokeWidth="1" />
    <rect x="7" y="3" width="10" height="3" rx="1" fill="#b91c1c" stroke="#991b1b" strokeWidth="1" />
  </svg>
);

/**
 * 12. Sulphite: Elegant wine glass with glowing ruby-red wine
 */
const WineIllustration: React.FC<{ size: number; className?: string }> = ({ size, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
    {/* Wine glass bowl */}
    <path
      d="M6 3H18V10C18 13.5 15.3 16 12 16C8.7 16 6 13.5 6 10V3Z"
      fill="#f8fafc"
      fillOpacity="0.4"
      stroke="#94a3b8"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
    {/* Red wine inside */}
    <path
      d="M6.8 8C8 7.5 16 7.5 17.2 8V10C17.2 13 14.8 15.2 12 15.2C9.2 15.2 6.8 13 6.8 10V8Z"
      fill="#be123c"
    />
    <path d="M7.5 8C10 7.2 14 7.2 16.5 8" stroke="#fb7185" strokeWidth="1" strokeLinecap="round" />
    {/* Stem & base */}
    <path d="M12 16V21.5" stroke="#94a3b8" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M8 21.5H16" stroke="#94a3b8" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

/**
 * 13. Weichtiere: Pearlescent violet/blue bivalve scallop seashell
 */
const ShellIllustration: React.FC<{ size: number; className?: string }> = ({ size, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
    {/* Shell fan body */}
    <path
      d="M12 21C6 21 3 16 3 11C3 6.5 7 3 12 3C17 3 21 6.5 21 11C21 16 18 21 12 21Z"
      fill="#818cf8"
      stroke="#4f46e5"
      strokeWidth="1.5"
    />
    {/* Radial shell ribs */}
    <path d="M12 21L12 3.5" stroke="#3730a3" strokeWidth="1.2" />
    <path d="M12 21L7 5" stroke="#3730a3" strokeWidth="1.1" />
    <path d="M12 21L17 5" stroke="#3730a3" strokeWidth="1.1" />
    <path d="M12 21L4.5 9" stroke="#3730a3" strokeWidth="1" />
    <path d="M12 21L19.5 9" stroke="#3730a3" strokeWidth="1" />
    {/* Shell base hinge */}
    <path d="M9 20H15L14 22H10L9 20Z" fill="#4338ca" />
  </svg>
);

/**
 * 14. Erdnüsse: Figure-8 double-lobed roasted peanut shell with waffle texture
 */
const PeanutIllustration: React.FC<{ size: number; className?: string }> = ({ size, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
    {/* Peanut silhouette */}
    <path
      d="M8.5 4.5C6.5 6 6 8.5 7.5 10.8C8.5 12 8.5 12.5 7.5 13.8C6 16 6.5 18.5 8.5 20C11 21.5 14.5 21 16 19C17.5 17 17 14.8 15.8 13.5C14.8 12.5 14.8 12 15.8 10.8C17.2 8.8 17 6.5 15.2 4.8C13.2 3.2 10.5 3.2 8.5 4.5Z"
      fill="#d97706"
      stroke="#92400e"
      strokeWidth="1.5"
    />
    {/* Waist contour */}
    <path d="M8 12.2C10 13 13.5 13 15.5 12.2" stroke="#b45309" strokeWidth="1" />
    {/* Texture indents */}
    <path d="M10 7H13.5M9.5 9H14M10 16H14M9.5 18H13.5" stroke="#b45309" strokeWidth="0.9" strokeLinecap="round" />
    <path d="M11.8 5.5V10M11.8 14.5V19.5" stroke="#f59e0b" strokeWidth="0.9" strokeLinecap="round" />
  </svg>
);

/**
 * 15. Kiwi: Fresh kiwi cross-section with fuzzy brown skin, emerald flesh and black seeds
 */
const KiwiIllustration: React.FC<{ size: number; className?: string }> = ({ size, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
    {/* Outer fuzzy brown skin */}
    <circle cx="12" cy="12" r="10" fill="#78350f" stroke="#451a03" strokeWidth="1.2" />
    {/* Green juicy fruit flesh */}
    <circle cx="12" cy="12" r="8.8" fill="#10b981" />
    {/* Lighter inner halo */}
    <circle cx="12" cy="12" r="5" fill="#34d399" />
    {/* Creamy white central core */}
    <ellipse cx="12" cy="12" rx="2.8" ry="1.9" fill="#fef9c3" stroke="#d1fae5" strokeWidth="0.75" />
    {/* Radiating tiny black kiwi seeds */}
    <circle cx="12" cy="7" r="0.8" fill="#0f172a" />
    <circle cx="12" cy="17" r="0.8" fill="#0f172a" />
    <circle cx="7" cy="12" r="0.8" fill="#0f172a" />
    <circle cx="17" cy="12" r="0.8" fill="#0f172a" />
    <circle cx="8.5" cy="8.5" r="0.8" fill="#0f172a" />
    <circle cx="15.5" cy="8.5" r="0.8" fill="#0f172a" />
    <circle cx="8.5" cy="15.5" r="0.8" fill="#0f172a" />
    <circle cx="15.5" cy="15.5" r="0.8" fill="#0f172a" />
  </svg>
);

/**
 * Default / Custom allergen icon
 */
const DefaultTagIllustration: React.FC<{ size: number; className?: string }> = ({ size, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
    <path
      d="M20.6 13L13 20.6C12.4 21.2 11.4 21.2 10.8 20.6L3.4 13.2C3.1 12.9 3 12.5 3 12V4C3 3.4 3.4 3 4 3H12C12.5 3 12.9 3.1 13.2 3.4L20.6 10.8C21.2 11.4 21.2 12.4 20.6 13Z"
      fill="#6366f1"
      stroke="#4338ca"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
    <circle cx="7.5" cy="7.5" r="1.5" fill="#ffffff" />
  </svg>
);

export const AllergenIcon: React.FC<AllergenIconProps> = ({ allergenKey, size = 18, className }) => {
  const norm = (allergenKey || '').toLowerCase().trim();

  switch (norm) {
    case 'gluten':
      return <WheatIllustration size={size} className={className} />;
    case 'eier':
      return <EggIllustration size={size} className={className} />;
    case 'laktose':
      return <MilkIllustration size={size} className={className} />;
    case 'sellerie':
      return <CeleryIllustration size={size} className={className} />;
    case 'sesamsamen':
      return <SesameIllustration size={size} className={className} />;
    case 'lupine':
      return <LupinIllustration size={size} className={className} />;
    case 'krebstiere':
      return <ShrimpIllustration size={size} className={className} />;
    case 'fisch':
      return <FishIllustration size={size} className={className} />;
    case 'sojabohnen':
      return <SoyIllustration size={size} className={className} />;
    case 'schalenfruechte':
      return <TreeNutIllustration size={size} className={className} />;
    case 'senf':
      return <MustardIllustration size={size} className={className} />;
    case 'sulfite':
      return <WineIllustration size={size} className={className} />;
    case 'weichtiere':
      return <ShellIllustration size={size} className={className} />;
    case 'erdnuesse':
      return <PeanutIllustration size={size} className={className} />;
    case 'kiwi':
      return <KiwiIllustration size={size} className={className} />;
    default:
      return <DefaultTagIllustration size={size} className={className} />;
  }
};
