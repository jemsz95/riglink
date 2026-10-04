import { describe, expect, it } from 'vitest'
import { devAllowedHosts, isProxiedHttps } from './dev-hosts'

describe('devAllowedHosts', () => {
  it('is empty for a plain local checkout', () => {
    expect(devAllowedHosts({})).toEqual([])
  })

  it('derives a subdomain wildcard from the Coder proxy template', () => {
    expect(
      devAllowedHosts({
        VSCODE_PROXY_URI:
          'https://{{port}}--main--scarlet-tiger-50--javiermeza.coder.corp.example.com/',
      }),
    ).toEqual(['.coder.corp.example.com'])
  })

  it('falls back to the agent URL when no proxy template is set', () => {
    expect(
      devAllowedHosts({ CODER_AGENT_URL: 'https://coder.corp.example.com/' }),
    ).toEqual(['.corp.example.com'])
  })

  it('prefers the proxy template over the agent URL rather than allowing both', () => {
    // The agent URL sits one level up, so unioning them would widen the
    // allowance to every host in the parent domain.
    expect(
      devAllowedHosts({
        VSCODE_PROXY_URI: 'https://{{port}}--a--b--c.coder.corp.example.com/',
        CODER_AGENT_URL: 'https://coder.corp.example.com/',
      }),
    ).toEqual(['.coder.corp.example.com'])
  })

  it('honours an explicit override and de-duplicates', () => {
    expect(
      devAllowedHosts({
        DEV_ALLOWED_HOSTS: '.coder.corp.example.com, my-host.test',
        VSCODE_PROXY_URI: 'https://{{port}}--a--b--c.coder.corp.example.com/',
      }),
    ).toEqual(['.coder.corp.example.com', 'my-host.test'])
  })

  it('ignores unparseable values rather than throwing', () => {
    expect(devAllowedHosts({ VSCODE_PROXY_URI: 'not a url' })).toEqual([])
  })

  it('ignores a bare hostname with no dot', () => {
    expect(devAllowedHosts({ CODER_AGENT_URL: 'http://localhost/' })).toEqual(
      [],
    )
  })

  it('adds the Codespaces domain', () => {
    expect(devAllowedHosts({ CODESPACES: 'true' })).toEqual(['.app.github.dev'])
  })
})

describe('isProxiedHttps', () => {
  it('detects an https proxy template', () => {
    expect(
      isProxiedHttps({ VSCODE_PROXY_URI: 'https://{{port}}--x.example.com/' }),
    ).toBe(true)
  })

  it('is false locally', () => {
    expect(isProxiedHttps({})).toBe(false)
    expect(
      isProxiedHttps({ VSCODE_PROXY_URI: 'http://{{port}}--x.example.com/' }),
    ).toBe(false)
  })
})
