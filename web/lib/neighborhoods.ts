/**
 * NYC Neighborhood ↔ Google Places District mappings
 *
 * Google Places uses broad district names (e.g., "Northwest Brooklyn")
 * but New Yorkers search by actual neighborhood names (e.g., "Park Slope").
 * This module bridges that gap.
 */

/**
 * Maps common neighborhood names (lowercase) → Google Places district names.
 * Used to translate user search input into DB-compatible filters.
 */
export const NEIGHBORHOOD_ALIASES: Record<string, string[]> = {
  // Brooklyn — Northwest Brooklyn
  "downtown brooklyn": ["Northwest Brooklyn"],
  "brooklyn heights": ["Northwest Brooklyn"],
  "dumbo": ["Northwest Brooklyn"],
  "cobble hill": ["Northwest Brooklyn"],
  "boerum hill": ["Northwest Brooklyn"],
  "carroll gardens": ["Northwest Brooklyn"],
  "fort greene": ["Northwest Brooklyn"],
  "clinton hill": ["Northwest Brooklyn"],
  "vinegar hill": ["Northwest Brooklyn"],

  // Brooklyn — Central Brooklyn
  "prospect heights": ["Central Brooklyn"],
  "crown heights": ["Central Brooklyn"],
  "bed-stuy": ["Central Brooklyn"],
  "bedford-stuyvesant": ["Central Brooklyn"],
  "prospect lefferts gardens": ["Central Brooklyn"],
  "plg": ["Central Brooklyn"],

  // Brooklyn — Borough Park / Park Slope area
  "park slope": ["Borough Park"],
  "south slope": ["Borough Park"],
  "windsor terrace": ["Borough Park"],
  "greenwood heights": ["Borough Park"],
  "borough park": ["Borough Park"],
  "kensington": ["Borough Park"],
  "ditmas park": ["Borough Park"],

  // Brooklyn — Sunset Park
  "sunset park": ["Sunset Park", "Borough Park"],
  "industry city": ["Sunset Park"],

  // Brooklyn — Bushwick & Williamsburg
  "williamsburg": ["Bushwick and Williamsburg", "Greenpoint"],
  "south williamsburg": ["Bushwick and Williamsburg"],
  "east williamsburg": ["Bushwick and Williamsburg", "Greenpoint"],
  "bushwick": ["Bushwick and Williamsburg"],

  // Brooklyn — Greenpoint
  "greenpoint": ["Greenpoint"],

  // Brooklyn — Flatbush
  "flatbush": ["Flatbush"],
  "east flatbush": ["Flatbush"],
  "midwood": ["Flatbush"],
  "marine park": ["Flatbush"],

  // Brooklyn — Southwest (Bay Ridge)
  "bay ridge": ["Southwest Brooklyn"],
  "dyker heights": ["Southwest Brooklyn"],
  "fort hamilton": ["Southwest Brooklyn"],
  "bensonhurst": ["Southwest Brooklyn", "Southern Brooklyn"],

  // Brooklyn — Southern
  "brighton beach": ["Southern Brooklyn"],
  "coney island": ["Southern Brooklyn"],
  "sheepshead bay": ["Southern Brooklyn"],
  "manhattan beach": ["Southern Brooklyn"],
  "gravesend": ["Southern Brooklyn"],

  // Brooklyn — Canarsie & Flatlands
  "canarsie": ["Canarsie and Flatlands"],
  "flatlands": ["Canarsie and Flatlands"],
  "mill basin": ["Canarsie and Flatlands"],
  "bergen beach": ["Canarsie and Flatlands"],

  // Brooklyn — East New York
  "east new york": ["East New York and New Lots"],
  "brownsville": ["East New York and New Lots"],
  "cypress hills": ["East New York and New Lots"],

  // Manhattan — Chelsea & Clinton
  "chelsea": ["Chelsea and Clinton"],
  "hells kitchen": ["Chelsea and Clinton"],
  "hell's kitchen": ["Chelsea and Clinton"],
  "midtown west": ["Chelsea and Clinton"],
  "midtown": ["Chelsea and Clinton"],
  "times square": ["Chelsea and Clinton"],
  "theater district": ["Chelsea and Clinton"],
  "hudson yards": ["Chelsea and Clinton"],

  // Manhattan — Gramercy & Murray Hill
  "gramercy": ["Gramercy Park and Murray Hill"],
  "gramercy park": ["Gramercy Park and Murray Hill"],
  "murray hill": ["Gramercy Park and Murray Hill"],
  "flatiron": ["Gramercy Park and Murray Hill"],
  "nomad": ["Gramercy Park and Murray Hill"],
  "kips bay": ["Gramercy Park and Murray Hill"],
  "union square": ["Gramercy Park and Murray Hill"],

  // Manhattan — Greenwich Village & SoHo
  "greenwich village": ["Greenwich Village and Soho"],
  "west village": ["Greenwich Village and Soho"],
  "soho": ["Greenwich Village and Soho"],
  "noho": ["Greenwich Village and Soho"],
  "nolita": ["Greenwich Village and Soho"],
  "little italy": ["Greenwich Village and Soho"],
  "east village": ["Greenwich Village and Soho"],

  // Manhattan — Upper East Side
  "upper east side": ["Upper East Side"],
  "ues": ["Upper East Side"],
  "yorkville": ["Upper East Side"],
  "lenox hill": ["Upper East Side"],
  "carnegie hill": ["Upper East Side"],

  // Manhattan — Upper West Side
  "upper west side": ["Upper West Side"],
  "uws": ["Upper West Side"],
  "lincoln square": ["Upper West Side"],
  "manhattan valley": ["Upper West Side"],

  // Manhattan — Lower East Side
  "lower east side": ["Lower East Side"],
  "les": ["Lower East Side"],
  "two bridges": ["Lower East Side"],
  "alphabet city": ["Lower East Side"],

  // Manhattan — Lower Manhattan
  "financial district": ["Lower Manhattan"],
  "fidi": ["Lower Manhattan"],
  "tribeca": ["Lower Manhattan"],
  "battery park city": ["Lower Manhattan"],
  "wall street": ["Lower Manhattan"],
  "seaport": ["Lower Manhattan"],

  // Manhattan — Harlem
  "harlem": ["Central Harlem"],
  "central harlem": ["Central Harlem"],
  "east harlem": ["East Harlem"],
  "el barrio": ["East Harlem"],
  "spanish harlem": ["East Harlem"],

  // Manhattan — Washington Heights & Inwood
  "washington heights": ["Inwood and Washington Heights"],
  "inwood": ["Inwood and Washington Heights"],
  "hudson heights": ["Inwood and Washington Heights"],

  // Queens — Northwest (Astoria / LIC)
  "astoria": ["Northwest Queens"],
  "long island city": ["Northwest Queens"],
  "lic": ["Northwest Queens"],
  "sunnyside": ["Northwest Queens"],
  "woodside": ["Northwest Queens"],

  // Queens — West (Jackson Heights / Corona)
  "jackson heights": ["West Queens"],
  "corona": ["West Queens"],
  "elmhurst": ["West Queens"],
  "east elmhurst": ["West Queens"],

  // Queens — North (Flushing)
  "flushing": ["North Queens"],
  "college point": ["North Queens"],
  "whitestone": ["North Queens"],
  "bayside": ["North Queens", "Northeast Queens"],

  // Queens — West Central (Forest Hills)
  "forest hills": ["West Central Queens"],
  "rego park": ["West Central Queens"],
  "kew gardens": ["West Central Queens"],
  "briarwood": ["West Central Queens"],
  "middle village": ["West Central Queens"],
  "glendale": ["West Central Queens"],
  "maspeth": ["West Central Queens"],

  // Queens — Jamaica
  "jamaica": ["Jamaica"],
  "hollis": ["Jamaica"],
  "st. albans": ["Jamaica"],
  "st albans": ["Jamaica"],
  "queens village": ["Jamaica"],
  "south jamaica": ["Jamaica"],

  // Queens — Northeast
  "little neck": ["Northeast Queens"],
  "douglaston": ["Northeast Queens"],
  "oakland gardens": ["Northeast Queens"],
  "fresh meadows": ["Northeast Queens"],
  "glen oaks": ["Northeast Queens"],
  "bellerose": ["Northeast Queens"],

  // Queens — Southeast
  "cambria heights": ["Southeast Queens"],
  "laurelton": ["Southeast Queens"],
  "springfield gardens": ["Southeast Queens"],

  // Queens — Southwest
  "ozone park": ["Southwest Queens"],
  "south ozone park": ["Southwest Queens", "Southeast Queens"],
  "howard beach": ["Southwest Queens"],
  "richmond hill": ["West Central Queens", "Southwest Queens"],
  "woodhaven": ["West Central Queens", "Southwest Queens"],

  // Queens — Rockaways
  "far rockaway": ["Rockaways"],
  "rockaway beach": ["Rockaways"],
  "rockaway park": ["Rockaways"],
  "the rockaways": ["Rockaways"],

  // Bronx — South
  "south bronx": ["Hunts Point and Mott Haven"],
  "mott haven": ["Hunts Point and Mott Haven"],
  "hunts point": ["Hunts Point and Mott Haven"],
  "melrose": ["Hunts Point and Mott Haven"],

  // Bronx — Highbridge & Morrisania
  "highbridge": ["High Bridge and Morrisania"],
  "morrisania": ["High Bridge and Morrisania"],
  "concourse": ["High Bridge and Morrisania"],
  "mount eden": ["High Bridge and Morrisania"],

  // Bronx — Central
  "tremont": ["Central Bronx"],
  "belmont": ["Central Bronx"],
  "arthur avenue": ["Central Bronx"],
  "west farms": ["Central Bronx"],
  "morris heights": ["Central Bronx"],
  "university heights": ["Central Bronx"],

  // Bronx — Fordham
  "fordham": ["Bronx Park and Fordham"],
  "bedford park": ["Bronx Park and Fordham"],
  "norwood": ["Bronx Park and Fordham"],

  // Bronx — Kingsbridge & Riverdale
  "kingsbridge": ["Kingsbridge and Riverdale"],
  "riverdale": ["Kingsbridge and Riverdale"],
  "marble hill": ["Kingsbridge and Riverdale"],

  // Bronx — Southeast
  "soundview": ["Southeast Bronx"],
  "parkchester": ["Southeast Bronx"],
  "castle hill": ["Southeast Bronx"],
  "throgs neck": ["Southeast Bronx", "Northeast Bronx"],

  // Bronx — Northeast
  "pelham bay": ["Northeast Bronx"],
  "co-op city": ["Northeast Bronx"],
  "eastchester": ["Northeast Bronx"],
  "wakefield": ["Northeast Bronx"],
  "woodlawn": ["Northeast Bronx"],

  // Staten Island — North
  "st. george": ["Stapleton and St. George"],
  "st george": ["Stapleton and St. George"],
  "stapleton": ["Stapleton and St. George"],
  "tompkinsville": ["Stapleton and St. George"],

  // Staten Island — Port Richmond
  "port richmond": ["Port Richmond"],
  "west brighton": ["Port Richmond"],
  "westerleigh": ["Port Richmond"],
  "mariners harbor": ["Port Richmond"],

  // Staten Island — South Shore
  "new dorp": ["South Shore"],
  "great kills": ["South Shore"],
  "tottenville": ["South Shore"],
  "eltingville": ["South Shore"],

  // Staten Island — Mid-Island
  "todt hill": ["Mid-Island"],
  "bulls head": ["Mid-Island"],
  "willowbrook": ["Mid-Island"],
};

