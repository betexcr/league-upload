const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

export const formatRelativeTime = (value?: string): string => {
  if (!value) {
    return "Unknown";
  }
  const then = new Date(value);
  const now = new Date();
  const delta = (then.getTime() - now.getTime()) / 1000;

  const divisions: Array<[number, Intl.RelativeTimeFormatUnit]> = [
    [60, "second"],
    [60, "minute"],
    [24, "hour"],
    [7, "day"],
    [4.34524, "week"],
    [12, "month"],
    [Number.POSITIVE_INFINITY, "year"],
  ];

  let duration = delta;
  for (const [factor, unit] of divisions) {
    if (Math.abs(duration) < factor) {
      return rtf.format(Math.round(duration), unit);
    }
    duration /= factor;
  }
  return rtf.format(Math.round(duration), "year");
};

export const formatDateTime = (value?: string): string => {
  if (!value) {
    return "Unknown";
  }
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
};
