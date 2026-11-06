import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createServer } from 'vite'
import { sameReviewedSummon } from '../src/lib/summonActor.ts'
import type { ExpandedOperatorSource } from '../src/lib/expandedCombatTypes.ts'
import type { SkillRecord, SummonCombatSource } from '../src/types/skill.ts'

const sources = JSON.parse(readFileSync(new URL('../src/data/expandedSummonSources.json', import.meta.url), 'utf8')) as ExpandedOperatorSource[]
const tokens = JSON.parse(readFileSync(new URL('../src/data/expandedSummonTokenSources.json', import.meta.url), 'utf8')) as Record<string, SummonCombatSource>

test('runtime loaderはtokenをOP件数へ加えず、全tokenステータス・隠し素質・スキル・overrideを保持する', async () => {
  const server = await createServer({ configFile: false, logLevel: 'silent', appType: 'custom',
    cacheDir: 'node_modules/.vite/summon-source-data-test', resolve: { preserveSymlinks: true },
    optimizeDeps: { noDiscovery: true, entries: [] },
    server: { middlewareMode: true, watch: null, preTransformRequests: false, hmr: false } })
  try {
    const { loadSkillRecords } = await server.ssrLoadModule('/src/lib/arknightsData.ts')
    const characters: Record<string, unknown> = {}, skills: Record<string, unknown> = {}, subProfDict: Record<string, unknown> = {}
    for (const source of sources) {
      characters[source.operatorId] = { ...source.profile.affiliationIds, name: source.operatorName, displayNumber: 'TEST', profession: source.profession,
        subProfessionId: source.subProfessionId, rarity: source.rarity - 1, description: source.profile.traitDescription,
        phases: source.profile.phases, favorKeyFrames: source.profile.favorKeyFrames, talents: source.profile.talents, trait: source.profile.trait,
        potentialRanks: source.profile.potentialRanks, displayTokenDict: Object.fromEntries(Object.keys(source.profile.summonProfiles!).map(key => [key, true])),
        skills: source.profile.summonSkillTokenKeys!.map((overrideTokenKey, index) => ({
          skillId: source.skills.find(skill => skill.skillIndex === index + 1)?.skillId, overrideTokenKey })) }
      for (const skill of source.skills) skills[skill.skillId] = { levels: Array.from({ length: source.skillLevelIndex + 1 }, () => skill.raw) }
      subProfDict[source.subProfessionId] = { traitDesc: source.profile.subProfessionTraitDescription }
    }
    for (const token of Object.values(tokens)) {
      characters[token.tokenKey] = { ...token.profile, description: token.profile.traitDescription, name: token.name,
        profession: token.profession, subProfessionId: token.subProfessionId, displayNumber: null,
        skills: token.skills.map(skill => ({ skillId: skill.skillId })),
        favorKeyFrames: token.profile.favorKeyFrames.length ? token.profile.favorKeyFrames : null, potentialRanks: {} }
      for (const skill of token.skills) if (skill.skillId) skills[skill.skillId] = { levels: skill.levels }
    }
    const tables = { character: characters, skill: skills, uniequip: { subProfDict }, battleEquip: {}, handbookTeam: {} }
    const rows = await loadSkillRecords({ readTable: async (key: keyof typeof tables) => tables[key] }) as SkillRecord[]
    assert.equal(rows.length, 12)
    assert.equal(new Set(rows.map(row => row.operatorId)).size, 7)
    assert.ok(rows.every(row => row.profession !== 'TOKEN'))
    for (const source of sources) {
      const row = rows.find(row => row.operatorId === source.operatorId)!
      for (const [key, value] of Object.entries(source.profile.summonProfiles!)) assert.equal(sameReviewedSummon(row.operatorProfile.summonProfiles![key], value), true, key)
      assert.deepEqual(row.operatorProfile.summonSkillTokenKeys, source.profile.summonSkillTokenKeys)
    }
    // Skill overrides are a distinct binding; they survive even if not a display token or talent.
    const owner = characters.char_336_folivo as { skills: { overrideTokenKey: string | null }[] }
    owner.skills[1].overrideTokenKey = 'token_10001_deepcl_tentac'
    const changed = await loadSkillRecords({ readTable: async (key: keyof typeof tables) => tables[key] }) as SkillRecord[]
    const scene = changed.find(row => row.operatorId === 'char_336_folivo' && row.skillIndex === 2)!
    assert.equal(scene.overrideTokenKey, 'token_10001_deepcl_tentac')
    assert.equal(scene.operatorProfile.summonSkillTokenKeys![1], 'token_10001_deepcl_tentac')
    assert.ok(scene.operatorProfile.summonProfiles!.token_10001_deepcl_tentac)
  } finally { await server.close() }
})
