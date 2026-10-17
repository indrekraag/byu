// Sunrise / sunset computed on the device (SunCalc's NOAA-based method), so
// they never depend on a network service. Accurate to about a minute.
const rad = Math.PI / 180, dayMs = 86400000, J1970 = 2440588, J2000 = 2451545, J0 = 0.0009;
const toDays = (d: Date) => d.getTime() / dayMs - 0.5 + J1970 - J2000;
const fromJulian = (j: number) => new Date((j + 0.5 - J1970) * dayMs);

export function sunTimes(date: Date, lat: number, lng: number): { sunrise: Date; sunset: Date } {
  const lw = rad * -lng, phi = rad * lat, d = toDays(date);
  const n = Math.round(d - J0 - lw / (2 * Math.PI));
  const ds = J0 + lw / (2 * Math.PI) + n;
  const M = rad * (357.5291 + 0.98560028 * ds);
  const C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const L = M + C + rad * 102.9372 + Math.PI;
  const dec = Math.asin(Math.sin(rad * 23.4397) * Math.sin(L));
  const noon = J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
  const w = Math.acos((Math.sin(-0.833 * rad) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec)));
  const a = J0 + (w + lw) / (2 * Math.PI) + n;
  const set = J2000 + a + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
  return { sunrise: fromJulian(noon - (set - noon)), sunset: fromJulian(set) };
}

/** The next sunrise and next sunset from `now`. */
export function nextSunEvents(now: Date, lat: number, lng: number) {
  const today = sunTimes(now, lat, lng), tomorrow = sunTimes(new Date(now.getTime() + dayMs), lat, lng);
  return { sunrise: today.sunrise > now ? today.sunrise : tomorrow.sunrise, sunset: today.sunset > now ? today.sunset : tomorrow.sunset };
}
