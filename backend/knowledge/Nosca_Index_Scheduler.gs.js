/**
 * Ask NOSCA: full index refresh every 30 minutes.
 *
 * One scheduled cycle calls the EXISTING refreshNoscaIndex() repeatedly
 * until result.complete === true.
 *
 * Google Apps Script cannot run forever (6-minute execution ceiling).
 * If a scan cannot finish within this handler's conservative time budget,
 * a ONE-TIME continuation trigger resumes the same scan shortly afterward.
 * The next repeating 30-minute tick begins a NEW full scan only after the
 * previous one has completed. If the previous one is still incomplete,
 * it resumes the existing scan rather than discarding its checkpoint.
 *
 * INSTALL:
 *   1. Replace existing Nosca_Index_Scheduler.gs (if any).
 *   2. Run setupNoscaIndex30MinuteTrigger() once.
 *   3. Use getNoscaIndexScheduleStatus() to confirm installation.
 *   4. Optionally run runNoscaIndexScheduledRefresh() manually once to test.
 *
 * Do NOT also set up a separate trigger directly on refreshNoscaIndex().
 */

/* global ScriptApp, PropertiesService, LockService, Utilities, console, refreshNoscaIndex */

var NOSCA_SCHEDULE_V2 = Object.freeze({
  regularHandler: 'runNoscaIndexScheduledRefresh',
  continuationHandler: 'continueNoscaIndexScheduledRefresh',
  stateKey: 'NOSCA_INDEX_SCHEDULE_CYCLE_V2',
  intervalMinutes: 30,
  continuationDelayMs: 60 * 1000,
  maxExecutionWorkMs: 3 * 60 * 1000,
  reserveBeforeNextBatchMs: 45 * 1000,
  maxBatchesPerInvocation: 12,
  runningLeaseMs: 6 * 60 * 1000
});

function withNoscaSchedulerLock_(callback) {
  // The existing refreshNoscaIndex() also uses this script lock, so hold
  // it ONLY to update scheduler state. Never hold it during a batch run.
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    throw new Error('Ask NOSCA scheduler state is temporarily locked.');
  }

  try {
    return callback();
  } finally {
    lock.releaseLock();
  }
}

function readNoscaScheduleState_() {
  var raw = PropertiesService.getScriptProperties()
    .getProperty(NOSCA_SCHEDULE_V2.stateKey);
  if (!raw) return null;

  try {
    var parsed = JSON.parse(raw);
    if (parsed && parsed.cycleId) return parsed;
  } catch (error) {
    console.warn('[Ask NOSCA][Scheduler] Invalid schedule state:', error);
  }

  PropertiesService.getScriptProperties()
    .deleteProperty(NOSCA_SCHEDULE_V2.stateKey);
  return null;
}

function writeNoscaScheduleState_(value) {
  var properties = PropertiesService.getScriptProperties();
  if (value) {
    properties.setProperty(
      NOSCA_SCHEDULE_V2.stateKey,
      JSON.stringify(value)
    );
  } else {
    properties.deleteProperty(NOSCA_SCHEDULE_V2.stateKey);
  }
}

function getNoscaSchedulerTriggers_(handlerName) {
  return ScriptApp.getProjectTriggers().filter(function (trigger) {
    return trigger.getHandlerFunction() === handlerName;
  });
}

function removeNoscaContinuationTriggers_() {
  var matching = getNoscaSchedulerTriggers_(
    NOSCA_SCHEDULE_V2.continuationHandler
  );
  matching.forEach(function (trigger) {
    ScriptApp.deleteTrigger(trigger);
  });
  return matching.length;
}

/**
 * Install one repeating 30-minute trigger for this Google account.
 * Re-running it will NOT create duplicate repeating triggers.
 *
 * If the older scheduler has been installed, its existing trigger has the
 * same handler and is reused; this updated handler has the new semantics.
 */
function setupNoscaIndex30MinuteTrigger() {
  return withNoscaSchedulerLock_(function () {
    var matching = getNoscaSchedulerTriggers_(
      NOSCA_SCHEDULE_V2.regularHandler
    );
    var created = false;

    if (!matching.length) {
      ScriptApp
        .newTrigger(NOSCA_SCHEDULE_V2.regularHandler)
        .timeBased()
        .everyMinutes(NOSCA_SCHEDULE_V2.intervalMinutes)
        .create();
      created = true;
    } else if (matching.length > 1) {
      matching.slice(1).forEach(function (trigger) {
        ScriptApp.deleteTrigger(trigger);
      });
    }

    var output = {
      ok: true,
      installed: true,
      handler: NOSCA_SCHEDULE_V2.regularHandler,
      everyMinutes: NOSCA_SCHEDULE_V2.intervalMinutes,
      created: created,
      message: 'Each 30-minute tick starts/resumes a scan until complete.'
    };
    console.log('[Ask NOSCA][Scheduler] Setup:', output);
    return output;
  });
}

