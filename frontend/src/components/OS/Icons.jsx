import React from 'react';

// Common SVG Properties for consistent styling
const iconProps = {
  viewBox: "0 0 48 48",
  className: "w-full h-full drop-shadow-md",
};

export const AppWindowIcon = ({ className }) => (
  <svg {...iconProps} className={className || iconProps.className} fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="4" y="8" width="40" height="32" rx="4" fill="url(#paint0_linear_bg)" />
    <path d="M4 12C4 9.79086 5.79086 8 8 8H40C42.2091 8 44 9.79086 44 12V16H4V12Z" fill="url(#paint1_linear_top)" />
    <circle cx="10" cy="12" r="1.5" fill="#EF4444" />
    <circle cx="15" cy="12" r="1.5" fill="#F59E0B" />
    <circle cx="20" cy="12" r="1.5" fill="#10B981" />
    <defs>
      <linearGradient id="paint0_linear_bg" x1="24" y1="8" x2="24" y2="40" gradientUnits="userSpaceOnUse">
        <stop stopColor="#F9FAFB" />
        <stop offset="1" stopColor="#F3F4F6" />
      </linearGradient>
      <linearGradient id="paint1_linear_top" x1="24" y1="8" x2="24" y2="16" gradientUnits="userSpaceOnUse">
        <stop stopColor="#E5E7EB" />
        <stop offset="1" stopColor="#D1D5DB" />
      </linearGradient>
    </defs>
  </svg>
);

export const FolderIcon = ({ className }) => (
  <svg {...iconProps} className={className || iconProps.className} fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Back flap */}
    <path d="M4.5 14C4.5 11.7909 6.29086 10 8.5 10H17.5C18.6729 10 19.7828 10.5197 20.528 11.4111L22.972 14.3389C23.3446 14.7845 23.8996 15.0333 24.4828 15.0333H39.5C41.7091 15.0333 43.5 16.8242 43.5 19.0333V34.5C43.5 36.7091 41.7091 38.5 39.5 38.5H8.5C6.29086 38.5 4.5 36.7091 4.5 34.5V14Z" fill="url(#folder_back)" />
    {/* Front flap giving 3D effect */}
    <path d="M4 22C4 19.7909 5.79086 18 8 18H40C42.2091 18 44 19.7909 44 22V35C44 37.2091 42.2091 39 40 39H8C5.79086 39 4 37.2091 4 35V22Z" fill="url(#folder_front)" />
    <defs>
      <linearGradient id="folder_back" x1="24" y1="10" x2="24" y2="38.5" gradientUnits="userSpaceOnUse">
        <stop stopColor="#FBBF24" />
        <stop offset="1" stopColor="#F59E0B" />
      </linearGradient>
      <linearGradient id="folder_front" x1="24" y1="18" x2="24" y2="39" gradientUnits="userSpaceOnUse">
        <stop stopColor="#FCD34D" />
        <stop offset="1" stopColor="#F59E0B" />
      </linearGradient>
    </defs>
  </svg>
);

export const TerminalIcon = ({ className }) => (
  <svg {...iconProps} className={className || iconProps.className} fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="4" y="8" width="40" height="32" rx="4" fill="#1F2937" />
    <path d="M4 12C4 9.79086 5.79086 8 8 8H40C42.2091 8 44 9.79086 44 12V16H4V12Z" fill="#374151" />
    <path d="M12 22L16 26L12 30" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M20 30H28" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" />
  </svg>
);

export const SettingsIcon = ({ className }) => (
  <svg {...iconProps} className={className || iconProps.className} fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="24" cy="24" r="18" fill="url(#gear_base)" />
    <path fillRule="evenodd" clipRule="evenodd" d="M24 30C27.3137 30 30 27.3137 30 24C30 20.6863 27.3137 18 24 18C20.6863 18 18 20.6863 18 24C18 27.3137 20.6863 30 24 30ZM24 28C26.2091 28 28 26.2091 28 24C28 21.7909 26.2091 20 24 20C21.7909 20 20 21.7909 20 24C20 26.2091 21.7909 28 24 28Z" fill="#374151" />
    {/* Cog teeth */}
    <path d="M24 6V11" stroke="#4B5563" strokeWidth="4" strokeLinecap="round" />
    <path d="M24 37V42" stroke="#4B5563" strokeWidth="4" strokeLinecap="round" />
    <path d="M6 24H11" stroke="#4B5563" strokeWidth="4" strokeLinecap="round" />
    <path d="M37 24H42" stroke="#4B5563" strokeWidth="4" strokeLinecap="round" />
    <path d="M11.272 11.2721L14.8075 14.8076" stroke="#4B5563" strokeWidth="4" strokeLinecap="round" />
    <path d="M33.1925 33.1924L36.728 36.7279" stroke="#4B5563" strokeWidth="4" strokeLinecap="round" />
    <path d="M11.272 36.7279L14.8075 33.1924" stroke="#4B5563" strokeWidth="4" strokeLinecap="round" />
    <path d="M33.1925 14.8076L36.728 11.2721" stroke="#4B5563" strokeWidth="4" strokeLinecap="round" />
    <defs>
      <linearGradient id="gear_base" x1="24" y1="6" x2="24" y2="42" gradientUnits="userSpaceOnUse">
        <stop stopColor="#9CA3AF" />
        <stop offset="1" stopColor="#6B7280" />
      </linearGradient>
    </defs>
  </svg>
);

