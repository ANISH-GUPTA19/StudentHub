import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { FluentProvider, createLightTheme, type BrandVariants } from '@fluentui/react-components'
import './index.css'
import App from './App.tsx'

const brandRamp: BrandVariants = {
  10: '#032420',
  20: '#043832',
  30: '#054D45',
  40: '#066359',
  50: '#087F73',
  60: '#0A9688',
  70: '#14AB9C',
  80: '#2BBBAE',
  90: '#54CBBF',
  100: '#7FD9D0',
  110: '#A5E5DF',
  120: '#C4EFEA',
  130: '#DDF5EF',
  140: '#EAF9F5',
  150: '#F4FCF9',
  160: '#FFFFFF',
}

const lightTheme = {
  ...createLightTheme(brandRamp),
  fontFamilyBase: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  borderRadiusMedium: '10px',
  borderRadiusLarge: '14px',
  colorNeutralBackground1: '#FFFFFF',
  colorNeutralBackground2: '#F8FAFC',
  colorNeutralBackground3: '#F1F5F9',
  colorNeutralForeground1: '#14213D',
  colorNeutralForeground2: '#475569',
  colorNeutralForeground3: '#64748B',
  colorNeutralStroke1: '#E2E8F0',
  colorNeutralStroke2: '#CBD5E1',
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FluentProvider theme={lightTheme}>
      <App />
    </FluentProvider>
  </StrictMode>,
)
