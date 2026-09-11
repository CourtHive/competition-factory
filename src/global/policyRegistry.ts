type PolicyDefinition = Record<string, any>;

type PolicyEntry = {
  policyType: string;
  definition: PolicyDefinition;
  version?: string;
  name: string;
};

const registry = new Map<string, PolicyEntry[]>();

function entryKey(policyType: string, name: string): string {
  return `${policyType}::${name}`;
}

type RegisterArgs = {
  definition: PolicyDefinition;
  policyType: string;
  version?: string;
  name: string;
};

function register({ policyType, name, version, definition }: RegisterArgs): void {
  const key = entryKey(policyType, name);
  const existing = registry.get(key) ?? [];
  const filtered = existing.filter((entry) => entry.version !== version);
  filtered.push({ policyType, name, version, definition });
  registry.set(key, filtered);
}

type LookupArgs = {
  policyType: string;
  version?: string;
  name: string;
};

function lookup({ policyType, name, version }: LookupArgs): PolicyDefinition | undefined {
  const entries = registry.get(entryKey(policyType, name));
  if (!entries?.length) return undefined;
  if (version) return entries.find((entry) => entry.version === version)?.definition;
  return entries.at(-1)?.definition;
}

type ListArgs = {
  policyType?: string;
};

function list({ policyType }: ListArgs = {}): PolicyEntry[] {
  const all: PolicyEntry[] = [];
  for (const entries of registry.values()) {
    for (const entry of entries) {
      if (!policyType || entry.policyType === policyType) all.push(entry);
    }
  }
  return all;
}

type ClearArgs = {
  policyType?: string;
  name?: string;
};

function clear({ policyType, name }: ClearArgs = {}): void {
  if (!policyType && !name) {
    registry.clear();
    return;
  }
  if (policyType && name) {
    registry.delete(entryKey(policyType, name));
    return;
  }
  const keysToDelete: string[] = [];
  for (const [key, entries] of registry.entries()) {
    const matches = entries.some((entry) => {
      if (policyType && entry.policyType !== policyType) return false;
      if (name && entry.name !== name) return false;
      return true;
    });
    if (matches) keysToDelete.push(key);
  }
  for (const key of keysToDelete) registry.delete(key);
}

export const policyRegistry = {
  register,
  lookup,
  list,
  clear,
};

export type { PolicyDefinition, PolicyEntry, RegisterArgs, LookupArgs, ListArgs, ClearArgs };
