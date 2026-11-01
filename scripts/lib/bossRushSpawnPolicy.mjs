import { createHash } from 'node:crypto'
import { normalizeLevelId } from '../generateEnemyStageAppearances.mjs'

const REVISION = '60e3aaf434919fbca931024a59d51088e810a9d3'
const SOURCE = `https://github.com/ArknightsAssets/ArknightsGamedata/blob/${REVISION}/jp/gamedata`
const CONTROLLER = 'trap_091_brctrl'
const CONDITIONS = ['全WAVEクリア', '抑制ユニットによる追加出現なし']
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const empty = value => value == null || value === '' || (Array.isArray(value) && !value.length)
  || (record(value) && !Object.keys(value).length)
const list = value => Array.isArray(value) ? value : empty(value) ? [] : null
const fields = (value, names) => record(value) && Object.keys(value).every(key => names.includes(key))
const nonnegative = value => Number.isFinite(value) && value >= 0
const canonical = value => JSON.stringify(value, (_, item) => record(item)
  ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item)
const fingerprint = value => createHash('sha256').update(canonical(value)).digest('hex')

// Reviewed enemy skill/talent/prefab overrides and predefined-unit controls,
// shared across TN stages. These are not map-total or map-fingerprint rules:
// schedule counts/conditions and numeric enemy attributes are still analyzed.
// A new enemy (including musnake), prefab, skill or controller configuration
// needs review because it can call SkipCurrentWave or change wave dispatch.
const ENEMY_CONTROLS = new Map([
  [
    "fb1b6434c65bb825f3c54bb0ee9accd26706c86dc56445f3297dd0f33463f6a2",
    [
      "enemy_1104_lfkght_3",
      "enemy_1511_mdrock",
      "enemy_2014_csicer",
      "enemy_2015_csicem",
      "enemy_2038_sydonq",
      "enemy_2080_skzlwy",
      "enemy_6005_llstone",
      "enemy_7022_gatgod"
    ]
  ],
  [
    "aa9ddf86be5175fe622e38dea0cb70a2b09506a48d09341b40c242f7e2ba9357",
    [
      "enemy_10042_prtrop_2",
      "enemy_10043_sailor_2",
      "enemy_10046_pshark_2",
      "enemy_10047_shrknt_2",
      "enemy_10049_pcaptn_2",
      "enemy_1046_agent_2",
      "enemy_1047_sagent_2",
      "enemy_1056_ganwar_2",
      "enemy_1064_snsbr",
      "enemy_1067_snslime_2",
      "enemy_1072_dlancer_2",
      "enemy_1073_dscout",
      "enemy_1074_dbskar",
      "enemy_1076_bsthmr",
      "enemy_1086_ltsodr",
      "enemy_1086_ltsodr_2",
      "enemy_1088_ltsmer",
      "enemy_1089_ltlntc",
      "enemy_1089_ltlntc_2",
      "enemy_1090_mdsnpr",
      "enemy_1090_mdsnpr_2",
      "enemy_1091_mdhmmr_2",
      "enemy_1092_mdgint",
      "enemy_1098_cchmpn",
      "enemy_1099_nbkght_2",
      "enemy_1147_dshond",
      "enemy_1152_dsurch_2",
      "enemy_1153_dsexcu_2",
      "enemy_1154_dsmant",
      "enemy_1184_cadkgt",
      "enemy_1185_nmekgt",
      "enemy_1235_dsbskr_2",
      "enemy_1243_ltswar_2",
      "enemy_1263_durbus",
      "enemy_1277_sgman_2",
      "enemy_1281_sgcar_2",
      "enemy_1380_dthmak",
      "enemy_1561_crzjdg_2",
      "enemy_2009_csaudc",
      "enemy_2010_csdcr",
      "enemy_2011_csppt",
      "enemy_2017_csphts",
      "enemy_2021_syfish",
      "enemy_2022_syzeni",
      "enemy_2023_sypult",
      "enemy_2024_synut",
      "enemy_2025_syufo",
      "enemy_2035_sybox",
      "enemy_6006_fystone"
    ]
  ],
  [
    "212fec17a464f0e0d3f65cb39a3491346c42a616b4c691469cef0401a4bd6ac3",
    [
      "enemy_1073_dscout_2",
      "enemy_2016_csphtm",
      "enemy_2019_cshost",
      "enemy_2028_syevil",
      "enemy_2030_symon2",
      "enemy_2032_syboy2",
      "enemy_2033_syboys",
      "enemy_2037_sygirl",
      "enemy_2040_syrott",
      "enemy_2041_syjely",
      "enemy_2083_skzhg",
      "enemy_2090_skzjbc"
    ]
  ],
  [
    "9016928186067bfe7fc32a35e841379d6fa6bb1bb70e7d874b822e97da429c1c",
    [
      "enemy_2018_csdoll"
    ]
  ],
  [
    "c2aa090731410cb5a4a307cb6bea917f1eb4c80a1c42f23d8971bdab1e717ea1",
    [
      "enemy_2020_cswrtr"
    ]
  ],
  [
    "6e5acab45cf9354a1e20e9b43e0e6efbffdeb5bdf819464ff00e5085d03ed037",
    [
      "enemy_2039_syskad"
    ]
  ],
  [
    "a63d1a8afc87295589898035daf7e3f0390ec2af739587f4b11122e860109e70",
    [
      "enemy_2042_syboss"
    ]
  ],
  [
    "562a693c37c8228ce14f4ff6f3dd3602cc490ce5815e3322d74cea6810aad2fb",
    [
      "enemy_2041_syjelyboom1"
    ]
  ],
  [
    "be9eda6d4f8f2f725ac02acc60cb264106c18c4443427f77d99bfb9ef66e0839",
    [
      "enemy_1151_dslntc_2"
    ]
  ],
  [
    "9deedc21ff832099f033d166bf80fd9953feeef6ef3d9c53380e56f9ea542c97",
    [
      "enemy_2041_syjelyboom2"
    ]
  ],
  [
    "49daee7d408f4ce3dbc3e2bd44daddd387d5b265fab7b3a9b4177b3d5672847b",
    [
      "enemy_2014_csicer",
      "enemy_2015_csicem"
    ]
  ],
  [
    "bd8df533f9a6ce5aff01eea5f95b906b4d89eed26e8bfad7332f5b706a5dc9f2",
    [
      "enemy_2016_csphtm"
    ]
  ],
  [
    "34ae479db6b96d519922a6a659e866bc64178ad92c37e5b0b18593826cfc937a",
    [
      "enemy_2030_symon2"
    ]
  ],
  [
    "35e019b83c98c673c2b8a6800d571b9dc191b4fc9acecf90f0d8811c499127bf",
    [
      "enemy_2033_syboys"
    ]
  ],
  [
    "2f39f950c7677c78907f214241dc054c7e9fb2679103defd170a1a5dbe880f1d",
    [
      "enemy_2019_cshost"
    ]
  ],
  [
    "79691ca3970ffa2cb5da9fe983aeded832e2d74eda6de85b0ed0af888a27b01d",
    [
      "enemy_2020_cswrtr"
    ]
  ],
  [
    "dc1e016196e46c2a10f315b7314f61cc1dd039f5a909ee3f0c7954a70f36181a",
    [
      "enemy_2040_syrott"
    ]
  ],
  [
    "6c653de4bddb143379a62fef3a2eb9c1fa25cc5e6e7897426d75907a230768e8",
    [
      "enemy_2039_syskad"
    ]
  ],
  [
    "c188b01efca6721c077440f0d19b756535dd06e40237ec940b2e1ba447575012",
    [
      "enemy_1181_napkgt_2"
    ]
  ],
  [
    "20df6eb9eeda6a0f4963980643c03cb0fea3080d0242e4f6da095e62d3f1ba7e",
    [
      "enemy_2085_skzjxd"
    ]
  ],
  [
    "3d6961d70768baeb35a4fc2130e1ce5f6dc6d9f43113e008108e0a8be40f5749",
    [
      "enemy_1105_tyokai"
    ]
  ],
  [
    "ed8391a1c6a9f325ab66aa1e62245be356fe848e42417721b0714ca5390a4a31",
    [
      "enemy_2001_duckmi",
      "enemy_2002_bearmi",
      "enemy_2034_sythef"
    ]
  ],
  [
    "0e3299499d0d188366be49d24efdafb3f81a3a9ef17613edf87ceb6316b2d4bb",
    [
      "enemy_7027_xbbtl"
    ]
  ],
  [
    "c5e7eb7651b9632c57491d5f741f17b6e6fa93979d7a66337a1b85cedaa8be68",
    [
      "enemy_7028_xbscp"
    ]
  ],
  [
    "cb9a1985e3aeca11d1fba2b90588c2b28818a87f32a8487fd2b670236f89dc09",
    [
      "enemy_10045_parrot_2"
    ]
  ],
  [
    "a8556234f855036c261aa9096751f273f8a492de3820a35f54a8735d17699b4a",
    [
      "enemy_1561_crzjdg"
    ]
  ],
  [
    "fe82aae7169996e38aa0a513b4ec19de957f57222aa73224b4e35ebc6197583b",
    [
      "enemy_7027_xbbtl_2",
      "enemy_7028_xbscp_2"
    ]
  ],
  [
    "a91332f861aaea6de0f082c51d6f306d2cbaccb11619a37f0a8e2b6355473444",
    [
      "enemy_1548_ltniak"
    ]
  ],
  [
    "adfdf2980e22fcedce7ca90578b9c4cfc7ed580d6057a472875657315b5f8c89",
    [
      "enemy_1104_lfkght_3"
    ]
  ],
  [
    "f54512ef188d25d2228b1ffc03999c44f19d330294438506c7bfd55012f7ca90",
    [
      "enemy_7022_gatgod"
    ]
  ],
  [
    "28586094d4b774371b8e0bfa6b6c14082328b0b7d4fc4a75502e3eb6626bc388",
    [
      "enemy_2001_duckmi",
      "enemy_2002_bearmi",
      "enemy_2034_sythef"
    ]
  ],
  [
    "f1ddb4891290ab66268bf682d9882fb6247b013a4dccfeaa8838892a5eaed526",
    [
      "enemy_2035_sybox"
    ]
  ],
  [
    "a484e3542cd0d10f557d0ef86d493b3bfd6ba06f6e06bbf709682a1d45748185",
    [
      "enemy_1561_crzjdg"
    ]
  ]
])
const UNIT_CONTROLS = new Set([
  "059b209be37a58badecf3929ccf23a14df08dd88d464fa70033b30bdbd5486e9",
  "06581b5851f2f4eeed0befbdaa48199ce450425931f79f006e80ad397d4174d9",
  "0859f83cda373af1cfc3e6a9f96bc461b6814688d1860703adc601ccbb6d9c82",
  "0d6ae386ee40350cfc72a67c316120e68332ad9b6142ac4922f7a03ed9830a46",
  "129b114e368cca7d0974be821b5bd1147192dcaa02da882b2cb99f597b7123ef",
  "12e1107bae67dd265855cc68029ed47c0e95d9587a224c7dc8194143c78605c5",
  "1861412cea716c61ec7774dbad31c7c7586aab6b911463d00ab6d928ed3d436b",
  "19397ef85d13817874fb1014e88bfdb144e29db0241ce290eceab5d45369c6b1",
  "1d6ba645e3a7d3277978cdfb007b8f0ba7ad1542f1c2bc095093104112dd6ac6",
  "2170d11727d880c989da4910d759f4ecfefee2f7fdca352f9adc78c46319eb2a",
  "2204686c5a122a8260dcbb82ebf03b723be877a6fd30d4fb43efac946015751c",
  "2352c6fcb71207c1c592f4501ca33cd246c6bf66b9452b845a168340fb9ed7da",
  "2587b75316ee8e128cac0e7808063370ef3b44bf0a13bdc5c1a8bef79d08825c",
  "2bd80597652d18ab4ae42eb8987d7cd623ba678e4b75a06a1fc06d370ca153e9",
  "2e9f1b9584b8077c97de10797b9a081ce5ebfacf8fcf2de183872dcae56532e8",
  "314ecef988765c68c1eb580a8bca060367ad050db7556cf6a03b0141713ec326",
  "315777affaebab635dd12a83afe6012e6d8e51b398c3a5d7576d1a17b46a30bf",
  "392c1265ede59e1fcf37d5f8457d881a8a84e3a54e993f99471055b19df9b120",
  "3db8ecd06e5790e7c86fc63c86877abea13463b2354311ab80652f6ccfcccd03",
  "447c2c0e1d4a327076870a1c4b01e6155ccc7b951a5bf5fd7d749f5385cf1aea",
  "48de2ac47c4a305e03bca2f4ac71ddbc87a05a38b2a2c08a9f430e57da4c0e00",
  "4ad62f70085cff52b205664b203b13c31de47dccf815885d53b979830138887d",
  "517d685e3a7a13f5d9e0a1b6fe60b14306ee0b14d823480a3d4cc1889575f312",
  "55419e430178d027f498c8a3e71f015f0838d42f9045add8f5c170175fae6bf1",
  "5800dd81d0f0536350282eeedfa1641fdb9be5322f39672b183c8db714e61d55",
  "630f91be3332e617da31c22ac2b66f24b1ae4d741698304eb1deebc4f56639a7",
  "659019b5cd4c65b94c7f2ceebc96e1fdd499fd10bb39c5d57351c62e1fb31f2c",
  "662125229dbb5553403cfda590e19b07ae957a7a744bffbe571b16e62ac57e56",
  "77877b7ae9a17380bdd6b47f8c9bd22bfe616d13c358fc98d32ce6bea8ae4ce6",
  "8516dec3ed6840d07d1f87ab49a9667aa45b0894f941425ecc95599549d4e6b5",
  "8939eea525c4bc492991326934880baa9081a2914c5f9f64684a4de1f786da87",
  "90d5b7979319be161ac0e7d6801c8c947be2b9364492d01eb013e2d540cb08fd",
  "9379117855dec7fc34b3244c77c769887fa9eb1617f6152dbfd3f31b2b087be4",
  "9d22f7230aaa6873d8139381530e6262482c564131d94789f8c2e0ba0130bc40",
  "a010a56ac66f7731efb66316ac5155c969ae0660a6eec42792b2d820cf5025a8",
  "a1b72e63f41d49c06cd081e6c79f7cbc4ad522b7185ed65eb61f1ca2d73b7049",
  "a1f6bf0365dc932077599877974a51301edc8608a843405b6cac6bfea75be1f3",
  "a20b924448e281b8dac90fbaf87c6bf7cbcd1057c258f62d3091eb30a23707cb",
  "ab4a333c9b32b51513e4121830436a4e0426cd3f4dfe3a510abc3da4cca268fd",
  "b04913e0e7e7e2514cd87d983afdd76024d6971f94b1ed7fca07d655a6d1b7c6",
  "b66e776d93c98b73cde7a012420261e9f827eef74a53a37562a62d25ff9c44a6",
  "b92586e809c7e81d04c8106d75d031877f5bd5cf4d6d4f28641d6d411b474158",
  "c10db376dcbfd274d2876f424dbd864e5cb9f526707619f0352e898836fd3e2e",
  "c2722b11678970a10e4df9047e08715646ed5dc3198105bec99fb296b2960e45",
  "c92bc44cdda93b04a28879c897b5f0f8b437a88d717b2800e594dbdef74d08a6",
  "ce6352dfbe89b73376e431da4aa58e77f41bd0034083eb5d3583564954653d70",
  "d62299e0eb91ea0baa1bd4d55c62b95ee42582cccbac782d44c6cf10817792e0",
  "d85c7bf2cc313dc15c359d012feb174e8c34a17982afe1fc122cfa0cbc5a0d56",
  "e66c38786a671087270e627228dfd739255b4d0378c4ffd644945776bb3e0f2f",
  "e760e950f47648ecc43c64b766d47c01d67b5b1584e8f11ef94976fc0388056d",
  "eee3cbe2fbbe80ffe1cd9ab587d16648d8e1c950b837d13b2f98e9c180862b5a",
  "f2b6afbb39d92b537113e4c5082c26ce79cbc487c4efda2b19a63f562dde6585",
  "f9d0ed67c25f6568c1ec81ec79a9af8adc416709cd8c6a61b726c3ebbb9afb3a",
  "fc73ca379234cf524282214fb9f4454abd3fb9f5af2623deedebca32f5c3ab94"
])

