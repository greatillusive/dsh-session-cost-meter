/**
 * Client half of the session cost meter: a pill under the composer that shows
 * the current Session's estimated cost with its peak / off-peak split.
 */
window.__ModuleLoader__.load({
  id: '@local/session-cost-meter',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const NS = '@local/session-cost-meter';

    const WEEKDAY_INDEX = { Sun: 7, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const formatterCache = new Map();

    /** Same peak rule the Host folds with, evaluated on the browser clock. */
    function isPeakAt(at, tariff) {
      if (!Number.isFinite(at) || tariff === null || tariff === undefined) return false;
      try {
        let formatter = formatterCache.get(tariff.timezone);
        if (formatter === undefined) {
          formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: tariff.timezone,
            hourCycle: 'h23',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            weekday: 'short',
            hour: '2-digit',
            minute: '2-digit',
          });
          formatterCache.set(tariff.timezone, formatter);
        }
        const parts = formatter.formatToParts(new Date(at));
        const valueOf = (type) => parts.find((part) => part.type === type)?.value;
        const weekday = WEEKDAY_INDEX[valueOf('weekday')];
        const weekdays = Array.isArray(tariff.peakWeekdays) ? tariff.peakWeekdays : [];
        if (weekday === undefined || weekdays.indexOf(weekday) < 0) return false;
        const date = `${valueOf('year')}-${valueOf('month')}-${valueOf('day')}`;
        if (Array.isArray(tariff.holidays) && tariff.holidays.indexOf(date) >= 0) return false;
        const minutes = Number(valueOf('hour')) * 60 + Number(valueOf('minute'));
        const windows = Array.isArray(tariff.peakWindows) ? tariff.peakWindows : [];
        return windows.some((window) => Array.isArray(window) && minutes >= window[0] && minutes < window[1]);
      } catch {
        return false;
      }
    }

    const zh = {
      'pill.aria': '本会话费用 {amount}，当前{band}时段。点击查看明细',
      'pill.title': '本会话费用估算 · 点击查看明细',
      'band.peak': '峰',
      'band.off': '谷',
      'details.title': '本会话费用估算',
      'details.bandNow': '当前时段',
      'details.total': '合计',
      'details.peak': '高峰时段',
      'details.off': '空闲时段',
      'details.requests': '{count} 次请求',
      'details.inputMiss': '输入（未命中缓存）',
      'details.inputHit': '输入（命中缓存）',
      'details.output': '输出',
      'details.cacheRate': '缓存命中率',
      'details.models': '按模型',
      'details.estimated': '估算',
      'details.unpriced': '未计价',
      'details.note': '按请求完成时间估算。高峰为北京时间工作日 09:00–12:00、14:00–18:00（不含法定节假日），其余为空闲时段。单价见插件配置。',
    };

    const en = {
      'pill.aria': 'Session cost {amount}, {band} period. Open details',
      'pill.title': 'Estimated session cost · click for details',
      'band.peak': 'Peak',
      'band.off': 'Off',
      'details.title': 'Estimated session cost',
      'details.bandNow': 'Current period',
      'details.total': 'Total',
      'details.peak': 'Peak hours',
      'details.off': 'Off-peak hours',
      'details.requests': '{count} requests',
      'details.inputMiss': 'Input (cache miss)',
      'details.inputHit': 'Input (cache hit)',
      'details.output': 'Output',
      'details.cacheRate': 'Cache hit rate',
      'details.models': 'By model',
      'details.estimated': 'estimated',
      'details.unpriced': 'not priced',
      'details.note': 'Estimated from request completion time. Peak hours are 09:00–12:00 and 14:00–18:00 Beijing time on weekdays, excluding Chinese statutory holidays; all other times are off-peak. Prices come from the plugin config.',
    };

    const CSS = [
      '.dsh-cost-root{position:relative;display:inline-flex;align-items:center}',
      '.dsh-cost-pill{display:inline-flex;align-items:center;gap:6px;height:24px;padding:0 9px;border-radius:999px;',
      'border:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-secondary);',
      'font:inherit;font-size:12px;line-height:1;cursor:pointer;transition:background-color .12s ease,color .12s ease}',
      '.dsh-cost-pill:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
      '.dsh-cost-pill:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}',
      '.dsh-cost-icon{display:block;flex:none;color:var(--dsw-alias-brand-primary)}',
      '.dsh-cost-amount{font-variant-numeric:tabular-nums}',
      '.dsh-cost-sep{opacity:.5}',
      '.dsh-cost-band[data-band="peak"]{color:var(--dsw-alias-state-warn-primary)}',
      '.dsh-cost-band[data-band="off"]{color:var(--dsw-alias-state-success-primary)}',
      '.dsh-cost-pop{min-width:236px;max-width:min(320px, calc(100vw - 24px));',
      'padding:10px 12px;border-radius:10px;border:1px solid var(--dsw-alias-border-l1);',
      'background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);font-size:12px;line-height:1.5}',
      '.dsh-cost-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:8px;',
      'font-weight:600;color:var(--dsw-alias-label-primary)}',
      '.dsh-cost-total{font-variant-numeric:tabular-nums;color:var(--dsw-alias-brand-primary)}',
      '.dsh-cost-row{display:flex;align-items:baseline;justify-content:space-between;gap:16px;padding:1px 0}',
      '.dsh-cost-key{color:var(--dsw-alias-label-secondary);white-space:nowrap}',
      '.dsh-cost-value{font-variant-numeric:tabular-nums;text-align:right;white-space:nowrap}',
      '.dsh-cost-divider{height:1px;margin:6px 0;background:var(--dsw-alias-border-l1)}',
      '.dsh-cost-note{margin:8px 0 0;color:var(--dsw-alias-label-secondary);font-size:11px;line-height:1.5}',
    ].join('');

    const ICON = h('svg', {
      className: 'dsh-cost-icon',
      width: 12,
      height: 12,
      viewBox: '0 0 16 16',
      'aria-hidden': true,
      focusable: false,
    }, h('circle', { cx: 8, cy: 8, r: 6.2, fill: 'none', stroke: 'currentColor', strokeWidth: 1.4 }),
    h('path', {
      d: 'M5.6 4.9 8 7.6l2.4-2.7M8 7.6v3.9M5.8 8.6h4.4M5.8 10.4h4.4',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.4,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    }));

    function formatMoney(value, currency) {
      const prefix = currency === 'CNY' ? '¥' : `${currency} `;
      if (!Number.isFinite(value) || value <= 0) return `${prefix}0`;
      const digits = value >= 1 ? 2 : value >= 0.1 ? 3 : 4;
      return `${prefix}${value.toFixed(digits)}`;
    }

    function formatExact(count, locale) {
      try {
        return new Intl.NumberFormat(locale === 'zh' ? 'zh-CN' : locale).format(count);
      } catch {
        return String(count);
      }
    }

    function readBand(view, now) {
      if (view !== null && view !== undefined && isPeakAt(now, view.tariff)) return 'peak';
      return 'off';
    }

    function sumModelCosts(models, band) {
      let sum = 0;
      for (const model of models) {
        const cost = model?.[band]?.cost;
        if (Number.isFinite(cost)) sum += cost;
      }
      return sum;
    }

    function row(key, label, value) {
      return h('div', { className: 'dsh-cost-row', key }, [
        h('span', { className: 'dsh-cost-key', key: 'k' }, label),
        h('span', { className: 'dsh-cost-value', key: 'v' }, value),
      ]);
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        const fallbackTranslate = ctx.locale.bind(NS);

        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'session-cost-meter: dictionaries');

        function CostPill(props) {
          const useProjection = props.useProjection;
          const view = useProjection('sessionCost');
          const [open, setOpen] = React.useState(false);
          const [anchor, setAnchor] = React.useState(null);
          const [now, setNow] = React.useState(() => Date.now());
          const [, bump] = React.useState(0);
          const rootRef = React.useRef(null);
          const translate = typeof props.t === 'function' ? props.t : fallbackTranslate;

          React.useEffect(() => {
            const timer = setInterval(() => setNow(Date.now()), 30000);
            return () => clearInterval(timer);
          }, []);

          React.useEffect(() => ctx.locale.subscribe(() => bump((value) => value + 1)), []);

          React.useEffect(() => {
            if (!open) return undefined;
            const onKeyDown = (event) => {
              if (event.key === 'Escape') setOpen(false);
            };
            const onPointerDown = (event) => {
              const root = rootRef.current;
              if (root !== null && root !== undefined && !root.contains(event.target)) setOpen(false);
            };
            document.addEventListener('keydown', onKeyDown);
            document.addEventListener('mousedown', onPointerDown);
            return () => {
              document.removeEventListener('keydown', onKeyDown);
              document.removeEventListener('mousedown', onPointerDown);
            };
          }, [open]);

          // The details panel floats above the pill: it must not join the dock
          // flow, or opening it would push the conversation and composer up.
          React.useLayoutEffect(() => {
            if (!open) {
              setAnchor(null);
              return undefined;
            }
            const update = () => {
              const root = rootRef.current;
              if (root === null || root === undefined) return;
              const rect = root.getBoundingClientRect();
              const width = Math.min(320, Math.max(236, window.innerWidth - 24));
              const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
              const bottom = Math.max(8, window.innerHeight - rect.top + 8);
              const maxHeight = Math.max(120, Math.min(window.innerHeight - 24, rect.top - 16));
              setAnchor((current) => (current !== null && current.left === left && current.bottom === bottom && current.maxHeight === maxHeight
                ? current
                : { left, bottom, maxHeight }));
            };
            update();
            window.addEventListener('resize', update);
            window.addEventListener('scroll', update, true);
            return () => {
              window.removeEventListener('resize', update);
              window.removeEventListener('scroll', update, true);
            };
          }, [open]);

          if (view === undefined || view === null || !Array.isArray(view.models) || view.requests === 0) return null;

          const locale = ctx.locale.getSnapshot().active;
          const t = translate;
          const band = readBand(view, now);
          const bandLabel = band === 'peak' ? t('band.peak') : t('band.off');
          const peak = view.peak;
          const offPeak = view.offPeak;
          // Band costs normally arrive on the projection; derive them from the
          // per-model rows when a build only publishes the model breakdown.
          const peakCost = Number.isFinite(peak.cost) ? peak.cost : sumModelCosts(view.models, 'peak');
          const offPeakCost = Number.isFinite(offPeak.cost) ? offPeak.cost : sumModelCosts(view.models, 'offPeak');
          const total = Number.isFinite(view.totalCost) ? view.totalCost : peakCost + offPeakCost;
          const amount = formatMoney(total, view.currency);
          const miss = peak.cacheMiss + offPeak.cacheMiss;
          const hit = peak.cacheHit + offPeak.cacheHit;
          const output = peak.output + offPeak.output;
          const hitRate = hit + miss > 0 ? Math.round((hit / (hit + miss)) * 100) : null;

          const rows = [
            row('total', t('details.total'), amount),
            row('band', t('details.bandNow'), bandLabel),
            row('peak', t('details.peak'), `${formatMoney(peakCost, view.currency)} · ${t('details.requests', { count: peak.requests })}`),
            row('off', t('details.off'), `${formatMoney(offPeakCost, view.currency)} · ${t('details.requests', { count: offPeak.requests })}`),
            row('miss', t('details.inputMiss'), formatExact(miss, locale)),
            row('hit', t('details.inputHit'), hitRate === null
              ? formatExact(hit, locale)
              : `${formatExact(hit, locale)} · ${hitRate}%`),
            row('out', t('details.output'), formatExact(output, locale)),
          ];

          if (view.models.length > 0) {
            rows.push(h('div', { className: 'dsh-cost-divider', key: 'divider', 'aria-hidden': true }));
            rows.push(row('models-head', t('details.models'), ''));
            for (const model of view.models) {
              const suffix = model.priced
                ? (model.estimated ? ` · ${t('details.estimated')}` : '')
                : ` · ${t('details.unpriced')}`;
              rows.push(row(`model:${model.key}`, model.model, `${formatMoney(model.cost, view.currency)}${suffix}`));
            }
          }

          return h('div', { className: 'dsh-cost-root', ref: rootRef, 'data-session-cost': true }, [
            h('style', { key: 'style' }, CSS),
            h('button', {
              type: 'button',
              key: 'pill',
              className: 'dsh-cost-pill',
              'aria-expanded': open,
              'aria-label': t('pill.aria', { amount, band: bandLabel }),
              title: t('pill.title'),
              onClick: () => setOpen((value) => !value),
            }, [
              ICON,
              h('span', { className: 'dsh-cost-amount', key: 'amount' }, amount),
              h('span', { className: 'dsh-cost-sep', key: 'sep', 'aria-hidden': true }, '·'),
              h('span', { className: 'dsh-cost-band', key: 'band', 'data-band': band }, bandLabel),
            ]),
            open && anchor !== null ? h('div', {
              key: 'pop',
              className: 'dsh-cost-pop',
              role: 'region',
              'aria-label': t('details.title'),
              style: {
                position: 'fixed',
                left: anchor.left,
                bottom: anchor.bottom,
                zIndex: 60,
                maxHeight: anchor.maxHeight,
                overflowY: 'auto',
              },
            }, [
              h('div', { className: 'dsh-cost-head', key: 'head' }, [
                h('span', { key: 'title' }, t('details.title')),
                h('span', { className: 'dsh-cost-total', key: 'total' }, amount),
              ]),
              ...rows,
              h('p', { className: 'dsh-cost-note', key: 'note' }, t('details.note')),
            ]) : null,
          ]);
        }

        ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
          name: 'conversation.composer.dock',
          id: 'session-cost',
          order: 2,
          locale: NS,
        }, CostPill));
      },
    };
  },
});
