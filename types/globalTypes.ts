/* eslint-disable no-unused-vars */
export type ConfigType = Record<string, string | number>;

export interface GlobalConfigType {
  disableSinks: boolean,
  sourceWhitelist: string[],
  sourceBlacklist: string[],
  sinks: Record<string, ConfigType>,
  sources: Record<string, ConfigType>,
};

export type SetupMessage = {
  success: boolean;
  message?: string;
};

export interface SinkType {
  drain: (...args: unknown[]) => Promise<boolean>,
  setup: (arg0: ConfigType) => Promise<SetupMessage>,
  cleanup: () => Promise<boolean>,
};

export type SinkDictionary = Record<string, SinkType>;

export interface SourceType {
  setup: (arg0: ConfigType, arg1: SinkDictionary) => Promise<SetupMessage>;
  cleanup: () => Promise<boolean>,
};

export type SourceDictionary = Record<string, SourceType>;
