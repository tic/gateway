/* eslint-disable no-shadow */
/* eslint-disable no-unused-vars */
import { ConfigType } from './globalTypes';

export type UpsType = {
  name: string,
  description: string,
};

export type UpsVarsType = {

};

export type UpsDataPacket = {
  ups: UpsType,
  data: UpsVarsType,
};

export type UpsListReport = Record<string, string>;

export interface NutServerType extends Record<string, any> {
  configured: boolean,
  start: () => void,
  close: () => void,
  on: (arg0: string, arg1: (...args: any) => void) => void,
  GetUPSList: (
    arg0: (arg0: UpsListReport, arg1: Error | string | undefined) => void,
  ) => void,
};

export interface NutConfigType extends ConfigType {
  collectionIntervalMs: number,
  serverAddress: string,
  serverPort: string,
  autoReconnectTimeoutMs: number,
  connectionRetryCooldownMs: number,
};
