import {
  SinkDictionary,
  SetupMessage,
  ConfigType,
  SourceType,
} from '../types/globalTypes';
import {
  MachineUsageConfigType,
  NetDataType,
  CpuDataType,
} from '../types/sourceMachineUsageTypes';
import {
  SifMetadataType,
  SifMetricsType,
} from '../types/sinkSifTypes';

const {
  os,
  netstat,
  cpu,
} = require('node-os-utils');

let collectionInterval: ReturnType<typeof setInterval>;
let sinks: SinkDictionary;
let collectTimeMs: number;

const collect = async () : Promise<void> => {
  const [netdata, cpudata] : [NetDataType, CpuDataType] = await Promise.all([
    netstat.inOut(collectTimeMs),
    cpu.usage(collectTimeMs),
  ]);
  const metrics: SifMetricsType = {};
  if (netdata?.total?.inputMb !== undefined) {
    metrics.netIn = netdata.total.inputMb;
  }
  if (netdata?.total?.outputMb !== undefined) {
    metrics.netOut = netdata.total.outputMb;
  }
  if (cpudata !== undefined) {
    metrics.cpuUsage = cpudata;
  }
  if (Object.keys(metrics).length === 0) {
    return;
  }
  const metadata: SifMetadataType = {
    machineName: os.hostname().toLowerCase(),
  };
  console.info('draining machineUsage data for %s', metadata.machineName);
  sinks.sif.drain(
    'machineUsage',
    metrics,
    metadata,
  );
};

const setup = async (_configIn: ConfigType, sinksIn: SinkDictionary) : Promise<SetupMessage> => {
  const configIn = (_configIn as unknown) as MachineUsageConfigType;
  sinks = sinksIn;
  collect();
  collectionInterval = setInterval(collect, configIn.collectionPeriodMs);
  collectTimeMs = configIn.collectionPeriodMs * (configIn.freeTimePercentage / 100);
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
} as SourceType;