/**
 * Recurring 30-minute entry point.
 * One *cycle* is a full Drive scan comprising one or more index batches.
 */
function runNoscaIndexScheduledRefresh(event) {
  return executeNoscaIndexScheduleCycle_('regular', event || null);
}

/**
 * One-time follow-up to finish a scan that couldn't complete inside the
 * previous invocation's execution budget.
 */
function continueNoscaIndexScheduledRefresh(event) {
  return executeNoscaIndexScheduleCycle_('continuation', event || null);
}

function executeNoscaIndexScheduleCycle_(mode, event) {
  var invocationStart = Date.now();
  var registration = withNoscaSchedulerLock_(function () {
    var state = readNoscaScheduleState_();
    var now = Date.now();

    if (mode === 'continuation') {
      // Only the continuation trigger created for the current cycle may
      // resume it. Stale one-time triggers are ignored.
      var triggeredId = String(event && event.triggerUid || '');
      if (!state || !triggeredId ||
          triggeredId !== String(state.continuationTriggerId || '')) {
        return { skip: 'No matching unfinished scan for this trigger.' };
      }
    }

    if (state && state.busyToken &&
        Number(state.leaseUntilMs || 0) > now) {
      return { skip: 'Another invocation is already processing this scan.' };
    }

    if (!state) {
      state = {
        cycleId: Utilities.getUuid(),
        startedAt: new Date(now).toISOString(),
        batchesTotal: 0,
        scanId: '',
        lastCompletedBatchAt: '',
        continuationTriggerId: ''
      };
    }

    // A repeating tick may arrive while a previous cycle is unfinished.
    // Continue that cycle. Avoid a second, redundant continuation trigger.
    removeNoscaContinuationTriggers_();
    state.continuationTriggerId = '';

    var token = Utilities.getUuid();
    state.busyToken = token;
    state.leaseUntilMs = now + NOSCA_SCHEDULE_V2.runningLeaseMs;
    writeNoscaScheduleState_(state);

    return { cycleId: state.cycleId, token: token };
  });

  if (registration.skip) {
    console.log('[Ask NOSCA][Scheduler] Skipped:', registration.skip);
    return { ok: true, skipped: true, reason: registration.skip };
  }

  var batchCount = 0;
  var lastResult = null;
  var complete = false;
  var failure = null;

  try {
    // Repeatedly process bounded batches within one Apps Script invocation.
    // The initial batch always runs; subsequent batches respect the budget.
    while (batchCount < NOSCA_SCHEDULE_V2.maxBatchesPerInvocation) {
      if (batchCount > 0 &&
          Date.now() - invocationStart >=
          NOSCA_SCHEDULE_V2.maxExecutionWorkMs -
          NOSCA_SCHEDULE_V2.reserveBeforeNextBatchMs) {
        break;
      }

      lastResult = refreshNoscaIndex();
      batchCount += 1;

      if (!lastResult || lastResult.ok !== true ||
          typeof lastResult.complete !== 'boolean') {
        throw new Error(
          'refreshNoscaIndex() did not return a valid {ok, complete} result.'
        );
      }

      if (lastResult.complete === true) {
        complete = true;
        break;
      }
    }
  } catch (error) {
    failure = error;
  }

  var followUpScheduled = false;
  var stateChanged = false;
  var scheduleError = null;

  try {
    withNoscaSchedulerLock_(function () {
      var state = readNoscaScheduleState_();
      if (!state || state.cycleId !== registration.cycleId ||
          state.busyToken !== registration.token) {
        // For example, stopNoscaIndex30MinuteTrigger() was called while a
        // batch was still running. Respect that administrative stop.
        return;
      }

      stateChanged = true;
      state.batchesTotal = Number(state.batchesTotal || 0) + batchCount;
      if (lastResult) {
        state.scanId = String(lastResult.scanId || state.scanId || '');
        state.lastCompletedBatchAt = new Date().toISOString();
      }
      state.busyToken = '';
      state.leaseUntilMs = 0;

      if (complete) {
        // A successful full scan clears its own NOSCA_Index checkpoint.
        // Delete cycle state so the NEXT half-hour tick starts a new scan.
        writeNoscaScheduleState_(null);
        removeNoscaContinuationTriggers_();
        return;
      }

      if (failure) {
        // Do not retry a persistent error every minute indefinitely.
        // Leave the indexing checkpoint for the next 30-minute tick.
        writeNoscaScheduleState_(state);
        removeNoscaContinuationTriggers_();
        return;
      }

      // Existing refreshNoscaIndex() saved its checkpoint when false.
      // Schedule a one-time continuation, so we don't need to wait 30 mins
      // to finish this same full scan.
      removeNoscaContinuationTriggers_();
      try {
        var trigger = ScriptApp
          .newTrigger(NOSCA_SCHEDULE_V2.continuationHandler)
          .timeBased()
          .after(NOSCA_SCHEDULE_V2.continuationDelayMs)
          .create();
        state.continuationTriggerId = String(trigger.getUniqueId());
        followUpScheduled = true;
      } catch (error) {
        state.continuationTriggerId = '';
        scheduleError = error;
      }
      writeNoscaScheduleState_(state);
    });
  } catch (error) {
    if (!failure) failure = error;
  }

  var summary = {
    ok: !failure && !scheduleError,
    cycleId: registration.cycleId,
    scanId: lastResult ? String(lastResult.scanId || '') : '',
    batchesThisInvocation: batchCount,
    complete: complete,
    continuationScheduled: followUpScheduled,
    elapsedMs: Date.now() - invocationStart,
    totalFilesDiscovered: lastResult
      ? Number(lastResult.totalFilesDiscovered || 0)
      : 0,
    message: complete
      ? 'Full scan complete. Next 30-minute tick starts a new full scan.'
      : followUpScheduled
        ? 'Scan incomplete. Continuing automatically after a short delay.'
        : 'Scan unfinished. Check errors and the next 30-minute run.'
  };
  console.log('[Ask NOSCA][Scheduler] Result:', summary);

  if (failure || scheduleError) {
    var issue = failure || scheduleError;
    console.error('[Ask NOSCA][Scheduler] FAILED:', issue);
    throw issue;
  }
  if (!stateChanged) {
    summary.ok = false;
    summary.message = 'Scheduler state was changed while the batch ran.';
  }
  return summary;
}

