import * as Location from 'expo-location';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import { resolveRider } from '@/utils/riderLookup';

/**
 * Best-effort GPS coordinates for app-open logging.
 * Never throws: returns null coords when permission is denied or GPS fails,
 * so the open event is still recorded.
 */
async function getOpenCoordinates(): Promise<{ latitude: number; longitude: number } | null> {
  try {
    if (Platform.OS !== 'web') {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== Location.PermissionStatus.GRANTED) return null;
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      return {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
    }

    if (!navigator.geolocation) return null;
    return await new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) =>
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          }),
        () => resolve(null),
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 5 * 60 * 1000 },
      );
    });
  } catch {
    return null;
  }
}

/**
 * Records a rider app open with date/time and best-effort GPS location.
 * Runs once per rider app session; failures are silent so they never
 * block or interrupt the rider.
 */
export async function logRiderAppOpen(
  profileId: string,
  profileMobile: string | null | undefined,
): Promise<void> {
  try {
    const rider = await resolveRider(profileId, profileMobile, 'id');
    if (!rider) return;

    const coords = await getOpenCoordinates();

    await supabase.from('rider_app_opens').insert({
      rider_id: rider.id,
      latitude: coords?.latitude ?? null,
      longitude: coords?.longitude ?? null,
      location_source: coords ? 'gps' : 'unavailable',
      opened_at: new Date().toISOString(),
    });
  } catch {
    // App-open logging must never interfere with the rider's session.
  }
}
