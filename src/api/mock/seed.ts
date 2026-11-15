import type { AttributeState, DeviceCommand, DeviceIntegrationType, RuleAction } from '../types';

/**
 * Declarative description of the demo homes. Everything here is fictional; the
 * shapes mirror what the SmartThings API returns for real devices.
 */

type Defaults = Record<string, Record<string, AttributeState>>;

/** Attribute defaults per capability (component-agnostic). */
export const CAPABILITY_DEFAULTS: Defaults = {
  switch: { switch: { value: 'off' } },
  switchLevel: { level: { value: 80, unit: '%' } },
  colorTemperature: { colorTemperature: { value: 3000, unit: 'K' } },
  colorControl: { hue: { value: 8 }, saturation: { value: 70 } },
  temperatureMeasurement: { temperature: { value: 21.5, unit: 'C' } },
  relativeHumidityMeasurement: { humidity: { value: 44, unit: '%' } },
  illuminanceMeasurement: { illuminance: { value: 180, unit: 'lux' } },
  motionSensor: { motion: { value: 'inactive' } },
  contactSensor: { contact: { value: 'closed' } },
  lock: { lock: { value: 'locked' } },
  battery: { battery: { value: 86, unit: '%' } },
  powerMeter: { power: { value: 0.4, unit: 'W' } },
  energyMeter: { energy: { value: 12.4, unit: 'kWh' } },
  thermostatMode: {
    thermostatMode: { value: 'heat' },
    supportedThermostatModes: { value: ['off', 'heat', 'cool', 'auto'] },
  },
  thermostatHeatingSetpoint: { heatingSetpoint: { value: 21, unit: 'C' } },
  thermostatCoolingSetpoint: { coolingSetpoint: { value: 25, unit: 'C' } },
  thermostatOperatingState: { thermostatOperatingState: { value: 'idle' } },
  windowShade: {
    windowShade: { value: 'partially open' },
    supportedWindowShadeCommands: { value: ['open', 'close', 'pause'] },
  },
  windowShadeLevel: { shadeLevel: { value: 60, unit: '%' } },
  waterSensor: { water: { value: 'dry' } },
  smokeDetector: { smoke: { value: 'clear' } },
  presenceSensor: { presence: { value: 'present' } },
  airQualitySensor: { airQuality: { value: 22, unit: 'CAQI' } },
  carbonDioxideMeasurement: { carbonDioxide: { value: 640, unit: 'ppm' } },
  audioVolume: { volume: { value: 18, unit: '%' } },
  audioMute: { mute: { value: 'unmuted' } },
  mediaPlayback: {
    playbackStatus: { value: 'stopped' },
    supportedPlaybackCommands: { value: ['play', 'pause', 'stop'] },
  },
  mediaInputSource: {
    inputSource: { value: 'HDMI1' },
    supportedInputSources: { value: ['HDMI1', 'HDMI2', 'digitalTv', 'USB'] },
  },
  fanSpeed: { fanSpeed: { value: 1 } },
  washerOperatingState: {
    machineState: { value: 'stop' },
    washerJobState: { value: 'none' },
    completionTime: { value: null },
  },
  robotCleanerMovement: { robotCleanerMovement: { value: 'charging' } },
  robotCleanerCleaningMode: { robotCleanerCleaningMode: { value: 'auto' } },
  doorControl: { door: { value: 'closed' } },
  refresh: {},
};

export interface ComponentSeed {
  id: string;
  label?: string;
  capabilities: string[];
  category?: string;
}

export interface DeviceSeed {
  key: string;
  label: string;
  name: string;
  room: string;
  manufacturer: string;
  model: string;
  type: DeviceIntegrationType;
  category: string;
  components?: ComponentSeed[];
  /** Capabilities for the "main" component when `components` is omitted. */
  capabilities?: string[];
  /** component -> capability -> attribute -> value overrides */
  state?: Record<string, Record<string, Record<string, AttributeState['value']>>>;
  ratedPowerW?: number;
  standbyPowerW?: number;
  offline?: boolean;
  favorite?: boolean;
}

export interface SceneSeed {
  key: string;
  name: string;
  icon: string;
  color: string;
  mode?: string;
  actions: Array<{ device: string; commands: DeviceCommand[] }>;
}

