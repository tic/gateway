import { ConfigType } from './globalTypes';

export interface MachineUsageConfigType extends ConfigType {
  collectionPeriodMs: number,
  freeTimePercentage: number,
};

export type NetDataType = undefined | {
  total?: {
    inputMb?: number,
    outputMb?: number,
  },
  eno1?: {
    inputMb?: number,
    outputMb?: number,
  },
};

export type CpuDataType = undefined | number;
