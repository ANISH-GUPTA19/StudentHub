import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { FluentProvider, createDarkTheme, type BrandVariants } from '@fluentui/react-components'
import './index.css'
import App from './App.tsx'

const brandRamp: BrandVariants = {
  10: '#101F38', 20: '#173E73', 30: '#1C4B86', 40: '#255996', 50: '#2E67A5',
  60: '#3975B4', 70: '#4D85C0', 80: '#6596CC', 90: '#7EA8D7', 100: '#98BAE2',
  110: '#B1CBEA', 120: '#CADCF2', 130: '#DEEAFA', 140: '#EDF4FD', 150: '#F5F9FE', 160: '#FFFFFF'
}

const darkTheme = createDarkTheme(brandRamp)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FluentProvider theme={darkTheme}>
      <App />
    </FluentProvider>
  </StrictMode>,
)
