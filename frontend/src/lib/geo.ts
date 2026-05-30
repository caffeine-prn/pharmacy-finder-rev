import type { MarkerData } from "./types";

export function distanceKm(from: [number, number], marker: Pick<MarkerData, "lat" | "lng">) {
  const [fromLat, fromLng] = from;
  const toLat = marker.lat;
  const toLng = marker.lng;
  const rad = Math.PI / 180;
  const earthKm = 6371;
  const dLat = (toLat - fromLat) * rad;
  const dLng = (toLng - fromLng) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(fromLat * rad) *
      Math.cos(toLat * rad) *
      Math.sin(dLng / 2) ** 2;
  return 2 * earthKm * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
