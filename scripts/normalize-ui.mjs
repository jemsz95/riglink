/**
 * Post-process files emitted by `shadcn add`.
 *
 * The registry currently emits `import { cn } from "cn"` (the published
 * shadcn `cn` package) and `useTheme` from `next-themes`. We keep `cn` local
 * in @/lib/utils and manage the theme ourselves, so normalize both. Run via
 * `npm run ui:add -- <components>`; safe to re-run.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const UI_DIR = 'src/components/ui'
const rules = [
  [
    /import\s*\{\s*cn\s*\}\s*from\s*["']cn["']/g,
    "import { cn } from '@/lib/utils'",
  ],
]

let changed = 0
for (const file of readdirSync(UI_DIR).filter((f) => f.endsWith('.tsx'))) {
  const path = join(UI_DIR, file)
  const before = readFileSync(path, 'utf8')
  let after = before
  for (const [pattern, replacement] of rules)
    after = after.replace(pattern, replacement)
  if (after !== before) {
    writeFileSync(path, after)
    console.log(`normalized ${path}`)
    changed++
  }
}
console.log(
  changed ? `\n${changed} file(s) normalized.` : 'nothing to normalize.',
)
