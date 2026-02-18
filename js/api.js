// ============================================================
// API — Cross-module function registry
// Breaks circular dependencies: modules register their public
// functions here, other modules call them via api.functionName()
// ============================================================
export const api = {};
