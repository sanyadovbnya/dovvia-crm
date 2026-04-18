/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#FEF6EC',
          100: '#FCE7C7',
          200: '#F9CE8F',
          300: '#F3B257',
          400: '#EFA03E',
          500: '#E8952E',
          600: '#C9791F',
          700: '#9F5E18',
          800: '#734411',
          900: '#4A2B0B',
        },
        surface: {
          page:  '#F5F7FB',
          card:  '#FFFFFF',
          muted: '#EEF1F7',
        },
        ink: {
          strong: '#0F172A',
          base:   '#334155',
          muted:  '#64748B',
          faint:  '#94A3B8',
        },
        pastel: {
          mint:      '#D1FAE5',
          mintDeep:  '#047857',
          coral:     '#FEE2E2',
          coralDeep: '#B91C1C',
          lavender:  '#E0E7FF',
          lavDeep:   '#4338CA',
          peach:     '#FFEDD5',
          peachDeep: '#C2410C',
          sky:       '#DBEAFE',
          skyDeep:   '#1D4ED8',
        },
      },
      boxShadow: {
        card:  '0 1px 2px rgba(15,23,42,0.04), 0 4px 16px rgba(15,23,42,0.04)',
        float: '0 8px 24px rgba(15,23,42,0.08), 0 2px 6px rgba(15,23,42,0.04)',
        pop:   '0 24px 56px rgba(15,23,42,0.16)',
      },
      borderRadius: {
        xl2: '1.25rem',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        fadeIn:  { '0%': { opacity: 0, transform: 'translateY(8px)' }, '100%': { opacity: 1, transform: 'translateY(0)' } },
        slideIn: { '0%': { transform: 'translateX(100%)' }, '100%': { transform: 'translateX(0)' } },
      },
      animation: {
        'fade-in':  'fadeIn .25s ease',
        'slide-in': 'slideIn .25s ease',
      },
    },
  },
  plugins: [],
}
