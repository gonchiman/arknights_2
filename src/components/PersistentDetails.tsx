import type { ComponentPropsWithoutRef } from 'react'
import { usePanelOpen } from '../lib/usePanelOpen'

type PersistentDetailsProps = Omit<ComponentPropsWithoutRef<'details'>, 'open' | 'defaultOpen' | 'onToggle'> & {
  persistenceId: string
  defaultOpen?: boolean
}

export function PersistentDetails({ persistenceId, defaultOpen = false, ...props }: PersistentDetailsProps) {
  const [open, setOpen] = usePanelOpen(persistenceId, defaultOpen)
  return <details {...props} open={open} onToggle={(event) => {
    if (event.currentTarget.open !== open) setOpen(event.currentTarget.open)
  }} />
}
