import DashboardLayout from '@/components/layout/DashboardLayout'
import TimeTravelControls from '@/components/time-travel/TimeTravelControls'

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardLayout>
      <TimeTravelControls />
      {children}
    </DashboardLayout>
  )
}