const LEVEL_FIELDS = ['options', 'levelId', 'mapId', 'bgmEvent', 'environmentSe', 'mapData',
  'tilesDisallowToLocate', 'runes', 'optionalRunes', 'globalBuffs', 'routes', 'extraRoutes', 'enemies',
  'enemyDbRefs', 'waves', 'branches', 'predefines', 'hardPredefines', 'excludeCharIdList',
  'randomSeed', 'operaConfig', 'cameraPlugin']
const ACTION_FIELDS = ['actionType', 'key', 'count', 'managedByScheduler', 'preDelay', 'interval',
  'routeIndex', 'blockFragment', 'autoPreviewRoute', 'autoDisplayEnemyInfo', 'isUnharmfulAndAlwaysCountAsKilled',
  'hiddenGroup', 'randomSpawnGroupKey', 'randomSpawnGroupPackKey', 'randomType', 'refreshType',
  'weight', 'dontBlockWave', 'forceBlockWaveInBranch', 'isValid', 'condition', 'conditions']
const INSTANCE_FIELDS = ['position', 'direction', 'hidden', 'alias', 'uniEquipIds', 'showSpIllust',
  'masterInfos', 'inst', 'skillIndex', 'mainSkillLvl', 'skinId', 'tmplId', 'overrideSkillBlackboard', 'overrideTalents', 'initialCnt']