/**
 * Reverse mapping: Google Places district → common neighborhood names.
 * Used for display — showing users friendly names instead of district codes.
 */
export const DISTRICT_TO_NEIGHBORHOODS: Record<string, string[]> = {
  // Brooklyn
  "Northwest Brooklyn": ["Downtown Brooklyn", "Brooklyn Heights", "DUMBO", "Cobble Hill", "Boerum Hill", "Carroll Gardens", "Fort Greene", "Clinton Hill"],
  "Central Brooklyn": ["Prospect Heights", "Crown Heights", "Bed-Stuy", "Prospect Lefferts Gardens"],
  "Borough Park": ["Park Slope", "South Slope", "Windsor Terrace", "Borough Park", "Kensington", "Ditmas Park"],
  "Sunset Park": ["Sunset Park", "Industry City"],
  "Bushwick and Williamsburg": ["Williamsburg", "South Williamsburg", "Bushwick"],
  "Greenpoint": ["Greenpoint", "Williamsburg", "East Williamsburg"],
  "Flatbush": ["Flatbush", "East Flatbush", "Midwood", "Marine Park"],
  "Southwest Brooklyn": ["Bay Ridge", "Dyker Heights", "Fort Hamilton", "Bensonhurst"],
  "Southern Brooklyn": ["Brighton Beach", "Coney Island", "Sheepshead Bay", "Manhattan Beach", "Gravesend"],
  "Canarsie and Flatlands": ["Canarsie", "Flatlands", "Mill Basin", "Bergen Beach"],
  "East New York and New Lots": ["East New York", "Brownsville", "Cypress Hills"],

  // Manhattan
  "Chelsea and Clinton": ["Chelsea", "Hell's Kitchen", "Midtown West", "Midtown", "Times Square", "Hudson Yards"],
  "Gramercy Park and Murray Hill": ["Gramercy Park", "Murray Hill", "Flatiron", "NoMad", "Kips Bay", "Union Square"],
  "Greenwich Village and Soho": ["Greenwich Village", "West Village", "SoHo", "NoHo", "Nolita", "Little Italy", "East Village"],
  "Upper East Side": ["Upper East Side", "Yorkville", "Lenox Hill", "Carnegie Hill"],
  "Upper West Side": ["Upper West Side", "Lincoln Square", "Manhattan Valley"],
  "Lower East Side": ["Lower East Side", "Two Bridges", "Alphabet City"],
  "Lower Manhattan": ["Financial District", "Tribeca", "Battery Park City", "Seaport", "Wall Street"],
  "Central Harlem": ["Harlem", "Central Harlem"],
  "East Harlem": ["East Harlem", "El Barrio", "Spanish Harlem"],
  "Inwood and Washington Heights": ["Washington Heights", "Inwood", "Hudson Heights"],

  // Queens
  "Northwest Queens": ["Astoria", "Long Island City", "LIC", "Sunnyside", "Woodside"],
  "West Queens": ["Jackson Heights", "Corona", "Elmhurst", "East Elmhurst"],
  "North Queens": ["Flushing", "College Point", "Whitestone", "Bayside"],
  "West Central Queens": ["Forest Hills", "Rego Park", "Kew Gardens", "Briarwood", "Middle Village", "Glendale", "Maspeth"],
  "Central Queens": ["Richmond Hill", "Woodhaven"],
  "Jamaica": ["Jamaica", "Hollis", "St. Albans", "Queens Village", "South Jamaica"],
  "Northeast Queens": ["Little Neck", "Douglaston", "Oakland Gardens", "Fresh Meadows", "Glen Oaks", "Bellerose", "Bayside"],
  "Southeast Queens": ["Cambria Heights", "Laurelton", "Springfield Gardens", "South Ozone Park"],
  "Southwest Queens": ["Ozone Park", "South Ozone Park", "Howard Beach", "Richmond Hill", "Woodhaven"],
  "Rockaways": ["Far Rockaway", "Rockaway Beach", "Rockaway Park"],

  // Bronx
  "Hunts Point and Mott Haven": ["South Bronx", "Mott Haven", "Hunts Point", "Melrose"],
  "High Bridge and Morrisania": ["Highbridge", "Morrisania", "Concourse", "Mount Eden"],
  "Central Bronx": ["Tremont", "Belmont", "Arthur Avenue", "West Farms", "Morris Heights", "University Heights"],
  "Bronx Park and Fordham": ["Fordham", "Bedford Park", "Norwood"],
  "Kingsbridge and Riverdale": ["Kingsbridge", "Riverdale", "Marble Hill"],
  "Southeast Bronx": ["Soundview", "Parkchester", "Castle Hill", "Throgs Neck"],
  "Northeast Bronx": ["Pelham Bay", "Co-op City", "Eastchester", "Wakefield", "Woodlawn"],

  // Staten Island
  "Stapleton and St. George": ["St. George", "Stapleton", "Tompkinsville"],
  "Port Richmond": ["Port Richmond", "West Brighton", "Westerleigh", "Mariners Harbor"],
  "South Shore": ["New Dorp", "Great Kills", "Tottenville", "Eltingville"],
  "Mid-Island": ["Todt Hill", "Bulls Head", "Willowbrook", "Dongan Hills"],
};

