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

const DEFAULT_LOCATION: MapLocation = { latitude: 20.2961, longitude: 85.8245 };

// Odisha bounding box (approximate state borders)
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

let leafletLoaded = false;

function loadLeaflet(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (leafletLoaded && (window as any).L) return Promise.resolve();
  if ((window as any).L) {
    leafletLoaded = true;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(css);

    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = () => {
      leafletLoaded = true;
      resolve();
    };
    script.onerror = () => resolve();
    document.head.appendChild(script);
  });
}

export default function MapPicker({ initialLocation, onLocationSelect, autoLocate = true }: MapPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const [selected, setSelected] = useState<MapLocation>(
    initialLocation ?? { ...DEFAULT_LOCATION },
  );
  const [searchText, setSearchText] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [reverseLabel, setReverseLabel] = useState<string>('');
  const [reverseLoading, setReverseLoading] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastReverseRef = useRef<string>('');
  const pendingCenterRef = useRef<MapLocation | null>(null);

  const reverseGeocode = useCallback(
    (lat: number, lng: number) => {
      const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
      if (key === lastReverseRef.current) return;
      lastReverseRef.current = key;
      setReverseLoading(true);
      fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
        { headers: { 'Accept-Language': 'en' } },
      )
        .then((r) => r.json())
        .then((json: { display_name?: string; address?: NominatimAddress }) => {
          const label = formatShortLabel(json.address, json.display_name ?? '');
          setReverseLabel(label);
          const loc: MapLocation = { latitude: lat, longitude: lng, label };
          setSelected(loc);
          onLocationSelect(loc);
        })
        .catch(() => {})
        .finally(() => setReverseLoading(false));
    },
    [onLocationSelect],
  );

  // Initialize Leaflet map
  useEffect(() => {
    let cancelled = false;
    loadLeaflet().then(() => {
      if (cancelled || !containerRef.current || !(window as any).L) return;
      const L = (window as any).L;
      const start = initialLocation ?? DEFAULT_LOCATION;

      const map = L.map(containerRef.current, {
        zoomControl: true,
        attributionControl: true,
        center: [start.latitude, start.longitude],
        zoom: 15,
        maxBounds: [
          [ODISHA_BOUNDS.north, ODISHA_BOUNDS.east],
          [ODISHA_BOUNDS.south, ODISHA_BOUNDS.west],
        ],
        maxBoundsViscosity: 0.9,
      });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map);

      const marker = L.marker([start.latitude, start.longitude], {
        draggable: true,
      }).addTo(map);
      marker.bindPopup(start.label ?? 'Delivery location').openPopup();

      marker.on('dragend', () => {
        const ll = marker.getLatLng();
        const loc: MapLocation = { latitude: ll.lat, longitude: ll.lng };
        setSelected(loc);
        setReverseLabel('');
        onLocationSelect(loc);
        reverseGeocode(ll.lat, ll.lng);
      });

      map.on('click', (e: any) => {
        if (!isInOdisha(e.latlng.lat, e.latlng.lng)) return;
        marker.setLatLng(e.latlng);
        const loc: MapLocation = { latitude: e.latlng.lat, longitude: e.latlng.lng };
        setSelected(loc);
        setReverseLabel('');
        onLocationSelect(loc);
        reverseGeocode(e.latlng.lat, e.latlng.lng);
      });

      mapRef.current = map;
      markerRef.current = marker;
      setMapReady(true);

      if (pendingCenterRef.current) {
        const loc = pendingCenterRef.current;
        pendingCenterRef.current = null;
        map.setView([loc.latitude, loc.longitude], 16);
        marker.setLatLng([loc.latitude, loc.longitude]);
        if (loc.label) marker.bindPopup(loc.label).openPopup();
      }
    });

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recenter when initialLocation changes (editing a different address)
  useEffect(() => {
    if (!initialLocation) return;
    setSelected(initialLocation);
    setReverseLabel(initialLocation.label ?? '');
    if (mapRef.current && markerRef.current) {
      mapRef.current.setView([initialLocation.latitude, initialLocation.longitude], 16);
      markerRef.current.setLatLng([initialLocation.latitude, initialLocation.longitude]);
      if (initialLocation.label) {
        markerRef.current.bindPopup(initialLocation.label).openPopup();
      }
    } else {
      pendingCenterRef.current = initialLocation;
    }
  }, [initialLocation]);

  // Search via Nominatim
  const performSearch = useCallback((query: string) => {
    if (!query.trim()) {
      setResults([]);
      setShowResults(false);
      return;
    }
    setSearching(true);
    fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=15&addressdetails=1&countrycodes=IN&viewbox=${ODISHA_VIEWBOX}&bounded=1`,
      { headers: { 'Accept-Language': 'en' } },
    )
      .then((r) => r.json())
      .then((json: SearchResult[]) => {
        const odishaResults = (json ?? [])
          .filter((r) => isInOdisha(parseFloat(r.lat), parseFloat(r.lon)))
          .map((r) => ({
            ...r,
            shortLabel: formatShortLabel(r.address, r.display_name),
          }));
        setResults(odishaResults);
        setShowResults(true);
      })
      .catch(() => setResults([]))
      .finally(() => setSearching(false));
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
      setSelected(loc);
      setReverseLabel(label);
      onLocationSelect(loc);
      setShowResults(false);
      setSearchText(label.split(',')[0] ?? '');
      Keyboard.dismiss();
      if (mapRef.current && markerRef.current) {
        markerRef.current.setLatLng([lat, lng]);
        mapRef.current.flyTo([lat, lng], 16, { animate: true, duration: 0.6 });
        markerRef.current.bindPopup(label).openPopup();
        mapRef.current.invalidateSize();
      }
    },
    [onLocationSelect],
  );

  const useCurrentLocation = useCallback(() => {
    if (Platform.OS !== 'web') return;
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const loc: MapLocation = { latitude: lat, longitude: lng };
        setSelected(loc);
        onLocationSelect(loc);
        if (mapRef.current && markerRef.current) {
          markerRef.current.setLatLng([lat, lng]);
          mapRef.current.flyTo([lat, lng], 16, { animate: true, duration: 0.6 });
          mapRef.current.invalidateSize();
        } else {
          pendingCenterRef.current = loc;
        }
        reverseGeocode(lat, lng);
      },
      () => {},
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, [onLocationSelect, reverseGeocode]);

  useEffect(() => {
    if (!autoLocate || initialLocation || typeof navigator === 'undefined' || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        if (!isInOdisha(lat, lng)) return;
        const loc: MapLocation = { latitude: lat, longitude: lng };
        setSelected(loc);
        onLocationSelect(loc);
        if (mapRef.current && markerRef.current) {
          markerRef.current.setLatLng([lat, lng]);
          mapRef.current.flyTo([lat, lng], 16, { animate: true, duration: 0.6 });
          mapRef.current.invalidateSize();
        } else {
          pendingCenterRef.current = loc;
        }
        reverseGeocode(lat, lng);
      },
      () => {},
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 },
    );
  }, [autoLocate, initialLocation, onLocationSelect, reverseGeocode]);

  return (
    <View style={styles.container}>
      {/* Search bar */}
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
          <Crosshair size={16} color={Colors.primary} strokeWidth={2} />
        </TouchableOpacity>
      </View>

      {/* Search results dropdown */}
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

      {/* Map */}
      <View style={styles.mapWrap}>
        <div
          ref={containerRef}
          style={{ width: '100%', height: '100%', zIndex: 1 }}
        />
        {!mapReady && (
          <View style={styles.mapLoading} pointerEvents="none">
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        )}
        {/* Coordinates overlay */}
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
  mapLoading: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