export interface RuleSeed {
  key: string;
  name: string;
  enabled: boolean;
  /** Device keys are resolved to ids when the engine boots. */
  build: (id: (deviceKey: string) => string) => RuleAction[];
}

export interface LocationSeed {
  key: string;
  name: string;
  timeZoneId: string;
  countryCode: string;
  temperatureScale: 'C' | 'F';
  rooms: Array<{ key: string; name: string }>;
  devices: DeviceSeed[];
  scenes: SceneSeed[];
  rules: RuleSeed[];
  modes: Array<{ key: string; label: string }>;
  initialMode: string;
}

const cmd = (capability: string, command: string, args?: unknown[], component = 'main'): DeviceCommand => ({
  component,
  capability,
  command,
  ...(args ? { arguments: args } : {}),
});

const on = cmd('switch', 'on');
const off = cmd('switch', 'off');

export const HOME: LocationSeed = {
  key: 'home',
  name: 'Maple Street Home',
  timeZoneId: 'America/Los_Angeles',
  countryCode: 'USA',
  temperatureScale: 'C',
  rooms: [
    { key: 'living', name: 'Living Room' },
    { key: 'kitchen', name: 'Kitchen' },
    { key: 'bedroom', name: 'Bedroom' },
    { key: 'office', name: 'Office' },
    { key: 'entry', name: 'Entryway' },
    { key: 'laundry', name: 'Laundry' },
    { key: 'garage', name: 'Garage' },
  ],
  modes: [
    { key: 'home', label: 'Home' },
    { key: 'away', label: 'Away' },
    { key: 'night', label: 'Night' },
  ],
  initialMode: 'home',
  devices: [
    {
      key: 'living-ceiling',
      label: 'Ceiling Light',
      name: 'Matter Dimmable Light',
      room: 'living',
      manufacturer: 'Lumen Labs',
      model: 'LL-A19-TW',
      type: 'MATTER',
      category: 'Light',
      capabilities: ['switch', 'switchLevel', 'colorTemperature', 'powerMeter', 'refresh'],
      state: { main: { switch: { switch: 'on' }, switchLevel: { level: 72 } } },
      ratedPowerW: 9,
      standbyPowerW: 0.3,
      favorite: true,
    },
    {
      key: 'living-lamp',
      label: 'Floor Lamp',
      name: 'Zigbee Color Bulb',
      room: 'living',
      manufacturer: 'Lumen Labs',
      model: 'LL-E26-RGBW',
      type: 'ZIGBEE',
      category: 'Light',
      capabilities: ['switch', 'switchLevel', 'colorControl', 'colorTemperature', 'refresh'],
      state: { main: { switchLevel: { level: 45 }, colorControl: { hue: 72, saturation: 60 } } },
      favorite: true,
    },
    {
      key: 'living-tv',
      label: 'Living Room TV',
      name: 'Smart TV 65"',
      room: 'living',
      manufacturer: 'Northwind Displays',
      model: 'NW-65Q',
      type: 'OCF',
      category: 'Television',
      capabilities: ['switch', 'audioVolume', 'audioMute', 'mediaPlayback', 'mediaInputSource', 'powerMeter'],
      ratedPowerW: 110,
      standbyPowerW: 0.5,
      favorite: true,
    },
    {
      key: 'living-shades',
      label: 'Window Shades',
      name: 'Zigbee Roller Shade',
      room: 'living',
      manufacturer: 'ShadeCraft',
      model: 'SC-RS2',
      type: 'ZIGBEE',
      category: 'Blind',
      capabilities: ['windowShade', 'windowShadeLevel', 'battery'],
      state: { main: { battery: { battery: 64 } } },
    },
    {
      key: 'living-motion',
      label: 'Living Room Motion',
      name: 'Multipurpose Motion Sensor',
      room: 'living',
      manufacturer: 'Sensa',
      model: 'MS-300',
      type: 'ZIGBEE',
      category: 'MotionSensor',
      capabilities: ['motionSensor', 'temperatureMeasurement', 'illuminanceMeasurement', 'battery'],
      state: { main: { battery: { battery: 91 } } },
    },
    {
      key: 'living-purifier',
      label: 'Air Purifier',
      name: 'HEPA Air Purifier',
      room: 'living',
      manufacturer: 'PureFlow',
      model: 'PF-400',
      type: 'LAN',
      category: 'AirPurifier',
      capabilities: ['switch', 'fanSpeed', 'airQualitySensor', 'powerMeter'],
      state: { main: { switch: { switch: 'on' }, fanSpeed: { fanSpeed: 2 } } },
      ratedPowerW: 28,
      standbyPowerW: 0.8,
    },
    {
      key: 'kitchen-fridge',
      label: 'Refrigerator',
      name: 'French Door Refrigerator',
      room: 'kitchen',
      manufacturer: 'Northwind Appliances',
      model: 'NW-RF28',
      type: 'OCF',
      category: 'Refrigerator',
      components: [
        { id: 'main', capabilities: ['contactSensor', 'powerMeter', 'energyMeter', 'refresh'] },
        { id: 'cooler', label: 'Fridge', capabilities: ['temperatureMeasurement', 'contactSensor'] },
        { id: 'freezer', label: 'Freezer', capabilities: ['temperatureMeasurement', 'contactSensor'] },
      ],
      state: {
        main: { energyMeter: { energy: 148.2 } },
        cooler: { temperatureMeasurement: { temperature: 3.4 } },
        freezer: { temperatureMeasurement: { temperature: -18.2 } },
      },
      ratedPowerW: 95,
      standbyPowerW: 95,
      favorite: true,
    },
    {
      key: 'kitchen-coffee',
      label: 'Coffee Maker',
      name: 'Smart Plug Mini',
      room: 'kitchen',
      manufacturer: 'Plugwise Co',
      model: 'PW-M1',
      type: 'MATTER',
      category: 'SmartPlug',
      capabilities: ['switch', 'powerMeter', 'energyMeter'],
      state: { main: { energyMeter: { energy: 21.7 } } },
      ratedPowerW: 1050,
      standbyPowerW: 0.4,
    },
    {
      key: 'kitchen-leak',
      label: 'Under-Sink Leak Sensor',
      name: 'Water Leak Sensor',
      room: 'kitchen',
      manufacturer: 'Sensa',
      model: 'WL-100',
      type: 'ZIGBEE',
      category: 'LeakSensor',
      capabilities: ['waterSensor', 'temperatureMeasurement', 'battery'],
      state: { main: { battery: { battery: 17 }, temperatureMeasurement: { temperature: 19.8 } } },
    },
    {
      key: 'bedroom-lamp',
      label: 'Bedside Lamp',
      name: 'Matter Color Bulb',
      room: 'bedroom',
      manufacturer: 'Lumen Labs',
      model: 'LL-A19-RGBW',
      type: 'MATTER',
      category: 'Light',
      capabilities: ['switch', 'switchLevel', 'colorControl', 'colorTemperature'],
      state: { main: { switchLevel: { level: 30 }, colorControl: { hue: 10, saturation: 85 } } },
    },
    {
      key: 'bedroom-thermostat',
      label: 'Thermostat',
      name: 'Smart Thermostat',
      room: 'bedroom',
      manufacturer: 'Climatic',
      model: 'CL-T6',
      type: 'ZWAVE',
      category: 'Thermostat',
      capabilities: [
        'temperatureMeasurement',
        'relativeHumidityMeasurement',
        'thermostatMode',
        'thermostatHeatingSetpoint',
        'thermostatCoolingSetpoint',
        'thermostatOperatingState',
        'refresh',
      ],
      state: { main: { temperatureMeasurement: { temperature: 20.6 } } },
      favorite: true,
    },
    {
      key: 'bedroom-window',
      label: 'Bedroom Window',
      name: 'Contact Sensor',
      room: 'bedroom',
      manufacturer: 'Sensa',
      model: 'CS-200',
      type: 'ZIGBEE',
      category: 'ContactSensor',
      capabilities: ['contactSensor', 'temperatureMeasurement', 'battery'],
      state: { main: { battery: { battery: 73 } } },
    },
    {
      key: 'office-light',
      label: 'Office Light',
      name: 'Matter Dimmable Light',
      room: 'office',
      manufacturer: 'Lumen Labs',
      model: 'LL-A19-TW',
      type: 'MATTER',
      category: 'Light',
      capabilities: ['switch', 'switchLevel', 'colorTemperature', 'powerMeter'],
      state: { main: { switch: { switch: 'on' }, colorTemperature: { colorTemperature: 4800 } } },
      ratedPowerW: 9,
      standbyPowerW: 0.3,
    },
    {
      key: 'office-desk',
      label: 'Desk Setup',
      name: 'Smart Plug Pro',
      room: 'office',
      manufacturer: 'Plugwise Co',
      model: 'PW-P2',
      type: 'ZIGBEE',
      category: 'SmartPlug',
      capabilities: ['switch', 'powerMeter', 'energyMeter'],
      state: { main: { switch: { switch: 'on' }, energyMeter: { energy: 64.9 } } },
      ratedPowerW: 165,
      standbyPowerW: 2.1,
    },
    {
      key: 'office-air',
      label: 'Air Quality Monitor',
      name: 'Indoor Air Monitor',
      room: 'office',
      manufacturer: 'PureFlow',
      model: 'PF-AQ2',
      type: 'LAN',
      category: 'AirQualityDetector',
      capabilities: [
        'airQualitySensor',
        'carbonDioxideMeasurement',
        'temperatureMeasurement',
        'relativeHumidityMeasurement',
      ],
      state: { main: { temperatureMeasurement: { temperature: 22.4 } } },
    },
    {
      key: 'entry-lock',
      label: 'Front Door Lock',
      name: 'Smart Deadbolt',
      room: 'entry',
      manufacturer: 'Keystone',
      model: 'KS-D2',
      type: 'ZWAVE',
      category: 'SmartLock',
      capabilities: ['lock', 'battery'],
      state: { main: { battery: { battery: 58 } } },
      favorite: true,
    },
    {
      key: 'entry-door',
      label: 'Front Door',
      name: 'Contact Sensor',
      room: 'entry',
      manufacturer: 'Sensa',
      model: 'CS-200',
      type: 'ZIGBEE',
      category: 'ContactSensor',
      capabilities: ['contactSensor', 'battery'],
    },
    {
      key: 'entry-smoke',
      label: 'Smoke Alarm',
      name: 'Smoke Detector',
      room: 'entry',
      manufacturer: 'SafeHaus',
      model: 'SH-S1',
      type: 'ZWAVE',
      category: 'SmokeDetector',
      capabilities: ['smokeDetector', 'battery'],
      state: { main: { battery: { battery: 95 } } },
    },
    {
      key: 'entry-presence',
      label: "Alex's Phone",
      name: 'Mobile Presence',
      room: 'entry',
      manufacturer: 'SmartThings Mobile',
      model: 'Presence',
      type: 'MOBILE',
      category: 'MobilePresence',
      capabilities: ['presenceSensor'],
    },
    {
      key: 'laundry-washer',
      label: 'Washer',
      name: 'Front Load Washer',
      room: 'laundry',
      manufacturer: 'Northwind Appliances',
      model: 'NW-WF45',
      type: 'OCF',
      category: 'Washer',
      capabilities: ['switch', 'washerOperatingState', 'powerMeter', 'energyMeter', 'refresh'],
      state: { main: { switch: { switch: 'on' }, energyMeter: { energy: 37.1 } } },
      ratedPowerW: 480,
      standbyPowerW: 1.2,
      favorite: true,
    },
    {
      key: 'laundry-vacuum',
      label: 'Robot Vacuum',
      name: 'Robot Vacuum S8',
      room: 'laundry',
      manufacturer: 'Northwind Appliances',
      model: 'NW-RV8',
      type: 'OCF',
      category: 'RobotCleaner',
      capabilities: ['robotCleanerMovement', 'robotCleanerCleaningMode', 'battery'],
      state: { main: { battery: { battery: 100 } } },
    },
    {
      key: 'garage-door',
      label: 'Garage Door',
      name: 'Garage Door Controller',
      room: 'garage',
      manufacturer: 'Liftmaster Pro',
      model: 'LP-GD3',
      type: 'ZWAVE',
      category: 'GarageDoor',
      capabilities: ['doorControl', 'contactSensor'],
    },
    {
      key: 'garage-light',
      label: 'Garage Light',
      name: 'Smart Switch',
      room: 'garage',
      manufacturer: 'Plugwise Co',
      model: 'PW-S1',
      type: 'ZWAVE',
      category: 'Switch',
      capabilities: ['switch'],
      offline: true,
    },
  ],
  scenes: [
    {
      key: 'morning',
      name: 'Good Morning',
      icon: 'sunrise',
      color: '#f59e0b',
      mode: 'home',
      actions: [
        { device: 'living-shades', commands: [cmd('windowShade', 'open')] },
        { device: 'kitchen-coffee', commands: [on] },
        { device: 'living-ceiling', commands: [on, cmd('switchLevel', 'setLevel', [80])] },
        {
          device: 'bedroom-thermostat',
          commands: [cmd('thermostatHeatingSetpoint', 'setHeatingSetpoint', [21.5])],
        },
      ],
    },
    {
      key: 'movie',
      name: 'Movie Night',
      icon: 'clapperboard',
      color: '#8b5cf6',
      actions: [
        { device: 'living-ceiling', commands: [off] },
        {
          device: 'living-lamp',
          commands: [
            on,
            cmd('switchLevel', 'setLevel', [20]),
            cmd('colorControl', 'setColor', [{ hue: 72, saturation: 80 }]),
          ],
        },
        { device: 'living-shades', commands: [cmd('windowShade', 'close')] },
        { device: 'living-tv', commands: [on, cmd('mediaInputSource', 'setInputSource', ['HDMI2'])] },
      ],
    },
    {
      key: 'away',
      name: 'Leaving Home',
      icon: 'door-open',
      color: '#0ea5e9',
      mode: 'away',
      actions: [
        { device: 'living-ceiling', commands: [off] },
        { device: 'living-lamp', commands: [off] },
        { device: 'office-light', commands: [off] },
        { device: 'living-tv', commands: [off] },
        { device: 'entry-lock', commands: [cmd('lock', 'lock')] },
        { device: 'garage-door', commands: [cmd('doorControl', 'close')] },
        {
          device: 'laundry-vacuum',
          commands: [cmd('robotCleanerMovement', 'setRobotCleanerMovement', ['cleaning'])],
        },
      ],
    },
    {
      key: 'night',
      name: 'Good Night',
      icon: 'moon',
      color: '#6366f1',
      mode: 'night',
      actions: [
        { device: 'living-ceiling', commands: [off] },
        { device: 'living-lamp', commands: [off] },
        { device: 'office-light', commands: [off] },
        { device: 'living-tv', commands: [off] },
        { device: 'bedroom-lamp', commands: [on, cmd('switchLevel', 'setLevel', [10])] },
        { device: 'entry-lock', commands: [cmd('lock', 'lock')] },
        {
          device: 'bedroom-thermostat',
          commands: [cmd('thermostatHeatingSetpoint', 'setHeatingSetpoint', [18.5])],
        },
      ],
    },
  ],
  rules: [
    {
      key: 'motion-lamp',
      name: 'Motion turns on the floor lamp',
      enabled: true,
      build: (id) => [
        {
          if: {
            equals: {
              left: {
                device: {
                  devices: [id('living-motion')],
                  component: 'main',
                  capability: 'motionSensor',
                  attribute: 'motion',
                },
              },
              right: { string: 'active' },
            },
            then: [{ command: { devices: [id('living-lamp')], commands: [on] } }],
          },
        },
      ],
    },
    {
      key: 'leak-valve',
      name: 'Leak detected → turn off coffee maker',
      enabled: true,
      build: (id) => [
        {
          if: {
            equals: {
              left: {
                device: {
                  devices: [id('kitchen-leak')],
                  component: 'main',
                  capability: 'waterSensor',
                  attribute: 'water',
                },
              },
              right: { string: 'wet' },
            },
            then: [{ command: { devices: [id('kitchen-coffee')], commands: [off] } }],
          },
        },
      ],
    },
    {
      key: 'co2-purifier',
      name: 'High CO₂ in office → purifier on high',
      enabled: true,
      build: (id) => [
        {
          if: {
            greaterThan: {
              left: {
                device: {
                  devices: [id('office-air')],
                  component: 'main',
                  capability: 'carbonDioxideMeasurement',
                  attribute: 'carbonDioxide',
                },
              },
              right: { integer: 1000 },
            },
            then: [
              {
                command: {
                  devices: [id('living-purifier')],
                  commands: [on, cmd('fanSpeed', 'setFanSpeed', [3])],
                },
              },
            ],
          },
        },
      ],
    },
    {
      key: 'door-light',
      name: 'Front door opens → ceiling light on',
      enabled: false,
      build: (id) => [
        {
          if: {
            equals: {
              left: {
                device: {
                  devices: [id('entry-door')],
                  component: 'main',
                  capability: 'contactSensor',
                  attribute: 'contact',
                },
              },
              right: { string: 'open' },
            },
            then: [{ command: { devices: [id('living-ceiling')], commands: [on] } }],
          },
        },
      ],
    },
  ],
};

