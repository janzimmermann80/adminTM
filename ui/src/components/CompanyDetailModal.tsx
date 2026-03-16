import { useEffect } from 'react'
import { CompanyDetailPanel } from '../pages/company/CompanyDetailPanel'

interface Props {
  companyKey: string
  initialTab?: string
  onClose: () => void
}

export const CompanyDetailModal = ({ companyKey, initialTab, onClose }: Props) => {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="min-h-full flex items-start justify-center p-4 py-8"
        onClick={e => e.stopPropagation()}
      >
        <div className="w-full max-w-5xl">
          <CompanyDetailPanel companyKey={companyKey} initialTab={initialTab} onClose={onClose} />
        </div>
      </div>
    </div>
  )
}
