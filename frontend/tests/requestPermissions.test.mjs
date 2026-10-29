import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

const source = readFileSync(new URL('../src/pages/requests/requestPermissions.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } })
const exports = {}
runInNewContext(outputText, { exports })
const { getRequestPermissions } = exports

for (const [roles, canApprove, canReject] of [
  [['ADMIN'], true, true],
  [['OPS'], false, true],
  [['SECURITY'], false, false],
  [['ADMIN', 'OPS'], true, true],
  [[], false, false],
]) {
  test(`request permissions for ${roles.join(', ') || 'no roles'}`, () => {
    const result = getRequestPermissions({ roles })
    assert.equal(result.canApprove, canApprove)
    assert.equal(result.canReject, canReject)
  })
}
