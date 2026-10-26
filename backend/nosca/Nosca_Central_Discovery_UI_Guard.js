/**
 * Protect the privileged owner-executed deployment from rendering the
 * employee-facing NEXUS HTML application under owner permissions.
 * Call at the VERY BEGINNING of your existing doGet():
 *
 *   const centralGuard = noscaCentralPortalGuard_();
 *   if (centralGuard) return centralGuard;
 *
 * Does not distinguish deployments by untrusted query parameters.
 */
function noscaCentralPortalGuard_() {
  const owner = String(PropertiesService.getScriptProperties()
    .getProperty('NOSCA_CENTRAL_OWNER_EMAIL') || '').trim().toLowerCase();
  const effective = String(Session.getEffectiveUser().getEmail() || '').trim().toLowerCase();
  const active = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  if (owner && effective === owner && active !== owner) {
    return ContentService.createTextOutput(
      'This deployment is reserved for authorized NOSCA discovery requests.');
  }
  return null;
}
