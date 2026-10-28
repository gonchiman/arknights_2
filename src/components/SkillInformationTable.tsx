import './SkillInformationTable.css'

interface Props {
  information: readonly (readonly [label: string, value: string | number])[]
  className?: string
}

export function SkillInformationTable({ information, className = '' }: Props) {
  return <table className={`skill-information-table ${className}`.trim()} aria-label="スキル情報">
    <thead><tr>{information.map(([label]) => <th scope="col" key={label}>{label}</th>)}</tr></thead>
    <tbody><tr>{information.map(([label, value]) => <td key={label}>{value}</td>)}</tr></tbody>
  </table>
}