const OTHER_ACTIONS = new Set(['ACTIVATE_PREDEFINED', 'WITHDRAW_PREDEFINED', 'PREVIEW_CURSOR',
  'DISPLAY_ENEMY_INFO', 'PLAY_OPERA', 'PLAY_BGM'])
const ATTRIBUTE_FIELDS = ['maxHp', 'atk', 'def', 'magicResistance', 'cost', 'blockCnt', 'moveSpeed',
  'attackSpeed', 'baseAttackTime', 'respawnTime', 'hpRecoveryPerSec', 'spRecoveryPerSec', 'maxDeployCount',
  'massLevel', 'baseForceLevel', 'tauntLevel', 'epDamageResistance', 'epResistance', 'damageHitratePhysical',
  'damageHitrateMagical', 'epBreakRecoverSpeed', 'stunImmune', 'silenceImmune', 'sleepImmune', 'frozenImmune',
  'levitateImmune', 'disarmedCombatImmune', 'fearedImmune', 'palsyImmune', 'attractImmune',
  'teleportImmune', 'groundBoundImmune']

function parameters(value) {
  if (!Array.isArray(value)) return null
  const result = new Map()
  for (const entry of value) {
    if (!fields(entry, ['key', 'value', 'valueStr']) || typeof entry.key !== 'string'
      || result.has(entry.key) || !Number.isFinite(entry.value)
      || (entry.valueStr != null && typeof entry.valueStr !== 'string')) return null
    result.set(entry.key, entry.valueStr ?? entry.value)
  }
  return result
}

