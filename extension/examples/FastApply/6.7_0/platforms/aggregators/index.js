// platforms/aggregators/index.js
// Central export for all aggregator handlers

export { default as BaseAggregator } from './base-aggregator.js';
export { default as WeWorkRemotelyHandler } from './weworkremotely.js';
export { default as RemoteOKHandler } from './remoteok.js';
export { default as BuiltInHandler } from './builtin.js';

/**
 * Get aggregator handler by name
 * @param {string} name - Aggregator name
 * @param {Object} config - Handler config
 * @returns {BaseAggregator|null} Handler instance or null
 */
export function getAggregatorHandler(name, config) {
  const handlers = {
    'weworkremotely': WeWorkRemotelyHandler,
    'remoteok': RemoteOKHandler,
    'builtin': BuiltInHandler,
  };

  const HandlerClass = handlers[name.toLowerCase()];
  if (HandlerClass) {
    return new HandlerClass(config);
  }

  return null;
}

/**
 * List of supported aggregators
 */
export const SUPPORTED_AGGREGATORS = [
  {
    name: 'weworkremotely',
    displayName: 'We Work Remotely',
    domains: ['weworkremotely.com'],
    description: 'Popular remote job board',
  },
  {
    name: 'remoteok',
    displayName: 'Remote OK',
    domains: ['remoteok.com', 'remoteok.io'],
    description: 'Remote job aggregator with salary data',
  },
  {
    name: 'builtin',
    displayName: 'BuiltIn',
    domains: [
      'builtin.com',
      'builtinnyc.com',
      'builtinchicago.com',
      'builtinla.com',
      'builtinboston.com',
      'builtincolorado.com',
      'builtinaustin.com',
      'builtinseattle.com',
    ],
    description: 'Tech startup job boards',
  },
];

/**
 * Check if a URL belongs to a supported aggregator
 * @param {string} url - URL to check
 * @returns {string|null} Aggregator name or null
 */
export function detectAggregator(url) {
  const urlLower = url.toLowerCase();

  for (const aggregator of SUPPORTED_AGGREGATORS) {
    for (const domain of aggregator.domains) {
      if (urlLower.includes(domain)) {
        return aggregator.name;
      }
    }
  }

  return null;
}
