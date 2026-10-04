/**
 * Dev-server host allowances for remote workspaces (Coder, Codespaces, etc.).
 *
 * Vite and Storybook both validate the incoming `Host` header and reject
 * anything they do not recognise -- Vite with "Blocked request", Storybook's
 * core-server with a bare 403 "Invalid host". Behind a Coder workspace the app
 * is reached at `<port>--<agent>--<workspace>--<owner>.<coder-domain>`, which
 * neither knows about, so both refuse to serve.
 *
 * Nothing here is hardcoded to a particular deployment: the domain is derived
 * from the environment the workspace already provides.
 */

/** Matches any subdomain of `domain`, per Vite/Storybook leading-dot semantics. */
function wildcardFor(hostname: string): string | null {
  const firstDot = hostname.indexOf('.')
  if (firstDot === -1) return null
  return hostname.slice(firstDot) // ".coder.example.com"
}

function hostnameOf(value: string | undefined): string | null {
  if (!value) return null
  try {
    // VSCODE_PROXY_URI contains a `{{port}}` placeholder that is not URL-legal.
    return new URL(value.replace('{{port}}', '0')).hostname
  } catch {
    return null
  }
}

/**
 * Hosts the dev servers should accept, in Vite's `server.allowedHosts` format.
 * Empty in a plain local checkout, so localhost behaviour is unchanged.
 */
export function devAllowedHosts(
  env: NodeJS.ProcessEnv = process.env,
): Array<string> {
  const hosts = new Set<string>()

  // Explicit escape hatch, comma-separated. Wins over any detection.
  for (const entry of (env.DEV_ALLOWED_HOSTS ?? '').split(',')) {
    const trimmed = entry.trim()
    if (trimmed) hosts.add(trimmed)
  }

  // Coder exposes the port-forward template directly, which is the most precise
  // source. CODER_AGENT_URL is only a FALLBACK, never additive: the agent URL
  // is typically one level up (`coder.corp.example.com` -> `.corp.example.com`),
  // so unioning the two would widen the allowance to every host in the parent
  // domain for no benefit.
  const derived =
    hostnameOf(env.VSCODE_PROXY_URI) ?? hostnameOf(env.CODER_AGENT_URL)
  if (derived) {
    const wildcard = wildcardFor(derived)
    if (wildcard) hosts.add(wildcard)
  }

  // GitHub Codespaces forwards on a fixed domain.
  if (env.CODESPACES === 'true') hosts.add('.app.github.dev')

  return Array.from(hosts)
}

/** True when the dev server is reached through an HTTPS reverse proxy on 443. */
export function isProxiedHttps(env: NodeJS.ProcessEnv = process.env): boolean {
  return (
    (env.VSCODE_PROXY_URI ?? '').startsWith('https://') ||
    env.CODESPACES === 'true' ||
    env.DEV_PROXY_HTTPS === 'true'
  )
}