function safeController(token) {
  if (!fields(token, INSTANCE_FIELDS) || !fields(token.inst, ['characterKey', 'level', 'phase', 'favorPoint', 'potentialRank'])
    || token.inst.characterKey !== CONTROLLER || token.inst.level !== 1 || token.inst.phase !== 'PHASE_0'
    || token.inst.favorPoint !== 0 || token.inst.potentialRank !== 0 || token.hidden !== true
    || token.skillIndex !== 0 || token.mainSkillLvl !== 1 || token.direction !== 'UP'
    || !fields(token.position, ['row', 'col']) || !Object.values(token.position).every(value => Number.isSafeInteger(value) && value >= 0)
    || !empty(token.overrideTalents) || !empty(token.uniEquipIds) || !empty(token.masterInfos)
    || !empty(token.tmplId) || !empty(token.skinId) || token.initialCnt != null) return false
  const p = parameters(token.overrideSkillBlackboard)
  return p !== null && p.has('tile_col_begin') && p.has('tile_col_end_2')
    && [...p].every(([key, value]) => key === 'respawn_time' ? [1, 2].includes(value)
      : ['tile_col_begin', 'tile_col_end', 'tile_col_end_2'].includes(key) && Number.isSafeInteger(value) && value >= 0)
    && p.get('tile_col_begin') <= (p.get('tile_col_end') ?? p.get('tile_col_end_2'))
    && (p.get('tile_col_end') ?? 0) <= p.get('tile_col_end_2')
}

