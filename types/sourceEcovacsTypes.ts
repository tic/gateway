/* eslint-disable no-unused-vars */
/* eslint-disable no-shadow */
import { EcoVacsAPI } from 'ecovacs-deebot';
import { configType } from './globalTypes';

export const appName = 'ecovacs';
export const activeInterval = 45000;
export const passiveInterval = 300000;
export const dataCollectionRejectionTimeout = 22000;

export enum IntervalModeEnum {
  ACTIVE = 'ACTIVE',
  PASSIVE = 'PASSIVE',
};

export interface EcoVacsConfigType extends configType {
  email: string,
  password: string,
  country: string,
};

export type RawChargeReportType =
  'idle'
  | 'charging'
  | 'returning';

export type RawCleanReportType =
  'stop'
  | 'auto'
  | 'edge'
  | 'spot'
  | 'singleRoom';

export type RawConsumablesReportType = {
  main_brush?: number,
  side_brush?: number,
  filter?: number,
};

export type EventReportType =
  number
  | RawChargeReportType
  | RawCleanReportType
  | RawConsumablesReportType;

export enum ChargeModeEnum {
  IDLE = 0,
  CHARGING = 1,
  RETURNING = 2,
  OTHER = 3,
};

export enum CleanModeEnum {
  STOP = 0,
  AUTO = 1,
  EDGE = 2,
  SPOT = 3,
  SINGLE_ROOM = 4,
  OTHER = 5,
};

export const CleanModeConversionMap: Record<RawCleanReportType, CleanModeEnum> = {
  stop: CleanModeEnum.STOP,
  auto: CleanModeEnum.AUTO,
  edge: CleanModeEnum.EDGE,
  spot: CleanModeEnum.SPOT,
  singleRoom: CleanModeEnum.SINGLE_ROOM,
};

export const ChargeModeConversionMap: Record<RawChargeReportType, ChargeModeEnum> = {
  idle: ChargeModeEnum.IDLE,
  charging: ChargeModeEnum.CHARGING,
  returning: ChargeModeEnum.RETURNING,
};

// Deebot commands
export type VacuumCommand =
  'GetBatteryState'
  | 'GetCleanState'
  | 'GetChargeState'
  | 'GetLifeSpan';

// Deebot events
export type VacuumEvent =
  'BatteryInfo'
  | 'CleanReport'
  | 'ChargeState'
  | 'LifeSpan';

export const vacuumCommandsToEvents: Record<VacuumCommand, VacuumEvent> = {
  GetBatteryState: 'BatteryInfo',
  GetCleanState: 'CleanReport',
  GetChargeState: 'ChargeState',
  GetLifeSpan: 'LifeSpan',
};

export type FullVacuumDataReportType = [
  number | null,
  RawCleanReportType | null,
  RawChargeReportType | null,
  RawConsumablesReportType | null,
];

export type VacuumMetricsType = {
  battery?: number,
  clean_state?: CleanModeEnum,
  charge_state?: ChargeModeEnum,
  overall_state?: CleanModeEnum | ChargeModeEnum,
  side_brush?: number,
  main_brush?: number,
  filter?: number,
};

export type VacuumMetadataType = {
  deviceId: string,
  deviceType: string,
};

export type VacuumDataPacketType = {
  metrics: VacuumMetricsType,
  metadata: VacuumMetadataType,
};

export type EventPromiseType = null;

const getVacBotFunction = (new EcoVacsAPI('', '')).getVacBot;
export type Vacuum = {
_id: number,
  deviceId: string,
  connected: boolean,
  nickname: string,
  deviceType: string,
  eventResolveFunctions: (((arg0: EventReportType) => void) | null)[],
  vacbot: ReturnType<typeof getVacBotFunction>,
};
