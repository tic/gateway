import { ConfigType } from './globalTypes';

export type SifMetadataType = Record<string, string | number>;

export type SifMetricsType = Record<string, string | number>;

export interface SifDataType {
  app_name: string,
  token: string,
  data: {
    time: number,
    device?: string | null,
    metadata: SifMetadataType,
    payload: SifMetricsType,
  },
};

export interface SifConfigType extends ConfigType {
  brokerAddress: string,
  username: string,
  password: string,
  userPoolId: string,
  clientId: string,
};