function safeUnits(level) {
  const pre = level.predefines
  if (!fields(pre, ['characterInsts', 'tokenInsts', 'characterCards', 'tokenCards']) || !Array.isArray(pre.tokenInsts)
    || (!empty(level.hardPredefines) && (!fields(level.hardPredefines, Object.keys(pre))
      || Object.values(level.hardPredefines).some(value => !empty(value))))) return null
  const controllers = [], aliases = new Set()
  for (const [kind, raw] of Object.entries(pre)) {
    const entries = list(raw)
    if (!entries) return null
    for (const token of entries) {
      if (!fields(token, INSTANCE_FIELDS)) return null
      if (token.alias) {
        if (typeof token.alias !== 'string' || aliases.has(token.alias)) return null
        aliases.add(token.alias)
      }
      if (token.inst?.characterKey === CONTROLLER) {
        if (kind !== 'tokenInsts' || !safeController(token)) return null
        controllers.push(token)
      } else {
        const control = Object.fromEntries(Object.entries(token)
          .filter(([key]) => !['position', 'direction', 'hidden', 'alias', 'initialCnt'].includes(key)))
        if (!UNIT_CONTROLS.has(fingerprint(control))) return null
      }
    }
  }
  if (![2, 3].includes(controllers.length)) return null
  for (let index = 0; index < controllers.length; index++) {
    if (controllers[index].alias !== `${CONTROLLER}#${index + 1}`) return null
    const p = parameters(controllers[index].overrideSkillBlackboard)
    if (index === 0 && p.get('tile_col_begin') !== 0) return null
    if (index && p.get('tile_col_begin') !== parameters(controllers[index - 1].overrideSkillBlackboard).get('tile_col_end') + 1) return null
  }
  return controllers
}

