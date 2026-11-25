import './ElementLocationCopyButton.css'

export function OutputImageSaveButton({ onClick }: { onClick: () => void }) {
  return <button type="button" className="output-icon-button" aria-label="画像を保存" aria-haspopup="dialog" onClick={onClick}>
    <span className="output-icon-face" aria-hidden="true">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" focusable="false">
        <path d="M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4" />
      </svg>
    </span>
  </button>
}
