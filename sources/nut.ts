// Collects data from UPS devices
import Nut from 'node-nut';
import {
  ConfigType,
  SetupMessage,
  SinkDictionary,
} from '../types/globalTypes';
import {
  SifMetadataType,
  SifMetricsType,
} from '../types/sinkSifTypes';
import {
  NutConfigType,
  NutServerType,
  UpsDataPacket,
  UpsListReport,
  UpsType,
  UpsVarsType,
} from '../types/sourceNutTypes';

let nutServer: NutServerType = {
  configured: false,
  start: () => null,
  close: () => null,
  on: () => null,
  GetUPSList: () => null,
};
let sinks: SinkDictionary;
let config: NutConfigType;
let collectionInterval: ReturnType<typeof setInterval>;
let upsEquipmentList: UpsType[] = [];

const connectToNutServer = () : Promise<boolean> => new Promise<boolean>((resolve) => {
  let resolved = false;
  nutServer = new Nut(config.serverPort, config.serverAddress);
  nutServer.configured = false;
  nutServer.start();
  const connectionTimeout = setTimeout(() => {
    if (!resolved) {
      resolved = true;
      resolve(false);
    }
  }, config.autoReconnectTimeoutMs);
  nutServer.on('ready', () => {
    if (resolved) {
      return;
    }
    resolved = true;
    clearTimeout(connectionTimeout);
    nutServer.GetUPSList((foundEquipment: UpsListReport, error) => {
      if (error) {
        console.warn('[NUT] error trying to fetch ups list');
        console.error(error);
        // eslint-disable-next-line no-use-before-define
        resetNutConnection();
        resolve(false);
        return;
      }
      upsEquipmentList = Object.entries(foundEquipment).map(([upsName, upsDescription]) => ({
        name: upsName,
        description: upsDescription,
      } as UpsType));
    });
  });
});

// Initiates a reset of the nut server connection,
// including closing any existing connection,
// opening a new one, and waiting for confirmation
// of the new connection. Connection issues are
// handled inside here, including automatic attempts
// to re-connect should the connection be broken.
const resetNutConnection = async () : Promise<boolean> => {
  if (nutServer.configured === true) {
    console.info('need to close existing nut connection');
    const closed = await new Promise<boolean>((resolve) => {
      nutServer.on('close', () => {
        console.info('cleared nut connection');
        nutServer.configured = false;
        resolve(true);
      });
      nutServer.on('error', () => resolve(false));
      nutServer.close();
    });
    if (closed === false) {
      return false;
    }
  }
  nutServer.configured = await connectToNutServer();
  const { connectionRetryCooldownMs } = config;
  while (nutServer.configured === false) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise(
      (resolve) => {
        setTimeout(resolve, connectionRetryCooldownMs);
      },
    );
    // eslint-disable-next-line no-await-in-loop
    nutServer.configured = await connectToNutServer();
  }
  nutServer.on('error', (error: Error) => {
    console.warn('[NUT nut server error]');
    console.error(error);
    console.info('[NUT] recursively re-initializing connection to the nut server');
    resetNutConnection();
  });
  return true;
};

// Creates a promise wrapper around
// node-nut's callback-style functions.
const getDataFromUPS = async (ups: UpsType) => new Promise<UpsVarsType | null>((resolve) => {
  resolve(null);
  let resolved = false;
  const collectionTimeout = setTimeout(() => {
    if (resolved === false) {
      resolved = true;
      resolve(null);
    }
  }, config.collectionIntervalMs / 2);
  nutServer.GetUPSVars(ups.name, (data: UpsVarsType, error: Error) => {
    if (resolved === true) {
      return;
    }
    resolved = true;
    clearTimeout(collectionTimeout);
    if (error) {
      console.warn(`[NUT] failed to get data from ups "${ups.name}"`);
      console.error(error);
      resolve(null);
    } else {
      resolve(data);
    }
  });
});

async function collect() {
  // Prevent some obvious errors that may come
  // when trying to use an anomalous nut server.
  if (nutServer.configured === false) {
    console.info('[NUT] tried to use unconfigured server');
    return;
  }

  // Fetch the data from the ups units
  const foundData: UpsDataPacket[] = (await Promise.all<UpsDataPacket | null>(
    upsEquipmentList.map(async (ups) => {
      const data = await getDataFromUPS(ups);
      return data === null
        ? null
        : {
          ups,
          data,
        };
    }),
  )).filter((data: UpsDataPacket | null) => data !== null) as UpsDataPacket[];

  foundData.forEach(({ ups, data }) => {
    const metadata: SifMetadataType = {
      serialNumber: data['device.serial'],
      description: ups.description,
      nutName: ups.name,
    };
    const metrics: SifMetricsType = {
      batteryChargeLevel: parseFloat(data['battery.charge']),
      estRuntime: parseFloat(data['battery.runtime']),
      batteryVoltage: parseFloat(data['battery.voltage']),
      inputVoltage: parseFloat(data['input.voltage']),
      outputVoltage: parseFloat(data['output.voltage']),
      outputLoadPct: parseFloat(data['ups.load']),
      outputLoadW: parseFloat(data['ups.load']) * (parseFloat(data['ups.realpower.nominal']) / 100),
      status: data['ups.status'],
    };
    console.info('draining nut data for device %s (%s)', metadata.serialNumber, metadata.nutName);
    sinks.sif.drain(
      'nut',
      metrics,
      metadata,
      undefined,
      metadata.serialNumber,
    );
  });
}

const setup = async (_configIn: ConfigType, sinksIn: SinkDictionary) : Promise<SetupMessage> => {
  const configIn = (_configIn as unknown) as NutConfigType;
  sinks = sinksIn;
  config = configIn;
  try {
    await resetNutConnection();
  } catch (error) {
    return {
      success: false,
      message: error,
    };
  }
  collectionInterval = setInterval(collect, configIn.collectionIntervalMs);
  collect();
  return {
    success: true,
  };
};

const cleanup = async () : Promise<boolean> => {
  clearInterval(collectionInterval);
  return true;
};

export default {
  setup,
  cleanup,
};
