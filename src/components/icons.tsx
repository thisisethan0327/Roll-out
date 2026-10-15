// Lucide icons pre-sized to the surrounding text (size="1em").
//
// Import from here instead of 'lucide-react' so every inline icon renders
// at the font-size of the text it sits in (the size of the glyph it
// replaced), never lucide's 24px default. Pass `size` to override.
// The global `.lucide` rule in globals.css puts them on the text baseline.
import {
  ArrowDown as LArrowDown,
  ArrowLeft as LArrowLeft,
  ArrowLeftRight as LArrowLeftRight,
  ArrowRight as LArrowRight,
  ArrowUp as LArrowUp,
  ArrowUpRight as LArrowUpRight,
  Check as LCheck,
  ChevronDown as LChevronDown,
  ChevronLeft as LChevronLeft,
  ChevronRight as LChevronRight,
  Circle as LCircle,
  CircleDashed as LCircleDashed,
  CircleDot as LCircleDot,
  Columns2 as LColumns2,
  Contrast as LContrast,
  Diamond as LDiamond,
  Flag as LFlag,
  Heart as LHeart,
  Lock as LLock,
  MapPin as LMapPin,
  MessageCircle as LMessageCircle,
  Moon as LMoon,
  Pencil as LPencil,
  RotateCw as LRotateCw,
  Scissors as LScissors,
  Sparkle as LSparkle,
  Star as LStar,
  Sun as LSun,
  TriangleAlert as LTriangleAlert,
  Undo2 as LUndo2,
  Waves as LWaves,
  X as LX,
  type LucideIcon,
  type LucideProps,
} from 'lucide-react';

export type IconProps = LucideProps;
export type IconComponent = (props: IconProps) => React.JSX.Element;

function sized(Icon: LucideIcon, name: string): IconComponent {
  const C = (props: IconProps) => <Icon size="1em" aria-hidden="true" {...props} />;
  C.displayName = name;
  return C;
}

export const ArrowDown = sized(LArrowDown, 'ArrowDown');
export const ArrowLeft = sized(LArrowLeft, 'ArrowLeft');
export const ArrowLeftRight = sized(LArrowLeftRight, 'ArrowLeftRight');
export const ArrowRight = sized(LArrowRight, 'ArrowRight');
export const ArrowUp = sized(LArrowUp, 'ArrowUp');
export const ArrowUpRight = sized(LArrowUpRight, 'ArrowUpRight');
export const Check = sized(LCheck, 'Check');
export const ChevronDown = sized(LChevronDown, 'ChevronDown');
export const ChevronLeft = sized(LChevronLeft, 'ChevronLeft');
export const ChevronRight = sized(LChevronRight, 'ChevronRight');
export const Circle = sized(LCircle, 'Circle');
export const CircleDashed = sized(LCircleDashed, 'CircleDashed');
export const CircleDot = sized(LCircleDot, 'CircleDot');
export const Columns2 = sized(LColumns2, 'Columns2');
export const Contrast = sized(LContrast, 'Contrast');
export const Diamond = sized(LDiamond, 'Diamond');
export const Flag = sized(LFlag, 'Flag');
export const Heart = sized(LHeart, 'Heart');
export const Lock = sized(LLock, 'Lock');
export const MapPin = sized(LMapPin, 'MapPin');
export const MessageCircle = sized(LMessageCircle, 'MessageCircle');
export const Moon = sized(LMoon, 'Moon');
export const Pencil = sized(LPencil, 'Pencil');
export const RotateCw = sized(LRotateCw, 'RotateCw');
export const Scissors = sized(LScissors, 'Scissors');
export const Sparkle = sized(LSparkle, 'Sparkle');
export const Star = sized(LStar, 'Star');
export const Sun = sized(LSun, 'Sun');
export const TriangleAlert = sized(LTriangleAlert, 'TriangleAlert');
export const Undo2 = sized(LUndo2, 'Undo2');
export const Waves = sized(LWaves, 'Waves');
export const X = sized(LX, 'X');

/** Filled status dot (replaces ●). A bullet glyph is smaller than a capital,
 *  so the disc is drawn at 0.6em to match it. */
export function Dot(props: IconProps) {
  return (
    <LCircle
      size="0.65em"
      fill="currentColor"
      strokeWidth={0}
      aria-hidden="true"
      {...props}
      style={{ verticalAlign: '0.05em', ...props.style }}
    />
  );
}

/** Five-star rating row (replaces '★★★☆☆'). */
export function Stars({ rating, max = 5 }: { rating: number; max?: number }) {
  const r = Math.max(0, Math.min(max, Math.round(rating)));
  return (
    <span className="icon-stars" role="img" aria-label={`${r} out of ${max} stars`}>
      {Array.from({ length: max }, (_, i) => (
        <LStar key={i} size="1em" aria-hidden="true" fill={i < r ? 'currentColor' : 'none'} />
      ))}
    </span>
  );
}