/**
 * Top NYC neighborhoods people would actually search for.
 * Ordered roughly by search popularity / restaurant density.
 */
export const POPULAR_NEIGHBORHOODS: string[] = [
  "Williamsburg",
  "Astoria",
  "Park Slope",
  "Hell's Kitchen",
  "East Village",
  "West Village",
  "Chelsea",
  "Upper East Side",
  "Upper West Side",
  "Bushwick",
  "Crown Heights",
  "Flushing",
  "Harlem",
  "SoHo",
  "Lower East Side",
  "Bed-Stuy",
  "Greenpoint",
  "Long Island City",
  "Jackson Heights",
  "Fort Greene",
];

/**
 * Given user input, find matching Google Places district names.
 * Returns the input itself if it already matches a district name.
 */
export function resolveNeighborhood(input: string): string[] {
  const normalized = input.toLowerCase().trim();

  // Check if input is already a Google district name (case-insensitive)
  const districts = Object.keys(DISTRICT_TO_NEIGHBORHOODS);
  const directMatch = districts.find(d => d.toLowerCase() === normalized);
  if (directMatch) return [directMatch];

  // Check alias mapping
  const aliases = NEIGHBORHOOD_ALIASES[normalized];
  if (aliases) return aliases;

  // Fuzzy: check if the input is a substring of any alias key
  const partialMatches = new Set<string>();
  for (const [key, values] of Object.entries(NEIGHBORHOOD_ALIASES)) {
    if (key.includes(normalized) || normalized.includes(key)) {
      values.forEach(v => partialMatches.add(v));
    }
  }
  if (partialMatches.size > 0) return Array.from(partialMatches);

  return [];
}
