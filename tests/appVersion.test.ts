import { describe, expect, it } from 'vitest'
import { isNewerAppBuild } from '../src/utils/appVersion'

describe('isNewerAppBuild', () => {
  it('is true when remote build differs', () => {
    expect(isNewerAppBuild('abc123', 'def456')).toBe(true)
  })

  it('is false when builds match', () => {
    expect(isNewerAppBuild('abc123', 'abc123')).toBe(false)
  })

  it('is false when remote is missing', () => {
    expect(isNewerAppBuild('abc123', null)).toBe(false)
    expect(isNewerAppBuild('abc123', '')).toBe(false)
  })
})
