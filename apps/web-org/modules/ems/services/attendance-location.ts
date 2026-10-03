/** Capture a fresh device position on a user action; never cache it or write it locally. */
export function captureAttendanceLocation(
  geolocation = typeof navigator === 'undefined' ? undefined : navigator.geolocation,
) {
  return new Promise<{ latitude: number; longitude: number; accuracyMeters: number }>(
    (resolve, reject) => {
      if (!geolocation) {
        reject(new Error('This browser does not support location access.'));
        return;
      }
      geolocation.getCurrentPosition(
        ({ coords }) => {
          if (
            !Number.isFinite(coords.latitude) ||
            Math.abs(coords.latitude) > 90 ||
            !Number.isFinite(coords.longitude) ||
            Math.abs(coords.longitude) > 180 ||
            !Number.isFinite(coords.accuracy) ||
            coords.accuracy < 0
          ) {
            reject(new Error('The device returned an invalid location. Try again.'));
            return;
          }
          resolve({
            latitude: coords.latitude,
            longitude: coords.longitude,
            accuracyMeters: coords.accuracy,
          });
        },
        (error) => {
          const messages: Record<number, string> = {
            1: 'Location permission was denied. Allow location access to record attendance.',
            2: 'Your device could not determine its location. Check location services and try again.',
            3: 'Location capture timed out. Try again where your device can obtain a GPS signal.',
          };
          reject(new Error(messages[error.code] ?? 'Unable to capture your location. Try again.'));
        },
        { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
      );
    },
  );
}
