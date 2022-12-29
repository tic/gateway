// Collects data from ecovacs robotic vacuums
import {
  EcoVacsAPI,
  countries,
} from 'ecovacs-deebot';
import { machineIdSync } from 'node-machine-id';
import {
  ConfigType,
  SetupMessage,
  SinkDictionary,
  SourceType,
} from '../types/globalTypes';
import {
  appName,
  ChargeModeConversionMap,
  ChargeModeEnum,
  CleanModeConversionMap,
  CleanModeEnum,
  dataCollectionRejectionTimeout,
  EcoVacsConfigType,
  EventReportType,
  FullVacuumDataReportType,
  IntervalModeEnum,
  Vacuum,
  VacuumCommand,
  vacuumCommandsToEvents,
  VacuumDataPacketType,
  VacuumMetricsType,
} from '../types/sourceEcovacsTypes';

// Data collection is initially every 45s, but
// if the vacuum is fully charged and idle, this
// interval is decreased to once every 5 minutes.
// If the interval is 5 minutes and the vacuum is
// no longer fully charged and idle, the interval
// is reset back to 45s.
const activeInterval = 45000;
const passiveInterval = 300000;
let collectionInterval: ReturnType<typeof setInterval>;
let intervalLength = activeInterval;

// Reject a data collection promise after a time
let vacuums: Vacuum[];
let sinks: SinkDictionary = {};

// Small helper function to switch
// the collection interval around.
function switchInterval(intervalType: IntervalModeEnum) {
  clearInterval(collectionInterval);
  intervalLength = intervalType === IntervalModeEnum.ACTIVE ? activeInterval : passiveInterval;
  // eslint-disable-next-line no-use-before-define
  collectionInterval = setInterval(collect, intervalLength);
}

// This function issues the commands and pools
// the separate responses together into one.
const collect = async () : Promise<void> => {
  const dataPackets: VacuumDataPacketType[] = (await Promise.all(
    vacuums.map(async (vacuum, vacuumIndex) : Promise<VacuumDataPacketType | null> => {
      if (!vacuum.connected) {
        console.info('vacuum %s is not connected! skipping', vacuum.nickname);
        return null;
      }
      const metadata = {
        deviceId: vacuum.deviceId,
        deviceType: vacuum.deviceType,
      };
      const commandsToExecute = Object.keys(vacuumCommandsToEvents) as VacuumCommand[];
      const eventResolveFunctions = [...new Array(commandsToExecute.length)];
      const dataResolutionPromises: Promise<EventReportType | null>[] = commandsToExecute.map(
        (command: VacuumCommand, promiseIndex: number) => new Promise<EventReportType>((resolve, reject) => {
          eventResolveFunctions[promiseIndex] = resolve;
          setTimeout(
            () => {
              // Prevents resolve from being called after the timeout period
              eventResolveFunctions[promiseIndex] = null;
              reject(new Error('request timeout'));
            },
            dataCollectionRejectionTimeout,
          );
        })
          .catch((error: Error) => {
            console.info(
              'command "%s" failed for vacuum %s: %s',
              command,
              vacuum.nickname,
              error,
            );
            return null;
          }),
      );
      vacuums[vacuumIndex].eventResolveFunctions = eventResolveFunctions;
      commandsToExecute.forEach((command) => {
        vacuum.vacbot.run(command);
      });
      const vacuumData: FullVacuumDataReportType = await Promise.all(
        dataResolutionPromises,
      ) as FullVacuumDataReportType;
      const cleanMode = vacuumData[1] === null
        ? CleanModeEnum.OTHER
        : CleanModeConversionMap[vacuumData[1]];
      const chargeMode = vacuumData[2] === null
        ? ChargeModeEnum.OTHER
        : ChargeModeConversionMap[vacuumData[2]];
      const metrics: VacuumMetricsType = {};
      if (vacuumData[0] !== null) {
        [metrics.battery] = vacuumData;
      }
      if (vacuumData[1] !== null) {
        metrics.clean_state = cleanMode;
      }
      if (vacuumData[2] !== null) {
        if (vacuumData[0] !== null) {
          if (chargeMode === ChargeModeEnum.CHARGING && vacuumData[0] >= 100) {
            metrics.charge_state = ChargeModeEnum.IDLE;
          } else {
            metrics.charge_state = chargeMode;
          }
        } else {
          metrics.charge_state = chargeMode;
        }
      }
      type Consumable = 'main_brush' | 'side_brush' | 'filter';
      Object.entries(vacuumData[3] ?? {}).forEach(([_consumable, value]) => {
        const consumable = (_consumable as unknown) as Consumable;
        if (value !== undefined && value !== null) {
          metrics[consumable] = value;
        }
      });
      // Check to see if the interval needs
      // to be updated (5m->45s or 45s->5m)
      // Vacuum is active if:
      // - Battery is less than 100 and not idle
      // OR
      // - Clean state is not 'stop'
      const vacuumActive = (
        (metrics.battery !== undefined && metrics.battery < 100)
        && (metrics.charge_state !== undefined && metrics.charge_state !== ChargeModeEnum.IDLE)
      ) || (metrics.clean_state !== undefined && metrics.clean_state !== CleanModeEnum.STOP);
      if (intervalLength === activeInterval && !vacuumActive) {
        // If the vacuum is fully charged and
        // cleaning status is idle, we need to
        // switch to the passive interval.
        switchInterval(IntervalModeEnum.PASSIVE);
        console.info("switched ecovacs device '%s' to passive mode", vacuum.nickname);
      } else if (intervalLength === passiveInterval && vacuumActive) {
        // If the vacuum is not fully charged
        // or the cleaning state is not idle,
        // we need to switch to the active interval.
        switchInterval(IntervalModeEnum.ACTIVE);
        console.info("switched ecovacs device '%s' to active mode", vacuum.nickname);
      }
      return {
        metrics,
        metadata,
      };
    }),
  )).filter((packetAttempt) => packetAttempt !== null) as VacuumDataPacketType[];
  dataPackets.forEach(({ metrics, metadata }) => {
    console.info('draining ecovacs data for device %s', metadata.deviceId);
    sinks.influx?.drain(
      appName,
      metrics,
      metadata,
      undefined,
      metadata.deviceId,
    );
  });
};