export const CpuIcon = ({ className }) => (
  <svg {...iconProps} className={className || iconProps.className} fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="8" y="8" width="32" height="32" rx="4" fill="url(#cpu_bg)" stroke="#1E40AF" strokeWidth="2" />
    <rect x="14" y="14" width="20" height="20" rx="2" fill="#1E3A8A" />
    {/* Pins */}
    <path d="M14 6V8M20 6V8M24 6V8M28 6V8M34 6V8" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" />
    <path d="M14 40V42M20 40V42M24 40V42M28 40V42M34 40V42" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" />
    <path d="M6 14H8M6 20H8M6 24H8M6 28H8M6 34H8" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" />
    <path d="M40 14H42M40 20H42M40 24H42M40 28H42M40 34H42" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" />
    <defs>
      <linearGradient id="cpu_bg" x1="24" y1="8" x2="24" y2="40" gradientUnits="userSpaceOnUse">
        <stop stopColor="#3B82F6" />
        <stop offset="1" stopColor="#2563EB" />
      </linearGradient>
    </defs>
  </svg>
);

export const HardDriveIcon = ({ className }) => (
  <svg {...iconProps} className={className || iconProps.className} fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="8" y="10" width="32" height="28" rx="4" fill="url(#hdd_bg)" />
    <rect x="10" y="12" width="28" height="24" rx="2" fill="#E5E7EB" />
    <circle cx="24" cy="24" r="8" fill="url(#hdd_platter)" />
    <circle cx="24" cy="24" r="3" fill="#9CA3AF" />
    <path d="M30 32C30 32 30 28 27 26.5" stroke="#374151" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="14" cy="32" r="1.5" fill="#374151" />
    <circle cx="14" cy="16" r="1.5" fill="#374151" />
    <circle cx="34" cy="32" r="1.5" fill="#374151" />
    <circle cx="34" cy="16" r="1.5" fill="#374151" />
    <defs>
      <linearGradient id="hdd_bg" x1="24" y1="10" x2="24" y2="38" gradientUnits="userSpaceOnUse">
        <stop stopColor="#D1D5DB" />
        <stop offset="1" stopColor="#9CA3AF" />
      </linearGradient>
      <linearGradient id="hdd_platter" x1="24" y1="16" x2="24" y2="32" gradientUnits="userSpaceOnUse">
        <stop stopColor="#F3F4F6" />
        <stop offset="1" stopColor="#D1D5DB" />
      </linearGradient>
    </defs>
  </svg>
);

export const PlayIcon = ({ className }) => (
  <svg {...iconProps} className={className || iconProps.className} fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="24" cy="24" r="20" fill="url(#play_bg)" />
    <path d="M32.5 22.268C33.8333 23.0378 33.8333 24.9623 32.5 25.7321L19.75 33.0933C18.4167 33.8631 16.75 32.9009 16.75 31.3612V16.6388C16.75 15.0991 18.4167 14.1369 19.75 14.9067L32.5 22.268Z" fill="white" />
    <defs>
      <linearGradient id="play_bg" x1="24" y1="4" x2="24" y2="44" gradientUnits="userSpaceOnUse">
        <stop stopColor="#34D399" />
        <stop offset="1" stopColor="#10B981" />
      </linearGradient>
    </defs>
  </svg>
);

export const BoxesIcon = ({ className }) => (
  <svg {...iconProps} className={className || iconProps.className} fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M24 6L10 14V30L24 38L38 30V14L24 6Z" fill="url(#box_bg)" />
    <path d="M24 22L10 14M24 22L38 14M24 22V38" stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M24 6L17 10L31 18L38 14L24 6Z" fill="rgba(255,255,255,0.5)" />
    <defs>
      <linearGradient id="box_bg" x1="24" y1="6" x2="24" y2="38" gradientUnits="userSpaceOnUse">
        <stop stopColor="#FBBF24" />
        <stop offset="1" stopColor="#D97706" />
      </linearGradient>
    </defs>
  </svg>
);

export const Windows11Icon = ({ className }) => (
  <svg {...iconProps} className={className || iconProps.className} fill="none" viewBox="0 0 88 88" xmlns="http://www.w3.org/2000/svg">
    <path fill="#0078D4" d="M0 0l39.9 0 0 39.9 -39.9 0 0 -39.9z" />
    <path fill="#0078D4" d="M44.1 0l39.9 0 0 39.9 -39.9 0 0 -39.9z" />
    <path fill="#0078D4" d="M0 44.1l39.9 0 0 39.9 -39.9 0 0 -39.9z" />
    <path fill="#0078D4" d="M44.1 44.1l39.9 0 0 39.9 -39.9 0 0 -39.9z" />
  </svg>
);

// Map components directly
export const WinIconMap = {
  Terminal: TerminalIcon,
  Folder: FolderIcon,
  Settings: SettingsIcon,
  AppWindow: AppWindowIcon,
  Play: PlayIcon,
  Boxes: BoxesIcon,
  Cpu: CpuIcon,
  HardDrive: HardDriveIcon,
};
