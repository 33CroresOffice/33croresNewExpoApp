import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Platform,
  Keyboard,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import { MapPin, Search, X, Crosshair, Check } from 'lucide-react-native';
import { Colors, Typography, Spacing, Radius } from '@/constants/theme';
import { formatShortLabel, NominatimAddress } from '@/utils/mapLabels';

export interface MapLocation {
  latitude: number;
  longitude: number;
  label?: string;
}

interface SearchResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  address?: NominatimAddress;
  shortLabel?: string;
}

interface MapPickerProps {
  initialLocation?: MapLocation | null;
  onLocationSelect: (location: MapLocation) => void;
  autoLocate?: boolean;
}

const DEFAULT_LOCATION = { latitude: 20.2961, longitude: 85.8245 };

const ODISHA_BOUNDS = {
  south: 17.48,
  west: 81.22,
  north: 22.55,
  east: 87.45,
};

function isInOdisha(lat: number, lng: number): boolean {
  return (
    lat >= ODISHA_BOUNDS.south &&
    lat <= ODISHA_BOUNDS.north &&
    lng >= ODISHA_BOUNDS.west &&
    lng <= ODISHA_BOUNDS.east
  );
}

const ODISHA_VIEWBOX = `${ODISHA_BOUNDS.west},${ODISHA_BOUNDS.south},${ODISHA_BOUNDS.east},${ODISHA_BOUNDS.north}`;

