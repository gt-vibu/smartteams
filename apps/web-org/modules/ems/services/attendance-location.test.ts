import { describe, expect, it, vi } from 'vitest';
import { captureAttendanceLocation } from './attendance-location';

function device(latitude = 0, longitude = 0, accuracy = 0) {
  const getCurrentPosition = vi.fn((success: PositionCallback) =>
    success({
      coords: {
        latitude,
        longitude,
        accuracy,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: null,
      },
      timestamp: Date.now(),
    } as GeolocationPosition),
  );
  return { geolocation: { getCurrentPosition } as unknown as Geolocation, getCurrentPosition };
}

describe('attendance browser position capture', () => {
  it('captures zero coordinates and accuracy without treating them as missing', async () => {
    const { geolocation, getCurrentPosition } = device();
    await expect(captureAttendanceLocation(geolocation)).resolves.toEqual({
      latitude: 0,
      longitude: 0,
      accuracyMeters: 0,
    });
    expect(getCurrentPosition).toHaveBeenCalledWith(expect.any(Function), expect.any(Function), {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0,
    });
  });
  it('requests a new location for both actions instead of reusing a cached position', async () => {
    const { geolocation, getCurrentPosition } = device(12.97, 77.59, 5);
    await captureAttendanceLocation(geolocation);
    await captureAttendanceLocation(geolocation);
    expect(getCurrentPosition).toHaveBeenCalledTimes(2);
  });
  it('reports unsupported browsers', async () => {
    vi.stubGlobal('navigator', {});
    try {
      await expect(captureAttendanceLocation()).rejects.toThrow('does not support location');
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it.each([
    [1, 'denied'],
    [2, 'determine its location'],
    [3, 'timed out'],
  ])('reports location failure %i clearly', async (code, message) => {
    const geolocation = {
      getCurrentPosition: (_success: PositionCallback, failure: PositionErrorCallback) =>
        failure({ code } as GeolocationPositionError),
    } as unknown as Geolocation;
    await expect(captureAttendanceLocation(geolocation)).rejects.toThrow(String(message));
  });
  it.each([
    [NaN, 0, 0],
    [0, Infinity, 0],
    [91, 0, 0],
    [0, -181, 0],
    [0, 0, -1],
    [0, 0, NaN],
  ])('rejects invalid device coordinates %j', async (latitude, longitude, accuracy) => {
    await expect(
      captureAttendanceLocation(device(latitude, longitude, accuracy).geolocation),
    ).rejects.toThrow('invalid location');
  });
});
