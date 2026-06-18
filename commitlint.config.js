// commitlint configuration — conventional-commits structure for the
// @governancer/funnel-base-mcp public repo.
//
// Subject follows conventional-commits: `type(scope): subject`, e.g.
//   feat(resources): expose law-texts:// resource handler
//   fix(tools): handle missing FUNNEL_BASE_ROOT
//   docs(readme): document the funnel-base:// scheme
//
// ESM module (package.json has "type": "module"), so `export default`.
//
// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Agonist Development AB

export default {
  extends: ['@commitlint/config-conventional'],
};
