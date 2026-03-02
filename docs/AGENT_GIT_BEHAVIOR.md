# AI Agent Git Behavior - Quick Reference

**Project**: Proctor App (proctor-app)  
**Root**: `/home/kazawa/proctor-app`  
**Hooks**: Enabled (NEVER use `--no-verify` - fix issues instead)

## Commit Format

```
<type>(<scope>): <subject>
```

**Types**: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `perf`, `ci`

**Common Scopes**: `auth`, `session`, `student`, `violation`, `sniffer`, `gateway`, `upload`, `ui`, `api`, `db`, `docker`

**Subject Rules**:

- Imperative mood ("add" not "added")
- Lowercase start
- No period
- Max 72 chars
- Specific and clear

## Scope Mapping (File Path → Scope)

### Backend

```
backend/src/controllers/auth.*                    → (auth)
backend/src/services/auth.*                       → (auth)
backend/src/middleware/auth.*                      → (auth)

backend/src/controllers/session.*                 → (session)
backend/src/services/session.*                    → (session)
backend/src/routes/session.*                      → (session)

backend/src/services/student.*                    → (student)
backend/src/services/violation.*                  → (violation)

backend/src/gateway/studentHandlers.*             → (gateway)
backend/src/gateway/teacherHandlers.*             → (gateway)
backend/src/gateway/backgroundJobs.*              → (gateway)
backend/src/gateway/socket.*                      → (gateway)

backend/src/controllers/upload.*                  → (upload)
backend/src/routes/upload.*                       → (upload)

backend/src/middleware/errorHandler.*              → (middleware)
backend/src/middleware/validate.*                  → (middleware)

backend/src/utils/logger.*                        → (config)
backend/src/utils/prisma.*                        → (config)

backend/prisma/schema.prisma                      → (db)
backend/prisma/migrations/*                       → (db)

backend/src/utils/*                               → (utils)
backend/src/types/*                               → (types)
```

### Frontend

```
frontend/src/components/TeacherLogin.*            → (auth)
frontend/src/components/StudentLogin.*            → (auth)
frontend/src/components/TeacherDashboard.*        → (teacher)
frontend/src/components/SessionDetail.*           → (session)
frontend/src/components/SecureExamMonitor.*        → (student)

frontend/src/hooks/useTeacherSocket.*             → (hooks)
frontend/src/hooks/useExamSocket.*                → (hooks)
frontend/src/hooks/useInternetSniffer.*           → (hooks)

frontend/src/components/common/*                  → (ui)
frontend/src/components/layout/*                  → (ui)

frontend/src/context/*                            → (context)
frontend/src/config/*                             → (config)
frontend/src/App.*                                → (app)
```

### Infrastructure

```
docker-compose*.yml                               → (docker)
backend/Dockerfile                                → (docker)
frontend/Dockerfile                               → (docker)

scripts/*                                         → (scripts)

backend/package.json                              → (deps) with type: chore
frontend/package.json                             → (deps) with type: chore
package.json                                      → (deps) with type: chore

backend/src/__tests__/*                           → (test)
docs/*.md                                         → (docs)
*.md (root level)                                 → (docs)
```

## Quick Decision Matrix

| Change Type       | Type            | Example                                        |
| ----------------- | --------------- | ---------------------------------------------- |
| New functionality | `feat`          | `feat(gateway): add sniffer timeout detection` |
| Bug fix           | `fix`           | `fix(session): resolve heartbeat race condition`|
| Docs only         | `docs`          | `docs(api): add endpoint examples`             |
| Refactor          | `refactor`      | `refactor(auth): extract token verification`   |
| Tests             | `test`          | `test(security): add violation enum tests`     |
| Dependencies      | `chore`         | `chore(deps): update prisma to v6.0`           |
| DB schema         | `feat` or `fix` | `feat(db): add submission model`               |

## Commit Workflow

```bash
# 1. Check changes
git status

# 2. Determine type + scope from changed files

# 3. Write commit message
git add -A
git commit -m "type(scope): specific action and reason"

# 4. If hooks fail: ALWAYS fix the issues and retry
npm run lint --fix
git add .
git commit -m "type(scope): specific action and reason"
```

## Multi-File Changes

**Same feature** → Single commit with bullet list in body:

```bash
feat(gateway): add sniffer timeout detection

- Add SNIFFER_TIMEOUT_MS constant (15s)
- Track unanswered challenges per socket
- Emit violation:detected to student on timeout
- Notify teacher dashboard
```

**Multiple features** → Separate commits (one per feature)

## Pre-commit Hook Handling

**NEVER use `--no-verify`**

If hooks fail:

1. Fix linting issues
2. Fix type errors
3. Stage fixes and retry commit

## Critical Rules

1. **Format**: Always `type(scope): subject`
2. **Specificity**: Be specific ("add sniffer timeout" not "update gateway")
3. **Tense**: Imperative ("add" not "added")
4. **Scope**: Based on primary changed files
5. **Body**: Use for complex/multi-file changes
6. **Hooks**: NEVER bypass - always fix issues
