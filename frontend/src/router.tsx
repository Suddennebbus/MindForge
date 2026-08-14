import { createBrowserRouter } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { Home } from '@/pages/Home'
import { Login } from '@/pages/Login'
import { ChangePassword } from '@/pages/ChangePassword'
import { WikiList } from '@/pages/WikiList'
import { WikiPage } from '@/pages/WikiPage'
import { RawFiles } from '@/pages/RawFiles'
import { RawDetail } from '@/pages/RawDetail'
import { PreRawFiles } from '@/pages/PreRawFiles'
import { PreRawDetail } from '@/pages/PreRawDetail'
import { ReaderPage } from '@/pages/ReaderPage'
import { Chat } from '@/pages/Chat'
import { Explore } from '@/pages/Explore'
import { Plans } from '@/pages/Plans'
import { PlanDetail } from '@/pages/PlanDetail'
import { HumanOutputs } from '@/pages/HumanOutputs'
import { HumanOutputDetail } from '@/pages/HumanOutputDetail'
import { Lint } from '@/pages/Lint'
import { LintResult } from '@/pages/LintResult'
import { Settings } from '@/pages/Settings'
import { AuditLog } from '@/pages/AuditLog'

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <Login />,
  },
  {
    path: '/change-password',
    element: <ChangePassword />,
  },
  {
    path: '/',
    element: <ProtectedRoute><Layout /></ProtectedRoute>,
    children: [
      { path: '', element: <Home /> },
      { path: 'wiki', element: <WikiList /> },
      { path: 'wiki/:slug', element: <WikiPage /> },
      { path: 'raw', element: <RawFiles /> },
      { path: 'raw/:id', element: <RawDetail /> },
      { path: 'pre-raw', element: <PreRawFiles /> },
      { path: 'pre-raw/:id', element: <PreRawDetail /> },
      { path: 'reader/:id', element: <ReaderPage /> },
      { path: 'chat', element: <Chat /> },
      { path: 'explore', element: <Explore /> },
      { path: 'plans', element: <Plans /> },
      { path: 'plans/:id', element: <PlanDetail /> },
      { path: 'human-outputs', element: <HumanOutputs /> },
      { path: 'human-outputs/:id', element: <HumanOutputDetail /> },
      { path: 'lint', element: <Lint /> },
      { path: 'lint/:reportId', element: <LintResult /> },
      { path: 'settings', element: <Settings /> },
      { path: 'audit-log', element: <AuditLog /> },
    ],
  },
])
