import { PanelStateScope } from '../lib/PanelStateScope'
import type { OperatorDetailCommonProps } from './OperatorDetailContent'
import { GoldenglowDetailModal } from './GoldenglowDetailModal'
import { OperatorDetailPage } from './OperatorDetailPage'
import './OperatorProfileModal.css'

interface Props extends OperatorDetailCommonProps {
  onClose: () => void
}

export function OperatorProfileModal({ onClose, ...profile }: Props) {
  const { operator } = profile

  return (
    <GoldenglowDetailModal title={operator.name} closeLabel="オペレーター情報を閉じる"
      className="operator-profile-dialog" onClose={onClose}>
      <p className="operator-profile-modal-subtitle">
        ★{operator.rarity} · {operator.professionLabel} / {operator.subProfessionName}
      </p>
      <PanelStateScope.Provider value="operator-detail">
        <OperatorDetailPage {...profile} embedded />
      </PanelStateScope.Provider>
    </GoldenglowDetailModal>
  )
}