export default function MapPicker({ initialLocation, onLocationSelect }: MapPickerProps) {
  const [selected, setSelected] = useState<MapLocation>(
    initialLocation ?? { ...DEFAULT_LOCATION },
  );
  const [searchText, setSearchText] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [reverseLabel, setReverseLabel] = useState<string>('');
  const [reverseLoading, setReverseLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastReverseRef = useRef<string>('');
  const mapRef = useRef<MapView>(null);

  useEffect(() => {
    (async () => {
      if (Platform.OS === 'web') return;
      await Location.requestForegroundPermissionsAsync().catch(() => ({
        status: 'undetermined',
      }));
    })();
  }, []);

  useEffect(() => {
    if (!initialLocation) return;
    setSelected(initialLocation);
    setReverseLabel(initialLocation.label ?? '');
  }, [initialLocation]);

  const reverseGeocode = useCallback(
    async (lat: number, lng: number) => {
      const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
      if (key === lastReverseRef.current) return;
      lastReverseRef.current = key;
      setReverseLoading(true);
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
          { headers: { 'Accept-Language': 'en' } },
        );
        const json = (await res.json()) as { display_name?: string; address?: NominatimAddress };
        const label = formatShortLabel(json.address, json.display_name ?? '');
        setReverseLabel(label);
        onLocationSelect({ latitude: lat, longitude: lng, label });
      } catch {
        // ignore
      } finally {
        setReverseLoading(false);
      }
    },
    [onLocationSelect],
  );

  const performSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setResults([]);
      setShowResults(false);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=15&addressdetails=1&countrycodes=IN&viewbox=${ODISHA_VIEWBOX}&bounded=1`,
        { headers: { 'Accept-Language': 'en' } },
      );
      const json = (await res.json()) as SearchResult[];
      const odishaResults = (json ?? [])
        .filter((r) => isInOdisha(parseFloat(r.lat), parseFloat(r.lon)))
        .map((r) => ({
          ...r,
          shortLabel: formatShortLabel(r.address, r.display_name),
        }));
      setResults(odishaResults);
      setShowResults(true);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  const onSearchTextChange = useCallback(
    (text: string) => {
      setSearchText(text);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => performSearch(text), 500);
    },
    [performSearch],
  );

  const onSelectResult = useCallback(
    (res: SearchResult) => {
      const lat = parseFloat(res.lat);
      const lng = parseFloat(res.lon);
      const label = res.shortLabel ?? formatShortLabel(res.address, res.display_name);
      const loc: MapLocation = { latitude: lat, longitude: lng, label };
      lastReverseRef.current = `${lat.toFixed(5)},${lng.toFixed(5)}`;
      setSelected(loc);
      setReverseLabel(label);
      onLocationSelect(loc);
      setShowResults(false);
      setSearchText(label.split(',')[0] ?? '');
      Keyboard.dismiss();
      mapRef.current?.animateToRegion(
        { latitude: lat, longitude: lng, latitudeDelta: 0.01, longitudeDelta: 0.01 },
        300,
      );
    },
    [onLocationSelect],
  );

  const useCurrentLocation = useCallback(async () => {
    if (Platform.OS === 'web') return;
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocating(false);
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const loc: MapLocation = { latitude: lat, longitude: lng };
      setSelected(loc);
      onLocationSelect(loc);
      mapRef.current?.animateToRegion(
        { latitude: lat, longitude: lng, latitudeDelta: 0.01, longitudeDelta: 0.01 },
        300,
      );
      reverseGeocode(lat, lng);
    } catch {
      // ignore
    } finally {
      setLocating(false);
    }
  }, [onLocationSelect, reverseGeocode]);



  return (
    <View style={styles.container}>
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Search size={16} color={Colors.textTertiary} strokeWidth={1.8} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search Odisha areas, streets, landmarks..."
            placeholderTextColor={Colors.textDisabled}
            value={searchText}
            onChangeText={onSearchTextChange}
            autoCorrect={false}
            returnKeyType="search"
            onFocus={() => results.length > 0 && setShowResults(true)}
          />
          {searching ? (
            <ActivityIndicator size="small" color={Colors.primary} />
          ) : searchText.length > 0 ? (
            <TouchableOpacity
              onPress={() => {
                setSearchText('');
                setResults([]);
                setShowResults(false);
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <X size={16} color={Colors.textTertiary} strokeWidth={2} />
            </TouchableOpacity>
          ) : null}
        </View>
        <TouchableOpacity style={styles.gpsBtn} onPress={useCurrentLocation} activeOpacity={0.7}>
          {locating ? (
            <ActivityIndicator size="small" color={Colors.primary} />
          ) : (
            <Crosshair size={16} color={Colors.primary} strokeWidth={2} />
          )}
        </TouchableOpacity>
      </View>

      {showResults && results.length > 0 && (
        <View style={styles.resultsDropdown}>
          {results.map((res) => (
            <TouchableOpacity
              key={res.place_id}
              style={styles.resultItem}
              onPress={() => onSelectResult(res)}
              activeOpacity={0.7}
            >
              <MapPin size={15} color={Colors.textTertiary} strokeWidth={1.8} />
              <Text style={styles.resultText} numberOfLines={2}>
                {res.shortLabel ?? res.display_name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={styles.mapWrap}>
        <MapView
          ref={mapRef}
          style={styles.map}
          initialRegion={{
            latitude: initialLocation?.latitude ?? DEFAULT_LOCATION.latitude,
            longitude: initialLocation?.longitude ?? DEFAULT_LOCATION.longitude,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          }}
          onPress={(e) => {
            const { latitude, longitude } = e.nativeEvent.coordinate;
            const loc: MapLocation = { latitude, longitude };
            setSelected(loc);
            onLocationSelect(loc);
            reverseGeocode(latitude, longitude);
          }}
          showsUserLocation
          showsCompass
        >
          <Marker
            draggable
            coordinate={{ latitude: selected.latitude, longitude: selected.longitude }}
            title={reverseLabel || 'Delivery location'}
            onDragEnd={(e) => {
              const { latitude, longitude } = e.nativeEvent.coordinate;
              const loc: MapLocation = { latitude, longitude };
              setSelected(loc);
              onLocationSelect(loc);
              reverseGeocode(latitude, longitude);
            }}
          />
        </MapView>
        <View style={styles.coordOverlay} pointerEvents="none">
          <View style={styles.coordPill}>
            {reverseLoading ? (
              <ActivityIndicator size="small" color={Colors.primary} />
            ) : (
              <Check size={13} color={Colors.primary} strokeWidth={2.5} />
            )}
            <Text style={styles.coordText} numberOfLines={1}>
              {reverseLabel
                ? reverseLabel
                : `${selected.latitude.toFixed(5)}, ${selected.longitude.toFixed(5)}`}
            </Text>
          </View>
        </View>
      </View>

      <Text style={styles.hintText}>
        Drag the pin or tap the map to set your exact delivery location.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing[2] },
  searchRow: { flexDirection: 'row', gap: Spacing[2] },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing[3],
    paddingVertical: Platform.OS === 'web' ? 10 : Spacing[2],
    backgroundColor: Colors.white,
  },
  searchInput: {
    flex: 1,
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
    paddingVertical: 0,
    paddingHorizontal: 0,
  },
  gpsBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    backgroundColor: Colors.white,
  },
  resultsDropdown: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    backgroundColor: Colors.white,
    overflow: 'hidden',
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing[2],
    paddingVertical: Spacing[3],
    paddingHorizontal: Spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  resultText: {
    flex: 1,
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  mapWrap: {
    height: 260,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.neutral[100],
  },
  map: { flex: 1 },
  coordOverlay: {
    position: 'absolute',
    bottom: Spacing[2],
    left: Spacing[2],
    right: Spacing[2],
    alignItems: 'center',
  },
  coordPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[1],
    borderRadius: Radius.full,
    backgroundColor: 'rgba(255,255,255,0.95)',
    shadowColor: '#1A1917',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
  },
  coordText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.xs,
    color: Colors.textPrimary,
  },
  hintText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
    textAlign: 'center',
  },
});
