/**
 * Novare Nexus - Phase 3 personalized prompt discovery (NO dashboard).
 *
 * Uses existing Phase 1 votes and Phase 2 bookmarks; it does not create any
 * new spreadsheet tabs, record activity events, request Gemini, or install
 * time-based triggers. No employee-provided email or role is trusted.
 *
 * Public entry point: getNexusPromptRecommendations()
 * Legacy cleanup: removeNexusPromptDailySnapshotTrigger()
 */

/** Return up to eight Active prompt recommendations, with no private draft or email data. */
function getNexusPromptRecommendations() {
  var sheet = getAIPromptLibrarySheet_();
  validateAIPromptLibraryHeaders_(sheet);
  validateNexusPromptCommunitySchema_(sheet);
  var all = readAIPromptRows_(sheet);
  var active = all.filter(function(prompt) {
    return prompt.status === 'Active' && String(prompt.id || '').trim() !== '';
  });

  var actor = getNexusPromptCommunityIdentity_();
  var myBookmarks = {};
  var myVotes = {};
  if (actor.verified) {
    // Phase 2 state is already in use throughout the current Prompt Library.
    var bookmarks = getNexusPromptPhase2Rows_(getNexusPromptPhase2Tab_('bookmarks'));
    bookmarks.forEach(function(row) {
      var email = String(row[1] || '').trim().toLowerCase();
      if (email === actor.email) myBookmarks[String(row[0] || '')] = true;
    });
    myVotes = getNexusPromptCommunityVotedIds_(actor.email);
  }

  var categoryAffinity = {};
  var typeAffinity = {};
  function remember(prompt, weight) {
    if (prompt.category) categoryAffinity[prompt.category] = (categoryAffinity[prompt.category] || 0) + weight;
    if (prompt.promptType) typeAffinity[prompt.promptType] = (typeAffinity[prompt.promptType] || 0) + weight;
  }
  active.forEach(function(prompt) {
    if (myBookmarks[prompt.id]) remember(prompt, 3);
    if (myVotes[prompt.id]) remember(prompt, 2);
    if (actor.verified && prompt.createdByEmail === actor.email) remember(prompt, 1);
  });
  var hasAffinity = Object.keys(categoryAffinity).length > 0 || Object.keys(typeAffinity).length > 0;

  var suggestions = active.filter(function(prompt) {
    // Avoid showing an employee prompts they have already authored or engaged with.
    return !actor.verified || (
      prompt.createdByEmail !== actor.email &&
      !myBookmarks[prompt.id] && !myVotes[prompt.id]
    );
  }).map(function(prompt) {
    var cat = categoryAffinity[prompt.category] || 0;
    var type = typeAffinity[prompt.promptType] || 0;
    var votes = Math.max(0, Number(prompt.upvoteCount) || 0);
    var copies = Math.max(0, Number(prompt.copyCount) || 0);
    var comments = Math.max(0, Number(prompt.commentCount) || 0);
    var popularity = Math.min(40, votes * 4 + copies * 2 + comments);
    var score = (hasAffinity ? cat * 8 + type * 4 : 0) + popularity + (prompt.verified ? 2 : 0);
    var reason = cat > 0 ? 'Matches a category you engage with' :
      type > 0 ? 'Matches a prompt type you use' :
      prompt.verified ? 'Nexus-verified community prompt' : 'Popular in the community';

    // Never return createdByEmail, owner, copied-by users, sheetRow, or prompt text.
    return {
      id: prompt.id,
      promptName: String(prompt.promptName || ''),
      category: String(prompt.category || ''),
      verified: prompt.verified === true,
      reason: reason,
      score: score,
      personalized: hasAffinity && (cat > 0 || type > 0)
    };
  }).sort(function(a, b) {
    return b.score - a.score || a.promptName.localeCompare(b.promptName) || a.id.localeCompare(b.id);
  }).slice(0, 8);

  // Exclude internal ranking scores from public API response.
  var publicItems = suggestions.map(function(item) {
    return {
      id: item.id,
      promptName: item.promptName,
      category: item.category,
      verified: item.verified,
      reason: item.reason
    };
  });
  return {
    ok: true,
    recommendations: publicItems,
    personalized: suggestions.some(function(item) { return item.personalized; })
  };
}

/**
 * OPTIONAL CLEANUP: Remove a daily snapshot trigger installed by THIS account
 * under the previous Phase 3 dashboard implementation. It will not delete the
 * old NEXUS_Prompt_Daily_Stats sheet or affect Ask NOSCA scheduling.
 */
function removeNexusPromptDailySnapshotTrigger() {
  var actor = getNexusPromptCommunityIdentity_();
  if (!actor.verified || !actor.isAdmin) throw new Error('Verified Nexus admin required.');
  var triggers = ScriptApp.getProjectTriggers();
  var removed = 0;
  triggers.forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'captureNexusPromptDailySnapshot') {
      ScriptApp.deleteTrigger(trigger);
      removed += 1;
    }
  });
  return {
    ok: true,
    removed: removed,
    message: 'Snapshot triggers belonging to this Apps Script account have been removed. Other accounts must remove their own triggers.'
  };
}
