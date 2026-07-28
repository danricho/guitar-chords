/**
 * timestamp-scroll.js — smooth-scroll the chart to a virtual timestamp.
 *
 * Used by Spotify time-synced playback: each `.event` element carries a
 * `data-timestamp` (ms); we interpolate a scroll position between the
 * surrounding events and centre it in the viewport.
 *
 * Exposes: window.Scroll
 */

window.Scroll = window.Scroll || {};

/**
 * Scroll #content so the position matching `targetTimestamp` is centred.
 * No-op when the chart has no timestamped events or the tab is hidden.
 * @param {number} targetTimestamp playback position in milliseconds
 */
Scroll.toVirtualTimestamp = function (targetTimestamp) {
  const $container = $("#content");
  const points = [];

  // .event replaces a ChordPro comment and lands in its own row, ahead of
  // the chord+lyric row it tags (comment sits on its own source line, right
  // before the lyric line it timestamps) — so offsetTop alone lands on top
  // of the chord line, not the lyric. Nudge down by one chord line's actual
  // rendered height (measured live so it tracks the font-scale setting)
  // to land at chord-bottom/lyric-top instead.
  const chordLineHeight = $container.find(".chord").first().outerHeight() || 0;

  $container.find(".event").each(function () {
    const timestamp = Number($(this).data("timestamp"));
    if (!isNaN(timestamp)) {
      points.push({ timestamp, top: this.offsetTop + chordLineHeight });
    }
  });

  if (points.length === 0) {
    return;
  }

  points.sort((a, b) => a.timestamp - b.timestamp);

  let targetTop;
  if (targetTimestamp <= points[0].timestamp) {
    targetTop = points[0].top;
  } else if (targetTimestamp >= points[points.length - 1].timestamp) {
    targetTop = points[points.length - 1].top;
  } else {
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      if (targetTimestamp >= a.timestamp && targetTimestamp <= b.timestamp) {
        const t = (targetTimestamp - a.timestamp) / (b.timestamp - a.timestamp);
        targetTop = a.top + (b.top - a.top) * t;
        break;
      }
    }
  }

  // Centre interpolated position in the visible area
  const scrollTop = targetTop - $container.innerHeight() / 2;
  if (App.state.isTabActive) {
    $container.animate({ scrollTop }, 750);
  }
};
