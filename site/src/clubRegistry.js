const DYNAMIC_REGISTRY_URL =
  "https://api.escoreboards.eu/api/club-registry/public/clubs";

function clone(value) {
  return JSON.parse(JSON.stringify(value || { countries: [] }));
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

  const dynamicData =
    dynamicResult.status === "fulfilled"
      ? dynamicResult.value
      : { countries: [] };

  // Existing hard-coded clubs remain available even if the registry service
  // is temporarily offline. New self-provisioned clubs appear automatically
  // whenever the registry is reachable.
  const merged = mergeClubRegistries(staticData, dynamicData);

  if (!merged.countries.length && staticResult.status === "rejected") {
    throw staticResult.reason;
  }

  return merged;
}
