# Security Policy

## Supported versions

Only the latest commit on `main` receives security fixes. We do not backport to older releases.

## Reporting a vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Report vulnerabilities privately via [GitHub Security Advisories](https://github.com/ASKKPOP/treis/security/advisories/new). This keeps the disclosure confidential until a fix is ready.

Include:
- Description of the vulnerability and its impact
- Steps to reproduce
- Any suggested fix (optional but appreciated)

We will acknowledge receipt within 72 hours and aim to release a fix within 14 days for critical issues.

## Security model

Treis executes AI-generated tool calls inside a sandboxed workspace. Key security controls:

**Tool system**
- All file operations (`FileRead`, `FileWrite`, `Glob`, `Grep`) validate paths against the workspace boundary using `assertWithinWorkspace()` — both lexically and after symlink resolution
- The `Bash` tool blocks shell metacharacters (`;`, `&&`, `||`, `$()`, backticks) and requires explicit `DangerousShell` approval for destructive commands (`rm`, `chmod`, `dd`, etc.)
- A permission tier system gates each tool: `ReadOnly` → `WriteFiles` → `ExecuteShell` → `DangerousShell`

**Electron desktop app**
- `contextIsolation: true` — renderer cannot access Node.js
- `nodeIntegration: false` — renderer has no require()
- `sandbox: false` on the preload is intentional: the preload needs `ipcRenderer` from Electron. The preload exposes only 5 typed, named methods via `contextBridge` and does not pass raw IPC channels to the renderer
- External URLs open in the system browser, never in the app window

**Secrets**
- API keys are read from environment variables and never logged
- `.env` is in `.gitignore`

## Known limitations

- The `Grep` tool accepts user-supplied regex patterns, which may cause ReDoS with pathological inputs. This is an accepted risk in the current threat model.
- `WebFetch` is not yet implemented. When added, it will be sandboxed to URLs explicitly listed in the sealed contract scope.
- Session JSONL files at `~/.treis/sessions/` are written with default OS permissions — no encryption at rest.