function safeEnemyReferences(level) {
  if (!Array.isArray(level.enemyDbRefs)) return false
  return level.enemyDbRefs.every(ref => {
    if (!fields(ref, ['useDb', 'id', 'level', 'overwrittenData'])
      || (ref.overwrittenData != null && !record(ref.overwrittenData))) return false
    const data = { ...ref.overwrittenData }
    const attributes = data.attributes
    if (attributes != null && (!fields(attributes, ATTRIBUTE_FIELDS) || Object.values(attributes).some(value => value != null
      && (!fields(value, ['m_defined', 'm_value']) || typeof value.m_defined !== 'boolean'
        || (value.m_defined && !Number.isFinite(value.m_value) && typeof value.m_value !== 'boolean'))))) return false
    delete data.attributes
    return ENEMY_CONTROLS.get(fingerprint({ useDb: ref.useDb, level: ref.level, overwrittenData: data }))?.includes(ref.id) === true
  })
}

function safeEnvironment(level) {
  if (!fields(level, LEVEL_FIELDS) || !empty(level.enemies) || !empty(level.optionalRunes)
    || level.levelId != null || level.mapId != null
    || (!empty(level.operaConfig) && level.operaConfig !== 'rune_05-01')) return false
  const o = level.options
  if (!fields(o, ['characterLimit', 'maxLifePoint', 'initialCost', 'maxCost', 'costIncreaseTime',
    'moveMultiplier', 'steeringEnabled', 'reachableCheckIgnoreStartTile', 'isTrainingLevel', 'isHardTrainingLevel',
    'isPredefinedCardsSelectable', 'displayRestTime', 'maxPlayTime', 'functionDisableMask', 'configBlackBoard'])
    || o.isTrainingLevel !== false || o.isHardTrainingLevel !== false || ![0, -1].includes(o.maxPlayTime)
    || o.functionDisableMask !== 'NONE' || !empty(o.configBlackBoard)) return false
  const buffs = list(level.globalBuffs), runes = list(level.runes)
  if (!buffs || !runes || buffs.some(buff => !fields(buff, ['prefabKey', 'blackboard', 'overrideCameraEffect',
    'passProfessionMaskFlag', 'professionMask', 'playerSideMask'])
    || !['act27sisde_enemy_global_buff', 'night_map_default'].includes(buff.prefabKey)
    || !empty(buff.blackboard) || !empty(buff.overrideCameraEffect))) return false
  const refs = new Set(level.enemyDbRefs?.map(ref => ref.id))
  return runes.every(rune => {
    if (!record(rune)) return false
    if (['level_hidden_group_enable', 'level_hidden_group_disable'].includes(rune.key)) return true
    const p = parameters(rune.blackboard)
    if (!p) return false
    // Do not disable source hidden groups to implement the baseline. They and
    // enemy replacements remain the ordinary rune resolver's responsibility.
    if (rune.key === 'level_enemy_replace') return refs.has(p.get('key')) && refs.has(p.get('value'))
    return ['enemy_attribute_mul', 'char_attribute_mul'].includes(rune.key)
      && [...p].every(([key, value]) => key === 'char' ? value === 'trap_097_hstone'
        : ['max_hp', 'atk', 'def'].includes(key) && nonnegative(value))
  })
}

