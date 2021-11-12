export default function getRelativeTimeDiffString(
  currentTimestamp: number,
  unixTimestamp: number
): string {
  let diff = currentTimestamp - unixTimestamp;
  let unit: string;
  if (diff < 60) {
    unit = 'second';
  } else if (diff < 3600) {
    unit = 'minute';
    diff /= 60;
  } else if (diff < 86400) {
    unit = 'hour';
    diff /= 3600;
  } else if (diff < 604800) {
    unit = 'day';
    diff /= 86400;
  } else if (diff < 2629800) {
    unit = 'week';
    diff /= 604800;
  } else if (diff < 31557600) {
    unit = 'month';
    diff /= 2629800;
  } else {
    unit = 'year';
    diff /= 31557600;
  }
  diff = Math.round(diff);
  return `${diff} ${unit}${diff !== 1 ? 's' : ''}`;
}
