/**
 * Host half of the session cost meter.
 *
 * Registers one session projection unit (`sessionCost`) that folds provider
 * token usage into peak / off-peak buckets and exposes a priced view to the
 * browser. The Client half renders that view under the composer.
 */
import { foldEvent, resolveTariff, viewOf } from './pricing.js';

export const name = '@local/session-cost-meter';

export const inject = ['sessionProjections'];

/**
 * Identity schema: the projection registry validates values with `parse`, and
 * this plugin's state and view are already plain JSON owned by its own folds.
 */
const passthrough = { parse: (value) => value };

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {Record<string, unknown> | undefined} config row config from cordis.patch.yml
 */
export function apply(ctx, config) {
  const tariff = resolveTariff(config);
  ctx.sessionProjections.register({
    key: 'sessionCost',
    stateVersion: 1,
    stateSchema: passthrough,
    init: () => ({ models: {}, header: null, last: null, startedAt: null, updatedAt: null }),
    apply: (state, event) => foldEvent(state, event, tariff),
    wire: {
      viewSchema: passthrough,
      view: (state) => viewOf(state, tariff),
    },
  });
}