/** Resolve the reviewed TN sequential schedule, never its optional branches.
 * Native evidence: _DoSchedule RVA 0x6E7E10 traverses waves once; _DealWave
 * RVA 0x6E65D0 executes every fragment before waiting. FinishCurrentWave.Execute
 * RVA 0xE0A1E0 returns without finish/skip before a bonus wave (early-return
 * instruction at 0xE0A399 within that method). Only explicit
 * SkipCurrentWave clears pending actions; reviewed controls contain no caller.
 */
export function getBossRushWaveResolution(level, context = {}) {
  if (!record(level) || !record(context) || context.sourceRevision !== REVISION
    || context.difficulty !== 'NORMAL' || context.diffGroup !== 'NONE'
    || typeof context.levelId !== 'string' || /(^|[\\/])\.\.([\\/]|$)/.test(context.levelId)
    || (context.selectedRuneIds !== undefined && (!Array.isArray(context.selectedRuneIds) || context.selectedRuneIds.length))) return null
  const levelId = normalizeLevelId(context.levelId)
  if (!/^activities\/act([56])bossrush\/level_bossrush\1_(?:0[1-4]|ex0[1-4]|fin04)$/.test(levelId ?? '')) return null
  if (!safeEnvironment(level) || !safeEnemyReferences(level)) return null
  const controllers = safeUnits(level)
  if (!controllers || !Array.isArray(level.waves) || !level.waves.length) return null
  const waves = new Map(), controllerActions = [], tagged = []
  const enemyIds = new Set(level.enemyDbRefs.map(ref => ref.id))
  const unitAliases = new Set(Object.values(level.predefines).flatMap(raw => list(raw) ?? []).map(unit => unit.alias))
  const safeOtherAction = action => fields(action, ACTION_FIELDS) && OTHER_ACTIONS.has(action.actionType)
    && (action.actionType !== 'PLAY_OPERA' || action.key === 'dscout_skill_start')
    && (!['ACTIVATE_PREDEFINED', 'WITHDRAW_PREDEFINED'].includes(action.actionType) || unitAliases.has(action.key)
      // TN-2 withdraws these dynamically created reward-box aliases.
      || (action.actionType === 'WITHDRAW_PREDEFINED' && ['trap_068_badbox#1', 'trap_068_badbox#2'].includes(action.key)))
  for (const [waveIndex, wave] of level.waves.entries()) {
    if (!fields(wave, ['fragments', 'preDelay', 'postDelay', 'maxTimeWaitingForNextWave', 'advancedWaveTag'])
      || !Array.isArray(wave.fragments) || wave.maxTimeWaitingForNextWave !== -1
      || !nonnegative(wave.preDelay) || !nonnegative(wave.postDelay)
      || ![null, undefined, '', 'bosswave', 'bonuswave'].includes(wave.advancedWaveTag)) return null
    if (wave.advancedWaveTag) tagged.push({ waveIndex, tag: wave.advancedWaveTag })
    for (const [fragmentIndex, fragment] of wave.fragments.entries()) {
      if (!fields(fragment, ['actions', 'preDelay']) || !Array.isArray(fragment.actions) || !nonnegative(fragment.preDelay)) return null
      for (const [actionIndex, action] of fragment.actions.entries()) {
        if (!record(action) || typeof action.key !== 'string') return null
        if (action.key.includes(CONTROLLER)) {
          if (!fields(action, ACTION_FIELDS) || action.count !== 1 || action.managedByScheduler !== true
            || !nonnegative(action.preDelay) || !nonnegative(action.interval)
            || !empty(action.hiddenGroup) || !empty(action.randomSpawnGroupKey) || !empty(action.randomSpawnGroupPackKey)
            || action.randomType !== 'ALWAYS' || action.refreshType !== 'ALWAYS' || action.weight !== 0
            || action.dontBlockWave !== false || action.forceBlockWaveInBranch !== false
            || !empty(action.condition) || !empty(action.conditions)) return null
          controllerActions.push({ waveIndex, fragmentIndex, actionIndex, ...action })
        } else if (action.actionType === 'SPAWN' ? !enemyIds.has(action.key) : !safeOtherAction(action)) return null
      }
    }
  }
  if (tagged.length !== controllers.length * 2 - 1
    || tagged.some((wave, i) => wave.tag !== (i % 2 ? 'bonuswave' : 'bosswave'))
    || tagged[0].waveIndex !== 0 || controllerActions.length !== tagged.length) return null
  for (let index = 0; index < controllers.length; index++) {
    const activation = controllerActions[index * 2], boss = tagged[index * 2]
    if (activation.actionType !== 'ACTIVATE_PREDEFINED' || activation.key !== controllers[index].alias
      || activation.preDelay !== 0 || activation.fragmentIndex !== 0 || activation.actionIndex !== 0
      || activation.waveIndex !== (index === 0 ? 0 : tagged[index * 2 - 1].waveIndex + 1)
      || activation.waveIndex > boss.waveIndex) return null
    if (index < controllers.length - 1) {
      const trigger = controllerActions[index * 2 + 1], bonus = tagged[index * 2 + 1]
      if (trigger.actionType !== 'TRIGGER_PREDEFINED' || trigger.key !== `${controllers[index].alias}:empty`
        || trigger.waveIndex !== bonus.waveIndex || ![5, 30].includes(trigger.preDelay)) return null
    }
  }
  // An additional branch caller could alter the controller sequence. Ordinary
  // unresolved enemy branches remain unresolved in analyzeEnemySpawns.
  for (const branch of Object.values(record(level.branches) ? level.branches : {})) {
    for (const phase of list(branch?.phases) ?? []) for (const action of list(phase?.actions) ?? []) {
      if (typeof action?.key === 'string' && action.key.includes(CONTROLLER)) return null
      if (action?.actionType === 'SPAWN' && !enemyIds.has(action.key)) return null
      if (action?.actionType && action.actionType !== 'SPAWN' && !safeOtherAction(action)) return null
    }
  }
  const evidence = [SOURCE + '/levels/' + levelId + '.json: reviewed TN controller sequence; source SHA-256=' + fingerprint(level),
    'BossRushGameMode: 全区間を順に1回実行。抑制ユニットによる追加設定を適用しない基本スケジュール',
    'GameAssembly.dll: _DoSchedule RVA 0x6E7E10; _DealWave RVA 0x6E65D0; FinishCurrentWave.Execute RVA 0xE0A1E0 (bonus-wave early return within method: 0xE0A399)']
  for (const [waveIndex, wave] of level.waves.entries()) waves.set(waveIndex, {
    conditions: [...CONDITIONS, wave.advancedWaveTag === 'bosswave' ? 'TNボス区間を1回実行'
      : wave.advancedWaveTag === 'bonuswave' ? 'TNボーナス区間を1回実行' : 'TN通常区間を1回実行'],
    evidence: [...evidence, `waves[${waveIndex}].advancedWaveTag=${JSON.stringify(wave.advancedWaveTag)}`],
  })
  return { aggregationConditions: [...CONDITIONS], waves }
}