/** Read-only status: installed triggers and active full-scan state. */
function getNoscaIndexScheduleStatus() {
  var repeating = getNoscaSchedulerTriggers_(
    NOSCA_SCHEDULE_V2.regularHandler
  );
  var continuations = getNoscaSchedulerTriggers_(
    NOSCA_SCHEDULE_V2.continuationHandler
  );
  var state = readNoscaScheduleState_();
  var result = {
    ok: true,
    enabled: repeating.length === 1,
    intervalMinutes: NOSCA_SCHEDULE_V2.intervalMinutes,
    repeatingTriggerCount: repeating.length,
    continuationTriggerCount: continuations.length,
    scanInProgress: Boolean(state),
    scanId: state ? state.scanId : '',
    cycleStartedAt: state ? state.startedAt : '',
    batchesProcessedInCycle: state ? Number(state.batchesTotal || 0) : 0,
    runningNow: Boolean(
      state && state.busyToken && Number(state.leaseUntilMs || 0) > Date.now()
    ),
    nextAction: state
      ? 'Resume existing full scan until complete.'
      : 'Start new full scan at the next 30-minute tick.'
  };
  console.log('[Ask NOSCA][Scheduler] Status:', result);
  return result;
}

/**
 * Disable both repeating and pending continuation triggers, preserving
 * NOSCA_Index sheet data and the built-in indexing checkpoint.
 */
function stopNoscaIndex30MinuteTrigger() {
  return withNoscaSchedulerLock_(function () {
    var removed = 0;
    [
      NOSCA_SCHEDULE_V2.regularHandler,
      NOSCA_SCHEDULE_V2.continuationHandler
    ].forEach(function (name) {
      getNoscaSchedulerTriggers_(name).forEach(function (trigger) {
        ScriptApp.deleteTrigger(trigger);
        removed += 1;
      });
    });

    writeNoscaScheduleState_(null);
    var result = {
      ok: true,
      removedTriggers: removed,
      message: 'Scheduler stopped. NOSCA_Index and its checkpoint remain intact.'
    };
    console.log('[Ask NOSCA][Scheduler] Stopped:', result);
    return result;
  });
}
