/** Icons: lucide-react plus a few drawn for the Sundarbans themes. */
import { forwardRef, type SVGProps } from "react";

export {
  Camera, ImagePlus, Mic, MicOff, SendHorizontal, BotMessageSquare, Brain, KeyRound, CircleHelp, LoaderCircle, CircleCheck, CircleX, CircleAlert, Expand, Shrink, Lightbulb, MessagesSquare,
  Activity, Anchor, ArrowDown, Database, HardDrive, Box, Play, Pause, Volume2, VolumeX, Siren, Phone, Timer, Hourglass, ListOrdered, Shuffle, Repeat,
  CalendarClock, Waypoints, MapPinned, Navigation2, Share, Rotate3d, Layers3, Hospital, LifeBuoy, ArrowRightLeft, Flag, House, Clock3, SkipForward, CircleStop, Radio, PhoneCall, Hospital as HospitalIcon, Milestone, ArrowLeftRight, ArrowUp, BarChart3, Bird, Bookmark, BoxSelect, Building2, Calendar, Check, ChevronDown, ChevronLeft,
  ChevronRight, ChevronUp, CircleDot, Clock, Cloud, CloudFog, CloudLightning, CloudOff, CloudRain, CloudSun, Columns2, Compass, Copy, Crosshair,
  Download, Droplets, ExternalLink, Eye, EyeOff, FileDown, FileJson, FileSpreadsheet, FileText, FileType, Filter, Fish, Flame, Flower2, Footprints,
  Gauge, Globe, GripVertical, Hexagon, Home, Image, Info, Landmark, Layers, Leaf, LineChart, Locate, LocateFixed, Map, MapPin, Maximize, Menu,
  Minimize, Minus, Moon, Mountain, MousePointerClick, Navigation, Network, NotebookPen, Palette, PawPrint, PieChart, Plus, Printer, RefreshCw,
  RotateCcw, Route, Ruler, Sailboat, Satellite, Save, Scale, ScatterChart, Search, Settings2, Share2, Shell, ShieldCheck, Ship, Sigma,
  SlidersHorizontal, Snowflake, Sparkles, Sprout, Square, Star, StickyNote, Sun, Sunrise, Sunset, Table, Target, Thermometer, Trash2, TreePine,
  Trees, TrendingDown, TrendingUp, Umbrella, Undo2, Users, Waves, Wifi, Wind, X,
} from "lucide-react";

type P = SVGProps<SVGSVGElement> & { size?: number | string };
const base = (size: number | string = 24) => ({
  width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
});

/** Mud crab, in the lucide line style. */
export const Crab = forwardRef<SVGSVGElement, P>(function Crab({ size = 24, ...p }, ref) {
  return (
    <svg ref={ref} {...base(size)} {...p} aria-hidden="true">
      <ellipse cx="12" cy="14" rx="5.5" ry="3.8" />
      <path d="M8 11.2 6.5 8.5M16 11.2l1.5-2.7" />
      <path d="M6.5 8.5C4 8.4 2.8 6.6 3.4 4.4c.9 1 2.4 1.2 3.4.4M17.5 8.5c2.5-.1 3.7-1.9 3.1-4.1-.9 1-2.4 1.2-3.4.4" />
      <path d="M6.6 14.5 3 13.5M6.9 16.4 3.6 18M17.4 14.5l3.6-1M17.1 16.4l3.3 1.6" />
      <circle cx="10.2" cy="12.6" r=".6" fill="currentColor" /><circle cx="13.8" cy="12.6" r=".6" fill="currentColor" />
    </svg>
  );
});
