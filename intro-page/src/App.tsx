import { useEffect, useState } from 'react'
import Nav from './components/Nav'
import Hero from './components/Hero'
import PainPoints from './components/PainPoints'
import Workflow from './components/Workflow'
import Features from './components/Features'
import QuickStart from './components/QuickStart'
import Comparison from './components/Comparison'
import Audience from './components/Audience'
import Footer from './components/Footer'

// 固定设计宽度：页面按此宽度设计，随窗口等比缩放，文字与框块一起缩放、不换行、不折叠。
const DESIGN_WIDTH = 1280

export default function App() {
  const [zoom, setZoom] = useState(1)

  useEffect(() => {
    const update = () => setZoom(window.innerWidth / DESIGN_WIDTH)
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  return (
    <div style={{ zoom }}>
      <div className="min-h-screen bg-base text-text-primary font-sans antialiased">
        <Nav />
        <main>
          <Hero />
          <PainPoints />
          <Workflow />
          <Features />
          <QuickStart />
          <Comparison />
          <Audience />
        </main>
        <Footer />
      </div>
    </div>
  )
}
