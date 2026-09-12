const DYNAMIC_REGISTRY_URL =
  "https://api.voxcourt.com/api/public/clubs";

export const SUPPORTED_PUBLIC_SPORTS = Object.freeze([
  "tennis",
  "padel",
  "pickleball",
]);

function clone(value) {
  return JSON.parse(JSON.stringify(value || { countries: [] }));
}

export function courtSport(court) {
  return String(court?.sport || "tennis").trim().toLowerCase();
}

export function configuredCourts(node) {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node.courts)) {
    return node.courts.filter((court) => court?.id && court?.name);
  }
  for (const key of ["clubs", "cities", "countries"]) {
    if (Array.isArray(node[key])) return node[key].flatMap(configuredCourts);
  }
  return [];
}

export function configuredSports(registry) {
  return [...new Set(configuredCourts(registry).map(courtSport))]
    .filter(Boolean)
    .sort();
}

export function supportsSport(node, sport) {
  return configuredCourts(node).some((court) => courtSport(court) === sport);
}

function mergeById(target, incoming, childKey) {
  for (const item of incoming || []) {
    const found = target.find((x) => x.id === item.id);
    if (!found) {
      target.push(clone(item));
      continue;
    }

    // Dynamic registry may add metadata (sport, address, etc.).
    for (const [key, value] of Object.entries(item)) {
      if (key === childKey) continue;
      if (value !== undefined && value !== null && value !== "") {
        found[key] = value;
      }
    }

    if (childKey) {
      found[childKey] ||= [];
      mergeById(found[childKey], item[childKey] || [],
        childKey === "cities" ? "clubs" :
        childKey === "clubs" ? "courts" :
        null
      );
    }
  }
}

export function mergeClubRegistries(staticData, dynamicData) {
  const result = clone(staticData);
  result.countries ||= [];
  mergeById(result.countries, dynamicData?.countries || [], "cities");
  return result;
}

export async function loadClubRegistry() {
  const base = import.meta.env.BASE_URL || "/";
  const staticUrl = `${base}config/clubs.json`;

  const [staticResult, dynamicResult] = await Promise.allSettled([
    fetch(staticUrl, { cache: "no-store" }).then(async (r) => {
      if (!r.ok) throw new Error(`Cannot load ${staticUrl} (${r.status})`);
      return r.json();
    }),
    fetch(DYNAMIC_REGISTRY_URL, { cache: "no-store" }).then(async (r) => {
      if (!r.ok) throw new Error(`Dynamic registry failed (${r.status})`);
      return r.json();
    }),
  ]);

  const staticData =
    staticResult.status === "fulfilled"
      ? staticResult.value
      : { countries: [] };

  // The production registry is authoritative whenever it responds, including
  // an intentionally empty registry. Static data is only an outage fallback;
  // merging it into a healthy response would expose courts that are not
  // actually registered for public use.
  if (dynamicResult.status === "fulfilled") {
    return clone(dynamicResult.value);
  }

  if (staticResult.status === "fulfilled") {
    return clone(staticData);
  }

  throw dynamicResult.reason || staticResult.reason;
}
