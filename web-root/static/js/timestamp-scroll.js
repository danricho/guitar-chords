function scrollToVirtualTimestamp(targetTimestamp) {
  const $container = $("#content");
  const points = [];
  $container.find(".event").each(function () {
    const $event = $(this);
    // Adapt to your timestamp source
    const timestamp = Number($event.data("timestamp"));
    if (!isNaN(timestamp)) {
      points.push({
        timestamp,
        top: $event[0].offsetTop,
        // offset: $event.offset().top,
        // position: $event.position().top,
        // offsetTop: $event[0].offsetTop,
        // scrollTop: $('#content').scrollTop()
      });
    }
  });
  // console.table(points)
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
  // Centre interpolated position in visible area
  const scrollTop = targetTop - $container.innerHeight() / 2;
  $container.animate(
    {
      scrollTop: scrollTop,
    },
    1000,
  );
}
