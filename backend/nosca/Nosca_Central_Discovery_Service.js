/**
 * NOVARE NEXUS — Legacy Central Discovery service (retired).
 *
 * This project uses ONE centralized owner implementation:
 *   Nosca_Central_Discovery_Owner.js
 *
 * The previous standalone-service code in this file contained a second
 * doPost(), verifyNoscaDriveAuthorization(), and
 * benchmarkNoscaCentralOwnerSearch(). These duplicates caused global
 * function collisions and rejected the approved_files pilot.
 *
 * This complete file intentionally contains no endpoint, configuration,
 * authorization or Drive search handlers. Do not restore the original
 * standalone two-project service alongside the canonical owner module.
 *
 * The compatibility benchmark below preserves the prior function name,
 * delegating to the current owner security suite.
 */
function benchmarkNoscaCentralSecurity() {
  return benchmarkNoscaCentralOwnerSecurity();
}