export const CABIN: LocationSeed = {
  key: 'cabin',
  name: 'Lake Cabin',
  timeZoneId: 'America/Denver',
  countryCode: 'USA',
  temperatureScale: 'C',
  rooms: [
    { key: 'main', name: 'Great Room' },
    { key: 'deck', name: 'Deck' },
  ],
  modes: [
    { key: 'home', label: 'Home' },
    { key: 'away', label: 'Away' },
  ],
  initialMode: 'away',
  devices: [
    {
      key: 'cabin-thermostat',
      label: 'Cabin Thermostat',
      name: 'Smart Thermostat',
      room: 'main',
      manufacturer: 'Climatic',
      model: 'CL-T6',
      type: 'ZWAVE',
      category: 'Thermostat',
      capabilities: [
        'temperatureMeasurement',
        'relativeHumidityMeasurement',
        'thermostatMode',
        'thermostatHeatingSetpoint',
        'thermostatCoolingSetpoint',
        'thermostatOperatingState',
      ],
      state: {
        main: {
          temperatureMeasurement: { temperature: 12.8 },
          thermostatHeatingSetpoint: { heatingSetpoint: 12 },
        },
      },
      favorite: true,
    },
    {
      key: 'cabin-lock',
      label: 'Cabin Door Lock',
      name: 'Smart Deadbolt',
      room: 'main',
      manufacturer: 'Keystone',
      model: 'KS-D2',
      type: 'ZWAVE',
      category: 'SmartLock',
      capabilities: ['lock', 'battery'],
      state: { main: { battery: { battery: 41 } } },
      favorite: true,
    },
    {
      key: 'cabin-leak',
      label: 'Water Heater Leak',
      name: 'Water Leak Sensor',
      room: 'main',
      manufacturer: 'Sensa',
      model: 'WL-100',
      type: 'ZIGBEE',
      category: 'LeakSensor',
      capabilities: ['waterSensor', 'temperatureMeasurement', 'battery'],
      state: { main: { temperatureMeasurement: { temperature: 9.6 } } },
    },
    {
      key: 'cabin-deck-light',
      label: 'Deck String Lights',
      name: 'Outdoor Plug',
      room: 'deck',
      manufacturer: 'Plugwise Co',
      model: 'PW-O1',
      type: 'MATTER',
      category: 'SmartPlug',
      capabilities: ['switch', 'powerMeter', 'energyMeter'],
      state: { main: { energyMeter: { energy: 3.2 } } },
      ratedPowerW: 24,
      standbyPowerW: 0.3,
    },
  ],
  scenes: [
    {
      key: 'arrive',
      name: 'Arriving',
      icon: 'home',
      color: '#10b981',
      mode: 'home',
      actions: [
        {
          device: 'cabin-thermostat',
          commands: [cmd('thermostatHeatingSetpoint', 'setHeatingSetpoint', [20])],
        },
        { device: 'cabin-deck-light', commands: [on] },
        { device: 'cabin-lock', commands: [cmd('lock', 'unlock')] },
      ],
    },
    {
      key: 'close-up',
      name: 'Close Up Cabin',
      icon: 'lock',
      color: '#64748b',
      mode: 'away',
      actions: [
        {
          device: 'cabin-thermostat',
          commands: [cmd('thermostatHeatingSetpoint', 'setHeatingSetpoint', [12])],
        },
        { device: 'cabin-deck-light', commands: [off] },
        { device: 'cabin-lock', commands: [cmd('lock', 'lock')] },
      ],
    },
  ],
  rules: [],
};

export const LOCATIONS: LocationSeed[] = [HOME, CABIN];
