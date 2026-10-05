import dictionary from "./data/metrics.json";
export const METRIC_VERSION=dictionary.version;
export function metricDefinition(key:string){return dictionary.metrics.find(m=>m.key===key||('aliases' in m&&m.aliases?.includes(key)));}
export function metricLabel(key:string,fallback:string){return metricDefinition(key)?.label || fallback;}
