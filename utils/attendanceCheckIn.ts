import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export function todayISTString(): string {
  return new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

export interface AttendanceLocation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius_meters: number;
}

export interface CurrentCoordinates {
  latitude: number;
  longitude: number;
}

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function getCurrentCoordinates(): Promise<CurrentCoordinates> {
  if (Platform.OS !== 'web') {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== Location.PermissionStatus.GRANTED) {
      throw new Error('LOCATION_PERMISSION_DENIED');
    }
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });
    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    };
  }

  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('LOCATION_UNAVAILABLE'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        }),
      () => reject(new Error('LOCATION_UNAVAILABLE')),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  });
}

async function ensureNotificationPermission(): Promise<void> {
  if (Platform.OS === 'web') return;
  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') {
    throw new Error('NOTIFICATION_PERMISSION_DENIED');
  }
}

export async function performAttendanceCheckIn(
  locations: AttendanceLocation[],
): Promise<{ coordinates: CurrentCoordinates; matchedLocation: AttendanceLocation }> {
  if (locations.length === 0) {
    throw new Error('NO_LOCATIONS');
  }

  await ensureNotificationPermission();

  const coordinates = await getCurrentCoordinates();
  const { latitude: userLat, longitude: userLng } = coordinates;

  let matchedLocation: AttendanceLocation | null = null;
  let minDist = Infinity;
  for (const loc of locations) {
    const dist = haversineMeters(userLat, userLng, loc.latitude, loc.longitude);
    if (dist <= loc.radius_meters && dist < minDist) {
      minDist = dist;
      matchedLocation = loc;
    }
  }

  if (!matchedLocation) {
    const nearest = locations.reduce((best, loc) => {
      const d = haversineMeters(userLat, userLng, loc.latitude, loc.longitude);
      return d < haversineMeters(userLat, userLng, best.latitude, best.longitude)
        ? loc
        : best;
    }, locations[0]);
    const nearestDist = Math.round(
      haversineMeters(userLat, userLng, nearest.latitude, nearest.longitude),
    );
    throw new Error(
      `OUT_OF_RANGE:${nearestDist}:${nearest.name}:${nearest.radius_meters}`,
    );
  }

  return { coordinates, matchedLocation };
}

export function getCheckInErrorMessage(err: unknown): string {
  if (!(err instanceof Error)) {
    return 'Could not mark attendance. Please try again.';
  }
  const msg = err.message;
  if (msg === 'NO_LOCATIONS') {
    return 'No attendance locations have been set up. Please contact your admin.';
  }
  if (msg === 'LOCATION_PERMISSION_DENIED') {
    return 'Location permission was denied. Enable location access in Settings to mark attendance.';
  }
  if (msg === 'LOCATION_UNAVAILABLE') {
    return 'Could not detect your location. Check your GPS signal and try again.';
  }
  if (msg === 'NOTIFICATION_PERMISSION_DENIED') {
    return 'Notification permission was denied. Enable notifications in Settings to receive assignment updates.';
  }
  if (msg.startsWith('OUT_OF_RANGE:')) {
    const [, dist, name, radius] = msg.split(':');
    return `You are ${dist}m away from "${name}" (allowed within ${radius}m). Move closer to an approved location to check in.`;
  }
  return 'Could not mark attendance. Please try again.';
}
