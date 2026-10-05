/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        obsidian: {
          bg: '#0B0F19',        // Primary canvas background
          panel: '#1A2332',     // Glassmorphic panel surface
          border: '#273549',    // Refined slate-obsidian border
          hover: '#222F42',     // Hover state for interactive items
          subtle: '#121824',    // Darker inlay background
        },
        cyan: {
          neon: '#00F0FF',      // Neon Cyan for map boundaries and geofence perimeters
          glow: 'rgba(0, 240, 255, 0.25)',
        },
        amber: {
          electric: '#FFB800',  // Electric Amber for active bus radar markers
          300: '#FCD34D',
          400: '#FFB800',
          500: '#F59E0B',
          600: '#D97706',
          700: '#B45309',
        },
        slate: {
          950: '#0B0F19',
          900: '#111726',
          850: '#161F30',
          800: '#1A2332',
          700: '#2E3D52',
          600: '#475569',
          500: '#64748B',
          400: '#94A3B8',
          300: '#CBD5E1',
          200: '#E2E8F0',
          100: '#F1F5F9',
        },
        emerald: {
          400: '#34D399',
          500: '#10B981',
          600: '#059669',
        },
        sky: {
          400: '#38BDF8',
          500: '#0EA5E9',
        },
        rose: {
          400: '#FB7185',
          500: '#F43F5E',
          600: '#E11D48',
        },
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      boxShadow: {
        'glass': '0 12px 36px 0 rgba(0, 0, 0, 0.65)',
        'cyan-glow': '0 0 25px -2px rgba(0, 240, 255, 0.45)',
        'amber-glow': '0 0 25px -2px rgba(255, 184, 0, 0.5)',
        'emerald-glow': '0 0 20px -3px rgba(16, 185, 129, 0.35)',
      },
      animation: {
        'radar-slow': 'radarWave 2.8s cubic-bezier(0, 0.2, 0.8, 1) infinite',
        'radar-delay': 'radarWave 2.8s cubic-bezier(0, 0.2, 0.8, 1) 1.4s infinite',
        'pulse-subtle': 'pulseSubtle 2.5s ease-in-out infinite',
      },
      keyframes: {
        radarWave: {
          '0%': { transform: 'scale(0.5)', opacity: '0.9' },
          '70%': { opacity: '0.35' },
          '100%': { transform: 'scale(2.6)', opacity: '0' },
        },
        pulseSubtle: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
      },
    },
  },
  plugins: [],
};
