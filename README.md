# Dovvia CRM

Call dashboard for Max — the AI receptionist for Mike's Repair Shop.
Connects directly to Vapi and shows all call data in real time.

## Quick Start

```bash
npm install
npm run dev
```

Then open http://localhost:5173 and enter your Vapi API key.

## Build for production

```bash
npm run build
npm run preview
```

## Project Structure

```
src/
├── api/
│   └── vapi.js          # All Vapi API calls
├── components/
│   ├── App.jsx           # Main app shell
│   ├── SetupScreen.jsx   # API key onboarding
│   ├── CallRow.jsx       # Single row in call list
│   ├── CallDetail.jsx    # Slide-out detail panel
│   ├── StatCard.jsx      # Stats at top of dashboard
│   ├── Badges.jsx        # Status / appointment badges
│   └── Icons.jsx         # SVG icon components
└── utils/
    └── formatters.js     # Date, duration, transcript helpers
```
