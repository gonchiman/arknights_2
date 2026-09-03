import './SkillJsonViewNav.css'

type SkillJsonView = 'detail' | 'overview'

export function SkillJsonViewNav({ active }: { active: SkillJsonView }) {
  return (
    <nav className="skill-json-view-nav" aria-label="Skill JSON分析の表示">
      <a
        className={active === 'detail' ? 'active' : ''}
        href="#/skill-json"
        aria-current={active === 'detail' ? 'page' : undefined}
      >
        <span>INDIVIDUAL</span>
        <strong>個別表示</strong>
      </a>
      <a
        className={active === 'overview' ? 'active' : ''}
        href="#/skill-json/overview"
        aria-current={active === 'overview' ? 'page' : undefined}
      >
        <span>KEY LIST</span>
        <strong>キー一覧</strong>
      </a>
    </nav>
  )
}
