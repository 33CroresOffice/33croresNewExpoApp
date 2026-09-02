export interface NominatimAddress {
  road?: string;
  pedestrian?: string;
  footway?: string;
  path?: string;
  cycleway?: string;
  square?: string;
  place?: string;
  neighbourhood?: string;
  quarter?: string;
  suburb?: string;
  city_district?: string;
  district?: string;
  borough?: string;
  locality?: string;
  hamlet?: string;
  village?: string;
  town?: string;
  city?: string;
  county?: string;
  state_district?: string;
  state?: string;
  postcode?: string;
  country?: string;
  amenity?: string;
  shop?: string;
  tourism?: string;
  leisure?: string;
  historic?: string;
  building?: string;
  house_number?: string;
  house?: string;
  railway?: string;
  bus_stop?: string;
  train_station?: string;
  university?: string;
  college?: string;
  school?: string;
  hospital?: string;
  clinic?: string;
  restaurant?: string;
  hotel?: string;
  bank?: string;
  fuel?: string;
  parking?: string;
  marketplace?: string;
  supermarket?: string;
  mall?: string;
  cinema?: string;
  theatre?: string;
  library?: string;
  museum?: string;
  park?: string;
  garden?: string;
  playground?: string;
  forest?: string;
  cemetery?: string;
  church?: string;
  temple?: string;
  mosque?: string;
  hindu?: string;
  place_of_worship?: string;
  monument?: string;
  memorial?: string;
  viewpoint?: string;
  artwork?: string;
  zoo?: string;
  aquarium?: string;
  attraction?: string;
}

const NOISE_PATTERNS: RegExp[] = [
  /^ward\b/i,
  /municipal corporation/i,
  /municipality/i,
  /tehsil/i,
  /^block\b/i,
  /revenue division/i,
  /development authority/i,
  /notified area/i,
  /nagar panchayat/i,
  /zilla parishad/i,
  /gram panchayat/i,
  /police station/i,
  /post office/i,
  /circle division/i,
];

function isNoise(part: string): boolean {
  return NOISE_PATTERNS.some((p) => p.test(part.trim()));
}

export function formatShortLabel(
  address: NominatimAddress | undefined,
  displayName: string,
): string {
  if (address) {
    const parts: string[] = [];

    const namedPlace =
      address.tourism || address.amenity || address.shop || address.leisure ||
      address.historic || address.building || address.railway || address.bus_stop ||
      address.train_station || address.university || address.college ||
      address.school || address.hospital || address.clinic || address.restaurant ||
      address.hotel || address.bank || address.fuel || address.parking ||
      address.marketplace || address.supermarket || address.mall ||
      address.cinema || address.theatre || address.library || address.museum ||
      address.park || address.garden || address.playground || address.forest ||
      address.cemetery || address.church || address.temple || address.mosque ||
      address.hindu || address.place_of_worship || address.monument ||
      address.memorial || address.viewpoint || address.artwork || address.zoo ||
      address.aquarium || address.attraction || address.square || address.place;

    const road =
      address.road || address.pedestrian || address.footway ||
      address.path || address.cycleway;

    const area =
      address.neighbourhood || address.quarter || address.suburb ||
      address.city_district || address.district || address.borough ||
      address.locality;

    const city = address.city || address.town || address.village || address.hamlet;

    if (namedPlace) parts.push(namedPlace);
    if (road && road !== namedPlace && !parts.includes(road)) parts.push(road);
    if (area && !parts.includes(area)) parts.push(area);
    if (city && !parts.includes(city)) parts.push(city);

    if (parts.length >= 2) return parts.slice(0, 3).join(', ');
    if (parts.length === 1 && city && city !== parts[0]) {
      parts.push(city);
      return parts.slice(0, 3).join(', ');
    }
    if (parts.length >= 1) return parts.join(', ');
  }

  const allParts = displayName.split(',').map((s) => s.trim()).filter(Boolean);
  const filtered = allParts.filter((p) => !isNoise(p));
  return filtered.slice(0, 3).join(', ') || allParts.slice(0, 2).join(', ');
}