const setup = async (_configIn: ConfigType, sinksIn: SinkDictionary) : Promise<SetupMessage> => {
  const configIn = (_configIn as unknown) as EcoVacsConfigType;
  sinks = sinksIn;
  const continent = countries[configIn.country.toUpperCase()].continent.toLowerCase();
  const api = new EcoVacsAPI(
    EcoVacsAPI.getDeviceId(machineIdSync(), 0),
    configIn.country,
  );
  try {
    await api.connect(configIn.email, EcoVacsAPI.md5(configIn.password));
  } catch {
    return {
      success: false,
      message: 'failed to connect ecovacs api',
    };
  }

  try {
    const devices: Record<string, any>[] = await api.devices();
    vacuums = devices.map((device, index: number) => ({
      _id: index,
      deviceId: device.did,
      connected: false,
      nickname: device.nick,
      deviceType: device.deviceName, // e.g. "DEEBOT N79S/SE"
      eventResolveFunctions: [], // used to group event responses in collect()
      vacbot: api.getVacBot(
        api.uid,
        EcoVacsAPI.REALM,
        api.resource,
        api.user_access_token,
        device,
        continent,
      ),
    } as Vacuum));
  } catch {
    return {
      success: false,
      message: 'failed to fetch ecovacs device list and map it to a vacuums list',
    };
  }

  try {
    const pendingConnections: Promise<boolean>[] = vacuums.map(async (vacuum, vacuumIndex: number) => {
      vacuum.vacbot.connect();
      const innerPromise = new Promise((resolve) => {
        const connectionTimeout = setTimeout(() => resolve(false), 15000);
        vacuum.vacbot.on('ready', () => {
          clearTimeout(connectionTimeout);
          vacuums[vacuumIndex].connected = true;
          Object.values(vacuumCommandsToEvents).forEach((event, eventIndex) => {
            vacuum.vacbot.on(event, (value: EventReportType) => {
              const resolvingFunction = vacuum.eventResolveFunctions[eventIndex];
              if (resolvingFunction !== null) {
                resolvingFunction(value);
              } else {
                console.warn('[ECOVACS] unhandled operation callback %s', event);
              }
            });
          });
          resolve(true);
        });
        vacuum.vacbot.on('error', (error: Error) => {
          console.error('[ECOVACS] error in a vacuum\'s connection innerPromise');
          console.error(error);
        });
      });
      return innerPromise as Promise<boolean>;
    });
    if ((await Promise.all(pendingConnections)).includes(false)) {
      throw new Error('a connection failed');
    }
  } catch {
    return {
      success: false,
      message: 'failed to connect to 1 or more ecovacs devices',
    };
  }

  try {
    collect();

    // The collect() function manages switching
    // between the active and passive intervals.
    // Here we can assume the active interval and
    // the first collect() call will either keep
    // it or switch to the passive interval.
    switchInterval(IntervalModeEnum.ACTIVE);
  } catch {
    return {
      success: false,
      message: 'failed initial round of collection',
    };
  }

  return {
    success: true,
  };
};

const cleanup = async () => {
  clearInterval(collectionInterval);
  return true;
};

export default {
  setup,
  cleanup,
} as SourceType;
